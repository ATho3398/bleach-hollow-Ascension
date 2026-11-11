// 팔기 (GDD 236장, C.388): 어느 상점에서든 같은 [팔기] 목록 — 먹이·소모품(약·전투 소모품·기타)·장비·남는 탈착 특성. 받는 돈 = 골드.
// 값: 상점에서 파는 물건 = 산 값 × sell.shopRate(내림, 최소 1), 그 밖 = balance.ts sell 표(먹이·떠돌이 등급), 장비 = gear.sellGold(가방 일괄 판매와 같은 함수).
// 팔 수 없는 것: 스킨·꾸밈·방 물건·기기(영구 해금), 펫, 수련권·타일(진행 열쇠), 장착 중 장비·끼운 특성(빼고 판다), 튜토리얼 회복 안내 중 구급상자.
// 판 뒤 알림 없음(233장) — 골드·목록이 바로 바뀐다. 런 로그 sales 에 남긴다(9장).
import { BALANCE } from './config/balance';
import { getGoldItem, getWandererItem } from './data/shop';
import { FOOD_IDS, type FactionConfig, type FoodId } from './engine/faction';
import { foodTypeOf } from './engine/foodPref';
import { equippedSlotOf, sellGearItem, sellGold } from './engine/gear';
import { detachedOf, getDetachTrait } from './engine/traitShop';
import type { SaveData } from './game';
import { BATTLE_ITEM_IDS, CONSUMABLE_IDS, consumableName, gearName, sortedGear } from './inventory';
import { consumableGroupOf, shopBuyPrice } from './shop';

const SL = BALANCE.provisional.sell;

/** 팔기 목록 묶음 (카테고리 칩) */
export const SELL_GROUPS = ['all', 'food', 'medicine', 'battle', 'equipment', 'trait', 'etc'] as const;
export type SellGroup = (typeof SELL_GROUPS)[number];
export const SELL_GROUP_NAMES: Record<SellGroup, string> = { all: '전부', food: '음식', medicine: '약', battle: '전투 소모품', equipment: '장비', trait: '특성', etc: '기타' };

/** 팔 수 있는 것 한 줄 */
export interface SellEntry {
  /** 팔기 키: food-<id> · 소모품 id · reroll · gear:<uid> · trait-<id> */
  key: string;
  group: Exclude<SellGroup, 'all'>;
  name: string;
  /** 가진 개수 (장비·특성 1) */
  count: number;
  /** 한 개 값(골드) */
  unit: number;
  /** 장비 등급 (그림 색) */
  grade?: string;
  /** 팔 수 없는 이유 (튜토리얼 필수 등). 없으면 null */
  lock: string | null;
}

/** 상점 물건이면 산 값의 절반(내림, 최소 1), 아니면 null */
function halfOfShop(id: string): number | null {
  const p = shopBuyPrice(id);
  return p === null ? null : Math.max(1, Math.floor(p * SL.shopRate));
}

/** 먹이 한 개 판매가 (GDD 236장 2): 상점 먹이 = 절반, 그 밖 = 표 */
export function foodSellPrice(food: FoodId): number {
  return halfOfShop(`food-${food}`) ?? SL.prices[`food-${food}`] ?? Math.max(1, Math.floor(BALANCE.provisional.nest.foodTypes[foodTypeOf(food)].hunger / 2));
}

/** 소모품 한 개 판매가: 상점 품목 = 절반, 떠돌이 상인 품목 = 등급 값, 표에 있으면 표 */
export function itemSellPrice(id: string): number {
  const shop = halfOfShop(id);
  if (shop !== null) return shop;
  if (SL.prices[id]) return SL.prices[id]!;
  const w = getWandererItem(id);
  return w ? SL.wandererGrade[w.grade] ?? 1 : 1;
}

/** 이 트랙들 어디든 끼운 탈착 특성 */
function wornTraits(save: SaveData): Set<string> {
  const out = new Set<string>(detachedOf(save.evolution.abilities));
  for (const t of save.otherTracks ?? []) for (const id of detachedOf(t.evolution?.abilities)) out.add(id);
  return out;
}

/** 지금 팔 수 있는 것 전부 (어느 상점에서든 같은 목록, GDD 236장 1) */
export function sellRows(save: SaveData, faction: FactionConfig): SellEntry[] {
  const out: SellEntry[] = [];
  for (const f of FOOD_IDS) {
    const n = save.shared.food[f] ?? 0;
    if (n > 0) out.push({ key: `food-${f}`, group: 'food', name: faction.foodNames[f], count: n, unit: foodSellPrice(f), lock: null });
  }
  const recoverCure = save.help.guides.recover !== undefined && save.help.guides.recover !== 'done'; // 튜토리얼 회복 안내 중엔 구급상자 필수
  for (const id of [...new Set([...CONSUMABLE_IDS, ...BATTLE_ITEM_IDS])]) {
    const n = save.shared.items[id] ?? 0;
    if (n <= 0) continue;
    const g = consumableGroupOf(id);
    out.push({ key: id, group: g === 'medicine' ? 'medicine' : g === 'battle' ? 'battle' : 'etc', name: consumableName(id), count: n, unit: itemSellPrice(id), lock: recoverCure && id === 'med-cure' ? '튜토리얼에서 쓴다' : null });
  }
  if (save.shared.rerollTickets > 0) out.push({ key: 'reroll', group: 'etc', name: getGoldItem('reroll')?.name ?? '다시 뽑기권', count: save.shared.rerollTickets, unit: itemSellPrice('reroll'), lock: null });
  for (const it of sortedGear(save)) {
    if (equippedSlotOf(save.shared.gear, it.uid)) continue; // 낀 장비는 빼고 판다
    out.push({ key: `gear:${it.uid}`, group: 'equipment', name: gearName(it, faction), count: 1, unit: sellGold(it), grade: it.grade, lock: null });
  }
  const worn = wornTraits(save);
  for (const id of save.shared.traits) {
    const t = getDetachTrait(id);
    if (!t || worn.has(id)) continue; // 끼운 특성은 빼고 판다
    out.push({ key: `trait-${id}`, group: 'trait', name: t.name, count: 1, unit: Math.max(1, Math.floor(t.price * SL.shopRate)), lock: null });
  }
  return out;
}

/** 확인 창이 필요한 판매 (GDD 236장 4): 합계가 confirmAt 이상 · 특식 · 희귀 이상 장비 */
export function sellNeedsConfirm(e: SellEntry, count: number): boolean {
  if (e.unit * count >= SL.confirmAt) return true;
  if (e.key.startsWith('food-') && foodTypeOf(e.key.slice(5) as FoodId) === 'special') return true;
  return e.group === 'equipment' && e.grade !== undefined && e.grade !== 'normal';
}

export type SellResult = { ok: true; gold: number; count: number } | { ok: false; reason: string };

/** 판다: 개수만큼 빼고 골드를 더하고 런 로그에 남긴다. 실패하면 아무것도 안 바뀐다 */
export function sellEntry(save: SaveData, faction: FactionConfig, key: string, count: number, where: string, nowMs: number = Date.now()): SellResult {
  const e = sellRows(save, faction).find((r) => r.key === key);
  if (!e) return { ok: false, reason: '팔 수 있는 물건이 아니다' };
  if (e.lock) return { ok: false, reason: e.lock };
  const n = Math.max(1, Math.min(e.count, Math.floor(count)));
  let gold = e.unit * n;
  let logId = key;
  if (key.startsWith('food-')) save.shared.food[key.slice(5) as FoodId] -= n;
  else if (key === 'reroll') save.shared.rerollTickets -= n;
  else if (key.startsWith('gear:')) {
    const uid = key.slice(5);
    const it = save.shared.gear.items.find((g) => g.uid === uid);
    const got = sellGearItem(save.shared.gear, uid);
    if (got === null || !it) return { ok: false, reason: '팔 수 없는 장비다' };
    gold = got;
    logId = `gear:${it.grade}:${it.kind}`;
  } else if (key.startsWith('trait-')) save.shared.traits = save.shared.traits.filter((id) => id !== key.slice(6));
  else {
    save.shared.items[key] = (save.shared.items[key] ?? 0) - n;
    if (save.shared.items[key]! <= 0) delete save.shared.items[key];
  }
  save.shared.tradeCoins += gold;
  save.runLog.sales.push({ at: nowMs, factionId: save.factionId, itemId: logId, count: n, gold, where });
  return { ok: true, gold, count: n };
}
