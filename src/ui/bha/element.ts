// 속성 표시 공용 (GDD 20-2, C.47 계통 마크를 대체): 색 = 속성 데이터의 디자인 토큰, 글자 = 속성 한 글자(색에만 의존하지 않는다, HANDOFF 7장).
// .bha-lin 계열 클래스(색 변수 --bha-lin-color)를 그대로 쓰고 값만 속성 색으로 칠한다.
import { elementAbbr, elementName, getElement } from '../../data/elements';
import { el } from './dom';

/** 속성 색 (CSS 값): `var(--bha-…)` */
export function elementColor(id: string): string {
  return `var(${getElement(id).color})`;
}

/** 노드에 속성 색 변수를 칠한다 (--bha-lin-color). 속성이 없으면 그대로 */
export function paintElement<T extends HTMLElement>(node: T, id: string | null | undefined): T {
  if (id) node.style.setProperty('--bha-lin-color', elementColor(id));
  return node;
}

/** 속성 한 글자 동그라미 */
export function elementDot(id: string, factionId: string): HTMLElement {
  const d = paintElement(el('i', 'bha-eldot', elementAbbr(id, factionId)), id);
  d.setAttribute('aria-hidden', 'true');
  return d;
}

/** 동그라미 + 속성 이름 칩 (text 를 주면 그 글자) */
export function elementMark(id: string, factionId: string, text?: string): HTMLElement {
  const m = paintElement(el('span', 'bha-lin'), id);
  m.append(elementDot(id, factionId), text ?? elementName(id, factionId));
  return m;
}

/** 여러 속성 (융합) */
export function elementsMark(ids: readonly string[], factionId: string): HTMLElement {
  const box = el('span', 'bha-elmarks');
  ids.forEach((id) => box.append(elementMark(id, factionId)));
  return box;
}
