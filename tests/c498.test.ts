// C.498 진화체 고유 능력 1차 (GDD 8-7, docs/drafts/evo-impl-1119.md): 공용 장치(규칙·조건·효과 종류) · 4단계 한 줄 특성 · 처형 '소멸선' · 견본 백련·노도
import { describe, expect, it } from 'vitest';
import { useImmediateHits } from './helpers/hitDelay';
import { BALANCE } from '../src/config/balance';
import { getEnemy } from '../src/data/enemies';
import { getForm } from '../src/data/evolution';
import {
  EVO_ACTIONS, EVO_STATS, EVO_TRIGGERS, evoFormEntry, evoReleaseBlocked, evoTraitIsHome, fillEvoText, validateEvoUniques, type EvoAbilityDef,
} from '../src/data/evolution/uniques';
import {
  BASIC_SKILL_ID, applyInput, attackSecondsNow, basicPowerOf, buildBattleRecord, createCombat, drainCombatEvents, evoCarryOut, evoExecLinesOf, evoSpecialUsable, evoStat,
  statusMarksOf, step, ticksOf, type Block, type CombatEvent, type CombatParams, type CombatState, type EvoParams,
} from '../src/engine/combat';
import { abilityEffectsOf, equippedAbilitiesOf, evoParamsOf, gainEvolutionAbility, newAbilityLoadout, representativeAbility } from '../src/engine/evolution';
useImmediateHits();

const EU = BALANCE.provisional.evoUniques;
const foe = getEnemy('test-a');
const elite = getEnemy('test-elite');
/** 흔들림·치명·공허·적 공격 없음, 적은 쓰러지지 않음 */
const STILL: Partial<CombatParams> = { critChance: 0, blockCritChance: 0, enemyCritChance: 0, enemyDamageVariance: 0, voidChance: 0, enemyPassive: true, enemyImmortal: true };
let uid = 50000;
const blk = (over: Partial<Block> = {}): Block => ({ uid: uid++, kind: 'skill', traitId: BASIC_SKILL_ID, family: 'family-a', ...over });
const mk = (extra: Partial<CombatParams>, enemy = foe, seed = 7): CombatState => createCombat(seed, { enemy, params: { ...STILL, ...extra } });
const evoOf = (ability: EvoAbilityDef, nums: Record<string, number> = {}, rel: Record<string, number> = {}): EvoParams => ({ formId: 'test', ability, nums, relNums: { ...nums, ...rel } });
const tick = (s: CombatState, n = 1): CombatEvent[] => {
  const out: CombatEvent[] = [];
  for (let i = 0; i < n && s.status === 'playing'; i++) {
    step(s);
    out.push(...drainCombatEvents(s));
  }
  return out;
};
/** 평타 n 번이 나올 때까지 */
const basics = (s: CombatState, n: number): CombatEvent[] => {
  const out: CombatEvent[] = [];
  let got = 0;
  for (let i = 0; i < 5000 && got < n && s.status === 'playing'; i++) {
    const evs = tick(s);
    got += evs.filter((e) => e.kind === 'player-attack').length;
    out.push(...evs);
  }
  return out;
};
const use = (s: CombatState, cell: number) => {
  const ok = applyInput(s, { type: 'use', cell });
  return { ok, evs: drainCombatEvents(s) };
};
const libNow = (s: CombatState) => {
  s.liberation.gauge = 100;
  const ok = applyInput(s, { type: 'liberate' });
  drainCombatEvents(s);
  return ok;
};

describe('데이터·장치 목록', () => {
  it('데이터 검사 통과 · 종류 목록이 비지 않음', () => {
    expect(validateEvoUniques()).toEqual([]);
    expect(EVO_TRIGGERS.length).toBeGreaterThanOrEqual(14);
    expect(EVO_ACTIONS.length).toBeGreaterThanOrEqual(24);
    expect(EVO_STATS.length).toBeGreaterThanOrEqual(15);
  });
  it('검사가 잘못된 데이터를 잡는다 (모르는 효과·없는 수치 키·없는 스택)', () => {
    const bad = {
      provisional: true,
      traits: {},
      forms: { 'x': { hollow: { trait: 'nope', release: 'some', ability: { description: 'd', rules: [{ on: 'basic', every: 'k', do: [{ act: 'add', stack: 'ghost' }, { act: 'zap' }] }], passives: [{ stat: 'speed', value: 1 }] } } } },
    };
    const errs = validateEvoUniques(bad as never, { traits: {}, forms: {} });
    expect(errs.some((e) => e.includes('모르는 특성'))).toBe(true);
    expect(errs.some((e) => e.includes("release 는 'none'"))).toBe(true);
    expect(errs.some((e) => e.includes('수치 키 k'))).toBe(true);
    expect(errs.some((e) => e.includes('스택 ghost'))).toBe(true);
    expect(errs.some((e) => e.includes('모르는 효과 zap'))).toBe(true);
    expect(errs.some((e) => e.includes('모르는 능력치 speed'))).toBe(true);
  });
  it('데이터는 진화체 id × 종족 — 백련·노도는 사신만, 마르티요(호로)는 아직 없음', () => {
    expect(evoFormEntry('t4:normal:physical', 'shinigami')?.ability).toBeTruthy();
    expect(evoFormEntry('t4:normal:physical', 'hollow')).toBeNull();
    expect(evoParamsOf(getForm('t4:normal:physical'), 'hollow')).toBeNull();
    expect(evoParamsOf(getForm('t4:water:physical'), 'shinigami')?.ability.specials?.rush).toBeTruthy();
    expect(evoReleaseBlocked('t4:normal:physical', 'shinigami')).toBe(false);
  });
  it('설명 틀: {키} 수치, {키%} 백분율', () => {
    expect(fillEvoText('평타 {every}대 · +{perBlock%}', { every: 4, perBlock: 0.03 })).toBe('평타 4대 · +3%');
  });
});

describe('4단계 한 줄 특성 (GDD 8-7 [미정] 초안대로 — 4단계 대표 특성을 대신)', () => {
  it('백련(사신) = 공격 속도 +10% 가 el4:normal 을 대신, 같은 진화체 호로(마르티요)는 그대로 el4', () => {
    expect(representativeAbility(getForm('t4:normal:physical'), 'shinigami')?.id).toBe('evo:aspd10');
    expect(representativeAbility(getForm('t4:normal:physical'), 'hollow')?.id).toBe('el4:normal');
    expect(representativeAbility(getForm('t4:normal:physical'))?.id).toBe('el4:normal'); // 종족 없이 부르면 옛 규칙(옛 세이브 마이그레이션)
  });
  it('4단계 진화 때 받고 → 전투 효과(공격 속도·치명)', () => {
    const l = newAbilityLoadout();
    const g = gainEvolutionAbility(l, getForm('t4:water:physical'), undefined, 'shinigami');
    expect(g.kind).toBe('new');
    expect(l.equipped).toContain('evo:crit6');
    const fx = abilityEffectsOf(equippedAbilitiesOf(getForm('t4:water:physical'), l)).effects;
    expect(fx.evoCrit).toBeCloseTo(EU.traits.crit6!.value!);
    const a = mk({});
    const b = mk({ abilityEffects: { evoAttackSpeed: 0.1 } });
    expect(attackSecondsNow(b)).toBeLessThan(attackSecondsNow(a));
  });
  it('소멸선: 허무형(공화·나다)이면 8%·×1.5, 다른 진화체가 가지면 5%·×1.3', () => {
    expect(evoTraitIsHome('h4:void', 'obliteration')).toBe(true);
    const home = abilityEffectsOf(equippedAbilitiesOf(getForm('h4:void'), { owned: { 'evo:obliteration': 1 }, equipped: ['evo:obliteration'], slots: 1, tier4Ever: true })).effects.execute;
    const away = abilityEffectsOf(equippedAbilitiesOf(getForm('t4:fire:mixed'), { owned: { 'evo:obliteration': 1 }, equipped: ['evo:obliteration'], slots: 1, tier4Ever: true })).effects.execute;
    expect(home).toEqual({ line: 0.08, eliteMult: 1.5 });
    expect(away).toEqual({ line: 0.05, eliteMult: 1.3 });
    expect(representativeAbility(getForm('h4:void'), 'hollow')?.id).toBe('evo:obliteration');
    expect(representativeAbility(getForm('h4:void'), 'shinigami')?.id).toBe('evo:obliteration');
  });
});

describe('처형 장치 (GDD 8-8)', () => {
  const EX = { abilityEffects: { execute: { line: 0.08, eliteMult: 1.5 } } };
  it('적 체력이 처형선 아래면 평타 한 대로 처형 (블록 피해는 처형 아님)', () => {
    const s = mk({ ...EX, enemyImmortal: false });
    s.enemy.hp = s.enemy.maxHp * 0.07;
    const evs = basics(s, 1);
    expect(s.status).toBe('won');
    expect(evs.some((e) => e.kind === 'evo-proc' && e.text === '처형!')).toBe(true);
    expect(buildBattleRecord(s, { factionId: 'hollow' }).abilityProcs?.['evo:처형!']).toBe(1);
  });
  it('선 위에서는 처형 없음', () => {
    const s = mk({ ...EX, enemyImmortal: false });
    s.enemy.hp = s.enemy.maxHp * 0.5;
    basics(s, 1);
    expect(s.status).toBe('playing');
  });
  it('강적·보스는 처형 대신 그 아래에서 주는 피해 ×1.5', () => {
    const a = mk({ ...EX }, elite);
    const b = mk({}, elite);
    for (const s of [a, b]) s.enemy.hp = s.enemy.maxHp * 0.05;
    const hit = (s: CombatState) => {
      const before = s.enemy.hp;
      basics(s, 1);
      return before - s.enemy.hp;
    };
    expect(hit(a) / hit(b)).toBeCloseTo(1.5, 5);
    expect(a.status).toBe('playing');
  });
  it('블록 처형선(execBlockLine)·처형 특수 블록(execBlock, 바 맨 앞 고정 2칸·써도 남음·강적은 꺼짐)', () => {
    const ability: EvoAbilityDef = {
      description: 'd',
      stacks: { voidStack: { max: 'cap' } },
      specials: { nil: { name: '공허', short: '공', fixed: 2, keep: true, usable: 'execBlock' } },
      rules: [
        { on: 'block', chain: [3], streak: { count: 2, withinSeconds: 1 }, do: [{ act: 'add', stack: 'voidStack', value: 1 }] },
        { on: 'special', special: 'nil', do: [{ act: 'execute' }] },
      ],
      passives: [{ stat: 'execBlockLine', value: 'per2', per: 'stack:voidStack', max: 'lineMax' }],
    };
    const s = mk({ ...EX, enemyImmortal: false, evo: evoOf(ability, { cap: 99, per2: 0.005, lineMax: 0.3 }) });
    expect(s.tray.length).toBe(2);
    expect(s.tray.every((b) => b.fixed)).toBe(true);
    expect(evoExecLinesOf(s)).toEqual({ basic: 0.08, block: 0 });
    // 3체인을 1초 안에 2번 → 스택 1
    for (let k = 0; k < 2; k++) {
      s.tray.push(blk(), blk(), blk());
      expect(use(s, 2).ok).toBe(true);
    }
    expect(s.evo!.stacks.voidStack!.n).toBe(1);
    expect(evoExecLinesOf(s).block).toBeCloseTo(0.005);
    s.evo!.stacks.voidStack!.n = 40; // 블록선 20%
    s.enemy.hp = s.enemy.maxHp * 0.3;
    expect(evoSpecialUsable(s, s.tray[0])).toBe(false);
    s.enemy.hp = s.enemy.maxHp * 0.15;
    expect(evoSpecialUsable(s, s.tray[0])).toBe(true);
    expect(use(s, 0).ok).toBe(true);
    expect(s.status).toBe('won');
    expect(s.tray.filter((b) => b.fixed).length).toBe(2); // 칸은 그대로
    const e = mk({ ...EX, evo: evoOf(ability, { cap: 99, per2: 0.005, lineMax: 0.3 }) }, elite);
    e.evo!.stacks.voidStack!.n = 40;
    e.enemy.hp = e.enemy.maxHp * 0.1;
    expect(evoSpecialUsable(e, e.tray[0])).toBe(false);
  });
  it('3체인 두 번 사이에 다른 블록을 쓰면 연달아가 끊긴다', () => {
    const ability: EvoAbilityDef = { description: 'd', stacks: { v: {} }, rules: [{ on: 'block', chain: [3], streak: { count: 2, withinSeconds: 1 }, do: [{ act: 'add', stack: 'v' }] }] };
    const s = mk({ evo: evoOf(ability) });
    s.tray.push(blk(), blk(), blk());
    use(s, 0);
    s.tray.push(blk({ family: 'family-b' }));
    use(s, 0);
    s.tray.push(blk(), blk(), blk());
    use(s, 0);
    expect(s.evo!.stacks.v!.n).toBe(0);
  });
});

describe('견본: 사신 백련 (t4:normal:physical)', () => {
  const N = EU.forms['t4:normal:physical']!.shinigami as Record<string, number> & { release: Record<string, number> };
  const evo = () => evoParamsOf(getForm('t4:normal:physical'), 'shinigami')!;
  it('허 블록 말고는 저절로 안 생김 → 평타 4대마다 블록 1개', () => {
    const s = mk({ evo: evo() });
    tick(s, ticksOf(s.params, 3)); // 생성 타이머가 돌아도
    const before = s.tray.length;
    expect(before).toBe(0);
    const evs = basics(s, N.every!);
    expect(s.tray.length).toBe(1);
    expect(evs.some((e) => e.kind === 'evo-proc' && e.text === '백련!')).toBe(true);
  });
  it('허 블록은 그대로 나온다', () => {
    const s = mk({ evo: evo(), voidChance: 1, voidChanceMax: 1 });
    tick(s, ticksOf(s.params, 8));
    expect(s.tray.some((b) => b.kind === 'void')).toBe(true);
    expect(s.tray.filter((b) => b.kind === 'skill').length).toBeLessThanOrEqual(Math.ceil(s.tick * s.params.tickSeconds)); // 평타 몫만
  });
  it('바에 쌓인 블록 1개당 공속·평타 +3%', () => {
    const s = mk({ evo: evo() });
    const p0 = basicPowerOf(s);
    const t0 = attackSecondsNow(s);
    s.tray.push(blk(), blk(), blk());
    expect(basicPowerOf(s) / p0).toBeCloseTo(1 + 3 * N.perBlock!, 5);
    expect(attackSecondsNow(s)).toBeLessThan(t0);
    expect(statusMarksOf(s, 'shinigami').some((m) => m.key === 'evo-passive')).toBe(true);
  });
  it('만해 중 평타 2대마다', () => {
    const s = mk({ evo: evo(), liberationUnique: true });
    expect(libNow(s)).toBe(true);
    expect(s.tray.length).toBe(0); // 해방 순간 지급도 없음(저절로 안 생김)
    basics(s, N.release.every!);
    expect(s.tray.length).toBe(1);
  });
  it('기본 해방(만해 아님) 때는 4대 그대로', () => {
    const s = mk({ evo: evo(), liberationUnique: false });
    expect(libNow(s)).toBe(true);
    basics(s, 2);
    expect(s.tray.length).toBe(0);
  });
});

describe('견본: 사신 노도 (t4:water:physical)', () => {
  const N = EU.forms['t4:water:physical']!.shinigami as Record<string, number> & { release: Record<string, number> };
  const evo = () => evoParamsOf(getForm('t4:water:physical'), 'shinigami')!;
  const W: Partial<CombatParams> = { playerElements: ['water'] };
  it('수 블록마다 5초 평타 치명 +4%p (스택마다 따로 시간, 최대 5)', () => {
    const s = mk({ ...W, evo: evo() });
    s.tray.push(blk());
    const r = use(s, 0);
    expect(r.ok).toBe(true);
    expect(r.evs.some((e) => e.kind === 'evo-proc' && e.text === '노도!')).toBe(true);
    expect(evoStat(s, 'crit')).toBeCloseTo(N.perStack!);
    tick(s, ticksOf(s.params, 2));
    s.tray.push(blk({ family: 'family-b' }));
    use(s, 0);
    expect(s.evo!.stacks.surge!.n).toBe(2);
    tick(s, ticksOf(s.params, 3.2)); // 첫 스택만 끝
    expect(s.evo!.stacks.surge!.n).toBe(1);
    for (let k = 0; k < 8; k++) {
      s.tray.push(blk({ family: k % 2 ? 'family-a' : 'family-b' }));
      use(s, s.tray.length - 1);
    }
    expect(s.evo!.stacks.surge!.n).toBe(N.max);
    expect(statusMarksOf(s, 'shinigami').find((m) => m.key === 'evo-s-surge')?.value).toBe(String(N.max));
  });
  it('불 블록은 스택 없음 · 스택은 맞아도 안 사라짐(끊김 없음)', () => {
    const s = mk({ ...W, evo: evo(), enemyPassive: false });
    s.tray.push(blk({ traitId: BASIC_SKILL_ID }));
    use(s, 0);
    tick(s, ticksOf(s.params, 3)); // 적에게 맞는 동안
    expect(s.evo!.stacks.surge!.n).toBe(1);
    const f = mk({ playerElements: ['fire'], evo: evo() });
    f.tray.push(blk());
    use(f, 0);
    expect(f.evo!.stacks.surge!.n).toBe(0);
  });
  it('평타 6회마다 특수 블록 「노도 연격」 → 누르면 평타 3회 즉시(각 +30%), 그 평타는 6회 카운터를 세지 않음', () => {
    const s = mk({ ...W, evo: evo() });
    basics(s, N.every!);
    const i = s.tray.findIndex((b) => b.traitId === 'evo:rush');
    expect(i).toBeGreaterThanOrEqual(0);
    const count0 = s.evo!.counters[1] ?? 0;
    const r = use(s, i);
    expect(r.ok).toBe(true);
    expect(r.evs.filter((e) => e.kind === 'player-attack').length).toBe(N.hits);
    expect(r.evs.some((e) => e.kind === 'evo-proc' && e.text === '노도 연격!')).toBe(true);
    expect(s.evo!.counters[1] ?? 0).toBe(count0);
    expect(s.tray.some((b) => b.traitId === 'evo:rush')).toBe(false);
  });
  it('연격 평타는 각 +30%', () => {
    const a = mk({ ...W, evo: evo() });
    const plain = basics(a, 1).filter((e): e is Extract<CombatEvent, { kind: 'player-attack' }> => e.kind === 'player-attack')[0]!.damage;
    a.tray.push({ uid: uid++, kind: 'skill', traitId: 'evo:rush', family: null, element: null, solo: true });
    const r = use(a, a.tray.length - 1);
    const d = r.evs.filter((e): e is Extract<CombatEvent, { kind: 'player-attack' }> => e.kind === 'player-attack')[0]!.damage;
    expect(d / plain).toBeCloseTo(1 + N.bonus!, 5);
  });
  it('만해: 지속 8초·스택당 +6%p·치명 피해 +5%', () => {
    const s = mk({ ...W, evo: evo(), liberationUnique: true, liberationSeconds: 30 });
    libNow(s);
    s.tray.length = 0;
    s.tray.push(blk());
    use(s, 0);
    expect(evoStat(s, 'crit')).toBeCloseTo(N.release.perStack!);
    expect(evoStat(s, 'critDmg')).toBeCloseTo(N.release.critDmgPerStack!);
    tick(s, ticksOf(s.params, 6));
    expect(s.evo!.stacks.surge!.n).toBe(1); // 8초 스택
    tick(s, ticksOf(s.params, 2.5));
    expect(s.evo!.stacks.surge!.n).toBe(0);
  });
  it('런 로그 발동 횟수', () => {
    const s = mk({ ...W, evo: evo() });
    s.tray.push(blk());
    use(s, 0);
    expect(buildBattleRecord(s, { factionId: 'shinigami' }).abilityProcs?.['evo:노도!']).toBe(1);
  });
});

describe('공용 장치 (다음 세션용 — 효과 종류마다)', () => {
  it('충전 + chargeValue: 혈 블록 → 다음 평타 피해의 체인 수×10% 회복 (heal of damage)', () => {
    const ability: EvoAbilityDef = {
      description: 'd',
      charges: { bh: {} },
      rules: [
        { on: 'block', do: [{ act: 'charge', charge: 'bh', value: 1, amount: 0.1, amountPer: 'chain' }] },
        { on: 'basic', charge: 'bh', do: [{ act: 'heal', value: 1, per: 'chargeValue:bh', of: 'damage' }] },
      ],
    };
    const s = mk({ evo: evoOf(ability) });
    s.player.hp = s.player.maxHp * 0.5;
    s.tray.push(blk(), blk());
    use(s, 0);
    const hp0 = s.player.hp;
    const evs = basics(s, 1);
    const dmg = evs.filter((e): e is Extract<CombatEvent, { kind: 'player-attack' }> => e.kind === 'player-attack')[0]!.damage;
    expect(s.player.hp - hp0).toBeCloseTo(dmg * 0.2, 5);
    const hp1 = s.player.hp;
    basics(s, 1);
    expect(s.player.hp).toBe(hp1); // 한 번만
  });
  it('분신(hit basis last): 다음 평타 체인 수×3대 동안 같은 피해 1번 더 (남은 것에 더함)', () => {
    const ability: EvoAbilityDef = { description: 'd', charges: { clone: {} }, rules: [{ on: 'block', do: [{ act: 'charge', charge: 'clone', value: 3, per: 'chain' }] }, { on: 'basic', charge: 'clone', do: [{ act: 'hit', basis: 'last', value: 1 }], proc: '분신!' }] };
    const s = mk({ evo: evoOf(ability) });
    s.tray.push(blk());
    use(s, 0);
    s.tray.push(blk());
    use(s, 0);
    expect(s.evo!.charges.clone!.n).toBe(6);
    const evs = basics(s, 1);
    const pa = evs.find((e): e is Extract<CombatEvent, { kind: 'player-attack' }> => e.kind === 'player-attack')!;
    const extra = evs.find((e): e is Extract<CombatEvent, { kind: 'evo-proc' }> => e.kind === 'evo-proc' && e.text === '분신!');
    expect(extra?.damage).toBeCloseTo(pa.damage, 5);
    expect(s.evo!.charges.clone!.n).toBe(5);
  });
  it('치명 확정(forceCrit) · 블록 치명 + 체인별(blockCrit) · 잔상(echo, 잔상은 잔상 안 남김)', () => {
    const ability: EvoAbilityDef = {
      description: 'd',
      charges: { sure: {} },
      rules: [
        { on: 'blockPre', chain: [2], do: [{ act: 'blockCrit', value: 1 }] },
        { on: 'block', crit: true, do: [{ act: 'charge', charge: 'sure', value: 2 }, { act: 'echo' }] },
        { on: 'basicPre', charge: 'sure', do: [{ act: 'forceCrit' }] },
      ],
    };
    const s = mk({ evo: evoOf(ability), blockCritChanceMax: 1 });
    s.tray.push(blk(), blk());
    const r = use(s, 0);
    expect(r.evs.find((e) => e.kind === 'block')).toMatchObject({ crit: true });
    expect(s.tray.length).toBe(1);
    expect(s.tray[0]!.echo).toBe(true);
    const evs = basics(s, 2);
    expect(evs.filter((e) => e.kind === 'player-attack').every((e) => (e as { crit?: boolean }).crit)).toBe(true);
    // 잔상 1체인은 치명이 아니어도(체인 2만 확정) — 잔상에서는 잔상이 안 생김
    const r2 = use(s, 0);
    expect(r2.ok).toBe(true);
    expect(s.tray.some((b) => b.echo)).toBe(false);
  });
  it('적 디버프 스택(찢김 on foe) + 소모(consume) → 블록 피해 + 평타 n회분(blockFlat per consumed)', () => {
    const ability: EvoAbilityDef = {
      description: 'd',
      stacks: { tear: { max: 5, on: 'foe', mark: { icon: 'i-weak', name: '찢김' } } },
      rules: [
        { on: 'basic', every: 3, do: [{ act: 'add', stack: 'tear', value: 1 }] },
        { on: 'blockPre', do: [{ act: 'consume', stack: 'tear', value: 1, per: 'chain' }, { act: 'blockFlat', value: 0.3, per: 'consumed' }] },
      ],
      passives: [{ stat: 'basicPower', value: 0.04, per: 'stack:tear' }],
    };
    const s = mk({ evo: evoOf(ability) });
    basics(s, 6);
    expect(s.evo!.stacks.tear!.n).toBe(2);
    expect(statusMarksOf(s, 'hollow').find((m) => m.key === 'evo-s-tear')?.on).toBe('foe');
    const plain = mk({});
    plain.tray.push(blk(), blk());
    const d0 = (use(plain, 0).evs.find((e) => e.kind === 'block') as { damage: number }).damage;
    s.tray.push(blk(), blk());
    const d1 = (use(s, 0).evs.find((e) => e.kind === 'block') as { damage: number }).damage;
    expect(d1).toBeGreaterThan(d0);
    expect(s.evo!.stacks.tear!.n).toBe(0);
  });
  it('시간제 버프 refresh max · 평타 배율(per buff) · 간격 −초(intervalCut) · 블록 피해 +(blockMult per chain)', () => {
    const ability: EvoAbilityDef = {
      description: 'd',
      buffs: { up: { mark: { icon: 'i-attack', name: '상승' } }, fast: {} },
      rules: [
        { on: 'blockPre', do: [{ act: 'blockMult', value: 0.1 }] },
        { on: 'block', do: [{ act: 'buff', buff: 'up', seconds: 4, value: 0.08, per: 'chain', refresh: 'max' }, { act: 'buff', buff: 'fast', seconds: 3, value: 1 }] },
      ],
      passives: [{ stat: 'basicPower', value: 1, per: 'buff:up' }, { stat: 'intervalCut', value: 0.1, per: 'buff:fast' }],
    };
    const s = mk({ evo: evoOf(ability) });
    const t0 = attackSecondsNow(s);
    s.tray.push(blk(), blk(), blk());
    use(s, 0);
    expect(evoStat(s, 'basicPower')).toBeCloseTo(0.24);
    s.tray.push(blk());
    use(s, 0);
    expect(evoStat(s, 'basicPower')).toBeCloseTo(0.24); // 큰 쪽 유지
    expect(attackSecondsNow(s)).toBeCloseTo(t0 - 0.1, 5);
    tick(s, ticksOf(s.params, 4.2));
    expect(evoStat(s, 'basicPower')).toBe(0);
  });
  it('평타마다 간격 −2%(최대 −30%) · 블록 쓰면 절반(mul) · 해방 중 안 줄어듦(when normal)', () => {
    const ability: EvoAbilityDef = {
      description: 'd',
      stacks: { hum: { max: 'cap' } },
      rules: [{ on: 'basic', do: [{ act: 'add', stack: 'hum', value: 1 }] }, { on: 'block', when: 'normal', do: [{ act: 'mul', stack: 'hum', value: 0.5 }] }],
      passives: [{ stat: 'interval', value: 0.02, per: 'stack:hum', max: 'maxCut' }],
    };
    const s = mk({ evo: evoOf(ability, { cap: 15, maxCut: 0.3 }, { cap: 22, maxCut: 0.45 }) });
    basics(s, 20);
    expect(s.evo!.stacks.hum!.n).toBe(15);
    expect(evoStat(s, 'interval')).toBeCloseTo(0.3);
    s.tray.push(blk());
    use(s, 0);
    expect(s.evo!.stacks.hum!.n).toBe(7.5);
  });
  it('방어막(shield·cap·shieldPct 비례·shieldCut) · 막은 양·깨짐(shieldHit/shieldBreak → hit raw per amount)', () => {
    const ability: EvoAbilityDef = {
      description: 'd',
      stacks: { stored: {} },
      rules: [
        { on: 'spawn', element: ['water'], do: [{ act: 'shield', value: 0.04, cap: 0.3 }] },
        { on: 'block', do: [{ act: 'shieldCut', value: 0.05, per: 'chain' }] },
        { on: 'shieldHit', do: [{ act: 'add', stack: 'stored', value: 1, per: 'amount' }] },
        { on: 'shieldBreak', do: [{ act: 'hit', basis: 'raw', value: 1, per: 'amount' }], proc: '되돌림!' },
      ],
      passives: [{ stat: 'basicPower', value: 0.015, per: 'shieldPct' }],
    };
    // 생김 규칙: 엔진이 놓는 물 블록마다 +4% → 상한 30%
    const t = mk({ playerElements: ['water'], evo: evoOf(ability), trayCapacity: 20 });
    tick(t, ticksOf(t.params, 60));
    expect((t.player.shield ?? 0) / t.player.maxHp).toBeCloseTo(0.3, 5);
    expect(evoStat(t, 'basicPower')).toBeCloseTo(0.015 * 30, 5);
    t.tray.length = 0;
    t.tray.push(blk({ family: 'family-z' }), blk({ family: 'family-z' }));
    use(t, 0);
    expect((t.player.shield ?? 0) / t.player.maxHp).toBeCloseTo(0.2, 5); // 체인 2 × 5%p 삭제
    // 막은 양 쌓기 · 깨지면 막은 합만큼 되돌림
    t.params.enemyPassive = false;
    t.params.trayCapacity = 0; // 더 생기지 않게
    const evs = tick(t, ticksOf(t.params, 120));
    const back = evs.find((e): e is Extract<CombatEvent, { kind: 'evo-proc' }> => e.kind === 'evo-proc' && e.text === '되돌림!');
    expect(back?.damage).toBeGreaterThan(0);
    expect(t.evo!.stacks.stored!.n).toBeGreaterThan(0);
  });
  it('잃은 체력 비례(lostHpPct) · 리스크 비례(risk, dealt) · 펫 피해(petPower)', () => {
    const ability: EvoAbilityDef = {
      description: 'd',
      passives: [{ stat: 'basicPower', value: 0.006, per: 'lostHpPct' }, { stat: 'dealt', value: 0.003, per: 'risk' }, { stat: 'petPower', value: 0.05 }],
    };
    const s = mk({ evo: evoOf(ability), riskStart: 100 });
    s.player.hp = s.player.maxHp * 0.5;
    expect(evoStat(s, 'basicPower')).toBeCloseTo(0.3, 5);
    expect(evoStat(s, 'dealt')).toBeCloseTo(0.3, 5);
    expect(evoStat(s, 'petPower')).toBeCloseTo(0.05);
  });
  it('해방 지속 예외(releaseSeconds) · 해방 중 체력 하한(releaseHpFloor) · 해방 중 생긴 블록 비례(spawn when release)', () => {
    const ability: EvoAbilityDef = {
      description: 'd',
      releaseSeconds: 'rs',
      releaseHpFloor: 1,
      stacks: { blood: {} },
      rules: [{ on: 'spawn', when: 'release', do: [{ act: 'add', stack: 'blood', value: 1 }] }, { on: 'releaseEnd', do: [{ act: 'clear', stack: 'blood' }] }],
      passives: [{ stat: 'crit', value: 0.05, per: 'stack:blood', when: 'release' }, { stat: 'critDmg', value: 0.1, per: 'stack:blood', when: 'release' }],
    };
    const s = mk({ evo: evoOf(ability, { rs: 2 }), liberationUnique: true, enemyPassive: false });
    libNow(s);
    expect(s.liberation.ticksLeft).toBe(ticksOf(s.params, 2));
    expect(s.evo!.stacks.blood!.n).toBeGreaterThan(0); // 해방 순간 지급 블록도 센다
    s.player.hp = 3;
    tick(s, 5);
    s.player.shield = 0;
    // 큰 피해도 1 아래로 안 떨어짐
    s.player.hp = 1;
    tick(s, ticksOf(s.params, 1));
    expect(s.player.hp).toBeGreaterThanOrEqual(1);
    tick(s, ticksOf(s.params, 1.5));
    expect(s.liberation.ticksLeft).toBe(0);
    expect(s.evo!.stacks.blood!.n).toBe(0);
  });
  it('블록 흡수 스택 특수 블록(흑귀형): 해방 시작에 놓고, 허 블록을 흡수해 스택 → 해방 끝에 자동 사용(hit void per stack)', () => {
    const ability: EvoAbilityDef = {
      description: 'd',
      stacks: { eat: {} },
      specials: { maw: { name: '흑귀', short: '흑' } },
      rules: [
        { on: 'releaseStart', do: [{ act: 'spawn', block: 'maw' }] },
        { on: 'spawn', kind: ['void'], when: 'release', need: [{ special: 'maw' }], do: [{ act: 'absorb' }, { act: 'add', stack: 'eat', value: 1 }] },
        { on: 'special', special: 'maw', do: [{ act: 'hit', basis: 'void', value: 1, per: 'stack:eat' }, { act: 'clear', stack: 'eat' }], proc: '흑귀!' },
        { on: 'releaseEnd', do: [{ act: 'useSpecial', special: 'maw' }] },
      ],
    };
    const s = mk({ evo: evoOf(ability), liberationUnique: true, liberationSeconds: 5, voidChance: 1, voidChanceMax: 1 });
    libNow(s);
    expect(s.tray.some((b) => b.traitId === 'evo:maw')).toBe(true);
    tick(s, ticksOf(s.params, 4.5));
    expect(s.tray.some((b) => b.kind === 'void')).toBe(false);
    expect(s.evo!.stacks.eat!.n).toBeGreaterThan(0);
    const evs = tick(s, ticksOf(s.params, 1));
    const hit = evs.find((e): e is Extract<CombatEvent, { kind: 'evo-proc' }> => e.kind === 'evo-proc' && e.text === '흑귀!');
    expect(hit?.damage).toBeGreaterThan(0);
    expect(s.tray.some((b) => b.traitId === 'evo:maw')).toBe(false);
  });
  it('every(바 가득인 동안 n초마다, 끊겨도 0 으로 안 감) → 평타 처형선 +1%(execLine, 최대)', () => {
    const ability: EvoAbilityDef = {
      description: 'd',
      spawnRule: 'voidOnly',
      stacks: { line: { max: 25 } },
      rules: [{ on: 'every', seconds: 3, need: [{ barFull: true }], do: [{ act: 'add', stack: 'line', value: 1 }] }],
      passives: [{ stat: 'execLine', value: 0.01, per: 'stack:line' }],
    };
    const s = mk({ evo: evoOf(ability), abilityEffects: { execute: { line: 0.08, eliteMult: 1.5 } }, trayCapacity: 2 });
    s.tray.push(blk(), blk({ family: 'family-b' }));
    tick(s, ticksOf(s.params, 2));
    s.tray.length = 1; // 끊김
    tick(s, ticksOf(s.params, 5));
    s.tray.push(blk());
    tick(s, ticksOf(s.params, 1.05));
    expect(s.evo!.stacks.line!.n).toBe(1);
    expect(evoExecLinesOf(s).basic).toBeCloseTo(0.09);
  });
  it('시계(timer·timerCut): 깨지면 12초 뒤 다시 — 평타마다 0.5초 당김', () => {
    const ability: EvoAbilityDef = {
      description: 'd',
      rules: [
        { on: 'start', do: [{ act: 'timer', timer: 'regen', seconds: 12 }] },
        { on: 'basic', do: [{ act: 'timerCut', timer: 'regen', seconds: 0.5 }] },
        { on: 'timer', timer: 'regen', do: [{ act: 'shield', value: 0.12, cap: 0.12 }], proc: '보호막!' },
      ],
    };
    const s = mk({ evo: evoOf(ability) });
    const evs = tick(s, ticksOf(s.params, 12));
    expect(evs.some((e) => e.kind === 'evo-proc' && e.text === '보호막!')).toBe(true);
    expect(s.tick * s.params.tickSeconds).toBeLessThanOrEqual(12.01);
  });
  it('스택 overflow reset(가득 다음 공격에 0) · carry(원정 동안 유지)', () => {
    const ability: EvoAbilityDef = { description: 'd', stacks: { mark: { max: 3, overflow: 'reset' }, keep: { carry: true } }, rules: [{ on: 'basic', do: [{ act: 'add', stack: 'mark', value: 1 }, { act: 'add', stack: 'keep', value: 1 }] }] };
    const s = mk({ evo: { ...evoOf(ability), carry: { keep: 5 } } });
    basics(s, 3);
    expect(s.evo!.stacks.mark!.n).toBe(3);
    basics(s, 1);
    expect(s.evo!.stacks.mark!.n).toBe(0);
    expect(evoCarryOut(s)).toEqual({ keep: 9 });
  });
  it('능력치 기준 바꾸기(offenseBasic 1 = 높은 쪽, offenseBlock 2 = 평균) · 특성 offenseMax', () => {
    const stats = { hp: 50, atk: 40, int: 80, def: 50, spr: 50, aspd: 50, bspd: 50 };
    const plain = mk({ playerStats: stats });
    const mx = mk({ playerStats: stats, abilityEffects: { offenseMax: true } });
    const d = (s: CombatState) => (basics(s, 1).find((e) => e.kind === 'player-attack') as { damage: number }).damage;
    expect(d(mx) / d(plain)).toBeCloseTo(2, 5);
    const avg = mk({ playerStats: stats, evo: evoOf({ description: 'd', passives: [{ stat: 'offenseBasic', value: 2 }] }) });
    expect(d(avg) / d(mk({ playerStats: stats }))).toBeCloseTo(1.5, 5);
  });
});

describe('세이브·화면·봇', () => {
  it('4단계 한 줄 특성 id(evo:) 는 저장·불러오기로 남는다 (구조 그대로, 형식 그대로)', async () => {
    const { newSaveData, writeSave, loadSave } = await import('../src/game');
    const mem = new Map<string, string>();
    const st = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
    const s = newSaveData('shinigami', 1);
    s.evolution.tierIndex = 3;
    s.evolution.formHistory = ['t2:base', 't3:normal', 't4:normal:physical'];
    s.evolution.formId = 't4:normal:physical';
    s.evolution.abilities = { owned: { 'evo:aspd10': 1 }, equipped: ['evo:aspd10'], slots: 2, tier4Ever: true };
    expect(writeSave(st, s)).toBe(true);
    expect(loadSave(st)?.evolution.abilities?.owned).toEqual({ 'evo:aspd10': 1 });
  });
  it('상태 화면 줄: 고유 능력·특수 블록·만해 (수치는 balance 로 채움)', async () => {
    const { evoUniqueLines } = await import('../src/ui/evolutionPanel');
    const lines = evoUniqueLines('t4:water:physical', 'shinigami', '만해');
    expect(lines.map((l) => l.label)).toEqual(['고유 능력', '특수 블록', '만해']);
    expect(lines[0]!.text).toContain('+4%p');
    expect(lines[1]!.text).toContain('「노도 연격」');
    expect(lines[2]!.text).toContain('8초');
    expect(evoUniqueLines('t4:normal:physical', 'hollow', '레스렉시온')).toEqual([]);
  });
  it('봇은 켜진 특수 블록을 바로 쓴다', async () => {
    const { botInput } = await import('../src/engine/combat');
    const s = mk({ evo: evoParamsOf(getForm('t4:water:physical'), 'shinigami')! });
    s.tray.push(blk(), { uid: uid++, kind: 'skill', traitId: 'evo:rush', family: null, element: null, solo: true });
    expect(botInput(s)).toEqual({ type: 'use', cell: 1 });
  });
});

describe('추가 장치 (마스터AP 11-19 — 니에블라 사용자 안 v6.131)', () => {
  const nieblaLike = (): EvoAbilityDef => ({
    description: 'd',
    chainMultipliers: ['c1', 'c2', 'c3'],
    stacks: { rapid: { max: 'max' } },
    rules: [
      { on: 'block', chain: [2], streak: { count: 2 }, do: [{ act: 'spawn', block: 'make', element: 'self', family: 'family-b', value: 3 }, { act: 'add', stack: 'rapid', value: 1 }] },
      { on: 'blockPre', chain: [3], need: [{ stack: 'rapid', atLeast: 1 }], do: [{ act: 'blockCrit', value: 'crit' }, { act: 'blockCritDmg', value: 'critDmg' }] },
      { on: 'block', chain: [3], when: 'normal', need: [{ stack: 'rapid', atLeast: 1 }], do: [{ act: 'consume', stack: 'rapid', value: 1 }] },
    ],
  });
  const nums = { c1: 0.8, c2: 1.8, c3: 4.4, max: 3, crit: 0.25, critDmg: 0.4 };
  it('같은 체인 수 블록을 연달아 n번(시간 제한 없음, 사이 다른 블록이면 끊김) → 바 끝에 지정 속성·계열 블록 여러 개', () => {
    const s = mk({ playerElements: ['water'], evo: evoOf(nieblaLike(), nums) });
    s.tray.push(blk(), blk());
    use(s, 0);
    tick(s, ticksOf(s.params, 10)); // 시간 제한 없음
    s.tray.length = 0;
    s.tray.push(blk({ family: 'family-c' }), blk({ family: 'family-c' }));
    use(s, 0);
    expect(s.tray.filter((b) => b.family === 'family-b').length).toBe(3);
    expect(s.evo!.stacks.rapid!.n).toBe(1);
    // 사이에 1체인 → 끊김
    s.tray.length = 0;
    s.tray.push(blk(), blk());
    use(s, 0);
    s.tray.push(blk({ family: 'family-c' }));
    use(s, 0);
    s.tray.push(blk(), blk());
    use(s, 0);
    expect(s.evo!.stacks.rapid!.n).toBe(1);
  });
  it('진화체 체인 배율 덮어쓰기 ×0.8/×1.8/×4.4', () => {
    const s = mk({ evo: evoOf(nieblaLike(), nums) });
    const plain = mk({});
    const d = (x: CombatState, n: number) => {
      x.tray.length = 0;
      for (let k = 0; k < n; k++) x.tray.push(blk({ family: 'family-z' }));
      return (use(x, 0).evs.find((e) => e.kind === 'block') as { damage: number }).damage;
    };
    const base1 = d(plain, 1);
    expect(d(s, 1) / base1).toBeCloseTo(0.8, 5);
    expect(d(s, 3) / base1).toBeCloseTo(4.4, 5);
  });
  it('스택 ≥1 이면 3체인만 치명 +·치명 피해 +, 3체인 쓰면 스택 −1 (해방 중엔 안 줄임)', () => {
    const s = mk({ evo: evoOf(nieblaLike(), nums), blockCritChance: 0.8, blockCritChanceMax: 1 });
    s.evo!.stacks.rapid!.n = 2;
    s.tray.push(blk(), blk(), blk());
    const r = use(s, 0);
    const b = r.evs.find((e) => e.kind === 'block') as { crit?: boolean; damage: number };
    expect(b.crit).toBe(true); // 0.8 + 0.25
    expect(s.evo!.stacks.rapid!.n).toBe(1);
    const noStack = mk({ evo: evoOf(nieblaLike(), nums), blockCritChance: 1, blockCritChanceMax: 1 });
    noStack.tray.push(blk(), blk(), blk());
    const d0 = (use(noStack, 0).evs.find((e) => e.kind === 'block') as { damage: number }).damage;
    expect(b.damage / d0).toBeCloseTo((BALANCE.provisional.combat.critMultiplier + 0.4) / BALANCE.provisional.combat.critMultiplier, 5);
  });
});
