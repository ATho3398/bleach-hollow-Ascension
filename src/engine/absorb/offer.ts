// 흡수 제안: 전투 승리 뒤 흡수 가능 여부와 특성 후보 (GDD 4장, 4-1). 시드 고정 가능(rng 를 받는다).

import { BALANCE } from '../../config/balance';
import { TRAITS } from '../../data/traits';
import type { EnemyDef } from '../../data/schema';
import { nextInt, type Rng } from '../battle/rng';
import type { BuildState } from './build';

const AX = BALANCE.provisional.absorb;

/** 전투에서 모은 흡수 게이지가 임계값 이상이면 승리 후 흡수할 수 있다 (GDD 4-1) */
export function canAbsorb(absorbGained: number): boolean {
  return absorbGained >= AX.threshold;
}

export interface AbsorbOffer {
  enemyId: string;
  lineageId: string;
  /** 희귀 개체: 흡수 화면에서 미리 표시되고 희귀 특성이 확정 후보로 나온다 */
  rare: boolean;
  elite: boolean;
  /** 적 강함(hpInMatches, 바퀴 강화 포함): 리스크 상승량의 기준 */
  strength: number;
  /** 특성 후보(1~2개). 비어 있으면 얻을 특성이 없다(흡수 효과만) */
  candidates: string[];
  absorbGained: number;
}

function pick<T>(rng: Rng, list: T[]): T {
  return list[nextInt(rng, list.length)]!;
}

/** 후보 만들기: 그 계통의 아직 없는 특성 중에서. 희귀 개체는 희귀 특성이 첫 후보로 확정, 일반 후보는 희귀 아닌 특성에서 무작위 */
export function buildOffer(rng: Rng, enemy: EnemyDef, build: BuildState, absorbGained: number): AbsorbOffer {
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
  return { enemyId: enemy.id, lineageId: enemy.lineageId, rare, elite, strength: enemy.hpInMatches, candidates, absorbGained };
}
