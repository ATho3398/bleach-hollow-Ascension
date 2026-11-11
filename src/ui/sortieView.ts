// 가방 소모품 탭 '출정품' 칸 (GDD 241-D 5, C.400): 위 = 출정품 칸 2개(누르면 고르기·빼기), 아래 = 가진 출정품 카드(누르면 상세 창 [칸에 넣기]).
// 칸에 끼운 것은 모험 출발 때 칸마다 1개씩 쓰고 그 원정 동안 효과. 3단계 전에는 잠김 (241-0). 종족 무관 — 이름은 상점 데이터, 수치는 balance.ts.
import { SORTIE_IDS, sortieBrief, sortieEffectText } from '../engine/sortie';
import type { FactionConfig } from '../engine/faction';
import type { SaveData } from '../game';
import { consumableName } from '../inventory';
import { setSortieSlot, sortieSlotsOf, sortieTargetSlot } from '../sortie';
import { h, icon } from './bha/dom';
import { iconArt, itemDialog } from './bha/itemUi';
import { showToast } from './bha/nest';
import { pickDialog } from './pickDialog';
import { shownName } from './displayName';
import { gateHint, gateOpen } from '../unlockGate';

export const SORTIE_NAME = '출정품';
const LOCKED = '모험 중에는 바꿀 수 없다';
/** 출정품 아이콘 (효과별) */
export function sortieIcon(id: string): string {
  const b = sortieBrief(id);
  return b.startsWith('공격') ? 'i-attack' : b.startsWith('받는') ? 'i-guard' : 'i-rare';
}
export const sortieArt = (id: string): HTMLElement => iconArt(sortieIcon(id));

/** 칸 2개 줄. 잠겼으면 잠김 안내 한 줄 */
export function sortieSlotsRow(faction: Pick<FactionConfig, 'tierNames' | 'ascension'>, save: SaveData, changed: () => void): HTMLElement {
  const row = h('div', 'bha-sortie');
  row.dataset.sortie = '';
  if (!gateOpen(save, 'sortie')) {
    row.classList.add('is-locked');
    row.append(icon('i-lock'), h('span', 'bha-small', gateHint(faction, 'sortie')));
    return row;
  }
  save.shared.sortie.forEach((id, i) => {
    const n = id ? save.shared.items[id] ?? 0 : 0;
    const b = h('button', `bha-eqslot bha-eqslot--sortie${id ? '' : ' is-empty'}${id && n === 0 ? ' is-dim' : ''}`);
    b.type = 'button';
    b.dataset.slot = `sortie-${i}`;
    b.append(icon(id ? sortieIcon(id) : 'i-plus'), h('span', 'bha-eqslot__name', id ? shownName(consumableName(id)) : `${SORTIE_NAME} ${i + 1}`));
    if (id) b.append(h('b', 'bha-eqslot__plus', `×${n}`));
    b.setAttribute('aria-label', `${SORTIE_NAME} 칸 ${i + 1}: ${id ? `${consumableName(id)} ${n}개` : '비어 있음'}`);
    b.onclick = () => pickSortie(save, i, changed);
    row.append(b);
  });
  row.append(h('p', 'bha-small bha-sortie__note', '칸에 끼운 것은 모험 출발 때 1개씩 쓰고, 그 모험 동안 효과가 있다.'));
  return row;
}

/** 칸 고르기 창: 가진 출정품 + [빼기] */
function pickSortie(save: SaveData, index: number, changed: () => void): void {
  if (save.activeExpedition != null) {
    showToast({ eyebrow: SORTIE_NAME, title: LOCKED }, 0, 2000);
    return;
  }
  const owned = SORTIE_IDS.filter((id) => (save.shared.items[id] ?? 0) > 0);
  const cur = save.shared.sortie[index];
  if (owned.length === 0 && !cur) {
    showToast({ eyebrow: SORTIE_NAME, title: '끼울 출정품이 없다', meta: '소모품 상점 전투 소모품 탭·모험 드롭에서 얻는다' }, 0, 2400);
    return;
  }
  pickDialog({
    title: `${SORTIE_NAME} 칸 ${index + 1}`,
    body: '모험 출발 때 1개씩 쓴다.',
    options: [
      ...owned.map((id) => ({ key: id, label: `${consumableName(id)} ×${save.shared.items[id] ?? 0} · ${sortieBrief(id)}`, onPick: () => { if (setSortieSlot(save, index, id)) changed(); } })),
      ...(cur ? [{ key: 'none', label: '빼기', onPick: () => { if (setSortieSlot(save, index, null)) changed(); } }] : []),
    ],
  });
}

/** 출정품 상세 창: 효과·남은 개수 + [칸 n에 넣기]/[칸 n에서 빼기] */
export function openSortie(save: SaveData, id: string, changed: () => void): void {
  const n = save.shared.items[id] ?? 0;
  const slots = sortieSlotsOf(save, id);
  const open = gateOpen(save, 'sortie');
  const locked = save.activeExpedition != null ? LOCKED : null;
  let close: () => void = () => {};
  const actions: Parameters<typeof itemDialog>[0]['actions'] = [];
  if (open) {
    for (const i of slots) actions.push({ key: `out-${i}`, label: () => `칸 ${i + 1}에서 빼기`, variant: 'ghost', disabled: locked !== null, onClick: () => { close(); if (setSortieSlot(save, i, null)) changed(); } });
    if (n > 0 && slots.length < save.shared.sortie.length) {
      const t = sortieTargetSlot(save);
      actions.push({ key: 'in', label: () => `칸 ${t + 1}에 넣기${save.shared.sortie[t] ? ' (교체)' : ''}`, variant: 'primary', disabled: locked !== null, onClick: () => { close(); if (setSortieSlot(save, t, id)) changed(); } });
    }
  }
  close = itemDialog({
    heading: SORTIE_NAME, name: consumableName(id), art: sortieArt(id), lock: locked,
    desc: [`남은 개수 ${n}${slots.length ? ` · 칸 ${slots.map((i) => i + 1).join('·')}에 넣음` : ''}`, sortieEffectText(id), '칸에 넣으면 모험 출발 때 1개씩 쓴다.'].join('\n'),
    actions,
  });
}
