// 펼침 목록 (GDD 95장 A2, C.153): 버튼을 누르면 그 아래로 항목 목록이 펼쳐지고, 항목을 고르면 실행한다 (예 훈련장의 '수련장').
// 펼친 목록의 항목은 보이는 동안 기기 위/아래로 고를 수 있고 ✓ 로 실행, 취소(뒤로·Q·Esc)는 화면을 나가기 전에 목록부터 닫는다. 바깥을 눌러도 닫힌다.
import { el, icon } from './dom';
import { registerCancelHook } from './shortcuts';

export interface DropdownItem {
  id: string;
  label: string;
  /** 항목 아래 작은 설명 한 줄 */
  desc?: string;
  icon?: string;
  onPick: () => void;
}

export interface DropdownOpts {
  /** 접힌 버튼의 이름 (예 '수련장') */
  label: string;
  items: readonly DropdownItem[];
  icon?: string;
  /** 접힌 버튼 아래 작은 설명 한 줄 */
  desc?: string;
  /** 처음부터 펼친다 */
  open?: boolean;
}

/** 버튼 + 펼침 목록. 돌려주는 요소(.bha-dropdown)에 open()/close() 를 붙여 둔다 */
export function dropdown(o: DropdownOpts): HTMLElement & { open(): void; close(): void } {
  const root = el('div', 'bha-dropdown') as unknown as HTMLElement & { open(): void; close(): void };
  const btn = el('button', 'bha-dropdown__btn') as HTMLButtonElement;
  btn.type = 'button';
  btn.setAttribute('aria-haspopup', 'listbox');
  btn.setAttribute('aria-expanded', 'false');
  const top = el('span', 'bha-dropdown__top');
  if (o.icon) top.append(icon(o.icon, 'sm'));
  top.append(el('b', 'bha-dropdown__name', o.label), icon('i-chevron-down', undefined, 'bha-dropdown__caret'));
  btn.append(top);
  if (o.desc) btn.append(el('span', 'bha-dropdown__desc', o.desc));
  const list = el('div', 'bha-dropdown__list');
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', o.label);
  list.hidden = true;
  for (const it of o.items) {
    const b = el('button', 'bha-dropdown__item') as HTMLButtonElement;
    b.type = 'button';
    b.setAttribute('role', 'option');
    b.dataset.door = it.id;
    const row = el('span', 'bha-dropdown__top');
    if (it.icon) row.append(icon(it.icon, 'sm'));
    row.append(el('b', 'bha-dropdown__name', it.label));
    b.append(row);
    if (it.desc) b.append(el('span', 'bha-dropdown__desc', it.desc));
    b.onclick = () => it.onPick();
    list.append(b);
  }
  const outside = (e: Event) => {
    if (!root.isConnected) return stop();
    // 기기 버튼(위/아래/✓/뒤로)을 누른 것은 바깥 누르기가 아니다: 뒤로는 취소 처리기가 목록만 닫는다
    if ((e.target as Element).closest?.('.bha-dev__btn')) return;
    if (!root.contains(e.target as Node)) close();
  };
  const stop = () => document.removeEventListener('pointerdown', outside, true);
  function close(): void {
    list.hidden = true;
    root.classList.remove('is-open');
    btn.setAttribute('aria-expanded', 'false');
    stop();
  }
  function open(): void {
    list.hidden = false;
    root.classList.add('is-open');
    btn.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', outside, true);
  }
  btn.onclick = () => (list.hidden ? open() : close());
  root.open = open;
  root.close = close;
  // 뒤로(Q·Esc·취소 버튼): 펼쳐 있으면 목록만 닫고 화면은 그대로 둔다. 화면이 사라지면 스스로 푼다
  let wasShown = false;
  registerCancelHook((topLayer) => {
    if (root.isConnected) wasShown = true;
    else return wasShown ? 'gone' : false;
    if (topLayer && !topLayer.contains(root)) return false; // 다른 레이어가 위에 열려 있으면 그것이 먼저
    if (list.hidden) return false;
    close();
    return true;
  }, { button: true });
  root.append(btn, list);
  if (o.open) open();
  return root;
}
