// 다마고치형 기기 틀 + 항목 선택 시스템 (GDD 16장, T-1).
//   [왼쪽: 위/아래] [가운데: LCD 창] [오른쪽: 확정 / 작은 취소]. 버튼에는 글자 없이 아이콘만. 세로로 들면 기기 전체를 돌려 출력(viewport.ts).
// 화면은 두 가지로 항목을 알린다: (1) setItems 로 직접 등록(방 화면), (2) 등록이 없으면 LCD 안의 누를 수 있는 요소를 자동으로 찾는다(옛 화면).
// 위/아래는 하이라이트(.bha-sel)를 순서대로 옮기고(끝에서 순환), 확정은 실행(click), 취소는 열린 레이어 → 화면 스택 한 단계 뒤로.
// 전투 화면(.bha-battle)은 터치 위주라 위/아래는 쉬고 확정만 [data-dev-confirm](일시정지)에 쓴다 (dev-log C.25 결정).
import { el, icon } from './dom';
import { keepSelection, orderByRank, stepIndex } from './select';
import { setOverlayHost } from './overlayHost';
import { BASE_H, BASE_W, currentViewState, isPcMode, loadViewScale, resolveViewScale, saveViewScale, setViewState, shortcutScale, VIEW_SCALE_EVENT } from '../viewScale';
import { actionFor, isNavAction } from '../shortcutMap';
import { KEY_HINTS_EVENT, loadKeyHints } from '../keyHints';
import { badgePlan, detectCtx, isTypingTarget, runAction, runCancelHooks, syncBadges } from './shortcuts';
import { computeFit, computePcFit, deviceInsets, fitTransform, pickViewport, setFit, type Fit } from './viewport';

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
  /** 세로/가로가 바뀔 때부른다. true = 세로(기기를 돌려 놓음) */
  onRotate?: (rotated: boolean) => void;
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
  /** 기기 틀 요소 (.bha-dev: 버튼 + LCD). 다마고치 모드(GDD 27장)가 둘레에 몸체를 붙인다 */
  frame: HTMLElement;
  /**
   * 기기 transform 뒤에 붙일 무대 변환 (다마고치 모드 줌아웃·뒤집기). 맞춤을 다시 계산할 때마다 불러 그 결과를 붙인다. null = 없음.
   * 바꾼 뒤 restage() 로 바로 반영한다
   */
  setStage(fn: ((f: Fit) => string) | null): void;
  restage(): void;
  destroy(): void;
}

const AUTO_SELECTOR = 'button, a[href], input, select, summary, [role="tab"]';

function visible(e: HTMLElement): boolean {
  if (e.closest('[hidden], [inert]')) return false;
  if (e instanceof HTMLButtonElement || e instanceof HTMLInputElement || e instanceof HTMLSelectElement) if (e.disabled) return false;
  if (e instanceof HTMLInputElement && e.type === 'hidden') return false;
  return e.getClientRects().length > 0;
}

/**
 * 자동으로 찾는 항목의 순서는 화면(DOM) 순서다. 단, 위/아래로 고르지 않는 요소(보조 슬라이더 입력 등)에는 data-dev-skip 을 붙이고,
 * 나중에 고르게 하고 싶은 요소(탭·머리 버튼)에는 data-dev-order="1" 을 붙이면 같은 화면의 나머지 뒤로 간다 (손가락으로는 그대로 만진다).
 */
export function scanItems(scope: ParentNode): SelectItem[] {
  const found = [...scope.querySelectorAll<HTMLElement>(AUTO_SELECTOR)].filter((e) => visible(e) && !e.hasAttribute('data-dev-skip'));
  return orderByRank(found, (e) => Number(e.getAttribute('data-dev-order') ?? 0)).map((e) => ({ el: e }));
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
  left.setAttribute('role', 'group');
  left.setAttribute('aria-label', '항목 이동 버튼');
  left.append(up, down);
  const right = el('div', 'bha-dev__side bha-dev__side--right');
  right.setAttribute('role', 'group');
  right.setAttribute('aria-label', '확정·취소 버튼');
  right.append(ok, back);

  const view = el('div', 'bha-lcd__view');
  const lcd = el('div', 'bha-lcd');
  lcd.setAttribute('role', 'region');
  lcd.setAttribute('aria-label', '게임 화면');
  lcd.append(view);
  const bezel = el('div', 'bha-dev__bezel');
  bezel.append(lcd);
  const dev = el('div', 'bha-dev');
  dev.append(left, bezel, right);

  root.replaceChildren(dev);

  // ── 화면 맞춤: 가로면 그대로, 세로면 기기 전체를 돌려 채운다 (GDD 16-6). 방향이 바뀌어도 화면은 다시 만들지 않고 틀만 다시 계산한다 ──
  // 뷰포트 크기는 고정 위치 프로브로 잰다: iOS Safari 의 주소창이 접히고 펴져 보이는 높이가 바뀌어도(100dvh 와 같은 값) 따라간다.
  // 프로브 padding 에 안전 영역(env)을 넣어 같이 읽어, 돌린·줄인 기기 안 여백으로 바꿔 쓴다 (viewport-fit=cover 를 켰을 때만 0 이 아니다)
  const matchesMedia = (q: string): boolean => {
    try {
      return typeof matchMedia === 'function' && matchMedia(q).matches;
    } catch {
      return false;
    }
  };
  const safeStorage = (): Storage | null => {
    try {
      return localStorage;
    } catch {
      return null;
    }
  };
  const probe = el('div', 'bha-dev__probe');
  probe.setAttribute('aria-hidden', 'true');
  let lastRotated: boolean | null = null;
  let stageFn: ((f: Fit) => string) | null = null;
  const fitDevice = () => {
    const r = probe.getBoundingClientRect();
    const vp = pickViewport(r, window);
    // PC(마우스·넓은 창)는 기기를 기준 크기로 고정해 가운데에 두고, 배율은 CSS 변수 --bha-scale 로 키운다 (GDD 17-5). 터치 폰·태블릿은 아래 기존 맞춤
    const pc = isPcMode(matchesMedia('(hover: hover)'), matchesMedia('(pointer: fine)'), vp.w, vp.h);
    const pref = loadViewScale(safeStorage());
    const view = resolveViewScale(pref, vp.w, vp.h);
    setViewState({ pc, pref, view });
    const f = pc ? computePcFit(vp.w, vp.h, view.scale, BASE_W, BASE_H) : computeFit(vp.w, vp.h);
    setFit(f);
    document.documentElement.classList.toggle('bha-pc', pc);
    dev.classList.toggle('is-pc', pc);
    dev.style.setProperty('--bha-scale', pc ? String(view.scale) : '1');
    dev.classList.toggle('is-rotated', f.rotated);
    if (f.rotated !== lastRotated) {
      const first = lastRotated === null; // 시작할 때의 방향은 "전환"이 아니다
      lastRotated = f.rotated;
      if (!first) opts.onRotate?.(f.rotated);
    }
    dev.classList.toggle('is-narrow', f.scale < 1); // 긴 쪽이 740px 미만인 좁은 폰: 블록 바를 아래 전폭으로 (lcd.css)
    dev.style.width = `${f.w}px`;
    dev.style.height = `${f.h}px`;
    // 다마고치 모드(GDD 27장): 맞춤 변환 뒤에 줌아웃·뒤집기를 붙인다 (기기 안 좌표 기준이라 세로 회전·PC 배율에서도 같다)
    const stage = stageFn ? stageFn(f) : '';
    if (pc) {
      // zoom 은 레이아웃 크기를 실제로 키운다(글자·터치 영역 포함). left/top 도 zoom 단위라 배율로 나눠 넣는다
      dev.style.transform = stage ? `translateZ(0) ${stage}` : 'translateZ(0)';
      dev.style.left = `${(f.ox ?? 0) / f.scale}px`;
      dev.style.top = `${(f.oy ?? 0) / f.scale}px`;
    } else {
      dev.style.transform = stage ? `${fitTransform(f)} ${stage}` : fitTransform(f);
      dev.style.left = '';
      dev.style.top = '';
    }
    dev.style.setProperty('--dev-scale', pc ? '1' : String(f.scale));
    const cs = getComputedStyle(probe);
    const ins = deviceInsets(f, { top: parseFloat(cs.paddingTop) || 0, right: parseFloat(cs.paddingRight) || 0, bottom: parseFloat(cs.paddingBottom) || 0, left: parseFloat(cs.paddingLeft) || 0 });
    dev.style.setProperty('--dev-inset-top', `${ins.top}px`);
    dev.style.setProperty('--dev-inset-right', `${ins.right}px`);
    dev.style.setProperty('--dev-inset-bottom', `${ins.bottom}px`);
    dev.style.setProperty('--dev-inset-left', `${ins.left}px`);
  };
  root.append(probe);
  fitDevice();
  // 방향 전환 직후에는 브라우저가 옛 크기를 잠깐 돌려주는 일이 있어(iOS) 한 프레임·0.3초 뒤에 한 번씩 더 계산한다
  const refit = () => {
    fitDevice();
    requestAnimationFrame(fitDevice);
    window.setTimeout(fitDevice, 300);
  };
  window.addEventListener('resize', fitDevice);
  window.addEventListener(VIEW_SCALE_EVENT, fitDevice);
  window.addEventListener('orientationchange', refit);
  window.visualViewport?.addEventListener('resize', fitDevice);

  // ── 선택 상태 ──
  let items: SelectItem[] = [];
  let index = -1;
  let explicit: { scope: HTMLElement; items: SelectItem[]; onChange?: (i: SelectItem | null) => void } | null = null;
  const layers: { el: HTMLElement; onCancel: () => void }[] = [];
  let touchOnly = false;

  let lastSel: HTMLElement | null = null;
  const unmark = (e: HTMLElement) => {
    e.classList.remove('bha-sel');
    e.removeAttribute('aria-current');
  };
  const markSel = () => {
    for (const it of items) unmark(it.el);
    const cur = items[index];
    if (cur) {
      cur.el.classList.add('bha-sel');
      cur.el.setAttribute('aria-current', 'true');
    }
    // 하이라이트가 새 항목으로 옮겨 가면 그 요소에 'bha-select' 를 보낸다 (목록 → 상세 화면이 따라 바뀐다, T-3)
    const now = cur?.el ?? null;
    if (now && now !== lastSel) {
      lastSel = now;
      now.dispatchEvent(new CustomEvent('bha-select'));
    } else if (!now) lastSel = null;
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
    for (const p of prev) if (!next.includes(p)) unmark(p.el);
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
    for (const b of [up, down, ok, back]) b.setAttribute('aria-disabled', String(b.classList.contains('is-off')));
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
  // hidden·disabled 가 바뀌어도(진화 연출 줄 → 결과 전환, 비활성 버튼) 항목을 다시 센다 (class 는 보지 않는다: 하이라이트 자신의 변화로 되돌아오지 않게)
  mo.observe(lcd, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'disabled'] });
  // 창 크기·방향이 바뀌면 화면 속 선택 항목을 다시 센다 (T-2, 세로 회전 출력은 T-3)
  window.addEventListener('resize', schedule);

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

  /** 키보드 취소: 화면이 고른 것(배치판의 선택)을 먼저 풀어야 하면 그것만 하고 뒤로 가지 않는다 */
  function keyCancel(): void {
    if (runCancelHooks(layers[layers.length - 1]?.el ?? null)) return;
    cancel();
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
    // PC: +/- 로 1배↔2배 (GDD 17-5). 입력칸에서 칠 때는 무시
    const t = e.target;
    const typing = isTypingTarget(t);
    const want = currentViewState().pc ? shortcutScale(e.key, { ctrl: e.ctrlKey, meta: e.metaKey, alt: e.altKey }, typing) : null;
    if (want !== null) {
      if (want !== currentViewState().pref) {
        saveViewScale(safeStorage(), want);
        fitDevice();
        window.dispatchEvent(new CustomEvent(VIEW_SCALE_EVENT));
      }
      e.preventDefault();
      return;
    }
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    // PC 단축키 (GDD 18-5): 물리 키(e.code) 기준이라 한글 입력기 상태에서도 같다. 글자 입력 중·반복 입력·조합 중에는 무시한다
    if (!e.defaultPrevented && !typing && !e.isComposing && currentViewState().pc) {
      const action = actionFor(detectCtx(view, layers.length > 0), e.code);
      if (action) {
        if (!e.repeat) {
          if (action === 'prev') move(-1);
          else if (action === 'next') move(1);
          else if (action === 'confirm') confirm();
          else if (action === 'cancel') keyCancel();
          else if (!isNavAction(action)) runAction(layers[layers.length - 1]?.el ?? view, action);
          schedule();
        }
        heldKeys.add(e.code);
        e.preventDefault();
        return;
      }
    }
    if (e.key === 'ArrowUp') move(-1);
    else if (e.key === 'ArrowDown') move(1);
    else if (e.key === 'Enter') confirm();
    else if (e.key === 'Escape') keyCancel();
    else return;
    e.preventDefault();
  };
  window.addEventListener('keydown', onKey);
  // 처리한 키는 뗄 때도 브라우저 기본 동작(포커스 있는 버튼의 Space 클릭)을 막고, 창이 포커스를 잃으면 눌림 기록을 비운다
  const heldKeys = new Set<string>();
  const onKeyUp = (e: KeyboardEvent) => {
    if (heldKeys.delete(e.code)) e.preventDefault();
  };
  const onBlur = () => heldKeys.clear();
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

  // 버튼 구석의 키 글자 배지: PC 모드에서만, [단축키 표시]가 켜져 있을 때만 (터치 폰에서는 없다)
  const hintStorage = (): Storage | null => {
    try {
      return localStorage;
    } catch {
      return null;
    }
  };
  let hintsOn = loadKeyHints(hintStorage());
  const updateBadges = () => {
    const on = hintsOn && currentViewState().pc;
    dev.classList.toggle('has-keycaps', on);
    syncBadges(view, on ? badgePlan(layers[layers.length - 1]?.el ?? view, detectCtx(view, layers.length > 0)) : new Map());
  };
  let badgeRaf = 0;
  const scheduleBadges = () => {
    if (badgeRaf) return;
    badgeRaf = requestAnimationFrame(() => {
      badgeRaf = 0;
      updateBadges();
    });
  };
  const onHints = () => {
    hintsOn = loadKeyHints(hintStorage());
    scheduleBadges();
  };
  window.addEventListener(KEY_HINTS_EVENT, onHints);
  const badgeMo = new MutationObserver((list) => {
    // 배지 자신을 붙이고 떼는 변화는 무시한다 (되먹임 방지)
    if (list.every((m) => [...m.addedNodes, ...m.removedNodes].every((n) => n instanceof HTMLElement && n.classList.contains('bha-keycap')))) return;
    scheduleBadges();
  });
  badgeMo.observe(lcd, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'disabled'] });
  window.addEventListener('resize', scheduleBadges);
  window.addEventListener(VIEW_SCALE_EVENT, scheduleBadges);
  scheduleBadges();

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
    frame: dev,
    setStage(fn) {
      stageFn = fn;
    },
    restage: fitDevice,
    destroy() {
      mo.disconnect();
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener(KEY_HINTS_EVENT, onHints);
      window.removeEventListener('resize', scheduleBadges);
      window.removeEventListener(VIEW_SCALE_EVENT, scheduleBadges);
      badgeMo.disconnect();
      window.removeEventListener(VIEW_SCALE_EVENT, fitDevice);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('resize', fitDevice);
      window.removeEventListener('orientationchange', refit);
      window.visualViewport?.removeEventListener('resize', fitDevice);
      setOverlayHost(null);
    },
  };
}
