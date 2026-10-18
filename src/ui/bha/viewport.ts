// 기기 틀을 화면에 맞추는 계산 (GDD 16-6, v1.6): 폰이 가로면 그대로, 세로면 기기 전체를 90도 돌려 세로 화면을 가득 채운다.
// 기기의 "논리 크기"(레이아웃이 보는 크기)는 항상 가로 기준이다: 가로 폰 = 뷰포트 그대로, 세로 폰 = (높이 × 너비).
// 긴 쪽이 MIN_LOGICAL_W 보다 짧으면 논리 크기를 MIN_LOGICAL_W 기준으로 키우고 비례 축소(scale)한다.
// 회전·축소된 화면에서는 포인터 좌표(clientX/Y)와 getBoundingClientRect 가 화면(회전된) 좌표이므로, 가로 방향 판정(블록 칸 찾기 등)은
// toLocal / localRect 로 기기 안 좌표로 바꿔 쓴다. 순수 함수라 단위 테스트한다 (tests/viewport.test.ts).

/** 이 폭(논리 px)보다 좁게는 레이아웃을 줄이지 않는다. 740 = 블록 칸 44px 기준 (dev-log C.26) */
export const MIN_LOGICAL_W = 740;

export interface Fit {
  /** 세로 화면이라 기기를 90도(시계 방향) 돌려 놓았는가: 기기의 위쪽이 화면 오른쪽 */
  rotated: boolean;
  /** 비례 축소 배율 (1 이하) */
  scale: number;
  /** 기기 논리 크기 (CSS px, scale 적용 전) */
  w: number;
  h: number;
  /** 뷰포트 크기 */
  vw: number;
  vh: number;
}

export const IDENTITY_FIT: Fit = { rotated: false, scale: 1, w: 0, h: 0, vw: 0, vh: 0 };

export function computeFit(vw: number, vh: number): Fit {
  const rotated = vh > vw;
  const long = rotated ? vh : vw;
  const short = rotated ? vw : vh;
  const scale = long < MIN_LOGICAL_W ? long / MIN_LOGICAL_W : 1;
  return { rotated, scale, w: long / scale, h: short / scale, vw, vh };
}

/** 기기에 줄 CSS transform. 기기 원점은 왼쪽 위 (transform-origin: 0 0) */
export function fitTransform(f: Fit): string {
  // 순서(오른쪽부터 적용): 축소 → 시계 방향 90도 → 오른쪽 끝으로 이동
  return f.rotated ? `translate(${f.vw}px, 0) rotate(90deg) scale(${f.scale})` : `scale(${f.scale})`;
}

/** 화면 좌표(clientX/Y) → 기기 안 좌표(논리 px). 기기 왼쪽 위가 (0,0) */
export function toLocal(f: Fit, x: number, y: number): { x: number; y: number } {
  const sx = f.rotated ? y : x;
  const sy = f.rotated ? f.vw - x : y;
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
