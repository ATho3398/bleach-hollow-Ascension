// 성별 (GDD 114장, C.188): 슬롯(캐릭터)마다 남성/여성, 기본 남성. 외형이 갈리는 단계는 종족 설정 genderLookFromTier(1부터 센 단계 번호)로만 정한다 — 종족 이름으로 나누지 않는다.
// 여성 외형 = 같은 그림 키 뒤에 `.f`(파일 이름 `-f`)가 붙은 그림. 없으면 지금 그림(남성) 그대로 (src/data/art/manifest.ts charArt).
// 그림 함수가 화면마다 세이브를 받지 않으므로, 지금 열린 슬롯의 성별을 여기 보관한다(app 이 슬롯을 열 때·설정을 저장할 때 건다).

export const GENDERS = ['male', 'female'] as const;
export type Gender = (typeof GENDERS)[number];
export const DEFAULT_GENDER: Gender = 'male';

export const GENDER_LABEL: Record<Gender, string> = { male: '남성', female: '여성' };

/** 세이브 값 읽기: 모르는 값은 기본(남성) */
export function parseGender(raw: unknown): Gender {
  return (GENDERS as readonly unknown[]).includes(raw) ? (raw as Gender) : DEFAULT_GENDER;
}

/** 그림 키 뒤에 붙는 여성 표시 (char.hollow.5 → char.hollow.5.f → 파일 char-hollow-5-f.png) */
export const FEMALE_KEY_SUFFIX = '.f';

/** 이 단계(0부터)에서 여성 외형을 찾는가: 여성이고 종족 설정 단계 이상. 설정이 없으면 외형이 갈리지 않는다 */
export function usesFemaleLook(gender: Gender, tierIndex: number, genderLookFromTier: number | undefined): boolean {
  return gender === 'female' && genderLookFromTier !== undefined && tierIndex + 1 >= genderLookFromTier;
}

// ── 지금 열린 슬롯의 성별 (시작 화면·빈 슬롯이면 기본) ──
let active: Gender = DEFAULT_GENDER;

export function setActiveGender(g: unknown): void {
  active = parseGender(g);
}

export function activeGender(): Gender {
  return active;
}

/** 설정 성별 줄 안내 (GDD 114장): 외형이 갈리는 단계를 종족 설정의 단계 이름으로 */
export function genderLookNote(tierNames: readonly string[], genderLookFromTier: number | undefined): string {
  if (genderLookFromTier === undefined) return '모습은 성별과 상관없이 같다.';
  const from = genderLookFromTier <= 1 ? '처음' : tierNames[genderLookFromTier - 1] ?? `${genderLookFromTier}단계`;
  return `${from}부터 모습이 달라진다.`;
}
