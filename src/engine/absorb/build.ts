// 흡수 빌드(특성 보유·슬롯) 순수 로직 (GDD 4장, 4-1). 종족 무관 — 이름·문구는 데이터/종족 설정에서 읽는다.
// 모두 임시 데이터(provisional)를 쓴다.

import { BALANCE } from '../../config/balance';
import { getTrait } from '../../data/traits';
import { NORMAL_ELEMENT } from '../../data/elements';
import type { AttackCategory, PassiveStat } from '../../data/schema';
import { getFaction } from '../../data/factions';
import type { CombatParams, CombatSkill, FamilyCombat } from '../combat/combat';
import { resolveMaxChain } from '../faction';

const AX = BALANCE.provisional.absorb;

/** 보유 특성과 슬롯. 저장 구조(SaveData.build)이자 원정 중 사본이다 */
export interface BuildState {
  /** 지금 가진 모든 특성 id (장착 여부 무관, 중복 없음) */
  owned: string[];
  /** 슬롯(BALANCE.absorb.slotCount 칸). 장착한 특성 id 또는 null */
  slots: (string | null)[];
  /** 장착한 순서 (C.47, 세이브 형식 14): 마지막이 가장 최근. 진화 속성·분류가 동률이면 최근 장착을 따른다 (GDD 20-5). 옛 세이브는 슬롯 순서로 채운다 */
  equipOrder?: string[];
  /** 속성 강화 횟수 (C.136, GDD 84장 8번, 세이브 형식 40): 속성 id → 그 속성 적을 흡수한 횟수(상한 없이 센다). 효과는 enhanceLevel 이 상한(100)에서 자른다 */
  enhance?: Record<string, number>;
}

const EH = AX.enhance;

/** 속성 강화 효과 단계: min(흡수 횟수, 상한 100) */
export function enhanceLevel(b: Pick<BuildState, 'enhance'>, element: string): number {
  return Math.min(EH.max, Math.max(0, Math.floor(b.enhance?.[element] ?? 0)));
}

/** 속성 강화 +1 (흡수할 때): 상한 뒤에도 횟수는 센다. 새 횟수를 돌려준다 */
export function addEnhance(b: BuildState, element: string): number {
  const m = (b.enhance ??= {});
  m[element] = (m[element] ?? 0) + 1;
  return m[element]!;
}

/** 강화 단계 → 공격 블록 위력 가산 (C.147): 앞 earlyLevels 단계는 earlyPerLevel, 그 뒤는 attackPerLevel */
export function enhanceAttackBonus(level: number): number {
  const lv = Math.min(EH.max, Math.max(0, Math.floor(level)));
  const early = Math.min(lv, EH.earlyLevels);
  return EH.earlyPerLevel * early + EH.attackPerLevel * (lv - early);
}

/** 그 속성 공격 특성 블록 위력 배율: 1 + enhanceAttackBonus(단계). 노멀은 기본 공격 블록에도 (buildCombatParams basicAttackEnhance) */
export function enhanceAttackMultiplier(b: Pick<BuildState, 'enhance'>, element: string): number {
  return 1 + enhanceAttackBonus(enhanceLevel(b, element));
}

/** 기본 막기·회복 블록 위력 배율: 1 + min(guardHealMax, guardHealPerLevel × 모든 속성 단계 합) */
export function enhanceGuardHealMultiplier(b: Pick<BuildState, 'enhance'>): number {
  const sum = Object.keys(b.enhance ?? {}).reduce((a, el) => a + enhanceLevel(b, el), 0);
  return 1 + Math.min(EH.guardHealMax, EH.guardHealPerLevel * sum);
}

export function newBuild(): BuildState {
  return { owned: [], slots: Array.from({ length: BALANCE.absorb.slotCount }, () => null), equipOrder: [], enhance: {} };
}

export function cloneBuild(b: BuildState): BuildState {
  return { owned: [...b.owned], slots: [...b.slots], equipOrder: [...(b.equipOrder ?? [])], enhance: { ...(b.enhance ?? {}) } };
}

/** 장착 순서 기록 갱신: 이 특성을 가장 최근으로 */
function noteEquip(b: BuildState, traitId: string): void {
  const order = (b.equipOrder ??= []).filter((id) => id !== traitId);
  order.push(traitId);
  b.equipOrder = order;
}

/** 장착한 특성의 최근 순번 (클수록 최근, 기록이 없으면 슬롯 순서) */
export function equipRecency(b: BuildState, traitId: string): number {
  const i = (b.equipOrder ?? []).indexOf(traitId);
  return i >= 0 ? 1000 + i : b.slots.indexOf(traitId);
}

export type BuildResult = { ok: true } | { ok: false; reason: string };

export function emptySlot(b: BuildState): number {
  return b.slots.indexOf(null);
}

export function isFull(b: BuildState): boolean {
  return emptySlot(b) < 0;
}

/** 새 특성을 얻는다: 보유 목록에 더하고, 빈 슬롯이 있으면 장착, 가득 차 있으면 replaceSlot 의 특성과 교체(옛 특성은 보유에 남음). 교체 슬롯이 없으면 포기(얻지 않음).
 *  (해방 블록 슬롯은 C.167 에 폐지 — GDD 98장 B) */
export function gainTrait(b: BuildState, traitId: string, replaceSlot?: number | null): BuildResult {
  getTrait(traitId);
  if (b.owned.includes(traitId)) return { ok: false, reason: '이미 가진 특성이다' };
  const free = emptySlot(b);
  if (free >= 0) {
    b.owned.push(traitId);
    b.slots[free] = traitId;
    noteEquip(b, traitId);
    return { ok: true };
  }
  if (replaceSlot === undefined || replaceSlot === null) return { ok: false, reason: '슬롯이 가득 찼다 (교체할 슬롯을 고르거나 포기)' };
  if (!Number.isInteger(replaceSlot) || replaceSlot < 0 || replaceSlot >= b.slots.length) return { ok: false, reason: '없는 슬롯이다' };
  b.owned.push(traitId);
  b.slots[replaceSlot] = traitId;
  noteEquip(b, traitId);
  return { ok: true };
}

/** 둥지 슬롯 정리: 보유한 특성을 슬롯에 장착(이미 다른 슬롯에 있으면 그 칸은 비운다). traitId null 이면 비움 */
export function setSlot(b: BuildState, slot: number, traitId: string | null): BuildResult {
  if (!Number.isInteger(slot) || slot < 0 || slot >= b.slots.length) return { ok: false, reason: '없는 슬롯이다' };
  if (traitId === null) {
    b.slots[slot] = null;
    return { ok: true };
  }
  if (!b.owned.includes(traitId)) return { ok: false, reason: '가지고 있지 않은 특성이다' };
  const at = b.slots.indexOf(traitId);
  if (at >= 0) b.slots[at] = null;
  b.slots[slot] = traitId;
  noteEquip(b, traitId);
  return { ok: true };
}

/** 슬롯 안 속성별 특성 개수 */
export function elementCounts(b: BuildState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of b.slots) {
    if (!id) continue;
    const e = getTrait(id).element;
    out[e] = (out[e] ?? 0) + 1;
  }
  return out;
}

/** 계열의 공격 분류 (종족 설정 families[].category, GDD 20-1). 종족을 모르거나 계열이 없으면 혼합 */
export function familyCategory(factionId: string | undefined, family: string | null | undefined): AttackCategory {
  if (!factionId || !family) return 'mixed';
  return getFaction(factionId).families.find((f) => f.id === family)?.category ?? 'mixed';
}

/** 장착한 공격 특성의 분류별 개수 (GDD 20-5 아란칼 분류) */
export function categoryCounts(b: BuildState, factionId: string): Record<AttackCategory, number> {
  const out: Record<AttackCategory, number> = { physical: 0, special: 0, mixed: 0 };
  for (const id of b.slots) {
    if (!id) continue;
    const t = getTrait(id);
    if (t.kind === 'skill' && t.role === 'attack' && t.family) out[familyCategory(factionId, t.family)]++;
  }
  return out;
}

/** 장착한 skill 특성 → 블록 생성원 목록 (슬롯 순서). 속성 보너스: 완성된 속성의 블록 위력 +50% (피해·막기 지속·회복량 모두). 분류는 종족 설정 계열에서 */
export function equippedSkills(b: BuildState, factionId?: string): CombatSkill[] {
  return skillsOf(b, b.slots, factionId);
}

function skillsOf(b: BuildState, ids: readonly (string | null)[], factionId?: string): CombatSkill[] {
  const out: CombatSkill[] = [];
  for (const id of ids) {
    if (!id) continue;
    const t = getTrait(id);
    if (t.kind !== 'skill' || !t.role || t.powerInAttacks === undefined) continue;
    // 공격 특성의 추가 효과는 계열 단계 기술로 옮겨 갔다 (②에서 엔진이 읽음). 그전까지는 기본 블록과 같은 추가 효과
    const chainBonus = t.chainBonus ?? BALANCE.provisional.combat.basicBlockChainBonus;
    if (!chainBonus) continue;
    out.push({
      id,
      element: t.element,
      category: familyCategory(factionId, t.family),
      role: t.role,
      family: t.family ?? null,
      powerInAttacks: t.powerInAttacks,
      chainBonus: { ...chainBonus },
      // 속성 강화 (GDD 84장 8번 — 공격 특성만, 막기·회복 특성은 C.136 에 삭제). 같은 속성 3개 보너스는 C.150 에 삭제 (GDD 94장 B 후속)
      powerMultiplier: t.role === 'attack' ? enhanceAttackMultiplier(b, t.element) : 1,
    });
  }
  return out;
}

/** passive 특성: 기본 공격 위력·속도, 받는 피해, 블록 생성 속도 배율 (같은 값은 곱) */
export function passiveMultipliers(b: BuildState): Record<PassiveStat, number> {
  const m: Record<PassiveStat, number> = { attackPower: 1, attackSpeed: 1, damageTaken: 1, blockSpawn: 1 };
  for (const id of b.slots) {
    if (!id) continue;
    const t = getTrait(id);
    if (t.kind === 'passive' && t.passive) m[t.passive.stat] *= t.passive.multiplier;
  }
  return m;
}

/** 장착 특성의 치명타 확률 가산 합 (C.63 `critChance` 효과 키) */
export function critChanceBonus(b: BuildState): number {
  let sum = 0;
  for (const id of b.slots) if (id) sum += getTrait(id).critChance ?? 0;
  return sum;
}

/** 종족 설정의 계열 단계 기술 → 전투 엔진의 계열 표 (GDD 17-3). 엔진은 종족을 모르고 이 표만 읽는다 */
export function familyTable(factionId: string): Record<string, FamilyCombat> {
  const out: Record<string, FamilyCombat> = {};
  for (const f of getFaction(factionId).families) out[f.id] = { tiers: f.tiers.map((t) => ({ multiplier: t.multiplier, ...(t.bonus ? { bonus: { ...t.bonus } } : {}) })) };
  return out;
}

/** 빌드 → 전투 파라미터 (장착 skill 특성 → 스킬 블록, passive → 자동 적용 배율, part → 영향 없음). factionId 가 있으면 그 종족의 계열 단계 기술을 싣는다 */
export function buildCombatParams(b: BuildState, factionId?: string): Partial<CombatParams> {
  const pm = passiveMultipliers(b);
  return {
    ...(factionId ? { families: familyTable(factionId), maxChain: resolveMaxChain(getFaction(factionId)) } : {}),
    skills: equippedSkills(b, factionId),
    attackPowerMultiplier: pm.attackPower,
    attackSpeedMultiplier: pm.attackSpeed,
    damageTakenMultiplier: pm.damageTaken,
    blockSpawnMultiplier: pm.blockSpawn,
    critChance: BALANCE.provisional.combat.critChance + critChanceBonus(b),
    guardHealEnhance: enhanceGuardHealMultiplier(b),
    basicAttackEnhance: enhanceAttackMultiplier(b, NORMAL_ELEMENT),
  };
}
