// 행동 진행 연출 (GDD 132장 3, C.208): 아이템 쓰기·먹이 주기를 하면(튜토리얼 온천은 C.214 부터 실제 시간 — GDD 139장 2) 값은 누른 순간 저장하고, 화면은 막대가 천천히 차오르는 모습을 보여 준 뒤 끝난다.
// 연출 시간은 화면 연출값이라 balance 밖(이 파일 상수). 연출이 도는 동안 actionBusy() 가 참 — 튜토리얼 실제 조작 카드는 그동안 [다음]을 풀지 않는다.
import { prefersReducedMotion } from '../fxSettings';

/** 아이템·먹이·회복 막대가 차오르는 시간 (GDD 201장 3: 0.8초, 끝에서 살짝 느려짐 — 화면 연출값이라 balance 밖) */
export const ACTION_FILL_MS = 800;

let busy = 0;
/** 행동 연출이 도는 중이다 (튜토리얼 카드는 끝날 때까지 기다린다) */
export function actionBusy(): boolean {
  return busy > 0;
}
/** 연출 시작을 알린다. 돌려받은 함수를 부르면 끝 (여러 번 불러도 한 번만) */
export function beginAction(): () => void {
  busy++;
  let done = false;
  return () => {
    if (done) return;
    done = true;
    busy = Math.max(0, busy - 1);
  };
}

let moving = 0;
/** 장면 이동 연출(온천 계단 들고 나기·월드맵 걷기 → 페이드)이 도는 중이다 — 튜토리얼 안내 창은 끝난 뒤에 뜬다 (GDD 143장 1) */
export function sceneMoving(): boolean {
  return moving > 0;
}
/** 장면 이동 연출 시작. 돌려받은 함수를 부르면 끝 (여러 번 불러도 한 번만, 못 불러도 maxMs 뒤 저절로 끝 — 안내 창이 영영 안 뜨지 않게) */
export function beginSceneMove(maxMs = 6000): () => void {
  moving++;
  let done = false;
  const end = () => {
    if (done) return;
    done = true;
    clearTimeout(guard);
    moving = Math.max(0, moving - 1);
  };
  const guard = setTimeout(end, maxMs);
  return end;
}

/**
 * 0→1 로 ms 동안 step(t) 를 부르고 끝나면 onEnd. 화면 연출이 꺼진 환경(rAF 없음)·동작 줄이기(prefers-reduced-motion)에서는 바로 끝(GDD 201장).
 * busy = 도는 동안 actionBusy() 참 (튜토리얼 카드가 기다린다). 방에 들어올 때 차오름처럼 행동이 아닌 연출은 false
 */
export function tween(ms: number, step: (t: number) => void, onEnd?: () => void, busy = true): () => void {
  const end = busy ? beginAction() : () => {};
  let raf = 0;
  let stopped = false;
  const t0 = performance.now();
  const finish = () => {
    if (stopped) return;
    stopped = true;
    step(1);
    end();
    onEnd?.();
  };
  if (typeof requestAnimationFrame !== 'function' || ms <= 0 || prefersReducedMotion()) {
    finish();
    return () => {};
  }
  const frame = (now: number) => {
    if (stopped) return;
    const t = Math.min(1, (now - t0) / ms);
    if (t >= 1) return finish();
    step(1 - (1 - t) * (1 - t)); // 처음 빠르고 끝에서 천천히
    raf = requestAnimationFrame(frame);
  };
  step(0);
  raf = requestAnimationFrame(frame);
  // 탭이 숨겨져 rAF 가 멈춰도 연출이 끝나게
  const guard = window.setTimeout(finish, ms + 400);
  return () => {
    cancelAnimationFrame(raf);
    window.clearTimeout(guard);
    finish();
  };
}
