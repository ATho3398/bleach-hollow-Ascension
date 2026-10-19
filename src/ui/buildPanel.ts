// 흡수 빌드 표시: 슬롯 현황, 속성 보너스, 장착 속성·분류 개수(진화 추리용, GDD 20-5), 외형 파츠 문구. 문구는 종족 설정(slotName 등)에서 읽는다.
import { BALANCE } from '../config/balance';
import { categoryName, elementName } from '../data/elements';
import { ATTACK_CATEGORIES } from '../data/schema';
import { getTrait, traitDescription, traitName } from '../data/traits';
import { categoryCounts, completedElements, elementCounts, emptySlot, setSlot, type BuildState } from '../engine/absorb';
import type { FactionConfig } from '../engine/faction';
import { button, chip, h, icon, notice, panel, provisionalTag, tag } from './bha/dom';
import { elementDot, elementMark, paintElement } from './bha/element';
import { unequippedOwned } from './bha/nestLogic';

export const PROVISIONAL_NOTE = '속성·특성 풀과 리스크 수치는 임시 데이터입니다 (기획 11-3, 11-4 미정)';

/** 둥지 특성 탭의 상태: 교체 중인 보유 특성 (슬롯이 가득 찼을 때 [교체]를 누르면 정해진다) */
export interface TraitsTabState {
  swapTrait: string | null;
}

/** 슬롯 칸 그리드 (3~8칸): 채움/빈칸/교체 대상. 교체 중이면 채워진 칸이 모두 대상이 된다 */
function slotGrid(faction: FactionConfig, build: BuildState, state: TraitsTabState, onChange: () => void): HTMLElement {
  const grid = h('div', 'bha-slots');
  build.slots.forEach((id, i) => {
    if (!id) {
      const e = h('div', 'bha-slot bha-slot--empty');
      e.append(h('span', 'bha-slot__num', `${i + 1}번`), icon('i-plus'), '비어 있음');
      grid.append(e);
      return;
    }
    const t = getTrait(id);
    const swapping = state.swapTrait !== null;
    const b = paintElement(h('button', `bha-slot bha-slot--filled${swapping ? ' is-target' : ''}`), t.element);
    b.type = 'button';
    b.setAttribute('aria-label', swapping ? `${i + 1}번 슬롯 ${traitName(id, faction.id)}과 교체` : `${i + 1}번 슬롯 ${traitName(id, faction.id)} 비우기`);
    const meta = h('span', 'bha-slot__meta');
    meta.append(tag(faction.traitKindNames[t.kind], 'kind'), elementMark(t.element, faction.id));
    b.append(h('span', 'bha-slot__num', `${i + 1}번`), h('span', 'bha-slot__name', traitName(id, faction.id)), meta);
    b.onclick = () => {
      if (state.swapTrait !== null) {
        setSlot(build, i, state.swapTrait);
        state.swapTrait = null;
      } else setSlot(build, i, null);
      onChange();
    };
    grid.append(b);
  });
  return grid;
}

/** 같은 속성 개수 칩(.bha-setbonus): 장착한 속성만. 보너스가 켜진 속성은 is-active. 진화(바스트로데 속성)는 이 개수가 가장 많은 속성을 따른다 */
function setBonusRow(faction: FactionConfig, build: BuildState): HTMLElement {
  const need = BALANCE.provisional.absorb.elementBonusCount;
  const row = h('div', 'bha-row bha-row--start bha-row--wrap');
  const counts = elementCounts(build);
  for (const [id, n] of Object.entries(counts)) {
    const c = paintElement(h('span', `bha-setbonus${n >= need ? ' is-active' : ''}`), id);
    c.append(elementDot(id, faction.id), `${elementName(id, faction.id)} ${n}/${need}${n >= need ? ' — 보너스 켜짐' : n === need - 1 ? ' — 하나 더 장착하면 보너스' : ''}`);
    row.append(c);
  }
  return row;
}

/** 장착한 공격 특성의 분류 개수 한 줄 (GDD 20-5: 아란칼은 가장 많은 분류를 따른다). 공격 특성이 없으면 null */
function categoryRow(faction: FactionConfig, build: BuildState): HTMLElement | null {
  const counts = categoryCounts(build, faction.id);
  if (ATTACK_CATEGORIES.every((c) => counts[c] === 0)) return null;
  return h('p', 'bha-faint', `공격 분류: ${ATTACK_CATEGORIES.map((c) => `${categoryName(c, faction.id)} ${counts[c]}`).join(' · ')}`);
}

/** 특성 탭: ① 슬롯 현황 + 계통 보너스 + 교체 안내 ② 보유 특성(슬롯에 없는 것) 장착·교체 */
export function traitsTab(faction: FactionConfig, build: BuildState, state: TraitsTabState, onChange: () => void): HTMLElement[] {
  if (state.swapTrait !== null && (!build.owned.includes(state.swapTrait) || emptySlot(build) >= 0)) state.swapTrait = null;
  const filled = build.slots.filter(Boolean).length;
  const head = panel({ title: '흡수 특성', aside: h('span', '', `${faction.slotName} ${filled} / ${build.slots.length}`) });
  head.querySelector('.bha-panel__title')?.prepend(icon('i-slot'));
  head.querySelector('.bha-panel__title')?.append(' ', provisionalTag()); // 임시 데이터 표시는 제목에, 긴 안내 문구는 오른쪽 열 맨 아래에 (왼쪽 열이 낮은 LCD 에서 안 넘치게, T-4)
  if (state.swapTrait !== null) {
    head.append(notice('warn', `‘${traitName(state.swapTrait, faction.id)}’을(를) 넣을 슬롯을 누른다. 빠진 특성은 보유 목록으로 돌아간다.`, { title: '어느 슬롯과 바꿀까?', icon: 'i-swap' }));
  }
  head.append(slotGrid(faction, build, state, onChange));
  const bonus = setBonusRow(faction, build);
  if (bonus.childElementCount > 0) head.append(bonus);
  const cats = categoryRow(faction, build);
  if (cats) head.append(cats);
  const done = completedElements(build);
  if (done.length > 0) {
    head.append(notice('good', `${faction.lineageBonusName}: ${done.map((l) => elementName(l, faction.id)).join(', ')} 블록 위력(피해·막기·회복) +${Math.round(BALANCE.provisional.absorb.elementSkillBonus * 100)}% (임시)`));
  }
  const parts = build.slots.filter((id): id is string => id !== null && getTrait(id).kind === 'part');
  if (parts.length > 0) {
    const how = faction.appearanceChange ? '본체 외형이 변한다' : `본체는 그대로, ${faction.slotName} 외형이 변한다`;
    head.append(h('p', 'bha-faint', `${faction.traitKindNames.part}: ${parts.map((id) => traitName(id, faction.id)).join(', ')} — ${how} (표시만)`));
  }
  const foot = h('p', 'bha-faint', `${filled > 0 && state.swapTrait === null ? '채워진 칸을 누르면 비운다. ' : ''}${PROVISIONAL_NOTE}`);
  foot.append(' ', provisionalTag());

  const spare = unequippedOwned(build);
  const owned = panel({ title: '보유 특성', aside: `${spare.length}개` });
  if (build.owned.length === 0) {
    owned.append(h('p', 'bha-dim', '아직 얻은 특성이 없다. 원정에서 전투 후 흡수하면 얻는다.'), foot);
    return [head, owned];
  }
  if (spare.length === 0) owned.append(h('p', 'bha-dim', '슬롯에 없는 보유 특성이 없다. 모두 장착 중이다.'));
  const list = h('div', 'bha-owned');
  const hasFree = emptySlot(build) >= 0;
  for (const id of spare) {
    const t = getTrait(id);
    const selected = state.swapTrait === id;
    const row = paintElement(h('div', `bha-owned__row${selected ? ' is-selected' : ''}`), t.element);
    const mark = h('span', 'bha-owned__mark');
    mark.append(elementDot(t.element, faction.id));
    const name = h('span', 'bha-owned__name', traitName(id, faction.id));
    name.append(tag(faction.traitKindNames[t.kind], 'kind'));
    if (t.rare) name.append(chip('희귀', 'rare'));
    if (t.provisional) name.append(provisionalTag());
    const body = h('span');
    body.append(name, h('span', 'bha-owned__desc', traitDescription(id, faction.id)));
    row.append(mark, body);
    if (selected) row.append(chip('선택됨', 'rare'));
    else if (state.swapTrait === null) {
      row.append(button({
        label: hasFree ? '장착' : '교체', size: 'small',
        onClick: () => {
          if (hasFree) setSlot(build, emptySlot(build), id);
          else state.swapTrait = id;
          onChange();
        },
      }));
    } else row.append(h('span'));
    list.append(row);
  }
  owned.append(list);
  if (state.swapTrait !== null) {
    owned.append(button({ label: '취소', block: true, onClick: () => { state.swapTrait = null; onChange(); } }));
  }
  owned.append(foot);
  return [head, owned];
}
