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
