// 스택 네모 줄 (GDD 7-13 스택 표시, C.471 — 사용자 2026-11-17 "적한테 걸리는거면 적 체력바 위에, 나한테 쌓이는거면 내 체력바 위에. 작은 네모 아이콘으로 쌓아. 간략화 된걸로"):
// 체력 막대 바로 위에 작은 네모(아이콘 하나 + 숫자)를 가로로. 무엇을·어느 쪽에 = 엔진 statusMarksOf(걸린 쪽·아이콘 = 데이터)만 읽는다.
// 이름은 글자로 쓰지 않고 네모를 누르거나(폰) 마우스를 올리면(PC) ⓘ 설명 창(infoTip)으로.
import type { StatusMark, StatusMarkSide } from '../../engine/combat';
import { el, icon } from './dom';
import { infoTip } from './infoTip';

/** 한 쪽 줄 (체력 막대 칸 맨 위에 넣는다) */
export function statusMarkRow(side: StatusMarkSide): HTMLElement {
  const row = el('div', 'bha-marks');
  row.dataset.side = side;
  row.setAttribute('aria-label', side === 'self' ? '내게 걸린 효과' : '적에게 건 효과');
  return row;
}

interface MarkCell {
  root: HTMLButtonElement;
  icon: string;
  value: HTMLElement;
  title: string;
}

/** 두 줄을 엔진 목록으로 갱신한다 (바뀐 칸만 고친다) */
export function statusMarkRows(me: HTMLElement, foe: HTMLElement): { update: (marks: readonly StatusMark[]) => void } {
  const cells = new Map<string, MarkCell>();
  let shown = '';
  const make = (m: StatusMark): MarkCell => {
    const cell: MarkCell = { root: null as unknown as HTMLButtonElement, icon: m.icon, value: el('b', 'bha-mark__n bha-num'), title: m.title };
    // ⓘ 설명 창을 네모 자체로 (눌러 열기·마우스 올리기). 제목 = 이름, 본문 = 지금 값 설명
    const b = infoTip(m.name, () => cell.title);
    b.classList.remove('bha-info');
    b.classList.add('bha-mark');
    b.dataset.mark = m.key;
    b.dataset.name = m.name;
    b.replaceChildren(icon(m.icon), cell.value);
    cell.root = b;
    return cell;
  };
  return {
    update(marks) {
      const key = marks.map((m) => `${m.key}:${m.on}:${m.icon}:${m.value}:${m.full ? 1 : 0}${m.focus ? 1 : 0}:${m.title}`).join('|');
      if (key === shown) return;
      shown = key;
      const want = new Set(marks.map((m) => m.key));
      for (const [k, c] of cells) {
        if (!want.has(k)) {
          c.root.remove();
          cells.delete(k);
        }
      }
      const rows: Record<StatusMarkSide, HTMLElement[]> = { self: [], foe: [] };
      for (const m of marks) {
        let c = cells.get(m.key);
        if (!c || c.icon !== m.icon || c.root.dataset.name !== m.name) {
          c?.root.remove();
          c = make(m);
          cells.set(m.key, c);
        }
        if (c.value.textContent !== m.value) c.value.textContent = m.value;
        c.title = m.title;
        c.root.setAttribute('aria-label', m.title);
        c.root.classList.toggle('is-full', m.full);
        c.root.classList.toggle('is-focus', m.focus);
        rows[m.on].push(c.root);
      }
      // 순서 = 목록 순서 (같으면 DOM 을 건드리지 않는다)
      for (const [side, row] of [['self', me], ['foe', foe]] as const) {
        const list = rows[side];
        const same = list.length === row.children.length && list.every((n, i) => row.children[i] === n);
        if (!same) row.replaceChildren(...list);
      }
    },
  };
}
