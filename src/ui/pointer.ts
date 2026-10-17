// 블록 바 포인터 판정 (GDD 3-5 v0.8). 화면의 실시간(performance.now) 기준 판정만 하고, 엔진에는 use/move 결과만 넘긴다.
// DOM 에 의존하지 않는 순수 함수라 단위 테스트한다 (tests/pointer.test.ts).
import { BALANCE } from '../config/balance';
import type { CombatInput } from '../engine/combat';

export type ReleaseKind = 'use' | 'drag' | 'hold';

export interface PointerRules {
  /** 누른 뒤 이 시간(초) 이내에 떼면 사용 */
  clickMaxSeconds: number;
  /** 이 거리(px) 이상 움직이면 드래그 */
  dragThresholdPx: number;
}

export const POINTER_RULES: PointerRules = BALANCE.provisional.input;

/**
 * 손가락을 뗄 때의 판정.
 * - 누르는 동안 한 번이라도 임계치 이상 움직였으면 시간과 무관하게 드래그
 * - 아니면 제한 시간 이내에 뗐을 때만 사용(클릭), 넘기면 "들었다 놓은 것"(hold, 아무 일도 없음)
 */
export function classifyRelease(heldMs: number, maxMovedPx: number, rules: PointerRules = POINTER_RULES): ReleaseKind {
  if (maxMovedPx >= rules.dragThresholdPx) return 'drag';
  return heldMs <= rules.clickMaxSeconds * 1000 ? 'use' : 'hold';
}

/** 화면 x 좌표가 바의 몇 번째 칸 위인가 (0 ~ capacity-1 로 자른다). 칸 폭 = 바 폭 / capacity */
export function slotAt(x: number, barLeft: number, barWidth: number, capacity: number): number {
  const i = Math.floor(((x - barLeft) / barWidth) * capacity);
  return Math.min(capacity - 1, Math.max(0, i));
}

/**
 * 뗀 결과를 엔진 입력으로. from = 누른 블록의 현재 번호, dropSlot = 놓은 칸.
 * 드래그로 놓은 칸이 블록 수를 넘으면 맨 오른쪽 블록 위치로 본다 (빈 칸은 끼워넣기 대상이 아님)
 */
export function releaseInput(kind: ReleaseKind, from: number, dropSlot: number, blockCount: number): CombatInput | null {
  if (kind === 'use') return { type: 'use', cell: from };
  if (kind === 'hold') return null;
  const to = Math.min(blockCount - 1, dropSlot);
  return to >= 0 && to !== from ? { type: 'move', from, to } : null;
}
