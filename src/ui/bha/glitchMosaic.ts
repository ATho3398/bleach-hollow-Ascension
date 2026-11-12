// 조각 모델 (GDD 12-4 v6.029, C.431 — 사용자 "미싱노마냥 지금 있는 모델들 사각형 모양으로 부위부위 잘라서 그냥 네모난 도트 이미지 하나로. 거기도 막 글리치로 다른 모델 부위랑 바뀌고"):
// 초월자 데이터 model.kind = 'glitchMosaic' 이면 그 초월자의 몸 그림 = 게임 그림 목록(캐릭터·적 도트)에서 자른 사각 조각을 grid 칸에 모은 네모 도트 하나.
// 움직임 (GDD 12-4 v6.043, C.437 — 사용자 "글리치라기보단 계속해서 블록들이 랜덤한 느낌으로 바뀌는 게 재밌을 듯, 가다가 모노톤이나 흑백도 막 나오고"):
// 처음은 시드 고정 기본 모습, 그 뒤 churnMs 마다 swap 개 조각이 다른 모델 조각으로 바뀌고 기본으로 돌아가지 않는다. 바뀌는 조각 중 monoChance 는 흑백 또는
// 모노톤(monoTokens 디자인 토큰 색 하나), fullMonoEveryMs 마다 몸 전체가 fullMonoHoldMs 동안 흑백/모노톤. 수치는 모두 데이터(transcendents.json model).
// 화면 쪽은 charArt 가 돌려준 표시 주소(mosaicSrc)를 단 <img> 를 앱 루트 관찰자(installMosaic)가 찾아 캔버스 합성 결과(스무딩 끔)로 바꿔 끼운다 —
// 방·상태·월드맵·전투·도감·합체 결과가 같은 길(화면마다 고칠 필요 없음). 동작 줄이기면 기본 모습 고정. 화면에서 빠지면 타이머 멈춤. 종족·초월자 id 분기 없음.
import { ART_FILES } from '../../data/art/files';
import { MOSAIC_MARK, mosaicIdOf } from '../../data/art/manifest';
export { MOSAIC_MARK, mosaicIdOf, mosaicSrc } from '../../data/art/manifest';
import { TRANSCENDENTS, type TranscendentDef } from '../../data/transcendents';
import { createRng, nextFloat, nextInt } from '../../engine/rng';
import { prefersReducedMotion } from '../fxSettings';
import { glitchFrozen, onGlitchFreeze } from './glitchName';

export type MosaicModel = NonNullable<TranscendentDef['model']>;

/** 원본 64칸 기준 → 출력 배율 (256 도트 원본을 1:1 로 자른다) */
export const MOSAIC_OUT_SCALE = 4;
/** 조각 원본 = 그림 목록의 캐릭터·적 한 장짜리 그림(초월자 자기 그림 제외). 폴더 그림(애니)은 대기 1장 */
export function mosaicSourceFiles(files: readonly string[] = ART_FILES, defs: readonly TranscendentDef[] = TRANSCENDENTS): string[] {
  const own = defs.map((d) => d.art?.replace(/\./g, '-')).filter((x): x is string => !!x);
  return files.filter((f) => /^(char|enemy)-[^/]+(\.(png|webp)|\/idle-1\.(png|webp))$/.test(f) && !own.some((o) => f.startsWith(o))).sort();
}

/** 칸 하나 = 원본 그림 번호 + 조각 자리(원본을 64칸 격자로 본 좌표, tile 단위) */
/** tone: 없으면 원래 색, -1 = 흑백(회색조), 0 이상 = model.monoTokens 의 그 색 모노톤 */
export interface MosaicCell { src: number; tx: number; ty: number; tone?: number }

/** 시드 고정 기본 배치: 칸마다 원본·조각을 고른다. solid(원본, tx, ty) 가 거짓이면(거의 투명한 조각) 몇 번 다시 고른다 */
export function mosaicLayout(model: MosaicModel, sources: number, solid: (src: number, tx: number, ty: number) => boolean = () => true): MosaicCell[] {
  const rng = createRng(model.seed);
  const per = Math.max(1, Math.floor(64 / model.tile)); // 원본 한 변의 조각 수
  const cells: MosaicCell[] = [];
  const [w, h] = model.grid;
  for (let i = 0; i < w * h; i++) {
    let c: MosaicCell = { src: 0, tx: 0, ty: 0 };
    for (let k = 0; k < 12; k++) {
      c = { src: nextInt(rng, Math.max(1, sources)), tx: nextInt(rng, per), ty: nextInt(rng, per) };
      if (solid(c.src, c.tx, c.ty)) break;
    }
    cells.push(c);
  }
  return cells;
}

const span = (r: readonly [number, number], rand: () => number) => r[0] + rand() * (r[1] - r[0]);

/** 흑백/모노톤 하나 고르기: 반은 흑백(-1), 반은 토큰 색 하나 */
export function mosaicPickTone(model: MosaicModel, rand: () => number = Math.random): number {
  return rand() < 0.5 ? -1 : Math.floor(rand() * model.monoTokens.length);
}

/** 한 번의 교체: 바꿀 칸 번호들(서로 다름, swap 범위)과 그 자리에 들어갈 다른 조각 — monoChance 로 흑백/모노톤 */
/** solid = 기본 배치와 같은 '조각의 40% 이상이 그림' 검사 (C.438 — 교체 조각도 거의 빈 조각은 다시 고른다, 최대 12번) */
export function mosaicChurn(model: MosaicModel, sources: number, rand: () => number = Math.random, solid: (src: number, tx: number, ty: number) => boolean = () => true): { at: number[]; cells: MosaicCell[] } {
  const total = model.grid[0] * model.grid[1];
  const [lo, hi] = model.swap;
  const n = Math.min(total, lo + Math.floor(rand() * (hi - lo + 1)));
  const left = Array.from({ length: total }, (_, i) => i);
  const at: number[] = [];
  while (at.length < n) at.push(left.splice(Math.floor(rand() * left.length), 1)[0]!);
  const per = Math.max(1, Math.floor(64 / model.tile));
  return {
    at,
    cells: at.map(() => {
      let c: MosaicCell = { src: 0, tx: 0, ty: 0 };
      for (let k = 0; k < 12; k++) {
        c = { src: Math.floor(rand() * Math.max(1, sources)), tx: Math.floor(rand() * per), ty: Math.floor(rand() * per) };
        if (solid(c.src, c.tx, c.ty)) break;
      }
      if (rand() < model.monoChance) c.tone = mosaicPickTone(model, rand);
      return c;
    }),
  };
}

/** 다음 교체까지 · 다음 몸 전체 흑백까지 · 그 지속 (ms) */
export function mosaicDelays(model: MosaicModel, rand: () => number = Math.random): { churn: number; fullEvery: number; fullHold: number } {
  return { churn: span(model.churnMs, rand), fullEvery: span(model.fullMonoEveryMs, rand), fullHold: span(model.fullMonoHoldMs, rand) };
}

/** 화소 색 바꾸기 (RGBA 배열 제자리): rgb 없으면 흑백, 있으면 밝기 → 어둠·그 색·밝음 3단 모노톤. 투명도는 그대로 */
export function mosaicTonePixels(px: Uint8ClampedArray, rgb: readonly [number, number, number] | null): void {
  for (let i = 0; i < px.length; i += 4) {
    const l = (px[i]! * 0.299 + px[i + 1]! * 0.587 + px[i + 2]! * 0.114) / 255;
    for (let k = 0; k < 3; k++) {
      const c = rgb ? rgb[k]! : 128;
      px[i + k] = rgb ? (l < 0.5 ? c * l * 2 : c + (255 - c) * (l - 0.5) * 2) : l * 255;
    }
  }
}

/** 칸 바탕 채우기 (C.438 — 몸이 늘 꽉 찬 네모 덩어리): 투명 화소를 그 조각 그림 화소 평균색 × darken 바탕 위에 합성, 모두 불투명.
 *  그림 화소가 하나도 없으면 바탕 = 검정 × darken 쪽(0) */
export function mosaicFillCell(px: Uint8ClampedArray, darken: number): void {
  let r = 0, g = 0, b = 0, w = 0;
  for (let i = 0; i < px.length; i += 4) { const a = px[i + 3]! / 255; r += px[i]! * a; g += px[i + 1]! * a; b += px[i + 2]! * a; w += a; }
  const bg = w > 0 ? [r / w * darken, g / w * darken, b / w * darken] : [0, 0, 0];
  for (let i = 0; i < px.length; i += 4) {
    const a = px[i + 3]! / 255;
    for (let k = 0; k < 3; k++) px[i + k] = px[i + k]! * a + bg[k]! * (1 - a);
    px[i + 3] = 255;
  }
}

/** '#rrggbb' / '#rgb' → [r,g,b] (못 읽으면 null = 흑백) */
export function parseHexColor(v: string): [number, number, number] | null {
  const h = v.trim().replace(/^#/, '');
  const full = h.length === 3 ? h.split('').map((x) => x + x).join('') : h;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  return [0, 2, 4].map((o) => parseInt(full.slice(o, o + 2), 16)) as [number, number, number];
}

// ── 화면 (브라우저) ──

interface Driver {
  model: MosaicModel;
  imgs: Set<HTMLImageElement>;
  canvas: HTMLCanvasElement;
  /** 몸 전체 흑백/모노톤일 때 내보내는 캔버스 */
  fx: HTMLCanvasElement;
  base: MosaicCell[];
  /** 지금 모습 (교체가 쌓인다 — 기본으로 돌아가지 않음) */
  cells: MosaicCell[];
  atBase: boolean;
  ready: boolean;
  timer: number;
  /** 몸 전체 흑백/모노톤: 지금 tone(null = 아님) · 끝/다음 시각(performance.now) */
  full: number | null;
  fullUntil: number;
  nextFull: number;
  /** 조각이 그림으로 차 있나 (기본 배치·교체 같은 검사, 결과 기억) */
  solid: (s: number, tx: number, ty: number) => boolean;
}

const BASE = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
const drivers = new Map<string, Driver>();
let sourceImgs: Promise<HTMLImageElement[]> | null = null;

function loadSources(): Promise<HTMLImageElement[]> {
  sourceImgs ??= Promise.all(mosaicSourceFiles().map((f) => new Promise<HTMLImageElement | null>((res) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => res(null);
    im.src = `${BASE}art/${f}`;
  }))).then((l) => l.filter((x): x is HTMLImageElement => x !== null && x.naturalWidth > 0));
  return sourceImgs;
}

/** 모노톤 색 = 디자인 토큰 값 (없으면 흑백) */
function toneRgb(model: MosaicModel, tone: number): [number, number, number] | null {
  if (tone < 0 || typeof getComputedStyle === 'undefined') return null;
  const name = model.monoTokens[tone % model.monoTokens.length];
  return name ? parseHexColor(getComputedStyle(document.documentElement).getPropertyValue(name)) : null;
}

function drawCell(ctx: CanvasRenderingContext2D, srcs: readonly HTMLImageElement[], model: MosaicModel, i: number, c: MosaicCell): void {
  const im = srcs[c.src % srcs.length];
  if (!im) return;
  const out = model.tile * MOSAIC_OUT_SCALE;
  const st = (im.naturalWidth / 64) * model.tile; // 원본 화소로 조각 한 변
  const x = (i % model.grid[0]) * out, y = Math.floor(i / model.grid[0]) * out;
  ctx.clearRect(x, y, out, out);
  ctx.drawImage(im, c.tx * st, c.ty * st, st, st, x, y, out, out);
  const data = ctx.getImageData(x, y, out, out);
  mosaicFillCell(data.data, model.cellBgDarken); // 칸 바탕까지 채워 늘 꽉 찬 네모 (C.438)
  if (c.tone !== undefined) mosaicTonePixels(data.data, toneRgb(model, c.tone)); // 모노톤·흑백은 바탕까지 같이
  ctx.putImageData(data, x, y);
}

function ctxOf(cv: HTMLCanvasElement): CanvasRenderingContext2D | null {
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  if (ctx) ctx.imageSmoothingEnabled = false;
  return ctx;
}

/** 바뀐 칸만 다시 그린다 (at 없으면 전부) */
function drawCells(d: Driver, srcs: readonly HTMLImageElement[], cells: readonly MosaicCell[], at?: readonly number[]): void {
  const ctx = ctxOf(d.canvas);
  if (!ctx) return;
  for (const i of at ?? cells.map((_, k) => k)) drawCell(ctx, srcs, d.model, i, cells[i]!);
}

function publish(d: Driver, tone: number | null = d.full): void {
  let cv = d.canvas;
  if (tone !== null) { // 몸 전체 흑백/모노톤 = 지금 그림을 한 번 더 걸러서
    const ctx = ctxOf(d.fx);
    if (ctx) {
      ctx.clearRect(0, 0, d.fx.width, d.fx.height);
      ctx.drawImage(d.canvas, 0, 0);
      const data = ctx.getImageData(0, 0, d.fx.width, d.fx.height);
      mosaicTonePixels(data.data, toneRgb(d.model, tone));
      ctx.putImageData(data, 0, 0);
      cv = d.fx;
    }
  }
  const url = cv.toDataURL('image/png');
  for (const im of [...d.imgs]) {
    if (!im.isConnected) { d.imgs.delete(im); continue; }
    im.dataset.mosaicLive = '1';
    im.dataset.mosaicFull = tone === null ? '' : tone < 0 ? 'gray' : 'mono';
    im.dataset.mosaicMono = String(d.cells.filter((c) => c.tone !== undefined).length);
    im.src = url;
  }
}

/** 고정(캡처): 시드 고정 한 장면 — 기본 모습에서 조각 여럿이 바뀌고 흑백·모노톤 조각이 섞인 모습 */
export function mosaicFrozenCells(model: MosaicModel, base: readonly MosaicCell[], sources: number, solid?: (src: number, tx: number, ty: number) => boolean): MosaicCell[] {
  const r = createRng(model.seed + 1);
  const cells = [...base];
  const changed: number[] = [];
  for (let k = 0; k < 6; k++) {
    const g = mosaicChurn(model, sources, () => nextFloat(r), solid);
    g.at.forEach((i, j) => { cells[i] = g.cells[j]!; changed.push(i); });
  }
  // 캡처에서 보이게: 바뀐 조각 중 둘은 흑백·모노톤
  if (changed[0] !== undefined) cells[changed[0]] = { ...cells[changed[0]]!, tone: -1 };
  if (changed[1] !== undefined && changed[1] !== changed[0]) cells[changed[1]] = { ...cells[changed[1]]!, tone: 0 };
  return cells;
}

function showFrozen(d: Driver, srcs: readonly HTMLImageElement[]): void {
  const cells = mosaicFrozenCells(d.model, d.base, srcs.length, d.solid);
  drawCells(d, srcs, cells);
  publish(d, null);
}

function tick(d: Driver, srcs: readonly HTMLImageElement[]): void {
  for (const im of [...d.imgs]) if (!im.isConnected) d.imgs.delete(im);
  if (d.imgs.size === 0) { d.timer = 0; return; } // 화면에서 빠졌다 — 멈춤 (다시 붙으면 attach 가 깨운다)
  const dl = mosaicDelays(d.model);
  d.timer = window.setTimeout(() => tick(d, srcs), dl.churn);
  if (glitchFrozen()) return;
  if (prefersReducedMotion()) { // 동작 줄이기 = 기본 모습 고정
    if (!d.atBase || d.full !== null) { d.cells = [...d.base]; d.atBase = true; d.full = null; drawCells(d, srcs, d.cells); publish(d); }
    return;
  }
  const now = performance.now();
  if (d.full !== null && now >= d.fullUntil) { d.full = null; d.nextFull = now + dl.fullEvery; }
  else if (d.full === null && now >= d.nextFull) { d.full = mosaicPickTone(d.model); d.fullUntil = now + dl.fullHold; }
  const g = mosaicChurn(d.model, srcs.length, Math.random, d.solid);
  g.at.forEach((i, k) => { d.cells[i] = g.cells[k]!; });
  d.atBase = false;
  drawCells(d, srcs, d.cells, g.at);
  publish(d);
}

function wake(d: Driver, srcs: readonly HTMLImageElement[]): void {
  if (d.timer) return;
  if (!d.nextFull) d.nextFull = performance.now() + mosaicDelays(d.model).fullEvery;
  d.timer = window.setTimeout(() => tick(d, srcs), mosaicDelays(d.model).churn);
}

function solidChecker(srcs: readonly HTMLImageElement[], tile: number): (s: number, tx: number, ty: number) => boolean {
  const cv = document.createElement('canvas');
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const memo = new Map<string, boolean>();
  return (s, tx, ty) => {
    const key = `${s}:${tx}:${ty}`;
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    const v = check(s, tx, ty);
    memo.set(key, v);
    return v;
  };
  function check(s: number, tx: number, ty: number): boolean {
    const im = srcs[s];
    if (!im || !ctx) return true;
    const st = Math.max(1, Math.round((im.naturalWidth / 64) * tile));
    cv.width = st; cv.height = st;
    ctx.clearRect(0, 0, st, st);
    ctx.drawImage(im, tx * st, ty * st, st, st, 0, 0, st, st);
    const px = ctx.getImageData(0, 0, st, st).data;
    let on = 0;
    for (let i = 3; i < px.length; i += 4) if (px[i]! > 32) on++;
    return on / (st * st) >= 0.4; // 조각의 40% 이상이 그림
  }
}

function driverFor(id: string): Driver | null {
  const def = TRANSCENDENTS.find((t) => t.id === id);
  if (!def?.model) return null;
  let d = drivers.get(id);
  if (d) return d;
  const mk = () => {
    const cv = document.createElement('canvas');
    cv.width = def.model!.grid[0] * def.model!.tile * MOSAIC_OUT_SCALE;
    cv.height = def.model!.grid[1] * def.model!.tile * MOSAIC_OUT_SCALE;
    return cv;
  };
  d = { model: def.model, imgs: new Set(), canvas: mk(), fx: mk(), base: [], cells: [], atBase: true, ready: false, timer: 0, full: null, fullUntil: 0, nextFull: 0, solid: () => true };
  drivers.set(id, d);
  const drv = d;
  void loadSources().then((srcs) => {
    if (srcs.length === 0) return;
    drv.solid = solidChecker(srcs, drv.model.tile);
    drv.base = mosaicLayout(drv.model, srcs.length, drv.solid);
    drv.cells = [...drv.base];
    drv.ready = true;
    if (glitchFrozen()) showFrozen(drv, srcs);
    else { drawCells(drv, srcs, drv.cells); publish(drv); }
    wake(drv, srcs);
    onGlitchFreeze((on) => {
      if (on) { drv.full = null; showFrozen(drv, srcs); }
      else { drawCells(drv, srcs, drv.cells); publish(drv); }
    });
  });
  return d;
}

function attach(im: HTMLImageElement): void {
  const id = mosaicIdOf(im.getAttribute('src'));
  if (!id) return;
  const d = driverFor(id);
  if (!d) return;
  d.imgs.add(im);
  im.classList.add('bha-mosaic');
  if (d.ready) {
    publish(d);
    if (!d.timer) void loadSources().then((srcs) => wake(d, srcs));
  }
}

function scan(node: Node): void {
  if (node instanceof HTMLImageElement) { attach(node); return; }
  if (node instanceof Element) node.querySelectorAll<HTMLImageElement>(`img[src*="${MOSAIC_MARK}"]`).forEach(attach);
}

/** 앱 루트 하나에 건다 (C.431): 조각 모델 표시 주소를 단 그림을 찾아 합성 그림으로 */
export function installMosaic(root: Node = document.body): () => void {
  if (!TRANSCENDENTS.some((t) => t.model) || typeof MutationObserver === 'undefined') return () => {};
  scan(root);
  const mo = new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'attributes') scan(m.target);
      else m.addedNodes.forEach(scan);
    }
  });
  mo.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
  return () => mo.disconnect();
}
