// 펫 도트 공용 (블리치 할로우 어센션 커스텀): 작은 동물 펫을 도형으로 그릴 때 쓰는 것들. 빛은 왼쪽 위에서.
import { hex, wrap, TAU } from "../../core/index.js";
export { Grid, shift } from "../critters/_lib.js";
export const H = (s) => hex(s);
/** 타원 색: 왼쪽 위 밝게, 오른쪽 아래 어둡게 (c = [밝은, 기본, 어두운]) */
export const lit = (c) => (nx, ny) => (nx + ny < -0.55 ? c[0] : nx + ny > 0.75 ? c[2] : c[1]);
/** 깜빡임: 반복 D 초 안의 at 초에 0.14초 동안 눈을 감는다 */
export const blink = (t, D, at) => { const u = wrap(t - at, D); return u < 0.14; };
export const wave = (t, D, n = 1, ph = 0) => Math.sin((t / D) * TAU * n + ph);
export const petMeta = (name, desc, extra = {}) => ({ name, desc, tags: ["custom", "critter", "pet", "loop"], size: [64, 64], origin: [32, 50], duration: 2.4, loop: true, fps: 30, bg: "sky", options: { seed: 1 }, ...extra });
