// 상태 ⓘ 설명 문구 (C.176, GDD 104장 2): 방 상태 칩·상태 화면이 같이 읽는다. 이름은 종족 설정, 수치는 BALANCE(riskText 와 같은 규칙) — 숫자 하드코딩 없음.
import { BALANCE } from '../../config/balance';
import { riskText } from '../../data/help/riskText';
import type { FactionConfig } from '../../engine/faction';
import type { InfoBody } from './infoTip';
import { BOND_STAGE_NAMES, CARE_STATUS_HINTS, type StatusChip } from './roomLogic';

const CP = BALANCE.provisional.nest.care;
const BD = BALANCE.provisional.nest.bond;

type Names = Pick<FactionConfig, 'riskGaugeName' | 'stabilityName' | 'nestName' | 'absorbActionName' | 'fullnessName' | 'frenzyName' | 'nestActions'>;

export type StatusInfoKind = StatusChip['kind'] | 'stab';

/** 상태 하나의 설명 */
export function statusInfo(kind: StatusInfoKind, f: Names): InfoBody {
  const rt = riskText(f);
  switch (kind) {
    case 'hunger':
      return [`${f.nestActions.feed}로 채운다 · 시간이 흐르면 준다`, `${CP.weakFullness} 아래로 떨어지면 쇠약 · ${CP.conditionBelowFullness} 이하면 컨디션도 같이 준다`];
    case 'cond':
      return [`${f.nestActions.sleep}로 오른다`, '낮으면 전투에 공허 블록이 늘어난다', `${CP.tiredCondition} 아래로 떨어지면 피곤`];
    case 'bond':
      return [`${f.nestActions.pet}·돌봄 요청에 응하면 오른다 (하루 최대 +${BD.dailyMax})`, `단계: ${BOND_STAGE_NAMES.join(' → ')}`];
    case 'risk':
      return [{ title: '손해', lines: rt.riskLoss }, { title: '오르는 길', lines: rt.riskUp }, { title: '내리는 길', lines: rt.riskDown }];
    case 'stab':
      return [{ title: '손해', lines: rt.stabilityLoss }, { title: '오르내림', lines: rt.stabilityMove }];
    case 'weak':
      return `풀리는 법: ${CARE_STATUS_HINTS.weak}`;
    case 'tired':
      return `풀리는 법: ${CARE_STATUS_HINTS.tired}`;
    case 'collapsed':
      return CARE_STATUS_HINTS.collapsed;
  }
}

/** 방 상태 칩 ⓘ: 칩에 보이는 것 전부를 한 창에 (이름 + 한 줄) */
export function roomStatusInfo(chips: readonly StatusChip[], f: Names): InfoBody {
  return chips.map((c) => {
    const body = c.hint ? `풀리는 법: ${c.hint}` : statusInfo(c.kind, f);
    const lines = typeof body === 'string' ? [body] : typeof body[0] === 'string' ? (body as string[]) : [f.riskGaugeName === c.label ? riskText(f).riskTip : riskText(f).stabilityTip];
    return { title: c.value === null ? c.label : `${c.label} ${c.value}`, lines };
  });
}
