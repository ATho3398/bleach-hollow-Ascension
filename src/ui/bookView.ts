// 책장 (GDD 34-5, 58, 200장): 진화체 도감 · 칭호 도감 · 적 도감. 머리의 제목이 "진화체 도감 ▾" 토글이고, 누르면 목록이 열려 다른 도감으로 바꾼다(같은 화면 root 에 다시 그림).
// 예전 머리의 탭 2개 줄은 없앴다(단계 탭 줄을 넓히려고, C.114). 적 도감(C.330)은 새 버튼 자리 없이 이 토글에만 더했다(173장 2).
// C.570 (GDD 14-8 v6.256): [일러스트] [애니메이션] 다시 보기 탭도 이 토글에 — 테스트 모드면 두 탭 전부 열림.
import type { FactionConfig } from '../engine/faction';
import type { SaveData } from '../game';
import { viewTitle } from './bha/viewtitle';
import { selectLast } from './bha/lcdpage';
import { dexView } from './dexView';
import { enemyDexView } from './enemyDexView';
import { titleDexView } from './titleDexView';
import { animView, illustView } from './galleryView';
import { isTestMode } from './testMode';

export type BookTab = 'dex' | 'titles' | 'enemies' | 'illusts' | 'anims';

export const BOOK_TABS: readonly { id: BookTab; label: string }[] = [{ id: 'dex', label: '진화체 도감' }, { id: 'titles', label: '칭호 도감' }, { id: 'enemies', label: '적 도감' }, { id: 'illusts', label: '일러스트' }, { id: 'anims', label: '애니메이션' }];

/** persist = 적 도감의 '새' 점을 지운 것·도감 정렬 기준(220장 2)을 저장할 때 (없으면 메모리에서만) */
export function bookView(root: HTMLElement, faction: FactionConfig, save: SaveData, tab: BookTab = 'dex', persist?: () => void): void {
  const title = selectLast(viewTitle(BOOK_TABS, tab, (id) => bookView(root, faction, save, id as BookTab, persist))); // 제목 토글은 목록 뒤로(다른 도감 화면과 같은 순서)
  if (tab === 'dex') dexView(root, faction, save, title, persist);
  else if (tab === 'enemies') enemyDexView(root, faction, save, title, persist);
  else if (tab === 'illusts') illustView(root, faction, save, title, isTestMode());
  else if (tab === 'anims') animView(root, faction, save, title, isTestMode(), () => bookView(root, faction, save, 'anims', persist));
  else titleDexView(root, faction, save, 'rank', title);
}
