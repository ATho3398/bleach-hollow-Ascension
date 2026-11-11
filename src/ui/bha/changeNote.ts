// '무엇이 바뀌나' 알림 (GDD 209장): 상태창 바로 아래 ~ 캐릭터 머리 위 빈 공간에 이번에 바뀐 값만 한 줄 칩 묶음.
// 칩 = 그 값의 상태창 아이콘 + 이름 + 정확한 변화량('배부름 +20'·'광기 −3', GDD 216장 4 — C.346 의 ▲▼ 대신). 오름/내림 색 = 기존 칩 토큰(좋음 guard · 나쁨 danger — 리스크는 내림이 좋음).
// 상태창 깜빡임(gaugeBlink)과 같이 떴다가 깜빡임이 끝나면 사라진다. 연달아 바뀌면 같은 자리에서 새 내용(쌓지 않음). 종족 차이는 넘겨받은 이름(faction)뿐.
import type { FactionConfig } from '../../engine/faction';
import { el, icon } from './dom';
import { ACTION_FILL_MS } from './actionFx';
import { changedKeys, GAUGE_BLINK_AFTER, GAUGE_BLINK_PERIOD_MS, type GaugeKey } from './gaugeBlink';

/** delta = 바뀐 양(보이는 값끼리의 차 — 반올림 정수, 체력은 최대 대비 %p). unit = 체력만 '%' */
export interface ChangeItem { key: GaugeKey; label: string; icon: string; up: boolean; good: boolean; delta: number; unit: '' | '%' }

/** 변화량 글: 오름 '+20', 내림 '−3' (빼기 기호 U+2212), 체력은 '+15%' (GDD 216장 4) */
export function changeDeltaText(it: Pick<ChangeItem, 'delta' | 'unit'>): string {
  return `${it.delta >= 0 ? '+' : '−'}${Math.abs(it.delta)}${it.unit}`;
}

/** 값 이름 → 상태창과 같은 아이콘 (roomLogic statusChips · homeHpMeter) */
const ICONS: Record<GaugeKey, string> = { hunger: 'i-hunger', cond: 'i-cond', risk: 'i-risk', hp: 'i-heal' };
/** 내림이 좋은 값 (리스크 = 광기·영압 폭주 등, 종족 이름은 faction.riskGaugeName) */
const LOWER_IS_GOOD: ReadonlySet<GaugeKey> = new Set(['risk']);

type Names = Pick<FactionConfig, 'fullnessName' | 'riskGaugeName'>;
export function changeLabel(key: GaugeKey, f: Names): string {
  return key === 'hunger' ? f.fullnessName : key === 'cond' ? '컨디션' : key === 'risk' ? f.riskGaugeName : '체력';
}

/** 두 값 묶음에서 바뀐 값만(반올림해 숫자가 달라진 것 — 깜빡임과 같은 기준), 상태창 순서로 */
export function changeItems<T extends Partial<Record<GaugeKey, number>>>(from: T | null | undefined, to: T, f: Names, only?: readonly GaugeKey[]): ChangeItem[] {
  const keys = only ?? changedKeys(from, to);
  if (!from) return [];
  return keys.flatMap((key) => {
    const a = from[key], b = to[key];
    if (a === undefined || b === undefined || a === b) return [];
    const up = b > a;
    // 보이는 값(반올림)끼리의 차 (GDD 216장 4). 체력은 비율(0~1)이라 %p 로. 반올림해 0 이면 칩 없음(깜빡임 기준 changedKeys 와 같음)
    const delta = key === 'hp' ? Math.round(b * 100) - Math.round(a * 100) : Math.round(b) - Math.round(a);
    if (delta === 0) return [];
    return [{ key, label: changeLabel(key, f), icon: ICONS[key], up, good: LOWER_IS_GOOD.has(key) ? !up : up, delta, unit: key === 'hp' ? '%' as const : '' as const }];
  });
}

/** 칩 하나: 기존 bha-chip + 좋음(guard)/나쁨(danger) 색. 아이콘 색은 상태창 줄 색(--c, .bha-room__chip--<값>) */
export function changeChip(it: ChangeItem): HTMLElement {
  const c = el('span', `bha-chip bha-chip--${it.good ? 'guard' : 'danger'} bha-room__changechip bha-room__chip--${it.key}`);
  c.dataset.change = it.key;
  c.dataset.dir = it.up ? 'up' : 'down';
  c.append(icon(it.icon), el('span', 'bha-room__changename', it.label), el('b', 'bha-room__changedir bha-num', changeDeltaText(it)));
  c.title = `${it.label} ${changeDeltaText(it)}`;
  return c;
}

/** 알림 자리 (빈 상태로 만든다 — 보일 때만 내용). 위 줄 = 행동 글(209장 4-1, 없으면 숨김) · 아래 줄 = 바뀐 값 칩 */
export function changeNoteBox(): HTMLElement {
  const box = el('div', 'bha-room__change');
  box.setAttribute('role', 'status');
  box.setAttribute('aria-live', 'polite');
  box.hidden = true;
  noteParts(box);
  return box;
}
/** 위 줄(행동 글)·아래 줄(칩) — 없으면 만든다 */
function noteParts(box: HTMLElement): { say: HTMLElement; row: HTMLElement } {
  let [say, row] = box.children as unknown as HTMLElement[];
  if (!say || !row) {
    say = el('span', 'bha-room__changesay');
    say.hidden = true;
    row = el('span', 'bha-room__changerow');
    box.replaceChildren(say, row);
  }
  return { say, row };
}
/** 위 줄 행동 글 (209장 4-1: 값이 바뀔 때의 행동 말풍선 — '짐승 고기' 등). null·빈 글이면 줄을 숨긴다 */
export function setChangeSay(box: HTMLElement, text: string | null): void {
  const { say } = noteParts(box);
  say.textContent = text ?? '';
  say.title = text ?? '';
  say.hidden = !text;
}
/** 지금 위 줄 행동 글 (없으면 '') */
export const changeSayText = (box: HTMLElement): string => {
  const { say } = noteParts(box);
  return say.hidden ? '' : say.textContent ?? '';
};

/** 값이 다 바뀐 뒤 최소로 더 떠 있는 시간 (GDD 209장 3-1 사용자 보충 "한 1초는 상태 떠있어야") */
export const CHANGE_NOTE_MIN_AFTER_MS = 1000;
/** 떠 있는 시간: 바뀌는 시간(차오름) + max(끝난 뒤 깜빡임(gaugeBlink 와 같은 식), 1초) */
export const changeNoteMs = (ms = ACTION_FILL_MS): number => Math.max(0, ms) + Math.max(CHANGE_NOTE_MIN_AFTER_MS, GAUGE_BLINK_PERIOD_MS * GAUGE_BLINK_AFTER);
/** 사라지는 연출 길이 (room.css bha-change-out 과 같은 값) */
const OUT_MS = 200;

interface NoteState { timer: ReturnType<typeof setTimeout> | 0; out: ReturnType<typeof setTimeout> | 0; until: number }
const states = new WeakMap<HTMLElement, NoteState>();
const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/**
 * 바뀐 값 칩을 띄운다. ms = 바뀌는 시간(차오름) — 깜빡임이 끝나면(ms + 0.25초×3) 사라진다.
 * 이미 떠 있으면 같은 자리에서 새 내용으로 바꾸고, extend 면 끝 시각만 늦춘다(온천처럼 0.1초마다 오르는 화면). 바뀐 값이 없으면 아무 것도 안 한다.
 * 띄웠으면 onShow(자리 정하기)를 부른다.
 */
export function showChangeNote(box: HTMLElement, items: readonly ChangeItem[], ms = ACTION_FILL_MS, o: { extend?: boolean; onShow?: () => void; say?: string | null } = {}): boolean {
  if (items.length === 0) return false;
  const t = now();
  const prev = states.get(box);
  const until = Math.max(t + changeNoteMs(ms), o.extend && prev ? prev.until : 0);
  if (prev) {
    clearTimeout(prev.timer);
    clearTimeout(prev.out);
  }
  const sig = items.map((i) => `${i.key}:${i.delta}`).join(',');
  if (o.say !== undefined || !o.extend) setChangeSay(box, o.say ?? null); // 새 알림 = 새 행동 글(없으면 줄 숨김). 온천(extend)은 그대로
  if (box.hidden || box.dataset.sig !== sig || box.classList.contains('is-out')) {
    noteParts(box).row.replaceChildren(...items.map(changeChip));
    box.dataset.sig = sig;
    box.setAttribute('aria-label', items.map((i) => `${i.label} ${changeDeltaText(i)}`).join(', '));
    if (box.hidden || box.classList.contains('is-out') || !o.extend) {
      box.classList.remove('is-in', 'is-out');
      void box.offsetWidth;
      box.classList.add('is-in');
    }
  }
  box.hidden = false;
  const st: NoteState = { timer: 0, out: 0, until };
  st.timer = setTimeout(() => {
    if (states.get(box) !== st) return;
    box.classList.add('is-out');
    st.out = setTimeout(() => {
      if (states.get(box) !== st) return;
      states.delete(box);
      hideChangeNote(box);
    }, OUT_MS);
  }, Math.max(0, until - t));
  states.set(box, st);
  o.onShow?.();
  return true;
}

/** 바로 숨긴다 (자리가 없을 때·화면을 떠날 때) */
export function hideChangeNote(box: HTMLElement): void {
  const s = states.get(box);
  if (s) {
    clearTimeout(s.timer);
    clearTimeout(s.out);
    states.delete(box);
  }
  box.hidden = true;
  box.classList.remove('is-in', 'is-out');
  noteParts(box).row.replaceChildren();
  setChangeSay(box, null);
  delete box.dataset.sig;
}

type Rect = Pick<DOMRect, 'left' | 'top' | 'right' | 'bottom'>;
const hits = (a: Rect, b: Rect): boolean => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
/** 가로 범위만 */
export const horiz = (r: Pick<DOMRect, 'left' | 'right'>): { left: number; right: number } => ({ left: r.left, right: r.right });
const moved = (r: Rect, dx: number): Rect => ({ left: r.left + dx, right: r.right + dx, top: r.top, bottom: r.bottom });

/**
 * 자리 검사 (GDD 209장 1): 알림이 장면 안이고 피할 것(상태창·ⓘ·이름표·물건 버튼·캐릭터 머리 아래 칸)과 안 겹치는지.
 * slide 면 가로로 밀어 볼 수 있다 — 장면 끝·걸린 것 바깥까지, 가장 덜 미는 것부터(최대 maxSlide). 들어가면 밀 거리(dx), 못 들어가면 null.
 */
export function changeNoteFit(note: Rect, scene: Rect, blockers: readonly Rect[], o: { slide?: boolean; maxSlide?: number; pad?: number } = {}): { dx: number } | null {
  const pad = o.pad ?? 2;
  const ok = (r: Rect) => r.left >= scene.left && r.right <= scene.right && r.top >= scene.top && r.bottom <= scene.bottom && !blockers.some((b) => hits(r, b));
  const cands = [0];
  if (o.slide) {
    cands.push(scene.left + pad - note.left, scene.right - pad - note.right);
    for (const b of blockers) if (note.top < b.bottom && note.bottom > b.top) cands.push(b.left - pad - note.right, b.right + pad - note.left);
  }
  const max = o.maxSlide ?? Infinity;
  for (const dx of [...new Set(cands)].filter((d) => Math.abs(d) <= max).sort((a, b) => Math.abs(a) - Math.abs(b))) if (ok(moved(note, dx))) return { dx: Math.round(dx) };
  return null;
}

/**
 * 알림 자리 정하기 (방·온천 공용, GDD 209장 1 · 마스터 결정 14:3x): 자리는 늘 '상태창 아래 ~ 머리 위' 한 곳(옆·위 대안 없음).
 * head = 캐릭터 그림 머리 윗변(y)과 캐릭터 상자 좌우 — 그 아래 칸은 피한다(머리·몸과 겹침 0). 물건 버튼·장면 끝에 걸리면 가로로만 민다.
 * 한 줄 = [행동 글 · 칩] → [행동 글 · 줄인 칩](아이콘+숫자) → [칩] → [줄인 칩]. 다 안 되면 숨기고 false(부르는 쪽은 예전 말풍선). 잴 수 없으면(붙기 전) true
 */
export function placeChangeNote(note: HTMLElement, o: { scene: HTMLElement; head: { y: number; left: number; right: number }; blockers: readonly HTMLElement[] }): boolean {
  if (note.hidden) return false;
  if (!o.scene.isConnected || o.scene.clientWidth === 0) return true;
  const sb = o.scene.getBoundingClientRect();
  const rects: Rect[] = o.blockers.filter((b) => b.isConnected && b.offsetWidth > 0).map((b) => b.getBoundingClientRect());
  rects.push({ left: o.head.left, right: o.head.right, top: o.head.y + NOTE_HEAD_OVERLAP, bottom: Infinity }); // 머리 윗 4px 까지는 겹쳐도 됨 (C.350 — 사람 종이인형처럼 머리가 높을 때만 실제로 겹친다)
  const sayText = changeSayText(note);
  for (const withSay of sayText ? [true, false] : [false]) {
    setChangeSay(note, withSay ? sayText : null);
    for (const compact of [false, true]) {
      note.classList.toggle('is-compact', compact);
      note.style.setProperty('--change-dx', '0px');
      const r = note.getBoundingClientRect();
      const fit = changeNoteFit(r, sb, rects, { slide: true, maxSlide: (r.right - r.left) / 2 });
      if (fit) {
        note.style.setProperty('--change-dx', `${fit.dx}px`);
        return true;
      }
    }
  }
  hideChangeNote(note);
  return false;
}

/** 알림 줄이 그린 머리 윗변과 겹쳐도 되는 높이 (C.350 마스터 결정 2: 머리가 높아 박스를 조여도 모자랄 때만 — 머리 윗 2~4px) */
export const NOTE_HEAD_OVERLAP = 4;
/** 알림 줄 아래 ~ 머리 윗변 여유 (숨쉬기 흔들림 1px) — 위 여백 gap + 아래 여백 gap + 이 값 */
export const NOTE_BREATH = 1;

/**
 * 상태창 묶음을 옮길 거리 (C.350 마스터 결정 — C.347 의 '늘 위로 올리기' 대신): 박스 아래 끝 = 그린 머리 윗변 − (알림 한 줄 + 위아래 여백).
 * 즉 박스와 머리 사이는 알림 한 줄이 딱 들어갈 만큼만. + = 위로, − = 아래로(머리 쪽으로). 알림이 없을 때도 같은 자리.
 * lift = 지금 옮긴 거리(다시 잴 때 되돌려 계산 — 다시 재도 같은 값)
 */
export function noteLift(o: { statusBottom: number; drawnTop: number; noteH: number; gap: number; lift: number }): number {
  const natural = o.statusBottom + o.lift; // 안 옮겼을 때 상태창 아래 끝
  const want = o.drawnTop - NOTE_BREATH - o.gap * 2 - o.noteH;
  return Math.ceil(natural - want);
}

/** 그림 한 장(정지 그림)의 첫 안 투명한 줄 비율 — 방에 들어올 때 상태창 자리를 정하는 데 쓴다(캔버스가 그려지기 전에도). undefined = 아직 안 읽음 */
const artRatio = new Map<string, number | null>();
const artLoading = new Map<string, Promise<number | null>>();
export const artTopRatio = (src: string): number | null | undefined => artRatio.get(src);
export function loadArtTopRatio(src: string): Promise<number | null> {
  if (artRatio.has(src)) return Promise.resolve(artRatio.get(src)!);
  let p = artLoading.get(src);
  if (!p) {
    p = new Promise<number | null>((done) => {
      const im = new Image();
      im.onload = () => done(opaqueTopRatio(im, im.naturalWidth, im.naturalHeight));
      im.onerror = () => done(null);
      im.src = src;
    }).then((r) => {
      artRatio.set(src, r);
      return r;
    });
    artLoading.set(src, p);
  }
  return p;
}

/** 그림 위 투명 여백을 뺀 실제 머리 윗변 (화면 y): 캐릭터 몸의 종이인형 캔버스·그림 한 장에서 처음으로 안 투명한 줄. 못 읽으면(그리기 전·jsdom) null */
const imgTop = new Map<string, number | null>();
let canvasMemo: { c: HTMLCanvasElement; at: number; ratio: number | null } | null = null;
function opaqueTopRatio(src: CanvasImageSource, w: number, h: number, g?: CanvasRenderingContext2D | null): number | null {
  if (!w || !h) return null;
  try {
    let ctx = g ?? null;
    if (!ctx) {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      ctx = c.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(src, 0, 0, w, h);
    }
    const d = ctx.getImageData(0, 0, w, h).data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3]! > 24) return y / h;
    return null;
  } catch {
    return null; // 다른 출처 그림 등
  }
}
export function drawnHeadY(char: HTMLElement): number | null {
  const art = char.querySelector<HTMLCanvasElement | HTMLImageElement>('.bha-char__body canvas, .bha-char__body img');
  if (!art) return null;
  const r = art.getBoundingClientRect();
  if (!r.height) return null;
  let ratio: number | null;
  if (art instanceof HTMLCanvasElement) {
    const t = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (canvasMemo && canvasMemo.c === art && t - canvasMemo.at < 1000) ratio = canvasMemo.ratio; // 온천처럼 자주 잴 때 1초 동안 재사용
    else {
      ratio = opaqueTopRatio(art, art.width, art.height, art.getContext('2d'));
      canvasMemo = { c: art, at: t, ratio };
    }
  } else {
    if (!art.complete || !art.naturalWidth) return null;
    if (!imgTop.has(art.src)) imgTop.set(art.src, opaqueTopRatio(art, art.naturalWidth, art.naturalHeight));
    ratio = imgTop.get(art.src) ?? null;
  }
  return ratio === null ? null : r.top + ratio * r.height;
}
