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
