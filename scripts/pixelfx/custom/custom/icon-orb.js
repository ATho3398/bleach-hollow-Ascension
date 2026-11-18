// 블록 아이콘 — 마법 에너지볼, 사선 (사용자 2026-11-19). = projectiles/plasma-shot 에서 번개무늬를 뺀 것(custom/_plasma-plain)을 45° 돌려 48칸에 놓은 것, 하늘색. 사신 '귀' 기본 블록(확정 2026-11-19). 정지 그림 = 프레임 2.
import { chain } from "../../core/index.js";
import * as plasma from "./_plasma-plain.js";
import { ICON } from "./_icon.js";
export const meta = { name: "Icon: energy orb", desc: "projectiles/plasma-shot turned 45 degrees in a 48px square.", tags: ["icon", "orb", "magic"], ...ICON, duration: 0.8, loop: true,
  options: { palette: ["#0a1a30", "#123a66", "#1c64a8", "#3f9be0", "#74c8ff", "#aee4ff", "#e6f8ff", "#ffffff"], size: 7, seed: 3 } };
export const create = (o) => chain([{ fx: plasma, x: 9, y: -9, angle: -Math.PI / 4, palette: o.palette, size: o.size }])(o);
