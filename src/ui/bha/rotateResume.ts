// 세로 전환 자동 멈춤·가로 복귀 3초 카운트다운 재개 (Q-3, C.31). 순수 상태 머신이라 단위 테스트한다 (tests/rotate-resume.test.ts).
// 전투·원정 중에 폰을 세로로 돌리면 멈추고, 가로로 돌아오면 3초를 센 뒤 이어한다. 세는 중에 취소하면 멈춘 채 [계속]을 기다린다.
export const RESUME_COUNTDOWN_S = 3;

export type RotateState =
  | { phase: 'idle' }
  /** 세로로 돌려서 멈춰 있다 */
  | { phase: 'portrait' }
  /** 가로로 돌아와 세는 중 (left = 남은 초) */
  | { phase: 'counting'; left: number }
  /** 세다가 취소해서 멈춘 채 대기 */
  | { phase: 'manual' };

export type RotateEvent = 'portrait' | 'landscape' | 'tick' | 'cancel' | 'resume';
/** 화면이 해야 할 일: hold = 전투·원정을 멈춘다, release = 다시 흐르게 한다 */
export type RotateEffect = 'hold' | 'release' | null;

export const IDLE: RotateState = { phase: 'idle' };

/** inGame = 지금 멈출 전투·원정 화면이 떠 있는가 */
export function rotateStep(s: RotateState, ev: RotateEvent, inGame: boolean): { state: RotateState; effect: RotateEffect } {
  switch (s.phase) {
    case 'idle':
      if (ev === 'portrait' && inGame) return { state: { phase: 'portrait' }, effect: 'hold' };
      return { state: s, effect: null };
    case 'portrait':
      if (ev === 'landscape') return { state: { phase: 'counting', left: RESUME_COUNTDOWN_S }, effect: null };
      if (ev === 'resume') return { state: IDLE, effect: 'release' };
      return { state: s, effect: null };
    case 'counting':
      if (ev === 'tick') return s.left <= 1 ? { state: IDLE, effect: 'release' } : { state: { phase: 'counting', left: s.left - 1 }, effect: null };
      if (ev === 'portrait') return { state: { phase: 'portrait' }, effect: null };
      if (ev === 'cancel') return { state: { phase: 'manual' }, effect: null };
      if (ev === 'resume') return { state: IDLE, effect: 'release' };
      return { state: s, effect: null };
    case 'manual':
      if (ev === 'resume') return { state: IDLE, effect: 'release' };
      return { state: s, effect: null };
  }
}
