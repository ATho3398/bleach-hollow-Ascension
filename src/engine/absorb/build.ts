// 흡수 빌드(특성 보유·슬롯) 순수 로직 (GDD 4장, 4-1). 종족 무관 — 이름·문구는 데이터/종족 설정에서 읽는다.
// 모두 임시 데이터(provisional)를 쓴다.

import { BALANCE } from '../../config/balance';
import { getTrait } from '../../data/traits';
import type { PassiveStat } from '../../data/schema';
import type { CombatParams, CombatSkill } from '../combat/combat';

const AX = BALANCE.provisional.absorb;

/** 보유 특성과 슬롯. 저장 구조(SaveData.build)이자 원정 중 사본이다 */
export interface BuildState {
  /** 지금 가진 모든 특성 id (장착 여부 무관, 중복 없음) */
  owned: string[];
  /** 슬롯(BALANCE.absorb.slotCount 칸). 장착한 특성 id 또는 null */
  slots: (string | null)[];
}

export function newBuild(): BuildState {
  return { owned: [], slots: Array.from({ length: BALANCE.absorb.slotCount }, () => null) };
}

export function cloneBuild(b: BuildState): BuildState {
  return { owned: [...b.owned], slots: [...b.slots] };
}

export type BuildResult = { ok: true } | { ok: false; reason: string };

export function emptySlot(b: BuildState): number {
  return b.slots.indexOf(null);
}

export function isFull(b: BuildState): boolean {
  return emptySlot(b) < 0;
}

/** 새 특성을 얻는다: 보유 목록에 더하고, 빈 슬롯이 있으면 장착, 가득 차 있으면 replaceSlot 의 특성과 교체(옛 특성은 보유에 남음). 교체 슬롯이 없으면 포기(얻지 않음) */
export function gainTrait(b: BuildState, traitId: string, replaceSlot?: number | null): BuildResult {
  getTrait(traitId);
  if (b.owned.includes(traitId)) return { ok: false, reason: '이미 가진 특성이다' };
  const free = emptySlot(b);
  if (free >= 0) {
    b.owned.push(traitId);
    b.slots[free] = traitId;
    return { ok: true };
  }
  if (replaceSlot === undefined || replaceSlot === null) return { ok: false, reason: '슬롯이 가득 찼다 (교체할 슬롯을 고르거나 포기)' };
  if (!Number.isInteger(replaceSlot) || replaceSlot < 0 || replaceSlot >= b.slots.length) return { ok: false, reason: '없는 슬롯이다' };
  b.owned.push(traitId);
  b.slots[replaceSlot] = traitId;
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
  return { ok: true };
}

/** 슬롯 안 계통별 특성 개수 */
export function lineageCounts(b: BuildState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of b.slots) {
    if (!id) continue;
    const l = getTrait(id).lineageId;
    out[l] = (out[l] ?? 0) + 1;
  }
  return out;
}

/** 계통 보너스가 켜진 계통들: 슬롯 안 같은 계통이 lineageBonusCount 개 이상 (GDD 4-1) */
export function completedLineages(b: BuildState): string[] {
  return Object.entries(lineageCounts(b))
    .filter(([, n]) => n >= AX.lineageBonusCount)
    .map(([id]) => id);
}

/** 장착한 skill 특성 → 블록 생성원 목록 (슬롯 순서). 계통 보너스: 완성된 계통의 블록 위력 +50% (피해·막기 지속·회복량 모두) */
export function equippedSkills(b: BuildState): CombatSkill[] {
  const bonus = new Set(completedLineages(b));
  const out: CombatSkill[] = [];
  for (const id of b.slots) {
    if (!id) continue;
    const t = getTrait(id);
    if (t.kind !== 'skill' || !t.role || t.powerInAttacks === undefined) continue;
    // 공격 특성의 추가 효과는 계열 단계 기술로 옮겨 갔다 (②에서 엔진이 읽음). 그전까지는 기본 블록과 같은 추가 효과
    const chainBonus = t.chainBonus ?? BALANCE.provisional.combat.basicBlockChainBonus;
    if (!chainBonus) continue;
    out.push({
      id,
      lineageId: t.lineageId,
      role: t.role,
      family: t.family ?? null,
      powerInAttacks: t.powerInAttacks,
      chainBonus: { ...chainBonus },
      powerMultiplier: bonus.has(t.lineageId) ? 1 + AX.lineageSkillBonus : 1,
    });
  }
  return out;
}

/** passive 특성: 기본 공격 위력·속도, 받는 피해 배율 (같은 값은 곱) */
export function passiveMultipliers(b: BuildState): Record<PassiveStat, number> {
  const m: Record<PassiveStat, number> = { attackPower: 1, attackSpeed: 1, damageTaken: 1 };
  for (const id of b.slots) {
    if (!id) continue;
    const t = getTrait(id);
    if (t.kind === 'passive' && t.passive) m[t.passive.stat] *= t.passive.multiplier;
  }
  return m;
}

/** 빌드 → 전투 파라미터 (장착 skill 특성 → 스킬 블록, passive → 자동 적용 배율, part → 영향 없음) */
export function buildCombatParams(b: BuildState): Partial<CombatParams> {
  const pm = passiveMultipliers(b);
  return {
    skills: equippedSkills(b),
    attackPowerMultiplier: pm.attackPower,
    attackSpeedMultiplier: pm.attackSpeed,
    damageTakenMultiplier: pm.damageTaken,
  };
}
