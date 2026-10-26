// 끌어다 놓기 공용 (C.141 타일 끌어놓기와 같은 방식, C.149 슬롯 화면): 터치는 잠깐(200ms) 눌러야 끌리고(그 전에 움직이면 화면 스크롤), 마우스는 5px 끌면 시작한다.
// 끌고 가는 표시는 아이콘 원 하나(.bha-drag-ghost). 놓은 곳이 없으면(target null) 호출한 쪽이 "빼기" 같은 뜻으로 쓸 수 있다. 이어서 오는 click 은 한 번 막는다.
import { el } from './dom';

export interface DragOptions<S> {
  root: HTMLElement;
  /** 끌 수 있는 요소(= 눌린 곳에서 가장 가까운 [data-drag])에서 출발 정보를 만든다. null 이면 끌지 않는다 */
  sourceOf: (node: HTMLElement) => S | null;
  /** 놓을 수 있는 곳을 찾는 범위 (기본 root). 왼쪽·오른쪽 열처럼 끌기 시작 요소와 놓을 곳이 다른 root 에 있으면 둘을 감싸는 요소를 준다 */
  scope?: () => Element;
  /** 놓을 수 있는 곳을 가리키는 선택자 */
  targetSelector: string;
  /** 놓았을 때. target 은 놓은 곳(없으면 null) */
  onDrop: (src: S, target: HTMLElement | null) => void;
}

const HOLD_MS = 200;

export function enableDrag<S>(o: DragOptions<S>): void {
  const { root } = o;
  let suppress = false;
  const targetAt = (x: number, y: number): HTMLElement | null => {
    const t = document.elementFromPoint(x, y)?.closest<HTMLElement>(o.targetSelector);
    return t && (o.scope?.() ?? root).contains(t) ? t : null;
  };
  root.addEventListener('pointerdown', (e) => {
    const from = (e.target as Element).closest<HTMLElement>('[data-drag]');
    const src = from ? o.sourceOf(from) : null;
    if (!from || src === null) return;
    const touch = e.pointerType !== 'mouse';
    const id = e.pointerId;
    const x0 = e.clientX;
    const y0 = e.clientY;
    let ghost: HTMLElement | null = null;
    let over: HTMLElement | null = null;
    let timer = 0;
    const start = (x: number, y: number) => {
      window.clearTimeout(timer);
      ghost = el('span', 'bha-drag-ghost');
      ghost.style.setProperty('--tile', getComputedStyle(from).getPropertyValue('--bha-lin-color') || 'var(--bha-bg-3)');
      const svg = from.querySelector('svg');
      if (svg) ghost.append(svg.cloneNode(true));
      ghost.style.left = `${x}px`;
      ghost.style.top = `${y}px`;
      document.body.append(ghost);
      from.classList.add('is-dragging');
      root.classList.add('is-dragging-tile');
    };
    const finish = (drop: boolean, x: number, y: number) => {
      window.clearTimeout(timer);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      root.removeEventListener('touchmove', block);
      if (!ghost) return;
      ghost.remove();
      over?.classList.remove('is-drop');
      from.classList.remove('is-dragging');
      root.classList.remove('is-dragging-tile');
      suppress = true;
      window.setTimeout(() => { suppress = false; }, 0);
      if (drop) o.onDrop(src, targetAt(x, y));
    };
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      if (!ghost) {
        const d = Math.hypot(ev.clientX - x0, ev.clientY - y0);
        if (touch) {
          if (d > 10) finish(false, 0, 0); // 먼저 움직이면 스크롤
        } else if (d > 5) start(ev.clientX, ev.clientY);
        return;
      }
      ghost.style.left = `${ev.clientX}px`;
      ghost.style.top = `${ev.clientY}px`;
      const t = targetAt(ev.clientX, ev.clientY);
      if (t !== over) {
        over?.classList.remove('is-drop');
        t?.classList.add('is-drop');
        over = t;
      }
    };
    const up = (ev: PointerEvent) => finish(true, ev.clientX, ev.clientY);
    const cancel = () => finish(false, 0, 0);
    const block = (ev: TouchEvent) => { if (ghost && ev.cancelable) ev.preventDefault(); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    root.addEventListener('touchmove', block, { passive: false });
    if (touch) timer = window.setTimeout(() => start(x0, y0), HOLD_MS);
  });
  root.addEventListener('click', (e) => {
    if (!suppress) return;
    e.stopPropagation();
    e.preventDefault();
  }, true);
}
