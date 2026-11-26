// 호로 연출 공용 (블리치 할로우 어센션 커스텀, 앞의 _ = 도구 목록에 안 뜸): 검붉은 '펑' — 탄생 끝·진화 끝에 같이 쓴다.
// 사용자 2026-11-25 "호로 사슬 다 타서 터질 때, 뾰족한 산같은 이펙트 말고 다른거로 바꿔" → 뾰족한 불꽃 날 대신 둥근 폭발:
// 검은 거품(붉은 테)이 순간 부풀었다 터지며 → 검붉은 불덩이 구름이 사방으로 퍼져 검은 연기로 식고 → 충격 고리·불티.
// 불덩이(firePuff)·불티(ember)는 pixelfx fire/_lib.js (MIT — Sprite Fusion fire 레시피, THIRD_PARTY_NOTICES.md).
import { rng, hex, seg, ease, fly, TAU } from "../../core/index.js";
import { firePuff, ember } from "../fire/_lib.js";

/** 뜨거운 쪽 먼저: 붉게 달아오른 불덩이가 검붉음 → 검은 연기로 식는 색 */
export const HOT = ["#ffd2c4", "#f0a090", "#d6766e", "#c8504c", "#a03c3d", "#6e1c20", "#4a1418", "#2a1014", "#1a0c10"].map(hex);
/** 처음부터 검은 불덩이 (속을 검게 채워 '검은 불꽃' 느낌) */
export const DARK = ["#c8504c", "#a03c3d", "#6e1c20", "#4a1418", "#2a1014", "#1a0c10", "#0e080c", "#06040a", "#06040a"].map(hex);

/**
 * 검붉은 펑. age = 터진 뒤 지난 초(음수면 안 그림), (x, y) = 터지는 자리, size = 크기 배율(1 = 탄생, 진화는 더 크게).
 * 대략 1.1초 뒤 다 사라진다.
 */
export function blackBurst(p, age, x, y, size = 1, seed = 1) {
  if (age < 0 || age > 1.3) return;
  // 1. 검은 거품: 0.12초 동안 붉은 테를 두르고 부풀었다가 터짐
  const bub = seg(age, 0, 0.12), popped = seg(age, 0.12, 0.2);
  if (popped < 1) {
    const R = (6 + 14 * ease.outCubic(bub)) * size * (1 + 0.3 * popped);
    p.glow(x, y, R * 2.2, HOT[4], 0.5 * (1 - popped));
    p.circle(x, y, R + 2, HOT[3], 1 - popped);
    p.circle(x, y, R, DARK[7], 1 - popped);
  }
  // 2. 불덩이 구름: 거품 가장자리에서 사방으로 튀어 나가 감속하며 식음 (바깥 붉은 덩이 + 안쪽 검은 덩이)
  const a0 = age - 0.1;
  if (a0 > 0) {
    const r = rng(seed, 21);
    for (let k = 0; k < 34; k++) {
      const a = (k / 34) * TAU + r.range(-0.15, 0.15), v = r.range(85, 175) * size, life = r.range(0.55, 1.05), dark = k % 3 === 0;
      const ag = a0 - r.range(0, 0.06), sz = r.range(4, 7.5) * size, frac = r.next(); // 난수는 건너뛰기 전에 다 뽑는다(장마다 같은 알갱이)
      if (ag < 0 || ag > life) continue;
      const [px, py] = fly(x, y, Math.cos(a) * v, Math.sin(a) * v * 0.75, ag, -18, 2.2);
      firePuff(p, px, py, 1 - ag / life, sz, frac, dark ? DARK : HOT, 0.12);
    }
    // 가운데에 남아 천천히 오르는 검은 연기 덩이
    for (let k = 0; k < 8; k++) {
      const life = r.range(0.8, 1.15), ag = a0 - r.range(0, 0.1), ox = r.range(-6, 6) * size, oy = r.range(-4, 4) * size, vx = r.range(-14, 14), vy = r.range(-30, -10), sz = r.range(5, 8) * size;
      if (ag < 0 || ag > life) continue;
      const [px, py] = fly(x + ox, y + oy, vx, vy, ag, 0, 1.5);
      firePuff(p, px, py, 1 - ag / life, sz, 0.5, DARK, 0.1);
    }
  }
  // 3. 충격 고리 둘
  for (const [d, w, c] of [[0.08, 3, HOT[2]], [0.18, 2, HOT[5]]]) {
    const u = seg(age, d, d + 0.55);
    if (u > 0 && u < 1) p.ring(x, y, (8 + 125 * ease.outCubic(u)) * Math.min(1.2, size), w * (1 - u) + 1, c);
  }
  // 4. 불티 흩뿌림
  const re = rng(seed, 13);
  for (let k = 0; k < 36; k++) {
    const a = re.next() * TAU, v = re.range(60, 160) * size, life = re.range(0.35, 0.75), ag = age - 0.1 - re.range(0, 0.05), sz = re.range(1, 2.4);
    if (ag < 0 || ag > life) continue;
    ember(p, x + Math.cos(a) * v * ag, y + Math.sin(a) * v * ag * 0.75 + 20 * ag * ag, 1 - ag / life, sz, [HOT[0], HOT[2], HOT[3], HOT[4]], k);
  }
}
