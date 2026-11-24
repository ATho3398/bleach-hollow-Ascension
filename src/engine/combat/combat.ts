// 전투 v2: 실시간 자동 전투 + 스킬 블록 체인 (GDD 3-5). 종족 무관 순수 로직, 화면과 분리.
// 고정 틱(BALANCE.provisional.combat.tickSeconds) 시뮬레이션: createCombat(seed, setup) → step(state, input?) 반복.
// 같은 시드 + 같은 입력 기록 = 같은 결과. 상태는 평범한 객체(rng 포함)라 structuredClone 으로 복제할 수 있다.
// 화면은 step 을 실시간(1x/2x)으로 부르고, 테스트·봇은 헤드리스로 빠르게 돌린다.

import { BALANCE } from '../../config/balance';
import { hasSpecialActions } from '../../data/enemies';
import { canFoeExecute, ELEMENTAL_IDS, getElement, matchup, NORMAL_ELEMENT, weaknessesOf, type Matchup } from '../../data/elements';
import { STAT_IDS, type AttackCategory, type ChainBonus, type ChainBonusKind, type EnemyDef, type EnemyPattern, type SkillRole, type StatId, type Stats } from '../../data/schema';
import type { PhysAbilityEffect, PhysBlockEffect } from '../../data/evolution/physBlocks';
import type { FinisherKind } from '../runLog';
import { createRng, nextFloat, nextInt, type Rng } from '../rng';
import { chainGroup, inTray, type Block, type Tray } from './tray';
import {
  EVO_TRAIT_PREFIX, EXECUTE_TEXT, evoBasicPost, evoChainCapOf, evoChainMultOf, evoChainTierOf, evoGroupHardened, evoBasicPre, evoBlockPost, evoBlockPre, evoDamageAdjust, evoHpFloor, evoOnShield, evoOnSpawn, evoReleaseEnd, evoReleaseSecondsOf, evoReleaseStart,
  evoSpecialOf, evoStart, evoStat, evoTick, evoVoidOnly, newEvoState, registerEvoApi, useEvoSpecial, type EvoParams, type EvoState,
  evoBasicCritNow, evoCritBreakOn, evoFoeSlowSkip, evoForcedUsed, evoOnHurt, evoSpawnRulesOf, evoOriginalFor, evoSpawnOriginal,
} from './evoUnique';

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
  /** 장착 칸 수별 기본 블록 몫(초당 생성 기대치 비율), 칸이 더 많으면 마지막 값 (GDD 80장 v5.166, C.133). 기본 타이머 간격 = 흡수 블록 총 간격 × (1 − 몫) / 몫 (GDD 44-3, C.98) */
  basicShareBySlots: readonly number[];
  /** 장착 흡수 칸이 2칸부터 1칸 늘 때마다 흡수 특성 타이머 간격 +비율 (간격 = combat.blockSpawnSeconds × (1 + 이 값 × (칸 − 1))) — 후반(4칸 이상) 블록 총량을 누를 때 쓰는 지렛대 (GDD 44-2) */
  absorbedSlowdownPerSlot: number;
  temperament: Record<string, { attack?: number; guard?: number; heal?: number; absorbedSpawn?: number }>;
  /** 출현표의 기본 막기·회복 고정 몫 (GDD 84장 6·7번, C.136): 장착 칸 수와 무관. 성향 보정 = × 막기/회복 배율 ÷ 공격 배율 */
  /** 막기·회복이 블록에서 빠지며(GDD 105장) 공격 블록에 돌려준 몫: 공격 블록 생성 속도 × 1 / (1 − 이 값) */
  freedRoleShare: number;
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
  /** 적 체력 구간 강화 (GDD 8-8 v6.162 진화 전 허무 블록, C.531): 적 체력 비율이 above 초과인 첫 구간의 mult 를 위력에 곱한다(위에서부터). 없으면 배율 없음 */
  foeHpBands?: readonly { above: number; mult: number }[];
}

/** 적 체력 구간 배율 (GDD 8-8 v6.162): 비율(0~1)이 above 초과인 첫 구간. 구간이 없거나 못 찾으면 마지막 구간(없으면 1) */
export function foeHpBandMult(bands: readonly { above: number; mult: number }[] | undefined, hpFraction: number): number {
  if (!bands || bands.length === 0) return 1;
  return (bands.find((b) => hpFraction > b.above) ?? bands[bands.length - 1]!).mult;
}

/** 허무 적의 처형 수치 (GDD 8-8 v6.160 ④, balance provisional.foeExecute) */
export interface FoeExecuteParams {
  hpLine: { normal: number; elite: number; boss: number };
  everySeconds: number;
  ringSeconds: number;
  windowSeconds: number;
  blockedDamage: number;
  stunSeconds: number;
  stunTakenMult: number;
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
  /** 전투 시간 배율 (GDD 62장, C.118): 적·졸개 최대 체력에 곱한다. 0.5 = 한 전투가 약 절반 (내 체력은 playerHpScale) */
  hpScale: number;
  /** 내 최대 체력 배율 (C.118): 적 0.5 보다 덜 줄인다(0.7) — 강공격 한 방의 체력 대비 변동이 커지는 것을 눌러 강적·원정 패배율을 C.115 수준으로 유지 */
  playerHpScale: number;
  /** 적 기본 공격 피해 배율 (C.306, GDD 193장 1): 적 등급(class)별로 기본 공격 한 대에 곱한다 — 체력 배율로 짧아진 전투의 피해 총량 보정. 강공격·반격·졸개는 그대로(105장 수정 5 '강공격 = 최대 체력 약 20%'). 표에 없는 등급은 1 */
  attackScale: Record<string, number>;
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
  /** 속도 옵션 (GDD v6.055 8절 — 사용자 '공격속도 간격 0.1 감소 이런 식'): 아이템·특성의 '간격 −n초' 합. 곡선 값(0.01초 반올림) 뒤에 빼고 상한 아래로는 안 간다. 지금 이 옵션을 가진 데이터는 없다 */
  attackSecondsCut?: number;
  spawnSecondsCut?: number;
  /** 내 캐릭터 속성 (1단계 노멀, 융합은 2개). 적의 공격 상성과 내 기본 공격 상성, 자기 속성 보정에 쓴다 */
  playerElements: string[];
  /** 고유 특성·패시브: 블록 생성 속도 배율(클수록 빠름), 분류별 내 피해 배율, 분류별 받는 피해 배율 */
  blockSpawnMultiplier: number;
  categoryPower: Record<AttackCategory, number>;
  categoryTaken: Record<AttackCategory, number>;
  /** 막기 (GDD 105장 수정 v5.233): 게이지가 0 → 100% 차는 시간(초, 성향·강화 보정은 속도), 누르면 이 시간(초) 동안 강공격 완전 막기(일반 공격 경감 없음) */
  guardGaugeSeconds: number;
  guardSeconds: number;
  /** 전투 [소모품] (GDD 105장 수정 3·108장 3번): 장비 화면 소모품 칸에 든 전투용 소모품 효과. 없으면 버튼 비활성. 전투당 1회 */
  battleItem: BattleItemEffect | null;
  /** 전투 [장비] (GDD 105장 수정 4): 낀 장비의 '발동' 효과 하나. 없으면 버튼 비활성. 쿨다운 gearCooldownSeconds, 전투 시작 때 × gearStartCooldown */
  activeGear: ActiveGearEffect | null;
  /** 펫 공격 (GDD 241-D 4, C.397 provisional): 데리고 간 펫이 seconds 마다 기본 공격 1회 × fraction 피해. 없으면 펫 공격 없음 (튜토리얼·각본 전투는 쉼) */
  petAttack?: { petId: string; seconds: number; fraction: number } | null;
  /** 2번째 칸 펫 공격 (GDD 8-7 1차 추성 펫 칸 +1, C.506): 같은 방식, fraction 에 그 칸 피해 배율(70%)이 이미 곱해져 있다 */
  petAttack2?: { petId: string; seconds: number; fraction: number } | null;
  gearCooldownSeconds: number;
  gearStartCooldown: number;
  /** 강공격 배율: heavyInAttacks × 이 값 (101장 추가 결정 5번). 연속 강공격은 한 타마다 heavyChainHitMultiplier */
  heavyHitMultiplier: number;
  heavyChainHitMultiplier: number;
  /** 공허 블록을 쓰면 이 시간(초) 동안 기본 공격·블록 생성 멈춤 (101장 추가 결정 2번, 히든 진화체 0) */
  voidStunSeconds: number;
  /** 회복 잠김 (101장 추가 결정 2 2번 → 105장 수정 — 폭주 중 회복 소모품 못 씀) */
  noHealSpawn?: boolean;
  voidChance: number;
  voidChanceMax: number;
  voidPowerInAttacks: number;
  /** 켜져 있는 콤보 규칙 (진화 단계마다 열림, applyEvolutionToParams 가 채운다). 비면 콤보 없음 */
  combos: ComboRule[];
  /** 공허 블록 1개 사용 → 리스크 게이지 상승량 (BALANCE.provisional.risk.perVoidBlock) */
  riskPerVoidBlock: number;
  /** 전투 시작 때 리스크 게이지 값 (원정 리스크 — 게이지 모드 해방 kit.riskRelease 만 쓴다, GDD 12-4 v6.054 붕옥 감응도 = 리스크 그 자체. 없으면 floor) */
  riskStart?: number;
  /** 전투 시작 때 수련 게이지 값 (게이지 소모형 kit.riskDrain + mastery 만 — GDD 12-4 v6.069 이치고 무월수련, 원정 값이 이어진다. 없으면 0) */
  masteryStart?: number;
  /** 장착 흡수 skill 특성 블록 생성원(슬롯 순서). 기본 블록 5종은 이것과 상관없이 늘 풀에 있다 (GDD 44장) */
  skills: CombatSkill[];
  /** passive: 기본 공격 위력·속도 배율 */
  attackPowerMultiplier: number;
  attackSpeedMultiplier: number;
  /** passive·환경(결계): 받는 피해 배율 */
  damageTakenMultiplier: number;
  /** 환경(황무지): 내 공격 위력 전체 배율 */
  playerPowerMultiplier: number;
  /** 블록 관련 피해(블록·체인·필살·저장·콤보·해방 — playerHit 의 block 길) 배율. 실패형 줄기 0.5 (GDD 49-8, C.106), 그 밖 1 */
  blockDamageMultiplier: number;
  /** 기본 막기·회복 블록 위력 배율 (GDD 84장 7·8번, C.136): 속성 강화 단계 합에서 (buildCombatParams). 1 = 없음 */
  guardHealEnhance: number;
  /** 기본 공격 블록 위력 배율 (GDD 94장 B, C.147): 노멀 속성 강화 — 노멀은 기본 블록을 가진 것으로 보므로 노멀 흡수의 강화가 (속성 없는) 기본 공격 블록에 붙는다 (buildCombatParams).
   *  물공 특수 블록(그 속성 블록이 된 기본 공격)에는 붙지 않는다(코드 판단 — 물공 표 배율이 따로 있다). 1 = 없음 */
  basicAttackEnhance?: number;
  /** 블록 플레이 보정 (GDD 84장 3번, C.136): 블록 공격 피해 배율·치명 확률 가산 — 블록을 다 쓰는 플레이가 평타 자동전투보다 조금 세게 */
  blockPlayDamage: number;
  blockPlayCrit: number;
  /** 환경(안개): 이 간격(초)마다 블록 바의 순서가 섞인다. 0 = 없음 */
  trayShuffleSeconds: number;
  /** 리스크 게이지 비율(C.513, 옛 컨디션)·환경(폐가)·5바퀴 이후·폭주(호로화): 공허 블록 생성 확률 가산 */
  voidChanceBonus: number;
  /** 적 공격 한 번을 통째로 피할 확률 (GDD 101장 4번 — 폭주 중 risk.frenzyEvadeChance). 0 = 없음 */
  evadeChance: number;
  /** 해방 (GDD 83장, C.134 — 옛 저장형 필살기 자리): 이 전투에서 해방할 수 있는가. false 면 게이지도 차지 않는다 (튜토리얼·연습 등 부르는 쪽이 정한다) */
  liberationEnabled: boolean;
  /** 해방 게이지: 블록 1개 사용당, 체인 단계별 보너스(사용 한 번), 전투 시작 게이지(고정값, liberationStartGaugeOf — C.391) */
  liberationGaugePerBlock: number;
  liberationChainBonus: readonly number[];
  liberationStartGauge: number;
  /** C.154 (GDD 95장 B2): 피해로도 찬다 — 적 최대 체력만큼 주면 +liberationGaugePerDealt, 내 최대 체력만큼 받으면 +liberationGaugePerTaken (평타형·블록 안 쓰는 자동전투도 해방) */
  liberationGaugePerDealt: number;
  liberationGaugePerTaken: number;
  /** 해방 수치 (BALANCE.provisional.liberation): 지속, 해방 중 블록 생성 속도 배율(모든 생성 타이머가 이만큼 빨리 돈다), 해방 블록 위력(기본 공격 N회분), 끝날 때 리스크 */
  liberationSeconds: number;
  liberationSpawnSpeed: number;
  liberationPowerInAttacks: number;
  liberationRisk: number;
  /** 고유 효과 (레스렉시온/만해, 5단계~): 켜졌는가, 공격 속도·해방 블록 생성 배율, 전 능력치 배율 (수련 완료면 더 큼 — 부르는 쪽이 정한다) */
  liberationUnique: boolean;
  liberationAttackSpeed: number;
  liberationChainSpeed: number;
  liberationStatMultiplier: number;
  /** 원정 이벤트·시너지 (GDD 25-5, C.57): 전투 시작 체력 비율(함정), 시작 보호막 = 최대 체력 × 비율(성역·갈림길 — 받는 피해를 먼저 막는다), 적이 먼저 공격(매복) */
  playerStartHpFraction: number;
  startShieldFraction: number;
  enemyFirstStrike: boolean;
  /** 적 기본 공격 묶음 (GDD 123장 1, C.198): 기본 공격 간격 × 이 값, 한 대 피해 × 이 값 — 초당 피해는 같고 한 대가 굵어진다(강공격·졸개는 그대로). 1 = 그대로 */
  enemyHitPacing: number;
  /** 치명타 (C.63, GDD 28장 5번): 내 확률(기본 + 특성 critChance 합, 상한 critChanceMax), 치명 피해 배율, 적 확률. 공허 블록·반사·독 지속 피해 제외 */
  critChance: number;
  critMultiplier: number;
  enemyCritChance: number;
  critChanceMax: number;
  /** 블록 치명 (GDD 126-1 확정 ②, C.220): 블록 공격의 치명 확률·상한. 옛 상태(없음)는 평타 값 */
  blockCritChance: number;
  blockCritChanceMax: number;
  /** 진화체 특성 효과 (C.89, GDD 39장): 진화체 label 에서 계산한 효과 종류별 값 (src/engine/evolution/formAbilities.ts). 비면 효과 없음 */
  abilityEffects: AbilityEffects;
  /** 속성 피해 (C.101, GDD 48장): 속성 id(노멀 + 기본 원소) → %. 없는 칸은 0. 값은 elementDamageOf(출처 합)가 정한다 */
  elementDamage: Record<string, number>;
  /** 물공 특수 블록 (GDD 49장, C.103): 있으면 기본 공격 블록 3계열이 전부 이 속성 물공 블록(효과 포함)이 된다. 없으면 보통 기본 블록 */
  physBlock: PhysBlock | null;
  /** 물공 블록 생성원 타이머 간격(초) (GDD 49-11, C.105): 물공 몸은 기본 블록 몫에서 공격이 빠지고 이 타이머 하나가 물공 블록을 낸다. 블록 가속 배율은 나눈다 */
  physBlockSpawnSeconds: number;
  /** 타격 지연 (GDD 214장, C.357): 공격 주기는 그대로, 피해만 이 초 뒤 틱에 들어간다 = 그 공격 모션이 닿는 순간. 기본값 balance, 화면이 실제 동작 데이터로 바꾼다 */
  hitDelay: HitDelayParams;
  /** 몸동작 길이 (GDD 7-2 '빠른 간격의 모션'·'모션 중엔 평타 없음'·'블록 연속 사용 = 절충안', C.448): 없으면 옛 동작(평타 타이머는 블록 모션과 무관·빨리 감기 없음) */
  motion?: MotionParams;
  /** 초월자 전용 블록 (GDD 12-4 v6.048, C.441): 있으면 일반 블록(기본·흡수·물공) 대신 이 블록만 나온다. 없으면(null) 보통 블록 */
  kit?: CombatKit | null;
  /** 허무 적의 처형 수치 (GDD 8-8 v6.160 ④, C.531 — balance provisional.foeExecute). 없으면 처형 없음(옛 상태·테스트) */
  foeExecute?: FoeExecuteParams;
  /** 테스트 모드 적 설정 (GDD 17-4 v6.083, C.457): true = 적이 일반 공격·특수 행동·졸개 공격을 하지 않는다. 진짜 게임은 늘 없음 */
  enemyPassive?: boolean;
  /** 테스트 모드 적 설정 (GDD 17-4 v6.083, C.457): 적 일반 공격 간격(초)을 이 값으로 고정 (패턴·배율 무시). 진짜 게임은 늘 없음 */
  enemyAttackSecondsFixed?: number;
  /** 테스트 모드 적 설정 (GDD 17-4 v6.083, C.457): true = 적이 쓰러지지 않는다 — 체력이 0 에 닿으면 가득으로 되돌린다(허수아비). 진짜 게임은 늘 없음 */
  enemyImmortal?: boolean;
  /** 4단계 진화체 고유 능력·특수 블록·해방 변형 (GDD 8-7 1차, C.499): 규칙 데이터(evoUnique.ts). 없으면 없음 */
  evo?: EvoParams | null;
}

/** 초월자 전용 블록 하나 (GDD 12-4 v6.048, C.441 — src/engine/transcendKit.ts 가 데이터 + 수치 + 강화로 만든다). 엔진은 장치만 본다:
 *  solo 체인 안 됨 · maxOnRail 레일 최대 개수 · counter 반격 창 · stack 최대 체인마다 스택 → 가득이면 마무리 기술 · releaseSwap 해방 중 대신 나오는 블록 · releaseOnly 해방 중에만 */
export interface CombatKitBlock {
  id: string;
  name: string;
  short: string;
  fx: string;
  /** 체인 n 의 기술 이름 */
  tierNames: string[];
  /** 출현 몫 (해방 밖 = releaseOnly 아닌 블록끼리, 해방 중 = releaseSwap 를 적용한 뒤 블록끼리 나눈다) */
  weight: number;
  maxOnRail?: number;
  /** 피해 = power × tiers[체인−1] × mult × 기본 공격 1회분 × 능력치 비 */
  power: number;
  tiers: number[];
  /** 강화 배율 (1 + 강 × perLevel) — 피해·회복에 */
  mult: number;
  solo?: boolean;
  releaseOnly?: boolean;
  releaseSwap?: string;
  /** 허 공식 몫 장치 (GDD 12-4 v6.052 붕옥 → v6.066 경화수월도): 블록이 나올 때마다 허 공식 × voidScale 확률로 따로 굴린다(order 작은 것부터, 먼저 걸린 것이 나옴 — 다 안 걸리면 weight 블록).
   *  riskGain 이 있으면(붕옥) 허 블록 자리(허 각인)·게이지 가득이면 안 나옴·쓰면 패널티 없이 게이지 +riskGain */
  voidSlot?: { base?: number; voidScale: number; riskGain?: number; order: number };
  /** 융합 중 쓰면 1블록마다 게이지 −riskCost (GDD 12-4 v6.052 프라고르) */
  riskCost?: number;
  /** 충전 평타 장치 (GDD 12-4 v6.069 이치고 월아천충): 쓰면 피해 없이 '다음 평타 = 충전 평타' 를 체인 수만큼 쌓는다. 충전 평타 = 기본 공격 × power, 이름 name */
  chargeShot?: { power: number; name: string };
  /** 몸동작 없음 (GDD 12-4 v6.073 월아천충): 블록 몸동작 줄(C.448)에 서지 않는다 — 모션 길이 0, 평타가 안 멈춘다 */
  noMotion?: boolean;
  /** 체인별 게이지 소모 (GDD 12-4 v6.069 — 1·2·3체인 −10/−15/−19): 해방 밖에서 쓰면 리스크 게이지(kit.riskDrain) −[체인−1]. 해방 중엔 안 깎인다 */
  chainRiskCost?: number[];
  /** 체인별 해방 게이지 (GDD 12-4 v6.069 — +12/18/23): 블록 1개당 기본 적립(gaugePerBlock·체인 보너스) 대신 이 값 */
  chainGauge?: number[];
  counter?: { windowSeconds: number; damageMult: number; critBonus: number; healLostFraction: number; line: string };
  stack?: { cutPerStack: number; maxCut: number; full: number; finisherName: string; finisherPower: number; enemyStunSeconds: number };
}

export interface CombatKit {
  id: string;
  liberationName: string;
  stackName: string;
  blocks: CombatKitBlock[];
  evadeChance: number;
  revive?: { hpFraction: number; line: string };
  /** 회피 성공 뒤 치명 버프 (GDD 12-4 v6.066): seconds 동안 내 치명 확률 +critChance(평타·블록, 상한 그대로)·치명 피해 배율 +critDamage. 다시 회피하면 새로 셈 */
  evadeBuff?: { seconds: number; critChance: number; critDamage: number };
  /** 해방 = 게이지 모드 체인지 (GDD 12-4 v6.052 붕옥 융합 · v6.054): 게이지(붕옥 감응도) = 원정 리스크 그 자체 — params.riskStart 로 시작, floor 밑으로 안 감, limit 최대,
   *  전투가 끝나면 원정이 끝 값으로 맞춘다. 게이지 ≥ minRisk 면 언제든 해방(지속 시간 없음), 해방 중 minRisk 밑으로 떨어지면 풀림. 게이지는 voidSlot 블록으로 오르고 riskCost 블록으로 깎인다 */
  riskRelease?: { floor: number; minRisk: number; limit: number };
  /** 해방 중엔 기본 장치가 꺼진다 (GDD 12-4 v6.052 융합 중): 회피 0 · 되살아나기 없음 · 스택 없음(해방하면 0) */
  releaseBare?: boolean;
  /** 리스크 패널티 없음 (GDD 12-4 v6.050): 원정이 돌파(폭주)를 만들지 않는다 — 전투 엔진은 표시만 */
  riskPenaltyFree?: boolean;
  /** 게이지 소모형 리스크 (GDD 12-4 v6.069 이치고 호로화): 게이지 = 원정 리스크(params.riskStart, 원정이 출발·보스전마다 limit 로 채움), 전투 안에서는 깎이기만 한다.
   *  공허 블록 없음. 해방 = 보통 해방 게이지로(지속 시간 없음) — 해방 중엔 블록이 게이지를 안 깎고 충전 평타마다 −shotCost, 게이지 0 이면 해방이 풀린다 */
  riskDrain?: { limit: number; shotCost: number; tickSeconds: number; tickCost: number };
  /** 평타 n대마다 전용 블록 1개 추가 생성 (GDD 12-4 v6.070 이치고 — 출현표에서, 생성 타이머·주기와 무관, 바가 가득이면 없음) */
  bonusBlockEvery?: number;
  /** 수련 → 두 번째 해방 (GDD 12-4 v6.069 이치고 무월수련·무월, riskDrain 과 같이): 게이지가 0 이면 수련 게이지(평타 +perBasic · 블록 1개 +perBlock, full 이면 가득)로 바뀐다.
   *  가득이면 해방 버튼이 releaseName — 수동 해방(만해 수치, 지속 시간 없음). 그 동안 평타 1대마다 스택 +1, stacks 면 다음 평타 = finisherName
   *  (기본 공격 × finisherPower + 바의 충전 블록 1개당 × finisherPerBlock, 그 블록들 소모) → 해방이 풀리고 게이지 limit · 수련 0.
   *  수련 게이지 모드 동안(두 번째 해방 전) 주는 피해 × damageMult (v6.074). 첫 해방 중엔 tickSeconds 마다 게이지 −tickCost (v6.070) */
  mastery?: { name: string; releaseName: string; finisherName: string; perBasic: number; perBlock: number; full: number; damageMult: number; stacks: number; finisherPower: number; finisherPerBlock: number; cine?: KitFinisherCine };
  /** 전투 모드 id (GDD 12-4 이치고 기본/천년혈전, C.460 — 런 로그). 모드가 없는 kit 은 없음 */
  mode?: string;
  /** 자세 모드 (GDD 12-4 천년혈전, C.460): 있으면 해방 = 지금 자세 스택으로 그 자세의 만해, 출현 = 지금 자세 블록만 */
  stance?: CombatStanceKit;
}

/** 자세 하나 (C.460): 장치만 — 엔진은 자세·블록 id 로 분기하지 않는다.
 *  block 이 자세에서만 나오는 블록 · speedPerStack 스택 1당 공격속도 · powerPerStack 스택 1당 평타 피해 · clones 만해 중 바의 이 자세 블록 perChain 개마다 분신(평타마다 같은 피해) ·
 *  fixed 평타 간격 고정(만해 중 releaseAttackSeconds — 빠른 몫 = 추가 피해) · hold 유지 1초마다 평타 피해 + · draw 블록 누르기 → 떼면 발도 충전, 넘기면 자세 무너짐 ·
 *  parry 막기 버튼 = 패링 · lanterns 만해 중 블록 = 회색(불 켜기) */
export interface CombatStance {
  id: string;
  name: string;
  block: string;
  releaseName: string;
  /** 스택 표시 아이콘 (GDD 7-13, C.471 — 데이터 stances[].icon, 화면만 읽음) */
  icon?: string;
  speedPerStack?: number;
  powerPerStack?: number;
  clones?: { perChain: number; max: number };
  fixed?: { attackSeconds: number; releaseAttackSeconds: number };
  hold?: { perSecond: number; max: number };
  draw?: { name: string; maxPower: number; fullSeconds: number; stackEverySeconds: number; stacks: number; breakSeconds: number; breakTaken: number };
  parry?: { name: string; windowSeconds: number; stacks: number; power: number; ignoreDefense: number; stunSeconds: number };
  lanterns?: { basicPower: number; max: number; perStacks: number; perPower: number; perStun: number; perTaken: number };
}

/** 자세 모드 공통 (C.460): 재사용 대기 · 스택 지속 · 상한 · 만해 가능 스택 */
export interface CombatStanceKit {
  stances: CombatStance[];
  switchSeconds: number;
  stackSeconds: number;
  stackMax: number;
  releaseAt: number;
}

/** 초월자 전용 블록의 바 블록 traitId 앞머리 (traitId = 'kit:<블록 id>') */
export const KIT_TRAIT_PREFIX = 'kit:';

/** 바 블록 → 초월자 전용 블록 정의 (아니면 undefined) */
export function kitBlockOf(p: Pick<CombatParams, 'kit'>, traitId: string | null | undefined): CombatKitBlock | undefined {
  if (!p.kit || !traitId || !traitId.startsWith(KIT_TRAIT_PREFIX)) return undefined;
  const id = traitId.slice(KIT_TRAIT_PREFIX.length);
  return p.kit.blocks.find((b) => b.id === id);
}

/** 전투 중 초월자 전용 블록 상태 (GDD 12-4 v6.048): 반격 창(끝 틱·그 공격 손실 체력) · 스택 · 되살아남 · 기록(반격 성공·마무리 기술·되살아남) */
export interface KitCombatState {
  counterUntil: number;
  counterLost: number;
  stack: number;
  revived: boolean;
  counters: number;
  finishers: number;
  revives: number;
  /** 지금 게이지 (붕옥 감응도 — 원정 리스크로 시작 + 붕옥 블록 상승 − 프라고르 소모, floor~limit, v6.054) · 해방 중 깎인 합 · 해방 진입·풀림(문턱 밑) 횟수 · 준비 알림을 띄웠나 (GDD 12-4 v6.052) */
  risk: number;
  riskSpent: number;
  modeEnters: number;
  modeExits: number;
  readyShown: boolean;
  /** 회피 치명 버프가 끝나는 틱 (−1 = 없음, GDD 12-4 v6.066) · 버프가 붙은 횟수 */
  evadeBuffUntil: number;
  evadeBuffs: number;
  /** 게이지 소모형 (GDD 12-4 v6.069 이치고): 남은 충전 평타 · 수련 게이지 · 두 번째 해방(무월) 중인가 · 그 스택 · 기록(두 번째 해방 진입·마무리 평타) */
  charges: number;
  mastery: number;
  second: boolean;
  /** 첫 해방 중 주기 소모까지 남은 틱 · 평타 수(추가 생성 주기) */
  drainTimer: number;
  basics: number;
  finalStack: number;
  secondEnters: number;
  finals: number;
  /** 자세 모드 (GDD 12-4 천년혈전, C.460): 지금 자세 번호 · 자세마다 스택·스택이 사라지는 틱 · [자세]를 다시 누를 수 있는 틱 · 유지 틱(hold) ·
   *  발도 충전 중(누른 블록 uid·시작 틱) · 다음 평타 발도 배율(1 = 없음) · 자세 무너짐 끝 틱 · 패링 창이 열렸나 · 기록(자세 변경·패링 성공/실패·자세 무너짐) */
  stance: number;
  stanceStacks: number[];
  stanceUntil: number[];
  stanceReadyAt: number;
  holdTicks: number;
  draw: { uid: number; startTick: number } | null;
  drawPower: number;
  brokenUntil: number;
  parryOpen: boolean;
  switches: number;
  parries: number;
  parryFails: number;
  breaks: number;
  /** 마무리 평타 연출 중 (C.473): 시작·타격·끝 틱. 없으면 null */
  cine: { start: number; hit: number; end: number } | null;
}

/**
 * 마무리 평타 연출 (GDD 12-4 v6.102 최후의 월아천충 연출, C.473 — 데이터 kit.mastery.finisherCine): 쏘는 순간부터 seconds 동안 내 캐릭터 무적(받는 피해 0)·
 * 적 행동·내 평타·블록 생성·블록 사용이 멈추고, 피해는 hitSeconds 뒤(몸 동작 motion 의 타격 시각)에 들어간다. 연출이 끝나야 두 번째 해방이 풀린다.
 * captions = [초, 자막] — 화면이 이 시각에 자막 띠를 띄운다(엔진은 안 씀)
 */
export interface KitFinisherCine {
  motion: string;
  seconds: number;
  hitSeconds: number;
  captions: [number, string][];
}

/** 전투 시작 초월자 kit 상태 */
function newKitState(p: CombatParams): KitCombatState {
  const rr = p.kit?.riskRelease;
  const rd = p.kit?.riskDrain;
  const risk = rr ? Math.min(rr.limit, Math.max(rr.floor, p.riskStart ?? rr.floor)) : rd ? Math.min(rd.limit, Math.max(0, p.riskStart ?? rd.limit)) : 0;
  const mastery = rd && p.kit?.mastery && risk <= 0 ? Math.min(p.kit.mastery.full, Math.max(0, p.masteryStart ?? 0)) : 0;
  const n = p.kit?.stance?.stances.length ?? 0;
  return { counterUntil: -1, counterLost: 0, stack: 0, revived: false, counters: 0, finishers: 0, revives: 0, risk, riskSpent: 0, modeEnters: 0, modeExits: 0, readyShown: false, evadeBuffUntil: -1, evadeBuffs: 0, charges: 0, mastery, second: false, drainTimer: 0, basics: 0, finalStack: 0, secondEnters: 0, finals: 0,
    stance: 0, stanceStacks: Array.from({ length: n }, () => 0), stanceUntil: Array.from({ length: n }, () => -1), stanceReadyAt: 0, holdTicks: 0, draw: null, drawPower: 1, brokenUntil: -1, parryOpen: false, switches: 0, parries: 0, parryFails: 0, breaks: 0, cine: null };
}

/** 회피 치명 버프가 켜져 있는가 (화면: 버프 칩) */
export function kitEvadeBuffOn(s: Pick<CombatState, 'params' | 'kit' | 'tick'>): boolean {
  return !!s.params.kit?.evadeBuff && !!s.kit && s.tick <= s.kit.evadeBuffUntil;
}

/** 회피 치명 버프 남은 초 (없으면 0) */
export function kitEvadeBuffSecondsLeft(s: Pick<CombatState, 'params' | 'kit' | 'tick'>): number {
  if (!kitEvadeBuffOn(s)) return 0;
  return (s.kit!.evadeBuffUntil - s.tick) * s.params.tickSeconds;
}

/** 해방 중이라 기본 장치(회피·되살아나기·스택)가 꺼져 있는가 (GDD 12-4 v6.052 융합 중 — kit.releaseBare) */
export function kitBare(s: Pick<CombatState, 'params' | 'liberation'>): boolean {
  return !!s.params.kit?.releaseBare && liberationActive(s as CombatState);
}

/** 지금 게이지 값 (게이지 모드 해방 kit 만 — 붕옥 감응도, 아니면 null) */
export function kitRiskOf(s: Pick<CombatState, 'params' | 'kit'>): number | null {
  return (s.params.kit?.riskRelease || s.params.kit?.riskDrain) && s.kit ? s.kit.risk : null;
}

/** 게이지 소모형이 수련 게이지로 바뀌었는가 (GDD 12-4 v6.069 — 호로화 0 → 무월수련). 화면: 게이지 칩 이름·값 */
export function kitMasteryOn(s: Pick<CombatState, 'params' | 'kit'>): boolean {
  return !!s.params.kit?.riskDrain && !!s.params.kit.mastery && !!s.kit && s.kit.risk <= 0;
}

/** 두 번째 해방(무월) 중인가 (GDD 12-4 v6.069) */
export function kitSecondOn(s: Pick<CombatState, 'params' | 'kit'>): boolean {
  return !!s.params.kit?.mastery && !!s.kit?.second;
}

/** 다음 해방이 두 번째 해방(무월)인가: 수련 게이지 모드면 (가득 여부와 상관없이 — 버튼 이름) */
export function kitNextReleaseIsSecond(s: Pick<CombatState, 'params' | 'kit'>): boolean {
  return kitMasteryOn(s) || kitSecondOn(s);
}

/** 타격 지연(초) — 종족 무관, 숫자만. basic 내 평타 / block 블록 공격 기본값 / blockBy 계열·단계별(`계열:단계`)·'combo'·'liberation' / enemy 적 기본 공격 / heavy 강공격 착탄 / counter 반격 */
export interface HitDelayParams {
  basic: number;
  block: number;
  blockBy?: Record<string, number>;
  /** blockBy 중 이펙트 몫(초) — 도트 이펙트·투사체가 타격(도착)까지 걸리는 시간. 블록 모션 배율을 받지 않는다(늘 1배, GDD 7절 v6.150, C.512). 없으면 0(전부 몸 몫) */
  blockFxBy?: Record<string, number>;
  enemy: number;
  heavy: number;
  counter: number;
}

/** 한 몸동작의 길이 (GDD 7-2, C.448): 1배 초. 몸동작만(이펙트 시간줄은 따로 — '모션과 이펙트는 따로 계산'). total = 전체, hit = 첫 타격 시각(앞 자르기는 여기까지 = 준비 동작) */
export interface MotionSpec {
  total: number;
  hit: number;
}

/** 몸동작 표 (GDD 7-2, C.448) — 종족 무관, 숫자만. fastMax 최대 빨리 감기 배율 · basic 일반 공격 · block 블록 기본값 · blockBy 블록 키(blockHitKey·'combo'·'liberation')별.
 *  기본값은 balance(화면 없을 때 — 봇·시뮬), 화면이 실제 동작 데이터로 바꿔 넣는다(attackFx motionsOf) */
export interface MotionParams {
  fastMax: number;
  basic: MotionSpec;
  block: MotionSpec;
  blockBy?: Record<string, MotionSpec>;
  /** 블록 모션 기준 길이 (GDD 7절 v6.106 '같은 진화 단계 = 블록 모션 길이 통일', C.476): default = [1체인, 2체인, 3체인] 초, byTier = 진화 단계(tierIndex) 키별로 따로 둘 때.
   *  있으면 블록 몸동작(위 표의 실제 동작 길이)을 이 길이로 늘이거나 줄인다 — 타격 시각은 같은 배율. 없으면 실제 동작 길이 그대로(옛 동작) */
  blockLength?: { default: readonly number[]; byTier?: Readonly<Record<string, readonly number[]>> };
  /** 이 몸의 진화 단계 (blockLength.byTier 키 — applyEvolutionToParams 가 넣는다) */
  tier?: number;
}

/** 블록 모션 기준 길이(초) (GDD 7절 v6.106, C.476): 진화 단계 키 → default, 체인 1~3(넘으면 마지막 값). 표가 없으면 null */
export function blockMotionTarget(m: Pick<MotionParams, 'blockLength' | 'tier'> | undefined, chain: number): number | null {
  const t = m?.blockLength;
  if (!t) return null;
  const row = (m!.tier !== undefined ? t.byTier?.[String(m!.tier)] : undefined) ?? t.default;
  if (!row.length) return null;
  const v = row[Math.max(1, Math.min(row.length, Math.floor(chain) || 1)) - 1]!;
  return v > 0 ? v : null;
}

/** 블록 키 → 체인 수 ('계열:단계' 의 단계, 그 밖 1) */
function chainOfKey(key: string | null): number {
  const n = key ? Number(key.slice(key.lastIndexOf(':') + 1)) : NaN;
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

/** 기준 길이에 맞춘 블록 몸동작 (GDD 7절 v6.106, C.476): total = 기준 길이, rate = 실제 길이 ÷ 기준 길이(배율), hit = 실제 타격 시각 ÷ max(1, 배율).
 *  몸동작은 느리게 재생하지 않는다(배율 하한 1배, GDD 7절 v6.167, C.519): 기준보다 짧은 동작은 1배 그대로(타격 = 원래 시각), 남는 시간은 화면이 기본 대기 동작으로 채운다 — 줄 길이는 그대로 기준 길이.
 *  몸동작이 없으면(실제 길이 0 — 그림 없는 몸) null = 줄에 안 섬. 기준 길이 표가 없으면 실제 길이 그대로(rate 1) */
export function blockMotionOf(p: Pick<CombatParams, 'motion'>, key: string | null, chain = chainOfKey(key)): (MotionSpec & { rate: number }) | null {
  const n = motionSpecOf(p, key);
  if (!n || !(n.total > 0)) return null;
  const target = blockMotionTarget(p.motion, chain);
  if (target === null) return { total: n.total, hit: n.hit, rate: 1 };
  const k = n.total / target;
  return { total: target, hit: Math.min(target, Math.max(0, n.hit) / Math.max(1, k)), rate: k };
}

/** 간격에 맞춘 몸동작 (GDD 7-2 '빠른 간격의 모션'): rate 재생 배율 · trim 앞에서 자른 길이(1배 초) · length 실제 재생 길이(초) · hitIn 시작부터 타격까지(초) */
export interface MotionFit {
  rate: number;
  trim: number;
  length: number;
  hitIn: number;
}

/**
 * 간격(interval 초)이 모션보다 짧으면 최대 fastMax 배속까지 빨리 감고, 그래도 넘치면 넘치는 만큼 앞부분(준비 동작 = 첫 타격 전)을 자른다 (GDD 7-2, 모든 몸·모든 모션 공통).
 * 예: 0.6초 모션 → 1.5배속 0.4초 → 간격 0.3초면 앞 0.1초(재생 시간) 자름. 타격 프레임은 자르지 않는다 — 준비 동작을 다 잘라도 넘치면 타격부터 끝까지 재생(그만큼 다음 동작이 덮는다).
 * interval 이 null(뒤에 기다리는 것 없음)이면 원래 속도
 */
export function fitMotion(m: MotionSpec, interval: number | null, fastMax: number): MotionFit {
  const total = Math.max(0, m.total);
  const hit = Math.min(total, Math.max(0, m.hit));
  if (interval === null || interval >= total || total <= 0) return { rate: 1, trim: 0, length: total, hitIn: hit };
  const rate = Math.max(1, Math.min(fastMax, total / Math.max(1e-6, interval)));
  const scaled = total / rate;
  const cut = Math.min(Math.max(0, scaled - interval), hit / rate);
  return { rate, trim: cut * rate, length: scaled - cut, hitIn: hit / rate - cut };
}

/** 블록 키의 몸동작 (없으면 기본값). params.motion 이 없으면 null */
export function motionSpecOf(p: Pick<CombatParams, 'motion'>, key: string | null): MotionSpec | null {
  const m = p.motion;
  if (!m) return null;
  return (key ? m.blockBy?.[key] : undefined) ?? m.block;
}

/** 타격 지연 틱 수 (0 이면 바로). 올림 (GDD 224장 3, C.367): 반올림이면 모션 타격 프레임보다 최대 반 틱(50ms) 먼저 들어갈 수 있다 — 화면은 늦은 쪽에 모션을 맞춘다 */
export function hitDelayTicks(p: Pick<CombatParams, 'tickSeconds'>, seconds: number): number {
  return Math.max(0, Math.ceil((seconds > 0 ? seconds : 0) / p.tickSeconds - 1e-6));
}

/** 블록 공격의 타격 지연(초): 계열·단계 키 → 기본값. 블록 모션 기준 길이(GDD 7절 v6.106, C.476)가 있으면 **몸 몫만** 그 배율로 —
 *  이펙트 몫(blockFxBy, 도트 이펙트·투사체가 타격까지 걸리는 시간)은 늘 1배 (GDD 7절 v6.150, 사용자 2026-11-20 "이펙은 정상속도로", C.512). 화면도 몸동작만 배율, 이펙트는 1배 */
export function blockHitDelayOf(p: Pick<CombatParams, 'hitDelay' | 'motion'>, key: string | null, chain = chainOfKey(key)): number {
  const d = (key ? p.hitDelay.blockBy?.[key] : undefined) ?? p.hitDelay.block;
  const m = blockMotionOf(p, key, chain);
  if (!m || !(m.rate > 0)) return d;
  const fx = Math.min(d, Math.max(0, (key ? p.hitDelay.blockFxBy?.[key] : undefined) ?? 0));
  return (d - fx) / Math.max(1, m.rate) + fx; // 몸 몫 ÷ max(1, 배율) — 느린 몸도 1배(GDD 7절 v6.167, C.519)
}

/** 블록 공격 타격 지연 키: 계열 공격 = `계열:단계(1~3)`, 콤보 'combo', 해방 블록 'liberation', 그 밖(계열 없는 기본 블록) null */
export function blockHitKey(family: string | null, chain: number): string | null {
  return family ? `${family}:${Math.max(1, Math.min(3, chain))}` : null;
}

/** 전투용 소모품 효과 (GDD 105장 수정 3, provisional): heal = 최대 체력 × fraction 회복(성향·강화 회복 보정 곱), haste = seconds 동안 블록 생성 × spawnMult */
export type BattleItemEffect =
  | { id: string; effect: 'heal'; fraction: number }
  | { id: string; effect: 'haste'; seconds: number; spawnMult: number };

/** 장비 발동 효과 (GDD 105장 수정 4, provisional): shield = seconds 동안 받는 피해 −reduction, burst = 기본 공격 powerInAttacks 회분 피해 */
export type ActiveGearEffect =
  | { id: string; effect: 'shield'; seconds: number; reduction: number }
  | { id: string; effect: 'burst'; powerInAttacks: number };

/** 물공 특수 블록 (GDD 49장·49-1 2번): 계열은 블록마다 그대로, 이름·속성·효과만 바뀐다. 수치는 BALANCE.provisional.physBlocks 에서 formAbilities 가 채운다 */
/** damage = 평타형 대가 (GDD 84장 3번, C.142): 물공 몸이 주는 피해 배율(없으면 1) — 블록을 다 쓰는 블록형 몸이 조금 더 세게 */
export type PhysBlock = { element: string; power: number; damage?: number } & (
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
  /** 속성 피해 +비율 (4단계 한 줄 특성 elementDamage, C.514 석양홍 '불 피해 +8%') — evolution.ts 가 elementDamage(%) 칸에 더한다 */
  evoElementDamage?: Record<string, number>;
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
  /** 체력 below 아래에서 주는 피해 +bonus (한계 '폭주(호로화)') */
  desperate?: { below: number; bonus: number };
  /** 강적·보스에게 주는 피해 +비율 (사냥꾼) */
  eliteSlayer?: number;
  /** 전투마다 1번, 쓰러질 때 최대 체력 × 이 비율로 버틴다 (환생 '다시 일어남') */
  lastStand?: number;
  /** 주는 피해 +dealt · 받는 피해 −taken (히든 통로 '변이의 기운', GDD 149장 2) */
  mutation?: { dealt: number; taken: number };
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
  // ── 4단계 한 줄 특성 (GDD 8-7 1차, C.499 — uniques.json traits) ──
  /** 공격 속도 + (평타 간격 ÷ (1 + 값)) */
  evoAttackSpeed?: number;
  /** 평타 치명 확률 +(상한도 같이) · 블록 치명 확률 +(상한도 같이) */
  evoCrit?: number;
  evoBlockCrit?: number;
  /** chain 체인 블록 위력 +bonus */
  chainPower?: { chain: number; bonus: number }[];
  /** 피해 계산 능력치 = 공격력·지능 중 높은 쪽 */
  offenseMax?: boolean;
  /** 처형 '소멸선' (GDD 8-8): 적 체력 line 이하에서 평타 = 처형, 강적·보스는 그 아래에서 주는 모든 피해 ×eliteMult */
  execute?: { line: number; eliteMult: number };
  // ── 4단계 한 줄 특성 2차 (GDD 8-7 2차, C.515) ──
  /** 치명 피해 + (평타·블록) */
  evoCritDmg?: number;
  /** 블록 생성 간격 −비율 */
  evoSpawnCut?: number;
  /** 흡혈 + (내 공격 피해의 비율만큼 회복 — 혈 흡혈과 같은 전투 상한) */
  evoDrain?: number;
  /** 내가 거는 독 지속 피해 + */
  evoPoisonDot?: number;
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
    skills: [],
    attackPowerMultiplier: 1,
    attackSpeedMultiplier: 1,
    damageTakenMultiplier: 1,
    playerPowerMultiplier: 1,
    blockDamageMultiplier: 1,
    guardHealEnhance: 1,
    battleItem: null,
    activeGear: null,
    trayShuffleSeconds: 0,
    voidChanceBonus: 0,
    evadeChance: 0,
    playerStartHpFraction: 1,
    startShieldFraction: 0,
    enemyFirstStrike: false,
    enemyHitPacing: 1,
    liberationEnabled: true,
    liberationGaugePerBlock: LB.gaugePerBlock,
    liberationChainBonus: LB.chainBonus,
    liberationStartGauge: 0,
    liberationGaugePerDealt: LB.gaugePerDealt,
    liberationGaugePerTaken: LB.gaugePerTaken,
    liberationSeconds: LB.seconds,
    liberationSpawnSpeed: LB.spawnSpeed,
    liberationPowerInAttacks: CX.basicBlockPowerInAttacks * LB.blockPowerMultiplier,
    liberationRisk: LB.riskOnEnd,
    liberationUnique: false,
    liberationAttackSpeed: 1,
    liberationChainSpeed: 1,
    liberationStatMultiplier: 1,
    abilityEffects: {},
    elementDamage: zeroElementDamage(),
    physBlock: null,
    physBlockSpawnSeconds: BALANCE.provisional.physBlocks.spawnSeconds,
    kit: null,
    foeExecute: BALANCE.provisional.foeExecute,
  };
}

/** 엔진이 받는 입력 (GDD 3-5, 17-2: 블록 순서는 바꿀 수 없다 — 나온 순서대로 쓴다).
 *  use: 바의 cell 번째 블록 클릭 — 붙어 있는 같은 계열 공격 블록(막기·회복·기본 블록은 같은 특성)이 함께 발동해 체인이 된다 (GDD 17-3).
 *  liberate: 해방 (GDD 83장: 게이지 100 이면, 한 전투 여러 번). 저장형 필살기('stored')는 C.134 에 삭제 (GDD 83장). */
export type CombatInput =
  | { type: 'use'; cell: number }
  | { type: 'liberate' }
  /** 막기 (GDD 105장 수정 v5.233): 게이지가 다 차야 누른다 */
  | { type: 'guard' }
  /** 소모품 칸의 전투용 소모품 (전투당 1회) · 장비 발동 (쿨다운) — GDD 105장 수정 3·4 */
  | { type: 'item' }
  | { type: 'gear' }
  /** 자세 바꾸기 (GDD 12-4 천년혈전, C.460 — kit.stance 만): [자세] 버튼, 재사용 대기 switchSeconds */
  | { type: 'stance' }
  /** 발도 충전 (C.460 — draw 자세): 바의 cell 번째 지금 자세 블록을 누르기 시작 · 떼기(그 블록이 쓰이며 다음 평타 강화) */
  | { type: 'draw'; cell: number }
  | { type: 'draw-release' }
  /** 처형 막기 (GDD 8-8 v6.160 ④, C.531): 허무 적의 처형 시도 중 원형 표식을 누름 — 줄어드는 원이 표식 테두리에 닿는 순간 ± 판정 안이면 막기, 밖이면 처형당함 */
  | { type: 'execute-guard' };

export type CombatStatus = 'playing' | 'won' | 'lost';
/** 패배 까닭: 체력 0 · 시간 제한 · 허무 적에게 처형당함 (GDD 8-8 v6.160 ④, C.531) */
export type LossReason = 'hp' | 'timeout' | 'executed';

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
  /** 지속 피해(kind dot) 마무리: 그 지속 피해의 속성 (C.532, GDD 8-5 v6.164 독 진화 조건 — 독 지속 피해 = 독 속성). 속성 없는 지속 피해(진화체 자기장 등)는 없음 */
  dotElement?: string;
}

/** 적 공격 한 번의 분류 (GDD 245장 11): 물리·특수. 혼합(옛 평균)은 굴린 뒤라 없음 — 각본 전투 등 분류를 안 쓰는 피해는 표시 없음 */
export type HitCategory = 'physical' | 'special';
const shownCat = (c: AttackCategory): HitCategory | undefined => (c === 'mixed' ? undefined : c);

/** 화면 연출용 사건. 화면이 drainCombatEvents 로 비우며 그린다 */
export type CombatEvent =
  /** rate = 간격이 모션보다 짧아 빨리 감은 배율 (GDD 7-2 '빠른 간격의 모션', C.448 — 없으면 1. 앞 자르기는 swing.atTick 이 정한 타격 시각으로 화면이 맞춘다) */
  | { kind: 'player-attack'; damage: number; matchup: Matchup; crit?: boolean; elem?: ElemHit; landed?: boolean; rate?: number; kitShot?: string; kitFinisher?: boolean; kitClone?: boolean; kitMotion?: string; evoShot?: string; evoShotElement?: string; evoShotFx?: { family: string; stage: number } }
  /** cat = 이번 공격 분류 (GDD 245장 11 — 혼합 적은 공격마다 굴림, 화면 피해 숫자·로그 물리/특수 표시) */
  | { kind: 'enemy-attack'; damage: number; guarded: boolean; matchup: Matchup; crit?: boolean; landed?: boolean; cat?: HitCategory }
  /** kitName·kitFx·kitCounter·kitFinisher = 초월자 전용 블록(GDD 12-4 v6.048): 기술 이름 · 연출 키 · 반격 성공 · 마무리 기술(흑관 등) */
  | { kind: 'block'; block: Block['kind']; traitId: string | null; family: string | null; element: string | null; matchup: Matchup; role: SkillRole | null; chain: number; damage: number; weak: boolean; heal: number; guardSeconds: number; bonus: ChainBonusKind | null; crit?: boolean; elem?: ElemHit; landed?: boolean; noDamage?: boolean; kitName?: string; kitFx?: string; kitCounter?: boolean; kitFinisher?: boolean; kitCharge?: number; motionId?: number }
  /** 블록 몸동작 시작 (GDD 7-2 '블록 연속 사용 = 절충안'·'모션과 이펙트는 따로 계산', C.448): id = 그 블록 사건의 motionId. 누른 순서대로 줄을 서서 앞 모션이 끝나면 시작.
   *  rate 재생 배율 · trim 앞에서 자른 길이(1배 초). 이펙트·피해는 블록을 쓴 순간의 시간줄 그대로(이 사건과 무관) */
  | { kind: 'block-motion'; id: number; rate: number; trim: number }
  /** 재생 중인 블록 몸동작 뒤에 블록이 줄을 섰다: 남은 부분을 rate 배속으로 (GDD 7-2 절충안) */
  | { kind: 'motion-hasten'; id: number; rate: number }
  /** 초월자 반격 창이 열렸다 (GDD 12-4 v6.048 경화수월): seconds 동안 반격 블록 테두리 발광 */
  | { kind: 'kit-window'; seconds: number }
  /** 초월자 대사 띠 (반격 성공·되살아남 등) */
  | { kind: 'kit-line'; text: string; tone: 'counter' | 'revive' | 'finisher' | 'stance' }
  /** 마무리 평타 연출 시작 (C.473, GDD 12-4 v6.102): 무적·정지 seconds, 피해는 hitSeconds 뒤 */
  | { kind: 'kit-cine'; seconds: number; hitSeconds: number }
  /** 자세 모드 (GDD 12-4 천년혈전, C.460): 자세가 바뀜 · 패링 성공/실패 · 자세 무너짐(받는 피해 + seconds 초) · 천쇄참월 불 켠 블록 수 */
  | { kind: 'kit-stance'; stance: string; name: string }
  | { kind: 'kit-parry'; ok: boolean }
  | { kind: 'kit-break'; seconds: number }
  | { kind: 'kit-lantern'; lit: number }
  /** 초월자 스택이 바뀌었다 (영창 등): 지금 값·가득 값 */
  | { kind: 'kit-stack'; stack: number; full: number }
  | { kind: 'heavy-cast'; seconds: number }
  /** 강공격 빔 발사 준비 (GDD 245장 3): 예고가 끝나는 틱(atTick)에 빔이 닿고 그 순간 피해 판정 — 화면은 지금 공격 모션을 시작해 빔이 atTick 에 닿게 한다(타격 지연 hitDelay.heavy 만큼 앞서). 그 뒤 heavy-hit 는 landed: true */
  | { kind: 'heavy-windup'; atTick: number }
  | { kind: 'heavy-hit'; damage: number; guarded: boolean; reflected: number; matchup: Matchup; crit?: boolean; landed?: boolean; cat?: HitCategory }
  /** 휘두르기 (GDD 214장, C.357): 공격이 발동했고 피해는 atTick 에 들어간다. hit = 그때 다시 나올 사건(landed: true). 화면은 이때 공격 모션을 시작하고, 피해 숫자·체력 막대는 hit 가 나올 때 */
  | { kind: 'swing'; hit: SwingHit; atTick: number }
  /** 독 지속 피해 한 번 (GDD 20-2) */
  | { kind: 'dot'; target: 'enemy' | 'player'; damage: number }
  /** 혈 흡혈 회복 (GDD 20-2) */
  | { kind: 'drain'; target: 'enemy' | 'player'; heal: number }
  | { kind: 'seal'; seconds: number }
  | { kind: 'stance'; seconds: number }
  | { kind: 'stance-end' }
  | { kind: 'counter'; damage: number; guarded: boolean; matchup: Matchup; crit?: boolean; landed?: boolean; cat?: HitCategory }
  /** 해방 게이지가 찼다 (GDD 83장) */
  | { kind: 'liberation-ready' }
  | { kind: 'spawn'; index: number; block: Block['kind'] }
  /** 콤보 발동: 콤보 블록이 바 맨 오른쪽에 생겼다 (GDD 17-3) */
  | { kind: 'combo'; comboId: string }
  | { kind: 'shuffle' }
  /** 해방 시작 (GDD 83장·106장 4): 지속 초, 고유 효과(레스렉시온/만해) 여부. endless = 리스크 소모형 모드(지속 시간 없음, GDD 12-4 v6.050) */
  | { kind: 'liberate'; seconds: number; unique: boolean; endless?: boolean; name?: string }
  /** 리스크 소모형 모드에서 블록을 써 리스크가 깎였다 (GDD 12-4 v6.050): 깎인 양 · 남은 값 */
  | { kind: 'kit-risk'; spent: number; risk: number }
  /** 소모품 사용 (GDD 105장 수정 3): heal = 회복량, haste = 각성 초 */
  | { kind: 'item'; id: string; effect: BattleItemEffect['effect']; heal: number }
  /** 장비 발동 (GDD 105장 수정 4): shield = 방패 초, burst = 준 피해 */
  | { kind: 'gear'; id: string; effect: ActiveGearEffect['effect']; damage: number }
  /** 펫 공격 한 번 (GDD 241-D 4) */
  | { kind: 'pet-attack'; petId: string; damage: number; second?: boolean }
  /** 해방이 풀렸다: 리스크 게이지 상승량. endless = 리스크 소모형 모드가 끝났다 */
  | { kind: 'liberation-end'; risk: number; endless?: boolean }
  /** 보스 페이즈가 바뀌었다 (GDD 25-3): 새 페이즈 번호(2부터) */
  | { kind: 'boss-phase'; phase: number }
  /** 진화체 특성 발동 (C.89, GDD 39장 5번): 연타·되갚기·다시 일어남·연쇄. damage = 그 발동이 준 피해(없으면 0) */
  | { kind: 'ability'; effect: AbilityProc; damage: number }
  /** 진화체 고유 능력 발동 작은 글자 (GDD 8-7 1차, C.499 — 데이터 proc 글자, 처형!). damage = 그 발동이 준 피해(없으면 0) */
  | { kind: 'evo-proc'; text: string; damage: number }
  /** 보스 기믹 칸 봉인: 봉인된 블록 uid 와 시간 */
  | { kind: 'cell-seal'; uid: number; seconds: number }
  /** 보스 기믹 summon (GDD 35장): 졸개가 보스 앞에 섰다(체력) / 졸개의 작은 공격 / 졸개가 쓰러졌다 */
  | { kind: 'boss-summon'; hp: number }
  | { kind: 'minion-attack'; damage: number; guarded: boolean }
  | { kind: 'minion-down' }
  /** 회피 (GDD 101장 4번, 폭주): 적 공격 한 번을 통째로 피했다 */
  | { kind: 'evade' }
  /** 보스 기믹 element (GDD 35장): 페이즈가 바뀌며 보스 속성이 바뀌었다 */
  | { kind: 'boss-element'; element: string }
  /** 각본 전투 마무리 체인의 피해가 지금 들어갔다 (GDD 146장): 블록 사건(block)은 쓸 때, 피해 숫자·체력 감소는 이 사건에 */
  | { kind: 'script-impact'; damage: number }
  /** 허무 적의 처형 시도 (GDD 8-8 v6.160 ④, C.531): 원 테두리가 seconds 동안 줄어 atTick 에 표식 테두리에 닿는다 — 그 순간 ± windowSeconds 안에 눌러야 막는다 */
  | { kind: 'foe-execute'; seconds: number; atTick: number; windowSeconds: number }
  /** 처형 시도가 끝났다: ok = 막았다(damage = 막고도 받은 피해, stunSeconds = 적 스턴) / 못 막았다(처형 — 곧 end lost) */
  | { kind: 'foe-execute-end'; ok: boolean; damage: number; stunSeconds: number }
  | { kind: 'end'; status: CombatStatus };

/** 타격 지연이 있는 공격 사건: 발동 때 swing 안에, 맞는 순간 landed: true 로 다시 */
export type SwingHit = Extract<CombatEvent, { kind: 'player-attack' | 'enemy-attack' | 'block' | 'heavy-hit' | 'counter' }>;

/** 예약된 피해 (GDD 214장): atTick 에 landHit 가 넣는다. 데이터만(닫힘 함수 없음) — 같은 시드·입력이면 같은 결과 */
export interface PendingHit {
  atTick: number;
  target: 'enemy' | 'player';
  amount: number;
  event: SwingHit;
  /** target enemy: 마무리 일격 정보 */
  finisher?: Finisher;
  /** 맞힌 뒤 효과(혈 흡혈·독)에 쓰는 공격 속성. 없으면 효과 없음 */
  elements?: string[];
  /** 내 평타인가 (피 냄새 등 평타 전용 효과) */
  basic?: boolean;
  /** target player: 막기로 돌려주는 반사 피해(강공격) */
  reflected?: number;
}

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
  lossReason: LossReason | null;
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
    /** windup = 빔 발사 준비 사건을 냈다 (GDD 245장 3 — 그 뒤로는 경직으로 늦춰지지 않는다: 빔이 이미 나가는 중) */
    cast: { ticks: number; total: number; hitsLeft: number; windup?: boolean } | null;
    /** 적 능력치 = 기준 능력치 × 성향 (GDD 20-3) */
    stats: Stats;
    /** 독 지속 피해: 남은 틱과 틱당 피해 */
    dot: Dot | null;
    /** 방어 자세 중이면 남은 틱: 내 블록 피해가 줄고, 블록을 쓸 때마다 반격을 받는다 */
    stance: { ticks: number } | null;
    /** 이 전투에서 흡혈로 되찾은 체력 합계 (상한 drainCapFraction, C.53) */
    drained?: number;
    /** 처형을 막혀 스턴 (GDD 8-8 v6.160 ④, C.531): 남은 틱 동안 공격·시전·특수 행동이 멈추고 받는 피해 × stunTakenMult */
    stunTicks?: number;
  };
  /** 허무 적의 처형 (GDD 8-8 v6.160 ④, C.531) — 처형하는 적일 때만 생긴다. ring = 지금 시도(원이 hitTick 에 닿는다), nextTick = 다음 시도가 되는 틱, attempts·blocked = 시도·막은 수(전투 기록) */
  execution?: { ring: { startTick: number; hitTick: number } | null; nextTick: number; attempts: number; blocked: number };
  /** 초월자 전용 블록 상태 (GDD 12-4 v6.048, C.441) — params.kit 이 있을 때만 */
  kit?: KitCombatState;
  /** 진화체 고유 능력 상태 (GDD 8-7 1차, C.499) — params.evo 또는 처형 특성이 있을 때만. 저장하지 않는다 */
  evo?: EvoState;
  /** shield: 남은 보호막 (GDD 25-5 성역·갈림길, 없으면 0) */
  player: { hp: number; maxHp: number; attackTimer: number; stats: Stats; dot: Dot | null; drained?: number; shield?: number };
  /** 다음 펫 공격까지 남은 틱 (params.petAttack 이 있을 때만, GDD 241-D 4) */
  petTimer?: number;
  /** 2번째 칸 펫 다음 공격까지 남은 틱 (C.506) */
  petTimer2?: number;
  tray: Tray;
  nextUid: number;
  /** 다음 블록 생성까지 남은 틱 (GDD 84장 6번, C.136): 생성 타이머는 하나, 나올 때마다 출현표(spawnTableOf)에서 뽑는다 */
  spawnTimer: number;
  /** 물공 생성원 타이머가 낸 블록 수 (GDD 49-11 판당 개수 측정용) */
  physSpawned?: number;
  /** 이 전투에서 받은 피해 합계 (바위 자세 감소 뒤, 보호막 전 — GDD 49-9 흙 버티기 측정용) */
  damageTaken?: number;
  shuffleTimer: number;
  /** 봉인: 남은 틱 동안 스킬 블록 생성 정지 */
  sealTicks: number;
  /** 막기 상태: 남은 틱, 그 막기에 붙은 반사 배율 */
  guard: { ticks: number; reflect: number };
  /** 공허 블록 경직 남은 틱 (101장 추가 결정 2번): 막기처럼 기본 공격·블록 생성이 멈춘다 */
  stunTicks?: number;
  /** 막기 게이지 0~1 (GDD 105장 수정 v5.233): 1 이면 누를 수 있고, 쓰면 0 부터 */
  guardGauge: number;
  /** 막기 게이지가 이 전투에서 한 번이라도 가득 찼는가 (GDD 121장 11: 첫 강공격은 그 뒤에만) */
  guardFilled?: boolean;
  /** 소모품을 이 전투에서 썼는가 · 각성(블록 생성 가속) 남은 틱 */
  itemUsed: boolean;
  hasteTicks: number;
  /** 장비 발동 쿨다운 남은 틱 · 발동 방패(받는 피해 감소) 남은 틱 */
  gearCooldown: number;
  gearShieldTicks: number;
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
  /** 회피한 적 공격 수 (GDD 101장 4번, 폭주) */
  evades?: number;
  /** 공허 블록 사용으로 오른 리스크 게이지 값 */
  riskGained: number;
  finisher: Finisher | null;
  /** 해방 (GDD 83장): 게이지(0~100), 처음 쓴 틱, 쓴 횟수, 남은 지속 틱, 쓰기 전 능력치·최대 체력(풀릴 때 되돌린다), 끝날 때 오른 리스크 합 */
  liberation: LiberationState;
  /** 예약된 피해 (GDD 214장, C.357): 틱 시작에 atTick 이 된 것부터 순서대로 넣는다. 전투가 끝나면 남은 것은 버린다. 옛 상태(없음) = 빈 목록 */
  pendingHits?: PendingHit[];
  /** 블록 몸동작 줄 (GDD 7-2, C.448): 재생 중(끝 틱·배율) + 기다리는 것(누른 틱·키). 재생 중이거나 기다리는 게 있으면 평타 타이머가 멈춘다. 옛 상태(없음) = 빈 줄 */
  motion?: { cur: { id: number; endTick: number; rate: number } | null; queue: { id: number; key: string | null; chain: number; pressTick: number }[]; seq: number };
  /** 보스전이면 페이즈·기믹 상태 (GDD 25-3), 일반 전투는 없음 */
  boss?: BossState;
  /** 받아들여진 입력 기록 (같은 시드로 다시 돌리면 같은 결과) */
  inputs: { tick: number; input: CombatInput }[];
  events: CombatEvent[];
  /** 각본 전투 (첫 원정 첫 전투, GDD 123장 5, C.199): 있으면 무작위 블록 생성·적 일반 공격·특수 행동·치명타가 꺼지고, 진행은 engine/combat/script 가 정한다 */
  script?: CombatScript;
}

/** 각본 전투 상태 (GDD 123장 5). 단계 진행은 engine/combat/script.ts, 전투 엔진은 아래 값만 본다 */
export interface CombatScript {
  stage: string;
  /** 이번 단계에서 센 내 기본 공격 수 · 지난 틱 수 · 생긴 블록 수 */
  hits: number;
  ticks: number;
  spawned: number;
  /** 지금 받아 주는 입력 종류 (나머지는 applyInput 이 거절) */
  allow: CombatInput['type'][];
  /** 막지 못한 강공격이 체력을 이 비율(최대 체력 대비)만 남긴다 */
  leaveHpFraction: number;
  /** 이번 단계에서 착탄한 강공격 수 */
  heavyHits: number;
  /** true 면 적을 쓰러뜨릴 수 있다 (그 전에는 적 체력이 1 아래로 안 내려간다) */
  lethal: boolean;
  /** 마무리 체인 (GDD 146장): holdHit 동안 준 피해는 바로 들어가지 않고 held 에 맡겨 둔다 → 연출이 닿는 순간 scriptLandHit 이 넣는다 */
  holdHit?: boolean;
  held?: { amount: number; finisher: Finisher } | null;
}

export interface LiberationState {
  gauge: number;
  /** 처음 쓴 틱 (안 썼으면 null, 런 로그 liberationAt) */
  usedAtTick: number | null;
  /** 이 전투에서 쓴 횟수, 해방 중 발동한 블록(체인) 수 (런 로그) */
  uses: number;
  chains: number;
  ticksLeft: number;
  /** 옛 해방 생성 누적·슬롯 순번 (C.136 부터 쓰지 않음 — 해방 블록도 출현표에서 뽑는다, 구조만 유지) */
  spawnAcc: number;
  nextSlot: number;
  base: { stats: Stats; maxHp: number } | null;
  /** 해방이 끝나며 오른 리스크 게이지 합 (안 썼으면 0). 원정·둥지가 전투 뒤에 반영한다 */
  risk: number;
  /** 각본 전투(튜토리얼)에서 켠 해방이면 true — 풀려도 리스크가 오르지 않는다 (GDD 241-B 1) */
  scripted?: boolean;
  /** 게이지 모드 (GDD 12-4 v6.052 붕옥 융합): 지속 시간 없음 — 틱으로 줄지 않고 게이지가 문턱 밑이면 끝 (ticksLeft 는 1 로 둔다) */
  endless?: boolean;
}

export interface Dot {
  ticks: number;
  perTick: number;
  /** 이 지속 피해를 건 속성 (C.532 — 특수 효과 poison 속성). 옛 중간 저장엔 없음 */
  element?: string;
}

export interface CombatSetup {
  enemy: EnemyDef;
  params?: Partial<CombatParams>;
  /** 보스전 (GDD 25-3, C.58): 페이즈·기믹·시간 제한. 없으면 일반 전투 */
  boss?: BossSetup;
  /** 각본 전투 상태 (GDD 123장 5, engine/combat/script newCombatScript) */
  script?: CombatScript;
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

/** 지금 체인 상한 (C.514): 기본 maxChain, 진화체 고유 능력 chainExtend 가 있으면 그 값(해방 중 값 포함 — 현음 4·만해 5). 바 묶음·사용·봇·화면이 다 이것을 쓴다 */
export function chainCapOf(s: Pick<CombatState, 'params' | 'liberation'>): number {
  const base = maxChain(s.params);
  return s.params.evo ? evoChainCapOf(s, base) : base;
}

/** 기본 블록 5종의 생성원 (GDD 44장): 공격(계열은 블록마다 풀이 정한다)·막기·회복. 막기·회복 세기 = 같은 역할 흡수 특성 기본값 × 비율 */
export function basicSources(p: CombatParams): CombatSkill[] {
  const bp = p.blockPool;
  // 물공 특수 블록 (GDD 49-1 2번): 기본 공격 블록 3계열 전부 = 그 속성 · 물리 분류 · 표의 피해 배율. 계열(체인)·막기·회복은 그대로
  const pb = p.physBlock;
  const attack: CombatSkill = pb
    ? { id: BASIC_SKILL_ID, element: pb.element, category: 'physical', family: null, role: 'attack', powerInAttacks: p.basicBlockPowerInAttacks, chainBonus: p.basicBlockChainBonus, powerMultiplier: pb.power }
    : { id: BASIC_SKILL_ID, element: null, category: 'mixed', family: null, role: 'attack', powerInAttacks: p.basicBlockPowerInAttacks, chainBonus: p.basicBlockChainBonus, powerMultiplier: p.basicAttackEnhance ?? 1 };
  return [
    attack,
    { id: BASIC_GUARD_ID, element: null, category: 'mixed', family: null, role: 'guard', powerInAttacks: bp.basicRoleBlocks.guard.powerInAttacks, chainBonus: { ...bp.basicRoleBlocks.guard.chainBonus }, powerMultiplier: bp.basicGuardRatio * (p.guardHealEnhance ?? 1) },
    { id: BASIC_HEAL_ID, element: null, category: 'mixed', family: null, role: 'heal', powerInAttacks: bp.basicRoleBlocks.heal.powerInAttacks, chainBonus: { ...bp.basicRoleBlocks.heal.chainBonus }, powerMultiplier: bp.basicHealRatio * (p.guardHealEnhance ?? 1) },
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

/** 칸 수별 기본 블록 몫 (GDD 80장 v5.166: 0칸 100% · 1칸 45% · 2칸 25% · 3칸 15%) */
export function basicShareOf(p: CombatParams, slots: number = p.skills.length): number {
  const t = p.blockPool.basicShareBySlots;
  return t[Math.min(Math.max(0, slots), t.length - 1)] ?? 1;
}

/**
 * 기본 블록 타이머 간격(초) (GDD 44-1 B안 → 44-3, C.98): 흡수 0칸이면 basicSpawnSeconds. 흡수 칸이 있으면
 * 흡수 블록 총 간격(특성마다 blockSpawnSeconds × 칸 보정, 성향·같은 계열 겹침은 빼고) × (1 − 기본 몫) / 기본 몫 → 기본 몫이 표대로 나온다.
 * 블록 가속 배율로 나눈다
 */
export function basicSpawnSecondsOf(p: CombatParams): number {
  const bp = p.blockPool;
  const n = p.skills.length;
  const base = n === 0
    ? bp.basicSpawnSeconds
    : (() => {
        const share = Math.min(0.999, Math.max(0.001, basicShareOf(p)));
        const absorbedTotalSeconds = (p.blockSpawnSeconds * (1 + bp.absorbedSlowdownPerSlot * (n - 1))) / n;
        return (absorbedTotalSeconds * (1 - share)) / share;
      })();
  return base / p.blockSpawnMultiplier;
}

/** 기본 타이머가 뽑는 풀 (GDD 49-11·105장): 물공 몸이면 없음, 아니면 blockPoolOf 그대로. 충전(뇌 특성)은 blockPoolOf(공격 포함)에서 뽑는다 */
export function basicTimerPoolOf(p: CombatParams): PoolEntry[] {
  // 물공 몸은 기본 공격 자리를 물공 블록이 차지하고, 막기·회복은 버튼이라(GDD 105장) 기본 타이머가 낼 블록이 없다
  return p.physBlock ? [] : blockPoolOf(p);
}

/** 물공 블록 생성원 타이머 간격(초) (GDD 49-11, C.105): 물공 몸만. 블록 가속 배율로 나눈다 */
export function physSpawnSecondsOf(p: CombatParams): number | null {
  return p.physBlock ? p.physBlockSpawnSeconds / p.blockSpawnMultiplier : null;
}

/**
 * 기본 블록 풀 (GDD 44장 2·4번): 기본 타이머가 블록을 낼 때 이 확률로 하나를 뽑는다 (합 1). 가중 = 공격 계열마다·막기·회복 × 성향 보정.
 * 기본 공격은 종족 계열 표(params.families)의 계열마다 한 칸 — 계열 표가 없으면 계열 없는 한 칸(가중 = 공격 가중 × 3)
 */
export function blockPoolOf(p: CombatParams): PoolEntry[] {
  const bp = p.blockPool;
  const mult = temperamentOf(p);
  const [atk] = basicSources(p);
  const fams = Object.keys(p.families);
  const BASIC_FAMILY_COUNT = 3;
  // 막기·회복은 블록이 아니라 버튼 (GDD 105장): 기본 블록 풀은 공격 계열만
  const basic: { source: CombatSkill; family: string | null; w: number }[] = fams.length > 0
    ? fams.map((f) => ({ source: atk!, family: f, w: bp.basicWeights.attack * mult.attack }))
    : [{ source: atk!, family: null, w: bp.basicWeights.attack * BASIC_FAMILY_COUNT * mult.attack }];
  const total = basic.reduce((a, x) => a + x.w, 0);
  return basic.map((x) => ({ source: x.source, family: x.family, chance: total > 0 ? x.w / total : 0 }));
}

/** 초당 블록 생성 기대치 (바가 차거나 봉인·막기 중이 아닐 때, 출현표 기준 — GDD 84장 6번): 흡수 특성 블록 합 / 기본 공격 블록 / 물공 블록 / 기본 막기·회복(고정 몫).
 *  absorbedShare = 공격 블록 중 흡수 블록 몫 (80장 기본 몫 = 1 − 이 값, 물공 몸은 물공 블록이 기본 공격 자리). 44-1 비율 표·테스트용 */
export function spawnRatesOf(p: CombatParams): { absorbed: number; basic: number; absorbedShare: number; phys: number; role: number } {
  const t = spawnTableOf(p);
  const total = 1 / t.seconds;
  const r = { absorbed: 0, basic: 0, phys: 0, role: 0 };
  for (const e of t.entries) {
    if (e.kind !== 'skill' || !e.source) continue;
    const rate = e.chance * total;
    if (e.phys) r.phys += rate;
    else if (e.source.role !== 'attack') r.role += rate;
    else if (isBasicBlockId(e.source.id)) r.basic += rate;
    else r.absorbed += rate;
  }
  const atk = r.absorbed + r.basic + r.phys;
  return { ...r, absorbedShare: atk > 0 ? r.absorbed / atk : 0 };
}

/** 기본 블록 풀에서 하나를 뽑는다 (전투 난수). timer = 기본 타이머용(물공 몸은 공격 빼고), 아니면 전체 풀 */
function drawBasic(s: CombatState, pool: PoolEntry[] = blockPoolOf(s.params)): PoolEntry | null {
  let r = nextFloat(s.rng);
  for (const e of pool) {
    if (r < e.chance) return e;
    r -= e.chance;
  }
  return pool[pool.length - 1] ?? null;
}

/** 블록 출현표 한 칸 (GDD 84장 6번, C.136): 생성 타이머가 블록을 낼 때 이 확률로 하나를 뽑는다 (합 1).
 *  source = 블록 생성원(공허는 null), family = 블록 계열, phys = 물공 생성원 몫(계열은 뽑을 때 고르게) */
export interface SpawnEntry {
  kind: 'skill' | 'void';
  source: CombatSkill | null;
  family: string | null;
  chance: number;
  phys?: boolean;
}

/**
 * 블록 출현표 (GDD 84장 6번, C.136): **타이머 하나 + 확률표 한 장**. 옛 구조(흡수 특성마다 타이머 + 기본 타이머 + 물공 타이머 + 공허 시계)는
 * 조·탄·교를 다 먹으면 조→탄→교 순서로 규칙적으로 나왔다(사용자 "이게 아냐"). 지금은 각 생성원의 초당 몫(옛 타이머 간격의 역수 — 칸 수별 기본 몫 80장,
 * 같은 계열 겹침·성향 보정 그대로)을 더한 것이 총량, 몫 ÷ 총량이 그 블록의 확률이다. 새로 흡수하면 그 블록이 몫을 받고 다른 몫이 줄어든다.
 * 공허 블록 (GDD 101장, C.173): 따로 몫을 더하지 않고 블록 하나가 생길 때 그 자리가 voidChanceOf 확률로 공허가 된다(나머지 칸은 × (1 − 공허 확률)) — 간격은 그대로, 쓸 블록만 준다.
 * 해방 중에도 이 표 그대로, 간격만 해방 생성 배율로 줄인다 (GDD 106장 4 확정 v5.236 — 옛 '해방 표 = 장착 본체 블록' 98장 B 대체).
 * 돌려주는 seconds = 블록 하나가 나오는 평균 간격(초) = 1 ÷ 총량
 */
export function spawnTableOf(p: CombatParams, releasing = false, kitRisk: number | null = null, stanceBlock: string | null = null): { seconds: number; entries: SpawnEntry[] } {
  if (p.kit) return kitSpawnTableOf(p, p.kit, releasing, kitRisk, stanceBlock);
  const rates: { kind: SpawnEntry['kind']; source: CombatSkill | null; family: string | null; rate: number; phys?: boolean }[] = [];
  // 공격 몫: 흡수 특성마다(옛 타이머 간격의 역수) + 기본 공격(80장 칸 수별 기본 몫) 또는 물공 몸의 물공 블록(49-11)
  for (const src of p.skills) rates.push({ kind: 'skill', source: src, family: src.family ?? null, rate: 1 / spawnSecondsOf(p, src) });
  const phys = physSpawnSecondsOf(p);
  const [atk] = basicSources(p);
  if (phys !== null) rates.push({ kind: 'skill', source: atk!, family: null, rate: 1 / phys, phys: true });
  else {
    const basicRate = 1 / basicSpawnSecondsOf(p);
    const attackPool = blockPoolOf(p).filter((e) => e.source.role === 'attack');
    const sum = attackPool.reduce((a, e) => a + e.chance, 0);
    for (const e of attackPool) rates.push({ kind: 'skill', source: e.source, family: e.family, rate: sum > 0 ? (basicRate * e.chance) / sum : 0 });
  }
  // 막기·회복은 블록에서 빠졌다 (GDD 105장, 옛 84장 7번 고정 몫): 그 몫(freedRoleShare)을 공격 블록 생성 속도로 돌려준다
  const boost = 1 / Math.max(0.1, 1 - (p.blockPool.freedRoleShare ?? 0));
  for (const r of rates) r.rate *= boost;
  const total = Math.max(1e-6, rates.reduce((a, x) => a + x.rate, 0));
  const v = Math.max(0, voidChanceOf(p));
  const entries: SpawnEntry[] = rates.map((x) => ({ kind: x.kind, source: x.source, family: x.family, chance: (x.rate / total) * (1 - v), ...(x.phys ? { phys: true } : {}) }));
  if (v > 0) entries.push({ kind: 'void', source: null, family: null, chance: v });
  return { seconds: 1 / total, entries };
}

/** 초월자 전용 블록 출현표 (GDD 12-4 v6.048, C.441 → v6.052 C.443): 일반 블록(기본·흡수·물공)이 없고 전용 블록만. 간격 = 흡수 0칸 몸의 기본 간격(같은 가속 보정).
 *  해방 밖 = releaseOnly·voidSlot 아닌 블록끼리 weight 로 나눔, 해방 중 = releaseSwap 가 없는 블록(바뀌어 사라지는 블록 빼고 releaseOnly 포함)끼리.
 *  voidSlot 블록(붕옥)이 있으면 폭주 블록 자리를 그 블록이 받는다: 확률 = 고정 기본 몫 base + 폭주 블록 공식 × voidScale(C.489), 게이지(kitRisk)가 가득이면 0, 해방 중엔 없음(바뀐 블록이 weight 로 나옴).
 *  voidSlot 블록이 없으면 허 몫 그대로 */
function kitSpawnTableOf(p: CombatParams, kit: CombatKit, releasing: boolean, kitRisk: number | null, stanceBlock: string | null): { seconds: number; entries: SpawnEntry[] } {
  const seconds = spawnTableOf({ ...p, kit: null, skills: [], physBlock: null }).seconds;
  // 자세 모드 (GDD 12-4 천년혈전, C.460): 지금 자세의 블록만, 공허 블록 없음 (리스크 패널티 없음)
  if (kit.stance) {
    const id = stanceBlock ?? kit.stance.stances[0]!.block;
    const b = kit.blocks.find((x) => x.id === id);
    return { seconds, entries: b ? [{ kind: 'skill', source: kitSkillOf(p, b), family: null, chance: 1 }] : [] };
  }
  const slots = kit.blocks.filter((b) => b.voidSlot).sort((a, b) => a.voidSlot!.order - b.voidSlot!.order);
  const picks = releasing
    ? kit.blocks.filter((b) => !b.releaseSwap && !b.voidSlot)
    : kit.blocks.filter((b) => !b.releaseOnly && !b.voidSlot);
  const total = Math.max(1e-6, picks.reduce((a, b) => a + b.weight, 0));
  const full = kitRisk !== null && !!kit.riskRelease && kitRisk >= kit.riskRelease.limit;
  const base = Math.max(0, voidChanceOf(p));
  const entries: SpawnEntry[] = [];
  let rest = 1;
  // 게이지 소모형(GDD 12-4 v6.069 이치고): 전용 블록만 — 공허 블록 없음(게이지가 오르지 않는다)
  if (!slots.length && base > 0 && !kit.riskDrain) {
    entries.push({ kind: 'void', source: null, family: null, chance: base });
    rest = 1 - base;
  }
  // 허 공식 몫 블록마다 따로 굴림 (v6.066): 앞 블록이 안 걸린 몫(rest) × 이 블록 확률. 해방 중엔 없음, 게이지를 올리는 블록은 게이지 가득이면 없음
  for (const b of slots) {
    // 확률 = 고정 기본 몫 base + 폭주 블록 공식 × voidScale (C.489 GDD v6.121 — 공식만이면 기본 2%라 거의 안 나옴)
    const v = releasing || (full && b.voidSlot!.riskGain) ? 0 : Math.min(1, (b.voidSlot!.base ?? 0) + base * b.voidSlot!.voidScale);
    if (v <= 0) continue;
    entries.push({ kind: 'skill', source: kitSkillOf(p, b), family: null, chance: rest * v });
    rest *= 1 - v;
  }
  for (const b of picks) entries.push({ kind: 'skill', source: kitSkillOf(p, b), family: null, chance: (b.weight / total) * rest });
  const at = (e: SpawnEntry): number => (e.source ? kit.blocks.findIndex((b) => KIT_TRAIT_PREFIX + b.id === e.source!.id) : -1);
  entries.sort((x, y) => at(x) - at(y)); // 데이터 순서로 (뽑기 확률은 순서와 무관)
  return { seconds, entries };
}

/** 전용 블록의 생성원 모양 (출현표·화면 공용 — 피해는 kitDamageOf 가 따로 계산) */
export function kitSkillOf(p: CombatParams, b: CombatKitBlock): CombatSkill {
  return { id: KIT_TRAIT_PREFIX + b.id, element: null, category: 'mixed', family: null, role: 'attack', powerInAttacks: b.power, chainBonus: p.basicBlockChainBonus, powerMultiplier: b.mult };
}

/** 지금 스택이 줄이는 생성 주기(초) (영창 — 스택 1당 cutPerStack, 최대 maxCut) */
export function kitSpawnCutOf(s: Pick<CombatState, 'params' | 'kit'>): number {
  const st = s.params.kit?.blocks.find((b) => b.stack)?.stack;
  if (!st || !s.kit) return 0;
  return Math.min(st.maxCut, st.cutPerStack * s.kit.stack);
}

/** 반격 창이 열려 있는가 (화면: 반격 블록 테두리 발광) */
export function kitCounterOpen(s: Pick<CombatState, 'kit' | 'tick'>): boolean {
  return !!s.kit && s.tick <= s.kit.counterUntil;
}

/** 출현표에서 하나를 뽑는다 (전투 난수) */
function drawSpawn(s: CombatState, entries: readonly SpawnEntry[]): SpawnEntry | null {
  let r = nextFloat(s.rng);
  for (const e of entries) {
    if (r < e.chance) return e;
    r -= e.chance;
  }
  return entries[entries.length - 1] ?? null;
}

/** 출현표 항목의 블록 속성: 물공 = 내 속성, 생성원 = 그 속성(기본 블록은 내 속성) */
function spawnEntryElement(p: CombatParams, e: SpawnEntry): string | null {
  if (e.kind === 'void') return 'void';
  if (e.phys || isBasicBlockId(e.source?.id)) return e.source?.element ?? p.playerElements[0] ?? NORMAL_ELEMENT;
  return e.source?.element ?? null;
}

/**
 * 진화체 고유 능력 출현표 손질 (GDD 8-7 2차, C.515) 뒤 뽑기 — 고유 능력이 없으면 그대로 drawSpawn.
 * ① 다음 블록 강제(비보라 forceNext): 그 속성 항목만(공허 제외)으로 뽑고 대기 −1 (그 속성 생성원이 없으면 평소대로, 대기 그대로)
 * ② 저절로 안 생기는 속성(추파카브라 spawnExclude): 그 항목을 빼고 남은 몫 그대로 — 그 몫이 뽑히면 이번엔 안 생김(다른 블록 몫은 평소대로)
 * ③ 자기 블록 확률 +p(브라사 selfBlock·selfSpawn): 다른 스킬 블록 몫에서 bonus 만큼 자기 블록 몫으로 옮긴다(공허 몫 그대로)
 */
function drawSpawnEvo(s: CombatState, entries: readonly SpawnEntry[]): SpawnEntry | null {
  if (!s.params.evo || !s.evo) return drawSpawn(s, entries);
  const p = s.params;
  const rule = evoSpawnRulesOf(s);
  if (rule.forced) {
    const only = entries.filter((e) => e.kind === 'skill' && spawnEntryElement(p, e) === rule.forced);
    const sum = only.reduce((a, e) => a + e.chance, 0);
    if (only.length > 0 && sum > 0) {
      const e = drawSpawn(s, only.map((x) => ({ ...x, chance: x.chance / sum })));
      if (e) evoForcedUsed(s);
      return e;
    }
  }
  let list = entries.map((e) => ({ ...e }));
  // ④ 오리지널 블록으로 바뀐 속성(공화 낙화 블록 originalBlock fixed, C.531): 그 흡수 블록 항목을 빼고 그 몫을 남은 스킬 블록에 비율대로 — 남은 스킬 블록이 없으면 그 몫은 이번엔 안 생김
  if (rule.drop) {
    const isDrop = (e: SpawnEntry) => e.kind === 'skill' && !e.phys && !isBasicBlockId(e.source?.id) && spawnEntryElement(p, e) === rule.drop;
    const gone = list.filter(isDrop).reduce((a, e) => a + e.chance, 0);
    const rest = list.filter((e) => e.kind === 'skill' && !isDrop(e)).reduce((a, e) => a + e.chance, 0);
    if (gone > 0) list = rest > 0
      ? list.filter((e) => !isDrop(e)).map((e) => (e.kind === 'skill' ? { ...e, chance: e.chance * (rest + gone) / rest } : e))
      : list.map((e) => (isDrop(e) ? { ...e, kind: 'void' as const, source: null, excluded: true } : e));
  }
  if (rule.exclude.length > 0) list = list.map((e) => (e.kind === 'skill' && rule.exclude.includes(spawnEntryElement(p, e) ?? '') ? { ...e, kind: 'void' as const, source: null, chance: e.chance, excluded: true } : e));
  if (rule.self) {
    const isSelf = (e: SpawnEntry & { excluded?: boolean }) => e.kind === 'skill' && !e.excluded && e.family === rule.self!.family && spawnEntryElement(p, e) === rule.self!.element;
    const mine = list.filter(isSelf).reduce((a, e) => a + e.chance, 0);
    const other = list.filter((e) => e.kind === 'skill' && !(e as { excluded?: boolean }).excluded && !isSelf(e)).reduce((a, e) => a + e.chance, 0);
    const move = Math.min(other, rule.self.bonus);
    if (mine > 0 && move > 0) list = list.map((e) => (isSelf(e) ? { ...e, chance: e.chance * (mine + move) / mine } : e.kind === 'skill' && !(e as { excluded?: boolean }).excluded ? { ...e, chance: e.chance * (other - move) / other } : e));
  }
  const e = drawSpawn(s, list) as (SpawnEntry & { excluded?: boolean }) | null;
  return e?.excluded ? null : e;
}

/** 지금 생성 타이머 간격(초): 해방 중이면 해방 생성 배율로, 각성(전투 소모품) 중이면 그 배율로 줄인다 */
function spawnIntervalOf(s: CombatState): number {
  const it = s.params.battleItem;
  const haste = s.hasteTicks > 0 && it?.effect === 'haste' ? it.spawnMult : 1;
  const curve = (spawnTableOf(s.params).seconds * blockSpeedFactorOf(s.params) * evoSpawnFactorOf(s.params)) / (liberationActive(s) ? liberationSpawnSpeedOf(s.params) : 1) / haste;
  // 영창 스택 (GDD 12-4 v6.048 귀도): 스택만큼 주기를 줄인다(빼기) + 속도 옵션(빼기). 상한 (GDD v6.055 7절): 다 합쳐도 블록 1초에 1개보다 빨리 돌지 않는다 (옛 영창 하한 0.3초 대체)
  return speedSeconds(curve, kitSpawnCutOf(s) + (s.params.spawnSecondsCut ?? 0), CX.spawnSecondsMin);
}

/** 속도 간격 (GDD v6.055 8절, 사용자): [곡선 값을 0.01초 단위로 반올림] − 옵션 감소 합, 상한(min) 아래로는 안 간다 */
export function speedSeconds(curve: number, cut: number, min: number): number {
  return Math.max(min, Math.round(curve * 100) / 100 - Math.max(0, cut));
}

/** 속도 곡선 배율 (GDD v6.055 8절, 사용자 — 공격·블록 같은 모양): (세계 기준 50 ÷ 능력치)^speedExponent. 능력치 50 = 1, 100 = 0.785, 430 = 0.47 */
export function speedFactorOf(ref: number, stat: number): number {
  return Math.pow(ref / Math.max(1, stat), CX.speedExponent);
}

/** 블록속도 배율: 블록 생성 간격에 곱한다 (1 보다 작으면 블록이 빨리 생긴다). 상한은 spawnIntervalOf */
export function blockSpeedFactorOf(p: Pick<CombatParams, 'playerStats' | 'playerRefStat'>): number {
  return speedFactorOf(p.playerRefStat, playerStatsOf(p).bspd);
}

/** 평소(해방·가속·스택 없음) 블록 생성 간격(초): 출현표 평균 간격 × 블록속도 배율 → 0.01초 반올림 − 옵션, 상한 적용 (상태 화면 블록속도 값) */
export function baseSpawnSecondsOf(p: CombatParams): number {
  return speedSeconds(spawnTableOf(p).seconds * blockSpeedFactorOf(p) * evoSpawnFactorOf(p), p.spawnSecondsCut ?? 0, CX.spawnSecondsMin);
}

/** 4단계 한 줄 특성 '블록 생성 간격 −' (GDD 8-7 2차 토르멘타, C.515): 간격에 곱하는 배율 */
function evoSpawnFactorOf(p: Pick<CombatParams, 'abilityEffects'>): number {
  return Math.max(0.05, 1 - (p.abilityEffects?.evoSpawnCut ?? 0));
}

/** 지금 블록 생성 타이머 간격(초) — 상한 적용 뒤 (화면·테스트) */
export function spawnSecondsNow(s: CombatState): number {
  return spawnIntervalOf(s);
}

/** 물공 블록의 계열: 종족 계열 표에서 하나를 고르게 뽑는다 (계열 표가 없으면 계열 없음) */
function drawPhysFamily(s: CombatState): string | null {
  const fams = Object.keys(s.params.families);
  if (fams.length === 0) return null;
  return fams[Math.min(fams.length - 1, Math.floor(nextFloat(s.rng) * fams.length))] ?? null;
}

// ── 능력치·상성 (GDD 20-1~20-3) ──

export function uniformStats(v: number): Stats {
  return { hp: v, atk: v, int: v, def: v, spr: v, aspd: v, bspd: v };
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

/** 내 자동 기본 공격 간격(초) (GDD v6.055 8절 속도 곡선, 사용자): 기본 간격 × (세계 기준 50 ÷ 공격속도)^0.35 ÷ 배율 → 0.01초 반올림 − 옵션, 상한 0.3초. 해방·가속 중 값은 currentAttackSeconds */
export function playerAttackSecondsOf(p: CombatParams): number {
  return speedSeconds(attackCurveOf(p), p.attackSecondsCut ?? 0, CX.attackSecondsMin);
}

/** 평타 곡선 값(반올림·옵션·상한 전) */
function attackCurveOf(p: CombatParams): number {
  return (p.playerAttackSeconds * speedFactorOf(p.playerRefStat, playerStatsOf(p).aspd)) / (p.attackSpeedMultiplier * (1 + (p.abilityEffects?.evoAttackSpeed ?? 0)));
}

// ── 해방 (GDD 83장: 영력 해방 · 레스렉시온/만해, 옛 저장형 필살기 게이지) ──

/** 해방 게이지 상한 */
export const LIBERATION_GAUGE_MAX = LB.gaugeMax;

/** 해방 중인가 */
export function liberationActive(s: CombatState): boolean {
  return s.liberation.ticksLeft > 0;
}

/** 지금 해방할 수 있는가: 켜짐 + 게이지 가득 + 해방 중이 아님 (한 전투에 여러 번) */
/** 각본 전투 (GDD 123장 5): 지금 단계가 이 입력을 받지 않으면 그 버튼은 잠긴 모습(흐림) — 해방·소모품·장비가 '준비됨'으로 빛나지 않게 */
function scriptLocked(s: CombatState, type: CombatInput['type']): boolean {
  return !!s.script && !s.script.allow.includes(type);
}

export function canLiberate(s: CombatState): boolean {
  if (s.status !== 'playing' || scriptLocked(s, 'liberate') || !s.params.liberationEnabled || liberationActive(s)) return false;
  // 게이지 모드 해방 (GDD 12-4 v6.052 붕옥 융합): 해방 게이지 대신 붕옥 감응도가 문턱 이상이면 언제든
  const rr = s.params.kit?.riskRelease;
  if (rr) return (kitRiskOf(s) ?? 0) >= rr.minRisk;
  // 자세 모드 (GDD 12-4 천년혈전, C.460): 지금 자세 스택이 releaseAt 이상이면 그 자세의 만해 (해방 게이지 없음)
  const sk = s.params.kit?.stance;
  if (sk) return !!s.kit && (s.kit.stanceStacks[s.kit.stance] ?? 0) >= sk.releaseAt;
  // 게이지 소모형 (GDD 12-4 v6.069): 게이지 0 이면 해방 게이지 대신 수련 게이지가 가득일 때 두 번째 해방(무월)
  const ms = s.params.kit?.mastery;
  if (s.params.kit?.riskDrain && s.kit && s.kit.risk <= 0) return !!ms && s.kit.mastery >= ms.full;
  return s.liberation.gauge >= LIBERATION_GAUGE_MAX;
}

/** 해방을 처음 쓴 시각(초), 안 썼으면 null (런 로그) */
export function liberationUsedAt(s: CombatState): number | null {
  return s.liberation.usedAtTick === null ? null : Math.round(s.liberation.usedAtTick * s.params.tickSeconds * 10) / 10;
}

/** 고유 효과(레스렉시온/만해)가 지금 켜져 있는가 */
function uniqueActive(s: CombatState): boolean {
  return s.params.liberationUnique && liberationActive(s);
}

/** 지금 내 평타 간격: 고유 효과 중이면 공격 속도 배율만큼 짧다 */
function currentAttackSeconds(s: CombatState): number {
  // 자세 평타 간격 고정 (GDD 12-4 천년혈전 대도 1초·천쇄참월 0.8초, C.460) — 빠른 몫은 stanceFixedExcess 가 추가 피해로
  const fx = stanceFixedSecondsOf(s);
  return fx ?? freeAttackSeconds(s);
}

/** 고정 간격을 빼고 본 평타 간격 (공격속도·해방·가속·소도 스택, 상한 적용) */
function freeAttackSeconds(s: CombatState): number {
  const haste = s.basicHaste && s.basicHaste.ticks > 0 ? 1 - s.basicHaste.haste : 1;
  // 소도 스택 (GDD 12-4 천년혈전 v6.086, C.460): 1스택 공격속도 +speedPerStack — 지금 자세 스택만
  const sp = 1 + stanceSpeedBonusOf(s);
  // 진화체 고유 능력 (GDD 8-7 1차, C.499): 공격 속도 +(÷) · 간격 −비율(×) · 간격 −초
  const evoMul = s.params.evo ? Math.max(0, 1 - evoStat(s, 'interval')) / (1 + evoStat(s, 'attackSpeed')) : 1;
  const evoCut = s.params.evo ? evoStat(s, 'intervalCut') : 0;
  const plain = (attackCurveOf(s.params) / (uniqueActive(s) ? s.params.liberationAttackSpeed : 1)) * haste / sp;
  // 진화체 능력 간격 하한 (GDD 8-7, C.527 provisional): 능력(간격 −%·공속 +·간격 −초)을 다 합쳐도 줄기 전 간격 × intervalFloor(최대 −60%) 아래로 안 줄어든다 — 옛 ×0.05
  const floor = BALANCE.provisional.evoAbilityCaps.intervalFloor;
  if (s.params.evo && plain * evoMul - evoCut < plain * floor) return speedSeconds(plain * floor, s.params.attackSecondsCut ?? 0, CX.attackSecondsMin);
  // 상한 (GDD v6.055 7절): 공격속도·특성·장비·해방·가속을 다 합쳐도 평타 0.3초에 1번보다 빠르지 않다. 추가 평타(extraBasicAttack)는 무관
  return speedSeconds(plain * evoMul, (s.params.attackSecondsCut ?? 0) + evoCut, CX.attackSecondsMin);
}

/** 지금 평타 타이머 간격(초) — 상한 적용 뒤 (화면·테스트) */
export function attackSecondsNow(s: CombatState): number {
  return currentAttackSeconds(s);
}

/** 추가 평타 (GDD v6.055 7절): 능력으로 '평타를 한 번 더' — 타이머를 거치지 않으므로 상한과 무관. 평타 타이머는 그대로 */
export function extraBasicAttack(s: CombatState): void {
  if (s.status !== 'playing') return;
  basicAttack(s);
}

/** 해방 중 블록 생성 속도 배율: 생성 타이머(흡수·기본·물공)가 이 배율로 빨리 돈다. 고유 효과면 × 체인 속도 배율 */
export function liberationSpawnSpeedOf(p: CombatParams): number {
  return p.liberationSpawnSpeed * (p.liberationUnique ? p.liberationChainSpeed : 1);
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
  const maxHp = setup.enemy.hpInAttacks * params.hpAttackScale * params.playerAttackDamage * params.growthMultiplier * params.hpScale;
  const pStats = playerStatsOf(params);
  // 내 체력 = 기본 체력 × (체력 ÷ 세계 기준 능력치) (GDD 20-3·32-1: 기준은 1단계 값으로 고정 — 진화하면 최대 체력이 실제로 커진다)
  const playerHp = params.playerMaxHp * (pStats.hp / params.playerRefStat) * params.playerHpScale;
  const evo = newEvoState(params);
  const state: CombatState = {
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
    // 생성 타이머 하나 (GDD 84장 6번): 첫 블록은 간격의 절반 뒤
    spawnTimer: Math.max(1, Math.round(t(spawnTableOf(params).seconds) / 2)),
    shuffleTimer: params.trayShuffleSeconds > 0 ? t(params.trayShuffleSeconds) : 0,
    sealTicks: 0,
    guard: { ticks: 0, reflect: 0 },
    guardGauge: 0,
    itemUsed: false,
    hasteTicks: 0,
    gearCooldown: params.activeGear ? t(params.gearCooldownSeconds * params.gearStartCooldown) : 0,
    gearShieldTicks: 0,
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
    riskGained: 0,
    finisher: null,
    liberation: { gauge: params.liberationEnabled && !setup.script ? Math.min(LIBERATION_GAUGE_MAX, Math.max(0, params.liberationStartGauge)) : 0, usedAtTick: null, uses: 0, chains: 0, ticksLeft: 0, spawnAcc: 0, nextSlot: 0, base: null, risk: 0 },
    ...(setup.boss ? { boss: { setup: { ...setup.boss, phases: setup.boss.phases.map((x) => ({ ...x })) }, phase: 1, attackMult: 1, gimmickTimer: t(gimmickEverySeconds(setup.boss)), seals: 0, ...(setup.boss.gimmick === 'summon' ? { minion: null, summons: 0, minionKills: 0 } : {}) } } : {}),
    inputs: [],
    events: [],
    ...(setup.script ? { script: { ...setup.script, allow: [...setup.script.allow] } } : {}),
    ...(params.kit ? { kit: newKitState(params) } : {}),
    ...(evo ? { evo } : {}),
  };
  // 진화체 고유 능력 (GDD 8-7 1차, C.499): 고정 특수 블록(바 맨 앞)·전투 시작 규칙
  if (evo) evoStart(state);
  return state;
}

/** 전투 시작 해방 게이지 (C.391 GDD 239장 4: 고정값 liberation.startGauge — 옛 안정 수치 비례를 기본 시작값으로 묶음) */
export function liberationStartGaugeOf(): number {
  return LB.startGauge;
}

export function elapsedSeconds(s: CombatState): number {
  return s.tick * s.params.tickSeconds;
}

export function timeLeftSeconds(s: CombatState): number {
  return Math.max(0, s.params.timeLimitSeconds - elapsedSeconds(s));
}

/** 블록 하나가 공허 블록으로 바뀔 확률 (GDD 101장): 기본 몫 + 리스크 게이지·환경·바퀴·돌파 가산 (상한 있음, C.513 컨디션 가산 폐기). 가산은 전투 시작 때 원정 리스크로 정한다(riskBonus) */
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

/** 내 공격이 쓰는 능력치 분류 (GDD 141장 1, 126-1 확정 ③): 평타(·장비) = 공격력 ÷ 적 방어, 블록 공격 전부(흡수·기본 공격 블록·콤보·공허·해방) = 특공 ÷ 적 정신력.
 *  블록의 계열 분류(category)는 데이터에 남지만 내 피해 계산엔 쓰지 않는다. 적이 주는 피해는 적 분류 그대로 */
export const PLAYER_BASIC_CATEGORY: AttackCategory = 'physical';
export const PLAYER_BLOCK_CATEGORY: AttackCategory = 'special';

/** 내 공격의 상성·능력치 비·분류 배율을 곱한 배율 (속성 = 공격 속성 목록, 비면 상성 없음) */
function playerHitMultiplier(s: CombatState, elements: readonly string[], cat: AttackCategory, ignore = 0): { mult: number; matchup: Matchup } {
  const p = s.params;
  const m = elements.length > 0 ? matchup(elements, enemyElements(s.enemy.def)) : 'neutral';
  const mm = m === 'weak' && p.abilityEffects.noWeak ? 1 : matchupMultiplier(p, m);
  let ign = Math.max(ignore, p.abilityEffects.ignoreDefense ?? 0);
  // 적 마법방어 − (GDD 8-7 2차 토르멘타 강화 자기장, C.515): 블록 피해(정신력) 쪽만, 다른 방어 무시와 곱으로 겹친다
  const magicCut = cat === 'special' && p.evo ? Math.min(0.95, Math.max(0, evoStat(s, 'foeMagicDefCut'))) : 0;
  if (magicCut > 0) ign = 1 - (1 - ign) * (1 - magicCut);
  return { mult: statRatio(attackerStatsOf(s, cat), s.enemy.stats, cat, ign) * mm * p.categoryPower[cat], matchup: m };
}

/** 내 공격 능력치 (GDD 8-7 1차, C.499 천평환): 진화체 고유 능력 offenseBasic/offenseBlock(1 = 공격력·지능 중 높은 쪽, 2 = 평균)이 특성 offenseMax 보다 우선. 없으면 그대로 */
function attackerStatsOf(s: CombatState, cat: AttackCategory): Stats {
  const st = s.player.stats;
  if (cat === 'mixed') return st;
  const own = s.params.evo ? evoStat(s, cat === 'physical' ? 'offenseBasic' : 'offenseBlock') : 0;
  const mode = own >= 2 ? 'avg' : own >= 1 || s.params.abilityEffects.offenseMax ? 'max' : null;
  if (!mode) return st;
  const v = mode === 'max' ? Math.max(st.atk, st.int) : (st.atk + st.int) / 2;
  return cat === 'physical' ? { ...st, atk: v } : { ...st, int: v };
}

/** 계열 단계 기술(위력 배율·추가 효과): 종족 설정에서 온 계열 표가 있으면 그것, 없으면 체인 배율 + 특성의 체인 추가 효과 (chain = 1~3) */
export function tierEffect(p: CombatParams, skill: CombatSkill, chain: number): { multiplier: number; bonus: ChainBonus | null } {
  chain = Math.min(chain, p.chainMultipliers.length); // 체인 상한 넘기기(C.514 현음 4·5체인)는 맨 위 단계 기술 위에 배율을 곱한다 — 단계 기술·추가 효과는 맨 위 단계
  const fam = skill.family ? p.families[skill.family]?.tiers[chain - 1] : undefined;
  if (fam) return { multiplier: fam.multiplier, bonus: fam.bonus ?? null };
  return { multiplier: p.chainMultipliers[chain - 1] ?? 1, bonus: chain >= p.chainBonusFromChain ? skill.chainBonus : null };
}

/** 스킬 블록 위력 배율: 속성 보너스 × 단계 기술 배율(체인 배율을 이어받음) × 상성(강 ×1.2 / 약 ×0.85) × 자기 속성 보정 × 능력치 비(특공 ÷ 정신력) × 분류 배율.
 *  chain = 함께 발동하는 블록 수(1~3), 바에 있는 블록 하나만 볼 때는 1. weak = 흡수 조건의 우위 공격인가 */
export function blockEffect(s: CombatState, b: Block, chain = 1): { skill: CombatSkill; mult: number; weak: boolean; matchup: Matchup; stab: boolean } | null {
  if (b.kind !== 'skill') return null;
  const src = sourceOf(s.params, b.traitId);
  if (!src) return null;
  // 기본 블록은 블록마다 계열을 가진다 (GDD 20장 v5.4): 그 계열 단계 기술(특공)·체인 기록·콤보가 그 계열로 나간다. 위력(powerInAttacks)·분류·속성은 기본 블록 값
  const skill = src.id === BASIC_SKILL_ID && b.family && !src.family ? { ...src, family: b.family } : src;
  const hit = playerHitMultiplier(s, skill.element ? [skill.element] : [], PLAYER_BLOCK_CATEGORY);
  const stab = skill.element !== null && s.params.playerElements.includes(skill.element);
  // 진화체 체인 배율 덮어쓰기 (GDD 8-7 1차 니에블라, C.499): 공격 블록만
  // 체인 상한 넘기기 (C.514 현음): 단계 수를 넘는 체인 = 맨 위 단계 기술 배율 × 그 단계 mult
  const topTier = Math.min(chain, s.params.chainMultipliers.length);
  const over = chain > topTier && s.params.evo ? evoChainTierOf(s, chain)?.mult ?? 1 : 1;
  const chainMult = ((s.params.evo && skill.role === 'attack' ? evoChainMultOf(s, topTier) : null) ?? tierEffect(s.params, skill, topTier).multiplier) * over;
  // 적 체력 구간 강화 (GDD 8-8 v6.162 진화 전 허무 블록, C.531): 적 체력이 낮을수록 세다
  const band = skill.foeHpBands && s.enemy.maxHp > 0 ? foeHpBandMult(skill.foeHpBands, s.enemy.hp / s.enemy.maxHp) : 1;
  const mult = skill.powerMultiplier * chainMult * hit.mult * (stab ? s.params.stabMultiplier : 1) * band;
  return { skill, mult, weak: isEffective(s, skill), matchup: hit.matchup, stab };
}

/** 해방 블록 (GDD 22-5): 내 캐릭터 속성 · 진화체 분류의 큰 한 방. 상성·능력치 비·분류 배율·자기 속성 보정. weak = 흡수 조건의 우위 공격(스킬 블록과 같은 규칙) */
export function liberationHit(s: CombatState): { mult: number; matchup: Matchup; weak: boolean; element: string | null } {
  const p = s.params;
  const els = p.playerElements;
  const hit = playerHitMultiplier(s, els, PLAYER_BLOCK_CATEGORY);
  const weak = weaknessesOf(enemyElements(s.enemy.def)).length === 0 || hit.matchup === 'strong';
  return { mult: hit.mult * p.stabMultiplier, matchup: hit.matchup, weak, element: els[0] ?? null };
}

/** 속성 없는 큰 블록(필살·공허·콤보·저장 필살)의 능력치 비: 블록 공격이라 특공 */
function plainHitMultiplier(s: CombatState): number {
  return playerHitMultiplier(s, [], PLAYER_BLOCK_CATEGORY).mult;
}

/** 이 블록을 지금 쓰면 줄 피해 (봇·화면 예고용) */
export function blockDamage(s: CombatState, b: Block, chain = 1): number {
  const p = s.params;
  const guardPose = stanceMultiplier(s);
  if (b.kind === 'void') return p.voidPowerInAttacks * unitDamage(p) * plainHitMultiplier(s) * guardPose;
  if (b.kind === 'combo') return (comboOf(p, b.traitId)?.powerInAttacks ?? 0) * unitDamage(p) * plainHitMultiplier(s) * guardPose;
  if (b.kind === 'liberation') return p.liberationPowerInAttacks * unitDamage(p) * liberationHit(s).mult * guardPose;
  const kb = b.kind === 'skill' ? kitBlockOf(p, b.traitId) : undefined;
  if (kb) return kitDamageOf(s, kb, chain, kitWillFinish(s, kb, chain), !!kb.counter && kitCounterOpen(s));
  const e = blockEffect(s, b, chain);
  return e ? e.skill.powerInAttacks * e.mult * unitDamage(p) * guardPose : 0;
}

/** 전용 블록 피해 (치명·특성 배율 전): 마무리 기술이면 finisherPower, 아니면 power × 체인 단계 배율 — × 강화 × 기본 공격 1회분 × 능력치 비 × 방어 자세, 반격이면 × damageMult */
export function kitDamageOf(s: CombatState, kb: CombatKitBlock, chain: number, finisher = false, counter = false): number {
  const p = s.params;
  const tier = kb.tiers[Math.min(kb.tiers.length, Math.max(1, chain)) - 1] ?? 1;
  const base = finisher && kb.stack ? kb.stack.finisherPower : kb.power * tier;
  return base * kb.mult * unitDamage(p) * plainHitMultiplier(s) * stanceMultiplier(s) * (counter && kb.counter ? kb.counter.damageMult : 1);
}

/** 이 체인이 마무리 기술(흑관 등)이 되는가: 스택 장치 블록의 최대 체인 + 스택 가득 */
export function kitWillFinish(s: Pick<CombatState, 'kit' | 'params' | 'liberation'>, kb: CombatKitBlock, chain: number): boolean {
  return !!kb.stack && !!s.kit && chain >= kb.tiers.length && s.kit.stack >= kb.stack.full && !kitBare(s);
}

/** 전용 블록 기술 이름 (체인·마무리 기술) */
export function kitMoveName(s: Pick<CombatState, 'kit' | 'params' | 'liberation'>, kb: CombatKitBlock, chain: number): string {
  if (kitWillFinish(s, kb, chain)) return kb.stack!.finisherName;
  return kb.tierNames[Math.min(kb.tierNames.length, Math.max(1, chain)) - 1] ?? kb.name;
}

/** 방어 자세 중이면 내 블록 피해 배율(<1), 아니면 1 */
export function stanceMultiplier(s: CombatState): number {
  const pat = s.enemy.def.pattern;
  return s.enemy.stance && pat?.kind === 'stance' ? pat.blockDamageMultiplier : 1;
}

/** 이 적의 기본 공격 간격(초): 패턴이 정하면(속공·단단) 그 값, 아니면 공통 값. 기본 공격 묶음(enemyHitPacing)만큼 늘어난다 */
export function enemyAttackSecondsOf(p: CombatParams, pattern: EnemyPattern | undefined): number {
  if (p.enemyAttackSecondsFixed) return p.enemyAttackSecondsFixed; // 테스트 모드 적 설정 창 (C.457): 적 공격 간격을 초로 정함
  return (pattern && 'attackSeconds' in pattern ? pattern.attackSeconds : p.enemyAttackSeconds) * (p.enemyHitPacing ?? 1);
}

/** 치명타 난수 시드 섞기 값 (주 난수와 다른 수열) */
const CRIT_SEED_SALT = 0x9e3779b9;
/** 특성 난수 시드 섞기 값 */
const ABILITY_SEED_SALT = 0x7f4a7c15;

/** 내 평타 치명 확률 (C.63 → C.220 평타 치명): 기본 + 특성 합, 0 ~ 상한 */
export function critChanceOf(p: CombatParams): number {
  return Math.min(p.critChanceMax, Math.max(0, p.critChance));
}

/** 내 블록 치명 확률 (GDD 126-1 확정 ②, C.220): 블록 치명 기본 + 특성 합, 0 ~ 블록 상한 (블록 보정 가산 전). 옛 상태는 평타 값 */
export function blockCritChanceOf(p: CombatParams): number {
  return Math.min(p.blockCritChanceMax ?? p.critChanceMax, Math.max(0, p.blockCritChance ?? p.critChance));
}

/** 진화체 치명 확률 + (평타 / block = 블록): trait = 4단계 한 줄 특성(evoCrit·evoBlockCrit), ability = 고유 능력(능력치 crit·blockCrit·이번 평타 basicCrit).
 *  둘 다 치명 상한(70%) 안에서 더한다 — 고유 능력에 critBreak 표시가 있을 때만 ability 몫이 상한을 넘는다(GDD 7-4 v6.182, C.529) */
export function evoCritUpOf(s: CombatState, block = false): { trait: number; ability: number } {
  const p = s.params;
  const trait = block ? p.abilityEffects.evoBlockCrit ?? 0 : p.abilityEffects.evoCrit ?? 0;
  const ability = !p.evo ? 0 : block ? evoStat(s, 'blockCrit') : evoStat(s, 'crit') + evoBasicCritNow(s);
  return { trait, ability };
}

/** 치명 확률 (GDD 7-4 v6.182, C.529): 기본 + 특성 + 가산(bonus) + 진화체 특성·능력(evoBonus = 이번 블록 능력 치명 +) 합, 0 ~ 상한(70%, 물 치명 특성만 상한 + 그 값).
 *  고유 능력 critBreak 가 켜져 있으면(늘 / 조건이 참인 동안) 능력 몫(ability + evoBonus)만 상한 위에 얹는다(최대 evoAbilityCaps.critBreakMax = 100%) */
export function playerCritChanceOf(s: CombatState, bonus = 0, block = false, evoBonus = 0): number {
  const p = s.params;
  const cap = block ? p.blockCritChanceMax ?? p.critChanceMax : p.critChanceMax;
  const base = (block ? blockCritChanceOf(p) : critChanceOf(p)) + bonus;
  const up = evoCritUpOf(s, block);
  const ability = up.ability + evoBonus;
  if (evoCritBreakOn(s)) return Math.max(0, Math.min(Math.max(cap, BALANCE.provisional.evoAbilityCaps.critBreakMax), Math.min(cap, base + up.trait) + ability));
  return Math.max(0, Math.min(cap, base + up.trait + ability));
}

/** 치명타 판정 한 번: 맞으면 횟수를 세고 true. 확률 0 이면 난수를 쓰지 않는다. block = 블록 공격(블록 치명), bonus = 블록 공격 치명 가산(GDD 84장 3번), evoBonus = 진화체 고유 능력 이번 블록 치명 + */
function rollCrit(s: CombatState, who: 'player' | 'enemy', bonus = 0, block = false, evoBonus = 0): boolean {
  if (s.script) return false; // 각본 전투는 난수 없이 (GDD 123장 5)
  const p = s.params;
  if (who === 'player' && kitEvadeBuffOn(s)) bonus += p.kit!.evadeBuff!.critChance; // 회피 치명 버프 (GDD 12-4 v6.066)
  // 진화체 고유 능력 치명 확정 (GDD 8-7 1차 백랑파 등): 이번 평타
  if (who === 'player' && !block && s.evo?.forceCrit) {
    s.crits = (s.crits ?? 0) + 1;
    return true;
  }
  // 진화체 특성·고유 능력 치명 + (GDD 8-7 1차, C.499): 상한 70% 안 — 돌파는 critBreak 능력만 (GDD 7-4 v6.182, C.529)
  const chance = who === 'enemy' ? Math.min(p.critChanceMax, Math.max(0, p.enemyCritChance)) : playerCritChanceOf(s, bonus, block, evoBonus);
  if (chance <= 0) return false;
  s.critRng ??= createRng((s.seed ^ CRIT_SEED_SALT) >>> 0);
  if (nextFloat(s.critRng) >= chance) return false;
  if (who === 'player') s.crits = (s.crits ?? 0) + 1;
  else s.enemyCrits = (s.enemyCrits ?? 0) + 1;
  return true;
}

/** 내 공격 피해에 치명타를 굴린다: 피해가 있을 때만 */
function playerCrit(s: CombatState, damage: number, bonus = 0, block = false, evoBonus = 0): { damage: number; crit: boolean } {
  if (damage <= 0 || !rollCrit(s, 'player', bonus, block, evoBonus)) return { damage, crit: false };
  const extra = (kitEvadeBuffOn(s) ? s.params.kit!.evadeBuff!.critDamage : 0) + (s.params.evo ? evoStat(s, 'critDmg') + (block ? s.evo?.critDmgNow ?? 0 : 0) : 0) + (s.params.abilityEffects.evoCritDmg ?? 0); // 회피 치명 버프 치명 피해 +30% (GDD 12-4 v6.066) · 진화체 고유 능력 치명 피해 + (C.499)
  return { damage: damage * (s.params.critMultiplier + extra), crit: true };
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

/** 특성이 내 공격 피해에 곱하는 배율 (피의 갈증·부식·억눌린 힘·폭주(호로화)·사냥꾼). block = 블록 공격이면 균형도 */
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
  if (a.mutation) m *= 1 + a.mutation.dealt;
  return m;
}

/** 내 공격 피해: 특성 배율 → 블록 플레이 보정(GDD 84장 3번, 물공 몸 아님)·평타형 대가(물공 몸, C.142) → 속성 피해(GDD 48장, elements = 공격 속성, 비면 무속성) → 치명타(블록은 치명 가산). 반사·독·공허 블록은 이 길을 지나지 않는다 */
function playerHit(s: CombatState, damage: number, block: boolean, elements: readonly string[], extraCrit = 0, evoCrit = 0): { damage: number; crit: boolean; elem?: ElemHit } {
  const p = s.params;
  const elem = elementDamageBonus(p, elements);
  // 블록 플레이 보정은 블록형 몸만 (평타형 = 물공 몸은 블록이 평타를 돕는 몸이라 없음 — 84장 3번 "평타캐보다"), 물공 몸은 대신 평타형 대가(C.142)
  const blockPlay = block && !p.physBlock;
  const blockMult = block ? (p.blockDamageMultiplier ?? 1) * (blockPlay ? (p.blockPlayDamage ?? 1) : 1) : 1;
  const physMult = p.physBlock?.damage ?? 1;
  // 무월수련 동안 주는 피해 × (GDD 12-4 v6.074 — 수련 게이지 모드, 두 번째 해방 전)
  const masteryMult = p.kit?.mastery && kitMasteryOn(s) && !s.kit?.second ? p.kit.mastery.damageMult : 1;
  // 진화체 고유 능력 주는 피해 + (GDD 8-7 1차, C.499: 화상·호로화 게이지 비례 등)
  const evoDealt = p.evo ? 1 + evoStat(s, 'dealt') : 1;
  const hit = playerCrit(s, damage * abilityPowerOf(s, block) * blockMult * physMult * masteryMult * evoDealt * (elem ? 1 + elem.pct / 100 : 1), (blockPlay ? (p.blockPlayCrit ?? 0) : 0) + extraCrit, block, evoCrit);
  return elem ? { ...hit, elem } : hit;
}

/** 연쇄: 체인 N 을 쓰면 다음 블록이 간격 × perChain × (N−1) 만큼 빨리 */
function applyChainHaste(s: CombatState, chain: number): void {
  const h = s.params.abilityEffects.chainHaste;
  if (!h || chain < 2) return;
  s.spawnTimer = Math.max(1, s.spawnTimer - Math.round(ticksOf(s.params, spawnIntervalOf(s)) * h * (chain - 1)));
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
  // 진화체 고유 능력 평타 피해 + (GDD 8-7 1차, C.499)
  if (s.params.evo) m *= 1 + evoStat(s, 'basicPower');
  return m;
}

/** 평타 피해 시각(초)·재생 배율 (GDD 7-2 '빠른 간격의 모션', C.448): 지금 평타 간격이 모션보다 짧으면 빨리 감고 앞을 잘라 남은 모션의 타격 프레임에 */
function basicHitDelayOf(s: CombatState): { delay: number; rate: number } {
  const p = s.params;
  const m = p.motion;
  if (!m || s.script) return { delay: p.hitDelay.basic, rate: 1 };
  const hit = p.hitDelay.basic;
  const fit = fitMotion({ total: Math.max(m.basic.total, hit), hit }, currentAttackSeconds(s), m.fastMax);
  return { delay: fit.hitIn, rate: fit.rate };
}

/** 블록 몸동작 시작 (GDD 7-2 절충안): 뒤에 기다리는 블록이 있으면 '빠른 간격' 규칙(간격 = 이 블록과 다음 블록을 누른 틱 차), 없으면 원래 속도 */
function startBlockMotion(s: CombatState, item: { id: number; key: string | null; chain: number; pressTick: number }, now: number): void {
  const p = s.params;
  const m = s.motion!;
  const spec = blockMotionOf(p, item.key, item.chain) ?? { total: 0, hit: 0 };
  const next = m.queue[0];
  const fit = fitMotion(spec, next ? (next.pressTick - item.pressTick) * p.tickSeconds : null, p.motion!.fastMax);
  m.cur = { id: item.id, endTick: now + Math.max(1, Math.ceil(fit.length / p.tickSeconds - 1e-6)), rate: fit.rate };
  emit(s, { kind: 'block-motion', id: item.id, rate: fit.rate, trim: fit.trim });
}

/** 블록을 썼다: 몸동작 줄에 세운다 (GDD 7-2 절충안). 줄이 비었으면 바로 시작, 아니면 기다리고 — 재생 중인 모션은 남은 부분을 최대 배속으로. 각본 전투·motion 없는 params 는 안 함 */
function queueBlockMotion(s: CombatState, key: string | null, chain: number): number | null {
  const fm = s.params.motion?.fastMax;
  if (s.script || fm === undefined) return null;
  if (!blockMotionOf(s.params, key, chain)) return null; // 몸동작 없는 몸(그림 한 장 — 길이 0): 줄에 안 섬 (GDD 7절 v6.106)
  const m = (s.motion ??= { cur: null, queue: [], seq: 0 });
  const now = s.tick + inputTickLead;
  const id = ++m.seq;
  if (m.cur && now >= m.cur.endTick) m.cur = null;
  const item = { id, key, chain, pressTick: now };
  if (!m.cur && m.queue.length === 0) {
    startBlockMotion(s, item, now);
    return id;
  }
  m.queue.push(item);
  if (m.cur && m.cur.rate < fm) {
    const left = m.cur.endTick - now;
    m.cur.endTick = now + Math.max(1, Math.ceil((left * m.cur.rate) / fm - 1e-6));
    m.cur.rate = fm;
    emit(s, { kind: 'motion-hasten', id: m.cur.id, rate: fm });
  }
  return id;
}

/** 틱마다: 끝난 모션을 내리고 줄 맨 앞을 시작한다 */
function advanceBlockMotion(s: CombatState): void {
  const m = s.motion;
  if (!m) return;
  if (m.cur && s.tick >= m.cur.endTick) m.cur = null;
  if (!m.cur && m.queue.length > 0) startBlockMotion(s, m.queue.shift()!, s.tick);
}

/** 블록 몸동작이 재생 중이거나 기다리는가 (GDD 7-2 '모션 중엔 평타 없음' — 모션 시간만, 이펙트 무관) */
export function blockMotionBusy(s: Pick<CombatState, 'motion'>): boolean {
  return !!s.motion && (!!s.motion.cur || s.motion.queue.length > 0);
}

/** 블록 사건 → 몸동작 키 (타격 지연 키와 같음): 콤보·해방 블록·공격 계열(계열:단계), 그 밖 null(기본값) */
function motionKeyOf(e: Extract<CombatEvent, { kind: 'block' }>): string | null {
  if (e.block === 'combo') return 'combo';
  if (e.block === 'liberation') return 'liberation';
  return blockHitKey(e.role === 'attack' ? e.family : null, e.chain);
}

/** 평타 한 번 (자동 공격 또는 기합으로 바로): 물공 배율·두 번 때림 → 피해 → 버프 소모 → 물살·충전 → 연타 */
function basicAttack(s: CombatState): void {
  const p = s.params;
  const a = p.abilityEffects;
  // 진화체 고유 능력 평타 직전 (GDD 8-7 1차, C.499): 충전 쓰기·이번 평타 배율·치명 확정·방어 무시
  const evo = evoBasicPre(s);
  // 특수 평타 (C.514 석양홍 basicShot): 속성·능력치 분류를 바꾸고 피해 ×mult — 없으면 평타 그대로
  const evoShot = evo?.shot;
  const basicEls = evoShot?.element ? [evoShot.element] : p.playerElements;
  // 평타 = 공격력 ÷ 적 방어, 내 캐릭터 속성 (GDD 20-3 v3.6, 141장 1)
  const hit = playerHitMultiplier(s, basicEls, evoShot?.category ?? PLAYER_BASIC_CATEGORY, evo?.ignore ?? 0);
  // 충전 평타·마무리 평타 (GDD 12-4 v6.069 이치고 월아천충·최후의 월아천충): 배율과 이름 — 게이지·스택 처리는 kitAfterBasic
  const shot = kitBasicShot(s) ?? stanceBasicShot(s);
  // 자세 평타 배율 (C.460): 대도 스택·유지 보너스·고정 간격 초과 공속 · 발도(shot) / 천쇄참월 기본 강화(shot)
  const base = unitDamage(p) * p.attackPowerMultiplier * hit.mult * basicPowerOf(s) * (shot?.power ?? 1) * stanceBasicPowerOf(s) * (1 + (evo?.mult ?? 0)) * (evoShot?.mult ?? 1);
  // 전광 (뇌 블록): 두 번 때림, 각 each. 타격마다 따로 치명 판정
  const flash = (s.flashHits ?? 0) > 0 && p.physBlock?.effect === 'flash' ? { n: 2, each: p.physBlock.each } : { n: 1, each: 1 };
  // 마무리 평타 연출 (C.473, GDD 12-4 v6.102 최후의 월아천충): 피해는 몸 동작의 타격 시각에, 그동안 무적·정지 (빨리 감기 없음)
  const cine = shot?.final ? p.kit?.mastery?.cine : undefined;
  const bd = cine ? { delay: cine.hitSeconds, rate: 1 } : basicHitDelayOf(s);
  if (cine && s.kit) {
    s.kit.cine = { start: s.tick, hit: s.tick + hitDelayTicks(p, cine.hitSeconds) + inputTickLead, end: s.tick + Math.max(hitDelayTicks(p, cine.hitSeconds), ticksOf(p, cine.seconds)) + inputTickLead };
    emit(s, { kind: 'kit-cine', seconds: cine.seconds, hitSeconds: cine.hitSeconds });
  }
  let last = 0;
  for (let k = 0; k < flash.n; k++) {
    const { damage, crit, elem } = playerHit(s, base * flash.each, false, basicEls);
    last = damage;
    const shotFx = evoShot ? { evoShot: evoShot.name, ...(evoShot.element ? { evoShotElement: evoShot.element } : {}), ...(evoShot.fx ? { evoShotFx: evoShot.fx } : {}) } : {};
    strike(s, bd.delay, { target: 'enemy', amount: damage, event: { kind: 'player-attack', damage, matchup: hit.matchup, crit, elem, ...(bd.rate !== 1 ? { rate: bd.rate } : {}), ...(shot?.name ? { kitShot: shot.name, ...(shot.final ? { kitFinisher: true } : {}) } : {}), ...(cine ? { kitMotion: cine.motion } : {}), ...shotFx }, finisher: { kind: 'basic-attack', traitId: null, element: null, matchup: hit.matchup }, elements: [...basicEls], basic: true });
    if (s.status !== 'playing') return;
  }
  if (s.evo) s.evo.forceCrit = false;
  // 혈쇄참월 분신 (C.460): 같은 피해로 한 대씩 같이 친다
  stanceClones(s, last, bd.delay, hit.matchup);
  if (s.status !== 'playing') return;
  // 진화체 고유 능력 평타 뒤 (GDD 8-7 1차, C.499): 평타 n대 카운터·분신·불칼·회복 등
  evoBasicPost(s, evo, last);
  if (s.status !== 'playing') return;
  kitAfterBasic(s, shot);
  stanceAfterBasic(s);
  if (s.status !== 'playing') return;
  // 버프 소모: 다음 평타 n회 버프는 1회씩, 바위 자세 쌓임은 한 번에, 두 번 때림은 1회
  if (s.basicBuffs) {
    for (const b of s.basicBuffs) b.hits--;
    s.basicBuffs = s.basicBuffs.filter((b) => b.hits > 0);
  }
  if (s.stoneStance) s.stoneStance.stacked = 0;
  if ((s.flashHits ?? 0) > 0) s.flashHits!--;
  if (a.current) s.currentHits = (s.currentHits ?? 0) + 1;
  s.basicCount = (s.basicCount ?? 0) + 1;
  if (s.script) s.script.hits++;
  // 충전 (뇌 특성): 평타 n회마다 블록 1개가 바로 (기본 풀 추첨, 바가 가득이거나 봉인 중이면 없음)
  if (a.charge && a.charge > 0 && s.basicCount % a.charge === 0 && s.sealTicks === 0) {
    const e = drawBasic(s);
    if (e && spawn(s, 'skill', e.source.id, e.family)) proc(s, 'charge');
  }
  // 연타 (뇌, GDD 39장): 같은 위력으로 한 번 더 — 연타는 다시 연타하지 않는다
  const dh = a.doubleHit;
  if (dh && nextFloat((s.abilityRng ??= createRng((s.seed ^ ABILITY_SEED_SALT) >>> 0))) < dh) {
    proc(s, 'doubleHit', last);
    strike(s, bd.delay, { target: 'enemy', amount: last, event: { kind: 'player-attack', damage: last, matchup: hit.matchup, ...(bd.rate !== 1 ? { rate: bd.rate } : {}) }, finisher: { kind: 'basic-attack', traitId: null, element: null, matchup: hit.matchup }, elements: [...p.playerElements], basic: true });
  }
}

/** 펫 공격 한 번 (GDD 241-D 4): 기본 공격 1회 × fraction, 속성 없는 상성(방어만). 치명·물공 버프 없음 */
function petAttack(s: CombatState, pa: NonNullable<CombatParams['petAttack']>, second = false): void {
  const damage = unitDamage(s.params) * pa.fraction * plainHitMultiplier(s) * (s.params.evo ? 1 + evoStat(s, 'petPower') : 1);
  if (damage <= 0) return;
  emit(s, { kind: 'pet-attack', petId: pa.petId, damage, ...(second ? { second: true } : {}) });
  dealDamage(s, damage, { kind: 'pet', traitId: null, element: null });
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
      extraBasicAttack(s);
      break;
    case 'ember':
      break;
  }
}

function emit(s: CombatState, e: CombatEvent): void {
  s.events.push(e);
}

/** 예약된 피해를 넣는다 (GDD 214장): 사건을 landed 로 다시 내고 피해·맞힌 뒤 효과. 이미 끝난 전투면 버린다 */
function landHit(s: CombatState, h: PendingHit): void {
  if (s.status !== 'playing') return;
  // 마무리 평타 연출 중 무적 (C.473): 이미 날아오던 적 공격도 피해 0
  if (h.target === 'player' && kitCineOn(s)) h = { ...h, amount: 0, reflected: 0, event: 'damage' in h.event ? ({ ...h.event, damage: 0 } as SwingHit) : h.event };
  emit(s, { ...h.event, landed: true });
  if (h.target === 'enemy') {
    dealDamage(s, h.amount, h.finisher ?? { kind: 'basic-attack', traitId: null, element: null });
    if (h.elements) onHit(s, 'enemy', h.elements, h.amount, h.basic);
  } else hitPlayer(s, h);
}

/** 적 공격이 나에게 닿는다: 반사 → 피해 → 흡혈·독 → 초월자 반격 창 (GDD 12-4 v6.048 경화수월 — 적 공격을 받은 뒤 창 안에 쓰면 반격) */
function hitPlayer(s: CombatState, h: Omit<PendingHit, 'atTick'>): void {
  const before = s.player.hp;
  if (h.reflected && h.reflected > 0) dealDamage(s, h.reflected, { kind: 'reflect', traitId: null, element: null });
  takeDamage(s, h.amount, h.event.kind === 'heavy-hit');
  if (h.elements) onHit(s, 'player', h.elements, h.amount);
  const kb = s.params.kit?.blocks.find((b) => b.counter);
  const k = s.kit;
  const ev = h.event.kind;
  if (!kb?.counter || !k || s.status !== 'playing' || !(ev === 'enemy-attack' || ev === 'heavy-hit' || ev === 'counter')) return;
  k.counterUntil = s.tick + ticksOf(s.params, kb.counter.windowSeconds);
  k.counterLost = Math.max(0, before - s.player.hp);
  emit(s, { kind: 'kit-window', seconds: kb.counter.windowSeconds });
}

/**
 * step() 안에서 받은 입력은 그 step 의 틱(s.tick + 1) 시각에 일어난 것 (GDD 224장 3, C.367): 예약을 한 틱 뒤로 — 안 그러면 같은 step 의 틱 증가가
 * 지연을 한 틱 깎아(0.1초 지연이면 0) 모션 타격보다 피해가 먼저 들어간다. 틱 없이 입력만 받는 곳(각본 대기 단계)은 0. 순수 데이터 흐름이라 재현성 그대로
 */
let inputTickLead = 0;

/** 피해가 0 이어도 모션이 있는 공격 (GDD 224장, C.367): 막아 낸 적 공격·강공격·반격 — '막기' 표시도 그 모션의 타격 순간에 */
const swingsAtZero = (e: SwingHit): boolean => (e.kind === 'enemy-attack' || e.kind === 'heavy-hit' || e.kind === 'counter') && e.guarded;

/** 공격 한 번 (GDD 214장, C.357): 발동은 지금, 피해는 delaySeconds 뒤 틱에. 지연 0·피해 0(막아 낸 적 공격 제외, 224장)·각본 마무리 체인(holdHit)은 지금 바로(옛 동작) */
function strike(s: CombatState, delaySeconds: number, h: Omit<PendingHit, 'atTick'>): void {
  const d = s.script?.holdHit || (h.amount <= 0 && !swingsAtZero(h.event)) ? 0 : hitDelayTicks(s.params, delaySeconds);
  if (d <= 0) {
    emit(s, h.event);
    if (h.target === 'enemy') {
      dealDamage(s, h.amount, h.finisher ?? { kind: 'basic-attack', traitId: null, element: null });
      if (h.elements) onHit(s, 'enemy', h.elements, h.amount, h.basic);
    } else hitPlayer(s, h);
    return;
  }
  const atTick = s.tick + d + inputTickLead;
  emit(s, { kind: 'swing', hit: h.event, atTick });
  (s.pendingHits ??= []).push({ ...h, atTick });
}

/** 이 틱에 맞는 예약 피해를 순서대로 넣는다 */
function landDueHits(s: CombatState): void {
  const list = s.pendingHits;
  if (!list || list.length === 0) return;
  const due = list.filter((h) => h.atTick <= s.tick);
  if (due.length === 0) return;
  s.pendingHits = list.filter((h) => h.atTick > s.tick);
  for (const h of due) {
    landHit(s, h);
    if (s.status !== 'playing') return;
  }
}

export function drainCombatEvents(s: CombatState): CombatEvent[] {
  return s.events.splice(0, s.events.length);
}

function dealDamage(s: CombatState, amount: number, finisher: Finisher): void {
  if (s.status !== 'playing') return;
  if (s.script?.holdHit) {
    // 각본 마무리 체인 (GDD 146장): 동작·스킬 연출이 닿을 때까지 피해를 맡겨 둔다
    const h = s.script.held;
    s.script.held = { amount: (h?.amount ?? 0) + amount, finisher };
    return;
  }
  // 처형을 막혀 스턴인 적 (GDD 8-8 v6.160 ④, C.531): 스턴 동안 받는 피해 ×배율
  if ((s.enemy.stunTicks ?? 0) > 0 && s.params.foeExecute) amount *= s.params.foeExecute.stunTakenMult;
  // 처형 '소멸선' (GDD 8-8, C.499): 처형선 아래 평타 = 처형, 강적·보스는 그 아래에서 모든 피해 ×배율
  if (s.params.abilityEffects.execute) amount = evoDamageAdjust(s, amount, finisher.kind === 'basic-attack');
  // 해방 게이지 (95장 B2): 실제로 깎은 체력(졸개 몫 포함, 넘친 피해 제외) ÷ 적 최대 체력
  if (amount > 0 && s.enemy.maxHp > 0) addGauge(s, (Math.min(amount, s.enemy.hp + (s.boss?.minion?.hp ?? 0)) / s.enemy.maxHp) * s.params.liberationGaugePerDealt);
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
  // 각본 전투: 마무리 단계(lethal) 전에는 적이 쓰러지지 않는다
  s.enemy.hp = Math.max(s.script && !s.script.lethal ? Math.min(s.enemy.hp, 1) : 0, s.enemy.hp - amount);
  if (s.enemy.hp <= 0 && s.params.enemyImmortal) s.enemy.hp = s.enemy.maxHp; // 테스트 모드 무적 (C.457): 허수아비처럼 다시 가득
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
  if (m && !s.params.enemyPassive && --m.attackTimer <= 0) {
    m.attackTimer = ticksOf(s.params, sm.attackSeconds);
    if (!evaded(s)) {
      const raw = enemyDamage(s, sm.attackInAttacks);
      const guarded = s.guard.ticks > 0;
      const damage = raw * (1 - guardReductionOf(s));
      emit(s, { kind: 'minion-attack', damage, guarded });
      takeDamage(s, damage);
      if (s.status !== 'playing') return;
    }
  }
  if (--b.gimmickTimer > 0) return;
  b.gimmickTimer = ticksOf(s.params, sm.everySeconds);
  if (b.minion) return;
  // 졸개 체력 = 기본 공격 N회 분량 (보스 체력과 같은 식, CLAUDE.md 규칙 3)
  const p = s.params;
  const hp = sm.hpInAttacks * p.hpAttackScale * p.playerAttackDamage * p.growthMultiplier * p.hpScale;
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
  // 4단계 한 줄 특성 '흡혈 +' (GDD 8-7 2차 추파카브라, C.515): 내 공격은 속성과 상관없이 그 비율만큼 더 (혈이면 혈 흡혈에 더함)
  const evoDrain = target === 'enemy' ? p.abilityEffects.evoDrain ?? 0 : 0;
  const blood = hasEffect(elements, 'drain');
  if (blood || evoDrain > 0) {
    const who = target === 'enemy' ? s.player : s.enemy;
    // 피 냄새 (GDD 49장): 넉백 중인 적에게 내 평타 흡혈 ×배율
    const scent = basic && target === 'enemy' && (s.knockbackTicks ?? 0) > 0 ? p.abilityEffects.bloodScent ?? 1 : 1;
    // 한 전투 흡혈 합계 상한 (C.53): 최대 체력 × drainCapFraction 까지만
    const room = Math.max(0, who.maxHp * p.drainCapFraction - (who.drained ?? 0));
    const heal = Math.min(who.maxHp - who.hp, damage * ((blood ? p.drainFraction * scent : 0) + evoDrain), room);
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
    const up = target === 'enemy' ? 1 + (p.abilityEffects.evoPoisonDot ?? 0) : 1; // 4단계 특성 '독 지속 피해 +' (C.515 비보라)
    const dotElement = elements.find((e) => getElement(e).effect === 'poison');
    victim.dot = { ticks, perTick: (left + damage * p.poisonFraction * up) / ticks, ...(dotElement ? { element: dotElement } : {}) };
  }
}

function takeDamage(s: CombatState, amount: number, heavy = false): void {
  if (s.status !== 'playing') return;
  if (kitCineOn(s)) return; // 마무리 평타 연출 중 무적 (C.473, GDD 12-4 v6.102)
  if (amount > 0) {
    // 바위 자세 (GDD 49장 흙 블록): 받는 피해 감소 + 맞을 때마다 다음 평타 보너스 쌓기
    const st = s.stoneStance;
    const pb = s.params.physBlock;
    if (st && st.ticks > 0 && pb?.effect === 'stoneStance') {
      amount *= 1 - pb.takenReduction;
      st.stacked = Math.min(pb.max, st.stacked + pb.perHit);
    }
    // 자세 무너짐 (GDD 12-4 천년혈전 발도, C.460): 그 동안 받는 피해 +breakTaken
    const bt = stanceBreakTakenOf(s);
    if (bt > 0) amount *= 1 + bt;
    // 장비 발동 방패 (GDD 105장 수정 4)
    const g = s.params.activeGear;
    if (s.gearShieldTicks > 0 && g?.effect === 'shield') amount *= 1 - g.reduction;
    // 물살: 내가 맞으면 연속 평타 수가 0 으로
    if (s.params.abilityEffects.current) s.currentHits = 0;
    s.damageTaken = (s.damageTaken ?? 0) + amount;
    // 해방 게이지 (95장 B2): 받은 피해(보호막에 막힌 몫 포함) ÷ 내 최대 체력
    if (s.player.maxHp > 0) addGauge(s, (amount / s.player.maxHp) * s.params.liberationGaugePerTaken);
  }
  if (s.player.shield && s.player.shield > 0) {
    const absorbed = Math.min(s.player.shield, amount);
    s.player.shield -= absorbed;
    amount -= absorbed;
    // 진화체 고유 능력 보호막 (GDD 8-7 1차, C.499): 막은 양·깨짐 규칙
    if (s.evo) {
      evoOnShield(s, absorbed, s.player.shield <= 0, heavy);
      if (s.status !== 'playing') return;
    }
  }
  const hpBefore = s.player.hp;
  // 각본 전투는 지지 않는다 (체력 1 아래로 안 내려감) · 진화체 해방 중 체력 하한 (GDD 8-7 1차 주홍장, C.499)
  const evoFloor = s.evo ? evoHpFloor(s) : 0;
  s.player.hp = Math.max(s.script ? Math.min(s.player.hp, 1) : evoFloor > 0 ? Math.min(s.player.hp, evoFloor) : 0, s.player.hp - amount);
  const last = s.params.abilityEffects.lastStand;
  if (s.player.hp <= 0 && last && !s.lastStandUsed) {
    s.lastStandUsed = true;
    s.player.hp = s.player.maxHp * last;
    proc(s, 'lastStand');
  }
  // 깨져라, 경화수월 (GDD 12-4 v6.048): 초월자 되살아나기 — 전투당 1회. 각본 전투는 원래 지지 않는다
  const rv = s.params.kit?.revive;
  if (s.player.hp <= 0 && rv && s.kit && !s.kit.revived && !s.script && !kitBare(s)) {
    s.kit.revived = true;
    s.kit.revives++;
    s.player.hp = s.player.maxHp * rv.hpFraction;
    emit(s, { kind: 'kit-line', text: rv.line, tone: 'revive' });
  }
  if (s.player.hp > 0) applyThorns(s, amount);
  // 진화체 고유 능력 '받은 피해' (GDD 8-7 2차 추파카브라, C.515): 실제로 잃은 체력
  if (s.evo && s.player.hp > 0) evoOnHurt(s, hpBefore - s.player.hp, heavy);
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
  const kit = s.params.kit;
  const kb0 = kind === 'skill' ? kitBlockOf(s.params, traitId) : undefined;
  if (kit && kb0) {
    // 초월자 전용 블록 (GDD 12-4 v6.048·v6.052): 해방 중이면 치환 블록(붕옥 → 프라고르, 경화수월 → 귀도), 레일 최대 개수(경화수월 2)를 넘으면 상한 없는 다른 블록(귀도)으로
    let kb = liberationActive(s) && kb0.releaseSwap ? kit.blocks.find((x) => x.id === kb0.releaseSwap) ?? kb0 : kb0;
    if (kb.maxOnRail !== undefined && s.tray.filter((x) => x.traitId === KIT_TRAIT_PREFIX + kb.id).length >= kb.maxOnRail) {
      const alt = kit.blocks.find((x) => x !== kb && !x.releaseOnly && !x.voidSlot && x.maxOnRail === undefined);
      if (!alt) return false;
      kb = alt;
    }
    s.tray.push({ uid: s.nextUid++, kind, traitId: KIT_TRAIT_PREFIX + kb.id, family: null, element: null, ...(kb.solo ? { solo: true } : {}) });
    emit(s, { kind: 'spawn', index: s.tray.length - 1, block: kind });
    if (s.evo) evoOnSpawn(s, s.tray[s.tray.length - 1]!);
    return true;
  }
  // 블록의 속성 (C.118, GDD 66장): 체인은 같은 계열 + 같은 속성끼리만. skill 블록은 그 특성(기본 블록은 물공 속성)의 속성, 나머지는 없음
  const element = kind === 'skill' ? (sourceOf(s.params, traitId)?.element ?? null) : null;
  // 오리지널 블록 (GDD 8-8 v6.160 ③, C.531): 이 진화체에서 그 속성 흡수 블록(허무 블록)은 진화체 특수 블록으로 바뀐다 — spawn = 대신 그 특수 블록, fixed = 고정 칸으로 이미 있어 안 생김
  const ob = kind === 'skill' && s.evo && !isBasicBlockId(traitId) ? evoOriginalFor(s.params, element) : null;
  if (ob) return ob.mode === 'spawn' ? evoSpawnOriginal(s, ob.special) : false;
  s.tray.push({ uid: s.nextUid++, kind, traitId, family, element });
  emit(s, { kind: 'spawn', index: s.tray.length - 1, block: kind });
  // 진화체 고유 능력 블록 생김 규칙 (GDD 8-7 1차, C.499)
  if (s.evo) evoOnSpawn(s, s.tray[s.tray.length - 1]!);
  return true;
}

/** 진화체 고유 능력이 블록을 놓는다 (특수 블록·잔상, C.499): 바가 차 있으면 null. front = 맨 앞(고정 특수 블록) */
function placeEvoBlock(s: CombatState, b: Omit<Block, 'uid'>, front = false): Block | null {
  if (s.tray.length >= s.params.trayCapacity) return null;
  const block: Block = { uid: s.nextUid++, ...b };
  if (front) {
    const at = s.tray.filter((x) => x.fixed).length;
    s.tray.splice(at, 0, block);
    emit(s, { kind: 'spawn', index: at, block: block.kind });
  } else {
    s.tray.push(block);
    emit(s, { kind: 'spawn', index: s.tray.length - 1, block: block.kind });
  }
  if (s.evo && !b.fixed) evoOnSpawn(s, block);
  return block;
}

/** 진화체 '블록 1개'(평소 출현표, 허 제외 — GDD 8-7 1차 백련): 물공 몫이면 물공 블록 */
function spawnEvoDraw(s: CombatState): boolean {
  if (s.tray.length >= s.params.trayCapacity) return false;
  const entries = spawnTableOf(s.params, liberationActive(s), kitRiskOf(s), kitStanceBlockOf(s)).entries.filter((e) => e.kind !== 'void');
  const total = entries.reduce((a, y) => a + y.chance, 0);
  if (entries.length === 0 || total <= 0) return false;
  const e = drawSpawnEvo(s, entries.map((x) => ({ ...x, chance: x.chance / total })));
  if (!e) return false;
  if (e.phys) return spawn(s, 'skill', BASIC_SKILL_ID, drawPhysFamily(s));
  return !!e.source && spawn(s, 'skill', e.source.id, e.family);
}

/** 각본 마무리 체인 착탄 (GDD 146장): 맡겨 둔 피해를 지금 넣는다(쓰러질 수 있다). 맡긴 것이 없으면 false */
export function scriptLandHit(s: CombatState): boolean {
  const sc = s.script;
  const h = sc?.held;
  if (!sc || !h || s.status !== 'playing') return false;
  sc.held = null;
  sc.lethal = true;
  emit(s, { kind: 'script-impact', damage: h.amount });
  dealDamage(s, h.amount, h.finisher);
  return true;
}

/** 각본 전투 (GDD 123장 5): 스킬 블록 하나를 바 끝에 놓는다. 바가 가득이면 false */
export function scriptSpawnBlock(s: CombatState, traitId: string, family: string | null): boolean {
  return spawn(s, 'skill', traitId, family);
}

/** 각본 전투 해방 안내 (GDD 241-B 1): 해방 게이지를 가득 채운다 (각본 전투는 게이지가 저절로 차지 않는다). 해방이 꺼져 있으면 아무것도 안 함 */
export function scriptFillLiberation(s: CombatState): void {
  if (!s.params.liberationEnabled || liberationActive(s)) return;
  s.liberation.gauge = LIBERATION_GAUGE_MAX;
  emit(s, { kind: 'liberation-ready' });
}

/** 각본 전투 (GDD 123장 5): 적이 지금 강공격을 시전한다 (예고 seconds 초) */
export function scriptHeavyCast(s: CombatState, seconds: number): void {
  const total = ticksOf(s.params, seconds);
  s.enemy.cast = { ticks: total, total, hitsLeft: 0 };
  emit(s, { kind: 'heavy-cast', seconds });
  heavyWindup(s);
}

/**
 * 강공격 빔 발사 준비 (GDD 245장 3): 예고가 끝나기 hitDelay.heavy(빔 모션이 닿는 데 걸리는 시간) 전에 'heavy-windup' 을 한 번 낸다.
 * 화면은 그때 모션을 시작해 예고가 끝나는 틱에 빔이 닿고, 엔진은 그 틱에 바로 판정한다(막기 중이면 그 순간 막힘). 예고가 더 짧으면 예고 시작에 바로
 */
function heavyWindup(s: CombatState): void {
  const c = s.enemy.cast;
  if (!c || c.windup || c.ticks <= 0) return;
  if (c.ticks > hitDelayTicks(s.params, s.params.hitDelay.heavy)) return;
  c.windup = true;
  emit(s, { kind: 'heavy-windup', atTick: s.tick + c.ticks }); // 남은 틱마다 한 번씩 줄어 0 이 되는 틱 = 판정 틱
}

/** 해방 게이지 적립 (GDD 83장, 옛 저장 게이지): 블록을 쓸 때 + 피해를 주고받을 때(95장 B2) 찬다. 해방 중에는 차지 않고(끝나면 0 부터), 100 에서 멈춘다 */
function addGauge(s: CombatState, v: number): void {
  const lb = s.liberation;
  // 각본 전투는 해방 게이지가 차지 않는다 (C.199: 해방 버튼이 '준비됨'으로 빛나 체인 안내를 가리지 않게)
  if (s.script || !s.params.liberationEnabled || liberationActive(s) || lb.gauge >= LIBERATION_GAUGE_MAX) return;
  if (s.params.kit?.riskRelease) return; // 리스크 소모형 해방은 해방 게이지를 쓰지 않는다 (GDD 12-4 v6.050)
  lb.gauge = Math.min(LIBERATION_GAUGE_MAX, lb.gauge + v);
  if (lb.gauge >= LIBERATION_GAUGE_MAX) emit(s, { kind: 'liberation-ready' });
}

function applyChainBonus(s: CombatState, bonus: ChainBonus): void {
  const p = s.params;
  if (bonus.kind === 'stagger') {
    // 적의 다음 행동을 늦춘다: 기본 공격, 특수 행동, 시전 중인 강공격 모두
    const d = ticksOf(p, bonus.value);
    s.enemy.attackTimer += d;
    if (hasSpecialActions(s.enemy.def.pattern)) s.enemy.actionTimer += d;
    if (s.enemy.cast && !s.enemy.cast.windup) s.enemy.cast.ticks += d; // 빔이 이미 나가는 중이면 그대로 (GDD 245장 3)
  } else if (bonus.kind === 'reflect') {
    s.guard.reflect = Math.max(s.guard.reflect, bonus.value);
  } else {
    // 정화: 봉인 해제 + 해방 게이지 +value (C.118: SP → 저장 게이지, C.134: 저장 게이지 → 해방 게이지, GDD 83장)
    s.sealTicks = 0;
    addGauge(s, bonus.value);
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

/** 진화체 블록 피해 배율 (GDD 8-7 1차, C.499): 1 + 고유 능력 blockPower + 이 블록 blockMult + 4단계 특성 n체인 위력 */
function evoBlockMultOf(s: CombatState, chain: number, ctx: { mult: number } | null): number {
  const cp = s.params.abilityEffects.chainPower?.filter((x) => x.chain === chain).reduce((a, x) => a + x.bonus, 0) ?? 0;
  return 1 + (s.params.evo ? evoStat(s, 'blockPower') : 0) + (ctx?.mult ?? 0) + cp;
}

/** 평타 1회분 피해 단위 (특성 배율·치명 전): 공격력 ÷ 적 방어 × 내 속성 상성 × 기본 공격 배율 */
function evoBasicUnitOf(s: CombatState, ignore = 0): number {
  const p = s.params;
  return unitDamage(p) * p.attackPowerMultiplier * playerHitMultiplier(s, p.playerElements, PLAYER_BASIC_CATEGORY, ignore).mult;
}

/** 블록 사용 (클릭). 스킬 블록 = 붙어 있는 완전히 같은 블록이 함께 발동(체인) → 역할 효과 + 피해, 공허 = 큰 피해 + 리스크 상승 (SP 필살 블록은 C.118, 저장형 필살기는 C.134 에 삭제 — GDD 66·83장) */
function useBlock(s: CombatState, index: number): boolean {
  const b = s.tray[index];
  if (!b) return false;
  // 공격 불가(막기·공허 경직) 동안에는 블록을 쓸 수 없다 (GDD 105장 1번)
  if (halted(s)) return false;
  const p = s.params;
  if (b.kind === 'void') {
    s.tray.splice(index, 1);
    s.voidUsed++;
    s.riskGained += p.riskPerVoidBlock;
    addGauge(s, p.liberationGaugePerBlock);
    // 경직 (GDD 101장 추가 결정 2번): 막기처럼 기본 공격·블록 생성이 멈춘다 (히든 진화체는 voidStunSeconds 0)
    if (p.voidStunSeconds > 0) s.stunTicks = Math.max(s.stunTicks ?? 0, ticksOf(p, p.voidStunSeconds));
    const evo = evoBlockPre(s, { kind: 'void', element: 'void', chain: 1, block: b });
    const damage = blockDamage(s, b) * abilityPowerOf(s, true) * evoBlockMultOf(s, 1, evo);
    emit(s, { kind: 'block', block: 'void', traitId: null, family: null, element: null, matchup: 'neutral', role: null, chain: 1, damage, weak: false, heal: 0, guardSeconds: 0, bonus: null });
    dealDamage(s, damage, { kind: 'void', traitId: null, element: null });
    evoBlockPost(s, evo, false, damage);
    updateCombos(s, null, 0);
    counterIfStance(s);
    return true;
  }
  if (b.kind === 'combo') {
    s.tray.splice(index, 1);
    s.comboBlocksUsed++;
    addGauge(s, p.liberationGaugePerBlock);
    const evo = evoBlockPre(s, { kind: 'combo', element: null, chain: 1, block: b });
    const { damage, crit, elem } = playerHit(s, blockDamage(s, b) * evoBlockMultOf(s, 1, evo), true, [], 0, evo?.critBonus ?? 0);
    strike(s, blockHitDelayOf(p, 'combo'), { target: 'enemy', amount: damage, event: { kind: 'block', block: 'combo', traitId: b.traitId, family: null, element: null, matchup: 'neutral', role: null, chain: 1, damage, weak: false, heal: 0, guardSeconds: 0, bonus: null, crit, elem }, finisher: { kind: 'combo', traitId: b.traitId, element: null } });
    evoBlockPost(s, evo, crit, damage);
    updateCombos(s, null, 0);
    counterIfStance(s);
    return true;
  }
  if (b.kind === 'liberation') {
    s.tray.splice(index, 1);
    addGauge(s, p.liberationGaugePerBlock);
    const evo = evoBlockPre(s, { kind: 'liberation', element: p.playerElements[0] ?? null, chain: 1, block: b });
    const { damage, crit, elem } = playerHit(s, blockDamage(s, b) * evoBlockMultOf(s, 1, evo), true, p.playerElements, 0, evo?.critBonus ?? 0);
    const hit = liberationHit(s);
    if (liberationActive(s)) s.liberation.chains++;
    strike(s, blockHitDelayOf(p, 'liberation'), { target: 'enemy', amount: damage, event: { kind: 'block', block: 'liberation', traitId: null, family: null, element: hit.element, matchup: hit.matchup, role: null, chain: 1, damage, weak: hit.weak, heal: 0, guardSeconds: 0, bonus: null, crit, elem }, finisher: { kind: 'liberation', traitId: null, element: hit.element, weak: hit.weak, matchup: hit.matchup }, elements: [...p.playerElements] });
    evoBlockPost(s, evo, crit, damage);
    updateCombos(s, null, 0);
    counterIfStance(s);
    return true;
  }
  // 진화체 특수 블록 (GDD 8-7 1차, C.499): 데이터 규칙(special)
  if (b.kind === 'skill' && evoSpecialOf(p, b.traitId)) return useEvoSpecial(s, index);
  const kb = b.kind === 'skill' ? kitBlockOf(p, b.traitId) : undefined;
  if (kb) return useKitBlock(s, index, kb);
  // 스킬 블록: 함께 발동하는 칸들이 모두 소모된다. 체인 단계 = 함께 쓰인 블록 수
  const group = chainGroup(s.tray, index, chainCapOf(s));
  const chain = group.length;
  const usedEcho = group.some((i) => s.tray[i]?.echo);
  // 굳은 묶음 (C.514 만리장): 쓰기 전에 그 묶음이 굳었는지 본다
  const hardened = s.evo ? evoGroupHardened(s, group.map((i) => s.tray[i]!.uid)) : false;
  s.tray.splice(group[0]!, chain);
  const eff = blockEffect(s, b, chain);
  if (!eff) return true; // 생성원에 없는 블록(있을 수 없음)은 그냥 사라진다
  const { skill, weak, matchup: m } = eff;
  const id = skill.id;
  // 기록: 특성별·skillsUsed 는 소모된 블록 수, 체인별은 발동 횟수 (한 번 눌러 체인N = blocksByChain[N-1] + 1)
  for (let k = 0; k < chain; k++) s.skillsUsed.push(id);
  s.blocksByTrait[id] = (s.blocksByTrait[id] ?? 0) + chain;
  // 체인별 기록은 계열 단계 칸(1~3)까지 — 상한을 넘긴 체인(C.514 현음 4·5)은 맨 위 칸에 (발동 횟수는 고유 능력 글자로 따로)
  const chainSlot = Math.min(chain, s.blocksByChain.length);
  s.blocksByChain[chainSlot - 1]!++;
  if (skill.family) {
    const rec = (s.chainsByFamily[skill.family] ??= [0, 0, 0]);
    rec[Math.min(chain, rec.length) - 1]!++;
  }
  if (chain >= p.chainMultipliers.length) {
    s.chain3Count++;
    if (weak) s.weakChain3Count++;
  }
  addGauge(s, p.liberationGaugePerBlock * chain + (p.liberationChainBonus[Math.min(chain, p.liberationChainBonus.length) - 1] ?? 0));
  if (liberationActive(s)) s.liberation.chains++;
  // 막기·회복 블록은 생기지 않는다 (GDD 105장): 옛 상태에 남은 막기 블록은 막기 버튼과 같은 막기, 회복 블록은 피해만
  const heal = 0;
  let guardSeconds = 0;
  if (skill.role === 'guard') {
    guardSeconds = p.guardSeconds;
    s.guard.ticks = Math.max(s.guard.ticks, ticksOf(p, guardSeconds));
  }
  const bonus = tierEffect(p, skill, chain).bonus;
  if (bonus) applyChainBonus(s, bonus);
  // 진화체 고유 능력 블록 직전 (GDD 8-7 1차, C.499): 이 블록 피해 +·평타 n회분 더하기·치명 + / 4단계 특성 n체인 위력 +
  const evo = evoBlockPre(s, { kind: 'skill', element: blockElementOf(p, b), chain, block: b, echo: usedEcho, family: skill.family ?? null, hardened });
  const raw = blockDamage(s, b, chain) * evoBlockMultOf(s, chain, evo) + (evo?.flat ?? 0) * evoBasicUnitOf(s);
  if (s.evo) s.evo.critDmgNow = evo?.critDmg ?? 0;
  // 피해 없는 블록 (GDD v6.133 '강화만', C.499): 효과(규칙)만 — 치명 판정도 없음
  const noDamage = !!evo?.noDamage;
  const { damage, crit, elem } = noDamage ? { damage: 0, crit: false, elem: undefined } : playerHit(s, raw, true, skill.element ? [skill.element] : [], 0, evo?.critBonus ?? 0);
  if (s.evo) s.evo.critDmgNow = 0;
  const family = skill.family ?? null;
  // 피해는 모션이 닿는 순간에 (GDD 214장): 계열·단계별 타격 지연. 피해 0(막기 블록 등)은 바로
  strike(s, blockHitDelayOf(p, blockHitKey(skill.role === 'attack' ? family : null, chain), chain), { target: 'enemy', amount: damage, event: { kind: 'block', block: 'skill', traitId: id, family, element: skill.element, matchup: m, role: skill.role, chain, damage, weak, heal, guardSeconds, bonus: bonus?.kind ?? null, crit, elem, ...(noDamage ? { noDamage: true } : {}) }, finisher: { kind: 'skill', traitId: id, element: skill.element, family, weak, matchup: m }, ...(skill.element ? { elements: [skill.element] } : {}) });
  // 단련 (GDD 49장 노멀 특성): 스킬 블록 1개마다 이번 전투 평타 +
  if (p.abilityEffects.tempering) s.temperingBlocks = (s.temperingBlocks ?? 0) + chain;
  // 물공 블록 효과 (GDD 49장): 기본 공격 블록이 물공 블록인 몸에서 그 블록을 썼을 때
  if (p.physBlock && id === BASIC_SKILL_ID && skill.role === 'attack') applyPhysBlock(s);
  // 진화체 고유 능력 블록 뒤 (치명·피해가 정해진 뒤 — 스택·버프·잔상 등)
  evoBlockPost(s, evo, crit, damage);
  if (s.status !== 'playing') return true;
  applyChainHaste(s, chain);
  updateCombos(s, skill.family ?? null, chain);
  counterIfStance(s);
  return true;
}

/** 초월자 전용 블록 쓰기 (GDD 12-4 v6.048, C.441): 체인(solo 면 혼자) → 반격(창 안이면 피해·치명 가산·손실 체력 회복·즉시 1개) / 스택(최대 체인마다 +1, 가득이면 마무리 기술 + 적 공격 불능) */
function useKitBlock(s: CombatState, index: number, kb: CombatKitBlock): boolean {
  const p = s.params;
  const k = (s.kit ??= newKitState(p));
  // 자세 모드 (C.460): 천쇄참월 회색 블록 = 불 켜기/끄기 · 발도 블록 = 누르지 않고 바로 뗀 발도(누른 시간 0)
  const st = stanceOf(s);
  if (st && kb.id === st.block) {
    if (st.lanterns && liberationActive(s)) return toggleLantern(s, index, st.lanterns.max);
    if (st.draw) {
      k.draw = { uid: s.tray[index]!.uid, startTick: s.tick };
      return releaseDraw(s);
    }
  }
  const group = kb.solo ? [index] : chainGroup(s.tray, index, Math.min(maxChain(p), kb.tiers.length));
  const chain = group.length;
  s.tray.splice(group[0]!, chain);
  const id = KIT_TRAIT_PREFIX + kb.id;
  for (let n = 0; n < chain; n++) s.skillsUsed.push(id);
  s.blocksByTrait[id] = (s.blocksByTrait[id] ?? 0) + chain;
  s.blocksByChain[chain - 1]!++;
  if (chain >= p.chainMultipliers.length) s.chain3Count++;
  addGauge(s, kb.chainGauge ? kb.chainGauge[Math.min(kb.chainGauge.length, chain) - 1] ?? 0 : p.liberationGaugePerBlock * chain + (p.liberationChainBonus[chain - 1] ?? 0));
  if (liberationActive(s)) s.liberation.chains++;
  // 충전 블록 (GDD 12-4 v6.069 월아천충): 피해 없이 다음 평타 충전 + 체인 수, 해방 밖이면 게이지 −체인별 값, 수련 모드면 수련 + 블록 1개당
  if (kb.chargeShot) {
    k.charges += chain;
    const ms = p.kit?.mastery;
    if (p.kit?.riskDrain && k.risk <= 0) {
      if (ms) kitMasteryGain(s, ms.perBlock * chain);
    } else if (p.kit?.riskDrain && kb.chainRiskCost && !liberationActive(s)) kitDrainSpend(s, kb.chainRiskCost[Math.min(kb.chainRiskCost.length, chain) - 1] ?? 0);
    emit(s, { kind: 'block', block: 'skill', traitId: id, family: null, element: null, matchup: 'neutral', role: 'attack', chain, damage: 0, weak: false, heal: 0, guardSeconds: 0, bonus: null, kitName: kb.name, kitFx: kb.fx, kitCharge: k.charges });
    updateCombos(s, null, 0);
    counterIfStance(s);
    return true;
  }
  const counter = !!kb.counter && kitCounterOpen(s);
  const finisher = kitWillFinish(s, kb, chain);
  const name = kitMoveName(s, kb, chain);
  const { damage, crit } = playerHit(s, kitDamageOf(s, kb, chain, finisher, counter), true, [], counter ? kb.counter!.critBonus : 0);
  let heal = 0;
  if (counter && kb.counter) {
    k.counters++;
    k.counterUntil = -1;
    emit(s, { kind: 'kit-line', text: kb.counter.line, tone: 'counter' });
    heal = Math.min(Math.max(0, s.player.maxHp - s.player.hp), k.counterLost * kb.counter.healLostFraction * kb.mult);
    if (heal > 0) {
      s.player.hp += heal;
      emit(s, { kind: 'drain', target: 'player', heal });
    }
  }
  // 붕옥 블록 (GDD 12-4 v6.052): 패널티 없이 게이지 +riskGain (최대 limit)
  const rr = p.kit?.riskRelease;
  if (kb.voidSlot?.riskGain && rr) {
    const before = k.risk;
    k.risk = Math.min(rr.limit, k.risk + kb.voidSlot.riskGain * chain);
    if (k.risk !== before) emit(s, { kind: 'kit-risk', spent: before - k.risk, risk: k.risk });
  }
  if (kb.stack && chain >= kb.tiers.length && !kitBare(s)) {
    if (finisher) {
      k.stack = 0;
      k.finishers++;
      // 공격 불능 = 적 행동 타이머 정지 (넉백과 같은 장치, GDD 7-10 상태 이상)
      s.knockbackTicks = Math.max(s.knockbackTicks ?? 0, ticksOf(p, kb.stack.enemyStunSeconds));
    } else k.stack = Math.min(kb.stack.full, k.stack + 1);
    emit(s, { kind: 'kit-stack', stack: k.stack, full: kb.stack.full });
  }
  strike(s, blockHitDelayOf(p, null, chain), { target: 'enemy', amount: damage, event: { kind: 'block', block: 'skill', traitId: id, family: null, element: null, matchup: 'neutral', role: 'attack', chain, damage, weak: false, heal, guardSeconds: 0, bonus: null, crit, kitName: name, kitFx: kb.fx, kitCounter: counter, kitFinisher: finisher }, finisher: { kind: 'skill', traitId: id, element: null, family: null, weak: false, matchup: 'neutral' } });
  // 반격 뒤 같은 블록 즉시 1개는 삭제 (GDD 12-4 v6.050 — 사용자 2026-11-13)
  // 프라고르 (GDD 12-4 v6.052): 해방 중 1블록마다 게이지 −riskCost (최소 floor), 문턱 밑으로 떨어지면 풀린다
  if (kb.riskCost && rr && liberationActive(s) && s.liberation.endless) kitModeSpend(s, kb.riskCost * chain);
  if (st && kb.id === st.block) stanceHit(s); // 자세 블록 공격도 그 자세로 때린 것 (C.460)
  updateCombos(s, null, 0);
  counterIfStance(s);
  return true;
}

/** 해방이 시작·끝날 때 바의 전용 블록을 바꾼다 (GDD 12-4 v6.052 붕옥 융합): 시작 = releaseSwap 블록 → 그 대상(붕옥 → 프라고르, 경화수월 → 귀도),
 *  끝 = 해방 전용(releaseOnly) 블록만 원래 블록으로(프라고르 → 붕옥 — 귀도는 그대로). 레일 상한을 넘는 몫은 상한 없는 블록으로 */
function kitSwapTray(s: CombatState, releasing: boolean): void {
  const kit = s.params.kit;
  if (!kit) return;
  for (const src of kit.blocks) {
    if (!src.releaseSwap) continue;
    const to = kit.blocks.find((x) => x.id === src.releaseSwap);
    if (!to) continue;
    if (!releasing && !to.releaseOnly) continue;
    const [from, dest] = releasing ? [src, to] : [to, src];
    const alt = kit.blocks.find((x) => x !== dest && !x.releaseOnly && !x.voidSlot && x.maxOnRail === undefined);
    let kept = s.tray.filter((b) => b.traitId === KIT_TRAIT_PREFIX + dest.id).length;
    for (const b of s.tray) {
      if (b.traitId !== KIT_TRAIT_PREFIX + from.id) continue;
      const over = dest.maxOnRail !== undefined && kept >= dest.maxOnRail;
      const use = over && alt ? alt : dest;
      if (!over) kept++;
      b.traitId = KIT_TRAIT_PREFIX + use.id;
      b.uid = s.nextUid++; // 다른 블록이 됐다 — 화면이 새 블록으로 그린다
      if (use.solo) b.solo = true; else delete b.solo;
    }
  }
}

/** 막기를 지금 누를 수 있는가 (GDD 105장 수정 v5.233): 게이지가 다 찼고 막기 중이 아니면(공허 경직 중에도 된다) */
export function canGuard(s: CombatState): boolean {
  return s.status === 'playing' && !scriptLocked(s, 'guard') && s.guardGauge >= 1 && s.guard.ticks <= 0;
}

/** 소모품을 지금 쓸 수 있는가 (GDD 105장 수정 3·108장 3번): 칸에 든 전투용 소모품이 있고, 이 전투에서 안 썼고, 공격 불가(막기·경직) 중이 아니고,
 *  회복 소모품은 회복 잠김(폭주, noHealSpawn)이 아닐 때. 보관 개수는 부르는 쪽(화면·원정)이 확인해 battleItem 을 비운다 */
export function canUseItem(s: CombatState): boolean {
  const it = s.params.battleItem;
  if (s.status !== 'playing' || !it || s.itemUsed || halted(s) || scriptLocked(s, 'item')) return false;
  return !(it.effect === 'heal' && s.params.noHealSpawn);
}

/** 장비 발동을 지금 쓸 수 있는가 (GDD 105장 수정 4): 발동 장비가 있고 쿨다운이 끝났고 공격 불가 중이 아닐 때 */
export function canUseGear(s: CombatState): boolean {
  return s.status === 'playing' && !scriptLocked(s, 'gear') && !!s.params.activeGear && s.gearCooldown <= 0 && !halted(s);
}

/** 성향·강화 보정 (옛 막기·회복 블록 세기 → GDD 105장 수정: 막기 = 게이지 차는 속도, 회복 = 회복 소모품 회복량) */
function roleBoostOf(p: CombatParams, role: 'guard' | 'heal'): number {
  const m = temperamentOf(p);
  return ((role === 'guard' ? m.guard : m.heal) / m.attack) * (p.guardHealEnhance ?? 1);
}

/** 막기 (GDD 105장 수정 v5.233): 게이지를 다 써서 guardSeconds 동안 강공격을 완전히 막는다(일반 공격 경감 없음). 막기 동안 공격 멈춤은 그대로 */
function useGuard(s: CombatState): boolean {
  if (!canGuard(s)) return false;
  const p = s.params;
  s.guardGauge = 0;
  // 패링 (GDD 12-4 천년혈전, C.460 — 자세 장치 parry): 막기 버튼 = 판정 창 windowSeconds 만 연다. 그 창에 강공격이 닿으면 패링 성공
  const pr = stanceOf(s)?.parry;
  const seconds = pr ? pr.windowSeconds : p.guardSeconds;
  s.guard.ticks = ticksOf(p, seconds);
  if (pr && s.kit) s.kit.parryOpen = true;
  emit(s, { kind: 'block', block: 'skill', traitId: BASIC_GUARD_ID, family: null, element: null, matchup: 'neutral', role: 'guard', chain: 1, damage: 0, weak: false, heal: 0, guardSeconds: seconds, bonus: null });
  return true;
}

/** 소모품 사용 (GDD 105장 수정 3): 회복약 = 최대 체력 × 비율 × 회복 보정, 각성 = 블록 생성 가속 */
function useItem(s: CombatState): boolean {
  if (!canUseItem(s)) return false;
  const it = s.params.battleItem!;
  s.itemUsed = true;
  let heal = 0;
  if (it.effect === 'heal') {
    heal = Math.min(s.player.maxHp - s.player.hp, s.player.maxHp * it.fraction * roleBoostOf(s.params, 'heal'));
    s.player.hp += heal;
  } else {
    s.hasteTicks = ticksOf(s.params, it.seconds);
    s.spawnTimer = Math.min(s.spawnTimer, ticksOf(s.params, spawnIntervalOf(s)));
  }
  emit(s, { kind: 'item', id: it.id, effect: it.effect, heal });
  return true;
}

/** 장비 발동 (GDD 105장 수정 4): 방패 = 받는 피해 감소, 폭발 = 기본 공격 N회분 피해(평타처럼 상성·능력치 비·치명) */
function useGear(s: CombatState): boolean {
  if (!canUseGear(s)) return false;
  const p = s.params;
  const g = p.activeGear!;
  s.gearCooldown = ticksOf(p, p.gearCooldownSeconds);
  let damage = 0;
  if (g.effect === 'shield') s.gearShieldTicks = ticksOf(p, g.seconds);
  else {
    const hit = playerHitMultiplier(s, p.playerElements, PLAYER_BASIC_CATEGORY);
    damage = playerHit(s, unitDamage(p) * hit.mult * g.powerInAttacks, false, p.playerElements).damage;
  }
  emit(s, { kind: 'gear', id: g.id, effect: g.effect, damage });
  if (damage > 0) dealDamage(s, damage, { kind: 'gear', traitId: null, element: null });
  return true;
}

/** 막기 게이지·장비 쿨다운 (GDD 105장 수정): 막기 중이 아니면 게이지가 guardGaugeSeconds ÷ 보정 에 걸쳐 0 → 1 */
function chargeButtons(s: CombatState): void {
  const p = s.params;
  if (s.guard.ticks <= 0 && s.guardGauge < 1) {
    const g = s.guardGauge + 1 / ticksOf(p, p.guardGaugeSeconds / roleBoostOf(p, 'guard'));
    s.guardGauge = g >= 1 - 1e-9 ? 1 : g; // 더하기 오차로 99.99…% 에 멈추지 않게
  }
  if (s.guardGauge >= 1) s.guardFilled = true;
  if (s.gearCooldown > 0) s.gearCooldown--;
  if (s.gearShieldTicks > 0) s.gearShieldTicks--;
  if (s.hasteTicks > 0) s.hasteTicks--;
}

/** 입력 하나 적용. 규칙에 맞지 않으면 false (상태 그대로) */
export function applyInput(s: CombatState, input: CombatInput): boolean {
  if (s.status !== 'playing') return false;
  if (s.script && !s.script.allow.includes(input.type)) return false;
  let ok = false;
  if (input.type === 'liberate') {
    ok = liberate(s);
  } else if (input.type === 'use') {
    const from = s.events.length;
    ok = inTray(s.tray, input.cell) && !blockSealed(s.tray[input.cell]) && useBlock(s, input.cell);
    if (ok) {
      // 블록 몸동작 줄 (GDD 7-2, C.448): 이번 사용의 블록 사건(공허 제외)에 id 를 달고 줄에 세운다
      for (let i = from; i < s.events.length; i++) {
        const ev = s.events[i]!;
        const b = ev.kind === 'block' ? ev : ev.kind === 'swing' && ev.hit.kind === 'block' ? ev.hit : null;
        if (!b || b.block === 'void' || (b.block === 'skill' && kitBlockOf(s.params, b.traitId)?.noMotion)) continue; // 몸동작 없는 전용 블록(월아천충)은 줄에 안 섬 — 평타가 안 멈춘다 (GDD 12-4 v6.073)
        const id = queueBlockMotion(s, motionKeyOf(b), b.chain);
        if (id !== null) b.motionId = id;
        break;
      }
    }
  } else if (input.type === 'guard') {
    ok = useGuard(s);
  } else if (input.type === 'item') {
    ok = useItem(s);
  } else if (input.type === 'gear') {
    ok = useGear(s);
  } else if (input.type === 'stance') {
    ok = switchStance(s);
  } else if (input.type === 'draw') {
    ok = startDraw(s, input.cell);
  } else if (input.type === 'draw-release') {
    ok = releaseDraw(s);
  } else if (input.type === 'execute-guard') {
    ok = guardExecution(s);
  }
  if (ok) s.inputs.push({ tick: s.tick, input });
  return ok;
}

/** 해방 시작 (GDD 83장): 지속 동안 생성 타이머가 빨리 돈다(나오는 블록은 평소 출현표 그대로, 106장 4). 고유 효과(레스렉시온/만해)면
 *  전 능력치 ×배율(체력은 최대 체력과 함께 늘어난 만큼 채운다) + 공격 속도·블록 생성 배율. 게이지는 0 이 된다 */
function liberate(s: CombatState): boolean {
  if (!canLiberate(s)) return false;
  const p = s.params;
  const lb = s.liberation;
  if (lb.usedAtTick === null) lb.usedAtTick = s.tick;
  lb.uses++;
  lb.gauge = 0;
  if (s.script) lb.scripted = true;
  const rr = p.kit?.riskRelease;
  // 게이지 모드 (GDD 12-4 v6.052 붕옥 융합): 지속 시간 없음 — 프라고르를 쓸 때마다 게이지가 깎이고 문턱 밑이면 풀림. 융합하면 스택은 사라진다(releaseBare)
  if (rr) {
    lb.endless = true;
    lb.ticksLeft = 1;
    s.kit ??= newKitState(p);
    s.kit.modeEnters++;
    if (p.kit?.releaseBare && s.kit.stack > 0) {
      s.kit.stack = 0;
      s.kit.counterUntil = -1;
    }
  } else if (p.kit?.stance) {
    // 자세 모드 (C.460): 지속 시간 없음 — 때릴 때마다 지금 자세 스택 −1, 0 이면 풀림
    lb.endless = true;
    lb.ticksLeft = 1;
    const k = (s.kit ??= newKitState(p));
    k.modeEnters++;
    k.draw = null;
    k.drawPower = 1;
    k.stanceUntil[k.stance] = s.tick + ticksOf(p, p.kit.stance.stackSeconds);
  } else if (p.kit?.riskDrain) {
    // 게이지 소모형 (GDD 12-4 v6.069): 지속 시간 없음. 게이지 0(수련 가득)이면 두 번째 해방(무월), 아니면 첫 해방(각호고)
    lb.endless = true;
    lb.ticksLeft = 1;
    const k = (s.kit ??= newKitState(p));
    if (k.risk <= 0 && p.kit.mastery) {
      k.second = true;
      k.finalStack = 0;
      k.secondEnters++;
    } else {
      k.modeEnters++;
      k.drainTimer = ticksOf(p, p.kit.riskDrain.tickSeconds);
    }
  } else lb.ticksLeft = ticksOf(p, (p.liberationUnique ? evoReleaseSecondsOf(p) : null) ?? p.liberationSeconds); // 진화체 해방 지속 예외 (GDD 8-7 1차 주홍장, C.499)
  lb.spawnAcc = 0;
  lb.nextSlot = 0;
  if (p.liberationUnique) {
    lb.base = { stats: { ...s.player.stats }, maxHp: s.player.maxHp };
    for (const k of STAT_IDS) s.player.stats[k] *= p.liberationStatMultiplier;
    const grownHp = s.player.maxHp * (p.liberationStatMultiplier - 1);
    s.player.maxHp += grownHp;
    s.player.hp += grownHp;
    // 지금 기다리는 평타 간격도 공격 속도만큼 줄인다
    s.player.attackTimer = Math.max(1, Math.round(s.player.attackTimer / p.liberationAttackSpeed));
  }
  const endlessLib = !!rr || !!p.kit?.riskDrain || !!p.kit?.stance;
  const relName = s.kit?.second ? p.kit!.mastery!.releaseName : stanceOf(s)?.releaseName;
  emit(s, { kind: 'liberate', seconds: endlessLib ? 0 : (p.liberationUnique ? evoReleaseSecondsOf(p) : null) ?? p.liberationSeconds, // 실제 지속 = 위 ticksLeft 와 같은 값 (C.508 점검B 4 — 주홍장 예외)
    unique: p.liberationUnique, ...(endlessLib ? { endless: true } : {}), ...(relName ? { name: relName } : {}) });
  kitSwapTray(s, true);
  grantLiberationBlocks(s, LB.instantBlocks);
  // 진화체 레스렉시온/만해 시작 규칙 (GDD 8-7 1차, C.499)
  if (s.evo && p.liberationUnique) evoReleaseStart(s);
  return true;
}

/** 해방 순간 지급 (GDD 95장 B2 C.166 후속·106장 4): 평소 출현표(공허 빼고)에서 n개를 바로 넣어 첫 블록까지 공백을 없앤다. 바가 차 있으면 맨 오른쪽 옛 블록을 밀어낸다.
 *  다음 생성은 해방 간격 한 번 뒤 */
function grantLiberationBlocks(s: CombatState, n: number): void {
  if (s.script) return; // 각본 전투(GDD 241-B 1)는 난수 없이 — 해방 뒤 블록은 각본이 3개 놓는다
  if (evoVoidOnly(s.params)) return; // 진화체 '저절로 안 생김' (GDD 8-7 1차 백련, C.499): 해방 순간 지급도 없음
  grantExtraBlocks(s, n, true);
  s.spawnTimer = ticksOf(s.params, spawnIntervalOf(s));
}

/** 블록 추가 생성 (GDD v6.055 7절): 능력으로 '블록 n개를 추가로 생성' — 평소 출현표(공허 빼고)에서 n개를 바로 넣는다. 타이머를 거치지 않으므로 상한(1초)과 무관, 생성 타이머는 그대로.
 *  push = 바가 차 있으면 맨 오른쪽 옛 블록을 밀어낸다(해방 순간 지급), 아니면 바가 차면 멈춘다. 넣은 개수를 돌려준다 */
export function grantExtraBlocks(s: CombatState, n: number, push = false): number {
  const entries = spawnTableOf(s.params, liberationActive(s), null, kitStanceBlockOf(s)).entries.filter((e) => e.source);
  if (entries.length === 0) return 0;
  const total = entries.reduce((a, y) => a + y.chance, 0);
  let made = 0;
  for (let k = 0; k < n; k++) {
    if (s.tray.length >= s.params.trayCapacity) {
      if (!push) break;
      s.tray.splice(s.tray.length - 1, 1);
    }
    const e = drawSpawn(s, entries.map((x) => ({ ...x, chance: x.chance / total })));
    if (e?.source && spawn(s, 'skill', e.source.id, e.family)) made++;
  }
  return made;
}

/** 해방이 풀린다 (지속이 다 됐거나 전투가 끝났다): 능력치·최대 체력을 되돌리고 리스크 게이지가 오른다 (해방마다 한 번) */
function endLiberation(s: CombatState): void {
  const lb = s.liberation;
  if (!liberationActive(s) && lb.base === null) return;
  // 진화체 레스렉시온/만해 끝 규칙 (GDD 8-7 1차, C.499): 아직 해방 중 값으로 (끝날 때 피해·자동 사용 등)
  if (s.evo && s.params.liberationUnique && liberationActive(s) && s.status === 'playing') evoReleaseEnd(s);
  if (lb.base) {
    s.player.stats = lb.base.stats;
    s.player.maxHp = lb.base.maxHp;
    s.player.hp = Math.min(s.player.hp, s.player.maxHp);
    lb.base = null;
  }
  lb.ticksLeft = 0;
  lb.gauge = 0;
  const endless = lb.endless === true;
  delete lb.endless;
  if (s.kit?.second) {
    s.kit.second = false;
    s.kit.finalStack = 0;
  }
  for (const b of s.tray) delete b.lit; // 천쇄참월 불 켠 블록 (C.460)
  kitSwapTray(s, false);
  // 각본 전투(튜토리얼 해방 안내, GDD 241-B 1)는 리스크를 올리지 않는다. 리스크 소모형 모드도 끝날 때 올리지 않는다(게이지를 쓰는 해방 — C.442 추천안)
  const risk = lb.scripted || endless ? 0 : s.params.liberationRisk;
  lb.risk += risk;
  s.events.push({ kind: 'liberation-end', risk, ...(endless ? { endless: true } : {}) });
}

/** 게이지 모드 중 게이지 소모 (GDD 12-4 v6.052 붕옥 융합 — 프라고르 1블록마다): 게이지 −cost(floor 밑으로 안 감), minRisk 밑이면 해방이 풀린다 */
function kitModeSpend(s: CombatState, cost: number): void {
  const rr = s.params.kit?.riskRelease;
  const k = s.kit;
  if (!rr || !k || !s.liberation.endless || !liberationActive(s)) return;
  const next = Math.max(rr.floor, k.risk - cost);
  const spent = k.risk - next;
  k.risk = next;
  k.riskSpent += spent;
  emit(s, { kind: 'kit-risk', spent, risk: k.risk });
  if (k.risk < rr.minRisk) {
    k.modeExits++;
    endLiberation(s);
  }
}

// ── 게이지 소모형 (GDD 12-4 v6.069 이치고 — 호로화·월아천충·각호고·무월수련·무월). 엔진은 장치(riskDrain·mastery·chargeShot·chainRiskCost·chainGauge)만 본다 ──

/** 이번 평타가 충전 평타·마무리 평타인가 (부작용 없음 — 소모는 kitAfterBasic). 마무리 = 두 번째 해방 중 스택 가득: 기본 공격 × (finisherPower + 바의 충전 블록 수 × finisherPerBlock) */
export function kitBasicShot(s: CombatState): { power: number; name: string; final: boolean } | null {
  const kit = s.params.kit;
  const k = s.kit;
  if (!kit || !k) return null;
  const ms = kit.mastery;
  if (ms && k.second && k.finalStack >= ms.stacks) {
    const n = s.tray.filter((b) => !!kitBlockOf(s.params, b.traitId)?.chargeShot).length;
    return { power: ms.finisherPower + n * ms.finisherPerBlock, name: ms.finisherName, final: true };
  }
  if (k.charges > 0) {
    const cs = kit.blocks.find((b) => b.chargeShot)?.chargeShot;
    if (cs) return { power: cs.power, name: cs.name, final: false };
  }
  return null;
}

/** 평타 뒤 (GDD 12-4 v6.069): 충전 1 소모 · 첫 해방(각호고) 중이면 충전 평타마다 게이지 −shotCost · 수련 모드면 수련 +perBasic · 두 번째 해방 중이면 스택 +1 · 마무리를 쐈으면 정리 */
function kitAfterBasic(s: CombatState, shot: { final: boolean } | null): void {
  const kit = s.params.kit;
  const k = s.kit;
  if (!kit || !k) return;
  kitDrainAfterBasic(s, kit, k, shot);
  // 평타 n대마다 전용 블록 1개 추가 (GDD 12-4 v6.070): 출현표에서, 생성 타이머와 무관 (마무리 평타가 바를 비운 뒤)
  if (kit.bonusBlockEvery && kit.bonusBlockEvery > 0 && ++k.basics % kit.bonusBlockEvery === 0 && s.sealTicks === 0 && s.status === 'playing') grantExtraBlocks(s, 1);
}

function kitDrainAfterBasic(s: CombatState, kit: CombatKit, k: KitCombatState, shot: { final: boolean } | null): void {
  if (!kit.riskDrain) return;
  const ms = kit.mastery;
  if (shot?.final && ms) {
    // 최후의 월아천충: 바의 충전 블록 소모 → 두 번째 해방이 풀리고 게이지 limit · 수련 0
    s.tray = s.tray.filter((b) => !kitBlockOf(s.params, b.traitId)?.chargeShot);
    k.finals++;
    k.finalStack = 0;
    // 연출이 있으면(C.473) 자막은 화면이 연출 시각에 띄우고, 두 번째 해방은 연출이 끝날 때 풀린다(advanceTick) — 몸 그림이 동작 도중 바뀌지 않게
    if (!ms.cine) {
      emit(s, { kind: 'kit-line', text: `${ms.finisherName}!`, tone: 'finisher' });
      endLiberation(s);
    }
    k.risk = kit.riskDrain.limit;
    k.mastery = 0;
    k.charges = 0;
    emit(s, { kind: 'kit-risk', spent: -kit.riskDrain.limit, risk: k.risk });
    return;
  }
  const wasEmpty = k.risk <= 0; // 게이지를 0 으로 만든 평타는 수련에 안 친다 (그 다음부터)
  if (shot) {
    k.charges = Math.max(0, k.charges - 1);
    if (liberationActive(s) && s.liberation.endless && !k.second) kitDrainSpend(s, kit.riskDrain.shotCost);
  }
  if (!ms) return;
  if (k.second) {
    if (k.finalStack < ms.stacks) {
      k.finalStack++;
      emit(s, { kind: 'kit-stack', stack: k.finalStack, full: ms.stacks });
    }
  } else if (wasEmpty) kitMasteryGain(s, ms.perBasic);
}

/** 게이지 소모 (0 밑으로 안 감): 0 이 되면 첫 해방이 풀리고(해방 중이면) 수련 게이지로 바뀐다 */
function kitDrainSpend(s: CombatState, cost: number): void {
  const k = s.kit;
  if (!k || cost <= 0 || k.risk <= 0) return;
  const next = Math.max(0, k.risk - cost);
  const spent = k.risk - next;
  k.risk = next;
  k.riskSpent += spent;
  emit(s, { kind: 'kit-risk', spent, risk: k.risk });
  if (k.risk <= 0) {
    k.mastery = 0;
    if (liberationActive(s) && s.liberation.endless && !k.second) {
      k.modeExits++;
      endLiberation(s);
    }
  }
}

/** 수련 게이지 + (가득에서 멈춤, 가득이 되는 순간 해방 준비 알림) */
function kitMasteryGain(s: CombatState, v: number): void {
  const ms = s.params.kit?.mastery;
  const k = s.kit;
  if (!ms || !k || k.second || k.risk > 0 || k.mastery >= ms.full || v <= 0) return;
  k.mastery = Math.min(ms.full, k.mastery + v);
  if (k.mastery >= ms.full && s.status === 'playing') emit(s, { kind: 'liberation-ready' });
}

// ── 자세 모드 (GDD 12-4 이치고 천년혈전, C.460). 엔진은 장치(stance·speedPerStack·powerPerStack·clones·fixed·hold·draw·parry·lanterns)만 본다 — 초월자·자세 id 분기 없음 ──

/** 지금 자세 (자세 모드가 아니면 null) */
export function stanceOf(s: Pick<CombatState, 'params' | 'kit'>): CombatStance | null {
  const sk = s.params.kit?.stance;
  return sk && s.kit ? sk.stances[s.kit.stance] ?? null : null;
}

/** 지금 자세의 블록 id (출현표) */
export function kitStanceBlockOf(s: Pick<CombatState, 'params' | 'kit'>): string | null {
  return stanceOf(s)?.block ?? null;
}

/** 자세 스택 (i 없으면 지금 자세) */
export function kitStanceStackOf(s: Pick<CombatState, 'params' | 'kit'>, i?: number): number {
  if (!s.params.kit?.stance || !s.kit) return 0;
  return s.kit.stanceStacks[i ?? s.kit.stance] ?? 0;
}

/** 자세 만해 중인가 (지속 시간 없는 해방 + 자세 모드) */
function stanceReleaseOn(s: CombatState): boolean {
  return !!s.params.kit?.stance && liberationActive(s) && s.liberation.endless === true;
}

/** [자세]를 지금 누를 수 있는가: 자세 모드 · 만해 중 아님 · 재사용 대기 끝 */
export function canSwitchStance(s: CombatState): boolean {
  return !!s.params.kit?.stance && !!s.kit && s.status === 'playing' && !scriptLocked(s, 'stance') && !liberationActive(s) && s.tick >= s.kit.stanceReadyAt;
}

/** [자세] 남은 대기 초 (0 = 누를 수 있음) */
export function stanceSwitchWaitOf(s: CombatState): number {
  if (!s.kit || !s.params.kit?.stance) return 0;
  return Math.max(0, (s.kit.stanceReadyAt - s.tick) * s.params.tickSeconds);
}

/** 소도 스택 공격속도 (지금 자세 스택만) */
function stanceSpeedBonusOf(s: CombatState): number {
  const st = stanceOf(s);
  return st?.speedPerStack ? st.speedPerStack * kitStanceStackOf(s) : 0;
}

/** 고정 평타 간격 (대도 1초 · 만해 중 0.8초). 없으면 null */
function stanceFixedSecondsOf(s: CombatState): number | null {
  const fx = stanceOf(s)?.fixed;
  if (!fx) return null;
  return liberationActive(s) ? fx.releaseAttackSeconds : fx.attackSeconds;
}

/** 대도 유지 보너스 (1초마다 +perSecond, 최대 max — 자세를 바꾸면 0) */
export function stanceHoldBonusOf(s: Pick<CombatState, 'params' | 'kit'>): number {
  const h = stanceOf(s)?.hold;
  if (!h || !s.kit) return 0;
  return Math.min(h.max, h.perSecond * Math.floor(s.kit.holdTicks * s.params.tickSeconds + 1e-9));
}

/** 자세 평타 배율: 대도 스택 · 유지 보너스 · 고정 간격보다 빠른 공속 몫(고정 ÷ 원래 간격). 자세 모드가 아니면 1 */
export function stanceBasicPowerOf(s: CombatState): number {
  const st = stanceOf(s);
  if (!st) return 1;
  let m = 1 + (st.powerPerStack ? st.powerPerStack * kitStanceStackOf(s) : 0);
  m *= 1 + stanceHoldBonusOf(s);
  const fx = stanceFixedSecondsOf(s);
  if (fx !== null) m *= Math.max(1, fx / Math.max(1e-6, freeAttackSeconds(s)));
  return m;
}

/** 이번 평타의 자세 강화: 천쇄참월 중 = 기본 강화(이름 없음) · 발도 충전이 있으면 그 배율(발도 이름) */
function stanceBasicShot(s: CombatState): { power: number; name: string; final: false } | null {
  const st = stanceOf(s);
  const k = s.kit;
  if (!st || !k) return null;
  if (st.lanterns && stanceReleaseOn(s)) return { power: st.lanterns.basicPower, name: '', final: false };
  if (st.draw && k.drawPower > 1) return { power: k.drawPower, name: st.draw.name, final: false };
  return null;
}

/** 지금 자세 스택 + n (상한·지속 갱신) */
function addStanceStacks(s: CombatState, n: number): void {
  const sk = s.params.kit?.stance;
  const k = s.kit;
  if (!sk || !k || n <= 0) return;
  k.stanceStacks[k.stance] = Math.min(sk.stackMax, (k.stanceStacks[k.stance] ?? 0) + n);
  k.stanceUntil[k.stance] = s.tick + ticksOf(s.params, sk.stackSeconds);
}

/** 그 자세로 한 번 때렸다: 만해 밖 = 스택 +1, 만해 중 = 스택 −1 (0 이면 만해 풀림). 지속은 갱신 */
function stanceHit(s: CombatState): void {
  const sk = s.params.kit?.stance;
  const k = s.kit;
  if (!sk || !k) return;
  if (stanceReleaseOn(s)) {
    k.stanceStacks[k.stance] = Math.max(0, (k.stanceStacks[k.stance] ?? 0) - 1);
    k.stanceUntil[k.stance] = s.tick + ticksOf(s.params, sk.stackSeconds);
    if (k.stanceStacks[k.stance]! <= 0) {
      k.modeExits++;
      endLiberation(s);
    }
    return;
  }
  addStanceStacks(s, 1);
}

/** 평타 뒤: 발도 충전 소모 · 스택 */
function stanceAfterBasic(s: CombatState): void {
  if (!s.params.kit?.stance || !s.kit) return;
  s.kit.drawPower = 1;
  stanceHit(s);
}

/** 혈쇄참월 분신 수: 바의 지금 자세 블록 perChain 개마다 1명(최대 max) */
export function stanceCloneCountOf(s: Pick<CombatState, 'params' | 'kit' | 'tray'>): number {
  const st = stanceOf(s);
  if (!st?.clones) return 0;
  const n = s.tray.filter((b) => b.traitId === KIT_TRAIT_PREFIX + st.block).length;
  return Math.min(st.clones.max, Math.floor(n / Math.max(1, st.clones.perChain)));
}

/** 혈쇄참월 분신: 만해 중 평타마다 분신 수만큼 이 평타와 같은 피해로 한 대씩 (블록은 그대로) */
function stanceClones(s: CombatState, damage: number, delay: number, mu: Matchup): void {
  if (!stanceReleaseOn(s) || damage <= 0) return;
  const n = stanceCloneCountOf(s);
  for (let i = 0; i < n; i++) {
    strike(s, delay, { target: 'enemy', amount: damage, event: { kind: 'player-attack', damage, matchup: mu, kitClone: true }, finisher: { kind: 'basic-attack', traitId: null, element: null, matchup: mu }, elements: [...s.params.playerElements], basic: true });
    if (s.status !== 'playing') return;
  }
}

/** 틱마다: 스택 지속 끝 · 대도 유지 · 패링 창이 닫혔는데 강공격이 안 왔으면 실패 */
function stanceTick(s: CombatState): void {
  const sk = s.params.kit?.stance;
  const k = s.kit;
  if (!sk || !k) return;
  for (let i = 0; i < k.stanceStacks.length; i++) {
    if (k.stanceStacks[i]! > 0 && s.tick > k.stanceUntil[i]!) {
      k.stanceStacks[i] = 0;
      if (i === k.stance && stanceReleaseOn(s)) {
        k.modeExits++;
        endLiberation(s);
      }
    }
  }
  if (sk.stances[k.stance]?.hold) k.holdTicks++;
  if (k.parryOpen && s.guard.ticks <= 0) {
    k.parryOpen = false;
    k.parryFails++;
    emit(s, { kind: 'kit-parry', ok: false });
  }
}

/** 자세 바꾸기: 다음 자세로, 바의 자세 블록도 그 자세 블록으로(새 블록), 유지·발도 충전 0 */
function switchStance(s: CombatState): boolean {
  if (!canSwitchStance(s)) return false;
  const p = s.params;
  const kit = p.kit!;
  const sk = kit.stance!;
  const k = s.kit!;
  const from = sk.stances[k.stance]!;
  k.stance = (k.stance + 1) % sk.stances.length;
  const to = sk.stances[k.stance]!;
  k.stanceReadyAt = s.tick + ticksOf(p, sk.switchSeconds);
  k.holdTicks = 0;
  k.draw = null;
  k.drawPower = 1;
  k.switches++;
  const toB = kit.blocks.find((b) => b.id === to.block);
  for (const b of s.tray) {
    if (b.traitId !== KIT_TRAIT_PREFIX + from.block) continue;
    b.traitId = KIT_TRAIT_PREFIX + to.block;
    b.uid = s.nextUid++; // 다른 블록이 됐다 — 화면이 새 블록으로 그린다
    if (toB?.solo) b.solo = true; else delete b.solo;
    delete b.lit;
  }
  // 평타 간격이 바뀐다 (대도 1초 고정 등): 기다리는 평타가 새 간격보다 길면 줄인다
  s.player.attackTimer = Math.min(s.player.attackTimer, ticksOf(p, currentAttackSeconds(s)));
  emit(s, { kind: 'kit-stance', stance: to.id, name: to.name });
  return true;
}

/** 발도 충전 중인가 (화면: 누르는 블록 강조·충전 배율) — 지금 누른 시간 기준 예상 배율 */
export function stanceDrawPreviewOf(s: CombatState): number | null {
  const d = stanceOf(s)?.draw;
  const k = s.kit;
  if (!d || !k?.draw) return null;
  const held = Math.max(0, (s.tick - k.draw.startTick) * s.params.tickSeconds);
  return 1 + (d.maxPower - 1) * Math.min(1, held / Math.max(1e-6, d.fullSeconds));
}

/** 발도 충전 시작: 바의 cell 번째 지금 자세 블록을 누르기 시작 (만해 중·공격 불가 중 아님) */
function startDraw(s: CombatState, cell: number): boolean {
  const st = stanceOf(s);
  const k = s.kit;
  const b = s.tray[cell];
  if (!st?.draw || !k || k.draw || !b || b.traitId !== KIT_TRAIT_PREFIX + st.block || blockSealed(b) || halted(s) || liberationActive(s)) return false;
  k.draw = { uid: b.uid, startTick: s.tick };
  return true;
}

/** 발도 충전 떼기: 그 블록이 쓰이고 다음 평타 × (1 + (maxPower − 1) × 누른 시간 ÷ fullSeconds) · stackEverySeconds 마다 스택 +stacks */
function releaseDraw(s: CombatState): boolean {
  const st = stanceOf(s);
  const k = s.kit;
  if (!st?.draw || !k?.draw) return false;
  const p = s.params;
  const held = Math.max(0, (s.tick - k.draw.startTick) * p.tickSeconds);
  const idx = s.tray.findIndex((b) => b.uid === k.draw!.uid);
  k.draw = null;
  if (idx < 0 || halted(s)) return false;
  const b = s.tray[idx]!;
  const kb = kitBlockOf(p, b.traitId);
  s.tray.splice(idx, 1);
  const id = b.traitId!;
  s.skillsUsed.push(id);
  s.blocksByTrait[id] = (s.blocksByTrait[id] ?? 0) + 1;
  s.blocksByChain[0]!++;
  const d = st.draw;
  k.drawPower = Math.max(k.drawPower, 1 + (d.maxPower - 1) * Math.min(1, held / Math.max(1e-6, d.fullSeconds)));
  addStanceStacks(s, Math.floor(held / d.stackEverySeconds + 1e-9) * d.stacks);
  emit(s, { kind: 'block', block: 'skill', traitId: id, family: null, element: null, matchup: 'neutral', role: 'attack', chain: 1, damage: 0, weak: false, heal: 0, guardSeconds: 0, bonus: null, kitName: d.name, kitFx: kb?.fx ?? '', kitCharge: Math.round(k.drawPower * 100) / 100 });
  updateCombos(s, null, 0);
  counterIfStance(s);
  return true;
}

/** 평타 시각에 아직 발도 충전 중 = 자세 무너짐: 그 평타 취소 · breakSeconds 동안 받는 피해 +breakTaken (블록은 그대로) */
function drawOverheld(s: CombatState): boolean {
  const k = s.kit;
  if (!k?.draw) return false;
  const d = stanceOf(s)?.draw;
  k.draw = null;
  if (!d) return false;
  k.breaks++;
  k.brokenUntil = s.tick + ticksOf(s.params, d.breakSeconds);
  emit(s, { kind: 'kit-break', seconds: d.breakSeconds });
  return true;
}

/** 자세 무너짐 중 받는 피해 추가 비율 (아니면 0) */
export function stanceBreakTakenOf(s: Pick<CombatState, 'params' | 'kit' | 'tick'>): number {
  const k = s.kit;
  if (!k || s.tick >= k.brokenUntil) return 0;
  return s.params.kit?.stance?.stances.find((x) => x.draw)?.draw?.breakTaken ?? 0;
}

/** 천쇄참월 불 켠 블록 수 */
export function stanceLitCountOf(s: Pick<CombatState, 'tray'>): number {
  return s.tray.filter((b) => b.lit).length;
}

/** 천쇄참월 회색 블록 불 켜기/끄기 (최대 max) */
function toggleLantern(s: CombatState, index: number, max: number): boolean {
  const b = s.tray[index];
  if (!b) return false;
  if (b.lit) delete b.lit;
  else if (stanceLitCountOf(s) < max) b.lit = true;
  else return false;
  emit(s, { kind: 'kit-lantern', lit: stanceLitCountOf(s) });
  return true;
}

/** 천쇄참월 중 강공격 피격 배율 (1 + 불 켠 블록 × perTaken) */
function lanternTakenOf(s: CombatState): number {
  const ln = stanceOf(s)?.lanterns;
  return ln && stanceReleaseOn(s) ? 1 + ln.perTaken * stanceLitCountOf(s) : 1;
}

function clearLanterns(s: CombatState): void {
  if (!s.tray.some((b) => b.lit)) return;
  for (const b of s.tray) delete b.lit;
  emit(s, { kind: 'kit-lantern', lit: 0 });
}

/** 패링 성공: 막기 창 닫힘·게이지 다시 가득 · 스택 +stacks(+ 불 1개당 perStacks) · 적 행동 정지 stunSeconds(+ 불 1개당 perStun) · 방어 무시 피해 × power(× (1 + 불 1개당 perPower)) · 불 꺼짐 */
function parrySuccess(s: CombatState): void {
  const st = stanceOf(s);
  const pr = st?.parry;
  const k = s.kit;
  if (!st || !pr || !k) return;
  const p = s.params;
  k.parryOpen = false;
  k.parries++;
  s.guard.ticks = 0;
  s.guardGauge = 1;
  const ln = st.lanterns && stanceReleaseOn(s) ? st.lanterns : null;
  const lit = ln ? stanceLitCountOf(s) : 0;
  addStanceStacks(s, pr.stacks + (ln ? ln.perStacks * lit : 0));
  s.knockbackTicks = Math.max(s.knockbackTicks ?? 0, ticksOf(p, pr.stunSeconds + (ln ? ln.perStun * lit : 0)));
  emit(s, { kind: 'kit-parry', ok: true });
  const hit = playerHitMultiplier(s, p.playerElements, PLAYER_BASIC_CATEGORY, pr.ignoreDefense);
  const { damage, crit, elem } = playerHit(s, unitDamage(p) * p.attackPowerMultiplier * hit.mult * pr.power * (1 + (ln ? ln.perPower * lit : 0)), false, p.playerElements);
  clearLanterns(s);
  strike(s, 0, { target: 'enemy', amount: damage, event: { kind: 'player-attack', damage, matchup: hit.matchup, crit, elem, kitShot: pr.name }, finisher: { kind: 'basic-attack', traitId: null, element: null, matchup: hit.matchup }, elements: [...p.playerElements], basic: true });
}

function shuffleTray(s: CombatState): void {
  const t = s.tray;
  // 고정 특수 블록 (GDD 8-7 1차 공화 공허 블록, C.499)은 제자리 — 나머지 칸끼리만 섞는다 (고정이 없으면 옛 순서 그대로)
  const free = t.map((b, i) => (b.fixed ? -1 : i)).filter((i) => i >= 0);
  for (let k = free.length - 1; k > 0; k--) {
    const i = free[k]!;
    const j = free[nextInt(s.rng, k + 1)]!;
    [t[i], t[j]] = [t[j]!, t[i]!];
  }
  emit(s, { kind: 'shuffle' });
}

/** 적의 공격 상성 (적 속성 → 내 속성) */
export function enemyMatchup(s: CombatState): Matchup {
  return matchup(enemyElements(s.enemy.def), s.params.playerElements);
}

/** 적 공격 피해 (GDD 20-3): 기본 공격 N회 분량 × 흔들림 × 받는 피해 배율 × 능력치 비(적 → 나, 적 분류) × 상성 × 분류별 받는 피해 */
/**
 * 이번 적 공격의 분류 (GDD v6 7-10, 보관본 245장 11 정정): 공격마다 데이터로 — 일반 공격·반격 = attackCategory, 강공격 = pattern.heavyCategories[순번].
 * 없으면 그 적 category 를 물려받는다(물리 적 = 전부 물리, 특수 적 = 전부 특수). mixed 면 physicalShare(없으면 balance mixedPhysicalShare) 비율로 굴린다. 적 id 분기 없음
 */
function enemyAttackCat(s: CombatState, heavyOrder: number | null = null): AttackCategory {
  const def = s.enemy.def;
  const pat = def.pattern;
  const list = heavyOrder !== null && pat && 'heavyCategories' in pat ? pat.heavyCategories : undefined;
  const c = (heavyOrder !== null ? list?.[heavyOrder] : def.attackCategory) ?? def.category;
  if (c !== 'mixed') return c;
  return nextFloat(s.rng) < (def.physicalShare ?? CX.mixedPhysicalShare) ? 'physical' : 'special';
}

/** 이번 강공격의 한 주기 안 순번(0부터): 연속 강공격 = 몇 번째 타, 강공격·봉인 번갈아 = 순서 속 몇 번째 강공격 */
function heavyOrderOf(s: CombatState, chainLeft: number): number {
  const pat = s.enemy.def.pattern;
  if (pat?.kind === 'heavy-chain') return Math.max(0, pat.hits - 1 - chainLeft);
  if (pat?.kind === 'heavy-seal') {
    const at = (s.enemy.actionIndex - 1 + pat.sequence.length) % pat.sequence.length;
    return Math.max(0, pat.sequence.slice(0, at + 1).filter((a) => a === 'heavy').length - 1);
  }
  return 0;
}

function enemyDamage(s: CombatState, inAttacks: number, cat: AttackCategory = s.enemy.def.category): number {
  const p = s.params;
  const jitter = 1 + (nextFloat(s.rng) * 2 - 1) * p.enemyDamageVariance;
  const els = enemyElements(s.enemy.def);
  const ratio = statRatio(s.enemy.stats, s.player.stats, cat);
  const em = enemyMatchup(s);
  const mm = em === 'strong' && p.abilityEffects.noWeak ? 1 : matchupMultiplier(p, em);
  const mutation = 1 - (p.abilityEffects.mutation?.taken ?? 0);
  return inAttacks * p.playerAttackDamage * jitter * p.damageTakenMultiplier * ratio * mm * p.categoryTaken[cat] * mutation;
}

/** 지금 막기 상태의 경감 (GDD 105장 수정 v5.233): 강공격 = 완전히 막음, 일반 공격 = 경감 없음 */
function guardReductionOf(s: CombatState, heavy = false): number {
  return s.guard.ticks > 0 && heavy ? 1 : 0;
}

/** 블록 생성 게이지 (GDD 178장 1, 화면 표시용 — 규칙은 바꾸지 않고 지금 타이머·간격만 읽는다).
 *  fill = 다음 블록까지 찬 비율(0~1), intervalSeconds = 지금 생성 간격(피곤·빈사·장비·특성·해방·각성 보정이 다 든 값).
 *  state: filling(차는 중) · full(블록 바가 가득 차 멈춤) · sealed(봉인 상태이상) · paused(막기·경직 중 멈춤) · off(각본 전투 — 타이머로 안 나옴) */
export interface SpawnGaugeView {
  fill: number;
  intervalSeconds: number;
  state: 'filling' | 'full' | 'sealed' | 'paused' | 'off';
}

export function spawnGaugeOf(s: CombatState): SpawnGaugeView {
  const intervalSeconds = spawnIntervalOf(s);
  const total = Math.max(1, ticksOf(s.params, intervalSeconds));
  const fill = Math.min(1, Math.max(0, 1 - s.spawnTimer / total));
  if (s.script) return { fill: 0, intervalSeconds, state: 'off' };
  if (s.sealTicks > 0) return { fill, intervalSeconds, state: 'sealed' };
  if (s.tray.length >= s.params.trayCapacity) return { fill: 1, intervalSeconds, state: 'full' };
  if (halted(s)) return { fill, intervalSeconds, state: 'paused' };
  return { fill, intervalSeconds, state: 'filling' };
}

/** 막기·경직 중인가: 내 자동 공격·블록 생성·블록 사용이 멈춘다 (GDD 84장 2번·101장 추가 결정 2번·105장 1번) */
export function halted(s: CombatState): boolean {
  return s.guard.ticks > 0 || (s.stunTicks ?? 0) > 0 || kitCineOn(s);
}

/** 마무리 평타 연출 중인가 (C.473, GDD 12-4 v6.102): 무적·적 정지·내 평타·블록 생성·사용 멈춤 */
export function kitCineOn(s: CombatState): boolean {
  return !!s.kit?.cine && s.status === 'playing';
}

/** 회피 (GDD 101장 4번, 폭주): 적 공격 한 번을 통째로 피했는가. 피했으면 'evade' 이벤트 (확률 0 이면 난수를 쓰지 않는다) */
function evaded(s: CombatState): boolean {
  if (kitBare(s)) return false; // 융합 중 회피 없음 (GDD 12-4 v6.052)
  if (s.params.evadeChance <= 0 || nextFloat(s.rng) >= s.params.evadeChance) return false;
  s.evades = (s.evades ?? 0) + 1;
  const eb = s.params.kit?.evadeBuff;
  if (eb && s.kit) {
    // 회피 치명 버프 (GDD 12-4 v6.066): 지금부터 seconds 동안 — 다시 회피하면 새로 셈
    s.kit.evadeBuffUntil = s.tick + ticksOf(s.params, eb.seconds);
    s.kit.evadeBuffs++;
  }
  emit(s, { kind: 'evade' });
  return true;
}

/** 강공격 착탄: 막기 상태면 크게 줄고(막기 성공), 반사 효과가 있으면 막은 피해를 돌려준다.
 *  GDD 245장 3: 예고가 끝나는 이 틱에 바로 판정·피해(옛 hitDelay.heavy 만큼 뒤 착탄 삭제). 빔 모션은 heavy-windup 때 시작했으므로 그랬으면 사건은 landed */
function resolveHeavy(s: CombatState, wound = false, chainLeft = 0): void {
  const pattern = s.enemy.def.pattern;
  const sc = s.script;
  if (sc) {
    // 각본 전투 (GDD 123장 5): 강공격 패턴이 없는 적도 각본이 시전시킨다. 못 막으면 체력을 leaveHpFraction 만 남긴다
    sc.heavyHits++;
    const guarded = s.guard.ticks > 0;
    if (guarded) s.guardSuccesses++;
    const damage = guarded ? 0 : Math.max(0, s.player.hp - s.player.maxHp * sc.leaveHpFraction);
    strike(s, 0, { target: 'player', amount: damage, event: { kind: 'heavy-hit', damage, guarded, reflected: 0, matchup: enemyMatchup(s), crit: false, ...(wound ? { landed: true } : {}) }, elements: enemyElements(s.enemy.def) });
    return;
  }
  if (!pattern || !('heavyInAttacks' in pattern)) return;
  if (evaded(s)) return;
  const crit = rollCrit(s, 'enemy');
  const cat = enemyAttackCat(s, heavyOrderOf(s, chainLeft));
  let damage = enemyDamage(s, pattern.heavyInAttacks * (pattern.kind === 'heavy-chain' ? s.params.heavyChainHitMultiplier : s.params.heavyHitMultiplier), cat) * (crit ? s.params.critMultiplier : 1);
  const guarded = s.guard.ticks > 0;
  // 패링 성공 (GDD 12-4 천년혈전, C.460): 피해 0 · 스택 · 적 자세 무너짐 · 방무 피해
  if (guarded && s.kit?.parryOpen) {
    strike(s, 0, { target: 'player', amount: 0, event: { kind: 'heavy-hit', damage: 0, guarded: true, reflected: 0, matchup: enemyMatchup(s), crit, cat: shownCat(cat), ...(wound ? { landed: true } : {}) }, elements: enemyElements(s.enemy.def) });
    s.guardSuccesses++;
    parrySuccess(s);
    return;
  }
  // 천쇄참월 불 켠 블록 (C.460): 강공격에 맞으면 1개당 받는 피해 + (막기로 막아도 맞은 몫에) — 뒤에 모두 꺼짐
  if (!guarded) damage *= lanternTakenOf(s);
  let reflected = 0;
  if (guarded) {
    const blocked = damage * guardReductionOf(s, true);
    damage -= blocked;
    s.guardSuccesses++;
    reflected = blocked * s.guard.reflect;
  }
  strike(s, 0, { target: 'player', amount: damage, event: { kind: 'heavy-hit', damage, guarded, reflected, matchup: enemyMatchup(s), crit, cat: shownCat(cat), ...(wound ? { landed: true } : {}) }, elements: enemyElements(s.enemy.def), reflected });
  if (!guarded) clearLanterns(s);
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
  // 첫 강공격 (GDD 121장 11): 막기 게이지가 처음 가득 차기 전에는 미룬다 — 다음 틱에 다시 굴림
  if (action === 'heavy' && !s.guardFilled) {
    e.actionTimer = 1;
    return;
  }
  e.actionIndex++;
  if (action === 'heavy') {
    const total = t(pattern.castSeconds);
    e.cast = { ticks: total, total, hitsLeft: pattern.kind === 'heavy-chain' ? pattern.hits - 1 : 0 };
    emit(s, { kind: 'heavy-cast', seconds: pattern.castSeconds });
    heavyWindup(s);
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
  if (evaded(s)) return;
  const crit = rollCrit(s, 'enemy');
  const cat = enemyAttackCat(s);
  const raw = enemyDamage(s, pattern.counterInAttacks, cat) * (crit ? s.params.critMultiplier : 1);
  const guarded = s.guard.ticks > 0;
  const damage = raw * (1 - guardReductionOf(s));
  strike(s, s.params.hitDelay.counter, { target: 'player', amount: damage, event: { kind: 'counter', damage, guarded, matchup: enemyMatchup(s), crit, cat: shownCat(cat) }, elements: enemyElements(s.enemy.def) });
}

// ── 허무 적의 처형 (GDD 8-8 v6.160 ④, C.531) ──

/** 처형 막기 판정 폭(틱): 원이 닿는 틱 ± 이 값. 0.1초 틱에서 ±0.15초 = ±1틱(입력이 틱 경계로 올림돼 실제 폭 약 0.3초) */
function executeWindowTicks(p: CombatParams): number {
  return Math.max(0, Math.floor((p.foeExecute?.windowSeconds ?? 0) / p.tickSeconds + 1e-9));
}

/** 지금 적이 나를 처형할 수 있는 선 (내 최대 체력 비율): 처형하는 속성 적(속성 데이터 foeExecute)만, 적 등급별. 아니면 0 */
export function foeExecuteLineOf(s: Pick<CombatState, 'params' | 'enemy' | 'boss' | 'script'>): number {
  const fx = s.params.foeExecute;
  if (!fx || s.script || s.params.enemyPassive || !canFoeExecute(enemyElements(s.enemy.def))) return 0;
  return fx.hpLine[s.boss ? 'boss' : s.enemy.def.class] ?? 0;
}

/** 지금 처형 시도 중인가 — 화면·봇용: 원이 닿는 틱과 판정 폭(틱) */
export function foeExecuteRingOf(s: Pick<CombatState, 'execution' | 'params'>): { startTick: number; hitTick: number; windowTicks: number } | null {
  const r = s.execution?.ring;
  return r ? { ...r, windowTicks: executeWindowTicks(s.params) } : null;
}

/** 매 틱(적 차례): 처형 시도 중이면 놓쳤는지 보고(true = 적은 이번 틱 다른 행동 없음), 아니면 내 체력이 선 이하이고 주기가 됐을 때 새 시도를 연다.
 *  강공격 시전 중에는 열지 않는다(그 시전이 끝난 뒤) */
function foeExecuteTick(s: CombatState): boolean {
  const fx = s.params.foeExecute;
  if (!fx) return false;
  const x = s.execution;
  if (x?.ring) {
    if (s.tick > x.ring.hitTick + executeWindowTicks(s.params)) failExecution(s);
    return true;
  }
  const line = foeExecuteLineOf(s);
  if (line <= 0 || s.enemy.cast || s.player.hp > s.player.maxHp * line) return false;
  if (x && s.tick < x.nextTick) return false;
  const hitTick = s.tick + ticksOf(s.params, fx.ringSeconds);
  s.execution = { ring: { startTick: s.tick, hitTick }, nextTick: s.tick + ticksOf(s.params, fx.everySeconds), attempts: (x?.attempts ?? 0) + 1, blocked: x?.blocked ?? 0 };
  emit(s, { kind: 'foe-execute', seconds: fx.ringSeconds, atTick: hitTick, windowSeconds: fx.windowSeconds });
  return true;
}

/** 처형당했다 (못 맞춤·안 누름): 패배 — 사망 없음 원칙대로 패배 귀환 (되살아남·체력 하한도 처형은 못 막는다) */
function failExecution(s: CombatState): void {
  if (s.execution) s.execution.ring = null;
  emit(s, { kind: 'foe-execute-end', ok: false, damage: 0, stunSeconds: 0 });
  s.player.hp = 0;
  s.status = 'lost';
  s.lossReason = 'executed';
  emit(s, { kind: 'end', status: 'lost' });
}

/** 처형 막기 입력: 판정 안이면 막는다 — 그 적 일반 공격 1번 × blockedDamage 만큼만 받고(체력 1 하한), 적은 stunSeconds 스턴. 판정 밖이면 처형당한다. 시도 중이 아니면 거절 */
function guardExecution(s: CombatState): boolean {
  const fx = s.params.foeExecute;
  const x = s.execution;
  if (!fx || !x?.ring) return false;
  const now = s.tick + inputTickLead;
  if (Math.abs(now - x.ring.hitTick) > executeWindowTicks(s.params)) {
    failExecution(s);
    return true;
  }
  x.ring = null;
  x.blocked++;
  const e = s.enemy;
  const raw = enemyDamage(s, e.def.attackInAttacks, enemyAttackCat(s)) * (s.params.attackScale[e.def.class] ?? 1) * fx.blockedDamage;
  const damage = Math.max(0, Math.min(raw, s.player.hp - 1));
  s.player.hp -= damage;
  s.damageTaken = (s.damageTaken ?? 0) + damage;
  e.stunTicks = ticksOf(s.params, fx.stunSeconds);
  emit(s, { kind: 'foe-execute-end', ok: true, damage, stunSeconds: fx.stunSeconds });
  return true;
}

/** 한 틱 진행: 버프 → 안개 섞기 → 블록 생성 → 내 기본 공격 → 적 행동 → 시간 제한 */
function advanceTick(s: CombatState): void {
  const p = s.params;
  const t = (sec: number) => ticksOf(p, sec);
  s.tick++;
  // 예약된 피해 (GDD 214장): 발동 뒤 타격 지연이 지난 공격이 지금 맞는다
  landDueHits(s);
  if (s.status !== 'playing') return;
  // 마무리 평타 연출 끝 (C.473, GDD 12-4 v6.102): 동작이 끝나면 두 번째 해방이 풀린다
  if (s.kit?.cine && s.tick >= s.kit.cine.end) {
    s.kit.cine = null;
    endLiberation(s);
  }
  /** 연출 중이면 적·펫·보스 기믹이 멈춘다 (내 쪽은 halted) */
  const cineHold = kitCineOn(s);
  if (s.guard.ticks > 0 && --s.guard.ticks === 0) s.guard.reflect = 0;
  if (s.stunTicks && s.stunTicks > 0) s.stunTicks--;
  stanceTick(s);
  if (s.status !== 'playing') return;
  chargeButtons(s);
  if (!s.liberation.endless) {
    if (s.liberation.ticksLeft === 1) endLiberation(s);
    else if (s.liberation.ticksLeft > 1) s.liberation.ticksLeft--;
  }
  // 게이지 소모형 첫 해방(각호고, GDD 12-4 v6.070): 주기마다 게이지 −tickCost — 0 이면 풀림
  const rdr = p.kit?.riskDrain;
  if (rdr && s.kit && !s.kit.second && s.liberation.endless && liberationActive(s) && rdr.tickCost > 0 && --s.kit.drainTimer <= 0) {
    s.kit.drainTimer = t(rdr.tickSeconds);
    kitDrainSpend(s, rdr.tickCost);
    if (s.status !== 'playing') return;
  }
  // 리스크 소모형 해방 준비 알림 (GDD 12-4 v6.050): 문턱을 넘는 순간 한 번
  if (s.kit && s.params.kit?.riskRelease) {
    const ready = canLiberate(s);
    if (ready && !s.kit.readyShown) emit(s, { kind: 'liberation-ready' });
    s.kit.readyShown = ready;
  }
  if (s.sealTicks > 0) s.sealTicks--;
  for (const b of s.tray) if (b.sealTicks && b.sealTicks > 0) b.sealTicks--;
  // 진화체 고유 능력 시간 (GDD 8-7 1차, C.499): 시간 스택·버프 끝, every·timer 규칙
  if (s.evo) {
    evoTick(s);
    if (s.status !== 'playing') return;
  }
  // 물공 블록 지속 효과 (GDD 49장): 바위 자세 · 평타 가속
  if (s.stoneStance && s.stoneStance.ticks > 0 && --s.stoneStance.ticks === 0) s.stoneStance.stacked = 0;
  if (s.basicHaste && s.basicHaste.ticks > 0) s.basicHaste.ticks--;
  // 독 지속 피해 (GDD 20-2)
  if (s.enemy.dot) {
    const d = s.enemy.dot;
    emit(s, { kind: 'dot', target: 'enemy', damage: d.perTick });
    if (--d.ticks <= 0) s.enemy.dot = null;
    dealDamage(s, d.perTick, { kind: 'dot', traitId: null, element: null, ...(d.element ? { dotElement: d.element } : {}) });
    if (s.status !== 'playing') return;
  }
  if (s.player.dot) {
    const d = s.player.dot;
    emit(s, { kind: 'dot', target: 'player', damage: d.perTick });
    if (--d.ticks <= 0) s.player.dot = null;
    takeDamage(s, d.perTick);
    if (s.status !== 'playing') return;
  }
  if (!s.script && p.trayShuffleSeconds > 0 && --s.shuffleTimer <= 0) {
    s.shuffleTimer = t(p.trayShuffleSeconds);
    shuffleTray(s);
  }
  // 블록 생성 (GDD 84장 6번, C.136): 타이머 하나가 다 되면 출현표에서 하나를 뽑는다. 바가 가득 차거나 봉인 중이거나 막기 중(84장 2번)이면 타이머가 멈춘다.
  // 해방 중(GDD 83장)에는 해방 표(장착 블록, 공허 없음)를 해방 생성 배율만큼 빠른 간격으로
  if (!s.script && s.sealTicks === 0 && !halted(s) && s.tray.length < p.trayCapacity && --s.spawnTimer <= 0) {
    s.spawnTimer = t(spawnIntervalOf(s));
    const e = drawSpawnEvo(s, spawnTableOf(p, liberationActive(s), kitRiskOf(s), kitStanceBlockOf(s)).entries);
    if (e?.kind === 'void') spawn(s, 'void', null);
    else if (evoVoidOnly(p)) {
      // 진화체 '허 블록 말고는 저절로 안 생김' (GDD 8-7 1차 백련, C.499): 허가 아니면 이번 생성은 없다
    } else if (e?.phys) {
      // 물공 생성원 (GDD 49-11): 그 속성 물공 블록(기본 공격 블록) 1개, 계열은 종족 계열 표에서 고르게
      if (spawn(s, 'skill', BASIC_SKILL_ID, drawPhysFamily(s))) s.physSpawned = (s.physSpawned ?? 0) + 1;
    } else if (e?.source) spawn(s, 'skill', e.source.id, e.family);
  }
  if (s.boss && !cineHold) bossGimmick(s, s.boss);
  // 내 자동 기본 공격: 막기 중(GDD 84장 2번)에는 멈춘다
  // 각본 마무리 체인이 날아가는 동안(피해를 맡겨 둔 동안)도 멈춘다 (GDD 146장)
  // 블록 몸동작 (GDD 7-2 '모션 중엔 평타 없음', C.448): 블록 모션이 재생 중이거나 줄을 서 있으면 평타 타이머가 멈추고, 끝나면 다시 돈다
  advanceBlockMotion(s);
  if (!halted(s) && !s.script?.held && !blockMotionBusy(s) && --s.player.attackTimer <= 0) {
    s.player.attackTimer = t(currentAttackSeconds(s));
    // 발도 충전 중 평타 시각을 넘김 = 자세 무너짐 (C.460): 이 평타 취소
    if (!drawOverheld(s)) basicAttack(s);
    if (s.status !== 'playing') return;
  }
  // 펫 공격 (GDD 241-D 4): 내 막기·기절과 상관없이 제 간격으로. 각본(튜토리얼) 전투는 쉼
  const pa = p.petAttack;
  if (pa && !s.script && !cineHold) {
    s.petTimer ??= t(pa.seconds);
    if (--s.petTimer <= 0) {
      s.petTimer = t(pa.seconds);
      petAttack(s, pa);
      if (s.status !== 'playing') return;
    }
  }
  // 2번째 칸 펫 (GDD 8-7 1차 추성, C.506): 제 간격으로 같이 공격 — 첫 공격은 반 간격 늦게(두 마리가 겹쳐 치지 않게)
  const pa2 = p.petAttack2;
  if (pa2 && !s.script && !cineHold) {
    s.petTimer2 ??= t(pa2.seconds * 1.5);
    if (--s.petTimer2 <= 0) {
      s.petTimer2 = t(pa2.seconds);
      petAttack(s, pa2, true);
      if (s.status !== 'playing') return;
    }
  }
  // 적: 시전 중이면 강공격 대기, 아니면 기본 공격 + 패턴의 특수 행동(강공격 예고 / 봉인 / 방어 자세)
  const e = s.enemy;
  const pattern = e.def.pattern;
  const attackTicks = t(enemyAttackSecondsOf(p, pattern) * (s.boss?.attackMult ?? 1));
  if (!cineHold && e.stance && --e.stance.ticks <= 0) {
    e.stance = null;
    emit(s, { kind: 'stance-end' });
  }
  // 넉백 (GDD 49장 혈 블록): 적의 공격·시전·특수 행동 타이머가 모두 멈춘다
  // 빔이 이미 나가는 중(heavy-windup 뒤)이면 넉백도 강공격 판정을 늦추지 않는다 — 빔이 닿는 순간 = 판정 (GDD 245장 3)
  if (cineHold) {
    // 마무리 평타 연출 (C.473): 적의 모든 타이머가 멈춘다 (무적이라 결과는 같고, 연출 뒤 적이 몰아치지 않게)
  } else if ((e.stunTicks ?? 0) > 0) {
    // 처형을 막혀 스턴 (GDD 8-8 v6.160 ④, C.531): 공격·시전·특수 행동 타이머가 모두 멈춘다
    e.stunTicks!--;
  } else if (foeExecuteTick(s)) {
    // 처형 시도 중 (C.531): 원이 줄어드는 동안 적은 처형만 노린다 — 다른 공격·행동 타이머 멈춤
    if (s.status !== 'playing') return;
  } else if ((s.knockbackTicks ?? 0) > 0 && !e.cast?.windup) {
    s.knockbackTicks!--;
  } else if (e.cast) {
    if ((s.knockbackTicks ?? 0) > 0) s.knockbackTicks!--;
    if (--e.cast.ticks <= 0) {
      const more = e.cast.hitsLeft;
      const wound = !!e.cast.windup;
      e.cast = null;
      resolveHeavy(s, wound, more);
      if (s.status === 'playing' && more > 0 && pattern?.kind === 'heavy-chain') {
        const total = t(pattern.followCastSeconds);
        e.cast = { ticks: total, total, hitsLeft: more - 1 };
        emit(s, { kind: 'heavy-cast', seconds: pattern.followCastSeconds });
        heavyWindup(s);
      } else {
        e.attackTimer = attackTicks;
        if (hasSpecialActions(pattern)) e.actionTimer = t(pattern.everySeconds);
      }
    } else heavyWindup(s);
  } else if (!s.script && !p.enemyPassive) {
    // 각본 전투는 적 일반 공격·특수 행동이 없다 (테스트 모드 '공격 안 함'도 같다, C.457) — 강공격은 각본이 시전시킨다 (GDD 123장 5)
    // 적 공격 속도 − (GDD 8-7 2차 토르멘타 자기장, C.515): 시계가 (1 − 값) 빠르기로 — 이번 틱은 안 감
    if (!(s.evo && evoFoeSlowSkip(s)) && --e.attackTimer <= 0) {
      e.attackTimer = attackTicks;
      if (!evaded(s)) {
        const crit = rollCrit(s, 'enemy');
        // 기본 공격 피해 배율 (C.306, GDD 193장 1): 적 등급별 — 강공격·반격·졸개(105장 '최대 체력 약 20%')는 그대로
        const cat = enemyAttackCat(s);
        const raw = enemyDamage(s, e.def.attackInAttacks, cat) * (p.attackScale[e.def.class] ?? 1) * (p.enemyHitPacing ?? 1) * (crit ? p.critMultiplier : 1);
        const guarded = s.guard.ticks > 0;
        const damage = raw * (1 - guardReductionOf(s));
        strike(s, p.hitDelay.enemy, { target: 'player', amount: damage, event: { kind: 'enemy-attack', damage, guarded, matchup: enemyMatchup(s), crit, cat: shownCat(cat) }, elements: enemyElements(e.def) });
      }
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
  inputTickLead = 1;
  let accepted: boolean[];
  try {
    accepted = list.map((x) => applyInput(s, x));
  } finally {
    inputTickLead = 0;
  }
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

// 진화체 고유 능력 장치가 쓰는 엔진 안쪽 동작 (GDD 8-7 1차, C.499 — evoUnique.ts 는 combat.ts 를 import 하지 않는다)
registerEvoApi({
  spawnDraw: spawnEvoDraw,
  spawnMade(s, element, family) {
    // 그 속성·계열 블록 (GDD 8-7 1차 니에블라 '물·탄 블록 3개'): 흡수 생성원 중 맞는 것 → 없으면 기본 블록(내 속성이 맞을 때). 계열이 없으면 평소 출현표에서 고른 계열
    const p = s.params;
    const want = element === 'self' ? p.playerElements[0] ?? null : element;
    const fam = family ?? spawnTableOf(p).entries.find((e) => e.kind === 'skill' && e.family)?.family ?? null;
    const own = p.skills.find((x) => x.role === 'attack' && (want === null || x.element === want) && (family === null || x.family === family));
    if (own) return spawn(s, 'skill', own.id, own.family ?? fam);
    if (want !== null && want !== (p.playerElements[0] ?? null)) return false;
    return spawn(s, 'skill', BASIC_SKILL_ID, fam);
  },
  place: placeEvoBlock,
  extraBasic: extraBasicAttack,
  unitOf(s, basis, element, ignore) {
    const p = s.params;
    if (basis === 'basic') return evoBasicUnitOf(s, ignore);
    if (basis === 'void') return p.voidPowerInAttacks * unitDamage(p) * plainHitMultiplier(s);
    const els = element ? [element] : [];
    return p.basicBlockPowerInAttacks * unitDamage(p) * playerHitMultiplier(s, els, PLAYER_BLOCK_CATEGORY, ignore).mult;
  },
  strike(s, amount, text, element, exact) {
    // exact (C.506): 이미 정해진 피해(막은 양·방금 평타 피해 비율) — 치명·특성 배율을 다시 붙이지 않는다 (섬뢰각 분신 '같은 피해')
    const damage = exact ? amount : playerHit(s, amount, false, element ? [element] : []).damage;
    if (text) emit(s, { kind: 'evo-proc', text, damage });
    dealDamage(s, damage, { kind: 'special', traitId: null, element });
  },
  dot(s, damage, element) {
    // 진화체 지속 피해 (C.515 토르멘타 자기장·비보라 독): 독 숫자와 같은 dot 사건. element = 그 지속 피해의 속성(독이면 독 속성 — 런 로그 dotKill, C.532)
    emit(s, { kind: 'dot', target: 'enemy', damage });
    dealDamage(s, damage, { kind: 'dot', traitId: null, element: null, ...(element ? { dotElement: element } : {}) });
  },
  elementOf(s, b) {
    if (b.kind === 'void') return 'void';
    return blockElementOf(s.params, b);
  },
  execute(s) {
    emit(s, { kind: 'evo-proc', text: EXECUTE_TEXT, damage: s.enemy.hp });
    s.evo!.procs[EXECUTE_TEXT] = (s.evo!.procs[EXECUTE_TEXT] ?? 0) + 1;
    dealDamage(s, s.enemy.hp + 1, { kind: 'special', traitId: null, element: null });
  },
  addGauge,
  ticksOf,
  chainCap: (s) => chainCapOf(s),
});
