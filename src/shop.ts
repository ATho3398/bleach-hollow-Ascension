// 상점 1차 (GDD 25-9, S-16 C.60): 줄 상태(가격·잠김 이유·보유·착용)·구매·꾸밈 착용·다시 뽑기권 사용. 종족 무관 —
// 품목은 src/data/shop, 가격·상한·효과량은 balance.ts shop(확정), 문구의 종족 이름(먹이·리스크 게이지)은 종족 설정에서 읽는다.
// 산 즉시 쓰는 방식: 먹이 = 먹이 개수 +1, 정화제·각성제 = 지금 캐릭터에 바로, 수련권 = 지금 트랙 +1, 타일 = 보관함 +1. 보관하는 건 다시 뽑기권·덱 칸·꾸밈뿐
import { BALANCE } from './config/balance';
import { GOLD_ITEMS, COSMETIC_ITEMS, cosmeticName, deviceArt, getCosmetic, getGoldItem, shopVisible, skinIdOfItem, type CosmeticCategory, type CosmeticItemDef, type GoldItemDef, type WearCategory } from './data/shop';
import { canWear } from './data/skins';
import { baseTilesFor, tileName } from './data/tiles';
import { JADE_NAME, TRADE_CURRENCY_NAME } from './data/economy';
import type { FactionConfig } from './engine/faction';
import { addFood } from './engine/food';
import type { SaveData } from './game';

const SX = BALANCE.shop;
const FOOD_MAX = BALANCE.provisional.food.cap;

export type ShopCurrency = 'gold' | 'jade';

/** 상점 한 줄의 상태 */
export interface ShopRow {
  id: string;
  currency: ShopCurrency;
  name: string;
  /** 효과 한 줄 */
  effect: string;
  /** 가격 (덱 칸은 다음 칸 가격, 다 샀으면 null) */
  price: number | null;
  /** [사기]를 누를 수 있나 */
  canBuy: boolean;
  /** 잠긴 이유 한 줄 ("골드 20 부족", "보관 가득 (9/9)" …). 살 수 있으면 null */
  lock: string | null;
  /** 보유·진행 한 줄 ("보유 3/9", "덱 9칸 (+1/2)") */
  have: string | null;
  /** 사기 전 확인 창을 띄우나 (영옥 품목·덱 칸) */
  confirm: boolean;
  /** 꾸밈: 분류·보유·착용 */
  category?: CosmeticCategory;
  owned?: boolean;
  worn?: boolean;
}

export type BuyResult = { ok: true; id: string; price: number; currency: ShopCurrency; detail: string } | { ok: false; reason: string };

const wallet = (save: SaveData, c: ShopCurrency): number => (c === 'gold' ? save.shared.tradeCoins : save.shared.jade);
const currencyName = (c: ShopCurrency): string => (c === 'gold' ? TRADE_CURRENCY_NAME : JADE_NAME);
/** 돈이 모자랄 때 한 줄: "골드 20 부족" */
export const shortText = (c: ShopCurrency, n: number): string => `${currencyName(c)} ${n} 부족`;

/** 수련권이 보이는 트랙인가 (수련이 열린 5단계 이상, GDD 22-5) */
const trainingOpen = (save: SaveData): boolean => save.evolution.tierIndex >= BALANCE.provisional.liberation.minTierIndex;

/** 덱 밖 바탕 타일 (희귀 타일 꾸러미 풀 = 드래프트 특별 칸의 바탕 타일 쪽, 이벤트 타일 제외). 덱에 다 있으면 바탕 타일 전체 */
export function rareTilePool(save: Pick<SaveData, 'factionId' | 'tiles'>): string[] {
  const base = baseTilesFor(save.factionId).map((t) => t.id);
  const outside = base.filter((id) => !save.tiles.deck.includes(id));
  return outside.length > 0 ? outside : base;
}

function goldName(item: GoldItemDef, faction: FactionConfig): string {
  return item.kind === 'food' ? faction.foodNames[item.food!] : item.name!;
}

function goldEffect(item: GoldItemDef, faction: FactionConfig): string {
  switch (item.kind) {
    case 'food': return `먹이 +1 (종류별 보관 ${FOOD_MAX}개까지)`;
    case 'calm': return `${faction.riskGaugeName} −${SX.calmRisk} (0 아래로 안 감), 지금 캐릭터에 바로`;
    case 'wake': return `컨디션 +${SX.wakeCondition} (${BALANCE.provisional.expedition.conditionMax} 위로 안 감), 지금 캐릭터에 바로`;
    case 'trainingTicket': return `지금 트랙 수련권 +1 (최대 ${BALANCE.provisional.training.ticketsMax})`;
    case 'rareTile': return '덱 밖 타일 무작위 1장 → 보관함 (이벤트 타일 제외)';
    case 'reroll': return `흡수 화면 특성 후보를 한 번 다시 뽑는다 (흡수 1번에 1장, 보유 ${SX.rerollMax}장까지)`;
    case 'deckSlot': return `원정 타일 덱 칸 +1 (영구, 두 트랙 공유, 최대 +${SX.deckSlotPrices.length})`;
  }
}

function goldPrice(save: SaveData, item: GoldItemDef): number | null {
  if (item.kind === 'deckSlot') return SX.deckSlotPrices[save.shared.deckSlots] ?? null;
  return SX.goldPrices[item.id] ?? null;
}

/** 품목 효과로 막힌 이유 (돈과 별개). 없으면 null */
function goldBlock(save: SaveData, item: GoldItemDef, faction: FactionConfig): string | null {
  const away = save.activeExpedition != null;
  switch (item.kind) {
    case 'food': return save.shared.food[item.food!] >= FOOD_MAX ? `보관 가득 (${FOOD_MAX}/${FOOD_MAX})` : null;
    case 'calm':
      if (away) return '원정 중인 캐릭터에는 못 쓴다';
      return save.nest.risk <= 0 ? `${faction.riskGaugeName} 이미 0` : null;
    case 'wake':
      if (away) return '원정 중인 캐릭터에는 못 쓴다';
      return save.nest.condition >= BALANCE.provisional.expedition.conditionMax ? '컨디션 이미 가득' : null;
    case 'trainingTicket': return save.training.tickets >= BALANCE.provisional.training.ticketsMax ? `수련권 가득 (${BALANCE.provisional.training.ticketsMax}/${BALANCE.provisional.training.ticketsMax})` : null;
    case 'rareTile': return null;
    case 'reroll': return save.shared.rerollTickets >= SX.rerollMax ? `보유 가득 (${SX.rerollMax}/${SX.rerollMax})` : null;
    case 'deckSlot': return save.shared.deckSlots >= SX.deckSlotPrices.length ? `최대 (+${SX.deckSlotPrices.length})` : null;
  }
}

function goldHave(save: SaveData, item: GoldItemDef): string | null {
  switch (item.kind) {
    case 'food': return `보유 ${save.shared.food[item.food!]}/${FOOD_MAX}`;
    case 'trainingTicket': return `보유 ${save.training.tickets}/${BALANCE.provisional.training.ticketsMax}`;
    case 'reroll': return `보유 ${save.shared.rerollTickets}/${SX.rerollMax}`;
    case 'deckSlot': return `덱 ${BALANCE.provisional.expedition.deckSize + save.shared.deckSlots}칸 (+${save.shared.deckSlots}/${SX.deckSlotPrices.length})`;
    case 'calm': return `지금 ${Math.round(save.nest.risk)}`;
    case 'wake': return `지금 ${Math.round(save.nest.condition)}`;
    case 'rareTile': return null;
  }
}

/** 골드 탭 줄 (GDD 25-9 표 순서). 수련권은 수련이 열린 트랙(5단계 이상)에서만 보인다 */
export function goldRows(save: SaveData, faction: FactionConfig): ShopRow[] {
  return GOLD_ITEMS.filter((it) => it.kind !== 'trainingTicket' || trainingOpen(save)).map((it) => {
    const price = goldPrice(save, it);
    const block = goldBlock(save, it, faction) ?? (price !== null && wallet(save, 'gold') < price ? shortText('gold', price - wallet(save, 'gold')) : null);
    return { id: it.id, currency: 'gold', name: goldName(it, faction), effect: goldEffect(it, faction), price, canBuy: block === null && price !== null, lock: block, have: goldHave(save, it), confirm: it.kind === 'deckSlot' };
  });
}

/** 꾸밈 가격 (스킨은 skinPrice, 나머지는 분류별) */
export function cosmeticPrice(c: Pick<CosmeticItemDef, 'category'>): number {
  return c.category === 'skin' ? SX.skinPrice : SX.cosmeticPrices[c.category] ?? 0;
}

/** 이 트랙이 이 꾸밈을 입고 있나 */
export function isWorn(save: Pick<SaveData, 'skin' | 'wear'>, c: CosmeticItemDef): boolean {
  return c.category === 'skin' ? save.skin === c.look : save.wear[c.category as WearCategory] === c.id;
}

/** 영옥 탭 줄: 스킨(이 종족이 입을 수 있는 것만) → 꾸밈 분류 순서. 기기 디자인은 그림이 들어온 것만, 보상 전용은 보유했을 때만 (GDD 27장) */
export function jadeRows(save: SaveData, faction?: FactionConfig, files?: readonly string[]): ShopRow[] {
  return COSMETIC_ITEMS.filter((c) => (c.category !== 'skin' || canWear(save.factionId, c.look)) && shopVisible(c, save.shared.cosmetics, files)).map((c) => {
    const price = cosmeticPrice(c);
    const owned = save.shared.cosmetics.includes(c.id);
    const short = !owned && wallet(save, 'jade') < price ? shortText('jade', price - wallet(save, 'jade')) : null;
    return { id: c.id, currency: 'jade', name: cosmeticName(c, faction), effect: '', price, canBuy: !owned && short === null, lock: owned ? null : short, have: owned ? (c.free ? '가짐' : '보유') : null, confirm: true, category: c.category, owned, worn: isWorn(save, c) };
  });
}

function record(save: SaveData, id: string, currency: ShopCurrency, price: number, nowMs: number): void {
  save.runLog.shopPurchases.push({ at: nowMs, factionId: save.factionId, itemId: id, currency, price });
}

/** 산다 (GDD 25-9): 돈·상한·조건을 다시 확인하고 바로 효과를 낸다. 실패하면 아무것도 바뀌지 않는다. rand = 희귀 타일 굴림(0~1) */
export function buyShopItem(save: SaveData, faction: FactionConfig, id: string, nowMs: number = Date.now(), rand: () => number = Math.random, files?: readonly string[]): BuyResult {
  const gold = getGoldItem(id);
  if (gold) {
    const row = goldRows(save, faction).find((r) => r.id === id);
    if (!row) return { ok: false, reason: '지금은 살 수 없는 품목이다' };
    if (!row.canBuy || row.price === null) return { ok: false, reason: row.lock ?? '살 수 없다' };
    const price = row.price;
    let detail = '';
    switch (gold.kind) {
      case 'food':
        addFood(save.shared.food, gold.food!, 1);
        detail = `${faction.foodNames[gold.food!]} ${save.shared.food[gold.food!]}/${FOOD_MAX}`;
        break;
      case 'calm':
        save.nest.risk = Math.max(0, save.nest.risk - SX.calmRisk);
        detail = `${faction.riskGaugeName} ${Math.round(save.nest.risk)}`;
        break;
      case 'wake':
        save.nest.condition = Math.min(BALANCE.provisional.expedition.conditionMax, save.nest.condition + SX.wakeCondition);
        detail = `컨디션 ${Math.round(save.nest.condition)}`;
        break;
      case 'trainingTicket':
        save.training.tickets = Math.min(BALANCE.provisional.training.ticketsMax, save.training.tickets + 1);
        detail = `수련권 ${save.training.tickets}장`;
        break;
      case 'rareTile': {
        const pool = rareTilePool(save);
        const tile = pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))]!;
        save.tiles.collection[tile] = (save.tiles.collection[tile] ?? 0) + 1;
        detail = `${tileName(tile, save.factionId)} → 보관함`;
        break;
      }
      case 'reroll':
        save.shared.rerollTickets++;
        detail = `다시 뽑기권 ${save.shared.rerollTickets}장`;
        break;
      case 'deckSlot':
        save.shared.deckSlots++;
        detail = `타일 덱 ${BALANCE.provisional.expedition.deckSize + save.shared.deckSlots}칸`;
        break;
    }
    save.shared.tradeCoins -= price;
    record(save, id, 'gold', price, nowMs);
    return { ok: true, id, price, currency: 'gold', detail };
  }
  const c = getCosmetic(id);
  if (!c || (c.category === 'skin' && !canWear(save.factionId, c.look)) || !shopVisible(c, save.shared.cosmetics, files)) return { ok: false, reason: '지금은 살 수 없는 품목이다' };
  if (save.shared.cosmetics.includes(id)) return { ok: false, reason: '이미 가지고 있다' };
  const price = cosmeticPrice(c);
  if (save.shared.jade < price) return { ok: false, reason: shortText('jade', price - save.shared.jade) };
  save.shared.jade -= price;
  save.shared.cosmetics.push(id);
  record(save, id, 'jade', price, nowMs);
  return { ok: true, id, price, currency: 'jade', detail: `${cosmeticName(c, faction)} 보유` };
}

/** 보상으로 꾸밈을 준다 (GDD 27장 기기 디자인 source 'reward' 등). 돈·상점 노출과 무관, 이미 있으면 false. 구매 기록은 남기지 않는다 */
export function grantCosmetic(save: SaveData, id: string): boolean {
  const c = getCosmetic(id);
  if (!c || c.category === 'skin' || save.shared.cosmetics.includes(id)) return false;
  save.shared.cosmetics.push(id);
  return true;
}

/** 꾸밈 입기 (지금 트랙, 분류마다 하나 — 같은 분류의 다른 것은 벗는다). 보유하지 않았거나 이 종족이 못 입는 스킨이면 false */
export function wearCosmetic(save: SaveData, id: string): boolean {
  const c = getCosmetic(id);
  if (!c || !save.shared.cosmetics.includes(id)) return false;
  if (c.category === 'skin') {
    const skin = skinIdOfItem(id);
    if (!skin || !canWear(save.factionId, skin)) return false;
    save.skin = skin;
  } else save.wear[c.category as WearCategory] = id;
  return true;
}

/** 그 분류를 [기본]으로 (벗기) */
export function unwearCategory(save: SaveData, category: CosmeticCategory): void {
  if (category === 'skin') save.skin = null;
  else delete save.wear[category as WearCategory];
}

/** 다마고치 모드 [디자인] 목록 (GDD 30장): 이 세이브가 가진 기기 디자인 중 그림이 있는 것 (데이터 순서). 기본형(CSS 기기)은 화면이 맨 앞에 따로 둔다 */
export function ownedDeviceDesigns(save: Pick<SaveData, 'shared'>, files?: readonly string[]): CosmeticItemDef[] {
  return COSMETIC_ITEMS.filter((c) => c.category === 'device' && save.shared.cosmetics.includes(c.id) && deviceArt(c, files) !== null);
}

/** 지금 트랙이 입은 꾸밈 품목 (분류 → 품목). 화면 표시(cosmetics.ts)가 읽는다 */
export function wornCosmetics(save: Pick<SaveData, 'skin' | 'wear'>): CosmeticItemDef[] {
  return Object.values(save.wear).map((id) => getCosmetic(id)).filter((c): c is CosmeticItemDef => c !== undefined);
}

/** 다시 뽑기권 한 장을 쓴다 (흡수 화면). 없으면 false */
export function useRerollTicket(save: SaveData): boolean {
  if (save.shared.rerollTickets <= 0) return false;
  save.shared.rerollTickets--;
  return true;
}
