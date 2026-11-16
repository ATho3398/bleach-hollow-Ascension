// 인형 위에 얹는 불꽃 층 (GDD 115-A 135, 사용자 2026-11-14 "불꽃은 바로 넣어") — 작업본 전용(시험 페이지·편집기). 게임 코드(src/)는 안 건드린다.
// 도트 세션 계산식 live2.py(docs/art-samples/mugetsu-flame/, 2026-11-16)를 옮긴 것 — 사용자 "무월은 지금 거의 곰팡이마냥 돼서 아무것도 안보여":
// 불을 프레임마다 뿌려 쌓던 방식(뭉쳐서 덩어리가 됨)을 버리고, 제자리 그림(flame3.py)과 똑같은 불 줄기 모양(자라기 → 42% 뒤 밑동 떨어짐 → 갈고리·가시)을
// 매 화면 지금 자리에서 다시 그린다. 줄기의 높이 u 인 점은 u ÷ 0.55 박자(60ms) 전의 자리 위치를 따른다(최대 22박자, 끌림 최대 9칸) → 움직이면 줄기 위쪽만 뒤로 휘어 끌린다.
// 바깥 불 = 몸 뒤 층, 안쪽 불 = 하카마 위 층(하카마 모양으로 자름, 한 번에 2개만, 테두리만 보라). 칼(불꽃 팔) 덩어리는 칼끝이 3~6박자 늦게, 칼에 붙은 불은 지연 없이.
export interface FlameEmitter {
  slot: string; x: number; y: number;
  out: number; size: number; rise: number; licks: number; taper: number; sway: number; wl: number; lean: number; beat: number;
  inner?: boolean; order?: number;
  /** 붙어서 타는 불(칼날): 불 덩이를 날리지 않고 그 자리에 붙여 그린다 — 높이·굵기만 맥박처럼 변한다 */
  stick?: boolean;
  /** 옆 가시(갈고리 반대쪽 가는 가지) — 내부용 */
  barb?: boolean;
  /** 큰 불기둥 */
  plume?: boolean;
}
/** trail = 불꽃 팔: [조각, 조각 안 x, y, 어깨에서부터 거리 0~1, 거리(칸)] — 그 자리마다 일렁이는 검은 덩이(어깨 쪽이 굵다) */
/** alias = 그 조각이 숨겨진 동작에서는 대신 이 조각 자리를 쓴다(같은 뼈·같은 자리의 바꿔 끼운 그림 — 칼 날 위 등) */
export interface FlameSpec { alias?: Record<string, string>; look: string; pad: [number, number, number, number]; mask: string[]; trail?: [string, number, number, number, number][]; emitters: FlameEmitter[] }
/** 그 순간 그려진 조각 하나(앞뒤 순서대로): m = 조각 그림 → 캔버스 행렬(도트 단위) */
export interface FlameLayer { slot: string; m: number[]; img: HTMLImageElement }

const DT = 60, TICK = 2, PER = 16;
const LAG = 0.55, MAXLAG = 9, MAXDELAY = 22, KEEP = 26; // 불이 박자마다 올라가는 칸 · 끌림 최대 칸 · 지연 최대 박자 · 위치를 기억하는 박자
const C0 = [0, 0, 0], C2 = [54, 48, 63];

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
  const at = (key: unknown, cx: number, cy: number, delay: number): [number, number] => {
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
    return d > MAXLAG ? [cx + (dx * MAXLAG) / d, cy + (dy * MAXLAG) / d] : [x, y];
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
  const field = (buf: Uint8Array, shrink: number, inner: boolean) => {
    buf.fill(0);
    // 불꽃 모양의 시간은 120ms(2박자) 단위로 끊는다 — 사용자 2026-11-17 "불꽃 도트 속도 오히려 좀 느린게 도트겜느낌나서 좋거든? 프레임당 120ms로" (줄기가 몸을 따라가는 지연은 끊지 않음)
    const t = Math.floor(fr / TICK);
    for (const e of spec.emitters) {
      if (!!e.inner !== inner) continue;
      const w = world(e.slot, e.x, e.y);
      if (!w) continue;
      if (e.plume) continue; // 큰 불기둥은 인형에서 뺌(몸을 가림 — 사용자 2026-11-17 "실제 모션 보면 불이 너무많이 나서 뭐 아무것도 안보이더라")
      const arm = !!e.stick, ph = e.beat;
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
          const cx = sx + e.out * (0.6 + e.lean * u) + e.sway * Math.sin(2 * Math.PI * (u / e.wl - t / PER + ph / PER)) * Math.min(1, u / 5) + hk * 0.34 * span * q ** 2.6;
          return [cx, sy - u + 0.1 * span * q ** 4, q];
        };
        for (let u = st; u <= h; u += 0.6) {
          const [cx, cy, q] = P(u);
          const r = thick * (1 - q) ** e.taper * Math.min(1, (u - st + 0.7) / Math.max(1, 0.9 * thick));
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
    (spec.trail ?? []).forEach((tp, i) => {
      const [slot, lx, ly, a, sp] = tp;
      const w = world(slot, lx, ly);
      if (!w) return;
      const [sx, sy] = [w[0], w[1]]; // 지연 없음(사용자 2026-11-17 "휘두르면 채찍처럼 끝나. 이거 수정" — 칼끝 지연이 채찍처럼 휘게 했음)
      const r = 2 * (2.9 - 2.7 * a) + 0.9 * (1 - 0.85 * a) * Math.sin(2 * Math.PI * (sp / 9 - t / PER)) - shrink * 0.8;
      if (r > 0.35) disc(buf, sx, sy, Math.max(r, 0.5), Math.max(r, 0.5));
      void i;
    });
  };
  const render = (layers: FlameLayer[]) => {
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
    /** 1도트 = k px 로 자리·크기를 맞춘다(인형 칸 왼쪽 위 기준) */
    place(k: number) {
      for (const c of [back, front]) { c.style.left = `${-pl * k}px`; c.style.top = `${-pt * k}px`; c.style.width = `${W * k}px`; c.style.height = `${H * k}px`; }
    },
    /** 시간을 흘린다: 화면 한 장마다 자리 기억 → 다시 그리기. layers = 지금 그려진 조각(뒤 → 앞) */
    step(dtMs: number, layers: FlameLayer[]) {
      const dtF = Math.min(dtMs, 250) / DT;
      if (dtF <= 0) return;
      fr += dtF;
      pos = new Map(layers.map((l) => [l.slot, l.m]));
      for (const e of spec.emitters) { const w = world(e.slot, e.x, e.y); if (w) remember(e, w[0], w[1]); }
      for (const tp of spec.trail ?? []) { const w = world(tp[0], tp[1], tp[2]); if (w) remember(tp, w[0], w[1]); }
      render(layers);
    },
    /** 옛 방식(쌓기)의 '새 동작 때 빨리 꺼뜨리기' — 다시 그리는 방식에서는 쌓인 불이 없어 할 일이 없다 */
    quench() {},
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
