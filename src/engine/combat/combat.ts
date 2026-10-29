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
  /** 막기 (GDD 105장 수정 v5.233): 게이지가 0 → 100% 차는 시간(초, 성향·강화 보정은 속도), 누르면 이 시간(초) 동안 강공격 완전 막기(일반 공격 경감 없음) */
  guardGaugeSeconds: number;
  guardSeconds: number;
  /** 전투 [소모품] (GDD 105장 수정 3·108장 3번): 장비 화면 소모품 칸에 든 전투용 소모품 효과. 없으면 버튼 비활성. 전투당 1회 */
  battleItem: BattleItemEffect | null;
  /** 전투 [장비] (GDD 105장 수정 4): 낀 장비의 '발동' 효과 하나. 없으면 버튼 비활성. 쿨다운 gearCooldownSeconds, 전투 시작 때 × gearStartCooldown */
  activeGear: ActiveGearEffect | null;
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
  /** 컨디션·환경(폐가)·5바퀴 이후·한계 돌파: 공허 블록 생성 확률 가산 */
  voidChanceBonus: number;
  /** 적 공격 한 번을 통째로 피할 확률 (GDD 101장 4번 — 폭주 중 risk.frenzyEvadeChance). 0 = 없음 */
  evadeChance: number;
  /** 해방 (GDD 83장, C.134 — 옛 저장형 필살기 자리): 이 전투에서 해방할 수 있는가. false 면 게이지도 차지 않는다 (튜토리얼·연습 등 부르는 쪽이 정한다) */
  liberationEnabled: boolean;
  /** 해방 게이지: 블록 1개 사용당, 체인 단계별 보너스(사용 한 번), 전투 시작 게이지(둥지 애착: 안정 수치 비례, liberationStartGaugeOf) */
  liberationGaugePerBlock: number;
  liberationChainBonus: readonly number[];
  liberationStartGauge: number;
  /** C.154 (GDD 95장 B2): 피해로도 찬다 — 적 최대 체력만큼 주면 +liberationGaugePerDealt, 내 최대 체력만큼 받으면 +liberationGaugePerTaken (평타형·블록 안 쓰는 자동전투도 해방) */
  liberationGaugePerDealt: number;
  liberationGaugePerTaken: number;
  /** 해방 블록(옛 22-5 kind 'liberation', C.134 부터는 생기지 않는다 — 옛 상태 호환)의 공격 분류. 속성은 내 캐릭터 속성 */
  liberationCategory: AttackCategory;
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
  /** 물공 블록 생성원 타이머 간격(초) (GDD 49-11, C.105): 물공 몸은 기본 블록 몫에서 공격이 빠지고 이 타이머 하나가 물공 블록을 낸다. 블록 가속 배율은 나눈다 */
  physBlockSpawnSeconds: number;
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
    liberationEnabled: true,
    liberationGaugePerBlock: LB.gaugePerBlock,
    liberationChainBonus: LB.chainBonus,
    liberationStartGauge: 0,
    liberationGaugePerDealt: LB.gaugePerDealt,
    liberationGaugePerTaken: LB.gaugePerTaken,
    liberationCategory: 'mixed',
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
  | { type: 'gear' };

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
  /** 해방 게이지가 찼다 (GDD 83장) */
  | { kind: 'liberation-ready' }
  | { kind: 'spawn'; index: number; block: Block['kind'] }
  /** 콤보 발동: 콤보 블록이 바 맨 오른쪽에 생겼다 (GDD 17-3) */
  | { kind: 'combo'; comboId: string }
  | { kind: 'shuffle' }
  /** 해방 시작 (GDD 83장·106장 4): 지속 초, 고유 효과(레스렉시온/만해) 여부 */
  | { kind: 'liberate'; seconds: number; unique: boolean }
  /** 소모품 사용 (GDD 105장 수정 3): heal = 회복량, haste = 각성 초 */
  | { kind: 'item'; id: string; effect: BattleItemEffect['effect']; heal: number }
  /** 장비 발동 (GDD 105장 수정 4): shield = 방패 초, burst = 준 피해 */
  | { kind: 'gear'; id: string; effect: ActiveGearEffect['effect']; damage: number }
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
  /** 회피 (GDD 101장 4번, 폭주): 적 공격 한 번을 통째로 피했다 */
  | { kind: 'evade' }
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
export function spawnTableOf(p: CombatParams): { seconds: number; entries: SpawnEntry[] } {
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

/** 출현표에서 하나를 뽑는다 (전투 난수) */
function drawSpawn(s: CombatState, entries: readonly SpawnEntry[]): SpawnEntry | null {
  let r = nextFloat(s.rng);
  for (const e of entries) {
    if (r < e.chance) return e;
    r -= e.chance;
  }
  return entries[entries.length - 1] ?? null;
}

/** 지금 생성 타이머 간격(초): 해방 중이면 해방 생성 배율로, 각성(전투 소모품) 중이면 그 배율로 줄인다 */
function spawnIntervalOf(s: CombatState): number {
  const sec = spawnTableOf(s.params).seconds;
  const it = s.params.battleItem;
  const haste = s.hasteTicks > 0 && it?.effect === 'haste' ? it.spawnMult : 1;
  return sec / (liberationActive(s) ? liberationSpawnSpeedOf(s.params) : 1) / haste;
}

/** 물공 블록의 계열: 종족 계열 표에서 하나를 고르게 뽑는다 (계열 표가 없으면 계열 없음) */
function drawPhysFamily(s: CombatState): string | null {
  const fams = Object.keys(s.params.families);
  if (fams.length === 0) return null;
  return fams[Math.min(fams.length - 1, Math.floor(nextFloat(s.rng) * fams.length))] ?? null;
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

// ── 해방 (GDD 83장: 영력 해방 · 레스렉시온/만해, 옛 저장형 필살기 게이지) ──

/** 해방 게이지 상한 */
export const LIBERATION_GAUGE_MAX = LB.gaugeMax;

/** 해방 중인가 */
export function liberationActive(s: CombatState): boolean {
  return s.liberation.ticksLeft > 0;
}

/** 지금 해방할 수 있는가: 켜짐 + 게이지 가득 + 해방 중이 아님 (한 전투에 여러 번) */
export function canLiberate(s: CombatState): boolean {
  return s.status === 'playing' && s.params.liberationEnabled && !liberationActive(s) && s.liberation.gauge >= LIBERATION_GAUGE_MAX;
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
  const haste = s.basicHaste && s.basicHaste.ticks > 0 ? 1 - s.basicHaste.haste : 1;
  return (playerAttackSecondsOf(s.params) / (uniqueActive(s) ? s.params.liberationAttackSpeed : 1)) * haste;
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
    liberation: { gauge: params.liberationEnabled ? Math.min(LIBERATION_GAUGE_MAX, Math.max(0, params.liberationStartGauge)) : 0, usedAtTick: null, uses: 0, chains: 0, ticksLeft: 0, spawnAcc: 0, nextSlot: 0, base: null, risk: 0 },
    ...(setup.boss ? { boss: { setup: { ...setup.boss, phases: setup.boss.phases.map((x) => ({ ...x })) }, phase: 1, attackMult: 1, gimmickTimer: t(gimmickEverySeconds(setup.boss)), seals: 0, ...(setup.boss.gimmick === 'summon' ? { minion: null, summons: 0, minionKills: 0 } : {}) } } : {}),
    inputs: [],
    events: [],
    ...(setup.script ? { script: { ...setup.script, allow: [...setup.script.allow] } } : {}),
  };
}

/** 안정 수치(0~stabilityMax) → 전투 시작 해방 게이지 (0~startGaugeMax, 비례 — 옛 저장 필살 시작 게이지) */
export function liberationStartGaugeOf(stability: number): number {
  const max = BALANCE.provisional.risk.stabilityMax;
  return (Math.min(max, Math.max(0, stability)) / max) * LB.startGaugeMax;
}

export function elapsedSeconds(s: CombatState): number {
  return s.tick * s.params.tickSeconds;
}

export function timeLeftSeconds(s: CombatState): number {
  return Math.max(0, s.params.timeLimitSeconds - elapsedSeconds(s));
}

/** 블록 하나가 공허 블록으로 바뀔 확률 (GDD 101장): 기본 몫 + 컨디션·환경·바퀴·돌파 가산 (상한 있음) */
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

/** 치명타 판정 한 번: 맞으면 횟수를 세고 true. 확률 0 이면 난수를 쓰지 않는다. bonus = 블록 공격 치명 가산(GDD 84장 3번) */
function rollCrit(s: CombatState, who: 'player' | 'enemy', bonus = 0): boolean {
  if (s.script) return false; // 각본 전투는 난수 없이 (GDD 123장 5)
  const chance = who === 'player' ? Math.min(s.params.critChanceMax, critChanceOf(s.params) + bonus) : Math.min(s.params.critChanceMax, Math.max(0, s.params.enemyCritChance));
  if (chance <= 0) return false;
  s.critRng ??= createRng((s.seed ^ CRIT_SEED_SALT) >>> 0);
  if (nextFloat(s.critRng) >= chance) return false;
  if (who === 'player') s.crits = (s.crits ?? 0) + 1;
  else s.enemyCrits = (s.enemyCrits ?? 0) + 1;
  return true;
}

/** 내 공격 피해에 치명타를 굴린다: 피해가 있을 때만 */
function playerCrit(s: CombatState, damage: number, bonus = 0): { damage: number; crit: boolean } {
  if (damage <= 0 || !rollCrit(s, 'player', bonus)) return { damage, crit: false };
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

/** 내 공격 피해: 특성 배율 → 블록 플레이 보정(GDD 84장 3번, 물공 몸 아님)·평타형 대가(물공 몸, C.142) → 속성 피해(GDD 48장, elements = 공격 속성, 비면 무속성) → 치명타(블록은 치명 가산). 반사·독·공허 블록은 이 길을 지나지 않는다 */
function playerHit(s: CombatState, damage: number, block: boolean, elements: readonly string[]): { damage: number; crit: boolean; elem?: ElemHit } {
  const p = s.params;
  const elem = elementDamageBonus(p, elements);
  // 블록 플레이 보정은 블록형 몸만 (평타형 = 물공 몸은 블록이 평타를 돕는 몸이라 없음 — 84장 3번 "평타캐보다"), 물공 몸은 대신 평타형 대가(C.142)
  const blockPlay = block && !p.physBlock;
  const blockMult = block ? (p.blockDamageMultiplier ?? 1) * (blockPlay ? (p.blockPlayDamage ?? 1) : 1) : 1;
  const physMult = p.physBlock?.damage ?? 1;
  const hit = playerCrit(s, damage * abilityPowerOf(s, block) * blockMult * physMult * (elem ? 1 + elem.pct / 100 : 1), blockPlay ? (p.blockPlayCrit ?? 0) : 0);
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
  }
  // 각본 전투는 지지 않는다 (체력 1 아래로 안 내려감)
  s.player.hp = Math.max(s.script ? Math.min(s.player.hp, 1) : 0, s.player.hp - amount);
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
  // 블록의 속성 (C.118, GDD 66장): 체인은 같은 계열 + 같은 속성끼리만. skill 블록은 그 특성(기본 블록은 물공 속성)의 속성, 나머지는 없음
  const element = kind === 'skill' ? (sourceOf(s.params, traitId)?.element ?? null) : null;
  s.tray.push({ uid: s.nextUid++, kind, traitId, family, element });
  emit(s, { kind: 'spawn', index: s.tray.length - 1, block: kind });
  return true;
}

/** 각본 전투 (GDD 123장 5): 스킬 블록 하나를 바 끝에 놓는다. 바가 가득이면 false */
export function scriptSpawnBlock(s: CombatState, traitId: string, family: string | null): boolean {
  return spawn(s, 'skill', traitId, family);
}

/** 각본 전투 (GDD 123장 5): 적이 지금 강공격을 시전한다 (예고 seconds 초) */
export function scriptHeavyCast(s: CombatState, seconds: number): void {
  const total = ticksOf(s.params, seconds);
  s.enemy.cast = { ticks: total, total, hitsLeft: 0 };
  emit(s, { kind: 'heavy-cast', seconds });
}

/** 해방 게이지 적립 (GDD 83장, 옛 저장 게이지): 블록을 쓸 때 + 피해를 주고받을 때(95장 B2) 찬다. 해방 중에는 차지 않고(끝나면 0 부터), 100 에서 멈춘다 */
function addGauge(s: CombatState, v: number): void {
  const lb = s.liberation;
  // 각본 전투는 해방 게이지가 차지 않는다 (C.199: 해방 버튼이 '준비됨'으로 빛나 체인 안내를 가리지 않게)
  if (s.script || !s.params.liberationEnabled || liberationActive(s) || lb.gauge >= LIBERATION_GAUGE_MAX) return;
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
    if (s.enemy.cast) s.enemy.cast.ticks += d;
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
    addGauge(s, p.liberationGaugePerBlock);
    const { damage, crit, elem } = playerHit(s, blockDamage(s, b), true, []);
    emit(s, { kind: 'block', block: 'combo', traitId: b.traitId, family: null, element: null, matchup: 'neutral', role: null, chain: 1, damage, weak: false, heal: 0, guardSeconds: 0, bonus: null, crit, elem });
    dealDamage(s, damage, { kind: 'combo', traitId: b.traitId, element: null });
    updateCombos(s, null, 0);
    counterIfStance(s);
    return true;
  }
  if (b.kind === 'liberation') {
    s.tray.splice(index, 1);
    addGauge(s, p.liberationGaugePerBlock);
    const { damage, crit, elem } = playerHit(s, blockDamage(s, b), true, p.playerElements);
    const hit = liberationHit(s);
    if (liberationActive(s)) s.liberation.chains++;
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
  const { skill, weak, matchup: m } = eff;
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
  addGauge(s, p.liberationGaugePerBlock * chain + (p.liberationChainBonus[chain - 1] ?? 0));
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

/** 막기를 지금 누를 수 있는가 (GDD 105장 수정 v5.233): 게이지가 다 찼고 막기 중이 아니면(공허 경직 중에도 된다) */
export function canGuard(s: CombatState): boolean {
  return s.status === 'playing' && s.guardGauge >= 1 && s.guard.ticks <= 0;
}

/** 소모품을 지금 쓸 수 있는가 (GDD 105장 수정 3·108장 3번): 칸에 든 전투용 소모품이 있고, 이 전투에서 안 썼고, 공격 불가(막기·경직) 중이 아니고,
 *  회복 소모품은 회복 잠김(폭주, noHealSpawn)이 아닐 때. 보관 개수는 부르는 쪽(화면·원정)이 확인해 battleItem 을 비운다 */
export function canUseItem(s: CombatState): boolean {
  const it = s.params.battleItem;
  if (s.status !== 'playing' || !it || s.itemUsed || halted(s)) return false;
  return !(it.effect === 'heal' && s.params.noHealSpawn);
}

/** 장비 발동을 지금 쓸 수 있는가 (GDD 105장 수정 4): 발동 장비가 있고 쿨다운이 끝났고 공격 불가 중이 아닐 때 */
export function canUseGear(s: CombatState): boolean {
  return s.status === 'playing' && !!s.params.activeGear && s.gearCooldown <= 0 && !halted(s);
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
  s.guard.ticks = ticksOf(p, p.guardSeconds);
  emit(s, { kind: 'block', block: 'skill', traitId: BASIC_GUARD_ID, family: null, element: null, matchup: 'neutral', role: 'guard', chain: 1, damage: 0, weak: false, heal: 0, guardSeconds: p.guardSeconds, bonus: null });
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
    const hit = playerHitMultiplier(s, p.playerElements, 'physical');
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
    ok = inTray(s.tray, input.cell) && !blockSealed(s.tray[input.cell]) && useBlock(s, input.cell);
  } else if (input.type === 'guard') {
    ok = useGuard(s);
  } else if (input.type === 'item') {
    ok = useItem(s);
  } else if (input.type === 'gear') {
    ok = useGear(s);
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
  lb.ticksLeft = ticksOf(p, p.liberationSeconds);
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
  emit(s, { kind: 'liberate', seconds: p.liberationSeconds, unique: p.liberationUnique });
  grantLiberationBlocks(s, LB.instantBlocks);
  return true;
}

/** 해방 순간 지급 (GDD 95장 B2 C.166 후속·106장 4): 평소 출현표(공허 빼고)에서 n개를 바로 넣어 첫 블록까지 공백을 없앤다. 바가 차 있으면 맨 오른쪽 옛 블록을 밀어낸다.
 *  다음 생성은 해방 간격 한 번 뒤 */
function grantLiberationBlocks(s: CombatState, n: number): void {
  const entries = spawnTableOf(s.params).entries.filter((e) => e.source);
  if (entries.length === 0) return;
  for (let k = 0; k < n; k++) {
    if (s.tray.length >= s.params.trayCapacity) s.tray.splice(s.tray.length - 1, 1);
    const e = drawSpawn(s, entries.map((x) => ({ ...x, chance: x.chance / entries.reduce((a, y) => a + y.chance, 0) })));
    if (e?.source) spawn(s, 'skill', e.source.id, e.family);
  }
  s.spawnTimer = ticksOf(s.params, spawnIntervalOf(s));
}

/** 해방이 풀린다 (지속이 다 됐거나 전투가 끝났다): 능력치·최대 체력을 되돌리고 리스크 게이지가 오른다 (해방마다 한 번) */
function endLiberation(s: CombatState): void {
  const lb = s.liberation;
  if (!liberationActive(s) && lb.base === null) return;
  if (lb.base) {
    s.player.stats = lb.base.stats;
    s.player.maxHp = lb.base.maxHp;
    s.player.hp = Math.min(s.player.hp, s.player.maxHp);
    lb.base = null;
  }
  lb.ticksLeft = 0;
  lb.gauge = 0;
  lb.risk += s.params.liberationRisk;
  s.events.push({ kind: 'liberation-end', risk: s.params.liberationRisk });
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

/** 지금 막기 상태의 경감 (GDD 105장 수정 v5.233): 강공격 = 완전히 막음, 일반 공격 = 경감 없음 */
function guardReductionOf(s: CombatState, heavy = false): number {
  return s.guard.ticks > 0 && heavy ? 1 : 0;
}

/** 막기·경직 중인가: 내 자동 공격·블록 생성·블록 사용이 멈춘다 (GDD 84장 2번·101장 추가 결정 2번·105장 1번) */
export function halted(s: CombatState): boolean {
  return s.guard.ticks > 0 || (s.stunTicks ?? 0) > 0;
}

/** 회피 (GDD 101장 4번, 폭주): 적 공격 한 번을 통째로 피했는가. 피했으면 'evade' 이벤트 (확률 0 이면 난수를 쓰지 않는다) */
function evaded(s: CombatState): boolean {
  if (s.params.evadeChance <= 0 || nextFloat(s.rng) >= s.params.evadeChance) return false;
  s.evades = (s.evades ?? 0) + 1;
  emit(s, { kind: 'evade' });
  return true;
}

/** 적의 공격이 맞았다: 피해 + 적 속성 효과(혈 흡혈·독) */
function enemyHits(s: CombatState, damage: number): void {
  takeDamage(s, damage);
  onHit(s, 'player', enemyElements(s.enemy.def), damage);
}

/** 강공격 착탄: 막기 상태면 크게 줄고(막기 성공), 반사 효과가 있으면 막은 피해를 돌려준다 */
function resolveHeavy(s: CombatState): void {
  const pattern = s.enemy.def.pattern;
  const sc = s.script;
  if (sc) {
    // 각본 전투 (GDD 123장 5): 강공격 패턴이 없는 적도 각본이 시전시킨다. 못 막으면 체력을 leaveHpFraction 만 남긴다
    sc.heavyHits++;
    const guarded = s.guard.ticks > 0;
    if (guarded) s.guardSuccesses++;
    const damage = guarded ? 0 : Math.max(0, s.player.hp - s.player.maxHp * sc.leaveHpFraction);
    emit(s, { kind: 'heavy-hit', damage, guarded, reflected: 0, matchup: enemyMatchup(s), crit: false });
    enemyHits(s, damage);
    return;
  }
  if (!pattern || !('heavyInAttacks' in pattern)) return;
  if (evaded(s)) return;
  const crit = rollCrit(s, 'enemy');
  let damage = enemyDamage(s, pattern.heavyInAttacks * (pattern.kind === 'heavy-chain' ? s.params.heavyChainHitMultiplier : s.params.heavyHitMultiplier)) * (crit ? s.params.critMultiplier : 1);
  const guarded = s.guard.ticks > 0;
  let reflected = 0;
  if (guarded) {
    const blocked = damage * guardReductionOf(s, true);
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
  const raw = enemyDamage(s, pattern.counterInAttacks) * (crit ? s.params.critMultiplier : 1);
  const guarded = s.guard.ticks > 0;
  const damage = raw * (1 - guardReductionOf(s));
  emit(s, { kind: 'counter', damage, guarded, matchup: enemyMatchup(s), crit });
  enemyHits(s, damage);
}

/** 한 틱 진행: 버프 → 안개 섞기 → 블록 생성 → 내 기본 공격 → 적 행동 → 시간 제한 */
function advanceTick(s: CombatState): void {
  const p = s.params;
  const t = (sec: number) => ticksOf(p, sec);
  s.tick++;
  if (s.guard.ticks > 0 && --s.guard.ticks === 0) s.guard.reflect = 0;
  if (s.stunTicks && s.stunTicks > 0) s.stunTicks--;
  chargeButtons(s);
  if (s.liberation.ticksLeft === 1) endLiberation(s);
  else if (s.liberation.ticksLeft > 1) s.liberation.ticksLeft--;
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
  if (!s.script && p.trayShuffleSeconds > 0 && --s.shuffleTimer <= 0) {
    s.shuffleTimer = t(p.trayShuffleSeconds);
    shuffleTray(s);
  }
  // 블록 생성 (GDD 84장 6번, C.136): 타이머 하나가 다 되면 출현표에서 하나를 뽑는다. 바가 가득 차거나 봉인 중이거나 막기 중(84장 2번)이면 타이머가 멈춘다.
  // 해방 중(GDD 83장)에는 해방 표(장착 블록, 공허 없음)를 해방 생성 배율만큼 빠른 간격으로
  if (!s.script && s.sealTicks === 0 && !halted(s) && s.tray.length < p.trayCapacity && --s.spawnTimer <= 0) {
    s.spawnTimer = t(spawnIntervalOf(s));
    const e = drawSpawn(s, spawnTableOf(p).entries);
    if (e?.kind === 'void') spawn(s, 'void', null);
    else if (e?.phys) {
      // 물공 생성원 (GDD 49-11): 그 속성 물공 블록(기본 공격 블록) 1개, 계열은 종족 계열 표에서 고르게
      if (spawn(s, 'skill', BASIC_SKILL_ID, drawPhysFamily(s))) s.physSpawned = (s.physSpawned ?? 0) + 1;
    } else if (e?.source) spawn(s, 'skill', e.source.id, e.family);
  }
  if (s.boss) bossGimmick(s, s.boss);
  // 내 자동 기본 공격: 막기 중(GDD 84장 2번)에는 멈춘다
  if (!halted(s) && --s.player.attackTimer <= 0) {
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
  } else if (!s.script) {
    // 각본 전투는 적 일반 공격·특수 행동이 없다 — 강공격은 각본이 시전시킨다 (GDD 123장 5)
    if (--e.attackTimer <= 0) {
      e.attackTimer = attackTicks;
      if (!evaded(s)) {
        const crit = rollCrit(s, 'enemy');
        const raw = enemyDamage(s, e.def.attackInAttacks) * (crit ? p.critMultiplier : 1);
        const guarded = s.guard.ticks > 0;
        const damage = raw * (1 - guardReductionOf(s));
        emit(s, { kind: 'enemy-attack', damage, guarded, matchup: enemyMatchup(s), crit });
        enemyHits(s, damage);
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
