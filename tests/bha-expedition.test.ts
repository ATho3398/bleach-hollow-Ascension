import { describe, expect, it } from 'vitest';
import { ENEMIES } from '../src/data/enemies';
import { ELEMENTS, getElement } from '../src/data/elements';
import {
  ALL, bubbleText, canPlaceAt, endTone, filterFoes, msgKind, tileCss,
} from '../src/ui/bha/expedition';

describe('타일 놓기 규칙 (지금 .slot/.can/.has)', () => {
  const base = { slot: null, index: 6, pos: 4, phase: 'moving' as const, hasSelected: true };
  it('지금 위치보다 앞쪽 빈 슬롯에만 놓을 수 있다', () => {
    expect(canPlaceAt(base)).toBe(true);
    expect(canPlaceAt({ ...base, index: 4 })).toBe(false);
    expect(canPlaceAt({ ...base, index: 2 })).toBe(false);
  });
  it('이미 놓인 슬롯, 고른 타일 없음, 전투·휴식 중에는 놓을 수 없다', () => {
    expect(canPlaceAt({ ...base, slot: 'prey-nest-a' })).toBe(false);
    expect(canPlaceAt({ ...base, hasSelected: false })).toBe(false);
    expect(canPlaceAt({ ...base, phase: 'battle' })).toBe(false);
    expect(canPlaceAt({ ...base, phase: 'rest' })).toBe(false);
  });
  it('둥지 칸 선택 중(pos 0)에는 모든 빈 슬롯에 놓을 수 있다', () => {
    expect(canPlaceAt({ ...base, pos: 0, phase: 'nest-choice', index: 1 })).toBe(true);
  });
});

describe('원정 상태 표시', () => {
  it('메시지 줄 종류: 전투 = fight, 휴식 = rest, 메시지 없이 허기 급상승 = warn', () => {
    expect(msgKind('battle', '조우!', false)).toBe('fight');
    expect(msgKind('rest', '쉰다', false)).toBe('rest');
    expect(msgKind('moving', '', true)).toBe('warn');
    expect(msgKind('moving', '출발!', true)).toBe('');
    expect(msgKind('moving', '', false)).toBe('');
  });
  it('타일 종류 → 디자인 클래스', () => {
    expect(tileCss('prey-nest')).toBe('prey');
    expect(tileCss('elite-den')).toBe('elite');
    expect(tileCss('environment')).toBe('env');
    expect(tileCss('rest')).toBe('rest');
  });
});

describe('원정 결과 톤', () => {
  it('귀환 계열(귀환·최대 바퀴 귀환)은 승리 톤, 패배 계열(전투 패배·허기 탈진)은 패배 톤', () => {
    expect(endTone('returned')).toBe('win');
    expect(endTone('forced-max-laps')).toBe('win');
    expect(endTone('battle-lost')).toBe('lose');
    expect(endTone('exhausted')).toBe('lose');
  });
});

describe('전투 연습 필터', () => {
  const total = ENEMIES.length;
  it('필터가 전체면 목록 그대로 (순서 유지)', () => {
    expect(filterFoes(ENEMIES, { element: ALL, rank: ALL })).toEqual([...ENEMIES]);
  });
  it('속성 필터는 적 속성으로 거른다 (C.47)', () => {
    for (const l of ELEMENTS) {
      const r = filterFoes(ENEMIES, { element: l.id, rank: ALL });
      expect(r.every((e) => e.element === l.id)).toBe(true);
    }
    const sum = ELEMENTS.reduce((n, l) => n + filterFoes(ENEMIES, { element: l.id, rank: ALL }).length, 0);
    expect(sum).toBe(total);
  });
  it('종류 필터는 일반/강적으로 거르고 둘을 합치면 전체', () => {
    const n = filterFoes(ENEMIES, { element: ALL, rank: 'normal' });
    const e = filterFoes(ENEMIES, { element: ALL, rank: 'elite' });
    expect(n.every((x) => x.class === 'normal')).toBe(true);
    expect(e.every((x) => x.class === 'elite')).toBe(true);
    expect(n.length + e.length).toBe(total);
  });
  it('속성과 종류를 같이 걸 수 있다', () => {
    const r = filterFoes(ENEMIES, { element: 'fire', rank: 'elite' });
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((x) => x.element === 'fire' && x.class === 'elite')).toBe(true);
  });
  it('연습 목록은 53명 (속성 8 × 패턴 6 + 테스트 고정 5)', () => {
    expect(total).toBe(53);
  });
});

describe('속성 색 (C.47)', () => {
  it('모든 속성은 기존 디자인 토큰 색을 쓴다', () => {
    for (const e of ELEMENTS) expect(getElement(e.id).color).toMatch(/^--bha-/);
  });
});

describe('걷기 화면 머리 위 말풍선 (GDD 18-7)', () => {
  const base = { phase: 'moving' as const, paused: false, msg: '', kind: '' as const, nestName: '둥지' };
  it('그냥 걷는 중에는 말풍선이 없다', () => {
    expect(bubbleText(base)).toBe('');
  });
  it('알림(조우·획득)이 있으면 그 글자를 우선한다', () => {
    expect(bubbleText({ ...base, msg: '조우!', kind: 'fight' })).toBe('조우!');
  });
  it('배고픔 경고·일시정지·도착은 알림이 없을 때 뜬다', () => {
    expect(bubbleText({ ...base, kind: 'warn' })).toContain('배가 빠르게 고파진다'); // C.63: 배부름 표시
    expect(bubbleText({ ...base, paused: true })).toBe('일시정지');
    expect(bubbleText({ ...base, phase: 'nest-choice' })).toBe('둥지에 도착했다');
  });
});
