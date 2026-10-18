import { describe, expect, it } from 'vitest';
import { ENEMIES } from '../src/data/enemies';
import { LINEAGES } from '../src/data/lineages';
import { lineageClass, lineageIconId, lineageKey } from '../src/ui/bha/lineage';
import {
  ALL, canPlaceAt, endTone, filterFoes, msgKind, needsWalkerSnap, ringDisplayPos, ringState, tileCss,
} from '../src/ui/bha/expedition';

describe('원정 링 위치 (--pos)', () => {
  it('둥지 칸에 도착해 귀환을 고르는 중이면 12 로 보여 호가 한 바퀴를 채운다', () => {
    expect(ringDisplayPos(0, 'nest-choice')).toBe(12);
    expect(ringDisplayPos(0, 'moving')).toBe(0);
    expect(ringDisplayPos(5, 'moving')).toBe(5);
    expect(ringDisplayPos(5, 'battle')).toBe(5);
  });

  it('12 → 0 처럼 앞 위치보다 작아질 때만 전환 없이 옮긴다', () => {
    expect(needsWalkerSnap(12, 0)).toBe(true);
    expect(needsWalkerSnap(4, 5)).toBe(false);
    expect(needsWalkerSnap(5, 5)).toBe(false);
    // 한 칸씩 진행하는 11 → 12(둥지 칸 도착)는 보간
    expect(needsWalkerSnap(11, 12)).toBe(false);
  });
});

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
  it('링 가운데 상태 글자', () => {
    expect(ringState('moving', false, false).label).toBe('이동 중');
    expect(ringState('moving', true, false).label).toBe('일시정지');
    expect(ringState('moving', false, true).label).toBe('타일 놓는 중');
    expect(ringState('battle', false, false).label).toBe('전투 대기');
    expect(ringState('rest', false, false).label).toBe('휴식 중');
    expect(ringState('nest-choice', false, false).label).toBe('도착');
  });
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
    expect(filterFoes(ENEMIES, { lineage: ALL, rank: ALL })).toEqual([...ENEMIES]);
  });
  it('계통 필터는 약점 계통으로 거른다', () => {
    for (const l of LINEAGES) {
      const r = filterFoes(ENEMIES, { lineage: l.id, rank: ALL });
      expect(r.every((e) => e.weaknessLineageId === l.id)).toBe(true);
    }
    const sum = LINEAGES.reduce((n, l) => n + filterFoes(ENEMIES, { lineage: l.id, rank: ALL }).length, 0);
    expect(sum).toBe(total);
  });
  it('종류 필터는 일반/강적으로 거르고 둘을 합치면 전체', () => {
    const n = filterFoes(ENEMIES, { lineage: ALL, rank: 'normal' });
    const e = filterFoes(ENEMIES, { lineage: ALL, rank: 'elite' });
    expect(n.every((x) => x.class === 'normal')).toBe(true);
    expect(e.every((x) => x.class === 'elite')).toBe(true);
    expect(n.length + e.length).toBe(total);
  });
  it('계통과 종류를 같이 걸 수 있다', () => {
    const r = filterFoes(ENEMIES, { lineage: 'lineage-b', rank: 'elite' });
    expect(r.every((x) => x.weaknessLineageId === 'lineage-b' && x.class === 'elite')).toBe(true);
  });
  it('연습 목록은 35명', () => {
    expect(total).toBe(35);
  });
});

describe('계통 마크', () => {
  it('lineage-a~e → a~e, 그 밖은 마크 없음', () => {
    expect(lineageKey('lineage-a')).toBe('a');
    expect(lineageKey('lineage-e')).toBe('e');
    expect(lineageKey('lineage-z')).toBeUndefined();
    expect(lineageKey('x')).toBeUndefined();
    expect(lineageClass('lineage-c')).toBe('bha-lin--c');
    expect(lineageClass('foo')).toBe('');
    expect(lineageIconId('lineage-d')).toBe('i-lin-d');
    expect(lineageIconId('foo')).toBe('i-info');
  });
  it('등록된 모든 계통이 디자인의 계통 키를 가진다', () => {
    for (const l of LINEAGES) expect(lineageKey(l.id)).toBeDefined();
  });
});
