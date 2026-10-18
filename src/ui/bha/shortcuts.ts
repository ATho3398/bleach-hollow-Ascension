// PC 단축키의 DOM 쪽 (GDD 18-5): 지금 화면이 어떤 맥락인지 알아내고, 액션을 화면 요소 클릭 또는 등록된 처리기로 옮기고, 버튼 구석에 키 글자 배지를 붙인다.
// 매핑 데이터·충돌 검사는 shortcutMap.ts(순수). 이 파일은 DOM 만 안다. 종족과 무관하다.
import { keyLabel, keysOf, type ShortcutAction, type ShortcutCtx } from '../shortcutMap';

const CLICKABLE = 'button, a[href], input, select, summary, [role="tab"]';

export function isTypingTarget(t: EventTarget | null): boolean {
  const e = t as HTMLElement | null;
  if (!e || !e.tagName) return false;
  if (e.tagName === 'TEXTAREA' || e.isContentEditable) return true;
  if (e.tagName === 'INPUT') {
    // 슬라이더·체크박스처럼 글자를 치지 않는 입력은 단축키를 막지 않는다
    return !['range', 'checkbox', 'radio', 'button', 'submit', 'reset'].includes((e as HTMLInputElement).type);
  }
  return false;
}

function shown(e: HTMLElement, withDisabled = false): boolean {
  if (e.closest('[hidden], [inert]')) return false;
  if (!withDisabled && ((e instanceof HTMLButtonElement || e instanceof HTMLInputElement || e instanceof HTMLSelectElement) && e.disabled)) return false;
  return e.getClientRects().length > 0;
}

/** 지금 화면의 단축키 맥락. 열린 레이어·일시정지/결과 오버레이·튜토리얼이 있으면 메뉴(이동·확정·취소) 키 */
export function detectCtx(view: ParentNode, layerOpen: boolean): ShortcutCtx {
  if (layerOpen) return 'menu';
  if (view.querySelector('.bha-battle')) {
    return view.querySelector('.bha-battle .bha-overlay, .bha-tut') ? 'menu' : 'battle';
  }
  if (view.querySelector('.bha-homedock')) return 'room';
  if (view.querySelector('[data-screen="expedition-plan"]')) return 'plan';
  return 'menu';
}

// ── 취소 키(Q·Esc) 가로채기: 화면이 '고른 것'을 먼저 풀어야 할 때(배치판) 쓴다. 풀었으면 true → 뒤로 가지 않는다. 'gone' 이면 화면이 사라진 것이라 등록을 지운다 ──
type CancelHook = (topLayer: Element | null) => boolean | 'gone';
const cancelHooks = new Set<CancelHook>();
export function registerCancelHook(h: CancelHook): () => void {
  cancelHooks.add(h);
  return () => cancelHooks.delete(h);
}
export function runCancelHooks(topLayer: Element | null): boolean {
  let used = false;
  for (const h of [...cancelHooks]) {
    const r = h(topLayer);
    if (r === 'gone') cancelHooks.delete(h);
    else if (r) used = true;
  }
  return used;
}

// ── 액션 처리기: 화면(전투)이 직접 등록한다. 처리했으면 true ──
const handlers = new Map<ShortcutAction, () => boolean | void>();
export function registerShortcutHandlers(h: Record<ShortcutAction, () => boolean | void>): () => void {
  const keys = Object.keys(h);
  for (const k of keys) handlers.set(k, h[k]!);
  return () => {
    for (const k of keys) if (handlers.get(k) === h[k]) handlers.delete(k);
  };
}

/** 번호 목록(data-sc-list): 보이는 것 중 마지막(가장 안쪽에 열린 것). 번호는 꺼진(disabled) 항목도 세어 자리가 밀리지 않게 하고, 꺼진 항목은 눌러도 아무 일도 없다 */
function listItems(scope: ParentNode): HTMLElement[] {
  const lists = [...scope.querySelectorAll<HTMLElement>('[data-sc-list]')].filter((e) => shown(e, true));
  const list = lists[lists.length - 1];
  if (!list) return [];
  return [...list.querySelectorAll<HTMLElement>(CLICKABLE)].filter((e) => shown(e, true));
}

/** 이름 붙은 요소([data-sc="이름"])를 누른다. 누를 수 있는 요소가 없으면 false */
function clickNamed(scope: ParentNode, name: string): boolean {
  const target = [...scope.querySelectorAll<HTMLElement>('[data-sc]')].find((e) => e.dataset.sc === name && shown(e));
  if (!target) return false;
  target.click();
  return true;
}

/** 이동·확정·취소가 아닌 액션 실행. 처리했으면 true */
export function runAction(scope: ParentNode, action: ShortcutAction): boolean {
  const h = handlers.get(action);
  if (h) return h() !== false;
  const pick = /^pick\.(\d+)$/.exec(action);
  if (pick) {
    const item = listItems(scope)[Number(pick[1]) - 1];
    if (!item || !shown(item)) return false;
    item.click();
    return true;
  }
  return clickNamed(scope, action);
}

// ── 키 글자 배지 ──
const CAP = 'bha-keycap';

export function makeCap(text: string): HTMLElement {
  const k = document.createElement('kbd');
  k.className = CAP;
  k.setAttribute('aria-hidden', 'true');
  k.textContent = text;
  return k;
}

/** 배지가 붙을 요소와 글자: 이름 붙은 요소는 맥락의 전용 키, 번호 목록은 1부터 */
export function badgePlan(scope: ParentNode, ctx: ShortcutCtx): Map<HTMLElement, string> {
  const want = new Map<HTMLElement, string>();
  for (const e of scope.querySelectorAll<HTMLElement>('[data-sc]')) {
    if (!shown(e)) continue;
    const code = keysOf(ctx, e.dataset.sc!)[0];
    if (code) want.set(e, keyLabel(code));
  }
  listItems(scope).slice(0, 9).forEach((e, i) => shown(e) && want.set(e, String(i + 1)));
  return want;
}

/** 배지를 맞춘다. 이미 맞으면 DOM 을 건드리지 않아(관찰자 되먹임 방지) 여러 번 불러도 된다 */
export function syncBadges(root: ParentNode, want: Map<HTMLElement, string>): void {
  for (const cap of root.querySelectorAll<HTMLElement>(`.${CAP}`)) {
    const host = cap.parentElement;
    if (!host || want.get(host) !== cap.textContent) cap.remove();
  }
  for (const [e, text] of want) {
    const cur = [...e.children].find((c) => c.classList.contains(CAP));
    if (cur) continue;
    if (getComputedStyle(e).position === 'static') e.style.position = 'relative';
    e.append(makeCap(text));
  }
}
