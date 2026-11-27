// C.506 진화체 고유 능력 1차 — 사신 13종 (GDD 8-7, docs/drafts/evo-impl-1119.md 1절): 데이터·수치 + 작은 장치(grow·absorbBar·force·step·정확 피해) + 추성 2번째 펫 칸(세이브 형식 93)
import { describe, expect, it } from 'vitest';
import { useImmediateHits } from './helpers/hitDelay';
import { BALANCE } from '../src/config/balance';
import { getEnemy } from '../src/data/enemies';
import { getForm } from '../src/data/evolution';
import { evoExtraPetPower, evoExtraPetSlots, evoFormEntry, validateEvoUniques, type EvoAbilityDef } from '../src/data/evolution/uniques';
import {
  BASIC_SKILL_ID, applyInput, attackSecondsNow, createCombat, drainCombatEvents, evoCarryOut, evoExecLinesOf, evoSpecialUsable, evoStat,
  step, ticksOf, type Block, type CombatEvent, type CombatParams, type CombatState, type EvoParams,
} from '../src/engine/combat';
import { evoParamsOf, representativeAbility } from '../src/engine/evolution';
import { petAttackOf, sanitizePets } from '../src/engine/pet';
import { carriedPetsOf, migrateSave, newSaveData, petSlotsOf, syncPetSlots, MIN_LOADABLE_SAVE_FORMAT, SAVE_FORMAT_VERSION, SAVE_MIGRATIONS, type SaveData } from '../src/game';
import { choosePet, choosePet2, petSlotOf } from '../src/inventory';
useImmediateHits();

const F = BALANCE.provisional.evoUniques.forms as Record<string, { shinigami: Record<string, number> & { release?: Record<string, number> } }>;
const N = (id: string) => F[id]!.shinigami;
const foe = getEnemy('test-a');
const elite = getEnemy('test-elite');
const STILL: Partial<CombatParams> = { critChance: 0, blockCritChance: 0, enemyCritChance: 0, enemyDamageVariance: 0, voidChance: 0, enemyPassive: true, enemyImmortal: true };
let uid = 70000;
const blk = (over: Partial<Block> = {}): Block => ({ uid: uid++, kind: 'skill', traitId: BASIC_SKILL_ID, family: 'family-a', ...over });
const mk = (extra: Partial<CombatParams>, enemy = foe, seed = 7): CombatState => createCombat(seed, { enemy, params: { ...STILL, ...extra } });
const evo = (id: string): EvoParams => evoParamsOf(getForm(id), 'shinigami')!;
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
type Proc = Extract<CombatEvent, { kind: 'evo-proc' }>;
type PA = Extract<CombatEvent, { kind: 'player-attack' }>;
const procs = (evs: CombatEvent[], text: string) => evs.filter((e): e is Proc => e.kind === 'evo-proc' && e.text === text);
const attacks = (evs: CombatEvent[]) => evs.filter((e): e is PA => e.kind === 'player-attack');

const SHINIGAMI_13 = ['t4:fire:physical', 't4:earth:physical', 't4:blood:physical', 't4:thunder:physical', 't4:normal:mixed', 't4:water:special', 't4:water:mixed', 't4:fire:mixed', 't4:earth:mixed', 't4:thunder:mixed', 'h4:frenzy', 'h4:hunter', 'h4:void'];

describe('데이터 (사신 13종)', () => {
  it('데이터 검사 통과 · 13종 모두 사신 고유 능력이 있다(수치는 balance)', () => {
    expect(validateEvoUniques()).toEqual([]);
    for (const id of SHINIGAMI_13) {
      expect(evoFormEntry(id, 'shinigami')?.ability, id).toBeTruthy();
      expect(F[id]?.shinigami, id).toBeTruthy();
    }
  });
  it('4단계 한 줄 특성: 천평환 = 높은 쪽(offenseMax), 연우 = 블록 치명 +6%p, 공화 = 소멸선 · 칸이 빈 진화체는 4단계 특성 그대로', () => {
    expect(representativeAbility(getForm('t4:normal:mixed'), 'shinigami')?.id).toBe('evo:offenseMax');
    expect(representativeAbility(getForm('t4:water:special'), 'shinigami')?.id).toBe('evo:blockCrit6');
    expect(representativeAbility(getForm('h4:void'), 'shinigami')?.id).toBe('evo:obliteration');
    expect(representativeAbility(getForm('t4:fire:physical'), 'shinigami')?.id).not.toMatch(/^evo:/);
  });
  it('반석 간격 두 값(slow 표시 · slowCut 계산)이 맞물린다', () => {
    expect(1 - N('t4:earth:physical').slowCut!).toBeCloseTo(N('t4:earth:physical').slow!, 9);
  });
});

describe('작은 장치 (C.506)', () => {
  it('grow: 값 × (1 + value × per) · step: 2스택당 한 번 · absorbBar: 바의 그 속성 블록 전부 흡수 → consumed', () => {
    const ability: EvoAbilityDef = {
      description: 'd',
      stacks: { a: {}, b: {} },
      rules: [
        { on: 'block', do: [{ act: 'add', stack: 'a', value: 2, grow: { value: 0.5, per: 'chain' } }] },
        { on: 'start', do: [{ act: 'absorbBar', element: 'water' }, { act: 'add', stack: 'b', value: 1, per: 'consumed' }] },
      ],
      passives: [{ stat: 'basicPower', value: 0.01, per: 'stack:a', step: 2 }],
    };
    const s = mk({ evo: { formId: 't', ability, nums: {}, relNums: {} } });
    s.tray.push(blk(), blk());
    use(s, 0);
    expect(s.evo!.stacks.a!.n).toBeCloseTo(4); // 2 × (1 + 0.5 × 2)
    expect(evoStat(s, 'basicPower')).toBeCloseTo(0.02);
    s.evo!.stacks.a!.n = 5;
    expect(evoStat(s, 'basicPower')).toBeCloseTo(0.02); // 5 → 2번
  });
  it('추가 피해 basis raw·last 는 정해진 피해 그대로(치명·배율을 다시 안 붙임)', () => {
    const ability: EvoAbilityDef = { description: 'd', rules: [{ on: 'basic', do: [{ act: 'hit', basis: 'last', value: 1 }], proc: '같음!' }] };
    const s = mk({ evo: { formId: 't', ability, nums: {}, relNums: {} }, critChance: 1, critChanceMax: 1 });
    const evs = basics(s, 1);
    const pa = attacks(evs)[0]!;
    expect(pa.crit).toBe(true);
    expect(procs(evs, '같음!')[0]!.damage).toBeCloseTo(pa.damage, 6);
  });
});

describe('사신 봉수대 (t4:fire:physical)', () => {
  const n = N('t4:fire:physical');
  it('평타 3대마다 봉화 1, 봉화당 평타 +6%, 봉화 5 → 다음 평타 「봉수 폭렬」(방어 50% 무시 · 불 블록 1개당 +10%) 뒤 0', () => {
    const s = mk({ playerElements: ['fire'], evo: evo('t4:fire:physical') });
    basics(s, n.every! * n.need!);
    expect(s.evo!.stacks.beacon!.n).toBe(n.need);
    expect(evoStat(s, 'basicPower')).toBeCloseTo(n.perBeacon! * n.need!, 6);
    s.tray.length = 0;
    s.params.trayCapacity = 2;
    s.tray.push(blk(), blk({ family: 'family-b' }));
    const evs = basics(s, 1);
    expect(procs(evs, '봉수 폭렬!').length).toBe(1);
    expect(s.evo!.stacks.beacon!.n).toBe(0);
    const d1 = attacks(evs)[0]!.damage;
    // 같은 조건에서 불 블록 없음과 비교: × (1 + 0.1 × 2)
    const t = mk({ playerElements: ['fire'], evo: evo('t4:fire:physical') });
    basics(t, n.every! * n.need!);
    t.tray.length = 0;
    t.params.trayCapacity = 0;
    const d0 = attacks(basics(t, 1))[0]!.damage;
    expect(d1 / d0).toBeCloseTo(1 + n.perFire! * 2, 5);
    // 방어 50% 무시: 봉화 없는 평타(같은 봉화 보너스 빼고)보다 세다 — 다음 평타는 보통 평타
    const plain = attacks(basics(t, 1))[0]!.damage;
    expect(d0 / plain).toBeGreaterThan(1 + n.perBeacon! * n.need!);
  });
  it('만해: 필요 봉화 4 · 봉화당 +3% (최대 합 12% 유지 — C.524 봉화당 6 → 2.4%·만해 7.5 → 3%, 노력치×블록 비례 불 블록당 피해)', () => {
    expect(n.release!.need! * n.release!.perBeacon!).toBeCloseTo(n.need! * n.perBeacon!, 9);
    const s = mk({ evo: evo('t4:fire:physical'), liberationUnique: true, liberationSeconds: 600 });
    libNow(s);
    s.tray.length = 0;
    basics(s, n.every! * n.release!.need!);
    expect(s.evo!.stacks.beacon!.n).toBe(n.release!.need);
    expect(procs(basics(s, 1), '봉수 폭렬!').length).toBe(1);
  });
});

describe('사신 반석 (t4:earth:physical)', () => {
  const n = N('t4:earth:physical');
  it('평타 간격 ×1.15 · 흙 블록 생기면 방어막 +4%(상한 30%) · 방어막 1%당 평타 +1.5% · 흙 블록 쓰면 체인×5%p 삭제', () => {
    const plain = mk({ playerElements: ['earth'] });
    const s = mk({ playerElements: ['earth'], evo: evo('t4:earth:physical'), trayCapacity: 20 });
    expect(attackSecondsNow(s) / attackSecondsNow(plain)).toBeCloseTo(n.slow!, 5);
    tick(s, ticksOf(s.params, 60));
    expect((s.player.shield ?? 0) / s.player.maxHp).toBeCloseTo(n.cap!, 5);
    expect(evoStat(s, 'basicPower')).toBeCloseTo(n.perShield! * n.cap! * 100, 5);
    s.tray.length = 0;
    s.tray.push(blk({ family: 'family-z' }), blk({ family: 'family-z' }));
    use(s, 0);
    expect((s.player.shield ?? 0) / s.player.maxHp).toBeCloseTo(n.cap! - 2 * n.cutPerChain!, 5);
  });
  it('만해: 방어막이 막은 피해를 모아 끝날 때 그만큼 피해(블록으로 지운 몫 제외)', () => {
    const s = mk({ playerElements: ['earth'], evo: evo('t4:earth:physical'), liberationUnique: true, liberationSeconds: 6, enemyPassive: false, trayCapacity: 20 });
    s.player.shield = s.player.maxHp * 0.3;
    libNow(s);
    s.params.trayCapacity = 0;
    const evs = tick(s, ticksOf(s.params, 7));
    const back = procs(evs, '부동반석!');
    expect(back.length).toBe(1);
    expect(back[0]!.damage).toBeGreaterThan(0);
    expect(s.evo!.stacks.stored!.n).toBe(0);
  });
});

describe('사신 주홍장 (t4:blood:physical)', () => {
  const n = N('t4:blood:physical');
  it('잃은 체력 1%당 평타 +0.6% · 간격 −0.3% · 혈 블록 → 다음 평타 피해의 체인 수×10% 회복', () => {
    const s = mk({ playerElements: ['blood'], evo: evo('t4:blood:physical') });
    s.player.hp = s.player.maxHp * 0.5;
    expect(evoStat(s, 'basicPower')).toBeCloseTo(n.perLostPower! * 50, 5);
    expect(evoStat(s, 'interval')).toBeCloseTo(n.perLostInterval! * 50, 5);
    s.tray.push(blk(), blk());
    use(s, 0);
    const evs = basics(s, 1);
    expect(procs(evs, '주홍장!').length).toBe(1);
    const heals = evs.filter((e): e is Extract<CombatEvent, { kind: 'drain' }> => e.kind === 'drain').map((e) => (e as { heal?: number }).heal ?? 0);
    expect(heals.some((h) => Math.abs(h - attacks(evs)[0]!.damage * n.healPerChain! * 2) < 1e-6)).toBe(true);
  });
  it('만해 2초 · 체력 1 아래로 안 떨어짐 · 만해 중 생긴 혈 블록 1개당 치명 +5%p·치명 피해 +10%', () => {
    const s = mk({ playerElements: ['blood'], evo: evo('t4:blood:physical'), liberationUnique: true, enemyPassive: false });
    libNow(s);
    expect(s.liberation.ticksLeft).toBe(ticksOf(s.params, n.releaseSeconds!));
    const k = s.evo!.stacks.blood!.n;
    expect(evoStat(s, 'crit')).toBeCloseTo(n.critPerBlood! * k, 6);
    s.player.hp = 1;
    tick(s, ticksOf(s.params, 1));
    expect(s.player.hp).toBeGreaterThanOrEqual(1);
  });
});

describe('사신 섬뢰각 (t4:thunder:physical)', () => {
  it('뇌 블록 → 다음 평타 체인 수×3대 동안 분신이 같은 피해로 1번 더 (남은 것에 더함) · 만해 ×5', () => {
    const n = N('t4:thunder:physical');
    const s = mk({ playerElements: ['thunder'], evo: evo('t4:thunder:physical') });
    s.tray.push(blk(), blk());
    use(s, 0);
    expect(s.evo!.charges.clone!.n).toBe(n.perChain! * 2);
    const evs = basics(s, 1);
    expect(procs(evs, '분신!')[0]!.damage).toBeCloseTo(attacks(evs)[0]!.damage, 5);
    const w = mk({ playerElements: ['fire'], evo: evo('t4:thunder:physical') });
    w.tray.push(blk());
    use(w, 0);
    expect(w.evo!.charges.clone?.n ?? 0).toBe(0); // 뇌 블록이 아니면 없음
    const r = mk({ playerElements: ['thunder'], evo: evo('t4:thunder:physical'), liberationUnique: true, liberationSeconds: 600 });
    libNow(r);
    r.tray.length = 0;
    r.tray.push(blk());
    use(r, 0);
    expect(r.evo!.charges.clone!.n).toBe(n.release!.perChain);
  });
});

describe('사신 천평환 (t4:normal:mixed)', () => {
  it('블록 피해 = 공격력·지능 평균 기준 (평타는 특성으로 높은 쪽)', () => {
    const stats = { hp: 50, atk: 40, int: 80, def: 50, spr: 50, aspd: 50, bspd: 50 };
    const d = (s: CombatState) => {
      s.tray.length = 0;
      s.tray.push(blk({ family: 'family-z' }));
      return (use(s, 0).evs.find((e) => e.kind === 'block') as { damage: number }).damage;
    };
    const plain = mk({ playerStats: stats });
    const mx = mk({ playerStats: stats, abilityEffects: { offenseMax: true } });
    const avg = mk({ playerStats: stats, abilityEffects: { offenseMax: true }, evo: evo('t4:normal:mixed') });
    expect(d(mx)).toBeGreaterThanOrEqual(d(avg)); // 지능이 높으면 높은 쪽 ≥ 평균
    expect(d(avg)).not.toBeCloseTo(d(plain), 3);
  });
});

describe('사신 연우 (t4:water:special)', () => {
  const n = N('t4:water:special');
  it('2체인 2번 연달아 → 바 끝에 물·귀 블록 3개 + 장마 1 · 장마 ≥1 이면 3체인만 치명 +25%p, 3체인 쓰면 −1 · 체인 배율 ×0.8/×1.8/×4.4', () => {
    const s = mk({ playerElements: ['water'], evo: evo('t4:water:special') });
    s.tray.push(blk(), blk());
    use(s, 0);
    s.tray.push(blk({ family: 'family-b' }), blk({ family: 'family-b' }));
    const r = use(s, 0);
    expect(procs(r.evs, '장마!').length).toBe(1);
    expect(s.tray.filter((b) => b.family === 'family-c').length).toBe(n.made);
    expect(s.evo!.stacks.rain!.n).toBe(1);
    s.params.blockCritChance = 0.8;
    s.params.blockCritChanceMax = 1;
    const r3 = use(s, 0); // 물·귀 3개 = 3체인
    expect((r3.evs.find((e) => e.kind === 'block') as { crit?: boolean }).crit).toBe(true);
    expect(s.evo!.stacks.rain!.n).toBe(0);
    expect(s.params.evo!.ability.chainMultipliers).toEqual(['c1', 'c2', 'c3']);
    expect([n.c1, n.c2, n.c3]).toEqual([0.8, 1.8, 4.4]);
  });
  it('만해: 3체인이 장마를 안 줄임 · 최대 5', () => {
    const s = mk({ evo: evo('t4:water:special'), liberationUnique: true, liberationSeconds: 600 });
    libNow(s);
    s.tray.length = 0;
    s.evo!.stacks.rain!.n = 2;
    s.tray.push(blk(), blk(), blk());
    use(s, 0);
    expect(s.evo!.stacks.rain!.n).toBe(2);
    for (let k = 0; k < 8; k++) {
      s.tray.length = 0;
      s.tray.push(blk({ family: 'family-b' }), blk({ family: 'family-b' }));
      use(s, 0);
    }
    expect(s.evo!.stacks.rain!.n).toBe(n.release!.max);
  });
});

describe('사신 백랑파 (t4:water:mixed)', () => {
  it('블록이 치명이면 다음 평타 2회 치명 확정 (겹쳐도 2회) · 만해 4회', () => {
    const s = mk({ evo: evo('t4:water:mixed'), blockCritChance: 1, blockCritChanceMax: 1 });
    s.tray.push(blk());
    use(s, 0);
    s.tray.push(blk());
    use(s, 0);
    expect(s.evo!.charges.sure!.n).toBe(2);
    const evs = basics(s, 3);
    expect(attacks(evs).map((a) => !!a.crit)).toEqual([true, true, false]);
    const r = mk({ evo: evo('t4:water:mixed'), blockCritChance: 1, blockCritChanceMax: 1, liberationUnique: true, liberationSeconds: 600 });
    libNow(r);
    r.tray.length = 0;
    r.tray.push(blk());
    use(r, 0);
    expect(r.evo!.charges.sure!.n).toBe(N('t4:water:mixed').release!.hits);
  });
});

describe('사신 천일야장도 (t4:fire:mixed)', () => {
  it('불 블록 → 다음 평타 체인 수×2대 불칼(블록 1단계 30% 불 추가 피해), 최대 12 · 만해 = 불칼이 화상(8초, +8%)·최대 20', () => {
    const s = mk({ playerElements: ['fire'], evo: evo('t4:fire:mixed') });
    for (let k = 0; k < 3; k++) {
      s.tray.push(blk(), blk(), blk());
      use(s, 0);
    }
    expect(s.evo!.charges.blade!.n).toBe(12);
    const evs = basics(s, 1);
    expect(procs(evs, '불칼!').length).toBe(1);
    expect(s.evo!.buffs.burn).toBeUndefined();
    const r = mk({ playerElements: ['fire'], evo: evo('t4:fire:mixed'), liberationUnique: true, liberationSeconds: 600 });
    libNow(r);
    r.tray.length = 0;
    r.tray.push(blk());
    use(r, 0);
    basics(r, 1);
    expect(evoStat(r, 'dealt')).toBeCloseTo(N('t4:fire:mixed').release!.burnPct!, 6);
  });
});

describe('사신 태산압정 (t4:earth:mixed)', () => {
  const n = N('t4:earth:mixed');
  it('블록 → 방어막 체인 수×4%(상한 30%) · 방어막 있는 동안만 평타에 흙 추가 피해 +20%', () => {
    const s = mk({ evo: evo('t4:earth:mixed') });
    let evs = basics(s, 1);
    expect(procs(evs, '태산!').length).toBe(0);
    s.tray.push(blk(), blk(), blk());
    use(s, 0);
    expect((s.player.shield ?? 0) / s.player.maxHp).toBeCloseTo(n.perChain! * 3, 5);
    evs = basics(s, 1);
    expect(procs(evs, '태산!')[0]!.damage).toBeCloseTo(attacks(evs)[0]!.damage * n.extra!, 5);
    for (let k = 0; k < 5; k++) {
      s.tray.push(blk(), blk(), blk());
      use(s, 0);
    }
    expect((s.player.shield ?? 0) / s.player.maxHp).toBeCloseTo(n.cap!, 5);
  });
});

describe('사신 비전 (t4:thunder:mixed)', () => {
  it('블록은 원래 피해 그대로 + 3초 평타 간격 −0.1초(갱신) · 만해 5초 −0.15초', () => {
    const s = mk({ evo: evo('t4:thunder:mixed') });
    const plain = mk({});
    const t0 = attackSecondsNow(s);
    const dmg = (x: CombatState) => {
      x.tray.length = 0;
      x.tray.push(blk({ family: 'family-z' }));
      return (use(x, 0).evs.find((e) => e.kind === 'block') as { damage: number }).damage;
    };
    expect(dmg(s)).toBeCloseTo(dmg(plain), 6); // 피해 증가 없음 (v6.133)
    expect(attackSecondsNow(s)).toBeCloseTo(t0 - 0.1, 5);
    dmg(s);
    expect(attackSecondsNow(s)).toBeCloseTo(t0 - 0.1, 5); // 겹치지 않음
    tick(s, ticksOf(s.params, 3.2));
    expect(attackSecondsNow(s)).toBeCloseTo(t0, 5);
    expect(N('t4:thunder:mixed').release).toMatchObject({ seconds: 5, cut: 0.15 }); // C.527: release 에 해방 기울기(hasteSecondsGrow)도 있음
  });
});

describe('사신 흑귀 (h4:frenzy, 히든 폭주형)', () => {
  it('호로화 게이지 1당 주는 피해 +0.27% (C.524: 0.3 → 0.27%, 넓이 맞춤)', () => {
    const s = mk({ evo: evo('h4:frenzy'), riskStart: 100 });
    expect(evoStat(s, 'dealt')).toBeCloseTo(0.27, 6);
  });
  it('만해: 특수 블록 「흑귀」가 바의 허 블록 + 새 허 블록을 흡수 → 끝날 때 자동 사용(쌓인 만큼 피해) · 바가 가득이어도 생긴다', () => {
    const s = mk({ evo: evo('h4:frenzy'), liberationUnique: true, liberationSeconds: 5, voidChance: 1, voidChanceMax: 1 });
    s.tray.push(blk({ kind: 'void', traitId: null, family: null }), blk({ kind: 'void', traitId: null, family: null }));
    while (s.tray.length < s.params.trayCapacity) s.tray.push(blk());
    libNow(s);
    expect(s.tray.some((b) => b.traitId === 'evo:maw')).toBe(true);
    expect(s.tray.some((b) => b.kind === 'void')).toBe(false);
    expect(s.evo!.stacks.maw!.n).toBeGreaterThanOrEqual(2);
    const evs = tick(s, ticksOf(s.params, 6));
    expect(procs(evs, '흑귀!')[0]?.damage).toBeGreaterThan(0);
    expect(s.tray.some((b) => b.traitId === 'evo:maw')).toBe(false);
  });
});

describe('사신 추성 (h4:hunter, 히든 사냥꾼) — 전투', () => {
  const n = N('h4:hunter');
  it('평타마다 표식 +1(최대 10, 다 차면 다음 공격에 0) · 표식당 펫 공격력 +5% · 만해 = 표식당 치명 피해 +4%·최대 12', () => {
    const s = mk({ evo: evo('h4:hunter') });
    basics(s, 10);
    expect(s.evo!.stacks.mark!.n).toBe(n.maxMarks);
    expect(evoStat(s, 'petPower')).toBeCloseTo(n.perMark! * 10, 6);
    basics(s, 1);
    expect(s.evo!.stacks.mark!.n).toBe(0);
    const r = mk({ evo: evo('h4:hunter'), liberationUnique: true, liberationSeconds: 600 });
    libNow(r);
    basics(r, 12);
    expect(r.evo!.stacks.mark!.n).toBe(12);
    expect(evoStat(r, 'critDmg')).toBeCloseTo(n.release!.critPerMark! * 12, 6);
  });
  it('2번째 칸 펫이 같이 공격 (피해 70%)', () => {
    const p1 = petAttackOf({ id: 'pet-gold', level: 1 });
    const p2 = petAttackOf({ id: 'pet-gold', level: 1, power: evoExtraPetPower('h4:hunter', 'shinigami') });
    expect(p2!.fraction / p1!.fraction).toBeCloseTo(0.7, 9);
    const s = mk({ petAttack: p1, petAttack2: p2 });
    const evs = tick(s, ticksOf(s.params, p1!.seconds * 3));
    const pets = evs.filter((e): e is Extract<CombatEvent, { kind: 'pet-attack' }> => e.kind === 'pet-attack');
    const one = pets.filter((e) => !e.second);
    const two = pets.filter((e) => e.second);
    expect(one.length).toBeGreaterThan(0);
    expect(two.length).toBeGreaterThan(0);
    expect(two[0]!.damage / one[0]!.damage).toBeCloseTo(0.7, 6);
  });
});

describe('사신 공화 (h4:void, 히든 허무형)', () => {
  const n = N('h4:void');
  const EX = { abilityEffects: { execute: { line: 0.08, eliteMult: 1.5 } } };
  it('바 맨 앞 2칸 허무 블록 · 3체인 1초 안 2번 = 허무 +1(C.517 표시 이름 공허 → 허무) · 2개당 블록 처형선 +1%(최대 30%) · 선 아래면 켜지고 누르면 처형 · 강적은 꺼짐 · 원정 유지', () => {
    const s = mk({ ...EX, enemyImmortal: false, evo: evo('h4:void') });
    expect(s.tray.filter((b) => b.fixed && b.traitId === 'evo:nil').length).toBe(n.fixed);
    for (let k = 0; k < 2; k++) {
      s.tray.push(blk(), blk(), blk());
      use(s, s.tray.length - 1);
    }
    expect(s.evo!.stacks.hollow!.n).toBe(1);
    expect(evoExecLinesOf(s).block).toBe(0); // 2개당
    s.evo!.stacks.hollow!.n = 2;
    expect(evoExecLinesOf(s).block).toBeCloseTo(n.perTwo!, 6);
    s.evo!.stacks.hollow!.n = 60;
    expect(evoExecLinesOf(s).block).toBeCloseTo(n.lineMax!, 6);
    expect(evoExecLinesOf(s).basic).toBeCloseTo(0.08, 6); // 평타선 그대로
    expect(evoCarryOut(s)).toEqual({ hollow: 60 });
    s.enemy.hp = s.enemy.maxHp * 0.25;
    expect(evoSpecialUsable(s, s.tray[0])).toBe(true);
    use(s, 0);
    expect(s.status).toBe('won');
    expect(s.tray.filter((b) => b.fixed).length).toBe(2);
    const e = mk({ ...EX, evo: { ...evo('h4:void'), carry: { hollow: 40 } } }, elite);
    e.enemy.hp = e.enemy.maxHp * 0.05;
    expect(evoSpecialUsable(e, e.tray[0])).toBe(false);
  });
});

describe('추성 2번째 펫 칸 — 세이브 형식 93', () => {
  const hunter = (): SaveData => {
    const s = newSaveData('shinigami', 1);
    s.evolution.formId = 'h4:hunter';
    s.evolution.tierIndex = 3;
    s.shared.unlocks.pet = 0;
    s.shared.pets.owned = { 'pet-gold': { laps: 0, gotAt: 1 }, 'pet-belly': { laps: 0, gotAt: 1 } } as SaveData['shared']['pets']['owned'];
    return s;
  };
  it('형식 93 · 92 → 93 변환(빈 2번째 칸) · 문턱 87 그대로', () => {
    expect(SAVE_FORMAT_VERSION).toBe(100);
    expect(MIN_LOADABLE_SAVE_FORMAT).toBe(87);
    expect(typeof SAVE_MIGRATIONS[92]).toBe('function');
    const s = newSaveData('shinigami', 1);
    const old = JSON.parse(JSON.stringify(s));
    delete old.shared.pets.active2;
    old.meta.format = 92;
    const m = migrateSave(old)!;
    expect(m.meta.format).toBe(100);
    expect(m.shared.pets.active2).toBeNull();
  });
  it('펫 칸: 추성(사신) 2칸 · 다른 진화체 1칸 · 정리(안 가진 펫·1번째와 같은 펫은 버림)', () => {
    expect(evoExtraPetSlots('h4:hunter', 'shinigami')).toBe(1);
    expect(petSlotsOf(hunter())).toBe(2);
    expect(petSlotsOf(newSaveData('shinigami', 1))).toBe(1);
    expect(sanitizePets({ owned: { 'pet-gold': { laps: 1, gotAt: 1 } }, active: 'pet-gold', active2: 'pet-gold' }).active2).toBeNull();
    expect(sanitizePets({ owned: {}, active: null, active2: 'ghost' }).active2).toBeNull();
  });
  it('데리고 가기: 1번째 칸이 차 있으면 빈 2번째 칸 · 원정·전투에 두 마리(2번째 = 70%) · 칸이 줄면 2번째 펫은 보유 목록으로', () => {
    const s = hunter();
    expect(choosePet(s, 'pet-gold', 1)).toBe(true);
    expect(choosePet(s, 'pet-belly', 1)).toBe(true);
    expect(s.shared.pets.active).toBe('pet-gold');
    expect(s.shared.pets.active2).toBe('pet-belly');
    expect(petSlotOf(s, 'pet-belly')).toBe(2);
    const c = carriedPetsOf(s);
    expect(c.pet?.id).toBe('pet-gold');
    expect(c.pet2).toMatchObject({ id: 'pet-belly', power: 0.7 });
    expect(choosePet2(s, null, 1)).toBe(true);
    expect(s.shared.pets.active2).toBeNull();
    choosePet2(s, 'pet-belly', 1);
    s.evolution.formId = 't4:fire:physical';
    expect(carriedPetsOf(s).pet2).toBeNull(); // 칸이 없으면 안 데려감
    expect(syncPetSlots(s, 2)).toBe(true);
    expect(s.shared.pets.active2).toBeNull();
    expect(s.shared.pets.owned['pet-belly']).toBeTruthy();
    expect(s.runLog.pets.at(-1)).toMatchObject({ kind: 'leave', petId: 'pet-belly' });
    expect(choosePet2(s, 'pet-belly', 1)).toBe(false); // 칸 없음
  });
});
