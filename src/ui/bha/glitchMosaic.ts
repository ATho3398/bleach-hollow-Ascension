// 조각 모델 (GDD 12-4 v6.029, C.431 — 사용자 "미싱노마냥 지금 있는 모델들 사각형 모양으로 부위부위 잘라서 그냥 네모난 도트 이미지 하나로. 거기도 막 글리치로 다른 모델 부위랑 바뀌고"):
// 초월자 데이터 model.kind = 'glitchMosaic' 이면 그 초월자의 몸 그림 = 게임 그림 목록(캐릭터·적 도트)에서 자른 사각 조각을 grid 칸에 모은 네모 도트 하나.
// 기본 배치는 시드 고정(늘 같은 모습). 1~3초마다 조각 몇 개가 0.1~0.3초 다른 모델의 같은 크기 조각으로 바뀌었다 돌아온다(가끔 한동안 남음).
// 화면 쪽은 charArt 가 돌려준 표시 주소(mosaicSrc)를 단 <img> 를 앱 루트 관찰자(installMosaic)가 찾아 캔버스 합성 결과(스무딩 끔)로 바꿔 끼운다 —
// 방·상태·월드맵·전투·도감·합체 결과가 같은 길(화면마다 고칠 필요 없음). 동작 줄이기면 기본 모습 고정. 화면에서 빠진 그림은 다음 박자에 놓는다. 종족·초월자 id 분기 없음.
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
/** 타이밍 (ms): 다음 글리치 1~3초 · 바뀐 채 0.1~0.3초 · 가끔 한동안 남음 · 한 번에 바뀌는 조각 수 */
export const MOSAIC_TIMING = { gapMin: 1000, gapMax: 3000, holdMin: 100, holdMax: 300, stickChance: 0.15, stickMs: 1500, swapMin: 1, swapMax: 4 } as const;

/** 조각 원본 = 그림 목록의 캐릭터·적 한 장짜리 그림(초월자 자기 그림 제외). 폴더 그림(애니)은 대기 1장 */
export function mosaicSourceFiles(files: readonly string[] = ART_FILES, defs: readonly TranscendentDef[] = TRANSCENDENTS): string[] {
  const own = defs.map((d) => d.art?.replace(/\./g, '-')).filter((x): x is string => !!x);
  return files.filter((f) => /^(char|enemy)-[^/]+(\.(png|webp)|\/idle-1\.(png|webp))$/.test(f) && !own.some((o) => f.startsWith(o))).sort();
}

/** 칸 하나 = 원본 그림 번호 + 조각 자리(원본을 64칸 격자로 본 좌표, tile 단위) */
export interface MosaicCell { src: number; tx: number; ty: number }

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

/** 한 번의 글리치: 바꿀 칸 번호들과 그 자리에 잠깐 들어갈 다른 조각 */
export function mosaicGlitch(model: MosaicModel, sources: number, rand: () => number = Math.random): { at: number[]; cells: MosaicCell[] } {
  const T = MOSAIC_TIMING;
  const total = model.grid[0] * model.grid[1];
  const n = Math.min(total, T.swapMin + Math.floor(rand() * (T.swapMax - T.swapMin + 1)));
  const left = Array.from({ length: total }, (_, i) => i);
  const at: number[] = [];
  while (at.length < n) at.push(left.splice(Math.floor(rand() * left.length), 1)[0]!);
  const per = Math.max(1, Math.floor(64 / model.tile));
  return { at, cells: at.map(() => ({ src: Math.floor(rand() * Math.max(1, sources)), tx: Math.floor(rand() * per), ty: Math.floor(rand() * per) })) };
}

// ── 화면 (브라우저) ──

interface Driver {
  model: MosaicModel;
  imgs: Set<HTMLImageElement>;
  canvas: HTMLCanvasElement;
  base: MosaicCell[];
  ready: boolean;
  timer: number;
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

function drawCell(ctx: CanvasRenderingContext2D, srcs: readonly HTMLImageElement[], model: MosaicModel, i: number, c: MosaicCell): void {
  const im = srcs[c.src % srcs.length];
  if (!im) return;
  const out = model.tile * MOSAIC_OUT_SCALE;
  const st = (im.naturalWidth / 64) * model.tile; // 원본 화소로 조각 한 변
  const x = (i % model.grid[0]) * out, y = Math.floor(i / model.grid[0]) * out;
  ctx.clearRect(x, y, out, out);
  ctx.drawImage(im, c.tx * st, c.ty * st, st, st, x, y, out, out);
}

function publish(d: Driver): void {
  const url = d.canvas.toDataURL('image/png');
  for (const im of [...d.imgs]) {
    if (!im.isConnected) { d.imgs.delete(im); continue; }
    im.dataset.mosaicLive = '1';
    im.src = url;
  }
}

function drawAll(d: Driver, srcs: readonly HTMLImageElement[], cells: readonly MosaicCell[]): void {
  const ctx = d.canvas.getContext('2d');
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;
  cells.forEach((c, i) => drawCell(ctx, srcs, d.model, i, c));
}

/** 고정(캡처): 시드 고정 글리치 한 장면 */
function frozenFrame(d: Driver, srcs: number): MosaicCell[] {
  const r = createRng(d.model.seed + 1);
  const cells = [...d.base];
  for (let k = 0; k < 2; k++) { // 캡처에서 보이게 두 번 겹친 장면 (조각 2~8개)
    const g = mosaicGlitch(d.model, srcs, () => nextFloat(r));
    g.at.forEach((i, j) => { cells[i] = g.cells[j]!; });
  }
  return cells;
}

function schedule(d: Driver, srcs: readonly HTMLImageElement[]): void {
  const T = MOSAIC_TIMING;
  d.timer = window.setTimeout(() => {
    for (const im of [...d.imgs]) if (!im.isConnected) d.imgs.delete(im);
    if (d.imgs.size === 0) { d.timer = 0; return; } // 화면에서 빠졌다 — 멈춤 (다시 붙으면 attach 가 깨운다)
    if (glitchFrozen() || prefersReducedMotion()) { schedule(d, srcs); return; }
    const g = mosaicGlitch(d.model, srcs.length);
    const cells = [...d.base];
    g.at.forEach((i, k) => { cells[i] = g.cells[k]!; });
    drawAll(d, srcs, cells);
    publish(d);
    const hold = Math.random() < T.stickChance ? T.stickMs : T.holdMin + Math.random() * (T.holdMax - T.holdMin);
    d.timer = window.setTimeout(() => {
      if (!glitchFrozen()) { drawAll(d, srcs, d.base); publish(d); }
      schedule(d, srcs);
    }, hold);
  }, T.gapMin + Math.random() * (T.gapMax - T.gapMin));
}

function solidChecker(srcs: readonly HTMLImageElement[], tile: number): (s: number, tx: number, ty: number) => boolean {
  const cv = document.createElement('canvas');
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  return (s, tx, ty) => {
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
  };
}

function driverFor(id: string): Driver | null {
  const def = TRANSCENDENTS.find((t) => t.id === id);
  if (!def?.model) return null;
  let d = drivers.get(id);
  if (d) return d;
  const canvas = document.createElement('canvas');
  canvas.width = def.model.grid[0] * def.model.tile * MOSAIC_OUT_SCALE;
  canvas.height = def.model.grid[1] * def.model.tile * MOSAIC_OUT_SCALE;
  d = { model: def.model, imgs: new Set(), canvas, base: [], ready: false, timer: 0 };
  drivers.set(id, d);
  const drv = d;
  void loadSources().then((srcs) => {
    if (srcs.length === 0) return;
    drv.base = mosaicLayout(drv.model, srcs.length, solidChecker(srcs, drv.model.tile));
    drv.ready = true;
    drawAll(drv, srcs, glitchFrozen() ? frozenFrame(drv, srcs.length) : drv.base);
    publish(drv);
    if (!drv.timer) schedule(drv, srcs);
    onGlitchFreeze((on) => { drawAll(drv, srcs, on ? frozenFrame(drv, srcs.length) : drv.base); publish(drv); });
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
    if (!d.timer) void loadSources().then((srcs) => { if (!d.timer) schedule(d, srcs); });
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
