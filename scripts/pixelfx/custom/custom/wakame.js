// 미역대사 (블리치 할로우 어센션 커스텀 펫): 울퉁불퉁한 초록 미역 몸에 흰 머리띠, 치켜뜬 눈썹, 허리에 손, 다리를 벌리고 당당히 서 있다. 몸을 살짝 들썩이고 가끔 깜빡임.
// 사용자 2026-11-18 "펫으로 얘도 추가"(쿠치키 가문 미역대사 그림).
import { Grid, shift, H, lit, wave, blink, petMeta } from "./_petkit.js";
export const meta = petMeta("Wakame Ambassador", "A lumpy green seaweed mascot with a white headband stands proud, hands on hips, legs wide, bobbing and blinking.");
const D = meta.duration, G = new Grid(-24, -44, 48, 48);
const K = H("#000000"), GR = [H("#2f8f78"), H("#17705c"), H("#0e4f42")], SK = [H("#ffd2b0"), H("#f0b48e"), H("#c88a68")], WH = [H("#ffffff"), H("#f7e6dc"), H("#c9b4bc")];
// 몸 가장자리의 둥근 혹들 (가운데 x, y, 반지름)
const LUMPS = [[0, -36, 5], [-6, -33.5, 4.5], [6, -33.5, 4.5], [-9.5, -28, 4.5], [9.5, -28, 4.5], [-10.5, -22, 4.5], [10.5, -22, 4.5], [-9, -16.5, 4.5], [9, -16.5, 4.5], [-5, -12.5, 4.2], [5, -12.5, 4.2], [0, -11, 4.2]];
export function draw(p, time, o) {
  const t = shift(time, D, o.seed), g = G.clear(), bob = wave(t, D, 2) > 0.2 ? -1 : 0;
  // 다리: 벌려 선 가는 다리 + 큰 발
  for (const s of [-1, 1]) {
    g.tube([[s * 3.5, -11 + bob], [s * 9, -2]], 1.3, SK[1]);
    g.ellipse(s * 10.5, -1.2, 3.4, 1.8, lit(SK));
  }
  // 팔: 허리에 손 (팔꿈치가 밖으로 뾰족)
  for (const s of [-1, 1]) g.tube([[s * 9, -25 + bob], [s * 17, -20 + bob], [s * 10, -15 + bob]], 1.2, SK[1]);
  // 몸: 가장자리 혹 여러 개 + 가운데는 한 색
  const by = bob;
  for (const [x, y, r] of LUMPS) g.ellipse(x, y + by, r, r, lit(GR));
  g.ellipse(0, -23.5 + by, 9.5, 11.5, GR[1]);
  // 흰 머리띠 + 오른쪽 매듭
  g.shade(-8, -34 + by, 7, -33 + by, (x, y) => (y < -33.5 + by ? WH[0] : WH[1]));
  g.poly([[7, -35 + by], [12, -37 + by], [12, -32.5 + by]], WH[1]);
  // 눈썹(치켜뜸)·눈·코·입
  g.line(-5, -31 + by, -2, -29.6 + by, K); g.line(4, -31 + by, 1, -29.6 + by, K);
  if (blink(t, D, 1.4)) { g.set(-4, -27 + by, K); g.set(-3, -27 + by, K); g.set(2, -27 + by, K); g.set(3, -27 + by, K); }
  else { g.shade(-4, -28 + by, -3, -27 + by, () => K); g.shade(2, -28 + by, 3, -27 + by, () => K); g.set(-4, -28 + by, WH[0]); g.set(2, -28 + by, WH[0]); }
  g.set(-1, -25 + by, GR[2]); g.set(0, -25 + by, GR[2]); g.set(0, -24 + by, GR[2]);
  g.line(-1, -22 + by, 2, -22.6 + by, GR[2]);
  // 아랫배 주름
  for (const x of [-3, 0, 3]) g.line(x, -15 + by, x, -13 + by, GR[2]);
  g.outline(K);
  g.draw(p);
}
