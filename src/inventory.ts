// 보관함 (GDD 86장 4·5번, C.140): 산 것·얻은 것을 카테고리(음식·소모품·장비·스킨·타일·기타)별로 보여 주고, 보관함에서 쓰고(먹이·소모품) 끼운다(스킨·꾸밈).
// 장비·스킨은 사면 바로 끼지 않는다 — 여기서 equip. 종족 무관: 이름은 종족 설정(먹이·리스크 게이지)·데이터, 수치는 balance.ts.
// 화면(C.141 카드형 UI)은 inventoryOf 가 돌려준 목록만 그린다. 상점 품목·가격은 그대로(src/shop.ts).
import { BALANCE } from './config/balance';
import { cosmeticName, COSMETIC_ITEMS, GOLD_ITEMS, getCosmetic, getGoldItem, getWandererItem, ITEM_CATEGORIES, WANDERER_ITEMS, shopVisible, type ItemCategory, type MedicineCure } from './data/shop';
import { canWear } from './data/skins';
import { deckTilesFor, tileName } from './data/tiles';
import { FOOD_IDS, type FactionConfig, type FoodId } from './engine/faction';
import { takeFood } from './engine/food';
import { CARE_STATUS_NAMES, doNestAction } from './engine/nest';
import { cureNest } from './game';
import { wandererAmount } from './engine/wanderer';
import { CONSUMABLE_CAP, isWorn, medicineText, unwearCategory, wearCosmetic } from './shop';
import type { SaveData } from './game';
import { getPet, PET_IDS } from './data/pets';
import { affinityOf, nextAffinityLaps, petBonus, PET_MAX_LEVEL, setActivePet } from './engine/pet';
import type { GearRecord, PetRecord } from './engine/runLog';
import { GEAR_GRADE_NAMES, GEAR_SLOTS, getGearSpecial, slotsForKind, type GearGrade, type GearKind, type GearSlot } from './data/gear';
import { enhanceCost, enhanceGear, equipGear, equippedSlotOf, findGear, gearStatsOf, sellGearItem, unequipGear, type GearItem, type GearRoll, type GearStat } from './engine/gear';
import { statName } from './data/elements';

const SX = BALANCE.shop;
const COND_MAX = BALANCE.provisional.expedition.conditionMax;

/** 보관함에 쌓이는 소모품 id: 상점 정화제·각성제·약(GDD 102-4) + 상인 소모품(정화·각성·정수). 효과는 useInventoryItem */
export const CONSUMABLE_IDS: readonly string[] = [
  ...GOLD_ITEMS.filter((g) => g.kind === 'calm' || g.kind === 'wake' || g.kind === 'medicine').map((g) => g.id),
  ...WANDERER_ITEMS.filter((w) => w.kind === 'calm' || w.kind === 'wake' || w.kind === 'elixir').map((w) => w.id),
];

/** 소모품 효과 한 줄: cure = 상인 정수(쇠약 풀기), medicine = 약이 푸는 상태 (GDD 102-4, 수치는 안 바뀜) */
type ConsumableEffect = { risk: number; condition: number; cure: boolean; medicine?: MedicineCure };
function consumableEffect(id: string): ConsumableEffect | null {
  const g = getGoldItem(id);
  if (g?.kind === 'medicine') return { risk: 0, condition: 0, cure: false, medicine: g.cures! };
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
  if (e.medicine) return medicineText(e.medicine);
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
  /** 장비 (GDD 91장): 등급 · 종류 · 낀 칸 (안 꼈으면 null) */
  gear?: { grade: GearGrade; kind: GearKind; slot: GearSlot | null };
}

/** 소모품을 지금 못 쓰는 이유 */
function consumableLock(save: SaveData, id: string, faction: Pick<FactionConfig, 'riskGaugeName'>): string | null {
  const e = consumableEffect(id);
  if (!e) return '쓸 수 없다';
  if (save.activeExpedition != null) return '원정 중인 캐릭터에는 못 쓴다';
  if (save.nest.dead) return `${CARE_STATUS_NAMES.dead} — 부활만 할 수 있다`;
  if (e.medicine) return medicineNeeded(save, e.medicine) ? null : `${medicineStatusName(e.medicine)} 상태가 아니다`;
  const helpsRisk = e.risk > 0 && save.nest.risk > 0;
  const helpsCond = e.condition > 0 && save.nest.condition < COND_MAX;
  const helpsCure = e.cure && save.nest.weakened;
  if (helpsRisk || helpsCond || helpsCure) return null;
  return e.risk > 0 && e.condition === 0 ? `${faction.riskGaugeName} 이미 0` : e.condition > 0 && e.risk === 0 ? '컨디션 이미 가득' : '쓸 필요가 없다';
}

/** 보관함 목록 (카테고리 순서 = ITEM_CATEGORIES). 장비는 C.150 부터 (GDD 91장) */
export function inventoryOf(save: SaveData, faction: FactionConfig, files?: readonly string[]): InventoryEntry[] {
  const out: InventoryEntry[] = [];
  // 음식: 먹이 종류별 (먹이 주기 = 둥지 행동과 같은 효과)
  for (const f of FOOD_IDS) {
    const n = save.shared.food[f];
    if (n <= 0) continue;
    const fx = BALANCE.provisional.nest.foods[f];
    out.push({ id: `food-${f}`, category: 'food', name: faction.foodNames[f], count: n, detail: `${faction.fullnessName} +${fx.hunger}${fx.condition ? ` · 컨디션 ${fx.condition > 0 ? '+' : ''}${fx.condition}` : ''}`, action: 'use', lock: save.activeExpedition != null ? '원정 중인 캐릭터에는 못 쓴다' : save.nest.dead ? `${CARE_STATUS_NAMES.dead} — 부활만 할 수 있다` : null });
  }
  // 소모품: 보관한 정화제·각성제·상인 소모품 + 다시 뽑기권(흡수 화면에서 씀)
  for (const id of CONSUMABLE_IDS) {
    const n = save.shared.items[id] ?? 0;
    if (n > 0) out.push({ id, category: 'consumable', name: consumableName(id), count: n, detail: consumableText(id, faction), action: 'use', lock: consumableLock(save, id, faction) });
  }
  if (save.shared.rerollTickets > 0) out.push({ id: 'reroll', category: 'consumable', name: getGoldItem('reroll')?.name ?? '다시 뽑기권', count: save.shared.rerollTickets, detail: `${faction.absorbActionName} 화면에서 특성 후보를 한 번 다시 뽑는다`, action: null, lock: null });
  // 장비 (GDD 91장): 낀 것 먼저(칸 순서), 그다음 등급 높은 것·최근 것. 장착·해제·강화·판매는 상세 창
  for (const it of sortedGear(save)) {
    const slot = equippedSlotOf(save.shared.gear, it.uid);
    out.push({
      id: it.uid, category: 'equipment', name: gearName(it, faction), count: 1, detail: gearLineText(it, faction),
      action: slot ? 'unequip' : 'equip', lock: save.activeExpedition != null ? '원정 중에는 바꿀 수 없다' : null, gear: { grade: it.grade, kind: it.kind, slot },
    });
  }
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
    if (save.nest.dead) return { ok: false, reason: `${CARE_STATUS_NAMES.dead} — 부활만 할 수 있다` };
    if (!takeFood(save.shared.food, f)) return { ok: false, reason: '먹이가 없다' };
    doNestAction(save.nest, 'feed', f);
    return { ok: true, detail: `${faction.fullnessName} ${Math.max(0, 100 - Math.round(save.nest.hunger))}` }; // 화면은 배부름 = 100 − 허기 (C.63, GDD 100장 #58)
  }
  const e = consumableEffect(id);
  if (!e || (save.shared.items[id] ?? 0) <= 0) return { ok: false, reason: '가진 소모품이 아니다' };
  const lock = consumableLock(save, id, faction);
  if (lock) return { ok: false, reason: lock };
  if (e.medicine) {
    cureNest(save, e.medicine);
    takeItem(save, id);
    return { ok: true, detail: `${medicineStatusName(e.medicine)} 풀림` };
  }
  save.nest.risk = Math.max(0, save.nest.risk - e.risk);
  save.nest.condition = Math.min(COND_MAX, save.nest.condition + e.condition);
  if (e.cure) save.nest.weakened = false;
  takeItem(save, id);
  return { ok: true, detail: `${faction.riskGaugeName} ${Math.round(save.nest.risk)} · 컨디션 ${Math.round(save.nest.condition)}` };
}

/** 보관함 소모품 하나 쓰기 */
function takeItem(save: SaveData, id: string): void {
  save.shared.items[id] = (save.shared.items[id] ?? 1) - 1;
  if (save.shared.items[id]! <= 0) delete save.shared.items[id];
}

/** 약 상태 이름 (GDD 102장, 두 종족 공통) */
export function medicineStatusName(c: MedicineCure): string {
  return c === 'collapsed' ? CARE_STATUS_NAMES.collapsed : c === 'weak' ? CARE_STATUS_NAMES.weak : CARE_STATUS_NAMES.tired;
}

/** 그 약이 지금 쓸모 있나 (그 상태에 걸려 있다) */
function medicineNeeded(save: Pick<SaveData, 'nest'>, c: MedicineCure): boolean {
  return c === 'collapsed' ? save.nest.collapsed : c === 'weak' ? save.nest.weakened : save.nest.tired;
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
    case 'belly': return `원정 배부름 줄어듦 −${pct(petBonus(carry, 'belly'))}`;
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

// ── 장비 (GDD 91장, C.150 가칭) ──

const GRADE_ORDER: Record<GearGrade, number> = { legendary: 0, epic: 1, rare: 2, normal: 3 };

/** 보관함 장비 순서: 낀 것(칸 순서) → 등급 높은 것 → 최근 것 */
export function sortedGear(save: Pick<SaveData, 'shared'>): GearItem[] {
  const g = save.shared.gear;
  const worn = GEAR_SLOTS.map((s) => g.equipped[s]).filter((u): u is string => u !== null).map((u) => findGear(g, u)).filter((i): i is GearItem => !!i);
  const rest = g.items.filter((i) => !worn.includes(i)).sort((a, b) => GRADE_ORDER[a.grade] - GRADE_ORDER[b.grade] || b.star - a.star || b.gotAt - a.gotAt);
  return [...worn, ...rest];
}

/** 칸 이름 (종족 설정 gearSlotNames). 같은 이름 칸이 둘이면(장신구 1·2) 뒤에 번호 */
export function gearSlotName(slot: GearSlot, faction: Pick<FactionConfig, 'gearSlotNames'>): string {
  const name = faction.gearSlotNames[slot];
  const same = GEAR_SLOTS.filter((s) => faction.gearSlotNames[s] === name);
  return same.length > 1 ? `${name} ${same.indexOf(slot) + 1}` : name;
}

/** 장비 종류 이름 = 그 종류 첫 칸 이름 (종족 설정) */
export function gearKindName(kind: GearKind, faction: Pick<FactionConfig, 'gearSlotNames'>): string {
  return faction.gearSlotNames[slotsForKind(kind)[0]!];
}

/** 장비 이름: "레어 송곳니 +2" */
export function gearName(it: Pick<GearItem, 'grade' | 'kind'> & { plus?: number }, faction: Pick<FactionConfig, 'gearSlotNames'>): string {
  return `${GEAR_GRADE_NAMES[it.grade]} ${gearKindName(it.kind, faction)}${it.plus ? ` +${it.plus}` : ''}`;
}

const statLabel = (s: GearStat, factionId: string): string => (s === 'crit' ? '치명' : statName(s, factionId));

/** 능력치 줄 문구: "힘 +5 · 치명 +1.5%" (plus 를 주면 그 단계로) */
export function gearStatText(it: Pick<GearItem, 'stats' | 'plus'>, faction: Pick<FactionConfig, 'id'>, plus?: number): string {
  const st = gearStatsOf(it, plus);
  return (Object.keys(st) as GearStat[]).map((k) => `${statLabel(k, faction.id)} +${k === 'crit' ? pct(st[k]!) : st[k]}`).join(' · ');
}

/** 특수 효과 문구 (없으면 ''): "조(爪) 블록 피해 +10%" · "강적·보스에게 피해 +8%" · "치명 피해 +0.15배" · "전투 시작 보호막 (최대 체력 3%)" */
export function gearSpecialText(it: Pick<GearItem, 'special'>, faction: Pick<FactionConfig, 'families'>): string {
  const def = it.special ? getGearSpecial(it.special.id) : undefined;
  if (!def || !it.special) return '';
  const v = it.special.value;
  switch (def.effect) {
    case 'family': return `${faction.families.find((f) => f.id === def.family)?.name ?? def.family} 블록 피해 +${pct(v)}`;
    case 'elite': return `강적·보스에게 피해 +${pct(v)}`;
    case 'critDamage': return `치명 피해 +${Math.round(v * 100) / 100}배`;
    case 'shield': return `전투 시작 보호막 (최대 체력 ${pct(v)})`;
  }
}

/** 카드·상세 한 줄: 능력치 + 특수 효과 */
export function gearLineText(it: Pick<GearItem, 'stats' | 'plus' | 'special'>, faction: Pick<FactionConfig, 'id' | 'families'>): string {
  return [gearStatText(it, faction), gearSpecialText(it, faction)].filter(Boolean).join(' · ');
}

function gearLog(save: SaveData, it: Pick<GearItem, 'kind' | 'grade' | 'star'> & { uid?: string }, rec: Omit<GearRecord, 'at' | 'factionId' | 'gearKind' | 'grade' | 'star' | 'uid'>, nowMs: number): void {
  save.runLog.gear.push({ at: nowMs, factionId: save.factionId, gearKind: it.kind, grade: it.grade, star: it.star, ...(it.uid ? { uid: it.uid } : {}), ...rec });
}

/** 장비 끼기 (slot 없으면 빈 칸 → 첫 칸). 원정 중에는 못 바꾼다. 원래 그 칸에 있던 장비는 빠진다. 런 로그 gear equip(빠진 것은 unequip) */
export function equipGearItem(save: SaveData, uid: string, slot?: GearSlot, nowMs: number = Date.now()): GearSlot | null {
  if (save.activeExpedition != null) return null;
  const g = save.shared.gear;
  const it = findGear(g, uid);
  if (!it) return null;
  const target = slot ?? slotsForKind(it.kind).find((s) => g.equipped[s] === null) ?? slotsForKind(it.kind)[0]!;
  const prev = g.equipped[target] ? findGear(g, g.equipped[target]!) : undefined;
  const to = equipGear(g, uid, slot);
  if (!to) return null;
  if (prev && prev.uid !== uid) gearLog(save, prev, { kind: 'unequip', slot: to }, nowMs);
  gearLog(save, it, { kind: 'equip', slot: to }, nowMs);
  return to;
}

/** 장비 빼기 */
export function unequipGearItem(save: SaveData, uid: string, nowMs: number = Date.now()): boolean {
  if (save.activeExpedition != null) return false;
  const g = save.shared.gear;
  const it = findGear(g, uid);
  const slot = equippedSlotOf(g, uid);
  if (!it || !slot || !unequipGear(g, slot)) return false;
  gearLog(save, it, { kind: 'unequip', slot }, nowMs);
  return true;
}

/** 강화 (골드, 실패 없음, GDD 91장 5번). 막히면 이유 */
export function enhanceGearItem(save: SaveData, uid: string, nowMs: number = Date.now()): { ok: true; plus: number; gold: number } | { ok: false; reason: string } {
  const it = findGear(save.shared.gear, uid);
  if (!it) return { ok: false, reason: '없는 장비다' };
  const cost = enhanceCost(it);
  if (cost === null) return { ok: false, reason: `최대 강화 (+${BALANCE.provisional.gear.maxPlus})` };
  if (save.shared.tradeCoins < cost) return { ok: false, reason: `골드가 ${cost - save.shared.tradeCoins} 모자라다` };
  const plus = enhanceGear(save.shared.gear, uid)!;
  save.shared.tradeCoins -= cost;
  gearLog(save, it, { kind: 'enhance', plus, gold: cost }, nowMs);
  return { ok: true, plus, gold: cost };
}

/** 팔기 (낀 장비는 못 판다) */
export function sellGearEntry(save: SaveData, uid: string, nowMs: number = Date.now()): number | null {
  const it = findGear(save.shared.gear, uid);
  if (!it) return null;
  const gold = sellGearItem(save.shared.gear, uid);
  if (gold === null) return null;
  save.shared.tradeCoins += gold;
  gearLog(save, it, { kind: 'sell', gold, plus: it.plus }, nowMs);
  return gold;
}

/** 장비 런 로그 → 알림 문구 (얻음·자동 판매만) */
export function gearNoticeOf(rec: GearRecord, faction: Pick<FactionConfig, 'gearSlotNames'>): { eyebrow: string; title: string; meta?: string } | null {
  const name = gearName({ grade: rec.grade as GearGrade, kind: rec.gearKind as GearKind }, faction);
  const where = rec.source === 'shop' ? '상점' : rec.source === 'wanderer' ? '떠돌이 상인' : rec.from === 'boss' ? '보스 드롭' : rec.from === 'elite' ? '강적 드롭' : '원정 드롭';
  if (rec.kind === 'get') return { eyebrow: '장비', title: `새 장비: ${name}`, meta: `${where} · ★${rec.star ?? 1} · 보관함 장비 탭에서 장착` };
  if (rec.kind === 'autoSell') return { eyebrow: '장비', title: `보관함 가득 → ${name} 판매`, meta: `골드 +${rec.gold ?? 0}` };
  return null;
}

/** 원정 중 드롭 알림 문구 (귀환 전, 런 로그 없이 굴린 값으로) */
export function gearDropText(roll: GearRoll, faction: Pick<FactionConfig, 'gearSlotNames' | 'id' | 'families'>): string {
  return `${gearName(roll, faction)} · ${gearLineText({ ...roll, plus: 0 }, faction)}`;
}
