// 지옥나비 (블리치 할로우 어센션 커스텀): pixelfx critters/butterfly(MIT) 를 제비나비 실루엣(긴 앞날개·꼬리 달린 뒷날개)·회색빛 검정·자주색 띠로 바꿈.
// 사용자 2026-11-18 "그 나비 블리치의 지옥나비처럼 검정으로" · "제비나비 계열 … 실루엣 변경" · 무늬 참고 그림 2장. 게임에는 아직 안 붙임(색·모양 시안).
import { fit, mix, clamp, wrap, lerp, cycle, sparkle, TAU } from "../../core/index.js";
import { Grid, shift } from "../critters/_lib.js";

export const meta = {
  name: "Hell Butterfly",
  desc: "A black swallowtail (hell butterfly): long swept forewings, scalloped hindwings with tails, red crescents and a pale patch, wandering a loop in bursts of wingbeats and glides.",
  tags: ["custom", "critter", "butterfly", "swallowtail", "black", "insect", "flying", "magic", "glow", "loop"],
  size: [128, 88],
  origin: [64, 44],
  duration: 3.2,
  loop: true,
  fps: 30,
  bg: "sky",
  options: {
    palette: ["#000000", "#16151b", "#2a2930", "#3b3a43", "#4a4954", "#6a6876", "#e8e4ec"],
    spots: ["#3a0828", "#9a1860", "#d8308a", "#ffc0e0"],
    seed: 1,
  },
};

const D = meta.duration, GRID = new Grid(-28, -22, 56, 47);
// the right wings, unfolded, in px from the wing root (y forward is negative)
const FORE = [[0, -1], [4, -8], [10, -13.5], [17, -16], [22, -15], [22.5, -11], [19, -5], [11, 0], [3, 1.5]];
// scalloped edge, then a tail hanging from the middle of the hindwing
const HIND = [[0, 1], [6, 1], [11, 2.5], [13, 5.5], [11.5, 7], [12.5, 9.5], [10.5, 10.5], [10.5, 13], [8.8, 13.3], [9, 19], [7.4, 20.5], [6, 19], [6.4, 14], [4.2, 13.5], [3.4, 11], [1, 8]];

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

// a wing's pattern: black all over, faint lighter streaks fanning to the forewing's edge, dark veins,
// red crescents inside the hindwing's scallops and a pale patch at its leading edge
function wingColor(C, Sp, hind, u, v) {
  const pts = hind ? HIND : FORE, e = edgeDist(pts, u, v), r = Math.hypot(u, v), ang = Math.atan2(v, u);
  if (e < 1) return C[0];
  if (!hind) {
    // charcoal wing, dark veins fanning from the root, a darker cell near the body
    if (r > 5 && Math.abs(Math.sin(ang * 11 + 0.4)) > 0.93) return C[1];
    if (r < 4.5) return C[2];
    return e < 2 && r > 12 ? C[2] : C[3];
  }
  if (v > 13.6) return C[1]; // the tail
  // a magenta band scalloped along the outer margin
  if (e < 2.8 && r > 8.5 && v > 3.5 && u > 6.5) return e < 1.9 ? Sp[2] : Sp[1];
  for (const va of [0.5, 1.0, 1.45]) if (Math.abs(ang - va) * r < 0.45 && r > 3.5) return C[1];
  return r < 5 ? C[2] : C[3];
}

function butterfly(g, C, Sp, w, t) {
  g.clear();
  for (const s of [-1, 1])
    for (const hind of [true, false]) {
      const pts = hind ? HIND : FORE;
      g.shade(-26, -18, 26, 23, (x, y) => {
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
  const t = shift(time, D, o.seed), C = fit(o.palette, 7), Sp = fit(o.spots, 4), S = at(t), w = fold(t);
  // a trail of glowing dust shaken off the wings, drifting down and twinkling out
  cycle(t, D, 22, o.seed * 7 + 1, (r) => r.range(1, 1.8), (age, L, r, i) => {
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
