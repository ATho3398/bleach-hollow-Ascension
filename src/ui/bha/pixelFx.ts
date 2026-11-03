// pixelfx 스프라이트 시트 재생기 (C.249): `npm run fx` 가 public/fx/ 에 넣은 시트(PNG + 작은 JSON)를 DOM/CSS 로 재생한다.
// 그림 한 장(div 배경)의 background-position 을 프레임마다 옮긴다 — canvas·외부 라이브러리 없음(기획서 11-1).
// 위쪽(frameAt·framePos·pivotBox)은 DOM 없는 순수 함수라 단위 테스트한다 (tests/c249.test.ts).

/** public/fx/<name>.json (scripts/pixelfx/fx.mjs compactSheet 와 같은 모양) */
export interface PixelFxSheet {
  name: string;
  /** pixelfx 안의 id (분류/이름) */
  id: string;
  /** 렌더한 pixelfx 커밋 (짧은 해시) */
  pixelfx: string;
  image: string;
  /** 한 프레임 크기 [w, h] (그림 픽셀) */
  frame: [number, number];
  columns: number;
  frames: number;
  /** 프레임마다 보이는 시간(ms) */
  durations: number[];
  loop: boolean;
  /** 프레임 안의 기준점 [x, y] — 보통 발밑·맞은 곳. 이 점을 놓을 자리에 맞춘다 */
  pivot: [number, number];
}

export interface PixelFxIndex {
  pixelfx: { version: string; commit: string };
  effects: { name: string; id: string; options?: Record<string, unknown>; seed?: number }[];
}

/** 한 바퀴 길이(ms) */
export function sheetDurationMs(s: Pick<PixelFxSheet, 'durations'>): number {
  return s.durations.reduce((a, b) => a + b, 0);
}

/** tMs 에 보일 프레임 번호. 한 번 재생이 끝났으면 -1, 반복이면 처음으로 돈다 */
export function frameAt(durations: readonly number[], tMs: number, loop: boolean): number {
  const total = durations.reduce((a, b) => a + b, 0);
  if (!durations.length || total <= 0) return -1;
  let t = Math.max(0, tMs);
  if (t >= total) {
    if (!loop) return -1;
    t %= total;
  }
  for (let i = 0; i < durations.length; i++) {
    if (t < durations[i]!) return i;
    t -= durations[i]!;
  }
  return durations.length - 1;
}

/** 프레임 i 의 시트 안 왼쪽 위 (그림 픽셀) */
export function framePos(s: Pick<PixelFxSheet, 'frame' | 'columns'>, i: number): [number, number] {
  return [(i % s.columns) * s.frame[0], Math.floor(i / s.columns) * s.frame[1]];
}

/** 기준점을 (x, y) 에 놓을 때 상자 (화면 px). scale = 그림 1픽셀당 화면 px, flip = 좌우 반전 */
export function pivotBox(s: Pick<PixelFxSheet, 'frame' | 'pivot'>, x: number, y: number, scale: number, flip = false): { left: number; top: number; width: number; height: number } {
  const px = flip ? s.frame[0] - s.pivot[0] : s.pivot[0];
  return { left: x - px * scale, top: y - s.pivot[1] * scale, width: s.frame[0] * scale, height: s.frame[1] * scale };
}

/** 시트를 Web Animations 키프레임으로 (C.268, GDD 180장): 프레임마다 배경 위치를 계단식으로 옮긴다.
 *  전투 연출(attackFx)이 이걸 track() 해서 배속·일시정지·지우기를 다른 연출과 같이 따른다. 길이 = sheetDurationMs */
export function pixelFxKeyframes(s: Pick<PixelFxSheet, 'frame' | 'columns' | 'durations'>, scale: number): Keyframe[] {
  const total = sheetDurationMs(s);
  const out: Keyframe[] = [];
  let t = 0;
  s.durations.forEach((d, i) => {
    const [fx, fy] = framePos(s, i);
    out.push({ offset: total > 0 ? t / total : 0, opacity: 1, backgroundPosition: `${-fx * scale}px ${-fy * scale}px`, easing: 'steps(1, end)' });
    t += d;
  });
  const last = out[out.length - 1];
  if (last) out.push({ ...last, offset: 1, easing: 'linear' });
  return out;
}

// ── DOM ──

const BASE = 'fx/'; // vite base './' → public/fx 가 빌드 뒤에도 같은 상대 경로
const sheetCache = new Map<string, Promise<PixelFxSheet | null>>();

/** 가져온 이펙트 목록 (없으면 빈 목록) */
export async function loadPixelFxIndex(): Promise<PixelFxIndex> {
  try {
    const r = await fetch(`${BASE}index.json`);
    if (r.ok) return (await r.json()) as PixelFxIndex;
  } catch {
    /* 없음 */
  }
  return { pixelfx: { version: '', commit: '' }, effects: [] };
}

/** 시트 하나 (그림도 미리 받아 둔다). 없으면 null — 부르는 쪽은 효과 없이 넘어간다 */
export function loadPixelFx(name: string): Promise<PixelFxSheet | null> {
  let p = sheetCache.get(name);
  if (!p) {
    p = (async () => {
      try {
        const r = await fetch(`${BASE}${name}.json`);
        if (!r.ok) return null;
        const s = (await r.json()) as PixelFxSheet;
        await new Promise<void>((res) => {
          const img = new Image();
          img.onload = img.onerror = () => res();
          img.src = `${BASE}${s.image}`;
        });
        ready.set(name, s);
        return s;
      } catch {
        return null;
      }
    })();
    sheetCache.set(name, p);
  }
  return p;
}

export interface PixelFxPlay {
  el: HTMLElement;
  /** 지금 멈추고 지운다 (반복 이펙트는 이걸로 끝낸다) */
  stop(): void;
  readonly done: boolean;
}

export interface PixelFxOptions {
  /** host 안 좌표(px)에 기준점을 놓는다 */
  x: number;
  y: number;
  /** 그림 1픽셀 = 화면 몇 px (정수일수록 또렷하다). 기본 2 */
  scale?: number;
  flip?: boolean;
  /** 재생 속도 배율. 기본 1 */
  rate?: number;
  /** 한 번 재생이 끝나 지워졌을 때 */
  onEnd?: () => void;
}

/** host(position 이 있는 상자) 위에 시트를 한 번(반복 시트는 stop 까지) 재생한다 */
export function playPixelFx(host: HTMLElement, s: PixelFxSheet, o: PixelFxOptions): PixelFxPlay {
  const scale = o.scale ?? 2;
  const rate = o.rate ?? 1;
  const el = document.createElement('div');
  el.className = 'bha-pxfx';
  if (o.flip) el.classList.add('bha-pxfx--flip');
  const box = pivotBox(s, o.x, o.y, scale, o.flip);
  const cols = s.columns;
  const rows = Math.ceil(s.frames / cols);
  el.style.left = `${box.left}px`;
  el.style.top = `${box.top}px`;
  el.style.width = `${box.width}px`;
  el.style.height = `${box.height}px`;
  el.style.backgroundImage = `url("${BASE}${s.image}")`;
  el.style.backgroundSize = `${cols * s.frame[0] * scale}px ${rows * s.frame[1] * scale}px`;
  el.dataset.fx = s.name;
  host.append(el);

  let done = false;
  let raf = 0;
  let shown = -2;
  const t0 = performance.now();
  const finish = (ended: boolean): void => {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    el.remove();
    if (ended) o.onEnd?.();
  };
  const step = (now: number): void => {
    const i = frameAt(s.durations, (now - t0) * rate, s.loop);
    if (i < 0) return finish(true);
    if (i !== shown) {
      shown = i;
      const [fx, fy] = framePos(s, i);
      el.style.backgroundPosition = `${-fx * scale}px ${-fy * scale}px`;
      el.dataset.frame = String(i);
    }
    raf = requestAnimationFrame(step);
  };
  step(t0);
  return {
    el,
    stop: () => finish(false),
    get done() {
      return done;
    },
  };
}

/** 시트 한 장 크기의 상자를 (cx, cy) 를 가운데로 놓는다 (재생은 부르는 쪽이 pixelFxKeyframes 로). 처음엔 투명 — 키프레임이 시작되면 보인다.
 *  flipX = 좌우(시트는 오른쪽을 본다), flipY = 위아래(연타 올려 베기) */
export function mountPixelFx(host: HTMLElement, s: PixelFxSheet, o: { cx: number; cy: number; scale: number; flipX?: boolean; flipY?: boolean }): HTMLElement {
  const el = document.createElement('div');
  el.className = 'bha-pxfx';
  el.setAttribute('aria-hidden', 'true');
  el.dataset.fx = s.name;
  const w = s.frame[0] * o.scale;
  const h = s.frame[1] * o.scale;
  const rows = Math.ceil(s.frames / s.columns);
  el.style.cssText = `left:${(o.cx - w / 2).toFixed(1)}px;top:${(o.cy - h / 2).toFixed(1)}px;width:${w}px;height:${h}px;opacity:0;` +
    `background-image:url("${BASE}${s.image}");background-size:${s.columns * s.frame[0] * o.scale}px ${rows * s.frame[1] * o.scale}px;` +
    `transform:scale(${o.flipX ? -1 : 1}, ${o.flipY ? -1 : 1})`;
  host.append(el);
  return el;
}

/** 이미 받아 둔 시트 (loadPixelFx 가 끝난 것만). 전투 연출은 기다리지 않으므로 없으면 null */
const ready = new Map<string, PixelFxSheet>();
export function readyPixelFx(name: string): PixelFxSheet | null {
  return ready.get(name) ?? null;
}
