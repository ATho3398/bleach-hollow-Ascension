// 12칸 길 배치판 (GDD 17-1): 원정 시작 직전 카드 배치 단계와 바퀴 끝 배치 팝업이 같이 쓴다.
// 원정 중 걷는 화면에는 길 구조를 보이지 않는다 — 칸 순서가 보이는 곳은 여기뿐이다.
import { BALANCE } from '../../config/balance';
import { getTile } from '../../data/tiles';
import { moveTile, placeTile, unplaceTile, type ExpeditionState } from '../../engine/expedition';
import { tileHint } from '../labels';
import { button, el, icon } from './dom';
import { canPlaceAt, tileCss, tileIconId } from './expedition';

export interface RoadPlanner {
  el: HTMLElement;
  /** 상태가 바뀐 뒤 다시 그린다 */
  refresh(): void;
  /** 고른 타일을 풀고 안내 문구를 비운다. 지금까지 놓은 타일은 확정된 것으로 보아 더는 옮기거나 되돌릴 수 없다 */
  reset(): void;
  /** 이 배치판에서 놓은(아직 옮기거나 되돌릴 수 있는) 타일이 있는가 */
  canEdit(): boolean;
}

export interface RoadPlannerOpts {
  exp: ExpeditionState;
  tileName: (id: string) => string;
  /** 타일을 놓았을 때 (저장 등) */
  onPlaced?: () => void;
  /** 안내 문구가 바뀌었을 때 (호스트 화면이 따로 보이고 싶을 때). 안 주면 planner 안에 한 줄로 보인다 */
  caption?: string;
}

/** 배치판 한 칸의 상태: 놓인 타일 / 놓을 수 있음 / 비어 있음 (순수) */
export function roadCellMode(o: { slot: string | null; index: number; pos: number; hasSelected: boolean }): 'placed' | 'can' | 'empty' {
  if (o.slot) return 'placed';
  return canPlaceAt({ slot: o.slot, index: o.index, pos: o.pos, phase: 'moving', hasSelected: o.hasSelected }) ? 'can' : 'empty';
}

/** 배치판 칸을 눌렀을 때 할 일 (순수, GDD 18-4):
 *  타일이 있는 칸 = 이 배치판에서 놓은 것이면 선택(다시 누르면 선택 해제), 아니면(이전 바퀴에서 확정된 타일) 정보만 보인다.
 *  빈 칸 = 놓은 타일을 골라 둔 상태면 옮기기, 손의 타일을 골라 둔 상태면 놓기, 아무것도 안 골랐으면 안내 */
export type CellAction = 'info' | 'select-placed' | 'deselect' | 'move' | 'place' | 'need-pick';
export function cellAction(o: { slot: string | null; editable: boolean; selectedTile: string | null; selectedCell: number | null; index: number }): CellAction {
  if (o.slot) {
    if (!o.editable) return 'info';
    return o.selectedCell === o.index ? 'deselect' : 'select-placed';
  }
  if (o.selectedCell !== null) return 'move';
  return o.selectedTile ? 'place' : 'need-pick';
}

/** 손에 든 타일을 종류별로 센다 (순수): 같은 id 는 한 칩으로 묶는다 */
export function handCounts(hand: readonly string[]): { id: string; count: number }[] {
  const out: { id: string; count: number }[] = [];
  for (const id of hand) {
    const e = out.find((x) => x.id === id);
    if (e) e.count++;
    else out.push({ id, count: 1 });
  }
  return out;
}

export function roadPlanner(o: RoadPlannerOpts): RoadPlanner {
  const { exp } = o;
  const L = BALANCE.expedition.loopTiles;
  let selected: string | null = null;
  /** 놓은 타일 중 옮기거나 되돌릴 수 있게 골라 둔 칸 */
  let selectedCell: number | null = null;
  /** 이 배치판에서 놓은 칸 (확정 전까지 수정 가능) */
  const placedHere = new Set<number>();
  let note = o.caption ?? '';

  const road = el('div', 'bha-road');
  road.setAttribute('role', 'group');
  road.setAttribute('aria-label', '길');
  const cells: HTMLElement[] = [];
  for (let i = 0; i < L; i++) {
    if (i === 0) {
      const nest = el('span', 'bha-road__cell bha-road__cell--nest');
      nest.append(icon('i-nest'));
      cells.push(nest);
      road.append(nest);
      continue;
    }
    const b = el('button', 'bha-road__cell');
    b.type = 'button';
    b.onclick = () => onCell(i);
    cells.push(b);
    road.append(b);
  }
  const noteEl = el('p', 'bha-road__note');
  noteEl.setAttribute('aria-live', 'polite');
  const undo = button({ label: '손으로 되돌리기', icon: 'i-return', size: 'small', variant: 'ghost', onClick: () => undoSelected() });
  undo.classList.add('bha-road__undo');
  undo.dataset.sc = 'undo';
  const noteRow = el('div', 'bha-road__noterow');
  noteRow.append(noteEl, undo);
  const hand = el('div', 'bha-exp__hand bha-road__hand');
  hand.dataset.scList = '';
  const root = el('div', 'bha-road__wrap');
  root.append(road, noteRow, hand);

  function onCell(i: number): void {
    const id = exp.slots[i] ?? null;
    const act = cellAction({ slot: id, editable: placedHere.has(i), selectedTile: selected, selectedCell, index: i });
    if (act === 'info') note = `${o.tileName(id!)}: ${tileHint(getTile(id!))} (이전 바퀴에서 확정된 타일)`;
    else if (act === 'select-placed') {
      selectedCell = i;
      selected = null;
      note = `${i}번 칸의 ${o.tileName(id!)} 선택: 옮길 빈 칸을 누르거나 [손으로 되돌리기]`;
    } else if (act === 'deselect') {
      selectedCell = null;
      note = '';
    } else if (act === 'move') {
      const from = selectedCell!;
      const tid = exp.slots[from]!;
      const r = moveTile(exp, from, i);
      note = r.ok ? `${o.tileName(tid)}을(를) ${from}번 → ${i}번 칸으로 옮겼다` : r.reason;
      if (r.ok) {
        placedHere.delete(from);
        placedHere.add(i);
        selectedCell = null;
        o.onPlaced?.();
      }
    } else if (act === 'place') {
      const r = placeTile(exp, selected!, i);
      note = r.ok ? `${o.tileName(selected!)}을(를) ${i}번 칸에 놓았다 (눌러서 옮기거나 되돌릴 수 있다)` : r.reason;
      if (r.ok) {
        placedHere.add(i);
        o.onPlaced?.();
        if (!exp.hand.includes(selected!)) selected = null;
      }
    } else note = '아래 타일을 먼저 고른다 (놓은 타일을 눌러도 된다)';
    refresh();
  }

  function undoSelected(): void {
    if (selectedCell === null) return;
    const from = selectedCell;
    const tid = exp.slots[from];
    const r = unplaceTile(exp, from);
    note = r.ok ? `${o.tileName(tid!)}을(를) ${from}번 칸에서 손으로 되돌렸다` : r.reason;
    if (r.ok) {
      placedHere.delete(from);
      selectedCell = null;
      o.onPlaced?.();
    }
    refresh();
  }

  function refresh(): void {
    if (selected && !exp.hand.includes(selected)) selected = null;
    if (selectedCell !== null && (!placedHere.has(selectedCell) || !exp.slots[selectedCell])) selectedCell = null;
    undo.hidden = selectedCell === null;
    for (let i = 1; i < L; i++) {
      const id = exp.slots[i];
      const mode = roadCellMode({ slot: id ?? null, index: i, pos: exp.pos, hasSelected: selected !== null });
      const css = id ? tileCss(getTile(id).kind) : null;
      const b = cells[i]!;
      const canMove = mode === 'empty' && selectedCell !== null && canPlaceAt({ slot: null, index: i, pos: exp.pos, phase: 'moving', hasSelected: true });
      b.className = `bha-road__cell${css ? ` is-has bha-road__cell--${css}` : ''}${mode === 'can' || canMove ? ' is-can' : ''}${selectedCell === i ? ' is-selected' : ''}${id && placedHere.has(i) ? ' is-editable' : ''}`;
      b.replaceChildren(icon(css ? tileIconId(css) : 'i-plus'), el('span', 'bha-road__num', String(i)));
      b.title = id ? `${o.tileName(id)} — ${tileHint(getTile(id))}` : '빈 칸';
      b.setAttribute('aria-label', `${i}번 칸${id ? ` (${o.tileName(id)}${placedHere.has(i) ? ', 옮기거나 되돌릴 수 있음' : ''})` : mode === 'can' || canMove ? ' (놓을 수 있음)' : ' (비어 있음)'}`);
    }
    noteEl.textContent = note || (exp.hand.length > 0 ? '타일을 고른 뒤 빈 칸을 누르면 놓인다' : placedHere.size > 0 ? '놓은 타일을 눌러 옮기거나 되돌릴 수 있다' : '놓을 타일이 없다');
    hand.replaceChildren();
    if (exp.hand.length === 0) hand.append(el('span', 'bha-faint', '손에 든 타일 없음'));
    for (const { id, count } of handCounts(exp.hand)) {
      const css = tileCss(getTile(id).kind);
      const chip = el('button', `bha-tilechip bha-tilechip--${css}${selected === id ? ' is-selected' : ''}`);
      chip.type = 'button';
      chip.setAttribute('aria-pressed', String(selected === id));
      const ic = el('span', 'bha-tilechip__icon');
      ic.append(icon(tileIconId(css)));
      chip.append(ic, o.tileName(id), el('span', 'bha-tilechip__count', String(count)));
      chip.onclick = () => {
        selected = selected === id ? null : id;
        selectedCell = null;
        note = selected ? `${o.tileName(id)}: ${tileHint(getTile(id))}. 빈 칸(＋)을 눌러 놓는다` : '';
        refresh();
      };
      hand.append(chip);
    }
  }
  refresh();
  return {
    el: root,
    refresh,
    reset: () => {
      selected = null;
      selectedCell = null;
      placedHere.clear();
      note = o.caption ?? '';
      refresh();
    },
    canEdit: () => placedHere.size > 0,
  };
}
