// 진화체 테이블 (GDD 4-2 v1.0). 단계(2~5)마다 진화체 목록이 있고, 데이터는 forms.json (생성기 결과를 커밋한 것 — 손으로 고칠 수 있다).
// 생성기: generate.ts / `npm run gen:forms`. 이름은 자리 표시이며, 정식 이름은 진화체의 name 에 종족별로 넣으면 그것이 우선한다.
import { validateFormTable } from '../../engine/evolution/select';
import { LINEAGES, getLineage, lineageShortName } from '../lineages';
import { PASSIVE_STATS, pickFaction, type FormDef, type FormKind, type PassiveStat } from '../schema';
import { generateFormTable } from './build';
import { generateForms } from './generate';
import raw from './forms.json';

export { generateFormTable, generateForms };

function parseTable(r: unknown): FormDef[] {
  if (!Array.isArray(r)) throw new Error('진화체 데이터 오류: forms.json 은 배열이어야 한다');
  const table = r as FormDef[];
  const errors = validateFormTable(table, LINEAGES.map((l) => l.id));
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

export function tierFallback(tier: number, table: readonly FormDef[] = FORM_TABLE): FormDef {
  const f = table.find((x) => x.tier === tier && x.fallback);
  if (!f) throw new Error(`${tier}단계 기본형이 없다`);
  return f;
}

const joinNames = (form: FormDef, factionId: string, sep: string) => form.label.lineages.map((l) => lineageShortName(l, factionId)).join(sep);

/** 이름 자리 표시: "A우세형", "A+B형", "A+B형(심화)", "균형형", "기본형" … */
export function placeholderName(form: FormDef, factionId: string): string {
  const names = joinNames(form, factionId, '+');
  const byKind: Record<FormKind, string> = {
    dominant: `${names}우세형`,
    pair: `${names}형`,
    triple: `${names}형`,
    'deep-pair': `${names}형(심화)`,
    balanced: '균형형',
    picky: '편식형',
    rare: '희귀형',
    base: '기본형',
  };
  return byKind[form.label.kind];
}

/** 표시 이름: 손으로 쓴 정식 이름(종족별)이 있으면 그것, 없으면 자리 표시 */
export function formName(form: FormDef, factionId: string): string {
  return form.name ? pickFaction(form.name, factionId) : placeholderName(form, factionId);
}

/** 도감 "요구 계통 힌트" (해금된 진화체에만 보인다) */
export function formHint(form: FormDef, factionId: string): string {
  const names = joinNames(form, factionId, '·');
  const byKind: Record<FormKind, string> = {
    dominant: `${names}를 가장 많이 흡수`,
    pair: `${names}를 가장 많이 흡수 (1·2위)`,
    triple: `${names}를 가장 많이 흡수 (1·2·3위)`,
    'deep-pair': `${names} 두 계통에 크게 집중`,
    balanced: '여러 계통을 고르게 흡수',
    picky: '한 계통에 크게 치우쳐 흡수',
    rare: '희귀 개체를 여러 번 흡수',
    base: '맞는 진화체가 없을 때',
  };
  return byKind[form.label.kind];
}

/** 패시브 이름·효과 텍스트 (예 "A+B 성향: 기본 공격 위력 ×1.03, 받는 피해 ×0.97") */
const STAT_TEXT: Record<PassiveStat, string> = { attackPower: '기본 공격 위력', attackSpeed: '기본 공격 속도', damageTaken: '받는 피해' };
export function formPassiveText(form: FormDef, factionId: string): string {
  const e = form.effects.passive;
  const parts = PASSIVE_STATS.filter((s) => e[s] !== undefined).map((s) => `${STAT_TEXT[s]} ×${e[s]!.toFixed(2)}`);
  return parts.length === 0 ? '패시브 없음' : `${joinNames(form, factionId, '+')} 성향: ${parts.join(', ')}`;
}

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
