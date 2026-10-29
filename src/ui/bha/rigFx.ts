// 종이인형 이펙트 그리기 (GDD 115-A 48): 동작의 fx 키(pose.ts fxAt) → SVG(시험 페이지·편집기·paperdoll) / 캔버스(게임 rigAnim).
// 베기 궤적 = 빠르게 그어졌다가 사라지는 띠, 폭발 = 커지며 사라지는 원, 바닥 고리 = 납작한 고리, 기둥 = 위로 솟는 빛기둥. 색은 그림 데이터.
import type { FxDraw, Vec2 } from '../../data/art/rig/pose';

/** 진행 u → (드러난 비율, 불투명도): 앞 30% 동안 그어지고 나머지 동안 사라진다 */
export function fxPhase(u: number): { reveal: number; alpha: number } {
  return { reveal: Math.min(1, u / 0.3), alpha: u < 0.3 ? 1 : Math.max(0, 1 - (u - 0.3) / 0.7) };
}

const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/** 꺾은선을 앞에서부터 reveal 비율만큼 */
function partial(pts: Vec2[], reveal: number): Vec2[] {
  if (pts.length < 2) return pts;
  const seg = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i]![0], p[1] - pts[i]![1]));
  let left = seg.reduce((a, b) => a + b, 0) * reveal;
  const out: Vec2[] = [pts[0]!];
  for (let i = 0; i < seg.length; i++) {
    if (left >= seg[i]!) { out.push(pts[i + 1]!); left -= seg[i]!; continue; }
    out.push(lerp(pts[i]!, pts[i + 1]!, left / Math.max(1e-6, seg[i]!)));
    break;
  }
  return out;
}

/** SVG 조각(좌표 = 도트 × k). 원점 = 캔버스 (0,0) */
export function fxSvg(draws: FxDraw[], k: number): string {
  const P = (p: Vec2) => `${(p[0] + 0.5) * k},${(p[1] + 0.5) * k}`;
  return draws.map((d) => {
    const { reveal, alpha } = fxPhase(d.u);
    const w = (d.w ?? 2) * k;
    const core = d.core ?? '#ffffff';
    if (d.kind === 'slash') {
      const pts = partial(d.pts, reveal).map(P).join(' ');
      return `<polyline points="${pts}" fill="none" stroke="${d.color}" stroke-width="${w}" stroke-linecap="round" opacity="${alpha * 0.85}"/>`
        + `<polyline points="${pts}" fill="none" stroke="${core}" stroke-width="${Math.max(1, w * 0.35)}" stroke-linecap="round" opacity="${alpha}"/>`;
    }
    const c = d.pts[0]!;
    const r = (d.r ?? 8) * k;
    const e = 1 - (1 - d.u) * (1 - d.u);
    if (d.kind === 'burst') {
      return `<circle cx="${(c[0] + 0.5) * k}" cy="${(c[1] + 0.5) * k}" r="${r * e}" fill="${d.color}" opacity="${(1 - d.u) * 0.6}"/>`
        + `<circle cx="${(c[0] + 0.5) * k}" cy="${(c[1] + 0.5) * k}" r="${r * e * 0.9}" fill="none" stroke="${core}" stroke-width="${Math.max(1, w * 0.5)}" opacity="${1 - d.u}"/>`;
    }
    if (d.kind === 'ring') {
      return `<ellipse cx="${(c[0] + 0.5) * k}" cy="${(c[1] + 0.5) * k}" rx="${r * e}" ry="${r * e * 0.28}" fill="none" stroke="${d.color}" stroke-width="${w}" opacity="${1 - d.u}"/>`;
    }
    // pillar: pts[0] = 바닥 가운데, pts[1] = 꼭대기 (위로 솟음)
    const top = d.pts[1] ?? [c[0], c[1] - 40];
    const h = (c[1] - top[1]) * k * Math.min(1, d.u / 0.35);
    const ww = w * (1 - d.u * 0.6);
    return `<rect x="${(c[0] + 0.5) * k - ww / 2}" y="${(c[1] + 0.5) * k - h}" width="${ww}" height="${h}" fill="${d.color}" opacity="${(1 - d.u) * 0.7}"/>`
      + `<rect x="${(c[0] + 0.5) * k - ww / 6}" y="${(c[1] + 0.5) * k - h}" width="${ww / 3}" height="${h}" fill="${core}" opacity="${(1 - d.u) * 0.9}"/>`;
  }).join('');
}

/** 캔버스에 그리기. toPx = 도트 좌표 → 캔버스 픽셀, k = 1도트 픽셀 */
export function drawFxCanvas(ctx: CanvasRenderingContext2D, draws: FxDraw[], toPx: (p: Vec2) => Vec2, k: number): void {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (const d of draws) {
    const { reveal, alpha } = fxPhase(d.u);
    const w = (d.w ?? 2) * k;
    const core = d.core ?? '#ffffff';
    const e = 1 - (1 - d.u) * (1 - d.u);
    const r = (d.r ?? 8) * k;
    const c = toPx([d.pts[0]![0] + 0.5, d.pts[0]![1] + 0.5]);
    ctx.lineCap = 'round';
    if (d.kind === 'slash') {
      const pts = partial(d.pts, reveal).map((p) => toPx([p[0] + 0.5, p[1] + 0.5]));
      for (const [col, ww, a] of [[d.color, w, alpha * 0.85], [core, Math.max(1, w * 0.35), alpha]] as const) {
        ctx.globalAlpha = a; ctx.strokeStyle = col; ctx.lineWidth = ww;
        ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke();
      }
    } else if (d.kind === 'burst') {
      ctx.globalAlpha = (1 - d.u) * 0.6; ctx.fillStyle = d.color;
      ctx.beginPath(); ctx.arc(c[0], c[1], r * e, 0, Math.PI * 2); ctx.fill();
    } else if (d.kind === 'ring') {
      ctx.globalAlpha = 1 - d.u; ctx.strokeStyle = d.color; ctx.lineWidth = w;
      ctx.beginPath(); ctx.ellipse(c[0], c[1], r * e, r * e * 0.28, 0, 0, Math.PI * 2); ctx.stroke();
    } else {
      const top = toPx(d.pts[1] ?? [d.pts[0]![0], d.pts[0]![1] - 40]);
      const h = (c[1] - top[1]) * Math.min(1, d.u / 0.35);
      const ww = w * (1 - d.u * 0.6);
      ctx.globalAlpha = (1 - d.u) * 0.7; ctx.fillStyle = d.color; ctx.fillRect(c[0] - ww / 2, c[1] - h, ww, h);
      ctx.globalAlpha = (1 - d.u) * 0.9; ctx.fillStyle = core; ctx.fillRect(c[0] - ww / 6, c[1] - h, ww / 3, h);
    }
  }
  ctx.restore();
}
