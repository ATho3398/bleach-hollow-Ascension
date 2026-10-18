// 블록 바 포인터 판정 (GDD 3-5, 17-2). 클릭 = 같은 블록 위에서 누르고 뗌. 순서 바꾸기(드래그)·클릭 시간 제한은 없다.
// DOM 에 의존하지 않는 순수 함수라 단위 테스트한다 (tests/pointer.test.ts).
import type { CombatInput } from '../engine/combat';

/** 예전(C.8~C.32) 클릭 판정 시간·드래그 거리 설정이 저장돼 있던 localStorage 키. 지금은 쓰지 않고 설정 복원 때 지운다 */
export const LEGACY_POINTER_SETTINGS_KEY = 'bha-input-settings';

/** 화면 x 좌표가 바의 몇 번째 칸 위인가 (0 ~ capacity-1 로 자른다). 칸 폭 = 바 폭 / capacity */
export function slotAt(x: number, barLeft: number, barWidth: number, capacity: number): number {
  const i = Math.floor(((x - barLeft) / barWidth) * capacity);
  return Math.min(capacity - 1, Math.max(0, i));
}

/**
 * 뗀 결과를 엔진 입력으로. pressedUid = 누른 블록, upSlot = 뗀 칸, tray = 지금 바.
 * 누르는 사이 앞 블록이 쓰여 번호가 바뀌어도 uid 로 따라가므로, 뗀 칸에 그 블록이 있을 때만 사용한다.
 * 다른 칸에서 떼거나 블록이 이미 사라졌으면 아무 일도 없다
 */
export function releaseUse(pressedUid: number, upSlot: number, tray: readonly { uid: number }[]): CombatInput | null {
  const from = tray.findIndex((b) => b.uid === pressedUid);
  return from >= 0 && from === upSlot ? { type: 'use', cell: from } : null;
}
