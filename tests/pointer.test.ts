// 블록 바 포인터 판정 (GDD 3-5 v0.8): 짧게 눌러 뗌 = 사용, 길게 누름 = 무사용, 이동 임계치 = 드래그
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { classifyRelease, POINTER_RULES, releaseInput, slotAt } from '../src/ui/pointer';

const R = BALANCE.provisional.input;

describe('클릭 / 길게 누름 / 드래그 판정', () => {
  it('임시값: 0.3초, 10px', () => {
    expect(POINTER_RULES).toEqual({ clickMaxSeconds: 0.3, dragThresholdPx: 10 });
  });

  it('제자리에서 0.3초 이내에 떼면 사용', () => {
    expect(classifyRelease(0, 0)).toBe('use');
    expect(classifyRelease(120, 3)).toBe('use');
    expect(classifyRelease(R.clickMaxSeconds * 1000, 0)).toBe('use'); // 경계는 사용
  });

  it('0.3초를 넘겨 누르고 있었으면 사용 안 됨 (들었다 놓은 것)', () => {
    expect(classifyRelease(R.clickMaxSeconds * 1000 + 1, 0)).toBe('hold');
    expect(classifyRelease(2000, 4)).toBe('hold');
  });

  it('10px 이상 움직이면 시간과 무관하게 드래그', () => {
    expect(classifyRelease(50, R.dragThresholdPx)).toBe('drag');
    expect(classifyRelease(50, R.dragThresholdPx - 0.1)).toBe('use');
    expect(classifyRelease(5000, 40)).toBe('drag');
    expect(classifyRelease(5000, R.dragThresholdPx - 1)).toBe('hold');
  });

  it('규칙은 인자로 바꿀 수 있다', () => {
    expect(classifyRelease(500, 0, { clickMaxSeconds: 1, dragThresholdPx: 10 })).toBe('use');
  });
});

describe('놓은 칸 → 엔진 입력', () => {
  it('칸 폭은 바 폭 / 8, 바 밖은 양 끝 칸으로 자른다', () => {
    expect(slotAt(100, 100, 800, 8)).toBe(0);
    expect(slotAt(199, 100, 800, 8)).toBe(0);
    expect(slotAt(200, 100, 800, 8)).toBe(1);
    expect(slotAt(899, 100, 800, 8)).toBe(7);
    expect(slotAt(-50, 100, 800, 8)).toBe(0);
    expect(slotAt(5000, 100, 800, 8)).toBe(7);
  });

  it('use 는 누른 블록 번호, hold 는 입력 없음', () => {
    expect(releaseInput('use', 3, 3, 5)).toEqual({ type: 'use', cell: 3 });
    expect(releaseInput('hold', 3, 6, 5)).toBeNull();
  });

  it('drag 는 놓은 칸에 끼워 넣는 move, 같은 칸이면 입력 없음, 블록 수를 넘으면 맨 오른쪽 블록 자리', () => {
    expect(releaseInput('drag', 0, 3, 5)).toEqual({ type: 'move', from: 0, to: 3 });
    expect(releaseInput('drag', 4, 1, 5)).toEqual({ type: 'move', from: 4, to: 1 });
    expect(releaseInput('drag', 2, 2, 5)).toBeNull();
    expect(releaseInput('drag', 1, 7, 5)).toEqual({ type: 'move', from: 1, to: 4 });
    expect(releaseInput('drag', 4, 7, 5)).toBeNull();
  });
});

// ── C.18: 설정값 반영 판정, 저장/복원, 범위 클램프 ──
import {
  clampPointerRules, DEFAULT_POINTER_RULES, loadPointerRules, POINTER_RANGES, POINTER_SETTINGS_KEY, resetPointerRules, savePointerRules,
} from '../src/ui/pointer';

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), raw: m };
};

describe('설정값을 받는 포인터 판정 (C.18)', () => {
  it('클릭 판정 시간 설정이 반영된다 (0.15초 / 0.6초)', () => {
    const fast = { clickMaxSeconds: 0.15, dragThresholdPx: 10 };
    const slow = { clickMaxSeconds: 0.6, dragThresholdPx: 10 };
    expect(classifyRelease(200, 0, fast)).toBe('hold');
    expect(classifyRelease(200, 0, slow)).toBe('use');
    expect(classifyRelease(600, 0, slow)).toBe('use');
    expect(classifyRelease(601, 0, slow)).toBe('hold');
    expect(classifyRelease(150, 0, fast)).toBe('use');
  });

  it('드래그 임계치 설정이 반영된다 (6px / 20px)', () => {
    const tight = { clickMaxSeconds: 0.3, dragThresholdPx: 6 };
    const loose = { clickMaxSeconds: 0.3, dragThresholdPx: 20 };
    expect(classifyRelease(100, 8, tight)).toBe('drag');
    expect(classifyRelease(100, 8, loose)).toBe('use');
    expect(classifyRelease(100, 20, loose)).toBe('drag');
  });
});

describe('설정 저장·복원·범위 (C.18)', () => {
  it('범위: 클릭 0.15~0.6초, 드래그 6~20px, 기본 0.3초·10px', () => {
    expect(POINTER_RANGES.clickMaxSeconds).toEqual([0.15, 0.6]);
    expect(POINTER_RANGES.dragThresholdPx).toEqual([6, 20]);
    expect(DEFAULT_POINTER_RULES).toEqual({ clickMaxSeconds: 0.3, dragThresholdPx: 10 });
  });

  it('범위 밖 값은 자르고, 숫자가 아니면 기본값', () => {
    expect(clampPointerRules({ clickMaxSeconds: 0.01, dragThresholdPx: 99 })).toEqual({ clickMaxSeconds: 0.15, dragThresholdPx: 20 });
    expect(clampPointerRules({ clickMaxSeconds: 5, dragThresholdPx: 1 })).toEqual({ clickMaxSeconds: 0.6, dragThresholdPx: 6 });
    expect(clampPointerRules({ clickMaxSeconds: 'x', dragThresholdPx: NaN })).toEqual(DEFAULT_POINTER_RULES);
    expect(clampPointerRules({})).toEqual(DEFAULT_POINTER_RULES);
  });

  it('저장하면 다시 읽을 때 같은 값, 저장 키는 세이브와 별개', () => {
    const st = memory();
    expect(loadPointerRules(st)).toEqual(DEFAULT_POINTER_RULES);
    expect(savePointerRules(st, { clickMaxSeconds: 0.45, dragThresholdPx: 14 })).toEqual({ clickMaxSeconds: 0.45, dragThresholdPx: 14 });
    expect(loadPointerRules(st)).toEqual({ clickMaxSeconds: 0.45, dragThresholdPx: 14 });
    expect([...st.raw.keys()]).toEqual([POINTER_SETTINGS_KEY]);
  });

  it('저장하려는 값도 범위로 자른다', () => {
    const st = memory();
    expect(savePointerRules(st, { clickMaxSeconds: 9 })).toEqual({ clickMaxSeconds: 0.6, dragThresholdPx: 10 });
    expect(loadPointerRules(st).clickMaxSeconds).toBe(0.6);
  });

  it('기본값 복원 버튼 = 저장된 설정을 지운다', () => {
    const st = memory();
    savePointerRules(st, { clickMaxSeconds: 0.5, dragThresholdPx: 18 });
    expect(resetPointerRules(st)).toEqual(DEFAULT_POINTER_RULES);
    expect(loadPointerRules(st)).toEqual(DEFAULT_POINTER_RULES);
    expect(st.raw.size).toBe(0);
  });

  it('깨진 JSON·저장소 오류·저장소 없음이어도 기본값으로 동작한다', () => {
    const bad = memory();
    bad.setItem(POINTER_SETTINGS_KEY, '{oops');
    expect(loadPointerRules(bad)).toEqual(DEFAULT_POINTER_RULES);
    const throwing = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(loadPointerRules(throwing)).toEqual(DEFAULT_POINTER_RULES);
    expect(savePointerRules(throwing, { clickMaxSeconds: 0.4 }).clickMaxSeconds).toBe(0.4);
    expect(loadPointerRules(null)).toEqual(DEFAULT_POINTER_RULES);
  });
});
