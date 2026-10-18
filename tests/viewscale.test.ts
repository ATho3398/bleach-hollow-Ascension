// PC 화면 크기 고정·2배 보기 (GDD 17-5, R-5, C.36): 순수 계산
import { describe, expect, it } from 'vitest';
import {
  BASE_H, BASE_W, isPcMode, loadViewScale, maxFitScale, parseViewScale, resolveViewScale, saveViewScale, shortcutScale, shrunkNote, VIEW_SCALE_KEY,
} from '../src/ui/viewScale';
import { computeFit, computePcFit, localRect, toLocal } from '../src/ui/bha/viewport';

const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
};

describe('PC 모드 판정', () => {
  it('hover + 정밀 포인터 + 기준 크기 이상 창만 PC', () => {
    expect(isPcMode(true, true, 1280, 800)).toBe(true);
    expect(isPcMode(true, true, 844, 390)).toBe(true);
    expect(isPcMode(false, false, 1280, 800)).toBe(false); // 터치 태블릿
    expect(isPcMode(true, false, 1280, 800)).toBe(false);
    expect(isPcMode(true, true, 800, 600)).toBe(false); // 기준보다 좁은 창은 기존 맞춤
  });
});

describe('배율 계산', () => {
  it('1배는 항상 그대로, 2배는 창이 1688×780 이상이면 그대로', () => {
    expect(resolveViewScale(1, 1280, 800)).toEqual({ scale: 1, shrunk: false });
    expect(resolveViewScale(2, 1920, 1080)).toEqual({ scale: 2, shrunk: false });
    expect(resolveViewScale(2, 1688, 780)).toEqual({ scale: 2, shrunk: false });
  });
  it('창이 2배를 못 담으면 담을 수 있는 최대 배율로 줄이고 문구를 낸다', () => {
    const v = resolveViewScale(2, 1280, 800);
    expect(v.shrunk).toBe(true);
    expect(v.scale).toBeCloseTo(1.51, 2); // 1280/844
    expect(shrunkNote(v, 2)).toContain('창이 작아 1.51배로 표시');
    expect(resolveViewScale(2, 1920, 700).scale).toBeCloseTo(1.79, 2); // 높이가 제한
    expect(shrunkNote({ scale: 2, shrunk: false }, 2)).toBeNull();
  });
  it('최대 배율은 소수 둘째 자리 내림이라 창 밖으로 안 나간다', () => {
    for (const [w, h] of [[1280, 800], [1366, 768], [1500, 700], [1920, 1080]] as const) {
      const s = maxFitScale(w, h);
      expect(BASE_W * s).toBeLessThanOrEqual(w);
      expect(BASE_H * s).toBeLessThanOrEqual(h);
    }
  });
});

describe('선택 저장 (키 bha-view-scale, 세이브 무관)', () => {
  it('기본 1배, 2만 2배로 읽고 나머지·깨진 값은 1배', () => {
    expect(parseViewScale(null)).toBe(1);
    expect(parseViewScale('2')).toBe(2);
    expect(parseViewScale('3')).toBe(1);
    expect(parseViewScale('abc')).toBe(1);
  });
  it('저장·불러오기, 저장소가 없거나 막혀도 죽지 않는다', () => {
    const st = mem();
    saveViewScale(st, 2);
    expect(st.m.get(VIEW_SCALE_KEY)).toBe('2');
    expect(loadViewScale(st)).toBe(2);
    expect(loadViewScale(null)).toBe(1);
    expect(() => saveViewScale({ getItem: () => null, setItem: () => { throw new Error('x'); } }, 2)).not.toThrow();
    expect(() => loadViewScale({ getItem: () => { throw new Error('x'); }, setItem: () => undefined })).not.toThrow();
  });
});

describe('+/- 단축키', () => {
  it('+ / = → 2배, - / _ → 1배, 입력 중·조합키는 무시', () => {
    expect(shortcutScale('+', {}, false)).toBe(2);
    expect(shortcutScale('=', {}, false)).toBe(2);
    expect(shortcutScale('-', {}, false)).toBe(1);
    expect(shortcutScale('+', {}, true)).toBeNull();
    expect(shortcutScale('+', { ctrl: true }, false)).toBeNull();
    expect(shortcutScale('a', {}, false)).toBeNull();
  });
});

describe('PC 고정 모드 좌표', () => {
  it('기기는 창 가운데: 화면 좌표 → 기기 안 좌표는 가운데 여백을 빼고 배율로 나눈다', () => {
    for (const s of [1, 2]) {
      const f = computePcFit(1920, 1080, s, BASE_W, BASE_H);
      expect(f.ox).toBeCloseTo((1920 - BASE_W * s) / 2);
      // 기기 왼쪽 위 / 오른쪽 아래 모서리
      expect(toLocal(f, f.ox!, f.oy!)).toEqual({ x: 0, y: 0 });
      const br = toLocal(f, f.ox! + BASE_W * s, f.oy! + BASE_H * s);
      expect(br.x).toBeCloseTo(BASE_W);
      expect(br.y).toBeCloseTo(BASE_H);
      // 기기 안 (100, 50) 에 놓인 요소의 화면 위치 → 되돌리면 (100, 50)
      const r = localRect(f, { left: f.ox! + 100 * s, top: f.oy! + 50 * s, right: f.ox! + 144 * s, bottom: f.oy! + 94 * s });
      expect(r.left).toBeCloseTo(100);
      expect(r.top).toBeCloseTo(50);
      expect(r.width).toBeCloseTo(44);
    }
  });
  it('기존 맞춤(터치 폰)은 변하지 않는다', () => {
    expect(computeFit(844, 390)).toEqual({ rotated: false, scale: 1, w: 844, h: 390, vw: 844, vh: 390 });
    expect(toLocal(computeFit(390, 844), 390, 0)).toEqual({ x: 0, y: 0 });
  });
});
