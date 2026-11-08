// 기모으기 (블리치 할로우 어센션 커스텀, GDD 180장): pixelfx shadow/dark-explosion 의 모으기(빛 알갱이가 소용돌이쳐 들어가고,
// 빛줄기가 꽂히고, 고리가 좁혀 들고, 검은 핵이 뛰는 것)만 남기고, 그 뒤 터짐(번쩍임·검은 별·불타는 검은 공·파편·연기·마지막 터짐)을 뺐다.
// 사용자 2026-11-04 "다크 익스플로이드도, 충전하는거만 남기고 뒤에 공 생기는건 지워서 기모으기로 커스텀 이펙스 생성"
// 다 모이면(REL) 모인 모습 그대로 FO 초 동안 점점 옅어져 사라진다(02:4x "기모으기가 너무 갑자기 뚝하고 사라지니까, 페이드아웃으로 사라지게"). 원본: patch-gg/pixelfx a841596 src/fx/shadow/dark-explosion.js (MIT, THIRD_PARTY_NOTICES.md).
//
// The pull that swirls motes into the core and the collapse burst are adapted from Sprite Fusion's open-source
// black-hole (https://www.spritefusion.com/pixel-art-vfx/black-hole), the sparks, rings and smoke from his explosion,
// MIT License, Copyright (c) 2026 Hugo Duprez.
import { Particles, P, Rng, fit, clamp, smooth, ease, noise, hex, TAU, WHITE, mix } from "../../core/index.js";
import { VOID, Puffs, PK, halo, ringFast, unlight, attract } from "../shadow/_lib.js";

export const meta = {
  name: "기모으기",
  desc: "Ki gather (custom): motes swirl into a pulsing dark core, streaks shoot in and a ring closes on it, then it swallows it all. The charge of Dark explosion without the blast.",
  tags: ["custom", "shadow", "charge", "gather", "void", "dark", "one-shot"],
  size: [280, 248],
  origin: [140, 206],
  duration: 0.94,
  loop: false,
  fps: 30,
  bg: "ground",
  options: { palette: VOID, seed: 6 },
};

// the heart of the blast hangs above the floor; the sphere's radius; the beats of the choreography
const Y = -54, REL = 0.52, FO = 0.4, SMOKE = hex("#5d5468");
// 페이드아웃 동안 붙잡아 두는 모으기 시각 (핵이 흰 점으로 바뀌기 전)
const HOLD_T = REL - 0.09;

// a black sphere: a void body (a faint crescent of reflected light low on the right, a dull glint high on the
// left), a white rim, and pointed tongues of violet flame that lean up, flicker and crawl round it
function sphere(p, C, r, t, heat) {
  if (r < 0.6) return;
  const E = r + 12 * heat + 2;
  p.shade(-E, Y - E, E, Y + E, (x, y, out) => {
    const dx = x, dy = y - Y, d = Math.sqrt(dx * dx + dy * dy);
    if (d > E) return;
    if (d < r - 0.5) {
      const e = r - d, ang = Math.atan2(dy, dx);
      if (e < 1.4 && Math.cos(ang - 0.8) > 0.55) return C[2];
      if (r > 8 && (dx + r * 0.45) ** 2 + (dy + r * 0.45) ** 2 < 1.6) return C[3];
      return C[0];
    }
    const e = d - (r - 0.5);
    if (e < 1) {
      out.c = Math.sin(Math.atan2(dy, dx) * 7 + t * 9) > -0.6 ? WHITE : C[7];
      out.k = 0.4;
      return;
    }
    // the further out, the lower the angle it's sampled at: tongues bend upward like flame
    const ang = Math.atan2(dy + e * 0.6, dx), top = Math.max(0, -Math.sin(ang));
    const a1 = ang - t * 0.9, a2 = ang + t * 1.7;
    const i1 = Math.round((a1 * 9) / TAU), i2 = Math.round((a2 * 15) / TAU);
    const T1 = Math.pow(0.5 + 0.5 * Math.cos(a1 * 9), 3) * (0.55 + 0.45 * noise(t * 7 + i1 * 3.7, 1));
    const T2 = Math.pow(0.5 + 0.5 * Math.cos(a2 * 15), 4) * (0.5 + 0.5 * noise(t * 11 + i2 * 5.1, 2));
    const h = heat * (0.3 + 0.95 * top) * (1.5 + 12 * Math.max(0, T1) + 6 * Math.max(0, T2));
    if (e > h + 1) return;
    const u = (e - 1) / h;
    out.c = u < 0.18 ? WHITE : u < 0.4 ? C[7] : u < 0.62 ? C[6] : u < 0.84 ? C[5] : C[4];
    out.a = u < 0.8 ? 1 : (1 - u) * 5;
    if (u < 0.6 && ((Math.floor(x) + Math.floor(y)) & 1) === 0) out.k = 0.25 * (1 - u);
  });
}

export function create(o) {
  const C = fit(o.palette, 8), R = new Rng(o.seed), floor = () => 0;
  const ps = new Particles({ rng: R, ground: floor, sparks: [WHITE, C[7], C[6], C[5]] });
  const puffs = new Puffs({
    rng: R,
    flame: [WHITE, C[7], C[6], C[5], C[5], C[4], C[4], C[3], C[2]],
    soot: [mix(mix(C[3], C[1], 0.3), SMOKE, 0.45), mix(C[1], SMOKE, 0.3)],
    cap: mix(mix(C[4], C[2], 0.5), SMOKE, 0.4),
    rim: [C[6], C[5], C[4]],
    floor,
  });
  let t = 0, swallowed = false, acc = 0;
  // 1 → 0: 다 모인 뒤 사라지는 정도 (painter.fade 에 곱한다 — 점은 디더로, 빛은 세기로 옅어진다)
  const fadeK = () => 1 - smooth(REL, REL + FO, t);
  const fadeOn = (p) => (p.fade *= fadeK());

  const coreR = (tt) => (tt < REL - 0.07 ? 1.5 + 5 * ease.inQuad(tt / REL) : 1);
  return {
    update(dt) {
      t += dt;
      // the charge: motes swirl in from all round, streaks shoot straight at the core, darkness gathers
      if (t < REL - 0.06) {
        const k = t / REL;
        for (acc += dt * (90 + 150 * k); acc > 1; acc--) {
          const a = R.range(0, TAU), D = R.range(36, 84), x = Math.cos(a) * D, y = Math.min(-3, Y + Math.sin(a) * D), vt = R.range(50, 110), vi = R.range(10, 40);
          ps.spawn(P.MOTE, x, y, -Math.sin(a) * vt - Math.cos(a) * vi, Math.cos(a) * vt - Math.sin(a) * vi, 0.9, R.pick([WHITE, C[6], C[6], C[5]]), R.range(0.7, 1.2));
        }
        if (R.chance(0.75)) {
          const a = R.range(0, TAU), D = R.range(28, 70), T = R.range(0.18, 0.28), v = (D * 3) / (Math.exp(3 * T) - 1);
          ps.spawn(P.STREAK, Math.cos(a) * D, Y + Math.sin(a) * D, -Math.cos(a) * v, -Math.sin(a) * v, T, R.chance(0.5) ? C[7] : C[6]);
        }
        if (t < REL - 0.2 && R.chance(0.16)) {
          const a = R.range(0, TAU), D = R.range(34, 60);
          puffs.spawn(PK.SOOT, Math.cos(a) * D, Y + Math.sin(a) * D, -Math.sin(a) * 40, Math.cos(a) * 40, R.range(0.6, 0.9), R.range(3, 6));
        }
      }
      // 끌어당김은 사라지는 동안에도 계속 (모인 채로 옅어진다)
      if (t < REL + FO) {
        const k = Math.min(t, REL) / REL;
        attract(ps.list, 0, Y, 2.2e6 * (0.3 + k), 110, 0.55, 2.5, dt, (q) => (q.k === P.MOTE ? 1 : 0), 420);
        attract(puffs.list, 0, Y, 1.2e6 * (0.3 + k), 90, 0.7, 4, dt, () => 1, 160);
      }
      // 다 옅어지면 남은 것을 비운다
      if (t >= REL + FO && !swallowed) {
        swallowed = true;
        ps.list.length = 0;
        puffs.list.length = 0;
      }
      puffs.update(dt);
      ps.update(dt);
    },
    drawBack(p) {
      fadeOn(p);
      const k = clamp(Math.min(t, REL) / REL) * 0.7;
      puffs.draw(p, PK.SOOT, { x: 0, y: Y, k, reach: 84 });
      ps.draw(p, "back");
      if (k > 0) p.glow(0, -3, 74, C[4], 0.24 * k);
    },
    draw(p) {
      fadeOn(p);
      // the charge: a contracting ring and a black core that beats — 다 모인 뒤에는 HOLD_T 모습으로 멈춰 옅어진다
      let cr = 0;
      if (t < REL + FO) {
        const tc = Math.min(t, HOLD_T);
        const q = tc / REL, ring = 3 + 74 * (1 - ease.inQuad(q));
        const beat = 1 + 0.3 * Math.exp(-((tc - REL * 0.5) ** 2) / 0.0015) + 0.4 * Math.exp(-((tc - REL * 0.8) ** 2) / 0.0015);
        cr = coreR(tc) * beat;
        ringFast(p, 0, Y, ring, 1, q > 0.7 ? C[6] : C[5], (0.2 + 0.7 * q) * fadeK());
        sphere(p, C, cr, t, 0.3 + 0.3 * q);
        halo(p, 0, Y, cr, cr + 14 + 30 * q, C[5], (0.45 + 0.7 * q) * beat);
        p.glow(0, Y, 60 + 30 * q, C[4], 0.12 + 0.3 * q);
      }
      ps.draw(p, "front");
      // black takes its light back: the core
      const B0 = cr + 1;
      if (B0 > 2) unlight(p, -B0, Y - B0, B0, Y + B0, (x, y) => x * x + (y - Y) ** 2 < (cr - 0.5) ** 2);
    },
  };
}
