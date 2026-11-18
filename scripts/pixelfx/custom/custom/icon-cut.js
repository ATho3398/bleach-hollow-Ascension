// 블록 아이콘 — 칼로 벤 상처 (사용자 2026-11-19 "칼로 벤듯한 상처가 난 아이콘"). 정지 그림 = 프레임 5(상처가 다 열리고 식기 시작).
// 호로 조 기본(custom/icon-claw)과 같은 상처 그리기(melee/claw-swipe 의 렌즈) — 긴 한 줄, 발톱과 반대 방향(왼쪽 위 → 오른쪽 아래), 피가 흘러내린다.
// The shaded smear and dotted trace follow Sprite Fusion's open-source slash (MIT, Copyright (c) 2026 Hugo Duprez), via melee/claw-swipe.
import { Particles, Bits, Lights, P, B, Rng, fit, clamp, smooth, ease } from "../../core/index.js";
import { through, onSwing, travel, smear, trace, glowAlong } from "../melee/_lib.js";
export const meta = { name: "Icon: blade cut", desc: "One long clean cut across a 48px square, white-hot cooling to red, bleeding.", tags: ["icon", "cut", "slash", "wound"],
  size: [48, 48], origin: [24, 24], duration: 0.9, loop: false, fps: 30, bg: "none",
  options: { palette: ["#2a0808", "#5c0f12", "#a51d1d", "#e2401f", "#ff8a2a", "#ffd166", "#fff3c4", "#ffffff"], sparks: ["#fff3c4", "#ffd166", "#ff8a2a", "#c42a1a"], seed: 3 } };
const RAKE = 0.05, CLOSE0 = 0.22, CLOSE = 0.3, W = 9.5;
export function create(o) {
  const C = fit(o.palette, 8), n = C.length, Rg = new Rng(o.seed), floor = () => 999;
  const ps = new Particles({ rng: Rg, ground: floor, sparks: o.sparks }), drips = new Bits({ ground: floor }), lights = new Lights();
  const s = through(-4, 1, 0.82, -1, 90, 56 / 90, 0.5), end = travel(s, s.span);
  let t = 0, open = false;
  return {
    update(dt) {
      t += dt;
      if (!open && t >= RAKE * 0.7) {
        open = true;
        lights.add(0, 0, 22, C[4], 0.4, 0.3);
        for (let i = 0; i < 6; i++) {
          const [x, y] = onSwing(s, s.R, s.span * Rg.range(0.15, 0.9));
          ps.spawn(P.MOTE, x, y, Rg.range(-30, 30), Rg.range(-20, 30), Rg.range(0.15, 0.3), Rg.chance(0.5) ? C[5] : C[4], 0.5);
        }
        for (const f of [0.3, 0.52, 0.72]) {
          const [x, y] = onSwing(s, s.R + 1, s.span * f);
          drips.add({ kind: B.DRIP, x, y: y + 2, vx: Rg.range(-4, 4), vy: Rg.range(30, 60), g: 0.5, life: 1.2, c: C[3] });
        }
      }
      drips.update(dt); ps.update(dt); lights.update(dt);
    },
    draw(p) {
      const S = s.span, head = S * ease.outExpo(clamp(t / RAKE)), c = smooth(CLOSE0, CLOSE0 + CLOSE, t), lo = (S / 2) * c, hi = Math.min(head, S - (S / 2) * c), heat = clamp(1 - t / 0.5);
      drips.draw(p);
      if (hi - lo > 0.02) {
        smear(p, s, lo, hi, W, (uu, r, out) => {
          const v = uu / S, w = W * Math.pow(Math.sin(Math.PI * v), 0.7) * (1 - 0.55 * c), off = Math.abs(r - (s.R - W / 2)) / (w / 2 + 0.01);
          if (w < 0.5 || off > 1) return;
          out.c = C[n - 1 - clamp(Math.round((1 - heat) * 4.2 + off * 2.6), 0, n - 2)];
        }, 0, 2);
        glowAlong(p, s, s.R - W / 2, lo, hi, 7, C[4], 0.35 * heat * heat, 0, 0.2);
      }
      const k = 0.8 * (1 - clamp((t - CLOSE0 - CLOSE * 0.5) / 0.4));
      if (c > 0.05 && k > 0) { trace(p, s, s.R - W / 2, 0.04 * S, lo, C[2], k); trace(p, s, s.R - W / 2, S - lo, 0.96 * S, C[2], k); }
      ps.draw(p); lights.draw(p);
    },
  };
}
