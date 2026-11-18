// 방 먹이 줄 종류 (GDD 4-4 v6.130, C.501 — 사용자 2026-11-19 "맨 왼쪽에 버튼엔 음식 종류버튼 만들고(특식, 일반 먹이, 보급 먹이) … 음식 종류 버튼 누르면 다음 거 뜨는거임 …
// 먹이 탭 끌 때 떠있던 종류 기억해둿다가 다음 먹이탭 킬 때 그 종류로"). 종류·순서·이름·먹이 배정은 데이터(src/data/foods/rows.json)만 본다.
// 기억 = 기기 저장(설정처럼, 슬롯과 무관). 저장소가 막혀도 게임은 그대로(처음 종류).
import raw from '../../data/foods/rows.json';
import type { FoodId } from '../../engine/faction';

export interface FoodKind {
  id: string;
  name: string;
  foods: readonly FoodId[];
}

const data = raw as { start: string; kinds: FoodKind[] };
export const FOOD_KINDS: readonly FoodKind[] = data.kinds;
/** 기억이 없을 때 처음 종류 */
export const FOOD_KIND_START: string = data.start;
/** 기기 저장 키 (다른 bha- 기기 설정 키처럼) */
export const FOOD_KIND_KEY = 'bha-food-kind';

/** 그 종류 (모르는 id 면 처음 종류) */
export function foodKindOf(id: string | null | undefined, kinds: readonly FoodKind[] = FOOD_KINDS): FoodKind {
  return kinds.find((k) => k.id === id) ?? kinds.find((k) => k.id === FOOD_KIND_START) ?? kinds[0]!;
}

/** [종류]를 누르면 다음 종류 (끝이면 처음으로 돈다) */
export function nextFoodKind(id: string, kinds: readonly FoodKind[] = FOOD_KINDS): FoodKind {
  const i = kinds.findIndex((k) => k.id === id);
  return kinds[(i + 1) % kinds.length]!;
}

/** 이 먹이가 든 종류 */
export function foodKindOfFood(food: FoodId, kinds: readonly FoodKind[] = FOOD_KINDS): FoodKind | null {
  return kinds.find((k) => k.foods.includes(food)) ?? null;
}

type KindStore = Pick<Storage, 'getItem' | 'setItem'>;
const defaultStore = (): KindStore | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
};

/** 기억한 종류 id (없거나 저장소가 막히면 처음 종류) */
export function loadFoodKind(store: KindStore | null = defaultStore()): string {
  try {
    return foodKindOf(store?.getItem(FOOD_KIND_KEY)).id;
  } catch {
    return foodKindOf(null).id;
  }
}

/** 먹이 줄을 닫을 때 보던 종류를 기억한다 */
export function saveFoodKind(id: string, store: KindStore | null = defaultStore()): void {
  try {
    store?.setItem(FOOD_KIND_KEY, id);
  } catch {
    /* 저장소가 막혀도 그대로 */
  }
}
