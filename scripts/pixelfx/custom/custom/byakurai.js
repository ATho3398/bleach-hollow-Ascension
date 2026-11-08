// 백뢰 (블리치 할로우 어센션 커스텀, GDD 180장): pixelfx lightning/zap-hit 에서 피격 이펙트(맞은 곳 지지직 매듭·탄 자국 고사리·튀는 불꽃·연기·맞은 곳 빛)를 다 빼고,
// 번개 한 줄기만 '펑!' 하고 나가는 것. 원점 = 쏘는 곳(손끝), 앞 = 오른쪽.
// 사용자 2026-11-09 "zap hit에서 피격 이펙트 없애고, 번개 이펙트 1개만 펑! 하는 느낌으로 나가는 이펙트 구현해서 백뢰라고 이름지어."
// 나오는 법: 1장째에 한 줄기가 끝까지 한 번에 뻗고(흰 굵은 줄 + 손끝 흰 번쩍) → 2~3장 깜빡이며 다시 그어짐 → 가늘어지며 사라짐(0.33초).
// 번개 그리기(zigzag·stroke)는 pixelfx lightning/_lib.js (MIT, THIRD_PARTY_NOTICES.md).
import { fit, rng, WHITE } from "../../core/index.js";
import { VOLT, zigzag, stroke } from "../lightning/_lib.js";

// 줄기 길이(px), 번쩍(흰 굵은 줄) 시간, 깜빡임 끝, 사라짐 끝
const LEN = 112, POP = 0.067, FLICK = 0.2, END = 0.33;

export const meta = {
  name: "백뢰",
  desc: "Byakurai (custom): one lightning bolt snaps straight out in a single pop from the fingertip, flickers twice and thins away. No hit effect at the far end.",
  tags: ["custom", "lightning", "electric", "bolt", "projectile", "one-shot"],
  size: [136, 88],
  origin: [12, 44],
  duration: END,
  loop: false,
  fps: 30,
  bg: "dark",
  options: { palette: VOLT, seed: 3 },
};

export function draw(p, t, o) {
  const C = fit(o.palette, 8), f = Math.floor(t * 30 + 1e-4);
  if (t >= END) return;
  // 줄기 모양: 처음 두 장은 같은 모양, 그 뒤 깜빡일 때마다 새로 그어진다(곁가지는 짧게 조금만 — 한 줄기)
  const r = rng(o.seed, 2, f < 2 ? 0 : f), b = zigzag(r, 0, 0, LEN, r.range(-6, 6), 0.3, 0.18);
  // 세기: 펑(1) → 깜빡임(번갈아 0.65/1) → 사라짐
  const k = t < POP ? 1 : t < FLICK ? (f % 2 ? 0.65 : 0.95) : 0.6 * (1 - (t - FLICK) / (END - FLICK));
  const s = t < POP ? 1.25 : t < FLICK ? 0.9 : 0.7;
  stroke(p, b, k, C, s, { hero: t < POP, light: t < POP ? 0.55 : 0.4 });
  // 손끝 펑: 흰 점이 크게 번쩍였다가 오그라든다
  if (t < FLICK) {
    const u = t / FLICK;
    p.circle(0, 0, 4 * (1 - u) + 1, C[6]);
    p.circle(0, 0, 2.5 * (1 - u) + 0.5, WHITE);
    p.glow(0, 0, 18 * (1 - u * 0.5), C[5], 0.7 * (1 - u));
  }
  // 펑 순간 줄기 전체가 한 번 환해진다
  if (t < POP) for (let x = 12; x < LEN; x += 20) p.glow(x, 0, 12, C[6], 0.12);
}
