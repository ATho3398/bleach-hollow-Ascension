// 주먹 펑 공용 (블리치 할로우 어센션 커스텀, GDD 180장): 불꽃 대신 묵직하게 한 번 '펑'.
// 사용자 2026-11-04 "트러스트랑 어퍼컷 전부 뭔가 불꽃이 튀는듯한 이펙트잖아. 주먹질처럼 좀 묵직하게 펑 한번 터지는 이펙트가 나을거같아"
// 눌린 흰 덩이 번쩍(2장) → 두꺼운 충격 고리가 짧게 퍼지며 얇아짐 → 굵은 세모 쐐기가 튀어나왔다 들어감. 불꽃·별·구름 없음(03:1x "커스텀 주먹질에 구름같은거 없애").
import { clamp, ease, smooth, rand, TAU, WHITE } from "../../core/index.js";

/** 맞은 뒤 q 초. size 크기 배율, bias = 앞(+x) 쪽으로 쏠림 0~1, seed 흙먼지·쐐기 흔들기 */
export function punch(p, C, x, y, q, size = 1, bias = 0, seed = 1) {
  if (q < 0 || q > 0.25) return;
  const s = size;
  // 굵은 충격 고리 (짧게 퍼지고 빨리 얇아진다)
  if (q > 0.02 && q < 0.22) {
    const k = (q - 0.02) / 0.2, rx = (10 + 13 * ease.outCubic(k)) * s, th = Math.max(1, (7 * (1 - k) ** 1.5 + 1) * s);
    const col = k < 0.25 ? WHITE : k < 0.6 ? C[5] : C[4];
    p.circle(x + bias * 4 * k * s, y, rx, (d) => (d > 1 - 1.2 / rx ? C[2] : col), (d) => (d > 1 - th / rx ? 1 : 0));
  }
  // 굵은 세모 쐐기 5개: 튀어나왔다 들어간다 (bias 면 앞쪽으로 모인다)
  if (q < 0.14) {
    const out = ease.outQuad(clamp(q / 0.04)) * (1 - smooth(0.05, 0.14, q));
    for (let i = 0; i < 5; i++) {
      const a = ((i / 5) * TAU + 0.3 + (rand(seed, i, 1) - 0.5) * 0.5) * (1 - bias * 0.6);
      const r0 = 12 * s, L = (9 + rand(seed, i, 2) * 6) * s * out, hw = 3 * s, ca = Math.cos(a), sa = Math.sin(a);
      for (let d = 0; d <= L; d += 0.5) {
        const half = hw * (1 - d / (L + 0.01));
        for (let w = -half; w <= half; w += 0.5) p.dot(x + ca * (r0 + d) - sa * w, y + sa * (r0 + d) + ca * w, d < L * 0.5 ? WHITE : C[5], 1);
      }
    }
  }
  // 가운데 흰 덩이: 옆으로 납작하게 눌린 채 번쩍(2장 꽉 찬 흰색) → 밝은 색으로 줄어든다
  if (q < 0.13) {
    const r = (10 + 4 * ease.outQuad(clamp(q / 0.03))) * s * (1 - 0.75 * smooth(0.04, 0.13, q));
    const blob = (rr, c) => p.shade(x - rr * 1.25, y - rr, x + rr * 1.25, y + rr, (px, py, o) => {
      const dx = (px - x) / 1.25, dy = py - y;
      if (dx * dx + dy * dy > rr * rr) return;
      o.c = c;
    });
    blob(r + 1, C[1]);
    blob(r, q < 0.04 ? WHITE : q < 0.08 ? C[6] : C[5]);
  }
  p.glow(x, y, 32 * s, C[4], 0.7 * (1 - clamp(q / 0.25)));
}
