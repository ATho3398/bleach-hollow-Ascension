// 지옥나비 (블리치 할로우 어센션 커스텀): pixelfx critters/butterfly(MIT) 를 그대로 두고 색만 검정·보라로, 뒷날개를 제비나비 모양(물결 가장자리 + 꼬리)으로 바꾸고 자주색 띠를 넣었다(앞날개는 원본 그대로).
// 사용자 2026-11-18 "그 나비 블리치의 지옥나비처럼 검정으로" → "원래거에서 날개 꼬리 모양만 바꾸자" → "아랫날개 모양 자체를 바꿔야지. 저 자주색 무늬까지만 넣어줘"(제비나비 실루엣·흰 날개맥 판은 버림). 게임에는 아직 안 붙임.
import { fit, mix, clamp, wrap, lerp, cycle, sparkle, TAU } from "../../core/index.js";
import { Grid, shift } from "../critters/_lib.js";

export const meta = {
  name: "Hell Butterfly",
  desc: "An iridescent butterfly wanders a loop in bursts of quick wingbeats and open-winged glides, its veined, spotted wings shedding a twinkling trail of glowing dust.",
  tags: ["custom", "critter", "butterfly", "swallowtail", "black", "insect", "flying", "magic", "glow", "loop"],
  size: [128, 88],
  origin: [64, 44],
  duration: 3.2,
  loop: true,
  fps: 30,
  bg: "sky",
  options: {
    palette: ["#050308", "#120c18", "#1b1424", "#241a30", "#2e223c", "#6a4690", "#d9bcff"],
    spots: ["#3a0828", "#9a1860", "#d8308a", "#ffc0e0"],
    seed: 1,
    still: false, // true = 제자리 날갯짓(펫 그림용): 돌아다니지 않고 위아래로만 살짝 뜬다
    dust: true, // false = 가루 없음
  },
};

const D = meta.duration, GRID = new Grid(-22, -20, 44, 47);
// the right wings, unfolded, in px from the wing root (y forward is negative)
const FORE = [[0, -1], [3, -6], [8, -11], [13, -12.5], [16.5, -10.5], [16.5, -6], [13, -1.5], [7, 1], [2, 1.5]];
// 뒷날개: 제비나비 — 물결진 바깥 가장자리 + 아래로 뻗은 꼬리
const HIND = [[0, 1], [6, 1.5], [10.5, 3], [12.6, 6], [11.3, 7.4], [12.7, 9.8], [11, 11.2], [11.6, 13.6], [9.7, 14.4], [9.9, 20], [8.3, 21.5], [6.9, 20], [7.1, 15.2], [4.6, 14.8], [3.3, 12], [1, 8]];

// flight: bursts of wingbeats (rising) and glides (sinking), wandering round a loop
const BURSTS = [[0, 0.95], [1.5, 2.55]];
function flapping(t) {
  for (const [a, b] of BURSTS) if (t >= a && t < b) return true;
  return false;
}
// the wing's fold, 1 flat open .. 0 edge-on: quick beats while flapping, held open while gliding
function fold(t) {
  t = wrap(t, D);
  for (const [a, b] of BURSTS)
    if (t >= a && t < b) {
      const n = Math.round((b - a) * 6.3), ph = ((t - a) / (b - a)) * n;
      return 0.14 + 0.86 * (0.5 + 0.5 * Math.cos(ph * TAU));
    }
  return 1;
}
function at(t) {
  t = wrap(t, D);
  const a = (t / D) * TAU;
  // a lift while it beats, a sink while it glides, so the path bobs in steps
  let lift = 0;
  for (const [s, e] of BURSTS) lift += -3 * Math.sin(Math.PI * clamp((t - s) / (e - s)));
  return { x: 30 * Math.sin(a) + 6 * Math.sin(3 * a), y: 12 * Math.sin(2 * a + 0.4) + lift, vx: Math.cos(a) };
}

const inPoly = (pts, x, y) => {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
function edgeDist(pts, x, y) {
  let m = Infinity;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [ax, ay] = pts[j], [bx, by] = pts[i], dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
    const u = clamp(((x - ax) * dx + (y - ay) * dy) / L2), px = ax + dx * u - x, py = ay + dy * u - y;
    m = Math.min(m, Math.hypot(px, py));
  }
  return m;
}

// a wing's pattern at an unfolded point: dark at the root, iridescent blue brightest along the leading edge,
// thin dark veins, a black apex dotted white on the forewing, a gold eyespot on the hindwing
const FSPOTS = [[13.2, -10.2], [15.2, -8.4], [14.6, -5.6], [11.6, -11.4]];
function wingColor(C, Sp, hind, u, v) {
  const pts = hind ? HIND : FORE, e = edgeDist(pts, u, v), r = Math.hypot(u, v), ang = Math.atan2(v, u);
  if (e < 1) return C[0];
  if (!hind) {
    if (u + v * -0.45 > 14.2 || (r > 12.5 && v < -4)) {
      for (const [sx, sy] of FSPOTS) if (Math.hypot(u - sx, v - sy) < 0.9) return C[6];
      return C[0];
    }
  } else {
    if (v > 14.6) return C[1]; // 꼬리
    // 바깥 가장자리를 따라가는 자주색 물결 띠
    if (e < 2.7 && u > 6.5 && v > 2.6) return e < 1.9 ? Sp[2] : Sp[1];
  }
  for (const va of hind ? [0.5, 1.0, 1.45] : [-1.2, -0.75, -0.3]) if (Math.abs(ang - va) * r < 0.45 && r > 3.5) return C[1];
  if (r < 3) return C[2];
  if (r < 6) return C[3];
  if (!hind && e < 2.4 && v < -3) return C[5];
  return C[4];
}

function butterfly(g, C, Sp, w, t) {
  g.clear();
  for (const s of [-1, 1])
    for (const hind of [true, false]) {
      const pts = hind ? HIND : FORE;
      g.shade(-20, -15, 20, 24, (x, y) => {
        if (Math.sign(x + 0.001) !== s) return 0;
        const u = (Math.abs(x) - 1) / w, v = y;
        if (u < 0 || !inPoly(pts, u, v)) return 0;
        let c = wingColor(C, Sp, hind, u, v);
        // folding up, the far side of each wing turns away from the light
        if (w < 0.5 && c !== C[0]) c = mix(c, C[1], (0.5 - w) * 1.6);
        return c;
      });
    }
  // the body: a fuzzy thorax, a tapering abdomen, a round head, curled antennae with bright tips
  g.ellipse(0, 0.5, 1.6, 2.6, (nx, ny) => (nx + ny < -0.4 ? C[3] : C[1]));
  for (let y = 3; y < 10; y++) g.set(-1, y, y < 6 ? C[2] : C[1]), y < 8 && g.set(0, y, C[1]);
  g.set(-1, -3, C[3]); g.set(0, -3, C[2]); g.set(-1, -4, C[2]); g.set(0, -4, C[1]);
  for (const s of [-1, 1]) {
    const tip = [s * 4 - (s > 0 ? 0 : 1), -9.5];
    g.line(s > 0 ? 0 : -1, -5, tip[0], tip[1], C[2]);
    g.set(tip[0], tip[1], C[6]);
  }
  g.outline((x, y, nx, ny) => C[0]);
}

export function draw(p, time, o) {
  const t = shift(time, D, o.seed), C = fit(o.palette, 7), Sp = fit(o.spots, 4), S0 = at(t), S = o.still ? { x: 0, y: S0.y - 12 * Math.sin(2 * ((wrap(t, D) / D) * TAU) + 0.4) } : S0, w = fold(t);
  // a trail of glowing dust shaken off the wings, drifting down and twinkling out
  if (o.dust !== false) cycle(t, D, 56, o.seed * 7 + 1, (r) => r.range(1, 1.8), (age, L, r, i) => {
    const born = wrap(t - age, D), B = at(born), k = age / L;
    if (!flapping(born) && r.chance(0.45)) return;
    const x = B.x + r.range(-9, 9) + Math.sin(age * 3 + i) * 1.5, y = B.y + r.range(-4, 8) + 7 * age + 3 * age * age;
    const tw = 0.5 + 0.5 * Math.sin(age * 11 + i * 2.1), a = Math.min(1, k * 8) * (1 - k);
    p.dot(x, y, tw > 0.7 ? C[6] : r.chance(0.3) ? Sp[2] : C[5], a * 1.2);
    p.glow(x, y, 6, C[4], 0.5 * a * tw);
    if (i % 9 === 0 && tw > 0.85 && k < 0.5) sparkle(p, x, y, 2, C[6], C[5], 0.3 * a);
  });
  const g = GRID;
  butterfly(g, C, Sp, w, t);
  g.draw(p, 1, S.x, S.y);
  // the wings shine: a soft blue light round it, brighter when they open
  p.glow(S.x, S.y, 38, C[4], 0.16 + 0.14 * w);
  p.glow(S.x, S.y, 12, C[5], 0.12 + 0.1 * w);
}
