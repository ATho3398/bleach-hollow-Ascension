// 적 출현 풀 (GDD 14-5): 바퀴·출처(야생/타일 종류/조합)에 따라 풀이 달라진다. 종족 무관, 적 id 분기 없음.
// 사냥터(GDD 24-2)는 주 속성 적의 가중치만 키운다 (사냥터 id 분기 없음, 데이터의 elements·elementWeight).
import { ENEMIES, enemyPatternKind, POOL_CONFIG } from '../data/enemies';
import type { GroundDef } from '../data/grounds';
import type { EnemyDef } from '../data/schema';
import { nextFloat, type Rng } from './rng';

export interface PoolEntry {
  enemy: EnemyDef;
  weight: number;
}

/** 풀: 이 등급의 적 중 (패턴 종류의 minLap − 출처 보너스) ≤ 바퀴인 적. 가중치는 종류 가중치 (사냥터 주 속성이면 × elementWeight) */
export function enemyPool(cls: 'normal' | 'elite', lap: number, source = 'wild', ground?: Pick<GroundDef, 'elements' | 'elementWeight'>): PoolEntry[] {
  const bonus = POOL_CONFIG.sourceLapBonus[source] ?? 0;
  const out: PoolEntry[] = [];
  for (const enemy of ENEMIES) {
    if (enemy.class !== cls || enemy.testOnly) continue;
    const rule = POOL_CONFIG.kinds[enemyPatternKind(enemy)];
    if (rule.minLap - bonus <= lap) out.push({ enemy, weight: rule.weight * (ground?.elements.includes(enemy.element) ? ground.elementWeight : 1) });
  }
  return out;
}

/** 풀에서 가중치대로 하나 뽑는다 (rng 한 번 사용) */
export function pickFromPool(rng: Rng, pool: readonly PoolEntry[]): EnemyDef {
  const total = pool.reduce((a, e) => a + e.weight, 0);
  let x = nextFloat(rng) * total;
  for (const e of pool) {
    x -= e.weight;
    if (x < 0) return e.enemy;
  }
  return pool[pool.length - 1]!.enemy;
}
