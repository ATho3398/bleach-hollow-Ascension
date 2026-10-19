// 메인 방 화면 (GDD 16장, C.25): 기분 계산, 말풍선 문구, 그림 매니페스트, 종족 설정(room) 읽기·검증
import { describe, expect, it } from 'vitest';
import { artUrls } from '../src/data/art/manifest';
import { FACTIONS, getFaction } from '../src/data/factions';
import { parseFactionConfig, roomOf, ROOM_PROPS, ROOM_TALK } from '../src/engine/faction';
import { moodOf, pickLine, statusChips } from '../src/ui/bha/roomLogic';

describe('moodOf', () => {
  const base = { weakened: false, condition: 80, risk: 10, riskLimit: 100 };
  it('평소에는 idle', () => expect(moodOf(base)).toBe('idle'));
  it('쇠약 > 리스크 높음 > 컨디션 나쁨 순으로 우선한다', () => {
    expect(moodOf({ ...base, weakened: true, risk: 90, condition: 5 })).toBe('weak');
    expect(moodOf({ ...base, risk: 60, condition: 5 })).toBe('risk');
    expect(moodOf({ ...base, condition: 39 })).toBe('tired');
    expect(moodOf({ ...base, condition: 40 })).toBe('idle');
  });
});

describe('pickLine', () => {
  const talk = { idle: ['a', 'b', 'c'], tired: ['t'], risk: ['r'], weak: ['w'], happy: ['h'], hungry: ['g'] };
  it('난수로 문구를 고르고 범위를 넘지 않는다', () => {
    expect(pickLine(talk, 'idle', () => 0)).toBe('a');
    expect(pickLine(talk, 'idle', () => 0.99)).toBe('c');
    expect(pickLine(talk, 'tired', () => 0.5)).toBe('t');
  });
});

describe('그림 매니페스트', () => {
  it('비어 있으면 자리표시(null)', () => {
    expect(artUrls('char.hollow', '/', undefined, [])).toEqual({ src: null, frames: null, scale: 1, offsetY: 0 });
    expect(artUrls('없는.키', '/', undefined, [])).toEqual({ src: null, frames: null, scale: 1, offsetY: 0 });
  });
  it('파일을 적으면 배포 경로(base)를 붙여 돌려준다', () => {
    const m = { 'char.x': { frames: ['art/x1.png', 'art/x2.png'] as [string, string] }, 'scene.y': { src: '/art/y.png' } };
    expect(artUrls('char.x', '/repo/', m).frames).toEqual(['/repo/art/x1.png', '/repo/art/x2.png']);
    expect(artUrls('scene.y', '/repo', m).src).toBe('/repo/art/y.png');
  });
  it('상대 경로 배포(base ./)에서도 파일 경로가 맞고, http·data 주소는 그대로 둔다', () => {
    const m = { 'scene.y': { src: 'art/y.png' }, 'prop.z': { src: 'https://example.com/z.png' } };
    expect(artUrls('scene.y', './', m).src).toBe('./art/y.png');
    expect(artUrls('prop.z', './', m).src).toBe('https://example.com/z.png');
  });
});

describe('종족 설정 room', () => {
  it('모든 종족이 소품 이름 6개와 반응 문구를 가진다', () => {
    for (const f of FACTIONS) {
      const r = roomOf(f);
      for (const p of ROOM_PROPS) {
        expect(r.props[p].length, `${f.id}.${p}`).toBeGreaterThan(0);
        expect(r.layout[p].x).toBeGreaterThanOrEqual(0);
        expect(r.layout[p].y).toBeLessThanOrEqual(100);
      }
      for (const t of ROOM_TALK) expect(r.talk[t].length).toBeGreaterThan(0);
    }
  });
  it('호로는 굴(cave), 사신은 방(room): 방 모양은 설정에서 온다', () => {
    expect(roomOf(getFaction('hollow')).shape).toBe('cave');
    expect(roomOf(getFaction('shinigami')).shape).toBe('room');
  });
  it('room 이 없는 종족도 기본값으로 열린다 (3번째 종족 추가 쉬움)', () => {
    const { room: _omit, ...noRoom } = getFaction('hollow');
    const f = parseFactionConfig({ ...noRoom, id: 'third' });
    expect(roomOf(f).props.door).toBe('문');
  });
  it('잘못된 room 은 이유와 함께 던진다', () => {
    const h = getFaction('hollow');
    expect(() => parseFactionConfig({ ...h, room: { props: { 모르는: 'x' } } })).toThrow(/room.props/);
    expect(() => parseFactionConfig({ ...h, room: { talk: { idle: [] } } })).toThrow(/room.talk/);
  });
});

describe('훈련 인형 (GDD 18-3, C.38)', () => {
  it('이름·위치는 종족 설정에서 오고 다른 물건과 겹치지 않는다', () => {
    expect(roomOf(getFaction('hollow')).props.dummy).toBe('뼈 인형');
    expect(roomOf(getFaction('shinigami')).props.dummy).toBe('나무 인형');
    for (const f of FACTIONS) {
      const r = roomOf(f);
      const d = r.layout.dummy;
      for (const p of ROOM_PROPS) {
        if (p === 'dummy') continue;
        const o = r.layout[p];
        expect(Math.hypot(o.x - d.x, o.y - d.y), `${f.id}: dummy–${p}`).toBeGreaterThan(14);
      }
    }
  });
  it('그림 키 prop.dummy 가 매니페스트에 있다(파일 prop-dummy.png)', () => {
    expect(artUrls('prop.dummy', '/', {}, ['prop-dummy.png']).src).toBe('/art/prop-dummy.png');
  });
});

describe('머리 위 상태 칩 (GDD 18-8)', () => {
  const names = { riskGaugeName: '광기', defeatStateName: '쇠약' };
  it('허기·컨디션·리스크 순서, 값은 반올림, 위험 구간은 기존 경고 기준과 같다', () => {
    const chips = statusChips({ hunger: 40.4, condition: 80, risk: 10, weakened: false }, names);
    expect(chips.map((c) => [c.kind, c.label, c.value, c.danger])).toEqual([
      ['hunger', '허기', 40, false], ['cond', '컨디션', 80, false], ['risk', '광기', 10, false],
    ]);
    const bad = statusChips({ hunger: 85, condition: 30, risk: 61, weakened: false }, names);
    expect(bad.map((c) => c.danger)).toEqual([true, true, true]);
  });
  it('쇠약이면 그 이름의 칩이 하나 더 붙는다', () => {
    const chips = statusChips({ hunger: 0, condition: 100, risk: 0, weakened: true }, names);
    expect(chips).toHaveLength(4);
    expect(chips[3]).toMatchObject({ kind: 'weak', label: '쇠약', value: null, danger: true });
  });
  it('방 소품에 상태판(care)은 없다', () => {
    expect((ROOM_PROPS as readonly string[]).includes('care')).toBe(false);
    for (const f of FACTIONS) expect(Object.keys(roomOf(f).props)).not.toContain('care');
  });
});
