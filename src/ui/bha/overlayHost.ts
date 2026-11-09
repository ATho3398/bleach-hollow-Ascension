// 전체 화면을 덮는 레이어(도움말·튜토리얼·토스트)를 붙일 곳. 기기 틀이 있으면 LCD 창 안, 없으면(테스트·옛 화면) document.body.
// 레이어는 열릴 때 registerLayer 로 알려, 기기의 선택 버튼(위/아래/확정/취소)이 그 레이어 안에서 동작하게 한다.
let host: HTMLElement | null = null;
let layerHook: ((layer: HTMLElement, onCancel: () => void) => () => void) | null = null;

export const setOverlayHost = (el: HTMLElement | null, hook: typeof layerHook = null): void => {
  host = el;
  layerHook = hook;
};
export const getOverlayHost = (): HTMLElement => host ?? document.body;

/** 레이어를 기기에 등록한다. 돌려주는 함수로 등록을 푼다. 기기가 없으면 아무 일도 하지 않는다 */
export const registerLayer = (layer: HTMLElement, onCancel: () => void): (() => void) => (layerHook ? layerHook(layer, onCancel) : () => {});

/** 기기 버튼(CSS 버튼 4개·그림 기기 누름 영역) 누름인가 (GDD 176장 1): 펼침 목록·ⓘ 창의 '바깥 누름 닫기'에서 빼야 ▲▼✓ 로 목록 안을 움직일 수 있다 */
export const DEVICE_BUTTON_SELECTOR = '.bha-dev__btn, .bha-tama__hit';
export const isDeviceButtonPress = (t: EventTarget | null): boolean => t instanceof Element && !!t.closest(DEVICE_BUTTON_SELECTOR);

/**
 * 입력 막기 (GDD 176장 5): 연출과 다음 안내 사이 틈에 투명 레이어를 덮어 기기 버튼·화면 누름이 뒤 화면(월드맵 물건 등)에 가지 않게 한다.
 * 돌려주는 함수로 걷는다. 걷기를 잊어도 maxMs 뒤 저절로 걷힌다
 */
export function blockInput(maxMs = 4000): () => void {
  const gate = document.createElement('div');
  gate.className = 'bha-layer';
  gate.dataset.inputGate = '';
  gate.setAttribute('aria-hidden', 'true');
  getOverlayHost().append(gate);
  const unreg = registerLayer(gate, () => {});
  let open = true;
  const release = (): void => {
    if (!open) return;
    open = false;
    window.clearTimeout(timer);
    unreg();
    gate.remove();
  };
  const timer = window.setTimeout(release, maxMs);
  return release;
}

/**
 * 튜토리얼 덮기 (GDD 194장 1·3, C.314): 일시정지·설정·새 버전 알림·화면 돌림 멈춤·처음 화면 확인처럼 화면 전체를 멈추는 창이 열려 있는 동안
 * 튜토리얼 안내 카드·강조 틀을 숨기고 안내 입력 막기도 쉰다 — 창 버튼([계속]·[설정])이 카드에 가리거나 막히지 않게.
 * 창이 모두 닫히면 같은 단계 카드를 다시 띄운다. 돌려주는 함수로 덮기를 푼다(여러 번 불러도 한 번만 푼다). 창이 겹치면 마지막 창이 닫힐 때 풀린다
 */
/** 열린 덮개들 (창 요소를 주면 그 창이 문서에서 빠졌을 때 — 닫기 함수를 못 불렀어도 — 덮개도 없는 것으로 친다) */
const covers = new Set<{ el: Element | null }>();
const coverListeners = new Set<(covered: boolean) => void>();
/** 지금 튜토리얼을 덮는 창이 열려 있는가 (빠진 창은 여기서 치운다) */
export const tutorialsCovered = (): boolean => {
  for (const c of [...covers]) if (c.el && !c.el.isConnected) covers.delete(c);
  return covers.size > 0;
};
/** 덮임이 바뀔 때 듣는다. 돌려주는 함수로 푼다 */
export function onTutorialCover(fn: (covered: boolean) => void): () => void {
  coverListeners.add(fn);
  return () => void coverListeners.delete(fn);
}
const notifyCover = (on: boolean): void => {
  for (const fn of [...coverListeners]) {
    try {
      fn(on);
    } catch {
      /* 한 구독자가 실패해도 나머지는 받는다 */
    }
  }
};
/** 튜토리얼을 덮는다 (창이 열릴 때, el = 그 창). 돌려주는 함수 = 창이 닫힐 때 */
export function coverTutorials(el: Element | null = null): () => void {
  const was = tutorialsCovered();
  const entry = { el };
  covers.add(entry);
  if (!was) notifyCover(true);
  return () => {
    if (!covers.delete(entry)) return;
    if (!tutorialsCovered()) notifyCover(false);
  };
}
/** 튜토리얼 안내 카드(.bha-tut)가 떠 있나 */
export const tutorialCardOpen = (): boolean => document.querySelector('.bha-tut') !== null;
/**
 * 튜토리얼 카드가 다 끝난 뒤에 띄우기 (GDD 222장 1): 대기 보상 복귀 창처럼 저절로 뜨는 창은 안내 카드가 떠 있으면 기다렸다가,
 * 카드가 없는 상태가 두 번 잇달아 보이면(카드가 이어 뜨는 틈 제외) 띄운다. still() 이 false 가 되면(다른 화면으로 감 등) 띄우지 않는다. 돌려주는 함수로 그만둔다
 */
export function afterTutorials(fn: () => void, still: () => boolean = () => true, pollMs = 400): () => void {
  let quiet = 0;
  let stopped = false;
  const tick = (): void => {
    if (stopped) return;
    if (!still()) return void (stopped = true);
    quiet = tutorialCardOpen() ? 0 : quiet + 1;
    if (quiet >= 2) {
      stopped = true;
      fn();
      return;
    }
    timer = window.setTimeout(tick, pollMs);
  };
  let timer = window.setTimeout(tick, pollMs);
  return () => {
    stopped = true;
    window.clearTimeout(timer);
  };
}
/** 테스트용: 덮개·구독을 처음으로 */
export function resetTutorialCoverForTest(): void {
  covers.clear();
  coverListeners.clear();
}
