// 요루이치 걷기 (블리치 할로우 어센션 커스텀 펫): 옆모습으로 오른쪽을 보고 제자리 걸음 — 가는 다리가 번갈아 나가고 꼬리를 세워 살랑.
// 사용자 2026-11-18 "고양이랑 강아지는 걷는 모션 있음?" — 앉은 그림(custom/yoruichi-cat)의 걷는 짝.
import { TAU } from "../../core/index.js";
import { Grid, shift, H, lit, wave, blink, petMeta } from "./_petkit.js";
export const meta = petMeta("Yoruichi (cat, walk)", "A sleek black cat walks in place, slim legs alternating, tail held high and swaying.");
const D = meta.duration, G = new Grid(-24, -40, 48, 44), STEPS = 4;
const K = H("#000000"), FUR = [H("#4a4058"), H("#231d2c"), H("#141018")], EYE = H("#ffd23c"), PINK = H("#c8788a");
function leg(g, hx, ph, c) {
  const fx = hx + 3.4 * Math.sin(ph), lift = Math.max(0, Math.cos(ph)) * 2;
  g.tube([[hx, -8], [(hx + fx) / 2 + 0.5, -4 - lift * 0.5], [fx, -1 - lift]], 0.9, c);
  g.set(fx + 1, -1 - lift, c);
}
export function draw(p, time, o) {
  const t = shift(time, D, o.seed), g = G.clear(), ph = (t / D) * TAU * STEPS, bob = Math.round(0.8 * Math.sin(ph * 2)), sw = wave(t, D, 2);
  leg(g, 4.5, ph + Math.PI, FUR[2]); leg(g, -6, ph, FUR[2]);
  // 꼬리: 엉덩이에서 위로 세워 끝이 살랑
  g.tube([[-8, -11 + bob], [-11, -15 + bob], [-11.5 + sw, -20 + bob], [-9.5 + sw * 2.4, -23 + bob]], (u) => 1.3 - u * 0.4, FUR[1]);
  g.ellipse(-1.5, -10.5 + bob, 8.2, 4.2, lit(FUR));
  leg(g, 3.5, ph, FUR[1]); leg(g, -5, ph + Math.PI, FUR[1]);
  // 머리 + 뾰족한 귀
  const hx = 7.5, hy = -15.5 + bob;
  g.poly([[hx - 4.6, hy - 2.4], [hx - 3.6, hy - 8], [hx - 0.6, hy - 4]], FUR[1]);
  g.poly([[hx + 1, hy - 4.2], [hx + 4, hy - 8], [hx + 4.8, hy - 2.2]], FUR[1]);
  g.set(hx - 3, hy - 5, PINK); g.set(hx + 3, hy - 5, PINK);
  g.ellipse(hx, hy, 5.4, 4.6, lit(FUR));
  if (blink(t, D, 1.3)) { g.line(hx - 2, hy, hx - 1, hy, K); g.line(hx + 2, hy, hx + 3, hy, K); }
  else for (const x of [hx - 2.5, hx + 1.5]) { g.shade(x, hy - 1, x + 1.9, hy + 0.5, () => EYE); g.set(x + 1, hy - 1, K); g.set(x + 1, hy, K); }
  g.set(hx + 4, hy + 1.6, PINK);
  g.outline(K);
  g.draw(p);
}
