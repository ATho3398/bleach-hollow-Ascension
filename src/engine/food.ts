// 먹이 = 전리품 (GDD 23-1). 종족 무관 순수 로직: 먹이 5종 보유 개수, 전투 드롭, 보관 상한, 막힘 방지.
// 먹이 이름은 종족 설정 foodNames, 효과는 BALANCE.provisional.nest.foods, 개수·드롭 수치는 BALANCE.provisional.food (모두 provisional).

import { BALANCE } from '../config/balance';
import { FOOD_IDS, type FoodId } from './faction';
import { nextFloat, type Rng } from './rng';

const FX = BALANCE.provisional.food;

/** 먹이 종류별 보유 개수 */
export type FoodStock = Record<FoodId, number>;

export function emptyFoodStock(): FoodStock {
  return Object.fromEntries(FOOD_IDS.map((id) => [id, 0])) as FoodStock;
}

/** 새 게임 시작 지급 (간식 5·보통 3) */
export function newFoodStock(): FoodStock {
  const s = emptyFoodStock();
  for (const id of FOOD_IDS) s[id] = Math.min(FX.cap, FX.start[id] ?? 0);
  return s;
}

/** 저장된 값을 보유 개수로 정리한다: 모르는 종류는 버리고, 0~상한 정수로 */
export function sanitizeFoodStock(raw: unknown): FoodStock {
  const s = emptyFoodStock();
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  for (const id of FOOD_IDS) {
    const v = r[id];
    s[id] = typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(FX.cap, Math.floor(v))) : 0;
  }
  return s;
}

export function totalFood(s: FoodStock): number {
  return FOOD_IDS.reduce((n, id) => n + s[id], 0);
}

/** 먹이를 더한다. 상한을 넘는 몫은 버리고, 실제로 들어간 개수를 돌려준다 */
export function addFood(s: FoodStock, id: FoodId, n: number): number {
  const added = Math.max(0, Math.min(n, FX.cap - s[id]));
  s[id] += added;
  return added;
}

/** 먹이 하나를 쓴다. 없으면 false (아무것도 바뀌지 않는다) */
export function takeFood(s: FoodStock, id: FoodId): boolean {
  if (s[id] <= 0) return false;
  s[id]--;
  return true;
}

function pickWeighted(rng: Rng, table: Record<string, number>): FoodId {
  const entries = FOOD_IDS.filter((id) => (table[id] ?? 0) > 0).map((id) => [id, table[id]!] as const);
  const total = entries.reduce((n, [, w]) => n + w, 0);
  let r = nextFloat(rng) * total;
  for (const [id, w] of entries) {
    r -= w;
    if (r < 0) return id;
  }
  return entries[entries.length - 1]![0];
}

/** 드롭 표 (사냥터마다 다르다, GDD 24-2). 기본은 BALANCE.provisional.food */
export interface FoodDropTable {
  normalDropChance: number;
  normalTable: Record<string, number>;
  eliteExtraChance: number;
  eliteTable: Record<string, number>;
}

/** 전투 승리 전리품 (GDD 23-1): 일반 적 50% 확률로 1개(간식·보통·든든), 강적 확정 1개 + 30% 확률로 1개 더(든든·보양식·잔치). 확률·표는 사냥터 표 */
export function rollBattleFood(rng: Rng, elite: boolean, table: FoodDropTable = FX): FoodId[] {
  if (elite) {
    const out = [pickWeighted(rng, table.eliteTable)];
    if (nextFloat(rng) < table.eliteExtraChance) out.push(pickWeighted(rng, table.eliteTable));
    return out;
  }
  return nextFloat(rng) < table.normalDropChance ? [pickWeighted(rng, table.normalTable)] : [];
}

/** 원정에서 가져온 먹이를 보유에 넣은 결과 (결과 화면 표시용) */
export interface FoodSettlement {
  /** 원정에서 얻어 지킨 먹이 (상한으로 버려진 것 포함) */
  gained: FoodId[];
  /** 상한 때문에 못 넣은 개수 */
  overflow: number;
  /** 패배로 잃은 먹이 (마지막 바퀴 획득분) */
  lost: FoodId[];
  /** 막힘 방지로 받은 간식 개수 (0 = 해당 없음) */
  fallback: number;
}

/** 원정에서 얻은 먹이를 보유에 넣고, 그래도 하나도 없으면 막힘 방지 간식을 준다 (GDD 23-1) */
export function settleFood(s: FoodStock, gained: FoodId[], lost: FoodId[] = []): FoodSettlement {
  let overflow = 0;
  for (const id of gained) overflow += 1 - addFood(s, id, 1);
  let fallback = 0;
  if (totalFood(s) === 0) fallback = addFood(s, 'snack', FX.fallbackSnack);
  return { gained: [...gained], overflow, lost: [...lost], fallback };
}

/** 종류별 개수로 묶는다 (표시용): [[id, 개수]] FOOD_IDS 순서 */
export function countFoods(ids: readonly FoodId[]): [FoodId, number][] {
  return FOOD_IDS.map((id) => [id, ids.filter((x) => x === id).length] as [FoodId, number]).filter(([, n]) => n > 0);
}
