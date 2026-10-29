// 12칸 길 배치판 (GDD 17-1): 원정 시작 직전 카드 배치 단계와 바퀴 끝 배치 팝업이 같이 쓴다.
// 원정 중 걷는 화면에는 길 구조를 보이지 않는다 — 칸 순서가 보이는 곳은 여기뿐이다.
import { BALANCE } from '../../config/balance';
import { getTile } from '../../data/tiles';
import { isTempCell, moveTile, placeTile, swapTiles, tempHandCount, swapWithHand, synergyMods, synergyPairs, unplaceTile, type ExpeditionState, type SynergyPair } from '../../engine/expedition';
import { fixParticles } from '../../engine/josa';
import { tileHint, variantModsText } from '../labels';
import { el, emptyState, icon } from './dom';
import { canPlaceAt, tileCss, tileIconId } from './expedition';
import { registerCancelHook } from './shortcuts';

export interface RoadPlanner {
  el: HTMLElement;
  /** 상태가 바뀐 뒤 다시 그린다 */
  refresh(): void;
  /** 고른 타일을 풀고 안내 문구를 비운다. 지금까지 놓은 타일은 확정된 것으로 보아 더는 옮기거나 되돌릴 수 없다 */
  reset(): void;
  /** 이 배치판에서 놓은(아직 옮기거나 되돌릴 수 있는) 타일이 있는가 */
  canEdit(): boolean;
  /** 고른 것(손 타일 또는 놓은 칸)을 푼다. 풀 것이 있었으면 true (키보드 Q·Esc) */
  cancelSelection(): boolean;
  /** 바깥(프리셋 불러오기)에서 바꾼 길을 받아들인다 (C.140) */
  adopt(): void;
}

export interface RoadPlannerOpts {
  exp: ExpeditionState;
  tileName: (id: string) => string;
  /** 타일을 놓았을 때 (저장 등) */
  onPlaced?: () => void;
  /** 안내 문구가 바뀌었을 때 (호스트 화면이 따로 보이고 싶을 때). 안 주면 planner 안에 한 줄로 보인다 */
  caption?: string;
  /** 인접 시너지 이름 (GDD 25-5 ②). 주면 타일 변수가 켜진 원정에서 붙은 두 칸 사이에 이름을 미리 보인다 */
  synergyName?: (id: string) => string;
}

/** 배치판에 보일 시너지 짝 (순수): 타일 변수가 꺼졌거나 이름 함수가 없으면 없음 */
export function roadSynergies(exp: Pick<ExpeditionState, 'slots' | 'tileVariants'>, withNames: boolean): SynergyPair[] {
  return exp.tileVariants && withNames ? synergyPairs(exp.slots) : [];
}

/** 배치판 한 칸의 상태: 놓인 타일 / 놓을 수 있음 / 비어 있음 (순수) */
export function roadCellMode(o: { slot: string | null; index: number; pos: number; hasSelected: boolean }): 'placed' | 'can' | 'empty' {
  if (o.slot) return 'placed';
  return canPlaceAt({ slot: o.slot, index: o.index, pos: o.pos, phase: 'moving', hasSelected: o.hasSelected }) ? 'can' : 'empty';
}

/** 지금 고른 것: 손의 타일 / 놓은 칸 / 없음 */
export type RoadSelection = { kind: 'hand'; tileId: string } | { kind: 'cell'; cell: number } | null;

/** 배치판 칸을 눌렀을 때 할 일 (순수, GDD 18-8 — 터치·마우스·키보드 F 모두 같은 규칙):
 *  타일이 있는 칸 — 이 배치판에서 놓은 것(editable)이면: 아무것도 안 골랐으면 선택 / 같은 칸을 다시 누르면 손으로 복귀 / 다른 놓은 칸을 골라 둔 상태면 서로 교체 / 손 타일을 골라 둔 상태면 그 칸과 교체.
 *  이전 바퀴에서 확정된 타일이면 안내만(선택은 그대로).
 *  빈 칸 — 놓은 칸을 골라 둔 상태면 이동, 손 타일을 골라 둔 상태면 놓기, 아무것도 안 골랐으면 안내 */
export type CellAction = 'info' | 'select-placed' | 'return-hand' | 'swap-cells' | 'swap-hand' | 'move' | 'place' | 'need-pick';
export function cellAction(o: { slot: string | null; editable: boolean; selection: RoadSelection; index: number }): CellAction {
  const sel = o.selection;
  if (o.slot) {
    if (!o.editable) return 'info';
    if (sel?.kind === 'cell') return sel.cell === o.index ? 'return-hand' : 'swap-cells';
    if (sel?.kind === 'hand') return 'swap-hand';
    return 'select-placed';
  }
  if (sel?.kind === 'cell') return 'move';
  return sel?.kind === 'hand' ? 'place' : 'need-pick';
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

/** 고정 칸(처음부터 놓였거나 앞 바퀴에서 확정된 칸)을 눌렀을 때 안내 (GDD 121장 1) */
export const LOCKED_NOTE = '고정 칸 — 바꿀 수 없다';

/** 고정 칸 구석의 작은 자물쇠 */
function lockBadge(): HTMLElement {
  const b = el('span', 'bha-road__lock');
  b.setAttribute('aria-hidden', 'true');
  b.append(icon('i-lock'));
  return b;
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
  road.dataset.help = 'plan.road'; // 타일 안내 장면의 하이라이트 대상 (C.120)
  road.setAttribute('role', 'group');
  road.setAttribute('aria-label', '길');
  const cells: HTMLElement[] = [];
  for (let i = 0; i < L; i++) {
    if (i === 0) {
      // 둥지 칸 = 처음부터 놓인 고정 칸 (GDD 121장 1): 자물쇠 표시, 누르면 안내만
      const nest = el('button', 'bha-road__cell bha-road__cell--nest is-locked');
      nest.type = 'button';
      nest.dataset.nest = ''; // data-cell 이 없어 끌어 놓기 대상이 아니다
      nest.setAttribute('aria-label', '0번 칸 (둥지, 고정 칸)');
      nest.title = `${LOCKED_NOTE} (둥지)`;
      nest.append(icon('i-nest'), lockBadge());
      nest.onclick = () => {
        note = `${LOCKED_NOTE} (둥지)`;
        refresh();
      };
      cells.push(nest);
      road.append(nest);
      continue;
    }
    const b = el('button', 'bha-road__cell');
    b.type = 'button';
    b.dataset.cell = String(i);
    b.onclick = () => onCell(i);
    cells.push(b);
    road.append(b);
  }
  const noteEl = el('p', 'bha-road__note');
  noteEl.setAttribute('aria-live', 'polite');
  const noteRow = el('div', 'bha-road__noterow');
  noteRow.append(noteEl);
  const hand = el('div', 'bha-exp__hand bha-road__hand');
  hand.dataset.scList = '';
  hand.dataset.help = 'plan.hand';
  dragScroll(hand);
  // 시너지 목록 한 줄 (칸 사이 이름표 + 효과 요약)
  const synLine = el('p', 'bha-road__synline');
  const root = el('div', 'bha-road__wrap');
  root.append(road, synLine, noteRow, hand);

  const selection = (): RoadSelection => (selectedCell !== null ? { kind: 'cell', cell: selectedCell } : selected ? { kind: 'hand', tileId: selected } : null);

  function onCell(i: number): void {
    const id = exp.slots[i] ?? null;
    const act = cellAction({ slot: id, editable: placedHere.has(i), selection: selection(), index: i });
    if (act === 'info') note = `${LOCKED_NOTE} · ${o.tileName(id!)}: ${tileHint(getTile(id!))}`;
    else if (act === 'select-placed') {
      selectedCell = i;
      selected = null;
      note = `${i}번 칸의 ${o.tileName(id!)} 선택: 빈 칸을 누르면 이동, 다른 놓은 타일을 누르면 교체, 같은 칸을 다시 누르면 손으로 돌아온다`;
    } else if (act === 'return-hand') {
      const r = unplaceTile(exp, i);
      note = r.ok ? `${o.tileName(id!)}을(를) ${i}번 칸에서 손으로 되돌렸다` : r.reason;
      if (r.ok) {
        placedHere.delete(i);
        selectedCell = null;
        o.onPlaced?.();
      }
    } else if (act === 'swap-cells') {
      const from = selectedCell!;
      const r = swapTiles(exp, from, i);
      note = r.ok ? `${from}번 칸과 ${i}번 칸의 타일을 서로 바꿨다` : r.reason;
      if (r.ok) {
        selectedCell = null;
        o.onPlaced?.();
      }
    } else if (act === 'swap-hand') {
      const r = swapWithHand(exp, selected!, i);
      note = r.ok ? `${i}번 칸의 ${o.tileName(id!)}은(는) 손으로, ${o.tileName(selected!)}을(를) 그 칸에 놓았다` : r.reason;
      if (r.ok) {
        o.onPlaced?.();
        if (!exp.hand.includes(selected!)) selected = null;
      }
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

  function cancelSelection(): boolean {
    if (selected === null && selectedCell === null) return false;
    selected = null;
    selectedCell = null;
    note = '';
    refresh();
    return true;
  }
  // 판 바깥 빈 곳(안내 줄·칸 사이)을 누르면 선택만 풀린다. 타일은 그대로
  root.addEventListener('click', (e) => {
    // 눌린 칸·칩은 눌린 직후 다시 그려져 target 이 떨어져 나갈 수 있어, 눌린 순간의 경로로 판정한다
    const onTile = e.composedPath().some((n) => n instanceof Element && n.matches('.bha-road__cell, .bha-tilecard'));
    if (!onTile) cancelSelection();
  });
  // 키보드 Q·Esc: 이 배치판이 화면에 있고 고른 것이 있을 때만 선택 취소로 쓴다 (없으면 평소처럼 뒤로)
  let wasShown = false;
  registerCancelHook((top) => {
    if (root.isConnected) wasShown = true;
    else return wasShown ? 'gone' : false;
    if (top && !top.contains(root)) return false; // 다른 레이어(도움말 등)가 위에 열려 있으면 그것이 먼저 닫힌다
    return cancelSelection();
  });

  /** 임시 타일 표시 (GDD 121장 4 ②): 기존 시계 아이콘을 구석에 작게 */
  function tempMark(): HTMLElement {
    const m = el('span', 'bha-tempmark');
    m.setAttribute('aria-label', '임시 타일 — 이번 원정만');
    m.append(icon('i-timer'));
    return m;
  }

  function refresh(): void {
    if (selected && !exp.hand.includes(selected)) selected = null;
    if (selectedCell !== null && (!placedHere.has(selectedCell) || !exp.slots[selectedCell])) selectedCell = null;
    for (let i = 1; i < L; i++) {
      const id = exp.slots[i];
      const mode = roadCellMode({ slot: id ?? null, index: i, pos: exp.pos, hasSelected: selected !== null });
      const css = id ? tileCss(getTile(id).kind) : null;
      const b = cells[i]!;
      const canMove = mode === 'empty' && selectedCell !== null && canPlaceAt({ slot: null, index: i, pos: exp.pos, phase: 'moving', hasSelected: true });
      const locked = Boolean(id) && !placedHere.has(i);
      b.className = `bha-road__cell${css ? ` is-has bha-road__cell--${css}` : ''}${mode === 'can' || canMove ? ' is-can' : ''}${selectedCell === i ? ' is-selected' : ''}${id && placedHere.has(i) ? ' is-editable' : ''}${locked ? ' is-locked' : ''}`;
      // 놓인 타일 = 아이콘 + 칸 번호만 (GDD 121장 2 — 칸이 좁아 이름이 잘렸다). 이름은 안내 줄·title·aria 에서
      b.replaceChildren(icon(css ? tileIconId(css) : 'i-plus'), ...(locked ? [lockBadge()] : []), el('span', 'bha-road__num', String(i)));
      // 임시 타일 (GDD 121장 4 ②): 이번 원정만 — 구석에 작은 시계 아이콘
      if (id && isTempCell(exp, i)) b.append(tempMark());
      if (id && placedHere.has(i)) b.dataset.drag = 'cell';
      else delete b.dataset.drag;
      b.title = id ? `${o.tileName(id)}${isTempCell(exp, i) ? ' (임시 — 이번 원정만)' : ''} — ${tileHint(getTile(id))}${locked ? ` (${LOCKED_NOTE})` : ''}` : '빈 칸';
      b.setAttribute('aria-label', `${i}번 칸${id ? ` (${o.tileName(id)}${placedHere.has(i) ? ', 눌러서 선택' : ', 고정 칸'})` : mode === 'can' || canMove ? ' (놓을 수 있음)' : ' (비어 있음)'}`);
    }
    // 인접 시너지 (GDD 25-5 ②): 붙은 두 칸을 테두리로 묶고 오른쪽 칸 왼쪽 위(두 칸 사이)에 이름표. 줄이 바뀌는 짝(6열 경계)은 오른쪽 칸 모서리에
    const pairs = roadSynergies(exp, Boolean(o.synergyName));
    synLine.hidden = pairs.length === 0;
    synLine.replaceChildren();
    for (const p of pairs) {
      const name = o.synergyName!(p.id);
      for (const c of [p.left, p.right]) cells[c]!.classList.add('has-syn');
      const badge = el('span', `bha-road__syn${p.right % 6 === 0 ? ' bha-road__syn--wrap' : ''}`, name);
      badge.setAttribute('aria-hidden', 'true');
      cells[p.right]!.append(badge);
      cells[p.right]!.setAttribute('aria-label', `${cells[p.right]!.getAttribute('aria-label')} · 시너지 ${name}`);
      const item = el('span', 'bha-road__synitem');
      item.append(el('b', '', `${name}(${p.left}·${p.right})`), ` ${variantModsText(synergyMods(p.id)).join(' · ')}`);
      synLine.append(item);
    }
    // 조사는 타일 이름 받침에 맞게 ('영혼을(를)' → '영혼을', C.196)
    noteEl.textContent = fixParticles(note || (exp.hand.length > 0 ? '타일을 고른 뒤 빈 칸을 누르면 놓인다' : placedHere.size > 0 ? '놓은 타일을 눌러 옮기거나 교체하거나 손으로 되돌릴 수 있다' : '놓을 타일이 없다'));
    noteEl.title = noteEl.textContent; // 한 줄로 잘려도 전체 안내는 올리면 보인다 (C.182)
    hand.replaceChildren();
    if (exp.hand.length === 0) hand.append(emptyState('손에 든 타일 없음', { icon: 'i-deck' })); // 빈 상태 (GDD 100장 #87)
    for (const { id, count } of handCounts(exp.hand)) {
      const css = tileCss(getTile(id).kind);
      // 타일 카드 (C.141, GDD 85장 11번): 큰 아이콘 · 이름 · 장수 · 한 줄 효과. 눌러서 고르거나 끌어서 칸에 놓는다
      const chip = el('button', `bha-tilecard bha-tilecard--${css}${selected === id ? ' is-selected' : ''}`);
      chip.type = 'button';
      chip.dataset.drag = 'hand';
      chip.dataset.tile = id;
      chip.setAttribute('aria-pressed', String(selected === id));
      const ic = el('span', 'bha-tilecard__icon');
      ic.append(icon(tileIconId(css)));
      chip.append(ic, el('b', 'bha-tilecard__name', o.tileName(id)), el('small', 'bha-tilecard__hint', tileHint(getTile(id))), el('span', 'bha-tilecard__count', `×${count}`));
      const temp = tempHandCount(exp, id);
      if (temp > 0) {
        chip.append(tempMark());
        chip.title = `임시 타일 ${temp}장 — 이번 원정 동안만 놓을 수 있다`;
      }
      chip.onclick = () => {
        selected = selected === id ? null : id;
        selectedCell = null;
        note = selected ? `${o.tileName(id)}: ${tileHint(getTile(id))}. 빈 칸(＋)을 누르거나 끌어서 놓는다` : '';
        refresh();
      };
      hand.append(chip);
    }
  }

  // 끌어서 놓기 (C.141, GDD 85장 11번): 손 카드 → 칸 / 놓은 칸 → 다른 칸(이동·교체) / 놓은 칸 → 손(되돌리기). 터치는 잠깐 눌러야 끌리고(그 전에는 화면 스크롤), 마우스는 5px 끌면 시작한다.
  // 놓는 동작은 눌러서 고르기와 같은 규칙(onCell)을 그대로 쓴다 — 선택을 흉내 낸 뒤 칸을 누른 것으로 처리한다
  type Src = { kind: 'hand'; id: string } | { kind: 'cell'; cell: number };
  let pending: { src: Src; el: HTMLElement; x: number; y: number; pointerId: number; touch: boolean; timer: number } | null = null;
  let dragging: { src: Src; ghost: HTMLElement; over: HTMLElement | null } | null = null;
  let suppressClick = false;
  const DRAG_HOLD_MS = 200;
  const targetAt = (x: number, y: number): HTMLElement | null => {
    const t = document.elementFromPoint(x, y)?.closest<HTMLElement>('.bha-road__cell[data-cell], .bha-road__hand');
    return t && root.contains(t) ? t : null;
  };
  const startDrag = () => {
    if (!pending) return;
    const { src, el: from, x, y } = pending;
    pending = null;
    selected = null;
    selectedCell = null;
    // 끌고 가는 표시는 아이콘 원 하나 (기기 화면이 가로로 돌려 보이므로, 글자가 든 카드를 복사하면 옆으로 누워 보인다)
    const ghost = el('span', 'bha-drag-ghost');
    ghost.style.setProperty('--tile', getComputedStyle(from).getPropertyValue('--tile') || 'var(--bha-bg-3)');
    const srcIcon = from.querySelector('svg');
    if (srcIcon) ghost.append(srcIcon.cloneNode(true));
    ghost.style.left = `${x}px`;
    ghost.style.top = `${y}px`;
    document.body.append(ghost);
    from.classList.add('is-dragging');
    dragging = { src, ghost, over: null };
    root.classList.add('is-dragging-tile');
  };
  const endDrag = (drop: boolean, x: number, y: number) => {
    window.clearTimeout(pending?.timer);
    pending = null;
    const d = dragging;
    if (!d) return;
    dragging = null;
    d.ghost.remove();
    d.over?.classList.remove('is-drop');
    root.classList.remove('is-dragging-tile');
    root.querySelectorAll('.is-dragging').forEach((n) => n.classList.remove('is-dragging'));
    suppressClick = true;
    window.setTimeout(() => { suppressClick = false; }, 0);
    const t = drop ? targetAt(x, y) : null;
    if (!t) return refresh();
    if (t.classList.contains('bha-road__hand')) {
      if (d.src.kind === 'cell') {
        selectedCell = d.src.cell;
        onCell(d.src.cell); // 같은 칸을 다시 누른 것 = 손으로 되돌리기
      } else refresh();
      return;
    }
    const i = Number(t.dataset.cell);
    if (d.src.kind === 'cell') {
      if (d.src.cell === i) return refresh();
      selectedCell = d.src.cell;
      selected = null;
    } else {
      selected = d.src.id;
      selectedCell = null;
    }
    onCell(i);
  };
  const srcOf = (t: HTMLElement): Src | null => {
    if (t.dataset.drag === 'hand' && t.dataset.tile) return { kind: 'hand', id: t.dataset.tile };
    if (t.dataset.drag === 'cell' && t.dataset.cell) return { kind: 'cell', cell: Number(t.dataset.cell) };
    return null;
  };
  root.addEventListener('pointerdown', (e) => {
    const t = (e.target as Element).closest<HTMLElement>('[data-drag]');
    const src = t ? srcOf(t) : null;
    if (!t || !src || pending || dragging) return;
    const touch = e.pointerType !== 'mouse';
    pending = { src, el: t, x: e.clientX, y: e.clientY, pointerId: e.pointerId, touch, timer: touch ? window.setTimeout(startDrag, DRAG_HOLD_MS) : 0 };
  });
  window.addEventListener('pointermove', (e) => {
    if (pending && e.pointerId === pending.pointerId) {
      const dx = e.clientX - pending.x;
      const dy = e.clientY - pending.y;
      if (pending.touch) {
        if (Math.hypot(dx, dy) > 10) { window.clearTimeout(pending.timer); pending = null; } // 먼저 움직이면 스크롤
      } else if (Math.hypot(dx, dy) > 5) {
        // 손 목록이 옆으로 넘칠 때 가로로 끌면 목록 스크롤(dragScroll), 세로·대각선이면 카드 끌기
        if (pending.src.kind === 'hand' && Math.abs(dx) > Math.abs(dy) && hand.scrollWidth > hand.clientWidth) pending = null;
        else startDrag();
      }
    }
    if (!dragging) return;
    dragging.ghost.style.left = `${e.clientX}px`;
    dragging.ghost.style.top = `${e.clientY}px`;
    const over = targetAt(e.clientX, e.clientY);
    if (over !== dragging.over) {
      dragging.over?.classList.remove('is-drop');
      over?.classList.add('is-drop');
      dragging.over = over;
    }
  });
  window.addEventListener('pointerup', (e) => {
    if (dragging) endDrag(true, e.clientX, e.clientY);
    else if (pending) { window.clearTimeout(pending.timer); pending = null; }
  });
  window.addEventListener('pointercancel', () => {
    if (dragging) endDrag(false, 0, 0);
    else if (pending) { window.clearTimeout(pending.timer); pending = null; }
  });
  // 터치로 끌기가 시작된 뒤에는 화면이 같이 스크롤되지 않게
  root.addEventListener('touchmove', (e) => { if (dragging && e.cancelable) e.preventDefault(); }, { passive: false });
  root.addEventListener('click', (e) => {
    if (!suppressClick) return;
    e.stopPropagation();
    e.preventDefault();
  }, true);
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
    /** 바깥(프리셋 불러오기 등)에서 바꾼 길을 받아들인다: 지금 놓인 앞쪽 칸을 모두 '이번에 놓은 칸'(옮기기·되돌리기 가능)으로 */
    adopt: () => {
      placedHere.clear();
      for (let i = Math.max(1, exp.pos + 1); i < L; i++) if (exp.slots[i]) placedHere.add(i);
      selected = null;
      selectedCell = null;
      refresh();
    },
    cancelSelection,
  };
}

/** 가로로 넘치는 목록을 끌어서·휠로 옆으로 넘긴다 (GDD 85장 11번 버그: 손 타일이 많으면 오른쪽 타일을 못 골랐다). 5px 넘게 끌면 그 뒤 클릭은 먹는다 */
export function dragScroll(box: HTMLElement): void {
  let startX = 0;
  let startLeft = 0;
  let dragging = false;
  let moved = false;
  box.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || box.scrollWidth <= box.clientWidth) return; // 터치는 브라우저 가로 스크롤 그대로
    dragging = true;
    moved = false;
    startX = e.clientX;
    startLeft = box.scrollLeft;
  });
  box.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    if (Math.abs(dx) > 5) moved = true;
    if (moved) box.scrollLeft = startLeft - dx;
  });
  const end = () => { dragging = false; };
  box.addEventListener('pointerup', end);
  box.addEventListener('pointerleave', end);
  box.addEventListener('click', (e) => {
    if (!moved) return;
    moved = false;
    e.stopPropagation();
    e.preventDefault();
  }, true);
  box.addEventListener('wheel', (e) => {
    if (box.scrollWidth <= box.clientWidth || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    box.scrollLeft += e.deltaY;
    e.preventDefault();
  }, { passive: false });
}
