// 기기 항목 선택 시스템 (GDD 16-1, C.25): 하이라이트 이동·순환, 목록 갱신 때 유지, 화면 스택
import { describe, expect, it } from 'vitest';
import { keepSelection, ScreenStack, stepIndex, type ScreenEntry } from '../src/ui/bha/select';

describe('stepIndex', () => {
  it('아래는 한 칸씩, 끝에서 처음으로 순환한다', () => {
    expect(stepIndex(0, 1, 3)).toBe(1);
    expect(stepIndex(2, 1, 3)).toBe(0);
  });
  it('위는 한 칸씩, 처음에서 끝으로 순환한다', () => {
    expect(stepIndex(2, -1, 3)).toBe(1);
    expect(stepIndex(0, -1, 3)).toBe(2);
  });
  it('고른 게 없으면 아래는 첫 항목, 위는 마지막 항목', () => {
    expect(stepIndex(-1, 1, 4)).toBe(0);
    expect(stepIndex(-1, -1, 4)).toBe(3);
  });
  it('항목이 없으면 -1, 하나뿐이면 제자리', () => {
    expect(stepIndex(0, 1, 0)).toBe(-1);
    expect(stepIndex(0, 1, 1)).toBe(0);
    expect(stepIndex(0, -1, 1)).toBe(0);
  });
});

describe('keepSelection', () => {
  it('같은 항목이 남아 있으면 그 새 위치를 따라간다', () => {
    expect(keepSelection(['a', 'b', 'c'], 1, ['x', 'a', 'b'])).toBe(2);
  });
  it('사라졌으면 이전 위치를 목록 안으로 잘라 쓴다', () => {
    expect(keepSelection(['a', 'b', 'c'], 2, ['x', 'y'])).toBe(1);
    expect(keepSelection(['a'], 0, [])).toBe(-1);
  });
});

describe('ScreenStack', () => {
  const mk = (id: string, log: string[], locked = false): ScreenEntry => ({ id, locked, render: () => log.push(id) });
  it('쌓으면 그리고, 뒤로 가면 아래 화면을 다시 그린다', () => {
    const log: string[] = [];
    const st = new ScreenStack();
    st.reset(mk('room', log));
    st.push(mk('dex', log));
    expect(st.size).toBe(2);
    expect(st.back()).toBe(true);
    expect(log).toEqual(['room', 'dex', 'room']);
    expect(st.back()).toBe(false); // 홈에서는 더 못 간다
  });
  it('locked 화면은 취소로 못 빼지만 pop 으로는 빠진다', () => {
    const log: string[] = [];
    const st = new ScreenStack();
    st.reset(mk('room', log));
    st.push(mk('battle', log, true));
    expect(st.back()).toBe(false);
    expect(st.top?.id).toBe('battle');
    expect(st.pop()).toBe(true);
    expect(st.top?.id).toBe('room');
  });
  it('replace 는 맨 위를 바꾸고, reset 은 홈 하나만 남긴다', () => {
    const log: string[] = [];
    const st = new ScreenStack();
    st.reset(mk('room', log));
    st.push(mk('a', log));
    st.replace(mk('b', log));
    expect(st.size).toBe(2);
    expect(st.top?.id).toBe('b');
    st.reset(mk('room', log));
    expect(st.size).toBe(1);
  });
});
