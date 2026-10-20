// 기기 그림 규격 frame-v2 (GDD 33장, C.77 → 33-2 C.78): 고정 = **UI 묶음**(화면 구멍 + 버튼 4개의 크기·구멍 기준 상대 위치, 기본형 평소 화면 844×390 실측 그대로).
// 그림 크기·모양·구멍 위치(데이터 `hole: [x, y]` = 구멍 왼쪽 위, 그림 픽셀)·고리·재질·뒷면은 자유. 그림 1px = 논리 1/scale px.
// 이 값은 docs/design/device-preset/frame-v2/preset.json 과 같아야 한다 (tests/c78.test.ts 가 비교). 논리 px = 기기 안 좌표(844×390 기준).
export interface PxRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const FRAME_V2_BUTTONS = ['up', 'down', 'ok', 'back'] as const;
export type FrameV2Button = (typeof FRAME_V2_BUTTONS)[number];

export const FRAME_V2 = {
  /** 그림 1 논리 px = 그림 픽셀 3개 (구멍 646×360 → 1938×1080) */
  scale: 3,
  /** 그림 크기 상한(한 변, 그림 픽셀) — 안내값 */
  maxSide: 4000,
  /** 화면 구멍 크기(논리 px, 기본형 LCD) — 안은 완전 투명, 모서리 반지름 11 */
  hole: { w: 646, h: 360, radius: 11 },
  /** 구멍 둘레에 몸체가 있어야 하는 폭(논리 px, ×3 = 72) */
  cover: 24,
  /** 버튼 4개 누름 영역 — 구멍 왼쪽 위를 (0,0)으로 한 논리 px (기본형 버튼 그대로) */
  buttons: {
    up: { x: -79, y: 120, w: 52, h: 52 },
    down: { x: -79, y: 188, w: 52, h: 52 },
    ok: { x: 667, y: 118, w: 64, h: 64 },
    back: { x: 677, y: 198, w: 44, h: 44 },
  } satisfies Record<FrameV2Button, PxRect>,
  /** UI 묶음(구멍 + 버튼 4개)의 바깥 사각형 — 구멍 왼쪽 위 기준 */
  bundle: { x: -79, y: 0, w: 810, h: 360 },
  /** 기본형 평소 화면: 기기 전체 844×390 안에서 LCD 왼쪽 위 (99, 15) */
  basic: { w: 844, h: 390, lcdX: 99, lcdY: 15 },
} as const;

/** 그림 픽셀 → 논리 px */
export const artToLogical = (px: number): number => Math.round((px / FRAME_V2.scale) * 100) / 100;
