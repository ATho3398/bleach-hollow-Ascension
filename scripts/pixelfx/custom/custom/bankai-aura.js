// 만해 오라 (블리치 할로우 어센션 커스텀, GDD 115-A 138): 몸 둘레로 타오르는 영압 기둥. 16프레임 반복(12fps).
// 사용자 2026-11-15 "캐릭별로 만해 오라 찍어야되거든?? 몸 주변에 아우라같은거 나오게하고, 캐릭별로 도트가 다 다르잖아. 캐릭 도트만큼 비우지 말고, 오라 16프레임 도트 애니 만들어줘"
// → 캐릭터 모양을 파내지 않은 통짜 오라(어느 캐릭터 뒤에나 깐다). 색은 palette 로 캐릭터마다 바꾼다(어두움 → 밝음 8단).
// 크기는 이 게임 인형(키 110칸 안팎)에 맞춤: 발 = (0, 0), 폭 약 ±41(발치), 높이 115~180(머리 위로 늘 올라옴). 2026-11-15 19:17 "좋은데 사이즈만 10%정도 줄이자" — 높이 165→148, 폭 46→41.
import { fit, clamp, tileFbm, cycle, TAU } from "../../core/index.js";

const FRAMES = 16, FPS = 12;
export const meta = {
  name: "만해 오라",
  desc: "Bankai aura (custom): a column of spirit pressure burning up round the body, licking tongues, rising streaks, sparks. Not cut out for a character: goes behind any sprite.",
  tags: ["custom", "aura", "power", "flame", "loop"],
  size: [152, 210],
  origin: [76, 197],
  duration: FRAMES / FPS,
  loop: true,
  fps: FPS,
  bg: "dark",
  options: { palette: ["#0b1030", "#17245e", "#2446a0", "#3b78d8", "#6fb4f4", "#b4e2ff", "#e6f7ff", "#ffffff"], seed: 3, height: 148, width: 41 },
};
const D = meta.duration;

// 오라 몸통의 반폭: 발치에서 넓게 퍼졌다가 위로 갈수록 좁아져 끝이 뾰족
function half(h, H, W) {
  if (h < 0) return W * 0.9 * clamp(1 + h / 5);
  const u = clamp(h / H);
  return W * (0.55 + 0.45 * Math.sin(Math.min(1, u * 3.2) * Math.PI * 0.5)) * Math.pow(1 - u, 0.62);
}

export function drawBack(p, t, o) {
  const C = fit(o.palette, 8), S = o.seed, H = o.height, W = o.width, ph = t / D;
  p.glow(0, -H * 0.42, 62, C[3], 0.28);
  p.glow(0, -6, W * 1.5, C[4], 0.3);
  p.shade(-74, -(H + 48), 74, 8, (x, y, out) => {
    const h = -y;
    if (Math.abs(x) > W * 1.25 + 14) return;
    // 위로 흐르는 무늬 두 겹(한 바퀴에 정확히 한 주기·두 주기 올라가 이음매 없음)
    const n1 = tileFbm(x / 15 + 31, y / 17 + ph * 4, 0, 4, S, 3);
    const n2 = tileFbm(x / 7 + 77, y / 9 + ph * 8, 0, 8, S + 9, 2);
    // 가장자리 혀: 세로로 길게 늘인 무늬를 뾰족하게 세워 불길 혀처럼(위로 갈수록 크게). 꼭대기는 x 마다 높이가 달라 여러 갈래로 갈라진다
    const up = clamp(h / H);
    const lick = tileFbm(x / 5.5 + 13, y / 30 + ph * 4, 0, 4, S + 41, 2);
    const tip = tileFbm(x / 9 + 55, ph * 4 + 3, 0, 4, S + 57, 2);
    const Hx = H * (0.92 + 0.22 * tip + 0.06 * n1);
    const w = half(h, Hx, W) * (1 + 0.3 * n1) + (2 + 9 * up) * Math.sign(lick) * Math.pow(Math.abs(lick), 0.7) + 1.6 * n2;
    if (w <= 0.5) return;
    const e = w - Math.abs(x + 4 * n1 * up); // 가장자리에서 안쪽으로 들어온 거리
    if (e < 0) return;
    out.k = 0.25;
    if (e < 1) return C[3];
    if (e < 2.2) return C[6];
    if (e < 3.6 + 1.2 * n2) return C[5];
    if (e < 6.5 + 2.5 * n1) return C[4];
    // 속: 차분한 바탕에 위로 오르는 밝은 줄기
    const s = tileFbm(x / 3.2 + 9, y / 26 + ph * 4, 0, 4, S + 23, 2);
    out.k = 0.1;
    if (s > 0.34) return C[4];
    if (s > 0.2) return C[3];
    return h < 14 ? C[3] : C[2];
  });
  // 발치: 바닥에 퍼지는 밝은 테
  const pulse = 0.5 + 0.5 * Math.sin(ph * TAU * 2);
  p.ellipse(0, 1, W * (0.95 + 0.08 * pulse), 3.2, C[5]);
  p.ellipse(0, 1, W * (0.7 + 0.08 * pulse), 2, C[7]);
  p.glow(0, 0, W * 1.2, C[5], 0.35);
}

export function draw(p, t, o) {
  const C = fit(o.palette, 8), S = o.seed, H = o.height, W = o.width;
  // 뜯겨 올라가는 불티: 옆구리에서 태어나 위로 빨라지며 가늘어진다
  cycle(t, D, 22, S + 5, (g) => g.range(0.45, 0.95) * D, (age, L, g) => {
    const u = age / L, side = g.next() < 0.5 ? -1 : 1, h0 = g.range(8, H * 0.8);
    const x = side * (half(h0, H, W) * g.range(0.75, 1.25) + 2 + 5 * u) + 2.5 * Math.sin(u * 5 + g.next() * 6);
    const y = -(h0 + (22 + 50 * u) * u * g.range(0.7, 1.3));
    const len = Math.round((1 - u) * g.range(2, 5)) + 1, c = u < 0.3 ? C[7] : u < 0.65 ? C[6] : C[4];
    for (let i = 0; i < len; i++) p.px(x, y + i, i === 0 ? c : i < 2 ? C[5] : C[3]);
    if (u < 0.5) p.light(x, y, C[5], 0.5 * (1 - u * 2));
  });
}
