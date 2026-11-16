// 종이인형 위에 얹는 이펙트 층 (C.465, GDD 12-4 무월·혈쇄 이치고): 종이인형 작업본 scripts/rig/flame.ts(무월 불꽃)·chain.ts(혈쇄 사슬)를 게임으로 옮긴 것.
// 계산·모양은 작업본 그대로(2026-11-17 판 — 칼의 불은 칼에서, 날 끝 모양, 궤적 없음, 칼 굵기 절반, 불꽃·사슬 모양은 120ms 마다 한 장).
// 다른 점: 작업본은 인형 DOM 위에 캔버스를 겹쳤지만, 게임 종이인형은 캔버스 한 장에 그리므로(rigAnim.bindRigAnim) 층을 그 캔버스에 같이 그린다 —
// back = 조각들 앞(몸 뒤), mids = 그 조각 바로 앞, front = 맨 앞. 어느 외형에 붙는지는 데이터(spec.look). 초월자·종족을 모른다.
import mugetsuFlame from '../../data/art/rig/mugetsu-flame.json';
import ichigoChain from '../../data/art/rig/ichigo-chain.json';

/** 지금 그려진 조각 하나(앞뒤 순서대로): m = 조각 그림 → 뼈대 캔버스 행렬(도트 단위) */
export interface FxLayer { slot: string; m: number[]; img: HTMLImageElement }

/** 이펙트 층 하나: step 으로 시간을 흘리면 back·front·mids 캔버스(뼈대 캔버스 + pad 크기, 1칸 = 1도트)를 다시 그린다 */
export interface RigFx {
  back: HTMLCanvasElement;
  front: HTMLCanvasElement;
  /** 캔버스 왼쪽·위 여백(도트) — 캔버스 (0,0) = 뼈대 캔버스 (−pad[0], −pad[1]) */
  pad: [number, number];
  /** 조각 사이 층: [이 조각 바로 앞, 캔버스] */
  mids(): [string, HTMLCanvasElement][];
  step(dtMs: number, layers: FxLayer[]): void;
}

export interface FlameEmitter {
  slot: string; x: number; y: number;
  out: number; size: number; rise: number; licks: number; taper: number; sway: number; wl: number; lean: number; beat: number;
  inner?: boolean; order?: number;
  /** 붙어서 타는 불(칼날) */
  stick?: boolean;
  barb?: boolean;
  /** 큰 불기둥 (인형에서는 뺀다) */
  plume?: boolean;
}
/** trail = 불꽃 팔(칼): [조각, 조각 안 x, y, 어깨에서부터 거리 0~1, 거리(칸)]. alias = 그 조각이 숨겨진 동작에서는 대신 이 조각 자리 */
export interface FlameSpec { alias?: Record<string, string>; look: string; pad: [number, number, number, number]; mask: string[]; trail?: [string, number, number, number, number][]; emitters: FlameEmitter[] }

/** z = 앞뒤 자리: '@front' 맨 앞 · '@back' 맨 뒤 · 조각 id = 그 조각 바로 앞. 없으면 띠는 맨 앞, 풀린 끝은 맨 뒤 */
export interface ChainBand { name?: string; slot: string; pts: [number, number][]; z?: string }
export interface ChainTail { name?: string; slot: string; x: number; y: number; ang: number; L: number; w: number; curl: number; ph: number; sw?: number; z?: string }
export interface ChainSpec { look: string; pad: [number, number, number, number]; noGlow?: string[]; bands: ChainBand[]; tails: ChainTail[] }

/** 외형 id → 그 외형에 얹는 이펙트 만들기 (데이터의 look 으로 묶는다) */
export const RIG_FX: Readonly<Record<string, (canvas: [number, number]) => RigFx>> = Object.fromEntries([
  [(mugetsuFlame as unknown as FlameSpec).look, (c: [number, number]) => createFlame(mugetsuFlame as unknown as FlameSpec, c)],
  [(ichigoChain as unknown as ChainSpec).look, (c: [number, number]) => createChain(ichigoChain as unknown as ChainSpec, c)],
]);

/** 이 외형에 이펙트 층이 있는가 */
export function rigFxOf(look: string): ((canvas: [number, number]) => RigFx) | undefined {
  return RIG_FX[look];
}

// ── 무월 불꽃 (작업본 flame.ts) ──
const DT = 60, TICK = 2, PER = 16;
const LAG = 0.55, MAXLAG = 9, MAXDELAY = 22, KEEP = 26; // 불이 박자마다 올라가는 칸 · 끌림 최대 칸 · 지연 최대 박자 · 위치를 기억하는 박자
const C0 = [0, 0, 0], C2 = [54, 48, 63];

export function createFlame(spec: FlameSpec, canvas: [number, number]): RigFx {
  const [pl, pt, pr, pb] = spec.pad;
  const W = canvas[0] + pl + pr, H = canvas[1] + pt + pb;
  const mk = () => {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    return c;
  };
  const back = mk(), front = mk();
  const maskC = document.createElement('canvas');
  maskC.width = W; maskC.height = H;
  const bctx = back.getContext('2d')!, fctx = front.getContext('2d')!, mctx = maskC.getContext('2d')!;
  const N = W * H, f0 = new Uint8Array(N), f1 = new Uint8Array(N);
  let fr = 0; // 지금(박자, 소수) — 60ms 에 1
  let pos = new Map<string, number[]>();
  /** 자리마다 지난 화면 위치(박자 시각·x·y) — 지연된 위치를 꺼내 쓴다 */
  const hist = new Map<unknown, { t: number[]; x: number[]; y: number[] }>();
  const remember = (key: unknown, x: number, y: number) => {
    let h = hist.get(key);
    if (!h) { h = { t: [], x: [], y: [] }; hist.set(key, h); }
    const last = h.x.length - 1;
    if (last >= 0 && Math.hypot(x - h.x[last]!, y - h.y[last]!) > 60) { h.t.length = h.x.length = h.y.length = 0; } // 순간이동(동작 바뀜 등)은 끌지 않음
    h.t.push(fr); h.x.push(x); h.y.push(y);
    while (h.t.length > 2 && h.t[1]! < fr - KEEP) { h.t.shift(); h.x.shift(); h.y.shift(); }
  };
  /** delay 박자 전 자리(사이는 선형), 지금 자리에서 MAXLAG 칸 넘게는 안 끌림 */
  const at = (key: unknown, cx: number, cy: number, delay: number, maxLag = MAXLAG): [number, number] => {
    const h = hist.get(key);
    if (!h || !h.t.length || delay <= 0) return [cx, cy];
    const tt = fr - delay;
    let i = h.t.length - 1;
    while (i > 0 && h.t[i]! > tt) i--;
    let x = h.x[i]!, y = h.y[i]!;
    if (i < h.t.length - 1 && h.t[i]! <= tt) {
      const a = (tt - h.t[i]!) / Math.max(1e-6, h.t[i + 1]! - h.t[i]!);
      x += (h.x[i + 1]! - x) * a; y += (h.y[i + 1]! - y) * a;
    }
    const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy);
    return d > maxLag ? [cx + (dx * maxLag) / d, cy + (dy * maxLag) / d] : [x, y];
  };
  const disc = (buf: Uint8Array, cx: number, cy: number, rx: number, ry: number) => {
    const x1 = Math.max(0, Math.floor(cx - rx - 1)), x2 = Math.min(W, Math.floor(cx + rx + 2));
    const y1 = Math.max(0, Math.floor(cy - ry - 1)), y2 = Math.min(H, Math.floor(cy + ry + 2));
    for (let y = y1; y < y2; y++) for (let x = x1; x < x2; x++) if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) buf[y * W + x] = 1;
  };
  const world = (slot: string, lx: number, ly: number): [number, number] | null => {
    const m = pos.get(slot) ?? (spec.alias?.[slot] ? pos.get(spec.alias[slot]!) : undefined);
    return m ? [m[0]! * lx + m[2]! * ly + m[4]! + pl, m[1]! * lx + m[3]! * ly + m[5]! + pt] : null;
  };
  /** 불 줄기 모양(flame3.py field · live2.py) — inner = 바지 안쪽 불만, 아니면 바깥 불 + 칼(불꽃 팔) */
  let bladeW: [number, number][] = [];
  const field = (buf: Uint8Array, shrink: number, inner: boolean) => {
    buf.fill(0);
    bladeW = [];
    for (const tp of spec.trail ?? []) { const bw = world(tp[0], tp[1], tp[2]); if (bw) bladeW.push(bw); }
    // 불꽃 모양의 시간은 120ms(2박자) 단위로 끊는다 — 사용자 2026-11-17 "불꽃 도트 속도 오히려 좀 느린게 도트겜느낌나서 좋거든? 프레임당 120ms로" (줄기가 몸을 따라가는 지연은 끊지 않음)
    const t = Math.floor(fr / TICK);
    for (const e of spec.emitters) {
      if (!!e.inner !== inner) continue;
      const w = world(e.slot, e.x, e.y);
      if (!w) continue;
      if (e.plume) continue; // 큰 불기둥은 인형에서 뺌(몸을 가림 — 사용자 2026-11-17 "실제 모션 보면 불이 너무많이 나서 뭐 아무것도 안보이더라")
      const arm = !!e.stick, ph = e.beat;
      if (arm && bladeW.length) { // 칼의 불은 허공이 아니라 칼 몸통에서 나온다: 가장 가까운 칼 점으로 붙인다
        let bi = 0, bd = 1e9;
        for (let i = 0; i < bladeW.length; i++) { const d = (bladeW[i]![0] - w[0]) ** 2 + (bladeW[i]![1] - w[1]) ** 2; if (d < bd) { bd = d; bi = i; } }
        const ba = (spec.trail ?? [])[bi]?.[3] ?? 0;
        w[0] = bladeW[bi]![0]; w[1] = bladeW[bi]![1] - 0.7 * (2.9 - 2.1 * Math.min(ba, 0.86)); // 칼 윗면 바로 안쪽에서 솟는다
      }
      const r0 = e.size * (arm || inner ? 1 : 0.6), rise = e.rise * (arm || inner ? 1 : 0.75); // 바지 둘레 불만 굵기 0.6배·높이 0.75배(같은 지시, 임시값)
      for (let k = 0; k < (inner ? 1 : e.licks); k++) {
        let l: number;
        if (inner) { const q = (((t - (e.order ?? 0) * 4) % 40) + 40) % 40; if (q >= 8) continue; l = q / 8; } // 한 번에 2개만
        else l = ((((t + ph + (k * PER) / e.licks) % PER) + PER) % PER) / PER;
        let h: number, st: number, thick: number;
        if (arm) { const amp = 0.5 - 0.5 * Math.cos(2 * Math.PI * l); h = rise * 0.75 * (0.35 + 0.65 * amp); st = 0; thick = 1.55 * r0 * (0.6 + 0.4 * amp) - shrink; }
        else { h = rise * l ** 0.9; st = rise * Math.max(0, (l - 0.42) / 0.58) ** 1.15 * 0.97; thick = r0 * Math.min(l / 0.15, 1) * (1 - 0.6 * l) - shrink; }
        if (thick <= 0.4 || h - st < 0.3) continue;
        const hk = (ph + k) % 2 ? 1 : -1, span = h - st + 1e-6;
        const P = (u: number): [number, number, number] => {
          const q = (u - st) / span;
          const [sx, sy] = at(e, w[0], w[1], arm ? 0 : Math.min(MAXDELAY, u / LAG));
          const cx = sx + (arm ? 0 : e.out * (0.6 + e.lean * u)) + e.sway * Math.sin(2 * Math.PI * (u / e.wl - t / PER + ph / PER)) * Math.min(1, u / 5) + hk * 0.34 * span * q ** 2.6;
          return [cx, sy - u + 0.1 * span * q ** 4, q];
        };
        for (let u = st; u <= h; u += 0.6) {
          const [cx, cy, q] = P(u);
          const r = thick * (1 - q) ** e.taper * (arm ? 1 : Math.min(1, (u - st + 0.7) / Math.max(1, 0.9 * thick)));
          if (r > 0.3) disc(buf, cx, cy, Math.max(r, 0.5), Math.max(r, 0.5) * 1.35);
        }
        if (!inner && thick > 1.6 && span > 6) { // 옆 가시: 38% 지점에서 갈고리 반대쪽으로 길이의 42%
          const q0 = 0.38, [bx, by] = P(st + span * q0), rb = thick * (1 - q0) ** e.taper, bl = 0.42 * span;
          for (let v = 0; v < bl; v += 0.6) {
            const qq = v / bl, rr = rb * 0.75 * (1 - qq) ** 1.4;
            if (rr > 0.3) disc(buf, bx - hk * (0.55 * v + 0.25 * bl * qq * qq), by - 0.85 * v, Math.max(rr, 0.5), Math.max(rr, 0.5) * 1.3);
          }
        }
      }
    }
    if (inner) return;
    // 칼(불꽃 팔) = 불 덩어리: 칼끝이 3~6박자 늦게 따라온다
    const TR = spec.trail ?? [];
    const pts: ([number, number] | null)[] = TR.map((tp) => world(tp[0], tp[1], tp[2]));
    // 칼 굵기: 대부분은 완만하게 줄고, 끝 14% 는 한쪽 면만 깎여 날 끝처럼 보인다(송곳처럼 고르게 뾰족해지지 않게)
    const TIP = 0.86;
    const rad = (a: number, sp: number) => (a < TIP ? 2.9 - 2.1 * a : (2.9 - 2.1 * TIP) * (1 - (a - TIP) / (1 - TIP)) ** 0.8 + 0.25) + 0.45 * (1 - 0.85 * a) * Math.sin(2 * Math.PI * (sp / 9 - t / PER)) * (a < TIP ? 1 : 0.2);
    TR.forEach((tp, i) => {
      const a = tp[3], sp = tp[4], w = pts[i];
      if (!w) return;
      let r = rad(a, sp), cx = w[0], cy = w[1];
      if (a >= TIP) { // 날 끝: 중심을 칼등 반대쪽(날 쪽)으로 밀어 한 면은 곧게, 다른 면만 비스듬히
        const p0 = pts[Math.max(0, i - 4)], p1 = pts[Math.min(TR.length - 1, i + 4)];
        if (p0 && p1) { const dx = p1[0] - p0[0], dy = p1[1] - p0[1], d = Math.hypot(dx, dy) || 1, full = 2.9 - 2.1 * TIP; cx += (-dy / d) * (full - r); cy += (dx / d) * (full - r); }
      }
      r -= shrink * 0.8;
      if (r > 0.35) disc(buf, cx, cy, Math.max(r, 0.5), Math.max(r, 0.5));
    });
  };
  const render = (layers: FxLayer[]) => {
    // 몸 뒤: 바깥 불 — 테두리 한 칸 보라, 속 검정
    field(f0, 0, false); field(f1, 1.1, false);
    const bi = bctx.createImageData(W, H);
    for (let i = 0; i < N; i++) if (f0[i]) { const c = f1[i] ? C0 : C2; bi.data.set([c[0]!, c[1]!, c[2]!, 255], i * 4); }
    bctx.putImageData(bi, 0, 0);
    // 하카마 위: 안쪽 불 — 속 검정, 테두리는 왼쪽 30% 지우고 맨 위 3줄은 남김
    field(f0, 0, true); field(f1, 1.1, true);
    const fi = fctx.createImageData(W, H);
    let top = -1;
    for (let y = 0; y < H; y++) {
      let xl = -1, xr = -1;
      for (let x = 0; x < W; x++) if (f0[y * W + x]) { if (xl < 0) xl = x; xr = x; }
      if (xl < 0) continue;
      if (top < 0) top = y;
      const cut = y < top + 3 ? 0 : Math.ceil(xl + 0.3 * (xr - xl + 1));
      for (let x = xl; x <= xr; x++) {
        const i = y * W + x;
        if (!f0[i]) continue;
        const c = !f1[i] && x >= cut ? C2 : C0;
        fi.data.set([c[0]!, c[1]!, c[2]!, 255], i * 4);
      }
    }
    fctx.globalCompositeOperation = 'source-over';
    fctx.putImageData(fi, 0, 0);
    // 하카마 모양(그 위에 그려진 다른 조각은 뺀다)으로 자름
    mctx.setTransform(1, 0, 0, 1, 0, 0);
    mctx.clearRect(0, 0, W, H);
    mctx.imageSmoothingEnabled = false;
    for (const l of layers) {
      if (!l.img.complete || !l.img.naturalWidth) continue;
      mctx.globalCompositeOperation = spec.mask.includes(l.slot) ? 'source-over' : 'destination-out';
      mctx.setTransform(l.m[0]!, l.m[1]!, l.m[2]!, l.m[3]!, l.m[4]! + pl, l.m[5]! + pt);
      mctx.drawImage(l.img, 0, 0);
    }
    fctx.globalCompositeOperation = 'destination-in';
    fctx.drawImage(maskC, 0, 0);
  };
  return {
    back, front,
    pad: [pl, pt] as [number, number],
    /** 시간을 흘린다: 화면 한 장마다 자리 기억 → 다시 그리기. layers = 지금 그려진 조각(뒤 → 앞) */
    step(dtMs: number, layers: FxLayer[]) {
      const dtF = Math.min(dtMs, 250) / DT;
      if (dtF <= 0) return;
      fr += dtF;
      pos = new Map(layers.map((l) => [l.slot, l.m]));
      for (const e of spec.emitters) { const w = world(e.slot, e.x, e.y); if (w) remember(e, w[0], w[1]); }
      for (const tp of spec.trail ?? []) { const w = world(tp[0], tp[1], tp[2]); if (w) remember(tp, w[0], w[1]); }
      render(layers);
    },
    mids: () => [],
  };
}

// ── 혈쇄 사슬 (작업본 chain.ts) ──
const FR = 16, MS = 120;
const DARK = [95, 20, 30], RED = [172, 49, 59], ORG = [236, 110, 60], HOT = [255, 190, 90], GLOW = [225, 40, 45];

export function createChain(spec: ChainSpec, canvas: [number, number]): RigFx {
  const [pl, pt, pr, pb] = spec.pad;
  const W = canvas[0] + pl + pr, H = canvas[1] + pt + pb;
  const mk = () => {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    return c;
  };
  const back = mk(), front = mk();
  // 조각 사이에 끼우는 층: '<띠|끝>:<조각 id>' → [조각 id, 캔버스] — 그 조각 바로 앞에 그린다
  const mids = new Map<string, [string, HTMLCanvasElement]>();
  const canvasOf = (kind: 'b' | 't', z: string | undefined): HTMLCanvasElement => {
    const zz = z ?? (kind === 'b' ? '@front' : '@back');
    if (zz === '@front') return front;
    if (zz === '@back') return back;
    let c = mids.get(`${kind}:${zz}`);
    if (!c) { c = [zz, mk()]; mids.set(`${kind}:${zz}`, c); }
    return c[1];
  };
  const cut = document.createElement('canvas');
  cut.width = W; cut.height = H;
  const cctx = cut.getContext('2d')!;
  let t = 0;
  const N = W * H;
  const cb = new Uint8Array(N), cs = new Float32Array(N), solid = new Uint8Array(N), d1 = new Uint8Array(N), d2 = new Uint8Array(N);
  const dil = (src: Uint8Array, out: Uint8Array, n: number) => {
    out.set(src);
    const tmp = new Uint8Array(N);
    for (let k = 0; k < n; k++) {
      tmp.set(out);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (tmp[i]) continue;
        if ((x > 0 && tmp[i - 1]) || (x < W - 1 && tmp[i + 1]) || (y > 0 && tmp[i - W]) || (y < H - 1 && tmp[i + W])) out[i] = 1;
      }
    }
  };
  const put = (img: ImageData, i: number, c: number[], a = 255) => { img.data[i * 4] = c[0]!; img.data[i * 4 + 1] = c[1]!; img.data[i * 4 + 2] = c[2]!; img.data[i * 4 + 3] = a; };
  const xf = (m: number[], x: number, y: number): [number, number] => [m[0]! * x + m[2]! * y + m[4]! + pl, m[1]! * x + m[3]! * y + m[5]! + pt];
  /** 풀린 끝 한 줄기: 밑동에서 0.5칸씩 — 각도는 조각이 돈 만큼 같이 돈다 */
  const path = (tn: ChainTail, m: number[], tt: number) => {
    let [x, y] = xf(m, tn.x, tn.y);
    const rot = Math.atan2(m[1]!, m[0]!);
    const out: { x: number; y: number; u: number; s: number; a: number }[] = [];
    for (let s = 0; s < tn.L; s += 0.5) {
      const u = s / tn.L;
      const a = ((tn.ang + tn.curl * 8 * u ** 3 + (tn.sw ?? 1) * (6 + 30 * u) * Math.sin(2 * Math.PI * (s / 10 - tt / FR + tn.ph))) * Math.PI) / 180 - rot;
      x += Math.cos(a) * 0.5; y -= Math.sin(a) * 0.5;
      out.push({ x, y, u, s: s + 0.5, a });
    }
    return out;
  };
  const render = (layers: FxLayer[], tt: number) => {
    const t = Math.floor(tt); // 120ms 마다 한 장(사용자 2026-11-17 "프레임당 120ms로")
    const pos = new Map(layers.map((l) => [l.slot, l.m]));
    const pulse = 0.5 + 0.5 * Math.sin((2 * Math.PI * t) / FR);
    // 앞뒤 자리마다 따로 그린다(안 쓰는 캔버스는 비움)
    const used = new Set<HTMLCanvasElement>();
    const bandGroups = new Map<HTMLCanvasElement, ChainBand[]>(), tailGroups = new Map<HTMLCanvasElement, ChainTail[]>();
    for (const b of spec.bands) { const c = canvasOf('b', b.z); bandGroups.set(c, [...(bandGroups.get(c) ?? []), b]); }
    for (const tn of spec.tails) { const c = canvasOf('t', tn.z); tailGroups.set(c, [...(tailGroups.get(c) ?? []), tn]); }
    // 같은 캔버스에 띠·끝이 함께 오면(맨 앞에 끝, 맨 뒤에 띠 등) 끝을 먼저, 띠를 위에
    for (const c of new Set([...bandGroups.keys(), ...tailGroups.keys()])) {
      const ctx = c.getContext('2d')!;
      ctx.clearRect(0, 0, W, H);
      const tl = tailGroups.get(c);
      if (tl) drawTails(ctx, tl, pos, t, pulse);
      const bl = bandGroups.get(c);
      if (bl) drawBands(ctx, bl, pos, layers, t, pulse);
      used.add(c);
    }
    for (const c of [back, front, ...[...mids.values()].map((v) => v[1])]) if (!used.has(c)) c.getContext('2d')!.clearRect(0, 0, W, H);
  };
  const tmp = document.createElement('canvas');
  tmp.width = W; tmp.height = H;
  const tctx = tmp.getContext('2d')!;
  /** putImageData 는 덮어쓰므로 임시 캔버스에 찍어 겹쳐 그린다 */
  const blit = (ctx: CanvasRenderingContext2D, img: ImageData) => { tctx.putImageData(img, 0, 0); ctx.drawImage(tmp, 0, 0); };
  const drawBands = (ctx: CanvasRenderingContext2D, bands: ChainBand[], pos: Map<string, number[]>, layers: FxLayer[], t: number, pulse: number) => {
    // 몸 앞: 띠 칸과 띠를 따라 잰 거리
    cb.fill(0);
    for (const b of bands) {
      const m = pos.get(b.slot);
      if (!m) continue;
      let acc = 0;
      for (let k = 0; k + 1 < b.pts.length; k++) {
        const [x0, y0] = xf(m, ...b.pts[k]!), [x1, y1] = xf(m, ...b.pts[k + 1]!);
        const d = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.ceil(d / 0.4));
        for (let i = 0; i <= n; i++) {
          const q = i / n, px = x0 + (x1 - x0) * q, py = y0 + (y1 - y0) * q;
          for (let y = Math.floor(py - 2); y <= py + 2; y++) for (let x = Math.floor(px - 2); x <= px + 2; x++) {
            if (x < 0 || y < 0 || x >= W || y >= H) continue;
            const j = y * W + x;
            if (!cb[j] && (x + 0.5 - px) ** 2 + (y + 0.5 - py) ** 2 <= 1.25 ** 2) { cb[j] = 1; cs[j] = acc + d * q; }
          }
        }
        acc += d;
      }
    }
    const fi = tctx.createImageData(W, H), ri = tctx.createImageData(W, H); // fi = 빛무리(머리 위는 지움), ri = 띠 고리(안 지움 — 앞뒤 자리대로 머리 위에도 덮인다)
    dil(cb, d1, 1); dil(cb, d2, 2);
    for (let i = 0; i < N; i++) {
      if (cb[i]) {
        const wave = Math.sin(2 * Math.PI * (cs[i]! / 9 - t / FR));
        put(ri, i, wave > 0.88 ? HOT : wave > 0.45 ? ORG : Math.floor(cs[i]! / 2.2) % 2 ? DARK : RED);
      } else if (d1[i]) put(fi, i, GLOW, Math.round(55 + 55 * pulse));
      else if (d2[i]) put(fi, i, GLOW, Math.round(22 + 28 * pulse));
    }
    tctx.putImageData(fi, 0, 0);
    // 머리·얼굴 위에는 빛을 안 그린다(사용자 지시): 그 조각 모양으로 지움
    cctx.setTransform(1, 0, 0, 1, 0, 0);
    cctx.clearRect(0, 0, W, H);
    for (const l of layers) {
      if (!(spec.noGlow ?? []).includes(l.slot) || !l.img.complete || !l.img.naturalWidth) continue;
      cctx.setTransform(l.m[0]!, l.m[1]!, l.m[2]!, l.m[3]!, l.m[4]! + pl, l.m[5]! + pt);
      cctx.drawImage(l.img, 0, 0);
    }
    tctx.globalCompositeOperation = 'destination-out';
    tctx.drawImage(cut, 0, 0);
    tctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(tmp, 0, 0);
    blit(ctx, ri);
  };
  const drawTails = (ctx: CanvasRenderingContext2D, tails: ChainTail[], pos: Map<string, number[]>, t: number, pulse: number) => {
    // 몸 뒤: 풀린 끝 + 날아가는 조각 + 빛무리
    solid.fill(0);
    const cells: [number, number[], number][] = [];
    for (const tn of tails) {
      const m = pos.get(tn.slot);
      if (!m) continue;
      const pts = path(tn, m, t);
      const seen = new Uint8Array(N);
      for (const p of pts) {
        const w = Math.max(tn.w * (1 - p.u) ** 0.5, 0.5);
        for (let y = Math.floor(p.y - 2); y <= p.y + 2; y++) for (let x = Math.floor(p.x - 2); x <= p.x + 2; x++) {
          if (x < 0 || y < 0 || x >= W || y >= H) continue;
          const j = y * W + x;
          if (seen[j] || (x - p.x) ** 2 + (y - p.y) ** 2 > w * w) continue;
          seen[j] = 1;
          if (!(p.u < 0.5 || Math.floor(p.s / 2) % 2 === 0)) continue; // 끝 절반은 고리가 끊어져 보인다
          solid[j] = 1;
          cells.push([j, p.u < 0.5 ? (Math.floor(p.s / 3.2) % 2 ? DARK : RED) : p.u < 0.8 ? ORG : HOT, 255]);
        }
      }
      // 끝에서 떨어져 날아가는 고리 조각·불티(11장에 걸쳐 식는다)
      for (let k = 0; k < 6; k++) {
        const tb = ((k * FR) / 6 + tn.ph * FR) % FR, age = (((t - tb) % FR) + FR) % FR;
        if (age >= 11) continue;
        const end = path(tn, m, tb).at(-1)!;
        const vx = Math.cos(end.a) * 0.45 + 0.38 * (end.x > pl + canvas[0] / 2 ? 1 : -1), vy = -Math.sin(end.a) * 0.25 - 0.42;
        const fx = Math.round(end.x + vx * age + 1.2 * Math.sin(2 * Math.PI * (age / 9 + k / 6))), fy = Math.round(end.y + vy * age);
        const big = age < 5 && k % 2 === 0, hy = big ? (k % 4 ? 1 : 2) : 1, hx = big ? 2 : 1;
        const col = age < 3 ? HOT : age < 6 ? ORG : RED, al = age < 6 ? 255 : age < 9 ? 200 : 120;
        for (let y = fy - hy + 1; y < fy + hy; y++) for (let x = fx - hx + 1; x < fx + hx; x++) {
          if (x < 0 || y < 0 || x >= W || y >= H) continue;
          cells.push([y * W + x, col, al]);
          if (age < 6) solid[y * W + x] = 1;
        }
      }
    }
    const bi = tctx.createImageData(W, H);
    dil(solid, d1, 1); dil(solid, d2, 3);
    for (let i = 0; i < N; i++) {
      if (solid[i]) continue;
      if (d1[i]) put(bi, i, GLOW, Math.round(70 + 60 * pulse));
      else if (d2[i]) put(bi, i, GLOW, Math.round(28 + 30 * pulse));
    }
    for (const [i, c, a] of cells) put(bi, i, c, a);
    blit(ctx, bi);
  };
  return {
    back, front,
    pad: [pl, pt] as [number, number],
    mids: () => [...mids.values()],
    step(dtMs: number, layers: FxLayer[]) {
      t = (t + Math.min(dtMs, 500) / MS) % FR;
      render(layers, t);
    },
  };
}
