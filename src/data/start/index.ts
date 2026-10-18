// 시작 화면 문구 (UI 적용 U-1, 디자인의 "제안 문구"): 종족 설명·엠블럼은 종족 설정(FactionConfig) 값과 함께 쓰는 별도 데이터다.
// 종족 id 를 키로 조회만 하고 코드에서 분기하지 않는다. 키가 없는 종족(3번째 종족 등)은 설명 없이 기본 엠블럼으로 나온다. 문구는 모두 임시(provisional).
import data from './species.json';

export interface SpeciesStartText {
  emblemIcon: string;
  desc: string;
}

export const START_LEAD: string = data.lead;
export const START_TEXT_PROVISIONAL: boolean = data.provisional;

const FALLBACK: SpeciesStartText = { emblemIcon: 'i-broken', desc: '' };

export function speciesStartText(factionId: string): SpeciesStartText {
  return (data.species as Record<string, SpeciesStartText | undefined>)[factionId] ?? FALLBACK;
}
