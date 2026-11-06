// 디자인 시스템(bha-*) 공용 DOM 헬퍼. 화면 세션(U-2~U-4)이 같이 쓴다. 상태 클래스·CSS 변수 이름은 HANDOFF 7장 그대로.
// 전용 컴포넌트(블록·블록 바·원형 길·저장 필살기 등)는 여기에 두지 않고 src/ui/bha/<영역>.ts 에 따로 만든다.
//
// 사용법 요약
//   mountApp(root, { fixed? }, ...nodes) → root 를 `.bha-stage > main.bha-app[.bha-app--fixed]` 로 바꾼다 (옛 mountScreen 대체). main 을 돌려준다.
//   icon('i-attack', 'sm'|'md'|'lg'?)    → <svg class="bha-icon"><use href="#i-…"/></svg> (스프라이트는 앱 시작 때 mountSprite 가 꽂음)
//   button({ label, variant?, size?, icon?, block?, on?, onClick? })  → button.bha-btn
//   meter({ kind, label, value, max, … }) → role=meter 상태 바 (--fill, 선택: --ghost, 위험 구간 --zone)
//   chip(text, mod?) / tag(text, mod?) / provisionalTag()
//   notice(kind, text, opts?)           → .bha-notice (아이콘 + 본문)
//   panel({ title?, aside?, mod? }, ...nodes)
//   info(rows)                          → dl.bha-infotable (행: label, value, mod?)
//   seg(items, onSelect) / dots(n, active) / slider({...})
//   h(tag, cls, text)                   → 옛 el 과 같은 헬퍼 (el 도 다시 내보냄)
//   emptyState(text, { icon?, action? }) → .bha-empty 빈 상태 (가운데 아이콘 + 한 줄 + 할 일 버튼, GDD 100장 #87)
import { fixParticles } from '../../engine/josa';
import { setSpriteHref } from './iconMap';
import { el } from '../dom';
import { devText } from '../displayName';
import { endScreen } from './screenScope';
import { cssRatio, sliderPct } from './util';

export { el };

const SVG_NS = 'http://www.w3.org/2000/svg';

export const h = el;

/** 앱 틀: root > .bha-stage > main.bha-app. fixed = 스크롤 없는 한 화면(전투·원정) */
export function mountApp(root: HTMLElement, opts: { fixed?: boolean; cls?: string } = {}, ...nodes: (Node | string)[]): HTMLElement {
  const stage = el('div', 'bha-stage');
  const app = el('main', ['bha-app', opts.fixed ? 'bha-app--fixed' : '', opts.cls ?? ''].filter(Boolean).join(' '));
  app.append(...nodes);
  stage.append(app);
  endScreen(root); // 앞 화면이 screenSignal 로 건 리스너를 푼다 (C.139)
  root.replaceChildren(stage);
  return app;
}

export type IconSize = 'sm' | 'md' | 'lg';

export function icon(id: string, size?: IconSize, extraCls = ''): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', ['bha-icon', size ? `bha-icon--${size}` : '', extraCls].filter(Boolean).join(' '));
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(SVG_NS, 'use');
  setSpriteHref(use, id); // v2 도트 아이콘 매핑 (C.282, iconMap.ts)
  svg.append(use);
  return svg;
}

export interface ButtonOpts {
  label?: string;
  variant?: 'primary' | 'danger' | 'ghost';
  size?: 'small' | 'lg';
  icon?: string;
  /** 아이콘만 있는 버튼이면 true (label 은 aria-label 로) */
  iconOnly?: boolean;
  block?: boolean;
  on?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

export function button(o: ButtonOpts): HTMLButtonElement {
  const cls = ['bha-btn'];
  if (o.variant) cls.push(`bha-btn--${o.variant}`);
  if (o.size) cls.push(`bha-btn--${o.size}`);
  if (o.iconOnly) cls.push('bha-btn--icon');
  if (o.block) cls.push('bha-btn--block');
  if (o.on) cls.push('is-on');
  const b = el('button', cls.join(' '));
  b.type = 'button';
  if (o.icon) b.append(icon(o.icon));
  if (o.iconOnly) {
    if (o.label) b.setAttribute('aria-label', o.label);
  } else if (o.label) b.append(o.label);
  if (o.disabled) b.disabled = true;
  if (o.onClick) b.onclick = o.onClick;
  return b;
}

export type MeterKind = 'hunger' | 'cond' | 'stab' | 'risk' | 'enemy' | 'player' | 'sp' | 'cast' | 'stored' | 'bond';

export interface MeterOpts {
  kind: MeterKind;
  label: string;
  value: number;
  max: number;
  /** 라벨 앞 아이콘 */
  icon?: string;
  /** 바 아래 경고 한 줄 (__note) */
  note?: string;
  /** 감소 잔상의 직전 값(0~1 비율이 아니라 value 와 같은 단위) */
  ghost?: number;
  /** 위험 구간 시작 비율 0~1 */
  zone?: number;
  /** 아래쪽 위험 구간 (0~1, C.63 배부름처럼 적을수록 위험한 바): 0 ~ 이 비율 */
  zoneLow?: number;
  compact?: boolean;
  lg?: boolean;
  thin?: boolean;
  danger?: boolean;
  full?: boolean;
  /** 값 오른쪽 표기를 바꾼다 (기본 "value / max") */
  valueText?: string;
  /** 숫자를 막대 안에 (GDD 127장 1, C.200): 두꺼운 막대 가운데에 값. 라벨은 위 줄에 그대로(숨기려면 쓰는 곳 CSS) */
  inside?: boolean;
}

/** 상태 바. 채움은 width 가 아니라 --fill(0~1) 로 scaleX 한다 */
export function meter(o: MeterOpts): HTMLElement {
  const cls = ['bha-meter', `bha-meter--${o.kind}`];
  if (o.compact) cls.push('bha-meter--compact');
  if (o.lg) cls.push('bha-meter--lg');
  if (o.thin) cls.push('bha-meter--thin');
  if (o.danger) cls.push('is-danger');
  if (o.full) cls.push('is-full');
  if (o.inside) cls.push('bha-meter--inside');
  const root = el('div', cls.join(' '));
  root.style.setProperty('--fill', cssRatio(o.value, o.max));
  if (o.ghost !== undefined) root.style.setProperty('--ghost', cssRatio(o.ghost, o.max));
  root.setAttribute('role', 'meter');
  root.setAttribute('aria-valuemin', '0');
  root.setAttribute('aria-valuemax', String(o.max));
  root.setAttribute('aria-valuenow', String(o.value));
  root.setAttribute('aria-label', o.label);
  const labelEl = el('span', 'bha-meter__label');
  if (o.icon) labelEl.append(icon(o.icon));
  labelEl.append(el('span', '', o.label));
  const valueEl = el('span', 'bha-meter__value');
  if (o.valueText !== undefined) valueEl.textContent = o.valueText;
  else valueEl.append(`${o.value}`, el('small', '', ` / ${o.max}`));
  const head = el('div', 'bha-meter__head');
  head.append(labelEl);
  if (!o.inside) head.append(valueEl);
  const track = el('div', 'bha-meter__track');
  if (o.ghost !== undefined) track.append(el('i', 'bha-meter__ghost'));
  track.append(el('i', 'bha-meter__fill'));
  if (o.zone !== undefined) {
    const z = el('i', 'bha-meter__zone');
    z.style.setProperty('--zone', String(o.zone));
    track.append(z);
  }
  if (o.zoneLow !== undefined) {
    const z = el('i', 'bha-meter__zone is-low');
    z.style.setProperty('--zone', String(o.zoneLow));
    track.append(z);
  }
  if (o.inside) track.append(valueEl); // 채움·위험 구간 위 층
  root.append(head, track);
  if (o.note) {
    const note = el('p', 'bha-meter__note');
    note.append(icon('i-warn'), o.note);
    root.append(note);
  }
  return root;
}

/** 이미 만든 상태 바의 값만 갱신한다 (실시간 화면용: DOM 을 다시 만들지 않는다) */
export function setMeter(root: HTMLElement, value: number, max: number, ghost?: number): void {
  root.style.setProperty('--fill', cssRatio(value, max));
  if (ghost !== undefined) root.style.setProperty('--ghost', cssRatio(ghost, max));
  root.setAttribute('aria-valuenow', String(value));
}

export function chip(text: string, mod?: 'weak' | 'rare' | 'danger' | 'seal' | 'guard' | 'pattern'): HTMLElement {
  return el('span', mod ? `bha-chip bha-chip--${mod}` : 'bha-chip', text);
}

export function tag(text: string, mod?: 'provisional' | 'kind' | 'elite' | 'normal'): HTMLElement {
  return el('span', mod ? `bha-tag bha-tag--${mod}` : 'bha-tag', text);
}

/** 임시 데이터 표시 태그 (CLAUDE.md 규칙 1). GDD 100장(C.171): 테스트 모드에서만 보이고 일반 화면은 숨김 — 설정 > 정보에 '임시 수치 있음' 한 줄 */
export function provisionalTag(text = '임시'): HTMLElement {
  const t = tag(text, 'provisional');
  t.hidden = !devText();
  return t;
}

export type NoticeKind = 'info' | 'warn' | 'good' | 'rare' | 'danger' | 'risk';
const NOTICE_ICON: Record<NoticeKind, string> = { info: 'i-info', warn: 'i-warn', good: 'i-check', rare: 'i-rare', danger: 'i-warn', risk: 'i-risk' };

export function notice(kind: NoticeKind, text: string, opts: { title?: string; icon?: string } = {}): HTMLElement {
  const n = el('div', kind === 'info' ? 'bha-notice' : `bha-notice bha-notice--${kind}`);
  const body = el('div', 'bha-notice__body');
  if (opts.title) body.append(el('span', 'bha-notice__title', opts.title));
  body.append(fixParticles(text));
  n.append(icon(opts.icon ?? NOTICE_ICON[kind]), body);
  return n;
}

export function panel(o: { title?: string; aside?: string | Node; mod?: 'raised' | 'inset' | 'accent' | 'flat' } = {}, ...nodes: (Node | string)[]): HTMLElement {
  const p = el('section', o.mod ? `bha-panel bha-panel--${o.mod}` : 'bha-panel');
  if (o.title || o.aside) {
    const head = el('div', 'bha-panel__head');
    if (o.title) head.append(el('h2', 'bha-panel__title', o.title));
    if (o.aside !== undefined) {
      const a = el('span', 'bha-panel__aside');
      a.append(o.aside);
      head.append(a);
    }
    p.append(head);
  }
  p.append(...nodes);
  return p;
}

export interface InfoRow {
  label: string;
  value: string | Node;
  mod?: 'em' | 'good' | 'bad' | 'stack';
}

/** 정보 표 (옛 table/td 대체): dl.bha-infotable > div.bha-info__row > dt + dd */
export function info(rows: InfoRow[]): HTMLElement {
  const dl = el('dl', 'bha-infotable'); // 옛 이름 .bha-info = v2 ⓘ 버튼과 겹쳐 바꿈 (C.296)
  for (const r of rows) {
    const row = el('div', r.mod ? `bha-info__row bha-info__row--${r.mod}` : 'bha-info__row');
    const dd = el('dd');
    dd.append(r.value);
    row.append(el('dt', '', r.label), dd);
    dl.append(row);
  }
  return dl;
}

export interface SegItem {
  id: string;
  label: string;
  count?: string;
}

/** 세그먼트/탭: aria-selected 로 선택 표시. 돌려주는 root 에 select(id) 를 붙여 둔다 */
export function seg(items: SegItem[], selected: string, onSelect: (id: string) => void, opts: { small?: boolean; stack?: boolean } = {}): HTMLElement {
  const root = el('div', ['bha-seg', opts.small ? 'bha-seg--sm' : '', opts.stack ? 'bha-seg--stack' : ''].filter(Boolean).join(' '));
  root.setAttribute('role', 'tablist');
  const btns = items.map((it) => {
    const b = el('button', 'bha-seg__item');
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.append(it.label);
    if (it.count !== undefined) b.append(' ', el('span', 'bha-seg__count', it.count));
    b.dataset.id = it.id;
    b.setAttribute('aria-selected', String(it.id === selected));
    b.onclick = () => {
      for (const o of btns) o.setAttribute('aria-selected', String(o === b));
      onSelect(it.id);
    };
    return b;
  });
  root.append(...btns);
  return root;
}

/** 진행 점 (튜토리얼): 0 부터 센 active 이전은 is-done */
export function dots(count: number, active: number): HTMLElement {
  const root = el('div', 'bha-dots');
  root.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < count; i++) root.append(el('i', i < active ? 'bha-dots__dot is-done' : i === active ? 'bha-dots__dot is-active' : 'bha-dots__dot'));
  return root;
}

export interface SliderOpts {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  /** 값 표시 (예: "0.30" + 단위 small) */
  format: (v: number) => string;
  unit: string;
  /** 눈금 줄 가운데 문구 (예: "기본 0.3") */
  defaultText?: string;
  hint?: string;
  onInput: (v: number) => void;
}

/** 막대 끌기 값 (GDD 103장 수정 v5.242): 포인터 좌표 → min~max. 기기를 CSS 로 시계 방향 90도 돌린 화면이면 보이는 막대 방향 = 화면 아래쪽이라 y 로 잰다 */
export function rangeDragValue(p: { x: number; y: number }, rect: { left: number; top: number; width: number; height: number }, rotated: boolean, min: number, max: number, step = 1): number {
  const t = rotated ? (p.y - rect.top) / Math.max(1, rect.height) : (p.x - rect.left) / Math.max(1, rect.width);
  const v = min + Math.max(0, Math.min(1, t)) * (max - min);
  return Math.max(min, Math.min(max, Math.round(v / step) * step));
}

/** range 입력칸을 끌기로 직접 다룬다: 누른 곳 값 → 누르고 있는 동안 따라감 → 놓을 때 확정. 브라우저 기본 끌기는 돌린 화면에서 축이 어긋나고
 *  첫 움직임을 스크롤 판정이 가로챈다(위아래로 한 번 끌어야 좌우가 먹던 문제) — 기본 동작을 막고 포인터를 잡는다. 키보드 ◀▶ 는 그대로 */
export function enableRangeDrag(input: HTMLInputElement, onMove: (v: number) => void, onDone: (v: number) => void): void {
  input.style.touchAction = 'none';
  // 터치에서는 브라우저 기본 range 끌기도 같이 돌아 값이 엇갈린다 — 터치 기본 동작을 막는다 (포인터 이벤트는 그대로 온다)
  input.addEventListener('touchstart', (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });
  const valueAt = (e: PointerEvent): number => {
    const r = input.getBoundingClientRect();
    // 레이아웃 폭·높이의 길쭉한 방향과 화면상 길쭉한 방향이 다르면 돌린 화면 (device.ts 와 같은 판정)
    const rotated = input.offsetWidth >= input.offsetHeight !== r.width >= r.height;
    return rangeDragValue({ x: e.clientX, y: e.clientY }, r, rotated, Number(input.min || 0), Number(input.max || 100), Number(input.step) || 1);
  };
  let id: number | null = null;
  input.addEventListener('pointerdown', (e) => {
    if (input.disabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    input.focus({ preventScroll: true });
    id = e.pointerId;
    try {
      input.setPointerCapture(e.pointerId);
    } catch {
      /* 잡기 실패해도 window 이벤트 없이 move 는 온다 */
    }
    onMove(valueAt(e));
  });
  input.addEventListener('pointermove', (e) => {
    if (e.pointerId !== id) return;
    e.preventDefault();
    onMove(valueAt(e));
  });
  const end = (e: PointerEvent, done: boolean) => {
    if (e.pointerId !== id) return;
    id = null;
    if (done) onDone(valueAt(e));
  };
  input.addEventListener('pointerup', (e) => end(e, true));
  input.addEventListener('pointercancel', (e) => end(e, false));
}

/** 슬라이더: 트랙 채움은 --pct(0~1). 값과 표시를 함께 갱신한다. 요소 전체(.bha-slider)를 돌려준다 */
export function slider(o: SliderOpts): HTMLElement {
  const root = el('div', 'bha-slider');
  const input = el('input', 'bha-slider__input');
  input.id = o.id;
  input.type = 'range';
  input.min = String(o.min);
  input.max = String(o.max);
  input.step = String(o.step);
  input.value = String(o.value);
  const out = el('output', 'bha-slider__value');
  out.htmlFor.add(o.id);
  const paint = (v: number) => {
    out.replaceChildren(o.format(v), el('small', '', o.unit));
    input.style.setProperty('--pct', sliderPct(v, o.min, o.max));
  };
  paint(o.value);
  input.oninput = () => {
    const v = Number(input.value);
    paint(v);
    o.onInput(v);
  };
  // 끌기 (GDD 103장 수정 v5.242): 돌린 화면에서도 보이는 막대 방향으로
  const drag = (v: number) => {
    input.value = String(v);
    paint(v);
    o.onInput(v);
  };
  enableRangeDrag(input, drag, drag);
  const head = el('div', 'bha-slider__head');
  const label = el('label', 'bha-slider__label', o.label);
  label.htmlFor = o.id;
  head.append(label, out);
  const scale = el('div', 'bha-slider__scale');
  scale.append(el('span', '', `${o.min}${o.unit}`), el('span', '', o.defaultText ?? ''), el('span', '', `${o.max}${o.unit}`));
  root.append(head, input, scale);
  if (o.hint) root.append(el('p', 'bha-slider__hint', o.hint));
  return root;
}

/** 빈 상태 (C.170, GDD 100장 #87): 화면마다 다르던 빈 목록 표현을 하나로 — 가운데 아이콘 + 한 줄 + (있으면) 할 일 버튼 */
export function emptyState(text: string, o: { icon?: string; action?: ButtonOpts } = {}): HTMLElement {
  const box = el('div', 'bha-empty');
  box.append(icon(o.icon ?? 'i-info', 'lg'), el('p', 'bha-empty__text', text));
  if (o.action) box.append(button({ size: 'small', ...o.action }));
  return box;
}

/** 카드 이름 한 줄 (C.309, GDD 193장 3 보충): 꺾지 않는다. 칸보다 길면 글자를 줄이고(지금 크기의 70%까지),
 *  그래도 넘치면 말줄임 — 그때는 이름 전체를 title 로. 화면에 붙어 폭이 생길 때(숨은 탭이 열릴 때 포함)·글꼴을 새로 받은 뒤에 다시 잰다. */
const fitNodes = new Set<{ node: HTMLElement; run: (force: boolean) => void }>();
let fitFontHook = false;
export function fitOneLine(node: HTMLElement, minScale = 0.7): HTMLElement {
  node.classList.add('bha-fit1');
  const full = node.textContent ?? '';
  let lastW = -1;
  const run = (force: boolean): void => {
    if (!node.isConnected) return;
    const w0 = node.clientWidth;
    if (w0 <= 0 || (!force && w0 === lastW)) return; // 글자 크기를 바꿔 생긴 높이 변화로는 다시 재지 않는다
    lastW = w0;
    node.style.fontSize = '';
    if (node.title === full) node.removeAttribute('title');
    // 글자 폭은 Range 로 소수까지 잰다(scrollWidth 는 칸보다 작아지지 않고 정수라 작은 넘침을 놓친다)
    const cs = getComputedStyle(node);
    const room = node.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
    // 창이 열리며 커지는 동안(transform scale)에도 맞게: 화면 폭 ÷ 배율 = 레이아웃 폭
    const textW = (): number => {
      const r = document.createRange(); r.selectNodeContents(node);
      const k = node.getBoundingClientRect().width / (node.offsetWidth || 1);
      return r.getBoundingClientRect().width / (k > 0 ? k : 1);
    };
    const tw = textW();
    if (tw <= room) return;
    const base = parseFloat(cs.fontSize) || 13;
    node.style.fontSize = `${Math.max(base * minScale, Math.floor(base * (room / tw) * 0.98 * 10) / 10)}px`;
    if (textW() > room && !node.title) node.title = full;
  };
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => run(false)).observe(node);
  else if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => run(false));
  const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
  if (fonts) {
    if (fitNodes.size > 200) for (const f of fitNodes) if (!f.node.isConnected) fitNodes.delete(f); // 지난 화면 이름은 버린다
    fitNodes.add({ node, run });
    if (!fitFontHook) {
      fitFontHook = true;
      // 한글 글꼴은 글자 묶음(unicode-range)마다 따로 받는다 — 새로 받을 때마다 붙어 있는 이름을 다시 잰다
      fonts.addEventListener?.('loadingdone', () => { for (const f of fitNodes) if (f.node.isConnected) f.run(true); });
    }
    fonts.ready.then(() => run(true)).catch(() => undefined);
  }
  return node;
}
