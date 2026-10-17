// 진화 형태 테이블 (GDD 4-2). 조합 키 + 단계에서 형태 후보(정통·변이·돌파)를 템플릿으로 자동 생성한다.
// 손으로 쓴 정식 형태는 forms.json 에 id 로 넣으면 템플릿을 덮어쓴다 (11-3 계통이 확정된 뒤). 지금은 비어 있다.
import { BALANCE } from '../../config/balance';
import { getLineage, lineageShortName } from '../lineages';
import { FORM_VARIANTS, PASSIVE_STATS, pickFaction, type FormDef, type FormVariant, type PassiveStat } from '../schema';
import raw from './forms.json';

const EV = BALANCE.provisional.evolution;

/** 흡수가 없었던 단계의 조합 키 (GDD 4-2 "기본 조합") */
export const BASE_COMBO = 'base';

export const VARIANT_NAMES: Record<FormVariant, string> = { orthodox: '정통', mutant: '변이', breakthrough: '돌파' };

export function comboLineages(comboKey: string): string[] {
  return comboKey === BASE_COMBO ? [] : comboKey.split('+');
}

export function formId(comboKey: string, toTier: number, variant: FormVariant): string {
  return `${comboKey}@${toTier}:${variant}`;
}

/** 조합의 계통 성향을 섞은 패시브: 계통 n개면 각 성향을 1/n 만큼 반영한다 (임시) */
function derivePassive(lineageIds: string[]): Partial<Record<PassiveStat, number>> {
  const out: Partial<Record<PassiveStat, number>> = {};
  for (const id of lineageIds) {
    const t = getLineage(id).tendency;
    if (!t) continue;
    out[t.stat] = (out[t.stat] ?? 1) * (1 + (t.multiplier - 1) / lineageIds.length);
  }
  return out;
}

function generate(comboKey: string, toTier: number, variant: FormVariant): FormDef {
  const fx = EV.formEffects[variant];
  return {
    id: formId(comboKey, toTier, variant),
    comboKey,
    toTier,
    variant,
    hpMultiplier: fx.hp,
    attackMultiplier: fx.attack,
    passive: derivePassive(comboLineages(comboKey)),
    provisional: true,
  };
}

const OVERRIDES = new Map<string, FormDef>((raw as FormDef[]).map((f) => [f.id, f]));

/** 형태 한 개 (손으로 쓴 것이 있으면 그것, 없으면 템플릿) */
export function makeForm(comboKey: string, toTier: number, variant: FormVariant): FormDef {
  return OVERRIDES.get(formId(comboKey, toTier, variant)) ?? generate(comboKey, toTier, variant);
}

/** 이 조합·단계의 진화 테이블: 정통 / 변이 / 돌파(세 번째 후보) */
export function formsFor(comboKey: string, toTier: number): FormDef[] {
  return FORM_VARIANTS.map((v) => makeForm(comboKey, toTier, v));
}

/** id 로 형태를 얻는다. "조합@단계:종류" 형식이 아니면 던진다 */
export function getForm(id: string): FormDef {
  const m = /^(.+)@(\d+):(orthodox|mutant|breakthrough)$/.exec(id);
  if (!m) throw new Error(`알 수 없는 형태 id: ${id}`);
  const form = makeForm(m[1]!, Number(m[2]), m[3] as FormVariant);
  for (const l of comboLineages(form.comboKey)) getLineage(l);
  return form;
}

/** 조합 키 표시: "A+B" (계통 짧은 이름). 기본 조합은 "기본" */
export function comboLabel(comboKey: string, factionId: string): string {
  const ids = comboLineages(comboKey);
  return ids.length === 0 ? '기본' : ids.map((l) => lineageShortName(l, factionId)).join('+');
}

/** 형태 이름: 손으로 쓴 이름, 없으면 "A+B형 (정통)" */
export function formName(form: FormDef, factionId: string): string {
  if (form.name) return pickFaction(form.name, factionId);
  return `${comboLabel(form.comboKey, factionId)}형 (${VARIANT_NAMES[form.variant]})`;
}

/** 패시브 이름·효과 텍스트 (예 "A+B 성향: 기본 공격 위력 ×1.03, 받는 피해 ×0.97") */
const STAT_TEXT: Record<PassiveStat, string> = { attackPower: '기본 공격 위력', attackSpeed: '기본 공격 속도', damageTaken: '받는 피해' };
export function formPassiveText(form: FormDef, factionId: string): string {
  const parts = PASSIVE_STATS.filter((s) => form.passive[s] !== undefined).map((s) => `${STAT_TEXT[s]} ×${form.passive[s]!.toFixed(2)}`);
  return parts.length === 0 ? '패시브 없음' : `${comboLabel(form.comboKey, factionId)} 성향: ${parts.join(', ')}`;
}

/** 계통 id 목록에서 만들 수 있는 모든 조합 키 (기본 + 1~3계통 부분집합은 아니고 실제 키 형태: 2조합·3조합, 단일 계통 포함) */
export function allComboKeys(lineageIds: readonly string[]): string[] {
  const sorted = [...lineageIds].sort();
  const keys: string[] = [BASE_COMBO];
  for (let i = 0; i < sorted.length; i++) keys.push(sorted[i]!);
  for (let i = 0; i < sorted.length; i++) for (let j = i + 1; j < sorted.length; j++) keys.push(`${sorted[i]}+${sorted[j]}`);
  for (let i = 0; i < sorted.length; i++) for (let j = i + 1; j < sorted.length; j++) for (let k = j + 1; k < sorted.length; k++) keys.push(`${sorted[i]}+${sorted[j]}+${sorted[k]}`);
  return keys;
}
