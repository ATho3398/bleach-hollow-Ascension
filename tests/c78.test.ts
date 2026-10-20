// C.78 (S-21, GDD 33-2): frame-v2 = UI 묶음(구멍 + 버튼 4개)만 고정, 그림 크기·모양·구멍 위치 자유
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COSMETIC_ITEMS, DEVICE_BUTTONS, getCosmetic, deviceArt, shopVisible } from '../src/data/shop';
import { FRAME_V2, FRAME_V2_BUTTONS } from '../src/data/shop/frameV2';
import { deviceArtPlacementV2, deviceSkinV2, skinLcdAt, tamaLayout } from '../src/ui/bha/tamagoLogic';
import { computeFit, computePcFit, toLocal } from '../src/ui/bha/viewport';
import { PATCH_LABEL, STAGE_LABEL } from '../src/version';

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const has = (p: string) => existsSync(new URL(`../${p}`, import.meta.url));
const preset = JSON.parse(src('docs/design/device-preset/frame-v2/preset.json'));
const BASIC = { lcd: { x: 99, y: 15, w: 646, h: 360 }, up: { x: 20, y: 135, w: 52, h: 52 }, down: { x: 20, y: 203, w: 52, h: 52 }, ok: { x: 766, y: 133, w: 64, h: 64 }, back: { x: 776, y: 213, w: 44, h: 44 } };
const pngSize = (p: string) => { const b = readFileSync(new URL(`../${p}`, import.meta.url)); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }; };

describe('버전 (C.78)', () => {
  it('패치 번호는 C.78 이상, 단계 형식', () => {
    expect(Number(PATCH_LABEL.slice(2))).toBeGreaterThanOrEqual(78);
    expect(STAGE_LABEL).toMatch(/^[A-Z]+-\d+[a-z]?$/);
  });
});

describe('1·3. 고정 = UI 묶음, 덮을 곳 = 구멍 테두리·버튼', () => {
  it('preset.json = 게임 코드 상수 (구멍 ×3 = 1938×1080, 버튼 상대 위치, 덮을 폭 72)', () => {
    expect(preset.preset).toBe('frame-v2');
    expect(preset.base.hole).toEqual({ w: FRAME_V2.hole.w, h: FRAME_V2.hole.h, radius: FRAME_V2.hole.radius });
    expect(preset.base.buttons).toEqual(FRAME_V2.buttons);
    expect(preset.base.bundle).toEqual(FRAME_V2.bundle);
    expect(preset.scale).toBe(3);
    expect(preset.x3.hole).toMatchObject({ w: 1938, h: 1080 });
    expect(preset.x3.cover).toBe(72);
    for (const b of FRAME_V2_BUTTONS) {
      const r = FRAME_V2.buttons[b];
      expect(preset.x3.buttons[b]).toMatchObject({ dx: (r.x + r.w / 2) * 3, dy: (r.y + r.h / 2) * 3, touchR: (r.w * 3) / 2 });
    }
    expect(preset.free.join(' ')).toContain('그림 크기');
    expect(JSON.stringify(preset)).not.toContain('2688');
  });
  it('묶음 사각형 = 구멍 + 버튼 4개를 다 포함하는 최소 사각형', () => {
    const rs = [{ x: 0, y: 0, w: FRAME_V2.hole.w, h: FRAME_V2.hole.h }, ...FRAME_V2_BUTTONS.map((b) => FRAME_V2.buttons[b])];
    const x0 = Math.min(...rs.map((r) => r.x)), y0 = Math.min(...rs.map((r) => r.y));
    const x1 = Math.max(...rs.map((r) => r.x + r.w)), y1 = Math.max(...rs.map((r) => r.y + r.h));
    expect(FRAME_V2.bundle).toEqual({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
  });
  it('안내 파일: README·스티커 layout-guide·검사기·예시 모양·art-guide·프롬프트', () => {
    for (const f of ['README.md', 'layout-guide.png', 'check-device.py', 'preset.json', 'example-round.png', 'example-heart.png', 'example-wide.png']) expect(has(`docs/design/device-preset/frame-v2/${f}`)).toBe(true);
    expect(pngSize('docs/design/device-preset/frame-v2/layout-guide.png')).toEqual({ w: 810 * 3, h: 360 * 3 }); // UI 묶음 스티커 = 실제 ×3 크기
    const py = src('docs/design/device-preset/frame-v2/check-device.py');
    expect(py).toContain('--hole');
    expect(py).toContain('px 더 큼');
    expect(src('docs/art-guide.md')).toContain('UI 묶음');
    expect(src('docs/design/claude-design-prompts.md')).toContain('UI 묶음');
    expect(src('docs/design/device-preset/frame-v2/README.md')).toContain('스티커');
  });
});

describe('2. 자유: 그림 크기·모양·구멍 위치는 그림마다', () => {
  const a = getCosmetic('device-vtest')!;
  const b = getCosmetic('device-vround')!;
  it('데이터: frame v2 + hole [x,y] + 고리(%), 화면·버튼 크기는 쓰지 않음, 시험 그림 2종 크기·모양이 서로 다름', () => {
    expect(a.device!.frame).toBe('v2');
    expect(a.device!.hole).toEqual([375, 123]);
    expect(b.device!.hole).toEqual([831, 900]);
    const sa = pngSize('public/art/device-vtest-front.png'), sb = pngSize('public/art/device-vround-front.png');
    expect(sa).toEqual({ w: 2688, h: 1326 });
    expect(sb).toEqual({ w: 3600, h: 3600 }); // 상한(약 4000) 안, 정사각형 — 직사각형 규격 아님
    expect(Math.max(sb.w, sb.h)).toBeLessThanOrEqual(FRAME_V2.maxSide);
    for (const c of [a, b]) {
      expect(deviceArt(c, [`device-${c.look}-front.png`])).not.toBeNull();
      expect(shopVisible(c, [], [`device-${c.look}-front.png`])).toBe(false);
      expect(has(`public/art/device-${c.look}-back.png`)).toBe(true);
    }
    expect(getCosmetic('device-badge')!.device!.frame).toBe('v2'); // 사신대행증 = 새 그림(C.84)부터 v2
    expect(COSMETIC_ITEMS.filter((c) => c.device?.frame === 'v2')).toHaveLength(3);
  });
  it('데이터 검증: v2 는 hole 이 없거나 음수면 오류', async () => {
    const mod = await import('../src/data/shop');
    expect(mod.COSMETIC_ITEMS.length).toBeGreaterThan(0);
    const raw = JSON.parse(src('src/data/shop/items.json'));
    for (const d of raw.devices.filter((x: { frame?: string }) => x.frame === 'v2')) {
      expect(d.screen).toBeUndefined();
      expect(d.buttons).toBeUndefined();
      expect(Array.isArray(d.hole) && d.hole.length === 2).toBe(true);
    }
  });
});

describe('4. 게임: 평소 화면 = UI 묶음이 기본 UI 와 같은 크기·자리, 다마고치 모드 = 그림 전체 모양', () => {
  const lcd = BASIC.lcd;
  it('구멍 = LCD 자리에 오고, 버튼 4개 = 기본형 버튼 사각형 — 그림 크기·구멍 위치와 상관없이 (두 시험 기기)', () => {
    for (const [id, nat] of [['device-vtest', { w: 2688, h: 1326 }], ['device-vround', { w: 3600, h: 3600 }]] as const) {
      const c = getCosmetic(id)!;
      const p = deviceArtPlacementV2(lcd, nat, { hole: c.device!.hole!, ring: c.device!.ring });
      expect(p.hole).toEqual(lcd);
      for (const bt of DEVICE_BUTTONS) expect(p.buttons[bt]).toEqual(BASIC[bt]);
      // 그림 1px = 논리 1/3: 구멍 왼쪽 위 그림 픽셀이 LCD 왼쪽 위에
      expect(p.box.w).toBeCloseTo(nat.w / 3, 1);
      expect(p.box.h).toBeCloseTo(nat.h / 3, 1);
      expect(p.box.x + c.device!.hole![0] / 3).toBeCloseTo(lcd.x, 1);
      expect(p.box.y + c.device!.hole![1] / 3).toBeCloseTo(lcd.y, 1);
    }
  });
  it('틀 상자 = 기본형 기기 전체: 844×390 에서 배율 1·LCD (99, 15), 세로 출력·PC 도 같다', () => {
    const skin = deviceSkinV2();
    expect(skin.lcd).toEqual({ w: 646, h: 360 });
    expect(skin.crop).toEqual({ x: -99, y: -15, w: 844, h: 390 });
    for (const [vw, vh] of [[844, 390], [390, 844]] as const) {
      const f = computeFit(vw, vh, skin.crop);
      expect(f.scale).toBe(1);
      expect(skinLcdAt(skin, f.w, f.h)).toEqual({ x: 99, y: 15 });
      expect(toLocal(f, vw / 2, vh / 2)).toEqual({ x: 422, y: 195 });
    }
    const pc = computePcFit(1688, 780, 1, 844, 390, skin.crop);
    expect(pc.scale).toBe(1);
    expect(skinLcdAt(skin, pc.w, pc.h)).toEqual({ x: 99, y: 15 });
  });
  it('다마고치 모드: 몸체 = 그림 전체 상자(모양대로), 줌은 그림이 클수록 작아져 기기 전체가 보인다', () => {
    const small = deviceArtPlacementV2(BASIC.lcd, { w: 2688, h: 1326 }, { hole: [375, 123], ring: { x: 6.7, y: 4.52 } });
    const big = deviceArtPlacementV2(BASIC.lcd, { w: 3600, h: 3600 }, { hole: [831, 900], ring: { x: 50, y: 4.17 } });
    const ls = tamaLayout(844, 390, { box: small.box, ring: small.ring });
    const lb = tamaLayout(844, 390, { box: big.box, ring: big.ring });
    expect(ls.body).toEqual(small.box);
    expect(lb.body).toEqual(big.box);
    expect(lb.zoom).toBeLessThan(ls.zoom);
    expect(lb.box.w * lb.zoom).toBeLessThanOrEqual(844 + 0.01);
    expect(lb.box.h * lb.zoom).toBeLessThanOrEqual(390 + 0.01);
  });
  it('코드: v2 는 틀 상자·놓는 자리를 v2 전용 함수로, 평소 화면은 바깥을 자름, v1 은 그대로', () => {
    const t = src('src/ui/bha/tamago.ts');
    expect(t).toContain("artSpec.frame === 'v2' && artSpec.hole ? deviceArtPlacementV2");
    expect(t).toContain("if (c.device!.frame === 'v2') dev.setSkin(deviceSkinV2())");
    expect(src('src/ui/bha/device.css')).toContain('.bha-dev.is-frame-v2:not(.is-tama) { overflow: hidden; }');
  });
});
