// 호로 탄생 (블리치 할로우 어센션 커스텀, 첫 시작 탄생 연출을 픽셀 이펙트로): 영혼 불빛 → 인과의 사슬이 내려옴 → 사슬이 아래부터 달궈져
// 불티로 부서짐 → 가슴에 구멍이 뚫리며 검은 불꽃이 아래에서 솟아 삼킴 → 섬광 후 걷힘(캐릭터 등장). 원점 = 영혼 자리(화면 가운데 42%).
// 사용자 2026-11-23 "그 캐릭첨 시작할 때, 사신 호로 애니메이션 있잖아. 그거 픽셀fx 기반으로 다시 만들어줄래?"
// 불꽃 혀·불티 그리기는 pixelfx fire/_lib.js (MIT — Sprite Fusion fire 레시피, THIRD_PARTY_NOTICES.md).
import { fit, rng, hex, clamp, seg, ease, mix, WHITE } from "../../core/index.js";
import { flameTongue, noiseFor, ember } from "../fire/_lib.js";

// 단계 시각(초) — 지금 CSS 연출과 같은 길이: 영혼 0.5 · 사슬 0.5 · 타 버림 1.0 · 검은 불꽃 0.8 · 걷힘 0.6
const ORB = 0.5, CHAIN = 1.0, BURN = 2.0, FLAME = 2.8, END = 3.4;
const LINKS = 7, LINK_H = 9, CHAIN_Y = 12; // 사슬 고리 수·고리 높이·영혼에서 사슬이 시작하는 자리
const BOTTOM = 62;
// 검은 불꽃 겹: 붉은 테 → 검붉음 → 거의 검정 → 검은 심지 [폭 비율, 높이 비율, 색 번호(black 팔레트)]
const BLACK_LAYERS = [[1, 1, 7], [0.86, 0.93, 5], [0.66, 0.8, 3], [0.44, 0.62, 1], [0.24, 0.42, 0]]; // 원점에서 화면 아래 끝까지(px)

export const meta = {
  name: "호로 탄생",
  desc: "Hollow birth (custom): a soul with its chain of fate; the chain burns away into embers, a hole opens and black flames swallow it, then a flash.",
  tags: ["custom", "birth", "soul", "chain", "black-fire", "one-shot", "fullscreen"],
  size: [212, 98],
  origin: [106, 36],
  duration: END,
  loop: false,
  fps: 30,
  bg: "dark",
  options: {
    // 영혼(어두운 → 흰) · 사슬 쇠 · 검은 불꽃(심지 → 붉은 테) — 테 색은 호로 테마 강조색(#a03c3d) 계열
    soul: ["#1d2b3a", "#2f5470", "#4f8fb0", "#8cd0e0", "#d8f6ff", "#ffffff"],
    iron: ["#2a2630", "#55505e", "#8d8794", "#c9c3cf"],
    heat: ["#ffffff", "#fff1b0", "#ffc05a", "#f2702a", "#c9361f", "#7a1d18", "#3a1210"],
    black: ["#06040a", "#0e080c", "#1a0c10", "#2a1014", "#4a1418", "#6e1c20", "#a03c3d", "#c8504c", "#d6766e"],
    seed: 4,
  },
};

/** 영혼 불빛: 흰 심지 + 푸른 테 + 위로 흔들리는 짧은 꼬리. k = 보이는 정도, hole = 가슴 구멍(0..1), dark = 검게 물듦(0..1) */
function soul(p, t, k, hole, dark, S, N) {
  if (k <= 0) return;
  const bob = Math.sin(t * 5) * 1.5, R = 9 * (0.6 + 0.4 * k);
  const col = (i) => mix(S[i], hex("#1a0c10"), dark);
  p.glow(0, bob, 30 * k, col(3), 0.4 * k);
  // 꼬리: 위로 서는 혀 셋
  const H = [col(5), col(5), col(4), col(4), col(3), col(3), col(2), col(2), col(1)];
  for (const [dx, h, w, n] of [[-4, 13, 3.2, 3], [4, 14, 3.2, 7], [0, 20, 4, 11]]) flameTongue(p, dx, bob - R * 0.4, h * k, w, 0, N, n, H);
  p.shade(-R - 2, bob - R - 2, R + 2, bob + R + 2, (x, y, out) => {
    const d = Math.hypot(x, y - bob) / (R + 0.6 * N(14, 5, Math.atan2(y - bob, x) * 1.6));
    if (d > 1) return 0;
    if (hole > 0 && d < 0.55 * hole) return hex("#06040a"); // 가슴에 뚫리는 구멍
    out.c = d < 0.4 ? col(5) : d < 0.66 ? col(4) : d < 0.86 ? col(3) : col(2);
    out.a = k;
  });
}

export function draw(p, t, o) {
  if (t >= END) return;
  const S = fit(o.soul, 6), I = fit(o.iron, 4), HT = fit(o.heat, 7), B = fit(o.black, 9), N = noiseFor(0);
  const n = (rate, seed, off) => N(t, rate, seed, off);

  // ── 1. 영혼: 서서히 나타남 → 사슬이 다 타면 구멍이 뚫리고 검게 물들며 불꽃에 삼켜짐
  const kSoul = ease.outCubic(seg(t, 0, ORB));
  const hole = clamp(ease.outBack(seg(t, BURN - 0.1, BURN + 0.25)));
  const dark = seg(t, BURN, FLAME - 0.2);
  const gone = 1 - seg(t, FLAME - 0.12, FLAME + 0.04);
  soul(p, t, kSoul * gone, hole, dark, S, n);

  // ── 2·3. 인과의 사슬: 위에서부터 한 고리씩 떨어져 걸림 → 맨 끝 고리부터 달궈져 불티로 부서짐
  for (let i = 0; i < LINKS; i++) {
    const tIn = ORB + (i * (CHAIN - ORB)) / LINKS, u = seg(t, tIn, tIn + 0.09);
    if (u <= 0) continue;
    const tBurn = CHAIN + ((LINKS - 1 - i) * (BURN - CHAIN - 0.2)) / LINKS, h = seg(t, tBurn, tBurn + 0.22); // 달궈지는 정도
    const tDie = tBurn + 0.22;
    const dy = -(1 - u) * 6; // 툭 떨어져 걸림
    if (t < tDie) {
      const heatIdx = Math.round((1 - h) * 6); // 쇠 → 붉게 → 희게
      const c0 = h <= 0 ? I[1] : HT[clamp(heatIdx, 0, 6)], c1 = h <= 0 ? I[3] : HT[clamp(heatIdx - 2, 0, 6)];
      const y = CHAIN_Y + i * (LINK_H - 1) + dy;
      if (i % 2 === 0) {
        p.ellipse(0, y + LINK_H / 2, 3.6, LINK_H / 2, c0, u);
        p.ellipse(0, y + LINK_H / 2, 1.6, LINK_H / 2 - 2.2, hex("#0b0a10"), u);
        p.px(-3, y + 3, c1), p.px(-3, y + 4, c1);
      } else {
        p.rect(-1, y, 2, LINK_H, c0, u);
        p.px(0, y + 2, c1), p.px(0, y + 3, c1);
      }
      if (h > 0) p.glow(0, y + LINK_H / 2, 6 + 6 * h, HT[3], 0.35 * h);
      if (u < 1) p.glow(0, y + LINK_H / 2, 5, I[3], 0.4 * (1 - u)); // 걸릴 때 '찰칵' 빛
    } else {
      // 부서져 불티가 위로 흩날림
      const r = rng(o.seed, 40 + i), y0 = CHAIN_Y + i * (LINK_H - 1) + LINK_H / 2;
      for (let k = 0; k < 12; k++) {
        const life = r.range(0.45, 0.8), age = t - tDie - r.range(0, 0.06);
        const vx = r.range(-18, 18), vy = r.range(-34, -12), ph = r.next();
        if (age < 0 || age > life) continue;
        const x = vx * age + Math.sin(age * 9 + ph * 6) * 2, y = y0 + vy * age + 10 * age * age;
        ember(p, x, y, 1 - age / life, r.range(0.8, 2.2), [HT[1], HT[2], HT[3], HT[4]], ph * 6.28);
      }
    }
  }

  // ── 4. 검은 불꽃: 아래 끝에서 솟아올라 화면을 삼킴 (붉은 테 + 검은 속), 뒤에는 붉은 열기
  if (t >= BURN - 0.05) {
    const rise = ease.inOutCubic(seg(t, BURN, FLAME));
    const fall = seg(t, FLAME + 0.05, END);
    const H = [...B]; // 심지(검정) → 테(붉음)
    // 아래에서 올라오는 붉은 열기 — 검은 불꽃이 이 빛을 등지고 실루엣으로 보인다
    const glowK = rise * (1 - fall);
    for (let b = 3; b >= 0; b--) {
      // 들쭉날쭉한 위 끝(2px 기둥마다 흔들림) — 반투명 대신 불투명 띠라 도트가 깔끔하다
      const top = (14 + b * 20) * glowK;
      if (top < 1) continue;
      for (let x = -106; x < 106; x += 2) {
        const hh = top * (0.8 + 0.2 * n(2, 30 + b, x * 0.09)) + 3 * n(6, 50 + b, x * 0.2);
        p.rect(x, BOTTOM - hh, 2, hh + 1, B[5 - b]);
      }
    }
    const r = rng(o.seed, 7);
    const cols = 13;
    for (let c = 0; c < cols; c++) {
      const x = -106 + (c + 0.5) * (212 / cols) + r.range(-4, 4);
      const reach = r.range(0.7, 1.05) * (1 - Math.abs(x) / 190); // 가운데가 더 높이 — 영혼(원점)을 넘어 삼킨다
      const hgt = (24 + 86 * reach) * rise * (1 - fall * 0.9);
      flameTongue(p, x, BOTTOM + 2, hgt, r.range(11, 15), n(1.3, c, 0) * 6, n, c * 5 + 1, H, BLACK_LAYERS, 0.8, 2.2);
    }
    // 영혼 자리에서 번지는 어둠의 고리
    const ringU = seg(t, BURN + 0.1, FLAME);
    if (ringU > 0 && ringU < 1) {
      p.ring(0, 0, 4 + 120 * ease.outCubic(ringU), 6 * (1 - ringU) + 1, B[6], 0.8 * (1 - ringU));
      p.glowRing(0, 0, 4 + 120 * ease.outCubic(ringU), 4, B[7], 0.3 * (1 - ringU));
    }
  }

  // ── 5. 걷힘: 하얀 섬광 한 번 → 빠르게 사라짐 (게임은 이때 캐릭터를 톡 튀어나오게 한다)
  const fl = seg(t, FLAME, FLAME + 0.06) * (1 - seg(t, FLAME + 0.06, FLAME + 0.4));
  if (fl > 0) p.rect(-106, -36, 212, 98, WHITE, 0.85 * fl);
}
