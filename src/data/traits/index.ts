// 흡수 특성 테이블 (GDD 4장). 11-3 이 미정이라 전부 임시("임시 특성 A1" 자리 표시). 표현 텍스트만 종족별.
import { CHAIN_BONUS_KINDS, PASSIVE_STATS, SKILL_ROLES, TRAIT_KINDS, pickFaction, type TraitDef } from '../schema';
import { getLineage } from '../lineages';
import raw from './traits.json';

export function parseTrait(r: unknown): TraitDef {
  const t = (r ?? {}) as Record<string, unknown>;
  const errors: string[] = [];
  if (typeof t.id !== 'string' || !t.id) errors.push('id');
  if (typeof t.lineageId !== 'string') errors.push('lineageId');
  else {
    try {
      getLineage(t.lineageId);
    } catch {
      errors.push(`lineageId: 없는 계통 ${t.lineageId}`);
    }
  }
  if (!(TRAIT_KINDS as readonly unknown[]).includes(t.kind)) errors.push('kind: skill | passive | part');
  if (typeof t.name !== 'object' || t.name === null) errors.push('name');
  if (typeof t.description !== 'object' || t.description === null) errors.push('description');
  if (t.kind === 'skill') {
    if (!(SKILL_ROLES as readonly unknown[]).includes(t.role)) errors.push('role: attack | guard | heal');
    if (!(typeof t.powerInAttacks === 'number' && t.powerInAttacks > 0)) errors.push('powerInAttacks: 양수');
    const b = (t.chainBonus ?? {}) as Record<string, unknown>;
    if (!(CHAIN_BONUS_KINDS as readonly unknown[]).includes(b.kind) || typeof b.value !== 'number' || b.value <= 0) {
      errors.push('chainBonus: { kind: stagger | reflect | cleanse, value: 양수 }');
    }
  }
  if (t.kind === 'passive') {
    const p = (t.passive ?? {}) as Record<string, unknown>;
    if (!(PASSIVE_STATS as readonly unknown[]).includes(p.stat) || typeof p.multiplier !== 'number' || p.multiplier <= 0) {
      errors.push('passive: { stat: attackPower | attackSpeed | damageTaken, multiplier: 양수 }');
    }
  }
  if (errors.length > 0) throw new Error(`특성 데이터 오류 (${String(t.id ?? '?')}): ${errors.join(', ')}`);
  return r as TraitDef;
}

export const TRAITS: readonly TraitDef[] = (raw as unknown[]).map(parseTrait);

export function getTrait(id: string): TraitDef {
  const t = TRAITS.find((x) => x.id === id);
  if (!t) throw new Error(`알 수 없는 특성: ${id}`);
  return t;
}

export function traitName(id: string, factionId: string): string {
  return pickFaction(getTrait(id).name, factionId);
}

export function traitDescription(id: string, factionId: string): string {
  return pickFaction(getTrait(id).description, factionId);
}
