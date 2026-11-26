// 호로 진화 (블리치 할로우 어센션 커스텀, 진화 연출을 픽셀 이펙트로): 가운데에 진화체를 두고, 화면에 금이 '쩌적' — '쩍' 가고, 틈에서 붉고 검은
// 기운이 새어 나오다 점점 거세지며 금이 벌어지고 → '펑'(공용 검붉은 폭발 + 화면 조각이 튀어 나감) → 걷힘. 원점 = 진화체 가운데.
// 사용자 2026-11-25 "진화 연출 진화체 가운데 두고, 화면에 금이 쩌적, 쩍 가고, 틈에선 붉고 검은 이펙트 새어나오다가 펑. 하는거로 하자."
// 금 모양은 pixelfx core bolt(번개 길 만들기), 불꽃 혀·불티·불덩이는 pixelfx fire/_lib.js (MIT, THIRD_PARTY_NOTICES.md).
import { rng, hex, seg, ease, bolt, forks, WHITE, TAU } from "../../core/index.js";
import { flameTongue, noiseFor, ember, firePuff } from "../fire/_lib.js";
import { blackBurst, HOT, DARK } from "./_hollowfx.js";

// 단계 시각(초) — 지금 진화 연출 길이(3.6초)에 맞춤: 쩌적 0.35·0.45 · 쩍 1.15 · 잔금 1.25·1.7 · 벌어짐 2.4~2.9 · 펑 2.9
/** 다음 진화체로 바뀌는 순간(초) = 펑 임팩트 (사용자 11-25 "임팩트 나오는 타이밍 맞춰서 다음 진화체 모델이 나오게") */
export const SWAP = 2.9;
const POP = SWAP, END = 3.6, CLEAR = 22; // CLEAR = 진화체 둘레 비워 두는 반지름(금은 이 밖에서 시작, 위아래는 1.9배 — 몸을 가로지르지 않게)
/** 금: [생기는 때, 방향(라디안), 굵기 배율] — 화면 가장자리까지 */
const CRACKS = [[0.35, -2.55, 1], [0.45, 0.35, 1], [1.15, -0.55, 1], [1.25, 2.45, 0.8], [1.7, 1.6, 0.6], [1.75, -1.5, 0.6]];
const SNAP = 0.09; // 금 하나가 끝까지 뻗는 데 걸리는 시간 (쩍!)
const L = [[1, 1, 7], [0.8, 0.88, 5], [0.55, 0.7, 3], [0.3, 0.45, 1]]; // 새어 나오는 불꽃 겹 (black 팔레트 번호)

export const meta = {
  name: "호로 진화",
  desc: "Hollow evolution (custom): cracks snap across the screen around the creature, red-black wisps leak from the gaps and swell, then it bursts and the shards fly.",
  tags: ["custom", "evolve", "crack", "black-fire", "one-shot", "fullscreen"],
  size: [212, 98],
  origin: [106, 49],
  duration: END,
  loop: false,
  fps: 30,
  bg: "dark",
  options: {
    black: ["#06040a", "#0e080c", "#1a0c10", "#2a1014", "#4a1418", "#6e1c20", "#a03c3d", "#c8504c", "#d6766e"],
    edge: "#e8d6cf", // 막 갈라진 금 가장자리의 흰 빛
    seed: 6,
  },
};

/** 금 길(점 목록) — 시드가 같으면 늘 같은 모양 */
function crackPath(i, seed) {
  const [, ang, ] = CRACKS[i], r = rng(seed, 100 + i);
  const x0 = Math.cos(ang) * CLEAR, y0 = Math.sin(ang) * CLEAR * 1.9, x1 = Math.cos(ang) * 150, y1 = Math.sin(ang) * 95;
  const main = bolt(r, x0, y0, x1, y1, { jag: 0.2, depth: 5 });
  return { main, twigs: forks(r, main, { count: 3, len: 22, jag: 0.35, spread: 0.8 }) };
}
const PATHS = new Map();
const pathOf = (i, seed) => PATHS.get(`${seed}:${i}`) ?? PATHS.set(`${seed}:${i}`, crackPath(i, seed)).get(`${seed}:${i}`);

/** 길의 앞쪽 u(0..1) 만큼만 */
function upto(pts, u) {
  const n = Math.max(1, Math.floor((pts.length - 1) * u));
  return pts.slice(0, n + 1);
}

export function draw(p, t, o) {
  if (t >= END) return;
  const B = o.black.map(hex), EDGE = hex(o.edge), N = noiseFor(0), n = (rate, seed, off) => N(t, rate, seed, off);
  const swell = ease.inQuad(seg(t, 1.8, POP)); // 터지기 전 거세짐
  const gone = seg(t, POP, POP + 0.12); // 펑과 함께 금이 사라짐

  CRACKS.forEach(([tc, , w], i) => {
    if (t < tc) return;
    const { main, twigs } = pathOf(i, o.seed), u = seg(t, tc, tc + SNAP), age = t - tc;
    const pts = upto(main, ease.outCubic(u));
    if (gone < 1) {
      const wide = (1 + 2.2 * swell) * w; // 점점 벌어짐
      // 틈 속 붉은 빛 (뒤) → 검은 틈 → 가운데 붉은 줄
            for (let k = 1; k < pts.length; k++) {
        const [ax, ay] = pts[k - 1], [bx, by] = pts[k];
        p.glowLine(ax, ay, bx, by, 3 + 4 * swell, B[6], (0.18 + 0.3 * swell) * (1 - gone));
        // 틈 = 검붉은 테 안에 붉게 타는 줄 (어두운 바탕에서도 보이게). 벌어질수록 굵고 밝게
        p.beam(ax, ay, bx, by, wide + 1.5, B[4], 1 - gone);
        if (wide > 1.6) p.beam(ax, ay, bx, by, wide, B[6], 1 - gone);
        p.line(ax, ay, bx, by, B[7 + (swell > 0.6 ? 1 : 0)], 1 - gone);
      }
      // 막 갈라진 순간: 흰 가장자리 번쩍
      const snapK = 1 - seg(age, SNAP, SNAP + 0.25);
      if (snapK > 0) for (let k = 1; k < pts.length; k++) p.line(pts[k - 1][0] + 1, pts[k - 1][1] - 1, pts[k][0] + 1, pts[k][1] - 1, EDGE, snapK);
      // 잔금 (본 금보다 조금 늦게)
      const tu = seg(age, SNAP * 0.6, SNAP * 1.8);
      if (tu > 0) for (const tw of twigs) p.polyline(upto(tw, tu), swell > 0.5 ? B[6] : B[2], 1 - gone);
    }
    // 틈에서 새어 나오는 붉고 검은 기운: 금을 따라 작은 불꽃 혀가 일렁이고, 불덩이 연기가 피어올라 흩어짐 (갈수록 많이)
    if (age > SNAP && t < POP + 0.05) {
      const leak = Math.min(1, (age - SNAP) / 0.5) * (0.5 + 0.9 * swell);
      const H = B; // 검정 심지 → 붉은 테
      for (let k = 2; k < pts.length - 1; k += 2) {
        const [x, y] = pts[k], hh = (4 + 9 * leak) * (0.6 + 0.4 * n(5, i * 31 + k, 0));
        flameTongue(p, x, y, hh, 1.6 + 1.6 * leak, n(1.5, i * 13 + k, 0) * 3, n, i * 50 + k, H, L, 0.5, 1.2);
      }
      const r = rng(o.seed, 200 + i), every = 0.07;
      for (let k = 0; k < 40; k++) {
        const born = tc + SNAP + k * every * (1 - 0.5 * swell) + r.range(0, every), life = r.range(0.5, 0.9);
        const j = 1 + Math.floor(r.next() * (main.length - 2)), vx = r.range(-10, 10), vy = r.range(-26, -10), sz = r.range(1.8, 3.4), dark = r.next() < 0.45, ph = r.next();
        const ag = t - born;
        if (ag < 0 || ag > life || born > POP) continue;
        const [x, y] = main[j];
        if (k % 4 === 3) ember(p, x + vx * ag, y + vy * ag * 1.4, 1 - ag / life, 1.4, [HOT[1], HOT[2], HOT[3], HOT[4]], ph * TAU);
        else firePuff(p, x + vx * ag + Math.sin(ag * 5 + ph * 6) * 2, y + vy * ag, 1 - ag / life, sz * (1 + 0.5 * swell), ph, dark ? DARK : HOT, 0.1);
      }
    }
    // 펑: 금 조각(화면 파편)이 바깥으로 튀어 나감
    if (t >= POP) {
      const r = rng(o.seed, 300 + i), ag = t - POP;
      for (let k = 2; k < main.length - 1; k += 2) {
        const [x, y] = main[k], d = Math.hypot(x, y) || 1, v = r.range(60, 120), spin = r.range(-9, 9), s = r.range(2, 4.5), life = r.range(0.35, 0.6);
        if (ag > life) continue;
        const px = x + (x / d) * v * ag, py = y + (y / d) * v * ag + 30 * ag * ag, a = spin * ag, k1 = 1 - ag / life;
        const tri = [0, 1, 2].map((q) => [px + Math.cos(a + (q * TAU) / 3) * s, py + Math.sin(a + (q * TAU) / 3) * s * 0.8]);
        p.poly(tri, k1 > 0.6 ? EDGE : B[6], Math.min(1, k1 * 1.5));
      }
    }
  });

  // 진화체 둘레: 거세질수록 붉은 빛이 감돎 (진화체를 가리지 않게 테두리만)
  if (swell > 0 && t < POP) p.glow(0, 0, CLEAR * 1.6, B[6], 0.3 * swell);

  // 펑 — 탄생 때와 같은 검붉은 폭발, 진화라 더 크게 + 섬광
  blackBurst(p, t - POP, 0, 0, 1.5, o.seed);
  const fl = seg(t, POP, POP + 0.03) * (1 - seg(t, POP + 0.03, POP + 0.25));
  if (fl > 0) p.rect(-106, -49, 212, 98, WHITE, 0.85 * fl);
  // 금이 갈 때마다 아주 짧은 붉은 번쩍 (쩌적·쩍 박자)
  for (const [tc] of CRACKS.slice(0, 3)) {
    const k = seg(t, tc, tc + 0.02) * (1 - seg(t, tc + 0.02, tc + 0.14));
    if (k > 0) p.rect(-106, -49, 212, 98, B[6], 0.18 * k);
  }
}
