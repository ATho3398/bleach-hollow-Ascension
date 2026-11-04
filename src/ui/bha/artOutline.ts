// 그림 윤곽 미리 굽기 (GDD 186장 1, C.288): 월드맵 장소 그림의 윤곽(--bha-art-outline = drop-shadow 9겹, 182장 4)은
// CSS filter 로 두면 캐릭터가 걷거나 화면이 바뀌어 장면이 다시 그려질 때마다 9겹을 새로 계산한다(폰에서 걷기·페이드 렉의 주범).
// 그림이 한 번 그려지면 같은 drop-shadow 를 캔버스 그림자(shadowColor·Offset·Blur)로 한 겹씩 한 번만 그려 그 결과를 그림 위에 얹고 원본 img 는 숨긴다.
// 캔버스 그림자 = drop-shadow 와 같은 셈(그림 모양 그림자를 아래에 깔고 그 위에 그림) — 픽셀까지 같다(shadowBlur = 흐림 × 2).
// ctx.filter 로 9겹을 한 번에 거는 방법은 저사양(소프트웨어 캔버스)에서 그림당 수백 ms 라 쓰지 않는다. 구운 결과는 화면을 다시 열 때 재사용한다.
// drop-shadow 밖의 filter 가 섞였거나 못 읽으면 CSS filter 그대로(모양 같음, 예전 속도). 크기가 바뀌면(장면 축소·회전) 다시 굽는다.

import { containBottom, parseDropShadows, shadowChain, type BakeJob, type DropShadow } from './artOutlineCore';

export { containBottom, parseDropShadows } from './artOutlineCore';

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type Surface = HTMLCanvasElement | OffscreenCanvas;

/** 굽기 여백(CSS px): 윤곽 2px + 아래 그림자 4px·흐림 1px 이 다 들어가게 */
const PAD = 8;

/** 구운 결과 (그림 주소·크기·배율·filter → 그림) — 월드맵을 다시 열 때 다시 굽지 않는다 */
type Baked = HTMLCanvasElement | ImageBitmap;
const baked = new Map<string, Baked>();
const BAKED_MAX = 64;
function remember(key: string, b: Baked): void {
  if (baked.size >= BAKED_MAX) baked.delete(baked.keys().next().value!);
  baked.set(key, b);
}

// 굽기는 되도록 Worker(OffscreenCanvas)에서 — 메인 스레드(화면 그리기)를 막지 않는다. 못 쓰면 화면 스레드에서
let worker: Worker | null | undefined;
const waiting = new Map<number, (b: ImageBitmap | null) => void>();
let nextId = 1;
function bakeWorker(): Worker | null {
  if (worker !== undefined) return worker;
  worker = null;
  try {
    if (typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap === 'function') {
      const w = new Worker(new URL('./artOutline.worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<{ id: number; bitmap: ImageBitmap | null }>) => {
        waiting.get(e.data.id)?.(e.data.bitmap);
        waiting.delete(e.data.id);
      };
      w.onerror = () => {
        worker = null; // 다음부터 화면 스레드에서
        for (const done of waiting.values()) done(null);
        waiting.clear();
      };
      worker = w;
    }
  } catch {
    worker = null;
  }
  return worker;
}

function jobOf(img: HTMLImageElement, w: number, h: number, dpr: number, shadows: readonly DropShadow[]): BakeJob {
  const r = containBottom(w, h, img.naturalWidth, img.naturalHeight);
  return { cw: Math.round((w + PAD * 2) * dpr), ch: Math.round((h + PAD * 2) * dpr), x: (PAD + r.x) * dpr, y: (PAD + r.y) * dpr, w: r.w * dpr, h: r.h * dpr, dpr, shadows };
}

function bakeHere(img: HTMLImageElement, job: BakeJob): HTMLCanvasElement | null {
  const make = (w: number, h: number): [Surface, Ctx2D | null] => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return [c, c.getContext('2d')];
  };
  return shadowChain(make, img, job) as HTMLCanvasElement | null;
}

async function bakeOff(img: HTMLImageElement, job: BakeJob): Promise<Baked | null> {
  const w = bakeWorker();
  if (!w) return bakeHere(img, job);
  const bitmap = await createImageBitmap(img);
  const out = await new Promise<ImageBitmap | null>((done) => {
    const id = nextId++;
    waiting.set(id, done);
    w.postMessage({ id, bitmap, job }, [bitmap]);
  });
  return out ?? bakeHere(img, job);
}

/** 구운 그림을 그림 위 캔버스에 놓는다 */
function paint(img: HTMLImageElement, canvas: HTMLCanvasElement, src: Baked, w: number, h: number): boolean {
  canvas.width = src.width;
  canvas.height = src.height;
  const g = canvas.getContext('2d');
  if (!g) return false;
  g.drawImage(src, 0, 0);
  canvas.style.left = `${img.offsetLeft - PAD}px`;
  canvas.style.top = `${img.offsetTop - PAD}px`;
  canvas.style.width = `${w + PAD * 2}px`;
  canvas.style.height = `${h + PAD * 2}px`;
  return true;
}

/** 굽기 줄: 한 프레임에 하나씩 (여러 장을 한 프레임에 구워 긴 멈춤이 생기지 않게) */
const queue: Array<() => void> = [];
let queued = false;
function enqueue(job: () => void): void {
  if (!queue.includes(job)) queue.push(job);
  if (queued) return;
  queued = true;
  const step = () => {
    queue.shift()?.();
    if (queue.length) requestAnimationFrame(step);
    else queued = false;
  };
  requestAnimationFrame(step);
}

/** img 의 지금 CSS filter(윤곽)를 캔버스에 한 번 구워 얹는다. filter 가 없거나 drop-shadow 만이 아니면 아무것도 안 한다 */
export function bakeArtOutline(img: HTMLImageElement): void {
  if (typeof document === 'undefined' || img.dataset.baked !== undefined) return;
  img.dataset.baked = '';
  const canvas = document.createElement('canvas');
  canvas.className = 'bha-art-baked';
  canvas.setAttribute('aria-hidden', 'true');
  let filter = '';
  let shadows: DropShadow[] | null = null;
  let size = '';
  let busy = false;
  const run = () => {
    if (!img.isConnected || busy) return;
    if (!shadows) {
      filter = getComputedStyle(img).filter;
      shadows = parseDropShadows(filter);
      if (!shadows) return; // 없거나 다른 filter: CSS 그대로
    }
    const w = img.clientWidth, h = img.clientHeight;
    if (!w || !h || !img.naturalWidth || !img.naturalHeight) return;
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const now = `${w}x${h}x${dpr}`;
    if (now === size) return;
    const key = `${img.currentSrc || img.src}|${now}|${filter}`;
    const show = (b: Baked | null | undefined) => {
      if (!b || !img.isConnected || `${img.clientWidth}x${img.clientHeight}x${dpr}` !== now) return;
      if (!paint(img, canvas, b, w, h)) return;
      size = now;
      if (!canvas.isConnected) img.after(canvas);
      img.classList.add('is-baked');
    };
    const hit = baked.get(key);
    if (hit) return show(hit);
    busy = true;
    bakeOff(img, jobOf(img, w, h, dpr, shadows))
      .then((b) => {
        if (b) remember(key, b);
        show(b);
      })
      .catch(() => undefined) // 그림을 못 읽음: CSS filter 그대로
      .finally(() => {
        busy = false;
        if (size !== `${img.clientWidth}x${img.clientHeight}x${dpr}`) enqueue(run); // 굽는 동안 크기가 바뀌었으면 다시
      });
  };
  const start = () => {
    // 원본 그림 디코딩은 먼저 비동기로(메인 스레드 밖) — 캔버스에 그릴 때 그 자리에서 디코딩하면 첫 진입이 멈칫했다.
    // 그 뒤 배치(layoutOnFloor 의 --room-fit)가 끝난 다음 프레임에, 한 프레임에 한 장씩 굽는다
    const go = () => {
      enqueue(run);
      if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => enqueue(run)).observe(img);
    };
    if (typeof img.decode === 'function') img.decode().then(go, go);
    else go();
  };
  if (img.complete && img.naturalWidth) start();
  else img.addEventListener('load', start, { once: true });
}
