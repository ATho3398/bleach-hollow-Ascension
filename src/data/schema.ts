// 데이터 파일(src/data/**) 구조. 내용은 아직 비어 있다. 임시 데이터에는 provisional: true 를 붙인다 (GDD 12장).

import type { Locomotion } from '../engine/locomotion';

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
  /** 속성 (GDD 20-2, src/data/elements): 상성·흡수 조건·흡수 특성 후보·속성 노력치가 이것으로 정해진다 (C.47: 옛 약점 계통·흡수 계통을 대체) */
  element: string;
  /** 공격 분류 (GDD 20-1): 적의 공격(기본·강공격·반격)이 내 방어(물리)·정신력(특수)·둘의 평균(혼합) 중 무엇에 막히는가 */
  category: AttackCategory;
  /** 능력치 성향 (GDD 20-3): 그 단계 기준 능력치에 곱하는 배율. 없는 능력치는 1. 방어·정신력 차이가 내 공격 분류 선택을 의미 있게 한다. 임시 */
  statBias?: Partial<Record<StatId, number>>;
  /** 흡수하면 오르는 노력치 (GDD 20-4, 임시): 능력치 → 점수 */
  ev: Partial<Record<StatId, number>>;
  /** 행동 패턴 (GDD 3-5, 14-5). 없으면 기본형(기본 공격만). 수치 전부 임시 */
  pattern?: EnemyPattern;
  /** 조우할 때 희귀 개체일 확률 (임시, GDD 4장). 조우가 정해지면 rare 가 채워진다 */
  rareChance: number;
  /** 이 개체가 희귀 개체인가: 흡수 화면에 미리 표시되고 그 속성의 희귀 특성이 확정 후보로 나온다 */
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
  | (PatternBase & { kind: 'swift'; attackSeconds: number })
  | (PatternBase & { kind: 'sturdy'; attackSeconds: number })
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

/** 능력치 6종 (GDD 20-3): 체력·힘·지능·방어·정신력·속도. 이름은 src/data/elements/stats.json */
export const STAT_IDS = ['hp', 'atk', 'int', 'def', 'spr', 'spd'] as const;
export type StatId = (typeof STAT_IDS)[number];
export type Stats = Record<StatId, number>;

/** 공격 분류 3종 (GDD 20-1): 물리 = 힘 vs 방어, 특수 = 지능 vs 정신력, 혼합 = 둘의 평균. 종족 설정 계열(families[].category)이 정한다 */
export const ATTACK_CATEGORIES = ['physical', 'special', 'mixed'] as const;
export type AttackCategory = (typeof ATTACK_CATEGORIES)[number];

/** 속성 종류 (GDD 20-2): 노멀(상성 없음) / 원소(순환 상성) / 특수(상성 대신 효과) */
export type ElementKind = 'normal' | 'elemental' | 'special';
/** 특수 속성 효과 (수치는 BALANCE.provisional.elements): drain = 준 피해 일부 흡혈, poison = 지속 피해, pierce = 방어·정신력 일부 무시 + 내가 쓰면 리스크 소량 */
export type ElementEffect = 'drain' | 'poison' | 'pierce';

export interface ElementDef {
  id: string;
  kind: ElementKind;
  /** 원소만: 이 속성이 강하게 치는 속성 1개 (순환: 물 → 불 → 흙 → 뇌 → 물) */
  beats?: string;
  /** 특수만: 효과 종류 */
  effect?: ElementEffect;
  name: PerFaction<string>;
  /** 칩에 쓰는 한 글자 */
  abbr: PerFaction<string>;
  /** 표시 색: 기존 디자인 토큰 이름 (`--bha-…`). 새 색은 만들지 않는다 (CLAUDE.md 7번) */
  color: string;
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

/** passive 특성이 바꾸는 값: 기본 공격 위력, 기본 공격 속도, 받는 피해, 블록 생성 속도(GDD 20-3 v3.6: 블록 생성은 패시브·고유 특성으로만 빨라진다) */
export const PASSIVE_STATS = ['attackPower', 'attackSpeed', 'damageTaken', 'blockSpawn'] as const;
export type PassiveStat = (typeof PASSIVE_STATS)[number];

export interface TraitDef {
  id: string;
  /** 속성 id (GDD 20-2, C.47: 옛 계통을 대체). 블록 색·상성·자기 속성 보정·속성 보너스(같은 속성 3개)·바스트로데 진화 속성을 정한다 */
  element: string;
  kind: TraitKind;
  name: PerFaction<string>;
  /** 블록 위에 쓰는 약어: 2줄 × 2~4자 (UI 디자인 HANDOFF 5-1, GDD 15-2). 없으면 이름 앞 4글자로 대체한다 */
  abbr?: PerFaction<string>;
  /** 설명: 종족별 텍스트(키 '*' 는 공통) */
  description: PerFaction<string>;
  /** 희귀 개체에서만 나오는 특성 (확정 등장) */
  rare?: boolean;
  /** 보스 특성 (GDD 25-3, C.58): 그 보스를 이긴 흡수 화면에서만 확정 후보로 나온다(일반 흡수 후보·희귀 후보에 안 섞인다). rare 와 함께 쓴다 */
  boss?: boolean;
  /** skill: 블록 역할 (GDD 3-5). 계통과 역할은 별개다 */
  role?: SkillRole;
  /** skill: 블록 위력 = 플레이어 기본 공격 N회 분량의 피해 (guard·heal 도 작은 피해를 준다) */
  powerInAttacks?: number;
  /** skill 공격 블록: 계열 id (GDD 17-3). 같은 계열 공격 블록이 바에서 연속이면 체인이 된다. 계열 목록·단계별 기술은 종족 설정(families)이 정한다. 막기·회복은 계열 없음 */
  family?: string;
  /** skill 막기·회복: 체인3(chainBonusFromChain) 이상으로 쓰면 붙는 추가 효과 1개. 공격은 계열 단계 기술(종족 설정)이 정하므로 없다 */
  chainBonus?: ChainBonus;
  /** passive: 자동 적용 배율 (기본 공격 위력·속도, 받는 피해, 블록 생성 속도) */
  passive?: { stat: PassiveStat; multiplier: number };
  provisional?: boolean;
}

/** 환경 타일이 바꾸는 전투 조건 종류 (효과 수치는 BALANCE.provisional.tiles). 이름만 종족 스킨 (GDD 6장) */
export type EnvironmentPreset = 'reshuffle' | 'power' | 'shield' | 'void';

/** 이벤트 타일 종류 (GDD 25-5 ③, 드래프트로만 얻고 한 번 밟으면 사라진다). 수치는 BALANCE.provisional.tileVariants.events */
export const TILE_EVENTS = ['merchant', 'altar', 'treasure', 'trap', 'crossroads'] as const;
export type TileEvent = (typeof TILE_EVENTS)[number];

export type TileEffect =
  | { type: 'spawn'; enemyClass: 'normal' | 'elite' }
  | { type: 'environment'; preset: EnvironmentPreset }
  | { type: 'rest' }
  | { type: 'event'; event: TileEvent };

export interface TerrainTileDef {
  id: string;
  kind: 'prey-nest' | 'elite-den' | 'environment' | 'rest' | 'combo' | 'event';
  /** 종족별 스킨 이름. 해당 종족 키(또는 '*')가 없으면 그 종족은 이 타일을 쓰지 않는다 */
  name: PerFaction<string>;
  effect: TileEffect;
  /** 같은 값이 인접 3칸이면 조합 효과(임시: 강적 1마리 확정). GDD 6장 "둥지 3개" */
  comboGroup?: string;
  /** 상위 타일 (GDD 25-5 ⑤ 합성 "+"): 바탕 타일 id. 효과 강화 수치는 BALANCE.provisional.tileVariants.upgrade[종류]. 상위 타일은 다시 합성하지 않는다 */
  upgradeOf?: string;
  provisional?: boolean;
}

/** story = 스토리 장 클리어·보스 첫 처치 칭호 (GDD 25-3·25-4, C.58) */
export type TitleKind = 'rank' | 'hidden-rank' | 'tag' | 'story';

/**
 * 칭호 조건 어휘 (GDD 14-7, 임시). 런 로그와 진화 기록을 읽는 조건식이며 and/or 로 조합한다.
 * 모든 min 은 "이상"이다. 어떤 값도 종족 id 를 쓰지 않는다(종족 차이는 데이터 텍스트뿐).
 */
export type TitleCondition =
  | { type: 'and'; all: TitleCondition[] }
  | { type: 'or'; any: TitleCondition[] }
  /** 흡수한 횟수(놓아준 것 제외). element 가 없으면 전체 속성, rareOnly 면 희귀 개체만 */
  | { type: 'absorbCount'; min: number; element?: string; rareOnly?: boolean }
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
  | { type: 'defeatedAtTier'; tier: number; min: number; enemyClass?: string }
  /** 해방 수련을 완료한 적이 있다 (GDD 22-5, C.54) */
  | { type: 'trainingCompleted' }
  /** 등급전으로 이 번호 이상(숫자가 같거나 작음)에 오른 적이 있다 (GDD 21장, C.49) */
  | { type: 'rankReached'; rank: number }
  /** 이 보스를 처치한 적이 있다 (GDD 25-3, C.58) */
  | { type: 'bossDefeated'; bossId: string }
  /** 스토리 이 장의 화를 모두 깬 적이 있다 (GDD 25-4, C.58) */
  | { type: 'storyChapterCleared'; chapterId: string };

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
 * 콤보 규칙 (GDD 17-3): "같은 계열의 minChain 단계 이상 체인을, 사이에 다른 블록 사용 없이 repeat 번 연속(시간 제한 없음) 쓰면" 특수 블록(콤보 블록)이 바 맨 오른쪽에 생기고,
 * 쓰면 powerInAttacks 회분의 큰 피해를 준다. 진화 단계(tier)마다 열린다 — 그 단계 이상이면 규칙이 켜진다. 이름·수치는 전부 provisional.
 * 계열 id 는 종족 중립(family-a/b/c)이고, 콤보 블록 이름만 종족별이다.
 */
export interface ComboDef {
  id: string;
  /** 열리는 육성 단계 (1~5, 1-based) */
  tier: number;
  /** 규칙의 계열 id (종족 설정 families) */
  family: string;
  /** 이 단계 이상의 체인만 센다 (1~3) */
  minChain: number;
  /** 연속 횟수 (2 이상) */
  repeat: number;
  /** 콤보 블록 피해: 플레이어 기본 공격 N회 분량 (필살 블록처럼 약점·체인 배율 없이 방어 자세 배율만 받는다) */
  powerInAttacks: number;
  name: PerFaction<string>;
  provisional?: boolean;
}

/**
 * 진화체 종류 (GDD 20-5 v3.7~v4.2): 일반 = 1·2·3단계 base, 바스트로데 element(속성 8), 아란칼 arrancar(속성 × 분류 24).
 * 히든 12종: 바스트로데 시점 fusion 2 · complete 1 · special 3 · pure · fail / 아란칼 시점 limit(한계 돌파) · restraint(절제) · hunter(강적 사냥꾼) · reborn(환생, GDD 22-7 환생 N회 이상).
 */
export const FORM_KINDS = ['base', 'element', 'arrancar', 'fusion', 'complete', 'special', 'pure', 'fail', 'limit', 'restraint', 'hunter', 'reborn'] as const;
export type FormKind = (typeof FORM_KINDS)[number];
export const HIDDEN_FORM_KINDS: readonly FormKind[] = ['fusion', 'complete', 'special', 'pure', 'fail', 'limit', 'restraint', 'hunter', 'reborn'];

export interface FormLabel {
  kind: FormKind;
  /** 이름 자리 표시·힌트에 쓰는 속성 (융합은 2개, 없으면 빈 목록) */
  elements: string[];
  /** 아란칼 일반형의 공격 분류 */
  category?: AttackCategory;
}

/** 진화체 (GDD 20-5). 데이터는 src/data/evolution/forms.json (생성기 generate.ts 결과를 커밋, 손으로 고칠 수 있다) */
export interface FormDef {
  /** 예 "t4:fire", "t5:fire:physical", "h4:fusion:water+earth" */
  id: string;
  /** 진화해서 도달하는 단계 (2~5, 1-based) */
  tier: number;
  /** 손으로 쓴 정식 이름(종족별). 없으면 label 에서 "불 바스트로데" 같은 자리 표시를 만든다 */
  name?: PerFaction<string>;
  label: FormLabel;
  /** 히든 진화체 (도감에서 달성 전에는 ?) */
  hidden?: boolean;
  /** 내 캐릭터 속성 (GDD 20-2 v3.5). 없으면 직전 진화체의 속성을 잇는다 (아란칼 행동 히든). 융합은 2개 */
  elements?: string[];
  /** 종족값 (GDD 20-4): 같은 단계는 합계 동일(완전체는 높게, 실패형은 낮게) */
  stats: Stats;
  /** 자기 속성 보정 배율 (없으면 BALANCE.elements.stab). 노멀 순수형이 크게 갖는다 */
  stab?: number;
  /** 이동 방식 (GDD 18-11, 화면 표시 전용). 없으면 종족 기본 → walk */
  locomotion?: Locomotion;
  /** 체인 묶음 상한 (GDD 19-2). 없으면 종족 설정 maxChain → 3 */
  maxChain?: number;
  provisional?: boolean;
}
