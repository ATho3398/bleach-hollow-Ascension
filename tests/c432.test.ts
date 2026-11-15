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
    expect(own.layout).toEqual(base.layout);
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
