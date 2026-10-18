// 시작 화면 (GDD 18-1): 타이틀 + [이어하기][새로 시작][불러오기] 3개만. 슬롯 3개(C.31)는 이어하기·새로 시작 뒤의 선택 화면(slotView)에서 고른다. 종족 고르기(U-1)는 새로 시작 다음 화면(speciesView)이다.
// 종족 카드는 각자 data-bha-theme 로 그 종족 테마를 부분 미리보기한다. 종족 카드를 누르면 바로 시작한다 (확인 단계 없음, 기획 15-2 결정 6).
import { START_LEAD, START_TEXT_PROVISIONAL, speciesStartText } from '../data/start';
import type { FactionConfig } from '../engine/faction';
import { formatPlayedAt, lastPlayedSlot, type SlotSummary } from '../saveSlots';
import { versionLabel } from '../version';
import { button, el, icon, mountApp, notice, provisionalTag } from './bha/dom';

export interface StartHandlers {
  onNew: () => void;
  onContinue: () => void;
  onImport: () => void;
}

/** 슬롯 한 줄의 글: "호로 · 2단계 바이저드 · 원정 5회" / "비어 있음" / "손상됨" 과 마지막 플레이 시각 */
export function slotLine(sum: SlotSummary, factions: readonly FactionConfig[]): { main: string; sub: string } {
  if (sum.state === 'empty') return { main: '비어 있음', sub: '' };
  if (sum.state === 'broken') return { main: '읽을 수 없는 세이브', sub: '손상되었거나 알 수 없는 형식' };
  const f = factions.find((x) => x.id === sum.factionId);
  const tier = f ? `${sum.tierIndex + 1}단계 ${f.tierNames[sum.tierIndex] ?? ''}`.trim() : `${sum.tierIndex + 1}단계`;
  const at = sum.playedAt !== null ? formatPlayedAt(sum.playedAt) : '시각 기록 없음';
  return {
    main: `${f?.name ?? sum.factionId} · ${tier} · 원정 ${sum.expeditions}회`,
    sub: `마지막 플레이 ${at}${sum.inExpedition ? ' · 원정 중' : ''}`,
  };
}

/** 슬롯 목록 (표시용 한 칸). 행을 눌러 고르게 하려면 onPick 을 준다. disabled 가 true 인 슬롯은 누를 수 없다 */
export function slotRows(
  summaries: readonly SlotSummary[], factions: readonly FactionConfig[], onPick?: (s: SlotSummary) => void, highlight?: number | null,
  disabled?: (s: SlotSummary) => boolean,
): HTMLElement {
  const list = el('div', 'bha-slots');
  if (onPick) list.dataset.scList = '';
  for (const sum of summaries) {
    const t = slotLine(sum, factions);
    const row = el(onPick ? 'button' : 'div', `bha-slot${sum.state === 'ok' ? '' : ' is-empty'}${highlight === sum.slot ? ' is-last' : ''}`);
    if (row instanceof HTMLButtonElement) {
      row.type = 'button';
      row.disabled = !!disabled?.(sum);
    }
    row.dataset.slot = String(sum.slot);
    const body = el('span', 'bha-slot__body');
    body.append(el('span', 'bha-slot__main', t.main));
    if (t.sub) body.append(el('span', 'bha-slot__sub', t.sub));
    row.append(el('span', 'bha-slot__no', `슬롯 ${sum.slot}`), body);
    if (onPick) row.onclick = () => onPick(sum);
    list.append(row);
  }
  return list;
}

/** 시작 화면 (GDD 18-1): 타이틀 중앙 상단 + [이어하기][새로 시작][불러오기] 세로 3개. 슬롯 고르기는 이어하기·새로 시작을 누르면 뜬다 */
export function startView(root: HTMLElement, summaries: readonly SlotSummary[], h: StartHandlers, note = ''): void {
  const hero = el('header', 'bha-start__hero');
  const title = el('h1', 'bha-start__title');
  title.append(el('span', '', '블리치'), el('span', '', '할로우 어센션'));
  hero.append(el('span', 'bha-start__eyebrow', 'BLEACH HOLLOW ASCENSION'), title);

  const last = lastPlayedSlot(summaries);
  const menu = el('div', 'bha-start__menu');
  menu.dataset.scList = '';
  menu.append(
    button({ label: '이어하기', icon: 'i-loop', variant: 'primary', disabled: last === null, onClick: h.onContinue }),
    button({ label: '새로 시작', icon: 'i-play', onClick: h.onNew }),
    button({ label: '불러오기', icon: 'i-deck', onClick: h.onImport }),
  );
  const nodes: Node[] = [hero, menu];
  if (note) nodes.push(notice('warn', note));
  nodes.push(el('p', 'bha-start__ver', versionLabel()));
  mountApp(root, { cls: 'bha-start bha-start--title' }, ...nodes);
}

export interface SpeciesHandlers {
  onPick: (faction: FactionConfig) => void;
  onSettings: () => void;
  onHelp: () => void;
}

/** 종족 고르기 (새로 시작의 마지막 단계, 방에서 종족 바꾸기도 같은 화면) */
export function speciesView(root: HTMLElement, factions: readonly FactionConfig[], h: SpeciesHandlers, heading = ''): void {
  const hero = el('header', 'bha-start__hero');
  const title = el('h1', 'bha-start__title');
  title.append(el('span', '', '블리치'), el('span', '', '할로우 어센션'));
  hero.append(el('span', 'bha-start__eyebrow', 'BLEACH HOLLOW ASCENSION'), title, el('p', 'bha-start__lead', heading || START_LEAD));

  const species = el('div', 'bha-species');
  species.setAttribute('role', 'radiogroup');
  species.dataset.scList = '';
  species.setAttribute('aria-label', '종족 선택');
  // 3번째 종족부터는 카드를 세로 목록(1열)으로
  if (factions.length > 2) species.style.gridTemplateColumns = 'minmax(0, 1fr)';
  for (const f of factions) {
    const text = speciesStartText(f.id);
    const card = el('button', 'bha-species__card');
    card.type = 'button';
    card.dataset.bhaTheme = f.theme;
    card.setAttribute('role', 'radio');
    card.setAttribute('aria-checked', 'false');
    const emblem = el('span', 'bha-species__emblem');
    emblem.append(icon(text.emblemIcon));
    const desc = el('span', 'bha-species__desc');
    if (text.desc) {
      desc.append(text.desc);
      if (START_TEXT_PROVISIONAL) desc.append(' ', provisionalTag('제안 문구'));
    }
    const path = el('span', 'bha-species__path');
    path.append(el('b', '', f.tierNames[0]), `→${f.tierNames.slice(1).join('→')}`);
    card.append(emblem, el('span', 'bha-species__name', f.name), desc, path);
    card.onclick = () => h.onPick(f);
    species.append(card);
  }

  const grid = el('div', 'bha-grid2');
  grid.append(button({ label: '설정', icon: 'i-settings', onClick: h.onSettings }), button({ label: '도움말·튜토리얼', icon: 'i-help', onClick: h.onHelp }));
  // LCD 가로 (T-3): 왼쪽 = 제목·소개·설정/도움말, 오른쪽 = 종족 카드
  const left = el('div', 'bha-start__left');
  left.append(hero, grid, el('p', 'bha-start__ver', versionLabel()));
  mountApp(root, { cls: 'bha-start' }, left, species);
}
