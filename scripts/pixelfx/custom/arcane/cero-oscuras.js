// 세로 오스큐라스 (블리치 할로우 어센션 커스텀, GDD 180장): pixelfx arcane/magic-circle-cast 에서 바닥 마법진(원·룬·육망성·펜·마법진 빛)만 뺐다.
// 사용자 2026-11-04 "매직 서클 캐스트에서 매직서클만 없애고 세로 오스큐라스라고 이름붙여서 새 이펙트로 만들어 줄 수있어??"
// 시간은 마법진을 그리던 앞부분을 건너뛰어 빛기둥부터 시작한다(SKIP). 빛기둥·번쩍임·빛만 남김.
// 2026-11-04 02:2x 사용자 "세로 오스큐라스에서 주변 반짝이 이펙트랑 서클 이펙트도 다 지워줘." → 모이는 빛줄기·불꽃·별·빛 알갱이(반짝이),
// 바닥 충격파 고리·빛기둥을 오르는 고리(서클) 삭제.
// 원본: patch-gg/pixelfx a841596 src/fx/arcane/magic-circle-cast.js (MIT, THIRD_PARTY_NOTICES.md).
//
// The column of light (banded across, strands wandering in it, pulses and halos climbing it, stars thrown off,
// rings shocking out across the floor) is adapted from Sprite Fusion's open-source holy light
// (https://www.spritefusion.com/pixel-art-vfx/holy-light), MIT License, Copyright (c) 2026 Hugo Duprez.
import { Lights, Rng, PAL, fit, flare, clamp, smooth, ease, noise2, fract, WHITE } from "../../core/index.js";
import { bayer } from "./_lib.js";

// the circle on the floor (plane px; the floor squashes depth by SY), the column, the beats
const TOP = 192, W = 11;
const FLASH = 1.52, BREAK = 2.42, END = 3.0;
// 마법진을 그리던 시간을 건너뛴다: 빛줄기가 오르기 직전(FLASH - 0.22)부터, 빛기둥이 사라지면(BREAK + 0.55) 끝
const SKIP = 1.25;

export const meta = {
  name: "세로 오스큐라스",
  desc: "Cero Oscuras (custom): a thread of light climbs, flashes, and a column of light fires up and breaks apart. Magic circle cast without the circle, rings or glitter.",
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
  const lights = new Lights();
  const COL = [WHITE, C[6], C[5], C[4], C[3]];
  const strands = Array.from({ length: 9 }, () => ({ o: Rg.range(-0.85, 0.85), w: Rg.range(0.04, 0.1), f: Rg.range(1, 3) }));
  let t = SKIP, flashed = false;

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
    // white-hot where it meets the floor
    p.glow(0, -4, 34, C[6], 0.45 * fade);
    p.glow(0, -60, 70, C[4], 0.25 * fade);
  }

  return {
    update(dt) {
      t += dt;
      if (!flashed && t >= FLASH) {
        flashed = true;
        lights.add(0, -56, 104, C[5], 0.9, 0.6);
        lights.add(0, -5, 36, WHITE, 0.8, 0.14);
      }
      lights.update(dt);
    },
    drawBack(p) {
      column(p);
    },
    draw(p) {
      // the flash
      if (t >= FLASH && t < FLASH + 0.24) {
        const a = (t - FLASH) / 0.24;
        flare(p, 0, -8, 34 * Math.pow(1 - a, 1.5), 1 - a, C);
        p.glow(0, -26, 56, WHITE, 0.5 * (1 - a));
      }
      lights.draw(p);
    },
  };
}
