// 도감 바둑판 (GDD 220장 1·2): 진화체 도감·적 도감 공용 — 카드 = 그림 + 이름 + 속성 마크만, 누르면 상세 창(itemDialog 공용 창 틀).
// 격자 칸 수는 화면 폭에 맞춘다(auto-fill), 넘치면 세로 스크롤 + '▼ 더 있음'. 정렬 버튼은 누를 때마다 다음 기준(engine/dexSort).
// 종족 무관 — 이름·그림·속성은 부르는 화면이 데이터에서 넘긴다.
import { DEX_SORT_LABEL, type DexSortKey } from '../../engine/dexSort';
import { button, el } from './dom';
import { moreHint } from './itemUi';

export interface DexCardSpec {
  name: string;
  /** 그림 칸 (미발견은 실루엣으로 넘긴다) */
  art: Node;
  /** 속성 마크 줄 (미발견은 null) */
  marks: Node | null;
  unknown: boolean;
  /** 오른쪽 위 작은 표시 ('지금'·'히든') */
  badge?: string;
  /** '새' 점 (적 도감) */
  dot?: HTMLElement | null;
  /** 카드 색 칠하기 (속성 색 변수) */
  paint?: (node: HTMLElement) => void;
  cls?: string;
  onOpen: () => void;
}

/** 카드 한 장 (카드 전체가 버튼): 그림 · 이름 · 속성 마크 */
export function dexCard(s: DexCardSpec): HTMLButtonElement {
  const card = el('button', ['bha-card bha-itemcard bha-dexcard', s.unknown ? 'is-unknown' : '', s.cls ?? ''].filter(Boolean).join(' '));
  card.type = 'button';
  card.setAttribute('aria-label', s.badge ? `${s.name} ${s.badge}` : s.name);
  const art = el('span', 'bha-itemcard__art bha-dexcard__art');
  art.append(s.art);
  card.append(art, el('b', 'bha-card-name bha-itemcard__name bha-dexcard__name', s.name));
  const foot = el('span', 'bha-dexcard__marks');
  if (s.marks) foot.append(s.marks);
  card.append(foot);
  if (s.badge) card.append(el('span', 'bha-count bha-itemcard__badge', s.badge));
  if (s.dot) card.append(s.dot);
  s.paint?.(card);
  card.onclick = s.onOpen;
  return card;
}

/** 격자 한 칸을 다 쓰는 구역 머리줄 (기본 정렬의 '2단계 3/5' 같은 줄) */
export function dexCaption(text: string): HTMLElement {
  return el('h3', 'bha-mdcap bha-dexgrid__cap', text);
}

/** 바둑판 격자: 넘치면 세로 스크롤 + 바닥 '▼ 더 있음' (부모 칸에 띠) */
export function dexGrid(label: string): HTMLElement {
  const grid = el('div', 'bha-itemgrid bha-dexgrid');
  grid.setAttribute('role', 'group');
  grid.setAttribute('aria-label', label);
  requestAnimationFrame(() => { if (grid.isConnected && grid.parentElement) moreHint(grid, grid.parentElement); });
  return grid;
}

/** 정렬 버튼: '정렬 · 기본' — 누를 때마다 onNext 가 다음 기준을 돌려준다 */
export function dexSortButton(cur: DexSortKey, onNext: () => DexSortKey): HTMLButtonElement {
  const b = button({ label: '', size: 'small', onClick: () => paint(onNext()) });
  b.classList.add('bha-dexsort');
  const paint = (k: DexSortKey): void => {
    b.replaceChildren(el('span', 'bha-dexsort__label', '정렬'), el('b', 'bha-dexsort__key', DEX_SORT_LABEL[k]));
    b.setAttribute('aria-label', `정렬 기준 ${DEX_SORT_LABEL[k]} — 누르면 다음 기준`);
    b.dataset.sort = k;
  };
  paint(cur);
  return b;
}
