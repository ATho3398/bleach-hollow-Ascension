// 블록 아이콘 — 주먹 (사용자 2026-11-19 "피스트 아이콘"). = custom/_punch(주먹 펑: 흰 덩이 + 굵은 충격 고리 + 세모 쐐기)을 48칸 크기로 놓은 것. pixelfx 에는 손 모양 그림이 없어 '주먹이 꽂힌 순간'으로 나타낸다.
import { fit } from "../../core/index.js";
import { punch } from "./_punch.js";
import { ICON } from "./_icon.js";
export const meta = { name: "Icon: fist", desc: "The heavy punch burst (custom/punch) sized for a 48px square.", tags: ["icon", "fist", "punch"], ...ICON, duration: 0.25, loop: false,
  options: { palette: ["#2a1608", "#6b3c10", "#b8701a", "#f0b42e", "#ffe27a", "#fff6cf", "#ffffff"], seed: 4, scale: 0.82 } };
export function draw(p, t, o) { punch(p, fit(o.palette, 7), 0, 0, t, o.scale, 0, o.seed); }
