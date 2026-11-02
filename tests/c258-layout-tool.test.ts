// C.258 UI 배치 도구 (GDD 175장): 편집본 → 게임 데이터 구조(room/market/worldmap layout·props·extras) 그대로 읽고 쓰기, 미리보기 적용, 내보내기 파일, 새 물건 검증
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { artUrls, clearRuntimeArt } from '../src/data/art/manifest';
import { FACTIONS } from '../src/data/factions';
import { extrasErrors, marketOf, parseFactionConfig, roomOf, worldMapOf, type FactionConfig } from '../src/engine/faction';
import {
  addExtra, applyDraft, applyLooks, draftHasEdits, editItem, emptyDraft, exportFile, extraArtKey, layoutScenes, loadDraft, normalizeDraft, removeExtra, resolveScene, saveDraft, LAYOUT_KINDS, LAYOUT_STORE_KEY,
} from '../src/ui/bha/layoutDraft';

const clone = (): FactionConfig[] => FACTIONS.map((f) => structuredClone(f) as FactionConfig);
const read = (p: string) => readFileSync(p, 'utf8');

describe('장면 목록 (데이터로 늘림)', () => {
  it('장면 = 종류(방·월드맵·시장) × 종족 — 종족 분기 없이 목록에서', () => {
    const ids = layoutScenes(FACTIONS).map((s) => s.id);
    expect(LAYOUT_KINDS.map((k) => k.kind)).toEqual(['room', 'worldmap', 'market']);
    expect(ids).toEqual(LAYOUT_KINDS.flatMap((k) => FACTIONS.map((f) => `${k.kind}.${f.id}`)));
  });
  it('물건 목록은 게임 화면과 같다: 방 = 수련장 빼고, 시장 = 월드맵 물건 + 온천 뺀 자리, 월드맵 = 장소 6곳', () => {
    const f = FACTIONS[0]!;
    const items = (kind: string) => LAYOUT_KINDS.find((k) => k.kind === kind)!.read(f).items.map((i) => i.key);
    expect(items('room')).not.toContain('altar');
    expect(items('room')).toContain('outside');
    expect(items('market')[0]).toBe('outside');
    expect(items('market')).not.toContain('spa');
    expect(items('worldmap')).toEqual(['home', 'market', 'training', 'adventure', 'tower', 'spa']);
  });
});

describe('편집 → 미리보기 적용 (게임 데이터 구조 그대로)', () => {
  it('방: 자리·크기·이름·숨김 → room.layout / room.props, 새 물건 → room.extras', () => {
    const fs = clone();
    const f = fs[0]!;
    const d = emptyDraft();
    const id = `room.${f.id}`;
    editItem(d, id, 'book', { x: 40.04, y: 70, scale: 1.234 });
    editItem(d, id, 'chest', { name: '보따리', hidden: true });
    const x = addExtra(d, id, '우물', 'i-tile-rest');
    expect(x.id).toBe('new-1');
    expect(applyDraft(d, fs)).toBe(1);
    const r = roomOf(f);
    expect(r.layout.book).toEqual({ x: 40, y: 70, scale: 1.23 });
    expect(r.layout.chest.hidden).toBe(true);
    expect(r.props.chest).toBe('보따리');
    expect(r.extras).toEqual([{ id: 'new-1', name: '우물', icon: 'i-tile-rest', x: 36, y: 72, scale: 1, art: extraArtKey(id, 'new-1') }]);
    // 다른 종족은 그대로
    expect(roomOf(fs[1]!).layout.book).toEqual(roomOf(FACTIONS[1]!).layout.book);
    clearRuntimeArt();
  });
  it('시장: 월드맵 물건 = market.exit, 자리 = market.layout, 월드맵 물건 이름은 시장에서 못 고침', () => {
    const fs = clone();
    const f = fs[1]!;
    const d = emptyDraft();
    editItem(d, `market.${f.id}`, 'outside', { x: 20, y: 80, name: '바깥' });
    editItem(d, `market.${f.id}`, 'smith', { x: 55, name: '대장간' });
    applyDraft(d, fs);
    const mk = marketOf(f);
    expect(mk.exit).toMatchObject({ x: 20, y: 80 });
    expect(mk.layout.smith.x).toBe(55);
    expect(mk.props.smith).toBe('대장간');
    expect(roomOf(f).props.outside).toBe(roomOf(FACTIONS[1]!).props.outside);
  });
  it('월드맵: 자리 = worldmap.layout, 이름은 원래 자리(모험 = adventureName, 탑 = tower.name)', () => {
    const fs = clone();
    const f = fs[0]!;
    const d = emptyDraft();
    editItem(d, `worldmap.${f.id}`, 'tower', { scale: 1.4, name: '높은 탑' });
    editItem(d, `worldmap.${f.id}`, 'adventure', { name: '사냥' });
    applyDraft(d, fs);
    const w = worldMapOf(f);
    expect(w.layout.tower.scale).toBe(1.4);
    expect(w.places.tower).toBe('높은 탑');
    expect(w.places.adventure).toBe('사냥');
  });
  it('배경·올린 그림은 실행 중 그림으로만(세이브·배포 데이터 무관), 아이콘 고르면 그림 끄기', () => {
    const fs = clone();
    const f = fs[0]!;
    const d = emptyDraft();
    (d.scenes[`room.${f.id}`] ??= { items: {}, extras: [] }).bg = 'data:image/png;base64,AAAA';
    d.looks['prop.book'] = { icon: 'i-dex', art: null };
    const icons: Record<string, string> = { book: 'i-shelf' };
    applyDraft(d, fs);
    applyLooks(d, icons);
    expect(roomOf(f).sceneArt).toBe(`scene.layout.room.${f.id}`);
    expect(artUrls(`scene.layout.room.${f.id}`).src).toBe('data:image/png;base64,AAAA');
    expect(artUrls('prop.book').src).toBeNull();
    expect(icons.book).toBe('i-dex');
    clearRuntimeArt();
    expect(artUrls(`scene.layout.room.${f.id}`).src).toBeNull();
  });
});

describe('되돌리기·지우기·저장', () => {
  it('새 물건 지우기는 도구에서 더한 것만, id 는 장면 안에서 겹치지 않는다', () => {
    const d = emptyDraft();
    const a = addExtra(d, 's', '', 'i-special', ['new-1']);
    expect(a.id).toBe('new-2');
    expect(a.name).toBe('새 물건 2');
    expect(removeExtra(d, 's', 'new-2')).toBe(true);
    expect(removeExtra(d, 's', 'book')).toBe(false);
  });
  it('저장 → 읽기 그대로, 깨진 값은 빈 초안', () => {
    const mem = new Map<string, string>();
    const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    const d = emptyDraft();
    d.preview = true;
    editItem(d, 'room.hollow', 'book', { x: 10 });
    expect(saveDraft(d, store)).toBe(true);
    expect(loadDraft(store)).toEqual(d);
    mem.set(LAYOUT_STORE_KEY, '{깨짐');
    expect(loadDraft(store)).toEqual(emptyDraft());
    expect(saveDraft(d, { setItem: () => { throw new Error('quota'); } })).toBe(false);
  });
});

describe('내보내기 파일 (GDD 175장 5)', () => {
  it('초안(그림 data URL 포함) + 장면별 최종 값 표, 다시 불러오면 같은 초안', () => {
    const d = emptyDraft();
    editItem(d, 'room.hollow', 'book', { x: 33 });
    const x = addExtra(d, 'room.hollow', '우물', 'i-special');
    x.art = 'data:image/webp;base64,BBBB';
    expect(draftHasEdits(d)).toBe(true);
    const text = exportFile(d, FACTIONS, 'C.258', new Date('2026-11-03T00:00:00Z'));
    const j = JSON.parse(text);
    expect(j).toMatchObject({ format: 'bha-layout', version: 1, patch: 'C.258' });
    const items = j.resolved['room.hollow'].items as { key: string; x: number; extra: boolean; art: string | null }[];
    expect(items.find((i) => i.key === 'book')!.x).toBe(33);
    expect(items.find((i) => i.key === 'new-1')).toMatchObject({ extra: true, art: 'uploaded' });
    expect(normalizeDraft(j)).toEqual(d);
  });
  it('resolveScene: 편집 없는 장면 = 게임 데이터 값', () => {
    const def = layoutScenes(FACTIONS)[0]!;
    const f = FACTIONS.find((x) => x.id === def.factionId)!;
    const r = resolveScene(def, f, emptyDraft());
    expect(r.items.find((i) => i.key === 'book')!.spot).toMatchObject({ x: roomOf(f).layout.book.x, y: roomOf(f).layout.book.y });
    expect(r.bg).toBeUndefined();
  });
});

describe('새 물건 데이터 (종족 json extras)', () => {
  const base = FACTIONS[0]!;
  it('room/market/worldmap.extras 를 읽는다 (아이콘만, 기능 없음)', () => {
    const raw = structuredClone(base) as unknown as Record<string, Record<string, unknown>>;
    raw.room = { ...raw.room, extras: [{ id: 'well', name: '우물', icon: 'i-tile-rest', x: 30, y: 80 }] };
    const f = parseFactionConfig(raw);
    expect(roomOf(f).extras).toEqual([{ id: 'well', name: '우물', icon: 'i-tile-rest', x: 30, y: 80 }]);
  });
  it('형식이 틀리거나 id 가 겹치면 막는다', () => {
    expect(extrasErrors('room', [{ id: 'A b', name: 'x', icon: 'i', x: 1, y: 1 }])).toHaveLength(1);
    expect(extrasErrors('room', [{ id: 'a', name: 'x', icon: 'i', x: 1, y: 1 }, { id: 'a', name: 'y', icon: 'i', x: 1, y: 1 }])).toHaveLength(1);
    expect(extrasErrors('room', [{ id: 'a', name: 'x', icon: 'i', x: 1, y: 120 }])).toHaveLength(1);
    expect(extrasErrors('room', undefined)).toEqual([]);
  });
});

describe('게임 화면 연결', () => {
  it('세 화면이 숨김 물건을 빼고 새 물건을 그린다(누르면 준비 중)', () => {
    expect(read('src/ui/roomView.ts')).toContain('extraPropButtons(scene, room.extras, floorEntries)');
    expect(read('src/ui/marketView.ts')).toContain('extraPropButtons(scene, mk.extras, floor)');
    expect(read('src/ui/worldMapView.ts')).toContain('extraPropButtons(scene, wm.extras, floor)');
    expect(read('src/ui/bha/room.ts')).toContain("showToast({ eyebrow: x.name, title: '준비 중' }");
  });
  it('?layout 은 배포 빌드에도 들어가고(DEV 가드 없음) 미리보기는 게임 시작 전에 적용', () => {
    const main = read('src/main.ts');
    expect(main).toContain("app && new URLSearchParams(location.search).has('layout')");
    expect(main.indexOf('applyDraft(draft, FACTIONS)')).toBeLessThan(main.indexOf('startApp(app)'));
  });
  it('도구 CSS 는 토큰만 (새 색 없음)', () => {
    expect(read('src/ui/bha/layout-tool.css')).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(/i);
  });
});
