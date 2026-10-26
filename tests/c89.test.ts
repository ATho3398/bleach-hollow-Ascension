// C.89 진화체 특성 (GDD 39장): 칸 2개(성향 + 속성·전용), label → 특성 매핑, 효과 종류(crit·doubleHit·chainHaste·thorns …) 공통 구현
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { getEnemy } from '../src/data/enemies';
import { FORM_TABLE, getForm, validateAbilities } from '../src/data/evolution';
import { FACTIONS } from '../src/data/factions';
import {
  BASIC_SKILL_ID, applyInput, basicSpawnSecondsOf, blockSources, spawnTableOf, buildBattleRecord, createCombat, drainCombatEvents, step, ticksOf,
  type Block, type CombatEvent, type CombatParams, type CombatState,
} from '../src/engine/combat';
import { abilityEffectsOf, abilityLines, applyEvolutionToParams, formAbilitiesOf, newEvolution, zeroStats } from '../src/engine/evolution';

const AB = BALANCE.provisional.abilities;
const normal = getEnemy('test-a');
const elite = getEnemy('test-elite');
let uid = 5000;
const blk = (traitId: string): Block => ({ uid: uid++, kind: 'skill', traitId });
const mk = (abilityEffects: CombatParams['abilityEffects'], extra: Partial<CombatParams> = {}, enemy = normal, seed = 1) =>
  createCombat(seed, { enemy, params: { abilityEffects, ...extra } });
const run = (s: CombatState, seconds: number) => {
  const evs: CombatEvent[] = [];
  for (let i = 0; i < ticksOf(s.params, seconds) && s.status === 'playing'; i++) {
    step(s);
    evs.push(...drainCombatEvents(s));
  }
  return evs;
};
const fx = (id: string, ability: 'atk' | null = 'atk') => abilityEffectsOf(formAbilitiesOf(getForm(id), zeroStats(), ability));

describe('C.89 특성 매핑 (label → 특성, 39장 1·3·4번)', () => {
  it('데이터 검사 통과 · 진화체 43종 전부 특성이 있다 (2·3단계 = 성향 1줄, 4·5단계 = 2줄)', () => {
    expect(validateAbilities()).toEqual([]);
    expect(FORM_TABLE).toHaveLength(43); // C.106: 4단계 일반 특수 속성 3종 빠짐
    for (const f of FORM_TABLE) {
      const fa = formAbilitiesOf(f, { hp: 0, atk: 5, int: 3, def: 0, spr: 0, spd: 0 }, 'atk');
      const lines = abilityLines(fa, 'hollow');
      // C.103 (GDD 49장): 5단계 물리 단일 속성 6종은 물공 칸 1줄이 더 있다
      expect(lines.length, f.id).toBe(f.tier <= 3 ? 1 : fa.phys ? 3 : 2);
      for (const l of lines) expect(l.name.length, f.id).toBeGreaterThan(0);
      if (f.tier >= 4) expect(lines[1]!.description.length, f.id).toBeGreaterThan(0);
    }
  });
  it('속성 특성: 같은 속성은 단계 무관 같은 특성, 5단계 ×1.5 · 융합 두 속성 각 scale.fusion · 특수·순수 ×1.5', () => {
    expect(fx('t4:water').critChance).toBeCloseTo(AB.element.water!.critChance!);
    expect(fx('t5:water:mixed').critChance).toBeCloseTo(AB.element.water!.critChance! * 1.5);
    const fu = fx('h4:fusion:water+earth');
    expect(fu.critChance).toBeCloseTo(AB.element.water!.critChance! * AB.scale.fusion);
    expect(fu.effects.thorns!.ret).toBeCloseTo(AB.element.earth!.thornsReturn! * AB.scale.fusion);
    expect(fx('h4:special:kyo').effects.chainHaste).toBeCloseTo(AB.element.kyo!.chainHastePerChain! * 1.5);
    expect(fx('h4:pure').effects.blockPower).toBeCloseTo(AB.element.normal!.blockPower! * 1.5);
    expect(formAbilitiesOf(getForm('t3:base'), zeroStats(), 'atk').elements).toEqual([]);
  });
  it('실패형 = 성향 2개(노력치 1·2위), 속성 특성 없음 · 전용 5종은 속성 특성 대신', () => {
    const fa = formAbilitiesOf(getForm('h4:fail'), { hp: 1, atk: 9, int: 7, def: 0, spr: 0, spd: 0 }, 'atk');
    expect(fa.dispositions).toEqual(['atk', 'int']);
    expect(fa.elements).toEqual([]);
    expect(fx('h4:complete').effects.noWeak).toBe(true);
    expect(fx('h5:limit').effects.desperate).toBeDefined();
    expect(fx('h5:restraint').effects.rampUp).toBeDefined();
    expect(fx('h5:hunter').effects.eliteSlayer).toBeGreaterThan(0);
    expect(fx('h5:reborn').effects.lastStand).toBeGreaterThan(0);
  });
  it('종족 분기 없음: 두 종족 효과가 같고, 매핑·엔진 코드에 종족 id 가 없다', () => {
    const evo = { ...newEvolution(), tierIndex: 3, formId: 't4:water', formHistory: ['t2:base', 't3:base', 't4:water'], ability: 'atk' as const };
    const per = FACTIONS.map((f) => {
      const p: Partial<CombatParams> = {};
      applyEvolutionToParams(p, evo, f.id);
      return { fx: p.abilityEffects, crit: p.critChance };
    });
    expect(per[1]).toEqual(per[0]);
    for (const file of ['src/engine/evolution/formAbilities.ts', 'src/data/evolution/abilities.ts', 'src/engine/combat/combat.ts']) {
      const code = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
      expect(code, file).not.toMatch(/'hollow'|'shinigami'|t4:|h5:/);
    }
  });
});

describe('C.89 사용자 지정 효과 4종 (39장 2번)', () => {
  it('물 = 치명타 확률 +8%p (기존 critChance 에 더함)', () => {
    const p: Partial<CombatParams> = {};
    applyEvolutionToParams(p, { ...newEvolution(), tierIndex: 3, formId: 't4:water', formHistory: [], ability: 'atk' }, 'hollow');
    expect(p.critChance).toBeCloseTo(BALANCE.provisional.combat.critChance + 0.08);
  });
  it('뇌 = 기본 공격이 확률로 한 번 더 (같은 위력, 연타는 다시 연타 안 함)', () => {
    const s = mk({ doubleHit: 1 }, { enemyAttackSeconds: 999, blockSpawnSeconds: 999, voidChance: 0, timeLimitSeconds: 999 }, getEnemy('test-a'));
    s.enemy.hp = s.enemy.maxHp = 1e9;
    const evs = run(s, 30);
    const hits = evs.filter((e) => e.kind === 'player-attack') as Extract<CombatEvent, { kind: 'player-attack' }>[];
    const procs = evs.filter((e) => e.kind === 'ability' && e.effect === 'doubleHit').length;
    expect(procs).toBeGreaterThan(5);
    expect(hits.length).toBe(procs * 2); // 확률 1 이어도 한 번만 더
    for (let i = 0; i < hits.length; i += 2) expect(hits[i + 1]!.damage).toBe(hits[i]!.damage);
    // 15%: 긴 전투에서 발동 비율이 근처
    const t = mk({ doubleHit: 0.15 }, { enemyAttackSeconds: 999, blockSpawnSeconds: 999, voidChance: 0, timeLimitSeconds: 9999 });
    t.enemy.hp = t.enemy.maxHp = 1e9;
    const ev2 = run(t, 600);
    const n = ev2.filter((e) => e.kind === 'player-attack').length;
    const k = t.abilityProcs?.doubleHit ?? 0;
    expect(k / (n - k)).toBeGreaterThan(0.1);
    expect(k / (n - k)).toBeLessThan(0.2);
  });
  it('허 = 체인이 이어지면 다음 블록이 빨리 생긴다 (체인 단계당)', () => {
    const base = { blockSpawnSeconds: 10, voidChance: 0, enemyAttackSeconds: 999 };
    const a = mk({}, base);
    const b = mk({ chainHaste: 0.15 }, base);
    for (const s of [a, b]) {
      s.tray = [blk(BASIC_SKILL_ID), blk(BASIC_SKILL_ID), blk(BASIC_SKILL_ID)];
      s.spawnTimer = 50;
      applyInput(s, { type: 'use', cell: 0 });
    }
    // 생성 타이머 하나 (GDD 84장 6번, C.136)
    const full = ticksOf(b.params, spawnTableOf(b.params).seconds);
    expect(a.spawnTimer).toBe(50);
    expect(b.spawnTimer).toBe(50 - Math.round(full * 0.15 * 2)); // 체인3 = 2단계
    expect(b.abilityProcs?.chainHaste).toBe(1);
    // 체인 1 은 효과 없음
    const c = mk({ chainHaste: 0.15 }, base);
    c.tray = [blk(BASIC_SKILL_ID)];
    c.spawnTimer = 50;
    applyInput(c, { type: 'use', cell: 0 });
    expect(c.spawnTimer).toBe(50);
  });
  it('흙 = 받은 피해를 쌓아 최대 체력 20% 에 닿으면 그 60% 를 되돌린다 (쌓인 값 0)', () => {
    const s = mk({ thorns: { threshold: 0.2, ret: 0.6 } }, { blockSpawnSeconds: 999, voidChance: 0, playerAttackSeconds: 999, timeLimitSeconds: 999 });
    s.enemy.hp = s.enemy.maxHp = 1e9;
    let taken = 0;
    const evs: CombatEvent[] = [];
    while (s.status === 'playing' && !(s.abilityProcs?.thorns)) {
      const before = s.player.hp;
      step(s);
      taken += Math.max(0, before - s.player.hp);
      evs.push(...drainCombatEvents(s));
    }
    const proc = evs.find((e) => e.kind === 'ability' && e.effect === 'thorns') as Extract<CombatEvent, { kind: 'ability' }>;
    expect(taken).toBeGreaterThanOrEqual(s.player.maxHp * 0.2 - 1e-6);
    expect(proc.damage).toBeCloseTo(taken * 0.6, 3);
    expect(s.enemy.maxHp - s.enemy.hp).toBeCloseTo(proc.damage, 3);
    expect(s.thornsStored).toBe(0);
  });
});

describe('C.89 그 밖 효과·기록', () => {
  it('환생 = 전투마다 1번 쓰러질 때 체력 30% 로 버틴다', () => {
    const s = mk({ lastStand: 0.3 }, { blockSpawnSeconds: 999, voidChance: 0, playerAttackSeconds: 999, timeLimitSeconds: 999 });
    s.enemy.hp = s.enemy.maxHp = 1e9;
    s.player.hp = 1;
    run(s, 999);
    expect(s.abilityProcs?.lastStand).toBe(1);
    expect(s.status).toBe('lost');
  });
  it('사냥꾼 = 강적에게만 피해 ↑ · 균형 = 블록만 · 런 로그에 발동 횟수', () => {
    const q = { blockSpawnSeconds: 999, voidChance: 0, enemyAttackSeconds: 999 };
    const dmg = (fxv: CombatParams['abilityEffects'], enemy = normal) => {
      const s = mk(fxv, q, enemy);
      s.enemy.hp = s.enemy.maxHp = 1e9;
      const e = run(s, 3).find((x) => x.kind === 'player-attack') as Extract<CombatEvent, { kind: 'player-attack' }>;
      return e.damage;
    };
    expect(dmg({ eliteSlayer: 0.2 }, elite) / dmg({}, elite)).toBeCloseTo(1.2);
    expect(dmg({ eliteSlayer: 0.2 })).toBeCloseTo(dmg({}));
    expect(dmg({ blockPower: 0.5 })).toBeCloseTo(dmg({}));
    const s = mk({ doubleHit: 1 });
    run(s, 10);
    expect(buildBattleRecord(s, { factionId: 'hollow' }).abilityProcs?.doubleHit).toBeGreaterThan(0);
  });
});

describe('C.89 버전', () => {
  it('BALANCE_VERSION 46 이상', async () => {
    const { BALANCE_VERSION } = await import('../src/config/balance');
    expect(BALANCE_VERSION).toBeGreaterThanOrEqual(46);
  });
});

describe('C.89 상태 화면 치명 확률', () => {
  it('물 진화체면 상태 화면 치명 % 에 +8%p 가 더해진다', async () => {
    const { critPercentText } = await import('../src/ui/lcdScreens');
    const { newSaveData } = await import('../src/game');
    const sv = newSaveData('hollow', 3);
    const base = critPercentText(sv.build, sv.evolution);
    Object.assign(sv.evolution, { tierIndex: 3, formId: 't4:water', formHistory: ['t2:base', 't3:base', 't4:water'], ability: 'atk' });
    expect(parseInt(critPercentText(sv.build, sv.evolution))).toBe(parseInt(base) + 8);
  });
});
