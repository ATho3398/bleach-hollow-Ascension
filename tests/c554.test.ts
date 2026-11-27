// C.554 모든 기기 같은 화면비·같은 버튼 자리 (GDD 14-2): 기기 틀 전체(844×390)를 한 배율로만 키우거나 줄여 화면 가운데에 둔다.
// 여러 화면 크기에서 배율 = min(가로 ÷ 844, 세로 ÷ 390), 여백이 위아래 또는 좌우로 같고, LCD 화면비와 버튼의 상대 위치가 같다.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FRAME_V2, FRAME_V2_BUTTONS } from '../src/data/shop/frameV2';
import { deviceSkinV2, skinLcdAt } from '../src/ui/bha/tamagoLogic';
import { computeFit, computePcFit, fitTransform, toLocal, type Fit } from '../src/ui/bha/viewport';
import { BASE_H, BASE_W, resolveViewScale } from '../src/ui/viewScale';

const src = (p: string) => readFileSync(p, 'utf8');

/** 기기 안 좌표 → 화면 좌표 (fitTransform 의 순서: 축소 → 회전 → 여백 자리로 이동) */
function toScreen(f: Fit, x: number, y: number): { x: number; y: number } {
  const ox = f.ox ?? 0, oy = f.oy ?? 0;
  const sx = x * f.scale, sy = y * f.scale;
  return f.rotated ? { x: f.vw - oy - sy, y: ox + sx } : { x: ox + sx, y: oy + sy };
}

/** 화면에서 기기가 차지하는 사각형 (돌렸으면 화면 기준 가로·세로가 바뀐다) */
function screenBox(f: Fit): { left: number; top: number; width: number; height: number } {
  const a = toScreen(f, 0, 0), b = toScreen(f, f.w, f.h);
  return { left: Math.min(a.x, b.x), top: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
}

/** 기기 버튼(기본형 자리) 가운데의 기기 안 상대 위치 (0~1, 기기 기준 방향) */
function buttonRel(f: Fit, b: (typeof FRAME_V2_BUTTONS)[number]): { u: number; v: number } {
  const r = FRAME_V2.buttons[b];
  const lx = FRAME_V2.basic.lcdX + r.x + r.w / 2, ly = FRAME_V2.basic.lcdY + r.y + r.h / 2;
  const p = toScreen(f, lx, ly);
  const box = screenBox(f);
  // 화면 위치 → 기기 기준 상대 위치 (돌렸으면 기기 가로 = 화면 세로)
  return f.rotated ? { u: (p.y - box.top) / box.height, v: (box.left + box.width - p.x) / box.width } : { u: (p.x - box.left) / box.width, v: (p.y - box.top) / box.height };
}

const SIZES = [
  { name: '폰 가로 19.5:9', vw: 844, vh: 390 },
  { name: '폰 가로 20:9', vw: 915, vh: 412 },
  { name: '태블릿 4:3', vw: 1024, vh: 768 },
  { name: '폰 세로', vw: 390, vh: 844 },
  { name: '작은 폰 16:9', vw: 667, vh: 375 },
  { name: '태블릿 세로', vw: 768, vh: 1024 },
  { name: '접는 폰 거의 정사각', vw: 884, vh: 832 },
] as const;

describe('C.554 터치 기기 맞춤 = 기준 크기 한 배율', () => {
  for (const s of SIZES) {
    it(`${s.name} ${s.vw}×${s.vh}: 배율·여백·화면비`, () => {
      const f = computeFit(s.vw, s.vh);
      const long = Math.max(s.vw, s.vh), short = Math.min(s.vw, s.vh);
      expect(f.rotated).toBe(s.vh > s.vw);
      expect([f.w, f.h]).toEqual([BASE_W, BASE_H]);
      expect(f.scale).toBeCloseTo(Math.min(long / BASE_W, short / BASE_H), 9);
      const box = screenBox(f);
      // 화면 안에 다 들어가고, 가운데(여백이 양쪽 같다)
      expect(box.left).toBeGreaterThanOrEqual(-1e-6);
      expect(box.top).toBeGreaterThanOrEqual(-1e-6);
      expect(box.left + box.width).toBeLessThanOrEqual(s.vw + 1e-6);
      expect(box.top + box.height).toBeLessThanOrEqual(s.vh + 1e-6);
      expect(box.left).toBeCloseTo(s.vw - box.left - box.width, 6);
      expect(box.top).toBeCloseTo(s.vh - box.top - box.height, 6);
      // 한쪽 축은 꽉 찬다 (여백은 위아래 또는 좌우 중 한쪽만)
      expect(Math.min(box.left, box.top)).toBeCloseTo(0, 6);
      // 화면비는 늘 844:390
      const ratio = f.rotated ? box.height / box.width : box.width / box.height;
      expect(ratio).toBeCloseTo(BASE_W / BASE_H, 6);
      // 화면 가운데 = 기기 가운데
      const c = toLocal(f, s.vw / 2, s.vh / 2);
      expect(c.x).toBeCloseTo(BASE_W / 2, 6);
      expect(c.y).toBeCloseTo(BASE_H / 2, 6);
    });
  }

  it('버튼 ▲▼✓◀ 의 상대 위치가 모든 화면 크기에서 같다', () => {
    const ref = computeFit(844, 390);
    for (const s of SIZES) {
      const f = computeFit(s.vw, s.vh);
      for (const b of FRAME_V2_BUTTONS) {
        const a = buttonRel(ref, b), r = buttonRel(f, b);
        expect(r.u).toBeCloseTo(a.u, 6);
        expect(r.v).toBeCloseTo(a.v, 6);
      }
    }
  });

  it('누름 좌표 변환: 버튼 가운데 화면 좌표 → 기기 안 좌표가 원래 자리로 돌아온다 (회전·배율·여백)', () => {
    for (const s of SIZES) {
      const f = computeFit(s.vw, s.vh);
      for (const b of FRAME_V2_BUTTONS) {
        const r = FRAME_V2.buttons[b];
        const lx = FRAME_V2.basic.lcdX + r.x + r.w / 2, ly = FRAME_V2.basic.lcdY + r.y + r.h / 2;
        const p = toScreen(f, lx, ly);
        const back = toLocal(f, p.x, p.y);
        expect(back.x).toBeCloseTo(lx, 6);
        expect(back.y).toBeCloseTo(ly, 6);
      }
    }
  });

  it('fitTransform 은 여백 자리로 옮긴다 (가로 = 좌우 여백, 세로 회전 = 돌린 뒤 위아래 여백)', () => {
    const t = computeFit(1024, 768);
    expect(t.ox).toBe(0);
    expect(fitTransform(t)).toBe(`translate(0px, ${t.oy}px) scale(${t.scale})`);
    const wide = computeFit(915, 412);
    expect(wide.oy).toBe(0);
    expect(wide.ox!).toBeGreaterThan(0);
    const rot = computeFit(390, 844);
    expect(fitTransform(rot)).toBe('translate(390px, 0px) rotate(90deg) scale(1)');
  });

  it('안전 영역(노치·홈 바)은 배율에서 빼고 그 안 가운데 — 세로 폰은 돌린 뒤 기준', () => {
    // 세로 폰: 화면 위 노치 47 = 기기 왼쪽, 화면 아래 홈 바 34 = 기기 오른쪽
    const f = computeFit(390, 844, null, { top: 47, right: 0, bottom: 34, left: 0 });
    expect(f.scale).toBeCloseTo(Math.min((844 - 81) / BASE_W, 390 / BASE_H), 9);
    const box = screenBox(f);
    expect(box.top).toBeGreaterThanOrEqual(47 - 1e-6);
    expect(box.top + box.height).toBeLessThanOrEqual(844 - 34 + 1e-6);
    expect(box.top - 47).toBeCloseTo(844 - 34 - box.top - box.height, 6);
  });
});

describe('C.554 그림 기기·PC 도 같은 화면비', () => {
  it('frame-v2 그림 기기: 기본형과 같은 배율·자리, LCD (99, 15)', () => {
    const skin = deviceSkinV2();
    for (const s of SIZES) {
      const a = computeFit(s.vw, s.vh);
      const b = computeFit(s.vw, s.vh, skin.crop);
      expect(b).toEqual(a);
      expect(skinLcdAt(skin, b.w, b.h)).toEqual({ x: 99, y: 15 });
    }
  });
  it('틀 상자가 기준보다 큰 그림 기기(옛 규격)는 논리 크기만 같은 비율로 늘리고 화면에 차지하는 크기는 같다', () => {
    const crop = { x: -150, y: -40, w: 1100, h: 450 };
    for (const s of SIZES) {
      const a = computeFit(s.vw, s.vh);
      const b = computeFit(s.vw, s.vh, crop);
      expect(b.w / b.h).toBeCloseTo(BASE_W / BASE_H, 9);
      expect(b.w * b.scale).toBeCloseTo(a.w * a.scale, 6);
      expect(b.h * b.scale).toBeCloseTo(a.h * a.scale, 6);
      expect(crop.w).toBeLessThanOrEqual(b.w + 1e-6);
      expect(crop.h).toBeLessThanOrEqual(b.h + 1e-6);
    }
  });
  it('PC 1366×768: 설정 1배 그대로 가운데, 화면비 844:390 (2배는 창이 작아 자동 축소)', () => {
    const v1 = resolveViewScale(1, 1366, 768);
    const f = computePcFit(1366, 768, v1.scale, BASE_W, BASE_H);
    expect(f.scale).toBe(1);
    expect(f.ox).toBe((1366 - 844) / 2);
    expect(f.oy).toBe((768 - 390) / 2);
    const v2 = resolveViewScale(2, 1366, 768);
    expect(v2.shrunk).toBe(true);
    expect(v2.scale).toBeLessThan(2);
    const g = computePcFit(1366, 768, v2.scale, BASE_W, BASE_H);
    expect(g.w * g.scale + 2 * g.ox!).toBeCloseTo(1366, 6);
  });
});

describe('C.554 기기 코드·CSS', () => {
  const dev = src('src/ui/bha/device.ts');
  const css = src('src/ui/bha/device.css');
  it('터치 맞춤에 안전 영역을 넘기고, 기기 안 여백(--dev-inset-*)·좁은 폰 분기는 없다', () => {
    expect(dev).toContain('computeFit(vp.w, vp.h, crop, safe)');
    expect(dev).not.toContain('--dev-inset-');
    expect(dev).not.toContain('is-narrow');
    expect(css).not.toContain('--dev-inset-');
  });
  it('남는 여백 = 기존 바깥 어두운 배경 토큰, 모든 기기 (PC 전용 아님)', () => {
    expect(css).toContain('html, body { background: var(--bha-bg-0); }');
    expect(css).not.toContain('html.bha-pc, html.bha-pc body');
  });
  it('기획서 14-2 줄', () => {
    expect(src('docs/GDD.md')).toContain('모든 기기 같은 화면비·같은 버튼 자리');
  });
});
