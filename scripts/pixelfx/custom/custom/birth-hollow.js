// 호로 탄생 (블리치 할로우 어센션 커스텀, 첫 시작 탄생 연출을 픽셀 이펙트로): 처음부터 떠 있는 영혼과 인과의 사슬 → 사슬이 찰랑이다가 끝 고리부터
// 타올라 불티로 부서짐 → 다 타면 영혼이 붉게, 검게 물들며 떨다가 '펑' — 검붉은 불꽃이 사방으로 터지며 걷힘(캐릭터 등장). 원점 = 영혼 자리.
// 사용자 2026-11-23 "그 캐릭첨 시작할 때, 사신 호로 애니메이션 있잖아. 그거 픽셀fx 기반으로 다시 만들어줄래?"
// 사용자 2026-11-25 "호로는 쇠사슬이 영혼 안에서 시작되게 하고"
// 사용자 2026-11-25 피드백 "영혼이랑 사슬이 주르륵 생기지 말고, 기본적으로 영혼이랑 사슬은 떠있고, 사슬은 조금씩 찰랑거리면서 끝부터 타오름.
//   다타면 영혼이 빨,검으로 물들면서 펑-하고 시작"
// 불꽃 혀·불티 그리기는 pixelfx fire/_lib.js (MIT — Sprite Fusion fire 레시피, THIRD_PARTY_NOTICES.md).
import { fit, rng, hex, clamp, seg, ease, mix, WHITE, TAU } from "../../core/index.js";
import { flameTongue, noiseFor, ember } from "../fire/_lib.js";
import { blackBurst } from "./_hollowfx.js";

// 단계 시각(초): 떠 있음 0~0.3 · 끝부터 타오름 0.3~2.0 · 물듦·떨림 2.0~2.6 · 펑 2.6 · 걷힘 ~3.4
const BURN0 = 0.3, BURN1 = 2.0, POP = 2.6, END = 3.4;
const LINKS = 7, LINK_H = 9, CHAIN_Y = 1; // 사슬 고리 수·고리 높이·사슬 첫 고리 자리 — 영혼 한가운데에서 시작(첫 고리는 영혼 속, 사용자 11-25 "쇠사슬이 영혼 안에서 시작")

export const meta = {
  name: "호로 탄생",
  desc: "Hollow birth (custom): a floating soul's swaying chain of fate burns up from its end; the soul stains red and black, trembles and bursts in a black-red puff cloud.",
  tags: ["custom", "birth", "soul", "chain", "black-fire", "one-shot", "fullscreen"],
  size: [212, 98],
  origin: [106, 36],
  duration: END,
  loop: false,
  fps: 30,
  bg: "dark",
  options: {
    // 영혼(어두운 → 흰) · 사슬 쇠 · 달군 쇠·불티 · 검붉은 불꽃(심지 → 붉은 테) — 테 색은 호로 테마 강조색(#a03c3d) 계열
    soul: ["#1d2b3a", "#2f5470", "#4f8fb0", "#8cd0e0", "#d8f6ff", "#ffffff"],
    iron: ["#2a2630", "#55505e", "#8d8794", "#c9c3cf"],
    heat: ["#ffffff", "#fff1b0", "#ffc05a", "#f2702a", "#c9361f", "#7a1d18", "#3a1210"],
    black: ["#06040a", "#0e080c", "#1a0c10", "#2a1014", "#4a1418", "#6e1c20", "#a03c3d", "#c8504c", "#d6766e"],
    seed: 4,
  },
};

/** 고리 i 가 타기 시작하는 때 — 맨 끝(아래) 고리부터 위로 */
const burnAt = (i) => BURN0 + ((LINKS - 1 - i) * (BURN1 - BURN0 - 0.25)) / (LINKS - 1);
/** 사슬 찰랑임: 아래 고리일수록 크게 흔들린다 (위 끝은 영혼에 붙어 있음) */
const swayX = (t, i) => (0.2 + 3.6 * (i / (LINKS - 1)) ** 1.3) * Math.sin(t * 3.4 - i * 0.45) + 0.6 * (i / (LINKS - 1)) * Math.sin(t * 7.9 + i);

/** 영혼 불빛. stain = 붉게 물듦(0..1), black = 검게 물듦(0..1), shake = 떨림 세기 */
function soul(p, t, S, B, stain, black, shake, n) {
  const jx = shake ? Math.round(Math.sin(t * 97) * shake) : 0, jy = shake ? Math.round(Math.cos(t * 83) * shake * 0.6) : 0;
  const X = jx, Y = Math.sin(t * 4) * 1.5 + jy, R = 9 + 1.5 * shake;
  // 물드는 색: 푸른 영혼 → 붉음(테마 강조색) → 검정(붉은 테만 남음)
  const col = (i) => {
    const red = mix(S[i], [B[6], B[7], B[7], B[8], B[8], WHITE][i], stain);
    return mix(red, [B[4], B[5], B[7], B[3], B[1], B[0]][i], black); // 검게: 속은 검정, 테는 붉게 남음
  };
  p.glow(X, Y, 30 + 10 * stain, stain > 0.3 ? B[6] : col(3), 0.4 + 0.25 * stain);
  const H = [col(5), col(5), col(4), col(4), col(3), col(3), col(2), col(2), col(1)];
  for (const [dx, h, w, s] of [[-4, 13, 3.2, 3], [4, 14, 3.2, 7], [0, 20, 4, 11]]) flameTongue(p, X + dx, Y - R * 0.4, h * (1 + 0.4 * shake / 2), w, 0, n, s, H);
  p.shade(X - R - 2, Y - R - 2, X + R + 2, Y + R + 2, (x, y) => {
    const d = Math.hypot(x - X, y - Y) / (R + 0.6 * n(14, 5, Math.atan2(y - Y, x - X) * 1.6));
    if (d > 1) return 0;
    return d < 0.4 ? col(5) : d < 0.66 ? col(4) : d < 0.86 ? col(3) : col(2);
  });
  return { X, Y };
}

export function draw(p, t, o) {
  if (t >= END) return;
  const S = fit(o.soul, 6), I = fit(o.iron, 4), HT = fit(o.heat, 7), B = fit(o.black, 9), N = noiseFor(0);
  const n = (rate, seed, off) => N(t, rate, seed, off);
  const appear = seg(t, 0, 0.12); // 첫 장이 툭 켜지지 않게만 아주 짧게

  // ── 1. 사슬: 처음부터 걸려 찰랑임 → 끝 고리부터 달궈져(쇠 → 붉음 → 흰빛) 불꽃이 핥다가 불티로 부서짐
  for (let i = 0; i < LINKS; i++) {
    const tb = burnAt(i), h = seg(t, tb, tb + 0.28), tDie = tb + 0.28;
    const x = swayX(t, i), y = CHAIN_Y + i * (LINK_H - 1) + Math.sin(t * 4) * 1.5; // 영혼과 함께 출렁
    if (t < tDie) {
      const heatIdx = Math.round((1 - h) * 6);
      const c0 = h <= 0 ? I[1] : HT[clamp(heatIdx, 0, 6)], c1 = h <= 0 ? I[3] : HT[clamp(heatIdx - 2, 0, 6)];
      if (i % 2 === 0) {
        p.ellipse(x, y + LINK_H / 2, 3.6, LINK_H / 2, c0, appear);
        p.ellipse(x, y + LINK_H / 2, 1.6, LINK_H / 2 - 2.2, hex("#0b0a10"), appear);
        p.px(x - 3, y + 3, c1), p.px(x - 3, y + 4, c1);
      } else {
        p.rect(x - 1, y, 2, LINK_H, c0, appear);
        p.px(x, y + 2, c1), p.px(x, y + 3, c1);
      }
      if (h > 0) {
        p.glow(x, y + LINK_H / 2, 6 + 7 * h, HT[3], 0.4 * h);
        // 타는 고리를 핥는 작은 불꽃 (위로)
        const FH = [HT[0], HT[1], HT[1], HT[2], HT[2], HT[3], HT[3], HT[4], HT[5]];
        flameTongue(p, x - 1, y + LINK_H - 1, 6 + 8 * h, 2.6, n(2, i, 0) * 2, n, 60 + i, FH);
        flameTongue(p, x + 2, y + LINK_H, 4 + 6 * h, 2, n(2, i, 3) * 2, n, 70 + i, FH);
      }
    } else {
      // 부서져 불티가 위로 흩날림
      const r = rng(o.seed, 40 + i), y0 = y + LINK_H / 2;
      for (let k = 0; k < 12; k++) {
        const life = r.range(0.45, 0.85), age = t - tDie - r.range(0, 0.06);
        const vx = r.range(-16, 16), vy = r.range(-36, -14), ph = r.next(), sz = r.range(0.8, 2.2); // 난수는 건너뛰기 전에
        if (age < 0 || age > life) continue;
        ember(p, x + vx * age + Math.sin(age * 9 + ph * 6) * 2, y0 + vy * age + 10 * age * age, 1 - age / life, sz, [HT[1], HT[2], HT[3], HT[4]], ph * TAU);
      }
    }
  }

  // ── 2. 영혼: 처음부터 떠 있음 → 사슬이 다 타면 붉게, 이어 검게 물들며 점점 세게 떪 → 펑 하고 사라짐
  const stain = ease.inOutSine(seg(t, BURN1 - 0.1, BURN1 + 0.3)), black = ease.inQuad(seg(t, BURN1 + 0.2, POP));
  const shake = 2.2 * ease.inQuad(seg(t, BURN1 + 0.1, POP));
  if (t < POP) {
    if (appear < 1) p.glow(0, 0, 20, S[3], 0.5 * (1 - appear));
    soul(p, t, S, B, stain, black, shake, n);
  }

  // ── 3. 펑: 검은 거품이 부풀었다 터지며 검붉은 불덩이 구름이 사방으로 퍼짐 (공용 blackBurst — 진화 끝 펑과 같은 모양)
  blackBurst(p, t - POP, 0, 0, 1, o.seed);
  // 펑 순간 섬광 (아주 짧게)
  const fl = seg(t, POP, POP + 0.03) * (1 - seg(t, POP + 0.03, POP + 0.22));
  if (fl > 0) p.rect(-106, -36, 212, 98, WHITE, 0.8 * fl);
}
