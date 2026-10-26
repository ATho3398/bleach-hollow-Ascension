// 보관함 (GDD 86장 4·5번, C.140): 산 것·얻은 것을 카테고리(음식·소모품·장비·스킨·타일·기타)별로 보여 주고, 보관함에서 쓰고(먹이·소모품) 끼운다(스킨·꾸밈).
// 장비·스킨은 사면 바로 끼지 않는다 — 여기서 equip. 종족 무관: 이름은 종족 설정(먹이·리스크 게이지)·데이터, 수치는 balance.ts.
// 화면(C.141 카드형 UI)은 inventoryOf 가 돌려준 목록만 그린다. 상점 품목·가격은 그대로(src/shop.ts).
import { BALANCE } from './config/balance';
import { cosmeticName, COSMETIC_ITEMS, GOLD_ITEMS, getCosmetic, getGoldItem, getWandererItem, ITEM_CATEGORIES, WANDERER_ITEMS, shopVisible, type ItemCategory } from './data/shop';
import { canWear } from './data/skins';
import { deckTilesFor, tileName } from './data/tiles';
import { FOOD_IDS, type FactionConfig, type FoodId } from './engine/faction';
import { takeFood } from './engine/food';
import { doNestAction } from './engine/nest';
import { wandererAmount } from './engine/wanderer';
import { CONSUMABLE_CAP, isWorn, unwearCategory, wearCosmetic } from './shop';
import type { SaveData } from './game';
import { getPet, PET_IDS } from './data/pets';
import { affinityOf, nextAffinityLaps, petBonus, PET_MAX_LEVEL, setActivePet } from './engine/pet';
import type { PetRecord } from './engine/runLog';

const SX = BALANCE.shop;
const COND_MAX = BALANCE.provisional.expedition.conditionMax;

/** 보관함에 쌓이는 소모품 id: 상점 정화제·각성제 + 상인 소모품(정화·각성·정수). 효과는 useInventoryItem */
export const CONSUMABLE_IDS: readonly string[] = [
  ...GOLD_ITEMS.filter((g) => g.kind === 'calm' || g.kind === 'wake').map((g) => g.id),
  ...WANDERER_ITEMS.filter((w) => w.kind === 'calm' || w.kind === 'wake' || w.kind === 'elixir').map((w) => w.id),
];

/** 소모품 효과 한 줄 */
type ConsumableEffect = { risk: number; condition: number; cure: boolean };
function consumableEffect(id: string): ConsumableEffect | null {
  const g = getGoldItem(id);
  if (g?.kind === 'calm') return { risk: SX.calmRisk, condition: 0, cure: false };
  if (g?.kind === 'wake') return { risk: 0, condition: SX.wakeCondition, cure: false };
  const w = getWandererItem(id);
  if (w?.kind === 'calm') return { risk: wandererAmount(id), condition: 0, cure: false };
  if (w?.kind === 'wake') return { risk: 0, condition: wandererAmount(id), cure: false };
  if (w?.kind === 'elixir') return { risk: wandererAmount(id), condition: COND_MAX, cure: true };
  return null;
}

/** 소모품 효과 설명 (종족 이름은 설정에서) */
export function consumableText(id: string, faction: Pick<FactionConfig, 'riskGaugeName'>): string {
  const e = consumableEffect(id);
  if (!e) return '';
  const parts = [e.risk > 0 ? `${faction.riskGaugeName} −${e.risk}` : '', e.condition > 0 ? (e.condition >= COND_MAX ? '컨디션 가득' : `컨디션 +${e.condition}`) : '', e.cure ? '쇠약 해소' : ''].filter(Boolean);
  return `${parts.join(' · ')} (보관함에서 사용, 지금 캐릭터에 바로)`;
}

/** 소모품 이름 */
export function consumableName(id: string): string {
  return getGoldItem(id)?.name ?? getWandererItem(id)?.name ?? id;
}

/** 보관함 한 칸 (카드 하나) */
export interface InventoryEntry {
  /** 품목 id: 먹이 `food-<종류>`, 소모품·꾸밈 = 품목 id, 타일 = 타일 id, 기타 = `training-ticket`·`reroll` */
  id: string;
  category: ItemCategory;
  name: string;
  count: number;
  /** 효과·설명 한 줄 */
  detail: string;
  /** 누르면 할 수 있는 일: use = 쓰기(먹이·소모품), equip/unequip = 끼기·빼기(스킨·꾸밈), take/leave = 펫 데리고 가기·두고 가기, null = 보기만 */
  action: 'use' | 'equip' | 'unequip' | 'take' | 'leave' | null;
  /** 지금 못 쓰는 이유 (쓸 수 있으면 null) */
  lock: string | null;
  /** 꾸밈: 분류 id (스킨·오라 …) */
  cosmeticCategory?: string;
}

/** 소모품을 지금 못 쓰는 이유 */
function consumableLock(save: SaveData, id: string, faction: Pick<FactionConfig, 'riskGaugeName'>): string | null {
  const e = consumableEffect(id);
  if (!e) return '쓸 수 없다';
  if (save.activeExpedition != null) return '원정 중인 캐릭터에는 못 쓴다';
  const helpsRisk = e.risk > 0 && save.nest.risk > 0;
  const helpsCond = e.condition > 0 && save.nest.condition < COND_MAX;
  const helpsCure = e.cure && save.nest.weakened;
  if (helpsRisk || helpsCond || helpsCure) return null;
  return e.risk > 0 && e.condition === 0 ? `${faction.riskGaugeName} 이미 0` : e.condition > 0 && e.risk === 0 ? '컨디션 이미 가득' : '쓸 필요가 없다';
}

/** 보관함 목록 (카테고리 순서 = ITEM_CATEGORIES). 장비는 아직 품목이 없어 비어 있다(화면은 "준비 중") */
export function inventoryOf(save: SaveData, faction: FactionConfig, files?: readonly string[]): InventoryEntry[] {
  const out: InventoryEntry[] = [];
  // 음식: 먹이 종류별 (먹이 주기 = 둥지 행동과 같은 효과)
  for (const f of FOOD_IDS) {
    const n = save.shared.food[f];
    if (n <= 0) continue;
    const fx = BALANCE.provisional.nest.foods[f];
    out.push({ id: `food-${f}`, category: 'food', name: faction.foodNames[f], count: n, detail: `허기 −${fx.hunger}${fx.condition ? ` · 컨디션 ${fx.condition > 0 ? '+' : ''}${fx.condition}` : ''}`, action: 'use', lock: save.activeExpedition != null ? '원정 중인 캐릭터에는 못 쓴다' : null });
  }
  // 소모품: 보관한 정화제·각성제·상인 소모품 + 다시 뽑기권(흡수 화면에서 씀)
  for (const id of CONSUMABLE_IDS) {
    const n = save.shared.items[id] ?? 0;
    if (n > 0) out.push({ id, category: 'consumable', name: consumableName(id), count: n, detail: consumableText(id, faction), action: 'use', lock: consumableLock(save, id, faction) });
  }
  if (save.shared.rerollTickets > 0) out.push({ id: 'reroll', category: 'consumable', name: getGoldItem('reroll')?.name ?? '다시 뽑기권', count: save.shared.rerollTickets, detail: '흡수 화면에서 특성 후보를 한 번 다시 뽑는다', action: null, lock: null });
  // 펫 (GDD 90장): 가진 펫, 1마리만 데리고 다닌다
  for (const id of PET_IDS) {
    const o = save.shared.pets.owned[id];
    if (!o) continue;
    const on = save.shared.pets.active === id;
    out.push({ id, category: 'pet', name: petName(id, faction), count: 1, detail: `${on ? '데리고 다니는 중 · ' : ''}${petEffectText(id, affinityOf(o.laps))}`, action: on ? 'leave' : 'take', lock: save.activeExpedition != null ? '원정 중에는 바꿀 수 없다' : null });
  }
  // 스킨·꾸밈: 가진 것 (이 종족이 입을 수 있는 스킨만), 끼기·빼기
  for (const c of COSMETIC_ITEMS) {
    if (!save.shared.cosmetics.includes(c.id) || (c.category === 'skin' && !canWear(save.factionId, c.look))) continue;
    if (c.category === 'device' && !shopVisible(c, save.shared.cosmetics, files) && !c.free) continue;
    const worn = isWorn(save, c);
    out.push({ id: c.id, category: 'skin', name: cosmeticName(c, faction), count: 1, detail: worn ? '착용 중' : '보유', action: worn ? 'unequip' : 'equip', lock: null, cosmeticCategory: c.category });
  }
  // 타일: 가진 타일 보기 (덱 없음 — 원정 배치 화면에서 전부 보고 놓는다)
  for (const t of deckTilesFor(save.factionId)) {
    const n = save.tiles.collection[t.id] ?? 0;
    if (n > 0) out.push({ id: t.id, category: 'tile', name: tileName(t.id, save.factionId), count: n, detail: '원정 배치 화면에서 길에 놓는다', action: null, lock: null });
  }
  // 기타: 수련권
  if (save.training.tickets > 0) out.push({ id: 'training-ticket', category: 'etc', name: getGoldItem('training-ticket')?.name ?? '수련권', count: save.training.tickets, detail: '수련장에서 쓴다 (지금 트랙)', action: null, lock: null });
  return out.sort((a, b) => ITEM_CATEGORIES.indexOf(a.category) - ITEM_CATEGORIES.indexOf(b.category));
}

export type InventoryResult = { ok: true; detail: string } | { ok: false; reason: string };

/** 보관함에서 쓴다: 먹이(`food-<종류>`) = 먹이 주기, 소모품 = 효과를 지금 캐릭터에 바로. 실패하면 아무것도 바뀌지 않는다 */
export function useInventoryItem(save: SaveData, faction: FactionConfig, id: string): InventoryResult {
  if (id.startsWith('food-')) {
    const f = id.slice(5) as FoodId;
    if (!(FOOD_IDS as readonly string[]).includes(f)) return { ok: false, reason: '모르는 먹이다' };
    if (save.activeExpedition != null) return { ok: false, reason: '원정 중인 캐릭터에는 못 쓴다' };
    if (!takeFood(save.shared.food, f)) return { ok: false, reason: '먹이가 없다' };
    doNestAction(save.nest, 'feed', f);
    return { ok: true, detail: `허기 ${Math.round(save.nest.hunger)}` };
  }
  const e = consumableEffect(id);
  if (!e || (save.shared.items[id] ?? 0) <= 0) return { ok: false, reason: '가진 소모품이 아니다' };
  const lock = consumableLock(save, id, faction);
  if (lock) return { ok: false, reason: lock };
  save.nest.risk = Math.max(0, save.nest.risk - e.risk);
  save.nest.condition = Math.min(COND_MAX, save.nest.condition + e.condition);
  if (e.cure) save.nest.weakened = false;
  save.shared.items[id] = (save.shared.items[id] ?? 1) - 1;
  if (save.shared.items[id]! <= 0) delete save.shared.items[id];
  return { ok: true, detail: `${faction.riskGaugeName} ${Math.round(save.nest.risk)} · 컨디션 ${Math.round(save.nest.condition)}` };
}

/** 보관함에서 끼기 (스킨·꾸밈, 지금 트랙). 가진 것만 */
export function equipInventoryItem(save: SaveData, id: string): boolean {
  return wearCosmetic(save, id);
}

/** 보관함에서 빼기 (그 분류를 기본으로) */
export function unequipInventoryItem(save: SaveData, id: string): boolean {
  const c = getCosmetic(id);
  if (!c || !isWorn(save, c)) return false;
  unwearCategory(save, c.category);
  return true;
}

// ── 펫 (GDD 90장, C.144 가칭) ──

/** 펫 이름 (종족 설정 petNames, 없으면 id) */
export function petName(id: string, faction: Pick<FactionConfig, 'petNames'>): string {
  return faction.petNames?.[id] ?? id;
}

const pct = (v: number): string => `${Math.round(v * 1000) / 10}%`;

/** 펫 효과 한 줄 (그 친밀도 기준) */
export function petEffectText(id: string, level: number): string {
  const carry = { id, level };
  switch (getPet(id)?.effect) {
    case 'gold': return `원정 골드 +${pct(petBonus(carry, 'gold'))}`;
    case 'belly': return `원정 허기 오름 −${pct(petBonus(carry, 'belly'))}`;
    case 'guard': return `전투 시작 보호막 (최대 체력 ${pct(petBonus(carry, 'guard'))})`;
    case 'seek': return `떠돌이 상인 확률 +${pct(petBonus(carry, 'seekWanderer'))} · 바퀴 끝 타일 +1장 ${pct(petBonus(carry, 'seekTile'))}`;
    default: return '';
  }
}

/** 친밀도 한 줄: "친밀도 2/5 · 다음까지 12바퀴 (18/30)" */
export function petAffinityText(save: Pick<SaveData, 'shared'>, id: string): string {
  const o = save.shared.pets.owned[id];
  if (!o) return '';
  const lv = affinityOf(o.laps);
  const next = nextAffinityLaps(o.laps);
  return `친밀도 ${lv}/${PET_MAX_LEVEL}${next === null ? ' · 최대' : ` · 다음까지 ${next - o.laps}바퀴 (${o.laps}/${next})`}`;
}

/** 데리고 가기(id) / 두고 가기(null). 원정 중에는 못 바꾼다. 런 로그 pets take/leave */
export function choosePet(save: SaveData, id: string | null, nowMs: number = Date.now()): boolean {
  if (save.activeExpedition != null) return false;
  const prev = save.shared.pets.active;
  if (!setActivePet(save.shared.pets, id)) return false;
  if (prev) save.runLog.pets.push({ at: nowMs, factionId: save.factionId, kind: 'leave', petId: prev });
  if (id) save.runLog.pets.push({ at: nowMs, factionId: save.factionId, kind: 'take', petId: id });
  return true;
}

/** 펫 런 로그 한 건 → 알림 문구 (얻음·친밀도 오름·골드로 바뀜만, 데리고 감·두고 감은 null) */
export function petNoticeOf(rec: PetRecord, faction: Pick<FactionConfig, 'petNames'>): { eyebrow: string; title: string; meta?: string } | null {
  const name = petName(rec.petId, faction);
  switch (rec.kind) {
    case 'get': return { eyebrow: '펫', title: `새 펫: ${name}`, meta: `${rec.source === 'evolution' ? '첫 진화 선물' : rec.source === 'wanderer' ? '떠돌이 상인' : '원정 바퀴 끝 보상'} · 보관함 펫 탭에서 데리고 간다` };
    case 'level': return { eyebrow: '펫', title: `${name} 친밀도 ${rec.level}/${PET_MAX_LEVEL}`, meta: petEffectText(rec.petId, rec.level ?? 1) };
    case 'dupGold': return { eyebrow: '펫', title: `이미 있는 ${name} → 골드 +${rec.gold ?? 0}` };
    default: return null;
  }
}
