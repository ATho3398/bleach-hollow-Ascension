// 진화체 트리 (GDD 20-5 v3.7~v4.2, 22-7): 1·1·1 → 바스트로데 속성 8 → 아란칼 속성 × 분류 24 + 히든 12(환생 전용 1 포함). 데이터는 forms.json (생성기 결과를 커밋한 것 — 손으로 고칠 수 있다).
// 생성기: generate.ts / `npm run gen:forms`. 이름은 자리 표시이며, 정식 이름은 진화체의 name 에 종족별로 넣으면 그것이 우선한다.
import { isLocomotion } from '../../engine/locomotion';
import { categoryName, elementName, isElement } from '../elements';
import { getFaction } from '../factions';
import { FORM_KINDS, STAT_IDS, pickFaction, type FormDef, type FormKind } from '../schema';
import { generateFormTable } from './build';
import { generateForms } from './generate';
import raw from './forms.json';

export { generateFormTable, generateForms };

/** 진화체 단계 범위 (1단계는 진화체가 없다) */
export const FORM_MIN_TIER = 2;
export const FORM_MAX_TIER = 5;

/** 트리 구조 검사. 문제 목록 (비면 정상) */
export function validateFormTable(table: readonly FormDef[]): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const f of table) {
    if (seen.has(f.id)) errors.push(`진화체 id 중복: ${f.id}`);
    seen.add(f.id);
    if (!Number.isInteger(f.tier) || f.tier < FORM_MIN_TIER || f.tier > FORM_MAX_TIER) errors.push(`${f.id}: 단계 ${f.tier} 는 ${FORM_MIN_TIER}~${FORM_MAX_TIER} 가 아니다`);
    if (!(FORM_KINDS as readonly string[]).includes(f.label?.kind)) errors.push(`${f.id}: label.kind 가 ${FORM_KINDS.join(' | ')} 가 아니다`);
    for (const el of [...(f.label?.elements ?? []), ...(f.elements ?? [])]) if (!isElement(el)) errors.push(`${f.id}: 알 수 없는 속성 ${el}`);
    if (f.elements !== undefined && (f.elements.length < 1 || f.elements.length > 2)) errors.push(`${f.id}: elements 는 1~2개`);
    if (f.tier < FORM_MAX_TIER && f.elements === undefined) errors.push(`${f.id}: 속성을 잇는 진화체(elements 없음)는 마지막 단계만`);
    for (const k of STAT_IDS) if (!(typeof f.stats?.[k] === 'number' && f.stats[k] > 0)) errors.push(`${f.id}: stats.${k} 양수`);
    if (f.stab !== undefined && !(f.stab >= 1)) errors.push(`${f.id}: stab 은 1 이상`);
    if (f.maxChain !== undefined && !(Number.isInteger(f.maxChain) && f.maxChain >= 1)) errors.push(`${f.id}: maxChain 은 1 이상 정수`);
    if (f.locomotion !== undefined && !isLocomotion(f.locomotion)) errors.push(`${f.id}: locomotion '${String(f.locomotion)}' 은 float | walk | fly 가 아니다`);
  }
  for (let tier = FORM_MIN_TIER; tier <= FORM_MAX_TIER; tier++) {
    if (!table.some((f) => f.tier === tier && !f.hidden)) errors.push(`${tier}단계에 일반 진화체가 없다`);
  }
  return errors;
}

function parseTable(r: unknown): FormDef[] {
  if (!Array.isArray(r)) throw new Error('진화체 데이터 오류: forms.json 은 배열이어야 한다');
  const table = r as FormDef[];
  const errors = validateFormTable(table);
  if (errors.length > 0) throw new Error(`진화체 데이터 오류:\n- ${errors.join('\n- ')}`);
  return table;
}

export const FORM_TABLE: readonly FormDef[] = parseTable(raw);

const BY_ID = new Map(FORM_TABLE.map((f) => [f.id, f]));

export function getForm(id: string): FormDef {
  const f = BY_ID.get(id);
  if (!f) throw new Error(`알 수 없는 진화체 id: ${id}`);
  return f;
}

export function tryGetForm(id: string): FormDef | undefined {
  return BY_ID.get(id);
}

export function formsOfTier(tier: number, table: readonly FormDef[] = FORM_TABLE): FormDef[] {
  return table.filter((f) => f.tier === tier);
}

/** 이름 자리 표시 (GDD 20장 v5.3 `단계_속성_분류`, 사용자 지시): "길리안", "바스트로데_불", "아란칼_불_탄"(분류 = 종족 계열 표시명), 히든 "바스트로데_융합_물흙"·"아란칼_한계돌파_불".
 *  단계 이름·계열 표시명은 종족 설정에서 읽는다 (종족 분기 없음). 속성을 잇는 아란칼 히든은 inherited(지금 캐릭터 속성)가 있으면 뒤에 `_속성` — 도감처럼 상태가 없으면 생략 */
export function placeholderName(form: FormDef, factionId: string, inherited: readonly string[] = []): string {
  const fac = getFaction(factionId);
  const tierName = fac.tierNames[form.tier - 1] ?? `${form.tier}단계`;
  const els = form.label.elements.map((e) => elementName(e, factionId));
  const cat = form.label.category;
  const catName = cat ? (fac.families.find((f) => f.category === cat)?.abbr ?? categoryName(cat, factionId)) : '';
  const heir = inherited.map((e) => elementName(e, factionId)).join('');
  const parts: Record<FormKind, string[]> = {
    base: [],
    element: [els[0] ?? ''],
    arrancar: [els.join(''), catName],
    fusion: ['융합', els.join('')],
    complete: ['완전체'],
    special: ['특수', els[0] ?? ''],
    pure: ['순수'],
    fail: ['실패'],
    limit: ['한계돌파', heir],
    restraint: ['절제', heir],
    hunter: ['강적사냥꾼', heir],
    reborn: ['환생', heir],
  };
  return [tierName, ...parts[form.label.kind]].filter(Boolean).join('_');
}

/** 표시 이름: 손으로 쓴 정식 이름(종족별)이 있으면 그것, 없으면 자리 표시. inherited = 지금 캐릭터 속성(아란칼 히든의 `_속성`) */
export function formName(form: FormDef, factionId: string, inherited: readonly string[] = []): string {
  return form.name ? pickFaction(form.name, factionId) : placeholderName(form, factionId, inherited);
}

/** 도감 힌트 (해금된 진화체에만 보인다) */
export function formHint(form: FormDef, factionId: string): string {
  const els = form.label.elements.map((e) => elementName(e, factionId));
  const byKind: Record<FormKind, string> = {
    base: '정해진 걸음을 걸으면 진화',
    element: `${els[0]} 특성을 가장 많이 장착하고 진화`,
    arrancar: `${els[0]} ${FORM_MAX_TIER - 1}단계에서 ${form.label.category ? categoryName(form.label.category, factionId) : ''} 공격 특성을 가장 많이 장착하고 진화`,
    fusion: `${els.join('·')} 적을 고루 많이 ${getFaction(factionId).absorbActionName}`,
    complete: '네 원소의 적을 모두 고루',
    special: `${els[0]} 적과 다른 한 속성의 적을 많이`,
    pure: '노멀 위주로, 몸 상태가 좋을 때',
    fail: '특성 없이, 또는 돌보지 못한 채 진화',
    limit: '한계 돌파를 여러 번 겪은 채 진화',
    restraint: '놓아준 수가 더 많은 채 진화',
    hunter: '강적을 많이 쓰러뜨린 채 진화',
    reborn: '여러 번 다시 태어난 끝에 진화',
  };
  return byKind[form.label.kind];
}

// ── 특성 (GDD 20-3·v4.0 성향 6종, 39장 속성·전용): 데이터·이름은 abilities.ts, 효과 수치는 BALANCE.provisional.abilities ──
export { ABILITIES_PROVISIONAL, abilityDescription, abilityName, abilityNameByEffect, elementAbility, kindSlot, uniqueAbility, validateAbilities } from './abilities';

// ── 콤보 규칙 (GDD 17-3): 진화 단계마다 1개씩 열리는 특수 블록 규칙. 데이터는 combos.json ──
import { FACTIONS } from '../factions';
import type { ComboDef } from '../schema';
import combosRaw from './combos.json';

export const COMBO_MAX_TIER = 5;

export function parseCombos(r: unknown): ComboDef[] {
  if (!Array.isArray(r)) throw new Error('콤보 데이터 오류: combos.json 은 배열이어야 한다');
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const c of r as Partial<ComboDef>[]) {
    const id = String(c.id ?? '?');
    if (!c.id || seen.has(c.id)) errors.push(`${id}: id 가 비었거나 겹친다`);
    seen.add(id);
    if (!Number.isInteger(c.tier) || c.tier! < 1 || c.tier! > COMBO_MAX_TIER) errors.push(`${id}: tier 1~${COMBO_MAX_TIER}`);
    if (!Number.isInteger(c.minChain) || c.minChain! < 1 || c.minChain! > 3) errors.push(`${id}: minChain 1~3`);
    if (!Number.isInteger(c.repeat) || c.repeat! < 2) errors.push(`${id}: repeat 2 이상`);
    if (!(typeof c.powerInAttacks === 'number' && c.powerInAttacks > 0)) errors.push(`${id}: powerInAttacks 양수`);
    for (const f of FACTIONS) {
      if (!f.families.some((x) => x.id === c.family)) errors.push(`${id}: ${f.id} 종족 설정에 없는 계열 ${String(c.family)}`);
      if (!c.name || (c.name[f.id] ?? c.name['*']) === undefined) errors.push(`${id}: ${f.id} 이름 없음`);
    }
  }
  if (errors.length > 0) throw new Error(`콤보 데이터 오류:\n- ${errors.join('\n- ')}`);
  return r as ComboDef[];
}

export const COMBOS: readonly ComboDef[] = parseCombos(combosRaw);

export function getCombo(id: string): ComboDef {
  const c = COMBOS.find((x) => x.id === id);
  if (!c) throw new Error(`알 수 없는 콤보: ${id}`);
  return c;
}

/** 육성 단계(0부터 tierIndex)에서 켜져 있는 콤보 규칙: tier(1-based) ≤ tierIndex + 1 */
export function combosAtTier(tierIndex: number, list: readonly ComboDef[] = COMBOS): ComboDef[] {
  return list.filter((c) => c.tier <= tierIndex + 1);
}

export function comboName(id: string, factionId: string): string {
  return pickFaction(getCombo(id).name, factionId);
}
