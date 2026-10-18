// T-2 (GDD 16장): 가로 LCD 용 튜토리얼 카드 배치와 세로 감지 도우미.
import { afterEach, describe, expect, it } from 'vitest';
import { placeCardBox, type Rect } from '../src/ui/helpLayout';
import { isPortrait, onPortrait, PORTRAIT_QUERY } from '../src/ui/bha/orientation';

// LCD 창 크기(844×390 → 644×358, 740×360 → 540×328)와 전투 화면의 주요 영역 (측정값 근처, 창 좌표)
const LCDS = [
  { width: 644, height: 358, tray: { top: 150, left: 180, width: 444, height: 90 }, stored: { top: 244, left: 180, width: 444, height: 60 }, cast: { top: 100, left: 8, width: 188, height: 42 } },
  { width: 540, height: 328, tray: { top: 146, left: 164, width: 372, height: 98 }, stored: { top: 236, left: 164, width: 372, height: 72 }, cast: { top: 100, left: 8, width: 160, height: 42 } },
];

describe('가로 LCD 카드 배치(placeCardBox)', () => {
  it('어떤 대상에서도 카드는 창 안에 들어온다', () => {
    for (const vp of LCDS) {
      for (const w of [456, 280]) {
        for (const target of [null, vp.tray, vp.stored, vp.cast]) {
          const p = placeCardBox(target, { width: Math.min(w, vp.width - 16), height: 150 }, vp, [vp.tray, vp.stored]);
          expect(p.left).toBeGreaterThanOrEqual(8);
          expect(p.top).toBeGreaterThanOrEqual(8);
          expect(p.left + Math.min(w, vp.width - 16)).toBeLessThanOrEqual(vp.width - 8);
          expect(p.top + 150).toBeLessThanOrEqual(vp.height - 8);
        }
      }
    }
  });

  it('블록 바를 설명할 때는 블록 바를 가리지 않는 자리를 고른다', () => {
    for (const vp of LCDS) {
      const p = placeCardBox(vp.tray, { width: Math.min(456, vp.width - 16), height: 130 }, vp, [vp.tray, vp.stored]);
      const card: Rect = { top: p.top, left: p.left, width: Math.min(456, vp.width - 16), height: 130 };
      const overlap = card.top < vp.tray.top + vp.tray.height && card.top + card.height > vp.tray.top && card.left < vp.tray.left + vp.tray.width && card.left + card.width > vp.tray.left;
      expect(overlap).toBe(false);
    }
  });

  it('왼쪽 열의 대상(강공격 예고)은 좁은 카드가 오른쪽 옆에 놓여 대상을 가리지 않는다', () => {
    for (const vp of LCDS) {
      const p = placeCardBox(vp.cast, { width: 280, height: 150 }, vp, [vp.tray, vp.stored]);
      expect(p.left).toBeGreaterThanOrEqual(vp.cast.left + vp.cast.width);
      expect(p.top + 150).toBeLessThanOrEqual(vp.height - 8);
    }
  });

  it('대상이 없으면 가운데', () => {
    const vp = LCDS[0]!;
    expect(placeCardBox(null, { width: 456, height: 120 }, vp).side).toBe('center');
  });
});

describe('세로 감지 도우미', () => {
  const saved = (globalThis as { window?: unknown }).window;
  afterEach(() => {
    (globalThis as { window?: unknown }).window = saved;
  });

  it('window 가 없으면 세로가 아니다 (테스트·서버)', () => {
    (globalThis as { window?: unknown }).window = undefined;
    expect(isPortrait()).toBe(false);
  });

  it('matchMedia 결과를 따르고, 세로로 바뀔 때만 알리며 alive 가 false 면 풀린다', () => {
    let matches = false;
    const handlers = new Set<() => void>();
    (globalThis as { window?: unknown }).window = {
      matchMedia: (q: string) => {
        expect(q).toBe(PORTRAIT_QUERY);
        return {
          get matches() {
            return matches;
          },
          addEventListener: (_: string, h: () => void) => handlers.add(h),
          removeEventListener: (_: string, h: () => void) => handlers.delete(h),
        };
      },
    };
    expect(isPortrait()).toBe(false);
    let alive = true;
    let calls = 0;
    onPortrait(() => calls++, () => alive);
    handlers.forEach((h) => h()); // 가로 상태의 change: 알리지 않는다
    expect(calls).toBe(0);
    matches = true;
    expect(isPortrait()).toBe(true);
    handlers.forEach((h) => h());
    expect(calls).toBe(1);
    alive = false;
    handlers.forEach((h) => h()); // 화면이 사라졌다: 알리지 않고 풀린다
    expect(calls).toBe(1);
    expect(handlers.size).toBe(0);
  });
});
