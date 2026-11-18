// 블록 아이콘 공용 (블리치 할로우 어센션 커스텀): 48×48 정지 아이콘을 pixelfx 화가(Painter)로 그릴 때 쓰는 곡선·모양 도우미.
// 사용자 2026-11-19 "여기선 무조건 픽셀 fx기반으로 뽑아" — 블록 아이콘은 전부 pixelfx 이펙트(custom/icon-*)의 한 프레임이다.
/** 2차 곡선을 점 n+1개로 */
export const bez = (p0, p1, p2, n = 160) => Array.from({ length: n + 1 }, (_, i) => {
  const t = i / n, a = (1 - t) ** 2, b = 2 * (1 - t) * t, c = t * t;
  return [a * p0[0] + b * p1[0] + c * p2[0], a * p0[1] + b * p1[1] + c * p2[1]];
});
/** 곡선에서 가장 가까운 점: t(0..1), s(부호 있는 수직 거리, 진행 방향 오른쪽 +) */
export function along(curve, x, y) {
  let bi = 0, bd = 1e9;
  for (let i = 0; i < curve.length; i++) {
    const d = (x - curve[i][0]) ** 2 + (y - curve[i][1]) ** 2;
    if (d < bd) (bd = d), (bi = i);
  }
  const a = curve[Math.max(0, bi - 1)], b = curve[Math.min(curve.length - 1, bi + 1)], tx = b[0] - a[0], ty = b[1] - a[1], l = Math.hypot(tx, ty) || 1;
  return { t: bi / (curve.length - 1), s: ((x - curve[bi][0]) * -ty + (y - curve[bi][1]) * tx) / l, x: curve[bi][0], y: curve[bi][1] };
}
/** 모양(안쪽이면 색 번호, 밖이면 0) 둘레에 1px 어두운 테를 두르고 칠한다 */
export function inked(p, fn, ink, r = 24) {
  p.shade(-r, -r, r, r, (x, y) => fn(x, y) || (fn(x - 1, y) || fn(x + 1, y) || fn(x, y - 1) || fn(x, y + 1) ? ink : 0));
}
export const rrect = (x, y, x0, y0, x1, y1, r) => {
  const cx = Math.min(Math.max(x, x0 + r), x1 - r), cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return x >= x0 && x <= x1 && y >= y0 && y <= y1 && (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
};
export const capsule = (x, y, a, b, r) => {
  const vx = b[0] - a[0], vy = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * vx + (y - a[1]) * vy) / (vx * vx + vy * vy)));
  return Math.hypot(x - a[0] - t * vx, y - a[1] - t * vy) <= r;
};
export const ICON_META = { size: [48, 48], origin: [24, 24], duration: 0.2, loop: true, fps: 10, bg: "none" };
