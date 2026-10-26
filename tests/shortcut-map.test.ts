// PC 단축키 매핑 (GDD 18-5): 충돌·예약 키 검사
import { describe, expect, it } from 'vitest';
import { actionFor, findProblems, keyLabel, keysOf, normalizeCode, RESERVED_CODES, SHORTCUTS, type ShortcutCtx } from '../src/ui/shortcutMap';

describe('단축키 매핑', () => {
  it('예약 키(+/-·Esc·Enter·방향키·Tab)를 배정하지 않는다', () => {
    expect(findProblems()).toEqual([]);
    for (const m of Object.values(SHORTCUTS)) for (const c of Object.keys(m)) expect(RESERVED_CODES).not.toContain(c);
  });

  it('왼손 영역(숫자·왼쪽 글자·Space)만 쓴다 — 오른쪽 손 글자는 홈 독 메뉴(N, M)뿐', () => {
    const allowed = /^(Digit[1-9]|Key[QWERASDFZXCVBNMTEHG]|Space)$/;
    for (const m of Object.values(SHORTCUTS)) for (const c of Object.keys(m)) expect(c).toMatch(allowed);
  });

  it('한 맥락에서 같은 액션 이름이 다른 키와 섞여 충돌하지 않는다 (키는 객체 키라 유일)', () => {
    for (const ctx of Object.keys(SHORTCUTS) as ShortcutCtx[]) {
      const codes = Object.keys(SHORTCUTS[ctx]);
      expect(new Set(codes).size).toBe(codes.length);
    }
  });

  it('전투: 숫자 1~8 = 블록, R 해방, Space 일시정지 (E 배속은 C.118, Q 저장 필살기는 C.134 에 삭제)', () => {
    for (let i = 1; i <= 8; i++) expect(actionFor('battle', `Digit${i}`)).toBe(`block.${i}`);
    expect(actionFor('battle', 'Digit9')).toBeNull();
    expect(actionFor('battle', 'KeyQ')).toBeNull();
    expect(actionFor('battle', 'KeyR')).toBe('liberate');
    expect(actionFor('battle', 'Space')).toBe('pause');
    expect(actionFor('battle', 'KeyE')).toBeNull();
    expect(actionFor('battle', 'KeyH')).toBe('help');
  });

  it('숫자패드는 윗줄 숫자와 같다', () => {
    expect(normalizeCode('Numpad3')).toBe('Digit3');
    expect(actionFor('battle', 'Numpad3')).toBe('block.3');
    expect(normalizeCode('NumpadAdd')).toBe('NumpadAdd');
    expect(actionFor('menu', 'NumpadAdd')).toBeNull();
  });

  it('메뉴: W/S/A/D 이동, F·Space 확정, Q 취소', () => {
    expect(actionFor('menu', 'KeyW')).toBe('prev');
    expect(actionFor('menu', 'KeyA')).toBe('prev');
    expect(actionFor('menu', 'KeyS')).toBe('next');
    expect(actionFor('menu', 'KeyD')).toBe('next');
    expect(actionFor('menu', 'KeyF')).toBe('confirm');
    expect(actionFor('menu', 'Space')).toBe('confirm');
    expect(actionFor('menu', 'KeyQ')).toBe('cancel');
  });

  it('홈 독·배치판 전용 키', () => {
    expect(actionFor('room', 'KeyZ')).toBe('care.feed');
    expect(actionFor('room', 'KeyT')).toBe('altar');
    expect(actionFor('plan', 'KeyR')).toBeNull(); // 되돌리기 키는 18-8 에서 삭제
    expect(actionFor('plan', 'KeyQ')).toBe('cancel'); // 선택 취소(배치판이 먼저 가로챈다)
    expect(actionFor('room', 'KeyG')).toBe('status');
    expect(actionFor('room', 'KeyV')).toBe('dock.more'); // 더보기 하나로 통합 (18-9)
    for (const k of ['KeyB', 'KeyN', 'KeyM']) expect(actionFor('room', k), k).toBeNull();
    expect(actionFor('plan', 'Space')).toBe('go');
    expect(actionFor('room', 'Digit2')).toBe('pick.2');
  });

  it('키 글자와 액션별 키 조회', () => {
    expect(keyLabel('KeyZ')).toBe('Z');
    expect(keyLabel('Digit5')).toBe('5');
    expect(keyLabel('Space')).toBe('Spc');
    expect(keysOf('menu', 'confirm').sort()).toEqual(['KeyF', 'Space']);
  });
});

import { KEY_HINTS_KEY, loadKeyHints, saveKeyHints } from '../src/ui/keyHints';

describe('단축키 표시 설정', () => {
  const mem = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
  };
  it('기본 켬, 끄면 저장되고 다시 읽힌다', () => {
    const s = mem();
    expect(loadKeyHints(s)).toBe(true);
    saveKeyHints(s, false);
    expect(s.m.get(KEY_HINTS_KEY)).toBe('0');
    expect(loadKeyHints(s)).toBe(false);
    saveKeyHints(s, true);
    expect(loadKeyHints(s)).toBe(true);
  });
  it('저장소가 없거나 막혀 있으면 켬', () => {
    expect(loadKeyHints(null)).toBe(true);
    expect(loadKeyHints({ getItem: () => { throw new Error('blocked'); }, setItem: () => {} })).toBe(true);
    expect(() => saveKeyHints({ getItem: () => null, setItem: () => { throw new Error('blocked'); } }, false)).not.toThrow();
  });
});
