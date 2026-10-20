// 블록 풀 (GDD 44장, C.97): 기본 블록 5종은 늘 나오고 흡수 블록은 더해진다. 흡수 몫·성향 보정으로 비율이 바뀐다
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { getEnemy } from '../src/data/enemies';
import { getFaction } from '../src/data/factions';
import { TRAITS } from '../src/data/traits';
import { buildCombatParams, gainTrait, newBuild } from '../src/engine/absorb';
import {
  absorbedShareOf, BASIC_GUARD_ID, BASIC_HEAL_ID, BASIC_SKILL_ID, blockPoolOf, createCombat, isBasicBlockId, spawnSecondsOf, step, type CombatParams, type CombatState,
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

describe('블록 풀 비율 (GDD 44장 2·3번)', () => {
  it('흡수 0칸 = 기본 5종만: 공격 3계열 각 10 · 막기 7 · 회복 7 의 가중 비율', () => {
    const p = paramsOf(build());
    expect(absorbedShareOf(p)).toBe(0);
    const fams = getFaction(FACTION).families.map((f) => f.id);
    expect(blockPoolOf(p)).toHaveLength(5);
    for (const f of fams) expect(chance(p, (id, fam) => id === BASIC_SKILL_ID && fam === f)).toBeCloseTo(W.attack / BASIC_TOTAL);
    expect(chance(p, (id) => id === BASIC_GUARD_ID)).toBeCloseTo(W.guard / BASIC_TOTAL);
    expect(chance(p, (id) => id === BASIC_HEAL_ID)).toBeCloseTo(W.heal / BASIC_TOTAL);
    expect(sum(p)).toBeCloseTo(1);
  });

  it('독 탄 1칸: 독 탄 35% + 기본 5종이 나머지 65% 를 가중 비율로 (모든 블록이 나오고 독 탄이 더해진다)', () => {
    const p = paramsOf(build('t-poison-c'));
    expect(chance(p, (id) => id === 't-poison-c')).toBeCloseTo(0.35);
    expect(chance(p, (id, f) => id === BASIC_SKILL_ID && f === 'family-a')).toBeCloseTo(0.65 * W.attack / BASIC_TOTAL);
    expect(chance(p, (id) => id === BASIC_GUARD_ID)).toBeCloseTo(0.65 * W.guard / BASIC_TOTAL);
    expect(sum(p)).toBeCloseTo(1);
  });

  it('흡수 몫 = 장착 칸 0/1/2/3 → 0/35/50/65%, 장착 특성끼리 균등 (계열이 다를 때)', () => {
    const ids = ['t-fire-a', 't-earth-guard', 't-thunder-heal'];
    for (let n = 1; n <= 3; n++) {
      const p = paramsOf(build(...ids.slice(0, n)));
      expect(absorbedShareOf(p)).toBeCloseTo(BP.absorbedShareBySlots[n]!);
      for (const id of ids.slice(0, n)) expect(chance(p, (x) => x === id)).toBeCloseTo(BP.absorbedShareBySlots[n]! / n);
      expect(chance(p, (x) => isBasicBlockId(x))).toBeCloseTo(1 - BP.absorbedShareBySlots[n]!);
    }
  });

  it('실제 생성도 풀 비율을 따른다 (독 탄 1칸, 블록 3000개)', () => {
    const s = long(3, build('t-poison-c'));
    expect(spawned(s, 3000).length).toBeGreaterThanOrEqual(3000);
    const out = spawned(long(4, build('t-poison-c')), 3000);
    const rate = (pred: (b: { traitId: string | null }) => boolean) => out.filter(pred).length / out.length;
    expect(rate((b) => b.traitId === 't-poison-c')).toBeGreaterThan(0.31);
    expect(rate((b) => b.traitId === 't-poison-c')).toBeLessThan(0.39);
    expect(rate((b) => b.traitId === BASIC_GUARD_ID)).toBeGreaterThan(0.07);
    expect(rate((b) => b.traitId === BASIC_HEAL_ID)).toBeGreaterThan(0.07);
    expect(new Set(out.filter((b) => b.traitId === BASIC_SKILL_ID).map((b) => (b as { family: string | null }).family))).toEqual(new Set(['family-a', 'family-b', 'family-c']));
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

describe('성향 특성 보정 (GDD 44장 4번)', () => {
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
    for (const d of ['atk', 'def', 'hp', 'spr'] as const) expect(sum(withDisp([d], ['t-poison-c']))).toBeCloseTo(1);
  });

  it('속도 → 흡수 몫 +10%p (상한 80%), 0칸이면 몫 0 그대로', () => {
    expect(absorbedShareOf(withDisp(['spd']))).toBe(0);
    expect(absorbedShareOf(withDisp(['spd'], ['t-poison-c']))).toBeCloseTo(0.45);
    expect(absorbedShareOf(withDisp(['spd'], ['t-fire-a', 't-earth-guard', 't-thunder-heal']))).toBeCloseTo(0.75);
    expect(absorbedShareOf(paramsOf({ ...build('t-fire-a', 't-earth-guard', 't-thunder-heal'), dispositions: ['spd', 'spd'] }))).toBeCloseTo(BP.absorbedShareMax);
  });

  it('진화 상태의 성향이 전투 파라미터로 들어간다', () => {
    const p = build();
    applyEvolutionToParams(p, { ...newEvolution(), ability: 'def' }, FACTION);
    expect(p.dispositions).toEqual(['def']);
  });
});

describe('생성 간격 (GDD 44장 1번, 44-1)', () => {
  it('타이머 하나: 0·1칸은 spawnSeconds, 2칸째부터 칸마다 spawnHastePerSlot 만큼 빨라지고 블록 가속 배율로 나눈다', () => {
    const sec = (p: Partial<CombatParams>) => spawnSecondsOf(paramsOf(p));
    expect(sec(build())).toBeCloseTo(BP.spawnSeconds);
    expect(sec(build('t-poison-c'))).toBeCloseTo(BP.spawnSeconds);
    expect(sec(build('t-fire-a', 't-earth-guard'))).toBeCloseTo(BP.spawnSeconds / (1 + BP.spawnHastePerSlot));
    expect(sec(build('t-fire-a', 't-earth-guard', 't-thunder-heal'))).toBeCloseTo(BP.spawnSeconds / (1 + BP.spawnHastePerSlot * 2));
    expect(sec({ ...build(), blockSpawnMultiplier: 2 })).toBeCloseTo(BP.spawnSeconds / 2);
  });
});

describe('흡수 조건 "장착 기술 없음" 뜻 유지 (GDD 44장 6번)', () => {
  it('기본 블록 5종이 나와도 params.skills 는 장착 흡수 특성만이다', () => {
    expect(paramsOf(build()).skills).toEqual([]);
    expect(paramsOf(build('t-poison-c')).skills.map((x) => x.id)).toEqual(['t-poison-c']);
  });
});
