// 화면 공용 도구
export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
export const pct = (v: number, max: number) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

export function rowOf(...n: (HTMLElement | string)[]): HTMLElement {
  const r = el('div', 'row');
  r.append(...n);
  return r;
}

export function barOf(cls: string, fill: HTMLElement): HTMLElement {
  const b = el('div', `bar ${cls}`);
  b.append(fill);
  return b;
}

export function mountScreen(root: HTMLElement, ...nodes: HTMLElement[]): void {
  const screen = el('div', 'screen');
  screen.append(...nodes);
  root.replaceChildren(screen);
}
