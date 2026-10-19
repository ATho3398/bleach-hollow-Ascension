// LCD 가로 화면의 공용 뼈대 (GDD 16장, T-3): 머리 한 줄 + 왼쪽/오른쪽 두 열. 목록 화면은 "왼쪽 목록 → 오른쪽 상세" (masterDetail).
// 목록의 행은 button 이라 위/아래로 하나씩 고를 수 있고, 하이라이트가 옮겨 가면(기기가 보내는 'bha-select') 오른쪽 상세가 바뀐다.
// 터치로 눌러도 같다. 모양은 screens-lcd.css 의 .bha-lcdpage.
import { el, mountApp } from './dom';

export interface PageHead {
  title: string;
  /** 제목 아래 작은 줄 (Node 도 가능) */
  sub?: Node | string;
  /** 머리 오른쪽에 둘 것 (탭·버튼) */
  aside?: Node[];
}

/** 위/아래 선택 순서를 화면 나머지 뒤로 미룬다 (머리의 탭·버튼: 목록·본문을 먼저 고르게) */
export function selectLast<T extends Element>(root: T): T {
  for (const b of root.matches('button') ? [root] : root.querySelectorAll('button')) b.setAttribute('data-dev-order', '1');
  return root;
}

/** 머리 한 줄 */
export function lcdHead(h: PageHead): HTMLElement {
  const head = el('header', 'bha-lcdpage__head');
  const main = el('div', 'bha-lcdpage__titles');
  main.append(el('h1', 'bha-lcdpage__title', h.title));
  if (h.sub !== undefined) {
    const sub = el('p', 'bha-lcdpage__sub');
    sub.append(h.sub);
    main.append(sub);
  }
  head.append(main);
  if (h.aside?.length) {
    const aside = el('div', 'bha-lcdpage__aside');
    aside.append(...h.aside);
    head.append(aside);
  }
  return head;
}

export interface PageOpts {
  /** 화면 이름 클래스 (예 'bha-altar') */
  cls?: string;
  /** 왼쪽:오른쪽 폭 비율 (기본 1:1) */
  cols?: string;
  /** 두 열 아래에 걸치는 한 줄 (버튼 줄) */
  foot?: Node[];
}

/** 머리 + 두 열(+ 아래 줄)의 DOM 조각과 화면 클래스. 이미 있는 틀(오버레이의 main.bha-app)에 직접 붙일 때 쓴다 */
export function lcdPageParts(opts: PageOpts, head: Node, left: (Node | string)[], right: (Node | string)[]): { cls: string; nodes: Node[]; left: HTMLElement; right: HTMLElement } {
  const l = el('div', 'bha-lcdpage__col bha-lcdpage__col--left');
  l.append(...left);
  const r = el('div', 'bha-lcdpage__col bha-lcdpage__col--right');
  r.append(...right);
  const body = el('div', 'bha-lcdpage__body');
  if (opts.cols) body.style.gridTemplateColumns = opts.cols;
  body.append(l, r);
  const foot = opts.foot?.length ? el('footer', 'bha-lcdpage__foot') : null;
  foot?.append(...opts.foot!);
  return { cls: ['bha-lcdpage', opts.cls ?? ''].filter(Boolean).join(' '), nodes: [head, body, ...(foot ? [foot] : [])], left: l, right: r };
}

/** 머리 + 두 열. 열 안에서 넘치는 것(목록)만 그 열 안에서 스크롤한다 */
export function lcdPage(root: HTMLElement, opts: PageOpts, head: Node, left: (Node | string)[], right: (Node | string)[]): { app: HTMLElement; left: HTMLElement; right: HTMLElement } {
  const p = lcdPageParts(opts, head, left, right);
  const app = mountApp(root, { cls: p.cls }, ...p.nodes);
  return { app, left: p.left, right: p.right };
}

export interface ListRow {
  /** 행 안 내용 (아이콘·이름·상태). 접근성 이름은 label */
  content: Node[];
  label: string;
  /** 상세 칸에 보일 내용 */
  detail: () => Node[];
  /** 행 모양 변형 클래스 (예 'is-locked') */
  cls?: string;
  /** 행 노드에 색 변수 등을 칠한다 (예 속성 색, C.47) */
  paint?: (node: HTMLElement) => void;
  /** 이 행 앞에 구역 제목 줄을 둔다 (선택 대상 아님) */
  caption?: string;
}

export interface MasterDetail {
  /** 왼쪽 열에 놓을 목록 */
  list: HTMLElement;
  /** 오른쪽 열에 놓을 상세 칸 */
  detail: HTMLElement;
  select(i: number): void;
  /** 행을 통째로 바꾼다 (탭 전환): 선택은 0번(또는 at)으로 */
  setRows(rows: ListRow[], at?: number): void;
}

/** 왼쪽 목록 + 오른쪽 상세. 선택(.is-active)은 하이라이트(.bha-sel)와 별개로 "지금 상세에 보이는 행" 표시 */
export function masterDetail(rows: ListRow[], at = 0, listLabel = '목록'): MasterDetail {
  const list = el('div', 'bha-mdlist');
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', listLabel);
  const detail = el('section', 'bha-mddetail');
  detail.setAttribute('aria-live', 'polite');
  let cur: ListRow[] = [];
  let btns: HTMLElement[] = [];
  let sel = -1;

  const select = (i: number) => {
    if (i === sel || !cur[i]) return;
    sel = i;
    btns.forEach((c, k) => {
      c.classList.toggle('is-active', k === i);
      c.setAttribute('aria-selected', String(k === i));
    });
    detail.replaceChildren(...cur[i]!.detail());
    detail.scrollTop = 0;
  };

  const setRows = (next: ListRow[], to = 0) => {
    cur = next;
    sel = -1;
    btns = next.map((r, i) => {
      const b = el('button', ['bha-mdrow', r.cls ?? ''].filter(Boolean).join(' '));
      b.type = 'button';
      b.setAttribute('role', 'option');
      b.setAttribute('aria-label', r.label);
      b.append(...r.content);
      r.paint?.(b);
      b.addEventListener('bha-select', () => select(i));
      b.onclick = () => select(i);
      return b;
    });
    list.replaceChildren(...btns.flatMap((b, i) => (next[i]!.caption ? [el('h3', 'bha-mdcap', next[i]!.caption), b] : [b])));
    select(Math.min(Math.max(to, 0), next.length - 1));
  };
  setRows(rows, at);
  return { list, detail, select, setRows };
}
