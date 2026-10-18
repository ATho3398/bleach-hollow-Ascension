// 흡수 빌드 표시: 슬롯 현황, 계통 보너스, 외형 파츠 문구. 문구는 종족 설정(slotName 등)에서 읽는다.
import { BALANCE } from '../config/balance';
import { lineageName } from '../data/lineages';
import { getTrait, traitDescription, traitName } from '../data/traits';
import { completedLineages, emptySlot, lineageCounts, setSlot, type BuildState } from '../engine/absorb';
import type { FactionConfig } from '../engine/faction';
import { button, chip, h, icon, notice, panel, provisionalTag, tag } from './bha/dom';
import { lineageKey, linMarkShort } from './bha/lineage';
import { unequippedOwned } from './bha/nestLogic';

export const PROVISIONAL_NOTE = '계통·특성 풀과 리스크 수치는 임시 데이터입니다 (기획 11-3, 11-4 미정)';

/** 둥지 특성 탭의 상태: 교체 중인 보유 특성 (슬롯이 가득 찼을 때 [교체]를 누르면 정해진다) */
export interface TraitsTabState {
  swapTrait: string | null;
}

const markCls = (lineageId: string) => {
  const k = lineageKey(lineageId);
  return k ? ` bha-lin--${k}` : '';
};

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
    const b = h('button', `bha-slot bha-slot--filled${markCls(t.lineageId)}${swapping ? ' is-target' : ''}`);
    b.type = 'button';
    b.setAttribute('aria-label', swapping ? `${i + 1}번 슬롯 ${traitName(id, faction.id)}과 교체` : `${i + 1}번 슬롯 ${traitName(id, faction.id)} 비우기`);
    const meta = h('span', 'bha-slot__meta');
    meta.append(tag(faction.traitKindNames[t.kind], 'kind'), linMarkShort(t.lineageId, faction.id));
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

/** 같은 계통 개수 칩(.bha-setbonus): 진행 중인 계통만. 보너스가 켜진 계통은 is-active */
function setBonusRow(faction: FactionConfig, build: BuildState): HTMLElement {
  const need = BALANCE.provisional.absorb.lineageBonusCount;
  const row = h('div', 'bha-row bha-row--start bha-row--wrap');
  const counts = lineageCounts(build);
  for (const [lineageId, n] of Object.entries(counts)) {
    const k = lineageKey(lineageId);
    const c = h('span', `bha-setbonus${k ? ` bha-lin--${k}` : ''}${n >= need ? ' is-active' : ''}`);
    if (k) c.append(icon(`i-lin-${k}`, 'sm'));
    c.append(`${lineageName(lineageId, faction.id)} ${n}/${need}${n >= need ? ' — 보너스 켜짐' : n === need - 1 ? ' — 하나 더 장착하면 보너스' : ''}`);
    row.append(c);
  }
  return row;
}

/** 특성 탭: ① 슬롯 현황 + 계통 보너스 + 교체 안내 ② 보유 특성(슬롯에 없는 것) 장착·교체 */
export function traitsTab(faction: FactionConfig, build: BuildState, state: TraitsTabState, onChange: () => void): HTMLElement[] {
  if (state.swapTrait !== null && (!build.owned.includes(state.swapTrait) || emptySlot(build) >= 0)) state.swapTrait = null;
  const filled = build.slots.filter(Boolean).length;
  const head = panel({ title: '흡수 특성', aside: h('span', '', `${faction.slotName} ${filled} / ${build.slots.length}`) });
  head.querySelector('.bha-panel__title')?.prepend(icon('i-slot'));
  if (state.swapTrait !== null) {
    head.append(notice('warn', `‘${traitName(state.swapTrait, faction.id)}’을(를) 넣을 슬롯을 누른다. 빠진 특성은 보유 목록으로 돌아간다.`, { title: '어느 슬롯과 바꿀까?', icon: 'i-swap' }));
  }
  head.append(slotGrid(faction, build, state, onChange));
  const bonus = setBonusRow(faction, build);
  if (bonus.childElementCount > 0) head.append(bonus);
  const done = completedLineages(build);
  if (done.length > 0) {
    head.append(notice('good', `${faction.lineageBonusName}: ${done.map((l) => lineageName(l, faction.id)).join(', ')} 블록 위력(피해·막기·회복) +${Math.round(BALANCE.provisional.absorb.lineageSkillBonus * 100)}% (임시)`));
  }
  const parts = build.slots.filter((id): id is string => id !== null && getTrait(id).kind === 'part');
  if (parts.length > 0) {
    const how = faction.appearanceChange ? '본체 외형이 변한다' : `본체는 그대로, ${faction.slotName} 외형이 변한다`;
    head.append(h('p', 'bha-faint', `${faction.traitKindNames.part}: ${parts.map((id) => traitName(id, faction.id)).join(', ')} — ${how} (표시만)`));
  }
  const foot = h('p', 'bha-faint', `${filled > 0 && state.swapTrait === null ? '채워진 칸을 누르면 비운다. ' : ''}${PROVISIONAL_NOTE}`);
  foot.append(' ', provisionalTag());
  head.append(foot);

  const spare = unequippedOwned(build);
  const owned = panel({ title: '보유 특성', aside: `${spare.length}개` });
  if (build.owned.length === 0) {
    owned.append(h('p', 'bha-dim', '아직 얻은 특성이 없다. 원정에서 전투 후 흡수하면 얻는다.'));
    return [head, owned];
  }
  if (spare.length === 0) owned.append(h('p', 'bha-dim', '슬롯에 없는 보유 특성이 없다. 모두 장착 중이다.'));
  const list = h('div', 'bha-owned');
  const hasFree = emptySlot(build) >= 0;
  for (const id of spare) {
    const t = getTrait(id);
    const selected = state.swapTrait === id;
    const row = h('div', `bha-owned__row${markCls(t.lineageId)}${selected ? ' is-selected' : ''}`);
    const mark = h('span', 'bha-owned__mark');
    const k = lineageKey(t.lineageId);
    if (k) mark.append(icon(`i-lin-${k}`));
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
  return [head, owned];
}
