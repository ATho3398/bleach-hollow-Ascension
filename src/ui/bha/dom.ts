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
//   info(rows)                          → dl.bha-info (행: label, value, mod?)
//   seg(items, onSelect) / dots(n, active) / slider({...})
//   h(tag, cls, text)                   → 옛 el 과 같은 헬퍼 (el 도 다시 내보냄)
//   emptyState(text, { icon?, action? }) → .bha-empty 빈 상태 (가운데 아이콘 + 한 줄 + 할 일 버튼, GDD 100장 #87)
import { fixParticles } from '../../engine/josa';
import { el } from '../dom';
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
  use.setAttribute('href', `#${id}`);
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

export type MeterKind = 'hunger' | 'cond' | 'stab' | 'risk' | 'enemy' | 'player' | 'sp' | 'cast' | 'stored';

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
}

/** 상태 바. 채움은 width 가 아니라 --fill(0~1) 로 scaleX 한다 */
export function meter(o: MeterOpts): HTMLElement {
  const cls = ['bha-meter', `bha-meter--${o.kind}`];
  if (o.compact) cls.push('bha-meter--compact');
  if (o.lg) cls.push('bha-meter--lg');
  if (o.thin) cls.push('bha-meter--thin');
  if (o.danger) cls.push('is-danger');
  if (o.full) cls.push('is-full');
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
  head.append(labelEl, valueEl);
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

/** 임시 데이터 표시 태그 (CLAUDE.md 규칙 1: provisional 은 화면에서도 임시로 보이게) */
export const provisionalTag = (text = '임시'): HTMLElement => tag(text, 'provisional');

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

/** 정보 표 (옛 table/td 대체): dl.bha-info > div.bha-info__row > dt + dd */
export function info(rows: InfoRow[]): HTMLElement {
  const dl = el('dl', 'bha-info');
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
