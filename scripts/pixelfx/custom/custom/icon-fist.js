// 블록 아이콘 — 주먹 (사용자 2026-11-19 "피스트 아이콘"). 정지 그림(프레임 0). 정면에서 본 쥔 주먹(손가락 네 마디 + 가로지른 엄지), 뒤로 굵은 세모 충격 쐐기.
// 충격 쐐기는 custom/_punch.js(주먹 펑)의 쐐기와 같은 모양.
import { fit, hex, rand, TAU, WHITE } from "../../core/index.js";
import { inked, rrect, capsule, ICON_META } from "./_icon.js";
export const meta = { name: "Icon: fist", desc: "A clenched fist seen head-on in a 48px square, impact wedges bursting behind it.", tags: ["icon", "fist", "punch"], ...ICON_META,
  options: { palette: ["#3a1410", "#7a2c14", "#c2551a", "#ff8a2a", "#ffd166", "#fff3c4"], skin: ["#3a1c1a", "#622c29", "#c98263", "#fac69a", "#ffe4c8"], seed: 2 } };
const TH = [[-9.5, 6.5], [5, 4.2]], FING = [[-15.5, -11.5], [-7.4, -13.5], [0.7, -13], [8.8, -11]], FW = 7.9;
export function draw(p, t, o) {
  const C = fit(o.palette, 6), K = o.skin.map(hex), ca = Math.cos(-0.17), sa = Math.sin(-0.17);
  // 뒤: 충격 쐐기 6개 + 빛
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.35 + (rand(o.seed, i, 1) - 0.5) * 0.4, r0 = 14.5, Lw = 6.5 + rand(o.seed, i, 2) * 3, hw = 2.6, c = Math.cos(a), s = Math.sin(a);
    for (let d = 0; d <= Lw; d += 0.5) { const half = hw * (1 - d / (Lw + 0.01)); for (let w = -half; w <= half; w += 0.5) p.dot(c * (r0 + d) - s * w, s * (r0 + d) + c * w, d < Lw * 0.45 ? WHITE : d < Lw * 0.75 ? C[4] : C[3], 1); }
  }
  p.glow(0, 0, 22, C[3], 0.3);
  const body = (X, Y) => {
    const x = X * ca - Y * sa, y = X * sa + Y * ca;
    if (capsule(x, y, TH[0], TH[1], 4.6)) return capsule(x, y, TH[0], TH[1], 3.7) ? (capsule(x, y, [TH[0][0], TH[0][1] - 1.2], [TH[1][0], TH[1][1] - 1.2], 2.6) ? K[4] : capsule(x, y, [TH[0][0], TH[0][1] - 0.4], [TH[1][0], TH[1][1] - 0.4], 3.3) ? K[3] : K[2]) : K[1];
    for (const [fx, fy] of FING)
      if (rrect(x, y, fx, fy, fx + FW, 4.5, 3.3)) {
        if (!rrect(x, y, fx + 0.9, fy + 0.9, fx + FW - 0.9, 6, 2.6)) return K[1];        // 마디 사이 선
        if (y - fy < 2.4 && x - fx > 1.6 && x - fx < FW - 2.4) return K[4];               // 관절 위 밝은 면
        if (Math.abs(y - (fy + 8.6)) < 0.55) return K[2];                                  // 마디 주름
        return x > fx + FW - 2.5 ? K[2] : K[3];
      }
    if (rrect(x, y, -15, 0, 16.5, 17, 6)) return !rrect(x, y, -14.1, 0, 15.6, 16.1, 5.3) ? K[1] : x > 10.5 || y > 12.5 ? K[2] : K[3];
    return 0;
  };
  inked(p, body, K[0]);
}
