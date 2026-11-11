// 가로 끌어서 넘기기 (GDD 241-D 3 장비 분류 탭: 좁히지 않고 가로 드래그로 본다). 손가락은 브라우저 기본 가로 스크롤, 마우스·펜은 여기서 끈다.
// 5px 넘게 끌면 그 뒤 클릭(탭 바꾸기)을 한 번 먹는다 — 끄는 것과 누르는 것을 가린다.
export function enableDragScroll(root: HTMLElement, signal?: AbortSignal): void {
  let start: { x: number; left: number; id: number } | null = null;
  let moved = false;
  root.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch' || e.button !== 0) return;
    start = { x: e.clientX, left: root.scrollLeft, id: e.pointerId };
    moved = false;
  }, { signal });
  root.addEventListener('pointermove', (e) => {
    if (!start || e.pointerId !== start.id) return;
    const dx = e.clientX - start.x;
    if (!moved && Math.abs(dx) < 5) return;
    if (!moved) root.setPointerCapture?.(e.pointerId);
    moved = true;
    root.scrollLeft = start.left - dx;
  }, { signal });
  const end = (e: PointerEvent) => {
    if (start && e.pointerId === start.id) start = null;
  };
  root.addEventListener('pointerup', end, { signal });
  root.addEventListener('pointercancel', end, { signal });
  root.addEventListener('click', (e) => {
    if (!moved) return;
    moved = false;
    e.stopPropagation();
    e.preventDefault();
  }, { capture: true, signal });
}

/** 가로로 넘치는 줄의 '더 있음' 표시 (GDD 243장 4): 넘친 쪽 끝을 흐리게(is-more-left·is-more-right) — 드래그로 넘겨 본다는 신호.
 *  pick = 처음에 보이게 맞출 칸(고른 탭). 화면에 붙은 뒤·스크롤할 때마다 다시 잰다 */
export function edgeCue(root: HTMLElement, pick?: HTMLElement | null, signal?: AbortSignal): void {
  const paint = (): void => {
    const max = root.scrollWidth - root.clientWidth;
    root.classList.toggle('is-more-left', max > 1 && root.scrollLeft > 1);
    root.classList.toggle('is-more-right', max > 1 && root.scrollLeft < max - 1);
  };
  root.addEventListener('scroll', paint, { passive: true, signal });
  requestAnimationFrame(() => {
    if (!root.isConnected) return;
    if (pick) {
      const r = pick.getBoundingClientRect();
      const box = root.getBoundingClientRect();
      if (r.right > box.right) root.scrollLeft += r.right - box.right;
      else if (r.left < box.left) root.scrollLeft -= box.left - r.left;
    }
    paint();
  });
}
