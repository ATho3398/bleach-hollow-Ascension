// 12칸 길 배치판 (GDD 17-1): 원정 시작 직전 카드 배치 단계와 바퀴 끝 배치 팝업이 같이 쓴다.
// 원정 중 걷는 화면에는 길 구조를 보이지 않는다 — 칸 순서가 보이는 곳은 여기뿐이다.
import { BALANCE } from '../../config/balance';
import { getTile } from '../../data/tiles';
import { placeTile, type ExpeditionState } from '../../engine/expedition';
import { tileHint } from '../labels';
import { el, icon } from './dom';
import { canPlaceAt, tileCss, tileIconId } from './expedition';

export interface RoadPlanner {
  el: HTMLElement;
  /** 상태가 바뀐 뒤 다시 그린다 */
  refresh(): void;
  /** 고른 타일을 풀고 안내 문구를 비운다 */
  reset(): void;
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
  const hand = el('div', 'bha-exp__hand bha-road__hand');
  const root = el('div', 'bha-road__wrap');
  root.append(road, noteEl, hand);

  function onCell(i: number): void {
    const id = exp.slots[i];
    if (id) note = `${o.tileName(id)}: ${tileHint(getTile(id))}`;
    else if (selected) {
      const r = placeTile(exp, selected, i);
      note = r.ok ? `${o.tileName(selected)}을(를) ${i}번 칸에 놓았다` : r.reason;
      if (r.ok) {
        o.onPlaced?.();
        if (!exp.hand.includes(selected)) selected = null;
      }
    } else note = '아래 타일을 먼저 고른다';
    refresh();
  }

  function refresh(): void {
    if (selected && !exp.hand.includes(selected)) selected = null;
    for (let i = 1; i < L; i++) {
      const id = exp.slots[i];
      const mode = roadCellMode({ slot: id ?? null, index: i, pos: exp.pos, hasSelected: selected !== null });
      const css = id ? tileCss(getTile(id).kind) : null;
      const b = cells[i]!;
      b.className = `bha-road__cell${css ? ` is-has bha-road__cell--${css}` : ''}${mode === 'can' ? ' is-can' : ''}`;
      b.replaceChildren(icon(css ? tileIconId(css) : 'i-plus'), el('span', 'bha-road__num', String(i)));
      b.title = id ? `${o.tileName(id)} — ${tileHint(getTile(id))}` : '빈 칸';
      b.setAttribute('aria-label', `${i}번 칸${id ? ` (${o.tileName(id)})` : mode === 'can' ? ' (놓을 수 있음)' : ' (비어 있음)'}`);
    }
    noteEl.textContent = note || (exp.hand.length > 0 ? '타일을 고른 뒤 빈 칸을 누르면 놓인다' : '놓을 타일이 없다');
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
      note = o.caption ?? '';
      refresh();
    },
  };
}
