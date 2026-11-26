// 사신 진화 (블리치 할로우 어센션 커스텀, 진화 연출을 픽셀 이펙트로): 가운데의 지금 진화체에게 화면 곳곳에서 계속 생겨나는 영자 알갱이가 모여들고
// (몸 여기저기에 닿을 때마다 반짝), 몸이 점점 하얘지다가(모델 하얘짐 = 게임 쪽 표시) → SWAP 순간 반짝 임팩트와 함께 다음 진화체로 바뀜 → 남은 빛이 흩어짐.
// 사용자 2026-11-25 "사신 진화는 모델한테 영혼 모이면서, 점점 하얘지다가 다음 진화체로 나오는거로 하자."
// 사용자 2026-11-25 "진화 연출은 기존 진화체였다가 이펙트 나오고 임팩트 나오는 타이밍 맞춰서 다음 진화체 모델이 나오게 해야지."
import { fit, rng, seg, ease, WHITE, TAU } from "../../core/index.js";

/** 다음 진화체로 바뀌는 순간(초) = 반짝 임팩트. 모델 하얘짐: WHITEN0 부터 SWAP 까지 점점 → 바뀐 뒤 SWAP+UNWHITEN 동안 원래 색으로 */
export const WHITEN0 = 0.5, SWAP = 2.6, UNWHITEN = 0.55;
const END = 3.6, MOTES = 110;
const BODY = { rx: 11, ry: 27, cy: 2 }; // 진화체 몸 자리(원점 = 진화체 가운데) — 알갱이가 닿는 곳

export const meta = {
  name: "사신 진화",
  desc: "Shinigami evolution (custom): spirit motes keep appearing and stream onto the creature, sparkling where they land as it brightens, then a white sparkle impact.",
  tags: ["custom", "evolve", "reiatsu", "gather", "sparkle", "one-shot", "fullscreen"],
  size: [212, 98],
  origin: [106, 49],
  duration: END,
  loop: false,
  fps: 30,
  bg: "dark",
  options: { palette: ["#141c2a", "#22344e", "#3a5a80", "#6f8db0", "#a3bad3", "#d8e8f6", "#ffffff"], seed: 5 },
};

export function draw(p, t, o) {
  if (t >= END) return;
  const C = fit(o.palette, 7), gather = ease.inQuad(seg(t, 0.2, SWAP));

  // ── 1. 몸 둘레 빛: 모일수록 커지고 하얘짐 → 바뀐 뒤 사그라짐
  const after = seg(t, SWAP, SWAP + 0.8);
  const aura = t < SWAP ? gather : 1 - after;
  if (aura > 0) {
    p.glow(0, BODY.cy, 26 + 22 * aura, aura > 0.6 ? C[5] : C[4], 0.25 + 0.45 * aura);
    p.glow(0, BODY.cy - 10, 16 + 10 * aura, C[6], 0.2 * aura);
  }

  // ── 2. 영자 알갱이: 화면 곳곳에서 시간을 두고 계속 생겨나(뒤로 갈수록 자주) 휘감기며 몸 여기저기로 날아들고, 닿으면 반짝
  const r = rng(o.seed, 3);
  for (let k = 0; k < MOTES; k++) {
    const x0 = r.range(-104, 104), y0 = r.range(-46, 46), born = 0.05 + (SWAP - 0.75) * Math.sqrt(r.next());
    const hover = r.range(0.08, 0.2), fly = r.range(0.22, 0.38), spin = r.range(0.4, 1.1) * (k % 2 ? 1 : -1);
    const ta = r.next() * TAU, tr = Math.sqrt(r.next()), tx = Math.cos(ta) * BODY.rx * tr, ty = BODY.cy + Math.sin(ta) * BODY.ry * tr; // 닿을 자리
    if (t < born) continue;
    const go = born + hover, u = seg(t, go, go + fly);
    if (u <= 0) {
      // 막 생김: + 모양 반짝 → 점
      const a = seg(t, born, go);
      p.px(x0, y0, a < 0.5 ? C[6] : C[4]);
      if (a < 0.5) p.px(x0 - 1, y0, C[4]), p.px(x0 + 1, y0, C[4]), p.px(x0, y0 - 1, C[4]), p.px(x0, y0 + 1, C[4]);
      continue;
    }
    if (u < 1) {
      const e = ease.inCubic(u), dx = x0 - tx, dy = y0 - ty, R = Math.hypot(dx, dy) * (1 - e), a = Math.atan2(dy, dx) + spin * e;
      const x = tx + Math.cos(a) * R, y = ty + Math.sin(a) * R, tail = 1 + 6 * e;
      p.px(x, y, u > 0.6 ? C[6] : C[5]);
      p.line(x, y, x + Math.cos(a - spin * 0.15) * tail, y + Math.sin(a - spin * 0.15) * tail, C[3]);
      p.glow(x, y, 3, C[4], 0.25 + 0.3 * u);
      continue;
    }
    // 닿은 자리 반짝 (짧게)
    const hit = 1 - seg(t, go + fly, go + fly + 0.18);
    if (hit > 0 && t < SWAP) {
      p.px(tx, ty, C[6]);
      if (hit > 0.5) p.px(tx - 1, ty, C[5]), p.px(tx + 1, ty, C[5]), p.px(tx, ty - 1, C[5]), p.px(tx, ty + 1, C[5]);
      p.glow(tx, ty, 4, C[5], 0.4 * hit);
    }
  }

  // ── 3. SWAP 임팩트: 몸에서 십자 반짝 + 고리 + 짧은 섬광 (이 순간 다음 진화체로 바뀐다)
  if (t >= SWAP) {
    const s = seg(t, SWAP, SWAP + 0.4), k = 1 - s;
    if (k > 0) {
      const L = 8 + 80 * ease.outCubic(s);
      for (const [dx, dy, len] of [[1, 0, L], [-1, 0, L], [0, 1, L * 0.6], [0, -1, L * 0.6]]) {
        p.line(0, BODY.cy, dx * (len * k + 4), BODY.cy + dy * (len * k + 4), C[6]);
        p.glowLine(0, BODY.cy, dx * len * k, BODY.cy + dy * len * k, 3, C[4], 0.5 * k);
      }
      for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) p.line(0, BODY.cy, dx * 12 * k, BODY.cy + dy * 12 * k, C[5]);
      if (k > 0.1) p.ring(0, BODY.cy, 6 + 52 * ease.outCubic(s), 1 + 2 * k, C[5]);
      p.glow(0, BODY.cy, 46 * k, C[5], 0.7 * k);
    }
    const fl = seg(t, SWAP, SWAP + 0.03) * (1 - seg(t, SWAP + 0.03, SWAP + 0.2));
    if (fl > 0) p.rect(-106, -49, 212, 98, WHITE, 0.6 * fl);
    // 남은 빛 알갱이가 몸에서 위로 흩날림
    const rr = rng(o.seed, 9);
    for (let k2 = 0; k2 < 30; k2++) {
      const life = rr.range(0.5, 0.95), d0 = rr.range(0, 0.15), x0 = rr.range(-1, 1) * BODY.rx * 1.4, y0 = BODY.cy + rr.range(-1, 1) * BODY.ry, vy = rr.range(30, 60);
      const ag = (t - SWAP - d0) / life;
      if (ag < 0 || ag >= 1) continue;
      const x = x0 + Math.sin(ag * 6 + k2) * 3, y = y0 - vy * ag * life;
      p.px(x, y, ag < 0.5 ? C[6] : C[4]);
      p.glow(x, y, 3, C[4], 0.35 * (1 - ag));
    }
  }
}
