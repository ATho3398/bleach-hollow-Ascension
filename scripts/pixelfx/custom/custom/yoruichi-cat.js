// 요루이치 (블리치 할로우 어센션 커스텀 펫): 앉아 있는 검은 고양이 — 노란 눈, 길게 말린 꼬리가 살랑, 가끔 깜빡임.
// 사용자 2026-11-18 "고양이 가능하면 요루이치로 추가".
import { Grid, shift, H, lit, wave, blink, petMeta } from "./_petkit.js";
export const meta = petMeta("Yoruichi (cat)", "A sleek black cat sits upright, golden eyes blinking, its long tail curling and swaying behind it.");
const D = meta.duration, G = new Grid(-24, -40, 48, 44);
const K = H("#000000"), FUR = [H("#4a4058"), H("#231d2c"), H("#141018")], EYE = H("#ffd23c"), PINK = H("#c8788a");
export function draw(p, time, o) {
  const t = shift(time, D, o.seed), g = G.clear(), sw = wave(t, D, 2), bob = wave(t, D, 1) > 0.6 ? -1 : 0;
  // 꼬리: 바닥에서 위로 말려 올라가 끝이 살랑
  g.tube([[-5, -2], [-10, -3], [-12.5, -9], [-11 + sw * 1.5, -15], [-8.5 + sw * 3, -18]], (u) => 1.5 - u * 0.5, (u) => (u > 0.5 ? FUR[1] : FUR[2]));
  // 몸통(위가 좁은 물방울) · 앞다리 · 발
  g.ellipse(-1, -7, 6.2, 7.2, lit(FUR));
  g.ellipse(0.5, -12, 4.6, 5, lit(FUR));
  for (const x of [1, 4]) { g.shade(x, -8, x + 1, -1, () => FUR[1]); g.set(x, -1, FUR[0]); g.set(x + 1, -1, FUR[0]); g.set(x + 2, -1, FUR[0]); }
  // 머리 + 뾰족한 귀
  const hy = -20 + bob;
  g.poly([[-2.6, hy - 2.5], [-1.6, hy - 9], [1.8, hy - 4.4]], FUR[1]);
  g.poly([[4.4, hy - 4.6], [7.8, hy - 9], [8.8, hy - 2.4]], FUR[1]);
  g.set(-1, hy - 6, PINK); g.set(7, hy - 6, PINK);
  g.ellipse(3, hy, 6.4, 5.2, lit(FUR));
  // 노란 눈(세로 동공), 코
  if (blink(t, D, 1.3)) { g.line(0, hy, 2, hy, K); g.line(5, hy, 7, hy, K); }
  else for (const x of [0, 5]) { g.shade(x, hy - 1, x + 2, hy + 1, () => EYE); g.set(x + 1, hy - 1, K); g.set(x + 1, hy, K); g.set(x + 1, hy + 1, K); }
  g.set(4, hy + 2, PINK);
  g.outline(K);
  g.draw(p);
}
