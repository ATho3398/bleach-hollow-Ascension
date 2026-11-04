// 그림 윤곽 굽기 공용 (GDD 186장 1): 화면(artOutline.ts)과 Worker(artOutline.worker.ts)가 같이 쓴다 — DOM 을 건드리지 않는다

export interface DropShadow { color: string; x: number; y: number; blur: number }

/** 계산값 filter("drop-shadow(rgba(0, 0, 0, 0.9) 1px 0px 0px) …")를 drop-shadow 목록으로. drop-shadow 만이 아니면 null */
export function parseDropShadows(filter: string): DropShadow[] | null {
  const re = /drop-shadow\(\s*((?:rgba?|hsla?)\([^)]*\)|#[0-9a-fA-F]+|[a-zA-Z]+)\s+(-?[\d.]+)px\s+(-?[\d.]+)px(?:\s+([\d.]+)px)?\s*\)/g;
  const out: DropShadow[] = [];
  let rest = filter;
  for (const m of filter.matchAll(re)) {
    out.push({ color: m[1]!, x: Number(m[2]), y: Number(m[3]), blur: Number(m[4] ?? 0) });
    rest = rest.replace(m[0], '');
  }
  return out.length && rest.trim() === '' ? out : null;
}

/** object-fit: contain · object-position: 50% 100% 자리 (room.css .bha-prop__img) */
export function containBottom(boxW: number, boxH: number, natW: number, natH: number): { x: number; y: number; w: number; h: number } {
  const k = Math.min(boxW / natW, boxH / natH);
  const w = natW * k, h = natH * k;
  return { x: (boxW - w) / 2, y: boxH - h, w, h };
}

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type Surface = HTMLCanvasElement | OffscreenCanvas;
/** 굽기 일감: 결과 캔버스 크기(기기 px), 그림 자리(기기 px), 기기 배율, drop-shadow 목록 */
export interface BakeJob { cw: number; ch: number; x: number; y: number; w: number; h: number; dpr: number; shadows: readonly DropShadow[] }

/** drop-shadow 를 한 겹씩: 지금 그림을 그 그림자와 함께 새 캔버스에 (그림자 아래, 그림 위). 화면·Worker(OffscreenCanvas) 공용 */
export function shadowChain(make: (w: number, h: number) => [Surface, Ctx2D | null], src: CanvasImageSource, job: BakeJob): Surface | null {
  let [cur, g0] = make(job.cw, job.ch);
  if (!g0) return null;
  g0.imageSmoothingEnabled = false; // image-rendering: pixelated 과 같게
  g0.drawImage(src, job.x, job.y, job.w, job.h);
  for (const d of job.shadows) {
    const [next, g] = make(job.cw, job.ch);
    if (!g) return null;
    g.imageSmoothingEnabled = false;
    g.shadowColor = d.color;
    g.shadowOffsetX = d.x * job.dpr;
    g.shadowOffsetY = d.y * job.dpr;
    g.shadowBlur = d.blur * job.dpr * 2; // 캔버스 shadowBlur = 표준편차 × 2, drop-shadow 의 흐림 길이 = 표준편차
    g.drawImage(cur, 0, 0);
    cur = next;
  }
  return cur;
}
