// 블록 아이콘 — 이빨 위아래 (사용자 2026-11-19). = custom/bite(물어뜯기)의 이빨을 48칸에 맞는 좁은 배치(윗니 4·아랫니 3)로 놓은 것. 정지 그림 = 닫히기 직전 프레임.
import { chain, PAL } from "../../core/index.js";
import * as bite from "./bite.js";
import { ICON } from "./_icon.js";
export const meta = { name: "Icon: fangs", desc: "custom/bite with a narrower row of fangs in a 48px square.", tags: ["icon", "bite", "fangs"], ...ICON, duration: 0.6, loop: false,
  options: { palette: PAL.bone, seed: 3 } };
const UPPER = [[-18, 17, 5], [-6, 9, 3.6], [6, 9, 3.6], [18, 17, 5]], LOWER = [[-12, 12, 4.4], [0, 8, 3.4], [12, 12, 4.4]];
export const create = (o) => chain([{ fx: bite, x: 0, y: 2, palette: o.palette, upper: UPPER, lower: LOWER }])(o);
