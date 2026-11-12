// C.258 UI 배치 도구 (GDD 175장): 편집본 → 게임 데이터 구조(room/market/worldmap layout·props·extras) 그대로 읽고 쓰기, 미리보기 적용, 내보내기 파일, 새 물건 검증
import { ROOMS } from '../src/data/rooms';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { artUrls, clearRuntimeArt } from '../src/data/art/manifest';
import { FACTIONS } from '../src/data/factions';
import { extrasErrors, marketOf, parseFactionConfig, roomOf, sceneViewOk, worldMapOf, type FactionConfig } from '../src/engine/faction';
import {
  addExtra, applyDraft, applyLooks, applySceneEdit, draftHasEdits, hasFileArt, pruneLooks, runtimeUrl, editItem, emptyDraft, exportFile, extraArtKey, layoutScenes, loadDraft, normalizeDraft, removeExtra, resolveScene, saveDraft, LAYOUT_KINDS, LAYOUT_STORE_KEY,
} from '../src/ui/bha/layoutDraft';

const clone = (): FactionConfig[] => FACTIONS.map((f) => structuredClone(f) as FactionConfig);
const read = (p: string) => readFileSync(p, 'utf8');

describe('장면 목록 (데이터로 늘림)', () => {
  it('장면 = 종류(방·월드맵·시장) × 종족 — 종족 분기 없이 목록에서', () => {
    const ids = layoutScenes(FACTIONS).map((s) => s.id);
    expect(LAYOUT_KINDS.map((k) => k.kind)).toEqual(['room', 'worldmap', 'market']);
    expect(ids).toEqual([...LAYOUT_KINDS.flatMap((k) => FACTIONS.map((f) => `${k.kind}.${f.id}`)), ...ROOMS.map((r) => `room@${r.id}`)]); // C.432: 방 목록의 방은 종족과 상관없이 한 번씩
  });
  it('물건 목록은 게임 화면과 같다: 방 = 수련장 빼고, 시장 = 월드맵 물건 + 온천 뺀 자리, 월드맵 = 장소 6곳', () => {
    const f = FACTIONS[0]!;
    const items = (kind: string) => LAYOUT_KINDS.find((k) => k.kind === kind)!.read(f).items.map((i) => i.key);
    expect(items('room')).not.toContain('rank'); // C.394 (GDD 241-C 3): 방 = 수련장(altar), rank 는 월드맵
    expect(items('room')).toContain('altar');
    expect(items('room')).toContain('outside');
    expect(items('market')[0]).toBe('outside');
    expect(items('market')).not.toContain('spa');
    expect(items('worldmap')).toEqual(['home', 'market', 'rank', 'adventure', 'tower', 'spa']); // C.394 (GDD 241-C 3)
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
    expect(artUrls(`scene.layout.room.${f.id}`).src).toBe(runtimeUrl('data:image/png;base64,AAAA')); // C.272: 화면엔 짧은 blob: 주소로
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

// C.263 (사용자 2026-11-03 11:02 "호로쪽으로 잡아놨으니까, 사신, 호로 위치 및 사이즈 통일시켜"): 배치 도구 내보내기(호로) → 두 종족 같은 값
describe('C.263 배치 도구 반영 — 두 종족 위치·크기 통일', () => {
  const spot = (s: { x: number; y: number; scale?: number }) => ({ x: s.x, y: s.y, scale: s.scale });
  it('방: 두 종족 room.layout 이 같고 사용자가 잡은 값', () => {
    const [a, b] = FACTIONS.map((f) => roomOf(f).layout);
    for (const k of ['book', 'chest', 'outside', 'rank', 'altar', 'hogyoku'] as const) expect(spot(a![k])).toEqual(spot(b![k]));
    // C.268 (사용자 2026-11-04 00:58 "호로 기준으로 홈 진급시험 사이즈랑 위치 맞춰놨으니까, 사신도 똑같이 맞춰"): 책장·진급 시험 다시 잡음
    // C.422 (사용자 2026-11-12 "붕옥 추가함. 사신, 호로 홈 맞춰", bha-layout-20261112-1337.json): 책장·수련장·가방·붕옥 다시 잡음, 두 종족 같게
    expect(spot(a!.book)).toEqual({ x: 65.9, y: 64.4, scale: 0.91 });
    // y 91.7 → 91.2: 기준 장면 바닥 아래 끝(이름표 자리)에서 게임이 91.2 로 끌어 놓던 값을 그대로 적음 (보이는 자리 같음)
    expect(spot(a!.chest)).toEqual({ x: 28.2, y: 91.2, scale: 0.86 }); // C.422: y 91.4 → 바닥 아래 끝 91.2 // C.269 (사용자 2026-11-04 01:13 "호로에 가방도 다시 올렸으니까 사신에도 적용"): ×0.8 → ×0.86 + 가방 그림 교체
    expect(spot(a!.altar)).toEqual({ x: 91.1, y: 65.3, scale: 1.03 }); // C.422
    expect(spot(a!.hogyoku)).toEqual({ x: 79.3, y: 88.2, scale: 0.77 }); // C.422: 붕옥 (그 전엔 기본값 37·58·0.6 provisional)
  });
  it('시장 공통 기본값(DEFAULT_MARKET) = C.263 값 — 두 종족은 C.335·C.336 부터 json 으로 따로', () => {
    const m = marketOf({});
    expect(m.exit).toEqual({ x: 7.5, y: 83.1, scale: 0.64 });
    expect(m.layout.shop).toEqual({ x: 40.3, y: 79, scale: 0.9 });
    expect(m.layout.gearShop).toEqual({ x: 54.7, y: 39.5, scale: 0.88 });
    expect(m.layout.skinShop).toEqual({ x: 80.8, y: 41.6, scale: 1.01 });
  });
});

// C.264 (사용자 2026-11-04 00:19 "월드맵 배치 적용 ㄱㄱ", bha-layout-20261104-0019.json): 월드맵은 종족마다 따로 — 호로 = 공통 기본값, 사신 = shinigami.json worldmap.layout
describe('C.264 월드맵 배치 반영 (종족별)', () => {
  const W = (id: string) => worldMapOf(FACTIONS.find((f) => f.id === id)!).layout;
  const spot = (s: { x: number; y: number; scale?: number }) => ({ x: s.x, y: s.y, scale: s.scale });
  it('호로 = DEFAULT_WORLDMAP (모험·탑 옮김), json 에 layout 없음', () => {
    expect(FACTIONS.find((f) => f.id === 'hollow')!.worldmap?.layout).toBeUndefined();
    const w = W('hollow');
    expect(spot(w.home)).toEqual({ x: 47.2, y: 65.4, scale: 1.61 }); // C.278 (2026-11-04 03:31 배경과 함께 전부) // C.270 (사용자 2026-11-04 01:29 "호로 월드맵 적용 ㄱㄱ. 이건 사신쪽에 적용말고 호로만 적용임")
    expect(spot(w.adventure)).toEqual({ x: 19.1, y: 89.7, scale: 0.9 });
    expect(spot(w.tower)).toEqual({ x: 22.1, y: 44.3, scale: 1.28 });
    expect(spot(w.spa)).toEqual({ x: 85.6, y: 58.9, scale: 1.41 });
  });
  it('사신 = shinigami.json worldmap.layout 6곳', () => {
    const w = W('shinigami');
    expect(spot(w.home)).toEqual({ x: 47.2, y: 70.7, scale: 1.28 }); // C.271 (사용자 2026-11-04 01:33 "이건 사신 월드맵만 적용"): ×1.7 → ×1.28 + 대원실 그림 교체
    expect(spot(w.market)).toEqual({ x: 66.8, y: 42.7, scale: 0.98 });
    expect(spot(w.rank)).toEqual({ x: 71, y: 90.5, scale: 0.85 }); // C.394: 옛 수련장 자리 = 번호 쟁탈전·진급 시험
    expect(spot(w.adventure)).toEqual({ x: 14.6, y: 90.6, scale: 0.96 });
    expect(spot(w.tower)).toEqual({ x: 19.6, y: 45.4, scale: 1.15 });
    expect(spot(w.spa)).toEqual({ x: 88.6, y: 63.1, scale: 1.33 });
  });
});

// C.270: 호로 월드맵 둥지 그림 = 사용자 업로드(79×32 도트) — 호로만(종족별 장소 그림 place.home.hollow). 공통 키 prop.home 은 비워 둬 사신 대원실 그림은 그대로
describe('C.270 호로 둥지 월드맵 그림 (호로만)', () => {
  it('place.home.hollow 그림이 있고, prop.home(두 종족 공통 키)은 비어 사신 대원실 그림이 그대로 쓰인다', () => {
    expect(artUrls('place.home.hollow').src).toMatch(/place-home-hollow\.png$/);
    expect(artUrls('place.home.shinigami').src).toMatch(/place-home-shinigami\.png$/);
    expect(artUrls('prop.home').src).toBeNull();
  });
  it('사신 월드맵 홈 자리는 json 값 그대로 (호로 변경 영향 없음)', () => {
    expect(worldMapOf(FACTIONS.find((f) => f.id === 'shinigami')!).layout.home).toEqual({ x: 47.2, y: 70.7, scale: 1.28 }); // C.271 → C.278
  });
});

// C.272 (사용자 2026-11-04 01:5x "배경 바꾸기로 배경 넣었는데 까맣게 나오는 이유 찾아서 수정 / 호로랑 사신 각각 둥지랑 대원실 따로 넣었는데 통일된 이유 찾아서 수정")
describe('C.272 배경 까맣게 · 둥지/대원실 통일 수리', () => {
  it('올린 그림은 짧은 blob: 주소로 건다 (크롬은 2MB 넘는 data: 주소를 그림으로 안 읽음) — 같은 그림은 같은 주소', () => {
    const big = `data:image/png;base64,${'A'.repeat(3_000_000)}`;
    const u = runtimeUrl(big)!;
    expect(u.startsWith('blob:')).toBe(true);
    expect(u.length).toBeLessThan(200);
    expect(runtimeUrl(big)).toBe(u);
    expect(runtimeUrl('art/x.png')).toBe('art/x.png');
    expect(runtimeUrl(null)).toBeNull();
  });
  it('월드맵 홈 그림 키 = 종족별(place.home.<종족>) — 공통 그림 파일이 있는 장소만 prop.<장소>', () => {
    for (const f of FACTIONS) {
      const items = LAYOUT_KINDS.find((k) => k.kind === 'worldmap')!.read(f).items;
      const key = (p: string) => items.find((i) => i.key === p)!.artKey;
      expect(key('home')).toBe(`place.home.${f.id}`);
      for (const p of ['market', 'adventure', 'tower']) expect(key(p)).toBe(hasFileArt(`prop.${p}`) ? `prop.${p}` : `place.${p}.${f.id}`);
    }
    expect(hasFileArt('prop.home')).toBe(false);
  });
  it('둥지·대원실 그림을 따로 올리면 서로 안 덮는다', () => {
    const d = emptyDraft();
    d.looks['place.home.hollow'] = { art: 'data:image/png;base64,QUFB' };
    d.looks['place.home.shinigami'] = { art: 'data:image/png;base64,QkJC' };
    applyLooks(d, {});
    expect(artUrls('place.home.hollow').src).not.toBe(artUrls('place.home.shinigami').src);
    clearRuntimeArt();
  });
  it('어느 물건도 안 쓰는 옛 공통 키(prop.home)는 정리 — 게임 미리보기(applyDraft)도 같은 정리', () => {
    const d = emptyDraft();
    d.looks['prop.home'] = { art: 'data:image/png;base64,AAAA' };
    d.looks['prop.book'] = { icon: 'i-dex' };
    expect(pruneLooks(d, FACTIONS)).toEqual(['prop.home']);
    expect(Object.keys(d.looks)).toEqual(['prop.book']);
    d.looks['prop.home'] = { art: 'data:image/png;base64,AAAA' };
    applyDraft(d, clone());
    expect(artUrls('prop.home').src).toBeNull();
    clearRuntimeArt();
  });
  it('큰 그림은 올릴 때 webp 로 줄여 담는다(저장 공간·화면) — 기준값', () => {
    const tool = read('src/ui/bha/layoutTool.ts');
    expect(tool).toContain('export const UPLOAD_KEEP_BYTES = 600 * 1024;');
    expect(tool).toContain("c.toDataURL('image/webp', 0.92)");
    expect(tool).toContain("prepareImage(file, 'bg')");
    expect(tool).toContain("prepareImage(file, 'prop')");
  });
});

// C.275 (사용자 2026-11-04 02:3x "배경 확대 축소 위치이동 가능하게 수정"): 배경 보기 = <장면>.floor.view { zoom, x, y } — 배경 크기·자리와 바닥이 같은 상자를 쓴다
describe('C.275 배경 확대·위치', () => {
  it('bgBox: view 없으면 cover·가운데 (옛 계산과 같음), zoom·x·y 는 CSS background-position % 와 같은 뜻', async () => {
    const { bgBox, imageToScenePx } = await import('../src/ui/bha/roomFloor');
    const S = { w: 628, h: 296 };
    const base = bgBox(S, 2);
    expect([base.w, base.h, base.left + 0, base.top, base.wide]).toEqual([628, 314, 0, -9, true]);
    expect(bgBox(S, 2, { zoom: 1, x: 50, y: 50 })).toEqual(base);
    const z = bgBox(S, 2, { zoom: 2, x: 0, y: 100 });
    expect([z.w, z.h, z.left + 0, z.top]).toEqual([1256, 628, 0, 296 - 628]); // left = (628 − 1256) × 0 (−0 → 0)
    // 그림 위 점은 같은 상자로: 바닥이 배경을 따라간다
    expect(imageToScenePx([0.5, 0.5], S, 2, { zoom: 2, x: 0, y: 100 })).toEqual([628, 296 - 628 + 314]);
  });
  it('값 검사: zoom 1~4, x·y 0~100', () => {
    expect(sceneViewOk(undefined)).toBe(true);
    expect(sceneViewOk({ zoom: 1.5, x: 0, y: 100 })).toBe(true);
    expect(sceneViewOk({ zoom: 0.5, x: 50, y: 50 })).toBe(false);
    expect(sceneViewOk({ zoom: 2, x: 120, y: 50 })).toBe(false);
    const raw = structuredClone(FACTIONS[0]!) as unknown as Record<string, Record<string, unknown>>;
    raw.room = { ...raw.room, floor: { ...(raw.room!.floor as object), view: { zoom: 9, x: 50, y: 50 } } };
    expect(() => parseFactionConfig(raw)).toThrow(/room\.floor\.view/);
  });
  it('편집 → 미리보기: 방·월드맵·시장 floor.view 로 들어가고 바닥 다각형은 그대로', () => {
    const fs = clone();
    const d = emptyDraft();
    for (const k of ['room', 'worldmap', 'market']) (d.scenes[`${k}.${fs[1]!.id}`] ??= { items: {}, extras: [] }).bgView = { zoom: 1.8, x: 30.1, y: 38.9 };
    expect(draftHasEdits(d)).toBe(true);
    applyDraft(d, fs);
    const f = fs[1]!;
    for (const fl of [roomOf(f).floor, worldMapOf(f).floor, marketOf(f).floor]) expect(fl.view).toEqual({ zoom: 1.8, x: 30.1, y: 38.9 });
    expect(roomOf(f).floor.poly).toEqual(roomOf(FACTIONS[1]!).floor.poly);
    expect(roomOf(fs[0]!).floor.view).toBeUndefined();
    const j = JSON.parse(exportFile(d, FACTIONS, 'C.275'));
    expect(j.resolved[`room.${f.id}`].bgView).toEqual({ zoom: 1.8, x: 30.1, y: 38.9 });
    expect(normalizeDraft(j)).toEqual(d);
  });
  it('게임 화면: layoutOnFloor 가 배경 크기·자리를 같은 상자로 건다 · 도구 배경 맞추기 칸', () => {
    expect(read('src/ui/bha/room.ts')).toContain("scene.style.backgroundPosition = `${floor.view.x}% ${floor.view.y}%`;");
    const tool = read('src/ui/bha/layoutTool.ts');
    expect(tool).toContain("label: '배경 맞추기'");
    expect(tool).toContain("range('확대', 'zoom'");
    expect(read('src/ui/bha/layout-tool.css')).toContain('.bha-ltool.is-bg .bha-room__scene { touch-action: none; cursor: move; }');
  });
});

// C.335 (사용자 2026-11-09 01:45 "적용 ㄱㄱ", bha-layout-20261109-0145.json): 사신 시장 배경·배경 보기·자리 — 사신만. 같은 파일의 월드맵·방·가방 그림은 C.278·C.269 로 이미 같음
describe('C.335 사신 시장 반영', () => {
  const S = () => marketOf(FACTIONS.find((f) => f.id === 'shinigami')!);
  it('배경 = 사신 전용 키 scene.market.shinigami (파일 있음) · 배경 보기 ×1.14', () => {
    expect(S().sceneArt).toBe('scene.market.shinigami');
    expect(artUrls('scene.market.shinigami').src).toMatch(/scene-market-shinigami\.webp$/);
    expect(S().floor.view).toEqual({ zoom: 1.14, x: 50, y: 50 });
    expect(S().floor.poly).toEqual(marketOf({}).floor.poly);
  });
  it('자리 7곳 = 내보낸 값', () => {
    const m = S();
    expect(m.exit).toEqual({ x: 10.9, y: 71.8, scale: 0.64 });
    expect(m.layout.shop).toEqual({ x: 38.4, y: 88.8, scale: 0.9 });
    expect(m.layout.gearShop).toEqual({ x: 76.3, y: 84.9, scale: 0.92 });
    expect(m.layout.skinShop).toEqual({ x: 88.8, y: 57, scale: 0.91 });
    expect(m.layout.traitShop).toEqual({ x: 70.4, y: 40.9, scale: 0.97 });
    expect(m.layout.smith).toEqual({ x: 41.7, y: 35, scale: 1.01 });
    expect(m.layout.wanderer).toEqual({ x: 50.3, y: 66.6, scale: 1.11 });
    // 호로 시장은 C.336 에서 따로 반영 (아래 묶음)
  });
});

// C.337 (사용자 2026-11-09 02:02 "요거 호로상점도 적용", bha-layout-20261109-0202.json): 호로 시장 배경·배경 보기·자리 — 호로만. 나머지 장면은 C.335·C.278·C.269 와 같음
describe('C.337 호로 시장 반영', () => {
  const H = () => marketOf(FACTIONS.find((f) => f.id === 'hollow')!);
  it('배경 = 호로 전용 키 scene.market.hollow (파일 있음) · 배경 보기 ×1.16', () => {
    expect(H().sceneArt).toBe('scene.market.hollow');
    expect(artUrls('scene.market.hollow').src).toMatch(/scene-market-hollow\.webp$/);
    expect(H().floor.view).toEqual({ zoom: 1.16, x: 50, y: 50 });
  });
  it('자리 7곳 = 내보낸 값, 사신 시장은 C.335 그대로', () => {
    const m = H();
    expect(m.exit).toEqual({ x: 10.6, y: 72.3, scale: 0.64 });
    expect(m.layout.shop).toEqual({ x: 33.2, y: 89, scale: 0.9 });
    expect(m.layout.gearShop).toEqual({ x: 66.4, y: 90, scale: 0.89 });
    expect(m.layout.skinShop).toEqual({ x: 69, y: 42.7, scale: 0.92 });
    expect(m.layout.traitShop).toEqual({ x: 87.2, y: 72.4, scale: 1.09 });
    expect(m.layout.smith).toEqual({ x: 33.6, y: 40.4, scale: 0.96 });
    expect(m.layout.wanderer).toEqual({ x: 49.1, y: 68.3, scale: 1.03 });
    expect(marketOf(FACTIONS.find((f) => f.id === 'shinigami')!).sceneArt).toBe('scene.market.shinigami');
  });
});

// C.419 (사용자 2026-11-12 "최신버전으로 업데이트"): 배치 도구를 지금 게임에 맞춤 — 붕옥(등장 전엔 게임에 안 서는 방 물건)도 도구에선 그려 자리를 잡고,
// 도구 페이지에도 새 버전 알림(게임의 '새 버전' 창은 기기 틀 안에 떠 도구엔 안 보였다 → 폰에 받아 둔 옛 도구가 계속 열림)
describe('C.419 배치 도구 = 최신 게임', () => {
  it('장면 물건 목록 = 지금 게임 화면 (방: 번호 쟁탈전·진급 시험 빼고 붕옥 포함, 월드맵: 6곳에 rank 포함)', () => {
    const f = FACTIONS[0]!;
    const items = (kind: string) => LAYOUT_KINDS.find((k) => k.kind === kind)!.read(f).items.map((i) => i.key);
    expect(items('room')).toContain('hogyoku');
    expect(items('room')).not.toContain('rank');
    expect(items('worldmap')).toContain('rank');
  });
  it('도구 방 화면은 붕옥을 그린다(onHogyoku) · 새 버전 버튼', () => {
    const tool = read('src/ui/bha/layoutTool.ts');
    expect(tool).toContain('onSwitchTrack: null, onHogyoku: noop,');
    expect(tool).toContain('onUpdateReady(() => {');
    expect(tool).toContain("label: '새 버전 — 다시 열기'");
    expect(tool.indexOf('const say = ')).toBeLessThan(tool.indexOf('onUpdateReady(() => {')); // 바로 불려도 상태 줄이 있다
  });
});

// C.432 (사용자 2026-11-12 "ui배치도구한테, 내가 방 새로 만드는 기능도 만들라해. 용도는 만들때마다 알려줄테니까 일단 만드는 기능 부터 구현 ㄱㄱ", GDD 17절 '새 방 만들기')
describe('C.432 새 방 만들기', () => {
  it('만들기·물건 넣고 빼기·복제·삭제 — 키 room-<번호>, 빈 방으로 시작', async () => {
    const { addRoom, toggleRoomProp, duplicateRoom, deleteRoom, customSceneId, ROOM_ITEM_PROPS } = await import('../src/ui/bha/layoutDraft');
    const d = emptyDraft();
    const k = addRoom(d, '이치고의 방', 'shinigami', 'scene.room');
    expect(k).toBe('room-1');
    expect(d.rooms[k]).toEqual({ name: '이치고의 방', base: 'shinigami', sceneArt: 'scene.room', props: [] });
    expect(ROOM_ITEM_PROPS).not.toContain('rank');
    expect(toggleRoomProp(d, k, 'chest')).toBe(true);
    expect(toggleRoomProp(d, k, 'rank')).toBe(false); // 방에 안 서는 물건
    editItem(d, customSceneId(k), 'chest', { x: 40, y: 80 });
    const k2 = duplicateRoom(d, k)!;
    expect(d.rooms[k2]).toMatchObject({ name: '이치고의 방 복사', props: ['chest'] });
    expect(d.scenes[customSceneId(k2)]!.items.chest).toEqual({ x: 40, y: 80 });
    expect(deleteRoom(d, k2)).toBe(true);
    expect(d.rooms[k2]).toBeUndefined();
    expect(d.scenes[customSceneId(k2)]).toBeUndefined();
    expect(toggleRoomProp(d, k, 'chest')).toBe(false);
  });
  it('도구 장면 목록에만 붙고(게임 미리보기·정리엔 안 붙음), 그리면 놓은 물건만 보이고 배경·바닥은 그 방 것', async () => {
    const { addRoom, toggleRoomProp, customSceneId } = await import('../src/ui/bha/layoutDraft');
    const d = emptyDraft();
    const k = addRoom(d, '새', 'hollow', 'scene.room');
    toggleRoomProp(d, k, 'book');
    expect(layoutScenes(FACTIONS).some((s) => s.roomKey)).toBe(false);
    const def = layoutScenes(FACTIONS, d).find((s) => s.id === customSceneId(k))!;
    expect(def).toMatchObject({ roomKey: k, factionId: 'hollow', label: '새 방 · 새' });
    const f = clone().find((x) => x.id === 'hollow')!;
    applySceneEdit(def, f, undefined); // 편집 없어도 구성은 써 넣는다
    const r = roomOf(f);
    expect(r.sceneArt).toBe('scene.room');
    expect(r.layout.book.hidden).toBeUndefined();
    for (const p of ['chest', 'outside', 'altar', 'hogyoku'] as const) expect(r.layout[p].hidden).toBe(true);
    // 배경 scene.room = 사신 대원실 → 바닥도 대원실 바닥 (호로 굴 바닥이 아니라)
    expect(r.floor).toEqual(roomOf(FACTIONS.find((x) => x.id === 'shinigami')!).floor);
    // 게임 미리보기는 새 방을 안 건드린다
    const fs = clone();
    applyDraft(d, fs);
    expect(roomOf(fs.find((x) => x.id === 'hollow')!).sceneArt).toBe(roomOf(FACTIONS.find((x) => x.id === 'hollow')!).sceneArt);
  });
  it('내보내기 rooms = 방 키 → { sceneArt, floor, layout, extras } (방 설정 모양), 다시 불러오면 같은 초안', async () => {
    const { addRoom, toggleRoomProp, customSceneId, ROOM_ITEM_PROPS } = await import('../src/ui/bha/layoutDraft');
    const d = emptyDraft();
    const k = addRoom(d, '이치고의 방', 'shinigami', 'scene.room');
    toggleRoomProp(d, k, 'outside');
    editItem(d, customSceneId(k), 'outside', { x: 12, y: 80 });
    addExtra(d, customSceneId(k), '침대', 'i-care-sleep');
    (d.scenes[customSceneId(k)] ??= { items: {}, extras: [] }).bgView = { zoom: 1.2, x: 40, y: 50 };
    expect(draftHasEdits(d)).toBe(true);
    const j = JSON.parse(exportFile(d, FACTIONS, 'C.432'));
    // 방 목록(src/data/rooms, C.432 코딩281) RoomDef 와 같은 모양: id·label·sceneArt·floor·layout·extras (+ base). 안 놓은 물건은 hidden
    expect(j.rooms[k]).toMatchObject({ id: k, label: '이치고의 방', base: 'shinigami', sceneArt: 'scene.room', layout: { outside: { x: 12, y: 80, scale: 1 } } });
    expect(j.rooms[k].layout.chest.hidden).toBe(true);
    expect(Object.keys(j.rooms[k].layout).sort()).toEqual([...ROOM_ITEM_PROPS].sort());
    const { parseRoomDef } = await import('../src/data/rooms');
    expect(() => parseRoomDef({ ...j.rooms[k] })).not.toThrow();
    expect(j.rooms[k].floor.view).toEqual({ zoom: 1.2, x: 40, y: 50 });
    expect(j.rooms[k].extras[0]).toMatchObject({ id: 'new-1', name: '침대', icon: 'i-care-sleep' });
    expect(normalizeDraft(j)).toEqual(d);
  });
  it('배경 고르기 목록 = public/art 의 scene-* 그림', async () => {
    const { sceneArtKeys } = await import('../src/ui/bha/layoutDraft');
    const files = ['scene-room.webp', 'scene-cave.png', 'scene-worldmap-hollow.webp', 'prop-chest.png', 'scene-room.png', 'scene-room-ichigo.webp'];
    // 데이터가 쓰는 키가 먼저: 방 목록 scene.room-ichigo (scene.room.ichigo 가 아니라), 월드맵 scene.worldmap.hollow
    expect(sceneArtKeys(files, ['scene.room-ichigo', 'scene.worldmap.hollow'])).toEqual(['scene.cave', 'scene.room', 'scene.room-ichigo', 'scene.worldmap.hollow']);
    expect(sceneArtKeys(['scene-room-ichigo.webp'])).toEqual(['scene.room-ichigo']); // 기본 known = 방 목록
    expect(artUrls('scene.worldmap.hollow', '/', undefined, ['scene-worldmap-hollow.webp']).src).toBe('/art/scene-worldmap-hollow.webp');
  });
  it('도구: [새 방] 버튼 · 방 설정 칸(이름·복제·삭제·보기 종족·배경·물건)', () => {
    const tool = read('src/ui/bha/layoutTool.ts');
    for (const s of ["label: '새 방'", "label: '이름 바꾸기'", "label: '복제'", "label: '방 삭제'", "setAttribute('aria-label', '보기 종족')", "setAttribute('aria-label', '배경 그림')", 'b.dataset.roomProp = p;']) expect(tool).toContain(s);
  });
});
