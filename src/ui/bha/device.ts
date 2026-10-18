// 다마고치형 기기 틀 + 항목 선택 시스템 (GDD 16장, T-1).
//   [왼쪽: 위/아래] [가운데: LCD 창] [오른쪽: 확정 / 작은 취소]. 버튼에는 글자 없이 아이콘만. 세로로 들면 "가로로 돌려주세요" 안내.
// 화면은 두 가지로 항목을 알린다: (1) setItems 로 직접 등록(방 화면), (2) 등록이 없으면 LCD 안의 누를 수 있는 요소를 자동으로 찾는다(옛 화면).
// 위/아래는 하이라이트(.bha-sel)를 순서대로 옮기고(끝에서 순환), 확정은 실행(click), 취소는 열린 레이어 → 화면 스택 한 단계 뒤로.
// 전투 화면(.bha-battle)은 터치 위주라 위/아래는 쉬고 확정만 [data-dev-confirm](일시정지)에 쓴다 (dev-log C.25 결정).
import { el, icon } from './dom';
import { keepSelection, stepIndex } from './select';
import { setOverlayHost } from './overlayHost';

export interface SelectItem {
  el: HTMLElement;
  /** 없으면 el.click() */
  activate?: () => void;
}

export interface DeviceOpts {
  /** 취소 버튼: 열린 레이어가 없을 때 불린다. 뒤로 갔으면 true */
  onCancel: () => boolean;
  /** 취소로 닫을 화면이 있는가 (버튼 표시용) */
  canCancel: () => boolean;
}

export interface Device {
  /** 화면 루트: 화면들은 mountApp(device.view, …) 로 그린다 */
  view: HTMLElement;
  lcd: HTMLElement;
  /** 화면이 선택 가능 항목을 등록한다. scope 가 화면에서 사라지면 등록은 저절로 풀리고 자동 탐색으로 돌아간다 */
  setItems(items: SelectItem[], scope: HTMLElement, onChange?: (item: SelectItem | null) => void): void;
  move(dir: 1 | -1): void;
  confirm(): void;
  cancel(): void;
  /** 다시 계산(화면 이동 뒤·상태 변화 뒤) */
  refresh(): void;
  destroy(): void;
}

const AUTO_SELECTOR = 'button, a[href], input, select, summary, [role="tab"]';

function visible(e: HTMLElement): boolean {
  if (e.closest('[hidden], [inert]')) return false;
  if (e instanceof HTMLButtonElement || e instanceof HTMLInputElement || e instanceof HTMLSelectElement) if (e.disabled) return false;
  if (e instanceof HTMLInputElement && e.type === 'hidden') return false;
  return e.getClientRects().length > 0;
}

export function scanItems(scope: ParentNode): SelectItem[] {
  return [...scope.querySelectorAll<HTMLElement>(AUTO_SELECTOR)].filter(visible).map((e) => ({ el: e }));
}

function devButton(cls: string, label: string, glyph: HTMLElement | SVGElement): HTMLButtonElement {
  const b = el('button', `bha-dev__btn ${cls}`);
  b.type = 'button';
  b.setAttribute('aria-label', label);
  b.append(glyph);
  return b;
}

export function createDevice(root: HTMLElement, opts: DeviceOpts): Device {
  const upIcon = icon('i-chevron-down', undefined, 'bha-dev__flip');
  const up = devButton('bha-dev__btn--dir', '위', upIcon);
  const down = devButton('bha-dev__btn--dir', '아래', icon('i-chevron-down'));
  const ok = devButton('bha-dev__btn--ok', '확정', icon('i-check'));
  const back = devButton('bha-dev__btn--back', '취소', icon('i-chevron-left'));
  const left = el('div', 'bha-dev__side bha-dev__side--left');
  left.append(up, down);
  const right = el('div', 'bha-dev__side bha-dev__side--right');
  right.append(ok, back);

  const view = el('div', 'bha-lcd__view');
  const lcd = el('div', 'bha-lcd');
  lcd.append(view);
  const bezel = el('div', 'bha-dev__bezel');
  bezel.append(lcd);
  const dev = el('div', 'bha-dev');
  dev.append(left, bezel, right);

  const rotate = el('div', 'bha-rotate');
  rotate.setAttribute('role', 'status');
  const rot = el('span', 'bha-rotate__phone');
  rot.setAttribute('aria-hidden', 'true');
  rotate.append(rot, el('p', 'bha-rotate__text', '가로로 돌려주세요'), el('p', 'bha-rotate__sub', '이 게임은 기기를 눕혀서 한다'));
  root.replaceChildren(dev, rotate);

  // ── 선택 상태 ──
  let items: SelectItem[] = [];
  let index = -1;
  let explicit: { scope: HTMLElement; items: SelectItem[]; onChange?: (i: SelectItem | null) => void } | null = null;
  const layers: { el: HTMLElement; onCancel: () => void }[] = [];
  let touchOnly = false;

  const markSel = () => {
    for (const it of items) it.el.classList.remove('bha-sel');
    const cur = items[index];
    if (cur) cur.el.classList.add('bha-sel');
  };

  function refresh(): void {
    const prev = items;
    const prevIdx = index;
    const layer = layers[layers.length - 1];
    // 전투 중 일시정지·승패 오버레이(.bha-overlay)가 열리면 그 안의 버튼을 고른다
    const ov = view.querySelector<HTMLElement>('.bha-battle .bha-overlay');
    touchOnly = !layer && !ov && !!view.querySelector('.bha-battle');
    if (explicit && !explicit.scope.isConnected) explicit = null;
    let next: SelectItem[];
    if (layer) next = scanItems(layer.el);
    else if (ov) next = scanItems(ov);
    else if (touchOnly) next = [];
    else if (explicit) next = explicit.items.filter((i) => i.el.isConnected && !i.el.hasAttribute('hidden'));
    else next = scanItems(view);
    items = next;
    if (next.length > 0 && !prev.some((i) => i.el.isConnected && next.some((n) => n.el === i.el))) {
      // 새 화면(이전 항목이 하나도 안 남음): 키보드 초점이 이미 있는 항목이 있으면 그것, 없으면 첫 항목
      const focused = next.findIndex((i) => i.el === document.activeElement);
      index = focused >= 0 ? focused : 0;
    } else {
      index = keepSelection(prev.map((i) => i.el), prevIdx, next.map((i) => i.el));
    }
    for (const p of prev) if (!next.includes(p)) p.el.classList.remove('bha-sel');
    markSel();
    const cur = items[index] ?? null;
    if (cur && cur !== prev[prevIdx]) {
      cur.el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      if (cur.el instanceof HTMLInputElement) cur.el.focus({ preventScroll: true });
    }
    if (!layer && explicit?.onChange && cur !== prev[prevIdx]) explicit.onChange(cur);
    const canMove = items.length > 0;
    up.classList.toggle('is-off', !canMove);
    down.classList.toggle('is-off', !canMove);
    ok.classList.toggle('is-off', !(canMove || (touchOnly && !!view.querySelector('[data-dev-confirm]'))));
    back.classList.toggle('is-off', layers.length === 0 && !opts.canCancel());
  }

  let raf = 0;
  const schedule = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      refresh();
    });
  };
  const mo = new MutationObserver(schedule);
  mo.observe(lcd, { childList: true, subtree: true });

  function move(dir: 1 | -1): void {
    if (items.length === 0) return;
    index = stepIndex(index, dir, items.length);
    markSel();
    const cur = items[index]!;
    cur.el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (cur.el instanceof HTMLInputElement) cur.el.focus({ preventScroll: true });
    if (!layers.length) explicit?.onChange?.(cur);
  }

  function confirm(): void {
    if (touchOnly) {
      view.querySelector<HTMLElement>('[data-dev-confirm]')?.click();
      return;
    }
    const cur = items[index];
    if (!cur) return;
    if (cur.activate) cur.activate();
    else cur.el.click();
  }

  function cancel(): void {
    const layer = layers[layers.length - 1];
    if (layer) layer.onCancel();
    else opts.onCancel();
    schedule();
  }

  up.onclick = () => move(-1);
  down.onclick = () => move(1);
  ok.onclick = confirm;
  back.onclick = cancel;

  // 화면을 직접 만지면 그 항목을 하이라이트로 옮긴다 (실행은 항목 자신의 click 이 한다)
  lcd.addEventListener('pointerdown', (e) => {
    const t = e.target as Element | null;
    const at = items.findIndex((i) => i.el === t || i.el.contains(t));
    if (at >= 0 && at !== index) {
      index = at;
      markSel();
      explicit?.onChange?.(items[at]!);
    }
  }, true);

  const onKey = (e: KeyboardEvent) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'ArrowUp') move(-1);
    else if (e.key === 'ArrowDown') move(1);
    else if (e.key === 'Enter') confirm();
    else if (e.key === 'Escape') cancel();
    else return;
    e.preventDefault();
  };
  window.addEventListener('keydown', onKey);

  setOverlayHost(lcd, (layerEl, onCancel) => {
    const entry = { el: layerEl, onCancel };
    layers.push(entry);
    schedule();
    return () => {
      const i = layers.indexOf(entry);
      if (i >= 0) layers.splice(i, 1);
      schedule();
    };
  });

  schedule();

  return {
    view,
    lcd,
    setItems(list, scope, onChange) {
      explicit = { scope, items: list, onChange };
      items = [];
      index = -1;
      refresh();
    },
    move,
    confirm,
    cancel,
    refresh,
    destroy() {
      mo.disconnect();
      window.removeEventListener('keydown', onKey);
      setOverlayHost(null);
    },
  };
}
