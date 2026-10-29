// 앱 이탈 감지 (GDD 119장 2, C.193): 홈키·앱 전환·화면 꺼짐(document hidden / pagehide)이면 "자리 비움".
// 전투는 일시정지 창을 띄우고(돌아와서 사용자가 이어 하기), 원정 걷기·휴식·이벤트 시계는 멈췄다가 돌아오면 그대로 이어 가고,
// 노래·효과음은 멈췄다가 돌아오면 노래만 다시 튼다(설정에서 꺼 둔 소리는 그대로). 둥지 시간·대기 보상은 실제 시간 그대로(여기서 안 건드림).
// 문서·창은 주입할 수 있다 (tests/c193.test.ts).

type Listener = (away: boolean) => void;

const listeners = new Set<Listener>();
let away = false;

/** 지금 앱을 떠나 있는가 */
export function isAppAway(): boolean {
  return away;
}

/** 자리 비움이 바뀔 때 듣는다. 돌려주는 함수로 푼다 */
export function onAppAway(fn: Listener): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

/** 자리 비움 상태를 정한다 (같은 값이면 알리지 않는다) */
export function setAppAway(on: boolean): void {
  if (on === away) return;
  away = on;
  for (const fn of [...listeners]) {
    try {
      fn(on);
    } catch {
      /* 한 구독자가 실패해도 나머지는 받는다 */
    }
  }
}

interface DocLike {
  readonly hidden: boolean;
  addEventListener(type: 'visibilitychange', fn: () => void): void;
}
interface WinLike {
  addEventListener(type: 'pagehide' | 'pageshow', fn: () => void): void;
}

let installed = false;

/** 문서·창 이벤트를 건다 (앱 시작 때 한 번) */
export function installAppAway(doc: DocLike | undefined = typeof document !== 'undefined' ? document : undefined, win: WinLike | undefined = typeof window !== 'undefined' ? window : undefined): void {
  if (installed || !doc) return;
  installed = true;
  doc.addEventListener('visibilitychange', () => setAppAway(doc.hidden));
  win?.addEventListener('pagehide', () => setAppAway(true));
  win?.addEventListener('pageshow', () => setAppAway(doc.hidden));
  if (doc.hidden) setAppAway(true);
}

/** 테스트용: 상태·설치 표시를 처음으로 */
export function resetAppAwayForTest(): void {
  listeners.clear();
  away = false;
  installed = false;
}
