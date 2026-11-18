// 블록 아이콘 — 발톱 세 줄 상처 (블리치 할로우 어센션 커스텀, 사용자 2026-11-19 "발톱 3개로 긁은 상처 모양 이펙트")
// 48×48 정사각형 한 칸에 꽉 차게. melee/claw-swipe 의 상처(가운데가 두껍고 양끝이 뾰족한 렌즈) 그리기를 그대로 쓰고, 캐릭터·바닥 없이 상처만.
// 흐름: 세 줄이 차례로 찢어짐(오른쪽 위 → 왼쪽 아래) → 흰빛에서 주황·빨강으로 식음 → 양끝부터 닫히며 점선 흉터. 아이콘 정지 그림 = 세 줄이 다 열린 프레임.
// 04:1x "1번가고 십자가 빼. 이거는 호로 조 기본 블록 이펙트임" → 발톱 끝 십자 반짝임 삭제. 확정 그림 = 프레임 6 (docs/design/user-art/block-icons/hollow-jo-basic.png)
// The shaded smear and dotted trace follow Sprite Fusion's open-source slash (MIT, Copyright (c) 2026 Hugo Duprez), via melee/claw-swipe.
import { Particles, Lights, P, Rng, fit, clamp, smooth, ease } from "../../core/index.js";
import { through, onSwing, travel, smear, trace, glowAlong } from "../melee/_lib.js";

export const meta = {
  name: "Icon: claw marks",
  desc: "Three claw gashes tear diagonally across a 48px square, white-hot cooling to red, then close into dotted scars.",
  tags: ["icon", "claw", "scratch", "one-shot"],
  size: [48, 48],
  origin: [24, 24],
  duration: 0.9,
  loop: false,
  fps: 30,
  bg: "none",
  options: {
    palette: ["#2a0808", "#5c0f12", "#a51d1d", "#e2401f", "#ff8a2a", "#ffd166", "#fff3c4", "#ffffff"],
    sparks: ["#fff3c4", "#ffd166", "#ff8a2a", "#c42a1a"],
    seed: 8,
    flecks: 1,
  },
};

const RAKE = 0.05, STAGGER = 0.04, CLOSE0 = 0.2, CLOSE = 0.3;
const TH = 2.05; // 긁는 방향(오른쪽 위 → 왼쪽 아래)
const NX = Math.sin(TH), NY = -Math.cos(TH); // 줄 사이 방향(긁는 방향에 수직)

export function create(o) {
  const C = fit(o.palette, 8), n = C.length, Rg = new Rng(o.seed), floor = () => 999;
  const ps = new Particles({ rng: Rg, ground: floor, sparks: o.sparks }), lights = new Lights();
  // 세 줄: 가운데가 가장 길고 두껍다
  const marks = [-1, 0, 1].map((k, i) => {
    const len = k === 0 ? 46 : 38, R = 70;
    const s = through(k * 12.5 + 1, k * 2 + (k === 0 ? 0 : 1), TH, 1, R, len / R, 0.5);
    return { s, t0: i * STAGGER, W: k === 0 ? 8 : 6.6, open: false, end: travel(s, s.span) };
  });
  let t = 0;
  const heatAt = (m) => clamp(1 - (t - m.t0) / 0.5);
  return {
    update(dt) {
      t += dt;
      for (const m of marks) {
        if (!m.open && t >= m.t0 + RAKE * 0.7) {
          m.open = true;
          lights.add(m.end.x, m.end.y - 3, 14, C[4], 0.35, 0.25);
          for (let i = 0; i < 3 * o.flecks; i++) {
            const [x, y] = onSwing(m.s, m.s.R, m.s.span * Rg.range(0.2, 0.9));
            ps.spawn(P.MOTE, x, y, Rg.range(-40, -5), Rg.range(-10, 30), Rg.range(0.15, 0.3), Rg.chance(0.5) ? C[5] : C[4], 0.5);
          }
        }
      }
      ps.update(dt);
      lights.update(dt);
    },
    draw(p) {
      for (const m of marks) {
        const u = t - m.t0;
        if (u < 0) continue;
        const S = m.s.span, head = S * ease.outExpo(clamp(u / RAKE)), c = smooth(CLOSE0, CLOSE0 + CLOSE, u), lo = (S / 2) * c, hi = Math.min(head, S - (S / 2) * c);
        const heat = heatAt(m);
        if (hi - lo > 0.02) {
          smear(p, m.s, lo, hi, m.W, (uu, r, out) => {
            const v = uu / S, w = m.W * Math.pow(Math.sin(Math.PI * v), 0.9) * (1 - 0.55 * c), off = Math.abs(r - (m.s.R - m.W / 2)) / (w / 2 + 0.01);
            if (w < 0.5 || off > 1) return;
            const ci = Math.round((1 - heat) * 4.2 + off * 2.4 + (head < S ? (S - uu) / S : 0) * 0.5);
            out.c = C[n - 1 - clamp(ci, 0, n - 2)];
          }, 0, 2);
          glowAlong(p, m.s, m.s.R - m.W / 2, lo, hi, 6, C[4], 0.35 * heat * heat, 0, 0.2);
        }
        const k = 0.8 * (1 - clamp((u - CLOSE0 - CLOSE * 0.5) / 0.4));
        if (c > 0.05 && k > 0) {
          trace(p, m.s, m.s.R - m.W / 2, 0.04 * S, lo, C[2], k);
          trace(p, m.s, m.s.R - m.W / 2, S - lo, 0.96 * S, C[2], k);
        }
      }
      ps.draw(p);
      lights.draw(p);
    },
  };
}
