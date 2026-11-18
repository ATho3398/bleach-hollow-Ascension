// 블록 아이콘 — 소로 (사용자 주문서 2026-11-19): 어둠 속에 도깨비불 다섯 개가 아래가 트인 반원을 그리며 떠 있고, 가운데 하나가 가장 크게 타오른다. 투명 배경, 도깨비불만.
// 도깨비불 한 개 = fire/_lib 의 flameBlade(어느 방향으로든 눕힐 수 있는 불꽃 혀)를 fire/candle 의 잔잔한 불꽃 겹(CALM: 흰 노랑 속 → 노랑 → 주황 테)으로 그린 것.
// 머리가 오른쪽 위, 꼬리가 왼쪽 아래로 살짝 흐른다(떠서 오른쪽 위로 다가가는 느낌). 작은 넷은 절반 크기에 한 단계 어둡게(흰 속 없음). 정지 그림 한 프레임.
// The layered flame tongue is adapted from Sprite Fusion's open-source fire (https://www.spritefusion.com/pixel-art-vfx/fire), MIT License, Copyright (c) 2026 Hugo Duprez, via fire/_lib.
import { fit } from "../../core/index.js";
import { noiseFor, hotFirst, flameBlade } from "../fire/_lib.js";
import { ICON } from "./_icon.js";
export const meta = { name: "Icon: Soro", desc: "Five calm will-o'-the-wisps in an arc open at the bottom, the middle one biggest, tails drifting down-left.", tags: ["icon", "fire", "wisp"], ...ICON, fps: 5, duration: 4, loop: true,
  options: { palette: ["#4a1712", "#8a1f17", "#c9281f", "#f2561d", "#ff8a2a", "#ffc23d", "#ffe26b", "#fff3a6", "#ffffff"], seed: 3 } };
const D = meta.duration, NL = noiseFor(D);
const CALM = [[1, 1, 5], [0.8, 0.88, 3], [0.6, 0.72, 2], [0.38, 0.52, 1], [0.18, 0.3, 0]]; // fire/candle 의 잔잔한 불꽃
const DIM = [[1, 1, 6], [0.78, 0.86, 4], [0.56, 0.7, 3], [0.32, 0.48, 2]];                  // 한 단계 어둡게
const UX = -0.5, UY = 0.866; // 꼬리 방향: 아래로, 살짝 왼쪽
const SMALL = [[-15, -3], [-7, -16], [10, -18], [19, -7]];
export function draw(p, t, o) {
  const F = fit(o.palette, 9), H = hotFirst(F), S = o.seed, N = (rate, seed = 0, off = 0) => NL(t, rate * 0.35, seed, off);
  SMALL.forEach(([x, y], i) => {
    p.glow(x - 1, y + 2, 8, F[4], 0.3);
    flameBlade(p, x, y, UX, UY, 10 + NL(t, 0.6, S + i) * 1.2, 3.3, 1.5, N, S * 31 + i * 5, H, DIM, 0.2, 0.5);
  });
  p.glow(1, 0, 17, F[4], 0.5);
  p.glow(2, -1, 8, F[6], 0.4);
  flameBlade(p, 4, -6, UX, UY, 19 + NL(t, 0.6, S + 9) * 1.5, 6.6, 2.5, N, S * 31 + 40, H, CALM, 0.25, 0.6);
}
