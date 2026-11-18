// 뼈 까마귀 (블리치 할로우 어센션 커스텀): pixelfx critters/bird(MIT) 를 검은 몸 + 뼈 가면 머리·뼈 부리·붉은 눈으로 바꿈. 제자리 날갯짓 그대로.
// 사용자 2026-11-18 "호로 뼈 까마귀도 ㄱㄱ" — 호로 골드 펫 그림(public/art/pet-bone-crow.webp)을 여기서 뽑는다(옵션 feather:false).
import { fit, hex, mix, clamp, wrap, lerp, smooth, ease, TAU } from "../../core/index.js";
import { Grid, shift } from "../critters/_lib.js";

export const meta = {
  name: "Bone Crow",
  desc: "A songbird flies in place: bursts of wingbeats that lift its body on each downstroke, a glide on spread wings, its tail fanning, a loose feather drifting away.",
  tags: ["custom", "critter", "bird", "crow", "bone", "flying", "animal", "loop"],
  size: [112, 80],
  origin: [56, 40],
  duration: 2.4,
  loop: true,
  fps: 30,
  bg: "sky",
  options: {
    palette: ["#000000", "#0e0c12", "#17141c", "#221e2a", "#2e2938", "#4a4458", "#f7e6dc"],
    breast: ["#0e0c12", "#17141c", "#221e2a", "#2e2938"],
    seed: 1,
    feather: true, // false = 떨어지는 깃털 없음(펫 그림용)
  },
};

const D = meta.duration, GRID = new Grid(-26, -26, 52, 46), BONE = hex("#f7e6dc"), BONED = hex("#a7929c"), EYE = hex("#e21014");
// the near wing's key poses, points from the shoulder: leading edge to the tip, then the trailing feathers back
const POSE = {
  up: [[0, 0], [-1, -8], [-5, -15], [-8, -13.5], [-10.5, -10.5], [-11, -7], [-9, -3], [-6, 1]],
  mid: [[0, 0], [-3, -2.5], [-9, -2.5], [-10.5, -0.5], [-10, 1.2], [-8.5, 2], [-7, 2.2], [-5, 2]],
  down: [[0, 0], [-1, 6], [-3.5, 12], [-6, 11], [-7.5, 8.5], [-8, 6], [-7, 3], [-5, 2]],
  fold: [[0, 0], [-3, -4], [-10, -5.5], [-11, -4], [-10, -2.5], [-8.5, -1], [-7, 0.5], [-5, 1.5]],
  glide: [[0, 0], [-2, -5], [-7, -10], [-10, -9], [-12, -6.5], [-11.5, -3.5], [-9, -1], [-6, 1]],
};
const mixPose = (a, b, u) => a.map(([x, y], i) => [lerp(x, b[i][0], u), lerp(y, b[i][1], u)]);
// flapping until GLIDE, then a glide on spread wings
const FLAPS = 2, GLIDE = 0.75; // 날갯짓 두 번 뒤 길게 활공 (사용자 2026-11-18 "날개짓 2번하고 슈웅~")
// 앞뒤 흐름: 날갯짓하는 동안 뒤로 밀리며 떠오르고, 활공하면서 앞으로 미끄러져 나간다 (칸)
function drift(t) {
  t = wrap(t, D);
  if (t < GLIDE) return lerp(8, -8, smooth(0, 1, t / GLIDE));
  return lerp(-8, 8, ease.outCubic((t - GLIDE) / (D - GLIDE)));
}
function wing(t) {
  t = wrap(t, D);
  if (t < GLIDE) {
    const u = ((t / GLIDE) * FLAPS) % 1;
    // a quick downstroke through the stretched-out middle, a slower upstroke folded close
    if (u < 0.4) {
      const k = ease.inOutSine(u / 0.4);
      return { pts: k < 0.5 ? mixPose(POSE.up, POSE.mid, k * 2) : mixPose(POSE.mid, POSE.down, k * 2 - 1), down: true, u };
    }
    const k = ease.inOutSine((u - 0.4) / 0.6);
    return { pts: k < 0.5 ? mixPose(POSE.down, POSE.fold, k * 2) : mixPose(POSE.fold, POSE.up, k * 2 - 1), down: false, u };
  }
  const g = (t - GLIDE) / (D - GLIDE), into = smooth(0, 0.15, g), out = smooth(0.85, 1, g);
  return { pts: mixPose(mixPose(POSE.up, POSE.glide, into), POSE.up, out), down: false, u: 0 };
}
// the body rises as the wings push down, and sinks a touch through the glide
function lift(t) {
  t = wrap(t, D);
  let y = 0;
  for (let k = 0; k < 6; k++) if (wing(t - k * 0.02).down) y -= 0.45;
  if (t >= GLIDE) y += 2.2 * Math.sin(Math.PI * ((t - GLIDE) / (D - GLIDE)));
  return y + 1.2;
}

const SH = [1, -2];
const wingPts = (w, far) => w.pts.map(([x, y]) => [SH[0] + x - (far ? 1 : 0), SH[1] + y * (far ? 0.85 : 1) - (far ? 1 : 0)]);

function bird(g, C, Br, t, w) {
  g.clear();
  // the far wing, behind the body and in shadow
  g.poly(wingPts(w, true), C[1]);
  // the tail: three feathers fanning as it brakes and lifts
  const tf = 0.25 + 0.35 * Math.sin((t / D) * TAU * 2);
  for (let i = 0; i < 3; i++) {
    const a = Math.PI + (i - 1) * tf * 0.5 + 0.1, L = 9 - Math.abs(i - 1);
    g.poly([[-7, -2.4], [-7 + Math.cos(a) * L, -1 + Math.sin(a) * L - 1.2], [-7 + Math.cos(a) * L, -1 + Math.sin(a) * L + 1.2], [-7, 0.6]], i === 0 ? C[3] : C[2]);
  }
  // body and head: a blue back lit from above, a rust breast, a pale belly
  const inBody = (x, y) => ((x + 1) / 8.5) ** 2 + (y / 5.2) ** 2 <= 1 || (x - 6.5) ** 2 + (y + 3) ** 2 <= 4.6 ** 2;
  g.shade(-10, -9, 12, 6, (x, y) => {
    if (!inBody(x, y)) return 0;
    const top = !inBody(x, y - 2.2), under = !inBody(x + 0.5, y + 1.6);
    // 머리 앞쪽 = 뼈 가면
    if ((x - 6.5) ** 2 + (y + 3) ** 2 <= 4.6 ** 2 && x > 4.2) return y > -1.2 ? BONED : BONE;
    if (y > -0.5 && x > -2.5) return under ? Br[1] : x > 3 && y < 2 ? Br[3] : Br[2];
    if (y > 1.5) return under ? C[4] : C[5];
    return top ? (x > 2 ? C[5] : C[4]) : y < -3.5 && x > 3 ? C[4] : C[3];
  });
  // 뼈 부리(길고 뾰족), 검은 눈구멍 안 붉은 점
  g.poly([[10.5, -5.2], [17, -2.4], [10.5, -1.2]], (x, y) => (y < -2.8 ? BONE : BONED));
  g.set(7, -5, C[0]); g.set(8, -5, C[0]); g.set(7, -4, C[0]); g.set(8, -4, EYE);
  // the near wing: lit along its leading edge, the flight feathers splayed at the tips
  const wp = wingPts(w, false);
  const edge = (x, y) => {
    let m = Infinity;
    for (let i = 1; i < 3; i++) {
      const [ax, ay] = wp[i - 1], [bx, by] = wp[i], dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1, u = clamp(((x - ax) * dx + (y - ay) * dy) / L2);
      m = Math.min(m, Math.hypot(ax + dx * u - x, ay + dy * u - y));
    }
    return m;
  };
  g.poly(wp, (x, y) => {
    const d = edge(x, y);
    return d < 1.2 ? C[5] : d < 3 ? C[4] : C[3];
  });
  // the flight feathers: dark lines splaying from the wrist to the trailing edge
  for (let i = 3; i < 7; i++) g.line(wp[1][0], wp[1][1], lerp(wp[1][0], wp[i][0], 0.92), lerp(wp[1][1], wp[i][1], 0.92), C[2]);
  g.outline(C[0]);
}

export function draw(p, time, o) {
  const t = shift(time, D, o.seed), C = fit(o.palette, 7), Br = fit(o.breast, 4), w = wing(t), y = lift(t);
  const g = GRID;
  // on the downstroke, a see-through echo of the wing a moment before smears the beat
  if (w.down && w.u > 0.1) {
    const s = t - 0.05, ws = wing(s);
    g.clear();
    g.poly(wingPts(ws, false), C[4]);
    g.a.fill(0.42);
    g.draw(p, 1, Math.round(drift(s)), Math.round(lift(s)));
  }
  bird(g, C, Br, t, w);
  g.draw(p, 1, Math.round(drift(t)), Math.round(y));
  // a loose feather drifts off and rocks down out of sight
  const fa = wrap(t - 0.45, D);
  if (o.feather !== false && fa < 1.8) {
    const fx = -6 - 14 * fa - 3 * Math.sin(fa * 5), fy = 4 + 9 * fa + 1.5 * Math.cos(fa * 5) * fa, rock = Math.sin(fa * 5) * 0.8;
    const a = Math.min(1, (1.8 - fa) * 2);
    for (let i = -2; i <= 2; i++) p.dot(fx + i * Math.cos(rock), fy + i * Math.sin(rock) * 0.8, i < 0 ? C[5] : C[4], a);
    p.dot(fx + 2.6 * Math.cos(rock), fy + 2.6 * Math.sin(rock) * 0.8, C[3], a);
  }
}
