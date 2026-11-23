// C.514 진화체 고유 능력 2차 — 사신 현음·석양홍·만리장 (GDD 8-7, docs/drafts/evo-impl-1121.md 1절): 체인 상한 넘기기(chainExtend)·특수 평타(basicShot)·굳음(harden)
// + 4단계 한 줄 특성 blockPower·elementDamage + 규칙 거르기 family·hardened. 수치 = balance provisional.evoUniques
import { describe, expect, it } from 'vitest';
import { useImmediateHits } from './helpers/hitDelay';
import { BALANCE } from '../src/config/balance';
import { getEnemy } from '../src/data/enemies';
import { getForm } from '../src/data/evolution';
import { evoFormEntry, evoFormIds, evoKnown, validateEvoUniques, type EvoAbilityDef } from '../src/data/evolution/uniques';
import {
  BASIC_SKILL_ID, applyInput, blockDamage, botInput, chainCapOf, createCombat, drainCombatEvents, evoHardenedStarts, evoMarksOf, evoProcsOf,
  step, ticksOf, type Block, type CombatEvent, type CombatParams, type CombatState, type EvoParams,
} from '../src/engine/combat';
import { abilityEffectsOf, equippedAbilitiesOf, evoParamsOf, gainEvolutionAbility, newAbilityLoadout, representativeAbility } from '../src/engine/evolution';
import { FACTIONS } from '../src/data/factions';
useImmediateHits();

type Nums = Record<string, number> & { release?: Record<string, number> };
const F = BALANCE.provisional.evoUniques.forms as Record<string, { shinigami?: Nums; hollow?: Nums }>;
const N = (id: string) => F[id]!.shinigami!;
const HYEON = 't4:normal:special';
const SUNSET = 't4:fire:special';
const WALL = 't4:earth:special';
const foe = getEnemy('test-a');
const STILL: Partial<CombatParams> = { critChance: 0, blockCritChance: 0, enemyCritChance: 0, enemyDamageVariance: 0, voidChance: 0, enemyPassive: true, enemyImmortal: true };
let uid = 90000;
const blk = (over: Partial<Block> = {}): Block => ({ uid: uid++, kind: 'skill', traitId: BASIC_SKILL_ID, family: 'family-a', ...over });
const mk = (extra: Partial<CombatParams>, seed = 7): CombatState => createCombat(seed, { enemy: foe, params: { ...STILL, ...extra } });
const evo = (id: string, fac = 'shinigami'): EvoParams => evoParamsOf(getForm(id), fac)!;
const tick = (s: CombatState, n = 1): CombatEvent[] => {
  const out: CombatEvent[] = [];
  for (let i = 0; i < n && s.status === 'playing'; i++) {
    step(s);
    out.push(...drainCombatEvents(s));
  }
  return out;
};
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
const libEnd = (s: CombatState) => {
  s.liberation.ticksLeft = 1;
  return tick(s);
};
type Proc = Extract<CombatEvent, { kind: 'evo-proc' }>;
type PA = Extract<CombatEvent, { kind: 'player-attack' }>;
type BE = Extract<CombatEvent, { kind: 'block' }>;
const procs = (evs: CombatEvent[], text: string) => evs.filter((e): e is Proc => e.kind === 'evo-proc' && e.text === text);
const attacks = (evs: CombatEvent[]) => evs.filter((e): e is PA => e.kind === 'player-attack');
const blockEv = (evs: CombatEvent[]) => evs.find((e): e is BE => e.kind === 'block')!;
/** 생성 타이머가 바를 건드리지 않게 */
const noSpawn = (s: CombatState) => {
  s.spawnTimer = 1e9;
};

describe('데이터 (사신 현음·석양홍·만리장)', () => {
  it('데이터 검사 통과 · 세 진화체 사신 고유 능력·수치가 있다 · 4단계 한 줄 특성 = 블록 피해 +6% · 불 피해 +8% · 흙 피해 +8%', () => {
    expect(validateEvoUniques()).toEqual([]);
    for (const id of [HYEON, SUNSET, WALL]) {
      expect(evoFormEntry(id, 'shinigami')?.ability, id).toBeTruthy();
      expect(F[id]?.shinigami, id).toBeTruthy();
    }
    expect(representativeAbility(getForm(HYEON), 'shinigami')?.id).toBe('evo:blockPower6');
    expect(representativeAbility(getForm(SUNSET), 'shinigami')?.id).toBe('evo:fireDmg8');
    expect(representativeAbility(getForm(WALL), 'shinigami')?.id).toBe('evo:earthDmg8');
    const T = BALANCE.provisional.evoUniques.traits;
    expect([T.blockPower6!.value, T.fireDmg8!.value, T.earthDmg8!.value]).toEqual([0.06, 0.08, 0.08]);
  });
  it('특성 효과: blockPower → 블록 위력 + · elementDamage → 그 속성 피해 + (4단계 진화 때 받는다)', () => {
    const l = newAbilityLoadout();
    expect(gainEvolutionAbility(l, getForm(HYEON), undefined, 'shinigami').kind).toBe('new');
    expect(abilityEffectsOf(equippedAbilitiesOf(getForm(HYEON), l)).effects.blockPower).toBeCloseTo(0.06);
    const l2 = newAbilityLoadout();
    gainEvolutionAbility(l2, getForm(SUNSET), undefined, 'shinigami');
    expect(abilityEffectsOf(equippedAbilitiesOf(getForm(SUNSET), l2)).effects.evoElementDamage).toEqual({ fire: 0.08 });
    const l3 = newAbilityLoadout();
    gainEvolutionAbility(l3, getForm(WALL), undefined, 'shinigami');
    expect(abilityEffectsOf(equippedAbilitiesOf(getForm(WALL), l3)).effects.evoElementDamage).toEqual({ earth: 0.08 });
  });
  it('수치표 그대로 (provisional)', () => {
    expect(N(HYEON)).toMatchObject({ chainMax: 4, x4: 1.4, x5: 1.8, made: 1, release: { chainMax: 5, made: 2 } });
    expect(N(SUNSET)).toMatchObject({ shotMult: 1, shotMax: 1, shotGrow: 6, release: { shotMult: 3, shotMax: 3 } }); // C.524: ×2 → ×1.5(블록 투자 비례)·만해 ×2.5 → ×3 · C.525(시간 제한 능력 = 노력 곡선): ×1 · 노력치 비례 다 키우면 ×7
    expect(N(WALL)).toMatchObject({ hardSeconds: 2, hardBonus: 0.4, hardShield: 0.12, release: { hardSeconds: 1, hardBonus: 0.7, hardShield: 0.18 } });
  });
});

describe('데이터 검사 확장 (C.514 새 장치)', () => {
  const base = () => JSON.parse(JSON.stringify({ provisional: true, traits: {}, forms: {} })) as NonNullable<Parameters<typeof validateEvoUniques>[0]>;
  const bal = (nums: Record<string, number> = {}) => ({ traits: {}, forms: { [HYEON]: { shinigami: nums } } }) as unknown as Parameters<typeof validateEvoUniques>[1];
  const withAbility = (a: Partial<EvoAbilityDef>) => {
    const d = base();
    d.forms[HYEON] = { shinigami: { ability: { description: 'x', ...a } as EvoAbilityDef } };
    return d;
  };
  it('chain 4 거르기는 chainExtend 가 있어야 · tiers 수치 키·이름 · max 범위', () => {
    expect(validateEvoUniques(withAbility({ rules: [{ on: 'block', chain: [4], do: [{ act: 'add', stack: 's', value: 1 }] }], stacks: { s: {} } }), bal(), evoKnown()).join()).toMatch(/chain 4 은 1~3/);
    const ok = withAbility({ chainExtend: { max: 'm', tiers: [{ mult: 'x', name: '가' }] }, rules: [{ on: 'block', chain: [4], do: [{ act: 'add', stack: 's', value: 1 }] }], stacks: { s: {} } });
    expect(validateEvoUniques(ok, bal({ m: 4, x: 1.4 }), evoKnown())).toEqual([]);
    expect(validateEvoUniques(ok, bal({ m: 4 }), evoKnown()).join()).toMatch(/tiers\[0\]\.mult 수치 키 없음/);
    expect(validateEvoUniques(withAbility({ chainExtend: { max: 6, tiers: [{ mult: 1, name: '가' }] } }), bal(), evoKnown()).join()).toMatch(/chainExtend\.max 는 1~4/);
  });
  it('family 는 그 종족 계열 · hardened 는 harden 이 있어야 · basicShot 는 basicPre 에서만 · fx 계열·단계 · elementDamage 특성은 속성', () => {
    expect(validateEvoUniques(withAbility({ rules: [{ on: 'block', family: ['family-z'], do: [{ act: 'add', stack: 's', value: 1 }] }], stacks: { s: {} } }), bal(), evoKnown()).join()).toMatch(/없는 블록 계열 family-z/);
    expect(validateEvoUniques(withAbility({ rules: [{ on: 'block', hardened: true, do: [{ act: 'add', stack: 's', value: 1 }] }], stacks: { s: {} } }), bal(), evoKnown()).join()).toMatch(/harden 이 있어야/);
    expect(validateEvoUniques(withAbility({ rules: [{ on: 'basic', do: [{ act: 'basicShot', value: 2 }] }] }), bal(), evoKnown()).join()).toMatch(/basicShot 는 basicPre/);
    expect(validateEvoUniques(withAbility({ rules: [{ on: 'basicPre', do: [{ act: 'basicShot', value: 2, fx: { family: 'family-c', stage: 9 } }] }] }), bal(), evoKnown()).join()).toMatch(/fx 는/);
    expect(validateEvoUniques(withAbility({ harden: { chain: 3, seconds: 'h', stack: 'nope', name: '굳음' } }), bal(), evoKnown()).join()).toMatch(/harden 수치|harden\.seconds 수치 키 없음/);
    expect(validateEvoUniques(withAbility({ harden: { chain: 3, seconds: 2, stack: 'nope', name: '굳음' } }), bal(), evoKnown()).join()).toMatch(/harden\.stack 스택 nope 없음/);
    const d = base();
    d.traits.bad = { effect: 'elementDamage', name: { '*': 'x' }, description: { '*': 'x' } };
    expect(validateEvoUniques(d, { traits: { bad: { value: 0.1 } }, forms: {} } as unknown as Parameters<typeof validateEvoUniques>[1], evoKnown()).join()).toMatch(/elementDamage 는 아는 속성/);
  });
});

describe('체인 상한: 현음만 4(만해 5), 나머지는 3', () => {
  it('고유 능력 데이터가 있는 모든 진화체 × 종족: 현음(사신)만 4 · 해방 중에도 나머지 3', () => {
    for (const id of evoFormIds()) {
      for (const fac of FACTIONS.map((f) => f.id)) {
        const ev = evoParamsOf(getForm(id), fac);
        if (!ev) continue;
        const s = mk({ evo: ev, liberationUnique: true, liberationSeconds: 600 });
        const want = id === HYEON && fac === 'shinigami' ? 4 : 3;
        expect(chainCapOf(s), `${id}.${fac}`).toBe(want);
        libNow(s);
        expect(chainCapOf(s), `${id}.${fac} 해방`).toBe(want === 4 ? 5 : 3);
      }
    }
    expect(chainCapOf(mk({}))).toBe(3); // 고유 능력 없는 몸
  });
});

describe('사신 현음 (t4:normal:special)', () => {
  const n = N(HYEON);
  it('같은 블록 4개 = 4체인 「사현」: 3체인 기술 피해 ×1.4 · 쓰면 블록 1개가 바로 생김 · 작은 글자·런 로그', () => {
    const s = mk({ evo: evo(HYEON) });
    noSpawn(s);
    s.tray.length = 0;
    s.tray.push(blk(), blk(), blk(), blk());
    const d3 = blockDamage(s, s.tray[0]!, 3);
    expect(blockDamage(s, s.tray[0]!, 4) / d3).toBeCloseTo(n.x4!, 9);
    const r = use(s, 0);
    const e = blockEv(r.evs);
    expect(e.chain).toBe(4);
    const s3 = mk({ evo: evo(HYEON) });
    noSpawn(s3);
    s3.tray.length = 0;
    s3.tray.push(blk(), blk(), blk());
    expect(e.damage / blockEv(use(s3, 0).evs).damage).toBeCloseTo(n.x4!, 6); // 실제 피해도 3체인 기술 × 1.4
    expect(procs(r.evs, '사현!').length).toBe(1);
    expect(s.tray.length).toBe(n.made);
    expect(s.blocksByChain).toEqual([0, 0, 1]); // 기록은 맨 위 칸(3체인 이상)
    expect(s.chain3Count).toBe(1);
    expect(evoProcsOf(s)['evo:사현!']).toBe(1);
  });
  it('같은 블록 5개는 4 + 1 로 묶인다 (만해 아닐 때) · 3체인 이하는 그대로(블록 안 생김)', () => {
    const s = mk({ evo: evo(HYEON) });
    noSpawn(s);
    s.tray.length = 0;
    s.tray.push(blk(), blk(), blk(), blk(), blk());
    expect(blockEv(use(s, 0).evs).chain).toBe(4);
    s.tray.length = 0;
    s.tray.push(blk(), blk(), blk());
    const r = use(s, 0);
    expect(blockEv(r.evs).chain).toBe(3);
    expect(procs(r.evs, '사현!').length).toBe(0);
    expect(s.tray.length).toBe(0);
  });
  it('만해: 상한 5 · 5체인 「칠성」 ×1.8 · 4체인 이상이면 블록 2개 · 끝나면 다시 4', () => {
    const s = mk({ evo: evo(HYEON), liberationUnique: true, liberationSeconds: 600 });
    libNow(s);
    noSpawn(s);
    expect(chainCapOf(s)).toBe(5);
    s.tray.length = 0;
    s.tray.push(blk(), blk(), blk(), blk(), blk());
    const d3 = blockDamage(s, s.tray[0]!, 3);
    expect(blockDamage(s, s.tray[0]!, 5) / d3).toBeCloseTo(n.x5!, 9);
    let r = use(s, 0);
    expect(blockEv(r.evs).chain).toBe(5);
    expect(procs(r.evs, '칠성!').length).toBe(1);
    expect(s.tray.length).toBe(n.release!.made);
    s.tray.length = 0;
    s.tray.push(blk(), blk(), blk(), blk());
    r = use(s, 0);
    expect(procs(r.evs, '사현!').length).toBe(1);
    expect(s.tray.length).toBe(n.release!.made);
    libEnd(s);
    expect(chainCapOf(s)).toBe(4);
  });
  it('봇도 같은 규칙: 같은 블록 4개면 한 번에 4체인으로 쓴다', () => {
    const s = mk({ evo: evo(HYEON) });
    noSpawn(s);
    s.tray.length = 0;
    s.tray.push(blk(), blk(), blk(), blk());
    const inp = botInput(s);
    expect(inp?.type).toBe('use');
    applyInput(s, inp!);
    expect(blockEv(drainCombatEvents(s)).chain).toBe(4);
  });
});

describe('사신 석양홍 (t4:fire:special)', () => {
  const n = N(SUNSET);
  const gwi = () => blk({ family: 'family-c' });
  it('불 블록 → 적 화상 · 화상 걸린 적에게 귀 블록 → 「석양」 충전 1(겹치지 않음) · 다음 평타 1회가 불 속성 특수 공격', () => {
    const s = mk({ playerElements: ['fire'], evo: evo(SUNSET) });
    noSpawn(s);
    s.tray.length = 0;
    s.tray.push(gwi());
    use(s, 0); // 화상 전이라 충전 없음, 이 블록이 화상을 건다
    expect(s.evo!.charges.sunset?.n ?? 0).toBe(0);
    expect(s.evo!.buffs.burn?.value).toBeCloseTo(n.burnPct!);
    s.tray.push(gwi(), blk({ family: 'family-b' }), gwi(), gwi());
    use(s, 0);
    expect(s.evo!.charges.sunset!.n).toBe(1);
    use(s, 0); // 권 블록은 충전 안 함
    use(s, 0); // 귀 2체인 — 최대 1
    expect(s.evo!.charges.sunset!.n).toBe(n.shotMax);
    const evs = basics(s, 2);
    const pa = attacks(evs);
    expect(pa[0]!.evoShot).toBe('석양!');
    expect(pa[0]!.evoShotElement).toBe('fire');
    expect(pa[0]!.evoShotFx).toEqual({ family: 'family-c', stage: 3 });
    expect(pa[1]!.evoShot).toBeUndefined();
    expect(procs(evs, '석양!').length).toBe(1);
    expect(evoProcsOf(s)['evo:석양!']).toBe(1);
    expect(evoMarksOf(s).some((m) => m.key === 'evo-b-burn')).toBe(true);
  });
  it('「석양」 = 평타 × shotMult (지능 기준: 지능만 올리면 석양만 세진다)', () => {
    const shotOf = (mult: number, int: number) => {
      const ev = evo(SUNSET);
      const s = mk({ playerElements: ['fire'], evo: { ...ev, nums: { ...ev.nums, shotMult: mult } } });
      noSpawn(s);
      s.player.stats = { ...s.player.stats, int: s.player.stats.int * int };
      s.evo!.charges.sunset = { n: 1, value: 0 };
      const pa = attacks(basics(s, 2));
      return { shot: pa[0]!.damage, plain: pa[1]!.damage };
    };
    const a = shotOf(1, 1);
    const b = shotOf(n.shotMult!, 1);
    expect(b.shot / a.shot).toBeCloseTo(n.shotMult!, 6);
    const c = shotOf(1, 2);
    expect(c.shot).toBeGreaterThan(a.shot);
    expect(c.plain).toBeCloseTo(a.plain, 6);
  });
  it('만해: 귀 블록 체인 수만큼 충전(최대 3) · ×3 · 해방 시작/끝에 충전 수 그대로', () => {
    const s = mk({ playerElements: ['fire'], evo: evo(SUNSET), liberationUnique: true, liberationSeconds: 600 });
    noSpawn(s);
    s.tray.length = 0;
    s.tray.push(gwi(), gwi());
    use(s, 0); // 화상만
    s.tray.push(gwi());
    use(s, 0);
    expect(s.evo!.charges.sunset!.n).toBe(1);
    libNow(s);
    expect(s.evo!.charges.sunset!.n).toBe(1);
    s.tray.length = 0;
    s.tray.push(gwi(), gwi(), gwi());
    use(s, 0);
    expect(s.evo!.charges.sunset!.n).toBe(n.release!.shotMax);
    expect(s.params.evo!.relNums.shotMult).toBe(3); // C.524 (옛 2.5)
    libEnd(s);
    expect(s.evo!.charges.sunset!.n).toBe(n.release!.shotMax);
  });
});

describe('사신 만리장 (t4:earth:special)', () => {
  const n = N(WALL);
  const earth3 = (s: CombatState) => {
    s.tray.length = 0;
    s.tray.push(blk(), blk(), blk());
  };
  it('흙 3체인 묶음이 2초 지나면 굳음(표시 칩) → 쓰면 피해 ×1.4 + 방어막 12% · 굳지 않은 3체인은 방어막 없음', () => {
    const soft = mk({ playerElements: ['earth'], evo: evo(WALL) });
    noSpawn(soft);
    earth3(soft);
    tick(soft);
    expect(evoHardenedStarts(soft)).toEqual([]);
    const r0 = use(soft, 0);
    expect(soft.player.shield ?? 0).toBe(0);
    expect(procs(r0.evs, '굳음!').length).toBe(0);

    const s = mk({ playerElements: ['earth'], evo: evo(WALL) });
    noSpawn(s);
    earth3(s);
    tick(s, ticksOf(s.params, n.hardSeconds!) - 1);
    expect(evoHardenedStarts(s)).toEqual([]);
    tick(s, 2);
    expect(evoHardenedStarts(s)).toEqual([0]);
    expect(s.evo!.stacks.hard!.n).toBe(1);
    expect(evoMarksOf(s).find((m) => m.key === 'evo-s-hard')?.value).toBe(1);
    const r = use(s, 0);
    expect(blockEv(r.evs).damage / blockEv(r0.evs).damage).toBeCloseTo(1 + n.hardBonus!, 6);
    expect(s.player.shield).toBeCloseTo(s.player.maxHp * n.hardShield!, 6);
    expect(procs(r.evs, '굳음!').length).toBe(1);
    expect(evoProcsOf(s)['evo:굳음!']).toBe(1);
    tick(s);
    expect(s.evo!.stacks.hard!.n).toBe(0);
  });
  it('2체인·흙 아닌 3체인은 굳지 않는다 · 묶음이 바뀌면(블록이 빠지면) 처음부터', () => {
    const s = mk({ playerElements: ['earth'], evo: evo(WALL) });
    noSpawn(s);
    s.tray.length = 0;
    s.tray.push(blk(), blk(), blk({ family: 'family-b' }), blk({ family: 'family-b' }), blk({ family: 'family-b', traitId: 'nope' }));
    tick(s, ticksOf(s.params, 5));
    expect(evoHardenedStarts(s)).toEqual([]);
    const w = mk({ playerElements: ['water'], evo: evo(WALL) });
    noSpawn(w);
    earth3(w);
    tick(w, ticksOf(w.params, 5));
    expect(evoHardenedStarts(w)).toEqual([]);
  });
  it('만해: 1초에 굳음 · ×1.7 · 방어막 18% · 해방 시작/끝에 묶음 시간 그대로', () => {
    const s = mk({ playerElements: ['earth'], evo: evo(WALL), liberationUnique: true, liberationSeconds: 600 });
    noSpawn(s);
    earth3(s);
    tick(s, ticksOf(s.params, 1.5));
    expect(evoHardenedStarts(s)).toEqual([]); // 평소 2초
    const keys = { ...s.evo!.groups };
    libNow(s);
    noSpawn(s);
    tick(s);
    expect(s.evo!.groups[Object.keys(keys)[0]!]).toBe(Object.values(keys)[0]);
    expect(evoHardenedStarts(s)).toEqual([0]); // 만해 1초 — 이미 지남
    const soft = mk({ playerElements: ['earth'], evo: evo(WALL), liberationUnique: true, liberationSeconds: 600 });
    libNow(soft);
    noSpawn(soft);
    earth3(soft);
    const d0 = blockEv(use(soft, 0).evs).damage;
    const r = use(s, 0);
    expect(blockEv(r.evs).damage / d0).toBeCloseTo(1 + n.release!.hardBonus!, 6);
    expect(s.player.shield).toBeCloseTo(s.player.maxHp * n.release!.hardShield!, 6);
    // 해방 끝: 묶음 시간 그대로 이어 간다
    earth3(s);
    tick(s, ticksOf(s.params, 0.5));
    const before = { ...s.evo!.groups };
    libEnd(s);
    expect(s.evo!.groups).toEqual(before);
    expect(evoHardenedStarts(s)).toEqual([]); // 다시 2초 기준
  });
});
