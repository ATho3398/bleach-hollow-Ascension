// 주먹 펑 (블리치 할로우 어센션 커스텀, GDD 180장): 주먹질처럼 묵직하게 한 번 '펑' 터지는 타격. 불꽃·별 없음. 0.55초. 원점 = 맞는 곳.
// 사용자 2026-11-04 "주먹질처럼 좀 묵직하게 펑 한번 터지는 이펙트가 나을거같아. 커스텀으로 구현해봐"
import { fit } from "../../core/index.js";
import { punch } from "./_punch.js";

export const meta = {
  name: "주먹 펑",
  desc: "Heavy punch (custom): a white blob flashes, a thick shock ring rolls out, chunky wedges jab out and dust puffs drift away. No sparks.",
  tags: ["custom", "impact", "punch", "hit", "heavy", "one-shot"],
  size: [104, 96],
  origin: [52, 48],
  duration: 0.5,
  loop: false,
  fps: 30,
  bg: "dark",
  options: { palette: ["#2a1608", "#6b3c10", "#b8701a", "#f0b42e", "#ffe27a", "#fff6cf", "#ffffff"], seed: 4 },
};

export function draw(p, t, o) {
  punch(p, fit(o.palette, 7), 0, 0, t, 1, 0, o.seed);
}
