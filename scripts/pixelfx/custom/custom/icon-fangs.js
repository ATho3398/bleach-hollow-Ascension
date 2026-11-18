// 블록 아이콘 — 이빨 위아래 (사용자 2026-11-19 "이빨 위아래 아이콘"). 정지 그림(프레임 0). 윗니 4개(바깥이 송곳니) + 아랫니 3개가 엇갈린다, 잇몸 없음.
// 이빨 한 개 = pixelfx 의 깎인 송곳(core/sim.js crystal: 밝은 능선·어두운 면·흰 끝·어두운 테)을 위아래 양쪽으로 쓸 수 있게 옮긴 것.
import { fit, sparkle, WHITE } from "../../core/index.js";
import { ICON_META } from "./_icon.js";
export const meta = { name: "Icon: fangs", desc: "Upper and lower rows of fangs about to close, faceted bone with lit ridges.", tags: ["icon", "bite", "fangs", "teeth"], ...ICON_META,
  options: { palette: ["#2a1c24", "#5a4650", "#8a7480", "#a7929c", "#cdb8b4", "#e6d2c8", "#f7e6dc", "#ffffff"], seed: 1 } };
/** 뿌리 y = base 에서 dir(-1 위로, +1 아래로) 쪽으로 h 만큼 뻗는 이빨 */
function fang(p, R, x, base, h, w, dir) {
  const n = R.length, C = (i) => R[Math.max(0, n - 1 - i)], ridge0 = x - w * 0.16;
  const U = (py) => (dir * (py + 0.5 - base)) / h;
  const inside = (px, py) => { const u = U(py); return u >= 0 && u <= 1 && Math.abs(px + 0.5 - x) <= (w / 2) * (1 - u) ** 0.85 + 0.35; };
  const y0 = Math.floor(Math.min(base, base + dir * h)) - 1, y1 = Math.ceil(Math.max(base, base + dir * h)) + 1;
  for (let py = y0; py <= y1; py++)
    for (let px = Math.floor(x - w / 2 - 2); px <= Math.ceil(x + w / 2 + 2); px++) {
      if (!inside(px, py)) { if (inside(px - 1, py) || inside(px + 1, py) || inside(px, py - 1) || inside(px, py + 1)) p.dot(px, py, R[0], 1); continue; }
      const u = U(py), hw = (w / 2) * (1 - u) ** 0.85 + 0.35, fx = px + 0.5, rx = ridge0 + (x - ridge0) * u;
      const col = u > 0.9 ? WHITE : u < 0.1 ? C(4) : Math.abs(fx - rx) < 0.55 ? C(0) : fx < rx ? (fx - (x - hw) < 1 ? C(1) : C(2)) : x + hw - fx < 1.3 ? C(5) : (fx - rx) / Math.max(1, x + hw - rx) > 0.5 ? C(4) : C(3);
      p.dot(px, py, col, 1);
    }
}
export function draw(p, t, o) {
  const R = fit(o.palette, 8);
  for (const [x, h, w] of [[-16.5, 21, 10.5], [-5, 14, 8.5], [5, 14, 8.5], [16.5, 21, 10.5]]) fang(p, R, x, -21, h, w, 1);
  for (const [x, h, w] of [[-10.7, 15, 9.3], [0, 18, 9.8], [10.7, 15, 9.3]]) fang(p, R, x, 21, h, w, -1);
  p.glow(0, 1, 16, R[5], 0.18);
  sparkle(p, -16.5, -2.5, 3.6, WHITE, R[5], 0.5);   // 송곳니 끝 반짝임
  sparkle(p, 0, 4.5, 2.4, WHITE, R[5], 0.35);
}
