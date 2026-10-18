// 계통 마크 공용 매핑 (디자인 .bha-lin--a~e): 계통 id → 'a'~'e'. 계통 순서(LINEAGES)대로 a, b, c… 를 배정한다.
// 마크는 색 + 모양(원·삼각·사각·마름모·육각)이라 색에만 의존하지 않는다 (HANDOFF 7장).
import { LINEAGES, lineageName, lineageShortName } from '../../data/lineages';
import { el, icon } from './dom';

export const LIN_KEYS = ['a', 'b', 'c', 'd', 'e'] as const;
export type LinKey = (typeof LIN_KEYS)[number];

/** 계통 id 의 마크 키. 모르는 id 는 undefined (디자인이 5개까지만 정의) */
export function lineageKey(lineageId: string): LinKey | undefined {
  const i = LINEAGES.findIndex((l) => l.id === lineageId);
  return LIN_KEYS[i];
}

/** `<span class="bha-lin bha-lin--a"><svg i-lin-a/>A</span>` — label 을 주면 글자도 붙인다 */
export function linMark(lineageId: string, label?: string, size?: 'sm' | 'md' | 'lg'): HTMLElement {
  const key = lineageKey(lineageId);
  const m = el('span', key ? `bha-lin bha-lin--${key}` : 'bha-lin');
  if (key) m.append(icon(`i-lin-${key}`, size));
  if (label) m.append(label);
  return m;
}

/** 짧은 이름이 붙은 마크 ("A") */
export function linMarkShort(lineageId: string, factionId: string, size?: 'sm' | 'md' | 'lg'): HTMLElement {
  return linMark(lineageId, lineageShortName(lineageId, factionId), size);
}

// ── U-4(원정·흡수·연습) 에서 쓰는 보조 함수: 위 매핑 위에 얹는다 ──

/** 계통 클래스 (`bha-lin--b`). 키가 없으면 빈 문자열 */
export function lineageClass(lineageId: string): string {
  const k = lineageKey(lineageId);
  return k ? `bha-lin--${k}` : '';
}

/** 계통 마크 아이콘 id (`i-lin-b`), 없으면 정보 아이콘 */
export function lineageIconId(lineageId: string): string {
  const k = lineageKey(lineageId);
  return k ? `i-lin-${k}` : 'i-info';
}

/** 아이콘 + 계통 이름 칩 (text 를 주면 그 글자) */
export function lineageMark(lineageId: string, factionId: string, text?: string): HTMLElement {
  return linMark(lineageId, text ?? lineageName(lineageId, factionId));
}
