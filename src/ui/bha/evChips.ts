// 결과 화면 노력치 칩 (GDD 217장 3): 이번에 오른 노력치를 '힘 +3'·'지능 +2' 칩으로 (209장 바뀐 값 칩과 같은 모양 · 216장 4 숫자 규칙 = 반올림 정수).
// 오른 것 없으면 칩 없음. 상한에 막혀 덜 오른 몫이 있으면 칩 옆 '가득' 작은 표시. 능력치 이름은 종족 설정(statName)에서.
import { STAT_IDS, type StatId } from '../../data/schema';
import { statName } from '../../data/elements';
import { el } from './dom';

export interface EvGain {
  stat: StatId;
  /** 오른 양 (반올림 정수, 0 이면 칩 없음) */
  amount: number;
  /** 상한에 막혀 덜 올랐다 */
  full: boolean;
}

/** 시작·끝 노력치와 막힌 몫에서 칩 목록 (능력치 순서). 오른 양이 반올림해 0 인 능력치는 칩 없음 — 막혔으면 fullOnly 에 */
export function evGains(start: Partial<Record<StatId, number>> | null | undefined, end: Record<StatId, number>, blocked?: Partial<Record<StatId, number>> | null): { gains: EvGain[]; fullOnly: StatId[] } {
  const gains: EvGain[] = [];
  const fullOnly: StatId[] = [];
  if (!start) return { gains, fullOnly };
  for (const s of STAT_IDS) {
    const amount = Math.round(end[s] - (start[s] ?? 0));
    const full = (blocked?.[s] ?? 0) > 0.005;
    if (amount > 0) gains.push({ stat: s, amount, full });
    else if (full) fullOnly.push(s);
  }
  return { gains, fullOnly };
}

/** 칩 묶음 (없으면 null). 칩 = bha-chip--guard + 이름 + 숫자, '가득' = 칩 옆 작은 글 */
export function evChipRow(factionId: string, r: { gains: EvGain[]; fullOnly: StatId[] }): HTMLElement | null {
  if (r.gains.length === 0 && r.fullOnly.length === 0) return null;
  const row = el('div', 'bha-evchips');
  row.setAttribute('aria-label', '오른 노력치');
  for (const g of r.gains) {
    const name = statName(g.stat, factionId);
    const item = el('span', 'bha-evchips__item');
    const chip = el('span', 'bha-chip bha-chip--guard bha-evchip');
    chip.dataset.stat = g.stat;
    chip.append(el('span', 'bha-evchip__name', name), el('b', 'bha-num', `+${g.amount}`));
    chip.title = `${name} 노력치 +${g.amount}${g.full ? ' (상한에 막혀 덜 올랐다)' : ''}`;
    item.append(chip);
    if (g.full) item.append(el('small', 'bha-evchips__full', '가득'));
    row.append(item);
  }
  // 하나도 못 오르고 막힌 능력치: 칩 없이 '힘·민첩 가득' 작은 글 한 개
  if (r.fullOnly.length > 0) {
    const names = r.fullOnly.map((s) => statName(s, factionId)).join('·');
    const full = el('small', 'bha-evchips__full', `${names} 가득`);
    full.title = `${names} 노력치가 상한이라 오르지 않았다`;
    row.append(full);
  }
  return row;
}
