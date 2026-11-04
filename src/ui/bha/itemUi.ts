// 상점·보관함 공용 카드 UI (GDD 86장, C.141 → 183장 리디자인 v2 C.288): 카테고리 탭(v2 .bha-tabs) · 카드 격자 4열(그림·이름·한 줄·가격) ·
// 상세 창(v2 창 틀: 머리 48 = 그림·이름·× / 본문 고정 높이 스크롤 + '▼ 더 있음' / 아래 고정 [닫기][행동] — 173장 2 버튼 자리 고정).
// 판정·구매·사용은 src/shop.ts·src/inventory.ts, 이 파일은 그리기만 한다. 종족 무관 — 이름·설명은 호출하는 화면이 데이터에서 넘긴다.
import { button, el, emptyState, icon } from './dom';
import { trapModalFocus } from './modalFocus';
import { getOverlayHost, registerLayer } from './overlayHost';
import { shownName } from '../displayName';

export interface TabSpec {
  id: string;
  label: string;
  /** 탭 옆 작은 수 (보유 수 등). 글자면 그대로 ('판매 9'·'보유 56', GDD 100장 #65) */
  count?: number | string;
  /** 글자 앞 아이콘 (i-* 이름, 리디자인 v2 상점 탭) */
  icon?: string;
}

/** 카테고리 탭 줄 (보관함·상점 공용): 눌린 탭은 aria-selected */
export function categoryTabs(tabs: TabSpec[], current: string, onPick: (id: string) => void, label = '카테고리', sub = false): HTMLElement {
  const root = el('div', sub ? 'bha-tabs bha-itemtabs bha-itemtabs--sub' : 'bha-tabs bha-itemtabs');
  root.setAttribute('role', 'tablist');
  root.setAttribute('aria-label', label);
  for (const t of tabs) {
    const b = el('button', `bha-tab bha-itemtab${t.id === current ? ' is-on' : ''}`);
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(t.id === current));
    b.dataset.tab = t.id;
    if (t.icon) b.append(icon(t.icon));
    b.append(el('span', 'bha-itemtab__label', t.label));
    if (t.count !== undefined) b.append(el('small', 'bha-tab-n bha-itemtab__count', String(t.count)));
    b.onclick = () => onPick(t.id);
    root.append(b);
  }
  return root;
}

export interface ItemCardSpec {
  id: string;
  name: string;
  /** 효과·설명 한 줄 (카드에는 두 줄까지) */
  detail?: string;
  /** 큰 그림 자리 (아이콘·색 견본·스킨 썸네일) */
  art: Node;
  /** 오른쪽 위 작은 표시 (보유 수 ×3 · 착용 중 · 잠김) */
  badge?: string;
  /** 아래 줄: 가격 등 (글자) */
  foot?: string;
  /** 아래 줄이 가격이면 화폐 아이콘 (i-* 이름) + 숫자만 보인다 — 글자 전체는 aria-label·title (리디자인 v2 .bha-card-price) */
  price?: { icon: string; value: number };
  /** 카드 상태 */
  state?: 'worn' | 'locked' | 'owned';
  /** 등급 (장비, GDD 91장 3번): 테두리 색 = 등급 색 (normal · rare · epic · legendary) */
  grade?: string;
  onClick: () => void;
}

/** 카드 한 장 (카드 전체가 버튼, 리디자인 v2 .bha-card): 오른쪽 위 작은 수(보유·착용) · 그림 · 이름 · 한 줄 · 아래 줄(가격·동작) */
export function itemCard(s: ItemCardSpec): HTMLElement {
  s = { ...s, name: shownName(s.name) }; // 이름 표시 함수 하나 (GDD 100장: 밑줄 → 공백, '(가칭)' 은 테스트 모드만)
  const card = el('button', `bha-card bha-itemcard${s.state ? ` is-${s.state}` : ''}${s.grade ? ` is-grade-${s.grade}` : ''}`);
  card.type = 'button';
  card.dataset.item = s.id;
  card.setAttribute('aria-label', `${s.name}${s.badge ? ` ${s.badge}` : ''}${s.foot ? ` ${s.foot}` : ''}`);
  const art = el('span', 'bha-itemcard__art');
  art.append(s.art);
  card.append(art, el('b', 'bha-card-name bha-itemcard__name', s.name));
  if (s.detail) card.append(el('small', 'bha-card-line bha-itemcard__detail', s.detail));
  if (s.badge) card.append(el('span', 'bha-count bha-itemcard__badge', s.badge));
  if (s.price) {
    const p = el('span', 'bha-card-price bha-itemcard__foot bha-itemcard__price');
    p.append(icon(s.price.icon), el('span', 'bha-num', String(s.price.value)));
    if (s.foot) p.title = s.foot;
    card.append(p);
  } else if (s.foot) card.append(el('span', 'bha-itemcard__foot', s.foot));
  card.onclick = s.onClick;
  return card;
}

/** 카드 격자: 4열, 세로로 스크롤 (2줄이 한 번에 보이는 높이) + 넘치면 바닥 '▼ 더 있음' (PROMPT 5절 2) */
export function itemGrid(cards: HTMLElement[], empty: string, emptyIcon = 'i-shelf'): HTMLElement {
  const grid = el('div', 'bha-itemgrid');
  if (cards.length === 0) {
    // 빈 상태 (GDD 100장 #60·#87): 공용 빈 상태 컴포넌트(C.170 emptyState) — 가운데 아이콘 + 한 줄
    const e = emptyState(empty, { icon: emptyIcon });
    e.classList.add('bha-itemgrid__empty');
    grid.append(e);
  }
  else grid.append(...cards);
  // 넘치면 바닥 '▼ 더 있음' — 화면에 붙은 뒤 부모 칸 아래에 띠를 단다
  requestAnimationFrame(() => { if (grid.isConnected && grid.parentElement) moreHint(grid, grid.parentElement); });
  return grid;
}

/** 스크롤 칸 바닥의 '▼ 더 있음' 띠 (PROMPT 5절 2): 넘칠 때만 보이고 끝까지 내리면 숨는다. box = 스크롤하는 칸, host = 띠를 붙일 칸(position: relative) */
export function moreHint(box: HTMLElement, host: HTMLElement = box.parentElement ?? box): () => void {
  const more = el('span', 'bha-more bha-itemmore');
  more.setAttribute('aria-hidden', 'true');
  more.append(icon('i-down'), '더 있음');
  host.append(more);
  const sync = () => { more.hidden = box.scrollHeight - box.clientHeight - box.scrollTop <= 2; };
  box.addEventListener('scroll', sync, { passive: true });
  requestAnimationFrame(sync);
  return sync;
}

export interface ItemDialogSpec {
  /** 창 제목 ("상품 구매" · "물건") */
  heading: string;
  /** 물건 id (data-item-dialog — 튜토리얼 카드가 이 창의 버튼을 가리킨다, GDD 132장 1) */
  id?: string;
  name: string;
  desc: string;
  /** 왼쪽 큰 그림 */
  art: Node;
  /** 그림 아래 한 줄 ("보유: 6") */
  have?: string;
  /** 그림 위 작은 표시 ("미리보기") */
  tag?: string;
  /** 수량 고르기: max 가 1 이하면 숨긴다. unit = 개당 가격(글자 만들기용) */
  qty?: { max: number };
  /** 아래 큰 버튼들. label 은 수량을 받아 만든다 (예 "골드 160") */
  actions: { label: (qty: number) => string; variant?: 'primary' | 'danger' | 'ghost'; disabled?: boolean; note?: string; onClick: (qty: number) => void; key?: string }[];
  /** 막힌 이유 한 줄 */
  lock?: string | null;
}

/** 상세 창을 연다 (리디자인 v2 창 틀, PROMPT 6절 S04): 머리 48 = 그림·제목(작은 분류 + 이름)·× / 본문 = 설명(고정 높이 안 스크롤 + '▼ 더 있음')·가진 수·수량·막힌 이유 /
 *  아래 고정 줄 = [닫기] + 행동 버튼(설명 길이가 바뀌어도 자리 그대로, 173장 2). 미리보기(tag)가 있으면 본문 왼쪽에 큰 그림. 돌려주는 함수는 창을 닫는다. Esc·바깥 누름은 닫기 */
export function itemDialog(s: ItemDialogSpec): () => void {
  s = { ...s, name: shownName(s.name) };
  const layer = el('div', 'bha-overlay bha-overlay--in-app bha-itemdialog');
  if (s.id) layer.dataset.itemDialog = s.id;
  layer.setAttribute('role', 'dialog');
  layer.setAttribute('aria-modal', 'true');
  layer.setAttribute('aria-label', s.name);
  const modal = el('div', 'bha-modal bha-win bha-itemmodal');
  let closed = false;
  let untrap: () => void = () => {};
  let unregister: () => void = () => {};
  const close = () => {
    if (closed) return;
    closed = true;
    unregister();
    layer.remove();
    untrap();
  };
  // ── 머리: 그림 · 분류/이름 · × ──
  const head = el('div', 'bha-win-head bha-itemmodal__headrow');
  const headArt = el('span', 'bha-itemmodal__icon');
  const big = s.tag ? el('div', 'bha-itemmodal__art') : null;
  if (big) {
    big.append(el('span', 'bha-itemmodal__tag', s.tag!), s.art);
    headArt.append(s.art.cloneNode(true));
  } else headArt.append(s.art);
  const titles = el('div', 'bha-itemmodal__titles');
  titles.append(el('small', 'bha-itemmodal__heading', s.heading), el('h3', 'bha-itemmodal__name', s.name));
  const x = button({ label: '닫기', iconOnly: true, icon: 'i-close', variant: 'ghost', onClick: close });
  x.classList.add('bha-itemmodal__close');
  head.append(headArt, titles, x);
  // ── 본문 ──
  const body = el('div', 'bha-win-body bha-itemmodal__body');
  const main = el('div', 'bha-itemmodal__right');
  const descBox = el('div', 'bha-itemmodal__descbox');
  const desc = el('p', 'bha-itemmodal__desc', s.desc);
  desc.tabIndex = -1;
  descBox.append(desc);
  main.append(descBox);
  if (s.have) main.append(el('b', 'bha-itemmodal__have', s.have));
  let qty = 1;
  const max = Math.max(1, s.qty?.max ?? 1);
  const btns: HTMLButtonElement[] = [];
  const refresh = () => {
    qtyLabel.replaceChildren('수량 ', el('span', 'bha-num bha-num--w2', String(qty)));
    minus.disabled = qty <= 1;
    plus.disabled = qty >= max;
    maxBtn.disabled = qty >= max;
    s.actions.forEach((a, i) => { btns[i]!.replaceChildren(a.label(qty)); });
  };
  const qtyLabel = el('b', 'bha-itemmodal__qty');
  qtyLabel.dataset.qty = '';
  const minus = button({ label: '하나 줄이기', iconOnly: true, icon: 'i-minus', size: 'small', onClick: () => { qty = Math.max(1, qty - 1); refresh(); } });
  const plus = button({ label: '하나 늘리기', iconOnly: true, icon: 'i-plus', size: 'small', onClick: () => { qty = Math.min(max, qty + 1); refresh(); } });
  const maxBtn = button({ label: '최대', size: 'small', onClick: () => { qty = max; refresh(); } });
  minus.dataset.qtyMinus = '';
  plus.dataset.qtyPlus = '';
  maxBtn.dataset.qtyMax = '';
  if (max > 1) {
    const row = el('div', 'bha-itemmodal__qtyrow');
    row.append(qtyLabel, minus, plus, maxBtn);
    main.append(row);
  }
  if (s.lock) main.append(el('p', 'bha-itemmodal__lock', s.lock));
  if (big) {
    const left = el('div', 'bha-itemmodal__left');
    left.append(big);
    body.append(left);
  }
  body.append(main);
  // ── 아래 고정 줄: [닫기] + 행동 ──
  const acts = el('div', 'bha-win-foot bha-itemmodal__acts');
  const closeBtn = button({ label: '닫기', onClick: close });
  closeBtn.classList.add('bha-itemmodal__closebtn');
  closeBtn.dataset.act = 'close';
  acts.append(closeBtn);
  s.actions.forEach((a) => {
    const b = button({ label: a.label(1), variant: a.variant ?? 'primary', disabled: a.disabled, onClick: () => a.onClick(qty) });
    if (a.key) b.dataset.act = a.key;
    if (a.note) b.title = a.note;
    btns.push(b);
    acts.append(b);
  });
  acts.dataset.n = String(s.actions.length);
  modal.append(head, body, acts);
  layer.append(modal);
  layer.addEventListener('click', (e) => { if (e.target === layer) close(); });
  getOverlayHost().append(layer);
  moreHint(desc, descBox);
  untrap = trapModalFocus(layer);
  unregister = registerLayer(layer, close);
  refresh();
  return close;
}

/** 카드·상세 창 그림 자리: 아이콘 한 개 (아이콘 id) */
export function iconArt(id: string): HTMLElement {
  const a = el('span', 'bha-itemart');
  a.append(icon(id));
  return a;
}

/** 이미지 그림 (스킨 미리보기·썸네일) */
export function imageArt(src: string): HTMLElement {
  const img = el('img', 'bha-itemart bha-itemart--img');
  img.src = src;
  img.alt = '';
  img.draggable = false;
  return img;
}

/** 색 견본 그림 (꾸밈): --sw 색 변수와 분류 클래스 */
export function swatchArt(category: string, color: string, filter?: string): HTMLElement {
  const a = el('span', `bha-itemart bha-itemart--swatch bha-itemart--${category}`);
  a.style.setProperty('--sw', color);
  if (filter) a.style.setProperty('--sw-filter', filter);
  return a;
}
