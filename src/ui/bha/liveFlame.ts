// 실시간 불꽃 (C.461, GDD 15-6·12-4 무월): 도트 세션 작업본 docs/art-samples/mugetsu-flame/live.py 의 emit·render 를 canvas 로 옮긴 것.
// 불 나오는 자리를 몸에 붙여 두고, 나온 불은 화면(그림 칸 바깥 격자)에 남아 위로 올라간다 — 돌진하면 불이 뒤로 끌린다.
// 칼(불꽃 팔) = 불 덩어리(두께 2배)이고 칼의 불은 칼에 붙어 탄다 — 빨리 움직일 때만 짧은 잔상. 밑단 아래는 자르지 않는다(작업본이 자리·물방울 모양으로 안 냄, 사용자 2026-11-16).
// 바지 안쪽(inner) 불은 바지 밖으로 안 나가 몸과 같이 움직이므로 몸 앞 PNG 레이어가 그대로 맡는다(여기선 몸 뒤 한 장만).
// 위쪽(LiveFlameSim)은 DOM 없는 순수 계산이라 단위 테스트한다 (tests/c461.test.ts). 데이터 = src/data/art/flames/<id>.json
import mugetsu from '../../data/art/flames/mugetsu.json';

export interface FlameEmitter {
  x: number; y: number; out: number; kind: string; size: number; rise: number; licks: number; taper: number;
  sway: number; wl: number; lean: number; beat: number; arm?: number; hip?: boolean; inner?: boolean; slot?: number; plume?: boolean;
  /** 잔상 줄기(갈고리 없음) · 옆 가시(갈고리 반대쪽) — 계산 중에만 붙인다 */
  trail?: boolean; barb?: boolean;
}
export interface LiveFlameData {
  cell: number;
  /** 몸 그림(1배)의 왼쪽 위가 그림 칸 안 어디인지 */
  body: [number, number];
  frameMs: number;
  tick: number;
  life: number;
  rise: number;
  per: number;
  arm: [number, number][];
  armStep: number;
  armBehind: boolean;
  /** 동작마다 불 세기 [미정] — 지금은 하나(임시) */
  strength: number;
  colors: { core: string; rim: string };
  rimShrink: number;
  /** 바지 둘레 불(안쪽·칼 제외) 굵기·높이 배율 (작업본 '원작 불꽃 느낌': ×1.7 · ×1.4) */
  outerScale?: { size: number; rise: number };
  /** 칼에 붙은 불 굵기 배율 (작업본 ×1.55) */
  armLickThick?: number;
  emitters: FlameEmitter[];
}

export const LIVE_FLAMES: Readonly<Record<string, LiveFlameData>> = { mugetsu: mugetsu as unknown as LiveFlameData };

interface Puff { b: number; x: number; y: number; th: number; e: FlameEmitter }
/** 칼 잔상 줄기 (live.py emit_blade): 거의 안 올라가고 짧게 사라진다 */
const BLADE_TRAIL: FlameEmitter = { x: 0, y: 0, out: 0, kind: 'S', size: 0, rise: 5, licks: 1, taper: 1, sway: 0, wl: 10, lean: 0, beat: 0, trail: true };
/** 프레임당 이보다 빨리 움직이면 칼·칼의 불이 잔상을 남긴다 (칸) */
const TRAIL_SPEED = 0.8;

/** 0 = 빈칸, 1 = 테두리, 2 = 속 */
export type FlameGrid = Uint8Array;

export class LiveFlameSim {
  readonly d: LiveFlameData;
  private puffs: Puff[] = [];
  private last: [number, number] | null = null;
  private readonly arms: [number, number, number][] = [];
  private readonly armLen: number;
  private readonly outer: FlameEmitter[];
  private readonly armE: FlameEmitter[];
  private readonly armTrail: Map<FlameEmitter, FlameEmitter>;
  constructor(d: LiveFlameData) {
    this.d = d;
    let s = 0;
    for (let i = 0; i + 1 < d.arm.length; i++) {
      const [x0, y0] = d.arm[i]!;
      const [x1, y1] = d.arm[i + 1]!;
      const len = Math.hypot(x1 - x0, y1 - y0);
      const n = Math.floor(len / d.armStep);
      for (let k = 0; k < n; k++) { const a = k / n; this.arms.push([x0 + (x1 - x0) * a, y0 + (y1 - y0) * a, s + len * a]); }
      s += len;
    }
    this.armLen = s || 1;
    const os = d.outerScale ?? { size: 1, rise: 1 };
    this.outer = d.emitters.filter((e) => e.arm === undefined && !e.inner).map((e) => ({ ...e, size: e.size * os.size, rise: e.rise * os.rise }));
    this.armE = d.emitters.filter((e) => e.arm !== undefined);
    this.armTrail = new Map(this.armE.map((e) => [e, { ...e, rise: 6, licks: 1, trail: true }]));
  }
  get count(): number { return this.puffs.length; }
  /** 위치가 크게 튀면(장면 바뀜) 끌린 불을 지우고 새로 */
  reset(): void { this.puffs = []; this.last = null; }
  /** 프레임 fr 에 몸 그림 왼쪽 위가 (ox, oy)(격자 칸) 일 때 불을 낸다. 빨리 움직이면 사이를 한 칸에 하나씩 메운다 */
  emit(fr: number, ox: number, oy: number): void {
    const d = this.d;
    let [px, py] = this.last ?? [ox, oy];
    if (Math.abs(ox - px) > 40 || Math.abs(oy - py) > 40) { px = ox; py = oy; }
    this.last = [ox, oy];
    const dist = Math.max(Math.abs(ox - px), Math.abs(oy - py));
    const fast = dist > TRAIL_SPEED;
    const thin = 1 / (1 + 0.22 * dist); // 빨리 움직일수록 남기는 불을 가늘게 (큰 덩어리가 끌려 뭉치지 않게)
    const k = Math.max(1, Math.ceil(dist));
    for (let j = 0; j < k; j++) {
      const a = (j + 1) / k;
      const cx = px + (ox - px) * a;
      const cy = py + (oy - py) * a;
      const bt = fr - 1 + a;
      for (const e of this.outer) {
        const p = Math.max(0, Math.sin(2 * Math.PI * ((bt / d.tick + e.beat) / (d.per / e.licks)))) ** 0.6;
        if (p <= 0.15) continue;
        this.puffs.push({ b: bt, x: cx + e.x, y: cy + e.y, th: e.size * p * thin * d.strength, e: thin > 0.7 ? e : { ...e, rise: e.rise * Math.max(0.45, thin) } });
        if (thin > 0.7 && e.size > 2.7) this.puffs.push({ b: bt, x: cx + e.x, y: cy + e.y, th: e.size * p * 0.55 * d.strength, e: { ...e, rise: e.rise * 0.5, barb: true } }); // 옆 가시
      }
      // 칼의 불: 평소엔 render 가 칼에 붙여 그리고, 빨리 움직일 때만 짧은 잔상
      if (fast) for (const e of this.armE) this.puffs.push({ b: bt, x: cx + e.x, y: cy + e.y, th: e.size * 1.1 * d.strength, e: this.armTrail.get(e)! });
    }
    // 칼 몸통 잔상 (live.py emit_blade): 2칸에 하나씩, 팔 점 5개마다
    if (fast) {
      const kb = Math.max(1, Math.ceil(dist / 2));
      for (let j = 0; j < kb; j++) {
        const a = (j + 1) / kb;
        const cx = px + (ox - px) * a;
        const cy = py + (oy - py) * a;
        const bt = fr - 1 + a;
        for (let i = 0; i < this.arms.length; i += 5) {
          const [ax, ay, sp] = this.arms[i]!;
          const r = 2 * (2.9 - 2.7 * (sp / this.armLen));
          if (r > 0.6) this.puffs.push({ b: bt, x: cx + ax, y: cy + ay, th: r, e: BLADE_TRAIL });
        }
      }
    }
    const keep = d.life * 2;
    this.puffs = this.puffs.filter((q) => fr - q.b < keep);
  }
  /** 프레임 fr, 몸 그림 왼쪽 위 (ox, oy) 일 때 몸 뒤 불 격자(cols × rows) */
  render(fr: number, ox: number, oy: number, cols: number, rows: number, out?: FlameGrid): FlameGrid {
    const g = out && out.length === cols * rows ? out : new Uint8Array(cols * rows);
    g.fill(0);
    this.field(fr, ox, oy, cols, rows, 0, g, 1);
    this.field(fr, ox, oy, cols, rows, this.d.rimShrink, g, 2);
    return g;
  }
  private field(fr: number, ox: number, oy: number, cols: number, rows: number, shrink: number, g: FlameGrid, v: number): void {
    const d = this.d;
    const PT = d.per * d.tick;
    const blob = (cx: number, cy: number, r: number, ry: number): void => {
      const x1 = Math.max(0, Math.floor(cx - r - 1)), x2 = Math.min(cols, Math.floor(cx + r + 2));
      const y1 = Math.max(0, Math.floor(cy - ry - 1)), y2 = Math.min(rows, Math.floor(cy + ry + 2));
      for (let y = y1; y < y2; y++) {
        const dy = (y - cy) / ry;
        for (let x = x1; x < x2; x++) {
          const dx = (x - cx) / r;
          if (dx * dx + dy * dy <= 1) g[y * cols + x] = v;
        }
      }
    };
    const sway = (e: FlameEmitter, u: number): number => e.sway * Math.sin(2 * Math.PI * (u / e.wl - fr / PT + e.beat / d.per)) * Math.min(1, u / 5);
    for (const q of this.puffs) {
      const e = q.e;
      const age = fr - q.b;
      const life = (d.life * e.rise) / 20;
      if (age < 0 || age >= life) continue;
      const l = age / life;
      const u = d.rise * age;
      let r = q.th * (1 - l) ** (0.9 + 0.5 * e.taper) * Math.min(1, (u + 0.7) / Math.max(1, 0.9 * q.th)) - shrink; // 갓 나온 불은 가늘게 시작(물방울), 끝은 뾰족
      if (r < 0.3) continue;
      r = Math.max(r, 0.5);
      let cx = q.x + e.out * (0.6 + e.lean * u) + sway(e, u);
      let cy = q.y - u;
      if (!e.trail) { // 끝이 갈고리처럼 휘어 넘어간다 (가시는 반대쪽)
        const hk = (e.beat % 2 ? 1 : -1) * (e.barb ? -1.6 : 1);
        cx += hk * 0.34 * e.rise * l ** 2.6;
        cy += 0.1 * e.rise * l ** 4;
      }
      blob(cx, cy, r, r * (1.25 + 1.6 * l));
    }
    for (const e of this.armE) {
      for (let k = 0; k < e.licks; k++) {
        const l = (((fr / d.tick + e.beat + (k * d.per) / e.licks) % d.per) + d.per) % d.per / d.per;
        const amp = 0.5 - 0.5 * Math.cos(2 * Math.PI * l);
        const h = e.rise * 0.75 * (0.35 + 0.65 * amp);
        const thick = (d.armLickThick ?? 1) * e.size * (0.6 + 0.4 * amp) * d.strength - shrink;
        const hook = (e.beat + k) % 2 ? 1 : -1;
        if (thick <= 0.4) continue;
        for (let u = 0; u <= h; u += 0.6) {
          let r = thick * (1 - u / (h + 1e-6)) ** e.taper * Math.min(1, (u + 0.7) / Math.max(1, 0.9 * thick));
          if (r <= 0.3) continue;
          r = Math.max(r, 0.5);
          blob(ox + e.x + e.out * (0.6 + e.lean * u) + sway(e, u) + hook * 0.34 * h * (u / (h + 1e-6)) ** 2.6, oy + e.y - u, r, r * 1.25);
        }
      }
    }
    for (const [ax, ay, sp] of this.arms) {
      const t = sp / this.armLen;
      let r = 2 * (2.9 - 2.7 * t) + 0.9 * (1 - 0.85 * t) * Math.sin(2 * Math.PI * (sp / 9 - fr / PT)) - shrink * 0.8; // 칼 = 불 덩어리, 두께 2배
      if (r <= 0.35) continue;
      r = Math.max(r, 0.5);
      blob(ox + ax, oy + ay, r, r);
    }
  }
}

/** 몸 그림 왼쪽 위 (격자 칸) — 격자는 그림 칸과 같은 배율, 좌우 반전(내 그림은 오른쪽을 본다): 격자 x 는 격자 오른쪽 끝에서 왼쪽으로 센다.
 *  W·H = 몸 상자(px), unit = 그림 1칸(px), gridRight·gridTop = 몸 상자 기준 격자 오른쪽 끝·위 끝(px), dashX·dashY = 돌진으로 옮겨진 거리(px), dyPct = 그림 세로 보정 */
export function flameOrigin(d: Pick<LiveFlameData, 'cell' | 'body'>, o: { W: number; H: number; unit: number; gridRight: number; gridTop: number; dashX: number; dashY: number; dyPct?: number }): [number, number] {
  const pivotY = 0.92;
  const bodyRightX = o.W / 2 - (d.body[0] - d.cell / 2) * o.unit + o.dashX; // 몸 그림 x 0 의 화면 자리(반전)
  const bodyTopY = pivotY * o.H + (d.body[1] - pivotY * d.cell) * o.unit + ((o.dyPct ?? 0) / 100) * o.H + o.dashY;
  return [(o.gridRight - bodyRightX) / o.unit, (bodyTopY - o.gridTop) / o.unit];
}

// ── DOM ──

export interface LiveFlame {
  el: HTMLCanvasElement;
  set(on: boolean): void;
  readonly on: boolean;
  stop(): void;
}

/**
 * 몸 상자(.bha-hero__lift) 안, 몸 바로 뒤에 격자 캔버스를 깐다. 캔버스는 돌진을 거슬러 옮겨 장면에 머문다(불이 남는다).
 * dashOf = 지금 돌진으로 옮겨진 거리(px, 몸통박치기 root 의 transform), scale = 그림 배율(fieldScale), dyPct = 그림 세로 보정
 */
export function mountLiveFlame(lift: HTMLElement, body: HTMLElement, d: LiveFlameData, o: { scale: number; dyPct?: number; dashOf: () => [number, number] }): LiveFlame {
  const cv = document.createElement('canvas');
  cv.className = 'bha-liveflame';
  cv.setAttribute('aria-hidden', 'true');
  cv.hidden = true;
  lift.insertBefore(cv, body);
  const ctx = cv.getContext('2d');
  const sim = new LiveFlameSim(d);
  const hex = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const rim = hex(d.colors.rim);
  const core = hex(d.colors.core);
  // 격자 범위 (몸 상자 기준): 왼쪽 2배·오른쪽 0.5배·위 0.6배 (돌진 거리 상한 = 필드 폭 18% — 끌린 불이 들어갈 만큼)
  const SPAN = { left: 2, right: 0.5, top: 0.6 };
  let on = false;
  let raf = 0;
  let fr = 0;
  let acc = 0;
  let lastT = 0;
  let grid: FlameGrid | undefined;
  let img: ImageData | null = null;
  let size = '';
  const frame = (now: number): void => {
    raf = 0;
    if (!on || !cv.isConnected) return;
    const W = lift.offsetWidth;
    const H = lift.offsetHeight;
    if (W > 0 && H > 0 && ctx) {
      const unit = (W * o.scale) / d.cell;
      const cols = Math.ceil((W * (1 + SPAN.left + SPAN.right)) / unit);
      const rows = Math.ceil((H * (1 + SPAN.top)) / unit);
      const key = `${cols}x${rows}x${unit.toFixed(3)}`;
      if (key !== size) {
        size = key;
        cv.width = cols;
        cv.height = rows;
        cv.style.width = `${cols * unit}px`;
        cv.style.height = `${rows * unit}px`;
        img = ctx.createImageData(cols, rows);
        sim.reset();
        fr = 0;
      }
      const [dx, dy] = o.dashOf();
      const gridRight = W * (1 + SPAN.right);
      const gridTop = -H * SPAN.top;
      // 캔버스는 몸 상자 오른쪽 끝 + 0.5배에 오른쪽 끝을 맞추고, 돌진만큼 거슬러 옮겨 장면에 머문다 (좌우 반전)
      cv.style.left = `${(gridRight - cols * unit - dx).toFixed(1)}px`;
      cv.style.top = `${(gridTop - dy).toFixed(1)}px`;
      const [ox, oy] = flameOrigin(d, { W, H, unit, gridRight, gridTop, dashX: dx, dashY: dy, dyPct: o.dyPct });
      if (fr === 0) for (let i = 0; i < d.life * 2; i++) sim.emit(++fr, ox, oy); // 처음엔 한 바퀴 미리 태워 불을 채운다 (live.py 와 같다)
      acc += lastT ? Math.min(250, now - lastT) : d.frameMs;
      lastT = now;
      let stepped = false;
      while (acc >= d.frameMs) {
        acc -= d.frameMs;
        sim.emit(++fr, ox, oy);
        stepped = true;
      }
      if (stepped && img) {
        grid = sim.render(fr, ox, oy, cols, rows, grid);
        const px = img.data;
        for (let i = 0; i < grid.length; i++) {
          const v = grid[i]!;
          const c = v === 2 ? core : rim;
          const j = i * 4;
          px[j] = c[0]; px[j + 1] = c[1]; px[j + 2] = c[2]; px[j + 3] = v ? 255 : 0;
        }
        ctx.putImageData(img, 0, 0);
      }
    }
    raf = requestAnimationFrame(frame);
  };
  return {
    el: cv,
    set(v) {
      if (v === on) return;
      on = v;
      cv.hidden = !v;
      if (v) {
        lastT = 0;
        acc = 0;
        if (!raf && typeof requestAnimationFrame !== 'undefined') raf = requestAnimationFrame(frame);
      } else {
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        sim.reset();
        size = '';
      }
    },
    get on() { return on; },
    stop() { this.set(false); },
  };
}
