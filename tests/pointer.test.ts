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
