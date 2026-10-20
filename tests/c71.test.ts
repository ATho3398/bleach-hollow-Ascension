// C.71 (S-19, GDD 31장): 다마고치 모드 다시 설정 — 뒤집기 렉·화면비·키링 방향·평소 화면 디자인
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getCosmetic, DEVICE_BUTTONS } from '../src/data/shop';
import {
  BODY, SIDE_BANDS, SKIN_LCD, defaultGravity, deviceArtPlacement, deviceSkin, outputAngle, restAngle, rotateVec, screenGravity, silhouetteBands, skinLcdAt, tamaLayout, toDeviceVec,
} from '../src/ui/bha/tamagoLogic';
import { computeFit, computePcFit, fitTransform, toLocal } from '../src/ui/bha/viewport';
import { PATCH_LABEL, STAGE_LABEL } from '../src/version';

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const badge = getCosmetic('device-badge')!;
// 사신대행증은 C.84 에서 frame-v2 새 그림으로 바뀜 — 옛 frame-v1 그림(2744×2294)의 실제 좌표를 시험용으로 고정한다
const OLD_V1 = {
  ...badge.device!, frame: undefined, hole: undefined,
  screen: { x: 24.16, y: 35.66, w: 51.38, h: 30.73 },
  buttons: { up: { x: 11.81, y: 41.15, w: 7.58, h: 9.07 }, down: { x: 11.81, y: 51.79, w: 7.58, h: 9.07 }, ok: { x: 78.21, y: 39.58, w: 9.77, h: 11.68 }, back: { x: 79.96, y: 52.83, w: 6.27, h: 7.5 } },
  ring: { x: 50.04, y: 5.71 },
} as NonNullable<typeof badge.device>;
const NAT = { w: 2744, h: 2294 };
const scaleOf = (stage: string): number => Number(/scale\(([\d.]+)\)/.exec(stage)![1]);

describe('버전 (C.71)', () => {
  it('패치 번호는 C.71 이상, 단계 형식', () => {
    expect(Number(PATCH_LABEL.slice(2))).toBeGreaterThanOrEqual(71);
    expect(STAGE_LABEL).toMatch(/^[A-Z]+-\d+[a-z]?$/);
  });
});

describe('2. 화면비: 게임 화면 844×390 그대로, 규칙(frame-v1 구멍)을 게임 비율로 (31장 2 정정·재정정)', () => {
  it('규칙: 구멍 (663, 845) 1410×652 ≈ 844:390, 안내 문서도 같은 값', () => {
    const preset = JSON.parse(src('docs/design/device-preset/frame-v1/preset.json'));
    expect([preset.screen.x, preset.screen.y, preset.screen.w, preset.screen.h]).toEqual([663, 845, 1410, 652]);
    expect(Math.abs(1410 / 652 - 844 / 390)).toBeLessThan(0.01);
    expect(src('docs/art-guide.md')).toContain('y 845 · 1410 × 652');
  });
  it('검사기는 규칙과 다른 곳을 몇 px·어디인지 말한다', () => {
    const py = src('docs/design/device-preset/frame-v1/check-device.py');
    expect(py).toContain("px 더 큼: {fix} {lo}~{hi - 1} 가 투명 → 불투명(테두리)이어야 함");
  });
  it('그림 파일은 그대로(사신대행증 = 옛 2:1 구멍), 데이터는 그림의 실제 구멍', () => {
    const s = OLD_V1.screen;
    expect(Math.abs((s.y / 100) * NAT.h - 818)).toBeLessThan(2.5);
    expect(Math.abs((s.h / 100) * NAT.h - 705)).toBeLessThan(2.5);
  });
  it('LCD = 844×390 고정, 구멍 가로에 꽉. 규칙과 다른 그림이면 위아래 남는 띠(베젤 색), 규칙대로면 꽉 찬다', () => {
    expect(SKIN_LCD).toEqual({ w: 844, h: 390 });
    const old = deviceSkin(NAT, OLD_V1);
    expect(Math.abs(old.hole.x)).toBeLessThan(1);
    expect(Math.abs(old.hole.w - 844)).toBeLessThan(1);
    expect(old.hole.y).toBeLessThan(-10); // 위아래 약 16px 씩
    expect(Math.abs(old.hole.y + old.hole.h / 2 - 195)).toBeLessThan(1);
    const rule = { ...OLD_V1, screen: { x: (663 / 2744) * 100, y: (845 / 2294) * 100, w: (1410 / 2744) * 100, h: (652 / 2294) * 100 } };
    const fit = deviceSkin(NAT, rule);
    expect(Math.abs(fit.hole.y)).toBeLessThan(1);
    expect(Math.abs(fit.hole.h - 390)).toBeLessThan(1);
    expect(src('src/ui/bha/device.css')).toContain('background: var(--bha-bg-0); border: 0; box-shadow: none;  /* 규칙과 다른 그림');
  });
});

describe('4. 평소 화면도 입은 기기 디자인 (31장 4)', () => {
  const skin = deviceSkin(NAT, OLD_V1);
  it('틀 상자 = 화면 구멍 + 버튼 4개가 다 들어간다', () => {
    const p = deviceArtPlacement({ x: 0, y: 0, ...SKIN_LCD }, NAT, OLD_V1);
    for (const r of [p.hole, ...DEVICE_BUTTONS.map((b) => p.buttons[b])]) {
      expect(r.x).toBeGreaterThanOrEqual(skin.crop.x);
      expect(r.y).toBeGreaterThanOrEqual(skin.crop.y);
      expect(r.x + r.w).toBeLessThanOrEqual(skin.crop.x + skin.crop.w + 0.01);
      expect(r.y + r.h).toBeLessThanOrEqual(skin.crop.y + skin.crop.h + 0.01);
    }
  });
  it('가로 폰·세로 폰(회전 출력): 틀 상자가 화면 안에 다 들어가고, LCD 는 가운데', () => {
    for (const [vw, vh] of [[844, 390], [390, 844], [932, 430], [667, 375]] as const) {
      const f = computeFit(vw, vh, skin.crop);
      expect(skin.crop.w * f.scale).toBeLessThanOrEqual(Math.max(vw, vh) + 0.01);
      expect(skin.crop.h * f.scale).toBeLessThanOrEqual(Math.min(vw, vh) + 0.01);
      const at = skinLcdAt(skin, f.w, f.h);
      expect(Math.abs(at.x + SKIN_LCD.w / 2 - f.w / 2)).toBeLessThan(skin.crop.w * 0.02);
      // 회전해도 LCD 가운데가 화면 가운데
      const c = toLocal(f, vw / 2, vh / 2);
      expect(Math.abs(c.x - f.w / 2)).toBeLessThan(0.5);
      expect(Math.abs(c.y - f.h / 2)).toBeLessThan(0.5);
      expect(fitTransform(f)).toContain(`scale(${f.scale})`);
    }
  });
  it('PC: 화면에 차지하는 크기는 기준 크기 × 배율 그대로, 논리 크기만 커진다', () => {
    const a = computePcFit(1920, 1080, 2, 844, 390);
    const b = computePcFit(1920, 1080, 2, 844, 390, skin.crop);
    expect(b.w * b.scale).toBeCloseTo(a.w * a.scale, 3);
    expect(b.h * b.scale).toBeCloseTo(a.h * a.scale, 3);
    expect(b.ox).toBe(a.ox);
    expect(skin.crop.w * b.scale).toBeLessThanOrEqual(844 * 2 + 0.01);
  });
  it('기본형은 맞춤이 그대로 (틀 없음)', () => {
    expect(computeFit(844, 390)).toEqual(computeFit(844, 390, null));
    expect(computeFit(844, 390).scale).toBe(1);
  });
  it('기기(device.ts)·CSS: 틀이 있으면 CSS 버튼은 숨고 그림 위 버튼이 평소 화면에서도 눌린다', () => {
    expect(src('src/ui/bha/device.ts')).toContain("dev.classList.toggle('is-skin', !!skin)");
    expect(src('src/ui/bha/device.css')).toContain('.bha-dev.is-skin > .bha-dev__side { display: none; }');
    const t = src('src/ui/bha/tamago.ts');
    expect(t).toContain('hb.hidden = !artBox || back;');
    expect(t).toContain('dev.setSkin(deviceSkin(artNat, c.device!))');
    expect(src('src/ui/bha/tamago.css')).toContain('.bha-dev:not(.is-tama) .bha-tama > :not(.bha-tama__art):not(.bha-tama__hit) { display: none; }');
  });
});

describe('3. 키링 중력 = 언제나 실제 아래 (31장 3)', () => {
  it('회전 출력 각도만큼 화면 아래를 돌리면 기기 안에서는 늘 기기 아래(+y)', () => {
    expect(outputAngle(true)).toBe(90);
    expect(rotateVec({ x: 0, y: 1 }, 90)).toEqual({ x: -1, y: 0 });
    expect(defaultGravity(true)).toEqual({ x: 0, y: 1 });
    expect(defaultGravity(false)).toEqual({ x: 0, y: 1 });
    expect(restAngle(defaultGravity(true))).toBeCloseTo(0);
  });
  it('기울기: 세로 고정 폰을 옆으로 눕혀(회전 출력을 똑바로 보는 자세) 들면 센서 중력도 기기 아래', () => {
    // 세로 고정이라 화면 각 0, 폰 왼쪽이 아래 = gamma −90
    const g = toDeviceVec(screenGravity(0, -90, 0), true);
    expect(g.x).toBeCloseTo(0, 3);
    expect(g.y).toBeCloseTo(1, 3);
    // 그 자세에서 조금 기울이면 키링도 그만큼 옆으로 (부호는 화면 방향 그대로)
    const t = toDeviceVec(screenGravity(20, -70, 0), true);
    expect(t.y).toBeGreaterThan(0.5);
    expect(Math.abs(t.x)).toBeGreaterThan(0.1);
  });
  it('화면(tamago.ts)은 기울기를 안 쓸 때 defaultGravity 를 쓴다', () => {
    expect(src('src/ui/bha/tamago.ts')).toContain('defaultGravity(f.rotated)');
  });
});

describe('1. 뒤집기 가볍게 (31장 1)', () => {
  it('실루엣 띠: 불투명 픽셀의 줄별 왼쪽·오른쪽 끝, 빈 줄은 빠진다', () => {
    const w = 10, h = 10;
    const px = new Uint8ClampedArray(w * h * 4);
    // 아래로 갈수록 넓어지는 삼각형 (줄 y 에서 x = 4-y/2 … 5+y/2), 맨 위 두 줄은 비움
    for (let y = 2; y < h; y++) for (let x = 0; x < w; x++) if (x >= 4 - Math.floor(y / 2) && x <= 5 + Math.floor(y / 2)) {
      const i = (y * w + x) * 4;
      px[i] = 200; px[i + 1] = 100; px[i + 2] = 50; px[i + 3] = 255;
    }
    const b = silhouetteBands(px, w, h, 5);
    expect(b.length).toBe(4);
    expect(b[0]!.y0).toBeCloseTo(0.2);
    expect(b[3]!.x0).toBe(0);
    expect(b[3]!.x1).toBe(1);
    expect(b[0]!.x1 - b[0]!.x0).toBeLessThan(b[3]!.x1 - b[3]!.x0);
    expect(b[0]!.rgb).toEqual([200, 100, 50]);
  });
  it('띠 수는 많아야 48줄 (면 2장씩, 큰 그림 겹 없음)', () => {
    expect(SIDE_BANDS).toBeLessThanOrEqual(48);
    const t = src('src/ui/bha/tamago.ts');
    expect(t).not.toMatch(/STACK_LAYERS|stackShade|bha-tama__layer/);
  });
  it('180도에서 크기가 그대로(0도와 같음), 90도에서 줄임 — 뒷면은 몸체 가운데 축으로 돌아 평소 뒷면 자리에 온다', () => {
    const a = tamaLayout(844, 390, null, 0), m = tamaLayout(844, 390, null, 90), z = tamaLayout(844, 390, null, 180);
    expect(scaleOf(z.stage)).toBeCloseTo(scaleOf(a.stage), 4);
    expect(scaleOf(m.stage)).toBeCloseTo(a.zoom * (1 - BODY.flipShrink), 3);
    const bcx = a.body.x + a.body.w / 2;
    expect(a.stage).toContain(`translate(${-bcx}px,`);
  });
  it('도는 동안은 transform 만 바꾼다 (중간에 앞뒷면 다시 배치 없음), LCD 움직임 정지, 작은 사본', () => {
    const t = src('src/ui/bha/tamago.ts');
    const fl = t.slice(t.indexOf('function flip(): void'), t.indexOf('// PC 단축키'));
    expect(fl).toContain('dev.restage(true)');
    expect(fl.slice(fl.indexOf('requestAnimationFrame'))).not.toContain('setFaces();\n        flipDeg');
    const css = src('src/ui/bha/tamago.css');
    expect(css).toContain('animation-play-state: paused !important');
    expect(css).toContain('.bha-dev.is-tama-flipping .bha-tama__back { transform: translateZ(calc(-1 * var(--tama-thick, 0px))) rotateY(180deg)');
    expect(t).toContain('const LITE_TEX = 1024;');
  });
});
