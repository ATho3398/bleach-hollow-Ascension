// 적 출현 풀 (GDD 14-5): 바퀴·출처(야생/타일 종류/조합)에 따라 풀이 달라진다. 종족 무관, 적 id 분기 없음.
// 사냥터(GDD 24-2)는 주 속성 적의 가중치만 키운다 (사냥터 id 분기 없음, 데이터의 elements·elementWeight).
import { BALANCE } from '../config/balance';
import { ENEMIES, enemyPatternKind, POOL_CONFIG } from '../data/enemies';
import { SPECIAL_ELEMENT_IDS } from '../data/elements';
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

/** 특수 속성(혈·독·허) 적 등장 숨김이 풀리는 까닭 (GDD 75장, C.127 — 옛 49-7 ① 특성 숨김에서 옮김): 강적 / 보스 / 바퀴 변이(공허의 밤) / 원정 난이도 ★minDifficulty 이상 */
export type SpecialGate = 'elite' | 'boss' | 'mutation' | 'difficulty';

/** 특수 속성 적의 출현 배율(여럿이면 가장 큰 값)과 까닭. 0 이면 안 나온다. mutationChance = 지금 바퀴 변이의 specialEnemyChance (보스는 보스 데이터의 고정 적이라 풀을 거치지 않는다) */
export function specialEnemyGate(o: { elite: boolean; boss?: boolean; difficulty: number; mutationChance?: number }): { chance: number; gates: SpecialGate[] } {
  const S = BALANCE.provisional.specialEnemies;
  const rows: [SpecialGate, number][] = [];
  if (o.elite) rows.push(['elite', S.elite]);
  if (o.boss) rows.push(['boss', 1]);
  if ((o.mutationChance ?? 0) > 0) rows.push(['mutation', o.mutationChance!]);
  if (o.difficulty >= S.minDifficulty) rows.push(['difficulty', S.difficulty]);
  return { chance: Math.max(0, ...rows.map((r) => r[1])), gates: rows.map((r) => r[0]) };
}

/** 특수 속성 적의 가중치 × chance (0 이면 풀에서 뺀다 — 그 자리는 다른 속성 적). 난수를 더 쓰지 않는다.
 *  exempt = 그대로 둘 속성(바퀴 변이 피의 달처럼 그 속성 적을 일부러 부르는 효과) */
export function gateSpecialEnemies(pool: readonly PoolEntry[], chance: number, exempt?: string): PoolEntry[] {
  if (chance >= 1) return [...pool];
  const out: PoolEntry[] = [];
  for (const e of pool) {
    if (!SPECIAL_ELEMENT_IDS.includes(e.enemy.element) || e.enemy.element === exempt) out.push(e);
    else if (chance > 0) out.push({ enemy: e.enemy, weight: e.weight * chance });
  }
  return out;
}
