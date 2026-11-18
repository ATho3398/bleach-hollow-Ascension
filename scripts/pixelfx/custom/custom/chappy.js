// 차피 (블리치 할로우 어센션 커스텀 펫): 보라색 통 위에 토끼 머리 — 긴 귀가 까딱, 통째로 통통 튄다, 가끔 깜빡임.
// 사용자 2026-11-18 "3번 토끼 대가리를 가진 펫으로 차피 추가".
import { Grid, shift, H, lit, wave, blink, petMeta } from "./_petkit.js";
export const meta = petMeta("Chappy", "A white rabbit head on a purple canister hops in place, long ears wiggling, eyes blinking.");
const D = meta.duration, G = new Grid(-24, -44, 48, 48);
const K = H("#000000"), W = [H("#ffffff"), H("#f7e6dc"), H("#c9b4bc")], PUR = [H("#a878d8"), H("#7a4aa8"), H("#54307a")], PINK = H("#f0a0b8"), GOLD = H("#f0c850");
export function draw(p, time, o) {
  const t = shift(time, D, o.seed), g = G.clear();
  // 통통: 한 번에 0.6초, 뜰 때 -3칸 · 내려앉을 때 1칸 눌림
  const u = (t % 0.6) / 0.6, up = Math.round(-3 * Math.sin(Math.PI * Math.min(1, u / 0.7))), sq = u > 0.82 ? 1 : 0;
  const by = up, ear = wave(t, D, 4);
  // 통(아래)
  g.shade(-4, by - 11 + sq, 3, by - 1, (x) => (x < -2.5 ? PUR[0] : x > 2 ? PUR[2] : PUR[1]));
  g.shade(-4, by - 6, 3, by - 5, () => GOLD);
  // 귀 둘(머리 뒤에서 위로), 안쪽 분홍
  const hy = by - 17 + sq;
  for (const s of [-1, 1]) {
    const ex = s * 3.6, tip = ex + s * 0.6 + ear * (s > 0 ? 1.2 : 0.6);
    g.tube([[ex, hy - 4], [(ex + tip) / 2, hy - 9], [tip, hy - 14]], 2.1, (uu, v) => (v < 0.45 && uu > 0.15 ? PINK : W[1]));
  }
  // 머리
  g.ellipse(0, hy, 8.2, 6.4, lit(W));
  // 눈·볼·입
  if (blink(t, D, 1.0)) { g.line(-4, hy, -3, hy, K); g.line(2, hy, 3, hy, K); }
  else { g.shade(-4, hy - 1, -3, hy, () => K); g.shade(2, hy - 1, 3, hy, () => K); }
  g.set(-6, hy + 2, PINK); g.set(5, hy + 2, PINK);
  g.set(-1, hy + 2, K); g.set(0, hy + 3, K); g.set(-2, hy + 3, K);
  g.outline(K);
  g.draw(p);
}
