// 게임 안 고르기 칸 (GDD 116장 추가 5, C.190): 브라우저 기본 <select> 대신. 기본 select 는 고르기 창을 휴대폰 OS 가 그려
// 세로 회전 출력(기기를 CSS 로 90° 돌려 그림)에서 창이 세로로 떴다. 버튼을 누르면 제목 토글(viewtitle)과 같은 모양의 목록이
// 기기 레이어(오버레이 자리)에 기기 안 좌표로 열린다 — ▲▼ 이동·✓ 고르기·뒤로 닫기, 긴 목록은 목록 안 스크롤, 바깥을 누르면 닫힘.
import { el, icon } from './dom';
import { getOverlayHost, registerLayer } from './overlayHost';
import { elementLocalRect } from './viewport';

export interface PickOption {
  value: string;
  label: string;
  /** 묶음 이름(같은 이름끼리 목록에서 제목 아래 모인다) */
  group?: string;
}

export interface PickList {
  /** 화면에 넣을 버튼 */
  readonly el: HTMLButtonElement;
  /** 지금 고른 값 (없는 값을 넣으면 첫 항목) */
  value: string;
  /** 항목 수 */
  readonly size: number;
  /** 사용자가 다른 값을 골랐을 때 */
  onchange: (() => void) | null;
}

/** 묶음 순서 그대로(처음 나온 순서) 항목을 모은다 */
export function groupOptions(options: readonly PickOption[]): { group: string | null; items: PickOption[] }[] {
  const out: { group: string | null; items: PickOption[] }[] = [];
  for (const o of options) {
    const g = o.group ?? null;
    let bucket = out.find((b) => b.group === g);
    if (!bucket) out.push((bucket = { group: g, items: [] }));
    bucket.items.push(o);
  }
  return out;
}

export function pickList(options: readonly PickOption[], value: string, aria: string, cls = ''): PickList {
  let cur = options.some((o) => o.value === value) ? value : options[0]?.value ?? '';
  const btn = el('button', `bha-pick${cls ? ` ${cls}` : ''}`) as HTMLButtonElement;
  btn.type = 'button';
  btn.setAttribute('aria-haspopup', 'listbox');
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-label', aria);
  const name = el('span', 'bha-pick__name');
  btn.append(name, icon('i-chevron-down', undefined, 'bha-viewtitle__caret'));
  const show = () => {
    const o = options.find((x) => x.value === cur);
    name.textContent = o ? (o.group ? `${o.group} · ${o.label}` : o.label) : '—';
  };
  show();
  let list: HTMLElement | null = null;
  let unreg = (): void => undefined;
  const outside = (e: Event) => {
    if (list && !list.contains(e.target as Node) && !btn.contains(e.target as Node)) close();
  };
  function close(): void {
    if (!list) return;
    list.remove();
    list = null;
    btn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', outside, true);
    unreg();
    unreg = () => undefined;
  }
  const self: PickList = {
    el: btn,
    get value() { return cur; },
    set value(v: string) {
      cur = options.some((o) => o.value === v) ? v : options[0]?.value ?? '';
      show();
    },
    get size() { return options.length; },
    onchange: null,
  };
  const open = () => {
    const host = getOverlayHost();
    const box = el('div', 'bha-viewtitle__list bha-pick__list');
    box.setAttribute('role', 'listbox');
    box.setAttribute('aria-label', aria);
    let on: HTMLElement | null = null;
    for (const g of groupOptions(options)) {
      if (g.group) box.append(el('div', 'bha-pick__group', g.group));
      for (const o of g.items) {
        const it = el('button', `bha-viewtitle__item${o.value === cur ? ' is-on' : ''}`) as HTMLButtonElement;
        it.type = 'button';
        it.setAttribute('role', 'option');
        it.setAttribute('aria-selected', String(o.value === cur));
        it.textContent = o.label;
        it.onclick = () => {
          close();
          if (o.value === cur) return;
          cur = o.value;
          show();
          self.onchange?.();
        };
        if (o.value === cur) on = it;
        box.append(it);
      }
    }
    host.append(box);
    list = box;
    // 자리: 버튼 아래(모자라면 위), 가로는 버튼 왼쪽 맞춤 · 오버레이 자리 안. 기기 안 좌표로 잰다(세로 회전 출력에서도 기기 안에 뜨게)
    const loc = (n: Element) => { const r = elementLocalRect(n); return { ...r, right: r.left + r.width, bottom: r.top + r.height }; };
    const hr = loc(host);
    const br = loc(btn);
    const k = hr.width > 0 && host.offsetWidth > 0 ? host.offsetWidth / hr.width : 1;
    box.style.minWidth = `${br.width * k}px`;
    box.style.maxWidth = `${host.offsetWidth - 8}px`;
    const below = (br.bottom - hr.top) * k + 4;
    const roomBelow = host.clientHeight - below - 4;
    const roomAbove = (br.top - hr.top) * k - 4 - 4;
    const ph = box.offsetHeight;
    const down = ph <= roomBelow || roomBelow >= roomAbove;
    const maxH = Math.max(48, down ? roomBelow : roomAbove);
    box.style.maxHeight = `${maxH}px`;
    const h = Math.min(ph, maxH);
    const pw = box.offsetWidth;
    box.style.left = `${Math.max(4, Math.min(host.offsetWidth - pw - 4, (br.left - hr.left) * k))}px`;
    box.style.top = `${down ? below : (br.top - hr.top) * k - 4 - h}px`;
    // 고른 항목이 보이게 목록 안에서만 스크롤 (scrollIntoView 는 기기 상자까지 밀 수 있다)
    if (on) box.scrollTop = Math.max(0, (on as HTMLElement).offsetTop - box.clientHeight / 2);
    btn.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', outside, true);
    unreg = registerLayer(box, close);
  };
  btn.onclick = () => (list ? close() : open());
  return self;
}
