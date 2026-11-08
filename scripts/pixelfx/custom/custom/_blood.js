// 출혈 이펙트 공용 (블리치 할로우 어센션 커스텀, GDD 180장): 핏방울 하나를 시각으로 그린다(시뮬레이션 없이 식으로 — 반복이 이음매 없이 돈다).
import { clamp, smooth } from "../../core/index.js";

// 핏방울이 떨어지는 힘(px/s²)
export const G = 520;

/** 방울 하나: (x0, y0)에서 (vx, vy)로 튀어 age 초 지난 자리. life 끝 40% 동안 점점 성기게 사라진다. size 1~4 */
export function drop(p, C, x0, y0, vx, vy, age, life, size) {
  if (age < 0 || age > life) return;
  const x = x0 + vx * age, y = y0 + vy * age + 0.5 * G * age * age;
  const a = 1 - smooth(life * 0.6, life, age);
  const svy = vy + G * age;
  // 빠를 때 꼬리(움직인 자국)
  const sp = Math.hypot(vx, svy);
  if (sp > 90) p.line(x - (vx / sp) * Math.min(6, sp * 0.02), y - (svy / sp) * Math.min(6, sp * 0.02), x, y, C[2], a * 0.9);
  if (size <= 1.2) {
    p.dot(x, y, C[3], a);
    return;
  }
  const r = size / 2;
  // 몸 + 왼쪽 위 빛 한 점 + 오른쪽 아래 어두운 테
  p.circle(x, y, r + 0.4, (d, ang) => (d > 0.7 && Math.cos(ang - 0.8) > 0.3 ? C[1] : C[3]), a);
  if (size >= 2.5) p.dot(x - r * 0.4, y - r * 0.4, C[5], a);
}

/** 상처 자리의 짧은 붉은 번쩍 (k 0~1) */
export function flashAt(p, C, x, y, k) {
  if (k <= 0) return;
  p.glow(x, y, 14 * clamp(k), C[4], 0.55 * k);
}
