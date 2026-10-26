// 속성 표시 공용 (GDD 20-2, C.47 계통 마크를 대체): 색 = 속성 데이터의 디자인 토큰, 글자 = 속성 한 글자(색에만 의존하지 않는다, HANDOFF 7장).
// .bha-lin 계열 클래스(색 변수 --bha-lin-color)를 그대로 쓰고 값만 속성 색으로 칠한다.
import { elementAbbr, elementName, getElement, NORMAL_ELEMENT } from '../../data/elements';
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

/** 속성 피해 칸 글자 (GDD 48장 4번): 노멀 칸 = '무'(무속성), 나머지 = 속성 한 글자 */
export function elementDamageAbbr(id: string, factionId: string): string {
  return id === NORMAL_ELEMENT ? '무' : elementAbbr(id, factionId);
}

/** 속성 피해 % 글자 "+50%" (음수면 −) */
export function elementDamagePct(pct: number): string {
  const v = Math.round(pct * 10) / 10;
  return v < 0 ? `−${-v}%` : `+${v}%`;
}

/** 상태 화면 속성 피해 (GDD 48장 4번, C.137 85장 8): 속성마다 능력치 행과 같은 형식으로 **한 줄에 하나** — [동그라미] 무속성 피해 · +0%. 0 이어도 보인다 */
export function elementDamageRows(values: Record<string, number>, ids: readonly string[], factionId: string): HTMLElement[] {
  return ids.map((id) => {
    const row = el('div', 'bha-statrow');
    row.dataset.elemDmg = `${id}:${values[id] ?? 0}`;
    const label = `${id === NORMAL_ELEMENT ? '무속성' : elementName(id, factionId)} 피해`;
    const name = el('span', 'bha-statrow__name');
    name.append(elementDot(id, factionId), ' ', label);
    row.append(name, el('b', 'bha-statrow__value bha-num', elementDamagePct(values[id] ?? 0)));
    row.setAttribute('aria-label', `${label} ${elementDamagePct(values[id] ?? 0)}`);
    return row;
  });
}
