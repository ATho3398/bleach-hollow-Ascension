// 방 바닥(걷는 면) 계산 (GDD 95장 A1, C.153): 배경 그림 안의 바닥 다각형 → 장면 좌표, 발 기준점을 바닥 안으로 끌어 놓기.
// 순수 함수라 DOM 없이 테스트한다 (tests/c153.test.ts). 방 물건·캐릭터는 모두 이 함수를 거쳐 놓이므로 새 물건이 생겨도 바닥 밖으로 나가지 않는다.
import type { RoomFloorConfig } from '../../engine/faction';

export type Pt = [number, number];
export interface SceneSize { w: number; h: number }

/** 방 장면의 기준 크기(LCD 844×390 안의 장면). 측정 전·테스트에서 쓴다 */
export const REF_SCENE: SceneSize = { w: 628, h: 296 };
/** 이름표·여백을 뺀 기본 높이 (물건 그림 아래 → 이름표 아래 끝, px). 실제 값은 화면에서 잰다 */
export const REF_LIFT = 26;

/** 배경 그림(cover·가운데 맞춤) 위의 점(그림 대비 0~1) → 장면 px */
export function imageToScenePx(p: Pt, scene: SceneSize, aspect: number): Pt {
  const wide = scene.w / scene.h >= aspect;
  const dw = wide ? scene.w : scene.h * aspect;
  const dh = wide ? scene.w / aspect : scene.h;
  return [(scene.w - dw) / 2 + p[0] * dw, (scene.h - dh) / 2 + p[1] * dh];
}

/** 바닥 다각형 (장면 px) */
export function floorPolyPx(floor: RoomFloorConfig, scene: SceneSize): Pt[] {
  return floor.poly.map((p) => imageToScenePx(p, scene, floor.aspect));
}

/** 점이 다각형 안(경계 포함)인가 */
export function insidePoly(pt: Pt, poly: readonly Pt[]): boolean {
  const eps = 1e-6;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    if (distToSeg(pt, a, b).d < eps) return true;
  }
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function distToSeg(p: Pt, a: Pt, b: Pt): { d: number; q: Pt } {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  const q: Pt = [a[0] + t * dx, a[1] + t * dy];
  return { d: Math.hypot(p[0] - q[0], p[1] - q[1]), q };
}

/** 점을 다각형 안으로: 안이면 그대로, 밖이면 가장 가까운 경계점 (오목 다각형도 된다) */
export function clampToPoly(pt: Pt, poly: readonly Pt[]): Pt {
  if (insidePoly(pt, poly)) return pt;
  let best: Pt = poly[0]!;
  let bd = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const { d, q } = distToSeg(pt, poly[i]!, poly[(i + 1) % poly.length]!);
    if (d < bd) { bd = d; best = q; }
  }
  return best;
}

export interface FootOpts {
  /** 그림 아래 가운데 → 이름표 아래 끝(또는 그림 몸 아래) px: 발이 이만큼 위에 있어야 장면 밖으로 안 나온다 */
  below?: number;
  /** 좌우 여백 px (그림 폭의 절반): 그림이 장면 가로로 삐져나오지 않게 */
  padX?: number;
  /** 윗쪽 여백 px (그림 높이): 0 이면 안 쓴다 */
  padTop?: number;
}

/** 발 기준점(장면 %)을 바닥 안으로 끌어 놓은 점(장면 %). 먼저 장면·여백 안으로 모은 뒤 바닥 다각형 안으로 */
export function footOnFloor(foot: { x: number; y: number }, floor: RoomFloorConfig, scene: SceneSize = REF_SCENE, o: FootOpts = {}): { x: number; y: number } {
  const poly = floorPolyPx(floor, scene);
  const below = o.below ?? 0;
  const padX = Math.min(o.padX ?? 0, scene.w / 2);
  let p: Pt = [(foot.x / 100) * scene.w, (foot.y / 100) * scene.h];
  p = [Math.min(Math.max(p[0], padX), scene.w - padX), Math.min(Math.max(p[1], 0), scene.h - below)];
  p = clampToPoly(p, poly);
  // 다각형 경계로 끌려 온 점이 아래 여백을 넘었으면 위로 (다각형 아래 변은 장면 아래 끝이라 가로로만 어긋나지 않는다)
  p = [Math.min(Math.max(p[0], padX), scene.w - padX), Math.min(p[1], scene.h - below)];
  return { x: (p[0] / scene.w) * 100, y: (p[1] / scene.h) * 100 };
}

/** 발이 바닥 안(경계 포함, 오차 허용)인가 */
export function isFootOnFloor(foot: { x: number; y: number }, floor: RoomFloorConfig, scene: SceneSize = REF_SCENE, tol = 0.01): boolean {
  const poly = floorPolyPx(floor, scene);
  const p: Pt = [(foot.x / 100) * scene.w, (foot.y / 100) * scene.h];
  return insidePoly(p, poly) || distToPoly(p, poly) <= tol;
}

function distToPoly(p: Pt, poly: readonly Pt[]): number {
  let bd = Infinity;
  for (let i = 0; i < poly.length; i++) bd = Math.min(bd, distToSeg(p, poly[i]!, poly[(i + 1) % poly.length]!).d);
  return bd;
}
