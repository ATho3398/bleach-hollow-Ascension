// 흡수 제안: 전투 승리 뒤 흡수 가능 여부와 특성 후보 (GDD 4장, 4-1). 시드 고정 가능(rng 를 받는다).

import { BALANCE } from '../../config/balance';
import { TRAITS, getTrait } from '../../data/traits';
import { SPECIAL_ELEMENT_IDS } from '../../data/elements';
import type { EnemyDef, StatId, TraitDef } from '../../data/schema';
import type { CombatState } from '../combat/combat';
import { nextFloat, nextInt, type Rng } from '../rng';
import type { BuildState } from './build';

const AX = BALANCE.provisional.absorb;

/** 흡수 가능 이유: 마무리 일격이 상성 우위 스킬 / 상성 우위 체인3 N회 이상 / 첫 흡수 보장 — 장착 skill 특성 없음 (GDD 3-5 v0.7 → 20-2, 임시 수치).
 *  약점 속성이 없는 적(노멀·특수)은 아무 스킬 블록이 우위다.
 *  'story-objective' = 스토리 흡수 목표 화에서 목표 등급 적을 이겨 조건 없이 열림 (GDD 42장 1번, 엔진이 붙인다) */
export type AbsorbReason = 'weakness-finisher' | 'weakness-chain3' | 'first-absorb' | 'story-objective' | 'tutorial';

/** 전투 결과에서 흡수 조건 판정에 쓰는 부분 */
export type AbsorbInput = Pick<CombatState, 'status' | 'finisher' | 'chain3Count' | 'weakChain3Count'> & {
  params: { skills: readonly unknown[] };
};

export function absorbReasons(c: AbsorbInput): AbsorbReason[] {
  if (c.status !== 'won') return [];
  const out: AbsorbReason[] = [];
  // 우위 마무리 (GDD 20-2): 엔진이 마무리 일격의 우위 여부(weak)를 정해 준다
  if ((c.finisher?.kind === 'skill' || c.finisher?.kind === 'liberation') && c.finisher.weak === true) out.push('weakness-finisher');
  if (c.weakChain3Count >= AX.weakChain3ForAbsorb) out.push('weakness-chain3');
  // 첫 흡수 보장: 장착한 skill 특성이 하나도 없으면 조건 없이 흡수할 수 있다
  if (c.params.skills.length === 0) out.push('first-absorb');
  return out;
}

/** 이긴 전투가 흡수 조건을 채웠는가 (옛 흡수 게이지 임계값은 폐기, C.6; 체인3 계통 무관 2회는 폐기, C.7) */
export function canAbsorb(c: AbsorbInput): boolean {
  return absorbReasons(c).length > 0;
}

export interface AbsorbOffer {
  enemyId: string;
  /** 흡수한 적의 속성 (진화 히든 판정의 단계 속성 분포에 쌓인다) */
  element: string;
  /** 흡수하면 오르는 노력치 (적 데이터 ev, GDD 20-4) */
  ev: Partial<Record<StatId, number>>;
  /** 희귀 개체: 흡수 화면에서 미리 표시되고 희귀 특성이 확정 후보로 나온다 */
  rare: boolean;
  elite: boolean;
  /** 적 강함(hpInAttacks, 바퀴 강화 포함): 리스크 상승량의 기준 */
  strength: number;
  /** 특성 후보(1~2개). 비어 있으면 얻을 특성이 없다(흡수 효과만) */
  candidates: string[];
  /** 흡수 조건을 채운 이유 (화면 문구용) */
  reasons: AbsorbReason[];
  /** 그 전투의 체인3 횟수와 마무리 일격 속성 (화면 문구용) */
  chain3Count: number;
  weakChain3Count: number;
  finisherElement: string | null;
  /** 다시 뽑기권으로 후보를 다시 뽑았나 (GDD 25-9, 흡수 1번에 1장) */
  rerolled?: boolean;
  /** 특수 속성(혈·독·허) 특성이 이번 후보 풀에 들었나 (GDD 49-7 ①, C.106). 없으면 숨김 */
  specialOpen?: boolean;
  /** 숨김이 풀린 까닭 (런 로그용, GDD 9장) */
  specialGates?: SpecialGate[];
}

/** 특수 속성 특성 숨김이 풀리는 까닭 (GDD 49-7 ①): 강적 / 보스 / 바퀴 변이(공허의 밤) / 원정 난이도 ★minDifficulty 이상 */
export type SpecialGate = 'elite' | 'boss' | 'mutation' | 'difficulty';

/** 숨김이 풀릴 확률 (여럿이면 가장 큰 값)과 까닭. mutationChance = 지금 바퀴 변이의 specialTraitChance */
export function specialTraitChance(o: { elite: boolean; boss: boolean; difficulty: number; mutationChance?: number }): { chance: number; gates: SpecialGate[] } {
  const S = AX.specialTraits;
  const rows: [SpecialGate, number][] = [];
  if (o.elite) rows.push(['elite', S.elite]);
  if (o.boss) rows.push(['boss', S.boss]);
  if ((o.mutationChance ?? 0) > 0) rows.push(['mutation', o.mutationChance!]);
  if (o.difficulty >= S.minDifficulty) rows.push(['difficulty', S.difficulty]);
  return { chance: Math.max(0, ...rows.map((r) => r[1])), gates: rows.map((r) => r[0]) };
}

/** 특수 속성(혈·독·허) 특성인가 */
export function isSpecialTrait(t: Pick<TraitDef, 'element'>): boolean {
  return SPECIAL_ELEMENT_IDS.includes(t.element);
}

function pick<T>(rng: Rng, list: T[]): T {
  return list[nextInt(rng, list.length)]!;
}

/** 공격 skill 특성의 계열 (아니면 null) */
export function attackFamilyOf(id: string): string | null {
  const t = getTrait(id);
  return t.kind === 'skill' && t.role === 'attack' ? (t.family ?? null) : null;
}

/** 장착한 공격 특성의 계열 모음 (GDD 18-8 ③) */
export function equippedAttackFamilies(build: BuildState): Set<string> {
  const out = new Set<string>();
  for (const id of build.slots) {
    const f = id ? attackFamilyOf(id) : null;
    if (f) out.add(f);
  }
  return out;
}

/** 후보 만들기 (C.47): 그 적 속성의 아직 없는 특성 중에서. 희귀 개체는 희귀 특성이 첫 후보로 확정, 일반 후보는 희귀 아닌 특성에서 무작위.
 *  후보가 2개 이상이면 둘째부터는 다른 속성 특성에서 나온다(otherElementCandidate) — 원소 상성 순환(물 → 불 → 흙 → 뇌 → 물)에서 처음 원소를 얻는 길이 막히지 않게 */
/** extraCandidates: 원정 시너지·바퀴 변이의 흡수 후보 +n (GDD 25-5). bossTrait: 보스를 이긴 흡수 화면의 보스 특성 (GDD 25-3, 아직 없으면 첫 후보로 확정).
 *  보스 특성(boss: true)은 그 밖의 후보에는 나오지 않는다 */
/** candidateMult: 기본 후보 수 배율 (포식자 둥지 사냥꾼 승리, C.124 GDD 65장) */
/** special: 특수 속성 특성 숨김 (GDD 49-7 ①) — chance 로 이번 풀에 넣을지 굴린다(0 이면 숨김, 1 이면 늘. 그 사이만 rng 를 쓴다). 없으면 숨김 */
export function buildOffer(rng: Rng, enemy: EnemyDef, build: BuildState, combat: AbsorbInput, extraCandidates = 0, bossTrait: string | null = null, special: { chance: number; gates: SpecialGate[] } = { chance: 0, gates: [] }, candidateMult = 1): AbsorbOffer {
  const elite = enemy.class === 'elite';
  const rare = enemy.rare === true;
  const specialOpen = special.chance >= 1 || (special.chance > 0 && nextFloat(rng) < special.chance);
  const free = TRAITS.filter((t) => !t.boss && !build.owned.includes(t.id) && (specialOpen || !isSpecialTrait(t)));
  const pool = free.filter((t) => t.element === enemy.element);
  const candidates: string[] = [];
  const bossAdded = bossTrait !== null && !build.owned.includes(bossTrait);
  if (bossAdded) candidates.push(bossTrait);
  if (rare) {
    const rarePool = pool.filter((t) => t.rare);
    if (rarePool.length > 0) candidates.push(pick(rng, rarePool).id);
  }
  const own = pool.filter((t) => !t.rare && !candidates.includes(t.id));
  const other = free.filter((t) => !t.rare && t.element !== enemy.element);
  const want = (elite ? AX.candidatesElite : 1 + nextInt(rng, AX.candidatesNormalMax)) * candidateMult + extraCandidates + (bossAdded ? 1 : 0);
  while (candidates.length < want) {
    const list = (AX.otherElementCandidate && candidates.length > 0 && other.length > 0) || own.length === 0 ? other : own;
    if (list.length === 0) break;
    const t = pick(rng, list);
    candidates.push(t.id);
    list.splice(list.indexOf(t), 1);
  }
  mixAttackFamilies(rng, candidates, free, build);
  return {
    enemyId: enemy.id,
    element: enemy.element,
    ev: { ...enemy.ev },
    rare,
    elite,
    strength: enemy.hpInAttacks,
    candidates,
    reasons: absorbReasons(combat),
    chain3Count: combat.chain3Count,
    weakChain3Count: combat.weakChain3Count,
    finisherElement: combat.finisher?.element ?? null,
    ...(specialOpen ? { specialOpen: true, specialGates: [...special.gates] } : {}),
  };
}

/**
 * 다시 뽑기 (GDD 25-9 다시 뽑기권, C.60): 확정 후보(보스 특성·희귀 개체의 희귀 특성)는 그대로 두고 나머지 후보를 같은 수만큼 새로 뽑는다.
 * 지금 후보와 겹치지 않게 뽑고(모자라면 겹침 허용), 첫 후보는 적 속성 → 둘째부터 다른 속성 규칙(otherElementCandidate)·공격 계열 섞임은 buildOffer 와 같다
 */
export function rerollCandidates(rng: Rng, offer: Pick<AbsorbOffer, 'candidates' | 'element' | 'specialOpen'>, build: BuildState, bossTrait: string | null = null): string[] {
  const fixed = offer.candidates.filter((id) => id === bossTrait || getTrait(id).rare === true);
  const want = offer.candidates.length - fixed.length;
  const hide = (t: TraitDef) => offer.specialOpen !== true && isSpecialTrait(t);
  const free = TRAITS.filter((t) => !t.boss && !t.rare && !build.owned.includes(t.id) && !fixed.includes(t.id) && !hide(t));
  const fresh = free.filter((t) => !offer.candidates.includes(t.id));
  const pool = fresh.length >= want ? fresh : free;
  const own = pool.filter((t) => t.element === offer.element);
  const other = pool.filter((t) => t.element !== offer.element);
  const out = [...fixed];
  for (let n = 0; n < want; n++) {
    const list = (AX.otherElementCandidate && out.length > 0 && other.length > 0) || own.length === 0 ? other : own;
    if (list.length === 0) break;
    const t = pick(rng, list);
    out.push(t.id);
    list.splice(list.indexOf(t), 1);
  }
  mixAttackFamilies(rng, out, TRAITS.filter((t) => !t.boss && !build.owned.includes(t.id) && !hide(t)), build);
  return out;
}

/**
 * 공격 계열 섞임 (GDD 18-8 ③, C.41, 임시): 한 원정에서 공격 계열이 1가지로만 보이던 문제(옛 데이터는 한 계통에 공격 특성이 0~1개였다)를 막는다.
 * 장착한 공격 특성의 계열이 attackFamilyGuarantee 가지 미만이면, 후보에 "장착하지 않은 계열의 공격 특성"이 없을 때 하나를 끼워 넣는다
 * (후보가 2개 이상이면 희귀가 아닌 마지막 후보를 바꾸고, 하나뿐이면 그것을 바꾼다). 첫 흡수(장착 skill 특성 없음)는 서로 다른 계열 공격 후보 2개를 낸다.
 * 맞는 특성이 없으면 아무것도 바꾸지 않는다. pool 은 아직 없는 특성 전체(C.47: 속성 무관)다.
 */
function mixAttackFamilies(rng: Rng, candidates: string[], pool: TraitDef[], build: BuildState): void {
  const equipped = equippedAttackFamilies(build);
  if (equipped.size >= AX.attackFamilyGuarantee) return;
  const isNewAttack = (id: string) => {
    const f = attackFamilyOf(id);
    return f !== null && !equipped.has(f);
  };
  const fresh = (): TraitDef[] => pool.filter((t) => !t.rare && !candidates.includes(t.id) && isNewAttack(t.id));
  if (!candidates.some(isNewAttack)) {
    const list = fresh();
    if (list.length > 0) {
      const t = pick(rng, list);
      const at = candidates.map((id, i) => ({ id, i })).filter((c) => !getTrait(c.id).rare).map((c) => c.i).pop();
      if (at === undefined) candidates.push(t.id);
      else candidates[at] = t.id;
    }
  }
  const firstAbsorb = !build.slots.some((id) => id && getTrait(id).kind === 'skill');
  if (firstAbsorb) {
    const have = new Set(candidates.map(attackFamilyOf).filter((f): f is string => f !== null));
    const list = fresh().filter((t) => !have.has(t.family!));
    if (have.size < 2 && list.length > 0) {
      const t = pick(rng, list);
      // 공격이 아닌 희귀 아닌 후보가 있으면 그것을 바꾸고, 없으면 같은 계열이 겹친 뒤쪽 후보를 바꾸고(C.47: 둘째 후보가 다른 속성에서 같은 계열로 나올 수 있다), 그것도 없으면 후보가 1개일 때만 덧붙인다
      const rows = candidates.map((id, i) => ({ id, i, fam: attackFamilyOf(id), rare: getTrait(id).rare === true }));
      const nonAttack = rows.filter((c) => !c.rare && c.fam === null).map((c) => c.i).pop();
      const dup = rows.filter((c, k) => !c.rare && c.fam !== null && rows.slice(0, k).some((p) => p.fam === c.fam)).map((c) => c.i).pop();
      const at = nonAttack ?? dup;
      if (at !== undefined) candidates[at] = t.id;
      else if (candidates.length < 2) candidates.push(t.id);
    }
  }
}
