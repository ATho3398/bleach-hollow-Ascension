// 원정 화면 시계 (GDD 19-1, C.45): "다음에 할 일" 하나를 들고 배속·일시정지·멈춤(확인창·세로 전환)에 맞춰 타이머를 다시 건다.
// 예전에는 배속·일시정지·도움말이 타이머를 지우고 이동 중일 때만 다시 걸어서, 조우 말풍선(전투 진입 대기)·휴식 중에 누르면
// 전투 진입·휴식 끝 예약이 사라져 화면이 멈췄다. 이제 할 일은 실제로 실행되기 전까지 지워지지 않고, 멈춤이 풀리면 남은 시간만큼 다시 걸린다.
// 브라우저 타이머·시각은 주입할 수 있다 (tests/exp-clock.test.ts).

export type ClockTaskKind = 'step' | 'phase';

export interface ClockDeps {
  /** 지금 배속 (1·2·4) */
  speed: () => number;
  /** 시간이 멈춰 있어야 하는가 (일시정지·도움말·확인창·세로 전환) */
  blocked: () => boolean;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (id: unknown) => void;
}

export interface ExpClock {
  /** 다음 할 일을 정한다 (전에 들고 있던 일은 버린다). baseMs 는 1x 기준 */
  set(kind: ClockTaskKind, baseMs: number, fn: () => void): void;
  /** 들고 있는 일을 버린다 */
  cancel(): void;
  /** 배속·멈춤 상태가 바뀌었다: 남은 시간을 셈해 다시 건다 (할 일은 버리지 않는다) */
  rearm(): void;
  /** 들고 있는 일의 종류 (없으면 null) */
  pending(): ClockTaskKind | null;
  /** 타이머가 실제로 걸려 있는가 */
  armed(): boolean;
}

export function createExpClock(d: ClockDeps): ExpClock {
  const now = d.now ?? (() => Date.now());
  const setTimer = d.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearTimer = d.clearTimer ?? ((id: unknown) => clearTimeout(id as ReturnType<typeof setTimeout>));
  let task: { kind: ClockTaskKind; left: number; fn: () => void } | null = null;
  let timer: unknown = undefined;
  let armedAt = 0;
  let armedSpeed = 1;

  /** 걸려 있던 타이머를 풀고, 흐른 시간만큼 남은 시간(1x 기준)을 줄인다 */
  function disarm(): void {
    if (timer === undefined) return;
    clearTimer(timer);
    timer = undefined;
    if (task) task.left = Math.max(0, task.left - (now() - armedAt) * armedSpeed);
  }

  function arm(): void {
    if (!task || d.blocked()) return;
    armedAt = now();
    armedSpeed = Math.max(0.0001, d.speed());
    const t = task;
    timer = setTimer(() => {
      timer = undefined;
      if (task !== t) return;
      if (d.blocked()) {
        // 걸어 둔 사이 멈춤이 됐는데 rearm 을 못 받은 경우: 남은 시간 0 으로 들고 있다가 풀리면 바로 실행
        t.left = 0;
        return;
      }
      task = null;
      t.fn();
    }, t.left / armedSpeed);
  }

  return {
    set(kind, baseMs, fn) {
      disarm();
      task = { kind, left: Math.max(0, baseMs), fn };
      arm();
    },
    cancel() {
      disarm();
      task = null;
    },
    rearm() {
      disarm();
      arm();
    },
    pending: () => task?.kind ?? null,
    armed: () => timer !== undefined,
  };
}
