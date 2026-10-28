// C.136 (GDD 84장 1·2·3·6·7·8·10번): 원정 칸 시간 ½ · 막기 중 공격·생성 멈춤 / 회복 뒤 공격력 −50% · 블록 플레이 보정 ·
// 블록 출현 = 타이머 하나 + 확률표 · 막기·회복 속성 특성 삭제 · 같은 속성 반복 흡수 강화(속성마다 100) · 광기 자연 감소 느리게
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { getEnemy } from '../src/data/enemies';
import { TRAITS } from '../src/data/traits';
import {
  addEnhance, buildCombatParams, buildOffer, enhanceAttackMultiplier, enhanceGuardHealMultiplier, enhanceLevel, gainTrait, newBuild,
} from '../src/engine/absorb';
import {
  BASIC_GUARD_ID, BASIC_HEAL_ID, BASIC_SKILL_ID, applyInput, basicSources, createCombat, drainCombatEvents, spawnRatesOf, spawnTableOf, step,
  type Block, type CombatParams, type CombatState,
} from '../src/engine/combat';
import { createRng } from '../src/engine/rng';
import { advance, chooseAbsorb, createExpedition, finishBattle, startBattle, type ExpeditionState } from '../src/engine/expedition';
import { migrateSave, newSaveData, SAVE_FORMAT_VERSION } from '../src/game';

const CX = BALANCE.provisional.combat;
const RX = BALANCE.provisional.risk;
const EH = BALANCE.provisional.absorb.enhance;
const normal = getEnemy('test-a');
const build = (...ids: string[]): Partial<CombatParams> => {
  const b = newBuild();
  for (const id of ids) gainTrait(b, id);
  return buildCombatParams(b, 'hollow');
};
const mk = (params: Partial<CombatParams> = {}, seed = 1) => createCombat(seed, { enemy: normal, params: { critChance: 0, enemyCritChance: 0, ...params } });
let uid = 5000;
const blk = (traitId: string, family: string | null = null): Block => ({ uid: uid++, kind: 'skill', traitId, family });
/** 블록 생성·적 공격이 끼어들지 않게 */
const quiet = (s: CombatState) => {
  s.spawnTimer = 1e9;
  s.enemy.attackTimer = s.enemy.actionTimer = 1e9;
  s.player.attackTimer = 1e9;
  s.enemy.hp = s.enemy.maxHp = 1e9;
  return s;
};

describe('84장 6번 블록 출현 = 타이머 하나 + 확률표', () => {
  const THREE = ['t-fire-a', 't-water-c', 't-earth-b']; // 조·탄·교

  it('출현표: 흡수 특성·기본 공격·공허가 한 장에 있고 합 1, 타이머는 하나 (C.174 GDD 105장: 막기·회복은 버튼이라 표에 없다)', () => {
    const p = mk(build(...THREE)).params;
    const t = spawnTableOf(p);
    const ids = t.entries.map((e) => (e.kind === 'void' ? 'void' : e.source!.id));
    for (const id of [...THREE, BASIC_SKILL_ID, 'void']) expect(ids).toContain(id);
    for (const id of [BASIC_GUARD_ID, BASIC_HEAL_ID]) expect(ids).not.toContain(id);
    expect(t.entries.reduce((a, e) => a + e.chance, 0)).toBeCloseTo(1);
    expect(typeof mk(build(...THREE)).spawnTimer).toBe('number');
  });

  it('조·탄·교 셋을 먹어도 조→탄→교 순서로 규칙적으로 나오지 않는다 (같은 특성이 연달아 나오기도 한다)', () => {
    const s = mk({ ...build(...THREE), timeLimitSeconds: 1e9, voidChance: 0, voidChanceBonus: 0 });
    s.player.hp = s.player.maxHp = s.enemy.hp = s.enemy.maxHp = 1e12;
    const seq: string[] = [];
    for (let i = 0; i < 20000 && seq.length < 200; i++) {
      step(s);
      for (const b of s.tray) if (b.traitId && THREE.includes(b.traitId)) seq.push(b.traitId);
      s.tray = [];
    }
    let repeats = 0;
    let cycleBreaks = 0;
    for (let i = 1; i < seq.length; i++) {
      if (seq[i] === seq[i - 1]) repeats++;
      if (i >= 3 && seq[i] !== seq[i - 3]) cycleBreaks++;
    }
    expect(repeats).toBeGreaterThan(20); // 셋이 같은 몫이면 기대 1/3
    expect(cycleBreaks).toBeGreaterThan(seq.length / 3);
  });

  it('새로 흡수하면 그 블록이 몫을 받고 다른 블록 몫이 줄어든다 (사용자 예: 새 블록 20%, 다른 것 n% 감소)', () => {
    const share = (p: CombatParams, id: string) => spawnTableOf(p).entries.filter((e) => e.source?.id === id).reduce((a, e) => a + e.chance, 0);
    const one = mk(build('t-fire-a')).params;
    const two = mk(build('t-fire-a', 't-water-c')).params;
    expect(share(two, 't-water-c')).toBeGreaterThan(0.1);
    expect(share(two, BASIC_SKILL_ID)).toBeLessThan(share(one, BASIC_SKILL_ID));
    // 80장 기본 몫 = 공격 블록 중 기본 공격 몫 (0칸 100 · 1칸 45 · 2칸 25 · 3칸 15%)
    const want = [1, 0.45, 0.25, 0.15];
    [[], ['t-fire-a'], ['t-fire-a', 't-water-c'], THREE].forEach((ids, n) => expect(1 - spawnRatesOf(mk(build(...ids)).params).absorbedShare).toBeCloseTo(want[n]!, 2));
  });

  it('막기·회복이 빠진 몫(freedRoleShare)은 공격 블록 생성 속도로 돌려준다 (C.174 GDD 105장, 옛 고정 몫 roleShare 대체)', () => {
    for (const ids of [[], THREE]) {
      const p = mk(build(...ids)).params;
      const a = spawnTableOf({ ...p, blockPool: { ...p.blockPool, freedRoleShare: 0 } });
      const b = spawnTableOf(p);
      expect(a.seconds / b.seconds).toBeCloseTo(1 / (1 - BALANCE.provisional.blockPool.freedRoleShare), 6);
    }
  });

  it('공허 블록도 출현표의 한 칸 (C.173, 101장: 블록 하나가 공허 확률로 공허가 된다 — 간격은 그대로)', () => {
    const p = mk(build('t-fire-a')).params;
    const v = spawnTableOf(p).entries.find((e) => e.kind === 'void')!;
    expect(v.chance).toBeCloseTo(CX.voidChance);
    expect(spawnTableOf({ ...p, voidChance: 0 }).seconds).toBeCloseTo(spawnTableOf(p).seconds);
  });
});

describe('84장 2번 막기·회복의 대가', () => {
  it('막기 지속 동안 내 자동 공격과 블록 생성 타이머가 멈춘다', () => {
    const s = quiet(mk());
    s.player.attackTimer = 5;
    s.spawnTimer = 5;
    s.guardGauge = 1;
    applyInput(s, { type: 'guard' });
    expect(s.guard.ticks).toBe(5);
    for (let i = 0; i < 4; i++) step(s);
    expect(s.player.attackTimer).toBe(5);
    expect(s.spawnTimer).toBe(5);
    expect(drainCombatEvents(s).some((e) => e.kind === 'player-attack')).toBe(false);
    while (s.guard.ticks > 0) step(s);
    for (let i = 0; i < 6; i++) step(s);
    expect(drainCombatEvents(s).some((e) => e.kind === 'player-attack')).toBe(true);
  });

});

describe('84장 3번 블록 플레이 보정', () => {
  it('블록형 몸은 블록 피해 × blockPlayDamage · 치명 + blockPlayCrit, 물공 몸(평타형)은 없다', () => {
    expect(CX.blockPlayDamage).toBeGreaterThan(1);
    expect(CX.blockPlayCrit).toBeGreaterThan(0);
    const dmg = (params: Partial<CombatParams>) => {
      const s = quiet(mk(params));
      s.tray = [blk(BASIC_SKILL_ID, 'family-a')];
      const before = s.enemy.hp;
      applyInput(s, { type: 'use', cell: 0 });
      return before - s.enemy.hp;
    };
    expect(dmg({ blockPlayCrit: 0 })).toBeCloseTo(dmg({ blockPlayDamage: 1, blockPlayCrit: 0 }) * CX.blockPlayDamage);
    const phys = { physBlock: { element: 'normal', power: 1, effect: 'ember' as const }, blockPlayCrit: 0 };
    expect(dmg(phys)).toBeCloseTo(dmg({ ...phys, blockPlayDamage: 1 }));
    // 치명: 확률 0 몸에서 블록 치명 가산만으로 블록 치명이 난다
    let crits = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const s = quiet(mk({ blockPlayCrit: 0.5 }, seed));
      s.tray = [blk(BASIC_SKILL_ID, 'family-a')];
      applyInput(s, { type: 'use', cell: 0 });
      if (drainCombatEvents(s).some((e) => e.kind === 'block' && e.crit)) crits++;
    }
    expect(crits).toBeGreaterThan(60);
    expect(crits).toBeLessThan(140);
  });
});

describe('84장 7번 막기·회복 속성 특성 삭제', () => {
  it('특성 데이터에 막기·회복이 없고(흙 가면·뇌 재생 등), 흡수 후보에도 나오지 않는다', () => {
    expect(TRAITS.some((t) => t.role === 'guard' || t.role === 'heal')).toBe(false);
    expect(TRAITS.some((t) => t.id === 't-earth-guard' || t.id === 't-thunder-heal')).toBe(false);
    const won = { status: 'won' as const, finisher: null, chain3Count: 0, weakChain3Count: 0 };
    for (let seed = 1; seed <= 40; seed++) {
      const o = buildOffer(createRng(seed), getEnemy('test-a'), newBuild(), won, 3);
      for (const id of o.candidates) expect(TRAITS.find((t) => t.id === id)!.role ?? 'attack').toBe('attack');
    }
  });

  it('막기·회복은 속성 없는 기본 블록 하나씩 — 세기는 강화(속성 강화 단계 합)로만', () => {
    const b = newBuild();
    expect(enhanceGuardHealMultiplier(b)).toBe(1);
    for (let i = 0; i < 100; i++) addEnhance(b, 'fire');
    expect(enhanceGuardHealMultiplier(b)).toBeCloseTo(1 + EH.guardHealPerLevel * 100);
    for (const el of ['water', 'earth', 'thunder', 'blood', 'poison', 'kyo', 'normal']) for (let i = 0; i < 100; i++) addEnhance(b, el);
    expect(enhanceGuardHealMultiplier(b)).toBeCloseTo(1 + EH.guardHealMax);
    const p = mk(buildCombatParams(b, 'hollow')).params;
    const g = basicSources(p)[1]!; // C.174: 막기 버튼 세기 (블록 출현표에는 없다)
    expect(g.element).toBeNull();
    expect(g.powerMultiplier).toBeCloseTo(BALANCE.provisional.blockPool.basicGuardRatio * (1 + EH.guardHealMax));
  });
});

describe('84장 8번 같은 속성 반복 흡수 → 속성마다 강화 100', () => {
  it('횟수는 상한 없이 세고, 효과 단계는 100 에서 멈춘다', () => {
    const b = newBuild();
    for (let i = 0; i < 120; i++) addEnhance(b, 'earth');
    expect(b.enhance!.earth).toBe(120);
    expect(enhanceLevel(b, 'earth')).toBe(EH.max);
    expect(EH.max).toBe(100);
    expect(enhanceAttackMultiplier(b, 'earth')).toBeCloseTo(1 + EH.earlyPerLevel * EH.earlyLevels + EH.attackPerLevel * (100 - EH.earlyLevels)); // C.147 앞 10단계 +4%
    gainTrait(b, 't-earth-b');
    gainTrait(b, 't-fire-a');
    const sk = buildCombatParams(b, 'hollow').skills!;
    expect(sk.find((x) => x.id === 't-earth-b')!.powerMultiplier).toBeCloseTo(1 + EH.earlyPerLevel * EH.earlyLevels + EH.attackPerLevel * (100 - EH.earlyLevels));
    expect(sk.find((x) => x.id === 't-fire-a')!.powerMultiplier).toBe(1);
  });

  const toAbsorb = (exp: ExpeditionState) => {
    exp.wildCells = [exp.pos + 1];
    advance(exp);
    Object.assign(exp.pending!.enemy, { element: 'earth' });
    const b = startBattle(exp);
    b.enemy.hp = 0;
    b.status = 'won';
    b.finisher = { kind: 'basic-attack', traitId: null, element: null };
    finishBattle(exp, b);
    expect(exp.phase).toBe('absorb');
  };

  it('이미 흙 계열을 다 가져도 흙 적을 흡수하면 강화 +1 (특성 없이도), 런 로그에 횟수 — 스탯만은 세지 않는다', () => {
    const exp = createExpedition({ factionId: 'hollow', seed: 3, hunger: 10, condition: 100, deck: [] });
    for (const id of ['t-earth-a', 't-earth-b', 't-earth-c']) gainTrait(exp.build, id);
    exp.build.enhance = { earth: 99 };
    toAbsorb(exp);
    expect(exp.absorbOffer!.element).toBe('earth');
    expect(chooseAbsorb(exp, null, null, 'both').ok).toBe(true);
    expect(exp.build.enhance!.earth).toBe(100);
    expect(exp.absorbRecords.at(-1)!.enhance).toBe(100);
    toAbsorb(exp);
    expect(chooseAbsorb(exp, null, null, 'trait').ok).toBe(true);
    expect(exp.build.enhance!.earth).toBe(101); // 100 뒤에도 센다
    expect(enhanceLevel(exp.build, 'earth')).toBe(100);
    toAbsorb(exp);
    expect(chooseAbsorb(exp, null, null, 'stat').ok).toBe(true);
    expect(exp.build.enhance!.earth).toBe(101);
    expect(exp.absorbRecords.at(-1)!.enhance).toBeUndefined();
  });

  it('세이브: 강화 횟수가 저장·불러오기로 남고 깨진 값은 버린다. 형식 45(C.167)', () => {
    expect(SAVE_FORMAT_VERSION).toBe(51); // C.184 (C.177 50)
    const s = newSaveData('hollow', 1);
    expect(s.build.enhance).toEqual({});
    s.build.enhance = { earth: 120, fire: 3 };
    const raw = JSON.parse(JSON.stringify(s));
    expect(migrateSave(raw)!.build.enhance).toEqual({ earth: 120, fire: 3 });
    raw.build.enhance = { earth: -1, fire: 'x', water: 2.7 };
    expect(migrateSave(raw)!.build.enhance).toEqual({ water: 2 });
  });

  it('흡수 화면에 "강화 n/100" 줄이 있다', () => {
    const src = readFileSync('src/ui/absorbView.ts', 'utf8');
    expect(src).toContain('enh.append(enhanceRow())'); // C.147 '흡수하면' 줄 → C.171(GDD 100장 #45) 표 대신 상대 아래 한 줄
    expect(src).toContain('enhanceLevel');
  });
});

describe('84장 1·10번 원정 칸 시간 ½ · 광기 자연 감소 느리게', () => {
  it('칸 시간 2.5 → 1.25초', () => {
    expect(BALANCE.expedition.secondsPerTile).toBe(1.25);
  });

  it('광기 하락: 휴식 15 → 10 · 놓아주기 2 → 1 · 먹이 5 → 3 · 재우기·쓰다듬기 20 → 10 (공허 블록 몫은 C.173 101장에서 0.03, C.174 에서 0.02)', () => {
    expect(RX.restRelief).toBe(10);
    expect(RX.releaseRelief).toBe(1);
    expect(RX.nestActions.feed.risk).toBe(-3);
    expect(RX.nestActions.sleep.risk).toBe(-10);
    expect(RX.nestActions.pet.risk).toBe(-10);
    expect(CX.voidChance).toBe(0.02);
  });

  it('전투 화면: 막기 게이지에 "공격·생성 멈춤", 회복 뒤 공격력 감소 게이지', () => {
    const src = readFileSync('src/ui/battleView.ts', 'utf8');
    expect(src).toContain('공격·생성 멈춤');
    expect(src).toContain("headGaugeEl('weaken'");
  });
});
