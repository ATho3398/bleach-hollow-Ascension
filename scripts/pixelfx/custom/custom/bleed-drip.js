// 출혈 (퐁퐁) (블리치 할로우 어센션 커스텀, GDD 180장): 상처에서 피가 지속적으로 퐁퐁 솟는다(반복).
// 사용자 2026-11-04 "출혈 이펙트 추가. 한번에 팍 튀기는거, 지속적으로 퐁퐁 나오는거 한개씩"
// 원점 = 상처. 한 바퀴(1.2초)에 세 번 작게 솟고(맥박), 방울이 위로 퐁 솟았다 떨어지며 사라진다. 상처 자리는 맥박마다 살짝 부푼다.
import { fit, rand } from "../../core/index.js";
import { drop, flashAt } from "./_blood.js";

export const meta = {
  name: "출혈 (퐁퐁)",
  desc: "Bleeding (custom, loop): blood pulses out of the wound in small spurts, three a loop, drops pop up, fall and fade.",
  tags: ["custom", "blood", "bleed", "dot", "status", "loop"],
  size: [84, 128],
  origin: [34, 32],
  duration: 1.2,
  loop: true,
  fps: 30,
  bg: "dark",
  options: { palette: ["#350711", "#5e0c1b", "#931327", "#c71e33", "#f2384a", "#ff8a7a"], seed: 5 },
};

const D = 1.2, PULSES = 3, PER = 6, LIFE = 0.75;

export function draw(p, t, o) {
  const C = fit(o.palette, 6), S = o.seed;
  // 상처: 늘 보이는 작은 핏자국, 맥박마다 부푼다
  for (let k = 0; k < PULSES; k++) {
    const age = (((t - (k * D) / PULSES) % D) + D) % D;
    if (age < 0.1) flashAt(p, C, 0, 0, 0.6 * (1 - age / 0.1));
  }
  const beat = Math.max(...Array.from({ length: PULSES }, (_, k) => {
    const age = (((t - (k * D) / PULSES) % D) + D) % D;
    return age < 0.12 ? 1 - age / 0.12 : 0;
  }));
  p.circle(0, 0, 1.6 + beat * 1.4, C[2], 1);
  p.dot(-0.5, -0.5, C[4], 1);
  // 맥박마다 방울 PER 개: 위·앞으로 퐁 솟아 떨어진다. 이전 바퀴의 방울도 이어 그려 이음매가 없다
  for (let k = 0; k < PULSES; k++)
    for (const lap of [0, -1])
      for (let i = 0; i < PER; i++) {
        const age = t - (k * D) / PULSES - lap * D - rand(S, k, i, 6) * 0.06;
        const ang = -Math.PI / 2 + (rand(S, k, i, 1) - 0.25) * 1.3, sp = 45 + rand(S, k, i, 2) * 55;
        drop(p, C, 0, 0, Math.cos(ang) * sp, Math.sin(ang) * sp, age, LIFE * (0.75 + rand(S, k, i, 3) * 0.25), 1 + rand(S, k, i, 4) * 1.5);
      }
}
