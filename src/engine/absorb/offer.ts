// 흡수 제안: 전투 승리 뒤 흡수 가능 여부와 특성 후보 (GDD 4장, 4-1). 시드 고정 가능(rng 를 받는다).

import { BALANCE } from '../../config/balance';
import { TRAITS } from '../../data/traits';
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
