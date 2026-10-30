// 흡수 빌드 표시 — 보관함 '슬롯' 화면 (GDD 94장 A, C.149): 왼쪽 = 장착 칸(본체 슬롯 — 해방 칸은 C.167 에 폐지, 98장 B) 큰 아이콘 바둑판, 오른쪽 = 내가 가진 특성 카드 바둑판.
// 배치 = ① 카드·칸을 끌어다 놓기 ② 카드(✓)를 열어 [칸 고르기] → 칸을 눌러(✓) 놓기. 칸·카드를 누르면 상세 창. 문구는 종족 설정(slotName 등)에서 읽는다.
import { BALANCE } from '../config/balance';
import { elementName } from '../data/elements';
import { getTrait, traitDescription, traitName } from '../data/traits';
import { basicAttackMultiplier, emptySlot, enhanceAttackBonus, enhanceLevel, isBasicBlockTrait, setSlot, type BuildResult, type BuildState } from '../engine/absorb';
import { NORMAL_ELEMENT } from '../data/elements';
import { numLine } from '../data/help/textFormat';
import type { FactionConfig } from '../engine/faction';
import { button, h, icon, panel, provisionalTag } from './bha/dom';
import { enableDrag } from './bha/dragdrop';
import { elementDot, paintElement } from './bha/element';
import { iconArt, itemCard, itemDialog } from './bha/itemUi';
import { battleLabels, skillBlockLabel } from './labels';
import { devText, plainText } from './displayName';

export const PROVISIONAL_NOTE = '속성·특성 풀과 리스크 수치는 임시 데이터다(기획 11-3, 11-4 미정)';

/** 장착 칸 하나: 본체 슬롯 (해방 블록 칸 'lib' 은 C.167 에 폐지 — GDD 98장 B: 해방 중에는 장착 블록이 나온다) */
export interface SlotCell {
  area: 'body';
  index: number;
}

/** 슬롯 화면 상태: 집어 든 특성(상세 창의 [칸 고르기]) — 다음에 누른 칸에 놓는다. from = 칸에서 집었으면 그 칸 */
export interface TraitsTabState {
  held?: { id: string; from: SlotCell | null } | null;
}

const idAt = (b: BuildState, c: SlotCell): string | null => b.slots[c.index] ?? null;

/** 특성을 칸에 놓는다 (끌어놓기·고르기 공용). from 이 있으면 그 칸에서 옮기는 것: 자리를 바꾼다 */
export function placeTrait(b: BuildState, to: SlotCell, id: string, from: SlotCell | null = null): BuildResult {
  const prev = idAt(b, to);
  const r = setSlot(b, to.index, id);
  if (!r.ok) return r;
  if (from && prev && prev !== id) setSlot(b, from.index, prev);
  return { ok: true };
}

/** 칸을 비운다 (빼기). 빠진 특성은 보유 목록에 그대로 남는다 */
export function clearCell(b: BuildState, c: SlotCell): BuildResult {
  return setSlot(b, c.index, null);
}

/** 이 칸에 놓을 수 있나 */
export function canPlace(b: BuildState, to: SlotCell): boolean {
  return to.index >= 0 && to.index < b.slots.length;
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
const plainDesc = plainText;

/** 카드의 짧은 효과 줄: 블록 = 계열·위력, 그 밖 = 설명 */
export function traitBrief(faction: FactionConfig, id: string): string {
  const t = getTrait(id);
  // C.185 (GDD 111장 후속): 노멀 skill 특성 = 기본 블록 — 위력 대신 '고르면 노멀 강화 +1'
  if (isBasicBlockTrait(id)) return `고르면 ${elementName(t.element, faction.id)} 강화 +1`;
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

/** 블록 상세 수치 줄 (GDD 158장 5): 흡수 화면에서 뺀 위력·강화 효과 수치를 가방 블록 상세에서 보인다. 문구 형식 = text-style 3장 수치 줄 */
export function traitNumberLines(faction: FactionConfig, build: Pick<BuildState, 'enhance' | 'slots'>, id: string): string[] {
  const t = getTrait(id);
  const lv = enhanceLevel(build, t.element);
  const max = BALANCE.provisional.absorb.enhance.max;
  const pct = (x: number) => `+${(x * 100).toFixed(1).replace(/\.0$/, '')}%`;
  const lines: string[] = [];
  if (t.kind === 'skill' && t.role === 'attack' && t.powerInAttacks !== undefined && !isBasicBlockTrait(id)) {
    lines.push(numLine('위력', `기본 공격 ${t.powerInAttacks}회분`));
    lines.push(numLine(faction.chainName, '같은 속성·같은 계열 블록이 붙으면 함께 발동'));
  }
  // 속성 강화: 노멀 = 기본 공격 블록 배율(빈 칸 몫 포함, C.184 GDD 111장 3), 그 밖 = 그 속성 공격 블록
  const bonus = t.element === NORMAL_ELEMENT ? basicAttackMultiplier(build) - 1 : enhanceAttackBonus(lv);
  lines.push(numLine('속성 강화', `${lv}/${max}`, `${t.element === NORMAL_ELEMENT ? '기본 공격 블록' : '공격 블록'} ${pct(bonus)}`));
  return lines;
}

/** 상세 창 (아이템 탭 상세 창과 같은 컴포넌트): 이름 · 계열 · 속성 · 효과 · 속성 강화 n강(/100 작게, C.176 GDD 106장 1) · [장착]/[칸 고르기]/[빼기] */
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
    actions.push({ key: 'remove', label: () => '빼기', variant: 'ghost', onClick: () => { close(); clearCell(build, from); onChange(); } });
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
  // 블록 상세 (GDD 158장 5): 설명 + 수치 줄(위력 기본 공격 n회분·체인·속성 강화). 데이터 설명의 위력 줄은 수치 줄과 겹쳐 뺀다
  const text = plainDesc(traitDescription(id, faction.id)).split('\n').filter((l) => !/회분/.test(l)).join('\n');
  close = itemDialog({
    heading: from ? `${faction.slotName} ${from.index + 1}번 칸` : t.kind === 'skill' ? '블록 상세' : '특성',
    name, desc: [`${kind} · ${elementName(t.element, faction.id)} 속성`, text, ...traitNumberLines(faction, build, id)].filter(Boolean).join('\n'),
    art: traitArt(faction, id), have: `속성 강화 ${lv}/${BALANCE.provisional.absorb.enhance.max}`, actions,
  });
}

/** 장착 칸 한 칸 */
function cellButton(faction: FactionConfig, build: BuildState, state: TraitsTabState, tierIndex: number, cell: SlotCell, onChange: () => void): HTMLElement {
  const id = idAt(build, cell);
  const num = h('span', 'bha-sgcell__num', `${cell.index + 1}`);
  const b = h('button', 'bha-sgcell');
  b.type = 'button';
  b.dataset.area = cell.area;
  b.dataset.index = String(cell.index);
  const areaName = faction.slotName;
  const held = state.held ?? null;
  if (held) {
    const ok = canPlace(build, cell);
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
    b.append(num, icon(traitIconId(faction, id)), h('span', 'bha-sgcell__name', traitBlockName(faction, id, tierIndex)), h('small', 'bha-sgcell__enh', `${enhanceLevel(build, getTrait(id).element)}강`), elementDot(getTrait(id).element, faction.id));
  }
  b.onclick = () => {
    if (held) {
      if (!canPlace(build, cell)) return;
      placeTrait(build, cell, held.id, held.from);
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
  if (devText()) left.querySelector('.bha-panel__title')?.append(' ', provisionalTag());
  if (state.held) {
    const bar = h('div', 'bha-sgbar');
    bar.append(h('span', '', `‘${traitBlockName(faction, state.held.id, tierIndex)}’을(를) 놓을 칸을 누른다`), button({ label: '취소', size: 'small', onClick: () => { state.held = null; onChange(); } }));
    left.append(bar);
  }
  const body = h('div', 'bha-sgrow');
  body.dataset.area = 'body';
  build.slots.forEach((_, i) => body.append(cellButton(faction, build, state, tierIndex, { area: 'body', index: i }, onChange)));
  left.append(h('h3', 'bha-sgrow__title', `${faction.slotName}`), body);
  if (!state.held) left.append(h('p', 'bha-faint', '카드를 ✓로 열어 칸에 넣고, 칸을 ✓로 열어 뺀다.')); // 버튼 조작 기준 (GDD 159장 26)

  const heldId = state.held?.id ?? null;
  const spare = build.owned.filter((id) => !build.slots.includes(id));
  // 머리 숫자 = 남는(장착 안 한) 특성 수 — 내용과 같은 기준 (GDD 100장 #55)
  const right = panel({ title: '가진 특성', aside: `남는 ${spare.length}개` });
  right.classList.add('bha-sgown');
  right.querySelector('.bha-panel__title')?.prepend(icon('i-absorb'));
  const grid = h('div', 'bha-itemgrid bha-sggrid');
  const emptyLine = spare.length === 0 ? h('p', 'bha-faint', build.owned.length === 0 ? `남는 특성이 없다. 모험에서 ${faction.absorbActionName}하면 얻는다.` : '남는 특성이 없다. 모두 장착 중이다.') : null;
  for (const id of spare) {
    const t = getTrait(id);
    const card = itemCard({
      id, name: traitBlockName(faction, id, tierIndex), detail: traitBrief(faction, id), art: traitArt(faction, id),
      foot: `${enhanceLevel(build, t.element)}강`, state: heldId === id ? 'worn' : undefined,
      onClick: () => openTraitDetail(faction, build, state, tierIndex, id, null, onChange),
    });
    paintElement(card, t.element);
    card.dataset.drag = 'card';
    card.dataset.trait = id;
    grid.append(card);
  }
  right.append(emptyLine ?? grid); // 비었으면 큰 빈 격자 대신 한 줄
  // 남는 특성이 없으면 빈 칸 대신 장착한 특성 설명 (GDD 100장 #55)
  if (spare.length === 0 && filled > 0) {
    const worn = h('div', 'bha-stack bha-stack--tight');
    for (const id of build.slots) if (id) worn.append(h('p', 'bha-small', `${traitBlockName(faction, id, tierIndex)} — ${traitBrief(faction, id)}`));
    right.append(worn);
  }
  if (devText()) right.append(h('p', 'bha-faint', PROVISIONAL_NOTE));

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
        if (canPlace(build, to)) placeTrait(build, to, src.id, src.from);
      } else if (src.from && target?.classList.contains('bha-sgown')) clearCell(build, src.from);
      onChange();
    },
  });
  wire(left);
  wire(right);
  return [left, right];
}
