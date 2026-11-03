// 출혈 (팍) (블리치 할로우 어센션 커스텀, GDD 180장): 맞는 순간 피가 한번에 팍 튄다.
// 사용자 2026-11-04 "출혈 이펙트 추가. 한번에 팍 튀기는거, 지속적으로 퐁퐁 나오는거 한개씩"
// 원점 = 상처(맞는 곳). 앞(오른쪽 = 맞은 반대쪽)으로 부채꼴로 튀고, 큰 방울 몇 개는 느리게, 떨어지며 성기게 사라진다. 0.75초.
import { fit, rand, ease, clamp } from "../../core/index.js";
import { drop, flashAt } from "./_blood.js";

export const meta = {
  name: "출혈 (팍)",
  desc: "Blood burst (custom): a spray of blood bursts out in one go from the wound, fans forward, falls and fades.",
  tags: ["custom", "blood", "bleed", "hit", "impact", "spray", "one-shot"],
  size: [172, 146],
  origin: [36, 44],
  duration: 0.75,
  loop: false,
  fps: 30,
  bg: "dark",
  options: { palette: ["#350711", "#5e0c1b", "#931327", "#c71e33", "#f2384a", "#ff8a7a"], seed: 7 },
};

const N = 30, BIG = 6;

export function draw(p, t, o) {
  const C = fit(o.palette, 6), S = o.seed;
  // 터지는 순간: 상처 자리 핏덩이가 부풀었다 꺼진다
  const pop = clamp(t / 0.12);
  if (pop < 1) p.circle(0, 0, 5 * ease.outQuad(pop) * (1 - pop) + 1, C[3], 1);
  flashAt(p, C, 0, 0, 1 - t / 0.15);
  // 작은 방울: 앞쪽 부채꼴(위로 조금 더), 빠르게
  for (let i = 0; i < N; i++) {
    const ang = -0.95 + rand(S, i, 1) * 1.35, sp = 90 + rand(S, i, 2) * 150, life = 0.4 + rand(S, i, 3) * 0.3;
    drop(p, C, 0, 0, Math.cos(ang) * sp, Math.sin(ang) * sp, t - rand(S, i, 4) * 0.04, life, 1 + rand(S, i, 5) * 1.6);
  }
  // 큰 방울: 느리고 무겁게
  for (let i = 0; i < BIG; i++) {
    const ang = -0.7 + rand(S, i, 11) * 0.9, sp = 45 + rand(S, i, 12) * 55;
    drop(p, C, 0, 0, Math.cos(ang) * sp, Math.sin(ang) * sp, t - 0.02, 0.6 + rand(S, i, 13) * 0.12, 3 + rand(S, i, 14) * 1.2);
  }
}
