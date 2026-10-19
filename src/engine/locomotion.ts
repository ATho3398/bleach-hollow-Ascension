// 캐릭터 이동 방식 (GDD 18-11): 부유 / 걷기 / 날기. 화면 움직임만 바꾸는 표시 속성이며 전투 수치·판정에는 영향이 없다.
// 우선순위: 그림 manifest > 진화체 > 종족 기본 > walk. (개발용 URL 파라미터 loco 는 화면 쪽에서 맨 위에 얹는다)
export const LOCOMOTIONS = ['float', 'walk', 'fly'] as const;
export type Locomotion = (typeof LOCOMOTIONS)[number];

export const DEFAULT_LOCOMOTION: Locomotion = 'walk';

export function isLocomotion(v: unknown): v is Locomotion {
  return typeof v === 'string' && (LOCOMOTIONS as readonly string[]).includes(v);
}

export interface LocomotionSources {
  /** 그림 manifest 의 키별 덮어쓰기 */
  art?: unknown;
  /** 현재 진화체의 값 (1단계는 없음) */
  form?: unknown;
  /** 종족 설정의 기본값 */
  faction?: unknown;
}

/** 이동 방식 해석 (순수): 유효한 값 중 가장 높은 우선순위. 모르는 값은 건너뛴다 */
export function resolveLocomotion(src: LocomotionSources): Locomotion {
  for (const v of [src.art, src.form, src.faction]) if (isLocomotion(v)) return v;
  return DEFAULT_LOCOMOTION;
}

/** 개발용 URL 파라미터(?loco=float|walk|fly) 값 → 이동 방식 (순수). 잘못된 값은 undefined */
export function locomotionFromQuery(search: string): Locomotion | undefined {
  const v = new URLSearchParams(search).get('loco');
  return isLocomotion(v) ? v : undefined;
}
