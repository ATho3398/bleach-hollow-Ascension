// LCD 인게임 UI v2 공통 컴포넌트 (C.151, docs/bha-ui-handoff README 7-2): 버튼 4종·칩·탭·게이지·패널·모달·토스트·알림 띠.
// 마크업·클래스 이름은 핸드오프(bha.css)와 같다. 색·간격은 전부 `.bha-root` 안의 토큰이 정한다 — 이 파일은 DOM 만 만든다. 종족 분기 없음.
import { registerLayer } from '../overlayHost';
import { trapModalFocus } from '../modalFocus';

const SVG_NS = 'http://www.w3.org/2000/svg';

function node<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** 아이콘 하나: 프로젝트 스프라이트 심볼(`i-close` 등)을 핸드오프 `.bha-svg` 모양(18px 선 아이콘)으로 */
export function v2Svg(symbolId: string, cls = ''): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', ['bha-svg', cls].filter(Boolean).join(' '));
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `#${symbolId}`);
  svg.append(use);
  return svg;
}

// ───────── 버튼 4종 (+ 강조 accent · 밝은 light) ─────────
export type V2ButtonKind = 'default' | 'accent' | 'light' | 'danger' | 'ghost';
export interface V2ButtonOpts {
  label?: string;
  kind?: V2ButtonKind;
  /** 작은 버튼 (높이 36) */
  small?: boolean;
  icon?: string;
  disabled?: boolean;
  /** 기기 버튼 커서(포커스) 표시 */
  focus?: boolean;
  onClick?: () => void;
}

/** 버튼 클래스 (순수): `bha-btn bha-btn--accent bha-btn--sm is-disabled` */
export function v2ButtonClass(o: Pick<V2ButtonOpts, 'kind' | 'small' | 'disabled' | 'focus'>, extra = ''): string {
  return ['bha-btn', o.kind && o.kind !== 'default' ? `bha-btn--${o.kind}` : '', o.small ? 'bha-btn--sm' : '', o.disabled ? 'is-disabled' : '', o.focus ? 'is-focus' : '', extra].filter(Boolean).join(' ');
}

export function v2Button(o: V2ButtonOpts): HTMLButtonElement {
  const b = node('button', v2ButtonClass(o));
  b.type = 'button';
  if (o.icon) b.append(v2Svg(o.icon));
  if (o.label) b.append(o.label);
  b.disabled = Boolean(o.disabled);
  if (o.onClick) b.addEventListener('click', o.onClick);
  return b;
}

/** 아이콘만 있는 버튼: 36px(기본) 또는 44px. label 은 aria-label */
export function v2IconButton(o: { label: string; icon: string; size?: 36 | 44; kind?: V2ButtonKind; disabled?: boolean; focus?: boolean; onClick?: () => void }): HTMLButtonElement {
  const b = node('button', v2ButtonClass({ kind: o.kind, small: o.size !== 44, disabled: o.disabled, focus: o.focus }, `bha-iconbtn${o.size === 44 ? ' bha-iconbtn--44' : ''}`));
  b.type = 'button';
  b.setAttribute('aria-label', o.label);
  b.append(v2Svg(o.icon));
  b.disabled = Boolean(o.disabled);
  if (o.onClick) b.addEventListener('click', o.onClick);
  return b;
}

// ───────── 칩·배지 ─────────
export type V2ChipKind = 'default' | 'temp' | 'attr' | 'danger' | 'seal' | 'rare';
export function v2Chip(label: string, kind: V2ChipKind = 'default', o: { icon?: string; dot?: string } = {}): HTMLSpanElement {
  const c = node('span', `bha-chip${kind === 'default' ? '' : ` bha-chip--${kind}`}`);
  if (o.dot) {
    const d = node('span', 'bha-dot');
    d.style.background = o.dot;
    c.append(d);
  }
  if (o.icon) c.append(v2Svg(o.icon));
  c.append(label);
  return c;
}
/** 임시 데이터 칩 ("○ 임시") — 핸드오프 chip--temp */
export const v2TempChip = (label = '○ 임시'): HTMLSpanElement => v2Chip(label, 'temp');
/** 카드 모서리 배지 (부모가 position:relative) */
export function v2Badge(text: string): HTMLSpanElement {
  return node('span', 'bha-badge', text);
}

// ───────── 탭 ─────────
export interface V2Tab {
  id: string;
  label: string;
  /** 탭 옆 작은 수 */
  count?: number;
}
export function v2Tabs(tabs: V2Tab[], current: string, onPick: (id: string) => void, label = '분류'): HTMLElement {
  const root = node('div', 'bha-tabs');
  root.setAttribute('role', 'tablist');
  root.setAttribute('aria-label', label);
  for (const t of tabs) {
    const b = node('button', `bha-tab${t.id === current ? ' is-active' : ''}`);
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(t.id === current));
    b.dataset.tab = t.id;
    b.append(t.label);
    if (t.count !== undefined) b.append(node('span', 'bha-count', String(t.count)));
    b.addEventListener('click', () => onPick(t.id));
    root.append(b);
  }
  return root;
}
/** 머리 제목 토글 ("보관함 · 타일 ▾") */
export function v2TitleToggle(label: string, onClick: () => void): HTMLButtonElement {
  const b = node('button', 'bha-titletoggle bha-display bha-xl');
  b.type = 'button';
  b.append(label, v2Svg('i-chevron-down'));
  b.addEventListener('click', onClick);
  return b;
}

// ───────── 게이지 ─────────
export type V2GaugeKind = 'hp' | 'foe' | 'hunger' | 'cond' | 'mad' | 'release';
/** 게이지 (순수한 모양은 CSS): pct 0~100. ghost = 예상 증가분 사선 띠(광기 미리보기 등) */
export function v2Gauge(kind: V2GaugeKind, pct: number, o: { thin?: boolean; ghostPct?: number; label?: string; width?: string } = {}): HTMLElement {
  const g = node('span', `bha-gauge bha-gauge--${kind}${o.thin ? ' bha-gauge--thin' : ''}`);
  g.style.display = 'block'; // 핸드오프 마크업은 쓰는 곳에서 폭을 준다(span 기본은 폭 0) — 기본 가로 가득
  g.style.width = o.width ?? '100%';
  g.setAttribute('role', 'progressbar');
  g.setAttribute('aria-valuemin', '0');
  g.setAttribute('aria-valuemax', '100');
  if (o.label) g.setAttribute('aria-label', o.label);
  const fill = node('span', 'bha-gauge__fill');
  g.append(fill);
  if (o.ghostPct !== undefined) {
    const ghost = node('span', 'bha-gauge__ghost');
    g.append(ghost);
    ghost.style.width = `${clampPct(o.ghostPct)}%`;
  }
  setV2Gauge(g, pct);
  return g;
}
export const clampPct = (n: number): number => (Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0);
/** 게이지 값만 바꾼다 (제자리 갱신) */
export function setV2Gauge(g: HTMLElement, pct: number): void {
  const p = clampPct(pct);
  const fill = g.querySelector<HTMLElement>('.bha-gauge__fill');
  if (fill) fill.style.width = `${p}%`;
  g.setAttribute('aria-valuenow', String(Math.round(p)));
}

// ───────── 패널 ─────────
export function v2Panel(kind: 'default' | 'sunk' | 'flat' = 'default', ...children: (Node | string)[]): HTMLElement {
  const p = node('section', `bha-panel${kind === 'default' ? '' : ` bha-panel--${kind}`}`);
  p.append(...children);
  return p;
}

// ───────── 알림 띠·토스트 ─────────
/** 위쪽 가운데 얇은 알림 띠 (업적·튜토리얼·상인 도착 …). 호출부가 `.bha-root` 에 붙인다 */
export function v2Notice(strong: string, text: string, icon = 'i-title'): HTMLElement {
  const n = node('div', 'bha-notice');
  n.setAttribute('role', 'status');
  n.append(v2Svg(icon));
  const span = node('span');
  span.append(node('b', '', strong), ` ${text}`);
  n.append(span);
  return n;
}
/** 토스트: 위쪽 가는 띠, ms 뒤 사라진다 */
export function v2Toast(host: HTMLElement, text: string, ms = 2400): () => void {
  const t = node('div', 'bha-toast', text);
  t.setAttribute('role', 'status');
  host.append(t);
  const id = window.setTimeout(() => t.remove(), ms);
  return () => { window.clearTimeout(id); t.remove(); };
}

// ───────── 모달 ─────────
export interface V2ModalOpts {
  title: string;
  /** 본문 (글 또는 요소) */
  body?: string | Node;
  /** 아래 버튼들 */
  actions?: { label: string; kind?: V2ButtonKind; onClick?: () => void; keepOpen?: boolean }[];
  /** 닫기(×) 버튼을 둔다 */
  closable?: boolean;
  /** 가로 폭(기본 380, 최대 크기 안에 맞춤) */
  width?: number;
  onClose?: () => void;
}
/** 모달을 연다: 스크림 + 가운데 창. host = `.bha-root`. 포커스 가두기·기기 선택 레이어 등록은 옛 확인창과 같은 규칙. 돌려주는 함수는 창을 닫는다 */
export function v2Modal(host: HTMLElement, o: V2ModalOpts): () => void {
  const layer = node('div', 'bha-v2layer');
  layer.style.cssText = 'position:absolute;inset:0;z-index:30';
  const scrim = node('div', 'bha-scrim');
  const modal = node('div', 'bha-modal');
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', o.title);
  modal.style.cssText = `left:50%;top:50%;transform:translate(-50%,-50%);width:${o.width ?? 380}px;max-width:calc(100% - 24px);display:flex;flex-direction:column;gap:8px`;
  let closed = false;
  let untrap: () => void = () => {};
  let unregister: () => void = () => {};
  const close = (): void => {
    if (closed) return;
    closed = true;
    unregister();
    layer.remove();
    untrap();
    o.onClose?.();
  };
  modal.append(node('h2', 'bha-display bha-lg', o.title));
  if (o.closable) {
    const x = v2IconButton({ label: '닫기', icon: 'i-close', onClick: close });
    x.classList.add('bha-modal__close');
    modal.append(x);
  }
  if (o.body !== undefined) {
    const b = node('div', 'bha-md bha-t2');
    b.append(o.body);
    modal.append(b);
  }
  if (o.actions?.length) {
    const row = node('div', 'bha-row');
    row.style.justifyContent = 'flex-end';
    for (const a of o.actions) row.append(v2Button({ label: a.label, kind: a.kind, onClick: () => { if (!a.keepOpen) close(); a.onClick?.(); } }));
    modal.append(row);
  }
  scrim.addEventListener('click', () => { if (o.closable !== false) close(); });
  layer.append(scrim, modal);
  host.append(layer);
  untrap = trapModalFocus(layer);
  unregister = registerLayer(layer, close);
  return close;
}
