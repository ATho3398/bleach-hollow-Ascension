// 가로 2단 쪽 화면 (GDD 16장, T-2): LCD 창이 낮아서(약 330~360px) 세로로 긴 화면(결과·흡수·연습 목록·한계 돌파)을
// 왼쪽(main) / 오른쪽(side) 두 열로 나눠 보인다. 머리(head)가 있으면 두 열 위에 걸친다. 모양은 lcd.css 의 .bha-split.
import { el, mountApp } from './dom';

export interface SplitOpts {
  /** 화면 이름 클래스 (예 'bha-absorb') */
  cls?: string;
  /** 왼쪽 열을 스크롤해도 위에 붙여 둔다 (왼쪽이 짧을 때만) */
  sticky?: boolean;
}

export function splitApp(root: HTMLElement, opts: SplitOpts, head: Node | null, main: (Node | string)[], side: (Node | string)[]): HTMLElement {
  const m = el('div', 'bha-split__main');
  m.append(...main);
  const s = el('div', 'bha-split__side');
  s.append(...side);
  const cls = ['bha-split', opts.sticky ? 'bha-split--sticky' : '', opts.cls ?? ''].filter(Boolean).join(' ');
  return mountApp(root, { cls }, ...(head ? [head] : []), m, s);
}
