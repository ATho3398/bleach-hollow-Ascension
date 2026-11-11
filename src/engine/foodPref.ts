// 일반 먹이 선호·비선호 (GDD 235장 2 + 사용자 추가, C.387 provisional). 종족 무관 — 진화체 속성으로 정한다.
// 자기 속성 먹이 = 선호, 상성 약점 속성 먹이 = 비선호. 배정 데이터는 src/data/foods/prefs.json 한 곳(byElement).
import { BALANCE } from '../config/balance';
import prefsRaw from '../data/foods/prefs.json';
import { FOOD_IDS, type FoodId } from './faction';

export type FoodType = 'special' | 'normal' | 'cheap';
/** 먹을 때의 반응: like = 좋아함, dislike = 싫어함, cheap = 억지로 먹음, null = 보통 */
export type FoodReaction = 'like' | 'dislike' | 'cheap' | null;

const FOODS = BALANCE.provisional.nest.foods;

export function foodTypeOf(food: FoodId): FoodType {
  return FOODS[food]?.type ?? 'normal';
}

/** 일반 먹이 6종 (FOOD_IDS 순서) */
export const NORMAL_FOODS: readonly FoodId[] = FOOD_IDS.filter((f) => foodTypeOf(f) === 'normal');

/** 속성 → 선호·비선호 일반 먹이 (prefs.json byElement) */
export const FOOD_PREFS: Readonly<Record<string, { like: FoodId; dislike: FoodId }>> = (prefsRaw as { byElement: Record<string, { like: FoodId; dislike: FoodId }> }).byElement;

/** 이 먹이를 지금 먹이면 반응: 싸구려 = 억지로, 특식 = 보통, 일반 = 내 속성(들)의 선호면 좋아함 · 선호가 아니고 비선호면 싫어함 */
export function foodReactionOf(food: FoodId, elements: readonly string[]): FoodReaction {
  const t = foodTypeOf(food);
  if (t === 'cheap') return 'cheap';
  if (t !== 'normal') return null;
  const prefs = elements.map((e) => FOOD_PREFS[e]).filter((p) => p !== undefined);
  if (prefs.some((p) => p.like === food)) return 'like';
  if (prefs.some((p) => p.dislike === food)) return 'dislike';
  return null;
}
