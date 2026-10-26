// 예/아니오 확인창 (Q-3, C.31): LCD 창 위에 레이어로 뜬다. 기기의 위/아래/확정으로 고르고, 취소 버튼·Esc 는 "아니오".
import { button, el } from './bha/dom';
import { trapModalFocus } from './bha/modalFocus';
import { getOverlayHost, registerLayer } from './bha/overlayHost';

export interface ConfirmOptions {
  title: string;
  body?: string;
  yes?: string;
  no?: string;
  /** 위험한 선택(덮어쓰기 등)이면 예 버튼을 danger 로 */
  danger?: boolean;
  /** 알림 창: 확인 버튼 하나만 (C.140 대기 모드 결과 요약) */
  single?: boolean;
  onYes: () => void;
  onNo?: () => void;
}

/** 확인창을 연다. 돌려주는 함수는 선택 없이 닫는다 */
export function confirmDialog(o: ConfirmOptions): () => void {
  const layer = el('div', 'bha-overlay bha-overlay--in-app bha-confirm');
  layer.setAttribute('role', 'alertdialog');
  layer.setAttribute('aria-modal', 'true');
  layer.setAttribute('aria-label', o.title);
  const modal = el('div', 'bha-modal');
  modal.append(el('h2', 'bha-modal__title', o.title));
  if (o.body) modal.append(el('p', 'bha-modal__body', o.body));
  let closed = false;
  let unregister: () => void = () => {};
  let untrap: () => void = () => {};
  const close = () => {
    if (closed) return;
    closed = true;
    unregister();
    layer.remove();
    untrap(); // 배경을 되살리고 열기 전 초점으로 (C.139)
  };
  const no = () => {
    close();
    o.onNo?.();
  };
  const yes = () => {
    close();
    o.onYes();
  };
  const actions = el('div', 'bha-modal__actions');
  if (!o.single) actions.append(button({ label: o.no ?? '아니오', variant: 'ghost', onClick: no }));
  actions.append(button({ label: o.yes ?? '예', variant: o.danger ? 'danger' : 'primary', onClick: yes }));
  modal.append(actions);
  layer.append(modal);
  getOverlayHost().append(layer);
  untrap = trapModalFocus(layer); // 초기 초점(첫 버튼)·Tab 순환·배경 inert (C.139, GDD 88장 9) — 기기 선택은 초점 있는 항목에서 시작
  unregister = registerLayer(layer, no);
  return close;
}
