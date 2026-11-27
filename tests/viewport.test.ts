// 세로 폰에서 기기를 돌려 출력하는 계산 (GDD 14-2): 논리 크기·한 배율 맞춤(C.554)·화면 좌표 ↔ 기기 안 좌표
import { describe, expect, it } from 'vitest';
import { computeFit, fitTransform, localRect, pickViewport, rotateInsets, toLocal } from '../src/ui/bha/viewport';

describe('computeFit', () => {
  it('가로 폰은 회전 없이 뷰포트 그대로', () => {
    expect(computeFit(844, 390)).toEqual({ rotated: false, scale: 1, w: 844, h: 390, vw: 844, vh: 390, ox: 0, oy: 0 });
  });
  it('세로 폰은 돌려서 논리 크기 = (높이 × 너비)', () => {
    const f = computeFit(390, 844);
    expect(f.rotated).toBe(true);
    expect(f.scale).toBe(1);
    expect([f.w, f.h]).toEqual([844, 390]);
  });
  it('작은 화면은 논리 크기 844×390 그대로 한 배율로 줄인다 (C.554)', () => {
    const f = computeFit(360, 640);
    expect(f.rotated).toBe(true);
    expect(f.scale).toBeCloseTo(Math.min(640 / 844, 360 / 390), 6);
    expect([f.w, f.h]).toEqual([844, 390]);
    expect(f.w * f.scale).toBeCloseTo(640, 6);
  });
  it('정사각형 뷰포트는 회전하지 않는다', () => {
    expect(computeFit(800, 800).rotated).toBe(false);
  });
});

describe('좌표 변환', () => {
  const rot = computeFit(390, 844); // 세로 폰
  it('가로 폰: 화면 좌표 = 기기 안 좌표', () => {
    const f = computeFit(844, 390);
    expect(toLocal(f, 100, 50)).toEqual({ x: 100, y: 50 });
  });
  it('세로 폰: 기기의 위쪽이 화면 오른쪽, 기기의 왼쪽이 화면 위쪽', () => {
    // 기기 왼쪽 위(0,0)는 화면 오른쪽 위(390,0)
    expect(toLocal(rot, 390, 0)).toEqual({ x: 0, y: 0 });
    // 기기 오른쪽 위(844,0)는 화면 오른쪽 아래(390,844)
    expect(toLocal(rot, 390, 844)).toEqual({ x: 844, y: 0 });
    // 기기 왼쪽 아래(0,390)는 화면 왼쪽 위(0,0)
    expect(toLocal(rot, 0, 0)).toEqual({ x: 0, y: 390 });
  });
  it('기기 안 한 점을 transform 으로 화면에 옮겼다가 되돌리면 같은 점이다', () => {
    for (const f of [computeFit(390, 844), computeFit(360, 640), computeFit(844, 390), computeFit(667, 375)]) {
      for (const p of [{ x: 10, y: 20 }, { x: 300, y: 100 }, { x: f.w - 1, y: f.h - 1 }]) {
        const sx = p.x * f.scale;
        const sy = p.y * f.scale;
        const ox = f.ox ?? 0, oy = f.oy ?? 0;
        const screen = f.rotated ? { x: f.vw - oy - sy, y: ox + sx } : { x: ox + sx, y: oy + sy }; // fitTransform 의 순서(축소 → 회전 → 이동)
        const back = toLocal(f, screen.x, screen.y);
        expect(back.x).toBeCloseTo(p.x, 6);
        expect(back.y).toBeCloseTo(p.y, 6);
      }
    }
  });
  it('localRect: 회전해도 가로·세로가 기기 기준으로 돌아온다', () => {
    // 기기 안 (100,50) 크기 200×40 사각형 → 화면에서는 세로로 선 40×200
    const f = computeFit(390, 844);
    const screen = { left: f.vw - 90, top: 100, right: f.vw - 50, bottom: 300 };
    expect(localRect(f, screen)).toEqual({ left: 100, top: 50, width: 200, height: 40 });
  });
  it('fitTransform 문자열', () => {
    expect(fitTransform(computeFit(844, 390))).toBe('translate(0px, 0px) scale(1)');
    expect(fitTransform(computeFit(390, 844))).toBe('translate(390px, 0px) rotate(90deg) scale(1)');
  });
});

describe('안전 영역·뷰포트 측정', () => {
  const ins = { top: 20, right: 47, bottom: 34, left: 10 };
  it('가로 폰은 그대로', () => {
    expect(rotateInsets(false, ins)).toEqual(ins);
  });
  it('세로 폰은 돌린 기기의 위·오른쪽·아래·왼쪽으로 바뀐다', () => {
    // 화면 위(노치) → 기기 왼쪽, 화면 오른쪽 → 기기 위, 화면 아래(홈 막대) → 기기 오른쪽, 화면 왼쪽 → 기기 아래
    expect(rotateInsets(true, ins)).toEqual({ top: 47, right: 34, bottom: 10, left: 20 });
  });
  it('안전 영역은 배율 계산에서 빼고 그 안 가운데에 놓는다 (C.554)', () => {
    const f = computeFit(932, 430, null, { top: 0, right: 59, bottom: 21, left: 59 });
    expect(f.scale).toBeCloseTo(Math.min((932 - 118) / 844, (430 - 21) / 390), 6);
    expect(f.ox! + 844 * f.scale).toBeLessThanOrEqual(932 - 59 + 1e-6);
    expect(f.ox!).toBeGreaterThanOrEqual(59 - 1e-6);
    expect(f.oy! + 390 * f.scale).toBeLessThanOrEqual(430 - 21 + 1e-6);
  });
  it('프로브가 있으면 프로브 크기, 없거나 0 이면 window 크기', () => {
    const win = { innerWidth: 390, innerHeight: 844 };
    expect(pickViewport({ width: 390, height: 760 }, win)).toEqual({ w: 390, h: 760 });
    expect(pickViewport(null, win)).toEqual({ w: 390, h: 844 });
    expect(pickViewport({ width: 0, height: 0 }, win)).toEqual({ w: 390, h: 844 });
  });
});
