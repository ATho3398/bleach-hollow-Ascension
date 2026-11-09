// 바퀴 끝 창 글 (GDD 193장 3): 이번 바퀴 얻은 것 한 줄 · 다음 바퀴 배율을 말로 · 숫자는 ⓘ. 순수 함수 (DOM 없음)
import { lapRewardMult, lapScale, winHealOf, type ExpeditionState } from '../../engine/expedition';
import { numLine, pct } from '../../data/help/textFormat';
import type { InfoGroup } from './infoTip';

type LapView = Pick<ExpeditionState, 'lap' | 'victoriesThisLap' | 'acquiredTraits' | 'foodLoot' | 'goldLoot' | 'acquired' | 'gearFinds' | 'petFinds'>;

/** "이번 바퀴: 승리 3 · 포식 1 · 먹이 4 · 골드 +120" — 0 인 것은 뺀다. 없으면 "이번 바퀴: 얻은 것 없음".
 *  흡수 이름은 종족 설정 absorbActionName(호로 '포식', 사신 '정화 흡수', GDD 222장 7) */
export function lapGainLine(exp: LapView, foodName: string, goldName: string, absorbName: string): string {
  const lap = exp.lap;
  const gold = exp.goldLoot.filter((g) => g.lap === lap && g.amount > 0).reduce((a, g) => a + g.amount, 0);
  const parts = [
    exp.victoriesThisLap > 0 ? `승리 ${exp.victoriesThisLap}` : '',
    countLap(exp.acquiredTraits, lap) > 0 ? `${absorbName} ${countLap(exp.acquiredTraits, lap)}` : '',
    countLap(exp.foodLoot, lap) > 0 ? `${foodName} ${countLap(exp.foodLoot, lap)}` : '',
    gold > 0 ? `${goldName} +${gold}` : '',
    countLap(exp.acquired, lap) > 0 ? `타일 ${countLap(exp.acquired, lap)}` : '',
    countLap(exp.gearFinds ?? [], lap) > 0 ? `장비 ${countLap(exp.gearFinds ?? [], lap)}` : '',
    countLap(exp.petFinds ?? [], lap) > 0 ? `펫 ${countLap(exp.petFinds ?? [], lap)}` : '',
  ].filter(Boolean);
  return `이번 바퀴: ${parts.length > 0 ? parts.join(' · ') : '얻은 것 없음'}`;
}

function countLap(list: { lap: number }[], lap: number): number {
  return list.filter((x) => x.lap === lap).length;
}

/** 다음 바퀴(nx) 배율을 말로: "다음 바퀴: 적이 세지고 보상이 는다 · 이기면 회복" */
export function continueWords(nx: number): string {
  const s = lapScale(nx);
  const harder = s.hp > 1 || s.attack > 1;
  const richer = lapRewardMult(nx) > 1;
  const head = harder && richer ? '적이 세지고 보상이 는다' : harder ? '적이 세진다' : richer ? '보상이 는다' : '적과 보상이 그대로다';
  return `다음 바퀴: ${head}${winHealOf(nx) > 0 ? ' · 이기면 회복' : ''}`;
}

/** 다음 바퀴 ⓘ: 배율 숫자 (text-style 3절 수치 줄) */
export function continueDetail(nx: number): InfoGroup {
  const s = lapScale(nx);
  const fm = (m: number) => `×${Math.round(m * 100) / 100}`;
  const lines = [numLine('보상', fm(lapRewardMult(nx))), numLine('적', `체력 ${fm(s.hp)}`, `공격 ${fm(s.attack)}`)];
  if (winHealOf(nx) > 0) lines.push(numLine('이기면 회복', `최대 체력의 ${pct(winHealOf(nx))}`));
  return { title: `${nx}바퀴`, lines };
}
