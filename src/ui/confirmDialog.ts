// 예/아니오 확인창 (Q-3, C.31): LCD 창 위에 레이어로 뜬다. 기기의 위/아래/확정으로 고르고, 취소 버튼·Esc 는 "아니오".
import { button, el } from './bha/dom';
import { trapModalFocus } from './bha/modalFocus';
import { getOverlayHost, registerLayer } from './bha/overlayHost';

export interface ConfirmOptions {
  title: string;
  body?: string;
  /** 본문 아래 덧붙일 내용 (C.147 대기 보상 목록) */
  content?: HTMLElement;
  yes?: string;
  no?: string;
  /** 위험한 선택(덮어쓰기 등)이면 예 버튼을 danger 로 */
  danger?: boolean;
  /** 알림 창: 확인 버튼 하나만 (C.140 대기 모드 결과 요약) */
  single?: boolean;
  /** 예 버튼을 비활성으로 둔다 (자리는 그대로, C.170 대기 보상 — 받을 게 없을 때) */
  yesDisabled?: boolean;
  /** 가운데 세 번째 버튼 (C.178 설정 '저장 안 함'): [아니오][alt][예] 순서 */
  alt?: { label: string; onClick: () => void };
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
  if (o.content) modal.append(o.content);
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
  const actions = el('div', o.alt ? 'bha-modal__actions bha-modal__actions--three' : 'bha-modal__actions');
  if (!o.single) actions.append(button({ label: o.no ?? '아니오', variant: 'ghost', onClick: no }));
  if (o.alt) {
    const alt = o.alt;
    actions.append(button({ label: alt.label, onClick: () => { close(); alt.onClick(); } }));
  }
  const yesBtn = button({ label: o.yes ?? '예', variant: o.danger ? 'danger' : 'primary', disabled: o.yesDisabled, onClick: yes });
  actions.append(yesBtn);
  modal.append(actions);
  layer.append(modal);
  getOverlayHost().append(layer);
  untrap = trapModalFocus(layer); // 초기 초점(첫 버튼)·Tab 순환·배경 inert (C.139, GDD 88장 9) — 기기 선택은 초점 있는 항목에서 시작
  // 기본 선택 = 주 버튼(시작·귀환하기) (C.170, GDD 100장 #7·#8·#31): 강조가 둘(밝은 주 버튼 + 선택 테두리)로 갈리지 않게.
  // 지우기·덮어쓰기 같은 위험한 확인(danger)은 그대로 '아니오'에서 시작한다
  if (!o.danger && !yesBtn.disabled) yesBtn.focus({ preventScroll: true });
  unregister = registerLayer(layer, no);
  return close;
}
