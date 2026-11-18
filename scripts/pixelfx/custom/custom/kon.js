// 콘 (블리치 할로우 어센션 커스텀 펫): 서 있는 사자 봉제인형 — 주황 몸, 갈색 갈기, 한 팔을 흔든다, 꼬리 끝 술, 가끔 깜빡임.
// 사용자 2026-11-18 "4번 사자인형 펫 추가(이름은 콘)".
import { Grid, shift, H, lit, wave, blink, petMeta } from "./_petkit.js";
export const meta = petMeta("Kon", "A stuffed lion toy stands and waves one paw, its tufted tail swaying, button on its belly.");
const D = meta.duration, G = new Grid(-24, -44, 48, 48);
const K = H("#000000"), OR = [H("#ffc060"), H("#f0a030"), H("#c47a1c")], MANE = [H("#7a4630"), H("#552c1e"), H("#3a1c14")], BEI = [H("#fff0d8"), H("#f0d8b0"), H("#c8a880")], WH = H("#ffffff"), PINK = H("#e88aa0");
export function draw(p, time, o) {
  const t = shift(time, D, o.seed), g = G.clear(), wv = wave(t, D, 4), bob = wave(t, D, 2) > 0.4 ? -1 : 0, tl = wave(t, D, 2, 1);
  // 꼬리(뒤): 가는 줄 + 갈색 술
  g.tube([[-5, -9], [-9, -8 + tl], [-12, -10 + tl * 1.5]], 0.6, OR[2]);
  g.ellipse(-13, -11 + tl * 1.5, 1.8, 1.8, MANE[1]);
  // 다리: 아래로 벌어지는 바지통 + 발(베이지) + 흰 발톱
  for (const s of [-1, 1]) {
    g.poly([[s * 1, -9], [s * 5.5, -9], [s * 7.5, -1], [s * 1.5, -1]], s < 0 ? OR[1] : OR[2]);
    g.shade(Math.min(s * 1.5, s * 7.5), -1, Math.max(s * 1.5, s * 7.5) - 1, -1, () => BEI[1]);
    for (const x of [2.5, 4.5, 6.5]) g.set(Math.floor(s * x - (s < 0 ? 0 : 1)), 0, WH);
  }
  // 몸통 + 가운데 솔기 + 단추
  const by = -14 + bob;
  g.ellipse(0, by, 6.4, 6.8, lit(OR));
  g.line(0, by - 6, 0, by + 6, OR[2]);
  g.ellipse(3.2, by + 1.5, 1.6, 1.6, WH); g.set(3, by + 1, BEI[2]);
  // 팔: 왼쪽은 허리에, 오른쪽은 들어서 흔든다. 손 = 베이지
  g.tube([[-5, by - 3], [-8.5, by + 1]], 1.7, OR[1]); g.ellipse(-9, by + 2, 2, 2, lit(BEI));
  g.tube([[5, by - 3], [9, by - 7 + wv], [10, by - 11 + wv * 1.6]], 1.7, OR[1]); g.ellipse(10.4, by - 12.5 + wv * 1.6, 2.3, 2.3, lit(BEI));
  // 갈기(머리 뒤 뾰족뾰족) → 귀 → 머리
  const hy = -27 + bob;
  for (let i = 0; i < 9; i++) {
    const a = Math.PI * (1 + i / 8), cx = Math.cos(a) * 9.2, cy = hy + 1 + Math.sin(a) * 8.4;
    g.poly([[cx * 0.62, hy + 1 + (cy - hy - 1) * 0.62 - 2], [cx * 1.22, hy + 1 + (cy - hy - 1) * 1.22], [cx * 0.62 + 2.4, hy + 1 + (cy - hy - 1) * 0.62 + 1.6]], i % 2 ? MANE[1] : MANE[0]);
  }
  g.ellipse(0, hy + 0.5, 9.6, 8.2, MANE[1]);
  for (const s of [-1, 1]) { g.poly([[s * 4, hy - 5], [s * 6.5, hy - 9.6], [s * 8, hy - 4]], OR[1]); g.set(Math.floor(s * 6.2 - (s < 0 ? 0 : 1)), hy - 7, PINK); }
  g.ellipse(0, hy + 0.6, 7.8, 6.8, lit(OR));
  // 주둥이(베이지)·코·입, 눈
  g.ellipse(0, hy + 3, 3.4, 2.4, lit(BEI));
  g.set(-1, hy + 2, MANE[2]); g.set(0, hy + 2, MANE[2]); g.set(-1, hy + 4, MANE[1]);
  if (blink(t, D, 1.6)) { g.line(-5, hy - 1, -3, hy - 1, K); g.line(2, hy - 1, 4, hy - 1, K); }
  else { g.shade(-5, hy - 2, -4, hy - 1, () => K); g.shade(3, hy - 2, 4, hy - 1, () => K); g.set(-5, hy - 2, WH); g.set(3, hy - 2, WH); }
  g.outline(K);
  g.draw(p);
}
