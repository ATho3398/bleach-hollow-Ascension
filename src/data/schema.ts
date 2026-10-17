// 데이터 파일(src/data/**) 구조. 내용은 아직 비어 있다. 임시 데이터에는 provisional: true 를 붙인다 (GDD 12장).

/** 종족별로 달라지는 표시 텍스트: 종족 id → 문자열. 엔진 로직은 id 만 쓰고 텍스트는 여기서 읽는다 */
/** 키 '*' 는 모든 종족 공통 값(해당 종족 키가 없을 때 쓴다) */
export type PerFaction<T> = Record<string, T>;

export function pickFaction<T>(map: PerFaction<T>, factionId: string): T {
  const v = map[factionId] ?? map['*'];
  if (v === undefined) throw new Error(`종족 ${factionId} 의 표시 텍스트가 없다`);
  return v;
}

export interface EnemyDef {
  id: string;
  name: PerFaction<string>;
  class: 'normal' | 'elite';
  /** 체력: 절대값이 아니라 "플레이어 기본 공격 N회 분량" (CLAUDE.md 규칙 3, GDD 3-5) */
  hpInAttacks: number;
  /** 기본 공격 1회 피해: "플레이어 기본 공격 N회 분량" (절대값 금지, CLAUDE.md 규칙 3) */
  attackInAttacks: number;
  /** 약점 계통 1개 (GDD 3-5): 이 계통의 스킬 블록은 위력 ×1.5. 임시 계통 A/B/C 중에서만 */
  weaknessLineageId: string;
  /** 강적 패턴 (GDD 3-5): 강공격(시전 예고)과 봉인을 번갈아 한다. 일반 적은 없음(기본 공격만). 수치 전부 임시 */
  pattern?: EnemyPattern;
  /** 흡수 계통 id (src/data/lineages). 임시 계통만 있다 (GDD 4-1) */
  lineageId: string;
  /** 조우할 때 희귀 개체일 확률 (임시, GDD 4장). 조우가 정해지면 rare 가 채워진다 */
  rareChance: number;
  /** 이 개체가 희귀 개체인가: 흡수 화면에 미리 표시되고 계통의 희귀 특성이 확정 후보로 나온다 */
  rare?: boolean;
  provisional?: boolean;
}

export type EnemyAction = 'heavy' | 'seal';

export interface EnemyPattern {
  /** 특수 행동 간격(초): 직전 행동이 끝난 뒤 이만큼 지나면 다음 행동 */
  everySeconds: number;
  /** 행동 순서 (끝나면 처음부터 반복) */
  sequence: EnemyAction[];
  /** 강공격 시전(예고) 시간(초). 시전 중에는 기본 공격을 하지 않는다 */
  castSeconds: number;
  /** 강공격 피해: 플레이어 기본 공격 N회 분량 */
  heavyInAttacks: number;
  /** 봉인: 이 시간(초) 동안 스킬 블록 생성 정지 */
  sealSeconds: number;
  provisional?: boolean;
}

export interface LineageDef {
  id: string;
  name: PerFaction<string>;
  provisional?: boolean;
}

export const TRAIT_KINDS = ['skill', 'passive', 'part'] as const;
export type TraitKind = (typeof TRAIT_KINDS)[number];

/** 스킬 블록 역할: 공격 / 막기 / 회복 (GDD 3-5) */
export const SKILL_ROLES = ['attack', 'guard', 'heal'] as const;
export type SkillRole = (typeof SKILL_ROLES)[number];

/** 체인 추가 효과 종류(엔진): stagger = 적 다음 행동을 value초 늦춤, reflect = 그 막기로 막은 피해의 value배 반사, cleanse = 봉인 해제 + SP +value */
export const CHAIN_BONUS_KINDS = ['stagger', 'reflect', 'cleanse'] as const;
export type ChainBonusKind = (typeof CHAIN_BONUS_KINDS)[number];
export interface ChainBonus {
  kind: ChainBonusKind;
  value: number;
}

/** passive 특성이 바꾸는 값: 기본 공격 위력, 기본 공격 속도, 받는 피해 */
export const PASSIVE_STATS = ['attackPower', 'attackSpeed', 'damageTaken'] as const;
export type PassiveStat = (typeof PASSIVE_STATS)[number];

export interface TraitDef {
  id: string;
  /** 계통 id (GDD 4장, 11-3 미정이라 임시 계통만 가능) */
  lineageId: string;
  kind: TraitKind;
  name: PerFaction<string>;
  /** 설명: 종족별 텍스트(키 '*' 는 공통) */
  description: PerFaction<string>;
  /** 희귀 개체에서만 나오는 특성 (확정 등장) */
  rare?: boolean;
  /** skill: 블록 역할 (GDD 3-5). 계통과 역할은 별개다 */
  role?: SkillRole;
  /** skill: 블록 위력 = 플레이어 기본 공격 N회 분량의 피해 (guard·heal 도 작은 피해를 준다) */
  powerInAttacks?: number;
  /** skill: 체인3(chainBonusFromChain) 이상으로 쓰면 붙는 추가 효과 1개 */
  chainBonus?: ChainBonus;
  /** passive: 자동 적용 배율 (기본 공격 위력·속도, 받는 피해) */
  passive?: { stat: PassiveStat; multiplier: number };
  provisional?: boolean;
}

/** 환경 타일이 바꾸는 전투 조건 종류 (효과 수치는 BALANCE.provisional.tiles). 이름만 종족 스킨 (GDD 6장) */
export type EnvironmentPreset = 'reshuffle' | 'power' | 'shield' | 'void';

export type TileEffect =
  | { type: 'spawn'; enemyClass: 'normal' | 'elite' }
  | { type: 'environment'; preset: EnvironmentPreset }
  | { type: 'rest' };

export interface TerrainTileDef {
  id: string;
  kind: 'prey-nest' | 'elite-den' | 'environment' | 'rest' | 'combo';
  /** 종족별 스킨 이름. 해당 종족 키(또는 '*')가 없으면 그 종족은 이 타일을 쓰지 않는다 */
  name: PerFaction<string>;
  effect: TileEffect;
  /** 같은 값이 인접 3칸이면 조합 효과(임시: 강적 1마리 확정). GDD 6장 "둥지 3개" */
  comboGroup?: string;
  provisional?: boolean;
}

export type TitleKind = 'rank' | 'hidden-rank' | 'tag';

export interface TitleDef {
  id: string;
  kind: TitleKind;
  /** 숨김 항목은 달성 전까지 도감에 물음표로 보인다 (GDD 8-3, 8-4) */
  hidden: boolean;
  name: PerFaction<string>;
  /** 획득 조건. 11-6, 11-7 미정이므로 null (구조만 있음). 런 로그(runLog.ts)를 읽게 될 것 */
  condition: null;
}
