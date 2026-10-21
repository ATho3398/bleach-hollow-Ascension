// 블록 풀 (GDD 44장 → 44-1 B안, C.97): 기본 블록 5종은 늘 나오고(별도 타이머, 가중 추첨) 흡수 블록은 특성마다 타이머로 더해진다. 흡수 칸·성향 보정으로 비율이 바뀐다
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { getEnemy } from '../src/data/enemies';
import { getFaction } from '../src/data/factions';
import { TRAITS } from '../src/data/traits';
import { buildCombatParams, gainTrait, newBuild } from '../src/engine/absorb';
import {
  basicSpawnSecondsOf, BASIC_GUARD_ID, BASIC_HEAL_ID, BASIC_SKILL_ID, blockPoolOf, createCombat, isBasicBlockId, spawnRatesOf, spawnSecondsOf, step, type CombatParams, type CombatState,
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
const BASIC_TOTAL = W.attack * 3 + W.guard + W.heal;

/** 블록 n 개가 나올 때까지 돌린다 (쓰지 않으니 바가 차면 비우고 센다) */
function spawned(s: CombatState, n: number): { traitId: string | null; family: string | null }[] {
  const out: { traitId: string | null; family: string | null }[] = [];
  s.player.hp = s.player.maxHp = 1e12;
  s.enemy.hp = s.enemy.maxHp = 1e12;
  s.voidTimer = 1e9;
  while (out.length < n && s.status === 'playing') {
    step(s);
    for (const b of s.tray) if (b.kind === 'skill') out.push({ traitId: b.traitId, family: b.family ?? null });
    s.tray = [];
  }
  return out;
}

describe('기본 블록 풀 (GDD 44장 2번)', () => {
  it('기본 5종 가중: 공격 3계열 각 10 · 막기 7 · 회복 7 (흡수 칸과 상관없다)', () => {
    for (const p of [paramsOf(build()), paramsOf(build('t-poison-c'))]) {
      const fams = getFaction(FACTION).families.map((f) => f.id);
      expect(blockPoolOf(p)).toHaveLength(5);
      for (const f of fams) expect(chance(p, (id, fam) => id === BASIC_SKILL_ID && fam === f)).toBeCloseTo(W.attack / BASIC_TOTAL);
      expect(chance(p, (id) => id === BASIC_GUARD_ID)).toBeCloseTo(W.guard / BASIC_TOTAL);
      expect(chance(p, (id) => id === BASIC_HEAL_ID)).toBeCloseTo(W.heal / BASIC_TOTAL);
      expect(sum(p)).toBeCloseTo(1);
    }
  });

  it('흡수 0칸이면 기본 블록만 나온다', () => {
    const out = spawned(long(2, build()), 300);
    expect(out.every((b) => isBasicBlockId(b.traitId))).toBe(true);
  });

  it('독 탄 1칸: 독 탄이 특성 타이머로 나오고 기본 5종도 함께 나온다 (모든 블록 + 독 탄)', () => {
    const p = build('t-poison-c');
    const r = spawnRatesOf(paramsOf(p));
    const out = spawned(long(4, p), 2000);
    const rate = (pred: (b: { traitId: string | null }) => boolean) => out.filter(pred).length / out.length;
    expect(rate((b) => b.traitId === 't-poison-c')).toBeGreaterThan(r.absorbedShare - 0.05);
    expect(rate((b) => b.traitId === 't-poison-c')).toBeLessThan(r.absorbedShare + 0.05);
    for (const id of [BASIC_GUARD_ID, BASIC_HEAL_ID]) expect(out.some((b) => b.traitId === id)).toBe(true);
    expect(new Set(out.filter((b) => b.traitId === BASIC_SKILL_ID).map((b) => b.family))).toEqual(new Set(['family-a', 'family-b', 'family-c']));
  });
});

describe('생성 간격과 흡수 칸 (GDD 44-1 B안)', () => {
  it('흡수 특성은 특성마다 blockSpawnSeconds, 기본 타이머 = basicSpawnSeconds × (1 + basicSlowdownPerSlot × 칸)', () => {
    const CX = BALANCE.provisional.combat;
    const one = paramsOf(build('t-poison-c'));
    expect(spawnSecondsOf(one, one.skills[0]!)).toBeCloseTo(CX.blockSpawnSeconds);
    for (let n = 0; n <= 3; n++) {
      const p = paramsOf(build(...['t-fire-a', 't-earth-guard', 't-thunder-heal'].slice(0, n)));
      expect(basicSpawnSecondsOf(p)).toBeCloseTo(BP.basicSpawnSeconds * (1 + BP.basicSlowdownPerSlot * n));
    }
    expect(basicSpawnSecondsOf(paramsOf({ ...build(), blockSpawnMultiplier: 2 }))).toBeCloseTo(BP.basicSpawnSeconds / 2);
  });

  it('흡수 칸이 늘수록 흡수 블록 비율이 오르고 기본 블록 비율이 줄어든다', () => {
    const ids = ['t-fire-a', 't-earth-guard', 't-thunder-heal'];
    const shares = [0, 1, 2, 3].map((n) => spawnRatesOf(paramsOf(build(...ids.slice(0, n)))).absorbedShare);
    expect(shares[0]).toBe(0);
    for (let n = 1; n <= 3; n++) expect(shares[n]!).toBeGreaterThan(shares[n - 1]!);
  });
});

describe('새 몸(흡수 0칸)에서도 막기·회복 블록이 나온다 (사용자 질문 "방어랑 회복 블록은 하나도 안나오는듯?")', () => {
  it('전투 초반 블록 40개 안에 기본 막기·기본 회복이 모두 있다', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const out = spawned(long(seed, build()), 40);
      expect(out.some((b) => b.traitId === BASIC_GUARD_ID), `seed ${seed}`).toBe(true);
      expect(out.some((b) => b.traitId === BASIC_HEAL_ID), `seed ${seed}`).toBe(true);
    }
  });

  it('기본 막기·회복 세기 = 같은 역할 흡수 특성 기본값 × 70% (특성 데이터와 같은 기본값)', () => {
    for (const role of ['guard', 'heal'] as const) {
      const vals = new Set(TRAITS.filter((t) => t.kind === 'skill' && t.role === role && !t.rare).map((t) => t.powerInAttacks));
      expect([...vals]).toEqual([BP.basicRoleBlocks[role].powerInAttacks]);
    }
    const p = paramsOf(build());
    const g = blockPoolOf(p).find((e) => e.source.id === BASIC_GUARD_ID)!.source;
    const h = blockPoolOf(p).find((e) => e.source.id === BASIC_HEAL_ID)!.source;
    expect(g.role).toBe('guard');
    expect(g.powerMultiplier).toBe(BP.basicGuardRatio);
    expect(h.role).toBe('heal');
    expect(h.powerMultiplier).toBe(BP.basicHealRatio);
  });

  it('기본 막기 블록을 쓰면 막기 상태가 되고, 기본 회복 블록은 체력을 채운다', () => {
    const s = createCombat(1, { enemy: getEnemy('test-a'), params: build() });
    s.spawnTimers = [1e9];
    s.tray = [{ uid: 1, kind: 'skill', traitId: BASIC_GUARD_ID }, { uid: 2, kind: 'skill', traitId: BASIC_HEAL_ID }];
    s.player.hp = s.player.maxHp * 0.5;
    const hp = s.player.hp;
    step(s, { type: 'use', cell: 0 });
    expect(s.guard.ticks).toBeGreaterThan(0);
    step(s, { type: 'use', cell: 0 });
    expect(s.player.hp).toBeGreaterThan(hp);
  });
});

describe('성향 특성 보정 (GDD 44장 4번, 44-1)', () => {
  const withDisp = (d: CombatParams['dispositions'], ids: string[] = []) => paramsOf({ ...build(...ids), dispositions: d });
  const basicAtk = (p: CombatParams) => chance(p, (id) => id === BASIC_SKILL_ID);
  const guard = (p: CombatParams) => chance(p, (id) => id === BASIC_GUARD_ID);
  const heal = (p: CombatParams) => chance(p, (id) => id === BASIC_HEAL_ID);

  it('힘·지능 → 기본 공격 ×1.4, 방어 → 막기 ×1.8, 체력 → 회복 ×1.8, 영력 → 막기·회복 ×1.4 (기본 블록 안에서 가중)', () => {
    const ratio = (p: CombatParams) => ({ a: basicAtk(p) / guard(p), g: guard(p) / heal(p) });
    const base = ratio(withDisp([]));
    for (const d of ['atk', 'int'] as const) expect(ratio(withDisp([d])).a).toBeCloseTo(base.a * 1.4);
    expect(ratio(withDisp(['def'])).g).toBeCloseTo(base.g * 1.8);
    expect(ratio(withDisp(['hp'])).g).toBeCloseTo(base.g / 1.8);
    const spr = withDisp(['spr']);
    expect(guard(spr) / heal(spr)).toBeCloseTo(W.guard / W.heal);
    expect(ratio(spr).a).toBeCloseTo(base.a / 1.4);
    for (const d of ['atk', 'def', 'hp', 'spr'] as const) expect(sum(withDisp([d]))).toBeCloseTo(1);
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
