// 블록 아이콘 — 마법 에너지볼, 사선 (사용자 2026-11-19). = projectiles/plasma-shot 을 45° 돌려 48칸에 놓은 것. 정지 그림 = 프레임 0.
import { chain } from "../../core/index.js";
import * as plasma from "../projectiles/plasma-shot.js";
import { ICON } from "./_icon.js";
export const meta = { name: "Icon: energy orb", desc: "projectiles/plasma-shot turned 45 degrees in a 48px square.", tags: ["icon", "orb", "magic"], ...ICON, duration: 0.8, loop: true,
  options: { palette: ["#2a0612", "#5c0a22", "#a3122e", "#e0243c", "#ff5a5a", "#ff9c8a", "#ffe0d4", "#ffffff"], size: 7, seed: 3 } };
export const create = (o) => chain([{ fx: plasma, x: 9, y: -9, angle: -Math.PI / 4, palette: o.palette, size: o.size }])(o);
