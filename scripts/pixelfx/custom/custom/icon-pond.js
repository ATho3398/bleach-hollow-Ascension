// 블록 아이콘 — 안개 낀 연못 (사용자 2026-11-19 "그림을 그린다 생각하고, 연못 위에 안개가 그려진 아이콘을 그려봐. 그냥 정사각형 프레임일 뿐이라 생각하고"). 48칸을 꽉 채운 풍경 그림 한 장.
// 밤하늘·달 → 먼 기슭 → 연못(water/ripples 의 잔물결 고리 + 달빛 비침) → 그 위에 깔린 안개(custom/icon-mist 의 안개 = weather/fog 방식, 칸 전체 폭) 순서로 그린다. 정지 그림 한 프레임.
import { chain, fit, rand, mix, WHITE } from "../../core/index.js";
import { bayer } from "../weather/_lib.js";
import * as ripples from "../water/ripples.js";
import { mist } from "./icon-mist.js";
import { ICON } from "./_icon.js";
export const meta = { name: "Icon: misty pond", desc: "A little night scene filling a 48px square: moon, far bank, a pond with ripples, mist lying over the water.", tags: ["icon", "pond", "mist", "water", "scene"], ...ICON, fps: 2, duration: 12, loop: true,
  options: { palette: ["#070b18", "#0e1a30", "#16304a", "#22506e", "#357a96", "#5aa6bc", "#c8eef2", "#f2ffff"], seed: 5, drops: 0 } };
const HZ = -3; // 물가(수평선) 높이
export function create(o) {
  const C = fit(o.palette, 8), S = o.seed, rp = chain([{ fx: ripples, x: -5, y: 13, palette: o.palette }])(o);
  let t = 0;
  const shore = (x) => HZ - 2 - Math.round(2.5 * rand(S, Math.floor((x + 24) / 3), 7) + 1.5 * rand(S, Math.floor((x + 24) / 7), 8));
  return {
    update(dt) { t += dt; rp.update(dt); },
    draw(p) {
      // 하늘: 위는 짙고 물가 쪽이 밝다(디더로 세 단)
      p.shade(-24, -24, 24, HZ, (x, y) => { const k = (y + 24) / (HZ + 24) + (bayer(x, y) - 0.5) * 0.22; return k > 0.72 ? C[2] : k > 0.38 ? C[1] : C[0]; });
      for (let i = 0; i < 7; i++) p.px(-22 + rand(S, i, 1) * 44, -23 + rand(S, i, 2) * 12, i % 3 ? C[4] : C[6]);
      p.circle(13, -15, 3.2, C[6]); p.circle(14.2, -15.8, 2.4, C[1]); p.glow(13, -15, 10, C[5], 0.35); // 초승달
      // 먼 기슭(나무 그림자)
      p.shade(-24, HZ - 7, 24, HZ, (x, y) => (y >= shore(x) ? C[0] : 0));
      // 연못: 물가 쪽이 밝고 아래로 어두워진다 + 가로 잔빛
      p.shade(-24, HZ, 24, 24, (x, y) => {
        const d = (y - HZ) / (24 - HZ), row = Math.floor(y), k = rand(S, row, 20), ph = rand(S, row, 21) * 40;
        if (k > 0.55 && (Math.floor(x + ph) % 11) < 2 + k * 5 && d > 0.08) return d < 0.5 ? C[4] : C[3];
        return d + (bayer(x, y) - 0.5) * 0.18 < 0.28 ? C[3] : d < 0.7 ? C[2] : C[1];
      });
      for (let y = HZ + 2; y < 22; y += 2) { const w = 1 + rand(S, y, 30) * 2.4; p.line(13 - w, y, 13 + w, y, y < 6 ? C[6] : C[5], 0.8); } // 물에 비친 달빛
      rp.draw(p);
      // 물 위에 깔린 안개
      mist(p, t, o, { wide: true, dy: -8, alpha: 0.68, drops: 0 });
    },
  };
}
