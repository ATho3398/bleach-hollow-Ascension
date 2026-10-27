// 진행 중인 화면(전투·원정 길)에 "잠깐 멈춰라 / 다시 가라 / 이 화면을 떠난다"를 알리는 작은 신호 (Q-3, C.31).
// 처음 화면 복귀 확인창이 열려 있는 동안 시간이 흐르지 않게 하려고 쓴다. 화면이 DOM 에서 사라졌으면 구독자가 알아서 푼다.
export type HoldSignal = 'hold' | 'release' | 'leave';

const listeners = new Set<(s: HoldSignal) => void>();

/** 신호를 듣는다. 돌려주는 함수로 푼다 */
export function onHold(fn: (s: HoldSignal) => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

export function signalHold(s: HoldSignal): void {
  for (const fn of [...listeners]) fn(s);
}
