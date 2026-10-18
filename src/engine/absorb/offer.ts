// 흡수 제안: 전투 승리 뒤 흡수 가능 여부와 특성 후보 (GDD 4장, 4-1). 시드 고정 가능(rng 를 받는다).

import { BALANCE } from '../../config/balance';
import { TRAITS, getTrait } from '../../data/traits';
import type { TraitDef } from '../../data/schema';
import type { EnemyDef } from '../../data/schema';
import type { CombatState } from '../combat/combat';
import { nextInt, type Rng } from '../rng';
import type { BuildState } from './build';

const AX = BALANCE.provisional.absorb;

/** 흡수 가능 이유: 마무리 일격이 약점 계열 스킬 / 약점 계열 스킬 블록의 체인3 1회 이상 / 첫 흡수 보장 — 장착 skill 특성 없음 (GDD 3-5 v0.7, 임시 수치) */
export type AbsorbReason = 'weakness-finisher' | 'weakness-chain3' | 'first-absorb';

/** 전투 결과에서 흡수 조건 판정에 쓰는 부분 */
export type AbsorbInput = Pick<CombatState, 'status' | 'finisher' | 'chain3Count' | 'weakChain3Count'> & {
  enemy: { def: { weaknessLineageId: string } };
  params: { skills: readonly unknown[] };
};

export function absorbReasons(c: AbsorbInput): AbsorbReason[] {
  if (c.status !== 'won') return [];
  const out: AbsorbReason[] = [];
  // 약점 계열 마무리 (GDD 17-3): 엔진이 마무리 일격의 약점 여부(weak)를 정해 준다. 옛 기록(weak 없음)은 계통 비교로 대신한다
  if (c.finisher?.kind === 'skill' && (c.finisher.weak ?? (c.finisher.lineageId !== null && c.finisher.lineageId === c.enemy.def.weaknessLineageId))) out.push('weakness-finisher');
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
  lineageId: string;
  /** 희귀 개체: 흡수 화면에서 미리 표시되고 희귀 특성이 확정 후보로 나온다 */
  rare: boolean;
  elite: boolean;
  /** 적 강함(hpInAttacks, 바퀴 강화 포함): 리스크 상승량의 기준 */
  strength: number;
  /** 특성 후보(1~2개). 비어 있으면 얻을 특성이 없다(흡수 효과만) */
  candidates: string[];
  /** 흡수 조건을 채운 이유 (화면 문구용) */
  reasons: AbsorbReason[];
  /** 그 전투의 체인3 횟수와 마무리 일격 계통 (화면 문구용) */
  chain3Count: number;
  weakChain3Count: number;
  finisherLineageId: string | null;
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

/** 후보 만들기: 그 계통의 아직 없는 특성 중에서. 희귀 개체는 희귀 특성이 첫 후보로 확정, 일반 후보는 희귀 아닌 특성에서 무작위 */
export function buildOffer(rng: Rng, enemy: EnemyDef, build: BuildState, combat: AbsorbInput): AbsorbOffer {
  const elite = enemy.class === 'elite';
  const rare = enemy.rare === true;
  const pool = TRAITS.filter((t) => t.lineageId === enemy.lineageId && !build.owned.includes(t.id));
  const candidates: string[] = [];
  if (rare) {
    const rarePool = pool.filter((t) => t.rare);
    if (rarePool.length > 0) candidates.push(pick(rng, rarePool).id);
  }
  const normal = pool.filter((t) => !t.rare && !candidates.includes(t.id));
  const want = elite ? AX.candidatesElite : 1 + nextInt(rng, AX.candidatesNormalMax);
  while (candidates.length < want && normal.length > 0) {
    const t = pick(rng, normal);
    candidates.push(t.id);
    normal.splice(normal.indexOf(t), 1);
  }
  mixAttackFamilies(rng, candidates, pool, build);
  return {
    enemyId: enemy.id,
    lineageId: enemy.lineageId,
    rare,
    elite,
    strength: enemy.hpInAttacks,
    candidates,
    reasons: absorbReasons(combat),
    chain3Count: combat.chain3Count,
    weakChain3Count: combat.weakChain3Count,
    finisherLineageId: combat.finisher?.lineageId ?? null,
  };
}

/**
 * 공격 계열 섞임 (GDD 18-8 ③, C.41, 임시): 한 원정에서 공격 계열이 1가지로만 보이던 문제(옛 데이터는 한 계통에 공격 특성이 0~1개였다)를 막는다.
 * 장착한 공격 특성의 계열이 attackFamilyGuarantee 가지 미만이면, 후보에 "장착하지 않은 계열의 공격 특성"이 없을 때 그 계통에서 하나를 끼워 넣는다
 * (후보가 2개 이상이면 희귀가 아닌 마지막 후보를 바꾸고, 하나뿐이면 그것을 바꾼다). 첫 흡수(장착 skill 특성 없음)는 서로 다른 계열 공격 후보 2개를 낸다.
 * 그 계통에 맞는 특성이 없으면 아무것도 바꾸지 않는다.
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
      // 공격이 아닌 희귀 아닌 후보가 있으면 그것을 바꾸고, 없으면 후보가 1개일 때만 덧붙인다
      const at = candidates.map((id, i) => ({ id, i })).filter((c) => !getTrait(c.id).rare && attackFamilyOf(c.id) === null).map((c) => c.i).pop();
      if (at !== undefined) candidates[at] = t.id;
      else if (candidates.length < 2) candidates.push(t.id);
    }
  }
}
