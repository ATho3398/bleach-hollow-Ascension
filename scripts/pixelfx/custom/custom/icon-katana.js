// 블록 아이콘 — 일본도 (사용자 2026-11-19 "일본도 아이콘"). 정지 그림(프레임 0). 왼쪽 아래 자루 → 오른쪽 위 칼끝, 살짝 휜 날.
// 날의 세 띠(밝은 날·몸·어두운 등)는 pixelfx 기본 캐릭터의 칼(core/rig.js blade)과 같은 방식, 날을 따라 빛 + 칼끝 반짝임.
import { fit, hex, sparkle } from "../../core/index.js";
import { bez, along, inked, ICON_META } from "./_icon.js";
export const meta = { name: "Icon: katana", desc: "A katana laid diagonally across a 48px square, edge lit, tip glinting.", tags: ["icon", "sword", "katana"], ...ICON_META,
  options: { palette: ["#262033", "#3a3448", "#68748f", "#a4afc6", "#e8edf6", "#ffffff"], gold: ["#b8862a", "#ffd84a"], grip: ["#1f253b", "#4f5870", "#a7929c"], seed: 1 } };
const K = bez([-20, 21], [-4, 1], [20.5, -20.5]);
export function draw(p, t, o) {
  const C = fit(o.palette, 6), G = o.gold.map(hex), H = o.grip.map(hex);
  const body = (x, y) => {
    const q = along(K, x, y), s = q.s, a = Math.abs(s);
    if (q.t <= 0.004 || q.t >= 1) return 0;
    if (q.t < 0.035) return a <= 2.3 ? (s < 0.5 ? G[1] : G[0]) : 0;                         // 자루 끝
    if (q.t < 0.25) return a > 2.2 ? 0 : (q.t * 160 + a * 2.2) % 9 < 2.4 && a < 1.6 ? H[2] : s < 0.6 ? H[1] : H[0]; // 자루(끈 무늬)
    if (q.t < 0.295) return a <= 5.4 ? (s < 1.4 && a < 4.6 ? G[1] : G[0]) : 0;             // 코등이
    const hw = 2.4 * Math.min(1, ((1 - q.t) / 0.13) ** 0.8);
    return a > hw ? 0 : s > 0.85 ? C[5] : s < -1.0 ? C[2] : C[4];                            // 날: 날 쪽 흰빛, 등 쪽 어둡게
  };
  inked(p, body, C[0]);
  for (let i = 52; i < K.length; i += 6) p.glow(K[i][0] + 1, K[i][1] + 1, 5, C[3], 0.16);   // 날을 따라 은은한 빛
  sparkle(p, 12.5, -12.5, 4.2, C[5], C[3], 0.5);                                              // 날 위 반짝임
  sparkle(p, 20, -20, 2.2, C[5], C[3], 0.35);
}
