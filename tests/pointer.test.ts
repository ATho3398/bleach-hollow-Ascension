// 블록 바 포인터 판정 (GDD 3-5, 17-2): 클릭 = 같은 블록 위에서 누르고 뗌. 시간·거리 제한과 드래그(순서 바꾸기)는 없다.
import { describe, expect, it } from 'vitest';
import { LEGACY_POINTER_SETTINGS_KEY, releaseUse, slotAt } from '../src/ui/pointer';

const tray = [{ uid: 10 }, { uid: 11 }, { uid: 12 }];

describe('바 칸 찾기', () => {
  it('바 폭을 칸 수로 나눈 칸을 찾고, 밖은 양 끝 칸으로 자른다', () => {
    expect(slotAt(0, 0, 800, 8)).toBe(0);
    expect(slotAt(99, 0, 800, 8)).toBe(0);
    expect(slotAt(100, 0, 800, 8)).toBe(1);
    expect(slotAt(799, 0, 800, 8)).toBe(7);
    expect(slotAt(-50, 0, 800, 8)).toBe(0);
    expect(slotAt(5000, 0, 800, 8)).toBe(7);
    expect(slotAt(250, 100, 800, 8)).toBe(1);
  });
});

describe('클릭 판정', () => {
  it('누른 블록 위에서 떼면 사용 (오래 눌러도 사용된다: 시간 제한 없음)', () => {
    expect(releaseUse(11, 1, tray)).toEqual({ type: 'use', cell: 1 });
  });
  it('다른 칸에서 떼면 아무 일도 없다 (드래그 같은 순서 바꾸기는 없다)', () => {
    expect(releaseUse(11, 3, tray)).toBeNull();
    expect(releaseUse(11, 0, tray)).toBeNull();
  });
  it('누르는 사이 앞 블록이 쓰여 칸이 당겨져도 블록을 따라간다', () => {
    const after = [{ uid: 11 }, { uid: 12 }];
    expect(releaseUse(11, 0, after)).toEqual({ type: 'use', cell: 0 });
    expect(releaseUse(11, 1, after)).toBeNull();
  });
  it('누른 블록이 이미 사라졌으면 아무 일도 없다', () => {
    expect(releaseUse(99, 0, tray)).toBeNull();
  });
});

describe('옛 설정 키', () => {
  it('예전 클릭 판정·드래그 설정 키 이름 (설정 복원 때 지운다)', () => {
    expect(LEGACY_POINTER_SETTINGS_KEY).toBe('bha-input-settings');
  });
});
