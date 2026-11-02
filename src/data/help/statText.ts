// 능력치가 무엇에 쓰이는지 (GDD 141장 2 · 165장 2): 상태 화면 능력치 ⓘ 창 문구 — 능력치마다 한 줄, 사용자 말투 그대로 짧게.
// 이름은 종족 설정 표기(statName). 수치 공식은 도움말 '능력치'(glossary.json). 블록 타입(물리/특수/혼합)은 말하지 않는다(137장 1)
import { STAT_IDS, type StatId } from '../schema';
import { statName } from '../elements';

/** 능력치 6종 '이름 = 하는 일' (GDD 165장 2) */
export const STAT_USE: Readonly<Record<StatId, string>> = {
  hp: '최대 체력',
  atk: '일반 공격 피해 관련',
  int: '블록 공격 피해 관련',
  def: '받는 일반 공격 피해 관련',
  spr: '받는 블록 공격 피해 관련',
  spd: '일반 공격 빠르기 관련',
};

/** 능력치 6줄 '이름 = 하는 일' */
export function statUseLines(f: { id: string }): string[] {
  return STAT_IDS.map((id) => `${statName(id, f.id)} = ${STAT_USE[id]}`);
}

/** 능력치 ⓘ 창 전체 (GDD 165장 2): 6종 + 치명 둘(최대만) + 치명타 피해 + 속성 피해 + 노력치. 머리 줄·'기본 n%'·괄호 부연 없음 */
export function statInfoLines(f: { id: string }, critMax: { basic: string; block: string }): string[] {
  return [
    ...statUseLines(f),
    `평타 치명 = 일반 공격이 치명타로 터질 확률 (최대 ${critMax.basic})`,
    `블록 치명 = 블록 공격이 치명타로 터질 확률 (최대 ${critMax.block})`,
    '치명타 피해 = 치명타가 터지면 들어가는 피해 배율',
    '속성 피해 = 그 속성 공격 피해 관련',
    '값 옆 굵은 +숫자 = 노력치',
  ];
}
