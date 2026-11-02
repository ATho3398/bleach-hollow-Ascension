// 고르기 창 (GDD 150장 2·5, C.227): 제목 · 한 줄 · 고를 것들을 한 줄에 하나씩 + [닫기]. 기기 ▲▼ = 고르기(위 → 아래), ✓ = 고름, 뒤로·[닫기] = 닫힘.
// 방 [상점] 4곳 고르기·상태 화면 탈착 특성 [끼우기]가 쓴다. 모양은 확인 창(bha-confirm)과 같다
import { button, el } from './bha/dom';
import { trapModalFocus } from './bha/modalFocus';
import { getOverlayHost, registerLayer } from './bha/overlayHost';

export interface PickOption {
  label: string;
  /** data-pick 값 (캡처·테스트용) */
  key: string;
  onPick: () => void;
}

/** 고르기 창을 연다. 돌려주는 함수는 고르지 않고 닫는다 */
export function pickDialog(o: { title: string; body: string; options: readonly PickOption[]; cls?: string }): () => void {
  const layer = el('div', `bha-overlay bha-overlay--in-app bha-confirm bha-shoppick${o.cls ? ` ${o.cls}` : ''}`);
  layer.setAttribute('role', 'dialog');
  layer.setAttribute('aria-modal', 'true');
  layer.setAttribute('aria-label', o.title);
  const modal = el('div', 'bha-modal');
  modal.append(el('h2', 'bha-modal__title', o.title), el('p', 'bha-modal__body', o.body));
  let closed = false;
  let unregister: () => void = () => {};
  let untrap: () => void = () => {};
  const close = () => {
    if (closed) return;
    closed = true;
    unregister();
    layer.remove();
    untrap();
  };
  const list = el('div', 'bha-modal__actions bha-shoppick__list');
  const btns = o.options.map((op) => {
    const b = button({ label: op.label, variant: 'primary', onClick: () => { close(); op.onPick(); } });
    b.dataset.pick = op.key;
    return b;
  });
  list.append(...btns, button({ label: '닫기', variant: 'ghost', onClick: close }));
  modal.append(list);
  layer.append(modal);
  getOverlayHost().append(layer);
  untrap = trapModalFocus(layer);
  btns[0]?.focus({ preventScroll: true });
  unregister = registerLayer(layer, close);
  return close;
}
