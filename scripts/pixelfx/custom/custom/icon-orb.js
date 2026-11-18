// 블록 아이콘 — 마법 에너지볼, 사선 (사용자 2026-11-19 "마법 에너지볼 아이콘(사선으로 그려진)"). 정지 그림(프레임 0). 오른쪽 위 구슬 + 왼쪽 아래로 끌리는 꼬리.
// 구슬(겹친 원·흰 심·도는 점·두 겹 빛)과 꼬이는 띠 꼬리는 projectiles/magic-missile 방식.
// The star particles and ribbon follow Sprite Fusion's open-source energy bolt (https://www.spritefusion.com/pixel-art-vfx/energy), MIT License, Copyright (c) 2026 Hugo Duprez, via projectiles/magic-missile.
import { fit, sparkle, rand, TAU, WHITE } from "../../core/index.js";
import { ICON_META } from "./_icon.js";
export const meta = { name: "Icon: energy orb", desc: "An energy orb flying up-right across a 48px square, trailing a twisting ribbon.", tags: ["icon", "orb", "magic", "projectile"], ...ICON_META,
  options: { palette: ["#2a0612", "#5c0a22", "#a3122e", "#e0243c", "#ff5a5a", "#ff9c8a", "#ffe0d4", "#ffffff"], seed: 4 } };
export function draw(p, t, o) {
  const C = fit(o.palette, 8), ox = 9.5, oy = -9.5, r = 8.5, L = 30;
  // 꼬리: 구슬에서 왼쪽 아래로, 꼬이면서 가늘어진다
  for (let d = 0; d < L; d += 0.35) {
    const k = 1 - d / L, tw = Math.sin(d * 0.52 + 0.6), w = (r * 0.82 * k ** 0.9) * (0.45 + 0.55 * Math.abs(tw)) + 0.4, face = tw > 0;
    const bend = Math.sin(d * 0.2) * 1.6 * (1 - k), x = ox - (d + 3) * 0.7071 + bend * 0.7071, y = oy + (d + 3) * 0.7071 + bend * 0.7071;
    for (let s = -w; s <= w; s += 0.5) {
      const edge = Math.abs(s) > w - 0.9, c = face ? (edge ? C[6] : k > 0.55 ? C[5] : C[4]) : edge ? C[4] : C[2];
      p.dot(x + 0.7071 * s, y + 0.7071 * s, c, k > 0.3 ? 1 : k / 0.3);
    }
    if (Math.round(d / 0.35) % 14 === 0) p.glow(x, y, 6, C[4], 0.22 * k);
  }
  // 흩어지는 알갱이·별
  for (let i = 0; i < 7; i++) {
    const d = 6 + rand(o.seed, i, 1) * 26, off = (rand(o.seed, i, 2) - 0.5) * 16, x = ox - d * 0.7071 + off * 0.7071, y = oy + d * 0.7071 + off * 0.7071;
    if (i % 3 === 0) sparkle(p, x, y, 1.6 + rand(o.seed, i, 3) * 1.2, C[6], C[4], 0.3); else p.px(x, y, i % 2 ? C[5] : C[6]);
  }
  // 구슬
  p.circle(ox, oy, r + 1.6, C[2]);
  p.circle(ox, oy, r + 0.6, C[3]);
  p.circle(ox, oy, r - 0.8, C[4]);
  p.circle(ox + 0.6, oy - 0.6, r * 0.72, C[5]);
  p.circle(ox + 1.2, oy - 1.2, r * 0.48, C[6]);
  p.circle(ox + 1.6, oy - 1.6, r * 0.26, WHITE);
  for (let i = 0; i < 3; i++) { const a = 0.9 + (i * TAU) / 3; p.px(ox + Math.cos(a) * (r + 3.2), oy + Math.sin(a) * (r + 3.2) * 0.7, i ? C[6] : WHITE); }
  p.glow(ox, oy, 19, C[4], 0.5);
  p.glow(ox, oy, 8, C[6], 0.4);
}
