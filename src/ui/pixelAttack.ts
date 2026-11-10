// 블록 도트 이펙트 계획 (이펙트 배치 도구 확정 값 → 게임, 사용자 2026-11-04 "ㅇㅋ 넣어"): DOM 없는 순수 함수라 단위 테스트한다.
// 한 블록(체인 단계) 설정 → 타격 시각 · 이펙트 조각(타격마다 바꾼 값 반영, 시작 시각, 날아감) · 맞음 반응 시각(투사체면 도착) · 몸동작 시작.
// 도구(scripts/pixelfx/tool/fx-tool.ts)와 같은 규칙: 시각은 첫 타격 = 0ms, 간격·늦춤·비행 시간은 시전 속도(speed)로 나눈다.
// 0ms 보다 앞서는 것(음수 늦춤·몸동작 미리 시작)이 있으면 전체를 그만큼 뒤로 민다(shift). 표시만 — 피해·규칙은 엔진 그대로.
import type { FamilyPixelFx, PixelFxBody, PixelFxLayer, PixelFxStage } from '../engine/faction';

export type PixelBodySlot = 'male' | 'female' | 'frames';

export interface PixelInst {
  /** 이펙트 번호(블록 안 순서, 겹침 순서에 쓴다) */
  layer: number;
  /** 타격 번호(0부터) */
  hit: number;
  /** 그 타격에 쓰는 값 (기본 + 타격마다 바꾼 값) */
  L: PixelFxLayer;
  /** 시작 시각(ms, shift 반영) */
  start: number;
  /** 시트 재생 빠르기 = 이펙트 재생 속도 × 시전 속도 */
  rate: number;
  /** 날아감이면 비행 시간(ms) */
  flightMs: number | null;
}

export interface PixelPlan {
  shift: number;
  /** 타격 시각(ms, shift 반영) */
  hitAt: number[];
  /** 맞는 쪽 반응 시각(ms, shift 반영): 그 타격에 투사체가 있으면 도착 순간 */
  reactAt: number[];
  insts: PixelInst[];
  /** 몸동작 (없으면 null = 옛 계열 몸동작) */
  body: (PixelFxBody & { at: number; speed: number }) | null;
}

/** 그 타격에 쓰는 값 */
export function layerAtHit(L: PixelFxLayer, hi: number): PixelFxLayer {
  return { ...L, ...(L.perHit?.[String(hi)] ?? {}) };
}

/** 블록 계획. slot = 치는 쪽 몸동작 칸(남·여 종이인형 / 프레임 그림) */
export function pixelPlan(stage: PixelFxStage, slot: PixelBodySlot): PixelPlan {
  const sp = stage.speed > 0 ? stage.speed : 1;
  const hits = [0];
  for (let i = 1; i < stage.hits; i++) hits.push(hits[i - 1]! + (stage.gaps[i - 1] ?? 0) / sp);
  // 이 블록 첫 투사체: 타격마다 도착 시각
  const flyer = stage.layers.find((L) => L.move === 'fly');
  const arrive = (hi: number): number | null => {
    if (!flyer || !flyer.on.includes(hi)) return null;
    const F = layerAtHit(flyer, hi);
    return hits[hi]! + F.delay / sp + F.travel / sp;
  };
  const raw: (Omit<PixelInst, 'start'> & { t: number })[] = [];
  stage.layers.forEach((LB, li) => {
    for (const hi of LB.on) {
      if (hi >= hits.length) continue;
      const L = layerAtHit(LB, hi);
      const base = L.move === 'stay' && L.sync === 'arrive' ? arrive(hi) ?? hits[hi]! : hits[hi]!;
      raw.push({ layer: li, hit: hi, L, rate: (L.rate > 0 ? L.rate : 1) * sp, flightMs: L.move === 'fly' ? Math.max(1, L.travel / sp) : null, t: base + L.delay / sp });
    }
  });
  const b = stage.bodies[slot];
  const body = b && b.chain.length ? b : null;
  const bodyAt = body ? body.bodyAt / sp : 0;
  const shift = Math.max(0, -Math.min(0, bodyAt, ...raw.map((r) => r.t)));
  return {
    shift,
    hitAt: hits.map((h) => h + shift),
    reactAt: hits.map((h, i) => (arrive(i) ?? h) + shift),
    insts: raw.map(({ t, ...r }) => ({ ...r, start: t + shift })),
    body: body ? { ...body, at: bodyAt + shift, speed: sp } : null,
  };
}

/** 그 블록에 도트 연출이 있나 (이펙트나 그 칸 몸동작이 하나라도) */
export function hasPixelStage(stage: PixelFxStage | undefined, slot: PixelBodySlot): stage is PixelFxStage {
  return !!stage && (stage.layers.length > 0 || (stage.bodies[slot]?.chain.length ?? 0) > 0);
}

/** 날아가는 길 위 한 점 (도구 draw 와 같은 식): p 0~1 = 출발 → 도착(곡선 arc), 1 넘으면 도착 → 사라지는 곳(곧게). 화면 각도(도) 함께 */
export function flyPoint(A: { x: number; y: number }, B: { x: number; y: number }, E: { x: number; y: number }, arc: number, el: number, ms1: number, ms2: number): { x: number; y: number; dir: number; vx: number } {
  if (el <= ms1) {
    const p = ms1 > 0 ? el / ms1 : 1;
    const vx = B.x - A.x;
    const vy = B.y - A.y - arc * 4 * (1 - 2 * p);
    return { x: A.x + (B.x - A.x) * p, y: A.y + (B.y - A.y) * p - arc * 4 * p * (1 - p), dir: (Math.atan2(vy, vx) * 180) / Math.PI, vx };
  }
  const p = ms2 > 0 ? (el - ms1) / ms2 : 1;
  const vx = E.x - B.x;
  const vy = E.y - B.y;
  return { x: B.x + vx * p, y: B.y + vy * p, dir: (Math.atan2(vy, vx) * 180) / Math.PI, vx };
}

/** 그 몸의 1·2·3블록 (GDD 230장): 몸(뼈대/몸 id)에 따로 맞춘 블록이 있으면 그것, 없으면 사람형 공통 */
export function familyStagesFor(px: FamilyPixelFx | undefined, bodyKey: string | null | undefined): PixelFxStage[] | undefined {
  return (bodyKey ? px?.byBody?.[bodyKey]?.stages : undefined) ?? px?.stages;
}
