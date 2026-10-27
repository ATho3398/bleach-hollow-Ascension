// 상점 품목 표 (GDD 25-9, S-16 C.60 — v5.70 가격 확정, C.84). 품목 id·분류·이름·효과 종류만 — 가격·상한·효과량은 balance.ts shop(확정).
// 골드 탭 = 소모품·편의(효과 종류 kind 를 엔진 src/shop.ts 가 읽는다), 영옥 탭 = 꾸밈(분류 category + 모양 키 look → 디자인 토큰 --bha-cos-<분류>-<look>).
// 스킨 품목은 스킨 표(src/data/skins)에서 만든다(id `skin-<스킨 id>`). 종족 분기 없음: 먹이 이름은 종족 설정, 스킨은 스킨 표의 종족 필드로 거른다.
// 키링·기기 디자인(GDD 27장, C.62): 키링 = CSS/SVG 모양(종족 설정 keyringShapes 가 덮음) 또는 그림 `keyring-<id>.png`, 기기 디자인 = 그림 `device-<id>-front/back.png`
// + 화면 구멍·고리 좌표(그림 대비 %). 기기 디자인은 그림이 들어온 것만 상점에 보이고, source 'reward' 는 상점에 안 나온다(보상으로만).
import { FOOD_IDS, type FactionConfig, type FoodId } from '../../engine/faction';
import { SKINS, getSkin, skinLabel } from '../skins';
import { ART_FILES, findArtFile } from '../art/files';
import { isGearKind, type GearKind } from '../gear';
import raw from './items.json';
import wandererRaw from './wanderer.json';

export const GOLD_KINDS = ['food', 'calm', 'wake', 'medicine', 'trainingTicket', 'tileDraw', 'rareTile', 'reroll', 'deckSlot', 'gear'] as const;
export type GoldKind = (typeof GOLD_KINDS)[number];

export const COSMETIC_CATEGORIES = ['skin', 'aura', 'tint', 'trail', 'fx', 'bar', 'shell', 'plate', 'enter', 'evo', 'absorb', 'cut', 'win', 'talk', 'room', 'frame', 'keyring', 'device'] as const;
export type CosmeticCategory = (typeof COSMETIC_CATEGORIES)[number];
/** 스킨을 뺀 꾸밈 분류 (착용은 트랙의 wear, 스킨은 트랙의 skin) */
export type WearCategory = Exclude<CosmeticCategory, 'skin'>;
export const WEAR_CATEGORIES = COSMETIC_CATEGORIES.filter((c): c is WearCategory => c !== 'skin');

/** 아이템 카테고리 (GDD 86장 5번, C.140): 상점 탭·보관함 탭이 같은 구분을 쓴다. 장비는 아직 품목 없음(준비 중) */
export const ITEM_CATEGORIES = ['food', 'consumable', 'equipment', 'pet', 'skin', 'tile', 'etc'] as const;
export type ItemCategory = (typeof ITEM_CATEGORIES)[number];
export const ITEM_CATEGORY_NAMES: Record<ItemCategory, string> = { food: '음식', consumable: '소모품', equipment: '장비', pet: '펫', skin: '스킨', tile: '타일', etc: '기타' };

/** '스킨' 탭 안의 하위 탭 (C.153, GDD 95장 A3): 상점·보관함이 같은 구분을 쓴다. 꾸밈 분류(skin·fx·trail·keyring·device …) → 하위 탭 */
export const SKIN_SUBTABS = [['character', '캐릭터'], ['attackFx', '공격 이펙트'], ['moveFx', '이동 이펙트'], ['keyring', '키링'], ['device', '기기'], ['etc', '연출·꾸밈']] as const;
export type SkinSubTab = (typeof SKIN_SUBTABS)[number][0];
const SKIN_SUB_OF: Partial<Record<CosmeticCategory, SkinSubTab>> = {
  skin: 'character', tint: 'character', aura: 'character',
  fx: 'attackFx', cut: 'attackFx', absorb: 'attackFx', bar: 'attackFx',
  trail: 'moveFx',
  keyring: 'keyring',
  device: 'device',
};
/** 스킨 목록(상점·보관함)에 보이는 꾸밈인가 (GDD 99장 3, C.163): 옛 기기 껍데기 색(shell: 뼈·먹물·금박)과 견본·시험 기기(test)는 목록에서 뺀다 — 데이터·세이브는 그대로 */
export function skinListed(c: Pick<CosmeticItemDef, 'category' | 'test'> | undefined | null): boolean {
  return !!c && c.category !== 'shell' && !c.test;
}
/** 꾸밈 분류 → 스킨 하위 탭 (표에 없는 분류·분류 없음은 '연출·꾸밈') */
export function skinSubOf(category: string | undefined | null): SkinSubTab {
  return SKIN_SUB_OF[category as CosmeticCategory] ?? 'etc';
}
/** 하위 탭이 비었을 때 문구 */
export const SKIN_SUB_EMPTY = '아직 없음';

export interface GoldItemDef {
  id: string;
  kind: GoldKind;
  /** 아이템 카테고리 (GDD 86장) */
  category: ItemCategory;
  /** kind 'food' 의 먹이 종류 (이름은 종족 설정 foodNames) */
  food?: FoodId;
  /** 표시 이름 (먹이·장비는 없음 — 종족 설정) */
  name?: string;
  /** kind 'gear' 의 장비 종류 (GDD 91장 2번: 기본 상점 = 노말) */
  gearKind?: GearKind;
  /** kind 'medicine' 이 푸는 상태 (GDD 102-4): collapsed 쓰러짐 · weak 쇠약 · tired 피곤 */
  cures?: MedicineCure;
  /** 전투용 소모품 (GDD 108장 3번): 장비 화면 소모품 칸에 넣을 수 있고, 넣은 것을 전투 [소모품 사용]이 쓴다 */
  battle?: true;
}

/** 약이 푸는 상태 (GDD 102-4) */
export const MEDICINE_CURES = ['collapsed', 'weak', 'tired'] as const;
export type MedicineCure = (typeof MEDICINE_CURES)[number];

export interface CosmeticItemDef {
  id: string;
  category: CosmeticCategory;
  name: string;
  /** 견본·시험 기기 (목록에 안 보인다, GDD 99장 3) */
  test?: boolean;
  /** 모양 키: 색 토큰 --bha-cos-<분류>-<look>. 스킨은 스킨 id */
  look: string;
  /** 얻는 곳 (기기 디자인, GDD 27장): shop = 상점 영옥 탭, reward = 보상으로만(상점에 안 나옴). 없으면 shop */
  source?: CosmeticSource;
  /** 기기 디자인: 그림 대비 % 좌표 — screen = LCD 화면이 들어갈 구멍, buttons = 그림에 그린 버튼 4개 누름 영역, ring = 키링 고리 (모양은 자유, GDD 27장 v5.33) */
  device?: DeviceArtSpec;
  /** 키링 그림의 구멍(매다는 점) 위치, 그림 대비 %. 없으면 위 가운데 (50, 6) */
  hole?: Pt;
  /** 기본으로 주는 꾸밈 (GDD 29장): 모든 세이브가 처음부터 보유하고, 입은 것이 없는 트랙은 열 때 한 번 자동 착용. 상점 줄은 "가짐" */
  free?: boolean;
}

/** 얻는 곳: shop = 상점 영옥 탭, reward = 보상으로만, default = 기본 제공(모든 세이브 보유, 상점에 안 나옴, GDD 30장) */
export type CosmeticSource = 'shop' | 'reward' | 'default';
export interface Pt {
  x: number;
  y: number;
}
export interface PctRect {
  x: number;
  y: number;
  w: number;
  h: number;
}
/** 그림 기기의 버튼 4개: 위·아래·확정·뒤로(취소) */
export const DEVICE_BUTTONS = ['up', 'down', 'ok', 'back'] as const;
export type DeviceButton = (typeof DEVICE_BUTTONS)[number];
export interface DeviceArtSpec {
  /** 'v2' = 기기 그림 규격 frame-v2 (GDD 33장·33-2): UI 묶음(구멍 + 버튼 4개)만 규격(frameV2.ts)이고 그림 크기·모양·구멍 위치는 자유. 없으면 frame-v1 */
  frame?: 'v2';
  /** frame-v2: 화면 구멍 왼쪽 위 좌표(그림 픽셀). 그림마다 정한다 — 화면·버튼 자리는 규격이라 screen·buttons 는 쓰지 않는다(0) */
  hole?: [number, number];
  screen: PctRect;
  buttons: Record<DeviceButton, PctRect>;
  ring: Pt;
}

/** 키링 모양 (CSS/SVG 로 그리는 것, GDD 27장). 품목 look 또는 종족 설정 keyringShapes 가 이 중 하나 */
export const KEYRING_SHAPES = ['charm', 'mask', 'butterfly', 'bell', 'bonebell', 'orb'] as const;
export type KeyringShape = (typeof KEYRING_SHAPES)[number];

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
  if (g.kind === 'gear' && !isGearKind(g.gearKind)) errors.push('gearKind');
  if (g.kind === 'medicine' && !(MEDICINE_CURES as readonly unknown[]).includes(g.cures)) errors.push(`cures: ${MEDICINE_CURES.join(' | ')}`);
  if (g.kind !== 'food' && g.kind !== 'gear' && (typeof g.name !== 'string' || !g.name)) errors.push('name');
  if (!(ITEM_CATEGORIES as readonly unknown[]).includes(g.category)) errors.push(`category: ${ITEM_CATEGORIES.join(' | ')}`);
  if (errors.length) throw new Error(`상점 골드 품목 데이터 오류 (${String(g.id ?? '?')}): ${errors.join(', ')}`);
  return { id: g.id as string, kind: g.kind as GoldKind, category: g.category as ItemCategory, ...(g.food ? { food: g.food as FoodId } : {}), ...(g.name ? { name: g.name as string } : {}), ...(g.kind === 'gear' ? { gearKind: g.gearKind as GearKind } : {}), ...(g.kind === 'medicine' ? { cures: g.cures as MedicineCure } : {}), ...(g.battle === true ? { battle: true as const } : {}) };
}

function parseCosmetic(r: unknown): CosmeticItemDef {
  const c = (r ?? {}) as Record<string, unknown>;
  const errors: string[] = [];
  if (typeof c.id !== 'string' || !c.id) errors.push('id');
  if (!(WEAR_CATEGORIES as readonly unknown[]).includes(c.category)) errors.push(`category: ${WEAR_CATEGORIES.join(' | ')}`);
  if (typeof c.name !== 'string' || !c.name) errors.push('name');
  if (typeof c.look !== 'string' || !/^[a-z]+$/.test(c.look)) errors.push('look: 영문 소문자');
  if (c.category === 'keyring' && !(KEYRING_SHAPES as readonly unknown[]).includes(c.look)) errors.push(`look: ${KEYRING_SHAPES.join(' | ')}`);
  if (c.hole !== undefined && !isPct(c.hole, ['x', 'y'])) errors.push('hole: { x, y } 0~100');
  if (c.free !== undefined && c.free !== true) errors.push('free: true');
  if (c.free === true && c.category !== 'keyring') errors.push('free: 키링만 (착용 분류가 하나뿐인 것)');
  if (errors.length) throw new Error(`상점 꾸밈 품목 데이터 오류 (${String(c.id ?? '?')}): ${errors.join(', ')}`);
  return { id: c.id as string, category: c.category as CosmeticCategory, name: c.name as string, look: c.look as string, ...(c.hole ? { hole: c.hole as Pt } : {}), ...(c.free === true ? { free: true } : {}) };
}

const isPct = (v: unknown, keys: string[]): boolean =>
  typeof v === 'object' && v !== null && keys.every((k) => { const n = (v as Record<string, unknown>)[k]; return typeof n === 'number' && n >= 0 && n <= 100; });

/** 기기 디자인 품목 (GDD 27장): id `device-<look>`, 그림 좌표·얻는 곳 */
function parseDevice(r: unknown): CosmeticItemDef {
  let c = (r ?? {}) as Record<string, unknown>;
  const errors: string[] = [];
  if (typeof c.look !== 'string' || !/^[a-z]+$/.test(c.look)) errors.push('look: 영문 소문자');
  if (c.id !== `device-${String(c.look)}`) errors.push('id: device-<look>');
  if (typeof c.name !== 'string' || !c.name) errors.push('name');
  if (c.source !== 'shop' && c.source !== 'reward' && c.source !== 'default') errors.push('source: shop | reward | default');
  const rect = (v: unknown): v is PctRect => isPct(v, ['x', 'y', 'w', 'h']) && (v as PctRect).w > 0 && (v as PctRect).h > 0;
  if (c.frame !== undefined && c.frame !== 'v2') errors.push("frame: 'v2' 또는 없음");
  const v2 = c.frame === 'v2';
  // frame-v2 는 화면·버튼 크기·자리가 UI 묶음 규격이라 데이터에는 구멍 왼쪽 위(hole)와 고리만 적는다
  const holeOk = Array.isArray(c.hole) && c.hole.length === 2 && c.hole.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0);
  if (v2) {
    if (!holeOk) errors.push('hole: [x, y] 그림 픽셀(0 이상)');
    const z = { x: 0, y: 0, w: 1, h: 1 };
    c = { ...c, screen: z, buttons: Object.fromEntries(DEVICE_BUTTONS.map((b) => [b, z])) };
  }
  if (!rect(c.screen)) errors.push('screen: { x, y, w, h } 0~100');
  const bt = (c.buttons ?? {}) as Record<string, unknown>;
  for (const b of DEVICE_BUTTONS) if (!rect(bt[b])) errors.push(`buttons.${b}: { x, y, w, h } 0~100`);
  if (!isPct(c.ring, ['x', 'y'])) errors.push('ring: { x, y } 0~100');
  if (errors.length) throw new Error(`기기 디자인 데이터 오류 (${String(c.id ?? '?')}): ${errors.join(', ')}`);
  const pr = (v: unknown): PctRect => { const r = v as PctRect; return { x: r.x, y: r.y, w: r.w, h: r.h }; };
  const buttons = Object.fromEntries(DEVICE_BUTTONS.map((b) => [b, pr(bt[b])])) as Record<DeviceButton, PctRect>;
  return { id: c.id as string, category: 'device', name: c.name as string, look: c.look as string, source: c.source as CosmeticSource, ...(c.source === 'default' ? { free: true } : {}), ...(c.test === true ? { test: true } : {}), device: { ...(v2 ? { frame: 'v2' as const, hole: [(c.hole as number[])[0]!, (c.hole as number[])[1]!] as [number, number] } : {}), screen: pr(c.screen), buttons, ring: c.ring as Pt } };
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
  ...raw.devices.map(parseDevice),
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

/** 키링 그림 모양: 종족 설정 keyringShapes(품목 id → 모양)가 있으면 그것, 없으면 품목 look (알 수 없는 모양이면 look) */
export function keyringShapeOf(c: Pick<CosmeticItemDef, 'id' | 'look'>, faction?: Pick<FactionConfig, 'cosmetics'> | null): KeyringShape {
  const s = faction?.cosmetics?.keyringShapes?.[c.id];
  return (KEYRING_SHAPES as readonly string[]).includes(s ?? '') ? (s as KeyringShape) : (c.look as KeyringShape);
}

/** 기기 디자인 그림 (public/art/device-<look>-front/back.png). 앞면이 없으면 null — 그 디자인은 상점에 안 보이고 입어도 기본 기기 */
export function deviceArt(c: Pick<CosmeticItemDef, 'look'>, files: readonly string[] = ART_FILES): { front: string; back: string | null } | null {
  const front = findArtFile(`device.${c.look}.front`, files);
  return front ? { front, back: findArtFile(`device.${c.look}.back`, files) } : null;
}

/** 기기 옆면 그림 (public/art/device-<look>-side.png, GDD 29장): 세로 = 앞면 높이, 가로 = 두께. 없으면 null = 몸체 색 CSS 두께 */
export function deviceSideArt(c: Pick<CosmeticItemDef, 'look'>, files: readonly string[] = ART_FILES): string | null {
  return findArtFile(`device.${c.look}.side`, files);
}

/** 기본으로 주는 꾸밈 (GDD 29장) */
export const FREE_COSMETICS: readonly CosmeticItemDef[] = COSMETIC_ITEMS.filter((c) => c.free === true);

/** 얻는 곳 한 줄 (기기 디자인 목록에 보이는 말, GDD 30장). 새 디자인이 오면 사용자가 알려 준 조건대로 source 만 정한다 */
export function sourceNote(c: Pick<CosmeticItemDef, 'source'>): string {
  return c.source === 'default' ? '기본 제공' : c.source === 'reward' ? '보상으로 얻음' : '상점에서 구매';
}

/** 키링 그림 (public/art/keyring-<look>-<종족 모양>.png 먼저, 다음 keyring-<look>.png). 없으면 null = CSS/SVG 모양 */
export function keyringArt(c: Pick<CosmeticItemDef, 'look'>, shape: string, files: readonly string[] = ART_FILES): string | null {
  return (shape !== c.look ? findArtFile(`keyring.${c.look}.${shape}`, files) : null) ?? findArtFile(`keyring.${c.look}`, files);
}

/** 상점 영옥 탭에 보이나: 기기 디자인은 그림이 있고 상점 판매(또는 이미 보유)일 때만, 나머지는 늘 */
export function shopVisible(c: CosmeticItemDef, owned: readonly string[], files: readonly string[] = ART_FILES): boolean {
  if (c.category === 'skin' && getSkin(c.look)?.startOnly) return false;
  if (c.category !== 'device') return c.source !== 'reward' || owned.includes(c.id);
  if (c.source === 'default') return false;
  return deviceArt(c, files) !== null && (c.source === 'shop' || owned.includes(c.id));
}

// ── 떠돌이 상인 특별 품목 (GDD 85장 5번, C.140 provisional): 상인만 판다. 가격·효과량은 balance.ts provisional.wanderer.items ──
export const WANDERER_GRADES = ['normal', 'rare', 'epic', 'legendary'] as const;
export type WandererGrade = (typeof WANDERER_GRADES)[number];
export const WANDERER_GRADE_NAMES: Record<WandererGrade, string> = { normal: '보통', rare: '희귀', epic: '영웅', legendary: '전설' };
export const WANDERER_KINDS = ['food', 'reroll', 'calm', 'wake', 'trainingTicket', 'rareTile', 'elixir', 'pet', 'gear'] as const;
export type WandererKind = (typeof WANDERER_KINDS)[number];

export interface WandererItemDef {
  id: string;
  name: string;
  grade: WandererGrade;
  kind: WandererKind;
  /** kind 'food' 의 먹이 종류 */
  food?: FoodId;
  category: ItemCategory;
}

function parseWanderer(r: unknown): WandererItemDef {
  const w = (r ?? {}) as Record<string, unknown>;
  const errors: string[] = [];
  if (typeof w.id !== 'string' || !w.id.startsWith('w-')) errors.push('id: w-…');
  if (typeof w.name !== 'string' || !w.name) errors.push('name');
  if (!(WANDERER_GRADES as readonly unknown[]).includes(w.grade)) errors.push(`grade: ${WANDERER_GRADES.join(' | ')}`);
  if (!(WANDERER_KINDS as readonly unknown[]).includes(w.kind)) errors.push(`kind: ${WANDERER_KINDS.join(' | ')}`);
  if (w.kind === 'food' && !(FOOD_IDS as readonly unknown[]).includes(w.food)) errors.push('food');
  if (!(ITEM_CATEGORIES as readonly unknown[]).includes(w.category)) errors.push(`category: ${ITEM_CATEGORIES.join(' | ')}`);
  if (errors.length) throw new Error(`떠돌이 상인 품목 데이터 오류 (${String(w.id ?? '?')}): ${errors.join(', ')}`);
  return { id: w.id as string, name: w.name as string, grade: w.grade as WandererGrade, kind: w.kind as WandererKind, ...(w.food ? { food: w.food as FoodId } : {}), category: w.category as ItemCategory };
}

export const WANDERER_PROVISIONAL: boolean = wandererRaw.provisional;
export const WANDERER_ITEMS: readonly WandererItemDef[] = wandererRaw.items.map(parseWanderer);

export function getWandererItem(id: string): WandererItemDef | undefined {
  return WANDERER_ITEMS.find((x) => x.id === id);
}

/** 품목 id → 아이템 카테고리 (골드 품목·상인 품목은 데이터 필드, 꾸밈은 전부 '스킨' — 외형 꾸밈). 모르는 id 는 null */
export function itemCategoryOf(id: string): ItemCategory | null {
  return getGoldItem(id)?.category ?? getWandererItem(id)?.category ?? (getCosmetic(id) ? 'skin' : null);
}
