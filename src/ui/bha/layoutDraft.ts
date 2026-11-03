// UI 배치 도구의 데이터 (GDD 175장, 개발 전용): 편집본(초안) 구조·저장·장면 목록·미리보기 적용.
// 게임 데이터 구조를 그대로 읽고 쓴다 — 방 room.layout·props·sceneArt, 시장 market.layout·props·exit, 월드맵 worldmap.layout·이름들(종족 json).
// 새 물건은 같은 설정의 extras(아이콘만, 기능 없음). 그림·아이콘은 키(prop.<물건>) 단위라 두 종족 공통이다(사용자 2026-11-03 "홈 ui 아이콘은 통일").
// 종족 분기 없음: 장면 = 장면 종류(LAYOUT_KINDS) × 종족 목록(FACTIONS). 온천 같은 새 장면은 LAYOUT_KINDS 에 한 항목만 더한다.
import { artUrls, setRuntimeArt } from '../../data/art/manifest';
import {
  MARKET_SPOTS, ROOM_PROPS, WORLD_PLACES, marketOf, roomOf, worldMapOf,
  type ExtraProp, type FactionConfig, type PropSpot, type RoomFloorConfig,
} from '../../engine/faction';
import { PROP_ICON } from './room';

export const LAYOUT_STORE_KEY = 'bha.layoutTool.v1';

/** 원래 물건 하나의 편집 (안 바꾼 값은 비움) */
export interface ItemEdit { x?: number; y?: number; scale?: number; name?: string; hidden?: boolean }
/** 새 물건 (그림은 올린 파일의 data URL) */
export interface ExtraDraft { id: string; name: string; icon: string; art?: string; x: number; y: number; scale: number; hidden?: boolean }
/** 장면 하나의 편집 */
export interface SceneEdit { items: Record<string, ItemEdit>; extras: ExtraDraft[]; /** 배경 그림 data URL */ bg?: string }
/** 물건 모양 (그림 키 단위 — 두 종족 공통). art = 올린 그림 data URL, null = 그림 끄고 아이콘 */
export interface PropLook { icon?: string; art?: string | null }

export interface LayoutDraft {
  v: 1;
  /** 같은 브라우저로 게임을 열 때 편집본을 미리 적용 (GDD 175장 4) */
  preview: boolean;
  scenes: Record<string, SceneEdit>;
  /** 그림 키(prop.<물건>) → 모양 */
  looks: Record<string, PropLook>;
}

export const emptyDraft = (): LayoutDraft => ({ v: 1, preview: false, scenes: {}, looks: {} });
export const emptyScene = (): SceneEdit => ({ items: {}, extras: [] });

/** 장면 안 물건 하나 (도구가 그리는 단위) */
export interface LayoutItem {
  key: string;
  name: string;
  spot: Required<Pick<PropSpot, 'x' | 'y' | 'scale'>> & { hidden: boolean };
  /** 그림 키 (원래 물건 = prop.<물건>, 새 물건 = prop.extra.<id>) */
  artKey: string;
  /** 제 그림이 없을 때 대신 쓰는 그림 (게임 화면과 같게) */
  fallbackArt?: string;
  icon: string;
  extra: boolean;
  /** 이름을 이 장면에서 고칠 수 있나 + 어디에 쓰이나 (안내 한 줄) */
  nameNote: string;
  nameEditable: boolean;
}

/** 게임 데이터에서 읽은 원래 물건 */
export interface BaseItem { key: string; name: string; spot: PropSpot; artKey: string; fallbackArt?: string; nameNote: string; nameEditable: boolean }

/** 장면 종류: 종족 설정에서 읽고(read), 미리보기 때 종족 설정에 써 넣는다(write) */
export interface LayoutKind {
  kind: string;
  label: (f: FactionConfig) => string;
  read: (f: FactionConfig) => { shape: string; sceneArt: string; floor: RoomFloorConfig; charFoot: { x: number; y: number }; items: BaseItem[]; extras: readonly ExtraProp[] };
  /** 종족 설정(실제 객체)에 자리·이름·배경 키·새 물건을 써 넣는다 — 미리보기 켠 게임에서만 */
  write: (f: FactionConfig, w: { spots: Record<string, PropSpot>; names: Record<string, string>; sceneArt?: string; extras: ExtraProp[] }) => void;
}

type Mut<T> = { -readonly [K in keyof T]: T[K] };
const mut = (f: FactionConfig) => f as Mut<FactionConfig>;

/** 장면 종류 목록 — 늘릴 때 여기에 한 항목 (온천 등) */
export const LAYOUT_KINDS: readonly LayoutKind[] = [
  {
    kind: 'room',
    label: (f) => `방 · ${f.nestName}`,
    read: (f) => {
      const r = roomOf(f);
      // 수련장(altar)은 방에 없다 — 월드맵 장소 (GDD 158장 1). 방 화면(roomView)과 같은 목록
      const items: BaseItem[] = ROOM_PROPS.filter((p) => p !== 'altar').map((p) => ({
        key: p, name: r.props[p], spot: r.layout[p], artKey: `prop.${p}`, fallbackArt: p === 'outside' ? 'prop.door' : undefined,
        nameNote: p === 'outside' ? '종족 설정 room.props.outside — 시장의 월드맵 물건 이름도 같이 바뀐다' : p === 'rank' ? '종족 설정 room.props.rank (비우면 rankBattleName — 진급 시험 화면 이름은 그대로)' : `종족 설정 room.props.${p}`, nameEditable: true,
      }));
      return { shape: r.shape, sceneArt: r.sceneArt, floor: r.floor, charFoot: r.characterFoot, items, extras: r.extras ?? [] };
    },
    write: (f, w) => {
      const r = { ...(f.room ?? {}) };
      r.layout = { ...r.layout, ...w.spots };
      r.props = { ...r.props, ...w.names };
      if (w.sceneArt) r.sceneArt = w.sceneArt;
      r.extras = w.extras;
      mut(f).room = r;
    },
  },
  {
    kind: 'worldmap',
    label: (f) => `월드맵 · ${worldMapOf(f).name}`,
    read: (f) => {
      const w = worldMapOf(f);
      const note: Record<string, [string, boolean]> = {
        home: ['종족 설정 nestName — 홈 이름이라 여러 화면에 같이 쓰인다', true],
        market: ['종족 설정 market.name — 시장 화면 제목도 같이 바뀐다', true],
        training: ['종족 설정 room.props.altar — 수련장 이름', true],
        adventure: ['종족 설정 worldmap.adventureName', true],
        tower: ['종족 설정 tower.name — 탑 화면 제목도 같이 바뀐다', true],
        spa: ['종족 설정 worldmap.spaName', true],
      };
      const items: BaseItem[] = WORLD_PLACES.map((p) => {
        const place = `place.${p}.${f.id}`;
        return {
          key: p, name: w.places[p], spot: w.layout[p], artKey: `prop.${p}`,
          // 월드맵 화면(worldMapView)과 같은 대신 그림: 종족별 장소 그림, 수련장은 그것도 없으면 방 짚인형 (GDD 160장 4)
          fallbackArt: p === 'training' && !artUrls(place).src ? 'prop.altar' : place,
          nameNote: note[p]?.[0] ?? '', nameEditable: note[p]?.[1] ?? false,
        };
      });
      return { shape: w.shape, sceneArt: w.sceneArt, floor: w.floor, charFoot: w.characterFoot, items, extras: w.extras ?? [] };
    },
    write: (f, w) => {
      const m = mut(f);
      const wm = { ...(f.worldmap ?? {}) };
      wm.layout = { ...wm.layout, ...w.spots };
      if (w.sceneArt) wm.sceneArt = w.sceneArt;
      wm.extras = w.extras;
      const n = w.names;
      if (n.adventure) wm.adventureName = n.adventure;
      if (n.spa) wm.spaName = n.spa;
      m.worldmap = wm;
      if (n.home) m.nestName = n.home;
      if (n.market) m.market = { ...(f.market ?? {}), name: n.market };
      if (n.training) m.room = { ...(f.room ?? {}), props: { ...f.room?.props, altar: n.training } };
      if (n.tower) m.tower = { ...(f.tower ?? {}), name: n.tower };
    },
  },
  {
    kind: 'market',
    label: (f) => `시장 · ${marketOf(f).name}`,
    read: (f) => {
      const mk = marketOf(f);
      // 시장 화면(marketView)과 같은 목록: 월드맵 물건(나가기) + 자리들(온천은 시장에 안 선다 — GDD 153장 1). 떠돌이 상인은 와 있을 때만 서지만 자리는 편집한다
      const items: BaseItem[] = [
        // 그림 = 지도(prop.worldmap)가 있으면 그것, 없으면 방과 같은 문 그림 — 시장 화면과 같게 (C.255)
        { key: 'outside', name: roomOf(f).props.outside, spot: mk.exit, artKey: artUrls('prop.worldmap').src ? 'prop.worldmap' : 'prop.outside', fallbackArt: 'prop.door', nameNote: '방의 월드맵 물건과 같은 이름 — 방 장면에서 고친다', nameEditable: false },
        ...MARKET_SPOTS.filter((p) => p !== 'spa').map((p) => ({
          key: p, name: mk.props[p], spot: mk.layout[p], artKey: `prop.${p}`,
          nameNote: p === 'wanderer' ? '종족 설정 market.props.wanderer — 떠돌이 상인은 와 있을 때만 선다' : `종족 설정 market.props.${p}`, nameEditable: true,
        })),
      ];
      return { shape: mk.shape, sceneArt: mk.sceneArt, floor: mk.floor, charFoot: { x: Math.min(96, mk.exit.x + 13), y: mk.exit.y + 4 }, items, extras: mk.extras ?? [] };
    },
    write: (f, w) => {
      const mk = { ...(f.market ?? {}) };
      const { outside, ...spots } = w.spots;
      mk.layout = { ...mk.layout, ...spots };
      if (outside) mk.exit = outside;
      mk.props = { ...mk.props, ...w.names };
      if (w.sceneArt) mk.sceneArt = w.sceneArt;
      mk.extras = w.extras;
      mut(f).market = mk;
    },
  },
];

export interface LayoutSceneDef { id: string; factionId: string; kind: LayoutKind; label: string }

/** 장면 목록: 장면 종류 × 종족 (id = <종류>.<종족 id>) */
export function layoutScenes(factions: readonly FactionConfig[]): LayoutSceneDef[] {
  return LAYOUT_KINDS.flatMap((k) => factions.map((f) => ({ id: `${k.kind}.${f.id}`, factionId: f.id, kind: k, label: `${k.label(f)} (${f.name})` })));
}

/** 장면의 지금 모습 = 게임 데이터 + 편집 */
export interface ResolvedScene {
  shape: string;
  sceneArt: string;
  floor: RoomFloorConfig;
  charFoot: { x: number; y: number };
  items: LayoutItem[];
  /** 배경 그림을 바꿨으면 그 data URL */
  bg?: string;
}

const round = (v: number, d = 1) => Math.round(v * 10 ** d) / 10 ** d;

export function resolveScene(def: LayoutSceneDef, f: FactionConfig, draft: LayoutDraft): ResolvedScene {
  const base = def.kind.read(f);
  const ed = draft.scenes[def.id] ?? emptyScene();
  const items: LayoutItem[] = base.items.map((b) => {
    const e = ed.items[b.key] ?? {};
    const look = draft.looks[b.artKey];
    return {
      ...b,
      name: e.name ?? b.name,
      spot: { x: e.x ?? b.spot.x, y: e.y ?? b.spot.y, scale: e.scale ?? b.spot.scale ?? 1, hidden: e.hidden ?? b.spot.hidden ?? false },
      icon: look?.icon ?? PROP_ICON[b.key as keyof typeof PROP_ICON] ?? 'i-special',
      extra: false,
    };
  });
  // 데이터에 이미 있는 새 물건(반영된 것) + 도구에서 더한 것
  for (const x of dataExtras(base.extras, ed)) items.push(extraItem({ ...x, scale: x.scale ?? 1, art: undefined }, x.art));
  for (const x of ed.extras) items.push(extraItem(x, extraArtKey(def.id, x.id)));
  return { shape: base.shape, sceneArt: base.sceneArt, floor: base.floor, charFoot: base.charFoot, items, bg: ed.bg };
}

/** 데이터에 이미 있는 새 물건 + 이 장면 편집(자리·이름·숨김은 items 에 적힌다) */
function dataExtras(list: readonly ExtraProp[], ed: SceneEdit): ExtraProp[] {
  return list.filter((x) => !ed.extras.some((d) => d.id === x.id)).map((x) => {
    const e = ed.items[x.id];
    if (!e) return x;
    const out: ExtraProp = { ...x, ...(e.x !== undefined ? { x: e.x } : {}), ...(e.y !== undefined ? { y: e.y } : {}), ...(e.scale !== undefined ? { scale: e.scale } : {}), ...(e.name ? { name: e.name } : {}) };
    if (e.hidden !== undefined) out.hidden = e.hidden;
    if (!out.hidden) delete out.hidden;
    return out;
  });
}

function extraItem(x: ExtraDraft, artKey?: string): LayoutItem {
  return {
    key: x.id, name: x.name, spot: { x: x.x, y: x.y, scale: x.scale, hidden: x.hidden ?? false },
    artKey: artKey ?? `prop.extra.${x.id}`, icon: x.icon, extra: true, nameNote: '새 물건 — 기능 없음(누르면 준비 중)', nameEditable: true,
  };
}

/** 장면 안 원래 물건/새 물건 하나 고치기 (자리·크기는 소수 1자리·2자리로 맞춘다) */
export function editItem(draft: LayoutDraft, sceneId: string, key: string, patch: ItemEdit): void {
  const ed = (draft.scenes[sceneId] ??= emptyScene());
  const clean: ItemEdit = { ...patch };
  if (clean.x !== undefined) clean.x = round(Math.min(100, Math.max(0, clean.x)));
  if (clean.y !== undefined) clean.y = round(Math.min(100, Math.max(0, clean.y)));
  if (clean.scale !== undefined) clean.scale = round(clean.scale, 2);
  const ex = ed.extras.find((x) => x.id === key);
  if (ex) {
    Object.assign(ex, clean);
    if (ex.hidden === false) delete ex.hidden;
    return;
  }
  ed.items[key] = { ...ed.items[key], ...clean };
}

/** 새 물건 더하기: 장면 가운데, 기본 아이콘. id = new-<번호> (장면 안에서 겹치지 않게) */
export function addExtra(draft: LayoutDraft, sceneId: string, name: string, icon: string, taken: readonly string[] = []): ExtraDraft {
  const ed = (draft.scenes[sceneId] ??= emptyScene());
  const used = new Set([...taken, ...ed.extras.map((x) => x.id)]);
  let n = 1;
  while (used.has(`new-${n}`)) n++;
  const x: ExtraDraft = { id: `new-${n}`, name: name.trim() || `새 물건 ${n}`, icon, x: 36, y: 72, scale: 1 }; // 가운데(캐릭터 자리)를 피한 왼쪽 앞
  ed.extras.push(x);
  return x;
}

/** 새 물건 지우기 (도구에서 더한 것만 — 데이터에 반영된 것은 숨기기로) */
export function removeExtra(draft: LayoutDraft, sceneId: string, id: string): boolean {
  const ed = draft.scenes[sceneId];
  const i = ed?.extras.findIndex((x) => x.id === id) ?? -1;
  if (!ed || i < 0) return false;
  ed.extras.splice(i, 1);
  return true;
}

/** 저장된 초안 읽기 (없거나 깨졌으면 빈 초안) */
export function loadDraft(store: Pick<Storage, 'getItem'> | null = safeStorage()): LayoutDraft {
  try {
    const raw = store?.getItem(LAYOUT_STORE_KEY);
    return raw ? normalizeDraft(JSON.parse(raw)) : emptyDraft();
  } catch {
    return emptyDraft();
  }
}

/** 초안 저장. 저장소가 꽉 찼으면(올린 그림이 큼) false */
export function saveDraft(d: LayoutDraft, store: Pick<Storage, 'setItem'> | null = safeStorage()): boolean {
  try {
    store?.setItem(LAYOUT_STORE_KEY, JSON.stringify(d));
    return !!store;
  } catch {
    return false;
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** 파일·저장소에서 읽은 값을 초안 모양으로 (모르는 값은 버린다) */
export function normalizeDraft(raw: unknown): LayoutDraft {
  const r = (raw ?? {}) as Partial<LayoutDraft> & { draft?: unknown; format?: string };
  if (r.format === 'bha-layout' && r.draft) return normalizeDraft(r.draft); // 내보낸 파일
  const d = emptyDraft();
  d.preview = r.preview === true;
  for (const [id, s] of Object.entries(r.scenes ?? {})) {
    if (!s || typeof s !== 'object') continue;
    d.scenes[id] = { items: { ...(s.items ?? {}) }, extras: Array.isArray(s.extras) ? s.extras.filter((x) => x && typeof x.id === 'string') : [], ...(typeof s.bg === 'string' ? { bg: s.bg } : {}) };
  }
  for (const [k, l] of Object.entries(r.looks ?? {})) if (l && typeof l === 'object') d.looks[k] = l;
  return d;
}

/** 편집이 하나라도 있나 */
export const draftHasEdits = (d: LayoutDraft): boolean =>
  Object.keys(d.looks).length > 0 || Object.values(d.scenes).some((s) => Object.keys(s.items).length > 0 || s.extras.length > 0 || !!s.bg);

/** 장면 하나의 편집을 종족 설정 객체에 써 넣는다 (게임 미리보기 = 실제 설정, 도구 = 사본). 올린 그림은 실행 중 그림으로 건다 */
export function applySceneEdit(def: LayoutSceneDef, f: FactionConfig, ed: SceneEdit | undefined): void {
  if (!ed) return;
  const base = def.kind.read(f);
  const spots: Record<string, PropSpot> = {};
  const names: Record<string, string> = {};
  for (const b of base.items) {
    const e = ed.items[b.key];
    if (!e) continue;
    if (e.x !== undefined || e.y !== undefined || e.scale !== undefined || e.hidden !== undefined) {
      const s: PropSpot = { x: e.x ?? b.spot.x, y: e.y ?? b.spot.y };
      const sc = e.scale ?? b.spot.scale;
      if (sc !== undefined) s.scale = sc;
      if (e.hidden ?? b.spot.hidden) s.hidden = true;
      spots[b.key] = s;
    }
    if (e.name && b.nameEditable) names[b.key] = e.name;
  }
  let sceneArt: string | undefined;
  if (ed.bg) {
    sceneArt = `scene.layout.${def.id}`;
    setRuntimeArt(sceneArt, ed.bg);
  }
  const extras: ExtraProp[] = dataExtras(base.extras, ed);
  for (const x of ed.extras) {
    const key = extraArtKey(def.id, x.id);
    setRuntimeArt(key, x.art);
    extras.push({ id: x.id, name: x.name, icon: x.icon, x: x.x, y: x.y, scale: x.scale, art: key, ...(x.hidden ? { hidden: true } : {}) });
  }
  def.kind.write(f, { spots, names, sceneArt, extras });
}

/** 올린 새 물건 그림의 실행 중 키 */
export const extraArtKey = (sceneId: string, id: string): string => `prop.extra.${sceneId}.${id}`;

/** 물건 모양(두 종족 공통): 올린 그림·그림 끄기 = 실행 중 그림, 고른 아이콘 = 자리표시 아이콘 표 */
export function applyLooks(d: LayoutDraft, icons: Record<string, string> = PROP_ICON): void {
  for (const [key, l] of Object.entries(d.looks)) {
    setRuntimeArt(key, l.art);
    const prop = key.replace(/^prop\./, '');
    if (l.icon && prop in icons) icons[prop] = l.icon;
  }
}

/** 미리보기 적용 (게임 시작 전에 부른다): 종족 설정 객체에 편집본을 써 넣는다. 바꾼 장면 수를 돌려준다 */
export function applyDraft(d: LayoutDraft, factions: readonly FactionConfig[]): number {
  let n = 0;
  for (const def of layoutScenes(factions)) {
    const ed = d.scenes[def.id];
    if (!ed) continue;
    applySceneEdit(def, factions.find((x) => x.id === def.factionId)!, ed);
    n++;
  }
  applyLooks(d);
  return n;
}

/** 내보내기 파일 (GDD 175장 5): 초안 그대로(올린 그림은 data URL) + 장면별 최종 값 표(반영 패치가 읽기 쉽게) */
export function exportFile(d: LayoutDraft, factions: readonly FactionConfig[], patch: string, now = new Date()): string {
  const resolved: Record<string, unknown> = {};
  for (const def of layoutScenes(factions)) {
    const ed = d.scenes[def.id];
    if (!ed) continue;
    const f = factions.find((x) => x.id === def.factionId)!;
    const r = resolveScene(def, f, d);
    resolved[def.id] = {
      faction: f.id, kind: def.kind.kind, bgChanged: !!r.bg,
      items: r.items.map((i) => ({ key: i.key, extra: i.extra, name: i.name, ...i.spot, icon: i.icon, art: i.extra ? (ed.extras.find((x) => x.id === i.key)?.art ? 'uploaded' : null) : lookState(d.looks[i.artKey]) })),
    };
  }
  return JSON.stringify({ format: 'bha-layout', version: 1, patch, exportedAt: now.toISOString(), resolved, draft: d }, null, 1);
}

function lookState(l: PropLook | undefined): string | null {
  if (!l || l.art === undefined) return null;
  return l.art === null ? 'icon-only' : 'uploaded';
}
