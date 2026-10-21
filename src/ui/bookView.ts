// 책장 (GDD 34-5, 58): 진화체 도감 · 칭호 도감. 머리의 제목이 "진화체 도감 ▾" 토글이고, 누르면 목록이 열려 다른 도감으로 바꾼다(같은 화면 root 에 다시 그림).
// 예전 머리의 탭 2개 줄은 없앴다(단계 탭 줄을 넓히려고, C.114).
import type { FactionConfig } from '../engine/faction';
import type { SaveData } from '../game';
import { viewTitle } from './bha/viewtitle';
import { selectLast } from './bha/lcdpage';
import { dexView } from './dexView';
import { titleDexView } from './titleDexView';

export type BookTab = 'dex' | 'titles';

export const BOOK_TABS: readonly { id: BookTab; label: string }[] = [{ id: 'dex', label: '진화체 도감' }, { id: 'titles', label: '칭호 도감' }];

export function bookView(root: HTMLElement, faction: FactionConfig, save: SaveData, tab: BookTab = 'dex'): void {
  const title = selectLast(viewTitle(BOOK_TABS, tab, (id) => bookView(root, faction, save, id as BookTab))); // 제목 토글은 목록 뒤로(다른 도감 화면과 같은 순서)
  if (tab === 'dex') dexView(root, faction, save, 2, title);
  else titleDexView(root, faction, save, 'rank', title);
}
