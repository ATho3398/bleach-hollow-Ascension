// 진화체 도감 화면 (GDD 20-5 → 220장 1·2): 머리에 발견 수·정렬 버튼 · 아래 바둑판 카드(그림 + 이름 + 속성 마크). 카드를 누르면 상세 창(공용 창 틀 itemDialog).
// 미발견은 그림 실루엣 + '???'. 기본 정렬은 단계 머리줄(2단계 → 3단계 → …, 히든은 그 단계 맨 뒤). 지금 진화체는 '지금' 표시.
// 그림 = 종족·단계 캐릭터 그림(진화체마다 그림이 따로 없어서 그 단계 그림). 속성을 잇는 진화체는 속성 마크 자리에 '특'(220장 4).
import { ELEMENT_IDS } from '../data/elements';
import { FORM_TABLE, formHasUniqueRelease, formHint, formName, formReleaseCutin, formsOfTier } from '../data/evolution';
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

/** 진화체 그림: 그 단계 캐릭터 그림(없으면 아이콘). 미발견은 실루엣 */
function formArt(faction: FactionConfig, f: FormDef, known: boolean): HTMLElement {
  const box = h('span', `bha-dexart${known ? '' : ' is-silhouette'}`);
  const art = roomCharArt(roomOf(faction), faction.id, Math.max(0, f.tier - 1));
  if (art.src) {
    const img = imageArt(art.src);
    img.style.setProperty('--art-scale', String(art.scale)); // 방 캐릭터와 같은 배율·세로 보정 (그림 칸 256 안의 몸 크기)
    img.style.setProperty('--art-dy', `${art.offsetY}%`);
    box.append(img);
  } else box.append(icon(known ? 'i-evolve' : 'i-unknown'));
  return box;
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

/** 한 목록(2단계 → 3단계 → …)을 정렬 기준대로 바둑판에. 기본 정렬은 단계 머리줄(caption: '바스트로데 3/28') */
export function dexView(root: HTMLElement, faction: FactionConfig, save: SaveData, title: string | Node = '진화체 도감', persist?: () => void): void {
  const unlocked = new Set(save.formDex);
  const found = FORM_TABLE.filter((f) => unlocked.has(f.id)).length;
  const tiers = [2, 3, 4, 5];
  const forms = tiers.flatMap((t) => sortFormsForDex(formsOfTier(t)));
  const sortState = (save.dexSort ??= newDexSortState());
  const facts = (f: FormDef): DexSortFacts => {
    const els = f.elements ?? f.label.elements;
    return { known: unlocked.has(f.id), name: formName(f, faction.id), element: els.length ? ELEMENT_IDS.indexOf(els[0]!) : Infinity, found: save.formDex.indexOf(f.id), group: f.tier };
  };
  const grid = dexGrid('진화체');
  const fill = (): void => {
    const sorted = sortDex(forms, sortState.forms, facts);
    const nodes: HTMLElement[] = [];
    let lastTier = -1;
    for (const f of sorted) {
      if (sortState.forms === 'default' && f.tier !== lastTier) {
        lastTier = f.tier;
        const all = formsOfTier(f.tier);
        nodes.push(dexCaption(`${faction.tierNames[f.tier - 1]!} ${all.filter((x) => unlocked.has(x.id)).length}/${all.length}`));
      }
      nodes.push(formCardOf(faction, f, unlocked, noEvolutionLabel(save) ? null : save.evolution.formId)); // 초월자는 '지금' 진화체 없음 (사용자 2026-11-15)
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
  sub.append('발견 ', h('b', '', String(found)), ` / ${FORM_TABLE.length}`);
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
