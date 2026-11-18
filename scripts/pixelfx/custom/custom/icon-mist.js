// 블록 아이콘 — 물안개 (사용자 2026-11-19 "가운데에 옅은 물안개 덩어리가 낮게 깔려 있고, 안개 띠 두세 줄이 가로로 겹쳐 흘러갑니다. 안개 속에 작은 물방울 몇 개가 희미하게 비칩니다").
// = weather/fog 의 안개 둑(bank)과 가는 안개 줄(streaks)을 48칸 크기로 옮긴 것: 둑 하나를 가운데 아래에 낮게, 양옆은 옅어져 덩어리가 되게, 그 위로 가로 띠. 물빛 팔레트. 물방울 몇 개(옅은 점 + 흰 반짝임).
// 정지 그림 한 프레임(시간에 따라 안개 모양이 달라 여러 프레임 중 고른다).
// The banded fog (a baked tiling noise, warped, cut into a few translucent tones with Bayer edges, a lit crest wherever a band's top meets thinner fog)
// is adapted from Sprite Fusion's open-source fog (https://www.spritefusion.com/pixel-art-vfx/fog), MIT License, Copyright (c) 2026 Hugo Duprez, via weather/fog.
import { fit, clamp, smooth, mix, rand, TAU, WHITE } from "../../core/index.js";
import { rows, field, sample, bayer } from "../weather/_lib.js";
import { ICON } from "./_icon.js";
export const meta = { name: "Icon: water mist", desc: "A low clump of water mist with two or three bands sliding across it and a few faint droplets, in a 48px square.", tags: ["icon", "mist", "water", "fog"], ...ICON, fps: 2, duration: 12, loop: true,
  options: { palette: ["#0c1826", "#16304a", "#22506e", "#357a96", "#5aa6bc", "#8fd0dc", "#c8eef2", "#f2ffff"], seed: 5, drops: 5 } };
const D = 12, W = 48, T = [0.3, 0.5, 0.7], BW = 0.06;
// 안개 둑: 위쪽이 옅어지는 구간(top..base), 아래 끝(bot), 무늬 크기, 진하기, 색 단계
const B = { top: -6, base: 12, bot: 22, sx: 1.5, sy: 3.0, alpha: 0.62, tone: [3, 4, 5], crest: 6, warp: 10, crestFrom: 1 };
const P1 = new Float32Array(W), P2 = new Float32Array(W), WARP = new Float32Array(W), BR = new Float32Array(W);
const side = (x, a, b) => 1 - smooth(a, b, Math.abs(x)); // 양옆으로 옅어진다

export function draw(p, t, o) {
  const S = o.seed, C = fit(o.palette, 8);
  const F = field(S * 7 + 2, 256, 128), G = field(S * 7 + 11, 256, 128, [4, 8, 16]);
  const drift = (256 * t) / D, boil = (128 * t) / D, tones = B.tone.map((i) => C[i]), crest = mix(C[B.crest], WHITE, 0.3);
  P1.fill(0); P2.fill(0);
  for (let i = 0; i < W; i++) BR[i] = 1.5 * Math.sin((TAU * t) / D + (i - 24) * 0.05);
  rows(p, meta, B.top - 2, B.bot, (y, R) => {
    const prof = smooth(B.top, B.base, y) * (1 - smooth(B.bot - 7, B.bot + 1, y));
    for (let i = 0; i < W; i++) WARP[i] = sample(G, i * 0.9, y * 0.9 + boil) - 0.5;
    for (let i = 0; i < W; i++) {
      const x = i - 24 + 0.5, w = WARP[i], pr = prof * side(x, 4, 24);
      const nn = clamp((sample(F, x * B.sx + drift + w * B.warp, (y + BR[i]) * B.sy + w * 6) - 0.5) * 2.6 + 0.5) - 0.5;
      const f = pr <= 0.01 ? 0 : (pr * 0.5 + nn * 1.15) * (0.55 + 0.6 * pr);
      const above = P2[i];
      P2[i] = P1[i]; P1[i] = f;
      if (f <= T[0]) continue;
      const th = bayer(i, y) * BW, band = f > T[2] + th ? 2 : f > T[1] + th ? 1 : 0, solid = f > T[2] ? 2 : f > T[1] ? 1 : 0;
      if (solid >= B.crestFrom && above < T[solid]) { R.c[i] = crest; R.a[i] = B.alpha * 0.95; R.l[i] = C[6]; R.k[i] = 0.1; }
      else { R.c[i] = tones[band]; R.a[i] = B.alpha * (0.55 + 0.22 * band); if (band === 2) (R.l[i] = C[5]), (R.k[i] = 0.06); }
      R.b[i] = 1;
    }
  });
  // 가로로 겹쳐 흘러가는 가는 안개 띠
  const F2 = field(S * 7 + 21, 256, 128), y0 = -14, y1 = 19;
  rows(p, meta, y0, y1, (y, R) => {
    const env = smooth(y0, y0 + 6, y) * (1 - smooth(y1 - 6, y1, y));
    for (let i = 0; i < W; i++) {
      const x = i - 24 + 0.5, s = (sample(F2, x * 0.9 + drift * 1.3, y * 5.2 + 30) - 0.5) * 3.0 * env * side(x, 10, 24);
      if (s <= 0.06) continue;
      R.c[i] = s > 0.35 ? C[7] : C[6]; R.a[i] = Math.min(0.7, s + 0.2); R.b[i] = 1; R.l[i] = C[5]; R.k[i] = s * 0.08;
    }
  });
  // 안개 속 작은 물방울
  for (let i = 0; i < o.drops; i++) {
    const x = -14 + rand(S, i, 1) * 28, y = 0 + rand(S, i, 2) * 15, big = i % 2 === 0;
    p.disc(x, y, big ? 1.5 : 0.9, C[6], 0.5);
    p.blend(x - 0.5, y - 0.5, WHITE, big ? 0.85 : 0.55);
    p.glow(x, y, 3, C[5], 0.2);
  }
}
