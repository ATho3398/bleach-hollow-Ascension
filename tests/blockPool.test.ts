// 블록 풀 (GDD 44장 → 44-1 B안, C.97 → 44-2 재조정, C.98): 기본 블록 5종은 늘 나오고(별도 타이머, 가중 추첨) 흡수 블록은 특성마다 타이머로 더해진다. 흡수 칸·성향 보정으로 비율이 바뀐다
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { getEnemy } from '../src/data/enemies';
import { getFaction } from '../src/data/factions';
import { TRAITS } from '../src/data/traits';
import { buildCombatParams, gainTrait, newBuild } from '../src/engine/absorb';
import {
  basicSources, basicSpawnSecondsOf, BASIC_GUARD_ID, BASIC_HEAL_ID, BASIC_SKILL_ID, blockPoolOf, createCombat, isBasicBlockId, spawnRatesOf, spawnSecondsOf, step, type CombatParams, type CombatState,
} from '../src/engine/combat';
import { applyEvolutionToParams, newEvolution } from '../src/engine/evolution';

const BP = BALANCE.provisional.blockPool;
const FACTION = 'hollow';
const build = (...ids: string[]): Partial<CombatParams> => {
  const b = newBuild();
  for (const id of ids) gainTrait(b, id);
  return buildCombatParams(b, FACTION);
};
const paramsOf = (p: Partial<CombatParams>) => createCombat(1, { enemy: getEnemy('test-a'), params: p }).params;
/** 블록 생성만 보는 전투: 시간 제한 없음 */
const long = (seed: number, p: Partial<CombatParams>) => createCombat(seed, { enemy: getEnemy('test-a'), params: { ...p, timeLimitSeconds: 1e9 } });
const chance = (p: CombatParams, pred: (id: string, family: string | null) => boolean) =>
  blockPoolOf(p).filter((e) => pred(e.source.id, e.family)).reduce((a, e) => a + e.chance, 0);
const sum = (p: CombatParams) => chance(p, () => true);
const W = BP.basicWeights;
const BASIC_TOTAL = W.attack * 3; // C.174 (GDD 105장): 막기·회복은 블록이 아니라 버튼 — 기본 블록 풀은 공격 3계열만

/** 블록 n 개가 나올 때까지 돌린다 (쓰지 않으니 바가 차면 비우고 센다) */
function spawned(s: CombatState, n: number): { traitId: string | null; family: string | null }[] {
  const out: { traitId: string | null; family: string | null }[] = [];
  s.player.hp = s.player.maxHp = 1e12;
  s.enemy.hp = s.enemy.maxHp = 1e12;
  s.params.voidChance = s.params.voidChanceBonus = 0;
  while (out.length < n && s.status === 'playing') {
    step(s);
    for (const b of s.tray) if (b.kind === 'skill') out.push({ traitId: b.traitId, family: b.family ?? null });
    s.tray = [];
  }
  return out;
}

describe('기본 블록 풀 (GDD 44장 2번)', () => {
  it('기본 블록 풀 = 공격 3계열 각 1/3 (C.174 GDD 105장: 막기·회복은 버튼, 흡수 칸과 상관없다)', () => {
    for (const p of [paramsOf(build()), paramsOf(build('t-poison-c'))]) {
      const fams = getFaction(FACTION).families.map((f) => f.id);
      expect(blockPoolOf(p)).toHaveLength(3);
      for (const f of fams) expect(chance(p, (id, fam) => id === BASIC_SKILL_ID && fam === f)).toBeCloseTo(W.attack / BASIC_TOTAL);
      expect(chance(p, (id) => id === BASIC_GUARD_ID || id === BASIC_HEAL_ID)).toBe(0);
      expect(sum(p)).toBeCloseTo(1);
    }
  });

  it('흡수 0칸이면 기본 블록만 나온다', () => {
    const out = spawned(long(2, build()), 300);
    expect(out.every((b) => isBasicBlockId(b.traitId))).toBe(true);
  });

  it('독 탄 1칸: 독 탄이 특성 타이머로 나오고 기본 공격 3계열도 함께 나온다 (막기·회복 블록은 없다, C.174)', () => {
    const p = build('t-poison-c');
    const r = spawnRatesOf(paramsOf(p));
    const out = spawned(long(4, p), 2000);
    const atk = out.filter((b) => b.traitId !== BASIC_GUARD_ID && b.traitId !== BASIC_HEAL_ID); // C.136: absorbedShare = 공격 블록 중 몫
    const rate = (pred: (b: { traitId: string | null }) => boolean) => atk.filter(pred).length / atk.length;
    expect(rate((b) => b.traitId === 't-poison-c')).toBeGreaterThan(r.absorbedShare - 0.05);
    expect(rate((b) => b.traitId === 't-poison-c')).toBeLessThan(r.absorbedShare + 0.05);
    for (const id of [BASIC_GUARD_ID, BASIC_HEAL_ID]) expect(out.some((b) => b.traitId === id)).toBe(false);
    expect(new Set(out.filter((b) => b.traitId === BASIC_SKILL_ID).map((b) => b.family))).toEqual(new Set(['family-a', 'family-b', 'family-c']));
  });
});

describe('생성 간격과 흡수 칸 (GDD 44-1 B안)', () => {
  it('흡수 특성은 특성마다 blockSpawnSeconds, 기본 타이머 = 0칸 basicSpawnSeconds / 칸이 있으면 흡수 총 간격 × (1 − 몫) / 몫 (C.98)', () => {
    const CX = BALANCE.provisional.combat;
    const one = paramsOf(build('t-poison-c'));
    expect(spawnSecondsOf(one, one.skills[0]!)).toBeCloseTo(CX.blockSpawnSeconds);
    expect(basicSpawnSecondsOf(paramsOf(build()))).toBeCloseTo(BP.basicSpawnSeconds);
    for (let n = 1; n <= 3; n++) {
      const p = paramsOf(build(...['t-fire-a', 't-earth-c', 't-thunder-b'].slice(0, n)));
      const share = BP.basicShareBySlots[n]!;
      const absorbedTotal = (CX.blockSpawnSeconds * (1 + BP.absorbedSlowdownPerSlot * (n - 1))) / n;
      expect(basicSpawnSecondsOf(p)).toBeCloseTo((absorbedTotal * (1 - share)) / share);
    }
    expect(basicSpawnSecondsOf(paramsOf({ ...build(), blockSpawnMultiplier: 2 }))).toBeCloseTo(BP.basicSpawnSeconds / 2);
    expect(basicSpawnSecondsOf(paramsOf({ ...build('t-poison-c'), blockSpawnMultiplier: 2 }))).toBeCloseTo(basicSpawnSecondsOf(one) / 2);
  });

  it('흡수 칸이 늘수록 흡수 블록 비율이 오르고 기본 블록 비율이 줄어든다', () => {
    const ids = ['t-fire-a', 't-earth-c', 't-thunder-b'];
    const shares = [0, 1, 2, 3].map((n) => spawnRatesOf(paramsOf(build(...ids.slice(0, n)))).absorbedShare);
    expect(shares[0]).toBe(0);
    for (let n = 1; n <= 3; n++) expect(shares[n]!).toBeGreaterThan(shares[n - 1]!);
  });

  // C.133 (GDD 80장 v5.166): 기본 블록 몫 = 0칸 100% · 1칸 45% · 2칸 25% · 3칸 15% (옛 44-2 표 60·45·35% × 0.75^칸)
  it('기본 블록 몫(초당 생성 기대치) = 0칸 100% · 1칸 45% · 2칸 25% · 3칸 15% (±5%p, basicShareBySlots)', () => {
    const ids = ['t-poison-c', 't-earth-a', 't-thunder-b'];
    const target = [1, 0.45, 0.25, 0.15];
    expect(BP.basicShareBySlots).toEqual([1, 0.45, 0.25, 0.15]);
    for (let n = 0; n <= 3; n++) {
      const basicShare = 1 - spawnRatesOf(paramsOf(build(...ids.slice(0, n)))).absorbedShare;
      expect(Math.abs(basicShare - target[n]!), `${n}칸 기본 몫 ${(basicShare * 100).toFixed(0)}%`).toBeLessThanOrEqual(0.05);
    }
    // 흡수 블록 총량은 칸이 늘수록 는다 (C.97 처럼 몸이 강해진다 — 44-3)
    const totals = [1, 2, 3].map((n) => { const r = spawnRatesOf(paramsOf(build(...ids.slice(0, n)))); return r.absorbed + r.basic; });
    for (let i = 1; i < totals.length; i++) expect(totals[i]!).toBeGreaterThan(totals[i - 1]!);
  });

  it('흡수 특성 타이머는 2칸부터 칸당 absorbedSlowdownPerSlot 만큼 늘어난다 (흡수 블록 총량이 완만하게)', () => {
    const CX = BALANCE.provisional.combat;
    const ids = ['t-poison-c', 't-earth-a', 't-thunder-b'];
    for (let n = 1; n <= 3; n++) {
      const p = paramsOf(build(...ids.slice(0, n)));
      for (const sk of p.skills) expect(spawnSecondsOf(p, sk)).toBeCloseTo(CX.blockSpawnSeconds * (1 + BP.absorbedSlowdownPerSlot * (n - 1)));
    }
    // 블록 가속 배율은 흡수·기본 타이머를 모두 나눈다
    const fast = paramsOf({ ...build('t-poison-c', 't-earth-a'), blockSpawnMultiplier: 2 });
    expect(spawnSecondsOf(fast, fast.skills[0]!)).toBeCloseTo((CX.blockSpawnSeconds * (1 + BP.absorbedSlowdownPerSlot)) / 2);
  });

  // C.133 (GDD 80장 v5.166): 1칸 기본 몫 45% — "절반을 넘고"(C.97) 대신 몫 표 ±8%p 와 막기·회복 섞임을 지킨다
  it('독 탄 1칸 몸에서 실제로 나온 공격 블록 중 기본 공격이 약 45% (C.97 캡처 02 문제의 회귀 가드, C.174: 막기·회복 블록은 없다)', () => {
    const out = spawned(long(5, build('t-poison-c')), 400);
    const atk = out.filter((b) => b.traitId !== BASIC_GUARD_ID && b.traitId !== BASIC_HEAL_ID);
    const basic = atk.filter((b) => isBasicBlockId(b.traitId)).length / atk.length;
    expect(Math.abs(basic - 0.45)).toBeLessThanOrEqual(0.08);
    expect(out.length).toBe(atk.length);
  });
});

describe('막기·회복 = 블록 밖 버튼 (GDD 105장, C.174 — 옛 "새 몸에서도 막기·회복 블록이 나온다")', () => {
  it('블록 바에는 막기·회복 블록이 나오지 않는다', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const out = spawned(long(seed, build()), 200);
      expect(out.some((b) => b.traitId === BASIC_GUARD_ID || b.traitId === BASIC_HEAL_ID), `seed ${seed}`).toBe(false);
    }
  });

  it('버튼 세기 = basicRoleBlocks × 70% (C.136: 속성 막기·회복 특성은 삭제 — GDD 84장 7번)', () => {
    for (const role of ['guard', 'heal'] as const) expect(TRAITS.some((t) => t.kind === 'skill' && t.role === role)).toBe(false);
    const [, g, h] = basicSources(paramsOf(build()));
    expect(g!.role).toBe('guard');
    expect(g!.powerMultiplier).toBe(BP.basicGuardRatio);
    expect(h!.role).toBe('heal');
    expect(h!.powerMultiplier).toBe(BP.basicHealRatio);
  });

  it('막기 버튼을 누르면 막기 상태가 되고, 회복 버튼은 체력을 채운다', () => {
    const s = createCombat(1, { enemy: getEnemy('test-a'), params: build() });
    s.spawnTimer = 1e9;
    s.charges.guard = 1;
    s.charges.heal = 1;
    s.player.hp = s.player.maxHp * 0.5;
    const hp = s.player.hp;
    step(s, { type: 'guard' });
    expect(s.guard.ticks).toBeGreaterThan(0);
    while (s.guard.ticks > 0) step(s);
    step(s, { type: 'heal' });
    expect(s.player.hp).toBeGreaterThan(hp);
  });
});

describe('성향 특성 보정 (GDD 44장 4번, 44-1)', () => {
  const withDisp = (d: CombatParams['dispositions'], ids: string[] = []) => paramsOf({ ...build(...ids), dispositions: d });
  const basicAtk = (p: CombatParams) => chance(p, (id) => id === BASIC_SKILL_ID);
  const guard = (p: CombatParams) => chance(p, (id) => id === BASIC_GUARD_ID);
  const heal = (p: CombatParams) => chance(p, (id) => id === BASIC_HEAL_ID);

  it('방어 → 막기 충전 ×1.8, 체력 → 회복 충전 ×1.8, 영력 → 둘 다 ×1.4 (힘·지능은 공격 배율이라 그만큼 상대적으로 느리다, C.174 GDD 105장: 옛 출현 몫 보정을 충전 속도로)', () => {
    /** 20초 동안 쌓인 칸 (상한 없이 세려고 max 를 크게) */
    const charged = (d: CombatParams['dispositions']) => {
      const s = createCombat(1, { enemy: getEnemy('test-a'), params: { ...build(), dispositions: d, roleCharges: { ...BALANCE.provisional.combat.roleCharges, max: 99, guardStart: 0, healStart: 0 }, timeLimitSeconds: 1e9 } });
      s.player.hp = s.player.maxHp = 1e12;
      s.enemy.hp = s.enemy.maxHp = 1e12;
      for (let i = 0; i < 200; i++) step(s);
      return { g: s.charges.guard, h: s.charges.heal };
    };
    const base = charged([]);
    expect(charged(['def']).g).toBeGreaterThan(base.g);
    expect(charged(['def']).h).toBe(base.h);
    expect(charged(['hp']).h).toBeGreaterThan(base.h);
    expect(charged(['spr']).g).toBeGreaterThan(base.g);
    expect(charged(['spr']).h).toBeGreaterThan(base.h);
    expect(charged(['atk']).g).toBeLessThan(base.g);
  });

  it('속도 → 흡수 특성 타이머가 빨라져 흡수 블록 비율이 오른다 (0칸이면 변화 없음)', () => {
    const CX = BALANCE.provisional.combat;
    const p = withDisp(['spd'], ['t-poison-c']);
    expect(spawnSecondsOf(p, p.skills[0]!)).toBeCloseTo(CX.blockSpawnSeconds / BP.temperament.spd!.absorbedSpawn!);
    expect(spawnRatesOf(p).absorbedShare).toBeGreaterThan(spawnRatesOf(withDisp([], ['t-poison-c'])).absorbedShare);
    expect(spawnRatesOf(withDisp(['spd'])).absorbedShare).toBe(0);
  });

  it('진화 상태의 성향이 전투 파라미터로 들어간다', () => {
    const p = build();
    applyEvolutionToParams(p, { ...newEvolution(), ability: 'def' }, FACTION);
    expect(p.dispositions).toEqual(['def']);
  });
});

describe('흡수 조건 "장착 기술 없음" 뜻 유지 (GDD 44장 6번)', () => {
  it('기본 블록 5종이 나와도 params.skills 는 장착 흡수 특성만이다', () => {
    expect(paramsOf(build()).skills).toEqual([]);
    expect(paramsOf(build('t-poison-c')).skills.map((x) => x.id)).toEqual(['t-poison-c']);
  });
});
