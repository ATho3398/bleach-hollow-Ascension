// 기기 그림 규격 frame-v2 (GDD 33장, C.77): 기본형(CSS 기기) 평소 화면을 844×390 에서 잰 값 그대로.
// 그림 한 장 = 기본형 몸체(평소 화면 + 둘레 26px) 896×442 의 정수배. 아래 좌표는 모두 "그림 왼쪽 위 (0,0)" 기준 기준 px(×1).
// 이 값은 docs/design/device-preset/frame-v2/preset.json 과 같아야 한다 (tests/c77.test.ts 가 비교).
export interface PxRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const FRAME_V2_BUTTONS = ['up', 'down', 'ok', 'back'] as const;
export type FrameV2Button = (typeof FRAME_V2_BUTTONS)[number];

export const FRAME_V2 = {
  /** 그림 기준 크기 = 기본형 몸체 (다마고치 모드의 CSS 몸체 = 평소 화면 + 둘레 BODY.pad 26) */
  canvas: { w: 896, h: 442 },
  /** 평소 화면 (844×390)이 그림에서 차지하는 자리 — 이 밖은 다마고치 모드에서만 보인다 */
  plain: { x: 26, y: 26, w: 844, h: 390 },
  /** 게임 화면(LCD) 구멍: 완전 투명 */
  lcd: { x: 125, y: 41, w: 646, h: 360 },
  /** 버튼 4개 누름 영역 (기본형 버튼과 같은 자리·크기) */
  buttons: {
    up: { x: 46, y: 161, w: 52, h: 52 },
    down: { x: 46, y: 229, w: 52, h: 52 },
    ok: { x: 792, y: 159, w: 64, h: 64 },
    back: { x: 802, y: 239, w: 44, h: 44 },
  } satisfies Record<FrameV2Button, PxRect>,
} as const;

const pctX = (v: number): number => Math.round((v / FRAME_V2.canvas.w) * 10000) / 100;
const pctY = (v: number): number => Math.round((v / FRAME_V2.canvas.h) * 10000) / 100;

/** 기준 px 사각형 → 그림 대비 % (items.json 과 같은 단위) */
export function frameV2Pct(r: PxRect): PxRect {
  return { x: pctX(r.x), y: pctY(r.y), w: pctX(r.w), h: pctY(r.h) };
}
