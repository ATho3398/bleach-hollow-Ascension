// C.432 (GDD 12-4 v6.032·v6.033): 초월자마다 자기 방 — 방 목록(src/data/rooms) 방 키 → { 배경, 물건 자리 }, 이치고의 방 배경
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getFaction } from '../src/data/factions';
import { parseRoomDef, ROOMS, tryGetRoom } from '../src/data/rooms';
import { TRANSCENDENTS } from '../src/data/transcendents';
import { roomOf } from '../src/engine/faction';
import { newSaveData, roomKeyOf } from '../src/game';
import { LAYOUT_KINDS, layoutScenes } from '../src/ui/bha/layoutDraft';
import { FACTIONS } from '../src/data/factions';

describe('방 목록 · 초월자 자기 방', () => {
  it('이치고만 방 키, 방 = 배경 scene.room-ichigo (그림 파일 있음)', () => {
    expect(TRANSCENDENTS.filter((d) => d.room).map((d) => [d.id, d.room])).toEqual([['ichigo', 'transcendent-ichigo']]);
    expect(tryGetRoom('transcendent-ichigo')).toMatchObject({ label: '이치고의 방', sceneArt: 'scene.room-ichigo' });
    expect(existsSync('public/art/scene-room-ichigo.webp')).toBe(true);
    expect(() => parseRoomDef({ id: 'x', label: 'x', sceneArt: 'bad' })).toThrow(/sceneArt/);
  });
  it('초월자 트랙 방 = 방 키의 배경 · 물건 자리는 비어 있으면 종족 방 그대로 · 방 키 없으면 종족 방', () => {
    const s = newSaveData('hollow', 1);
    expect(roomKeyOf(s)).toBeNull();
    s.transcendentId = 'ichigo';
    expect(roomKeyOf(s)).toBe('transcendent-ichigo');
    s.transcendentId = 'aizen';
    expect(roomKeyOf(s)).toBeNull();
    const f = getFaction('hollow');
    const base = roomOf(f), own = roomOf(f, null, 'transcendent-ichigo');
    expect(own.sceneArt).toBe('scene.room-ichigo');
    // C.494 (사용자 2026-11-19 "이치고 방 체크 ㄱㄱ", 배치 도구): 이치고의 방 물건 자리 = 방 목록 값, 안 적은 칸(rank 등)은 종족 방 그대로
    const ich = ROOMS.find((r) => r.id === 'transcendent-ichigo')!.layout!;
    expect(own.layout).toEqual({ ...base.layout, ...ich });
    expect(own.layout.book).toEqual({ x: 9.9, y: 91.2, scale: 0.91 });
    expect(own.layout.outside).toEqual({ x: 88.9, y: 91.2, scale: 1 });
    expect(own.layout.rank).toEqual(base.layout.rank);
    expect(own.props).toEqual(base.props);
    expect(roomOf(f, null, 'nope').sceneArt).toBe(base.sceneArt);
    const room = ROOMS.find((r) => r.id === 'transcendent-ichigo')!;
    const keep = room.layout;
    room.layout = { book: { x: 10, y: 20 } };
    expect(roomOf(f, null, 'transcendent-ichigo').layout.book).toEqual({ x: 10, y: 20 });
    room.layout = keep;
  });
  it('배치 도구: 방 목록의 방이 장면으로 한 번씩(room@<키>), 써 넣으면 방 목록 항목에', () => {
    const scenes = layoutScenes(FACTIONS);
    const sc = scenes.filter((x) => x.id === 'room@transcendent-ichigo');
    expect(sc).toHaveLength(1);
    expect(sc[0]!.label).toBe('방 · 이치고의 방');
    expect(LAYOUT_KINDS.map((k) => k.kind)).toEqual(['room', 'worldmap', 'market']);
    const room = ROOMS.find((r) => r.id === 'transcendent-ichigo')!;
    const keep = room.layout;
    sc[0]!.kind.write(FACTIONS[0]!, { spots: { chest: { x: 33, y: 77 } }, names: {}, extras: [] });
    expect(room.layout?.chest).toEqual({ x: 33, y: 77 });
    expect(FACTIONS[0]!.room?.layout?.chest).not.toEqual({ x: 33, y: 77 }); // 종족 방은 그대로
    room.layout = keep;
    delete room.extras;
  });
});

// C.496 (사용자 2026-11-19 "게임에 이치고 방 맵 변경됐거든? 그거 기준으로 툴최신화시켜"): 새 도트 배경(C.495, 1686×780)의 나무 바닥에 맞춘 이치고의 방 바닥 —
// 종족 방 바닥(호로 굴 0.53~0.58)을 빌리면 바닥 윤곽이 침대·책상을 지나갔다. 사용자가 놓은 물건 자리는 새 바닥 안이라 끌려가지 않는다
describe('C.496 이치고의 방 바닥 = 새 배경 나무 바닥', () => {
  it('방 목록 floor (그림 비율 = 새 배경 1686/780) · 종족과 상관없이 같은 바닥', async () => {
    const { footOnFloor, REF_LIFT, REF_SCENE } = await import('../src/ui/bha/roomFloor');
    const room = ROOMS.find((r) => r.id === 'transcendent-ichigo')!;
    expect(room.floor!.aspect).toBeCloseTo(1686 / 780, 3);
    expect(room.floor!.poly[0]).toEqual([0, 0.66]);
    for (const f of FACTIONS) {
      const r = roomOf(f, null, 'transcendent-ichigo');
      expect(r.floor).toEqual(room.floor);
      for (const k of Object.keys(room.layout!) as (keyof typeof r.layout)[]) {
        const l = r.layout[k];
        const q = footOnFloor(l, r.floor, REF_SCENE, { below: REF_LIFT, padX: 0 });
        expect(q.x, `${f.id}.${k}.x`).toBeCloseTo(l.x, 3);
        expect(q.y, `${f.id}.${k}.y`).toBeCloseTo(l.y, 3);
      }
    }
  });
});
