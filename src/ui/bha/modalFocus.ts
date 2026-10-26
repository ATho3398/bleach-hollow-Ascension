// 공용 모달 초점 (C.139, GDD 88장 9): 초기 초점·Tab 순환·배경 inert·닫힌 뒤 초점 복귀.
// 기기 방향키 선택(device.ts registerLayer)은 그대로 두고, 키보드 Tab 과 보조기기 초점만 모달 안에 가둔다.
// 배경 = 같은 부모(오버레이 자리, 보통 LCD 창) 안의 다른 요소. 기기 몸체 버튼은 LCD 밖이라 그대로 눌린다.

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Tab 순환: 지금 i(-1 = 모달 밖), 개수 n, Shift 면 뒤로. 끝에서 처음으로·처음에서 끝으로 돈다 */
export function nextFocusIndex(i: number, n: number, back: boolean): number {
  if (n <= 0) return -1;
  if (back) return i <= 0 ? n - 1 : i - 1;
  return i < 0 || i >= n - 1 ? 0 : i + 1;
}

/** 모달 레이어를 붙인 뒤 부른다. 돌려주는 함수(닫을 때)는 배경을 되살리고 열기 전 초점으로 돌려준다 */
export function trapModalFocus(layer: HTMLElement): () => void {
  const doc = layer.ownerDocument;
  const prev = doc.activeElement instanceof HTMLElement ? doc.activeElement : null;
  const inerted: HTMLElement[] = [];
  for (const sib of Array.from(layer.parentElement?.children ?? [])) {
    if (sib === layer || !(sib instanceof HTMLElement) || sib.hasAttribute('inert')) continue;
    sib.setAttribute('inert', '');
    inerted.push(sib);
  }
  const focusables = () => Array.from(layer.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((e) => !e.closest('[hidden]'));
  focusables()[0]?.focus({ preventScroll: true });
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Tab' || !layer.isConnected) return;
    const list = focusables();
    e.preventDefault();
    const next = nextFocusIndex(list.indexOf(doc.activeElement as HTMLElement), list.length, e.shiftKey);
    if (next >= 0) list[next]!.focus();
  };
  doc.addEventListener('keydown', onKey, true);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    doc.removeEventListener('keydown', onKey, true);
    for (const s of inerted) s.removeAttribute('inert');
    if (prev?.isConnected && !prev.closest('[inert]')) prev.focus({ preventScroll: true });
  };
}
