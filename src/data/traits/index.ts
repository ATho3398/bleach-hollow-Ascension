// 흡수 특성 테이블 (GDD 4장, C.47 속성 8종 × 8개 → C.136 속성마다 6개: 막기·회복 속성 특성 삭제, GDD 84장 7번). 11-3 이 미정이라 전부 임시("불 조" 자리 표시). 표현 텍스트만 종족별.
import { CHAIN_BONUS_KINDS, PASSIVE_STATS, SKILL_ROLES, TRAIT_KINDS, pickFaction, type TraitDef } from '../schema';
import { elementAbbr, elementName, isElement } from '../elements';
import raw from './traits.json';

/** 블록 약어 최대 글자 수: 2줄 × 4자 (공백 포함) */
export const TRAIT_ABBR_MAX_LENGTH = 9;

export function parseTrait(r: unknown): TraitDef {
  const t = (r ?? {}) as Record<string, unknown>;
  const errors: string[] = [];
  if (typeof t.id !== 'string' || !t.id) errors.push('id');
  if (!isElement(t.element)) errors.push(`element: 없는 속성 ${String(t.element)}`);
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
      errors.push(`passive: { stat: ${PASSIVE_STATS.join(' | ')}, multiplier: 양수 }`);
    }
  }
  if (t.critChance !== undefined && !(typeof t.critChance === 'number' && t.critChance > 0 && t.critChance <= 1)) errors.push('critChance: 0 초과 1 이하');
  if (errors.length > 0) throw new Error(`특성 데이터 오류 (${String(t.id ?? '?')}): ${errors.join(', ')}`);
  return r as TraitDef;
}

export const TRAITS: readonly TraitDef[] = (raw as unknown[]).map(parseTrait);

/** 삭제된 희귀 특성 (C.213, GDD 136장 1): 옛 id 't-<속성>-rare' → 그 속성 id, 아니면 null.
 *  세이브는 같은 속성 강화 1단계로 바꾸고(SAVE_MIGRATIONS[55]), 런 로그 옛 기록은 이 id 를 그대로 남겨 traitName 이 읽는다 */
export function retiredRareElement(id: string): string | null {
  const m = /^t-([a-z]+)-rare$/.exec(id);
  return m && isElement(m[1]) && !TRAITS.some((t) => t.id === id) ? m[1]! : null;
}

export function getTrait(id: string): TraitDef {
  const t = TRAITS.find((x) => x.id === id);
  if (!t) throw new Error(`알 수 없는 특성: ${id}`);
  return t;
}

/** 표시 이름 앞의 속성 글자('물 조' 의 '물 ')를 뺀다 — 속성은 아이콘·색이 이미 보여 준다 (C.176, GDD 104장 6). 데이터 이름·id 는 그대로 */
function withoutElement(name: string, element: string, factionId: string): string {
  // 속성 이름('허(虛)')이나 약어('허') 어느 쪽으로 시작해도 뺀다
  for (const p of [elementName(element, factionId), elementAbbr(element, factionId)]) {
    const prefix = `${p} `;
    if (name.startsWith(prefix) && name.length > prefix.length) return name.slice(prefix.length);
  }
  return name;
}

export function traitName(id: string, factionId: string): string {
  const retired = retiredRareElement(id);
  if (retired) return `${elementName(retired, factionId)} 강화(옛 기록)`;
  const t = getTrait(id);
  return withoutElement(pickFaction(t.name, factionId), t.element, factionId);
}

export function traitDescription(id: string, factionId: string): string {
  return pickFaction(getTrait(id).description, factionId);
}

/** 블록 약어 원문: 데이터에 abbr 가 있으면 그것, 없으면 undefined (대체 규칙은 UI 의 fitAbbr) */
export function traitAbbr(id: string, factionId: string): string | undefined {
  const t = getTrait(id);
  const a = t.abbr;
  if (!a) return undefined;
  const v = a[factionId] ?? a['*'];
  return v && v.trim() ? withoutElement(v.trim(), t.element, factionId) : undefined;
}

/** 특성의 계열 id (공격 skill 만, 그 밖은 null) */
export function traitFamily(id: string): string | null {
  return getTrait(id).family ?? null;
}

/** 특성의 속성 id */
export function traitElement(id: string): string {
  return getTrait(id).element;
}
