// 예/아니요 확인창 (Q-3, C.31): LCD 창 위에 레이어로 뜬다. 기기의 위/아래/확정으로 고르고, 취소 버튼·Esc 는 "아니요".
import { button, el } from './bha/dom';
import { trapModalFocus } from './bha/modalFocus';
import { coverTutorials, getOverlayHost, registerLayer } from './bha/overlayHost';

export interface ConfirmOptions {
  title: string;
  body?: string;
  /** 본문 아래 덧붙일 내용 (C.147 대기 보상 목록) */
  content?: HTMLElement;
  yes?: string;
  no?: string;
  /** 위험한 선택(덮어쓰기 등)이면 예 버튼을 danger 로 */
  danger?: boolean;
  /** 위험하지 않아도 '아니요'에서 시작 (예: 홈 뒤로 → 처음 화면 확인, GDD 124장 1) */
  focusNo?: boolean;
  /** 알림 창: 확인 버튼 하나만 (C.140 대기 모드 결과 요약) */
  single?: boolean;
  /** 예 버튼을 비활성으로 둔다 (자리는 그대로, C.170 대기 보상 — 받을 게 없을 때) */
  yesDisabled?: boolean;
  /** 가운데 세 번째 버튼 (C.178 설정 '저장 안 함'): [아니요][alt][네] 순서 */
  alt?: { label: string; onClick: () => void };
  /** 입력해야 열리는 확인 (GDD 241-A 4 슬롯 삭제): 입력 칸에 word 를 그대로 쳐야 [예]가 켜진다. hint = 입력 칸 위 안내 */
  typeToConfirm?: { word: string; hint: string };
  /** 레이어에 덧붙일 클래스 (창 크기 등 — 테스트 모드 적 설정 창, C.457) */
  cls?: string;
  /** 기기 취소·Esc 로 닫히지 않는다 — 버튼 하나를 꼭 골라야 하는 창 (C.497 진화 미루기: 취소가 '미루기'로 세지 않게) */
  noCancel?: boolean;
  /** 기기 취소·Esc(뒤로)가 '아니요' 대신 할 일 — 창은 닫고 이것만 부른다 ([아니요] 버튼은 그대로 onNo). 수련장 훈련 설정 창 뒤로 = 방 (C.534) */
  onCancel?: () => void;
  /** n 초 뒤 저절로 [예] (GDD 5-5 우라하라 마주침 창, C.549): 예 버튼 글 뒤에 남은 초 '(n)' — 1초마다 줄어든다. 닫히면 멈춘다 */
  autoYesSeconds?: number;
  /** 창 왼쪽에 세울 그림 (GDD 5-5 마주침 창 꾸밈, C.553 — 우라하라 도트): 있으면 [그림 | 제목·본문·버튼] 두 칸 창 */
  figure?: HTMLElement;
  onYes: () => void;
  onNo?: () => void;
}

/** 자동 확인 버튼 글: '확인 (5)' */
export function autoYesLabel(label: string, left: number): string {
  return `${label} (${Math.max(0, Math.ceil(left))})`;
}

/** 확인창을 연다. 돌려주는 함수는 선택 없이 닫는다 */
export function confirmDialog(o: ConfirmOptions): () => void {
  const layer = el('div', `bha-overlay bha-overlay--in-app bha-confirm${o.cls ? ` ${o.cls}` : ''}`);
  layer.setAttribute('role', 'alertdialog');
  layer.setAttribute('aria-modal', 'true');
  layer.setAttribute('aria-label', o.title);
  const modal = el('div', o.figure ? 'bha-modal bha-modal--figure' : 'bha-modal');
  // 그림 창(C.553): 왼쪽 칸 = 그림, 오른쪽 칸(main) = 제목·본문·버튼. 그림이 없으면 main = 창 그대로
  const main = o.figure ? el('div', 'bha-modal__main') : modal;
  if (o.figure) {
    const fig = el('div', 'bha-modal__figure');
    fig.setAttribute('aria-hidden', 'true');
    fig.append(o.figure);
    modal.append(fig, main);
  }
  main.append(el('h2', 'bha-modal__title', o.title));
  if (o.body) main.append(el('p', 'bha-modal__body', o.body));
  if (o.content) main.append(o.content);
  let typed: HTMLInputElement | null = null;
  if (o.typeToConfirm) {
    const ttc = o.typeToConfirm;
    main.append(el('p', 'bha-modal__body', ttc.hint));
    typed = el('input', 'bha-modal__input');
    typed.type = 'text';
    typed.autocomplete = 'off';
    typed.spellcheck = false;
    typed.placeholder = ttc.word;
    typed.setAttribute('aria-label', ttc.hint);
    typed.dataset.confirmInput = '';
    main.append(typed);
  }
  const matched = (): boolean => !typed || typed.value.trim() === o.typeToConfirm?.word;
  let closed = false;
  let unregister: () => void = () => {};
  let untrap: () => void = () => {};
  let uncover: () => void = () => {};
  let autoTimer: ReturnType<typeof setInterval> | null = null;
  const close = () => {
    if (closed) return;
    closed = true;
    if (autoTimer !== null) clearInterval(autoTimer);
    unregister();
    layer.remove();
    uncover();
    untrap(); // 배경을 되살리고 열기 전 초점으로 (C.139)
  };
  const no = () => {
    close();
    o.onNo?.();
  };
  const yes = () => {
    if (!matched()) return;
    close();
    o.onYes();
  };
  const actions = el('div', o.alt ? 'bha-modal__actions bha-modal__actions--three' : 'bha-modal__actions');
  const noBtn = o.single ? null : button({ label: o.no ?? '아니요', variant: 'ghost', onClick: no });
  if (noBtn) actions.append(noBtn);
  if (o.alt) {
    const alt = o.alt;
    actions.append(button({ label: alt.label, onClick: () => { close(); alt.onClick(); } }));
  }
  const yesBtn = button({ label: o.yes ?? '네', variant: o.danger ? 'danger' : 'primary', disabled: o.yesDisabled || !matched(), onClick: yes });
  actions.append(yesBtn);
  if (o.autoYesSeconds !== undefined && o.autoYesSeconds > 0) {
    const base = o.yes ?? '네';
    let left = Math.ceil(o.autoYesSeconds);
    yesBtn.textContent = autoYesLabel(base, left);
    yesBtn.dataset.autoYes = String(left);
    autoTimer = setInterval(() => {
      left--;
      if (left <= 0) return yes();
      yesBtn.textContent = autoYesLabel(base, left);
      yesBtn.dataset.autoYes = String(left);
    }, 1000);
  }
  if (typed) {
    const t = typed;
    t.addEventListener('input', () => { yesBtn.disabled = !!o.yesDisabled || !matched(); });
    // Enter = [예](맞게 쳤을 때만), Esc 는 입력 칸에서 기기 뒤로까지 번지게 둔다(= 아니요) — 한글 조합 중 Enter 는 글자 확정
    t.addEventListener('keydown', (e) => {
      if (e.isComposing || e.key !== 'Enter') return;
      e.preventDefault();
      e.stopPropagation();
      yes();
    });
  }
  main.append(actions);
  layer.append(modal);
  getOverlayHost().append(layer);
  // 공용 창은 열린 동안 튜토리얼 카드·입력 막기를 비켜 간다 (GDD 222장 1) — 카드와 겹쳐도 창 버튼이 눌린다
  uncover = coverTutorials(layer);
  untrap = trapModalFocus(layer); // 초기 초점(첫 버튼)·Tab 순환·배경 inert (C.139, GDD 88장 9) — 기기 선택은 초점 있는 항목에서 시작
  // 기본 선택 = 주 버튼(시작·귀환하기) (C.170, GDD 100장 #7·#8·#31): 강조가 둘(밝은 주 버튼 + 선택 테두리)로 갈리지 않게.
  // 지우기·덮어쓰기 같은 위험한 확인(danger)은 그대로 '아니요'에서 시작한다
  // 입력 확인 창(GDD 244장 1): 입력 칸에 자동 초점을 주지 않는다 — 폰에서 자판이 바로 떠 안내 문구를 가리므로, 입력 칸을 눌러야 자판이 뜬다.
  // trapModalFocus 가 첫 항목(입력 칸)에 준 초점을 '아니요'로 옮긴다(위험한 확인의 기본 선택)
  if (typed) (noBtn ?? yesBtn).focus({ preventScroll: true });
  else if (!o.danger && !o.focusNo && !yesBtn.disabled) yesBtn.focus({ preventScroll: true });
  const cancel = o.onCancel;
  unregister = registerLayer(layer, o.noCancel ? () => {} : cancel ? () => { close(); cancel(); } : no);
  return close;
}
