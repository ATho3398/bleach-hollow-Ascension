// 블록 아이콘 — 세로, 검정에 초록 테두리 (사용자 2026-11-19 "fx에 세로 만든거 … 검정에 초록 테두리로 한 점에서 시작하는 사선 줄 하나"). 정지 그림 = 프레임 7(번쩍임이 끝나고 빔이 유지되는 때).
// = custom/cero(일반 세로: 한 점에서 출발하는 단색 빔, 가운데 한 색 + 테두리 한 색)를 왼쪽 아래 한 점에서 오른쪽 위로 45° 놓은 것.
import { chain } from "../../core/index.js";
import * as cero from "./cero.js";
import { ICON } from "./_icon.js";
export const meta = { name: "Icon: cero", desc: "custom/cero as a black beam with a green rim, fired diagonally from one point across a 48px square.", tags: ["icon", "cero", "beam"], ...ICON, duration: 0.5, loop: false,
  options: { palette: ["#03130a", "#0a2a14", "#125c2a", "#1e9a44", "#35e06a", "#7cf5a0", "#0b0b0e", "#ffffff"], edge: "#35e06a", seed: 6 } };
export const create = (o) => chain([{ fx: cero, x: -21, y: 21, angle: -Math.PI / 4, palette: o.palette, edge: o.edge }])(o);
