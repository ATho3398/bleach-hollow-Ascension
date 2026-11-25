// 사신 탄생 (블리치 할로우 어센션 커스텀, 첫 시작 탄생 연출을 픽셀 이펙트로): 빈 바탕 곳곳에서 영자 알갱이가 계속 생겨나 가운데로 와르르 모여들고 →
// 한 점으로 뭉쳐 '반짝' → 그 자리에 영혼 불빛이 피어남 → 걷힘(캐릭터 등장). 원점 = 영혼 자리.
// 사용자 2026-11-23 "그 캐릭첨 시작할 때, 사신 호로 애니메이션 있잖아. 그거 픽셀fx 기반으로 다시 만들어줄래?"
// 사용자 2026-11-25 "사신은 영자들이 저렇게 미리 떠있는게 아니라, 시간을 두고 지속적으로 생기는 식. 그게 싹 다 모여서 영혼화하고,"
// 사용자 2026-11-25 피드백 "영혼이 뜨지 말고, 바탕에서 영혼 입자들이(지금의 점들)이 가운데로 와바바박 모이다가. 반짝하고 영혼나옴."
// 영혼 꼬리 불꽃은 pixelfx fire/_lib.js (MIT — Sprite Fusion fire 레시피, THIRD_PARTY_NOTICES.md).
import { fit, rng, seg, ease, WHITE } from "../../core/index.js";
import { flameTongue, noiseFor } from "../fire/_lib.js";

// 단계 시각(초): 바탕에 알갱이 0~0.3 · 모여듦 0.2~1.9(점점 빠르고 많이) · 뭉침 1.9~2.05 · 반짝 2.05 · 영혼 2.1~2.6 · 걷힘 ~3.0
const GATHER0 = 0.2, GATHER1 = 1.9, SPARK = 2.05, END = 3.0;
const MOTES = 120;

export const meta = {
  name: "사신 탄생",
  desc: "Shinigami birth (custom): spirit motes scattered over the screen rush faster and faster into the centre, condense to a point, sparkle, and a soul blooms there.",
  tags: ["custom", "birth", "soul", "reiatsu", "gather", "one-shot", "fullscreen"],
  size: [212, 98],
  origin: [106, 36],
  duration: END,
  loop: false,
  fps: 30,
  bg: "dark",
  // 영압 푸른빛(어두운 → 흰) — 사신 테마 강조색(#6f8db0·#a3bad3) 계열
  options: { palette: ["#141c2a", "#22344e", "#3a5a80", "#6f8db0", "#a3bad3", "#d8e8f6", "#ffffff"], seed: 2 },
};

export function draw(p, t, o) {
  if (t >= END) return;
  const C = fit(o.palette, 7), N = noiseFor(0), n = (rate, seed, off) => N(t, rate, seed, off);

  // ── 1. 영자 알갱이: 미리 떠 있지 않고, 시간을 두고 화면 곳곳에서 계속 생겨남(뒤로 갈수록 자주) → 생기자마자 잠깐 반짝이다 휘감기며 가운데로 빨려 듦
  const r = rng(o.seed, 3);
  let arrived = 0;
  for (let k = 0; k < MOTES; k++) {
    const x0 = r.range(-104, 104), y0 = r.range(-34, 60);
    // 생기는 때: 뒤로 갈수록 몰리게(제곱근) — 처음엔 하나둘, 끝엔 우르르. 다 모이는 시각(GATHER1) 안에 도착하게
    const born = 0.05 + (GATHER1 - 0.6) * Math.sqrt(r.next()), hover = r.range(0.08, 0.22), fly = r.range(0.2, 0.33);
    const go = born + hover, spin = r.range(0.5, 1.4) * (k % 2 ? 1 : -1);
    if (t < born) continue;
    const u = seg(t, go, go + fly);
    if (u >= 1) { arrived++; continue; }
    if (u <= 0) {
      // 막 생김: 작은 반짝 (+ 모양이 점으로 오그라듦)
      const a = seg(t, born, go), c = a < 0.5 ? C[6] : C[4];
      p.px(x0, y0, c);
      if (a < 0.5) p.px(x0 - 1, y0, C[4]), p.px(x0 + 1, y0, C[4]), p.px(x0, y0 - 1, C[4]), p.px(x0, y0 + 1, C[4]);
      p.glow(x0, y0, 3, C[4], 0.35 * (1 - a));
      continue;
    }
    const e = ease.inCubic(u), R = Math.hypot(x0, y0) * (1 - e), a0 = Math.atan2(y0, x0), a = a0 + spin * e;
    const x = Math.cos(a) * R, y = Math.sin(a) * R;
    // 날아드는 동안: 빠를수록 꼬리가 길어짐
    const c = u > 0.6 ? C[6] : C[5];
    p.px(x, y, c);
    const tail = 1 + 6 * e;
    p.line(x, y, x + Math.cos(a - spin * 0.15) * tail, y + Math.sin(a - spin * 0.15) * tail, C[3]);
    p.glow(x, y, 3, C[4], 0.25 + 0.3 * u);
  }

  // ── 2. 가운데: 모일수록 빛이 커지고, 끝에 한 점으로 오그라듦 → 반짝(십자 별 + 고리)
  const fill = arrived / MOTES;
  if (t < SPARK) {
    const squeeze = seg(t, GATHER1, SPARK); // 마지막에 꽉 뭉침
    const R = (2 + 6 * fill) * (1 - 0.7 * squeeze);
    if (fill > 0) {
      p.glow(0, 0, 10 + 24 * fill, C[3], 0.3 + 0.4 * fill);
      p.circle(0, 0, R + 1, C[4]);
      p.circle(0, 0, R, fill > 0.6 ? C[6] : C[5]);
    }
  } else {
    const s = seg(t, SPARK, SPARK + 0.35), k = 1 - s;
    if (k > 0) {
      const L = 6 + 70 * ease.outCubic(s); // 십자 반짝임 — 가로가 더 길게
      for (const [dx, dy, len] of [[1, 0, L], [-1, 0, L], [0, 1, L * 0.55], [0, -1, L * 0.55]]) {
        p.line(0, 0, dx * len * k + dx * 4, dy * len * k + dy * 4, C[6]);
        p.glowLine(0, 0, dx * len * k, dy * len * k, 3, C[4], 0.5 * k);
      }
      for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) p.line(0, 0, dx * 10 * k, dy * 10 * k, C[5]);
      const rr = 4 + 40 * ease.outCubic(s);
      if (k > 0.1) p.ring(0, 0, rr, 1 + 2 * k, C[5]);
      p.glow(0, 0, 40 * k, C[5], 0.7 * k);
    }
  }

  // ── 3. 영혼 불빛: 반짝 자리에서 피어나 떠 있다가(살짝 출렁) → 걷힐 때 위로 스며들며 사라짐
  const bloom = ease.outBack(seg(t, SPARK + 0.03, SPARK + 0.35)), fade = seg(t, END - 0.45, END);
  if (bloom > 0 && fade < 1) {
    const k = bloom * (1 - fade), Y = Math.sin(t * 4) * 1.5 - 6 * fade, R = 9 * Math.max(0.2, bloom) * (1 - 0.4 * fade);
    p.glow(0, Y, 30, C[3], 0.45 * k);
    const H = [C[6], C[6], C[5], C[5], C[4], C[4], C[3], C[3], C[2]];
    for (const [dx, h, w, s] of [[-4, 12, 3, 3], [4, 13, 3, 7], [0, 19, 4, 11]]) flameTongue(p, dx, Y - R * 0.4, h * k, w, 0, n, s, H);
    p.shade(-R - 2, Y - R - 2, R + 2, Y + R + 2, (x, y, out) => {
      const d = Math.hypot(x, y - Y) / (R + 0.6 * n(14, 5, Math.atan2(y - Y, x) * 1.6));
      if (d > 1) return 0;
      out.c = d < 0.4 ? C[6] : d < 0.66 ? C[5] : d < 0.86 ? C[4] : C[3];
      out.a = 1 - fade;
    });
  }

  // ── 반짝 순간 화면 섬광 (짧게)
  const fl = seg(t, SPARK, SPARK + 0.03) * (1 - seg(t, SPARK + 0.03, SPARK + 0.2));
  if (fl > 0) p.rect(-106, -36, 212, 98, WHITE, 0.6 * fl);
}
