// 쿠카푸로 (블리치 할로우 어센션 커스텀 펫): 앉아 있는 작은 강아지 — 살구색 몸, 뿔 둘 달린 흰 해골 가면, 늘어진 귀, 흔드는 꼬리.
// 사용자 2026-11-18 "강아지 가능하면 2번째 사진 참고해서 추가(이름은 쿠카푸로)".
import { Grid, shift, H, lit, wave, petMeta } from "./_petkit.js";
export const meta = petMeta("Kukkapuro", "A small tan puppy in a horned white skull mask sits and wags its tail, its floppy ears swaying.");
const D = meta.duration, G = new Grid(-24, -40, 48, 44);
const K = H("#000000"), TAN = [H("#f0b890"), H("#dea07a"), H("#b87a5a")], EAR = [H("#dea07a"), H("#c48862"), H("#9a6448")], BONE = [H("#ffffff"), H("#f7e6dc"), H("#a7929c")];
export function draw(p, time, o) {
  const t = shift(time, D, o.seed), g = G.clear(), bob = wave(t, D, 2) > 0.3 ? -1 : 0, wag = wave(t, D, 6);
  // 꼬리 (몸 뒤)
  g.tube([[-8, -5], [-11, -7 + wag * 0.6], [-13, -10 + wag * 2.2]], (u) => 1.6 - u * 0.7, TAN[1]);
  // 몸통·뒷다리·앞다리
  g.ellipse(-2, -8, 8, 8, lit(TAN));
  g.ellipse(-6, -3.2, 4.2, 3.2, lit(TAN));
  for (const x of [1, 5]) { g.shade(x, -7, x + 2, -1, () => TAN[1]); g.shade(x, -1, x + 3, -1, () => TAN[0]); }
  // 머리 + 늘어진 귀
  const hy = -19 + bob;
  g.ellipse(3.5, hy, 7.2, 6.6, lit(TAN));
  g.ellipse(-2.2, hy + 2 + (wag > 0.5 ? 1 : 0), 2.4, 4.6, lit(EAR));
  // 흰 해골 가면: 얼굴 앞쪽을 덮고, 위에 작은 뿔 둘
  g.ellipse(6, hy + 0.3, 5.6, 5.4, lit(BONE));
  g.poly([[2.2, hy - 4], [3.2, hy - 8.5], [5, hy - 4.6]], BONE[1]);
  g.poly([[7, hy - 4.8], [9.6, hy - 8.5], [10, hy - 3.6]], BONE[1]);
  // 검은 눈구멍 둘, 코
  g.ellipse(4, hy - 0.4, 1.4, 1.9, K); g.ellipse(8.4, hy - 0.4, 1.3, 1.8, K);
  g.set(11, hy + 2, K); g.set(10, hy + 3, K);
  g.outline(K);
  g.draw(p);
}
