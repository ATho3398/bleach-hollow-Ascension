// 블록 아이콘 — 일본도 (사용자 2026-11-19). = pixelfx 기본 캐릭터가 드는 칼(core/rig.js WEAPONS.sword)을 사선으로 크게 놓고 살짝 휘게 한 것 + 칼끝 반짝임(melee/sword-slash 의 glint). 정지 그림 = 프레임 0.
import { sparkle, hex } from "../../core/index.js";
import { WEAPONS } from "../../core/rig.js";
import { ICON } from "./_icon.js";
export const meta = { name: "Icon: katana", desc: "The stock character's sword (rig WEAPONS.sword) laid diagonally across a 48px square, slightly curved.", tags: ["icon", "sword", "katana"], ...ICON, duration: 0.2, loop: true,
  options: { scale: 1.7, width: 0.4, curve: 0.0022, seed: 1 } };
export function draw(p, t, o) {
  const S = o.scale, D = 0.7071, bx = -19.5, by = 19.5;
  // 칼 그림의 한 점(i = 자루에서 칼끝 쪽 거리, k = 옆 거리)을 사선 위 자리로
  const T = (i, k, c) => {
    const kk = k * S * o.width + o.curve * Math.max(0, i - 3) ** 2 * S * S, ii = (i + 3) * S;
    p.px(bx + D * ii + D * kk, by - D * ii + D * kk, c);
  };
  WEAPONS.sword.draw(T, { two: false });
  const tip = (28 + 3) * S, tk = o.curve * 25 ** 2 * S * S;
  sparkle(p, bx + D * (tip - 9) + D * tk * 0.6 - 1.5, by - D * (tip - 9) + D * tk * 0.6 - 1.5, 3.4, hex("#ffffff"), hex("#a4afc6"), 0.5);
}
