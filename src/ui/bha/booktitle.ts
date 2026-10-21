// 책장 머리의 제목 토글 (GDD 58, C.114): "진화체 도감 ▾" — 누르면 도감 목록(진화체 도감 / 칭호 도감)이 아래로 열리고, 골라서 바꾼다.
// 예전 머리의 탭 2개 줄을 이 제목이 대신해 단계 탭 줄이 넓어진다. 목록 바깥을 누르면 닫힌다. 모양은 screens-lcd.css 의 .bha-booktitle.
import { el, icon } from './dom';

export interface BookTitleOption {
  id: string;
  label: string;
}

/** 제목 버튼 + 펼침 목록. options = 고를 수 있는 도감, current = 지금 도감 id, onPick = 다른 도감을 골랐을 때(같은 것을 누르면 닫기만) */
export function bookTitle(options: readonly BookTitleOption[], current: string, onPick: (id: string) => void): HTMLElement {
  const root = el('div', 'bha-booktitle');
  const now = options.find((o) => o.id === current) ?? options[0]!;
  const btn = el('button', 'bha-booktitle__btn') as HTMLButtonElement;
  btn.type = 'button';
  btn.setAttribute('aria-haspopup', 'listbox');
  btn.setAttribute('aria-expanded', 'false');
  btn.append(el('span', 'bha-booktitle__name', now.label), icon('i-chevron-down', undefined, 'bha-booktitle__caret'));
  const list = el('div', 'bha-booktitle__list');
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', '도감');
  list.hidden = true;
  for (const o of options) {
    const it = el('button', `bha-booktitle__item${o.id === now.id ? ' is-on' : ''}`) as HTMLButtonElement;
    it.type = 'button';
    it.setAttribute('role', 'option');
    it.setAttribute('aria-selected', String(o.id === now.id));
    it.textContent = o.label;
    it.onclick = () => {
      close();
      if (o.id !== now.id) onPick(o.id);
    };
    list.append(it);
  }
  // 바깥을 누르면 닫는다. 화면이 다시 그려져 제목이 사라지면 스스로 푼다
  const outside = (e: Event) => {
    if (!root.isConnected) return stop();
    if (!root.contains(e.target as Node)) close();
  };
  const stop = () => document.removeEventListener('pointerdown', outside, true);
  function close(): void {
    list.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    stop();
  }
  btn.onclick = () => {
    if (!list.hidden) return close();
    list.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', outside, true);
  };
  root.append(btn, list);
  return root;
}
