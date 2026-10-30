// 행동 진행 연출 (GDD 132장 3, C.208): 아이템 쓰기·먹이 주기·튜토리얼 온천 쉬기를 하면 값은 누른 순간 저장하고, 화면은 막대가 천천히 차오르는 모습을 보여 준 뒤 끝난다.
// 연출 시간은 화면 연출값이라 balance 밖(이 파일 상수). 연출이 도는 동안 actionBusy() 가 참 — 튜토리얼 실제 조작 카드는 그동안 [다음]을 풀지 않는다.
import { el, icon, meter, type MeterKind } from './dom';
import { getOverlayHost } from './overlayHost';

/** 아이템·먹이 막대가 차오르는 시간 */
export const ACTION_FILL_MS = 1000;
/** 튜토리얼 온천: 앉은 뒤 체력이 목표까지 차오르는 시간 */
export const SPA_TUTORIAL_FILL_MS = 3000;
/** 아이템 연출 창이 다 찬 뒤 머무는 시간 */
const ITEM_HOLD_MS = 500;

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

/** 0→1 로 ms 동안 step(t) 를 부르고 끝나면 onEnd. 화면 연출이 꺼진 환경(rAF 없음)에서는 바로 끝 */
export function tween(ms: number, step: (t: number) => void, onEnd?: () => void): () => void {
  const end = beginAction();
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
  if (typeof requestAnimationFrame !== 'function' || ms <= 0) {
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

export interface ActionBar {
  /** 막대 종류 (meter kind: player = 체력) */
  kind: MeterKind;
  label: string;
  icon: string;
  from: number;
  to: number;
  max: number;
}

/**
 * 아이템 쓰기 연출 창 (가방처럼 막대가 없는 화면에서): 캐릭터 그림이 쓰는 모션을 하고, 바뀐 막대가 ACTION_FILL_MS 동안 차오르며 숫자도 따라 올라간다.
 * 누름을 막지 않는 작은 창(화면 가운데 위). 끝나면 저절로 사라진다
 */
export function itemUseFx(o: { title: string; art?: HTMLElement; bars: ActionBar[] }): void {
  const end = beginAction();
  const box = el('div', 'bha-actfx');
  box.setAttribute('role', 'status');
  box.dataset.actfx = '';
  const head = el('div', 'bha-actfx__head');
  const who = el('div', 'bha-actfx__who');
  if (o.art) who.append(o.art);
  else who.append(icon('i-heal'));
  head.append(who, el('b', 'bha-actfx__title', o.title));
  const bars = el('div', 'bha-actfx__bars');
  box.append(head, bars);
  getOverlayHost().append(box);
  const paint = (t: number) => bars.replaceChildren(...o.bars.map((b) => {
    const v = Math.round(b.from + (b.to - b.from) * t);
    return meter({ kind: b.kind, label: b.label, icon: b.icon, value: v, max: b.max, compact: true, inside: true, valueText: `${v} / ${b.max}` });
  }));
  tween(ACTION_FILL_MS, paint, () => window.setTimeout(() => {
    box.classList.add('is-out');
    window.setTimeout(() => box.remove(), 250);
    end();
  }, ITEM_HOLD_MS));
}
