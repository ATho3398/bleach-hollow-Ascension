// 외형 모델 단위 진화체 (GDD 8-5 v6.096, C.470): 종족 설정 tierLooks[단계].lookUnit 이 있는 단계는 진화체의 정체성·이름·도감 칸 = 외형 모델(노력치 1위 능력치),
// 속성은 그 모델의 색 변형이다(호로 3단계 아쥬커스 — 가시형·뱀형·외팔형·거미형·속도형·짐승형 + 히든 2 = 부유형).
// 엔진 규칙(진화체 판정·속성 특성·4단계 속성 잇기)은 그대로 진화체 id(t3:water 등)로 돈다 — 여기는 '어느 모델로 보이고 무엇이라 부르고 도감 어느 칸인가'만.
// 종족 이름은 없다: 어느 단계가 모델 단위인지·모델 표·색 접미사·이름 틀은 전부 종족 설정에서 읽는다.
import { FORM_TABLE, formName, formsOfTier } from '../../data/evolution';
import type { FormDef } from '../../data/schema';
import { getSkin } from '../../data/skins';
import type { FactionConfig } from '../faction';

type LookTable = NonNullable<FactionConfig['tierLooks']>[string];
type LookFaction = Pick<FactionConfig, 'tierLooks' | 'tierNames' | 'id'>;

/** 도감 한 칸 = 모델 하나. forms = 이 칸의 색 변형(진화체), fixed = 진화체로 정한 칸(히든 — 색 변형 1개, 이름 = 진화체 이름) */
export interface LookCell {
  key: string;
  model: string;
  tier: number;
  hidden: boolean;
  fixed: boolean;
  forms: FormDef[];
}

/** 이 단계가 모델 단위면 그 표, 아니면 null */
export function lookUnitTable(faction: Pick<FactionConfig, 'tierLooks'>, tier: number): LookTable | null {
  const t = faction.tierLooks?.[String(tier)];
  return t?.lookUnit ? t : null;
}

/** 진화체 하나의 색 id: 색 접미사 표(elementSuffix)에 든 속성이면 그 속성, 아니면 'normal'(기본 색) */
export function lookVariantOf(table: Pick<LookTable, 'elementSuffix'>, form: Pick<FormDef, 'elements'>): string {
  const el = form.elements?.[0];
  return el && table.elementSuffix?.includes(el) ? el : 'normal';
}

/** (모델, 진화체) → 실제 스킨 id (tierLook.pickTierLook 의 색 붙이기와 같은 규칙: wyrm + water = wyrmwater) */
export function lookSkinOf(table: Pick<LookTable, 'elementSuffix'>, model: string, form: Pick<FormDef, 'elements'>): string {
  const v = lookVariantOf(table, form);
  return v === 'normal' ? model : `${model}${v}`;
}

/** 이 단계의 도감 칸: 능력치 모델(stat 표에 적은 순서 + pairs, 겹치면 한 칸) 다음 진화체로 정한 칸(forms 표 순서). 모델 단위가 아니면 [] */
export function lookCells(faction: Pick<FactionConfig, 'tierLooks'>, tier: number, table: readonly FormDef[] = FORM_TABLE): LookCell[] {
  const t = lookUnitTable(faction, tier);
  if (!t) return [];
  const fixedIds = new Set(Object.keys(t.forms ?? {}));
  const free = formsOfTier(tier, table).filter((f) => !fixedIds.has(f.id));
  const models: string[] = [];
  for (const m of Object.values(t.stat)) if (m && !models.includes(m)) models.push(m); // 종족 설정에 적은 순서 (힘·지능·체력·정신력·속도·방어)
  for (const p of t.pairs ?? []) if (!models.includes(p.look)) models.push(p.look);
  const cells: LookCell[] = models.map((m) => ({ key: m, model: m, tier, hidden: false, fixed: false, forms: free }));
  for (const [formId, model] of Object.entries(t.forms ?? {})) {
    const f = table.find((x) => x.id === formId);
    if (f) cells.push({ key: formId, model, tier, hidden: f.hidden === true, fixed: true, forms: [f] });
  }
  return cells;
}

/** 지금 외형(e.look)이 이 진화체의 어느 칸인가. 진화체로 정한 칸이 먼저, 아니면 외형 id 를 모델 + 색으로 풀어 맞춘다. 못 맞추면 null */
export function lookCellOf(faction: Pick<FactionConfig, 'tierLooks'>, form: FormDef, look: string | null | undefined, table: readonly FormDef[] = FORM_TABLE): LookCell | null {
  const t = lookUnitTable(faction, form.tier);
  if (!t) return null;
  const cells = lookCells(faction, form.tier, table);
  const fixed = cells.find((c) => c.fixed && c.key === form.id);
  if (fixed) return fixed;
  if (!look) return null;
  return cells.find((c) => !c.fixed && lookSkinOf(t, c.model, form) === look) ?? null;
}

/** 외형 id 만으로 모델 칸 찾기 (옛 세이브 복원용): 모델 id 그대로이거나 모델 id + 색 접미사 */
export function lookCellOfSkin(faction: Pick<FactionConfig, 'tierLooks'>, tier: number, look: string | null | undefined): LookCell | null {
  const t = lookUnitTable(faction, tier);
  if (!t || !look) return null;
  return lookCells(faction, tier).find((c) => !c.fixed && (look === c.model || (t.elementSuffix ?? []).some((el) => look === `${c.model}${el}`))) ?? null;
}

/** 도감 발견 기록 키: '<모델>@<진화체 id>' (세이브 lookDex) */
export function lookDexKey(model: string, formId: string): string {
  return `${model}@${formId}`;
}

/** 모델 표시 이름 (스킨 표의 묶음 이름 — 예 '거미형') */
export function lookModelName(model: string): string {
  const s = getSkin(model);
  return s?.look?.groupName ?? s?.name ?? model;
}

/** 모델 단위 진화체 이름 (이름 틀 {model} {tier} — 예 '거미형 아쥬커스'). 모델 단위가 아니거나 진화체로 정한 칸(히든)·모르는 외형이면 null(진화체 이름 그대로) */
export function lookUnitName(faction: LookFaction, form: FormDef, look: string | null | undefined): string | null {
  const t = lookUnitTable(faction, form.tier);
  const cell = t ? lookCellOf(faction, form, look) : null;
  if (!t?.lookUnit || !cell || cell.fixed) return null;
  return cellName(faction, cell);
}

/** 도감 칸 이름: 모델 칸 = 이름 틀, 진화체로 정한 칸 = 그 진화체 이름 */
export function cellName(faction: LookFaction, cell: LookCell): string {
  const t = lookUnitTable(faction, cell.tier);
  if (cell.fixed || !t?.lookUnit) return formName(cell.forms[0]!, faction.id);
  const tierName = faction.tierNames[cell.tier - 1] ?? `${cell.tier}단계`;
  return t.lookUnit.name.replace('{model}', lookModelName(cell.model)).replace('{tier}', tierName);
}

/** 진화(또는 테스트 모드 진화체 고르기) 뒤 발견 기록: 모델 단위 단계면 '<모델>@<진화체>' 를 lookDex 에 더한다. 더했으면 true */
export function recordLookDex(save: { lookDex?: string[] }, faction: Pick<FactionConfig, 'tierLooks'>, form: FormDef, look: string | null | undefined): boolean {
  const cell = lookCellOf(faction, form, look);
  if (!cell) return false;
  const key = lookDexKey(cell.model, form.id);
  const dex = (save.lookDex ??= []);
  if (dex.includes(key)) return false;
  dex.push(key);
  return true;
}

/** 이 칸의 색 변형 중 발견한 것 (lookDex 기준) */
export function foundVariants(cell: LookCell, lookDex: readonly string[]): FormDef[] {
  return cell.forms.filter((f) => lookDex.includes(lookDexKey(cell.model, f.id)));
}
