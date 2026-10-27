// 상점 1차 (GDD 25-9, S-16 C.60): 줄 상태(가격·잠김 이유·보유·착용)·구매·꾸밈 착용·다시 뽑기권 사용. 종족 무관 —
// 품목은 src/data/shop, 가격·상한·효과량은 balance.ts shop(확정), 문구의 종족 이름(먹이·리스크 게이지)은 종족 설정에서 읽는다.
// C.140 (GDD 86장 4번): 산 것은 보관함으로 — 먹이 = 먹이 개수 +1, 정화제·각성제 = 보관함 소모품 +1(보관함에서 씀, inventory.ts), 수련권 = 지금 트랙 +1, 타일 = 보관함 +1,
// 꾸밈·스킨 = 보유만(끼기는 보관함). 떠돌이 상인(GDD 85장 5번) 품목·구매도 여기(wandererRows·buyWandererItem).
import { BALANCE } from './config/balance';
import { GOLD_ITEMS, COSMETIC_ITEMS, cosmeticName, deviceArt, getCosmetic, getGoldItem, getWandererItem, shopVisible, skinIdOfItem, WANDERER_GRADE_NAMES, type CosmeticCategory, type CosmeticItemDef, type GoldItemDef, type MedicineCure, type WandererGrade, type WearCategory } from './data/shop';
import { wandererAmount } from './engine/wanderer';
import { canWear } from './data/skins';
import { baseTilesFor, tileName } from './data/tiles';
import { JADE_NAME, TRADE_CURRENCY_NAME } from './data/economy';
import type { FactionConfig } from './engine/faction';
import { CARE_STATUS_NAMES } from './engine/nest';
import { addFood } from './engine/food';
import { grantPet, pickNewPet } from './engine/pet';
import { gearFull, grantGear, rollGear, type GearRoll } from './engine/gear';
import { recommendedDifficulty } from './engine/difficulty';
import { GEAR_GRADE_NAMES, type GearGrade } from './data/gear';
import type { SaveData } from './game';

const SX = BALANCE.shop;
const FOOD_MAX = BALANCE.provisional.food.cap;
/** 보관함 소모품 종류별 상한 (GDD 86장 4번) */
export const CONSUMABLE_CAP = BALANCE.provisional.inventory.consumableCap;

/** 보관함 소모품 한 개 더 넣을 수 있나 */
export function canStoreConsumable(save: Pick<SaveData, 'shared'>, id: string): boolean {
  return (save.shared.items[id] ?? 0) < CONSUMABLE_CAP;
}

/** 보관함 소모품 넣기 (상한까지). 넣은 개수 */
export function storeConsumable(save: Pick<SaveData, 'shared'>, id: string, n = 1): number {
  const add = Math.max(0, Math.min(n, CONSUMABLE_CAP - (save.shared.items[id] ?? 0)));
  if (add > 0) save.shared.items[id] = (save.shared.items[id] ?? 0) + add;
  return add;
}

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

export type BuyResult = { ok: true; id: string; price: number; currency: ShopCurrency; detail: string; tile?: string; firstDraw?: boolean } | { ok: false; reason: string };

const wallet = (save: SaveData, c: ShopCurrency): number => (c === 'gold' ? save.shared.tradeCoins : save.shared.jade);
const currencyName = (c: ShopCurrency): string => (c === 'gold' ? TRADE_CURRENCY_NAME : JADE_NAME);
/** 돈이 모자랄 때 한 줄: "골드 20 부족" */
export const shortText = (c: ShopCurrency, n: number): string => `${currencyName(c)} ${n} 부족`;

/** 수련권이 보이는 트랙인가 (수련이 열린 5단계 이상, GDD 22-5) */
const trainingOpen = (save: SaveData): boolean => save.evolution.tierIndex >= BALANCE.provisional.liberation.minTierIndex;

/** 아직 안 가진 바탕 타일 (희귀 타일 꾸러미 풀, 이벤트 타일 제외 — C.140 덱 삭제로 '덱 밖' → '안 가진'). 다 가졌으면 바탕 타일 전체 */
export function rareTilePool(save: Pick<SaveData, 'factionId' | 'tiles'>): string[] {
  const base = baseTilesFor(save.factionId).map((t) => t.id);
  const outside = base.filter((id) => (save.tiles.collection[id] ?? 0) <= 0);
  return outside.length > 0 ? outside : base;
}

const TD = BALANCE.provisional.tileDraw;
/** 타일이 열리기 전(첫 진화 전, GDD 64장) 잠김 문구 */
export const TILES_LOCKED_TEXT = '첫 진화 후 열림';

/** 타일 뽑기 묶음 → 그 종족이 쓸 수 있는 타일 id (env = 환경 타일 전부) */
export function tileDrawGroup(group: string, factionId: string): string[] {
  const usable = baseTilesFor(factionId);
  if (group === 'env') return usable.filter((t) => t.kind === 'environment').map((t) => t.id);
  const ids = TD.groups[group] ?? [];
  return usable.filter((t) => ids.includes(t.id)).map((t) => t.id);
}

/** 타일 뽑기 확률 (GDD 64장 2번, provisional): 묶음 → 확률(0~1). 그 종족이 못 쓰는 묶음은 빼고 남은 비율로 나눈다. 첫 뽑기는 firstGroup 확정 */
export function tileDrawOdds(factionId: string, first: boolean): Record<string, number> {
  const groups = Object.keys(TD.weights).filter((g) => tileDrawGroup(g, factionId).length > 0);
  if (first && groups.includes(TD.firstGroup)) return { [TD.firstGroup]: 1 };
  const sum = groups.reduce((a, g) => a + TD.weights[g]!, 0);
  return Object.fromEntries(groups.map((g) => [g, TD.weights[g]! / sum]));
}

/** 타일 뽑기 한 번 (DOM 없음): rand 두 번(묶음·타일). 결과 타일 id */
export function rollTileDraw(factionId: string, first: boolean, rand: () => number = Math.random): string {
  const odds = Object.entries(tileDrawOdds(factionId, first));
  let r = rand();
  let group = odds[odds.length - 1]![0];
  for (const [g, p] of odds) {
    if (r < p) {
      group = g;
      break;
    }
    r -= p;
  }
  const pool = tileDrawGroup(group, factionId);
  return pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))]!;
}

/** 약 효과 한 줄 (GDD 102-4): 그 상태만 푼다, 수치는 안 오른다 */
export function medicineText(cures: MedicineCure): string {
  const name = cures === 'collapsed' ? CARE_STATUS_NAMES.collapsed : cures === 'weak' ? CARE_STATUS_NAMES.weak : CARE_STATUS_NAMES.tired;
  return `${name} 상태를 바로 푼다 (수치는 안 오른다) · 보관함에 쌓이고 보관함에서 쓴다`;
}

function goldName(item: GoldItemDef, faction: FactionConfig): string {
  if (item.kind === 'gear') return `${GEAR_GRADE_NAMES.normal} ${gearKindLabel(item, faction)}`;
  return item.kind === 'food' ? faction.foodNames[item.food!] : item.name!;
}

function goldEffect(item: GoldItemDef, faction: FactionConfig): string {
  switch (item.kind) {
    case 'food': {
      // 효과 한 줄 (GDD 100장 #62): 보관함 카드와 같은 '배부름 +n · 컨디션 +n'. 보관 한도는 '보유 n/9' 배지가 말한다
      const fx = BALANCE.provisional.nest.foods[item.food!];
      return `${faction.fullnessName} +${fx.hunger}${fx.condition ? ` · 컨디션 ${fx.condition > 0 ? '+' : ''}${fx.condition}` : ''}`;
    }
    case 'calm': return `${faction.riskGaugeName} −${SX.calmRisk} (0 아래로 안 감) · 보관함에 쌓이고 보관함에서 쓴다`;
    case 'wake': return `컨디션 +${SX.wakeCondition} (${BALANCE.provisional.expedition.conditionMax} 위로 안 감) · 보관함에 쌓이고 보관함에서 쓴다`;
    case 'medicine': return medicineText(item.cures!);
    case 'trainingTicket': return `지금 트랙 수련권 +1 (최대 ${BALANCE.provisional.training.ticketsMax})`;
    case 'tileDraw': return `원정 타일 1장 → 보관함 (같은 타일이면 장수 +1) · 기본 ${TD.weights.basic}% · 환경 ${TD.weights.env}% · B형 ${TD.weights.b}% · ${TD.groups.spring!.map((id) => tileName(id, faction.id)).join('·')} ${TD.weights.spring}% · 희귀(${TD.groups.rare!.map((id) => tileName(id, faction.id)).join('·')}) ${TD.weights.rare}%, 첫 뽑기는 환경 타일`;
    case 'rareTile': return '아직 안 가진 타일 무작위 1장 → 보관함 (이벤트 타일 제외)';
    case 'reroll': return `${faction.absorbActionName} 화면 특성 후보를 한 번 다시 뽑는다 (${faction.absorbActionName} 1번에 1장, 보유 ${SX.rerollMax}장까지)`;
    case 'deckSlot': return `원정 길에 놓을 수 있는 타일 칸 +1 (영구, 두 트랙 공유, 최대 +${SX.deckSlotPrices.length})`;
    case 'gear': return `${GEAR_STAT_HINT[item.gearKind!]} · 노말 · ★ = 지금 단계 권장 · 능력치 무작위 → 장비 화면에서 착용`;
  }
}

function goldPrice(save: SaveData, item: GoldItemDef): number | null {
  if (item.kind === 'deckSlot') return SX.deckSlotPrices[save.shared.deckSlots] ?? null;
  if (item.kind === 'tileDraw') return TD.price;
  if (item.kind === 'gear') return BALANCE.provisional.gear.shopPrice;
  if (item.kind === 'medicine') return BALANCE.provisional.nest.medicinePrices[item.id] ?? null;
  return SX.goldPrices[item.id] ?? null;
}

/** 품목 효과로 막힌 이유 (돈과 별개). 없으면 null */
function goldBlock(save: SaveData, item: GoldItemDef): string | null {
  switch (item.kind) {
    case 'food': return save.shared.food[item.food!] >= FOOD_MAX ? `보관 가득 (${FOOD_MAX}/${FOOD_MAX})` : null;
    case 'calm':
    case 'wake':
    case 'medicine': return canStoreConsumable(save, item.id) ? null : `보관 가득 (${CONSUMABLE_CAP}/${CONSUMABLE_CAP})`;
    case 'trainingTicket': return save.training.tickets >= BALANCE.provisional.training.ticketsMax ? `수련권 가득 (${BALANCE.provisional.training.ticketsMax}/${BALANCE.provisional.training.ticketsMax})` : null;
    case 'tileDraw':
    case 'rareTile': return save.tiles.unlocked ? null : TILES_LOCKED_TEXT;
    case 'reroll': return save.shared.rerollTickets >= SX.rerollMax ? `보유 가득 (${SX.rerollMax}/${SX.rerollMax})` : null;
    case 'deckSlot': return save.shared.deckSlots >= SX.deckSlotPrices.length ? `최대 (+${SX.deckSlotPrices.length})` : null;
    case 'gear': return gearFullText(save);
  }
}

function goldHave(save: SaveData, item: GoldItemDef): string | null {
  switch (item.kind) {
    case 'food': return `보유 ${save.shared.food[item.food!]}/${FOOD_MAX}`;
    case 'trainingTicket': return `보유 ${save.training.tickets}/${BALANCE.provisional.training.ticketsMax}`;
    case 'reroll': return `보유 ${save.shared.rerollTickets}/${SX.rerollMax}`;
    case 'deckSlot': return `배치 ${BALANCE.provisional.expedition.deckSize + save.shared.deckSlots}칸 (+${save.shared.deckSlots}/${SX.deckSlotPrices.length})`;
    case 'calm':
    case 'wake':
    case 'medicine': return `보관 ${save.shared.items[item.id] ?? 0}/${CONSUMABLE_CAP}`;
    case 'tileDraw': return save.tiles.unlocked ? `뽑은 횟수 ${save.tiles.draws}` : null;
    case 'rareTile': return null;
    case 'gear': return `장비 ${save.shared.gear.items.length}/${BALANCE.provisional.gear.cap}`;
  }
}

/** 골드 탭 줄 (GDD 25-9 표 순서). 수련권은 수련이 열린 트랙(5단계 이상)에서만 보인다 */
export function goldRows(save: SaveData, faction: FactionConfig): ShopRow[] {
  return GOLD_ITEMS.filter((it) => it.kind !== 'trainingTicket' || trainingOpen(save)).map((it) => {
    const price = goldPrice(save, it);
    const block = goldBlock(save, it) ?? (price !== null && wallet(save, 'gold') < price ? shortText('gold', price - wallet(save, 'gold')) : null);
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

function record(save: SaveData, id: string, currency: ShopCurrency, price: number, nowMs: number, result?: string): void {
  save.runLog.shopPurchases.push({ at: nowMs, factionId: save.factionId, itemId: id, currency, price, ...(result ? { result } : {}) });
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
    let tile: string | undefined;
    let firstDraw: boolean | undefined;
    switch (gold.kind) {
      case 'food':
        addFood(save.shared.food, gold.food!, 1);
        detail = `${faction.foodNames[gold.food!]} ${save.shared.food[gold.food!]}/${FOOD_MAX}`;
        break;
      case 'calm':
      case 'wake':
      case 'medicine':
        storeConsumable(save, gold.id);
        detail = `${gold.name} → 보관함 (${save.shared.items[gold.id]}개)`;
        break;
      case 'trainingTicket':
        save.training.tickets = Math.min(BALANCE.provisional.training.ticketsMax, save.training.tickets + 1);
        detail = `수련권 ${save.training.tickets}장`;
        break;
      case 'tileDraw': {
        firstDraw = save.tiles.draws === 0;
        tile = rollTileDraw(save.factionId, firstDraw, rand);
        save.tiles.draws++;
        save.tiles.collection[tile] = (save.tiles.collection[tile] ?? 0) + 1;
        detail = `${tileName(tile, save.factionId)} → 보관함 (${save.tiles.collection[tile]}장)`;
        break;
      }
      case 'rareTile': {
        const pool = rareTilePool(save);
        tile = pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))]!;
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
        detail = `타일 배치 ${BALANCE.provisional.expedition.deckSize + save.shared.deckSlots}칸`;
        break;
      case 'gear':
        detail = giveGear(save, faction, rollGear({ kind: gold.gearKind!, grade: 'normal', star: gearStarOf(save) }, rand), 'shop', nowMs);
        break;
    }
    save.shared.tradeCoins -= price;
    record(save, id, 'gold', price, nowMs, tile);
    return { ok: true, id, price, currency: 'gold', detail, ...(tile ? { tile } : {}), ...(firstDraw !== undefined ? { firstDraw } : {}) };
  }
  const c = getCosmetic(id);
  if (!c || (c.category === 'skin' && !canWear(save.factionId, c.look)) || !shopVisible(c, save.shared.cosmetics, files)) return { ok: false, reason: '지금은 살 수 없는 품목이다' };
  if (save.shared.cosmetics.includes(id)) return { ok: false, reason: '이미 가지고 있다' };
  const price = cosmeticPrice(c);
  if (save.shared.jade < price) return { ok: false, reason: shortText('jade', price - save.shared.jade) };
  save.shared.jade -= price;
  save.shared.cosmetics.push(id);
  record(save, id, 'jade', price, nowMs);
  return { ok: true, id, price, currency: 'jade', detail: `${cosmeticName(c, faction)} → 보관함 (보관함에서 착용)` };
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

// ── 떠돌이 상인 (GDD 85장 5번, C.140): 와 있는 동안 품목 칸마다 한 개씩, 골드로. 티어는 보이지 않는다(품목 등급만) ──

/** 상인 품목 효과 한 줄 */
export function wandererEffect(itemId: string, faction: FactionConfig): string {
  const w = getWandererItem(itemId);
  if (!w) return '';
  const n = wandererAmount(itemId);
  switch (w.kind) {
    case 'food': return `${faction.foodNames[w.food!]} +${n} (종류별 보관 ${FOOD_MAX}개까지)`;
    case 'reroll': return `다시 뽑기권 +${n} (보유 ${SX.rerollMax}장까지)`;
    case 'calm': return `${faction.riskGaugeName} −${n} · 보관함에 쌓이고 보관함에서 쓴다`;
    case 'wake': return `컨디션 +${n} · 보관함에 쌓이고 보관함에서 쓴다`;
    case 'trainingTicket': return `지금 트랙 수련권 +${n} (최대 ${BALANCE.provisional.training.ticketsMax})`;
    case 'rareTile': return `드문 타일(${TD.groups.rare!.map((id) => tileName(id, faction.id)).join('·')}) 1장 → 보관함`;
    case 'elixir': return `${faction.riskGaugeName} −${n} · 컨디션 가득 · 쇠약 해소 · 보관함에서 쓴다`;
    case 'pet': return '아직 없는 펫 무작위 1마리 → 보관함 펫 탭';
    case 'gear': return `${GEAR_GRADE_NAMES[w.grade as GearGrade]} 장비 1개 (종류·능력치 무작위${w.grade === 'epic' || w.grade === 'legendary' ? ' · 특수 효과 1줄' : ''} · ★ = 지금 단계 권장) → 장비 화면`;
  }
}

/** 상인 품목을 효과 때문에 못 사는 이유 (돈과 별개) */
function wandererBlock(save: SaveData, itemId: string): string | null {
  const w = getWandererItem(itemId);
  if (!w) return '모르는 품목이다';
  switch (w.kind) {
    case 'food': return save.shared.food[w.food!] >= FOOD_MAX ? `보관 가득 (${FOOD_MAX}/${FOOD_MAX})` : null;
    case 'reroll': return save.shared.rerollTickets >= SX.rerollMax ? `보유 가득 (${SX.rerollMax}/${SX.rerollMax})` : null;
    case 'trainingTicket': return save.training.tickets >= BALANCE.provisional.training.ticketsMax ? '수련권 가득' : null;
    case 'rareTile': return save.tiles.unlocked && tileDrawGroup('rare', save.factionId).length > 0 ? null : TILES_LOCKED_TEXT;
    case 'pet': return pickNewPet(save.shared.pets, () => 0) === null ? '펫을 다 가졌다' : null;
    case 'gear': return gearFullText(save);
    default: return canStoreConsumable(save, itemId) ? null : `보관 가득 (${CONSUMABLE_CAP}/${CONSUMABLE_CAP})`;
  }
}

/** 상인 줄 (상인이 와 있을 때만, 없으면 []). id = 품목 id(한 방문에 중복 없음), have = 등급 */
export function wandererRows(save: SaveData, faction: FactionConfig): (ShopRow & { grade: WandererGrade; sold: boolean })[] {
  const v = save.shared.wanderer.visit;
  if (!v) return [];
  return v.stock.map((st) => {
    const w = getWandererItem(st.itemId)!;
    const block = st.sold ? '팔림' : wandererBlock(save, st.itemId) ?? (wallet(save, 'gold') < st.price ? shortText('gold', st.price - wallet(save, 'gold')) : null);
    return { id: st.itemId, currency: 'gold' as const, name: w.name, effect: wandererEffect(st.itemId, faction), price: st.price, canBuy: block === null, lock: block, have: WANDERER_GRADE_NAMES[w.grade], confirm: false, grade: w.grade, sold: st.sold };
  });
}

/** 상인에게 산다: 돈·상한을 다시 확인하고 효과를 낸다(소모품은 보관함으로). 런 로그 wanderer 에 buy. 실패하면 아무것도 바뀌지 않는다. rand = 희귀 타일 굴림 */
export function buyWandererItem(save: SaveData, faction: FactionConfig, itemId: string, nowMs: number = Date.now(), rand: () => number = Math.random): BuyResult {
  const v = save.shared.wanderer.visit;
  const st = v?.stock.find((x) => x.itemId === itemId);
  const w = getWandererItem(itemId);
  if (!v || !st || !w) return { ok: false, reason: '상인이 팔지 않는 품목이다' };
  if (st.sold) return { ok: false, reason: '이미 팔렸다' };
  const row = wandererRows(save, faction).find((r) => r.id === itemId)!;
  if (!row.canBuy) return { ok: false, reason: row.lock ?? '살 수 없다' };
  const n = wandererAmount(itemId);
  let detail = '';
  let tile: string | undefined;
  switch (w.kind) {
    case 'food':
      addFood(save.shared.food, w.food!, n);
      detail = `${faction.foodNames[w.food!]} ${save.shared.food[w.food!]}/${FOOD_MAX}`;
      break;
    case 'reroll':
      save.shared.rerollTickets = Math.min(SX.rerollMax, save.shared.rerollTickets + n);
      detail = `다시 뽑기권 ${save.shared.rerollTickets}장`;
      break;
    case 'trainingTicket':
      save.training.tickets = Math.min(BALANCE.provisional.training.ticketsMax, save.training.tickets + n);
      detail = `수련권 ${save.training.tickets}장`;
      break;
    case 'rareTile': {
      const pool = tileDrawGroup('rare', save.factionId);
      tile = pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))]!;
      save.tiles.collection[tile] = (save.tiles.collection[tile] ?? 0) + 1;
      detail = `${tileName(tile, save.factionId)} → 보관함 (${save.tiles.collection[tile]}장)`;
      break;
    }
    case 'pet': {
      const id = pickNewPet(save.shared.pets, rand)!;
      grantPet(save.shared.pets, id, nowMs);
      save.runLog.pets.push({ at: nowMs, factionId: save.factionId, kind: 'get', petId: id, source: 'wanderer' });
      detail = `${faction.petNames[id] ?? id} → 보관함 펫 탭`;
      break;
    }
    case 'gear':
      detail = giveGear(save, faction, rollGear({ grade: w.grade as GearGrade, star: gearStarOf(save) }, rand), 'wanderer', nowMs);
      break;
    default:
      storeConsumable(save, itemId);
      detail = `${w.name} → 보관함 (${save.shared.items[itemId]}개)`;
  }
  save.shared.tradeCoins -= st.price;
  st.sold = true;
  save.runLog.wanderer.push({ at: nowMs, factionId: save.factionId, kind: 'buy', tier: v.tier, itemId, price: st.price });
  return { ok: true, id: itemId, price: st.price, currency: 'gold', detail, ...(tile ? { tile } : {}) };
}

// ── 장비 (GDD 91장 2번, C.150): 기본 상점 '장비' 탭 = 노말 종류별 1개씩, 떠돌이 상인 = 레어·영웅·전설 (품목 등급 = 장비 등급) ──

/** 종류별 주 능력치 안내 (GDD 91장 4번) */
const GEAR_STAT_HINT: Record<string, string> = { weapon: '힘 또는 지능 1줄', armor: '체력·방어 2줄', shoes: '속도 1줄', accessory: '치명·정신력 등 1~2줄' };

/** 상점 장비 종류 이름 (종족 설정 gearSlotNames: 그 종류의 첫 칸 이름) */
function gearKindLabel(item: GoldItemDef, faction: FactionConfig): string {
  const slot = item.gearKind === 'accessory' ? 'acc1' : item.gearKind!;
  return faction.gearSlotNames[slot];
}

/** 상점·상인 장비의 ★ = 지금 단계의 권장 난이도 */
function gearStarOf(save: Pick<SaveData, 'evolution'>): number {
  return recommendedDifficulty(save.evolution.tierIndex);
}

function gearFullText(save: Pick<SaveData, 'shared'>): string | null {
  return gearFull(save.shared.gear) ? `장비 보관 가득 (${BALANCE.provisional.gear.cap}/${BALANCE.provisional.gear.cap})` : null;
}

/** 산 장비를 보관함에 (런 로그 gear get). 가득은 줄 단계에서 막는다 */
function giveGear(save: SaveData, faction: FactionConfig, roll: GearRoll, source: 'shop' | 'wanderer', nowMs: number): string {
  const it = grantGear(save.shared.gear, roll, nowMs)!;
  save.runLog.gear.push({ at: nowMs, factionId: save.factionId, kind: 'get', uid: it.uid, gearKind: it.kind, grade: it.grade, star: it.star, source });
  const slot = it.kind === 'accessory' ? 'acc1' : it.kind;
  return `${GEAR_GRADE_NAMES[it.grade]} ${faction.gearSlotNames[slot]} → 장비 화면`;
}
