// 쿠카푸로 걷기 (블리치 할로우 어센션 커스텀 펫): 옆모습으로 오른쪽을 보고 제자리 걸음 — 네 다리가 번갈아 나가고 몸이 들썩, 꼬리 흔듦.
// 사용자 2026-11-18 "고양이랑 강아지는 걷는 모션 있음?" — 앉은 그림(custom/kukkapuro)의 걷는 짝.
import { TAU } from "../../core/index.js";
import { Grid, shift, H, lit, wave, petMeta } from "./_petkit.js";
export const meta = petMeta("Kukkapuro (walk)", "A small tan puppy in a horned white skull mask trots in place, legs alternating, tail wagging.");
const D = meta.duration, G = new Grid(-24, -40, 48, 44), STEPS = 4;
const K = H("#000000"), TAN = [H("#f0b890"), H("#dea07a"), H("#b87a5a")], EAR = [H("#dea07a"), H("#c48862"), H("#9a6448")], BONE = [H("#ffffff"), H("#f7e6dc"), H("#a7929c")];
function leg(g, hx, ph, c) {
  const fx = hx + 3.2 * Math.sin(ph), lift = Math.max(0, Math.cos(ph)) * 2.2;
  g.tube([[hx, -7], [(hx + fx) / 2 + 0.6, -3.5 - lift * 0.5], [fx, -1 - lift]], 1.25, c);
  g.shade(fx - 1, -1 - lift, fx + 1.6, -1 - lift, () => c);
}
export function draw(p, time, o) {
  const t = shift(time, D, o.seed), g = G.clear(), ph = (t / D) * TAU * STEPS, bob = Math.round(0.9 * Math.sin(ph * 2)), wag = wave(t, D, 8);
  // 먼 쪽 다리(어둡게) → 꼬리 → 몸 → 가까운 다리
  leg(g, 4.5, ph + Math.PI, TAN[2]); leg(g, -6.5, ph, TAN[2]);
  g.tube([[-8.5, -11 + bob], [-11.5, -14 + bob + wag * 0.8], [-12.5, -18 + bob + wag * 1.6]], (u) => 1.5 - u * 0.6, TAN[1]);
  g.ellipse(-1, -10 + bob, 8.6, 5.2, lit(TAN));
  leg(g, 3, ph, TAN[1]); leg(g, -5, ph + Math.PI, TAN[1]);
  // 머리(앞으로 내밈) + 늘어진 귀 + 가면
  const hx = 8.5, hy = -16 + bob;
  g.ellipse(hx - 1.5, hy, 6, 5.6, lit(TAN));
  g.ellipse(hx - 5.6, hy + 2 + (wag > 0.4 ? 1 : 0), 2.2, 4.2, lit(EAR));
  g.ellipse(hx + 1, hy + 0.3, 5, 4.8, lit(BONE));
  g.poly([[hx - 2.4, hy - 3.6], [hx - 1.6, hy - 7.6], [hx + 0.2, hy - 4.2]], BONE[1]);
  g.poly([[hx + 1.8, hy - 4.4], [hx + 4.2, hy - 7.6], [hx + 4.6, hy - 3.2]], BONE[1]);
  g.ellipse(hx - 0.6, hy - 0.4, 1.3, 1.7, K); g.ellipse(hx + 3.2, hy - 0.4, 1.2, 1.6, K);
  g.set(hx + 5, hy + 2, K);
  g.outline(K);
  g.draw(p);
}
