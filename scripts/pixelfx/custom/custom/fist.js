// 주먹질 (블리치 할로우 어센션 커스텀, GDD 180장, 옛 이름 찌르기 custom/thrust): pixelfx melee/thrust 에서 끝의 긴 별·찌름 고리·불꽃·빛 알갱이·별을 빼고, 끝에서 '주먹 펑'(_punch.js, 앞으로 쏠림).
// 사용자 2026-11-04 "트러스트랑 어퍼컷 전부 뭔가 불꽃이 튀는듯한 이펙트잖아. 주먹질처럼 좀 묵직하게 펑 한번 터지는 이펙트가 나을거같아. 커스텀으로 구현해봐"
// 빛줄기 다발은 그대로. 03:2x "찌르기 커스텀을 이름을 주먹질로 바꾸고 … 주변에 한줄짜리 이펙트 같이 날아가잖아. 그거 없애란거였어" → 이름 주먹질, 옆 속도선 삭제. 원본: patch-gg/pixelfx a841596 src/fx/melee/thrust.js (MIT, THIRD_PARTY_NOTICES.md).
//
// The speed lines are adapted from Sprite Fusion's open-source dash and the ray star from his sparkle
// (https://www.spritefusion.com/pixel-art-vfx), MIT License, Copyright (c) 2026 Hugo Duprez.
import { Lights, Rng, fit, clamp, smooth, ease, WHITE, READY } from "../../core/index.js";
import { punch } from "./_punch.js";

export const meta = {
  name: "주먹질",
  desc: "Fist (custom): a bundle of streaks shoots out to a point and ends in one heavy punch burst. No speed lines, star or sparks.",
  tags: ["custom", "melee", "fist", "punch", "jab", "one-shot"],
  size: [196, 76],
  origin: [34, 62],
  duration: 0.4,
  loop: false,
  fps: 30,
  bg: "ground",
  actor: 2,
  options: {
    palette: ["#2a1608", "#6b3c10", "#b8701a", "#f0b42e", "#ffe27a", "#fff6cf", "#ffffff"],
    sparks: ["#fff3a6", "#ffe26b", "#ff8a2a", "#f2561d"],
    reach: 66,
    seed: 4,
  },
};

const STANCE = { ...READY, weapon: "sword", x: -14, fx: 12, fy: -21, sa: -0.3 };
// the hand comes back to the hip with the point forward, then the whole arm goes out along the blade
const BACK = { ...STANCE, crouch: 5, lean: -3, fx: -3, fy: -19, sa: -0.05, bx: 8, by: -30, armsFront: true, ffx: 10, fbx: -8 };
const LUNGE = { ...STANCE, crouch: 6, lean: 6, fx: 23, fy: -20, sa: 0, bx: -8, by: -24, ffx: 15, fbx: -11, toeB: true };
export const act = {
  target: { x: 80 },
  poses: [
    [-0.46, STANCE],
    [-0.24, BACK],
    [-0.05, { ...BACK, crouch: 6, fx: -5 }],
    [0, { ...LUNGE, ghost: 1 }, "snap"],
    [0.07, LUNGE, "snap"],
    [0.3, { ...LUNGE, crouch: 5, lean: 5 }],
    [0.7, STANCE],
  ],
  hits: [{ t: 0.07, stop: 0.12, shake: 0.14, amp: 2, push: 2.8, straw: 16, y: -26 }],
  dust: [{ t: 0, x: -24, n: 6, dir: -1 }, { t: 0.07, x: 1, n: 6, dir: 1 }],
};

const OUT = 0.07; // the point arrives
const HOLD = 0.06, PULL = 0.2;

export function create(o) {
  const C = fit(o.palette, 7), Rg = new Rng(o.seed), lights = new Lights();
  const HX = 9, HY = -20, TX = HX + o.reach, TY = HY;
  // the bundle: streaks fanned at the hand, meeting at the point; the middle one hottest
  const streaks = [-7, -4, -2, 0, 2, 4, 7].map((off) => ({ off, x0: HX + 1 + Rg.range(0, 5) + Math.abs(off) * 0.6, t0: Rg.range(0, 0.02) + Math.abs(off) * 0.003, w: off === 0 ? 2 : 1, hot: off === 0, len: Rg.range(0.75, 1) }));
  let t = 0, struck = false;
  return {
    update(dt) {
      t += dt;
      if (!struck && t >= OUT) {
        struck = true;
        lights.add(TX, TY, 44, C[4], 0.45, 0.3);
        lights.add(TX, TY, 14, WHITE, 0.6, 0.06);
      }
      lights.update(dt);
    },
    draw(p) {
      // the bundle: each streak shoots from the hand to the point, holds, then is drawn in to the point
      const pull = smooth(OUT + HOLD, OUT + HOLD + PULL, t);
      for (const s of streaks) {
        const u = clamp((t - s.t0) / OUT), head = ease.outExpo(u);
        if (u <= 0 || pull >= 1) continue;
        // the outer streaks stop short of the point and trail a little behind, so each reads on its own
        const y0 = HY + s.off, end = s.x0 + (TX - s.x0) * s.len, x1 = s.x0 + (end - s.x0) * head, xa = s.x0 + (end - s.x0) * Math.max(pull, head * 0.35 * (1 - s.len) * 3);
        const yAt = (x) => y0 + (TY - y0) * clamp((x - s.x0) / (TX - s.x0)) * 0.85;
        for (let x = xa; x <= x1; x += 0.5) {
          const v = (x - xa) / Math.max(1, x1 - xa), c = v > 0.88 ? WHITE : s.hot ? (v > 0.35 ? C[6] : C[5]) : v > 0.55 ? C[5] : v > 0.25 ? C[4] : C[3];
          p.dot(x, yAt(x), c, v < 0.12 ? v / 0.12 : 1);
          if (s.w > 1 && v > 0.1) p.dot(x, yAt(x) + 1, v > 0.6 ? C[5] : C[3], v < 0.2 ? v / 0.2 : 1);
        }
      }
      if (t < OUT + HOLD + PULL) p.glowLine(HX + (TX - HX) * pull, HY, HX + (TX - HX) * ease.outExpo(clamp(t / OUT)), TY, 6, C[4], 0.22 * (1 - pull));
      // 끝에서 묵직하게 펑 (앞으로 쏠림)
      punch(p, C, TX, TY, t - OUT, 0.85, 0.6, o.seed);
      lights.draw(p);
    },
  };
}
