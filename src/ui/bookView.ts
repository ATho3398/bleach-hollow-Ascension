// 책장 (GDD 34-5): [진화체 도감] [칭호 도감] 두 탭. 바깥 탭은 각 도감 머리의 첫 번째 탭줄로 들어가고, 눌러 바꾸면 같은 화면(root)에 다른 도감을 다시 그린다.

import type { FactionConfig } from '../engine/faction';
import type { SaveData } from '../game';
import { seg } from './bha/dom';
import { selectLast } from './bha/lcdpage';
import { dexView } from './dexView';
import { titleDexView } from './titleDexView';

export type BookTab = 'dex' | 'titles';

export function bookView(root: HTMLElement, faction: FactionConfig, save: SaveData, tab: BookTab = 'dex'): void {
  const lead = seg(
    [{ id: 'dex', label: '진화체 도감' }, { id: 'titles', label: '칭호 도감' }],
    tab,
    (id) => bookView(root, faction, save, id as BookTab),
    { small: true },
  );
  lead.setAttribute('aria-label', '책장');
  selectLast(lead); // 탭은 목록 뒤로(다른 도감 화면과 같은 순서)
  if (tab === 'dex') dexView(root, faction, save, 2, lead);
  else titleDexView(root, faction, save, 'rank', lead);
}
