// 기기 틀을 화면에 맞추는 계산 (GDD 14-2 '모든 기기 같은 화면비·같은 버튼 자리', C.554): 폰·태블릿·PC 모두 기기 틀 전체를 기준 크기 844×390 비율 그대로
// 한 배율로만 키우거나 줄여(배율 = min(화면 가로 ÷ 844, 화면 세로 ÷ 390)) 화면 가운데에 둔다. 남는 위·아래 또는 좌·우는 바깥 어두운 배경(device.css).
// 세로로 쥔 폰은 기기 전체를 90도 돌린 뒤 같은 계산. 노치·홈 바 안전 영역은 배율 계산에서 빼고 그 안에 맞춘다.
// 회전·축소된 화면에서는 포인터 좌표(clientX/Y)와 getBoundingClientRect 가 화면(회전된) 좌표이므로, 가로 방향 판정(블록 칸 찾기 등)은
// toLocal / localRect 로 기기 안 좌표로 바꿔 쓴다. 순수 함수라 단위 테스트한다 (tests/viewport.test.ts, tests/c554.test.ts).
import { BASE_H, BASE_W } from '../viewScale';

export interface Fit {
  /** 세로 화면이라 기기를 90도(시계 방향) 돌려 놓았는가: 기기의 위쪽이 화면 오른쪽 */
  rotated: boolean;
  /** 기기 배율 (논리 px → 화면 px) */
  scale: number;
  /** 기기 논리 크기 (CSS px, scale 적용 전) — 늘 기준 크기 844×390 (그림 기기의 틀 상자가 더 크면 같은 비율로 늘린 값) */
  w: number;
  h: number;
  /** 뷰포트 크기 */
  vw: number;
  vh: number;
  /**
   * 기기 왼쪽 위의 화면 자리(여백). 가로 = 화면 (ox, oy). 돌려 놓은 기기 = 기기 기준 방향으로 잰 여백: ox = 화면 위에서 아래로, oy = 화면 오른쪽에서 왼쪽으로.
   * PC 고정 모드(GDD 17-5)는 크기를 zoom(scale)으로 키운다. 없으면 0
   */
  ox?: number;
  oy?: number;
}

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

/** 화면의 안전 영역(화면 기준) → 기기 기준 방향. 돌려 놓은 기기에서는 화면 위·오른쪽·아래·왼쪽이 기기의 왼쪽·위·오른쪽·아래가 된다 */
export function rotateInsets(rotated: boolean, s: Insets): Insets {
  return rotated ? { top: s.right, right: s.bottom, bottom: s.left, left: s.top } : s;
}

/** 뷰포트 크기를 고른다: 고정 위치 프로브(inset 0)가 재는 "지금 보이는 영역"이 있으면 그것(주소창이 접히고 펴져도 맞음), 없으면 window 크기 */
export function pickViewport(probe: { width: number; height: number } | null, win: { innerWidth: number; innerHeight: number }): { w: number; h: number } {
  if (probe && probe.width > 0 && probe.height > 0) return { w: probe.width, h: probe.height };
  return { w: win.innerWidth, h: win.innerHeight };
}

export const IDENTITY_FIT: Fit = { rotated: false, scale: 1, w: 0, h: 0, vw: 0, vh: 0 };

/** 그림 기기의 틀 상자(GDD 31장 4)가 기준 크기 안에 들어가게 하는 논리 크기 배율 (기본형·frame-v2 = 1) */
function frameK(w: number, h: number, frame?: { w: number; h: number } | null): number {
  return frame ? Math.min(w / frame.w, h / frame.h) : 1;
}

/**
 * 터치 폰·태블릿(과 기준 크기보다 작은 창) 맞춤: 기기 전체(기준 844×390)를 한 배율로 키우거나 줄여 안전 영역 안 가운데에 둔다.
 * frame = 그림 기기를 입었을 때 화면에 꼭 들어와야 하는 상자(논리 px, GDD 31장 4 — 화면 구멍 + 버튼 4개). 있으면 그 상자가 기준 크기 안에 들어가게
 * 논리 크기를 같은 비율로 늘리고 그만큼 배율을 줄인다(화면에 차지하는 크기·비율은 기본형과 같다).
 * safe = 화면 기준 안전 영역(px, 노치·홈 바)
 */
export function computeFit(vw: number, vh: number, frame?: { w: number; h: number } | null, safe?: Insets | null): Fit {
  const rotated = vh > vw;
  const d = rotateInsets(rotated, safe ?? NO_INSETS);
  const long = rotated ? vh : vw;
  const short = rotated ? vw : vh;
  const aw = Math.max(1, long - d.left - d.right);
  const ah = Math.max(1, short - d.top - d.bottom);
  const base = Math.min(aw / BASE_W, ah / BASE_H);
  const k = frameK(BASE_W, BASE_H, frame);
  return { rotated, scale: base * k, w: BASE_W / k, h: BASE_H / k, vw, vh, ox: d.left + (aw - BASE_W * base) / 2, oy: d.top + (ah - BASE_H * base) / 2 };
}

/** PC 고정 모드: 기준 크기 w×h 를 scale 배(설정 1배/2배, 창이 작으면 자동 축소)로 키워 뷰포트 가운데에 둔다 (회전 없음) */
export function computePcFit(vw: number, vh: number, scale: number, w: number, h: number, frame?: { w: number; h: number } | null): Fit {
  // 그림 기기(GDD 31장 4): 기준 크기 안에 틀 상자가 들어가게 논리 크기를 늘리고 그만큼 배율을 줄인다 (화면에 차지하는 크기는 같다)
  const k = frameK(w, h, frame);
  return { rotated: false, scale: scale * k, w: w / k, h: h / k, vw, vh, ox: (vw - w * scale) / 2, oy: (vh - h * scale) / 2 };
}

/** 기기에 줄 CSS transform (터치 맞춤). 기기 원점은 왼쪽 위 (transform-origin: 0 0) */
export function fitTransform(f: Fit): string {
  const ox = f.ox ?? 0, oy = f.oy ?? 0;
  // 순서(오른쪽부터 적용): 축소 → 시계 방향 90도 → 여백 자리로 이동
  return f.rotated ? `translate(${f.vw - oy}px, ${ox}px) rotate(90deg) scale(${f.scale})` : `translate(${ox}px, ${oy}px) scale(${f.scale})`;
}

/** 화면 좌표(clientX/Y) → 기기 안 좌표(논리 px). 기기 왼쪽 위가 (0,0) */
export function toLocal(f: Fit, x: number, y: number): { x: number; y: number } {
  const ox = f.ox ?? 0, oy = f.oy ?? 0;
  const sx = f.rotated ? y - ox : x - ox;
  const sy = f.rotated ? f.vw - x - oy : y - oy;
  return { x: sx / f.scale, y: sy / f.scale };
}

export interface RectLike {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** 화면 사각형(getBoundingClientRect) → 기기 안 사각형. 회전해도 가로·세로가 바뀐 채로 left/top/width/height 가 맞는다 */
export function localRect(f: Fit, r: RectLike): { left: number; top: number; width: number; height: number } {
  const a = toLocal(f, r.left, r.top);
  const b = toLocal(f, r.right, r.bottom);
  return { left: Math.min(a.x, b.x), top: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
}

// ── 현재 맞춤 (기기가 갱신한다. 화면 코드는 읽기만) ──
let current: Fit = IDENTITY_FIT;

export function currentFit(): Fit {
  return current;
}

export function setFit(f: Fit): void {
  current = f;
}

/** 현재 맞춤으로 바꾼 포인터 위치 */
export function pointerLocal(e: { clientX: number; clientY: number }): { x: number; y: number } {
  return toLocal(current, e.clientX, e.clientY);
}

export function elementLocalRect(el: Element): { left: number; top: number; width: number; height: number } {
  return localRect(current, el.getBoundingClientRect());
}

/** 스크롤 위치를 0 에 묶는 상자 (기기 틀·LCD). overflow: hidden 상자도 scrollIntoView·focus 로 밀리므로, 밀리면 바로 되돌린다 (C.93 QA) */
export interface PinnableBox {
  scrollTop: number;
  scrollLeft: number;
  scrollTo(x: number, y: number): void;
  addEventListener(type: 'scroll', fn: () => void, opts?: AddEventListenerOptions): void;
}
export function pinScroll(box: PinnableBox): void {
  box.addEventListener('scroll', () => {
    if (box.scrollTop !== 0 || box.scrollLeft !== 0) box.scrollTo(0, 0);
  }, { passive: true });
}
