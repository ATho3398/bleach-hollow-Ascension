// 전투 v2 부품 (C.152, docs/bha-ui-handoff README 5 "전투"·"스킬 블록 = 각인 컷"): 블록 카드·블록 바·체인 묶음 틀·해방 카드.
// 마크업 순서·클래스는 핸드오프(BlockStyles.dc.html, Battle.dc.html)와 같다: face → pips → icon → glyph → name.
// 블록 이름은 화면에 쓰지 않고(aria-label 만) 계열 글자 1자가 컷 자리에 선다. 종족 분기 없음 — 계열 글자·아이콘 종류는 종족 설정(families[].abbr/fx)에서 온다.
import { hpNumbers, type TrayParts } from '../battle';
import { setV2Gauge, v2Svg } from './components';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 핸드오프 아이콘 경로 (24×24 선 아이콘) — 계열 연출 종류(fx) 6종 + 역할 5종 */
export const V2_PATH = {
  claw: 'M6 4c3 4 4 9 3 16M11 4c3 4 4 9 3 16M16 4c3 4 4 9 3 16',
  bite: 'M3 6h18M5 6l2 7 2-7M10 6l2 9 2-9M15 6l2 7 2-7',
  shot: 'M14 12a3 3 0 1 0 6 0a3 3 0 1 0-6 0M3 9h9M5 12h8M3 15h9',
  slash: 'M5 19L19 5M10 21L21 10M3 14L14 3',
  impact: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l3 3M15 15l3 3M18 6l-3 3M9 15l-3 3',
  beam: 'M3 8h11M3 12h15M3 16h11M18 12a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
  guard: 'M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z',
  heal: 'M12 5v14M5 12h14',
  void: 'M12 12a2 2 0 1 1 2-2 4 4 0 1 1-4-4 6 6 0 1 1-6 6',
  combo: 'M12 3l2 7 7 2-7 2-2 7-2-7-7-2 7-2z',
  release: 'M12 2l3 5h6l-3 5 3 5h-6l-3 5-3-5H3l3-5-3-5h6z',
} as const;

/** 역할 블록의 계열 글자 (README 5: 막기 방 · 회복 회 · 공허 허 · 콤보 콤 · 해방 해 · 봉인 봉) */
export const V2_GLYPH = { guard: '방', heal: '회', void: '허', combo: '콤', release: '해', seal: '봉' } as const;

/** 블록 종류 (`bha-block--*`): 공격 = 속성 id, 나머지 = 고정 색. 핸드오프에 없는 속성(허)은 어댑터의 `--kyo` */
export type V2BlockKind = 'normal' | 'fire' | 'thunder' | 'water' | 'earth' | 'poison' | 'blood' | 'kyo' | 'guard' | 'heal' | 'void' | 'combo' | 'release';
const ATTR_KINDS: ReadonlySet<string> = new Set(['normal', 'fire', 'thunder', 'water', 'earth', 'poison', 'blood', 'kyo']);

/** 속성 id → 블록 종류 (순수). 모르는 속성은 노멀 */
export function v2AttackKind(elementId: string | null | undefined): V2BlockKind {
  return elementId && ATTR_KINDS.has(elementId) ? (elementId as V2BlockKind) : 'normal';
}

/** 계열 연출 종류(fx) → 아이콘 경로 (순수). 모르면 발톱 */
export function v2FamilyPath(fx: string | undefined): string {
  return (fx && Object.prototype.hasOwnProperty.call(V2_PATH, fx) ? V2_PATH[fx as keyof typeof V2_PATH] : V2_PATH.claw);
}

export interface V2BlockSpec {
  kind: V2BlockKind;
  /** 24×24 선 아이콘 경로 */
  path: string;
  /** 컷 자리 글자 1자 */
  glyph: string;
  /** 화면 낭독용 이름 (화면에는 쓰지 않는다) */
  label: string;
  uid: number;
  weak: boolean;
}

function pathSvg(d: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'bha-svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(SVG_NS, 'path');
  p.setAttribute('d', d);
  svg.append(p);
  return svg;
}

/** 스킬 블록 한 개 (각인 컷). 눌림·체인 점·약점·잠김은 화면이 제자리에서 바꾼다 */
export function v2BlockEl(spec: V2BlockSpec): HTMLElement {
  const b = document.createElement('div');
  b.className = `bha-block bha-block--${spec.kind}${spec.weak ? ' is-weak' : ''}`;
  b.setAttribute('role', 'button');
  b.tabIndex = 0;
  b.setAttribute('aria-label', spec.label);
  b.dataset.uid = String(spec.uid);
  b.dataset.kind = spec.kind;
  const face = document.createElement('span');
  face.className = 'bha-block__face';
  const pips = document.createElement('span');
  pips.className = 'bha-block__pips';
  pips.append(document.createElement('i'), document.createElement('i'), document.createElement('i'));
  const icon = document.createElement('span');
  icon.className = 'bha-block__icon';
  icon.append(pathSvg(spec.path));
  const glyph = document.createElement('span');
  glyph.className = 'bha-block__glyph';
  glyph.setAttribute('aria-hidden', 'true');
  glyph.textContent = spec.glyph;
  const name = document.createElement('span');
  name.className = 'bha-block__name';
  name.textContent = spec.label;
  b.append(face, pips, icon, glyph, name);
  setV2Pips(b, 1);
  return b;
}

/** 체인 점 켜기: level 1~3 (첫 점은 항상 켜짐) */
export function setV2Pips(block: HTMLElement, level: number): void {
  const dots = block.querySelectorAll('.bha-block__pips i');
  dots.forEach((d, i) => d.classList.toggle('on', i < Math.max(1, Math.min(3, level))));
}

/** 봉인(잠김) 표시: 글자를 '봉' 으로 바꾸고 회색으로 (보스 기믹 칸 봉인) — 풀리면 원래 글자 */
export function setV2Locked(block: HTMLElement, locked: boolean): void {
  block.classList.toggle('is-locked', locked);
  const g = block.querySelector<HTMLElement>('.bha-block__glyph');
  if (!g) return;
  if (locked) {
    if (g.dataset.orig === undefined) g.dataset.orig = g.textContent ?? '';
    g.textContent = V2_GLYPH.seal;
  } else if (g.dataset.orig !== undefined) {
    g.textContent = g.dataset.orig;
    delete g.dataset.orig;
  }
}

/** 블록 바: 핸드오프 `.bha-blockbar` 안에 칸 N개 격자. 옛 trayEl 과 같은 부품(root·grid·cells·veil)을 돌려줘 입력·그리기 코드를 그대로 쓴다 */
export function v2TrayEl(capacity: number): TrayParts {
  const root = document.createElement('div');
  root.className = 'bha-blockbar bha-v2tray';
  root.setAttribute('role', 'list');
  root.setAttribute('aria-label', '블록 바');
  const grid = document.createElement('div');
  grid.className = 'bha-v2tray__grid';
  grid.style.setProperty('--cap', String(capacity)); // 칸 폭은 CSS(정사각형, 어댑터 C.169)
  const cells = Array.from({ length: capacity }, (_, i) => {
    const c = document.createElement('div');
    c.className = 'bha-v2cell bha-block--empty';
    c.setAttribute('role', 'listitem');
    c.style.gridColumn = String(i + 1);
    c.style.gridRow = '1';
    return c;
  });
  grid.append(...cells);
  const veil = document.createElement('div');
  veil.className = 'bha-v2tray__veil';
  const veilText = document.createElement('span');
  veil.append(v2Svg('i-seal'), veilText);
  root.append(grid, veil);
  return { root, grid, cells, veil, veilText };
}

/** 체인 묶음 틀 (`.bha-chain`): 붙은 칸들을 금색(체인2) / 주황(체인3) 테두리로 묶고 위에 탭. 칸 위에 겹쳐 놓는 격자 아이템(클릭은 통과) */
export function v2ChainEl(spec: { start: number; len: number; level: number; max: boolean; over: boolean }, chainName: string): HTMLElement {
  const c = document.createElement('div');
  c.className = `bha-chain${spec.max ? ' bha-chain--3' : ''} bha-v2chain`;
  c.style.gridColumn = `${spec.start} / span ${spec.len}`;
  c.style.gridRow = '1';
  const tab = document.createElement('span');
  tab.className = 'bha-chain__tab';
  tab.textContent = `${chainName}${spec.level}${spec.over ? '+' : ''}`;
  c.append(tab);
  return c;
}

/** 체인 묶음 경계 표시(같은 계열 5개 = 3+2 …): 칸 사이 가는 금색 선 (어댑터 `.bha-v2cut`) */
export function v2CutEl(index: number): HTMLElement {
  const c = document.createElement('div');
  c.className = 'bha-v2cut';
  c.style.gridColumn = String(index + 1);
  c.style.gridRow = '1';
  return c;
}

/** 체력 바 한 줄: 핸드오프 게이지(hp·foe) + 숫자 "78 / 108" (제자리에서 값만 바꾼다) */
export interface HpBar {
  root: HTMLElement;
  gauge: HTMLElement;
  nowEl: HTMLElement;
  maxEl: HTMLElement;
}

/** 체력을 바에 쓴다: 게이지 = 남은 비율, 글자 = 올림한 표시 정수(hpNumbers, C.68) — 남은 값이 최대를 넘지 않는다 */
export function setHpBar(bar: HpBar, hp: number, maxHp: number): void {
  setV2Gauge(bar.gauge, maxHp > 0 ? (Math.max(0, hp) / maxHp) * 100 : 0);
  const n = hpNumbers(hp, maxHp);
  const now = String(n.now);
  const max = ` / ${n.max}`;
  if (bar.nowEl.textContent !== now) bar.nowEl.textContent = now;
  if (bar.maxEl.textContent !== max) bar.maxEl.textContent = max;
}

/** 상태 칩 (공허 n회·체인3 n회처럼 값이 바뀌는 작은 칩): 아이콘 + 이름 + 값 */
export function v2StatusChip(iconId: string, name: string): { root: HTMLElement; value: HTMLElement } {
  const root = document.createElement('span');
  root.className = 'bha-chip';
  const value = document.createElement('b');
  value.className = 'bha-num';
  root.append(v2Svg(iconId), name, ' ', value);
  return { root, value };
}
