// 종족 설정(faction config) 타입과 검증. 종족 차이는 전부 이 설정에서 읽는다 (CLAUDE.md 규칙 2).
// 3번째 종족은 src/data/factions/<id>.json 하나로 추가된다.

/** 5색 타일의 역할. 이름(표시)은 종족 설정이, 효과(로직)는 엔진이 정한다 (GDD 3-1) */
export const TILE_ROLES = ['damage', 'spirit', 'shield', 'absorb', 'risk'] as const;
export type TileRole = (typeof TILE_ROLES)[number];

/** 슬롯 위치: 호로=본체(body), 사신=참백도(zanpakuto) (GDD 4장) */
export type SlotLocation = 'body' | 'zanpakuto';
/** 등급 방식: 호로=도전(challenge), 사신=승진(promotion) (GDD 8-2) */
export type RankMode = 'challenge' | 'promotion';

export interface FactionConfig {
  id: string;
  /** 화면 표시 이름 */
  name: string;
  /** 육성 5단계 이름 (GDD 8-1) */
  tierNames: [string, string, string, string, string];
  /** 등급 4단계 이름 (GDD 8-2) */
  rankNames: [string, string, string, string];
  /** 타일 역할 → 종족별 표시 이름 (GDD 3-1) */
  tileNames: Record<TileRole, string>;
  /** 리스크 게이지 이름 (GDD 5장) */
  riskGaugeName: string;
  /** 흡수 행위 이름 (GDD 4장) */
  absorbActionName: string;
  slotLocation: SlotLocation;
  /** 흡수로 본체 외형이 변하는가 (호로 true, 사신 false) */
  appearanceChange: boolean;
  rankMode: RankMode;
  /** 패배 상태 이름 (GDD 1장) */
  defeatStateName: string;
  /** 육성 1단계부터 쓰는 기본 기술 이름: 호로=본체 능력, 사신=시해 (GDD 4장). 흡수 특성 기술(P3)이 생기기 전까지의 임시 기술 */
  basicSkillName: string;
  /** 사냥터 이름 (GDD 6장) */
  huntingGroundName: string;
}

function isString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

function isStringTuple(v: unknown, n: number): boolean {
  return Array.isArray(v) && v.length === n && v.every(isString);
}

/** 모르는 JSON 을 종족 설정으로 검증한다. 문제가 있으면 무엇이 틀렸는지 담아 던진다 */
export function parseFactionConfig(raw: unknown): FactionConfig {
  const errors: string[] = [];
  const r = (raw ?? {}) as Record<string, unknown>;
  for (const k of ['id', 'name', 'riskGaugeName', 'absorbActionName', 'defeatStateName', 'huntingGroundName', 'basicSkillName']) {
    if (!isString(r[k])) errors.push(`${k}: 비어 있지 않은 문자열이어야 한다`);
  }
  if (!isStringTuple(r.tierNames, 5)) errors.push('tierNames: 문자열 5개여야 한다');
  if (!isStringTuple(r.rankNames, 4)) errors.push('rankNames: 문자열 4개여야 한다');
  const tn = (r.tileNames ?? {}) as Record<string, unknown>;
  for (const role of TILE_ROLES) {
    if (!isString(tn[role])) errors.push(`tileNames.${role}: 비어 있지 않은 문자열이어야 한다`);
  }
  if (r.slotLocation !== 'body' && r.slotLocation !== 'zanpakuto') errors.push('slotLocation: body | zanpakuto');
  if (typeof r.appearanceChange !== 'boolean') errors.push('appearanceChange: boolean');
  if (r.rankMode !== 'challenge' && r.rankMode !== 'promotion') errors.push('rankMode: challenge | promotion');
  if (errors.length > 0) throw new Error(`종족 설정 오류 (${String(r.id ?? '?')}):\n- ${errors.join('\n- ')}`);
  return raw as FactionConfig;
}
