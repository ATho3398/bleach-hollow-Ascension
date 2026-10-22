// 시작 화면 (GDD 18-1·19-3): 타이틀 + [이어하기][새로 시작][불러오기] 3개만. 이어하기는 슬롯 선택 없이 가장 최근 슬롯을 바로 열고, 새로 시작·불러오기는 슬롯 선택 화면(slotView)을 연다.
// 종족 고르기(GDD 19-4)는 새로 시작 다음 화면(speciesView): 종족 수만큼 화면을 등분해 아이콘(이모티콘)과 이름만 크게. 칸마다 data-bha-theme 로 그 종족 테마를 입힌다.
import { emblemOf, type FactionConfig } from '../engine/faction';
import { formatPlayedAt, lastPlayedSlot, type SlotSummary } from '../saveSlots';
import { versionLabel } from '../version';
import { onUpdateReady } from '../pwa';
import { button, el, mountApp, notice } from './bha/dom';
import { logoMark } from './bha/logo';

export interface StartHandlers {
  onNew: () => void;
  onContinue: () => void;
  onImport: () => void;
  /** 열 수 없는 형식 슬롯의 [옛 세이브 내보내기] (GDD 61장) */
  onExportOld?: (slot: number) => void;
}

/** 열 수 없는 형식(이전·더 새로운 버전) 세이브 알림 문구 (GDD 61장) */
export const INCOMPATIBLE_TEXT = {
  old: '이전 버전 세이브라 이어서 할 수 없습니다 — 새로 시작합니다',
  newer: '더 새로운 버전 세이브라 이어서 할 수 없습니다 — 새로 시작합니다',
} as const;

/** 슬롯 한 줄의 글: "호로 · 2단계 바이저드 · 원정 5회" / "비어 있음" / "손상됨" 과 마지막 플레이 시각 */
export function slotLine(sum: SlotSummary, factions: readonly FactionConfig[]): { main: string; sub: string } {
  if (sum.state === 'empty') return { main: '비어 있음', sub: '' };
  if (sum.state === 'incompatible') return { main: sum.reason === 'old' ? '이전 버전 세이브' : '더 새로운 버전 세이브', sub: '이어서 할 수 없다 · 내보내거나 새로 시작' };
  if (sum.state === 'broken') return sum.recoverable ? { main: '손상된 세이브', sub: '열면 슬롯 백업으로 복구한다' } : { main: '읽을 수 없는 세이브', sub: '손상되었거나 알 수 없는 형식' };
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
    const fac = sum.state === 'ok' ? factions.find((x) => x.id === sum.factionId) : undefined;
    const mark = fac ? logoMark(fac, 'bha-logo--sm') : null;
    row.append(el('span', 'bha-slot__no', `슬롯 ${sum.slot}`), body);
    if (mark) {
      row.prepend(mark);
      row.classList.add('bha-slot--logo');
    }
    if (onPick) row.onclick = () => onPick(sum);
    list.append(row);
  }
  return list;
}

/** 열 수 없는 형식 슬롯 알림: 한 줄 문구 + 슬롯별 [옛 세이브 내보내기] + [새로 시작] (GDD 61장). 슬롯 원문은 새로 시작해 덮어쓸 때까지 지우지 않는다 */
function incompatibleNotice(stale: readonly Extract<SlotSummary, { state: 'incompatible' }>[], h: StartHandlers): HTMLElement {
  const box = el('div', 'bha-start__stale');
  box.dataset.sc = 'start.stale';
  const text = stale.some((x) => x.reason === 'old') ? INCOMPATIBLE_TEXT.old : INCOMPATIBLE_TEXT.newer;
  box.append(notice('warn', text));
  const row = el('div', 'bha-start__stale-actions');
  for (const x of stale) {
    if (h.onExportOld) row.append(button({ label: `슬롯 ${x.slot} 옛 세이브 내보내기`, icon: 'i-deck', size: 'small', variant: 'ghost', onClick: () => h.onExportOld?.(x.slot) }));
  }
  row.append(button({ label: '새로 시작', icon: 'i-play', size: 'small', onClick: h.onNew }));
  box.append(row);
  return box;
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
  const stale = summaries.filter((x): x is Extract<SlotSummary, { state: 'incompatible' }> => x.state === 'incompatible');
  if (stale.length > 0) nodes.push(incompatibleNotice(stale, h));
  const ver = el('p', 'bha-start__ver', versionLabel());
  nodes.push(ver);
  // 오프라인 플레이(GDD 60장): 새 버전을 받아 뒀으면 한 줄 안내 (적용은 앱을 다시 열 때)
  onUpdateReady(() => {
    if (ver.isConnected) ver.after(el('p', 'bha-start__ver', '새 버전을 받았습니다 — 앱을 닫았다 다시 열면 적용됩니다'));
  });
  mountApp(root, { cls: 'bha-start bha-start--title' }, ...nodes);
}

export interface SpeciesHandlers {
  /** 칸을 눌러 고른 뒤 확인창에서 [예]를 눌렀을 때 */
  onPick: (faction: FactionConfig) => void;
  onSettings: () => void;
  onHelp: () => void;
  /** 고른 종족 확인 (확인 한 번). 확인창을 띄우고 예 → onYes, 아니오 → onNo */
  confirm: (faction: FactionConfig, onYes: () => void, onNo: () => void) => void;
}

/** 종족 고르기 (GDD 19-4): 설명 없이 종족 수만큼 등분한 칸에 아이콘 + 이름 한 단어. 설정·도움말(튜토리얼)은 위 구석 작은 아이콘 버튼. (C.63: 방의 종족 바꾸기는 지웠다 — 새 슬롯에서만) */
export function speciesView(root: HTMLElement, factions: readonly FactionConfig[], h: SpeciesHandlers): void {
  const species = el('div', 'bha-species bha-species--split');
  species.setAttribute('role', 'radiogroup');
  species.dataset.scList = '';
  species.setAttribute('aria-label', '종족 선택');
  // 종족 수만큼 등분 (3번째 종족이 생기면 3등분). 종족 id 로 분기하지 않는다
  species.style.gridTemplateColumns = `repeat(${Math.max(1, factions.length)}, minmax(0, 1fr))`;
  const cards: HTMLButtonElement[] = [];
  for (const f of factions) {
    const card = el('button', 'bha-species__card');
    card.type = 'button';
    card.dataset.bhaTheme = f.theme;
    card.dataset.faction = f.id;
    card.setAttribute('role', 'radio');
    card.setAttribute('aria-checked', 'false');
    card.setAttribute('aria-label', f.name);
    const mark = logoMark(f, 'bha-logo--xl');
    card.append(mark ?? el('span', 'bha-species__emblem', emblemOf(f)), el('span', 'bha-species__name', f.name));
    card.onclick = () => {
      for (const c of cards) {
        const on = c === card;
        c.classList.toggle('is-selected', on);
        c.setAttribute('aria-checked', String(on));
      }
      h.confirm(f, () => h.onPick(f), () => {
        card.classList.remove('is-selected');
        card.setAttribute('aria-checked', 'false');
      });
    };
    cards.push(card);
    species.append(card);
  }

  const corner = el('div', 'bha-start__corner');
  const settings = button({ label: '설정', icon: 'i-settings', iconOnly: true, size: 'small', variant: 'ghost', onClick: h.onSettings });
  settings.dataset.sc = 'corner.settings';
  const help = button({ label: '도움말·튜토리얼', icon: 'i-help', iconOnly: true, size: 'small', variant: 'ghost', onClick: h.onHelp });
  help.dataset.sc = 'corner.help';
  corner.append(settings, help);
  mountApp(root, { cls: 'bha-start bha-start--species' }, species, corner);
}
