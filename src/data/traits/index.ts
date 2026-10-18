// 흡수 특성 테이블 (GDD 4장). 11-3 이 미정이라 전부 임시("임시 특성 A1" 자리 표시). 표현 텍스트만 종족별.
import { CHAIN_BONUS_KINDS, PASSIVE_STATS, SKILL_ROLES, TRAIT_KINDS, pickFaction, type TraitDef } from '../schema';
import { getLineage } from '../lineages';
import raw from './traits.json';

/** 블록 약어 최대 글자 수: 2줄 × 4자 (공백 포함) */
export const TRAIT_ABBR_MAX_LENGTH = 9;

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
  if (t.abbr !== undefined) {
    const a = t.abbr;
    const ok = typeof a === 'object' && a !== null && Object.values(a).every((v) => typeof v === 'string' && v.trim().length >= 1 && Array.from(v).length <= TRAIT_ABBR_MAX_LENGTH);
    if (!ok) errors.push(`abbr: 종족별 문자열, 1~${TRAIT_ABBR_MAX_LENGTH}자`);
  }
  if (t.kind === 'skill') {
    if (!(SKILL_ROLES as readonly unknown[]).includes(t.role)) errors.push('role: attack | guard | heal');
    if (!(typeof t.powerInAttacks === 'number' && t.powerInAttacks > 0)) errors.push('powerInAttacks: 양수');
    if (t.role === 'attack') {
      // 공격 블록은 계열 체인 (GDD 17-3): 계열이 필수, 추가 효과는 종족 설정의 계열 단계 기술이 정하므로 특성에는 없다
      if (typeof t.family !== 'string' || !t.family) errors.push('family: 공격 특성은 계열 id 필요');
      if (t.chainBonus !== undefined) errors.push('chainBonus: 공격 특성에는 없다 (계열 단계 기술이 정한다)');
    } else {
      // 막기·회복은 계열이 없고 같은 특성 단독 체인 (GDD 17-3)
      if (t.family !== undefined) errors.push('family: 막기·회복에는 계열이 없다');
      const b = (t.chainBonus ?? {}) as Record<string, unknown>;
      if (!(CHAIN_BONUS_KINDS as readonly unknown[]).includes(b.kind) || typeof b.value !== 'number' || b.value <= 0) {
        errors.push('chainBonus: { kind: stagger | reflect | cleanse, value: 양수 }');
      }
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

/** 블록 약어 원문: 데이터에 abbr 가 있으면 그것, 없으면 undefined (대체 규칙은 UI 의 fitAbbr) */
export function traitAbbr(id: string, factionId: string): string | undefined {
  const a = getTrait(id).abbr;
  if (!a) return undefined;
  const v = a[factionId] ?? a['*'];
  return v && v.trim() ? v.trim() : undefined;
}

/** 특성의 계열 id (공격 skill 만, 그 밖은 null) */
export function traitFamily(id: string): string | null {
  return getTrait(id).family ?? null;
}
