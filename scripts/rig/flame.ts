// 인형 위에 얹는 불꽃 층 (GDD 115-A 135, 사용자 2026-11-14 "불꽃은 바로 넣어") — 작업본 전용(시험 페이지·편집기). 게임 코드(src/)는 안 건드린다.
// 도트 세션 계산식(docs/art-samples/mugetsu-flame/live.py 의 emit·render)을 옮긴 것: 불 나오는 자리를 조각에 붙여 두고, 나온 불은 화면에 남아 위로 올라간다
// (걷거나 휘두르면 불이 뒤로 끌린다). 바깥 불 = 몸 뒤 층, 안쪽 불 = 하카마 위 층(하카마 모양으로 자름, 한 번에 2개만, 테두리만 보라).
export interface FlameEmitter {
  slot: string; x: number; y: number;
  out: number; size: number; rise: number; licks: number; taper: number; sway: number; wl: number; lean: number; beat: number;
  inner?: boolean; order?: number;
}
/** trail = 불꽃 팔: [조각, 조각 안 x, y, 어깨에서부터 거리 0~1, 거리(칸)] — 그 자리마다 일렁이는 검은 덩이(어깨 쪽이 굵다) */
export interface FlameSpec { look: string; pad: [number, number, number, number]; mask: string[]; trail?: [string, number, number, number, number][]; emitters: FlameEmitter[] }
/** 그 순간 그려진 조각 하나(앞뒤 순서대로): m = 조각 그림 → 캔버스 행렬(도트 단위) */
export interface FlameLayer { slot: string; m: number[]; img: HTMLImageElement }

const DT = 60, TICK = 2, LIFE = 26, RISE = 0.62, PER = 16;
const C0 = [0, 0, 0], C2 = [54, 48, 63];
interface Puff { b: number; x: number; y: number; th: number; e: FlameEmitter }

export function createFlame(spec: FlameSpec, canvas: [number, number]) {
  const [pl, pt, pr, pb] = spec.pad;
  const W = canvas[0] + pl + pr, H = canvas[1] + pt + pb;
  const mk = (z: string) => {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    c.style.cssText = `position:absolute;image-rendering:pixelated;pointer-events:none;z-index:${z}`;
    return c;
  };
  const back = mk('0'), front = mk('500');
  const maskC = document.createElement('canvas');
  maskC.width = W; maskC.height = H;
  const bctx = back.getContext('2d')!, fctx = front.getContext('2d')!, mctx = maskC.getContext('2d')!;
  let puffs: Puff[] = [];
  let fr = 0, acc = 0;
  const prev = new Map<FlameEmitter, [number, number]>();
  const f0 = new Uint8Array(W * H), f1 = new Uint8Array(W * H);

  const emit = (pos: Map<string, number[]>) => {
    for (const e of spec.emitters) {
      const m = pos.get(e.slot);
      if (!m) continue;
      const wx = m[0]! * e.x + m[2]! * e.y + m[4]! + pl, wy = m[1]! * e.x + m[3]! * e.y + m[5]! + pt;
      let [px, py] = prev.get(e) ?? [wx, wy];
      if (Math.hypot(wx - px, wy - py) > 40) { px = wx; py = wy; }
      prev.set(e, [wx, wy]);
      const k = Math.max(1, Math.ceil(Math.hypot(wx - px, wy - py))); // 빨리 움직이면 사이를 메워 낸다(한 칸에 하나)
      for (let j = 0; j < k; j++) {
        const a = (j + 1) / k, bt = fr - 1 + a;
        let p: number;
        if (e.inner) { const q = ((((bt / TICK - (e.order ?? 0) * 4) % 40) + 40) % 40) / 8; p = q < 1 ? Math.sin(Math.PI * q) ** 0.6 : 0; } // 안쪽 불: 한 번에 2개만
        else p = Math.max(0, Math.sin(2 * Math.PI * ((bt / TICK + e.beat) / (PER / e.licks)))) ** 0.6;
        if (p > 0.15) puffs.push({ b: bt, x: px + (wx - px) * a, y: py + (wy - py) * a, th: e.size * p, e });
      }
    }
    puffs = puffs.filter((p) => fr - p.b < LIFE * 2);
  };
  /** 불 덩이들을 칸에 채운다(shrink 만큼 줄인 모양 = 속) */
  let pos = new Map<string, number[]>();
  const field = (buf: Uint8Array, shrink: number, pick: (p: Puff) => boolean, arm = false) => {
    buf.fill(0);
    if (arm) for (const [slot, lx, ly, a, sp] of spec.trail ?? []) {
      const m = pos.get(slot);
      if (!m) continue;
      let r = 2.9 - 2.1 * a + 0.5 * Math.sin(2 * Math.PI * (sp / 9 - fr / (PER * TICK))) - shrink * 0.8;
      if (r <= 0.35) continue;
      r = Math.max(r, 0.5);
      const cx = m[0]! * lx + m[2]! * ly + m[4]! + pl, cy = m[1]! * lx + m[3]! * ly + m[5]! + pt;
      for (let y = Math.max(0, Math.floor(cy - r - 1)); y < Math.min(H, Math.floor(cy + r + 2)); y++) for (let x = Math.max(0, Math.floor(cx - r - 1)); x < Math.min(W, Math.floor(cx + r + 2)); x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) buf[y * W + x] = 1;
    }
    for (const p of puffs) {
      if (!pick(p)) continue;
      const e = p.e, age = fr - p.b, life = (LIFE * e.rise) / 20;
      if (age < 0 || age >= life) continue;
      const l = age / life;
      let r = p.th * (1 - l) ** (0.9 + 0.5 * e.taper) - shrink; // 끝으로 갈수록 빨리 가늘어져 뾰족하게
      if (r < 0.3) continue;
      r = Math.max(r, 0.5);
      const ry = r * (1.25 + 1.6 * l), u = RISE * age; // 끝은 세로로 길쭉한 바늘 모양
      const cx = p.x + e.out * (0.6 + e.lean * u) + e.sway * Math.sin(2 * Math.PI * (u / e.wl - fr / (PER * TICK) + e.beat / PER)) * Math.min(1, u / 5);
      const cy = p.y - u;
      const x1 = Math.max(0, Math.floor(cx - r - 1)), x2 = Math.min(W, Math.floor(cx + r + 2));
      const y1 = Math.max(0, Math.floor(cy - ry - 1)), y2 = Math.min(H, Math.floor(cy + ry + 2));
      for (let y = y1; y < y2; y++) for (let x = x1; x < x2; x++) if (((x - cx) / r) ** 2 + ((y - cy) / ry) ** 2 <= 1) buf[y * W + x] = 1;
    }
  };
  const render = (layers: FlameLayer[]) => {
    // 몸 뒤: 바깥 불 — 테두리 한 칸 보라, 속 검정
    field(f0, 0, (p) => !p.e.inner, true); field(f1, 1.1, (p) => !p.e.inner, true);
    const bi = bctx.createImageData(W, H);
    for (let i = 0; i < W * H; i++) if (f0[i]) { const c = f1[i] ? C0 : C2; bi.data.set([c[0]!, c[1]!, c[2]!, 255], i * 4); }
    bctx.putImageData(bi, 0, 0);
    // 하카마 위: 안쪽 불 — 자리마다 따로, 속 검정·테두리는 왼쪽 30% 지우고 맨 위 3줄은 남김
    const fi = fctx.createImageData(W, H);
    for (const e of spec.emitters) {
      if (!e.inner) continue;
      field(f0, 0, (p) => p.e === e); field(f1, 1.1, (p) => p.e === e);
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
    /** 1도트 = k px 로 자리·크기를 맞춘다(인형 칸 왼쪽 위 기준) */
    place(k: number) {
      for (const c of [back, front]) { c.style.left = `${-pl * k}px`; c.style.top = `${-pt * k}px`; c.style.width = `${W * k}px`; c.style.height = `${H * k}px`; }
    },
    /** 시간을 흘린다: 60ms 마다 한 박자(불 내기 → 그리기). layers = 지금 그려진 조각(뒤 → 앞) */
    step(dtMs: number, layers: FlameLayer[]) {
      acc += Math.min(dtMs, 500);
      if (acc < DT) return;
      pos = new Map(layers.map((l) => [l.slot, l.m]));
      while (acc >= DT) { acc -= DT; fr++; emit(pos); }
      render(layers);
    },
  };
}
/** 인형(createPaperdoll)의 조각 그림에서 지금 자리 읽기: transform = matrix(a,b,c,d,e·k,f·k), z-index = 앞뒤 */
export function dollLayers(root: HTMLElement, k: number): FlameLayer[] {
  const out: (FlameLayer & { z: number })[] = [];
  root.querySelectorAll<HTMLImageElement>('img[data-slot]').forEach((img) => {
    if (img.style.display === 'none') return;
    const v = /matrix\(([^)]+)\)/.exec(img.style.transform)?.[1]?.split(',').map(Number);
    if (!v || v.length !== 6) return;
    out.push({ slot: img.dataset.slot!, m: [v[0]!, v[1]!, v[2]!, v[3]!, v[4]! / k, v[5]! / k], img, z: Number(img.style.zIndex) || 0 });
  });
  return out.sort((a, b) => a.z - b.z);
}
