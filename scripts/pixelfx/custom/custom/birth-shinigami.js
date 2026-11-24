// 사신 탄생 (블리치 할로우 어센션 커스텀, 첫 시작 탄생 연출을 픽셀 이펙트로): 영혼 불빛 → 영압이 깨어나며 일곱 번 고동(푸른 고리가 퍼지고
// 영자 알갱이가 빨려 듦, 뒤로 푸른 영압 기둥이 자람) → 기둥이 하얗게 터지는 섬광 → 기둥이 가늘어지며 걷힘(캐릭터 등장). 원점 = 영혼 자리.
// 사용자 2026-11-23 "그 캐릭첨 시작할 때, 사신 호로 애니메이션 있잖아. 그거 픽셀fx 기반으로 다시 만들어줄래?"
// 영혼 꼬리 불꽃은 pixelfx fire/_lib.js (MIT — Sprite Fusion fire 레시피, THIRD_PARTY_NOTICES.md).
import { fit, rng, seg, ease, WHITE, TAU } from "../../core/index.js";
import { flameTongue, noiseFor } from "../fire/_lib.js";

// 단계 시각(초) — 지금 CSS 연출과 같은 길이: 영혼 0.6 · 고동 1.4(7번) · 섬광 0.3 · 걷힘 0.7
const ORB = 0.6, PULSE = 2.0, FLASH = 2.3, END = 3.0, BEATS = 7;
const TOP = -36, BOTTOM = 62; // 원점에서 화면 위·아래 끝(px)

export const meta = {
  name: "사신 탄생",
  desc: "Shinigami birth (custom): a soul wakes, its spirit pressure beats seven times drawing motes in under a rising blue pillar, which bursts white and then thins away.",
  tags: ["custom", "birth", "soul", "reiatsu", "pillar", "one-shot", "fullscreen"],
  size: [212, 98],
  origin: [106, 36],
  duration: END,
  loop: false,
  fps: 30,
  bg: "dark",
  // 영압 푸른빛(어두운 → 흰) — 사신 테마 강조색(#6f8db0·#a3bad3) 계열
  options: { palette: ["#141c2a", "#22344e", "#3a5a80", "#6f8db0", "#a3bad3", "#d8e8f6", "#ffffff"], seed: 2 },
};

/** 고동: 0..1 사이 몇 번째 박자에서 얼마나 지났나 → 세기(막 뛸 때 1, 사라지며 0) */
function beatAt(t) {
  if (t < ORB || t >= PULSE) return { i: -1, k: 0, age: 0 };
  const span = (PULSE - ORB) / BEATS, i = Math.floor((t - ORB) / span), age = (t - ORB - i * span) / span;
  return { i, k: Math.pow(1 - age, 2), age };
}

export function draw(p, t, o) {
  if (t >= END) return;
  const C = fit(o.palette, 7), N = noiseFor(0), n = (rate, seed, off) => N(t, rate, seed, off);
  const build = ease.inQuad(seg(t, ORB, PULSE)); // 영압이 차오르는 정도
  const burst = seg(t, PULSE, PULSE + 0.08) * (1 - seg(t, FLASH, END)); // 기둥이 터져 있는 정도
  const out = seg(t, FLASH, END); // 걷힘
  const beat = beatAt(t);

  // ── 영압 기둥 (영혼 뒤): 차오르며 굵어지고, 터질 때 화면 위아래를 꿰뚫는 흰 기둥 → 가늘어지며 사라짐
  const w = (3 + 10 * build + 26 * burst) * Math.pow(1 - out, 1.4); // 걷힐 땐 투명해지는 대신 가늘어진다
  if (build > 0.02 || burst > 0) {
    const hTop = burst > 0 ? TOP : -18 - 30 * build, hBot = burst > 0 ? BOTTOM : 18 + 30 * build;
    const lv = burst > 0 ? 3 : Math.min(2, Math.floor(build * 3)); // 차오를수록 한 칸씩 밝은 색 (반투명 없이)
    const core = C[3 + lv], mid = C[2 + lv], edge = C[1 + lv];
    const a = 1;
    for (let y = Math.floor(hTop); y <= hBot; y++) {
      const fade = burst > 0 ? 1 : Math.sqrt(1 - Math.abs(y) / Math.max(1, y < 0 ? -hTop : hBot));
      const ww = w * (0.85 + 0.15 * n(8, 3, y * 0.3)) * (0.4 + 0.6 * fade);
      if (ww < 0.5) continue;
      p.rect(-ww, y, ww * 2, 1, edge, a);
      p.rect(-ww * 0.62, y, ww * 1.24, 1, mid, a);
      p.rect(-ww * 0.28, y, ww * 0.56, 1, core, a);
    }
    p.glowLine(0, hTop, 0, hBot, w * 1.6, C[3], 0.25 * a);
  }

  // ── 영자 알갱이: 화면 가장자리에서 소용돌이치며 영혼으로 빨려 듦 (고동 동안), 터진 뒤엔 위로 흩날림
  const r = rng(o.seed, 3);
  for (let k = 0; k < 46; k++) {
    const born = ORB + r.range(-0.1, PULSE - ORB - 0.35), life = r.range(0.45, 0.8), ang0 = r.next() * TAU, R0 = r.range(60, 110), spin = r.range(1.2, 2.4) * (k % 2 ? 1 : -1);
    const age = (t - born) / life;
    if (age >= 0 && age < 1) {
      const e = ease.inCubic(age), R = R0 * (1 - e), ang = ang0 + spin * e;
      const x = Math.cos(ang) * R, y = Math.sin(ang) * R * 0.55;
      const c = age > 0.7 ? C[6] : age > 0.35 ? C[5] : C[4];
      p.px(x, y, c);
      if (age > 0.3) p.px(x - Math.cos(ang) * 1.2, y - Math.sin(ang) * 0.7, C[3]);
      p.glow(x, y, 3, C[4], 0.3 * age);
    }
  }
  if (t >= PULSE) {
    const rr = rng(o.seed, 9);
    for (let k = 0; k < 28; k++) {
      const life = rr.range(0.5, 1.0), age = (t - PULSE - rr.range(0, 0.15)) / life, x0 = rr.range(-1, 1) * 18;
      if (age < 0 || age >= 1) continue;
      const x = x0 + Math.sin(age * 6 + k) * 3, y = rr.range(-20, 40) - 60 * age;
      p.px(x, y, age < 0.5 ? C[6] : C[4]);
      p.glow(x, y, 3, C[4], 0.35 * (1 - age));
    }
  }

  // ── 고동 고리: 박자마다 영혼에서 푸른 고리가 퍼짐 (뒤로 갈수록 크고 밝게)
  if (beat.i >= 0) {
    const g = (beat.i + 1) / BEATS;
    const rc = beat.k > 0.5 ? C[5] : beat.k > 0.2 ? C[4] : C[3];
    if (beat.k > 0.06) p.ring(0, 0, 8 + (20 + 40 * g) * ease.outCubic(beat.age), 1 + 1.5 * g * beat.k, rc);
    p.glowRing(0, 0, 8 + (20 + 40 * g) * ease.outCubic(beat.age), 3, C[3], 0.3 * beat.k);
  }

  // ── 영혼 불빛: 나타남 → 박자마다 부풀며 깜빡 → 터질 때 기둥에 녹아 사라짐
  const kSoul = ease.outCubic(seg(t, 0, ORB)) * (1 - seg(t, PULSE - 0.05, PULSE + 0.1));
  if (kSoul > 0) {
    const bob = Math.sin(t * 4) * 1.5, R = 9 * (0.6 + 0.4 * kSoul) * (1 + 0.22 * beat.k);
    p.glow(0, bob, 30 + 14 * beat.k, C[3], 0.4 * kSoul + 0.3 * beat.k);
    const H = [C[6], C[6], C[5], C[5], C[4], C[4], C[3], C[3], C[2]];
    for (const [dx, h, ww, s] of [[-4, 12, 3, 3], [4, 13, 3, 7], [0, 19, 4, 11]]) flameTongue(p, dx, bob - R * 0.4, h * kSoul, ww, 0, n, s, H);
    const hot = beat.k > 0.6; // 박자 순간엔 통째로 하얗게 번쩍
    p.shade(-R - 2, bob - R - 2, R + 2, bob + R + 2, (x, y, px) => {
      const d = Math.hypot(x, y - bob) / (R + 0.6 * n(14, 5, Math.atan2(y - bob, x) * 1.6));
      if (d > 1) return 0;
      px.c = hot ? (d < 0.7 ? C[6] : C[5]) : d < 0.4 ? C[6] : d < 0.66 ? C[5] : d < 0.86 ? C[4] : C[3];
      px.a = kSoul;
    });
  }

  // ── 섬광: 기둥이 터지는 순간 화면 전체 한 번
  const fl = seg(t, PULSE, PULSE + 0.05) * (1 - seg(t, PULSE + 0.05, FLASH + 0.1));
  if (fl > 0) p.rect(-106, TOP, 212, BOTTOM - TOP, WHITE, 0.8 * fl);
}
