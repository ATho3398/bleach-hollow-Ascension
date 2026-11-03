// C.258 UI 배치 도구 (GDD 175장): 편집본 → 게임 데이터 구조(room/market/worldmap layout·props·extras) 그대로 읽고 쓰기, 미리보기 적용, 내보내기 파일, 새 물건 검증
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { artUrls, clearRuntimeArt } from '../src/data/art/manifest';
import { FACTIONS } from '../src/data/factions';
import { extrasErrors, marketOf, parseFactionConfig, roomOf, worldMapOf, type FactionConfig } from '../src/engine/faction';
import {
  addExtra, applyDraft, applyLooks, draftHasEdits, hasFileArt, pruneLooks, runtimeUrl, editItem, emptyDraft, exportFile, extraArtKey, layoutScenes, loadDraft, normalizeDraft, removeExtra, resolveScene, saveDraft, LAYOUT_KINDS, LAYOUT_STORE_KEY,
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
    for (const k of ['book', 'chest', 'outside', 'rank'] as const) expect(spot(a![k])).toEqual(spot(b![k]));
    // C.268 (사용자 2026-11-04 00:58 "호로 기준으로 홈 진급시험 사이즈랑 위치 맞춰놨으니까, 사신도 똑같이 맞춰"): 책장·진급 시험 다시 잡음
    expect(spot(a!.book)).toEqual({ x: 71.4, y: 68.8, scale: 0.91 });
    // y 91.7 → 91.2: 기준 장면 바닥 아래 끝(이름표 자리)에서 게임이 91.2 로 끌어 놓던 값을 그대로 적음 (보이는 자리 같음)
    expect(spot(a!.chest)).toEqual({ x: 28.9, y: 91.2, scale: 0.86 }); // C.269 (사용자 2026-11-04 01:13 "호로에 가방도 다시 올렸으니까 사신에도 적용"): ×0.8 → ×0.86 + 가방 그림 교체
    expect(spot(a!.rank)).toEqual({ x: 83.7, y: 87.1, scale: 1.03 });
  });
  it('시장: 종족 json 에 layout 없음 → 공통 기본값 하나', () => {
    for (const f of FACTIONS) expect(f.market?.layout).toBeUndefined();
    const m = marketOf(FACTIONS[0]!);
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
    expect(spot(w.home)).toEqual({ x: 47.4, y: 65.6, scale: 1.61 }); // C.270 (사용자 2026-11-04 01:29 "호로 월드맵 적용 ㄱㄱ. 이건 사신쪽에 적용말고 호로만 적용임")
    expect(spot(w.adventure)).toEqual({ x: 22.9, y: 85.9, scale: 0.9 });
    expect(spot(w.tower)).toEqual({ x: 11.7, y: 50.1, scale: 1.28 });
    expect(spot(w.spa)).toEqual({ x: 88.7, y: 52.2, scale: 1.29 });
  });
  it('사신 = shinigami.json worldmap.layout 6곳', () => {
    const w = W('shinigami');
    expect(spot(w.home)).toEqual({ x: 45.3, y: 69, scale: 1.28 }); // C.271 (사용자 2026-11-04 01:33 "이건 사신 월드맵만 적용"): ×1.7 → ×1.28 + 대원실 그림 교체
    expect(spot(w.market)).toEqual({ x: 61.8, y: 32.1, scale: 0.98 });
    expect(spot(w.training)).toEqual({ x: 62.3, y: 89.6, scale: 0.85 });
    expect(spot(w.adventure)).toEqual({ x: 17.7, y: 85.6, scale: 1.05 });
    expect(spot(w.tower)).toEqual({ x: 10.9, y: 44.5, scale: 1.15 });
    expect(spot(w.spa)).toEqual({ x: 88.5, y: 55, scale: 1.29 });
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
    expect(worldMapOf(FACTIONS.find((f) => f.id === 'shinigami')!).layout.home).toEqual({ x: 45.3, y: 69, scale: 1.28 }); // C.271
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
