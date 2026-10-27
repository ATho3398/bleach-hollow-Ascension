// C.134 (S-23, GDD 83장): 저장형 필살기 삭제 → 해방(영력 해방 · 레스렉시온/만해). 해방 게이지 = 옛 저장 게이지, 해방 블록 슬롯, 5단계 고유 효과
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { getEnemy } from '../src/data/enemies';
import { FACTIONS, getFaction } from '../src/data/factions';
import {
  applyInput, botInput, buildBattleRecord, canLiberate, createCombat, drainCombatEvents, LIBERATION_GAUGE_MAX, liberationActive, liberationSpawnSpeedOf, liberationStartGaugeOf,
  playCombatBot, replayCombat, step, ticksOf, type Block, type CombatParams, type CombatState,
} from '../src/engine/combat';
import { buildCombatParams, gainTrait, newBuild } from '../src/engine/absorb';
import { applyEvolutionToParams, newEvolution } from '../src/engine/evolution';
import { createExpedition, playExpedition } from '../src/engine/expedition';
import { parseFactionConfig } from '../src/engine/faction';
import { liberationAccess, migrateSave, MIN_LOADABLE_SAVE_FORMAT, newSaveData, SAVE_FORMAT_VERSION } from '../src/game';
import { liberationLabels } from '../src/ui/labels';

const LB = BALANCE.provisional.liberation;
const normal = getEnemy('test-a');
const src = (p: string) => readFileSync(p, 'utf8');
const mk = (params: Partial<CombatParams> = {}, seed = 1) => createCombat(seed, { enemy: normal, params });
/** 블록 생성·공허·양쪽 공격이 끼어들지 않게 멈춘 상태 */
const quiet = (s: CombatState) => {
  s.spawnTimer = 1e9;
  s.params.voidChance = s.params.voidChanceBonus = 0;
  s.enemy.attackTimer = 1e9;
  s.player.attackTimer = 1e9;
  s.enemy.actionTimer = 1e9;
  s.enemy.hp = s.enemy.maxHp = 1e12;
  return s;
};
const blk = (traitId: string, family: string | null = null): Block => ({ uid: Math.floor(Math.random() * 1e9), kind: 'skill', traitId, family });
const wait = (s: CombatState, seconds: number) => {
  for (let i = 0; i < ticksOf(s.params, seconds) && s.status === 'playing'; i++) step(s);
};
/** 공격 특성 하나를 가진 빌드 → 전투 파라미터 (해방 슬롯도 자동으로 채워진다) */
const oneTrait = (id = 't-fire-a') => {
  const b = newBuild();
  gainTrait(b, id);
  return { b, params: buildCombatParams(b, 'hollow') };
};

describe('83장 1번 저장형 필살기 삭제 → 해방 게이지', () => {
  it('저장 필살 입력·상태·수치가 없다', () => {
    const s = mk();
    expect('storedGauge' in s).toBe(false);
    expect('storedCharges' in s).toBe(false);
    expect(applyInput(s, { type: 'stored' } as never)).toBe(false);
    const CX = BALANCE.provisional.combat as Record<string, unknown>;
    for (const k of ['storedGaugePerBlock', 'storedChargesMax', 'storedPowerInAttacks', 'storedGuardSeconds']) expect(k in CX).toBe(false);
    for (const f of FACTIONS) expect('storedSkillName' in f).toBe(false);
  });

  it('게이지: 블록당 +2(C.154: 12 → 8, C.166: 8 → 2 — 피해로 주로 참, 95장 B2), 체인 보너스 +4/+10, 100 에서 멈춘다', () => {
    const G = LB.gaugePerBlock;
    expect(G).toBe(2);
    expect(LB.chainBonus).toEqual([0, 4, 10]);
    expect(LB.gaugeMax).toBe(100);
    const s = quiet(mk({ liberationStartGauge: 0, liberationGaugePerDealt: 0, liberationGaugePerTaken: 0 }));
    s.tray = [blk('basic-skill', 'family-a')];
    applyInput(s, { type: 'use', cell: 0 });
    expect(s.liberation.gauge).toBe(G);
    s.tray = [blk('basic-skill', 'family-a'), blk('basic-skill', 'family-a'), blk('basic-skill', 'family-a')];
    applyInput(s, { type: 'use', cell: 0 });
    expect(s.liberation.gauge).toBe(G + 3 * G + 10);
    for (let i = 0; i < 60; i++) {
      s.tray = [blk('basic-skill', 'family-a')];
      applyInput(s, { type: 'use', cell: 0 });
    }
    expect(s.liberation.gauge).toBe(LIBERATION_GAUGE_MAX);
    expect(drainCombatEvents(s).filter((e) => e.kind === 'liberation-ready')).toHaveLength(1);
  });

  it('시작 게이지 = 안정 수치 비례 0~50 (옛 저장 필살 시작 게이지), 꺼져 있으면 0 이고 차지 않는다', () => {
    expect(liberationStartGaugeOf(0)).toBe(0);
    expect(liberationStartGaugeOf(BALANCE.provisional.risk.stabilityMax)).toBe(LB.startGaugeMax);
    expect(mk({ liberationStartGauge: 30 }).liberation.gauge).toBe(30);
    const off = quiet(mk({ liberationStartGauge: 30, liberationEnabled: false }));
    expect(off.liberation.gauge).toBe(0);
    off.tray = [blk('basic-skill', 'family-a')];
    applyInput(off, { type: 'use', cell: 0 });
    expect(off.liberation.gauge).toBe(0);
    expect(canLiberate(off)).toBe(false);
  });

  it('100 이면 해방 → 약 10초(provisional 8) → 게이지 0 부터 다시, 한 전투에 여러 번. 끝날 때마다 리스크 소폭', () => {
    const { params } = oneTrait();
    const s = quiet(mk(params));
    expect(canLiberate(s)).toBe(false);
    s.liberation.gauge = LIBERATION_GAUGE_MAX;
    expect(applyInput(s, { type: 'liberate' })).toBe(true);
    expect(liberationActive(s)).toBe(true);
    expect(s.liberation.gauge).toBe(0);
    expect(canLiberate(s)).toBe(false);
    // 해방 중에는 게이지가 차지 않는다
    s.tray = [blk('t-fire-a', 'family-a')];
    applyInput(s, { type: 'use', cell: 0 });
    expect(s.liberation.gauge).toBe(0);
    wait(s, LB.seconds - 0.2);
    expect(liberationActive(s)).toBe(true);
    wait(s, 0.3);
    expect(liberationActive(s)).toBe(false);
    expect(s.liberation.risk).toBe(LB.riskOnEnd);
    expect(LB.riskOnEnd).toBeLessThan(15); // 옛 전투당 1회 +15 보다 작게
    s.liberation.gauge = LIBERATION_GAUGE_MAX;
    expect(applyInput(s, { type: 'liberate' })).toBe(true);
    wait(s, LB.seconds + 0.1);
    expect(s.liberation.uses).toBe(2);
    expect(s.liberation.risk).toBe(2 * LB.riskOnEnd);
    expect(drainCombatEvents(s).filter((e) => e.kind === 'liberation-end')).toHaveLength(2);
  });

  it('해방 중에 전투가 끝나도 풀리며 리스크가 오른다', () => {
    const s = quiet(mk());
    s.liberation.gauge = LIBERATION_GAUGE_MAX;
    applyInput(s, { type: 'liberate' });
    s.enemy.hp = 1;
    s.tray = [blk('basic-skill', 'family-a')];
    step(s, { type: 'use', cell: 0 });
    expect(s.status).toBe('won');
    expect(liberationActive(s)).toBe(false);
    expect(s.liberation.risk).toBe(LB.riskOnEnd);
  });
});

describe('83장 3번 해방 블록 슬롯 → 98장 B 폐지 (C.167): 해방 중에는 장착 블록', () => {
  it('해방 전용 칸이 없다: 빌드·전투 수치에 해방 칸 필드 없음, 블록 특성을 얻어도 칸이 생기지 않는다', () => {
    const b = newBuild();
    gainTrait(b, 't-fire-a');
    expect('liberation' in b).toBe(false);
    expect('liberationSkills' in buildCombatParams(b, 'hollow')).toBe(false);
    expect('slotsByTier' in LB).toBe(false);
  });

  it('해방 중에는 생성 타이머가 빨리 돌고(×spawnSpeed) 나오는 블록이 전부 장착 블록 — 장착이 없으면 기본 블록', () => {
    const b = newBuild();
    gainTrait(b, 't-earth-c');
    const params = buildCombatParams(b, 'hollow');
    applyEvolutionToParams(params, newEvolution(1), 'hollow');
    expect(LB.spawnSpeed).toBeGreaterThan(1);
    const s = mk({ ...params, voidChance: 0 });
    s.enemy.attackTimer = s.enemy.actionTimer = 1e9;
    s.player.attackTimer = 1e9;
    s.enemy.hp = s.enemy.maxHp = 1e12;
    s.tray = [];
    expect(liberationSpawnSpeedOf(s.params)).toBe(LB.spawnSpeed);
    s.liberation.gauge = LIBERATION_GAUGE_MAX;
    const plain = structuredClone(s);
    plain.params.liberationEnabled = false;
    applyInput(s, { type: 'liberate' });
    wait(s, 4);
    wait(plain, 4);
    expect(s.tray.length).toBeGreaterThan(plain.tray.length);
    expect(s.tray.every((x) => x.traitId === 't-earth-c')).toBe(true);
    expect(plain.tray.some((x) => x.traitId !== 't-earth-c')).toBe(true);
    // 장착 없음: 기본 블록 풀
    const e = mk({ skills: [], voidChance: 0 });
    e.enemy.attackTimer = e.enemy.actionTimer = 1e9;
    e.enemy.hp = e.enemy.maxHp = 1e12;
    e.tray = [];
    e.liberation.gauge = LIBERATION_GAUGE_MAX;
    applyInput(e, { type: 'liberate' });
    wait(e, 4);
    expect(e.tray.length).toBeGreaterThan(0);
    expect(e.tray.every((x) => x.kind === 'skill' && ['basic-skill', 'basic-guard', 'basic-heal'].includes(x.traitId!))).toBe(true);
  });

  it('세이브: 형식 46(C.175) · 문턱 같이, 옛 해방 칸 필드는 지운다', () => {
    expect(SAVE_FORMAT_VERSION).toBe(46);
    expect(MIN_LOADABLE_SAVE_FORMAT).toBe(46);
    const s = newSaveData('hollow', 1);
    expect('liberation' in s.build).toBe(false);
    const raw = JSON.parse(JSON.stringify(s));
    raw.build.liberation = ['t-fire-a', null, null];
    expect('liberation' in migrateSave(raw)!.build).toBe(false);
  });
});

describe('83장 2·4번 이름과 레스렉시온/만해 고유 효과', () => {
  it('이름은 종족 설정: 5단계 전 = 영력 해방(양 종족), 5단계부터 = 호로 레스렉시온 / 사신 만해', () => {
    for (const f of FACTIONS) {
      expect(liberationLabels(f, 0).name).toBe('영력 해방');
      expect(liberationLabels(f, LB.minTierIndex - 1)).toMatchObject({ name: '영력 해방', unique: false });
    }
    expect(liberationLabels(getFaction('hollow'), LB.minTierIndex)).toMatchObject({ name: '레스렉시온', unique: true });
    expect(liberationLabels(getFaction('shinigami'), LB.minTierIndex)).toMatchObject({ name: '만해', unique: true });
    const h = getFaction('hollow');
    expect(() => parseFactionConfig({ ...h, liberation: { ...h.liberation, baseName: '' } })).toThrow(/liberation.baseName/);
  });

  it('22-2 해금 조건 폐기: 1단계부터 쓸 수 있고, 수련 완료는 고유 효과 강화', () => {
    const s = newSaveData('hollow', 1);
    expect(liberationAccess(s)).toEqual({ usable: true, trained: false });
    s.training.completed = true;
    expect(liberationAccess(s).trained).toBe(true);
    const exp = createExpedition({ factionId: 'hollow', seed: 3, hunger: 20, condition: 80, deck: ['prey-nest-a'] });
    let used = 0;
    playExpedition(exp, { returnAfterLap: 3, playBattle: (b) => { expect(b.params.liberationEnabled).toBe(true); playCombatBot(b); used += b.liberation.uses; } });
    expect(used).toBeGreaterThan(0);
    expect(exp.battles.some((b) => (b.liberationUses ?? 0) > 0)).toBe(true);
  });

  it('5단계 전에는 블록 효과만, 5단계부터 공격 속도·체인 속도·능력치 소폭 상승 (수련 완료면 더)', () => {
    const at = (tier: number, trained = false) => {
      const p = buildCombatParams(newBuild(), 'hollow');
      const e = newEvolution(1);
      e.tierIndex = tier;
      applyEvolutionToParams(p, e, 'hollow', 0, trained);
      return p;
    };
    expect(at(3)).toMatchObject({ liberationUnique: false, liberationAttackSpeed: 1, liberationChainSpeed: 1, liberationStatMultiplier: 1 });
    expect(at(4)).toMatchObject({ liberationUnique: true, liberationAttackSpeed: LB.uniqueAttackSpeed, liberationChainSpeed: LB.uniqueChainSpeed, liberationStatMultiplier: LB.uniqueStatMultiplier });
    expect(at(4, true).liberationStatMultiplier).toBe(LB.trainedStatMultiplier);
    expect(LB.uniqueStatMultiplier).toBeGreaterThan(1);
    expect(LB.uniqueStatMultiplier).toBeLessThan(1.3); // 소폭

    const s = quiet(mk(at(4)));
    const before = { ...s.player.stats };
    const maxHp = s.player.maxHp;
    s.player.attackTimer = 100;
    s.liberation.gauge = LIBERATION_GAUGE_MAX;
    applyInput(s, { type: 'liberate' });
    expect(s.player.stats.atk).toBeCloseTo(before.atk * LB.uniqueStatMultiplier, 6);
    expect(s.player.maxHp).toBeCloseTo(maxHp * LB.uniqueStatMultiplier, 6);
    expect(s.player.attackTimer).toBe(Math.round(100 / LB.uniqueAttackSpeed));
    expect(liberationSpawnSpeedOf(s.params)).toBeCloseTo(LB.spawnSpeed * LB.uniqueChainSpeed, 6);
    wait(s, LB.seconds + 0.1);
    expect(s.player.stats).toEqual(before);
    expect(s.player.maxHp).toBeCloseTo(maxHp, 6);
    // 영력 해방은 능력치를 바꾸지 않는다
    const b = quiet(mk(at(0)));
    const st = { ...b.player.stats };
    b.liberation.gauge = LIBERATION_GAUGE_MAX;
    applyInput(b, { type: 'liberate' });
    expect(b.player.stats).toEqual(st);
  });
});

describe('83장 6번 런 로그·봇·결정성', () => {
  it('전투 기록: 해방 사용 횟수·해방 중 체인 수 (옛 저장 필살 필드는 구조 유지, 0)', () => {
    const { params } = oneTrait();
    const s = quiet(mk(params));
    s.liberation.gauge = LIBERATION_GAUGE_MAX;
    wait(s, 1);
    applyInput(s, { type: 'liberate' });
    s.tray = [blk('t-fire-a', 'family-a'), blk('t-fire-a', 'family-a')];
    applyInput(s, { type: 'use', cell: 0 });
    s.tray = [blk('t-fire-a', 'family-a')];
    applyInput(s, { type: 'use', cell: 0 });
    const rec = buildBattleRecord(s, { factionId: 'hollow' });
    expect(rec).toMatchObject({ liberationUsed: true, liberationAt: 1, liberationUses: 1, liberationChains: 2, storedUsed: 0, storedWasted: 0 });
  });

  it('봇은 게이지가 차면 바로 해방하고, 같은 시드 + 입력 기록 = 같은 결과', () => {
    const s = quiet(mk());
    s.liberation.gauge = LIBERATION_GAUGE_MAX;
    expect(botInput(s)).toEqual({ type: 'liberate' });
    expect(botInput(s, { liberate: false })).not.toEqual({ type: 'liberate' });
    const { params } = oneTrait();
    const a = playCombatBot(mk({ ...params, liberationStartGauge: 90 }, 7)); // C.173: 50 → 90 (전투가 짧아 게이지가 덜 찬다)
    expect(a.liberation.uses).toBeGreaterThan(0);
    const b = replayCombat(7, { enemy: normal, params: { ...params, liberationStartGauge: 90 } }, a.inputs);
    expect(b.tick).toBe(a.tick);
    expect(b.liberation.uses).toBe(a.liberation.uses);
    expect(b.enemy.hp).toBe(a.enemy.hp);
  });
});

describe('83장 5번 화면·문구', () => {
  it('전투 화면: 저장 필살기 버튼 없음, 해방 버튼은 블록과 같은 누르기 판정, 오오라 = 속성 색 토큰, 종족 분기 없음', () => {
    const v = src('src/ui/battleView.ts');
    expect(v).not.toMatch(/storedBtn|type: 'stored'/);
    expect(v).toMatch(/libBtn\.addEventListener\('pointerup'/);
    expect(v).toContain("app.style.setProperty('--bha-aura', elementColor(");
    expect(v).not.toMatch(/faction(\.id)? === '(hollow|shinigami)'/);
    const css = src('src/ui/bha/battle-scene.css');
    expect(css).toMatch(/\.bha-battle\.is-unique/);
    expect(css).toMatch(/var\(--bha-aura/);
  });

  it('방 슬롯 화면: 해방 블록 칸은 C.167(98장 B)에 폐지 — 본체 칸만 (화면 시험은 DOM 없음 — 소스로 연결만 본다)', () => {
    const v = src('src/ui/buildPanel.ts');
    expect(v).not.toContain('해방 블록 — ');
    expect(v).not.toMatch(/setLiberationSlot|liberationSlotCount|area: 'lib'/);
    expect(src('src/ui/lcdScreens.ts')).toMatch(/traitsTab\([^)]*\) => \{[\s\S]*?\}, save\.evolution\.tierIndex\)/);
  });

  it('튜토리얼·도움말: 저장 필살 설명이 해방으로 바뀌었다', () => {
    for (const p of ['src/data/help/tutorial.json', 'src/data/help/glossary.json', 'src/data/help/screens.json']) {
      expect(src(p)).not.toMatch(/storedSkillName|저장 필살|storedChargesMax/);
    }
    expect(src('src/data/help/tutorial.json')).toContain('{liberation.baseName}');
  });
});
