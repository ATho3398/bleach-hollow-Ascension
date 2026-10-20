// C.77 (S-21, GDD 33장): 기기 그림 규격 frame-v2 — 기본형 평소 화면 px 그대로
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COSMETIC_ITEMS, DEVICE_BUTTONS, getCosmetic, deviceArt, shopVisible } from '../src/data/shop';
import { FRAME_V2, FRAME_V2_BUTTONS, frameV2Pct } from '../src/data/shop/frameV2';
import { deviceArtPlacementV2, deviceSkinV2, skinLcdAt, tamaLayout } from '../src/ui/bha/tamagoLogic';
import { computeFit, computePcFit, toLocal } from '../src/ui/bha/viewport';
import { PATCH_LABEL, STAGE_LABEL } from '../src/version';

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const preset = JSON.parse(src('docs/design/device-preset/frame-v2/preset.json'));
// 기본형 평소 화면 실측 (844×390, DOM 측정, 33-1 표) — 기기 안 좌표
const BASIC = { lcd: { x: 99, y: 15, w: 646, h: 360 }, up: { x: 20, y: 135, w: 52, h: 52 }, down: { x: 20, y: 203, w: 52, h: 52 }, ok: { x: 766, y: 133, w: 64, h: 64 }, back: { x: 776, y: 213, w: 44, h: 44 } };

describe('버전 (C.77)', () => {
  it('패치 번호는 C.77 이상, 단계 형식', () => {
    expect(Number(PATCH_LABEL.slice(2))).toBeGreaterThanOrEqual(77);
    expect(STAGE_LABEL).toMatch(/^[A-Z]+-\d+[a-z]?$/);
  });
});

describe('1. 규격 값 = 기본형 실측', () => {
  it('preset.json 기준값 = 게임 코드 상수(frameV2.ts), 배율별 좌표는 기준 × 정수배', () => {
    expect(preset.preset).toBe('frame-v2');
    expect(preset.base.canvas).toEqual(FRAME_V2.canvas);
    expect(preset.base.plain).toEqual(FRAME_V2.plain);
    expect(preset.base.lcd).toEqual(FRAME_V2.lcd);
    expect(preset.base.buttons).toEqual(FRAME_V2.buttons);
    for (const k of [2, 3, 4]) {
      const s = preset.scales[`x${k}`];
      expect(s.canvas).toEqual({ w: 896 * k, h: 442 * k });
      expect(s.screen).toEqual({ x: 125 * k, y: 41 * k, w: 646 * k, h: 360 * k });
      for (const b of FRAME_V2_BUTTONS) {
        const r = FRAME_V2.buttons[b];
        expect(s.buttons[b].cx).toBe((r.x + r.w / 2) * k);
        expect(s.buttons[b].cy).toBe((r.y + r.h / 2) * k);
        expect(s.buttons[b].touchR).toBe((r.w * k) / 2);
      }
    }
    expect(preset.recommended).toBe('x3');
  });
  it('규격 = 기본형 실측 + 둘레 26 (그림 좌표 = 기기 좌표 + 26)', () => {
    const pad = FRAME_V2.plain.x;
    expect(pad).toBe(26);
    expect(FRAME_V2.canvas).toEqual({ w: 844 + 2 * pad, h: 390 + 2 * pad });
    expect(FRAME_V2.lcd).toEqual({ x: BASIC.lcd.x + pad, y: BASIC.lcd.y + pad, w: 646, h: 360 });
    for (const b of FRAME_V2_BUTTONS) expect(FRAME_V2.buttons[b]).toEqual({ x: BASIC[b].x + pad, y: BASIC[b].y + pad, w: BASIC[b].w, h: BASIC[b].h });
  });
  it('안내 파일: README·layout-guide·검사기 v1/v2·art-guide 10-1d·프롬프트', () => {
    for (const f of ['README.md', 'layout-guide.png', 'check-device.py', 'preset.json']) expect(existsSync(new URL(`../docs/design/device-preset/frame-v2/${f}`, import.meta.url))).toBe(true);
    expect(existsSync(new URL('../docs/design/device-preset/frame-v1/preset.json', import.meta.url))).toBe(true);
    expect(src('docs/design/device-preset/frame-v1/README.md')).toContain('옛 규격');
    expect(src('docs/design/device-preset/frame-v2/check-device.py')).toContain("--frame");
    expect(src('docs/design/device-preset/frame-v2/check-device.py')).toContain('px 더 큼');
    expect(src('docs/art-guide.md')).toContain('### 10-1d. 기기 그림 규격 — `frame-v2`');
    expect(src('docs/design/claude-design-prompts.md')).toContain('①-c 규격으로 뽑기 (frame-v2');
  });
});

describe('3. 게임: frame: "v2" 기기는 평소 화면에서 기본형과 같은 자리', () => {
  const vtest = getCosmetic('device-vtest')!;
  it('데이터: frame v2, 화면·버튼은 규격이 채움, 시험 그림 있음, 상점엔 안 나옴', () => {
    expect(vtest.device!.frame).toBe('v2');
    expect(vtest.device!.screen).toEqual(frameV2Pct(FRAME_V2.lcd));
    for (const b of DEVICE_BUTTONS) expect(vtest.device!.buttons[b]).toEqual(frameV2Pct(FRAME_V2.buttons[b]));
    expect(existsSync(new URL('../public/art/device-vtest-front.png', import.meta.url))).toBe(true);
    expect(existsSync(new URL('../public/art/device-vtest-back.png', import.meta.url))).toBe(true);
    expect(deviceArt(vtest, ['device-vtest-front.png', 'device-vtest-back.png'])).not.toBeNull();
    expect(shopVisible(vtest, [], ['device-vtest-front.png'])).toBe(false);
    expect(getCosmetic('device-badge')!.device!.frame).toBeUndefined(); // 사신대행증 = v1 그대로
    expect(COSMETIC_ITEMS.filter((c) => c.device?.frame === 'v2')).toHaveLength(1);
  });
  it('LCD 가 기본형 자리(99, 15)에 있으면 그림 몸체 = 기본형 몸체(−26, −26, 896×442), 버튼 4개 = 기본형 버튼 사각형', () => {
    const p = deviceArtPlacementV2(BASIC.lcd, vtest.device!);
    expect(p.box).toEqual({ x: -26, y: -26, w: 896, h: 442 });
    for (const b of DEVICE_BUTTONS) expect(p.buttons[b]).toEqual(BASIC[b]);
    expect(p.hole).toEqual(BASIC.lcd);
    expect(p.ring.x).toBeCloseTo(60 - 26, 0); // 시험 그림의 고리 (60, 14)
    expect(p.ring.y).toBeCloseTo(14 - 26, 0);
  });
  it('틀 상자 = 기본형 기기 전체: 844×390 에서 배율 1·LCD (99, 15), 세로 출력·PC 도 같은 기기 안 좌표', () => {
    const skin = deviceSkinV2();
    expect(skin.lcd).toEqual({ w: 646, h: 360 });
    expect(skin.hole).toEqual({ x: 0, y: 0, w: 646, h: 360 });
    expect(skin.crop).toEqual({ x: -99, y: -15, w: 844, h: 390 });
    for (const [vw, vh] of [[844, 390], [390, 844]] as const) {
      const f = computeFit(vw, vh, skin.crop);
      expect(f.scale).toBe(1);
      expect([f.w, f.h]).toEqual([844, 390]);
      expect(skinLcdAt(skin, f.w, f.h)).toEqual({ x: 99, y: 15 });
      // 세로 출력: 화면 가운데가 기기 가운데
      const c = toLocal(f, vw / 2, vh / 2);
      expect(c).toEqual({ x: 422, y: 195 });
    }
    const pc = computePcFit(1688, 780, 1, 844, 390, skin.crop);
    expect(pc.scale).toBe(1);
    expect([pc.w, pc.h]).toEqual([844, 390]);
    expect(skinLcdAt(skin, pc.w, pc.h)).toEqual({ x: 99, y: 15 });
    const pc2 = computePcFit(1688, 780, 2, 844, 390, skin.crop);
    expect(pc2.scale).toBe(2);
  });
  it('다마고치 모드: v2 그림 몸체 = 기본형 CSS 몸체라 줌·몸체 사각형이 같다', () => {
    const vtest = getCosmetic('device-vtest')!;
    const art = deviceArtPlacementV2(BASIC.lcd, vtest.device!);
    const withArt = tamaLayout(844, 390, { box: art.box, ring: art.ring });
    const basic = tamaLayout(844, 390, null);
    expect(withArt.body).toEqual(basic.body);
    expect(withArt.body).toEqual({ x: -26, y: -26, w: 896, h: 442 });
    expect(withArt.stage).toContain('rotateY(0deg)');
  });
  it('코드: v2 는 틀 상자·놓는 자리를 v2 전용 함수로, v1 은 그대로', () => {
    const t = src('src/ui/bha/tamago.ts');
    expect(t).toContain("artSpec.frame === 'v2' ? deviceArtPlacementV2");
    expect(t).toContain("if (c.device!.frame === 'v2') dev.setSkin(deviceSkinV2())");
  });
});
