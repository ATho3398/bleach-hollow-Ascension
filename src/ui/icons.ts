// 블록 아이콘 (C.18, GDD 14-3): 역할·필살·공허·체인을 글꼴에 의존하지 않는 인라인 SVG 로 그린다. 색은 CSS(currentColor)가 정한다.
import type { BlockRole } from '../engine/faction';

const svg = (body: string) =>
  `<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">${body}</svg>`;

/** 역할별 모양: 공격 = 칼, 막기 = 방패, 회복 = 십자 */
export const ROLE_ICON: Record<BlockRole, string> = {
  attack: svg('<path d="M13 1l2 2-7 7-1.5-.5L5 11l-1-1 1.5-1.5L5 7l7-6z"/><path d="M3 12l1 1-2 2-1-1z"/>'),
  guard: svg('<path d="M8 1l6 2v4c0 4-3 7-6 8-3-1-6-4-6-8V3z"/>'),
  heal: svg('<path d="M6 2h4v4h4v4h-4v4H6v-4H2V6h4z"/>'),
};
export const SPECIAL_ICON = svg('<path d="M8 1l2 5h5l-4 3 1.5 6L8 12l-4.5 3L5 9 1 6h5z"/>');
export const VOID_ICON = svg('<path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 3a4 4 0 110 8 4 4 0 010-8z" fill-rule="evenodd"/>');
export const CHAIN_ICON = svg('<path d="M6 3a3 3 0 000 6h1V7H6a1 1 0 010-2h2a1 1 0 011 1h2a3 3 0 00-3-3zM10 7H9v2h1a1 1 0 010 2H8a1 1 0 01-1-1H5a3 3 0 003 3h2a3 3 0 000-6z"/>');
export const WEAK_ICON = svg('<path d="M8 1l2 4 4 .5-3 3 .8 4.5L8 11l-3.8 2 .8-4.5-3-3L6 5z"/>');
