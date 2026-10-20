// C.77 (S-21, GDD 33-1): 기본형 평소 화면 실측 = frame-v2 UI 묶음 (규칙은 C.78 에서 UI 묶음만 고정으로 바뀜 — tests/c78.test.ts)
import { describe, expect, it } from 'vitest';
import { FRAME_V2, FRAME_V2_BUTTONS } from '../src/data/shop/frameV2';
import { PATCH_LABEL, STAGE_LABEL } from '../src/version';

// 기본형 평소 화면 실측 (844×390, DOM 측정, 33-1 표) — 기기 안 좌표
const BASIC = { lcd: { x: 99, y: 15, w: 646, h: 360 }, up: { x: 20, y: 135, w: 52, h: 52 }, down: { x: 20, y: 203, w: 52, h: 52 }, ok: { x: 766, y: 133, w: 64, h: 64 }, back: { x: 776, y: 213, w: 44, h: 44 } };

describe('버전 (C.77)', () => {
  it('패치 번호는 C.77 이상, 단계 형식', () => {
    expect(Number(PATCH_LABEL.slice(2))).toBeGreaterThanOrEqual(77);
    expect(STAGE_LABEL).toMatch(/^[A-Z]+-\d+[a-z]?$/);
  });
});

describe('1. 규격 값 = 기본형 실측', () => {
  it('구멍 크기·버튼 = 기본형 LCD·버튼(구멍 왼쪽 위 기준 상대 위치)', () => {
    expect(FRAME_V2.hole).toMatchObject({ w: BASIC.lcd.w, h: BASIC.lcd.h });
    for (const b of FRAME_V2_BUTTONS) expect(FRAME_V2.buttons[b]).toEqual({ x: BASIC[b].x - BASIC.lcd.x, y: BASIC[b].y - BASIC.lcd.y, w: BASIC[b].w, h: BASIC[b].h });
    expect(FRAME_V2.basic).toEqual({ w: 844, h: 390, lcdX: BASIC.lcd.x, lcdY: BASIC.lcd.y });
  });
});
