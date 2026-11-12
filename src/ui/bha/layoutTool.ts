// UI 배치 도구 (GDD 175장, 개발 전용): 배포 사이트 주소 뒤 `?layout` 으로 연다(게임 메뉴엔 없음). 사용자는 안드로이드 크롬 폰으로 쓴다.
// 화면은 게임과 같은 기기 틀(844×390 기준) 안에 **실제 게임 화면 코드**(roomView·worldMapView·marketView)를 보기용 세이브로 그려, 보이는 그대로 편집한다.
// 편집 = 물건 끌어 옮기기·크기·이름·아이콘/그림·배경·숨기기·새 물건(아이콘만). 결과는 이 브라우저(localStorage)에 저장되고,
// [미리보기 켜기]면 같은 브라우저로 게임을 열 때 편집본이 적용된다. [내보내기] = 파일 하나(.json, 올린 그림은 data URL) — 대화에 올리면 코딩 세션이 게임 데이터에 반영한다.
import { artUrls, clearRuntimeArt } from '../../data/art/manifest';
import { FACTIONS, getFaction } from '../../data/factions';
import { ROOMS } from '../../data/rooms';
import type { FactionConfig } from '../../engine/faction';
import { newSaveData, type SaveData } from '../../game';
import { PATCH_LABEL } from '../../version';
import { onUpdateReady, restartToLatest } from '../../pwa';
import { marketView } from '../marketView';
import { roomView, type RoomHandlers } from '../roomView';
import { worldMapView } from '../worldMapView';
import type { Device } from './device';
import { button, el, icon } from './dom';
import {
  addExtra, addRoom, applyLooks, applySceneEdit, customSceneId, deleteRoom, duplicateRoom, ROOM_ITEM_PROPS, sceneArtKeys, toggleRoomProp, draftHasEdits, editItem, emptyScene, exportFile, layoutScenes, loadDraft, normalizeDraft, pruneLooks, removeExtra, resolveScene, saveDraft,
  type LayoutDraft, type LayoutItem, type LayoutSceneDef, type ResolvedScene,
} from './layoutDraft';
import { layoutOnFloor, PROP_ICON } from './room';
import { bgBox, floorPolyPx } from './roomFloor';
import { marketOf, roomOf, worldMapOf, SCENE_VIEW_ZOOM, type RoomFloorConfig, type SceneView } from '../../engine/faction';
import { applyTheme } from './theme';

const BASE = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
const FRAME_W = 844;
const FRAME_H = 390;
const noop = () => {};
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** 장면 종류 → 실제 게임 화면 그리기 (보기용 세이브·빈 처리기). 새 장면 종류는 여기에 한 줄 */
const RENDER: Record<string, (dev: Device, f: FactionConfig, save: SaveData) => void> = {
  room: (dev, f, save) => roomView(dev, f, save, roomHandlers()),
  worldmap: (dev, f, save) => worldMapView(dev, f, save, { onHome: noop, onMarket: noop, onRank: noop, onAdventure: noop, onTower: noop, onSpa: noop }),
  market: (dev, f, save) => marketView(dev, f, save, { onShop: noop, onSmith: noop, onWanderer: noop, onBack: noop }),
};

function roomHandlers(): RoomHandlers {
  return {
    // 붕옥(onHogyoku)은 게임에선 등장 뒤에만 서지만 도구에선 늘 보여 자리를 잡게 한다 (C.419)
    onBook: noop, onChest: noop, onStatus: noop, onSwitchTrack: null, onHogyoku: noop, onSettings: noop, onHelp: noop, onShop: noop, onPhoto: noop,
    onTamago: noop, onBackup: null, onTest: null, onTitle: noop, persist: noop, resume: null, resumeNote: '', onOutside: noop, onTraining: noop,
  };
}

/** 방 목록(src/data/rooms)의 처음 값 — 도구가 그 객체에 편집을 써 넣으므로 그릴 때마다 되돌린다 */
const ROOMS0 = structuredClone(ROOMS);
function restoreRooms(): void {
  ROOMS.forEach((r, i) => {
    for (const k of Object.keys(r)) delete (r as unknown as Record<string, unknown>)[k];
    Object.assign(r, structuredClone(ROOMS0[i]));
  });
}

/** 보기용 세이브 (종족마다 하나): 새 세이브 + 떠돌이 상인이 와 있는 상태(시장에 자리가 보이게) */
const sampleSaves = new Map<string, SaveData>();
function sampleSave(factionId: string): SaveData {
  let s = sampleSaves.get(factionId);
  if (!s) {
    s = newSaveData(factionId);
    s.shared.wanderer.visit = { at: Date.now(), runId: 0, tier: 1, stock: [] };
    sampleSaves.set(factionId, s);
  }
  return s;
}

/** 기기 틀 (게임과 같은 bha-dev 마크업, 버튼은 보기만). LCD 안 view 에 게임 화면을 그린다 */
function deviceFrame(): { frame: HTMLElement; dev: Device } {
  const side = (cls: string, ...btns: [string, string][]) => {
    const s = el('div', `bha-dev__side ${cls}`);
    for (const [c, ic] of btns) {
      const b = el('span', `bha-dev__btn ${c}`);
      b.append(icon(ic, undefined, c === 'bha-dev__btn--dir is-up' ? 'bha-dev__flip' : ''));
      s.append(b);
    }
    return s;
  };
  const view = el('div', 'bha-lcd__view');
  const lcd = el('div', 'bha-lcd');
  lcd.append(view);
  const bezel = el('div', 'bha-dev__bezel');
  bezel.append(lcd);
  const devEl = el('div', 'bha-dev');
  devEl.append(side('bha-dev__side--left', ['bha-dev__btn--dir is-up', 'i-chevron-down'], ['bha-dev__btn--dir', 'i-chevron-down']), bezel, side('bha-dev__side--right', ['bha-dev__btn--ok', 'i-check'], ['bha-dev__btn--back', 'i-chevron-left']));
  const frame = el('div', 'bha-ltool__frame');
  frame.append(devEl);
  const dev: Device = {
    view, lcd, frame: devEl,
    setItems: noop, move: noop, confirm: noop, cancel: noop, refresh: noop, setStage: noop, restage: noop, setSkin: noop, destroy: noop,
    setExtraItems: noop, focusMark: () => null, restoreFocus: noop, // C.259 기기 초점 기억·LCD 밖 항목 (도구에서는 안 씀)
  };
  return { frame, dev };
}

/** 스프라이트의 아이콘 목록 (게임 아이콘 고르기) */
function spriteIcons(): string[] {
  return [...new Set([...document.querySelectorAll('symbol[id^="i-"]')].map((s) => s.id))].filter((id) => !id.startsWith('i-fx-'));
}

/** 파일 → data URL */
function readFile(file: File): Promise<string> {
  return new Promise((ok, bad) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => bad(r.error);
    r.readAsDataURL(file);
  });
}

/** 이 크기(바이트)까지는 올린 파일 그대로. 넘으면 webp 로 다시 담는다 (C.272) */
export const UPLOAD_KEEP_BYTES = 600 * 1024;
/** 다시 담을 때 긴 변 최대 (배경 = 기기 LCD 의 약 2배, 물건 = 그림 칸 넉넉히) */
export const UPLOAD_MAX_SIDE = { bg: 2048, prop: 1024 } as const;

/**
 * 올린 그림 → 저장할 data URL (C.272): 큰 파일(폰 사진·큰 png)은 그대로 담으면 이 브라우저 저장 공간(약 5MB)이 차고,
 * 화면에도 안 걸린다(배경이 까맣게). 그래서 일정 크기를 넘으면 긴 변을 줄이고 webp(품질 0.92)로 다시 담는다 — 더 커지면 원본 그대로
 */
async function prepareImage(file: File, kind: keyof typeof UPLOAD_MAX_SIDE): Promise<{ url: string; note: string }> {
  const kb = (n: number) => `${Math.round(n / 1024)}KB`;
  const orig = await readFile(file);
  if (file.size <= UPLOAD_KEEP_BYTES) return { url: orig, note: `${file.name} (${kb(file.size)})` };
  try {
    const img = new Image();
    img.src = orig;
    await img.decode();
    const max = UPLOAD_MAX_SIDE[kind];
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = el('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * k));
    c.height = Math.max(1, Math.round(img.naturalHeight * k));
    const g = c.getContext('2d');
    if (!g) return { url: orig, note: `${file.name} (${kb(file.size)})` };
    g.drawImage(img, 0, 0, c.width, c.height);
    const webp = c.toDataURL('image/webp', 0.92);
    if (!webp.startsWith('data:image/webp') || webp.length >= orig.length) return { url: orig, note: `${file.name} (${kb(file.size)})` };
    const bytes = Math.round((webp.length - webp.indexOf(',') - 1) * 0.75);
    return { url: webp, note: `${file.name} — 커서 줄여 담음 ${kb(file.size)} → ${kb(bytes)} (${c.width}×${c.height} webp)` };
  } catch {
    return { url: orig, note: `${file.name} (${kb(file.size)})` };
  }
}

/** 파일 고르기 (accept 예: image/png,image/webp) */
function pickFile(accept: string): Promise<File | null> {
  return new Promise((ok) => {
    const input = el('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => ok(input.files?.[0] ?? null);
    input.click();
  });
}

export function mountLayoutTool(host: HTMLElement): void {
  document.title = 'UI 배치 도구 · 블리치 할로우 어센션';
  let draft: LayoutDraft = loadDraft();
  /** 장면 목록 = 종족 장면 + 새 방 (새 방은 만들고 지울 때마다 바뀐다) */
  const scenesNow = () => layoutScenes(FACTIONS, draft);
  // 옛 도구가 남긴, 지금 어느 물건도 안 쓰는 그림(예: 둥지·대원실이 함께 덮던 공통 키 prop.home) 정리 (C.272)
  const pruned = pruneLooks(draft, FACTIONS);
  if (pruned.length) saveDraft(draft);
  let undo: string | null = null;
  let sceneId = scenesNow()[0]!.id;
  let picked: string | null = null;
  let showIcons = false;
  /** 배경 맞추기 칸 (C.275): 켜면 편집 칸 = 배경 확대·위치, 장면 빈 곳을 끌면 배경이 움직인다 */
  let bgMode = false;
  let resolved: ResolvedScene | null = null;

  const root = el('div', 'bha-ltool');
  host.replaceChildren(root);

  // ── 머리: 제목 · 장면 고르기 ──
  const head = el('header', 'bha-ltool__head');
  const title = el('h1', 'bha-ltool__title', 'UI 배치 도구');
  const sel = el('select', 'bha-ltool__select');
  sel.setAttribute('aria-label', '장면');
  /** 장면 고르기 칸: 새 방이 생기고 없어질 때마다 다시 채운다 */
  const fillSelect = () => {
    sel.replaceChildren(...scenesNow().map((s) => {
      const o = el('option', '', s.label);
      o.value = s.id;
      return o;
    }));
  };
  fillSelect();
  sel.onchange = () => {
    sceneId = sel.value;
    picked = null;
    render();
  };
  // 새 방 만들기 (GDD 17절, C.432): 이름 → 빈 방(물건 없음, 배경 = 지금 보기 종족의 방 배경). 게임에는 아직 안 잇는다
  const newRoomBtn = button({ label: '새 방', icon: 'i-plus', size: 'small', onClick: () => {
    const name = prompt('새 방 이름 (용도는 나중에 — 게임에는 아직 안 나온다)', '')?.trim();
    if (name === undefined) return;
    const base = def().factionId;
    commit(() => {
      const key = addRoom(draft, name ?? '', base, roomOf(getFaction(base)).sceneArt);
      sceneId = customSceneId(key);
      picked = null;
      bgMode = false;
    }, '빈 방을 만들었다 — 아래 [방 설정]에서 배경·물건을 고른다');
  } });
  newRoomBtn.dataset.newRoom = '';
  head.append(title, sel, newRoomBtn, el('span', 'bha-ltool__note', `개발 전용 · ${PATCH_LABEL}`));

  // ── 기기 틀 + 게임 화면 ──
  const stage = el('div', 'bha-ltool__stage');
  const { frame, dev } = deviceFrame();
  stage.append(frame);
  const fit = () => {
    const k = Math.min(1, stage.clientWidth / FRAME_W);
    frame.style.transform = `translateX(${Math.max(0, (stage.clientWidth - FRAME_W * k) / 2)}px) scale(${k})`;
    stage.style.height = `${FRAME_H * k}px`;
  };
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(fit).observe(stage);

  const status = el('p', 'bha-ltool__status');
  status.setAttribute('role', 'status');
  const say = (t: string) => (status.textContent = t);
  // 새 버전 (C.419): 게임의 '새 버전' 창은 기기 틀 안에 뜨는데 이 도구엔 그 틀이 없어, 폰에 받아 둔 옛 도구가 계속 열렸다 — 머리 줄에 버튼으로.
  // 편집본은 바꿀 때마다 저장돼 있어 바로 다시 열어도 잃는 것 없음
  onUpdateReady(() => {
    if (head.querySelector('[data-ltool-update]')) return;
    const up = button({ label: '새 버전 — 다시 열기', icon: 'i-loop', size: 'small', variant: 'primary', onClick: () => restartToLatest() });
    up.dataset.ltoolUpdate = '';
    head.append(up);
    say('새 버전이 나왔다 — 위 [새 버전 — 다시 열기] 를 누르면 최신 도구로 다시 열린다 (편집본은 그대로)');
  });

  const tools = el('div', 'bha-ltool__row');
  const panel = el('section', 'bha-ltool__panel');
  /** 새 방 설정 칸 (새 방을 고른 동안만): 이름·복제·삭제 · 보기 종족 · 배경 · 놓을 물건 */
  const roomPanel = el('section', 'bha-ltool__panel');
  roomPanel.dataset.roomPanel = '';
  const items = el('div', 'bha-ltool__items');
  const foot = el('div', 'bha-ltool__row bha-ltool__foot');
  root.append(head, stage, tools, roomPanel, items, panel, foot, status);

  const def = (): LayoutSceneDef => {
    const all = scenesNow();
    return all.find((s) => s.id === sceneId) ?? all[0]!;
  };
  const pristine = (): FactionConfig => getFaction(def().factionId);

  /** 바꾸기 한 번 = 되돌리기 1단계 저장 → 바꿈 → 저장 → 다시 그림 */
  const commit = (fn: () => void, msg?: string) => {
    undo = JSON.stringify(draft);
    fn();
    const ok = saveDraft(draft);
    render();
    say(ok ? (msg ?? '저장했다') : '저장 공간이 꽉 찼다 — 올린 그림이 너무 크다(작은 파일로 다시)');
  };

  // ── 게임 화면 그리기 (사본 종족 설정에 편집 적용) ──
  function drawScene(): void {
    const d = def();
    const f = structuredClone(pristine()) as FactionConfig;
    clearRuntimeArt();
    restoreRooms(); // 방 목록 장면의 편집은 방 목록 객체에 써 넣으므로 그리기마다 처음 값에서 다시 (안 그러면 '처음으로'가 안 먹는다)
    applySceneEdit(d, f, draft.scenes[d.id]);
    applyLooks(draft, iconTable());
    applyTheme(f);
    // 방 목록의 방(room@<방 키>, C.432): 보기용 세이브는 초월자 트랙이 아니라 그 방을 안 고르므로, 사본 종족 방을 그 방(roomOf + 방 키)으로 바꿔 실제 방 화면으로 그린다
    const roomKey = d.kind.kind.startsWith('room@') ? d.kind.kind.slice('room@'.length) : null;
    if (roomKey) (f as { room?: FactionConfig['room'] }).room = roomOf(f, null, roomKey);
    RENDER[roomKey ? 'room' : d.kind.kind]!(dev, f, sampleSave(f.id));
    const scene = dev.view.querySelector<HTMLElement>('.bha-room__scene');
    if (!scene || !resolved) return;
    // 바닥(걷는 면) 윤곽 — 물건 발은 이 안으로만 놓인다
    const paintFloor = () => {
      scene.querySelector('.bha-ltool__floor')?.remove();
      const size = { w: scene.clientWidth, h: scene.clientHeight };
      if (!size.w || !size.h) return;
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'bha-ltool__floor');
      svg.setAttribute('viewBox', `0 0 ${size.w} ${size.h}`);
      const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      poly.setAttribute('points', floorPolyPx(resolved!.floor, size).map((p) => p.join(',')).join(' '));
      svg.append(poly);
      scene.prepend(svg);
    };
    requestAnimationFrame(paintFloor);
    for (const b of scene.querySelectorAll<HTMLElement>('.bha-prop')) {
      const key = b.dataset.prop ?? '';
      b.classList.toggle('is-picked', key === picked);
      bindDrag(scene, b, key);
    }
    bindPan(scene);
  }

  /** 지금 배경 보기 (편집 > 게임 데이터 > 기본) */
  const viewNow = (): SceneView => ({ zoom: 1, x: 50, y: 50, ...resolved?.floor.view });

  /** 배경 보기를 장면에 바로 건다 (끄는 동안 — 저장·다시 그리기 없이): 배경 크기·자리 + 바닥 윤곽 */
  function liveView(scene: HTMLElement, view: SceneView): void {
    if (!resolved) return;
    const floor: RoomFloorConfig = { ...resolved.floor, view };
    const size = { w: scene.clientWidth, h: scene.clientHeight };
    const b = bgBox(size, floor.aspect, view);
    scene.style.backgroundSize = b.wide ? `${b.w}px auto` : `auto ${b.h}px`;
    scene.style.backgroundPosition = `${view.x}% ${view.y}%`;
    scene.querySelector('.bha-ltool__floor polygon')?.setAttribute('points', floorPolyPx(floor, size).map((p) => p.join(',')).join(' '));
  }

  /** 배경 끌기 (배경 맞추기 켰을 때, 장면 빈 곳): 손가락이 움직인 만큼 그림이 따라온다. 놓으면 저장 */
  function bindPan(scene: HTMLElement): void {
    scene.addEventListener('pointerdown', (e) => {
      if (!bgMode || !resolved || (e.target as HTMLElement).closest('.bha-prop')) return;
      e.preventDefault();
      const r = scene.getBoundingClientRect();
      const k = scene.clientWidth / r.width; // 화면 px → 장면 px (기기 틀 축소)
      const size = { w: scene.clientWidth, h: scene.clientHeight };
      const from = viewNow();
      const box = bgBox(size, resolved.floor.aspect, from);
      const start = { x: e.clientX, y: e.clientY };
      let view = from;
      scene.setPointerCapture(e.pointerId);
      const move = (ev: PointerEvent) => {
        // left = (장면 − 그림) × x% → 그림을 dx 만큼 옮기려면 x% 를 dx / (장면 − 그림) 만큼
        const spanX = size.w - box.w;
        const spanY = size.h - box.h;
        const dx = (ev.clientX - start.x) * k;
        const dy = (ev.clientY - start.y) * k;
        view = {
          zoom: from.zoom,
          x: Math.abs(spanX) < 0.5 ? from.x : clamp(from.x + (dx / spanX) * 100, 0, 100),
          y: Math.abs(spanY) < 0.5 ? from.y : clamp(from.y + (dy / spanY) * 100, 0, 100),
        };
        liveView(scene, view);
        say(`배경 위치 x ${view.x.toFixed(1)} · y ${view.y.toFixed(1)}`);
      };
      const up = () => {
        scene.removeEventListener('pointermove', move);
        scene.removeEventListener('pointerup', up);
        scene.removeEventListener('pointercancel', up);
        if (view !== from) setView(view, `배경 위치 x ${view.x.toFixed(1)} · y ${view.y.toFixed(1)}`);
      };
      scene.addEventListener('pointermove', move);
      scene.addEventListener('pointerup', up);
      scene.addEventListener('pointercancel', up);
    });
  }

  /** 배경 보기 저장 (소수 1자리·확대 2자리) */
  function setView(v: SceneView, msg: string): void {
    const view = { zoom: Math.round(clamp(v.zoom, SCENE_VIEW_ZOOM.min, SCENE_VIEW_ZOOM.max) * 100) / 100, x: Math.round(clamp(v.x, 0, 100) * 10) / 10, y: Math.round(clamp(v.y, 0, 100) * 10) / 10 };
    commit(() => ((draft.scenes[sceneId] ??= emptyScene()).bgView = view), msg);
  }

  /** 배경 맞추기 칸: 확대 · 가로 위치 · 세로 위치 슬라이더 + 처음으로 */
  function drawBgPanel(): void {
    const scene = () => dev.view.querySelector<HTMLElement>('.bha-room__scene');
    const v = viewNow();
    const rows: HTMLElement[] = [];
    const row = (...n: (Node | string)[]) => {
      const r = el('div', 'bha-ltool__row');
      r.append(...n);
      rows.push(r);
    };
    const range = (label: string, key: keyof SceneView, min: number, max: number, step: number, fmt: (n: number) => string) => {
      const out = el('output', 'bha-ltool__value', fmt(v[key]));
      const input = el('input', 'bha-ltool__range');
      input.type = 'range';
      input.min = String(min);
      input.max = String(max);
      input.step = String(step);
      input.value = String(v[key]);
      input.setAttribute('aria-label', label);
      input.dataset.bgView = key;
      const val = (): SceneView => ({ ...viewNow(), [key]: Number(input.value) });
      input.oninput = () => {
        out.textContent = fmt(Number(input.value));
        const s = scene();
        if (s) liveView(s, val());
      };
      input.onchange = () => setView(val(), `배경 ${label} ${fmt(Number(input.value))}`);
      row(el('span', 'bha-ltool__label', label), input, out);
    };
    row(el('strong', 'bha-ltool__label', '배경 맞추기'), el('span', 'bha-ltool__note', '장면 빈 곳을 손가락으로 끌면 배경이 움직인다. 바닥(점선)도 그림을 따라간다'));
    range('확대', 'zoom', SCENE_VIEW_ZOOM.min, SCENE_VIEW_ZOOM.max, 0.01, (n) => `×${n.toFixed(2)}`);
    range('가로', 'x', 0, 100, 0.1, (n) => n.toFixed(1));
    range('세로', 'y', 0, 100, 0.1, (n) => n.toFixed(1));
    const ed = draft.scenes[sceneId];
    row(
      button({ label: '배경 보기 처음으로', icon: 'i-return', size: 'small', disabled: !ed?.bgView, onClick: () => commit(() => delete draft.scenes[sceneId]!.bgView, '배경 보기를 처음 값으로') }),
      button({ label: '닫기', icon: 'i-close', size: 'small', onClick: () => { bgMode = false; render(); } }),
    );
    row(el('span', 'bha-ltool__note', '확대 1 = 장면을 꽉 채우는 크기(원래), 가로·세로 50 = 가운데. 바뀐 값은 게임 데이터 floor.view 로 반영된다'));
    panel.replaceChildren(...rows);
  }

  /** 자리표시 아이콘 표(room.ts PROP_ICON): 그릴 때마다 원래 값으로 되돌린 뒤 편집본을 건다 — 안 그러면 '원래 그림'을 눌러도 고른 아이콘이 남는다 */
  const ICON0: Record<string, string> = { ...PROP_ICON };
  function iconTable(): Record<string, string> {
    Object.assign(PROP_ICON, ICON0);
    return PROP_ICON;
  }

  /** 끌기: 손가락 따라 발 기준점 이동(바닥 안), 놓으면 저장 */
  function bindDrag(scene: HTMLElement, b: HTMLElement, key: string): void {
    const item = resolved?.items.find((i) => i.key === key);
    if (!item) return;
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (picked !== key) {
        picked = key;
        bgMode = false;
        for (const o of scene.querySelectorAll('.bha-prop.is-picked')) o.classList.remove('is-picked');
        b.classList.add('is-picked');
        drawPanel();
        drawItems();
      }
      const r = scene.getBoundingClientRect();
      const start = { x: e.clientX, y: e.clientY };
      const from = { x: item.spot.x, y: item.spot.y };
      let foot = { ...from };
      let moved = false;
      b.setPointerCapture(e.pointerId);
      b.classList.add('is-dragging');
      const move = (ev: PointerEvent) => {
        const dx = ((ev.clientX - start.x) / r.width) * 100;
        const dy = ((ev.clientY - start.y) / r.height) * 100;
        if (!moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 4) return;
        moved = true;
        foot = { x: Math.min(100, Math.max(0, from.x + dx)), y: Math.min(100, Math.max(0, from.y + dy)) };
        layoutOnFloor(scene, resolved!.floor, [{ el: b, foot, kind: 'prop' }]);
        say(`${item.name} · x ${foot.x.toFixed(1)} · y ${foot.y.toFixed(1)}`);
      };
      const up = () => {
        b.removeEventListener('pointermove', move);
        b.removeEventListener('pointerup', up);
        b.removeEventListener('pointercancel', up);
        b.classList.remove('is-dragging');
        if (!moved) return;
        const placed = placedFoot(scene, b);
        commit(() => editItem(draft, sceneId, key, placed), `${item.name} 옮김 · x ${placed.x.toFixed(1)} · y ${placed.y.toFixed(1)}`);
      };
      b.addEventListener('pointermove', move);
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
    });
  }

  /** 놓인 자리(바닥 안으로 끌린 뒤) → 발 기준점 % : layoutOnFloor 가 left = x%, top = y% × 높이 + 이름표 높이 로 놓는다 */
  function placedFoot(scene: HTMLElement, b: HTMLElement): { x: number; y: number } {
    const shape = b.querySelector<HTMLElement>('.bha-prop__shape');
    const lift = shape ? b.offsetHeight - (shape.offsetTop + shape.offsetHeight) : 0;
    const x = parseFloat(b.style.left);
    const y = ((parseFloat(b.style.top) - lift) / scene.clientHeight) * 100;
    return { x: Number.isFinite(x) ? x : 50, y: Number.isFinite(y) ? y : 75 };
  }

  // ── 물건 목록 (숨긴 것도 여기서 고른다) ──
  function drawItems(): void {
    items.replaceChildren(
      ...(resolved?.items ?? []).map((i) => {
        const b = button({ label: i.name, icon: i.icon, size: 'small', on: i.key === picked, onClick: () => { picked = i.key; bgMode = false; render(); } });
        if (i.spot.hidden) b.classList.add('is-off');
        if (i.extra) b.dataset.extra = '';
        return b;
      }),
    );
  }

  // ── 고른 물건 편집 칸 ──
  function drawPanel(): void {
    if (bgMode) return drawBgPanel();
    const i = resolved?.items.find((x) => x.key === picked);
    if (!i) {
      panel.replaceChildren(el('p', 'bha-ltool__note', '물건을 손가락으로 누르면 고르고, 끌면 옮긴다. 위 물건 목록에서도 고를 수 있다(숨긴 물건 포함).'));
      return;
    }
    const nameIn = el('input', 'bha-ltool__input');
    nameIn.type = 'text';
    nameIn.value = i.name;
    nameIn.maxLength = 16;
    nameIn.disabled = !i.nameEditable;
    nameIn.setAttribute('aria-label', '이름');
    nameIn.onchange = () => {
      const v = nameIn.value.trim();
      if (v) commit(() => editItem(draft, sceneId, i.key, { name: v }), `이름 → ${v}`);
    };
    // 크기: 끄는 동안 그 물건만 바로 바꾸고, 놓으면 저장
    const scaleOut = el('output', 'bha-ltool__value', `×${i.spot.scale.toFixed(2)}`);
    const range = el('input', 'bha-ltool__range');
    range.type = 'range';
    range.min = '0.3';
    range.max = '2.5';
    range.step = '0.01';
    range.value = String(i.spot.scale);
    range.setAttribute('aria-label', '크기');
    range.oninput = () => {
      const v = Number(range.value);
      scaleOut.textContent = `×${v.toFixed(2)}`;
      const b = dev.view.querySelector<HTMLElement>(`.bha-prop[data-prop="${i.key}"]`);
      const scene = dev.view.querySelector<HTMLElement>('.bha-room__scene');
      if (b && scene && resolved) {
        b.style.setProperty('--prop-s', String(v * artUrls(i.artKey, BASE).scale));
        layoutOnFloor(scene, resolved.floor, [{ el: b, foot: i.spot, kind: 'prop' }]);
      }
    };
    range.onchange = () => commit(() => editItem(draft, sceneId, i.key, { scale: Number(range.value) }), `크기 ×${Number(range.value).toFixed(2)}`);

    const rows: HTMLElement[] = [];
    const row = (...n: (Node | string)[]) => {
      const r = el('div', 'bha-ltool__row');
      r.append(...n);
      rows.push(r);
      return r;
    };
    row(el('strong', 'bha-ltool__label', i.extra ? '새 물건' : '물건'), nameIn);
    row(el('span', 'bha-ltool__note', i.nameNote));
    row(el('span', 'bha-ltool__label', '크기'), range, scaleOut);
    row(el('span', 'bha-ltool__note', `자리 x ${i.spot.x.toFixed(1)} · y ${i.spot.y.toFixed(1)} (장면 %, 발 기준점)`));
    const ed = draft.scenes[sceneId];
    const ex = ed?.extras.find((x) => x.id === i.key);
    const look = draft.looks[i.artKey];
    row(
      button({ label: '아이콘 고르기', icon: i.icon, size: 'small', on: showIcons, onClick: () => { showIcons = !showIcons; drawPanel(); } }),
      button({ label: '그림 올리기', icon: 'i-plus', size: 'small', onClick: () => void uploadArt(i) }),
      ...(look || ex?.art ? [button({ label: '원래 그림', icon: 'i-return', size: 'small', onClick: () => resetLook(i) })] : []),
    );
    row(
      button({ label: i.spot.hidden ? '보이기' : '숨기기', icon: i.spot.hidden ? 'i-check' : 'i-broken', size: 'small', onClick: () => commit(() => editItem(draft, sceneId, i.key, { hidden: !i.spot.hidden }), i.spot.hidden ? `${i.name} 보임` : `${i.name} 숨김`) }),
      ...(ex ? [button({ label: '지우기', icon: 'i-broken', size: 'small', variant: 'danger', onClick: () => commit(() => { removeExtra(draft, sceneId, i.key); picked = null; }, `${i.name} 지움`) })] : []),
    );
    // 그림 키: prop.<물건> = 두 종족 공통, place.<장소>.<종족> = 이 종족만 (월드맵 홈 등, C.272)
    if (!i.extra) row(el('span', 'bha-ltool__note', i.artKey.startsWith('place.') ? `그림은 이 종족만 (${i.artKey})` : `그림·아이콘은 두 종족 공통 (${i.artKey})`));
    if (showIcons) {
      const grid = el('div', 'bha-ltool__icons');
      for (const id of spriteIcons()) {
        const b = button({ label: id, icon: id, iconOnly: true, size: 'small', on: id === i.icon, onClick: () => pickIcon(i, id) });
        b.title = id;
        grid.append(b);
      }
      rows.push(grid);
    }
    panel.replaceChildren(...rows);
  }

  function pickIcon(i: LayoutItem, id: string): void {
    showIcons = false;
    commit(() => {
      const ex = draft.scenes[sceneId]?.extras.find((x) => x.id === i.key);
      if (ex) {
        ex.icon = id;
        delete ex.art;
      } else if (i.extra) return; // 데이터에 반영된 새 물건의 아이콘은 반영 패치에서 바꾼다
      else draft.looks[i.artKey] = { ...draft.looks[i.artKey], icon: id, art: null }; // 아이콘을 고르면 그림은 끈다(아이콘이 보이게)
    }, `아이콘 → ${id}`);
  }

  async function uploadArt(i: LayoutItem): Promise<void> {
    const file = await pickFile('image/png,image/webp,image/gif,image/jpeg');
    if (!file) return;
    const { url, note } = await prepareImage(file, 'prop');
    commit(() => {
      const ex = draft.scenes[sceneId]?.extras.find((x) => x.id === i.key);
      if (ex) ex.art = url;
      else draft.looks[i.artKey] = { ...draft.looks[i.artKey], art: url };
    }, `그림 → ${note}`);
  }

  function resetLook(i: LayoutItem): void {
    commit(() => {
      const ex = draft.scenes[sceneId]?.extras.find((x) => x.id === i.key);
      if (ex) delete ex.art;
      else delete draft.looks[i.artKey];
    }, '원래 그림으로');
  }

  // ── 위 도구 줄: 되돌리기 · 장면 처음으로 · 새 물건 · 배경 ──
  function drawTools(): void {
    const ed = draft.scenes[sceneId];
    tools.replaceChildren(
      button({ label: '되돌리기', icon: 'i-return', size: 'small', disabled: undo === null, onClick: () => {
        if (undo === null) return;
        draft = normalizeDraft(JSON.parse(undo));
        undo = null;
        saveDraft(draft);
        render();
        say('한 단계 되돌렸다');
      } }),
      button({ label: '새 물건', icon: 'i-special', size: 'small', onClick: () => {
        const name = prompt('새 물건 이름 (기능은 나중에 — 게임에서 누르면 준비 중)', '')?.trim();
        if (name === undefined) return;
        commit(() => {
          const x = addExtra(draft, sceneId, name ?? '', 'i-special', resolved?.items.map((i) => i.key) ?? []);
          picked = x.id;
        }, '새 물건을 장면 왼쪽 앞에 놓았다 — 끌어서 옮긴다');
      } }),
      button({ label: '배경 맞추기', icon: 'i-frame', size: 'small', on: bgMode, onClick: () => { bgMode = !bgMode; if (bgMode) picked = null; render(); } }),
      button({ label: '배경 바꾸기', icon: 'i-plus', size: 'small', onClick: async () => {
        const file = await pickFile('image/png,image/webp,image/jpeg');
        if (!file) return;
        const { url, note } = await prepareImage(file, 'bg');
        commit(() => ((draft.scenes[sceneId] ??= emptyScene()).bg = url), `배경 → ${note}`);
      } }),
      ...(ed?.bg ? [button({ label: '원래 배경', icon: 'i-return', size: 'small', onClick: () => commit(() => delete draft.scenes[sceneId]!.bg, '원래 배경으로') })] : []),
      button({ label: '이 장면 처음으로', icon: 'i-broken', size: 'small', variant: 'danger', disabled: !ed, onClick: () => {
        if (!confirm('이 장면의 편집을 모두 지우고 게임 데이터 값으로 돌린다. (공통 그림·아이콘은 그대로)')) return;
        commit(() => { delete draft.scenes[sceneId]; picked = null; }, '이 장면을 처음 값으로 돌렸다');
      } }),
    );
  }

  // ── 아래 줄: 미리보기 · 게임 열기 · 내보내기 · 불러오기 · 전부 초기화 ──
  function drawFoot(): void {
    foot.replaceChildren(
      button({ label: draft.preview ? '미리보기 끄기' : '미리보기 켜기', icon: 'i-check', size: 'small', on: draft.preview, onClick: () => commit(() => (draft.preview = !draft.preview), draft.preview ? '미리보기 끔' : '미리보기 켬 — 이 브라우저로 게임을 열면 편집본이 보인다') }),
      button({ label: '게임 열기', icon: 'i-loop', size: 'small', onClick: () => (location.href = location.pathname) }),
      button({ label: '내보내기', icon: 'i-deck', size: 'small', variant: 'primary', disabled: !draftHasEdits(draft), onClick: exportNow }),
      button({ label: '불러오기', icon: 'i-plus', size: 'small', onClick: async () => {
        const file = await pickFile('application/json,.json');
        if (!file) return;
        try {
          const d = normalizeDraft(JSON.parse(await file.text()));
          commit(() => (draft = d), `불러옴: ${file.name}`);
        } catch {
          say('이 파일은 배치 도구 파일이 아니다');
        }
      } }),
      button({ label: '전부 초기화', icon: 'i-broken', size: 'small', variant: 'danger', onClick: () => {
        if (!confirm('모든 장면의 편집·올린 그림과 새 방을 지운다. (먼저 내보내기를 권함)')) return;
        commit(() => { draft = { ...draft, scenes: {}, looks: {}, rooms: {} }; picked = null; }, '전부 처음 값으로');
      } }),
    );
  }

  function exportNow(): void {
    const text = exportFile(draft, FACTIONS, PATCH_LABEL);
    const blob = new Blob([text], { type: 'application/json' });
    const a = el('a');
    const t = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    a.download = `bha-layout-${t.getFullYear()}${pad(t.getMonth() + 1)}${pad(t.getDate())}-${pad(t.getHours())}${pad(t.getMinutes())}.json`;
    a.href = URL.createObjectURL(blob);
    document.body.append(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    say(`내보냄: ${a.download} (${Math.round(text.length / 1024)}KB) — 이 파일을 대화에 올리면 게임 데이터에 반영한다`);
  }

  /** 새 방 설정 칸 (GDD 17절 '새 방 만들기', C.432) */
  function drawRoomPanel(): void {
    const key = def().roomKey;
    const cr = key ? draft.rooms[key] : undefined;
    roomPanel.hidden = !cr;
    if (!key || !cr) return roomPanel.replaceChildren();
    const rows: HTMLElement[] = [];
    const row = (...n: (Node | string)[]) => {
      const r = el('div', 'bha-ltool__row');
      r.append(...n);
      rows.push(r);
    };
    row(
      el('strong', 'bha-ltool__label', '방 설정'),
      el('span', 'bha-ltool__note', `${cr.name} · 키 ${key} · 게임에는 아직 안 나온다(용도를 알려 주면 연결)`),
    );
    row(
      button({ label: '이름 바꾸기', icon: 'i-settings', size: 'small', onClick: () => {
        const name = prompt('방 이름', cr.name)?.trim();
        if (!name) return;
        commit(() => (draft.rooms[key]!.name = name), `방 이름 → ${name}`);
      } }),
      button({ label: '복제', icon: 'i-swap', size: 'small', onClick: () => commit(() => {
        const nk = duplicateRoom(draft, key);
        if (nk) sceneId = customSceneId(nk);
      }, `${cr.name} 복제`) }),
      button({ label: '방 삭제', icon: 'i-broken', size: 'small', variant: 'danger', onClick: () => {
        if (!confirm(`'${cr.name}' 방을 지운다. (자리·배경·새 물건도 같이)`)) return;
        commit(() => { deleteRoom(draft, key); sceneId = scenesNow()[0]!.id; picked = null; }, `${cr.name} 지움`);
      } }),
    );
    // 보기 종족: 캐릭터·물건 이름·처음 자리를 빌릴 방
    const baseSel = el('select', 'bha-ltool__select');
    baseSel.setAttribute('aria-label', '보기 종족');
    for (const f of FACTIONS) {
      const o = el('option', '', `${f.name} (${f.nestName})`);
      o.value = f.id;
      baseSel.append(o);
    }
    baseSel.value = cr.base;
    baseSel.onchange = () => commit(() => (draft.rooms[key]!.base = baseSel.value), '보기 종족 바꿈');
    // 배경: 게임에 있는 방 배경 그림 (올린 그림은 위 [배경 바꾸기])
    const bgSel = el('select', 'bha-ltool__select');
    bgSel.setAttribute('aria-label', '배경 그림');
    bgSel.dataset.roomBg = '';
    // 게임 데이터가 쓰는 배경 키(종족 방·시장·월드맵·방 목록)를 먼저 — 같은 파일을 다른 이름으로 적지 않게
    const known = [...FACTIONS.flatMap((x) => [roomOf(x).sceneArt, marketOf(x).sceneArt, worldMapOf(x).sceneArt]), ...ROOMS.map((r) => r.sceneArt)];
    const keys = sceneArtKeys(undefined, known);
    for (const k of keys.includes(cr.sceneArt) ? keys : [cr.sceneArt, ...keys]) {
      const o = el('option', '', k);
      o.value = k;
      bgSel.append(o);
    }
    bgSel.value = cr.sceneArt;
    bgSel.onchange = () => commit(() => (draft.rooms[key]!.sceneArt = bgSel.value), `배경 → ${bgSel.value}`);
    row(el('span', 'bha-ltool__label', '보기 종족'), baseSel, el('span', 'bha-ltool__label', '배경'), bgSel);
    if (draft.scenes[customSceneId(key)]?.bg) row(el('span', 'bha-ltool__note', '올린 배경 그림이 위 목록보다 먼저 보인다 ([원래 배경] 으로 끄기)'));
    // 놓을 물건: 방 물건 목록에서 넣기·빼기 (넣으면 보기 종족 방의 자리에서 시작 — 끌어 옮긴다)
    const names = roomOf(getFaction(cr.base)).props as Record<string, string>;
    row(
      el('span', 'bha-ltool__label', '물건'),
      ...ROOM_ITEM_PROPS.map((p) => {
        const on = cr.props.includes(p);
        const b = button({ label: names[p] ?? p, icon: PROP_ICON[p as keyof typeof PROP_ICON] ?? 'i-special', size: 'small', on, onClick: () => commit(() => {
          const now = toggleRoomProp(draft, key, p);
          picked = now ? p : null;
        }, on ? `${names[p] ?? p} 뺌` : `${names[p] ?? p} 놓음 — 끌어서 옮긴다`) });
        b.dataset.roomProp = p;
        return b;
      }),
    );
    row(el('span', 'bha-ltool__note', '목록에 없는 새 물건(아이콘만)은 위 [새 물건]. 배경 그림 올리기·확대·위치는 위 [배경 바꾸기]·[배경 맞추기]'));
    roomPanel.replaceChildren(...rows);
  }

  function render(): void {
    root.classList.toggle('is-bg', bgMode); // 배경 맞추기: 장면 끌기 = 배경 이동 (폰 스크롤 막음)
    fillSelect();
    const d = def();
    sceneId = d.id;
    sel.value = sceneId;
    resolved = resolveScene(d, pristine(), draft);
    if (picked && !resolved.items.some((i) => i.key === picked)) picked = null;
    drawScene();
    drawTools();
    drawRoomPanel();
    drawItems();
    drawPanel();
    drawFoot();
  }

  // 게임 화면 안 누름은 도구에선 아무 일도 하지 않는다 (상점·월드맵 이동 등 막음 — 고르기·끌기만)
  dev.view.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); }, true);
  render();
  fit();
  say(pruned.length ? `옛 공통 그림 정리: ${pruned.join(', ')} — 홈 그림은 이제 종족마다 따로 올린다` : draftHasEdits(draft) ? `저장된 편집본을 열었다${draft.preview ? ' · 미리보기 켜짐' : ''}` : '물건을 끌어 옮겨 보자. 바뀐 것은 이 브라우저에 바로 저장된다');
}

