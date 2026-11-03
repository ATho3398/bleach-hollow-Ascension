// 물어뜯기 (블리치 할로우 어센션 커스텀, GDD 180장): 짐승 이빨이 위아래로 콱 깨문다.
// 사용자 2026-11-04 "짐승 이빨 위 아래로 깨무는듯한 커스텀 이펙트 만들어줘"
// 흐름: 벌린 턱이 나타나 → 빠르게 닫혀 이빨이 엇갈려 맞물림 → 맞는 순간 흰 번쩍·불꽃·충격선 → 꽉 문 채 짧게 갈림 → 벌어지며 사라짐.
// 원점 = 깨무는 곳 가운데(맞는 몸 가운데에 놓는다). 이빨 색 = 팔레트(속성 색), 윤곽 = 팔레트 가장 어두운 칸.
import { Particles, P, Rng, PAL, fit, clamp, smooth, ease, WHITE } from "../../core/index.js";
import { bayer } from "../arcane/_lib.js";

// 시각: 나타남, 닫힘 끝(맞물림), 갈림 끝, 사라짐 끝
const APPEAR = 0.1, SHUT = 0.2, HOLD = 0.38, END = 0.6;
// 벌린 틈(이빨 끝 사이), 다 물었을 때 엇갈림(음수 = 끝이 서로 지나감), 턱 반 폭
const OPEN = 38, BITE = -7, HALF = 32;

export const meta = {
  name: "물어뜯기",
  desc: "Bite (custom): an upper and a lower row of fangs snap shut and interlock, flash and spark on contact, grind, then pull apart and fade.",
  tags: ["custom", "bite", "jaw", "fang", "teeth", "beast", "melee", "impact", "one-shot"],
  size: [112, 104],
  origin: [56, 52],
  duration: END,
  loop: false,
  fps: 30,
  bg: "dark",
  options: { palette: PAL.bone, seed: 3 },
};

// 이빨: x 자리, 길이, 반 폭 (송곳니가 길고 굵다). 아래턱은 위턱 사이사이에 끼도록 반 칸 어긋난다
const UPPER = [[-26, 9, 3.5], [-15, 17, 5], [-5, 8, 3.2], [5, 8, 3.2], [15, 17, 5], [26, 9, 3.5]];
const LOWER = [[-21, 12, 4.2], [-10, 8, 3.2], [0, 7, 3], [10, 8, 3.2], [21, 12, 4.2]];

export function create(o) {
  const C = fit(o.palette, 8), R = new Rng(o.seed);
  const ps = new Particles({ rng: R, ground: () => 999, sparks: [WHITE, C[7], C[6], C[5]] });
  let t = 0, hit = false;

  // 이빨 끝 사이 틈: 벌림 → 닫힘(가속) → 갈림 → 벌어짐
  const gap = () => {
    if (t < SHUT) return OPEN + 4 * (1 - smooth(0, APPEAR, t)) - (OPEN - BITE) * ease.inQuad(clamp((t - APPEAR) / (SHUT - APPEAR)));
    if (t < HOLD) return BITE + Math.sin(t * 90) * 0.6;
    return BITE + 12 * ease.outQuad(clamp((t - HOLD) / (END - HOLD)));
  };
  // 보이는 정도: 나타남 → 그대로 → 사라짐 (도트 디더)
  const vis = () => smooth(0, APPEAR * 0.8, t) * (1 - smooth(HOLD + 0.04, END - 0.02, t));
  const flash = () => t >= SHUT && t < SHUT + 0.034;

  // 턱 하나: dir = -1 위턱(이빨이 아래로), +1 아래턱(이빨이 위로). base = 이빨 뿌리 줄(가운데), 양끝은 상대 턱 쪽으로 휜다(입 모양)
  function jaw(p, dir, base, teeth, a) {
    const curve = (x) => base - dir * 6 * (x / HALF) ** 2;
    // 잇몸 띠
    for (let x = -HALF - 2; x <= HALF + 1; x++) {
      const y0 = curve(x + 0.5);
      for (let k = 0; k < 6; k++) {
        const y = Math.round(y0 + dir * k);
        if (a <= bayer(x, y)) continue;
        const edge = k === 5 || x <= -HALF - 2 || x >= HALF + 1;
        p.px(x, y, flash() ? WHITE : edge ? C[1] : k < 2 ? C[4] : C[3]);
      }
    }
    // 이빨 (삼각형, 왼쪽 위에서 빛: 왼쪽 밝게 오른쪽 어둡게, 윤곽 어둡게)
    for (const [cx, L, hw] of teeth) {
      const root = curve(cx) - dir * 0;
      for (let d = 0; d <= L; d++) {
        const half = hw * (1 - d / (L + 1)), y = Math.round(root - dir * d);
        for (let x = Math.floor(cx - half); x <= Math.ceil(cx + half) - 1; x++) {
          const u = (x + 0.5 - cx) / Math.max(half, 0.5);
          if (Math.abs(u) > 1 || a <= bayer(x, y)) continue;
          const rim = Math.abs(u) > 0.7 || d === L;
          p.px(x, y, flash() ? WHITE : rim ? C[1] : u < -0.2 ? WHITE : u < 0.35 ? C[6] : C[5]);
        }
      }
    }
  }

  return {
    update(dt) {
      t += dt;
      if (!hit && t >= SHUT) {
        hit = true;
        // 맞물리는 순간: 이빨 끝 사이에서 불꽃이 양옆·위아래로
        for (let i = 0; i < 26; i++) {
          const a = R.range(0, Math.PI * 2), sp = R.range(70, 170);
          ps.spawn(P.SPARK, R.range(-HALF, HALF) * 0.8, R.range(-3, 3), Math.cos(a) * sp, Math.sin(a) * sp * 0.6, R.range(0.12, 0.3));
        }
      }
      ps.update(dt);
    },
    draw(p) {
      const g = gap(), a = vis();
      if (a > 0) {
        // 위턱: 이빨 끝이 -g/2 에 오도록 뿌리를 올린다 / 아래턱: 반대로
        jaw(p, -1, -g / 2 - 17, UPPER, a);
        jaw(p, 1, g / 2 + 12, LOWER, a);
      }
      // 맞는 순간 빛과 충격선
      if (t >= SHUT && t < SHUT + 0.16) {
        const k = 1 - (t - SHUT) / 0.16;
        p.glow(0, 0, 30, C[6], 0.7 * k);
        p.glow(0, 0, 12, WHITE, 0.6 * k);
        for (const [dx, dy] of [[-1, -0.35], [1, -0.35], [-1, 0.35], [1, 0.35]]) {
          const r0 = HALF + 4 + (1 - k) * 8, r1 = r0 + 8 * k;
          p.line(dx * r0, dy * r0 * 0.6, dx * r1, dy * r1 * 0.6, WHITE, k);
        }
      }
      ps.draw(p, "front");
    },
  };
}
