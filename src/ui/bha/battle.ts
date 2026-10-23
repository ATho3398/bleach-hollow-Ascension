// 전투 화면 전용 헬퍼 (U-2, 디자인 HANDOFF 5-1·5-2·5-4·7장).
// 위쪽은 DOM 에 의존하지 않는 순수 함수(약어 선택, 묶음 계산, 삽입 막대·밀림 위치, 로그 역할 …)라 단위 테스트한다 (tests/bha-battle.test.ts).
// 아래쪽은 블록·블록 바·로그 줄·플로팅 숫자·적 실루엣을 만드는 DOM 조립과 1회성 클래스 재생 도구.
import { charArt, enemyArt, type ArtUrls } from '../../data/art/manifest';
import type { RoomConfig } from '../../engine/faction';
import type { EnemyPatternKind } from '../../data/schema';
import type { Locomotion } from '../../engine/locomotion';
import { bindAnim } from './animPlayer';
import { el, icon } from './dom';
import { setLoco } from './loco';
import { elementColor } from './element';

// ───────────────────────── 순수 함수 ─────────────────────────

/** 체력 표시 정수 (C.68): 남은 체력은 올림(1 미만도 1), 최대도 같은 올림 → "4107 / 4106" 처럼 남은 값이 최대를 넘지 않는다 */
export function hpNumbers(hp: number, maxHp: number): { now: number; max: number } {
  const max = Math.ceil(maxHp - 1e-6);
  return { now: Math.min(max, Math.max(0, Math.ceil(hp - 1e-6))), max };
}

/** 블록 외형 종류: 스킬 역할 3 + 기본 + 필살 + 공허 (`.bha-block--*`) */
export type BlockVisual = 'attack' | 'guard' | 'heal' | 'basic' | 'special' | 'void';

/** 블록 약어 한 줄 최대 글자 수 (칸 폭 44px 기준 2줄 × 4자) */
export const ABBR_LINE_CHARS = 4;

/**
 * 약어로 쓸 글자를 고른다. 이미 짧으면(단어 1~2개, 단어마다 4자 이하) 그대로, 아니면 앞 4글자.
 * 특성 데이터에 abbr 가 없을 때와 종족 설정의 블록 이름(기본·필살·공허)에 쓴다. 비어 있으면 빈 문자열.
 */
export function fitAbbr(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  const words = trimmed.split(' ').filter(Boolean);
  if (words.length >= 1 && words.length <= 2 && words.every((w) => Array.from(w).length <= ABBR_LINE_CHARS)) return trimmed;
  return Array.from(trimmed).slice(0, ABBR_LINE_CHARS).join('').trim();
}

/** 약어 선택: 데이터의 abbr(공백만이면 없는 것으로) → 없으면 이름에서 fitAbbr */
export function pickAbbr(abbr: string | undefined, name: string): string {
  const own = abbr?.trim();
  return own ? own : fitAbbr(name);
}

/** 블록 외형: 필살·공허는 그대로, 콤보·해방은 필살 모양, 기본 블록(traitId 가 기본 기술이거나 없음)은 basic, 스킬은 역할(모르면 attack) */
export function blockVisual(kind: 'skill' | 'void' | 'combo' | 'liberation', isBasic: boolean, role: 'attack' | 'guard' | 'heal' | null): BlockVisual {
  if (kind === 'combo' || kind === 'liberation') return 'special';
  if (kind === 'void') return 'void';
  if (isBasic) return 'basic';
  return role ?? 'attack';
}

/** 체인 단계 표시가 붙는 외형 (공격·막기·회복·기본) */
export const hasPips = (v: BlockVisual): boolean => v === 'attack' || v === 'guard' || v === 'heal';

export interface RunSpec {
  /** 시작 칸 (1부터: CSS --start) */
  start: number;
  /** 길이 (CSS --len) */
  len: number;
  /** 체인 단계 = min(최대 체인, 길이) */
  level: number;
  /** 최대 체인에 닿았나 (주황 테두리) */
  max: boolean;
  /** 최대 체인보다 길게 붙어 있나 (라벨 "체인3+") */
  over: boolean;
}

/**
 * 붙은 같은 블록 묶음 → CSS 묶음 표시. runs 는 engine runsOf 결과, isSkillAt(i) 는 그 칸이 스킬 블록인가.
 * 길이 2 미만이거나 스킬 블록이 아니면 묶음이 아니다.
 */
export function runSpecs(runs: readonly { start: number; length: number }[], isSkillAt: (index: number) => boolean, top: number): RunSpec[] {
  const out: RunSpec[] = [];
  for (const r of runs) {
    if (r.length < 2 || !isSkillAt(r.start)) continue;
    const level = Math.min(top, r.length);
    out.push({ start: r.start + 1, len: r.length, level, max: level >= top, over: r.length > top });
  }
  return out;
}

/**
 * 묶음 경계 (GDD 19-2): 같은 계열 덩어리 안에서 새 묶음이 시작하는 칸 번호들 (0부터).
 * runs = 덩어리(engine runsOf), groups = 발동 묶음(engine chainGroupsOf). 예: 같은 계열 5개 = 3+2 → [3]
 */
export function groupCuts(runs: readonly { start: number; length: number }[], groups: readonly { start: number; length: number }[]): number[] {
  const starts = new Set(runs.map((r) => r.start));
  return groups.filter((g) => !starts.has(g.start)).map((g) => g.start);
}

/** 묶음 경계 표시 하나 (--at = 그 칸의 왼쪽, 1부터) */
export function cutEl(index: number): HTMLElement {
  const c = el('div', 'bha-tray__cut');
  c.style.setProperty('--at', String(index + 1));
  return c;
}

/** 칸 번호(0부터) → 속한 묶음의 체인 단계 (묶음이 아니면 1) */
export function chainLevelAt(specs: readonly RunSpec[], index: number): number {
  for (const r of specs) if (index + 1 >= r.start && index + 1 < r.start + r.len) return r.level;
  return 1;
}

/** 사건 로그 줄의 역할 (`.bha-log__line--*`) */
export type LogRole = 'attack' | 'guard' | 'heal' | 'void' | 'chain' | 'cast';

/** 로그 역할별 기본 아이콘 */
export const LOG_ICON: Record<LogRole, string> = { attack: 'i-attack', guard: 'i-guard', heal: 'i-heal', void: 'i-void', chain: 'i-chain-2', cast: 'i-cast' };

/** strong·dull = 상성 문구 (GDD 20-2: 효과가 굉장하다 / 효과가 별로…) */
export type FloatKind = 'attack' | 'guard' | 'heal' | 'void' | 'chain' | 'hurt' | 'strong' | 'dull';

/** 적 행동 패턴 → 표시 (아이콘은 디자인에 있는 3종 중 가장 가까운 것). 기본형은 칩을 만들지 않는다 */
export const PATTERN_VIEW: Record<EnemyPatternKind, { label: string; icon: string } | null> = {
  basic: null,
  swift: { label: '속공형', icon: 'i-pattern-fast' },
  sturdy: { label: '단단형', icon: 'i-pattern-tough' },
  'heavy-seal': { label: '강공격·봉인', icon: 'i-pattern-heavy' },
  'heavy-chain': { label: '연속 강공격', icon: 'i-pattern-heavy' },
  stance: { label: '방어 자세·반격', icon: 'i-pattern-tough' },
};

/** 남은 시간 표기 "3.0초" */
export const secondsText = (seconds: number): string => `${Math.max(0, seconds).toFixed(1)}초`;

/** 플로팅 숫자 자리 (아레나 안의 %). 같은 자리에 겹치지 않게 돌려 쓴다 */
export const FLOAT_SPOTS: readonly { left: number; top: number }[] = [
  { left: 36, top: 26 }, { left: 52, top: 18 }, { left: 26, top: 38 }, { left: 46, top: 34 }, { left: 58, top: 28 },
];

export function floatSpot(n: number): { left: number; top: number } {
  return FLOAT_SPOTS[((n % FLOAT_SPOTS.length) + FLOAT_SPOTS.length) % FLOAT_SPOTS.length]!;
}


/** 남은 시간 추적: 게이지는 "처음 길이 대비 남은 비율"로 줄어든다. 처음 길이는 이번에 보인 가장 큰 남은 값, 끝나면(0 이하) 0 으로 되돌린다 */
export function trackTotal(prevTotal: number, remaining: number): number {
  return remaining <= 0 ? 0 : Math.max(prevTotal, remaining);
}

/** 게이지 채움 비율 (0~1). 전체가 0 이하면 0 */
export function gaugeFill(remaining: number, total: number): number {
  return total > 0 ? Math.min(1, Math.max(0, remaining / total)) : 0;
}

/** 머리 위 게이지 종류: 시전(강공격 예고)·봉인·막기·방어 자세 (GDD 18-6) */
export type HeadGaugeKind = 'cast' | 'seal' | 'guard' | 'stance';

/** 켜져 있는 게이지에 쌓는 자리(0이 머리 위 첫 줄, 1부터 그 아래)를 준다. 꺼진 것은 -1 */
export function gaugeSlots(visible: readonly boolean[]): number[] {
  let next = 0;
  return visible.map((v) => (v ? next++ : -1));
}

// ───────────────────────── DOM 도구 ─────────────────────────

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 텍스트가 달라졌을 때만 쓴다 (프레임마다 부르는 갱신에서 DOM 쓰기를 줄인다) */
export function setText(node: HTMLElement, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

/** 1회성 클래스: 붙이고, animationend(또는 안전 타이머)에서 뗀다 */
export function playOnce(node: HTMLElement, cls: string, fallbackMs = 1200): void {
  node.classList.add(cls);
  const done = () => {
    node.classList.remove(cls);
    node.removeEventListener('animationend', onEnd);
    window.clearTimeout(timer);
  };
  const onEnd = (e: Event) => {
    if (e.target === node) done();
  };
  const timer = window.setTimeout(done, fallbackMs);
  node.addEventListener('animationend', onEnd);
}

/** 1회성 클래스 다시 재생: 떼기 → 레이아웃 읽기(리플로) → 붙이기 (HANDOFF 7장) */
export function replayOnce(node: HTMLElement, cls: string, fallbackMs = 1200): void {
  node.classList.remove(cls);
  void node.offsetWidth;
  playOnce(node, cls, fallbackMs);
}

/** 적 실루엣 SVG (`.bha-foe__body` 안). id = 스프라이트 심볼 (foe-a / foe-b) */
export function foeSvg(symbolId: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `#${symbolId}`);
  svg.append(use);
  return svg;
}

/** 적 영역 실루엣: 오라 + 몸. aura = 약점 계통 색 변수 (예 `var(--bha-lin-b)`) */
export function foeEl(symbolId: string, aura: string | null, art: ArtUrls | null = null): HTMLElement {
  const foe = el('div', 'bha-foe');
  if (aura) foe.style.setProperty('--aura', aura);
  const body = el('span', 'bha-foe__body');
  if (art?.src) {
    body.classList.add('has-art');
    const img = artImg(art, art.src, 'bha-foe__img');
    body.append(img);
    bindAnim(foe, img, art)?.setLoop('idle');
  } else body.append(foeSvg(symbolId));
  foe.append(el('span', 'bha-foe__aura'), body);
  return foe;
}

/** 그림 한 장 (256×256 투명, 왼쪽을 보는 그림). 배율·세로 보정은 CSS 변수로 넘기고 모양은 CSS 가 안다 */
export function artImg(art: ArtUrls, url: string, cls: string): HTMLImageElement {
  const img = el('img', cls) as HTMLImageElement;
  img.src = url;
  img.alt = '';
  img.draggable = false;
  img.style.setProperty('--art-scale', String(art.scale));
  img.style.setProperty('--art-dy', `${art.offsetY}%`);
  return img;
}

/** 이 적의 그림(파일이 있을 때만). 화면이 foeEl 에 넘긴다 */
export function foeArtOf(enemyId: string): ArtUrls | null {
  return enemyArt(enemyId, ART_BASE);
}

const ART_BASE = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';

/** 종족·단계에 맞는 내 그림 (새 규칙 파일 > 종족 설정의 기존 키 > 없음). 종족 id 는 키 조립에만 쓴다 */
export function heroArtOf(room: RoomConfig, factionId: string, tierIndex: number, skinId?: string | null): ArtUrls {
  return charArt(factionId, tierIndex, room.characterArt, ART_BASE, undefined, undefined, skinId);
}

/** 내 그림 한 장 (`.bha-hero`): 몸통박치기의 주인공. 그림이 있으면 첫 프레임 한 장(왼쪽을 보는 그림), 없으면 자리표시 도형 */
export function heroEl(art: ArtUrls, loco: Locomotion = 'walk'): { root: HTMLElement; body: HTMLElement } {
  const root = el('div', 'bha-hero');
  setLoco(root, loco);
  const body = el('span', 'bha-hero__body');
  const url = art.src ?? art.frames?.[0] ?? null;
  if (url) {
    body.classList.add('has-art');
    const img = artImg(art, url, 'bha-hero__img');
    body.append(img);
    bindAnim(root, img, art)?.setLoop('idle');
  } else {
    body.append(el('span', 'bha-hero__eye'), el('span', 'bha-hero__eye'));
  }
  // 부유·날기: 떠올라 움직이는 lift 상자 안에 몸을 두고, 그림자는 땅에 남긴다 (몸통박치기는 root, 피격은 body 가 맡는다)
  const lift = el('span', 'bha-hero__lift');
  lift.append(body);
  root.append(el('span', 'bha-hero__shadow'), lift);
  return { root, body };
}

export interface HeadGaugeState {
  /** false 면 감춘다 (idle 표시가 있는 게이지는 흐리게 남긴다) */
  on: boolean;
  /** 0~1 채움 */
  fill: number;
  /** 글자 (예 "강공격 예고! 1.2초") */
  label: string;
  /** 쌓는 자리 (gaugeSlots) */
  slot: number;
  /** 막았다 같은 결과 표시 */
  done?: boolean;
}

export interface HeadGauge {
  root: HTMLElement;
  set(state: HeadGaugeState): void;
}

/**
 * 유닛 머리 위 게이지 한 개 (`.bha-hgauge`): 아이콘 + 글자 + 채움 바.
 * 프레임마다 불러도 달라진 값만 DOM 에 쓴다. idleLabel 이 있으면 꺼져도 흐린 빈 바로 자리를 지킨다(튜토리얼이 가리킬 자리).
 */
export function headGaugeEl(kind: HeadGaugeKind, iconId: string, idleLabel?: string): HeadGauge {
  const root = el('div', `bha-hgauge bha-hgauge--${kind}`);
  const ico = icon(iconId);
  const label = el('span', 'bha-hgauge__label');
  const fillEl = el('i', 'bha-hgauge__fill');
  root.append(fillEl, ico, label);
  root.hidden = !idleLabel;
  root.classList.toggle('is-idle', !!idleLabel);
  if (idleLabel) label.textContent = idleLabel;
  root.style.setProperty('--fill', '0');
  let lastFill = 0;
  let lastSlot = -2;
  let lastOn = false;
  let lastDone = false;
  return {
    root,
    set(st) {
      if (!st.on) {
        if (lastOn || lastDone) {
          lastOn = false;
          lastDone = false;
          root.classList.remove('is-done');
          if (idleLabel) {
            root.classList.add('is-idle');
            label.textContent = idleLabel;
            root.style.setProperty('--fill', '0');
            lastFill = 0;
          } else root.hidden = true;
        }
        if (st.slot !== lastSlot) {
          lastSlot = st.slot;
          root.style.setProperty('--slot', String(Math.max(0, st.slot)));
        }
        return;
      }
      if (!lastOn) {
        lastOn = true;
        root.hidden = false;
        root.classList.remove('is-idle');
      }
      if (!!st.done !== lastDone) {
        lastDone = !!st.done;
        root.classList.toggle('is-done', lastDone);
      }
      const f = Math.round(st.fill * 200) / 200;
      if (f !== lastFill) {
        lastFill = f;
        root.style.setProperty('--fill', String(f));
      }
      if (st.slot !== lastSlot) {
        lastSlot = st.slot;
        root.style.setProperty('--slot', String(Math.max(0, st.slot)));
      }
      setText(label, st.label);
    },
  };
}

const BLOCK_ICON: Record<BlockVisual, string> = {
  attack: 'i-attack', guard: 'i-guard', heal: 'i-heal', basic: 'i-basic', special: 'i-special', void: 'i-void',
};

export interface BlockSpec {
  visual: BlockVisual;
  /** 칸 안에 보이는 약어 */
  abbr: string;
  /** 접근성 이름 (약어가 아니라 전체 이름) */
  label: string;
  weak: boolean;
  uid: number;
  /** 계열 표시 한 글자 (공격 계열 블록만, GDD 17-3) */
  family?: string;
  /** 계열 id (종족 중립 family-a/b/c): 계열별 색 띠를 고르는 데이터 속성 (GDD 18-8 ③) */
  familyId?: string;
  /** 속성 색 (CSS 값, GDD 20-2: 블록 = 계열 글자 + 속성 색). 있으면 계열 배지·띠를 이 색으로 칠한다 */
  elementColor?: string;
  /** 계열 연출 종류 (종족 설정 families[].fx): 공격 블록의 아이콘 모양을 계열마다 다르게 (C.131, GDD 79장). 색은 속성, 모양은 계열 */
  fx?: string;
}

/** 블록 한 개 (HANDOFF 5-1). 체인 단계·눌림 같은 상태 클래스는 화면이 붙인다 */
export function blockEl(spec: BlockSpec): HTMLElement {
  const node = el('div', `bha-block bha-block--${spec.visual}${spec.weak ? ' is-weak' : ''}`);
  node.setAttribute('role', 'button');
  node.tabIndex = 0;
  node.setAttribute('aria-label', spec.label);
  node.dataset.uid = String(spec.uid);
  node.dataset.visual = spec.visual;
  if (hasPips(spec.visual)) {
    const pips = el('span', 'bha-block__pips');
    pips.append(el('i'), el('i'), el('i'));
    node.append(pips);
  }
  const ico = el('span', 'bha-block__icon');
  ico.append(icon(spec.visual === 'attack' && spec.fx ? `i-fx-${spec.fx}` : BLOCK_ICON[spec.visual]));
  if (spec.fx) node.dataset.fx = spec.fx;
  const weak = el('span', 'bha-block__weak');
  weak.append(icon('i-weak'));
  node.append(ico, el('b', 'bha-block__abbr', spec.abbr), weak);
  if (spec.family) {
    node.append(el('span', 'bha-block__fam', spec.family));
    if (spec.familyId) node.dataset.fam = spec.familyId;
  }
  if (spec.elementColor) {
    node.dataset.el = '';
    node.style.setProperty('--fam', spec.elementColor);
  }
  return node;
}

export interface TrayParts {
  root: HTMLElement;
  grid: HTMLElement;
  cells: HTMLElement[];
  veil: HTMLElement;
  veilText: HTMLElement;
}

/** 블록 바 틀 (HANDOFF 5-2): 칸 N개 + 봉인 가림막. 묶음·삽입 막대는 화면이 grid 에 붙였다 뗀다 */
export function trayEl(capacity: number): TrayParts {
  const root = el('div', 'bha-tray');
  const grid = el('div', 'bha-tray__grid');
  grid.style.gridTemplateColumns = `repeat(${capacity}, minmax(0, 1fr))`;
  const cells = Array.from({ length: capacity }, (_, i) => {
    const c = el('div', 'bha-tray__cell');
    c.style.gridColumn = String(i + 1);
    return c;
  });
  grid.append(...cells);
  const veil = el('div', 'bha-tray__veil');
  const veilText = el('span');
  veil.append(icon('i-seal'), veilText);
  root.append(grid, veil);
  return { root, grid, cells, veil, veilText };
}

/** 체인 묶음 표시 (`.bha-tray__run`): 라벨 "체인2" / 최대 체인 "체인3" / 더 길면 "체인3+" */
export function runEl(spec: RunSpec, chainName: string): HTMLElement {
  const run = el('div', `bha-tray__run${spec.max ? ' bha-tray__run--chain3' : ''}`);
  run.style.setProperty('--start', String(spec.start));
  run.style.setProperty('--len', String(spec.len));
  const label = el('span', 'bha-tray__runlabel');
  label.append(icon(`i-chain-${Math.min(3, Math.max(1, spec.level))}`), `${chainName}${spec.level}${spec.over ? '+' : ''}`);
  run.append(label);
  return run;
}

/** 사건 로그 한 줄 */
export function logLineEl(role: LogRole, iconId: string, text: string): HTMLElement {
  const line = el('p', `bha-log__line bha-log__line--${role}`);
  line.append(icon(iconId), el('span', '', text));
  return line;
}

export interface FloatOpts {
  crit?: boolean;
  chain3?: boolean;
  iconId?: string;
  /** 약점 적중 (1.5배): 따로 눈에 띄는 색 */
  weak?: boolean;
  /** 체인(2연쇄 이상)으로 터진 피해: 조금 더 크게 */
  chained?: boolean;
  /** 피해 크기 단계 (C.63, GDD 28장 4번): small = 작고 흐림, big = 크고 진하게(속성 색), 없으면 보통 */
  size?: DamageTier;
  /** 치명타 (C.63): 가장 크게 + "치명" 표시 */
  critical?: boolean;
  /** 큰 피해에 칠할 속성 색 (속성 id, 없으면 체인 색) */
  element?: string | null;
}

export type DamageTier = 'small' | 'normal' | 'big';

/** 피해 숫자 크기 단계 (C.63, GDD 28장 4번): 기본 공격 1회분 미만 = small, 체인·필살류(ult) 또는 기본 공격 3회분 이상 = big, 그 사이 = normal */
export function damageTier(damage: number, unit: number, o: { chain?: number; ult?: boolean } = {}): DamageTier {
  if (o.ult || (o.chain ?? 1) > 1 || damage >= unit * 3 - 1e-9) return 'big';
  if (damage < unit - 1e-9) return 'small';
  return 'normal';
}

/** 치명타 표시 글자 */
export const CRIT_LABEL = '치명';

/** 플로팅 숫자 한 개를 채운다 (새 요소든 풀의 재사용 요소든 같은 모양) */
function fillFloat(f: HTMLElement, kind: FloatKind, text: string, spot: { left: number; top: number }, opts: FloatOpts): void {
  const cls = ['bha-float', `bha-float--${kind}`];
  if (opts.crit) cls.push('is-crit');
  if (opts.weak) cls.push('is-weak');
  if (opts.chained) cls.push('is-chained');
  if (opts.chain3) cls.push('bha-float--chain3');
  if (opts.size === 'small') cls.push('is-small');
  if (opts.size === 'big') cls.push('is-big');
  if (opts.critical) cls.push('is-critical');
  f.className = cls.join(' ');
  f.style.left = `${spot.left}%`;
  f.style.top = `${spot.top}%`;
  if (opts.element) f.style.setProperty('--bha-lin-color', elementColor(opts.element));
  else f.style.removeProperty('--bha-lin-color');
  f.replaceChildren();
  if (opts.critical) f.append(el('small', 'bha-float__crit', CRIT_LABEL));
  if (opts.iconId) f.append(icon(opts.iconId));
  f.append(text);
}

/** 플로팅 숫자 (역할별 모양). 내용은 아이콘(선택) + 글자. 위치는 아레나 안 % */
export function floatEl(kind: FloatKind, text: string, spot: { left: number; top: number }, opts: FloatOpts = {}): HTMLElement {
  const f = el('span', '');
  fillFloat(f, kind, text, spot, opts);
  return f;
}

/** 내가 받는 피해 숫자 자리 (아레나 왼쪽 아래 쪽, 내 체력 막대 방향) */
export const HURT_SPOTS: readonly { left: number; top: number }[] = [{ left: 16, top: 52 }, { left: 28, top: 60 }, { left: 10, top: 62 }];

/** 플로팅 숫자 풀: 요소를 최대 max 개만 만들어 돌려 쓴다 (가장 오래된 것부터 재사용 = 동시 표시 개수 제한). 이벤트 때만 쓰이고 틱마다 만들지 않는다 */
export function floatPool(container: HTMLElement, max = 6, showMs = 1100): {
  show(kind: FloatKind, text: string, spot: { left: number; top: number }, opts?: FloatOpts): void;
  readonly size: number;
} {
  const nodes: { node: HTMLElement; timer: number }[] = [];
  let next = 0;
  return {
    show(kind, text, spot, opts = {}) {
      let slot = nodes[next % max];
      if (!slot) {
        const node = el('span', '');
        node.hidden = true;
        container.append(node);
        slot = { node, timer: 0 };
        nodes.push(slot);
      }
      next++;
      const { node } = slot;
      window.clearTimeout(slot.timer);
      fillFloat(node, kind, text, spot, opts);
      node.hidden = false;
      node.style.animation = 'none';
      void node.offsetWidth;
      node.style.animation = '';
      slot.timer = window.setTimeout(() => {
        node.hidden = true;
      }, showMs);
    },
    get size() {
      return nodes.length;
    },
  };
}

/** 전투 배속 기억(C.63 `bha-battle-speed`)은 C.118 에 삭제 — 전투는 1배 고정 (GDD 62장). 브라우저에 남은 옛 값은 읽지 않는다 */
export const BATTLE_SPEED_KEY_REMOVED = 'bha-battle-speed';

/** 전투 로그 패널에 남기는 최근 줄 수 (C.63: 가운데 실시간 안내 대신 [로그] 버튼) */
export const BATTLE_LOG_MAX = 40;
