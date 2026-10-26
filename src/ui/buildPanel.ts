// 흡수 빌드 표시 — 보관함 '슬롯' 화면 (GDD 94장 A, C.149): 왼쪽 = 장착 칸(본체 슬롯 + 해방 블록 칸) 큰 아이콘 바둑판, 오른쪽 = 내가 가진 특성 카드 바둑판.
// 배치 = ① 카드·칸을 끌어다 놓기 ② 카드(✓)를 열어 [칸 고르기] → 칸을 눌러(✓) 놓기. 칸·카드를 누르면 상세 창. 문구는 종족 설정(slotName 등)에서 읽는다.
import { BALANCE } from '../config/balance';
import { elementName } from '../data/elements';
import { getTrait, traitDescription, traitName } from '../data/traits';
import { emptySlot, enhanceLevel, LIBERATION_SLOT_MAX, liberationEligible, liberationSlotCount, setLiberationSlot, setSlot, type BuildResult, type BuildState } from '../engine/absorb';
import type { FactionConfig } from '../engine/faction';
import { button, h, icon, panel, provisionalTag } from './bha/dom';
import { enableDrag } from './bha/dragdrop';
import { elementDot, paintElement } from './bha/element';
import { iconArt, itemCard, itemDialog } from './bha/itemUi';
import { battleLabels, liberationLabels, skillBlockLabel } from './labels';
import { isTestMode } from './testMode';

export const PROVISIONAL_NOTE = '속성·특성 풀과 리스크 수치는 임시 데이터입니다 (기획 11-3, 11-4 미정)';

/** 장착 칸 하나: 본체 슬롯(body) 또는 해방 블록 칸(lib) */
export interface SlotCell {
  area: 'body' | 'lib';
  index: number;
}

/** 슬롯 화면 상태: 집어 든 특성(상세 창의 [칸 고르기]) — 다음에 누른 칸에 놓는다. from = 칸에서 집었으면 그 칸 */
export interface TraitsTabState {
  held?: { id: string; from: SlotCell | null } | null;
}

const idAt = (b: BuildState, c: SlotCell): string | null => (c.area === 'body' ? b.slots[c.index] : b.liberation?.[c.index]) ?? null;

/** 특성을 칸에 놓는다 (끌어놓기·고르기 공용). from 이 있으면 그 칸에서 옮기는 것: 같은 영역이면 자리를 바꾸고, 본체 ↔ 해방은 복사(두 목록은 따로 고른다, 83장 3번) */
export function placeTrait(b: BuildState, tierIndex: number, to: SlotCell, id: string, from: SlotCell | null = null): BuildResult {
  const prev = idAt(b, to);
  const r = to.area === 'body' ? setSlot(b, to.index, id) : setLiberationSlot(b, to.index, id, tierIndex);
  if (!r.ok) return r;
  if (from && from.area === to.area && prev && prev !== id) {
    if (to.area === 'body') setSlot(b, from.index, prev);
    else setLiberationSlot(b, from.index, prev, tierIndex);
  }
  return { ok: true };
}

/** 칸을 비운다 (빼기). 빠진 특성은 보유 목록에 그대로 남는다 */
export function clearCell(b: BuildState, tierIndex: number, c: SlotCell): BuildResult {
  return c.area === 'body' ? setSlot(b, c.index, null) : setLiberationSlot(b, c.index, null, tierIndex);
}

/** 이 특성을 이 칸에 놓을 수 있나: 해방 칸은 열린 칸 + 블록 특성만 */
export function canPlace(b: BuildState, tierIndex: number, to: SlotCell, id: string): boolean {
  return to.area === 'body' ? to.index < b.slots.length : to.index < liberationSlotCount(tierIndex) && liberationEligible(b, id);
}

/** 계열 아이콘 id (84장 5번): 공격 = 계열의 연출 종류, 막기·회복 = 방패·잎, 그 밖의 특성(외형·패시브) = 특성 아이콘 */
export function traitIconId(faction: FactionConfig, id: string): string {
  const t = getTrait(id);
  if (t.kind !== 'skill') return t.kind === 'part' ? 'i-rare' : 'i-slot';
  if (t.role === 'guard') return 'i-guard';
  if (t.role === 'heal') return 'i-heal';
  const fx = faction.families.find((f) => f.id === t.family)?.fx;
  return fx ? `i-fx-${fx}` : 'i-attack';
}

/** 블록 이름 (84장 4번): 조·탄·교 / 막기·회복. 블록이 아닌 특성은 특성 이름 */
export function traitBlockName(faction: FactionConfig, id: string, tierIndex = 0): string {
  const t = getTrait(id);
  return (t.kind === 'skill' ? skillBlockLabel(battleLabels(faction, tierIndex), t.family, t.role ?? null) : null) ?? traitName(id, faction.id);
}

/** 데이터 설명 앞의 "[임시]" 표시는 플레이어 화면에서는 뺀다 (94장 A-2, 테스트 모드에서만 보인다) */
const plainDesc = (text: string): string => (isTestMode() ? text : text.replace(/^\[임시\]\s*/, ''));

/** 카드의 짧은 효과 줄: 블록 = 계열·위력, 그 밖 = 설명 */
export function traitBrief(faction: FactionConfig, id: string): string {
  const t = getTrait(id);
  if (t.kind !== 'skill' || t.powerInAttacks === undefined) return plainDesc(traitDescription(id, faction.id));
  const kind = t.role === 'guard' ? '막기' : t.role === 'heal' ? '회복' : faction.families.find((f) => f.id === t.family)?.name ?? '공격';
  return `${kind} · 위력 ${t.powerInAttacks}회분`;
}

function traitArt(faction: FactionConfig, id: string): HTMLElement {
  const art = paintElement(iconArt(traitIconId(faction, id)), getTrait(id).element);
  art.classList.add('bha-sgart');
  art.append(elementDot(getTrait(id).element, faction.id));
  return art;
}

/** 상세 창 (아이템 탭 상세 창과 같은 컴포넌트): 이름 · 계열 · 속성 · 효과 · 속성 강화 n/100 · [장착]/[칸 고르기]/[빼기] */
function openTraitDetail(faction: FactionConfig, build: BuildState, state: TraitsTabState, tierIndex: number, id: string, from: SlotCell | null, onChange: () => void): void {
  const t = getTrait(id);
  const name = traitBlockName(faction, id, tierIndex);
  const lv = enhanceLevel(build, t.element);
  const kind = t.role ? (t.role === 'attack' ? `${faction.families.find((f) => f.id === t.family)?.name ?? '공격'}` : t.role === 'guard' ? '막기' : '회복') : faction.traitKindNames[t.kind];
  const actions: Parameters<typeof itemDialog>[0]['actions'] = [];
  let close: () => void = () => {};
  const pick = () => { close(); state.held = { id, from }; onChange(); };
  if (from) {
    actions.push({ key: 'move', label: () => '다른 칸으로', variant: 'primary', onClick: pick });
    actions.push({ key: 'remove', label: () => '빼기', variant: 'ghost', onClick: () => { close(); clearCell(build, tierIndex, from); onChange(); } });
  } else {
    const free = emptySlot(build);
    actions.push({
      key: 'equip', label: () => (free >= 0 ? '장착' : '칸 고르기'), variant: 'primary',
      onClick: () => {
        if (free < 0) return pick();
        close();
        setSlot(build, free, id);
        onChange();
      },
    });
    if (free >= 0) actions.push({ key: 'pick', label: () => '칸 고르기', variant: 'ghost', onClick: pick });
  }
  close = itemDialog({
    heading: from ? `${from.area === 'body' ? faction.slotName : '해방 블록'} ${from.index + 1}번 칸` : '특성',
    name, desc: `${kind} · ${elementName(t.element, faction.id)} 속성\n${plainDesc(traitDescription(id, faction.id))}`,
    art: traitArt(faction, id), have: `속성 강화 ${lv}/${BALANCE.provisional.absorb.enhance.max}`, actions,
  });
}

/** 장착 칸 한 칸 */
function cellButton(faction: FactionConfig, build: BuildState, state: TraitsTabState, tierIndex: number, cell: SlotCell, onChange: () => void): HTMLElement {
  const id = idAt(build, cell);
  const open = cell.area === 'body' || cell.index < liberationSlotCount(tierIndex);
  const num = h('span', 'bha-sgcell__num', `${cell.index + 1}`);
  if (!open) {
    const at = BALANCE.provisional.liberation.slotsByTier.findIndex((n) => n > cell.index);
    const e = h('div', 'bha-sgcell bha-sgcell--locked');
    e.append(num, icon('i-lock'), h('span', 'bha-sgcell__name', at >= 0 ? `${faction.tierNames[at] ?? `${at + 1}단계`}에 열림` : '잠김'));
    return e;
  }
  const b = h('button', 'bha-sgcell');
  b.type = 'button';
  b.dataset.area = cell.area;
  b.dataset.index = String(cell.index);
  const areaName = cell.area === 'body' ? faction.slotName : '해방 블록';
  const held = state.held ?? null;
  if (held) {
    const ok = canPlace(build, tierIndex, cell, held.id);
    b.classList.add(ok ? 'is-target' : 'is-blocked');
    b.disabled = !ok;
  }
  if (!id) {
    b.classList.add('bha-sgcell--empty');
    b.setAttribute('aria-label', `${areaName} ${cell.index + 1}번 칸 비어 있음`);
    b.append(num, icon('i-plus'), h('span', 'bha-sgcell__name', held ? '여기에 놓기' : '비어 있음'));
  } else {
    paintElement(b, getTrait(id).element);
    b.classList.add('bha-sgcell--filled');
    b.dataset.drag = 'cell';
    b.setAttribute('aria-label', `${areaName} ${cell.index + 1}번 칸 ${traitBlockName(faction, id, tierIndex)}`);
    b.append(num, icon(traitIconId(faction, id)), h('span', 'bha-sgcell__name', traitBlockName(faction, id, tierIndex)), h('small', 'bha-sgcell__enh', `강화 ${enhanceLevel(build, getTrait(id).element)}/${BALANCE.provisional.absorb.enhance.max}`), elementDot(getTrait(id).element, faction.id));
  }
  b.onclick = () => {
    if (held) {
      if (!canPlace(build, tierIndex, cell, held.id)) return;
      placeTrait(build, tierIndex, cell, held.id, held.from);
      state.held = null;
      return onChange();
    }
    if (id) openTraitDetail(faction, build, state, tierIndex, id, cell, onChange);
  };
  return b;
}

/** 보관함 '슬롯' 화면: [왼쪽 장착 칸, 오른쪽 가진 특성 카드] */
export function traitsTab(faction: FactionConfig, build: BuildState, state: TraitsTabState, onChange: () => void, tierIndex = 0): HTMLElement[] {
  if (state.held && (!build.owned.includes(state.held.id) || (state.held.from && idAt(build, state.held.from) !== state.held.id))) state.held = null;
  const filled = build.slots.filter(Boolean).length;
  const left = panel({ title: '장착', aside: h('span', '', `${faction.slotName} ${filled} / ${build.slots.length}`) });
  left.querySelector('.bha-panel__title')?.prepend(icon('i-slot'));
  if (isTestMode()) left.querySelector('.bha-panel__title')?.append(' ', provisionalTag());
  if (state.held) {
    const bar = h('div', 'bha-sgbar');
    bar.append(h('span', '', `‘${traitBlockName(faction, state.held.id, tierIndex)}’을(를) 놓을 칸을 누른다`), button({ label: '취소', size: 'small', onClick: () => { state.held = null; onChange(); } }));
    left.append(bar);
  }
  const body = h('div', 'bha-sgrow');
  body.dataset.area = 'body';
  build.slots.forEach((_, i) => body.append(cellButton(faction, build, state, tierIndex, { area: 'body', index: i }, onChange)));
  const lib = h('div', 'bha-sgrow');
  lib.dataset.area = 'lib';
  for (let i = 0; i < LIBERATION_SLOT_MAX; i++) lib.append(cellButton(faction, build, state, tierIndex, { area: 'lib', index: i }, onChange));
  const libName = liberationLabels(faction, tierIndex).name;
  left.append(h('h3', 'bha-sgrow__title', `${faction.slotName}`), body, h('h3', 'bha-sgrow__title', `해방 블록 — ${libName}`), lib);
  if (!state.held) left.append(h('p', 'bha-faint', '카드를 칸으로 끌어다 놓는다. 칸을 오른쪽 목록으로 끌면 뺀다.'));

  const heldId = state.held?.id ?? null;
  const spare = build.owned.filter((id) => !build.slots.includes(id));
  const right = panel({ title: '가진 특성', aside: `${build.owned.length}개` });
  right.classList.add('bha-sgown');
  right.querySelector('.bha-panel__title')?.prepend(icon('i-absorb'));
  const grid = h('div', 'bha-itemgrid bha-sggrid');
  if (spare.length === 0) grid.append(h('p', 'bha-faint bha-itemgrid__empty', build.owned.length === 0 ? '남는 특성 없음 — 원정에서 흡수하면 얻는다' : '남는 특성 없음'));
  for (const id of spare) {
    const t = getTrait(id);
    const card = itemCard({
      id, name: traitBlockName(faction, id, tierIndex), detail: traitBrief(faction, id), art: traitArt(faction, id),
      foot: `강화 ${enhanceLevel(build, t.element)}/${BALANCE.provisional.absorb.enhance.max}`, badge: build.liberation?.includes(id) ? '해방' : undefined, state: heldId === id ? 'worn' : undefined,
      onClick: () => openTraitDetail(faction, build, state, tierIndex, id, null, onChange),
    });
    paintElement(card, t.element);
    card.dataset.drag = 'card';
    card.dataset.trait = id;
    grid.append(card);
  }
  right.append(grid);
  if (isTestMode()) right.append(h('p', 'bha-faint', PROVISIONAL_NOTE));

  // 끌어다 놓기: 카드·칸 → 칸 (놓기/옮기기), 칸 → 카드 쪽(밖) (빼기)
  type Src = { id: string; from: SlotCell | null };
  const wire = (node: HTMLElement) => enableDrag<Src>({
    root: node,
    scope: () => node.closest('.bha-lcdpage') ?? document.body,
    sourceOf: (n) => {
      if (n.dataset.drag === 'card' && n.dataset.trait) return { id: n.dataset.trait, from: null };
      if (n.dataset.drag === 'cell') {
        const c: SlotCell = { area: n.dataset.area as SlotCell['area'], index: Number(n.dataset.index) };
        const id = idAt(build, c);
        return id ? { id, from: c } : null;
      }
      return null;
    },
    targetSelector: '.bha-sgcell[data-area]:not(:disabled), .bha-sgown',
    onDrop: (src, target) => {
      state.held = null;
      if (target?.classList.contains('bha-sgcell')) {
        const to: SlotCell = { area: target.dataset.area as SlotCell['area'], index: Number(target.dataset.index) };
        if (canPlace(build, tierIndex, to, src.id)) placeTrait(build, tierIndex, to, src.id, src.from);
      } else if (src.from && target?.classList.contains('bha-sgown')) clearCell(build, tierIndex, src.from);
      onChange();
    },
  });
  wire(left);
  wire(right);
  return [left, right];
}
