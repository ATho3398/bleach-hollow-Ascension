// 먹이 효과 설명 글 (GDD 211장): 방 먹이 카드·가방·상점이 모두 engine foodEffectList 한 목록에서 글을 만든다 — 적힌 것 = 실제로 바뀌는 것.
import type { FactionConfig, FoodId } from './engine/faction';
import { foodEffectList, type FoodFx } from './engine/nest';

const signed = (n: number) => `${n > 0 ? '+' : '−'}${Math.abs(n)}`;

/** 값 이름 (배부름은 종족 이름) */
export function foodFxLabel(key: FoodFx['key'], faction: Pick<FactionConfig, 'fullnessName'>): string {
  return key === 'hunger' ? faction.fullnessName : key === 'cond' ? '컨디션' : key === 'hp' ? '체력' : '교감';
}

/** 숫자 부분만 ('+5', '−5', '+3%') */
export const foodFxAmount = (e: FoodFx): string => `${signed(e.amount)}${e.key === 'hp' ? '%' : ''}`;

/** 효과 한 줄 ('배부름 +5') */
export const foodFxText = (e: FoodFx, faction: Pick<FactionConfig, 'fullnessName'>): string => `${foodFxLabel(e.key, faction)} ${foodFxAmount(e)}`;

/** 먹이 한 개의 효과 전부 ('배부름 +5 · 체력 +3% · 교감 +1') — 가방·상점 설명, 방 카드 title/aria */
export function foodEffectText(food: FoodId, faction: Pick<FactionConfig, 'fullnessName'>, list: readonly FoodFx[] = foodEffectList(food)): string {
  return list.map((e) => foodFxText(e, faction)).join(' · ');
}
