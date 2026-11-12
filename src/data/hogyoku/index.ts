// 붕옥 개발 표시 데이터 (GDD 244장 3·4, C.414 provisional): 재료 이름·단계 이름. 두 종족 공통(슬롯 공유)이라 종족 설정이 아니라 여기 둔다.
// 단계 수·재료 수치는 BALANCE.provisional.hogyoku.develop — 이 파일은 이름만.
import type { TranscendentCondition } from '../transcendents';
export { SOUL_CRYSTAL_NAME } from '../economy';

/** 붕옥 파편 (스토리 화 첫 클리어·장 보스·탑 10층마다) */
export const HOGYOKU_SHARD_NAME = '붕옥 파편';
/** 공명의 정수 (진화할 때마다·공명) */
export const RESONANCE_ESSENCE_NAME = '공명의 정수';

/** 개발 단계 이름 (i = i+1 단계, 10%씩). provisional */
export const HOGYOKU_STEP_NAMES: readonly string[] = [
  '미약한 맥동', '금 간 껍질', '깨어나는 핵', '영압 흡수', '반쪽의 각성',
  '두 영압의 공명', '경계 융해', '의지의 발아', '초월의 문턱', '완전 각성',
];

/** 붕옥 상태 이름 (GDD 244장 2, 안 B 단계 띠) */
export const HOGYOKU_STAGE_NAMES = { half: '반각성', resonance: '공명', ready: '합체 가능' } as const;

/** 초월체 조건 한 줄 (GDD 244장 5 '못 모은 초월체 조건 공개') — 공격 분류는 블록 이름 대신 쉬운 말로 (GDD 137장 1) */
export function transcendentConditionText(c: TranscendentCondition): string {
  switch (c.type) {
    case 'rebirthSum': return `두 캐릭터의 환생 횟수 합 ${c.min}회 이상`;
    case 'allHidden': return '두 캐릭터 모두 히든 진화체';
    case 'sameElement': return '두 캐릭터가 같은 속성을 가짐';
    case 'allCategory': return c.category === 'physical' ? '두 캐릭터 모두 물리 공격(맨몸·칼날) 진화체' : c.category === 'special' ? '두 캐릭터 모두 특수 공격(영압) 진화체' : '두 캐릭터 모두 혼합 공격 진화체';
    case 'otherwise': return '위 조건에 하나도 맞지 않음';
  }
}
