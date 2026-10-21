// 화면 머리의 제목 토글 (GDD 58, C.114): "<지금 보기 이름> ▾" — 누르면 같은 화면 안의 보기 목록이 아래로 열리고, 골라서 바꾼다.
// 예전 머리의 보기 전환 탭 줄(도감·상점·보관함·원정 출발·수련장·테스트)을 이 제목이 대신해 머리 폭이 넓어진다. 목록 바깥을 누르면 닫힌다.
// 대상은 1차 "어느 화면/보기" 전환만 — 2차 필터(도감 단계 탭 등)·켜기/끄기 토글·전투 조작은 아니다. 모양은 screens-lcd.css 의 .bha-viewtitle.
import { el, icon } from './dom';

export interface ViewTitleOption {
  id: string;
  label: string;
}

/** 제목 버튼 + 펼침 목록. options = 고를 수 있는 보기, current = 지금 보기 id, onPick = 다른 보기를 골랐을 때(같은 것을 누르면 닫기만).
 *  prefix 가 있으면 제목은 "<prefix> · <지금 보기> ▾"(화면 이름을 같이 보이고 싶을 때), 목록 항목은 보기 이름만 */
export function viewTitle(options: readonly ViewTitleOption[], current: string, onPick: (id: string) => void, opts: { prefix?: string } = {}): HTMLElement {
  const root = el('div', 'bha-viewtitle');
  const now = options.find((o) => o.id === current) ?? options[0]!;
  const btn = el('button', 'bha-viewtitle__btn') as HTMLButtonElement;
  btn.type = 'button';
  btn.setAttribute('aria-haspopup', 'listbox');
  btn.setAttribute('aria-expanded', 'false');
  btn.append(el('span', 'bha-viewtitle__name', opts.prefix ? `${opts.prefix} · ${now.label}` : now.label), icon('i-chevron-down', undefined, 'bha-viewtitle__caret'));
  const list = el('div', 'bha-viewtitle__list');
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', '도감');
  list.hidden = true;
  for (const o of options) {
    const it = el('button', `bha-viewtitle__item${o.id === now.id ? ' is-on' : ''}`) as HTMLButtonElement;
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
