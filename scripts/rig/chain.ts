// 인형 위에 얹는 사슬 이펙트 층 (GDD 115-A 149) — 작업본 전용(시험 페이지·편집기). 도트 세션 docs/art-samples/chain-ichigo-flame/chain.py 를 옮긴 것.
// 몸 앞: 목·손목·발목에 두른 사슬 띠(고리 무늬 + 띠를 따라 흐르는 달아오른 점 + 붉은 빛무리). 몸 뒤: 띠 한쪽 끝에서 풀려 나부끼는 짧은 끝, 거기서 떨어져 날아가며 식는 조각, 빛무리.
// 띠·끝 자리는 조각(slot) 안 좌표라 조각이 움직이면 같이 간다. 16장(120ms) 한 바퀴 — 시간은 이어지게 흘린다. 검정 외곽선 없음, 머리·얼굴 위에는 빛을 안 그린다.
import type { FlameLayer } from './flame';

export interface ChainBand { name?: string; slot: string; pts: [number, number][] }
export interface ChainTail { name?: string; slot: string; x: number; y: number; ang: number; L: number; w: number; curl: number; ph: number; sw?: number }
export interface ChainSpec { look: string; pad: [number, number, number, number]; noGlow?: string[]; bands: ChainBand[]; tails: ChainTail[] }

const FR = 16, MS = 120;
const DARK = [95, 20, 30], RED = [172, 49, 59], ORG = [236, 110, 60], HOT = [255, 190, 90], GLOW = [225, 40, 45];

export function createChain(spec: ChainSpec, canvas: [number, number]) {
  const [pl, pt, pr, pb] = spec.pad;
  const W = canvas[0] + pl + pr, H = canvas[1] + pt + pb;
  const mk = (z: string) => {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    c.style.cssText = `position:absolute;image-rendering:pixelated;pointer-events:none;z-index:${z}`;
    return c;
  };
  const back = mk('1'), front = mk('600');
  const bctx = back.getContext('2d')!, fctx = front.getContext('2d')!;
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
  const render = (layers: FlameLayer[], tt: number) => {
    const t = Math.floor(tt); // 120ms 마다 한 장(사용자 2026-11-17 "프레임당 120ms로")
    const pos = new Map(layers.map((l) => [l.slot, l.m]));
    const pulse = 0.5 + 0.5 * Math.sin((2 * Math.PI * t) / FR);
    // 몸 앞: 띠 칸과 띠를 따라 잰 거리
    cb.fill(0);
    for (const b of spec.bands) {
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
    const fi = fctx.createImageData(W, H);
    dil(cb, d1, 1); dil(cb, d2, 2);
    for (let i = 0; i < N; i++) {
      if (cb[i]) {
        const wave = Math.sin(2 * Math.PI * (cs[i]! / 9 - t / FR));
        put(fi, i, wave > 0.88 ? HOT : wave > 0.45 ? ORG : Math.floor(cs[i]! / 2.2) % 2 ? DARK : RED);
      } else if (d1[i]) put(fi, i, GLOW, Math.round(55 + 55 * pulse));
      else if (d2[i]) put(fi, i, GLOW, Math.round(22 + 28 * pulse));
    }
    fctx.putImageData(fi, 0, 0);
    // 머리·얼굴 위에는 빛을 안 그린다(사용자 지시): 그 조각 모양으로 지움
    cctx.setTransform(1, 0, 0, 1, 0, 0);
    cctx.clearRect(0, 0, W, H);
    for (const l of layers) {
      if (!(spec.noGlow ?? []).includes(l.slot) || !l.img.complete || !l.img.naturalWidth) continue;
      cctx.setTransform(l.m[0]!, l.m[1]!, l.m[2]!, l.m[3]!, l.m[4]! + pl, l.m[5]! + pt);
      cctx.drawImage(l.img, 0, 0);
    }
    fctx.globalCompositeOperation = 'destination-out';
    fctx.drawImage(cut, 0, 0);
    fctx.globalCompositeOperation = 'source-over';
    // 몸 뒤: 풀린 끝 + 날아가는 조각 + 빛무리
    solid.fill(0);
    const cells: [number, number[], number][] = [];
    for (const tn of spec.tails) {
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
    const bi = bctx.createImageData(W, H);
    dil(solid, d1, 1); dil(solid, d2, 3);
    for (let i = 0; i < N; i++) {
      if (solid[i]) continue;
      if (d1[i]) put(bi, i, GLOW, Math.round(70 + 60 * pulse));
      else if (d2[i]) put(bi, i, GLOW, Math.round(28 + 30 * pulse));
    }
    for (const [i, c, a] of cells) put(bi, i, c, a);
    bctx.putImageData(bi, 0, 0);
  };
  return {
    back, front,
    place(k: number) {
      for (const c of [back, front]) { c.style.left = `${-pl * k}px`; c.style.top = `${-pt * k}px`; c.style.width = `${W * k}px`; c.style.height = `${H * k}px`; }
    },
    step(dtMs: number, layers: FlameLayer[]) {
      t = (t + Math.min(dtMs, 500) / MS) % FR;
      render(layers, t);
    },
  };
}
