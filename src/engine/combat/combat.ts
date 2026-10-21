// 전투 v2: 실시간 자동 전투 + 스킬 블록 체인 (GDD 3-5). 종족 무관 순수 로직, 화면과 분리.
// 고정 틱(BALANCE.provisional.combat.tickSeconds) 시뮬레이션: createCombat(seed, setup) → step(state, input?) 반복.
// 같은 시드 + 같은 입력 기록 = 같은 결과. 상태는 평범한 객체(rng 포함)라 structuredClone 으로 복제할 수 있다.
// 화면은 step 을 실시간(1x/2x)으로 부르고, 테스트·봇은 헤드리스로 빠르게 돌린다.

import { BALANCE } from '../../config/balance';
import { hasSpecialActions } from '../../data/enemies';
import { ELEMENTAL_IDS, getElement, matchup, NORMAL_ELEMENT, weaknessesOf, type Matchup } from '../../data/elements';
import { STAT_IDS, type AttackCategory, type ChainBonus, type ChainBonusKind, type EnemyDef, type EnemyPattern, type SkillRole, type StatId, type Stats } from '../../data/schema';
import type { PhysAbilityEffect, PhysBlockEffect } from '../../data/evolution/physBlocks';
import type { FinisherKind } from '../runLog';
import { createRng, nextFloat, nextInt, type Rng } from '../rng';
import { chainGroup, inTray, type Block, type Tray } from './tray';

const CX = BALANCE.provisional.combat;
const EL = BALANCE.provisional.elements;
const LB = BALANCE.provisional.liberation;
const BP = BALANCE.provisional.blockPool;

/** 기본 공격 블록 특성 id (GDD 44장: 기본 블록 5종 중 공격 3종 — 블록마다 계열을 가진다) */
export const BASIC_SKILL_ID = 'basic-skill';
/** 기본 막기·회복 블록 특성 id (GDD 44장: 장착 흡수 특성과 상관없이 늘 풀에 있다) */
export const BASIC_GUARD_ID = 'basic-guard';
export const BASIC_HEAL_ID = 'basic-heal';
const BASIC_IDS: readonly string[] = [BASIC_SKILL_ID, BASIC_GUARD_ID, BASIC_HEAL_ID];

/** 기본 블록(흡수 특성이 아닌 블록)인가 */
export function isBasicBlockId(id: string | null | undefined): boolean {
  return id != null && BASIC_IDS.includes(id);
}

/** 블록 풀 수치 (GDD 44장, BALANCE.provisional.blockPool) */
export interface BlockPoolParams {
  basicWeights: { attack: number; guard: number; heal: number };
  basicGuardRatio: number;
  basicHealRatio: number;
  basicRoleBlocks: { guard: { powerInAttacks: number; chainBonus: ChainBonus }; heal: { powerInAttacks: number; chainBonus: ChainBonus } };
  /** 기본 블록 타이머 간격(초, 흡수 0칸) */
  basicSpawnSeconds: number;
  /** 장착 흡수 칸 수별 기본 블록 몫(초당 생성 기대치 비율, [0칸, 1칸, 2칸, …], 표보다 칸이 많으면 마지막 값). 기본 타이머 간격 = 흡수 블록 총 간격 × (1 − 몫) / 몫 (GDD 44-2 → 44-3, C.98) */
  basicShareBySlots: number[];
  /** 장착 흡수 칸이 2칸부터 1칸 늘 때마다 흡수 특성 타이머 간격 +비율 (간격 = combat.blockSpawnSeconds × (1 + 이 값 × (칸 − 1))) — 후반(4칸 이상) 블록 총량을 누를 때 쓰는 지렛대 (GDD 44-2) */
  absorbedSlowdownPerSlot: number;
  temperament: Record<string, { attack?: number; guard?: number; heal?: number; absorbedSpawn?: number }>;
}

/** 기본 블록 풀의 한 칸: 기본 타이머가 블록을 낼 때 이 생성원·계열이 뽑힐 확률 (합 1) */
export interface PoolEntry {
  source: CombatSkill;
  family: string | null;
  chance: number;
}

/** 전투에 가져온 블록 생성원 하나 (장착 skill 특성, 또는 기본 블록) */
export interface CombatSkill {
  id: string;
  /** 속성 id (GDD 20-2). 기본 블록은 null(속성 없음 = 상성·자기 속성 보정 없음) */
  element: string | null;
  /** 공격 분류 (GDD 20-1): 계열이 정한다. 계열 없는 블록(막기·회복·기본)은 혼합 */
  category: AttackCategory;
  role: SkillRole;
  /** 공격 계열 id (GDD 17-3, 종족 설정 families). 막기·회복·기본 블록은 null */
  family?: string | null;
  /** 블록 위력: 플레이어 기본 공격 N회 분량의 피해 */
  powerInAttacks: number;
  chainBonus: ChainBonus;
  /** 위력 배율(속성 보너스 등). 피해·막기 지속·회복량에 모두 곱한다. 1 = 없음 */
  powerMultiplier: number;
}

/** 계열 한 개의 단계별 효과 (GDD 17-3, 종족 설정 families 에서 옮긴다). tiers[k] = (k+1)단계 */
export interface FamilyCombat {
  tiers: { multiplier: number; bonus?: ChainBonus }[];
}

/** 켜져 있는 콤보 규칙 하나 (GDD 17-3, 데이터는 src/data/evolution/combos.json): 같은 계열의 minChain 단계 이상 체인을 사이에 다른 블록 사용 없이 repeat 번 연속 쓰면 콤보 블록이 생긴다 */
export interface ComboRule {
  id: string;
  family: string;
  minChain: number;
  repeat: number;
  /** 콤보 블록 피해: 기본 공격 N회 분량 */
  powerInAttacks: number;
}

export interface CombatParams {
  tickSeconds: number;
  playerAttackSeconds: number;
  enemyAttackSeconds: number;
  playerAttackDamage: number;
  hpAttackScale: number;
  growthMultiplier: number;
  playerMaxHp: number;
  timeLimitSeconds: number;
  enemyDamageVariance: number;
  /** 블록 바 칸 수 (일자 8칸, GDD 3-5 v0.8) */
  trayCapacity: number;
  /** 흡수 특성 블록 생성 간격(초): 특성마다 타이머 (GDD 3-5, 44-1 B안) */
  blockSpawnSeconds: number;
  /** 같은 계열 공격 특성이 여럿이면 그 계열 블록 간격을 (같은 계열 수 − 1)당 이 비율만큼 늘린다 (C.34) */
  familySpawnSlowdown: number;
  /** 블록 풀 가중 (GDD 44장) */
  blockPool: BlockPoolParams;
  /** 성향 특성 (GDD 39장 ①, 진화 때 정한 노력치 최고 능력치 — 실패형은 2개): 블록 풀 가중 보정에 쓴다. 비면 보정 없음 */
  dispositions: StatId[];
  chainMultipliers: readonly number[];
  /** 한 번에 묶이는 최대 블록 수 (GDD 19-2): 진화체 데이터 → 종족 설정 기본값에서 온다. 없으면 chainMultipliers 길이(3). 단계 기술·배율이 있는 만큼(chainMultipliers 길이)까지만 쓰인다 */
  maxChain?: number;
  chainBonusFromChain: number;
  /** 계열 id → 단계별 위력 배율·추가 효과 (종족 설정에서 옮김, GDD 17-3). 없는 계열·기본/막기/회복 블록은 chainMultipliers·skill.chainBonus 를 쓴다 */
  families: Record<string, FamilyCombat>;
  spPerBlock: number;
  spMax: number;
  specialPowerInAttacks: number;
  basicBlockPowerInAttacks: number;
  basicBlockChainBonus: ChainBonus;
  /** 상성 (GDD 20-2): 강 / 약 배율, 자기 속성 보정 (진화체 stab 이 있으면 그 값) */
  strongMultiplier: number;
  weakMultiplier: number;
  stabMultiplier: number;
  /** 특수 속성 효과 (BALANCE.provisional.elements) */
  drainFraction: number;
  /** 한 전투 흡혈 회복 합계 상한 (최대 체력 비율, C.53) */
  drainCapFraction: number;
  poisonFraction: number;
  poisonSeconds: number;
  /** 적 기준 능력치 (GDD 20-3·32-1): 적 능력치 = 이 값 × 적 성향. 원정 난이도 ★n 의 기준 능력치(= n단계 기준, 기본 ★1) — src/engine/difficulty.ts 가 채운다 */
  refStat: number;
  /** 내 쪽 세계 기준 능력치 (GDD 32-1, C.75): 내 체력·평타 간격은 이 고정값(1단계 기준 능력치)에 대한 비로 환산한다 — 진화·노력치가 그대로 강해짐 */
  playerRefStat: number;
  /** 내 능력치 (종족값 + 노력치). 없으면 모두 playerRefStat (= 1단계 기준 몸) */
  playerStats?: Stats;
  /** 내 캐릭터 속성 (1단계 노멀, 융합은 2개). 적의 공격 상성과 내 기본 공격 상성, 자기 속성 보정에 쓴다 */
  playerElements: string[];
  /** 고유 특성·패시브: 블록 생성 속도 배율(클수록 빠름), 분류별 내 피해 배율, 분류별 받는 피해 배율 */
  blockSpawnMultiplier: number;
  categoryPower: Record<AttackCategory, number>;
  categoryTaken: Record<AttackCategory, number>;
  guardSeconds: number;
  guardReduction: number;
  heavyGuardReduction: number;
  healFraction: number;
  voidCheckSeconds: number;
  voidChance: number;
  voidChanceMax: number;
  voidPowerInAttacks: number;
  /** 켜져 있는 콤보 규칙 (진화 단계마다 열림, applyEvolutionToParams 가 채운다). 비면 콤보 없음 */
  combos: ComboRule[];
  /** 저장형 필살기 (C.17, GDD 14-6) */
  storedGaugePerBlock: number;
  storedChainBonus: readonly number[];
  storedGaugeMax: number;
  storedChargesMax: number;
  storedPowerInAttacks: number;
  storedGuardSeconds: number;
  storedStartGaugeMax: number;
  /** 전투 시작 저장 게이지 (둥지 애착: 안정 수치에 비례, storedStartGaugeOf). 0 = 없음 */
  storedStartGauge: number;
  /** 공허 블록 1개 사용 → 리스크 게이지 상승량 (BALANCE.provisional.risk.perVoidBlock) */
  riskPerVoidBlock: number;
  /** 장착 흡수 skill 특성 블록 생성원(슬롯 순서). 기본 블록 5종은 이것과 상관없이 늘 풀에 있다 (GDD 44장) */
  skills: CombatSkill[];
  /** passive: 기본 공격 위력·속도 배율 */
  attackPowerMultiplier: number;
  attackSpeedMultiplier: number;
  /** passive·환경(결계): 받는 피해 배율 */
  damageTakenMultiplier: number;
  /** 환경(황무지): 내 공격 위력 전체 배율 */
  playerPowerMultiplier: number;
  /** 환경(안개): 이 간격(초)마다 블록 바의 순서가 섞인다. 0 = 없음 */
  trayShuffleSeconds: number;
  /** 컨디션·환경(폐가)·5바퀴 이후·한계 돌파: 공허 블록 생성 확률 가산 */
  voidChanceBonus: number;
  /** 해방 (GDD 22-2·22-5): 이 전투에서 해방할 수 있는가 — 수련 완료·등급 이력·5단계 이상은 부르는 쪽(game.liberationAccess)이 정한다. false 면 게이지만 차고 쓸 수 없다 */
  liberationEnabled: boolean;
  /** 해방 블록의 공격 분류 (진화체 분류, 없으면 혼합). 속성은 내 캐릭터 속성 */
  liberationCategory: AttackCategory;
  /** 해방 수치 (BALANCE.provisional.liberation): 게이지 = 준 피해 ÷ (적 최대 체력 × 비율), 지속·능력치 배율, 블록 수·위력(기본 공격 N회분), 끝날 때 리스크 */
  liberationGaugeFraction: number;
  liberationSeconds: number;
  liberationStatMultiplier: number;
  liberationBlocks: number;
  liberationPowerInAttacks: number;
  liberationRisk: number;
  /** 원정 이벤트·시너지 (GDD 25-5, C.57): 전투 시작 체력 비율(함정), 시작 보호막 = 최대 체력 × 비율(성역·갈림길 — 받는 피해를 먼저 막는다), 적이 먼저 공격(매복) */
  playerStartHpFraction: number;
  startShieldFraction: number;
  enemyFirstStrike: boolean;
  /** 치명타 (C.63, GDD 28장 5번): 내 확률(기본 + 특성 critChance 합, 상한 critChanceMax), 치명 피해 배율, 적 확률. 공허 블록·반사·독 지속 피해 제외 */
  critChance: number;
  critMultiplier: number;
  enemyCritChance: number;
  critChanceMax: number;
  /** 진화체 특성 효과 (C.89, GDD 39장): 진화체 label 에서 계산한 효과 종류별 값 (src/engine/evolution/formAbilities.ts). 비면 효과 없음 */
  abilityEffects: AbilityEffects;
  /** 속성 피해 (C.101, GDD 48장): 속성 id(노멀 + 기본 원소) → %. 없는 칸은 0. 값은 elementDamageOf(출처 합)가 정한다 */
  elementDamage: Record<string, number>;
  /** 물공 특수 블록 (GDD 49장, C.103): 있으면 기본 공격 블록 3계열이 전부 이 속성 물공 블록(효과 포함)이 된다. 없으면 보통 기본 블록 */
  physBlock: PhysBlock | null;
}

/** 물공 특수 블록 (GDD 49장·49-1 2번): 계열은 블록마다 그대로, 이름·속성·효과만 바뀐다. 수치는 BALANCE.provisional.physBlocks 에서 formAbilities 가 채운다 */
export type PhysBlock = { element: string; power: number } & (
  /** 흙: 사용 후 seconds 동안 받는 피해 −takenReduction, 그동안 맞을 때마다 다음 평타 +perHit(최대 max, 평타 한 번에 다 씀) */
  | { effect: 'stoneStance'; seconds: number; takenReduction: number; perHit: number; max: number }
  /** 혈: 다음 평타 hits 회 +bonus, 적이 seconds 동안 공격·행동 못 함 */
  | { effect: 'knockback'; hits: number; bonus: number; seconds: number }
  /** 불: 약한 불 공격 블록 (쌓아 두는 용, 특성 emberStack 이 센다) */
  | { effect: 'ember' }
  /** 물: 사용 후 seconds 동안 평타 간격 −haste */
  | { effect: 'wave'; seconds: number; haste: number }
  /** 뇌: 다음 평타 hits 회는 두 번 때림(각 each) */
  | { effect: 'flash'; hits: number; each: number }
  /** 노멀: 쓰는 순간 평타 1회가 바로 나가고 평타 타이머는 처음부터 */
  | { effect: 'shout' });

/** 이 공격에 붙은 속성 피해: 받은 칸(속성 id들, 융합이면 2개)·합친 % (전투 로그 표시용) */
export interface ElemHit {
  ids: string[];
  pct: number;
}

/** 속성 피해 칸 (GDD 48장 1번): 무속성(노멀) + 기본 원소. 특수 속성은 칸이 없다 */
export const ELEMENT_DAMAGE_IDS: readonly string[] = [NORMAL_ELEMENT, ...ELEMENTAL_IDS];

/** 속성 피해 5종 모두 0 */
export function zeroElementDamage(): Record<string, number> {
  return Object.fromEntries(ELEMENT_DAMAGE_IDS.map((id) => [id, 0]));
}

/** 이 공격이 받는 속성 피해 (GDD 48장 2·7번): 속성이 없으면 무속성(노멀) 칸. 특수 속성은 어느 칸도 받지 않는다.
 *  융합(속성 2개)은 각 속성 값의 1/2 씩 더한다(속성 N개 = 각 1/N). 받을 칸이 없거나 합이 0 이면 null */
export function elementDamageBonus(p: Pick<CombatParams, 'elementDamage'>, elements: readonly string[]): ElemHit | null {
  const els = elements.length > 0 ? elements : [NORMAL_ELEMENT];
  const ids = els.filter((id) => ELEMENT_DAMAGE_IDS.includes(id));
  const pct = ids.reduce((sum, id) => sum + (p.elementDamage?.[id] ?? 0) / els.length, 0);
  return ids.length > 0 && pct !== 0 ? { ids, pct } : null;
}

/** 진화체 특성 효과 종류 (C.89, GDD 39장). 엔진은 진화체·종족을 모르고 효과 종류만 안다. 값은 BALANCE.provisional.abilities × 세기 */
export interface AbilityEffects {
  /** 모든 블록 위력 +비율 (노멀 '균형') */
  blockPower?: number;
  /** 내 공격(블록·평타·필살 등)이 적 방어·정신력을 이 비율만큼 무시 (불 '작열', GDD 45장 3번) */
  ignoreDefense?: number;
  /** 받은 피해를 쌓아 최대 체력 × threshold 에 닿으면 쌓인 양 × ret 를 적에게 (흙 '되갚기') */
  thorns?: { threshold: number; ret: number };
  /** 기본 공격이 이 확률로 한 번 더 (뇌 '연타', 연타는 다시 연타 안 함) */
  doubleHit?: number;
  /** 체력 비율이 낮을수록 주는 피해 ↑, fullAt 이하에서 +max (혈 '피의 갈증') */
  bloodlust?: { max: number; fullAt: number };
  /** 전투 everySeconds 마다 주는 피해 +per (최대 +max) — 부식(독)·억눌린 힘(억제) */
  corrode?: { per: number; everySeconds: number; max: number };
  rampUp?: { per: number; everySeconds: number; max: number };
  /** 체인 N 을 쓰면 다음 블록이 생성 간격 × perChain × (N−1) 만큼 빨리 (허 '연쇄') */
  chainHaste?: number;
  /** 상성 불리(내 공격 약함·적 공격 강함)를 ×1 로 (완전형 '완성') */
  noWeak?: boolean;
  /** 체력 below 아래에서 주는 피해 +bonus (한계 '한계 돌파') */
  desperate?: { below: number; bonus: number };
  /** 강적·보스에게 주는 피해 +비율 (사냥꾼) */
  eliteSlayer?: number;
  /** 전투마다 1번, 쓰러질 때 최대 체력 × 이 비율로 버틴다 (환생 '다시 일어남') */
  lastStand?: number;
  // ── 물공 특성 (GDD 49장, C.103) — 모두 평타 쪽 ──
  /** 되갚기가 터지면 다음 평타 hits 회 피해 +bonus (흙 '굳은 주먹') */
  hardFist?: { hits: number; bonus: number };
  /** 넉백 중인 적에게 평타 흡혈 ×이 배율 (혈 '피 냄새') */
  bloodScent?: number;
  /** 블록 바에 쌓인 element 공격 블록 1개당 평타 피해 +per (최대 +max) (불 '불씨 모으기') */
  emberStack?: { element: string; per: number; max: number };
  /** 평타가 연속으로 맞을 때마다 평타 피해 +per (최대 +max), 내가 맞으면 0 (물 '물살') */
  current?: { per: number; max: number };
  /** 평타 이 횟수마다 블록 1개가 바로 생긴다 (뇌 '충전') */
  charge?: number;
  /** 스킬 블록 1개를 쓸 때마다 이번 전투 평타 피해 +per (최대 +max) (노멀 '단련') */
  tempering?: { per: number; max: number };
}

/** 화면 글자가 뜨는 특성·물공 블록 발동 (런 로그 abilityProcs 키) */
export type AbilityProc = 'doubleHit' | 'thorns' | 'lastStand' | 'chainHaste' | PhysBlockEffect | PhysAbilityEffect;

export function defaultCombatParams(): CombatParams {
  return {
    ...CX,
    blockPool: BP as unknown as BlockPoolParams,
    dispositions: [],
    strongMultiplier: BALANCE.elements.strong,
    weakMultiplier: BALANCE.elements.weak,
    stabMultiplier: BALANCE.elements.stab,
    drainFraction: EL.drainFraction,
    drainCapFraction: EL.drainCapFraction,
    poisonFraction: EL.poisonFraction,
    poisonSeconds: EL.poisonSeconds,
    refStat: BALANCE.provisional.stats.tierTotals[0]! / STAT_IDS.length,
    playerRefStat: BALANCE.provisional.stats.tierTotals[0]! / STAT_IDS.length,
    playerElements: [NORMAL_ELEMENT],
    blockSpawnMultiplier: 1,
    categoryPower: { physical: 1, special: 1, mixed: 1 },
    categoryTaken: { physical: 1, special: 1, mixed: 1 },
    families: {},
    combos: [],
    riskPerVoidBlock: BALANCE.provisional.risk.perVoidBlock,
    storedStartGauge: 0,
    skills: [],
    attackPowerMultiplier: 1,
    attackSpeedMultiplier: 1,
    damageTakenMultiplier: 1,
    playerPowerMultiplier: 1,
    trayShuffleSeconds: 0,
    voidChanceBonus: 0,
    playerStartHpFraction: 1,
    startShieldFraction: 0,
    enemyFirstStrike: false,
    liberationEnabled: false,
    liberationCategory: 'mixed',
    liberationGaugeFraction: LB.gaugeEnemyHpFraction,
    liberationSeconds: LB.seconds,
    liberationStatMultiplier: LB.statMultiplier,
    liberationBlocks: LB.blocks,
    liberationPowerInAttacks: CX.basicBlockPowerInAttacks * LB.blockPowerMultiplier,
    liberationRisk: LB.riskOnEnd,
    abilityEffects: {},
    elementDamage: zeroElementDamage(),
    physBlock: null,
  };
}

/** 엔진이 받는 입력 (GDD 3-5, 17-2: 블록 순서는 바꿀 수 없다 — 나온 순서대로 쓴다).
 *  use: 바의 cell 번째 블록 클릭 — 붙어 있는 같은 계열 공격 블록(막기·회복·기본 블록은 같은 특성)이 함께 발동해 체인이 된다 (GDD 17-3).
 *  stored: 저장형 필살기 사용 (충전 1개 소모, GDD 14-6).
 *  liberate: 해방 (GDD 22-5, 전투당 1회 · 게이지가 차고 자격이 있을 때만). */
export type CombatInput =
  | { type: 'use'; cell: number }
  | { type: 'stored' }
  | { type: 'liberate' };

export type CombatStatus = 'playing' | 'won' | 'lost';

export interface Finisher {
  kind: FinisherKind;
  traitId: string | null;
  /** 마무리 일격 블록의 속성 (속성 없는 공격은 null) */
  element: string | null;
  /** 마무리 일격 블록의 계열 (계열 없는 블록은 null) */
  family?: string | null;
  /** 마무리 일격이 흡수 조건을 채우는 우위 공격이었는가 (GDD 20-2: 상성 우위, 약점 없는 적은 아무 스킬 블록) */
  weak?: boolean;
  /** 마무리 일격의 상성 */
  matchup?: Matchup;
}

/** 화면 연출용 사건. 화면이 drainCombatEvents 로 비우며 그린다 */
export type CombatEvent =
  | { kind: 'player-attack'; damage: number; matchup: Matchup; crit?: boolean; elem?: ElemHit }
  | { kind: 'enemy-attack'; damage: number; guarded: boolean; matchup: Matchup; crit?: boolean }
  | { kind: 'block'; block: Block['kind']; traitId: string | null; family: string | null; element: string | null; matchup: Matchup; role: SkillRole | null; chain: number; damage: number; weak: boolean; heal: number; guardSeconds: number; bonus: ChainBonusKind | null; crit?: boolean; elem?: ElemHit }
  | { kind: 'heavy-cast'; seconds: number }
  | { kind: 'heavy-hit'; damage: number; guarded: boolean; reflected: number; matchup: Matchup; crit?: boolean }
  /** 독 지속 피해 한 번 (GDD 20-2) */
  | { kind: 'dot'; target: 'enemy' | 'player'; damage: number }
  /** 혈 흡혈 회복 (GDD 20-2) */
  | { kind: 'drain'; target: 'enemy' | 'player'; heal: number }
  | { kind: 'seal'; seconds: number }
  | { kind: 'stance'; seconds: number }
  | { kind: 'stance-end' }
  | { kind: 'counter'; damage: number; guarded: boolean; matchup: Matchup; crit?: boolean }
  | { kind: 'stored-use'; damage: number; guardSeconds: number; charges: number; crit?: boolean; elem?: ElemHit }
  | { kind: 'stored-ready'; charges: number }
  | { kind: 'spawn'; index: number; block: Block['kind'] }
  /** 콤보 발동: 콤보 블록이 바 맨 오른쪽에 생겼다 (GDD 17-3) */
  | { kind: 'combo'; comboId: string }
  | { kind: 'shuffle' }
  /** 해방 시작 (GDD 22-5): 지속 초, 바에 넣은 해방 블록 수 */
  | { kind: 'liberate'; seconds: number; blocks: number }
  /** 해방이 풀렸다: 리스크 게이지 상승량 */
  | { kind: 'liberation-end'; risk: number }
  /** 보스 페이즈가 바뀌었다 (GDD 25-3): 새 페이즈 번호(2부터) */
  | { kind: 'boss-phase'; phase: number }
  /** 진화체 특성 발동 (C.89, GDD 39장 5번): 연타·되갚기·다시 일어남·연쇄. damage = 그 발동이 준 피해(없으면 0) */
  | { kind: 'ability'; effect: AbilityProc; damage: number }
  /** 보스 기믹 칸 봉인: 봉인된 블록 uid 와 시간 */
  | { kind: 'cell-seal'; uid: number; seconds: number }
  /** 보스 기믹 summon (GDD 35장): 졸개가 보스 앞에 섰다(체력) / 졸개의 작은 공격 / 졸개가 쓰러졌다 */
  | { kind: 'boss-summon'; hp: number }
  | { kind: 'minion-attack'; damage: number; guarded: boolean }
  | { kind: 'minion-down' }
  /** 보스 기믹 element (GDD 35장): 페이즈가 바뀌며 보스 속성이 바뀌었다 */
  | { kind: 'boss-element'; element: string }
  | { kind: 'end'; status: CombatStatus };

export interface CombatState {
  seed: number;
  params: CombatParams;
  rng: Rng;
  /** 치명타 판정 전용 난수 (C.63): 다른 난수(적 피해 흔들림·공허·봉인) 순서를 바꾸지 않게 따로 돈다. 옛 상태(없음)는 시드에서 만든다 */
  critRng?: Rng;
  /** 이 전투의 치명타 횟수: 내 공격 / 적 공격 (C.63, 전투 기록) */
  crits?: number;
  enemyCrits?: number;
  /** 특성 난수 (C.89, 연타): 주 난수·치명타 난수와 다른 수열 — 특성이 없으면 쓰지 않는다 */
  abilityRng?: Rng;
  /** 특성 발동 횟수 (런 로그) */
  abilityProcs?: Partial<Record<AbilityProc, number>>;
  /** 되갚기로 쌓인 받은 피해 */
  thornsStored?: number;
  /** 다시 일어남을 이 전투에서 썼는가 */
  lastStandUsed?: boolean;
  // ── 물공 블록·특성 상태 (GDD 49장, C.103) — 없으면 0/없음 ──
  /** 다음 평타 n회 피해 버프들 (혈 블록·굳은 주먹). 평타마다 hits 가 1 줄고 0 이면 빠진다 */
  basicBuffs?: { hits: number; bonus: number }[];
  /** 남은 두 번 때림 평타 수 (뇌 블록) */
  flashHits?: number;
  /** 평타 간격 버프: 남은 틱, 줄이는 비율 (물 블록) */
  basicHaste?: { ticks: number; haste: number };
  /** 넉백: 적이 공격·행동 못 하는 남은 틱 (혈 블록) */
  knockbackTicks?: number;
  /** 바위 자세: 남은 틱, 맞아서 쌓인 다음 평타 보너스 (흙 블록) */
  stoneStance?: { ticks: number; stacked: number };
  /** 물살: 연속으로 맞은 평타 수 */
  currentHits?: number;
  /** 단련: 이번 전투에 쓴 스킬 블록 수 */
  temperingBlocks?: number;
  /** 충전: 지금까지 평타 수 */
  basicCount?: number;
  /** 지난 틱 수 (전투 시간 = tick × tickSeconds) */
  tick: number;
  status: CombatStatus;
  lossReason: 'hp' | 'timeout' | null;
  enemy: {
    def: EnemyDef;
    hp: number;
    maxHp: number;
    /** 다음 기본 공격까지 남은 틱 */
    attackTimer: number;
    /** 다음 특수 행동(강공격·봉인·방어 자세)까지 남은 틱 (특수 행동이 있는 패턴만) */
    actionTimer: number;
    /** 다음 특수 행동이 패턴 순서의 몇 번째인가 */
    actionIndex: number;
    /** 강공격 시전(예고) 중이면 남은 틱. hitsLeft = 이 시전 뒤에 이어질 연속 강공격 수 */
    cast: { ticks: number; total: number; hitsLeft: number } | null;
    /** 적 능력치 = 기준 능력치 × 성향 (GDD 20-3) */
    stats: Stats;
    /** 독 지속 피해: 남은 틱과 틱당 피해 */
    dot: Dot | null;
    /** 방어 자세 중이면 남은 틱: 내 블록 피해가 줄고, 블록을 쓸 때마다 반격을 받는다 */
    stance: { ticks: number } | null;
    /** 이 전투에서 흡혈로 되찾은 체력 합계 (상한 drainCapFraction, C.53) */
    drained?: number;
  };
  /** shield: 남은 보호막 (GDD 25-5 성역·갈림길, 없으면 0) */
  player: { hp: number; maxHp: number; attackTimer: number; stats: Stats; dot: Dot | null; drained?: number; shield?: number };
  tray: Tray;
  nextUid: number;
  /** 다음 블록 생성까지 남은 틱: [흡수 특성마다(슬롯 순서)…, 기본 블록] (GDD 44-1 B안) */
  spawnTimers: number[];
  voidTimer: number;
  shuffleTimer: number;
  sp: number;
  /** 저장 게이지(0~storedGaugeMax 미만)와 충전 개수 (전투 안에서만 유효, GDD 14-6) */
  storedGauge: number;
  storedCharges: number;
  storedUsed: number;
  /** 충전이 상한이라 버려진 게이지 합계 */
  storedWasted: number;
  /** 봉인: 남은 틱 동안 스킬 블록 생성 정지 */
  sealTicks: number;
  /** 막기 상태: 남은 틱, 그 막기에 붙은 반사 배율 */
  guard: { ticks: number; reflect: number };
  // ── 기록 (BattleRecord) ──
  skillsUsed: string[];
  blocksByTrait: Record<string, number>;
  blocksByChain: [number, number, number];
  /** 계열별 체인 발동 횟수: 계열 id → [체인1, 체인2, 체인3] (계열 있는 공격 블록만, GDD 17-3) */
  chainsByFamily: Record<string, [number, number, number]>;
  chain3Count: number;
  /** 콤보 규칙별 지금까지 이어진 연속 횟수 (다른 블록을 쓰면 0). 콤보 id → 횟수 */
  comboStreaks: Record<string, number>;
  /** 콤보 발동(특수 블록 생성) 횟수와 콤보 블록 사용 횟수 (GDD 17-3) */
  combosTriggered: number;
  comboBlocksUsed: number;
  /** 우위(상성 우위, 약점 없는 적은 아무 스킬) 블록으로 발동한 체인3 횟수 (흡수 조건, GDD 3-5 v0.7 → 20-2) */
  weakChain3Count: number;
  guardSuccesses: number;
  voidUsed: number;
  specialUsed: boolean;
  /** 공허 블록 사용으로 오른 리스크 게이지 값 */
  riskGained: number;
  finisher: Finisher | null;
  /** 해방 (GDD 22-5): 게이지(0~100), 쓴 틱(전투당 1회), 남은 지속 틱, 쓰기 전 능력치·최대 체력(풀릴 때 되돌린다), 끝날 때 오른 리스크 */
  liberation: LiberationState;
  /** 보스전이면 페이즈·기믹 상태 (GDD 25-3), 일반 전투는 없음 */
  boss?: BossState;
  /** 받아들여진 입력 기록 (같은 시드로 다시 돌리면 같은 결과) */
  inputs: { tick: number; input: CombatInput }[];
  events: CombatEvent[];
}

export interface LiberationState {
  gauge: number;
  usedAtTick: number | null;
  ticksLeft: number;
  base: { stats: Stats; maxHp: number } | null;
  /** 해방이 끝나며 오른 리스크 게이지 (안 썼으면 0). 원정·둥지가 전투 뒤에 반영한다 */
  risk: number;
}

export interface Dot {
  ticks: number;
  perTick: number;
}

export interface CombatSetup {
  enemy: EnemyDef;
  params?: Partial<CombatParams>;
  /** 보스전 (GDD 25-3, C.58): 페이즈·기믹·시간 제한. 없으면 일반 전투 */
  boss?: BossSetup;
}

/** 보스전 재료 (보스 데이터 + BALANCE.provisional.boss): 엔진은 보스 id 로 분기하지 않고 페이즈 구간·기믹 종류만 읽는다 */
export interface BossSetup {
  id: string;
  /** 2페이즈부터: 적 체력이 최대 체력 × belowHpFraction 이하가 되면 그 페이즈로, 기본 공격 간격 × attackSecondsMult */
  phases: { belowHpFraction: number; attackSecondsMult: number }[];
  /** 기믹 종류: seal·summon·element 를 엔진이 처리한다 (reflect 는 종류 자리) */
  gimmick: 'seal' | 'summon' | 'element' | 'reflect';
  /** seal: 이 간격(초)마다 블록 바의 블록 cells 칸을 seconds 초 동안 봉인 */
  sealEverySeconds: number;
  sealSeconds: number;
  sealCells: number;
  /** summon: everySeconds 마다 졸개 1마리(이미 있으면 건너뜀). 졸개 = 내 피해를 먼저 받는 방패(체력 기본 공격 hpInAttacks 회분), attackSeconds 마다 기본 공격 attackInAttacks 회분 */
  summon?: { everySeconds: number; hpInAttacks: number; attackSeconds: number; attackInAttacks: number };
  /** element: 2페이즈부터 페이즈마다 바뀌는 보스 속성 (phases 와 같은 순서·길이) */
  elementShifts?: string[];
  /** 시간 제한(초): 넘기면 패배 */
  timeLimitSeconds: number;
}

/** 보스전 상태: 지금 페이즈(1부터), 기본 공격 간격 배율, 다음 기믹까지 남은 틱, 봉인한 블록 수 (런 로그) */
export interface BossState {
  setup: BossSetup;
  phase: number;
  attackMult: number;
  gimmickTimer: number;
  seals: number;
  /** summon: 지금 보스 앞의 졸개(없으면 null)와 부른 수·쓰러뜨린 수 */
  minion?: { hp: number; maxHp: number; attackTimer: number } | null;
  summons?: number;
  minionKills?: number;
}

/** 첫 기믹까지의 간격(초): 기믹 종류마다 */
function gimmickEverySeconds(b: BossSetup): number {
  return b.gimmick === 'summon' && b.summon ? b.summon.everySeconds : b.sealEverySeconds;
}

export function ticksOf(p: CombatParams, seconds: number): number {
  return Math.max(1, Math.round(seconds / p.tickSeconds));
}

export function maxChain(p: CombatParams): number {
  const top = p.chainMultipliers.length;
  return Math.max(1, Math.min(top, Math.floor(p.maxChain ?? top)));
}

/** 기본 블록 5종의 생성원 (GDD 44장): 공격(계열은 블록마다 풀이 정한다)·막기·회복. 막기·회복 세기 = 같은 역할 흡수 특성 기본값 × 비율 */
export function basicSources(p: CombatParams): CombatSkill[] {
  const bp = p.blockPool;
  // 물공 특수 블록 (GDD 49-1 2번): 기본 공격 블록 3계열 전부 = 그 속성 · 물리 분류 · 표의 피해 배율. 계열(체인)·막기·회복은 그대로
  const pb = p.physBlock;
  const attack: CombatSkill = pb
    ? { id: BASIC_SKILL_ID, element: pb.element, category: 'physical', family: null, role: 'attack', powerInAttacks: p.basicBlockPowerInAttacks, chainBonus: p.basicBlockChainBonus, powerMultiplier: pb.power }
    : { id: BASIC_SKILL_ID, element: null, category: 'mixed', family: null, role: 'attack', powerInAttacks: p.basicBlockPowerInAttacks, chainBonus: p.basicBlockChainBonus, powerMultiplier: 1 };
  return [
    attack,
    { id: BASIC_GUARD_ID, element: null, category: 'mixed', family: null, role: 'guard', powerInAttacks: bp.basicRoleBlocks.guard.powerInAttacks, chainBonus: { ...bp.basicRoleBlocks.guard.chainBonus }, powerMultiplier: bp.basicGuardRatio },
    { id: BASIC_HEAL_ID, element: null, category: 'mixed', family: null, role: 'heal', powerInAttacks: bp.basicRoleBlocks.heal.powerInAttacks, chainBonus: { ...bp.basicRoleBlocks.heal.chainBonus }, powerMultiplier: bp.basicHealRatio },
  ];
}

/** 블록 생성원: 장착 흡수 skill 특성들 + 기본 블록 5종(공격·막기·회복 생성원 3개) */
export function blockSources(p: CombatParams): CombatSkill[] {
  return [...p.skills, ...basicSources(p)];
}

/** 성향 특성 보정 곱 (GDD 44장 4번, 44-1): 기본 블록 가중 배율과 흡수 타이머 속도 배율 */
function temperamentOf(p: CombatParams): { attack: number; guard: number; heal: number; absorbedSpawn: number } {
  const m = { attack: 1, guard: 1, heal: 1, absorbedSpawn: 1 };
  for (const d of p.dispositions) {
    const t = p.blockPool.temperament[d];
    if (!t) continue;
    m.attack *= t.attack ?? 1;
    m.guard *= t.guard ?? 1;
    m.heal *= t.heal ?? 1;
    m.absorbedSpawn *= t.absorbedSpawn ?? 1;
  }
  return m;
}

/** 흡수 특성 블록 생성 간격(초) (GDD 3-5, 44-1 B안 → 44-2): 특성마다 타이머. 장착 칸이 2칸부터 늘수록(absorbedSlowdownPerSlot)·같은 계열 공격 특성이 여럿이면(familySpawnSlowdown) 늘리고, 블록 가속·속도 성향 배율로 나눈다 */
export function spawnSecondsOf(p: CombatParams, src: CombatSkill): number {
  const slots = Math.max(0, p.skills.length - 1);
  const base = (p.blockSpawnSeconds * (1 + p.blockPool.absorbedSlowdownPerSlot * slots)) / p.blockSpawnMultiplier / temperamentOf(p).absorbedSpawn;
  if (!src.family) return base;
  const same = p.skills.filter((x) => x.family === src.family).length;
  return base * (1 + p.familySpawnSlowdown * (same - 1));
}

/** 칸 수별 기본 블록 몫 (GDD 44-2, 표 밖은 마지막 값) */
export function basicShareOf(p: CombatParams, slots: number = p.skills.length): number {
  const t = p.blockPool.basicShareBySlots;
  return t[Math.min(slots, t.length - 1)] ?? 1;
}

/**
 * 기본 블록 타이머 간격(초) (GDD 44-1 B안 → 44-3, C.98): 흡수 0칸이면 basicSpawnSeconds. 흡수 칸이 있으면
 * 흡수 블록 총 간격(특성마다 blockSpawnSeconds × 칸 보정, 성향·같은 계열 겹침은 빼고) × (1 − 기본 몫) / 기본 몫 → 기본 몫이 표대로 나온다.
 * 블록 가속 배율로 나눈다
 */
export function basicSpawnSecondsOf(p: CombatParams): number {
  const bp = p.blockPool;
  const n = p.skills.length;
  if (n === 0) return bp.basicSpawnSeconds / p.blockSpawnMultiplier;
  const share = Math.min(0.999, Math.max(0.001, basicShareOf(p)));
  const absorbedTotalSeconds = (p.blockSpawnSeconds * (1 + bp.absorbedSlowdownPerSlot * (n - 1))) / n;
  return (absorbedTotalSeconds * (1 - share)) / share / p.blockSpawnMultiplier;
}

/**
 * 기본 블록 풀 (GDD 44장 2·4번): 기본 타이머가 블록을 낼 때 이 확률로 하나를 뽑는다 (합 1). 가중 = 공격 계열마다·막기·회복 × 성향 보정.
 * 기본 공격은 종족 계열 표(params.families)의 계열마다 한 칸 — 계열 표가 없으면 계열 없는 한 칸(가중 = 공격 가중 × 3)
 */
export function blockPoolOf(p: CombatParams): PoolEntry[] {
  const bp = p.blockPool;
  const mult = temperamentOf(p);
  const [atk, guard, heal] = basicSources(p);
  const fams = Object.keys(p.families);
  const BASIC_FAMILY_COUNT = 3;
  const basic: { source: CombatSkill; family: string | null; w: number }[] = [
    ...(fams.length > 0
      ? fams.map((f) => ({ source: atk!, family: f, w: bp.basicWeights.attack * mult.attack }))
      : [{ source: atk!, family: null, w: bp.basicWeights.attack * BASIC_FAMILY_COUNT * mult.attack }]),
    { source: guard!, family: null, w: bp.basicWeights.guard * mult.guard },
    { source: heal!, family: null, w: bp.basicWeights.heal * mult.heal },
  ];
  const total = basic.reduce((a, x) => a + x.w, 0);
  return basic.map((x) => ({ source: x.source, family: x.family, chance: total > 0 ? x.w / total : 0 }));
}

/** 초당 블록 생성 기대치 (바가 차거나 봉인되지 않을 때): 흡수 특성 블록 합 / 기본 블록. 44-1 비율 표·테스트용 */
export function spawnRatesOf(p: CombatParams): { absorbed: number; basic: number; absorbedShare: number } {
  const absorbed = p.skills.reduce((a, src) => a + 1 / spawnSecondsOf(p, src), 0);
  const basic = 1 / basicSpawnSecondsOf(p);
  return { absorbed, basic, absorbedShare: absorbed / (absorbed + basic) };
}

/** 기본 블록 풀에서 하나를 뽑는다 (전투 난수) */
function drawBasic(s: CombatState): PoolEntry | null {
  const pool = blockPoolOf(s.params);
  let r = nextFloat(s.rng);
  for (const e of pool) {
    if (r < e.chance) return e;
    r -= e.chance;
  }
  return pool[pool.length - 1] ?? null;
}

/** 생성 타이머들의 간격(초): [흡수 특성마다…, 기본 블록] (spawnTimers 와 같은 순서) */
function timerSecondsOf(p: CombatParams): number[] {
  return [...p.skills.map((src) => spawnSecondsOf(p, src)), basicSpawnSecondsOf(p)];
}

// ── 능력치·상성 (GDD 20-1~20-3) ──

export function uniformStats(v: number): Stats {
  return { hp: v, atk: v, int: v, def: v, spr: v, spd: v };
}

/** 내 능력치: 주어진 값, 없으면 모두 세계 기준 능력치 (1단계 기준 몸) */
export function playerStatsOf(p: Pick<CombatParams, 'playerStats' | 'playerRefStat'>): Stats {
  return p.playerStats ?? uniformStats(p.playerRefStat);
}

/** 적 능력치 = 난이도 기준 능력치 × 적 성향 (없는 능력치는 ×1) */
export function enemyStatsOf(p: Pick<CombatParams, 'refStat'>, enemy: EnemyDef): Stats {
  const out = uniformStats(p.refStat);
  for (const k of STAT_IDS) out[k] *= enemy.statBias?.[k] ?? 1;
  return out;
}

/** 공격 분류가 쓰는 공격 능력치: 물리 = 힘, 특수 = 지능, 혼합 = 둘의 평균 */
export function offenseStat(st: Stats, cat: AttackCategory): number {
  return cat === 'physical' ? st.atk : cat === 'special' ? st.int : (st.atk + st.int) / 2;
}

/** 공격 분류를 막는 방어 능력치: 물리 = 방어, 특수 = 정신력, 혼합 = 둘의 평균 */
export function defenseStat(st: Stats, cat: AttackCategory): number {
  return cat === 'physical' ? st.def : cat === 'special' ? st.spr : (st.def + st.spr) / 2;
}

/** 피해 능력치 비 = 공격 능력치 ÷ (상대 방어 능력치 × (1 − 무시 비율)). 무시 = 불 속성 특성 '작열' (GDD 45장 3번, 허의 방어 무시는 5번에서 삭제) */
export function statRatio(att: Stats, def: Stats, cat: AttackCategory, ignore = 0): number {
  return offenseStat(att, cat) / Math.max(1e-6, defenseStat(def, cat) * (1 - ignore));
}

export function matchupMultiplier(p: Pick<CombatParams, 'strongMultiplier' | 'weakMultiplier'>, m: Matchup): number {
  return m === 'strong' ? p.strongMultiplier : m === 'weak' ? p.weakMultiplier : 1;
}

/** 특수 속성 효과가 있는가 */
function hasEffect(elements: readonly string[], effect: 'drain' | 'poison'): boolean {
  return elements.some((e) => getElement(e).effect === effect);
}


/** 적의 속성 (목록) */
export function enemyElements(def: EnemyDef): string[] {
  return [def.element];
}

/** 내 자동 기본 공격 간격(초): 기본 간격 ÷ 패시브 배율 × (세계 기준 능력치 ÷ 속도) (GDD 20-3 v3.6: 속도는 평타 간격만, 32-1: 기준은 고정) */
export function playerAttackSecondsOf(p: CombatParams): number {
  return (p.playerAttackSeconds / p.attackSpeedMultiplier) * (p.playerRefStat / playerStatsOf(p).spd);
}

// ── 해방 (GDD 22-2·22-5) ──

/** 해방 게이지 상한 */
export const LIBERATION_GAUGE_MAX = LB.gaugeMax;

/** 해방 중인가 */
export function liberationActive(s: CombatState): boolean {
  return s.liberation.ticksLeft > 0;
}

/** 지금 해방할 수 있는가: 자격 + 게이지 가득 + 이 전투에서 아직 안 씀 */
export function canLiberate(s: CombatState): boolean {
  return s.status === 'playing' && s.params.liberationEnabled && s.liberation.usedAtTick === null && s.liberation.gauge >= LIBERATION_GAUGE_MAX;
}

/** 해방을 쓴 시각(초), 안 썼으면 null (런 로그) */
export function liberationUsedAt(s: CombatState): number | null {
  return s.liberation.usedAtTick === null ? null : Math.round(s.liberation.usedAtTick * s.params.tickSeconds * 10) / 10;
}

/** 지금 내 평타 간격: 해방 중이면 속도가 오른 만큼 짧다 */
function currentAttackSeconds(s: CombatState): number {
  const haste = s.basicHaste && s.basicHaste.ticks > 0 ? 1 - s.basicHaste.haste : 1;
  return (playerAttackSecondsOf(s.params) / (liberationActive(s) ? s.params.liberationStatMultiplier : 1)) * haste;
}

export function comboOf(p: CombatParams, id: string | null): ComboRule | undefined {
  return p.combos.find((c) => c.id === id);
}

export function sourceOf(p: CombatParams, traitId: string | null): CombatSkill | undefined {
  return blockSources(p).find((x) => x.id === traitId);
}

export function createCombat(seed: number, setup: CombatSetup): CombatState {
  const params: CombatParams = { ...defaultCombatParams(), ...setup.params, ...(setup.boss ? { timeLimitSeconds: setup.boss.timeLimitSeconds } : {}) };
  const t = (sec: number) => ticksOf(params, sec);
  // 적 체력 = 플레이어 기본 공격 N회 분량 (CLAUDE.md 규칙 3). 육성으로 공격력이 오르면 같이 오른다
  const maxHp = setup.enemy.hpInAttacks * params.hpAttackScale * params.playerAttackDamage * params.growthMultiplier;
  const pStats = playerStatsOf(params);
  // 내 체력 = 기본 체력 × (체력 ÷ 세계 기준 능력치) (GDD 20-3·32-1: 기준은 1단계 값으로 고정 — 진화하면 최대 체력이 실제로 커진다)
  const playerHp = params.playerMaxHp * (pStats.hp / params.playerRefStat);
  return {
    seed,
    params,
    rng: createRng(seed),
    critRng: createRng((seed ^ CRIT_SEED_SALT) >>> 0),
    crits: 0,
    enemyCrits: 0,
    tick: 0,
    status: 'playing',
    lossReason: null,
    enemy: {
      def: setup.enemy,
      hp: maxHp,
      maxHp,
      attackTimer: params.enemyFirstStrike ? 1 : t(enemyAttackSecondsOf(params, setup.enemy.pattern)),
      actionTimer: hasSpecialActions(setup.enemy.pattern) ? t(setup.enemy.pattern.everySeconds) : 0,
      actionIndex: 0,
      cast: null,
      stance: null,
      stats: enemyStatsOf(params, setup.enemy),
      dot: null,
    },
    player: {
      hp: playerHp * Math.min(1, Math.max(0.01, params.playerStartHpFraction)), maxHp: playerHp, attackTimer: t(playerAttackSecondsOf(params)), stats: pStats, dot: null,
      ...(params.startShieldFraction > 0 ? { shield: playerHp * params.startShieldFraction } : {}),
    },
    tray: [],
    nextUid: 1,
    // 흡수 특성마다 + 기본 블록 타이머 (GDD 44-1 B안). 생성 시점을 고르게 엇갈린다 (첫 블록은 간격의 절반 뒤)
    spawnTimers: timerSecondsOf(params).map((sec, i, all) => Math.max(1, Math.round((t(sec) * (i + 0.5)) / all.length))),
    voidTimer: t(params.voidCheckSeconds),
    shuffleTimer: params.trayShuffleSeconds > 0 ? t(params.trayShuffleSeconds) : 0,
    sp: 0,
    ...startStored(params),
    storedUsed: 0,
    storedWasted: 0,
    sealTicks: 0,
    guard: { ticks: 0, reflect: 0 },
    skillsUsed: [],
    blocksByTrait: {},
    blocksByChain: [0, 0, 0],
    chainsByFamily: {},
    chain3Count: 0,
    comboStreaks: {},
    combosTriggered: 0,
    comboBlocksUsed: 0,
    weakChain3Count: 0,
    guardSuccesses: 0,
    voidUsed: 0,
    specialUsed: false,
    riskGained: 0,
    finisher: null,
    liberation: { gauge: 0, usedAtTick: null, ticksLeft: 0, base: null, risk: 0 },
    ...(setup.boss ? { boss: { setup: { ...setup.boss, phases: setup.boss.phases.map((x) => ({ ...x })) }, phase: 1, attackMult: 1, gimmickTimer: t(gimmickEverySeconds(setup.boss)), seals: 0, ...(setup.boss.gimmick === 'summon' ? { minion: null, summons: 0, minionKills: 0 } : {}) } } : {}),
    inputs: [],
    events: [],
  };
}

/** 안정 수치(0~stabilityMax) → 전투 시작 저장 게이지 (0~storedStartGaugeMax, 비례) */
export function storedStartGaugeOf(stability: number): number {
  const max = BALANCE.provisional.risk.stabilityMax;
  return (Math.min(max, Math.max(0, stability)) / max) * CX.storedStartGaugeMax;
}

/** 시작 게이지를 게이지·충전으로 나눈다 (시작 게이지가 100 이상이어도 되게 충전 환산) */
function startStored(p: CombatParams): { storedGauge: number; storedCharges: number } {
  const total = Math.max(0, p.storedStartGauge);
  const charges = Math.min(p.storedChargesMax, Math.floor(total / p.storedGaugeMax));
  return { storedGauge: charges >= p.storedChargesMax ? 0 : total - charges * p.storedGaugeMax, storedCharges: charges };
}

export function elapsedSeconds(s: CombatState): number {
  return s.tick * s.params.tickSeconds;
}

export function timeLeftSeconds(s: CombatState): number {
  return Math.max(0, s.params.timeLimitSeconds - elapsedSeconds(s));
}

/** 공허 블록 생성 확률: 기본 + 컨디션·환경·바퀴·돌파 가산 (상한 있음) */
export function voidChanceOf(p: CombatParams): number {
  return Math.min(p.voidChanceMax, p.voidChance + p.voidChanceBonus);
}

/** 내 공격 1단위(기본 공격 1회) 피해: 육성·환경 반영 */
function unitDamage(p: CombatParams): number {
  return p.playerAttackDamage * p.growthMultiplier * p.playerPowerMultiplier;
}

/** 이 블록의 상성 (속성 없는 블록은 neutral) */
export function skillMatchup(s: CombatState, skill: CombatSkill): Matchup {
  return skill.element ? matchup([skill.element], enemyElements(s.enemy.def)) : 'neutral';
}

/** 흡수 조건을 채우는 우위 공격인가 (GDD 20-2, C.47): 상성 우위. 그 적에게 약점 속성이 아예 없으면(노멀·특수 속성 적) 아무 스킬 블록이나 우위로 친다 */
export function isEffective(s: CombatState, skill: CombatSkill): boolean {
  if (weaknessesOf(enemyElements(s.enemy.def)).length === 0) return !isBasicBlockId(skill.id);
  return skillMatchup(s, skill) === 'strong';
}

/** 내 공격의 상성·능력치 비·분류 배율을 곱한 배율 (속성 = 공격 속성 목록, 비면 상성 없음) */
function playerHitMultiplier(s: CombatState, elements: readonly string[], cat: AttackCategory): { mult: number; matchup: Matchup } {
  const p = s.params;
  const m = elements.length > 0 ? matchup(elements, enemyElements(s.enemy.def)) : 'neutral';
  const mm = m === 'weak' && p.abilityEffects.noWeak ? 1 : matchupMultiplier(p, m);
  return { mult: statRatio(s.player.stats, s.enemy.stats, cat, p.abilityEffects.ignoreDefense ?? 0) * mm * p.categoryPower[cat], matchup: m };
}

/** 계열 단계 기술(위력 배율·추가 효과): 종족 설정에서 온 계열 표가 있으면 그것, 없으면 체인 배율 + 특성의 체인 추가 효과 (chain = 1~3) */
export function tierEffect(p: CombatParams, skill: CombatSkill, chain: number): { multiplier: number; bonus: ChainBonus | null } {
  const fam = skill.family ? p.families[skill.family]?.tiers[chain - 1] : undefined;
  if (fam) return { multiplier: fam.multiplier, bonus: fam.bonus ?? null };
  return { multiplier: p.chainMultipliers[chain - 1] ?? 1, bonus: chain >= p.chainBonusFromChain ? skill.chainBonus : null };
}

/** 스킬 블록 위력 배율: 속성 보너스 × 단계 기술 배율(체인 배율을 이어받음) × 상성(강 ×1.2 / 약 ×0.85) × 자기 속성 보정 × 능력치 비 × 분류 배율.
 *  chain = 함께 발동하는 블록 수(1~3), 바에 있는 블록 하나만 볼 때는 1. weak = 흡수 조건의 우위 공격인가 */
export function blockEffect(s: CombatState, b: Block, chain = 1): { skill: CombatSkill; mult: number; weak: boolean; matchup: Matchup; stab: boolean } | null {
  if (b.kind !== 'skill') return null;
  const src = sourceOf(s.params, b.traitId);
  if (!src) return null;
  // 기본 블록은 블록마다 계열을 가진다 (GDD 20장 v5.4): 그 계열 단계 기술(특공)·체인 기록·콤보가 그 계열로 나간다. 위력(powerInAttacks)·분류·속성은 기본 블록 값
  const skill = src.id === BASIC_SKILL_ID && b.family && !src.family ? { ...src, family: b.family } : src;
  const hit = playerHitMultiplier(s, skill.element ? [skill.element] : [], skill.category);
  const stab = skill.element !== null && s.params.playerElements.includes(skill.element);
  const mult = skill.powerMultiplier * tierEffect(s.params, skill, chain).multiplier * hit.mult * (stab ? s.params.stabMultiplier : 1);
  return { skill, mult, weak: isEffective(s, skill), matchup: hit.matchup, stab };
}

/** 해방 블록 (GDD 22-5): 내 캐릭터 속성 · 진화체 분류의 큰 한 방. 상성·능력치 비·분류 배율·자기 속성 보정. weak = 흡수 조건의 우위 공격(스킬 블록과 같은 규칙) */
export function liberationHit(s: CombatState): { mult: number; matchup: Matchup; weak: boolean; element: string | null } {
  const p = s.params;
  const els = p.playerElements;
  const hit = playerHitMultiplier(s, els, p.liberationCategory);
  const weak = weaknessesOf(enemyElements(s.enemy.def)).length === 0 || hit.matchup === 'strong';
  return { mult: hit.mult * p.stabMultiplier, matchup: hit.matchup, weak, element: els[0] ?? null };
}

/** 속성 없는 큰 블록(필살·공허·콤보·저장 필살)의 능력치 비: 혼합 분류 */
function plainHitMultiplier(s: CombatState): number {
  return playerHitMultiplier(s, [], 'mixed').mult;
}

/** 이 블록을 지금 쓰면 줄 피해 (봇·화면 예고용) */
export function blockDamage(s: CombatState, b: Block, chain = 1): number {
  const p = s.params;
  const guardPose = stanceMultiplier(s);
  if (b.kind === 'special') return p.specialPowerInAttacks * unitDamage(p) * plainHitMultiplier(s) * guardPose;
  if (b.kind === 'void') return p.voidPowerInAttacks * unitDamage(p) * plainHitMultiplier(s) * guardPose;
  if (b.kind === 'combo') return (comboOf(p, b.traitId)?.powerInAttacks ?? 0) * unitDamage(p) * plainHitMultiplier(s) * guardPose;
  if (b.kind === 'liberation') return p.liberationPowerInAttacks * unitDamage(p) * liberationHit(s).mult * guardPose;
  const e = blockEffect(s, b, chain);
  return e ? e.skill.powerInAttacks * e.mult * unitDamage(p) * guardPose : 0;
}

/** 방어 자세 중이면 내 블록 피해 배율(<1), 아니면 1 */
export function stanceMultiplier(s: CombatState): number {
  const pat = s.enemy.def.pattern;
  return s.enemy.stance && pat?.kind === 'stance' ? pat.blockDamageMultiplier : 1;
}

/** 이 적의 기본 공격 간격(초): 패턴이 정하면(속공·단단) 그 값, 아니면 공통 값 */
export function enemyAttackSecondsOf(p: CombatParams, pattern: EnemyPattern | undefined): number {
  return pattern && 'attackSeconds' in pattern ? pattern.attackSeconds : p.enemyAttackSeconds;
}

/** 치명타 난수 시드 섞기 값 (주 난수와 다른 수열) */
const CRIT_SEED_SALT = 0x9e3779b9;
/** 특성 난수 시드 섞기 값 */
const ABILITY_SEED_SALT = 0x7f4a7c15;

/** 내 치명타 확률 (C.63): 기본 + 특성 합, 0 ~ 상한 */
export function critChanceOf(p: CombatParams): number {
  return Math.min(p.critChanceMax, Math.max(0, p.critChance));
}

/** 치명타 판정 한 번: 맞으면 횟수를 세고 true. 확률 0 이면 난수를 쓰지 않는다 */
function rollCrit(s: CombatState, who: 'player' | 'enemy'): boolean {
  const chance = who === 'player' ? critChanceOf(s.params) : Math.min(s.params.critChanceMax, Math.max(0, s.params.enemyCritChance));
  if (chance <= 0) return false;
  s.critRng ??= createRng((s.seed ^ CRIT_SEED_SALT) >>> 0);
  if (nextFloat(s.critRng) >= chance) return false;
  if (who === 'player') s.crits = (s.crits ?? 0) + 1;
  else s.enemyCrits = (s.enemyCrits ?? 0) + 1;
  return true;
}

/** 내 공격 피해에 치명타를 굴린다: 피해가 있을 때만 */
function playerCrit(s: CombatState, damage: number): { damage: number; crit: boolean } {
  if (damage <= 0 || !rollCrit(s, 'player')) return { damage, crit: false };
  return { damage: damage * s.params.critMultiplier, crit: true };
}

// ── 진화체 특성 (C.89, GDD 39장): 효과 종류별 공통 처리. 수치는 params.abilityEffects ──

/** 특성 발동 한 번 세기 + 화면 사건 */
function proc(s: CombatState, effect: AbilityProc, damage = 0): void {
  const m = (s.abilityProcs ??= {});
  m[effect] = (m[effect] ?? 0) + 1;
  emit(s, { kind: 'ability', effect, damage });
}

/** 시간이 갈수록 오르는 보너스: everySeconds 마다 +per, 최대 max */
function rampBonus(s: CombatState, r: { per: number; everySeconds: number; max: number } | undefined): number {
  return r ? Math.min(r.max, r.per * Math.floor(elapsedSeconds(s) / r.everySeconds)) : 0;
}

/** 특성이 내 공격 피해에 곱하는 배율 (피의 갈증·부식·억눌린 힘·한계 돌파·사냥꾼). block = 블록 공격이면 균형도 */
export function abilityPowerOf(s: CombatState, block: boolean): number {
  const a = s.params.abilityEffects;
  const hpRatio = s.player.hp / Math.max(1e-6, s.player.maxHp);
  let m = 1;
  if (block && a.blockPower) m *= 1 + a.blockPower;
  if (a.bloodlust) m *= 1 + a.bloodlust.max * Math.min(1, Math.max(0, (1 - hpRatio) / Math.max(1e-6, 1 - a.bloodlust.fullAt)));
  m *= 1 + rampBonus(s, a.corrode);
  m *= 1 + rampBonus(s, a.rampUp);
  if (a.desperate && hpRatio < a.desperate.below) m *= 1 + a.desperate.bonus;
  if (a.eliteSlayer && (s.enemy.def.class === 'elite' || s.boss)) m *= 1 + a.eliteSlayer;
  return m;
}

/** 내 공격 피해: 특성 배율 → 속성 피해(GDD 48장, elements = 공격 속성, 비면 무속성) → 치명타. 반사·독·공허 블록은 이 길을 지나지 않는다 */
function playerHit(s: CombatState, damage: number, block: boolean, elements: readonly string[]): { damage: number; crit: boolean; elem?: ElemHit } {
  const elem = elementDamageBonus(s.params, elements);
  const hit = playerCrit(s, damage * abilityPowerOf(s, block) * (elem ? 1 + elem.pct / 100 : 1));
  return elem ? { ...hit, elem } : hit;
}

/** 연쇄: 체인 N 을 쓰면 다음 블록이 간격 × perChain × (N−1) 만큼 빨리 */
function applyChainHaste(s: CombatState, chain: number): void {
  const h = s.params.abilityEffects.chainHaste;
  if (!h || chain < 2) return;
  const secs = timerSecondsOf(s.params);
  s.spawnTimers = s.spawnTimers.map((x, i) => Math.max(1, x - Math.round(ticksOf(s.params, secs[i] ?? secs[secs.length - 1]!) * h * (chain - 1))));
  proc(s, 'chainHaste');
}

/** 되갚기: 받은 피해를 쌓고, 최대 체력 × threshold 에 닿으면 쌓인 양 × ret 를 적에게 */
function applyThorns(s: CombatState, taken: number): void {
  const t = s.params.abilityEffects.thorns;
  if (!t || taken <= 0 || s.status !== 'playing') return;
  s.thornsStored = (s.thornsStored ?? 0) + taken;
  if (s.thornsStored < s.player.maxHp * t.threshold) return;
  const damage = s.thornsStored * t.ret;
  s.thornsStored = 0;
  proc(s, 'thorns', damage);
  dealDamage(s, damage, { kind: 'reflect', traitId: null, element: null });
  // 굳은 주먹 (GDD 49장 흙 특성): 되갚기가 터지면 다음 평타 n회 피해 +
  const hf = s.params.abilityEffects.hardFist;
  if (hf && s.status === 'playing') {
    (s.basicBuffs ??= []).push({ hits: hf.hits, bonus: hf.bonus });
    proc(s, 'hardFist');
  }
}

// ── 물공 블록·특성 (GDD 49장, C.103): 평타를 돕는 효과. 종족·진화체는 모르고 params.physBlock·abilityEffects 만 본다 ──

/** 바에 쌓인 그 속성 공격 블록 수 (불씨 모으기) */
function stackedAttackBlocks(s: CombatState, element: string): number {
  let n = 0;
  for (const b of s.tray) {
    if (b.kind !== 'skill') continue;
    const src = sourceOf(s.params, b.traitId);
    if (src?.role === 'attack' && blockElementOf(s.params, b) === element) n++;
  }
  return n;
}

/** 지금 평타 한 번에 곱해지는 물공 배율: 다음 평타 버프 합 × 바위 자세 쌓임 × 물살 × 단련 × 불씨 (화면 예고·테스트용으로도 쓴다) */
export function basicPowerOf(s: CombatState): number {
  const a = s.params.abilityEffects;
  let m = 1 + (s.basicBuffs ?? []).reduce((sum, b) => sum + b.bonus, 0);
  if (s.stoneStance && s.stoneStance.stacked > 0) m *= 1 + s.stoneStance.stacked;
  if (a.current) m *= 1 + Math.min(a.current.max, a.current.per * (s.currentHits ?? 0));
  if (a.tempering) m *= 1 + Math.min(a.tempering.max, a.tempering.per * (s.temperingBlocks ?? 0));
  if (a.emberStack) m *= 1 + Math.min(a.emberStack.max, a.emberStack.per * stackedAttackBlocks(s, a.emberStack.element));
  return m;
}

/** 평타 한 번 (자동 공격 또는 기합으로 바로): 물공 배율·두 번 때림 → 피해 → 버프 소모 → 물살·충전 → 연타 */
function basicAttack(s: CombatState): void {
  const p = s.params;
  const a = p.abilityEffects;
  // 평타 = 물리, 내 캐릭터 속성 (GDD 20-3 v3.6)
  const hit = playerHitMultiplier(s, p.playerElements, 'physical');
  const base = unitDamage(p) * p.attackPowerMultiplier * hit.mult * basicPowerOf(s);
  // 전광 (뇌 블록): 두 번 때림, 각 each. 타격마다 따로 치명 판정
  const flash = (s.flashHits ?? 0) > 0 && p.physBlock?.effect === 'flash' ? { n: 2, each: p.physBlock.each } : { n: 1, each: 1 };
  let last = 0;
  for (let k = 0; k < flash.n; k++) {
    const { damage, crit, elem } = playerHit(s, base * flash.each, false, p.playerElements);
    last = damage;
    emit(s, { kind: 'player-attack', damage, matchup: hit.matchup, crit, elem });
    dealDamage(s, damage, { kind: 'basic-attack', traitId: null, element: null, matchup: hit.matchup });
    onHit(s, 'enemy', p.playerElements, damage, true);
    if (s.status !== 'playing') return;
  }
  // 버프 소모: 다음 평타 n회 버프는 1회씩, 바위 자세 쌓임은 한 번에, 두 번 때림은 1회
  if (s.basicBuffs) {
    for (const b of s.basicBuffs) b.hits--;
    s.basicBuffs = s.basicBuffs.filter((b) => b.hits > 0);
  }
  if (s.stoneStance) s.stoneStance.stacked = 0;
  if ((s.flashHits ?? 0) > 0) s.flashHits!--;
  if (a.current) s.currentHits = (s.currentHits ?? 0) + 1;
  s.basicCount = (s.basicCount ?? 0) + 1;
  // 충전 (뇌 특성): 평타 n회마다 블록 1개가 바로 (기본 풀 추첨, 바가 가득이거나 봉인 중이면 없음)
  if (a.charge && a.charge > 0 && s.basicCount % a.charge === 0 && s.sealTicks === 0) {
    const e = drawBasic(s);
    if (e && spawn(s, 'skill', e.source.id, e.family)) proc(s, 'charge');
  }
  // 연타 (뇌, GDD 39장): 같은 위력으로 한 번 더 — 연타는 다시 연타하지 않는다
  const dh = a.doubleHit;
  if (dh && nextFloat((s.abilityRng ??= createRng((s.seed ^ ABILITY_SEED_SALT) >>> 0))) < dh) {
    proc(s, 'doubleHit', last);
    emit(s, { kind: 'player-attack', damage: last, matchup: hit.matchup });
    dealDamage(s, last, { kind: 'basic-attack', traitId: null, element: null, matchup: hit.matchup });
    onHit(s, 'enemy', p.playerElements, last, true);
  }
}

/** 물공 블록을 썼을 때의 효과 (기본 공격 블록이 물공 블록일 때만). 체인이어도 한 번 */
function applyPhysBlock(s: CombatState): void {
  const pb = s.params.physBlock;
  if (!pb || s.status !== 'playing') return;
  const t = (sec: number) => ticksOf(s.params, sec);
  switch (pb.effect) {
    case 'stoneStance':
      s.stoneStance = { ticks: t(pb.seconds), stacked: s.stoneStance?.stacked ?? 0 };
      proc(s, 'stoneStance');
      break;
    case 'knockback':
      (s.basicBuffs ??= []).push({ hits: pb.hits, bonus: pb.bonus });
      s.knockbackTicks = Math.max(s.knockbackTicks ?? 0, t(pb.seconds));
      proc(s, 'knockback');
      break;
    case 'wave':
      s.basicHaste = { ticks: t(pb.seconds), haste: pb.haste };
      // 지금 기다리는 간격도 바로 줄인다
      s.player.attackTimer = Math.max(1, Math.round(s.player.attackTimer * (1 - pb.haste)));
      proc(s, 'wave');
      break;
    case 'flash':
      s.flashHits = pb.hits;
      proc(s, 'flash');
      break;
    case 'shout':
      proc(s, 'shout');
      s.player.attackTimer = t(currentAttackSeconds(s));
      basicAttack(s);
      break;
    case 'ember':
      break;
  }
}

function emit(s: CombatState, e: CombatEvent): void {
  s.events.push(e);
}

export function drainCombatEvents(s: CombatState): CombatEvent[] {
  return s.events.splice(0, s.events.length);
}

function dealDamage(s: CombatState, amount: number, finisher: Finisher): void {
  if (s.status !== 'playing') return;
  // 졸개 (보스 기믹 summon): 내 피해를 먼저 받는 방패. 넘친 피해는 보스에게 간다
  const minion = s.boss?.minion;
  if (minion) {
    const absorbed = Math.min(amount, minion.hp);
    minion.hp -= absorbed;
    amount -= absorbed;
    if (minion.hp <= 0) {
      s.boss!.minion = null;
      s.boss!.minionKills = (s.boss!.minionKills ?? 0) + 1;
      emit(s, { kind: 'minion-down' });
    }
    if (amount <= 0) return;
  }
  // 해방 게이지 (GDD 22-5): 내가 준 피해로 찬다. 적 최대 체력 × liberationGaugeFraction 을 깎으면 가득. 쓴 뒤에는 차지 않는다
  const lb = s.liberation;
  if (lb.usedAtTick === null && lb.gauge < LIBERATION_GAUGE_MAX) {
    const dealt = Math.min(amount, s.enemy.hp);
    lb.gauge = Math.min(LIBERATION_GAUGE_MAX, lb.gauge + (dealt / Math.max(1e-6, s.enemy.maxHp * s.params.liberationGaugeFraction)) * LIBERATION_GAUGE_MAX);
  }
  s.enemy.hp = Math.max(0, s.enemy.hp - amount);
  if (s.enemy.hp <= 0) {
    s.status = 'won';
    s.finisher = finisher;
    emit(s, { kind: 'end', status: 'won' });
    return;
  }
  if (s.boss) updateBossPhase(s, s.boss);
}

/** 보스 페이즈 (GDD 25-3): 체력이 구간 아래로 내려가면 다음 페이즈로 (한 번에 여러 구간을 넘으면 마지막 것). 기본 공격 간격 배율이 바뀐다 */
function updateBossPhase(s: CombatState, b: BossState): void {
  const ratio = s.enemy.hp / s.enemy.maxHp;
  let phase = b.phase;
  b.setup.phases.forEach((ph, i) => {
    if (ratio <= ph.belowHpFraction && i + 2 > phase) phase = i + 2;
  });
  if (phase === b.phase) return;
  b.phase = phase;
  b.attackMult = b.setup.phases[phase - 2]!.attackSecondsMult;
  // 다음 기본 공격도 새 간격을 넘지 않게
  s.enemy.attackTimer = Math.min(s.enemy.attackTimer, ticksOf(s.params, enemyAttackSecondsOf(s.params, s.enemy.def.pattern) * b.attackMult));
  emit(s, { kind: 'boss-phase', phase });
  // 기믹 element (GDD 35장): 페이즈마다 보스 속성이 바뀐다 — 상성(내 블록·적 공격)은 바뀐 속성으로 본다. 능력치는 그대로
  const next = b.setup.gimmick === 'element' ? b.setup.elementShifts?.[phase - 2] : undefined;
  if (next && next !== s.enemy.def.element) {
    s.enemy.def = { ...s.enemy.def, element: next };
    emit(s, { kind: 'boss-element', element: next });
  }
}

/** 보스 기믹 seal (GDD 25-3): 간격마다 봉인 안 된 블록 cells 개를 골라 봉인한다. 바가 비어 있으면 블록이 생길 때까지 다음 틱에 다시 본다 */
function bossGimmick(s: CombatState, b: BossState): void {
  if (b.setup.gimmick === 'summon') return bossSummon(s, b);
  if (b.setup.gimmick !== 'seal') return; // element 는 페이즈가 바뀔 때(updateBossPhase), reflect 는 종류 자리만 (GDD 25-7)
  if (--b.gimmickTimer > 0) return;
  const free = s.tray.filter((x) => !(x.sealTicks && x.sealTicks > 0));
  if (free.length === 0) {
    b.gimmickTimer = 1;
    return;
  }
  b.gimmickTimer = ticksOf(s.params, b.setup.sealEverySeconds);
  for (let k = 0; k < b.setup.sealCells && free.length > 0; k++) {
    const blk = free.splice(nextInt(s.rng, free.length), 1)[0]!;
    blk.sealTicks = ticksOf(s.params, b.setup.sealSeconds);
    b.seals++;
    emit(s, { kind: 'cell-seal', uid: blk.uid, seconds: b.setup.sealSeconds });
  }
}

/** 보스 기믹 summon (GDD 35장): 간격마다 졸개 1마리(한 번에 1마리만 — 있으면 그 차례는 건너뛴다). 졸개는 살아 있는 동안 작은 공격을 한다(막기로 경감) */
function bossSummon(s: CombatState, b: BossState): void {
  const sm = b.setup.summon;
  if (!sm) return;
  const m = b.minion;
  if (m && --m.attackTimer <= 0) {
    m.attackTimer = ticksOf(s.params, sm.attackSeconds);
    const raw = enemyDamage(s, sm.attackInAttacks);
    const guarded = s.guard.ticks > 0;
    const damage = guarded ? raw * (1 - s.params.guardReduction) : raw;
    emit(s, { kind: 'minion-attack', damage, guarded });
    takeDamage(s, damage);
    if (s.status !== 'playing') return;
  }
  if (--b.gimmickTimer > 0) return;
  b.gimmickTimer = ticksOf(s.params, sm.everySeconds);
  if (b.minion) return;
  // 졸개 체력 = 기본 공격 N회 분량 (보스 체력과 같은 식, CLAUDE.md 규칙 3)
  const p = s.params;
  const hp = sm.hpInAttacks * p.hpAttackScale * p.playerAttackDamage * p.growthMultiplier;
  b.minion = { hp, maxHp: hp, attackTimer: ticksOf(p, sm.attackSeconds) };
  b.summons = (b.summons ?? 0) + 1;
  emit(s, { kind: 'boss-summon', hp });
}

/** 이 블록이 봉인돼 있나 (보스 기믹) */
export function blockSealed(b: Block | undefined): boolean {
  return !!b && (b.sealTicks ?? 0) > 0;
}

/** 공격자 속성의 맞힌 뒤 효과 (GDD 20-2): 혈 = 준 피해 일부 회복, 독 = 지속 피해. 내 공격(target enemy)과 적 공격(target player) 모두 */
function onHit(s: CombatState, target: 'enemy' | 'player', elements: readonly string[], damage: number, basic = false): void {
  const p = s.params;
  if (damage <= 0 || s.status !== 'playing') return;
  if (hasEffect(elements, 'drain')) {
    const who = target === 'enemy' ? s.player : s.enemy;
    // 피 냄새 (GDD 49장): 넉백 중인 적에게 내 평타 흡혈 ×배율
    const scent = basic && target === 'enemy' && (s.knockbackTicks ?? 0) > 0 ? p.abilityEffects.bloodScent ?? 1 : 1;
    // 한 전투 흡혈 합계 상한 (C.53): 최대 체력 × drainCapFraction 까지만
    const room = Math.max(0, who.maxHp * p.drainCapFraction - (who.drained ?? 0));
    const heal = Math.min(who.maxHp - who.hp, damage * p.drainFraction * scent, room);
    if (heal > 0) {
      who.hp += heal;
      who.drained = (who.drained ?? 0) + heal;
      emit(s, { kind: 'drain', target: target === 'enemy' ? 'player' : 'enemy', heal });
    }
  }
  if (hasEffect(elements, 'poison')) {
    const victim = target === 'enemy' ? s.enemy : s.player;
    const ticks = ticksOf(p, p.poisonSeconds);
    const left = victim.dot ? victim.dot.ticks * victim.dot.perTick : 0;
    victim.dot = { ticks, perTick: (left + damage * p.poisonFraction) / ticks };
  }
}

function takeDamage(s: CombatState, amount: number): void {
  if (s.status !== 'playing') return;
  if (amount > 0) {
    // 바위 자세 (GDD 49장 흙 블록): 받는 피해 감소 + 맞을 때마다 다음 평타 보너스 쌓기
    const st = s.stoneStance;
    const pb = s.params.physBlock;
    if (st && st.ticks > 0 && pb?.effect === 'stoneStance') {
      amount *= 1 - pb.takenReduction;
      st.stacked = Math.min(pb.max, st.stacked + pb.perHit);
    }
    // 물살: 내가 맞으면 연속 평타 수가 0 으로
    if (s.params.abilityEffects.current) s.currentHits = 0;
  }
  if (s.player.shield && s.player.shield > 0) {
    const absorbed = Math.min(s.player.shield, amount);
    s.player.shield -= absorbed;
    amount -= absorbed;
  }
  s.player.hp = Math.max(0, s.player.hp - amount);
  const last = s.params.abilityEffects.lastStand;
  if (s.player.hp <= 0 && last && !s.lastStandUsed) {
    s.lastStandUsed = true;
    s.player.hp = s.player.maxHp * last;
    proc(s, 'lastStand');
  }
  if (s.player.hp > 0) applyThorns(s, amount);
  if (s.player.hp <= 0) {
    s.status = 'lost';
    s.lossReason = 'hp';
    emit(s, { kind: 'end', status: 'lost' });
  }
}

/** 블록 표시용 속성 (GDD 20장 v5.4 `속성_계열`): 생성원의 속성, 속성 없는 기본 블록은 내 캐릭터 속성. 필살·공허·콤보는 null */
export function blockElementOf(p: CombatParams, b: Block): string | null {
  if (b.kind !== 'skill') return null;
  const src = sourceOf(p, b.traitId);
  if (src?.element) return src.element;
  return isBasicBlockId(src?.id) ? p.playerElements[0] ?? NORMAL_ELEMENT : null;
}

function spawn(s: CombatState, kind: Block['kind'], traitId: string | null, family: string | null = null): boolean {
  if (s.tray.length >= s.params.trayCapacity) return false;
  s.tray.push({ uid: s.nextUid++, kind, traitId, family });
  emit(s, { kind: 'spawn', index: s.tray.length - 1, block: kind });
  return true;
}

/** 저장 게이지 적립: 100 이 차면 충전 +1 (최대 storedChargesMax), 상한이면 버려진 양을 기록 */
function addStored(s: CombatState, v: number): void {
  const p = s.params;
  s.storedGauge += v;
  while (s.storedGauge >= p.storedGaugeMax) {
    s.storedGauge -= p.storedGaugeMax;
    if (s.storedCharges < p.storedChargesMax) {
      s.storedCharges++;
      emit(s, { kind: 'stored-ready', charges: s.storedCharges });
    } else {
      s.storedWasted += p.storedGaugeMax;
    }
  }
  if (s.storedCharges >= p.storedChargesMax && s.storedGauge > 0) {
    s.storedWasted += s.storedGauge;
    s.storedGauge = 0;
  }
}

/** 저장형 필살기 사용: 충전 1개 소모, 기본 공격 N회 분량 피해(약점·체인·방어 자세 무시) + 직후 막기 상태 */
export function storedDamage(s: CombatState): number {
  return s.params.storedPowerInAttacks * unitDamage(s.params) * plainHitMultiplier(s);
}

function useStored(s: CombatState): boolean {
  if (s.storedCharges <= 0) return false;
  const p = s.params;
  s.storedCharges--;
  s.storedUsed++;
  s.guard.ticks = Math.max(s.guard.ticks, ticksOf(p, p.storedGuardSeconds));
  const { damage, crit, elem } = playerHit(s, storedDamage(s), true, []);
  emit(s, { kind: 'stored-use', damage, guardSeconds: p.storedGuardSeconds, charges: s.storedCharges, crit, elem });
  dealDamage(s, damage, { kind: 'stored', traitId: null, element: null });
  return true;
}

function addSp(s: CombatState, v: number): void {
  s.sp = Math.min(s.params.spMax, s.sp + v);
}

function applyChainBonus(s: CombatState, bonus: ChainBonus): void {
  const p = s.params;
  if (bonus.kind === 'stagger') {
    // 적의 다음 행동을 늦춘다: 기본 공격, 특수 행동, 시전 중인 강공격 모두
    const d = ticksOf(p, bonus.value);
    s.enemy.attackTimer += d;
    if (hasSpecialActions(s.enemy.def.pattern)) s.enemy.actionTimer += d;
    if (s.enemy.cast) s.enemy.cast.ticks += d;
  } else if (bonus.kind === 'reflect') {
    s.guard.reflect = Math.max(s.guard.reflect, bonus.value);
  } else {
    s.sealTicks = 0;
    addSp(s, bonus.value);
  }
}

/** 블록 하나를 쓴 뒤 콤보 규칙을 갱신한다 (GDD 17-3): 쓴 것이 규칙의 계열·단계를 채우면 연속 +1, 아니면(다른 블록·모자란 체인) 0.
 *  연속이 repeat 에 닿으면 콤보 블록이 바 맨 오른쪽에 생긴다. family 가 null 이면 계열 체인이 아닌 블록(필살·공허·콤보·막기·회복·기본)이다 */
function updateCombos(s: CombatState, family: string | null, chain: number): void {
  for (const rule of s.params.combos) {
    const hit = family !== null && family === rule.family && chain >= rule.minChain;
    const n = hit ? (s.comboStreaks[rule.id] ?? 0) + 1 : 0;
    s.comboStreaks[rule.id] = n;
    if (n >= rule.repeat && spawn(s, 'combo', rule.id)) {
      s.comboStreaks[rule.id] = 0;
      s.combosTriggered++;
      emit(s, { kind: 'combo', comboId: rule.id });
    }
  }
}

/** 블록 사용 (클릭). 스킬 블록 = 붙어 있는 같은 특성 블록이 함께 발동(체인) → 역할 효과 + 피해, 필살 = 큰 피해, 공허 = 큰 피해 + 리스크 상승 */
function useBlock(s: CombatState, index: number): boolean {
  const b = s.tray[index];
  if (!b) return false;
  const p = s.params;
  if (b.kind === 'special') {
    s.tray.splice(index, 1);
    s.specialUsed = true;
    addStored(s, p.storedGaugePerBlock);
    const { damage, crit, elem } = playerHit(s, blockDamage(s, b), true, []);
    emit(s, { kind: 'block', block: 'special', traitId: null, family: null, element: null, matchup: 'neutral', role: null, chain: 1, damage, weak: false, heal: 0, guardSeconds: 0, bonus: null, crit, elem });
    dealDamage(s, damage, { kind: 'special', traitId: null, element: null });
    updateCombos(s, null, 0);
    counterIfStance(s);
    return true;
  }
  if (b.kind === 'void') {
    s.tray.splice(index, 1);
    s.voidUsed++;
    s.riskGained += p.riskPerVoidBlock;
    addStored(s, p.storedGaugePerBlock);
    addSp(s, p.spPerBlock);
    const damage = blockDamage(s, b) * abilityPowerOf(s, true);
    emit(s, { kind: 'block', block: 'void', traitId: null, family: null, element: null, matchup: 'neutral', role: null, chain: 1, damage, weak: false, heal: 0, guardSeconds: 0, bonus: null });
    dealDamage(s, damage, { kind: 'void', traitId: null, element: null });
    updateCombos(s, null, 0);
    counterIfStance(s);
    return true;
  }
  if (b.kind === 'combo') {
    s.tray.splice(index, 1);
    s.comboBlocksUsed++;
    addStored(s, p.storedGaugePerBlock);
    const { damage, crit, elem } = playerHit(s, blockDamage(s, b), true, []);
    emit(s, { kind: 'block', block: 'combo', traitId: b.traitId, family: null, element: null, matchup: 'neutral', role: null, chain: 1, damage, weak: false, heal: 0, guardSeconds: 0, bonus: null, crit, elem });
    dealDamage(s, damage, { kind: 'combo', traitId: b.traitId, element: null });
    updateCombos(s, null, 0);
    counterIfStance(s);
    return true;
  }
  if (b.kind === 'liberation') {
    s.tray.splice(index, 1);
    addStored(s, p.storedGaugePerBlock);
    addSp(s, p.spPerBlock);
    const { damage, crit, elem } = playerHit(s, blockDamage(s, b), true, p.playerElements);
    const hit = liberationHit(s);
    emit(s, { kind: 'block', block: 'liberation', traitId: null, family: null, element: hit.element, matchup: hit.matchup, role: null, chain: 1, damage, weak: hit.weak, heal: 0, guardSeconds: 0, bonus: null, crit, elem });
    dealDamage(s, damage, { kind: 'liberation', traitId: null, element: hit.element, weak: hit.weak, matchup: hit.matchup });
    onHit(s, 'enemy', p.playerElements, damage);
    updateCombos(s, null, 0);
    counterIfStance(s);
    return true;
  }
  // 스킬 블록: 함께 발동하는 칸들이 모두 소모된다. 체인 단계 = 함께 쓰인 블록 수
  const group = chainGroup(s.tray, index, maxChain(p));
  const chain = group.length;
  s.tray.splice(group[0]!, chain);
  const eff = blockEffect(s, b, chain);
  if (!eff) return true; // 생성원에 없는 블록(있을 수 없음)은 그냥 사라진다
  const { skill, mult, weak, matchup: m } = eff;
  const id = skill.id;
  // 기록: 특성별·skillsUsed 는 소모된 블록 수, 체인별은 발동 횟수 (한 번 눌러 체인N = blocksByChain[N-1] + 1)
  for (let k = 0; k < chain; k++) s.skillsUsed.push(id);
  s.blocksByTrait[id] = (s.blocksByTrait[id] ?? 0) + chain;
  s.blocksByChain[chain - 1]!++;
  if (skill.family) {
    const rec = (s.chainsByFamily[skill.family] ??= [0, 0, 0]);
    rec[chain - 1]!++;
  }
  if (chain >= p.chainMultipliers.length) {
    s.chain3Count++;
    if (weak) s.weakChain3Count++;
  }
  addSp(s, p.spPerBlock * chain);
  addStored(s, p.storedGaugePerBlock * chain + (p.storedChainBonus[chain - 1] ?? 0));
  let heal = 0;
  let guardSeconds = 0;
  if (skill.role === 'guard') {
    guardSeconds = p.guardSeconds * mult;
    s.guard.ticks = Math.max(s.guard.ticks, ticksOf(p, guardSeconds));
  } else if (skill.role === 'heal') {
    heal = Math.min(s.player.maxHp - s.player.hp, s.player.maxHp * p.healFraction * mult);
    s.player.hp += heal;
  }
  const bonus = tierEffect(p, skill, chain).bonus;
  if (bonus) applyChainBonus(s, bonus);
  const { damage, crit, elem } = playerHit(s, blockDamage(s, b, chain), true, skill.element ? [skill.element] : []);
  const family = skill.family ?? null;
  emit(s, { kind: 'block', block: 'skill', traitId: id, family, element: skill.element, matchup: m, role: skill.role, chain, damage, weak, heal, guardSeconds, bonus: bonus?.kind ?? null, crit, elem });
  dealDamage(s, damage, { kind: 'skill', traitId: id, element: skill.element, family, weak, matchup: m });
  if (skill.element) onHit(s, 'enemy', [skill.element], damage);
  // 단련 (GDD 49장 노멀 특성): 스킬 블록 1개마다 이번 전투 평타 +
  if (p.abilityEffects.tempering) s.temperingBlocks = (s.temperingBlocks ?? 0) + chain;
  // 물공 블록 효과 (GDD 49장): 기본 공격 블록이 물공 블록인 몸에서 그 블록을 썼을 때
  if (p.physBlock && id === BASIC_SKILL_ID && skill.role === 'attack') applyPhysBlock(s);
  applyChainHaste(s, chain);
  updateCombos(s, skill.family ?? null, chain);
  counterIfStance(s);
  return true;
}

/** 입력 하나 적용. 규칙에 맞지 않으면 false (상태 그대로) */
export function applyInput(s: CombatState, input: CombatInput): boolean {
  if (s.status !== 'playing') return false;
  let ok = false;
  if (input.type === 'stored') {
    ok = useStored(s);
  } else if (input.type === 'liberate') {
    ok = liberate(s);
  } else if (input.type === 'use') {
    ok = inTray(s.tray, input.cell) && !blockSealed(s.tray[input.cell]) && useBlock(s, input.cell);
  }
  if (ok) s.inputs.push({ tick: s.tick, input });
  return ok;
}

/** 해방 시작 (GDD 22-5): 지속 동안 전 능력치 ×배율(체력은 최대 체력과 함께 늘어난 만큼 채운다), 해방 블록을 바 오른쪽 끝에 넣는다.
 *  바가 가득 차 있으면 오른쪽 끝(가장 최근에 생긴) 블록이 밀려난다 */
function liberate(s: CombatState): boolean {
  if (!canLiberate(s)) return false;
  const p = s.params;
  const lb = s.liberation;
  lb.usedAtTick = s.tick;
  lb.ticksLeft = ticksOf(p, p.liberationSeconds);
  lb.base = { stats: { ...s.player.stats }, maxHp: s.player.maxHp };
  for (const k of STAT_IDS) s.player.stats[k] *= p.liberationStatMultiplier;
  const grownHp = s.player.maxHp * (p.liberationStatMultiplier - 1);
  s.player.maxHp += grownHp;
  s.player.hp += grownHp;
  const n = Math.min(p.liberationBlocks, p.trayCapacity);
  while (s.tray.length > p.trayCapacity - n) s.tray.pop();
  for (let i = 0; i < n; i++) spawn(s, 'liberation', null);
  emit(s, { kind: 'liberate', seconds: p.liberationSeconds, blocks: n });
  return true;
}

/** 해방이 풀린다 (지속이 다 됐거나 전투가 끝났다): 능력치·최대 체력을 되돌리고 리스크 게이지가 오른다 (한 번만) */
function endLiberation(s: CombatState): void {
  const lb = s.liberation;
  if (lb.usedAtTick === null || lb.base === null) return;
  s.player.stats = lb.base.stats;
  s.player.maxHp = lb.base.maxHp;
  s.player.hp = Math.min(s.player.hp, s.player.maxHp);
  lb.base = null;
  lb.ticksLeft = 0;
  lb.risk = s.params.liberationRisk;
  s.events.push({ kind: 'liberation-end', risk: lb.risk });
}

function shuffleTray(s: CombatState): void {
  const t = s.tray;
  for (let i = t.length - 1; i > 0; i--) {
    const j = nextInt(s.rng, i + 1);
    [t[i], t[j]] = [t[j]!, t[i]!];
  }
  emit(s, { kind: 'shuffle' });
}

/** 적의 공격 상성 (적 속성 → 내 속성) */
export function enemyMatchup(s: CombatState): Matchup {
  return matchup(enemyElements(s.enemy.def), s.params.playerElements);
}

/** 적 공격 피해 (GDD 20-3): 기본 공격 N회 분량 × 흔들림 × 받는 피해 배율 × 능력치 비(적 → 나, 적 분류) × 상성 × 분류별 받는 피해 */
function enemyDamage(s: CombatState, inAttacks: number): number {
  const p = s.params;
  const jitter = 1 + (nextFloat(s.rng) * 2 - 1) * p.enemyDamageVariance;
  const cat = s.enemy.def.category;
  const els = enemyElements(s.enemy.def);
  const ratio = statRatio(s.enemy.stats, s.player.stats, cat);
  const em = enemyMatchup(s);
  const mm = em === 'strong' && p.abilityEffects.noWeak ? 1 : matchupMultiplier(p, em);
  return inAttacks * p.playerAttackDamage * jitter * p.damageTakenMultiplier * ratio * mm * p.categoryTaken[cat];
}

/** 적의 공격이 맞았다: 피해 + 적 속성 효과(혈 흡혈·독) */
function enemyHits(s: CombatState, damage: number): void {
  takeDamage(s, damage);
  onHit(s, 'player', enemyElements(s.enemy.def), damage);
}

/** 강공격 착탄: 막기 상태면 크게 줄고(막기 성공), 반사 효과가 있으면 막은 피해를 돌려준다 */
function resolveHeavy(s: CombatState): void {
  const pattern = s.enemy.def.pattern;
  if (!pattern || !('heavyInAttacks' in pattern)) return;
  const crit = rollCrit(s, 'enemy');
  let damage = enemyDamage(s, pattern.heavyInAttacks) * (crit ? s.params.critMultiplier : 1);
  const guarded = s.guard.ticks > 0;
  let reflected = 0;
  if (guarded) {
    const blocked = damage * s.params.heavyGuardReduction;
    damage -= blocked;
    s.guardSuccesses++;
    reflected = blocked * s.guard.reflect;
  }
  emit(s, { kind: 'heavy-hit', damage, guarded, reflected, matchup: enemyMatchup(s), crit });
  if (reflected > 0) dealDamage(s, reflected, { kind: 'reflect', traitId: null, element: null });
  enemyHits(s, damage);
}

/** 패턴의 특수 행동 하나를 시작한다 (종류별 일반 처리, 적 id 분기 없음) */
function startAction(s: CombatState, pattern: Extract<EnemyPattern, { everySeconds: number }>): void {
  const e = s.enemy;
  const t = (sec: number) => ticksOf(s.params, sec);
  if (pattern.kind === 'stance') {
    e.stance = { ticks: t(pattern.stanceSeconds) };
    e.actionTimer = t(pattern.everySeconds);
    emit(s, { kind: 'stance', seconds: pattern.stanceSeconds });
    return;
  }
  const action = pattern.kind === 'heavy-seal' ? pattern.sequence[e.actionIndex % pattern.sequence.length]! : 'heavy';
  e.actionIndex++;
  if (action === 'heavy') {
    const total = t(pattern.castSeconds);
    e.cast = { ticks: total, total, hitsLeft: pattern.kind === 'heavy-chain' ? pattern.hits - 1 : 0 };
    emit(s, { kind: 'heavy-cast', seconds: pattern.castSeconds });
  } else if (pattern.kind === 'heavy-seal') {
    s.sealTicks = Math.max(s.sealTicks, t(pattern.sealSeconds));
    emit(s, { kind: 'seal', seconds: pattern.sealSeconds });
    e.actionTimer = t(pattern.everySeconds);
  }
}

/** 방어 자세 중 블록을 쓰면 반격을 받는다 (막기 상태면 기본 공격처럼 경감). 적이 이미 쓰러졌으면 없다 */
function counterIfStance(s: CombatState): void {
  const pattern = s.enemy.def.pattern;
  if (!s.enemy.stance || pattern?.kind !== 'stance' || s.status !== 'playing') return;
  const crit = rollCrit(s, 'enemy');
  const raw = enemyDamage(s, pattern.counterInAttacks) * (crit ? s.params.critMultiplier : 1);
  const guarded = s.guard.ticks > 0;
  const damage = guarded ? raw * (1 - s.params.guardReduction) : raw;
  emit(s, { kind: 'counter', damage, guarded, matchup: enemyMatchup(s), crit });
  enemyHits(s, damage);
}

/** 한 틱 진행: 버프 → 안개 섞기 → 블록 생성 → 내 기본 공격 → 적 행동 → 시간 제한 */
function advanceTick(s: CombatState): void {
  const p = s.params;
  const t = (sec: number) => ticksOf(p, sec);
  s.tick++;
  if (s.guard.ticks > 0 && --s.guard.ticks === 0) s.guard.reflect = 0;
  if (s.liberation.ticksLeft > 0 && --s.liberation.ticksLeft === 0) endLiberation(s);
  if (s.sealTicks > 0) s.sealTicks--;
  for (const b of s.tray) if (b.sealTicks && b.sealTicks > 0) b.sealTicks--;
  // 물공 블록 지속 효과 (GDD 49장): 바위 자세 · 평타 가속
  if (s.stoneStance && s.stoneStance.ticks > 0 && --s.stoneStance.ticks === 0) s.stoneStance.stacked = 0;
  if (s.basicHaste && s.basicHaste.ticks > 0) s.basicHaste.ticks--;
  // 독 지속 피해 (GDD 20-2)
  if (s.enemy.dot) {
    const d = s.enemy.dot;
    emit(s, { kind: 'dot', target: 'enemy', damage: d.perTick });
    if (--d.ticks <= 0) s.enemy.dot = null;
    dealDamage(s, d.perTick, { kind: 'dot', traitId: null, element: null });
    if (s.status !== 'playing') return;
  }
  if (s.player.dot) {
    const d = s.player.dot;
    emit(s, { kind: 'dot', target: 'player', damage: d.perTick });
    if (--d.ticks <= 0) s.player.dot = null;
    takeDamage(s, d.perTick);
    if (s.status !== 'playing') return;
  }
  if (p.trayShuffleSeconds > 0 && --s.shuffleTimer <= 0) {
    s.shuffleTimer = t(p.trayShuffleSeconds);
    shuffleTray(s);
  }
  // 블록 생성 (GDD 44-1 B안): 흡수 특성마다 타이머 + 기본 블록 타이머(나올 때마다 기본 풀에서 가중 추첨). 바가 가득 차거나 봉인 중이면 타이머가 멈춘다
  if (s.sealTicks === 0) {
    const secs = timerSecondsOf(p);
    for (let i = 0; i < secs.length; i++) {
      if (s.tray.length >= p.trayCapacity) break;
      s.spawnTimers[i] = (s.spawnTimers[i] ?? 1) - 1;
      if (s.spawnTimers[i]! > 0) continue;
      s.spawnTimers[i] = t(secs[i]!);
      const src = p.skills[i];
      if (src) spawn(s, 'skill', src.id, src.family ?? null);
      else {
        const e = drawBasic(s);
        if (e) spawn(s, 'skill', e.source.id, e.family);
      }
    }
  }
  if (--s.voidTimer <= 0) {
    s.voidTimer = t(p.voidCheckSeconds);
    if (nextFloat(s.rng) < voidChanceOf(p)) spawn(s, 'void', null);
  }
  if (s.sp >= p.spMax && spawn(s, 'special', null)) s.sp = 0;
  if (s.boss) bossGimmick(s, s.boss);
  // 내 자동 기본 공격
  if (--s.player.attackTimer <= 0) {
    s.player.attackTimer = t(currentAttackSeconds(s));
    basicAttack(s);
    if (s.status !== 'playing') return;
  }
  // 적: 시전 중이면 강공격 대기, 아니면 기본 공격 + 패턴의 특수 행동(강공격 예고 / 봉인 / 방어 자세)
  const e = s.enemy;
  const pattern = e.def.pattern;
  const attackTicks = t(enemyAttackSecondsOf(p, pattern) * (s.boss?.attackMult ?? 1));
  if (e.stance && --e.stance.ticks <= 0) {
    e.stance = null;
    emit(s, { kind: 'stance-end' });
  }
  // 넉백 (GDD 49장 혈 블록): 적의 공격·시전·특수 행동 타이머가 모두 멈춘다
  if ((s.knockbackTicks ?? 0) > 0) {
    s.knockbackTicks!--;
  } else if (e.cast) {
    if (--e.cast.ticks <= 0) {
      const more = e.cast.hitsLeft;
      e.cast = null;
      resolveHeavy(s);
      if (s.status === 'playing' && more > 0 && pattern?.kind === 'heavy-chain') {
        const total = t(pattern.followCastSeconds);
        e.cast = { ticks: total, total, hitsLeft: more - 1 };
        emit(s, { kind: 'heavy-cast', seconds: pattern.followCastSeconds });
      } else {
        e.attackTimer = attackTicks;
        if (hasSpecialActions(pattern)) e.actionTimer = t(pattern.everySeconds);
      }
    }
  } else {
    if (--e.attackTimer <= 0) {
      e.attackTimer = attackTicks;
      const crit = rollCrit(s, 'enemy');
      const raw = enemyDamage(s, e.def.attackInAttacks) * (crit ? p.critMultiplier : 1);
      const guarded = s.guard.ticks > 0;
      const damage = guarded ? raw * (1 - p.guardReduction) : raw;
      emit(s, { kind: 'enemy-attack', damage, guarded, matchup: enemyMatchup(s), crit });
      enemyHits(s, damage);
    }
    if (hasSpecialActions(pattern) && s.status === 'playing' && --e.actionTimer <= 0) startAction(s, pattern);
  }
  if (s.status === 'playing' && s.tick >= t(p.timeLimitSeconds)) {
    s.status = 'lost';
    s.lossReason = 'timeout';
    emit(s, { kind: 'end', status: 'lost' });
  }
}

/** 입력(없음/하나/여럿)을 적용하고 한 틱 진행한다. 각 입력이 받아들여졌는지 돌려준다 */
export function step(s: CombatState, input?: CombatInput | CombatInput[] | null): boolean[] {
  if (s.status !== 'playing') return [];
  const list = input ? (Array.isArray(input) ? input : [input]) : [];
  const accepted = list.map((x) => applyInput(s, x));
  if (s.status === 'playing') advanceTick(s);
  if (s.status !== 'playing') endLiberation(s); // 해방 중에 전투가 끝나도 풀리며 리스크가 오른다
  return accepted;
}

/** 같은 시드 + 입력 기록으로 처음부터 다시 돌린다 (결정성 확인·리플레이) */
export function replayCombat(seed: number, setup: CombatSetup, inputs: { tick: number; input: CombatInput }[]): CombatState {
  const s = createCombat(seed, setup);
  let i = 0;
  while (s.status === 'playing') {
    const now: CombatInput[] = [];
    while (i < inputs.length && inputs[i]!.tick === s.tick) now.push(inputs[i++]!.input);
    step(s, now);
    s.events.length = 0;
  }
  return s;
}
