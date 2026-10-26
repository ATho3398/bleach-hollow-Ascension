// 상점·보관함 공용 카드 UI (GDD 86장, C.141): 카테고리 탭 · 큰 카드 격자(2줄이 보이게) · 상세 창(왼쪽 그림·보유 수 / 오른쪽 이름·설명·수량·행동 버튼).
// 판정·구매·사용은 src/shop.ts·src/inventory.ts, 이 파일은 그리기만 한다. 종족 무관 — 이름·설명은 호출하는 화면이 데이터에서 넘긴다.
import { button, el, icon } from './dom';
import { trapModalFocus } from './modalFocus';
import { getOverlayHost, registerLayer } from './overlayHost';

export interface TabSpec {
  id: string;
  label: string;
  /** 탭 옆 작은 수 (보유 수 등) */
  count?: number;
}

/** 카테고리 탭 줄 (보관함·상점 공용): 눌린 탭은 aria-selected */
export function categoryTabs(tabs: TabSpec[], current: string, onPick: (id: string) => void, label = '카테고리'): HTMLElement {
  const root = el('div', 'bha-itemtabs');
  root.setAttribute('role', 'tablist');
  root.setAttribute('aria-label', label);
  for (const t of tabs) {
    const b = el('button', `bha-itemtab${t.id === current ? ' is-on' : ''}`);
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(t.id === current));
    b.dataset.tab = t.id;
    b.append(t.label);
    if (t.count !== undefined) b.append(el('small', 'bha-itemtab__count', String(t.count)));
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
  /** 카드 상태 */
  state?: 'worn' | 'locked' | 'owned';
  /** 등급 (장비, GDD 91장 3번): 테두리 색 = 등급 색 (normal · rare · epic · legendary) */
  grade?: string;
  onClick: () => void;
}

/** 카드 한 장 (카드 전체가 버튼): 큰 그림이 위, 이름·설명, 아래 줄 */
export function itemCard(s: ItemCardSpec): HTMLElement {
  const card = el('button', `bha-itemcard${s.state ? ` is-${s.state}` : ''}${s.grade ? ` is-grade-${s.grade}` : ''}`);
  card.type = 'button';
  card.dataset.item = s.id;
  card.setAttribute('aria-label', `${s.name}${s.badge ? ` ${s.badge}` : ''}`);
  const art = el('span', 'bha-itemcard__art');
  art.append(s.art);
  card.append(art, el('b', 'bha-itemcard__name', s.name));
  if (s.detail) card.append(el('small', 'bha-itemcard__detail', s.detail));
  if (s.badge) card.append(el('span', 'bha-itemcard__badge', s.badge));
  if (s.foot) card.append(el('span', 'bha-itemcard__foot', s.foot));
  card.onclick = s.onClick;
  return card;
}

/** 카드 격자: 칸 폭 고정, 세로로 스크롤 (2줄이 한 번에 보이는 높이) */
export function itemGrid(cards: HTMLElement[], empty: string): HTMLElement {
  const grid = el('div', 'bha-itemgrid');
  if (cards.length === 0) grid.append(el('p', 'bha-faint bha-itemgrid__empty', empty));
  else grid.append(...cards);
  return grid;
}

export interface ItemDialogSpec {
  /** 창 제목 ("상품 구매" · "물건") */
  heading: string;
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

/** 상세 창을 연다. 돌려주는 함수는 창을 닫는다. Esc·바깥 누름은 닫기 */
export function itemDialog(s: ItemDialogSpec): () => void {
  const layer = el('div', 'bha-overlay bha-overlay--in-app bha-itemdialog');
  layer.setAttribute('role', 'dialog');
  layer.setAttribute('aria-modal', 'true');
  layer.setAttribute('aria-label', s.name);
  const modal = el('div', 'bha-modal bha-itemmodal');
  const left = el('div', 'bha-itemmodal__left');
  left.append(el('h2', 'bha-itemmodal__heading', s.heading));
  const art = el('div', 'bha-itemmodal__art');
  if (s.tag) art.append(el('span', 'bha-itemmodal__tag', s.tag));
  art.append(s.art);
  left.append(art);
  if (s.have) left.append(el('b', 'bha-itemmodal__have', s.have));
  const right = el('div', 'bha-itemmodal__right');
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
  const x = button({ label: '닫기', iconOnly: true, icon: 'i-close', variant: 'ghost', size: 'small', onClick: close });
  x.classList.add('bha-itemmodal__close');
  right.append(x, el('h3', 'bha-itemmodal__name', s.name), el('p', 'bha-itemmodal__desc', s.desc));
  let qty = 1;
  const max = Math.max(1, s.qty?.max ?? 1);
  const btns: HTMLButtonElement[] = [];
  const refresh = () => {
    qtyLabel.textContent = `수량: ${qty}`;
    minus.disabled = qty <= 1;
    plus.disabled = qty >= max;
    maxBtn.disabled = qty >= max;
    s.actions.forEach((a, i) => { btns[i]!.replaceChildren(a.label(qty)); });
  };
  const qtyLabel = el('b', 'bha-itemmodal__qty');
  qtyLabel.dataset.qty = '';
  const minus = button({ label: '하나 줄이기', iconOnly: true, icon: 'i-minus', onClick: () => { qty = Math.max(1, qty - 1); refresh(); } });
  const plus = button({ label: '하나 늘리기', iconOnly: true, icon: 'i-plus', onClick: () => { qty = Math.min(max, qty + 1); refresh(); } });
  const maxBtn = button({ label: '최대', size: 'small', onClick: () => { qty = max; refresh(); } });
  minus.dataset.qtyMinus = '';
  plus.dataset.qtyPlus = '';
  maxBtn.dataset.qtyMax = '';
  if (max > 1) {
    const row = el('div', 'bha-itemmodal__qtyrow');
    row.append(qtyLabel, minus, plus, maxBtn);
    right.append(row);
  }
  if (s.lock) right.append(el('p', 'bha-itemmodal__lock', s.lock));
  const acts = el('div', 'bha-itemmodal__acts');
  s.actions.forEach((a) => {
    const b = button({ label: a.label(1), variant: a.variant ?? 'primary', size: 'lg', disabled: a.disabled, onClick: () => a.onClick(qty) });
    if (a.key) b.dataset.act = a.key;
    btns.push(b);
    acts.append(b);
  });
  right.append(acts);
  modal.append(left, right);
  layer.append(modal);
  layer.addEventListener('click', (e) => { if (e.target === layer) close(); });
  getOverlayHost().append(layer);
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
