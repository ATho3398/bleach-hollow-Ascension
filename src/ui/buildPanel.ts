// 흡수 빌드 표시: 슬롯 현황, 계통 보너스, 외형 파츠 문구. 문구는 종족 설정(slotName 등)에서 읽는다.
import { BALANCE } from '../config/balance';
import { lineageName } from '../data/lineages';
import { getTrait, traitDescription, traitName } from '../data/traits';
import { completedLineages, lineageCounts, setSlot, type BuildState } from '../engine/absorb';
import type { FactionConfig } from '../engine/faction';
import { el } from './dom';

export const PROVISIONAL_NOTE = '계통·특성 풀과 리스크 수치는 임시 데이터입니다 (기획 11-3, 11-4 미정)';

/** 특성 한 줄: 이름 [종류 · 계통] */
export function traitLabel(faction: FactionConfig, id: string): string {
  const t = getTrait(id);
  return `${traitName(id, faction.id)} [${faction.traitKindNames[t.kind]} · ${lineageName(t.lineageId, faction.id)}${t.rare ? ' · 희귀' : ''}]`;
}

/** 슬롯 현황 + 계통 보너스 + 외형 파츠 */
export function slotPanel(faction: FactionConfig, build: BuildState): HTMLElement {
  const box = el('div', 'stack');
  box.append(el('b', '', `${faction.slotName} (${build.slots.filter(Boolean).length} / ${build.slots.length})`));
  const row = el('div', 'slots');
  build.slots.forEach((id, i) => {
    const s = el('div', `slotbox${id ? '' : ' empty'}`);
    s.append(el('small', 'dim', `${i + 1}번`));
    s.append(el('div', '', id ? traitName(id, faction.id) : '비어 있음'));
    if (id) s.append(el('small', 'dim', `${faction.traitKindNames[getTrait(id).kind]} · ${lineageName(getTrait(id).lineageId, faction.id)}`));
    row.append(s);
  });
  box.append(row);
  const counts = lineageCounts(build);
  const done = completedLineages(build);
  const progress = Object.entries(counts).map(([l, n]) => `${lineageName(l, faction.id)} ${n}/${BALANCE.provisional.absorb.lineageBonusCount}`);
  if (done.length > 0) {
    box.append(el('div', 'notice good', `${faction.lineageBonusName}: ${done.map((l) => lineageName(l, faction.id)).join(', ')} 블록 위력(피해·막기·회복) +${Math.round(BALANCE.provisional.absorb.lineageSkillBonus * 100)}% (임시)`));
  } else if (progress.length > 0) {
    box.append(el('small', 'dim', `${faction.lineageBonusName} 진행: ${progress.join(' · ')} (같은 계통 ${BALANCE.provisional.absorb.lineageBonusCount}개)`));
  }
  const parts = build.slots.filter((id): id is string => id !== null && getTrait(id).kind === 'part');
  if (parts.length > 0) {
    const how = faction.appearanceChange ? '본체 외형이 변한다' : `본체는 그대로, ${faction.slotName} 외형이 변한다`;
    box.append(el('small', 'dim', `${faction.traitKindNames.part}: ${parts.map((id) => traitName(id, faction.id)).join(', ')} — ${how} (표시만)`));
  }
  return box;
}

/** 둥지용 슬롯 정리: 보유 특성 목록과 슬롯 교체 */
export function organizer(faction: FactionConfig, build: BuildState, onChange: () => void): HTMLElement {
  const box = el('div', 'stack');
  box.append(slotPanel(faction, build));
  if (build.owned.length === 0) {
    box.append(el('p', 'dim', '아직 얻은 특성이 없다. 원정에서 전투 후 흡수하면 얻는다.'));
    return box;
  }
  box.append(el('b', '', `획득 특성 (${build.owned.length})`));
  for (const id of build.owned) {
    const item = el('div', 'deckrow');
    const label = el('div', 'grow');
    label.append(el('b', '', traitLabel(faction, id)), el('div', 'dim', traitDescription(id, faction.id)));
    item.append(label);
    const btns = el('div', 'slotbtns');
    build.slots.forEach((cur, i) => {
      const b = el('button', `small${cur === id ? ' on' : ''}`, `${i + 1}`);
      b.title = cur === id ? `${i + 1}번 슬롯에 장착 중 (눌러 비우기)` : `${i + 1}번 슬롯에 장착`;
      b.onclick = () => {
        setSlot(build, i, cur === id ? null : id);
        onChange();
      };
      btns.append(b);
    });
    item.append(btns);
    box.append(item);
  }
  box.append(el('small', 'dim', '숫자를 눌러 그 슬롯에 장착한다 (장착 중이면 비운다)'));
  return box;
}
