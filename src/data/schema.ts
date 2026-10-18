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
  /** 행동 패턴 (GDD 3-5, 14-5). 없으면 기본형(기본 공격만). 수치 전부 임시 */
  pattern?: EnemyPattern;
  /** 흡수 계통 id (src/data/lineages). 임시 계통만 있다 (GDD 4-1) */
  lineageId: string;
  /** 조우할 때 희귀 개체일 확률 (임시, GDD 4장). 조우가 정해지면 rare 가 채워진다 */
  rareChance: number;
  /** 이 개체가 희귀 개체인가: 흡수 화면에 미리 표시되고 계통의 희귀 특성이 확정 후보로 나온다 */
  rare?: boolean;
  /** true 면 원정 출현 풀에 들어가지 않는다 (테스트·연습용 고정 적) */
  testOnly?: boolean;
  provisional?: boolean;
}

export type EnemyAction = 'heavy' | 'seal';

/** 적 행동 패턴 종류 (GDD 14-5). 엔진은 이 식별자로만 분기한다 (적 id 분기 금지).
 *  일반 적: basic(기본) / swift(속공: 공격 간격 짧고 한 방은 약함) / sturdy(단단: 체력 많고 느림).
 *  강적: heavy-seal(강공격↔봉인 번갈아) / heavy-chain(연속 강공격) / stance(방어 자세 구간 + 반격) */
export type EnemyPatternKind = 'basic' | 'swift' | 'sturdy' | 'heavy-seal' | 'heavy-chain' | 'stance';

export const ENEMY_PATTERN_KINDS: readonly EnemyPatternKind[] = ['basic', 'swift', 'sturdy', 'heavy-seal', 'heavy-chain', 'stance'];

interface PatternBase {
  provisional?: boolean;
}

export type EnemyPattern =
  | (PatternBase & { kind: 'basic' })
  /** 기본 공격 간격(초)을 데이터로 바꾼다. 속공 = 짧게, 단단 = 길게 (한 방 세기는 enemy.attackInAttacks) */
  | (PatternBase & { kind: 'swift' | 'sturdy'; attackSeconds: number })
  | (PatternBase & {
      kind: 'heavy-seal';
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
    })
  | (PatternBase & {
      kind: 'heavy-chain';
      everySeconds: number;
      /** 첫 강공격 시전 시간(초) */
      castSeconds: number;
      /** 강공격 한 방의 피해: 기본 공격 N회 분량 */
      heavyInAttacks: number;
      /** 한 번의 연속 강공격에서 연달아 치는 횟수 */
      hits: number;
      /** 둘째 방부터의 시전 시간(초): 막기 판단이 빨라진다 */
      followCastSeconds: number;
    })
  | (PatternBase & {
      kind: 'stance';
      everySeconds: number;
      /** 방어 자세 지속 시간(초) */
      stanceSeconds: number;
      /** 자세 중 내 블록 피해 배율 (<1) */
      blockDamageMultiplier: number;
      /** 자세 중 블록을 쓸 때마다 받는 반격: 기본 공격 N회 분량 (막기 상태면 경감) */
      counterInAttacks: number;
    });

export interface LineageDef {
  id: string;
  name: PerFaction<string>;
  /** 조합 키 표시용 짧은 이름 ("A"). 없으면 name */
  shortName?: PerFaction<string>;
  /** 이 계통의 성향 (GDD 4-2): 진화 형태 패시브가 조합의 계통 성향을 섞어 만든다. 임시 */
  tendency?: { stat: PassiveStat; multiplier: number };
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

/**
 * 칭호 조건 어휘 (GDD 14-7, 임시). 런 로그와 진화 기록을 읽는 조건식이며 and/or 로 조합한다.
 * 모든 min 은 "이상"이다. 어떤 값도 종족 id 를 쓰지 않는다(종족 차이는 데이터 텍스트뿐).
 */
export type TitleCondition =
  | { type: 'and'; all: TitleCondition[] }
  | { type: 'or'; any: TitleCondition[] }
  /** 흡수한 횟수(놓아준 것 제외). lineage 가 없으면 전체 계통, rareOnly 면 희귀 개체만 */
  | { type: 'absorbCount'; min: number; lineage?: string; rareOnly?: boolean }
  /** 진화 기록에 이 진화체 id 가 있다(진화한 진화체 또는 진화 전 진화체 = 경로 포함) */
  | { type: 'passedForm'; formId: string }
  /** 리스크 한계 돌파 횟수 */
  | { type: 'breakthroughs'; min: number }
  /** 한계 돌파 후 귀환한 횟수 */
  | { type: 'survivedBreakthroughs'; min: number }
  /** 체인3 발동 누계 */
  | { type: 'chain3Total'; min: number }
  /** 막기 성공 누계 */
  | { type: 'guardTotal'; min: number }
  /** 강적(class elite) 처치 수 */
  | { type: 'elitesDefeated'; min: number }
  /** 귀환한 원정 수 */
  | { type: 'runsReturned'; min: number }
  /** 패배한 원정 수 */
  | { type: 'runsDefeated'; min: number }
  /** 도달한 최대 바퀴 */
  | { type: 'maxLap'; min: number }
  /** 특정 단계(0부터)에 머문 채 격파한 적 수. enemyClass 가 없으면 모든 등급 */
  | { type: 'defeatedAtTier'; tier: number; min: number; enemyClass?: string };

export interface TitleDef {
  id: string;
  kind: TitleKind;
  /** 숨김 항목은 달성 전까지 도감에 물음표로 보인다 (GDD 8-3, 8-4) */
  hidden: boolean;
  name: PerFaction<string>;
  /** 획득 조건. 11-6, 11-7 미정이므로 대부분 null(해금 불가). 있으면 provisional 임시 조건이다 */
  condition: TitleCondition | null;
  /** 이 조건은 임시(확정 아님). 조건이 있으면 반드시 true (GDD 12장, 14-7) */
  provisional?: boolean;
}

/**
 * 진화 조건 어휘 (GDD 4-2 v1.0). 전부 "현재 단계 계통별 누적" 기준이다. 안정 수치·리스크 돌파·전투 성과는 쓰지 않는다.
 * 비율(ratio)은 단계 필요 흡수 횟수 N 에 곱해 올림한 값이 기준, 비중(min/max)은 계통 누적 ÷ 전체 누적(0~1).
 */
export type FormCondition =
  /** 계통 X 누적 ≥ ceil(ratio × N) */
  | { type: 'lineageCount'; lineage: string; ratio: number }
  /** 계통 X 비중 ≥ min */
  | { type: 'lineageShare'; lineage: string; min: number }
  /** 계통들의 비중 합 ≥ min (lineageShare 의 합산 확장: 2조합 심화에 쓴다) */
  | { type: 'lineagesShareSum'; lineages: string[]; min: number }
  /** 1위 계통 = X */
  | { type: 'top1'; lineage: string }
  /** 1·2위 계통 = {X, Y} (순서 무관) */
  | { type: 'top2'; lineages: string[] }
  /** 1·2·3위 계통 = {X, Y, Z} (순서 무관) */
  | { type: 'top3'; lineages: string[] }
  /** 최다 비중 ≥ min (편식형) */
  | { type: 'maxShareAtLeast'; min: number }
  /** 최다 비중 ≤ max (균형형) */
  | { type: 'maxShareAtMost'; max: number }
  /** 누적 1 이상인 계통 수 ≥ min */
  | { type: 'activeLineages'; min: number }
  /** 모든 계통 누적 ≥ ceil(ratio × N) */
  | { type: 'allLineagesCount'; ratio: number }
  /** 희귀 흡수 수 ≥ max(1, ceil(ratio × N)) */
  | { type: 'rareCount'; ratio: number };

export const FORM_CONDITION_TYPES = [
  'lineageCount', 'lineageShare', 'lineagesShareSum', 'top1', 'top2', 'top3', 'maxShareAtLeast', 'maxShareAtMost', 'activeLineages', 'allLineagesCount', 'rareCount',
] as const;

/** 템플릿 종류. 이름 자리 표시("A우세형" 등)와 효과 가중을 정한다. 정식 이름은 name 에 손으로 넣는다 */
export const FORM_KINDS = ['dominant', 'pair', 'triple', 'deep-pair', 'balanced', 'picky', 'rare', 'base'] as const;
export type FormKind = (typeof FORM_KINDS)[number];

export interface FormLabel {
  kind: FormKind;
  /** 이름·힌트에 쓰는 계통들 (특수형·기본형은 빈 목록) */
  lineages: string[];
}

export interface FormEffects {
  /** 플레이어 최대 체력·기본 공격 위력 배율 (진화할 때마다 곱해진다). 슬롯 +1 은 BALANCE.evolution.slotsPerEvolution */
  hpMultiplier: number;
  attackMultiplier: number;
  /** 요구 계통들의 tendency 를 섞은 패시브 (없으면 빈 객체) */
  passive: Partial<Record<PassiveStat, number>>;
}

/** 진화체 (GDD 4-2 v1.0). 단계(2~5)마다 테이블이 따로 있다. 데이터는 src/data/evolution/forms.json */
export interface FormDef {
  /** 예 "t3:pair@lineage-a+lineage-b" */
  id: string;
  /** 진화해서 도달하는 단계 (2~5, 1-based) */
  tier: number;
  /** 손으로 쓴 정식 이름(종족별). 없으면 label 에서 "A+B형" 같은 자리 표시를 만든다 */
  name?: PerFaction<string>;
  label: FormLabel;
  /** 이 진화체로 올 수 있는 이전 단계 진화체 id. 'any' 면 제한 없음 (2단계 진화체는 항상 'any') */
  from: string[] | 'any';
  /** 진화 조건 목록 (전부 만족, AND) */
  requires: FormCondition[];
  /** 후보가 여럿이면 높은 쪽 → 조건 수 많은 쪽 → id 순 */
  priority: number;
  /** 기본형: 단계마다 정확히 1개. 후보가 없을 때 선택된다 */
  fallback?: true;
  effects: FormEffects;
  provisional?: boolean;
}
