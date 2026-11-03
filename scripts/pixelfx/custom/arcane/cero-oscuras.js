// 세로 오스큐라스 (블리치 할로우 어센션 커스텀, GDD 180장): pixelfx arcane/magic-circle-cast 에서 바닥 마법진(원·룬·육망성·펜·마법진 빛)만 뺐다.
// 사용자 2026-11-04 "매직 서클 캐스트에서 매직서클만 없애고 세로 오스큐라스라고 이름붙여서 새 이펙트로 만들어 줄 수있어??"
// 시간은 마법진을 그리던 앞부분을 건너뛰어 모이는 빛 → 빛기둥부터 시작한다(SKIP). 빛기둥·번쩍임·바닥 충격파·불꽃·별은 그대로.
// 원본: patch-gg/pixelfx a841596 src/fx/arcane/magic-circle-cast.js (MIT, THIRD_PARTY_NOTICES.md).
//
// The column of light (banded across, strands wandering in it, pulses and halos climbing it, stars thrown off,
// rings shocking out across the floor) is adapted from Sprite Fusion's open-source holy light
// (https://www.spritefusion.com/pixel-art-vfx/holy-light), MIT License, Copyright (c) 2026 Hugo Duprez.
import { Particles, Lights, P, Rng, PAL, fit, band, flare, sparkle, clamp, smooth, ease, noise2, fract, TAU, WHITE } from "../../core/index.js";
import { bayer } from "./_lib.js";

// the circle on the floor (plane px; the floor squashes depth by SY), the column, the beats
const R = 40, SY = 0.3, TOP = 192, W = 11;
const RUNES = [0.9, 1.3];
const FLASH = 1.52, BREAK = 2.42, END = 3.9;
// 마법진을 그리던 시간을 건너뛴다: 모이는 빛(RUNES[1] - 0.1)부터
const SKIP = 1.15;

export const meta = {
  name: "세로 오스큐라스",
  desc: "Cero Oscuras (custom): light rushes in along the floor, flashes, and a column of light fires up and breaks apart into glints. Magic circle cast without the circle.",
  tags: ["arcane", "cero", "column", "beam", "cast", "ground", "one-shot", "custom"],
  size: [200, 220],
  origin: [100, 192],
  duration: END - SKIP,
  loop: false,
  fps: 30,
  bg: "ground",
  options: { palette: PAL.arcane, seed: 6 },
};


export function create(o) {
  const C = fit(o.palette, 8), S = o.seed, Rg = new Rng(S);
  const ps = new Particles({ rng: Rg, ground: () => 0, sparks: [WHITE, C[6], C[5], C[4]] }), lights = new Lights();
  const COL = [WHITE, C[6], C[5], C[4], C[3]];
  const strands = Array.from({ length: 9 }, () => ({ o: Rg.range(-0.85, 0.85), w: Rg.range(0.04, 0.1), f: Rg.range(1, 3) }));
  let t = SKIP, flashed = false, broke = false;

  // the column of light: the thread that climbs first, then the beam that fires up, holds and breaks apart
  function column(p) {
    if (t < FLASH - 0.22 || t > BREAK + 0.6) return;
    if (t < FLASH) {
      const a = smooth(FLASH - 0.22, FLASH - 0.04, t), top = -(TOP - 10) * ease.outCubic(a);
      for (let y = -1; y >= top; y--) p.dot(0, y, y > top + 6 ? C[6] : WHITE, a * (0.35 + 0.65 * (1 + y / TOP)));
      p.glow(0, top, 9, C[6], 0.5 * a);
      p.glow(0, -6, 24, C[5], 0.4 * a);
      return;
    }
    const u = t - FLASH, brk = clamp((t - BREAK) / 0.45), top = -TOP * ease.outExpo(clamp(u / 0.09));
    const w = t < BREAK ? W * (1 + 0.38 * Math.exp(-u * 9)) : W * (1 - ease.outCubic(brk) * 0.85);
    const fade = 1 - smooth(BREAK + 0.25, BREAK + 0.55, t), white = u < 0.067;
    if (fade <= 0) return;
    for (let y = 3; y >= Math.ceil(top); y--) {
      const h = -y, ww = w * (1 + 0.5 * Math.exp(-Math.max(0, h) / 6)), pulse = fract(h * 0.022 - u * 2.6) < 0.07 ? 1 : 0;
      for (let x = Math.floor(-ww * 1.3); x <= Math.ceil(ww * 1.3); x++) {
        const q = Math.abs(x + 0.5) / ww;
        // as it breaks, holes open and grow and drift upward until only shards are left
        if (brk > 0 && noise2(x * 0.32, h * 0.11 - (t - BREAK) * 6, S) * 0.5 + 0.5 < brk * 1.25 - 0.1) continue;
        let lv = q < 0.2 ? 0 : q < 0.42 ? 1 : q < 0.66 ? 2 : q < 0.88 ? 3 : 4;
        for (const s of strands) if (Math.abs((x + 0.5) / ww - s.o - 0.05 * Math.sin(t * s.f + s.o * 9)) < s.w) lv = Math.max(0, lv - 1);
        lv = white ? 0 : Math.max(0, lv - pulse);
        const a = (q < 0.88 ? 1 : (1.3 - q) / 0.42) * fade;
        if (a <= bayer(x, y) * (q < 0.66 ? 0.2 : 1)) continue;
        p.px(x, y, COL[lv]);
      }
      if ((h & 7) === 0 && h < TOP - ww * 2.4 - 8) p.glow(0, y, ww * 2.4 + 6, C[5], 0.3 * fade);
    }
    // halos climbing it
    for (let i = 0; i < 6; i++) {
      const k = (t - (FLASH + 0.08 + i * 0.16)) / 0.8;
      if (k < 0 || k > 1) continue;
      const rx = w * 1.4 * (1 + k * 0.35), ry = rx * 0.3, yc = -3 - ease.outQuad(k) * 120, n = Math.ceil(rx * 7);
      for (let j = 0; j < n; j++) {
        const g = (j / n) * TAU;
        p.dot(Math.cos(g) * rx, yc + Math.sin(g) * ry, k < 0.3 ? WHITE : C[6], (1 - k) * fade * (Math.sin(g) < 0 ? 0.6 : 1));
      }
    }
    // white-hot where it meets the floor
    p.glow(0, -4, 34, C[6], 0.45 * fade);
    p.glow(0, -60, 70, C[4], 0.25 * fade);
  }

  function shock(p, far) {
    for (const [d, r0, r1, th, dur] of [[0, R * 0.6, R * 2, 6, 0.5], [0.08, R * 0.4, R * 1.4, 3, 0.4]]) {
      const k = (t - FLASH - d) / dur;
      if (k < 0 || k >= 1) continue;
      band(p, 0, 0, r0 + (r1 - r0) * ease.outCubic(k), SY, Math.max(1, th * (1 - k)), 1.15 - k, [C[3], C[5], C[6], WHITE], (g) => Math.sin(g) < 0 === far, k < 0.2);
    }
  }

  return {
    update(dt) {
      t += dt;
      // gathering: light rushes in along the floor to the heart of the circle
      if (t > RUNES[1] - 0.1 && t < FLASH - 0.05 && Rg.chance(0.7)) {
        const g = Rg.range(0, TAU), D = Rg.range(R * 0.7, R * 1.1), T = Rg.range(0.16, 0.24), v = (D * 3) / (Math.exp(3 * T) - 1);
        const x = Math.cos(g) * D, y = Math.sin(g) * D * SY - 1, l = Math.hypot(x, y + 2) || 1;
        ps.spawn(P.STREAK, x, y, (-x / l) * v, ((-2 - y) / l) * v, T, Rg.chance(0.5) ? C[6] : C[5]);
      }
      if (!flashed && t >= FLASH) {
        flashed = true;
        lights.add(0, -56, 104, C[5], 0.9, 0.6);
        lights.add(0, -5, 36, WHITE, 0.8, 0.14);
        for (let i = 0; i < 36; i++) {
          const s = Rg.sign(), sp = Rg.range(80, 175);
          ps.spawn(P.SPARK, s * Rg.range(0, R * 0.5), -1, s * sp, -Rg.range(30, 180), Rg.range(0.25, 0.7));
        }
        for (let i = 0; i < 26; i++)
          ps.spawn(P.STAR, Rg.range(-R, R), -Rg.range(1, 6), Rg.range(-20, 20), -Rg.range(40, 130), Rg.range(0.5, 1.1), Rg.pick([WHITE, C[6], C[5]]), Rg.range(0.8, 2.3));
        // and a spray of twinkles flung out low across the floor
        for (let i = 0; i < 34; i++) {
          const s = Rg.sign();
          ps.spawn(P.STAR, s * Rg.range(0, 14), -Rg.range(1, 4), s * Rg.range(50, 140), -Rg.range(10, 90), Rg.range(0.4, 0.95), Rg.pick([WHITE, C[6], C[6], C[5]]), Rg.range(0.7, 2.2));
        }
      }
      // the column throws off stars, and light streams up inside it
      if (t > FLASH && t < BREAK) {
        if (Rg.chance(0.5)) ps.spawn(P.STAR, Rg.range(-1, 1) * W * 1.5, -Rg.range(0, 120), Rg.range(-10, 10), -Rg.range(30, 85), Rg.range(0.5, 1.1), Rg.pick([WHITE, C[6], C[5]]), Rg.range(0.7, 2));
        if (Rg.chance(0.35)) ps.spawn(P.MOTE, Rg.range(-1, 1) * W * 0.8, -Rg.range(0, 50), 0, -Rg.range(160, 300), Rg.range(0.2, 0.35), Rg.chance(0.5) ? WHITE : C[6], 0.8);
      }
      // it breaks apart into glints that twinkle as they drift up
      if (!broke && t >= BREAK) {
        broke = true;
        for (let i = 0; i < 46; i++)
          ps.spawn(P.STAR, Rg.range(-1, 1) * W * 0.9, -Rg.range(2, TOP * 0.8), Rg.range(-12, 12), -Rg.range(8, 40), Rg.range(0.5, 1.15), Rg.pick([WHITE, WHITE, C[6], C[5]]), Rg.range(0.6, 2.4));
      }
      if (t > BREAK && t < BREAK + 0.4 && Rg.chance(0.8)) {
        ps.spawn(P.STAR, Rg.range(-1, 1) * W * 0.7, -Rg.range(2, TOP * 0.78), Rg.range(-8, 8), -Rg.range(10, 50), Rg.range(0.4, 0.9), Rg.pick([WHITE, C[6], C[5]]), Rg.range(0.6, 1.8));
        if (Rg.chance(0.4)) ps.spawn(P.MOTE, Rg.range(-1, 1) * W * 0.5, -Rg.range(2, TOP * 0.7), 0, -Rg.range(60, 140), Rg.range(0.2, 0.4), C[6], 0.7);
      }
      ps.update(dt);
      lights.update(dt);
    },
    drawBack(p) {
      shock(p, true);
      column(p);
      ps.draw(p, "back");
    },
    draw(p) {
      shock(p, false);
      // the flash
      if (t >= FLASH && t < FLASH + 0.24) {
        const a = (t - FLASH) / 0.24;
        flare(p, 0, -8, 34 * Math.pow(1 - a, 1.5), 1 - a, C);
        p.glow(0, -26, 56, WHITE, 0.5 * (1 - a));
      }
      ps.draw(p, "front");
      lights.draw(p);
    },
  };
}
