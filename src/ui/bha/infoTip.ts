// 상태 이름 옆 ⓘ 설명 (C.176, GDD 104장 2): 원 안의 i 아이콘. 폰 = 누르면, PC = 마우스를 올리면 작은 설명 창이 뜬다.
// 누름으로 연 창은 밖을 누르거나·다시 누르거나·뒤로(◀·Esc)로 닫는다(기기 레이어로 등록). 마우스로 연 창은 마우스가 떠나면 닫힌다.
// 창은 오버레이 자리(LCD 창 안)에 붙어 스크롤 칸·overflow 에 잘리지 않는다. 방 상태 칩·상태 화면·쇠약/피곤/빈사 칩이 같이 쓴다.
import { el, icon } from './dom';
import { getOverlayHost, registerLayer } from './overlayHost';
import { elementLocalRect } from './viewport';

/** 설명 내용: 한 줄 글, 여러 줄(목록), 또는 [소제목, 줄들] 묶음 */
/** mark = 그 묶음에서 강조할 줄(지금 내 수치 구간, C.176 GDD 109장 2) */
export type InfoBody = string | string[] | { title: string; lines: string[]; mark?: number }[];

let openPop: { close: () => void } | null = null;

function bodyNodes(body: InfoBody): HTMLElement[] {
  if (typeof body === 'string') return [el('p', 'bha-pop__text', body)];
  if (body.length === 0) return [];
  if (typeof body[0] === 'string') {
    const ul = el('ul', 'bha-pop__list');
    for (const t of body as string[]) ul.append(el('li', '', t));
    return [ul];
  }
  return (body as { title: string; lines: string[]; mark?: number }[]).flatMap((g) => {
    const ul = el('ul', 'bha-pop__list');
    g.lines.forEach((t, i) => ul.append(el('li', i === g.mark ? 'is-now' : '', i === g.mark ? `◀ 지금 · ${t}` : t)));
    return [el('b', 'bha-pop__sub', g.title), ul];
  });
}

/** ⓘ 버튼 하나. body 는 열 때마다 읽는다(함수면 지금 값으로) */
export function infoTip(label: string, body: InfoBody | (() => InfoBody)): HTMLButtonElement {
  const b = el('button', 'bha-info');
  b.type = 'button';
  b.setAttribute('aria-label', `${label} 설명`);
  b.setAttribute('aria-expanded', 'false');
  b.dataset.info = label;
  b.append(icon('i-info'));
  let pop: HTMLElement | null = null;
  let pinned = false;
  let unreg = (): void => undefined;
  let leaveTimer = 0;
  const onDown = (e: PointerEvent) => {
    const t = e.target as Node | null;
    if (pop && t && (pop.contains(t) || b.contains(t))) return;
    close();
  };
  function close(): void {
    if (!pop) return;
    pop.remove();
    pop = null;
    pinned = false;
    unreg();
    unreg = () => undefined;
    document.removeEventListener('pointerdown', onDown, true);
    b.setAttribute('aria-expanded', 'false');
    b.classList.remove('is-open');
    if (openPop?.close === close) openPop = null;
  }
  function open(pin: boolean): void {
    if (pop) {
      if (pin && !pinned) {
        pinned = true;
        unreg = registerLayer(pop, close);
      }
      return;
    }
    openPop?.close();
    const host = getOverlayHost();
    pop = el('div', 'bha-pop');
    pop.setAttribute('role', 'tooltip');
    // 마우스로 연 창: 창 위로 옮겨 가도(긴 글 스크롤) 닫히지 않고, 창에서도 떠나면 닫힌다
    pop.addEventListener('pointerenter', () => window.clearTimeout(leaveTimer));
    pop.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse' && !pinned) close();
    });
    pop.append(el('b', 'bha-pop__title', label), ...bodyNodes(typeof body === 'function' ? body() : body));
    host.append(pop);
    // 자리: 아이콘 아래(넘치면 위), 가로는 아이콘 가운데 · 오버레이 자리 안으로 묶는다. 기기가 확대돼 있으면 화면 px → 자리 px
    // C.183 UI 검수: 기기 안 좌표로 잰다 — 화면 좌표 그대로면 세로 회전 출력(기기 90°)에서 창이 LCD 밖으로 나가 잘렸다
    const loc = (n: Element) => { const r = elementLocalRect(n); return { ...r, right: r.left + r.width, bottom: r.top + r.height }; };
    const hr = loc(host);
    const br = loc(b);
    const k = hr.width > 0 && host.offsetWidth > 0 ? host.offsetWidth / hr.width : 1;
    // 아래·위 중 넉넉한 쪽에 둔다
    const below = (br.bottom - hr.top) * k + 6;
    const roomBelow = host.clientHeight - below - 4;
    const roomAbove = (br.top - hr.top) * k - 6 - 4;
    // C.182 UI 검수 (GDD 110장 2): 위·아래 어느 쪽에도 다 안 들어가면(구간표가 긴 영압 안정도·광기) 아이콘 옆(왼쪽·오른쪽 중 넓은 쪽)에
    // LCD 높이 전체로 넓게 연다 — 예전엔 좁은 쪽 높이만 써서 마지막 구간 줄이 잘려 보였다. 아이콘은 덮지 않는다(PC 마우스 올림·다시 누름)
    if (pop.offsetHeight > Math.max(roomBelow, roomAbove)) {
      const sideL = (br.left - hr.left) * k - 6 - 4;
      const sideR = host.offsetWidth - (br.right - hr.left) * k - 6 - 4;
      const right = sideR >= sideL;
      pop.style.maxWidth = `${Math.max(160, right ? sideR : sideL)}px`;
      const pw = pop.offsetWidth;
      const maxH = host.clientHeight - 8;
      pop.style.maxHeight = `${maxH}px`;
      const h = Math.min(pop.offsetHeight, maxH);
      pop.style.left = `${right ? (br.right - hr.left) * k + 6 : (br.left - hr.left) * k - 6 - pw}px`;
      pop.style.top = `${Math.max(4, (host.clientHeight - h) / 2)}px`;
    } else {
      const pw = pop.offsetWidth;
      const ph = pop.offsetHeight;
      const cx = (br.left + br.width / 2 - hr.left) * k;
      const left = Math.max(4, Math.min(host.offsetWidth - pw - 4, cx - pw / 2));
      const down = ph <= roomBelow || roomBelow >= roomAbove;
      const maxH = Math.max(48, down ? roomBelow : roomAbove);
      pop.style.maxHeight = `${maxH}px`;
      const h = Math.min(ph, maxH);
      pop.style.left = `${left}px`;
      pop.style.top = `${down ? below : (br.top - hr.top) * k - 6 - h}px`;
    }
    pinned = pin;
    if (pin) unreg = registerLayer(pop, close);
    document.addEventListener('pointerdown', onDown, true);
    b.setAttribute('aria-expanded', 'true');
    b.classList.add('is-open');
    openPop = { close };
  }
  // 부모가 버튼(방 상태 칩)이어도 그쪽 누름으로 번지지 않게
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (pop && pinned) close();
    else open(true);
  });
  b.addEventListener('pointerenter', (e) => {
    if (e.pointerType === 'mouse') open(false);
  });
  b.addEventListener('pointerenter', () => window.clearTimeout(leaveTimer));
  b.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse' && !pinned) leaveTimer = window.setTimeout(() => { if (!pinned) close(); }, 180);
  });
  return b;
}

/** 이름 + ⓘ 한 묶음 (상태 화면 막대 이름 등) */
export function withInfo(name: Node | string, label: string, body: InfoBody | (() => InfoBody)): HTMLElement {
  const s = el('span', 'bha-info-wrap');
  s.append(name, infoTip(label, body));
  return s;
}
