// 흡수 화면 [내 상태] 창 (GDD 128장 7, C.202): 지금 장착 블록 + 가방 블록(158장 7)·속성 강화 단계·이번 원정에서 흡수한 것·진화 쏠림(어느 속성으로 가는지).
// 블록 표기는 흡수 화면과 같다 (GDD 158장 4): "1번 물 권 · n/100", 가방 블록은 번호 대신 '가방'.
// 진화 쏠림은 막대·순위만 보인다(숨겨진 판정 기준 수치는 내보이지 않는다). 창은 확인창(confirmDialog) 한 장: ✓(확인)·뒤로로 닫힌다.
import { findEnemyDef } from '../data/bosses';
import { NORMAL_ELEMENT, elementName } from '../data/elements';
import { pickFaction } from '../data/schema';
import { getTrait, traitName } from '../data/traits';
import { enhanceLevel } from '../engine/absorb';
import { absorbBlockName, enhanceFraction } from './absorbView';
import { dominantElement, judgeElementCounts } from '../engine/evolution';
import type { ExpeditionState } from '../engine/expedition';
import type { FactionConfig } from '../engine/faction';
import { confirmDialog } from './confirmDialog';
import { el } from './bha/dom';
import { elementDot, paintElement } from './bha/element';
import { shownName } from './displayName';

/** 진화 쏠림 한 줄 (순수): 속성 · 막대 비율(가장 많은 속성 = 1) · 순위. 수치는 내보내지 않는다 */
export interface LeanRow {
  element: string;
  ratio: number;
  rank: number;
  top: boolean;
}

/** 장착 속성 개수(진화 판정과 같은 셈) → 막대 줄 (순수). 가장 쏠린 속성이 맨 위, 같은 개수는 같은 순위 */
export function leanRows(counts: Readonly<Record<string, number>>, dominant: string): LeanRow[] {
  const ents = Object.entries(counts).filter(([, n]) => n > 0);
  const max = Math.max(0, ...ents.map(([, n]) => n));
  if (max <= 0) return [];
  ents.sort((a, b) => b[1] - a[1] || (a[0] === dominant ? -1 : b[0] === dominant ? 1 : 0));
  return ents.map(([element, n]) => ({ element, ratio: n / max, rank: 1 + ents.filter(([, m]) => m > n).length, top: element === dominant }));
}

/** 창 안 내용 (테스트가 따로 본다) */
export function absorbStatusContent(faction: FactionConfig, exp: ExpeditionState): HTMLElement {
  const b = exp.build;
  const box = el('div', 'bha-absorbstat');
  box.dataset.absorbStatus = '';
  const sec = (title: string, ...kids: HTMLElement[]) => {
    const s = el('section', 'bha-absorbstat__sec');
    s.append(el('b', 'bha-absorbstat__title', title), ...kids);
    return s;
  };

  // 장착 블록 → 가방 블록 (GDD 158장 7) + 강화 수치 n/100 (강화는 속성 단위, GDD 84장 8)
  const blockRow = (where: string, id: string): HTMLElement => {
    const t = getTrait(id);
    const li = paintElement(el('li'), t.element);
    li.append(elementDot(t.element, faction.id), el('span', '', `${where} ${absorbBlockName(faction, id)}`), el('small', 'bha-faint bha-num', enhanceFraction(b, t.element)));
    return li;
  };
  const slots = el('ul', 'bha-absorbstat__list');
  b.slots.forEach((id, i) => {
    if (id) return slots.append(blockRow(`${i + 1}번`, id));
    slots.append(el('li', 'bha-faint', `${i + 1}번 · 비어 있음`));
  });
  const spare = b.owned.filter((id) => !b.slots.includes(id));
  const bag = el('ul', 'bha-absorbstat__list');
  bag.dataset.absorbBag = '';
  for (const id of spare) bag.append(blockRow('가방', id));
  const enh = Object.keys(b.enhance ?? {}).filter((l) => enhanceLevel(b, l) > 0);
  const enhLine = el('p', 'bha-faint', enh.length ? `속성 강화: ${enh.map((l) => `${elementName(l, faction.id)} ${enhanceFraction(b, l)}`).join(' · ')}` : '속성 강화: 아직 없다');
  const left = el('div', 'bha-absorbstat__col');
  left.append(
    sec(`${faction.slotName} ${b.slots.filter(Boolean).length} / ${b.slots.length}`, slots),
    sec(`가방 블록 ${spare.length}개`, spare.length ? bag : el('p', 'bha-faint', '없다')),
    enhLine,
  );

  // 이번 원정에서 흡수한 것 (놓아준 것은 빼고, 최근 것이 위)
  const got = exp.absorbRecords.filter((r) => r.absorbed).slice().reverse();
  const gotList = el('ul', 'bha-absorbstat__list');
  for (const r of got.slice(0, 6)) {
    const li = el('li');
    if (r.element) paintElement(li, r.element);
    const foe = shownName(pickFaction(findEnemyDef(r.enemyId).name, faction.id));
    const what = r.traitId ? traitName(r.traitId, faction.id) : r.mode === 'stat' ? '노력치만' : r.element ? `${elementName(r.element, faction.id)} 강화` : '효과만';
    li.append(r.element ? elementDot(r.element, faction.id) : el('span'), el('span', '', foe), el('small', 'bha-faint', what));
    gotList.append(li);
  }
  if (got.length > 6) gotList.append(el('li', 'bha-faint', `그 밖 ${got.length - 6}번`));
  const right = el('div', 'bha-absorbstat__col');
  right.append(sec(`이번 원정 ${faction.absorbActionName} ${got.length}번`, got.length ? gotList : el('p', 'bha-faint', '아직 없다')));

  // 진화 쏠림: 장착 속성 개수 기준(진화 판정과 같은 셈)의 막대·순위만
  const rows = leanRows(judgeElementCounts(b), dominantElement(b));
  const lean = el('ul', 'bha-absorbstat__lean');
  for (const r of rows.slice(0, 4)) {
    const li = paintElement(el('li', r.top ? 'is-top' : ''), r.element);
    li.dataset.lean = r.element;
    const bar = el('span', 'bha-absorbstat__bar');
    const fill = el('i');
    fill.style.width = `${Math.round(r.ratio * 100)}%`;
    bar.append(fill);
    li.append(el('span', 'bha-absorbstat__rank', `${r.rank}위`), elementDot(r.element, faction.id), el('span', '', elementName(r.element, faction.id)), bar);
    lean.append(li);
  }
  right.append(sec('진화 쏠림', rows.length ? lean : el('p', 'bha-faint', `아직 쏠린 속성이 없다 — ${elementName(NORMAL_ELEMENT, faction.id)} 쪽`), el('p', 'bha-faint', '장착한 블록 속성이 많은 쪽으로 진화한다')));

  box.append(left, right);
  return box;
}

/** [내 상태] 창을 연다 (✓ 확인·뒤로로 닫힘) */
export function openAbsorbStatus(faction: FactionConfig, exp: ExpeditionState): () => void {
  return confirmDialog({ title: '내 상태', content: absorbStatusContent(faction, exp), yes: '확인', single: true, onYes: () => {} });
}
