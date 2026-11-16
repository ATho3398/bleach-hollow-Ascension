// 진화체 도감 화면 (GDD 20-5 → 220장 1·2): 머리에 발견 수·정렬 버튼 · 아래 바둑판 카드(그림 + 이름 + 속성 마크). 카드를 누르면 상세 창(공용 창 틀 itemDialog).
// 미발견은 그림 실루엣 + '???'. 기본 정렬은 단계 머리줄(2단계 → 3단계 → …, 히든은 그 단계 맨 뒤). 지금 진화체는 '지금' 표시.
// 그림 = 그 진화체의 실제 게임 그림(외형 표 → 없으면 단계 그림, GDD 8-5 v6.096). 속성을 잇는 진화체는 속성 마크 자리에 '특'(220장 4).
// 모델 단위 단계(종족 설정 tierLooks[단계].lookUnit — 호로 아쥬커스)는 모델별 칸 + 상세 창 속성 색 칩 (C.470).
import { ELEMENT_IDS } from '../data/elements';
import { formHasUniqueRelease, formHint, formName, formReleaseCutin, formsOfTier, tryGetForm } from '../data/evolution';
import { elementName } from '../data/elements';
import { zeroStats } from '../engine/evolution';
import { pickLook } from '../engine/evolution/tierLook';
import { cellName, foundVariants, lookCellOf, lookCells, lookDexKey, lookSkinOf, lookUnitTable, lookVariantOf, type LookCell } from '../engine/evolution/lookDex';
import type { FormDef } from '../data/schema';
import { FORM_DEX_SORTS, nextDexSort, sortDex, type DexSortFacts } from '../engine/dexSort';
import { roomOf, type FactionConfig } from '../engine/faction';
import { newDexSortState } from '../engine/dexSort';
import { noEvolutionLabel, type SaveData } from '../game';
import { h, icon, provisionalTag } from './bha/dom';
import { dexCaption, dexCard, dexGrid, dexSortButton } from './bha/dexGrid';
import { lcdHead, lcdPage, selectLast } from './bha/lcdpage';
import { elementDot, paintElement } from './bha/element';
import { imageArt, itemDialog } from './bha/itemUi';
import { formCardModel, sortFormsForDex } from './bha/nestLogic';
import { logoMark } from './bha/logo';
import { roomCharArt } from './bha/room';
import { abilityParagraph, dexAbilityLines, formEffectLines } from './evolutionPanel';
import { shownName } from './displayName';

/** 속성 마크 줄. 속성을 잇는 진화체(직전 진화체 속성을 이어받는 히든)는 '특' 한 글자 (GDD 220장 4) */
export function marksOf(f: FormDef, factionId: string): HTMLElement {
  const marks = h('span', 'bha-formcard__marks');
  const els = f.elements ?? f.label.elements;
  if (els.length === 0) {
    const sp = h('i', 'bha-eldot bha-eldot--special', '특');
    sp.title = '히든 — 직전 진화체의 속성을 잇는다';
    marks.append(sp);
  }
  for (const e of els) marks.append(elementDot(e, factionId));
  return marks;
}

/** 고유 해방 한 줄 (GDD 198장, 4단계): '레스렉시온: 내리찍어라, 마르티요!' / '만해: 만해 — 천단백련!'. 만해가 없는 진화체는 기본 해방 그대로라고 적는다 */
function releaseLine(faction: FactionConfig, f: FormDef): string | null {
  if (!f.release) return null;
  const lb = faction.liberation;
  const cutin = formReleaseCutin(f, faction.id);
  if (cutin && formHasUniqueRelease(f, faction.id)) return `${lb.name}: ${cutin}`;
  return formHasUniqueRelease(f, faction.id) ? null : `${lb.name}: 없음 (${lb.baseName} 그대로)`;
}

/** '여러 값 한 줄'(예 '종족값 체력 69 · 힘 66 · …')은 ' · ' 사이 한 칸씩 줄바꿈 없는 덩어리로 — 줄이 접혀도 '정신력 / 59' 처럼 칸이 쪼개지지 않는다 (C.332) */
export function pairsOf(line: string): (Node | string)[] {
  const parts = line.split(' · ');
  if (parts.length < 2) return [line];
  return parts.flatMap((p, i) => [...(i > 0 ? [' · '] : []), h('span', 'bha-mddetail__pair', p)]);
}

/** 도감 그림의 외형 id (GDD 8-5 v6.096, C.470): 그 진화체가 게임에서 실제로 입는 외형 — 진화체 표(formLooks, 깬 뒤 외형은 빼고) → 단계 표(tierLooks).
 *  능력치로 갈리는 단계는 노력치 0 기준 첫 칸(같은 모델만 있는 단계 = 그 모델). 표가 없으면 null = 그 단계 그림 */
export function dexLookOf(faction: FactionConfig, f: FormDef): string | null {
  return pickLook(faction, f, zeroStats(), 0, false);
}

/** 진화체 그림: 그 진화체의 실제 게임 그림(외형 id → 그림, 없으면 그 단계 그림, 그것도 없으면 아이콘). 미발견은 실루엣 */
function formArt(faction: FactionConfig, f: FormDef, known: boolean, look: string | null = dexLookOf(faction, f)): HTMLElement {
  const box = h('span', `bha-dexart${known ? '' : ' is-silhouette'}`);
  fillArt(box, faction, f, look, known);
  return box;
}

function fillArt(box: HTMLElement, faction: FactionConfig, f: FormDef, look: string | null, known: boolean): void {
  const art = roomCharArt(roomOf(faction), faction.id, Math.max(0, f.tier - 1), look);
  box.dataset.look = look ?? '';
  if (art.src) {
    const img = imageArt(art.src);
    img.style.setProperty('--art-scale', String(art.scale)); // 방 캐릭터와 같은 배율·세로 보정 (그림 칸 256 안의 몸 크기)
    img.style.setProperty('--art-dy', `${art.offsetY}%`);
    box.replaceChildren(img);
  } else box.replaceChildren(icon(known ? 'i-evolve' : 'i-unknown'));
}

/** 상세 창 본문 (예전 오른쪽 상세 칸 내용 전부): 속성 마크·'지금' · 설명·종족값·조건·특성 · 해방 한 줄 · 고유 블록 */
function formDetail(faction: FactionConfig, f: FormDef, current: boolean): Node[] {
  const head = h('div', 'bha-mddetail__head bha-dexdetail__head');
  head.append(marksOf(f, faction.id));
  if (current) head.append(h('span', 'bha-chip bha-chip--good', '지금'));
  if (f.provisional) head.append(provisionalTag());
  const lines = formEffectLines(faction, f);
  const body = h('p', 'bha-mddetail__body');
  body.append(formHint(f, faction.id));
  for (const line of lines.slice(1)) body.append(h('br'), ...pairsOf(line));
  const rel = releaseLine(faction, f);
  if (rel) body.append(h('br'), rel);
  return [head, body, abilityParagraph(dexAbilityLines(f, faction.id))];
}

/** 도감 한 칸: 진화체 하나, 또는 모델 단위 단계(종족 설정 tierLooks[단계].lookUnit — 호로 아쥬커스)의 모델 하나 */
type DexEntry = { kind: 'form'; form: FormDef } | { kind: 'cell'; cell: LookCell };

/** 단계 하나의 칸들: 모델 단위 단계는 모델 칸(능력치 모델 → 히든), 아니면 진화체(히든은 맨 뒤) */
export function dexEntriesOfTier(faction: FactionConfig, tier: number): DexEntry[] {
  const cells = lookCells(faction, tier);
  if (cells.length > 0) return cells.map((cell) => ({ kind: 'cell', cell }));
  return sortFormsForDex(formsOfTier(tier)).map((form) => ({ kind: 'form', form }));
}

/** 칸 대표 색 변형: 지금 그 칸이면 지금 진화체, 아니면 발견한 것 중 노멀(기본 보라) → 처음 발견한 것. 하나도 없으면 첫 변형(실루엣용) */
function cellPick(cell: LookCell, found: readonly FormDef[], current: FormDef | null): FormDef {
  if (current && found.some((f) => f.id === current.id)) return current;
  return found.find((f) => (f.elements?.[0] ?? 'normal') === 'normal') ?? found[0] ?? cell.forms.find((f) => (f.elements?.[0] ?? 'normal') === 'normal') ?? cell.forms[0]!;
}

/** 한 목록(2단계 → 3단계 → …)을 정렬 기준대로 바둑판에. 기본 정렬은 단계 머리줄(caption: '바스트로데 3/28') */
export function dexView(root: HTMLElement, faction: FactionConfig, save: SaveData, title: string | Node = '진화체 도감', persist?: () => void): void {
  const unlocked = new Set(save.formDex);
  const lookDex = save.lookDex ?? [];
  const tiers = [2, 3, 4, 5];
  const entries = tiers.flatMap((t) => dexEntriesOfTier(faction, t));
  const currentForm = noEvolutionLabel(save) || !save.evolution.formId ? null : tryGetForm(save.evolution.formId) ?? null; // 초월자는 '지금' 진화체 없음 (사용자 2026-11-15)
  const currentCell = currentForm ? lookCellOf(faction, currentForm, save.evolution.look) : null;
  const known = (e: DexEntry): boolean => (e.kind === 'form' ? unlocked.has(e.form.id) : foundVariants(e.cell, lookDex).length > 0);
  const tierOf = (e: DexEntry): number => (e.kind === 'form' ? e.form.tier : e.cell.tier);
  const found = entries.filter(known).length;
  const sortState = (save.dexSort ??= newDexSortState());
  const facts = (e: DexEntry): DexSortFacts => {
    if (e.kind === 'form') {
      const f = e.form;
      const els = f.elements ?? f.label.elements;
      return { known: unlocked.has(f.id), name: formName(f, faction.id), element: els.length ? ELEMENT_IDS.indexOf(els[0]!) : Infinity, found: save.formDex.indexOf(f.id), group: f.tier };
    }
    const vs = foundVariants(e.cell, lookDex);
    const el = vs[0]?.elements?.[0];
    const at = vs.map((f) => lookDex.indexOf(lookDexKey(e.cell.model, f.id))).filter((i) => i >= 0);
    return { known: vs.length > 0, name: cellName(faction, e.cell), element: el ? ELEMENT_IDS.indexOf(el) : Infinity, found: at.length ? Math.min(...at) : Infinity, group: e.cell.tier };
  };
  const grid = dexGrid('진화체');
  const fill = (): void => {
    const sorted = sortDex(entries, sortState.forms, facts);
    const nodes: HTMLElement[] = [];
    let lastTier = -1;
    for (const e of sorted) {
      const t = tierOf(e);
      if (sortState.forms === 'default' && t !== lastTier) {
        lastTier = t;
        const all = entries.filter((x) => tierOf(x) === t);
        nodes.push(dexCaption(`${faction.tierNames[t - 1]!} ${all.filter(known).length}/${all.length}`));
      }
      nodes.push(e.kind === 'form' ? formCardOf(faction, e.form, unlocked, currentForm?.id ?? null) : cellCardOf(faction, e.cell, lookDex, currentCell?.key === e.cell.key ? currentForm : null));
    }
    grid.replaceChildren(...nodes);
    grid.scrollTop = 0;
  };
  fill();
  const sort = dexSortButton(sortState.forms, () => {
    sortState.forms = nextDexSort(FORM_DEX_SORTS, sortState.forms);
    persist?.();
    fill();
    return sortState.forms;
  });
  const sub = h('span');
  sub.append('발견 ', h('b', '', String(found)), ` / ${entries.length}`);
  lcdPage(root, { cls: 'bha-dex-page bha-dexgrid-page', cols: 'minmax(0, 1fr)' }, lcdHead({ title, sub, logo: logoMark(faction, 'bha-logo--md') ?? undefined, aside: [selectLast(sort)] }), [grid], []);
}

function formCardOf(faction: FactionConfig, f: FormDef, unlocked: ReadonlySet<string>, currentFormId: string | null): HTMLElement {
  const m = formCardModel(f, unlocked, currentFormId);
  const tierName = faction.tierNames[f.tier - 1] ?? `${f.tier}단계`;
  if (m.state === 'unknown') {
    return dexCard({
      name: '???', unknown: true, art: formArt(faction, f, false), marks: null, badge: m.hidden ? '히든' : undefined,
      onOpen: () => itemDialog({ heading: tierName, name: '미발견', desc: '진화한 적 있는 진화체만 보인다.', art: formArt(faction, f, false), hero: true, cls: 'bha-dexmodal', actions: [] }),
    });
  }
  const name = shownName(formName(f, faction.id));
  return dexCard({
    name, unknown: false, art: formArt(faction, f, true), marks: marksOf(f, faction.id),
    badge: m.current ? '지금' : m.hidden ? '히든' : undefined,
    paint: (node) => paintElement(node, m.element),
    onOpen: () => itemDialog({ heading: tierName, name, desc: '', content: formDetail(faction, f, m.current), art: formArt(faction, f, true), hero: true, cls: 'bha-dexmodal', actions: [] }),
  });
}

/** 모델 칸 카드 (GDD 8-5 v6.096, C.470): 그림 = 그 모델 실제 그림(발견한 색 하나, 기본 보라), 속성 마크 = 발견한 색들. current = 지금 이 칸이면 지금 진화체 */
function cellCardOf(faction: FactionConfig, cell: LookCell, lookDex: readonly string[], current: FormDef | null): HTMLElement {
  const t = lookUnitTable(faction, cell.tier)!;
  const tierName = faction.tierNames[cell.tier - 1] ?? `${cell.tier}단계`;
  const found = foundVariants(cell, lookDex);
  const pick = cellPick(cell, found, current);
  const artOf = (f: FormDef, known: boolean): HTMLElement => formArt(faction, f, known, lookSkinOf(t, cell.model, f));
  if (found.length === 0) {
    return dexCard({
      name: '???', unknown: true, art: artOf(pick, false), marks: null, badge: cell.hidden ? '히든' : undefined, cls: 'bha-dexcard--model',
      onOpen: () => itemDialog({ heading: tierName, name: '미발견', desc: '진화한 적 있는 진화체만 보인다.', art: artOf(pick, false), hero: true, cls: 'bha-dexmodal', actions: [] }),
    });
  }
  const name = shownName(cellName(faction, cell));
  const marks = cell.fixed ? marksOf(pick, faction.id) : h('span', 'bha-formcard__marks');
  if (!cell.fixed) for (const f of found) marks.append(elementDot(lookVariantOf(t, f), faction.id));
  const card = dexCard({
    name, unknown: false, art: artOf(pick, true), marks,
    badge: current ? '지금' : cell.hidden ? '히든' : undefined, cls: 'bha-dexcard--model',
    paint: (node) => paintElement(node, lookVariantOf(t, pick)),
    onOpen: () => openCellDetail(faction, cell, found, pick, current, name, tierName),
  });
  card.dataset.model = cell.model;
  return card;
}

/** 모델 칸 상세 창: 큰 그림 + 색 칩(속성 색 변형 — 발견한 색은 누르면 그 색 그림·그 진화체 내용, 못 본 색은 '?') + 진화체 내용 */
function openCellDetail(faction: FactionConfig, cell: LookCell, found: readonly FormDef[], first: FormDef, current: FormDef | null, name: string, tierName: string): void {
  const t = lookUnitTable(faction, cell.tier)!;
  let pick = first;
  const art = formArt(faction, pick, true, lookSkinOf(t, cell.model, pick));
  const detail = h('div', 'bha-dexdetail__form');
  const chips = h('div', 'bha-row bha-skinpick__chips bha-dexdetail__chips');
  chips.setAttribute('role', 'radiogroup');
  chips.setAttribute('aria-label', '색');
  const sync = (): void => {
    const look = lookSkinOf(t, cell.model, pick);
    fillArt(art, faction, pick, look, true);
    const head = art.closest('.bha-itemmodal')?.querySelector('.bha-itemmodal__icon');
    if (head) head.replaceChildren(art.cloneNode(true));
    detail.replaceChildren(...formDetail(faction, pick, current?.id === pick.id));
    chips.querySelectorAll<HTMLButtonElement>('.bha-skinpick__chip').forEach((b) => {
      const on = b.dataset.form === pick.id;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-checked', String(on));
    });
  };
  for (const f of cell.forms) {
    const v = lookVariantOf(t, f);
    const seen = found.some((x) => x.id === f.id);
    const b = h('button', `bha-chip bha-skinpick__chip${seen ? '' : ' is-unknown'}`) as HTMLButtonElement;
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.dataset.form = f.id;
    b.dataset.variant = v;
    if (seen) {
      b.append(elementDot(v, faction.id), elementName(v, faction.id));
      b.onclick = () => { pick = f; sync(); };
    } else {
      b.append('?');
      b.disabled = true;
      b.setAttribute('aria-label', '못 본 색');
    }
    chips.append(b);
  }
  detail.append(...formDetail(faction, pick, current?.id === pick.id));
  const content: Node[] = cell.forms.length > 1 ? [h('b', 'bha-small', '색'), chips, detail] : [detail];
  itemDialog({ heading: tierName, name, desc: '', content, art, hero: true, cls: 'bha-dexmodal', actions: [] });
  sync();
}
