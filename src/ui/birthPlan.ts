// 첫 시작 탄생 연출의 순수 부분 (GDD 74장, C.126): 단계 목록 → 시작 시각표, 깜빡임 시각 등. DOM 이 없어 단위 테스트한다. 재생기 = ui/birthFx.ts
import type { BirthFx, BirthFxStep } from '../engine/faction';

export interface PlannedStep extends BirthFxStep {
  /** 연출 시작부터 이 단계가 시작하는 시각(ms) */
  at: number;
}

/** 단계를 차례로 이어 붙인 시각표와 전체 길이. 동작 줄이기 설정이면 전체를 짧은 한 단계(reveal)로 줄인다 */
export function planBirth(fx: BirthFx, reduced = false): { steps: PlannedStep[]; total: number } {
  if (reduced) return { steps: [{ fx: 'reveal', ms: 400, at: 0 }], total: 400 };
  let at = 0;
  const steps = fx.steps.map((s) => {
    const p = { ...s, at };
    at += s.ms;
    return p;
  });
  return { steps, total: at };
}

/** 깜빡임이 점점 빨라지는 시각(0~1): k 번째 깜빡임이 1-(1-k/count)^1.6 위치에서 시작 → 처음엔 느리고 끝으로 갈수록 간격이 줄어든다 */
export function flickerOffsets(count: number): number[] {
  const n = Math.max(1, Math.floor(count));
  return Array.from({ length: n }, (_, k) => Math.round((1 - Math.pow(1 - k / n, 1.6)) * 1000) / 1000);
}

/** 깜빡임 키프레임 위치: [꺼짐 직전, 꺼짐, 켜짐] 3점 × 횟수 + 마지막 켜짐. 값 = offset(0~1) 오름차순 */
export function flickerKeyframeOffsets(count: number): number[] {
  const starts = flickerOffsets(count);
  const out: number[] = [];
  starts.forEach((t, i) => {
    const next = starts[i + 1] ?? 1;
    const span = next - t;
    out.push(t, t + span * 0.45, t + span * 0.8);
  });
  out.push(1);
  return out.map((v) => Math.round(Math.min(1, v) * 1000) / 1000);
}

/** 고리·불씨 같은 낱개의 겹치지 않는 시작 지연(ms): 전체 길이 안에서 균등, 뒤에서부터(reverse)도 */
export function stagger(count: number, spanMs: number, reverse = false): number[] {
  const n = Math.max(1, Math.floor(count));
  const gap = n > 1 ? spanMs / n : 0;
  const d = Array.from({ length: n }, (_, i) => Math.round(i * gap));
  return reverse ? d.reverse() : d;
}

/** 0~1 사이 결정적 가짜 난수 (불꽃 자리·불씨 방향이 매번 같게) */
export function seeded(i: number, salt = 1): number {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}
