// 진화체 도감 화면 (GDD 20-5, T-3 가로 배치): 머리에 발견 수 · 왼쪽 진화체 목록 · 오른쪽 고른 진화체의 상세.
// C.171: 단계 탭 대신 한 목록 + 단계 머리줄. 해금된 진화체는 이름·속성 마크·종족값, 미해금은 "?" 잠금 행(히든은 "히든 ?"). 히든은 목록 맨 뒤, 지금 진화체는 "지금" 표시. 이름은 자리 표시(임시).
import { FORM_TABLE, formHint, formName, formsOfTier } from '../data/evolution';
import type { FormDef } from '../data/schema';
import type { FactionConfig } from '../engine/faction';
import type { SaveData } from '../game';
import { h, icon, provisionalTag } from './bha/dom';
import { lcdHead, lcdPage, masterDetail, type ListRow } from './bha/lcdpage';
import { elementDot, paintElement } from './bha/element';
import { formCardModel, sortFormsForDex } from './bha/nestLogic';
import { logoMark } from './bha/logo';
import { abilityParagraph, dexAbilityLines, evolutionNote, formEffectLines } from './evolutionPanel';
import { shownName } from './displayName';

/** 속성 마크 줄 (속성을 잇는 진화체는 "속성 잇기") */
function marksOf(f: FormDef, factionId: string): HTMLElement {
  const marks = h('span', 'bha-formcard__marks');
  const els = f.elements ?? f.label.elements;
  if (els.length === 0) marks.append(h('span', 'bha-faint', '속성 잇기'));
  for (const e of els) marks.append(elementDot(e, factionId));
  return marks;
}

function formRow(faction: FactionConfig, f: FormDef, unlocked: ReadonlySet<string>, currentFormId: string | null, caption?: string): ListRow {
  const m = formCardModel(f, unlocked, currentFormId);
  if (m.state === 'unknown') {
    return {
      label: '미발견', cls: 'is-unknown', caption,
      content: [icon('i-unknown'), h('span', 'bha-mdrow__name', '? ? ?'), h('small', 'bha-mdrow__state', m.hidden ? '히든' : '미발견')],
      detail: () => {
        const d = h('div', 'bha-mdhint');
        d.append(icon('i-unknown'), h('b', '', '미발견'), h('small', '', '진화한 적 있는 진화체만 보인다.'));
        return [d];
      },
    };
  }
  const name = shownName(formName(f, faction.id));
  return {
    label: name, caption,
    paint: (node: HTMLElement) => paintElement(node, m.element),
    content: [marksOf(f, faction.id), h('span', 'bha-mdrow__name', name), ...(m.current ? [h('small', 'bha-mdrow__state', '지금')] : m.hidden ? [h('small', 'bha-mdrow__state', '히든')] : [])],
    detail: () => {
      const lines = formEffectLines(faction, f);
      const title = h('h2', 'bha-mddetail__title', name);
      if (f.provisional) title.append(' ', provisionalTag());
      const head = h('div', 'bha-mddetail__head');
      head.append(marksOf(f, faction.id), title);
      if (m.current) head.append(h('span', 'bha-chip bha-chip--good', '지금'));
      const body = h('p', 'bha-mddetail__body');
      body.append(formHint(f, faction.id));
      for (const line of lines.slice(1)) body.append(h('br'), line);
      return [head, body, abilityParagraph(dexAbilityLines(f, faction.id)), evolutionNote()];
    },
  };
}

/** 단계 탭 대신 한 목록에 단계 머리줄(GDD 100장 #73): 2단계 → 3단계 → … 을 이어 붙인다. 첫 선택 = 지금 진화체(없으면 맨 위) */
export function dexView(root: HTMLElement, faction: FactionConfig, save: SaveData, title: string | Node = '진화체 도감'): void {
  const unlocked = new Set(save.formDex);
  const found = FORM_TABLE.filter((f) => unlocked.has(f.id)).length;
  const tiers = [2, 3, 4, 5];
  const forms = tiers.flatMap((t) => sortFormsForDex(formsOfTier(t)).map((f, i) => ({ f, t, first: i === 0 })));
  const rows = forms.map(({ f, t, first }) => {
    const all = formsOfTier(t);
    const cap = first ? `${faction.tierNames[t - 1]!} ${all.filter((x) => unlocked.has(x.id)).length}/${all.length}` : undefined;
    return formRow(faction, f, unlocked, save.evolution.formId, cap);
  });
  const at = Math.max(0, forms.findIndex(({ f }) => f.id === save.evolution.formId));
  const md = masterDetail(rows, at, '진화체');
  const sub = h('span');
  sub.append('발견 ', h('b', '', String(found)), ` / ${FORM_TABLE.length}`);
  lcdPage(root, { cls: 'bha-dex-page', cols: 'minmax(0, 0.9fr) minmax(0, 1.1fr)' }, lcdHead({ title, sub, logo: logoMark(faction, 'bha-logo--md') ?? undefined }), [md.list], [md.detail]);
}
