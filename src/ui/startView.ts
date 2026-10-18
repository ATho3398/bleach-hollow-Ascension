// 시작 화면 (종족 선택, U-1): 카드를 누르면 바로 시작한다 (확인 단계 없음, 기획 15-2 결정 6).
// 종족 카드는 각자 data-bha-theme 로 그 종족 테마를 부분 미리보기한다.
import { START_LEAD, START_TEXT_PROVISIONAL, speciesStartText } from '../data/start';
import type { FactionConfig } from '../engine/faction';
import { versionLabel } from '../version';
import { button, el, icon, mountApp, provisionalTag } from './bha/dom';

export interface StartHandlers {
  onPick: (faction: FactionConfig) => void;
  onSettings: () => void;
  onHelp: () => void;
}

export function startView(root: HTMLElement, factions: readonly FactionConfig[], h: StartHandlers): void {
  const hero = el('header', 'bha-start__hero');
  const title = el('h1', 'bha-start__title');
  title.append(el('span', '', '블리치'), el('span', '', '할로우 어센션'));
  hero.append(el('span', 'bha-start__eyebrow', 'BLEACH HOLLOW ASCENSION'), title, el('p', 'bha-start__lead', START_LEAD));

  const species = el('div', 'bha-species');
  species.setAttribute('role', 'radiogroup');
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
  const bottom = el('div', 'bha-stack');
  bottom.append(grid, el('p', 'bha-start__ver', versionLabel()));
  mountApp(root, { cls: 'bha-start' }, hero, species, bottom);
}
