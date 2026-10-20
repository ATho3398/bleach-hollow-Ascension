// 상점 품목 표 (GDD 25-9, S-16 C.60, provisional). 품목 id·분류·이름·효과 종류만 — 가격·상한·효과량은 balance.ts provisional.shop.
// 골드 탭 = 소모품·편의(효과 종류 kind 를 엔진 src/shop.ts 가 읽는다), 영옥 탭 = 꾸밈(분류 category + 모양 키 look → 디자인 토큰 --bha-cos-<분류>-<look>).
// 스킨 품목은 스킨 표(src/data/skins)에서 만든다(id `skin-<스킨 id>`). 종족 분기 없음: 먹이 이름은 종족 설정, 스킨은 스킨 표의 종족 필드로 거른다.
import { FOOD_IDS, type FactionConfig, type FoodId } from '../../engine/faction';
import { SKINS, getSkin, skinLabel } from '../skins';
import raw from './items.json';

export const GOLD_KINDS = ['food', 'calm', 'wake', 'trainingTicket', 'rareTile', 'reroll', 'deckSlot'] as const;
export type GoldKind = (typeof GOLD_KINDS)[number];

export const COSMETIC_CATEGORIES = ['skin', 'aura', 'tint', 'trail', 'fx', 'bar', 'shell', 'plate', 'enter', 'evo', 'absorb', 'cut', 'win', 'talk', 'room', 'frame'] as const;
export type CosmeticCategory = (typeof COSMETIC_CATEGORIES)[number];
/** 스킨을 뺀 꾸밈 분류 (착용은 트랙의 wear, 스킨은 트랙의 skin) */
export type WearCategory = Exclude<CosmeticCategory, 'skin'>;
export const WEAR_CATEGORIES = COSMETIC_CATEGORIES.filter((c): c is WearCategory => c !== 'skin');

export interface GoldItemDef {
  id: string;
  kind: GoldKind;
  /** kind 'food' 의 먹이 종류 (이름은 종족 설정 foodNames) */
  food?: FoodId;
  /** 표시 이름 (먹이는 없음 — 종족 설정) */
  name?: string;
}

export interface CosmeticItemDef {
  id: string;
  category: CosmeticCategory;
  name: string;
  /** 모양 키: 색 토큰 --bha-cos-<분류>-<look>. 스킨은 스킨 id */
  look: string;
}

export interface CategoryDef {
  id: CosmeticCategory;
  name: string;
  /** 보이는 곳 한 줄 */
  where: string;
}

function parseGold(r: unknown): GoldItemDef {
  const g = (r ?? {}) as Record<string, unknown>;
  const errors: string[] = [];
  if (typeof g.id !== 'string' || !g.id) errors.push('id');
  if (!(GOLD_KINDS as readonly unknown[]).includes(g.kind)) errors.push(`kind: ${GOLD_KINDS.join(' | ')}`);
  if (g.kind === 'food' && !(FOOD_IDS as readonly unknown[]).includes(g.food)) errors.push('food');
  if (g.kind !== 'food' && (typeof g.name !== 'string' || !g.name)) errors.push('name');
  if (errors.length) throw new Error(`상점 골드 품목 데이터 오류 (${String(g.id ?? '?')}): ${errors.join(', ')}`);
  return { id: g.id as string, kind: g.kind as GoldKind, ...(g.food ? { food: g.food as FoodId } : {}), ...(g.name ? { name: g.name as string } : {}) };
}

function parseCosmetic(r: unknown): CosmeticItemDef {
  const c = (r ?? {}) as Record<string, unknown>;
  const errors: string[] = [];
  if (typeof c.id !== 'string' || !c.id) errors.push('id');
  if (!(WEAR_CATEGORIES as readonly unknown[]).includes(c.category)) errors.push(`category: ${WEAR_CATEGORIES.join(' | ')}`);
  if (typeof c.name !== 'string' || !c.name) errors.push('name');
  if (typeof c.look !== 'string' || !/^[a-z]+$/.test(c.look)) errors.push('look: 영문 소문자');
  if (errors.length) throw new Error(`상점 꾸밈 품목 데이터 오류 (${String(c.id ?? '?')}): ${errors.join(', ')}`);
  return { id: c.id as string, category: c.category as CosmeticCategory, name: c.name as string, look: c.look as string };
}

export const SHOP_PROVISIONAL: boolean = raw.provisional;
export const GOLD_ITEMS: readonly GoldItemDef[] = raw.gold.map(parseGold);
export const CATEGORIES: readonly CategoryDef[] = raw.categories.map((c) => ({ id: c.id as CosmeticCategory, name: c.name, where: c.where }));

/** 스킨 품목 id (`skin-<스킨 id>`) */
export const skinItemId = (skinId: string): string => `skin-${skinId}`;
/** 스킨 품목 id → 스킨 id (스킨 품목이 아니면 null) */
export function skinIdOfItem(itemId: string): string | null {
  const id = itemId.startsWith('skin-') ? itemId.slice(5) : '';
  return getSkin(id) ? id : null;
}

/** 꾸밈 품목: 스킨 표의 스킨(앞쪽) + 데이터의 꾸밈 */
export const COSMETIC_ITEMS: readonly CosmeticItemDef[] = [
  ...SKINS.map((s) => ({ id: skinItemId(s.id), category: 'skin' as const, name: skinLabel(s), look: s.id })),
  ...raw.cosmetics.map(parseCosmetic),
];

export function getGoldItem(id: string): GoldItemDef | undefined {
  return GOLD_ITEMS.find((x) => x.id === id);
}

export function getCosmetic(id: string | null | undefined): CosmeticItemDef | undefined {
  return id ? COSMETIC_ITEMS.find((x) => x.id === id) : undefined;
}

export function categoryName(c: CosmeticCategory): string {
  return CATEGORIES.find((x) => x.id === c)?.name ?? c;
}

/** 꾸밈 색 토큰 이름 (디자인 토큰 --bha-cos-*): 분류·모양 키에서 만든다. 화면 코드는 이 토큰을 참조만 한다 */
export function cosmeticToken(c: Pick<CosmeticItemDef, 'category' | 'look'>, part = ''): string {
  return `--bha-cos-${c.category}-${c.look}${part ? `-${part}` : ''}`;
}

/** 화면에 보이는 꾸밈 이름: 종족 설정 cosmetics.names 가 있으면 그것(방 테마·말풍선 팩, GDD 25-11), 없으면 데이터 이름 */
export function cosmeticName(c: Pick<CosmeticItemDef, 'id' | 'name'>, faction?: Pick<FactionConfig, 'cosmetics'> | null): string {
  return faction?.cosmetics?.names?.[c.id] ?? c.name;
}
