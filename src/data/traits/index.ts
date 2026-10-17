// 흡수 특성 테이블 (GDD 4장). 11-3 이 미정이라 전부 임시("임시 특성 A1" 자리 표시). 표현 텍스트만 종족별.
import { TRAIT_KINDS, pickFaction, type TraitDef } from '../schema';
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
  if (t.kind === 'skill' && !(typeof t.skillPowerInMatches === 'number' && t.skillPowerInMatches > 0)) errors.push('skillPowerInMatches: 양수');
  if (t.kind === 'passive') {
    const p = (t.passive ?? {}) as Record<string, unknown>;
    if (!['damage', 'spirit', 'shield'].includes(p.role as string) || typeof p.multiplier !== 'number' || p.multiplier <= 0) {
      errors.push('passive: { role: damage | spirit | shield, multiplier: 양수 }');
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
