// 원정 엔진 (GDD 1장, 2-1, 6장). 종족 무관 순수 로직. 화면은 상태만 읽고, 시간(칸당 5초·배속)은 화면이 돌린다.
// 상태는 평범한 객체(rng 포함)라 structuredClone 으로 복제할 수 있고, 같은 시드 = 같은 원정.

import { BALANCE } from '../../config/balance';
import { scaleEnemy } from '../../data/enemies';
import { applyDifficultyToParams, clampDifficulty, clampStreak, difficultyEnemyScale, difficultyGoldMultiplier, difficultyRewardMultiplier, recommendedDifficulty, scaleEv, streakEnemyFactor } from '../difficulty';
import { DEFAULT_GROUND_ID, getGround, isGroundId } from '../../data/grounds';
import { enemyPool, gateSpecialEnemies, pickFromPool, specialEnemyGate } from '../enemyPool';
import { STAT_IDS, type EnemyDef, type EnvironmentPreset, type StatId } from '../../data/schema';
import { deckTilesFor, getTile } from '../../data/tiles';
import { buildBattleRecord, createCombat, liberationStartGaugeOf, type CombatParams, type CombatState } from '../combat';
import { createRng, nextFloat, nextInt, type Rng } from '../rng';
import { getTrait } from '../../data/traits';
import {
  absorbModeRule, absorbRisk, addEnhance, breakthroughSpawnBonus, buildCombatParams, buildOffer, changeRisk, isSpecialTrait, cloneBuild, gainTrait, lateLapRisk,
  newBuild, releaseEffect, rerollCandidates, type AbsorbMode, type AbsorbOffer, type BuildState, type EngineEvent, type RiskState,
} from '../absorb';
import {
  addEv, applyEvolutionToParams, cloneEvolution, newEvolution, recordEvolutionAbsorb, recordEvolutionElite, recordEvolutionRelease, recordEvolutionStep,
  type EvolutionState,
} from '../evolution';
import type { AbsorbRecord, BattleRecord, RunRecord } from '../runLog';
import { rollBattleFoodMult, type FoodSettlement } from '../food';
import {
  applyTraitBoosts, combineMods, drawDraft, makeEvent, mutationMods, rollMutation, synergyAt, synergyMods, upgradeMods, type EventPending, type VariantMods,
} from './variants';
import type { FoodId } from '../faction';
import { getBoss, isBossId } from '../../data/bosses';
import { getChapter, getEpisode, groundBossId, type StoryLine } from '../../data/story';
import type { BossSetup } from '../combat';
import { petBonus, rollAnyPet, type PetCarry } from '../pet';
import { applyGearToParams, rollGear, rollGrade, type GearCarry, type GearRoll } from '../gear';

const EX = BALANCE.expedition;
const PX = BALANCE.provisional.expedition;
const AX = BALANCE.provisional.absorb;
const RX = BALANCE.provisional.risk;
const FX = BALANCE.provisional.food;
const GX = BALANCE.provisional.gold;
/** 전리품 난수 시드 = 원정 시드 xor 이 값 */
const LOOT_SEED_SALT = 0x5f3759df;
/** 타일 변수 난수 시드 = 원정 시드 xor 이 값 (드래프트·변이·이벤트 내용이 적·타일·흡수 난수를 바꾸지 않게) */
const VARIANT_SEED_SALT = 0x2545f491;
/** 다시 뽑기(GDD 25-9) 전용 난수 소금 */
const REROLL_SEED_SALT = 0x6c8e9cf5;
/** 자유 원정 보스 등장 굴림(GDD 37장) 전용 난수 소금: 바퀴마다 시드에서 새로 만든다 (적·타일·흡수 난수를 바꾸지 않는다) */
const FREE_BOSS_SEED_SALT = 0x1b873593;
/** 펫 굴림 (GDD 90장): 바퀴마다 (시드 ^ 이 값 ^ 바퀴) — 원정 난수(rng·lootRng·varRng)를 건드리지 않는다. 펫이 없으면 굴리지 않는다 */
const PET_SEED_SALT = 0x7f4a7c15;
/** 장비 드롭 굴림 (GDD 91장 2번): 이긴 전투마다 (시드 ^ 이 값 ^ 전투 번호) — 원정 난수를 건드리지 않는다. gearDrops 가 아니면 굴리지 않는다 */
const GEAR_SEED_SALT = 0x2f6b9d43;
const TV = BALANCE.provisional.tileVariants;
const BX = BALANCE.provisional.boss;
const TUT = BALANCE.provisional.tutorialRun;
const TT = BALANCE.provisional.tiles;

export type ExpeditionPhase = 'moving' | 'battle' | 'absorb' | 'rest' | 'nest-choice' | 'event' | 'ended';
/** story-clear = 스토리 화 목표를 이뤄 바로 귀환 (GDD 25-4, C.58) */
/** abort = 원정 도중 [귀환하기] (GDD 81장, C.132): 모은 것은 지키고 이번 바퀴 완주 보상·연속 클리어는 없다 */
export type EndReason = 'returned' | 'forced-max-laps' | 'battle-lost' | 'exhausted' | 'story-clear' | 'tutorial-clear' | 'abort';

/** 지금 치를 전투 (전투 엔진에 넘길 재료) */
export interface PendingBattle {
  enemy: EnemyDef;
  seed: number;
  params: Partial<CombatParams>;
  cell: number;
  lap: number;
  elite: boolean;
  /** 조합 효과로 강적이 된 전투 */
  combo: boolean;
  /** 이 전투를 일으킨 타일 id (야생 전투면 null) */
  tileId: string | null;
  /** 이긴 뒤 정산 배율 (GDD 25-5 시너지·변이·상위 타일·함정). 없으면 모두 기본값 */
  mods?: BattleMods;
  /** 이 칸이 속한 인접 시너지 id (없으면 null) */
  synergy?: string | null;
  /** 함정을 밟고 들어온 전투 (시작 체력 ↓, 이기면 보상 ↑) */
  trap?: boolean;
  /** 사냥 무리 2연전의 두 번째 전투 */
  second?: boolean;
  /** 보스전이면 보스 id (GDD 25-3, 스토리 보스 화 · GDD 37장 자유 원정 등장) */
  boss?: string | null;
}

/** 전투 정산 배율 (GDD 25-5) */
export interface BattleMods {
  rewardMult: number;
  goldMult: number;
  foodMult: number;
  foodChanceBonus: number;
  absorbBonus: number;
  extraBattle: number;
  eliteSoulBonus: number;
  /** 흡수 후보 수 배율 (포식자 둥지, C.124 — 없으면 1) */
  absorbMult?: number;
  /** 이기면 오르는 노력치 (뼈 표식/수련 말뚝, C.124 — 없으면 0) */
  trainingEv?: number;
}

const NO_MODS: BattleMods = { rewardMult: 1, goldMult: 1, foodMult: 1, foodChanceBonus: 0, absorbBonus: 0, extraBattle: 0, eliteSoulBonus: 0 };

/** 원정에서 얻거나 쓴 골드 한 건 (GDD 25-5, C.57): 양수 = 얻음(패배하면 마지막 바퀴 것을 잃는다), 음수 = 상인에게 씀 */
export interface GoldEntry {
  amount: number;
  lap: number;
}

/** 바퀴 끝 드래프트 (GDD 25-5 ①): 카드 3장 중 1장(picked = 고른 칸, 아직이면 null) */
export interface DraftState {
  lap: number;
  options: string[];
  picked: number | null;
}

/** 타일 변수 기록 (런 로그 GDD 9장 → RunRecord): 시너지는 짝에 들어설 때마다, 이벤트는 고른 것 */
export interface VariantLog {
  synergies: { id: string; lap: number }[];
  mutations: { id: string; lap: number }[];
  events: { event: string; choice: string; lap: number }[];
  drafts: { tileId: string; lap: number }[];
}

export interface Acquired {
  tileId: string;
  lap: number;
}

/** 스토리 화·보스 보상 정산 결과 (결과 화면 표시용) */
export interface StorySettlement {
  chapterId: string;
  episodeId: string;
  cleared: boolean;
  firstClear: boolean;
  /** 화 클리어 보상 (매번): 골드·먹이(상한까지만 들어간 수) */
  gold: number;
  food: [FoodId, number];
  /** 화 보상 먹이가 보관 한도라 못 들어가 바꾼 골드 (GDD 42장 4번, gold 에 이미 포함). 옛 결과에는 없다 */
  overflowGold?: number;
  /** 첫 클리어 영옥 + 장 클리어 영옥 + 보스 첫 처치 영옥 */
  jade: number;
  chapterCleared: boolean;
  bossFirstKill: string | null;
}

/** 보스전 한 판의 결과 (런 로그 bossBattles 재료, GDD 25-3) */
export interface BossBattleResult {
  bossId: string;
  won: boolean;
  durationSeconds: number;
  /** 닿은 페이즈 (1부터) */
  phase: number;
  /** 기믹으로 봉인된 블록 수 */
  seals: number;
  lossReason: 'hp' | 'timeout' | null;
}

/** 스토리 화 진행 (GDD 25-4·25-7, 원정 형식 6): 어느 장·화, 목표 진행도, 쓰러뜨린 적 수(중간 대사), 보여 줄 대사(cue) */
export interface StoryRun {
  chapterId: string;
  episodeId: string;
  /** 목표 진행도: 처치·흡수 수, 버티기는 마친 바퀴 수, 보스는 처치 1 */
  progress: number;
  /** 목표를 이뤘다 (원정은 story-clear 로 끝난다) */
  cleared: boolean;
  /** 이긴 전투 수 (중간 대사 조건) */
  kills: number;
  midShown: boolean;
  /** 화면이 꺼내 보여 줄 대사: mid = 중간 대사 (takeStoryCue 가 비운다) */
  cue: 'mid' | null;
  /** 이 화 보스전 결과 (없으면 아직 안 싸움) */
  bossResult: BossBattleResult | null;
}

/** 자유 원정 보스 등장 (GDD 37장, 원정 형식 8): 스토리에서 이긴 보스 목록(출발 때 세이브에서), 등장(원정당 최대 1번), 싸운 결과 */
export interface FreeBossRun {
  /** 스토리에서 한 번 이긴 보스 id. 이 원정 사냥터의 장 보스(groundBossId)가 여기 있어야 굴린다 */
  beaten: string[];
  /** 이번 원정에 나온 보스: 보스 id·바퀴·칸. 아직이면 null */
  appear: { bossId: string; lap: number; cell: number } | null;
  /** 싸운 결과 (런 로그 bossBattles 재료). 아직이면 null */
  result: BossBattleResult | null;
}

/** 원정에서 얻은 먹이 (GDD 23-1 전리품). 패배하면 마지막 바퀴 것을 잃는다 */
export interface AcquiredFood {
  food: FoodId;
  lap: number;
}

export interface AcquiredTrait {
  traitId: string;
  lap: number;
}

export interface ExpeditionState extends RiskState {
  /** 붕옥·초월체 패시브 (GDD 22-3, C.59). 옛 원정 중간 저장에는 없다(= 0) */
  statBonus?: number;
  runId: number;
  factionId: string;
  /** 사냥터 id (GDD 24-2, 원정 형식 4): 출현 속성·먹이 표. 배치 단계에서 고른다 */
  groundId: string;
  /** 원정 난이도 ★ (GDD 32-1, C.75): 적 기준 능력치 = ★n 단계 기준·체력·공격 배율·보상 배율. 자유 원정은 배치 단계에서 고르고(기본 = 내 단계), 스토리 화는 화 데이터의 ★ */
  difficulty: number;
  /** 연속 클리어 수 (GDD 32-1 10번, C.75): 출발 때 세이브에서 가져온 "같은 ★ 연속 클리어" 수 → 적 +5%/연속, 먹이·노력치 +5%/연속, 골드 +2%/연속(상한). 스토리 화는 0 */
  streak: number;
  seed: number;
  rng: Rng;
  maxLaps: number;
  phase: ExpeditionPhase;
  hunger: number;
  condition: number;
  /** 출발 때 컨디션 (GDD 42장 3번: 바퀴당 감소 하한의 기준). 옛 중간 저장에는 없다 → 하한 없음 */
  startCondition?: number;
  /** 보상으로 뽑힐 타일 id (중복 가능). C.140 (GDD 85장 11번, 덱 개념 삭제): 출발 때 = 가진 타일 전부, 배치 단계가 끝나면 놓은 타일(놓은 게 없으면 그대로) */
  deck: string[];
  /** 배치 단계 동안만: 길에 놓을 수 있는 최대 칸 수 (GDD 85장 11번 '8칸'). finishPlanning 이 지운다 */
  planLimit?: number;
  /** 원정 중 획득했지만 아직 놓지 않은 타일 */
  hand: string[];
  /** 길 칸 옆 슬롯: 칸 번호 → 놓은 타일 id (0번 둥지 칸은 슬롯 없음). 한 번 놓으면 원정 동안 유지 */
  slots: (string | null)[];
  acquired: Acquired[];
  /** 이번 바퀴에서 야생 전투가 일어날 칸 (놓은 타일이 없는 칸 중에서 뽑는다) */
  wildCells: number[];
  elitesThisLap: number;
  victoriesThisLap: number;
  tilesThisLap: number;
  /** 바퀴별 치른 전투 횟수 (index 0 = 1바퀴) */
  battlesByLap: number[];
  pending: PendingBattle | null;
  battles: BattleRecord[];
  /** 흡수 빌드(특성 보유·슬롯) 사본. 귀환하면 세이브에 합쳐진다 */
  build: BuildState;
  /** 이번 바퀴 시작 때의 슬롯. 패배하면 슬롯을 이것으로 되돌린다("마지막 바퀴에서 얻은 것만 잃는다") */
  lapStartSlots: (string | null)[];
  /** 원정 중 새로 얻은 특성 (패배 시 마지막 바퀴 것을 잃는다) */
  acquiredTraits: AcquiredTrait[];
  /** 흡수 화면 대기 중인 제안 (phase 'absorb') */
  absorbOffer: AbsorbOffer | null;
  absorbRecords: AbsorbRecord[];
  /** 먹이 전리품 (GDD 23-1): 얻은 순서대로. 귀환하면 세이브 공유 자원에 들어간다 */
  foodLoot: AcquiredFood[];
  /** 전리품 전용 난수: 원정 난수(rng)와 따로 굴려 적·타일·흡수 결과를 바꾸지 않는다 */
  lootRng: Rng;
  /** 진화 상태 사본 (GDD 20-5): 걸음·흡수 속성·노력치·놓아줌·강적·돌파가 쌓이고, 귀환하면 세이브에 합쳐진다. 진화 자체는 둥지에 돌아와서 */
  evolution: EvolutionState;
  /** 지나온 시간(초, 배속 전 기준) */
  elapsedSeconds: number;
  lapsCompleted: number;
  outcome: 'returned' | 'defeated' | null;
  endReason: EndReason | null;
  /** 귀환 처리 때(game.ts recordExpedition) 먹이를 보유에 넣은 결과. 결과 화면 표시용, 원정 중에는 없다 */
  foodSettled?: FoodSettlement;
  /** 귀환 처리 때 스토리 화·보스 보상 정산 결과 (game.ts settleStory). 결과 화면 표시용 */
  storySettled?: StorySettlement;
  /** 해방 (GDD 83장): 이 원정 전투에서 해방 버튼을 쓸 수 있는가 (C.134 부터 늘 켬 — false 는 테스트용), 수련 완료(고유 효과 강화) */
  liberationEnabled?: boolean;
  liberationTrained?: boolean;
  // ── 타일 변수 (GDD 25-5, C.57, 원정 형식 5) ──
  /** 드래프트·인접 시너지·이벤트·바퀴 변이를 켠다 (게임은 켬, 옛 점검 봇·테스트는 끔). 상위 타일 효과와 골드는 늘 켜짐 */
  tileVariants: boolean;
  /** 타일 변수 전용 난수 */
  varRng: Rng;
  /** 이번 바퀴 변이 id (없으면 null) */
  mutation: string | null;
  draft: DraftState | null;
  /** 밟은 이벤트 타일 (phase 'event') */
  eventPending: EventPending | null;
  /** 출발 때 가진 골드 (세이브 공유 자원). 상인은 이것 + 원정에서 번 골드로 산다 */
  goldBank: number;
  goldLoot: GoldEntry[];
  /** 제단으로 올린 특성 위력 (특성 id → +비율, 이번 원정 동안) */
  traitBoosts: Record<string, number>;
  /** 다음 전투 시작 보호막 (최대 체력 비율) */
  nextShield: number;
  /** 함정: 다음 전투 시작 체력 ↓·이기면 보상 ↑ */
  trapArmed: boolean;
  /** 사냥 무리 2연전: 다음 advance 에서 같은 칸에서 한 번 더 싸운다 */
  queuedBattle: { cell: number; synergy: string | null } | null;
  /** 지금 휴식의 회복 배율 (상위 타일·시너지, phase 'rest') */
  restMult: number;
  /** 지금 휴식이 영혼 샘/정화의 샘인가 (C.124, phase 'rest' — 회복 대신 리스크만 크게) */
  restSpring?: boolean;
  /** 바로 앞 칸에서 효과가 난 타일 (메아리, C.124): 이벤트 타일은 밟으면 사라지므로 밟은 순간의 id 를 둔다. 메아리 칸·보스 칸·빈 칸이면 null */
  lastTile?: { cell: number; tileId: string } | null;
  /** 바퀴 변이(폭풍)로 더 받는 영혼 결정 */
  bonusSoul: number;
  variantLog: VariantLog;
  /** 스토리 화 진행 (GDD 25-4). 자유 원정은 null. 스토리에서는 드래프트·바퀴 변이를 끄고 인접 시너지는 고정 길대로 발동한다 */
  story: StoryRun | null;
  /** 자유 원정 보스 등장 (GDD 37장). 스토리 화는 null */
  freeBoss: FreeBossRun | null;
  /** 첫 원정 튜토리얼 (GDD 67장, C.120): 고정 짧은 길 → 약한 적 1마리 → 흡수 화면(시스템상 흡수 아님) → 끝. 없으면 일반 원정 */
  tutorial?: boolean;
  /** 타일 잠금 (GDD 64장, 첫 진화 전): 드래프트(이벤트 타일 포함)가 나오지 않는다. 덱은 비어 있다 */
  tilesLocked?: boolean;
  /** 튜토리얼 첫 흡수 보상 (GDD 67장 3번): 흡수 기록 대신 모든 능력치 노력치. 귀환 때 런 로그 tutorialRewards 로 */
  tutorialReward?: TutorialReward | null;
  /** 데리고 간 펫 (GDD 90장, C.144): 출발 때 친밀도까지 복사. 없으면 펫 효과 없음 */
  pet?: PetCarry | null;
  /** 바퀴 끝 펫 굴림을 하나 (게임만 켬 — 점검 봇·테스트는 끔) */
  petDrops?: boolean;
  /** 이 원정 바퀴 끝 보상으로 나온 펫 (귀환 때 game.ts 가 보관함에 넣거나, 이미 가졌으면 골드로) */
  petFinds?: { petId: string; lap: number }[];
  /** 낀 장비 합계 (GDD 91장, C.150): 출발 때 복사. 없으면 장비 효과 없음 */
  gear?: GearCarry | null;
  /** 이긴 전투에서 장비가 나올 수 있나 (게임만 켬 — 점검 봇·테스트는 끔) */
  gearDrops?: boolean;
  /** 이 원정에서 나온 장비 (귀환 때 game.ts 가 보관함에 — 가득이면 골드로) */
  gearFinds?: { roll: GearRoll; lap: number; from: 'normal' | 'elite' | 'boss' }[];
  /** 출발 때 돌봄 상태 (GDD 102-2): 쇠약 = 전투 시작 최대 체력 −weakMaxHpCut, 피곤 = 블록 생성 간격 +tiredSpawnSlow. 없으면 효과 없음 */
  care?: CareCarry;
}

/** 출발 때 둥지에서 가져가는 상태 (GDD 102-2·102장 수정 v5.228 빈사) */
export interface CareCarry {
  weak: boolean;
  tired: boolean;
  /** 빈사 모험: 체력 10%·공격·블록 속도 절반·보상 절반 */
  dying?: boolean;
}

/** 튜토리얼 첫 흡수 보상 (GDD 67장 3번): 흡수로 치지 않고 능력치 6종을 같은 양 올린다 */
export interface TutorialReward {
  enemyId: string;
  element: string;
  /** 실제로 오른 노력치 (단계 상한에 잘리면 그만큼만) */
  ev: Partial<Record<StatId, number>>;
}

export interface ExpeditionSetup {
  factionId: string;
  /** 사냥터 (없으면 기본 사냥터) */
  groundId?: string;
  /** 원정 난이도 ★ (없으면 내 단계 = 권장). 스토리 화는 무시하고 화의 ★ 를 쓴다. 열렸는지(세이브 difficulty.unlocked)는 부르는 쪽이 본다 */
  difficulty?: number;
  /** 같은 ★ 연속 클리어 수 (없으면 0). 스토리 화는 무시(0) */
  streak?: number;
  seed: number;
  runId?: number;
  /** 둥지에서 가져온 상태 */
  hunger: number;
  condition: number;
  deck: string[];
  maxLaps?: number;
  /** 둥지에서 가져온 리스크 게이지·안정 수치·흡수 빌드 (없으면 0 / 시작값 / 빈 빌드) */
  risk?: number;
  stability?: number;
  build?: BuildState;
  /** 둥지에서 가져온 진화 상태 (없으면 1단계 새 상태) */
  evolution?: EvolutionState;
  /** 해방 (GDD 83장): false 면 끈다(테스트용, 없으면 켬). liberationTrained = 수련 완료(22-4, 고유 효과 강화) */
  liberationEnabled?: boolean;
  liberationTrained?: boolean;
  /** 타일 변수(드래프트·시너지·이벤트·변이)를 켠다 (GDD 25-5). 없으면 false */
  tileVariants?: boolean;
  /** 가진 골드 (상인 구매용). 없으면 0 */
  gold?: number;
  /** 스토리 화 (GDD 25-4): 그 화의 고정 길·사냥터·최대 바퀴를 쓴다 (groundId·maxLaps 는 무시) */
  story?: { chapterId: string; episodeId: string };
  /** 붕옥 해방·초월체 보유 패시브 (GDD 22-3, 0.05 = 전 능력치 +5%). 없으면 0 */
  statBonus?: number;
  /** 스토리에서 한 번 이긴 보스 id (GDD 37장, 세이브 보스 도감). 자유 원정에서 그 사냥터 장 보스가 4바퀴째부터 나올 수 있다. 스토리 화는 무시 */
  bossesBeaten?: string[];
  /** 첫 원정 튜토리얼 (GDD 67장): 1바퀴·기본 사냥터·★1·타일 변수 끔·보스 없음, 정해진 칸에 약한 적 1마리. 스토리와 같이 쓰지 않는다 */
  tutorial?: boolean;
  /** 첫 진화 전 타일 잠금 (GDD 64장): 드래프트·이벤트 타일 없음 */
  tilesLocked?: boolean;
  /** 데리고 가는 펫 (GDD 90장): 없으면 효과 없음 (balance:check 기준 봇은 펫 없음) */
  pet?: PetCarry | null;
  /** 바퀴 끝 보상에서 펫이 나올 수 있나 (게임만 true) */
  petDrops?: boolean;
  /** 낀 장비 합계 (GDD 91장 7번): 없으면 효과 없음 (balance:check 기준 봇은 장비 없음) */
  gear?: GearCarry | null;
  /** 이긴 전투에서 장비가 나올 수 있나 (게임만 true) */
  gearDrops?: boolean;
  /** 출발 때 쇠약·피곤 (GDD 102-2): 없으면 효과 없음 (balance:check 기준 봇은 없음) */
  care?: CareCarry | null;
}

export function createExpedition(setup: ExpeditionSetup): ExpeditionState {
  if (setup.tutorial) setup = { ...setup, story: undefined, groundId: DEFAULT_GROUND_ID, difficulty: 1, streak: 0, maxLaps: 1, tileVariants: false, bossesBeaten: [], tilesLocked: true };
  const rng = createRng(setup.seed);
  const episode = setup.story ? getEpisode(setup.factionId, setup.story.chapterId, setup.story.episodeId) : null;
  const exp: ExpeditionState = {
    runId: setup.runId ?? 0,
    factionId: setup.factionId,
    groundId: setup.story ? getChapter(setup.story.chapterId).groundId : isGroundId(setup.groundId) ? setup.groundId : DEFAULT_GROUND_ID,
    difficulty: episode ? episode.difficulty : clampDifficulty(setup.difficulty ?? recommendedDifficulty(setup.evolution?.tierIndex ?? 0)),
    streak: episode ? 0 : clampStreak(setup.streak ?? 0),
    seed: setup.seed,
    rng,
    maxLaps: episode?.maxLaps ?? setup.maxLaps ?? EX.maxLaps,
    lap: 1,
    pos: 0,
    phase: 'moving',
    hunger: setup.hunger,
    condition: setup.condition,
    startCondition: setup.condition,
    deck: [...setup.deck],
    hand: [],
    slots: Array.from({ length: EX.loopTiles }, () => null),
    acquired: [],
    wildCells: [],
    elitesThisLap: 0,
    victoriesThisLap: 0,
    tilesThisLap: 0,
    battlesByLap: [0],
    pending: null,
    battles: [],
    build: setup.build ? cloneBuild(setup.build) : newBuild(),
    lapStartSlots: [],
    acquiredTraits: [],
    absorbOffer: null,
    absorbRecords: [],
    foodLoot: [],
    lootRng: createRng((setup.seed ^ LOOT_SEED_SALT) >>> 0),
    evolution: setup.evolution ? cloneEvolution(setup.evolution) : newEvolution(),
    risk: setup.risk ?? 0,
    riskPeak: setup.risk ?? 0,
    stability: setup.stability ?? RX.stabilityStart,
    breakthrough: null,
    events: [],
    elapsedSeconds: 0,
    lapsCompleted: 0,
    outcome: null,
    endReason: null,
    liberationEnabled: setup.liberationEnabled !== false,
    liberationTrained: setup.liberationTrained === true,
    statBonus: setup.statBonus ?? 0,
    tileVariants: setup.tileVariants === true,
    varRng: createRng((setup.seed ^ VARIANT_SEED_SALT) >>> 0),
    mutation: null,
    draft: null,
    eventPending: null,
    goldBank: Math.max(0, Math.floor(setup.gold ?? 0)),
    goldLoot: [],
    traitBoosts: {},
    nextShield: 0,
    trapArmed: false,
    queuedBattle: null,
    restMult: 1,
    bonusSoul: 0,
    variantLog: { synergies: [], mutations: [], events: [], drafts: [] },
    story: setup.story ? { chapterId: setup.story.chapterId, episodeId: setup.story.episodeId, progress: 0, cleared: false, kills: 0, midShown: false, cue: null, bossResult: null } : null,
    freeBoss: setup.story || setup.tutorial ? null : { beaten: [...(setup.bossesBeaten ?? [])], appear: null, result: null },
    ...(setup.tutorial ? { tutorial: true, tutorialReward: null } : {}),
    ...(setup.tilesLocked ? { tilesLocked: true } : {}),
    ...(setup.pet && !setup.tutorial ? { pet: { id: setup.pet.id, level: setup.pet.level } } : {}),
    ...(setup.petDrops && !setup.tutorial ? { petDrops: true, petFinds: [] } : {}),
    ...(setup.gear ? { gear: structuredClone(setup.gear) } : {}),
    ...(setup.gearDrops && !setup.tutorial ? { gearDrops: true, gearFinds: [] } : {}),
    ...(setup.care && (setup.care.weak || setup.care.tired || setup.care.dying) ? { care: { weak: setup.care.weak, tired: setup.care.tired, ...(setup.care.dying ? { dying: true } : {}) } } : {}),
  };
  // 스토리 화의 고정 길 (GDD 25-4): 정해진 칸에 정해진 타일
  if (episode) for (const [cell, id] of Object.entries(episode.road)) exp.slots[Number(cell)] = id;
  planLap(exp);
  return exp;
}

/** 이 원정이 스토리 화면 그 화 데이터 */
export function storyEpisodeOf(exp: Pick<ExpeditionState, 'factionId' | 'story'>) {
  return exp.story ? getEpisode(exp.factionId, exp.story.chapterId, exp.story.episodeId) : null;
}

/** 스토리 대사 꺼내기 (화면이 보여 주고 비운다): 중간 대사가 기다리고 있으면 그 줄들 */
export function takeStoryCue(exp: ExpeditionState): StoryLine[] | null {
  const st = exp.story;
  if (!st || st.cue === null) return null;
  st.cue = null;
  return storyEpisodeOf(exp)?.dialogue.mid?.lines ?? null;
}

/** 보스 데이터 + BALANCE → 전투 엔진의 보스 재료 */
export function bossSetupOf(bossId: string): BossSetup {
  const b = getBoss(bossId);
  return {
    id: b.id, phases: b.phases.map((x) => ({ ...x })), gimmick: b.gimmick,
    sealEverySeconds: BX.seal.everySeconds, sealSeconds: BX.seal.seconds, sealCells: BX.seal.cells, timeLimitSeconds: BX.timeLimitSeconds,
    ...(b.gimmick === 'summon' ? { summon: { ...BX.summon } } : {}),
    ...(b.elementShifts ? { elementShifts: [...b.elementShifts] } : {}),
  };
}

/** 스토리 목표를 이뤘으면 화를 끝낸다 (이동 중일 때만 — 흡수 화면이 남아 있으면 그것을 마친 뒤). 끝냈으면 true */
function checkStoryClear(exp: ExpeditionState): boolean {
  const st = exp.story;
  if (!st || st.cleared || exp.phase !== 'moving') return false;
  const ep = storyEpisodeOf(exp)!;
  const o = ep.objective;
  const need = o.type === 'survive' ? o.laps : o.type === 'boss' ? 1 : o.count;
  if (st.progress < need) return false;
  st.cleared = true;
  endExpedition(exp, 'returned', 'story-clear');
  return true;
}

/** 바퀴별 기본 전투 횟수: 1바퀴 2회, 2바퀴 3회, 3바퀴 이후 4회 (GDD 2-1) */
export function plannedBattles(lap: number): number {
  const b = EX.battlesPerLap;
  return lap <= 1 ? b.first : lap === 2 ? b.second : b.later;
}

function randomSeed(rng: Rng): number {
  return Math.floor(nextFloat(rng) * 2 ** 32);
}

/** 전투를 일으키는 타일인가 (휴식·이벤트는 아님. 메아리는 앞 칸에 따라 다르므로 계획에서는 전투로 세지 않는다 — 앞 칸이 전투면 한 번 더) */
function causesBattle(id: string | null): boolean {
  if (id === null) return false;
  const t = getTile(id).effect.type;
  return t !== 'rest' && t !== 'event' && t !== 'echo';
}

/** 새 바퀴 시작: 야생 전투 칸을 뽑는다. 놓은 전투 타일이 기본 전투 횟수를 대신하고, 기본 횟수보다 많이 놓으면 그만큼 전투가 는다 */
function planLap(exp: ExpeditionState): void {
  exp.lapStartSlots = [...exp.build.slots];
  const free: number[] = [];
  let tileBattles = 0;
  const bossCell = exp.story ? storyEpisodeOf(exp)?.boss?.cell ?? -1 : -1;
  for (let c = 1; c < EX.loopTiles; c++) {
    if (exp.slots[c] === null && c !== bossCell) free.push(c);
    else if (causesBattle(exp.slots[c]!)) tileBattles++;
  }
  for (let i = free.length - 1; i > 0; i--) {
    const j = nextInt(exp.rng, i + 1);
    [free[i], free[j]] = [free[j]!, free[i]!];
  }
  exp.wildCells = free.slice(0, Math.max(0, plannedBattles(exp.lap) - tileBattles));
  // 첫 원정 튜토리얼 (GDD 67장 1번): 정해진 칸 하나에서만 싸운다 (고정 길)
  if (exp.tutorial) exp.wildCells = [TUT.cell];
  exp.elitesThisLap = 0;
  exp.victoriesThisLap = 0;
  exp.tilesThisLap = 0;
  if (exp.battlesByLap.length < exp.lap) exp.battlesByLap.push(0);
  // 바퀴 변이 (GDD 25-5 ④): 2바퀴부터 바퀴 시작마다 확률로 하나
  if (exp.tileVariants && !exp.story) {
    exp.mutation = rollMutation(exp.varRng, exp.lap);
    if (exp.mutation) exp.variantLog.mutations.push({ id: exp.mutation, lap: exp.lap });
  }
  rollFreeBoss(exp);
}

/** 강적 소굴 타일인가 (강적을 부르는 spawn 타일, 상위 타일 포함) */
function isEliteDen(id: string | null): boolean {
  if (id === null) return false;
  const e = getTile(id).effect;
  return e.type === 'spawn' && e.enemyClass === 'elite';
}

/** 이 자유 원정에 나올 수 있는 보스: 사냥터 장 보스를 스토리에서 이겼으면 그 id (GDD 37장 1번) */
export function freeBossCandidate(exp: Pick<ExpeditionState, 'factionId' | 'groundId' | 'story' | 'freeBoss'>): string | null {
  if (exp.story || !exp.freeBoss) return null;
  const id = groundBossId(exp.factionId, exp.groundId);
  return id && exp.freeBoss.beaten.includes(id) ? id : null;
}

/** 자유 원정 보스 등장 굴림 (GDD 37장 2번): freeFromLap 바퀴째부터 바퀴 시작마다 freeChance, 원정당 최대 1번.
 *  그 바퀴 길의 강적 소굴 한 칸이 보스 칸(없으면 둥지 앞 칸 = 바퀴 마지막 칸). 굴림은 시드·바퀴로 만든 따로 난수 */
function rollFreeBoss(exp: ExpeditionState): void {
  const fb = exp.freeBoss;
  if (!fb || fb.appear || exp.lap < BX.freeFromLap) return;
  const bossId = freeBossCandidate(exp);
  if (!bossId) return;
  const rng = createRng((exp.seed ^ FREE_BOSS_SEED_SALT ^ Math.imul(exp.lap, 2654435761)) >>> 0);
  if (nextFloat(rng) >= BX.freeChance) return;
  const dens: number[] = [];
  for (let c = 1; c < EX.loopTiles; c++) if (isEliteDen(exp.slots[c] ?? null)) dens.push(c);
  const cell = dens.length > 0 ? dens[nextInt(rng, dens.length)]! : EX.loopTiles - 1;
  // 보스 칸은 그 칸의 원래 전투·타일 대신 보스 (야생 전투 칸이었으면 뺀다)
  const w = exp.wildCells.indexOf(cell);
  if (w >= 0) exp.wildCells.splice(w, 1);
  fb.appear = { bossId, lap: exp.lap, cell };
}

/** 이번 바퀴에 아직 싸우지 않은 자유 원정 보스 칸 (걷기 화면 배너 "보스 기척", GDD 37장 2번). 없으면 null */
export function pendingFreeBoss(exp: Pick<ExpeditionState, 'freeBoss' | 'lap' | 'pos'>): { bossId: string; cell: number } | null {
  const a = exp.freeBoss?.appear;
  if (!a || a.lap !== exp.lap || exp.freeBoss!.result || exp.pos > a.cell) return null;
  return { bossId: a.bossId, cell: a.cell };
}

export function lapScale(lap: number): { hp: number; attack: number } {
  return { hp: 1 + PX.lapHpScale * (lap - 1), attack: 1 + PX.lapAttackScale * (lap - 1) };
}

/** 공허 블록 생성 확률 가산: 컨디션이 나쁠수록, 5바퀴 이후, 한계 돌파 뒤 (GDD 3-2, 2-1, 4-1) */
export function riskBonus(exp: ExpeditionState): number {
  const cond = PX.conditionRiskBonusMax * (1 - exp.condition / PX.conditionMax);
  const late = Math.max(0, exp.lap - PX.lateLapStart + 1) * PX.lateLapRiskBonusPerLap;
  return cond + late + breakthroughSpawnBonus(exp);
}

/** 바퀴 강화 × 사냥터 강도(24-2, C.75 부터 1.0) × 원정 난이도 ★ × 연속 클리어 (GDD 32-1 2·10번) */
export function enemyScale(lap: number, groundId: string, difficulty = 1, streak = 0, cls?: 'normal' | 'elite'): { hp: number; attack: number } {
  const l = lapScale(lap);
  const g = getGround(groundId).strength;
  const d = difficultyEnemyScale(difficulty, cls);
  const k = streakEnemyFactor(streak);
  return { hp: l.hp * g.hp * d.hp * k, attack: l.attack * g.attack * d.attack * k };
}

/** 출처(야생/타일 종류/조합)와 바퀴·사냥터에 맞는 풀에서 적을 뽑고 바퀴 강화·사냥터 강도를 입힌다 (GDD 14-5·24-2) */
function pickEnemy(exp: ExpeditionState, cls: 'normal' | 'elite', source: string, elementBias?: string): EnemyDef {
  const g = getGround(exp.groundId);
  // 바퀴 변이(피의 달): 그 속성 적이 사냥터 주 속성처럼 자주 나온다
  const ground = elementBias && !g.elements.includes(elementBias) ? { ...g, elements: [...g.elements, elementBias] } : g;
  // 특수 속성(혈·독·허) 적 등장 숨김 (GDD 75장, C.127): 강적·공허의 밤·★3 이상에서만 가중치 × 배율, 그 밖은 풀에서 빠진다. 피의 달이 부르는 속성은 그대로
  const pool = gateSpecialEnemies(enemyPool(cls, exp.lap, source, ground), specialGateOf(exp, cls === 'elite').chance, elementBias);
  if (pool.length === 0) throw new Error(`적 출현 풀이 비었다: ${cls} ${exp.lap}바퀴 ${source}`);
  const base = pickFromPool(exp.rng, pool);
  const rare = nextFloat(exp.rng) < base.rareChance;
  return { ...scaleEnemy(base, enemyScale(exp.lap, exp.groundId, exp.difficulty, exp.streak, cls)), rare };
}

/** 이 칸이 조합(같은 comboGroup 3칸 인접)의 끝 칸인가 */
function isComboEnd(exp: ExpeditionState, cell: number): boolean {
  if (cell < 3) return false; // 1,2,3 이 첫 삼연속 → 끝 칸은 3 이상
  const groups = [cell - 2, cell - 1, cell].map((c) => {
    const id = exp.slots[c];
    return id ? getTile(id).comboGroup ?? null : null;
  });
  return groups[0] !== null && groups.every((g) => g === groups[0]);
}

export type StepEvent =
  | { kind: 'move'; cell: number; lap: number }
  | { kind: 'battle'; cell: number; battle: PendingBattle }
  | { kind: 'rest'; cell: number }
  | { kind: 'event'; cell: number; event: string }
  | { kind: 'lap-complete'; lap: number; rewardTile: string | null; petTile?: string | null; petFound?: string | null }
  | { kind: 'ended'; outcome: 'returned' | 'defeated'; reason: EndReason };

/** 한 칸 이동. phase 가 moving 일 때만 */
export function advance(exp: ExpeditionState): StepEvent | null {
  if (exp.phase !== 'moving') return null;
  // 사냥 무리 2연전 (GDD 25-5 ②): 같은 칸에서 바로 한 번 더 (이동·시간 없음)
  if (exp.queuedBattle) {
    const q = exp.queuedBattle;
    exp.queuedBattle = null;
    const qid = exp.slots[q.cell] ?? null;
    return startBattleAt(exp, q.cell, 'normal', false, qid, q.synergy ? { id: q.synergy, role: 'right' } : null, true);
  }
  exp.pos = (exp.pos + 1) % EX.loopTiles;
  exp.elapsedSeconds += EX.secondsPerTile;
  // 메아리 (C.124): 바로 앞 칸에서 효과가 난 타일만 기억한다 (이번 칸 처리 전에 비운다)
  const prevTile = exp.lastTile ?? null;
  exp.lastTile = null;
  // 진화 타이밍 = 걸음 수 (GDD 20-5 v4.1). 남은 걸음 20%·10% 순간 임박 알림
  const near = recordEvolutionStep(exp.evolution);
  if (near !== null) exp.events.push({ kind: 'evolution-near', level: near });
  exp.hunger += (exp.lap >= PX.hungerSpikeLap ? PX.hungerPerTileSpike : PX.hungerPerTile) * (mutationMods(exp.mutation).hungerMult ?? 1) * petHungerMult(exp);
  const late = lateLapRisk(exp.lap, PX.lateLapStart);
  if (late > 0) changeRisk(exp, late, 'late-lap');
  if (exp.hunger >= PX.hungerMax) {
    exp.hunger = PX.hungerMax;
    return endExpedition(exp, 'defeated', 'exhausted');
  }
  if (exp.pos === 0) {
    exp.lapsCompleted = exp.lap;
    const reward = drawTile(exp);
    const petLap = lapPetRolls(exp);
    // 스토리 버티기 목표 (GDD 25-4): 마친 바퀴 수
    const st = exp.story;
    if (st && storyEpisodeOf(exp)!.objective.type === 'survive') {
      st.progress = exp.lap;
      if (checkStoryClear(exp)) return { kind: 'ended', outcome: 'returned', reason: 'story-clear' };
    }
    if (exp.lap >= exp.maxLaps) return endExpedition(exp, 'returned', 'forced-max-laps');
    exp.phase = 'nest-choice';
    // 드래프트 (GDD 25-5 ①): 바퀴 끝 배치 팝업에서 3장 중 1장 (스토리는 끔)
    if (exp.tileVariants && !exp.story && !exp.tilesLocked) exp.draft = { lap: exp.lap, options: drawDraft(exp.varRng, exp.factionId, exp.deck), picked: null };
    return { kind: 'lap-complete', lap: exp.lap, rewardTile: reward, ...petLap };
  }
  const cell = exp.pos;
  // 스토리 보스 화 (GDD 25-7): 정해진 칸에 보스 (1바퀴, 이기기 전까지)
  const bossAt = storyEpisodeOf(exp)?.boss;
  if (bossAt && bossAt.cell === cell && exp.lap === 1 && !exp.story!.bossResult?.won) {
    exp.elitesThisLap++;
    return startBattleAt(exp, cell, 'elite', false, null, null, false, bossAt.id);
  }
  // 자유 원정 보스 (GDD 37장): 이번 바퀴 보스 칸이면 그 칸의 타일·전투 대신 보스
  const fa = exp.freeBoss?.appear;
  if (fa && fa.lap === exp.lap && fa.cell === cell && !exp.freeBoss!.result) {
    exp.elitesThisLap++;
    return startBattleAt(exp, cell, 'elite', false, null, null, false, fa.bossId);
  }
  let id = exp.slots[cell];
  let tile = id ? getTile(id) : null;
  // 메아리 (C.124, GDD 65장): 바로 앞 칸 타일의 효과를 이 칸에서 한 번 더. 앞 칸이 빈 칸·메아리·보스 칸이면 아무 일 없음
  if (tile?.effect.type === 'echo') {
    if (!prevTile || prevTile.cell !== cell - 1) return { kind: 'move', cell, lap: exp.lap };
    id = prevTile.tileId;
    tile = getTile(id);
  } else if (id && tile) exp.lastTile = { cell, tileId: id };
  // 인접 시너지 (GDD 25-5 ②): 왼쪽 칸에 들어설 때 기록·보호막, 오른쪽 칸에서 한 번 쓰는 리스크
  const syn = exp.tileVariants ? synergyAt(exp.slots, cell) : null;
  if (syn) {
    const m = synergyMods(syn.id);
    if (syn.role === 'left') {
      exp.variantLog.synergies.push({ id: syn.id, lap: exp.lap });
      if (m.nextShield) exp.nextShield = Math.max(exp.nextShield, m.nextShield);
    } else if (m.riskOnce) changeRisk(exp, m.riskOnce, 'synergy');
  }
  // 이벤트 타일 (GDD 25-5 ③): 내용을 미리 굴려 두고 고르기를 기다린다
  if (tile?.effect.type === 'event') {
    exp.eventPending = makeEvent(exp.varRng, id!, cell, exp);
    exp.phase = 'event';
    return { kind: 'event', cell, event: tile.effect.event };
  }
  if (tile?.effect.type === 'rest') {
    exp.restMult = combineMods(upgradeMods(id), syn ? synergyMods(syn.id) : null).restMult ?? 1;
    exp.restSpring = tile.effect.spring === true;
    exp.phase = 'rest';
    return { kind: 'rest', cell };
  }
  let cls: 'normal' | 'elite' | null = null;
  let combo = false;
  const wild = exp.wildCells.indexOf(cell);
  if (wild >= 0) {
    exp.wildCells.splice(wild, 1);
    cls = 'normal';
  }
  if (tile?.effect.type === 'spawn') cls = tile.effect.enemyClass;
  else if (tile?.effect.type === 'environment') cls = 'normal';
  if (tile && isComboEnd(exp, cell)) {
    cls = 'elite';
    combo = true;
  }
  if (cls === null) return { kind: 'move', cell, lap: exp.lap };
  // 강적은 바퀴당 최대 1마리: 넘치면 일반 적으로 낮춘다 (GDD 2-1). 사냥꾼(포식자 둥지, C.124)도 강적이라 같은 상한 — 낮아지면 사냥꾼이 아니다
  if (cls === 'elite' && exp.elitesThisLap >= BALANCE.battle.maxElitesPerLap) {
    cls = 'normal';
    combo = false;
  }
  if (cls === 'elite') exp.elitesThisLap++;
  return startBattleAt(exp, cell, cls, combo, id ?? null, syn, false);
}

/** 전투 재료를 만든다: 장착 특성·진화·환경·폭주 + 타일 변수(시너지·변이·상위 타일·함정·보호막·제단). 타일 변수가 없으면 예전과 같은 난수·같은 값 */
function startBattleAt(
  exp: ExpeditionState, cell: number, cls: 'normal' | 'elite', combo: boolean, id: string | null, syn: { id: string; role: 'left' | 'right' } | null, second: boolean, bossId: string | null = null,
): StepEvent {
  const tile = id ? getTile(id) : null;
  const sm = syn ? synergyMods(syn.id) : null;
  const m: VariantMods = combineMods(sm, mutationMods(exp.mutation), upgradeMods(id));
  // 장착한 특성(skill → 스킬 블록, passive → 자동 배율)이 전투 파라미터가 된다. 환경 타일 효과는 그 위에 더하거나 곱한다
  const params: Partial<CombatParams> = { ...buildCombatParams(exp.build, exp.factionId), voidChanceBonus: riskBonus(exp), liberationStartGauge: liberationStartGaugeOf(exp.stability), liberationEnabled: exp.liberationEnabled !== false };
  applyEvolutionToParams(params, exp.evolution, exp.factionId, exp.statBonus ?? 0, exp.liberationTrained === true);
  // 적 기준 능력치 = 원정 난이도 ★ (GDD 32-1). 내 쪽은 위에서 세계 기준으로 실렸다
  applyDifficultyToParams(params, exp.difficulty);
  applyTraitBoosts(params, exp.build, exp.traitBoosts ?? {});
  if (tile?.effect.type === 'environment') applyEnvironment(params, tile.effect.preset, m.envMult ?? 1);
  if (exp.breakthrough) applyFrenzy(params);
  applyCareToParams(params, exp.care);
  if (m.voidBonus) params.voidChanceBonus = (params.voidChanceBonus ?? 0) + m.voidBonus;
  if (m.voidMult && m.voidMult !== 1) params.voidChanceBonus = (params.voidChanceBonus ?? 0) + BALANCE.provisional.combat.voidChance * (m.voidMult - 1);
  if (m.enemyFirstStrike) params.enemyFirstStrike = true;
  // 보상 = 난이도 ★·연속 클리어 배율 (GDD 32-1 5·11번, 재화마다 다름): rewardMult 는 먹이 굴림 배율, 골드는 goldMult 에 (골드 ÷ 먹이) 비를 곱해 따로 간다. 리스크는 그대로
  const foodK = difficultyRewardMultiplier(exp.difficulty, exp.streak);
  const goldK = difficultyGoldMultiplier(exp.difficulty, exp.streak);
  let rewardMult = (m.rewardMult ?? 1) * foodK * dyingReward(exp); // 빈사면 보상 절반 (GDD 102장 수정)
  const goldMult = (m.goldMult ?? 1) * (goldK / foodK);
  let trap = false;
  if (exp.trapArmed) {
    params.playerStartHpFraction = TV.events.trap.startHpFraction;
    rewardMult *= TV.events.trap.rewardMult;
    exp.trapArmed = false;
    trap = true;
  }
  if (exp.nextShield > 0) {
    params.startShieldFraction = exp.nextShield;
    exp.nextShield = 0;
  }
  // 펫 보호막 (GDD 90장): 전투 시작 보호막(최대 체력 비율)에 더한다
  const petShield = petBonus(exp.pet, 'guard');
  if (petShield > 0) params.startShieldFraction = (params.startShieldFraction ?? 0) + petShield;
  // 장비 (GDD 91장 4번): 능력치·치명·계열 블록 피해·치명 피해·시작 보호막, 강적·보스면 강적 피해
  applyGearToParams(params, exp.gear, cls === 'elite' || bossId !== null);
  // 보스는 보스 데이터의 적 (원정 ★·연속 클리어·사냥터 강도만 입힌다 — 바퀴 강화 없음, GDD 37장 3번), 아니면 출현 풀에서
  let enemy = bossId ? scaleEnemy(getBoss(bossId).enemy, enemyScale(1, exp.groundId, exp.difficulty, exp.streak, 'normal')) : pickEnemy(exp, cls, combo ? 'combo' : tile ? tile.kind : 'wild', m.elementBias);
  const hpK = (m.enemyHpMult ?? 1) * (cls === 'elite' ? m.eliteHpMult ?? 1 : 1) * (exp.tutorial ? TUT.enemyHpMult : 1);
  const atkK = (m.enemyAttackMult ?? 1) * (exp.tutorial ? TUT.enemyAttackMult : 1);
  // 사냥꾼 (포식자 둥지, C.124): 강적 수치 × 배율, 이기면 흡수 후보 × 배율
  const hunter = !bossId && !combo && cls === 'elite' && tile?.effect.type === 'spawn' && tile.effect.hunter === true;
  const hpK2 = hpK * (hunter ? TT.hunter.hpMult : 1);
  const atkK2 = atkK * (hunter ? TT.hunter.attackMult : 1);
  if (hpK2 !== 1 || atkK2 !== 1) enemy = scaleEnemy(enemy, { hp: hpK2, attack: atkK2 });
  // 뼈 표식/수련 말뚝 (C.124): 이기면 노력치 (상위 타일은 envMult 배)
  const trainingEv = !bossId && tile?.effect.type === 'environment' && tile.effect.preset === 'training' ? Math.round(TT.training.ev * (m.envMult ?? 1)) : 0;
  const pending: PendingBattle = {
    enemy,
    seed: randomSeed(exp.rng),
    params,
    cell,
    lap: exp.lap,
    elite: cls === 'elite',
    combo,
    tileId: id,
    mods: {
      rewardMult, goldMult, foodMult: m.foodMult ?? 1, foodChanceBonus: m.foodChanceBonus ?? 0, absorbBonus: m.absorbBonus ?? 0,
      extraBattle: !second && syn?.role === 'right' ? sm?.extraBattle ?? 0 : 0, eliteSoulBonus: m.eliteSoulBonus ?? 0,
      ...(hunter ? { absorbMult: TT.hunter.absorbCandidateMult } : {}), ...(trainingEv > 0 ? { trainingEv } : {}),
    },
    synergy: syn?.id ?? null,
    trap,
    second,
    boss: bossId,
  };
  exp.pending = pending;
  exp.phase = 'battle';
  return { kind: 'battle', cell, battle: pending };
}

/** 환경 타일 프리셋 → 전투 조건 (GDD 6장, 효과 종류는 엔진·이름은 종족 스킨): 안개 = 트레이 섞임, 황무지 = 공격 위력, 결계 = 받는 피해 경감, 폐가 = 공허 블록 증가 */
/** strength: 효과 크기 배율 (상위 타일 "+", GDD 25-5 ⑤) — 섞임 간격은 나누고, 배율은 1 에서 벗어난 만큼을 곱한다 */
export function applyEnvironment(params: Partial<CombatParams>, preset: EnvironmentPreset, strength = 1): void {
  const T = BALANCE.provisional.tiles;
  if (preset === 'reshuffle') params.trayShuffleSeconds = T.reshuffle.trayShuffleSeconds / strength;
  else if (preset === 'power') params.playerPowerMultiplier = (params.playerPowerMultiplier ?? 1) * (1 + (T.power.playerPowerMultiplier - 1) * strength);
  else if (preset === 'shield') params.damageTakenMultiplier = (params.damageTakenMultiplier ?? 1) * (1 - (1 - T.shield.damageTakenMultiplier) * strength);
  else params.voidChanceBonus = (params.voidChanceBonus ?? 0) + T.void.voidChanceBonus * strength;
}

/** 폭주 (GDD 23-2·101장 4번): 한계 돌파한 원정의 남은 전투는 주는 피해·받는 피해가 함께 오르고, 적 공격을 확률로 통째로 피한다 (공허 생성 증가는 riskBonus 가 따로 더한다) */
export function applyFrenzy(params: Partial<CombatParams>): void {
  params.playerPowerMultiplier = (params.playerPowerMultiplier ?? 1) * RX.frenzyDamageDealt;
  params.damageTakenMultiplier = (params.damageTakenMultiplier ?? 1) * RX.frenzyDamageTaken;
  params.evadeChance = Math.max(params.evadeChance ?? 0, RX.frenzyEvadeChance);
  // 폭주 중에는 회복 버튼이 잠긴다 (101장 추가 결정 2 2번 → 105장)
  params.noHealSpawn = true;
}

/** 쇠약·피곤·빈사 (GDD 102-2·102장 수정): 쇠약 = 내 최대 체력 −weakMaxHpCut, 피곤 = 블록 생성 간격 +tiredSpawnSlow (생성 속도 배율을 나눈다),
 *  빈사 = 최대 체력 × hpFraction(최대치 자체를 줄여 그 위로 회복 안 됨) · 공격 속도·블록 생성 속도 × speedMult. 원정·탑·쟁탈전·훈련 인형이 같이 쓴다 */
export function applyCareToParams(params: Partial<CombatParams>, care: Partial<CareCarry> | null | undefined): void {
  if (!care) return;
  const CP = BALANCE.provisional.nest.care;
  if (care.weak) params.playerHpScale = (params.playerHpScale ?? BALANCE.provisional.combat.playerHpScale) * (1 - CP.weakMaxHpCut);
  if (care.tired) params.blockSpawnMultiplier = (params.blockSpawnMultiplier ?? 1) / (1 + CP.tiredSpawnSlow);
  if (care.dying) {
    params.playerHpScale = (params.playerHpScale ?? BALANCE.provisional.combat.playerHpScale) * CP.dying.hpFraction;
    params.attackSpeedMultiplier = (params.attackSpeedMultiplier ?? 1) * CP.dying.speedMult;
    params.blockSpawnMultiplier = (params.blockSpawnMultiplier ?? 1) * CP.dying.speedMult;
  }
}

/** 빈사 보상 배율 (골드·먹이·노력치) */
function dyingReward(exp: Pick<ExpeditionState, 'care'>): number {
  return exp.care?.dying ? BALANCE.provisional.nest.care.dying.rewardMult : 1;
}

/** 폭주 중인가: 이번 원정에서 한계 돌파가 일어났다 (원정당 1회) */
export function inFrenzy(exp: Pick<ExpeditionState, 'breakthrough'>): boolean {
  return exp.breakthrough !== null;
}

/** 컨디션 하한 (GDD 42장 3번): 원정 중 감소는 바퀴당 최대 PX.conditionLossPerLapMax — 출발 컨디션 − 그 값 × 지금 바퀴. 출발 값이 없으면(옛 중간 저장) 0.
 *  이미 하한보다 낮으면(출발이 낮았음) 지금 값 아래로만 막는다 */
export function conditionFloor(exp: Pick<ExpeditionState, 'startCondition' | 'lap' | 'condition'>): number {
  if (exp.startCondition === undefined) return 0;
  return Math.max(0, Math.min(exp.condition, exp.startCondition - PX.conditionLossPerLapMax * exp.lap));
}

/** 대기 중인 전투를 전투 엔진(v2)으로 만든다 */
export function startBattle(exp: ExpeditionState): CombatState {
  if (exp.phase !== 'battle' || !exp.pending) throw new Error('치를 전투가 없다');
  const boss = exp.pending.boss;
  return createCombat(exp.pending.seed, { enemy: exp.pending.enemy, params: exp.pending.params, ...(boss ? { boss: bossSetupOf(boss) } : {}) });
}

/** 끝난 전투를 원정에 반영한다. 승리 → 이동 재개, 패배 → 원정 끝 */
export function finishBattle(exp: ExpeditionState, battle: CombatState): BattleRecord {
  const pending = exp.pending;
  if (exp.phase !== 'battle' || !pending || battle.status === 'playing') throw new Error('끝나지 않은 전투');
  const record = buildBattleRecord(battle, { factionId: exp.factionId, runId: exp.runId, lap: exp.lap, tierIndex: exp.evolution.tierIndex });
  const st = exp.story;
  if (pending.boss) {
    // 보스전 기록 (GDD 25-3): 강적 처치 수(영혼 결정·칭호)에 섞이지 않게 등급을 boss 로
    record.enemyClass = 'boss';
    const br: BossBattleResult = { bossId: pending.boss, won: battle.status === 'won', durationSeconds: record.durationSeconds, phase: battle.boss?.phase ?? 1, seals: battle.boss?.seals ?? 0, lossReason: battle.lossReason };
    if (st) st.bossResult = br;
    else if (exp.freeBoss) exp.freeBoss.result = br;
  }
  exp.battles.push(record);
  exp.battlesByLap[exp.lap - 1] = (exp.battlesByLap[exp.lap - 1] ?? 0) + 1;
  exp.pending = null;
  exp.hunger = Math.min(PX.hungerMax, exp.hunger + PX.hungerPerBattle * (mutationMods(exp.mutation).hungerMult ?? 1) * petHungerMult(exp));
  exp.condition = Math.max(conditionFloor(exp), exp.condition - PX.conditionPerBattle);
  // 공허 블록 사용 → 리스크 게이지 상승 (GDD 3-5)
  if (battle.riskGained > 0) changeRisk(exp, battle.riskGained, 'void-block');
  // 해방이 끝나며 오른 리스크 (GDD 22-5)
  if (battle.liberation.risk > 0) changeRisk(exp, battle.liberation.risk, 'liberation');
  if (battle.status === 'lost') {
    endExpedition(exp, 'defeated', 'battle-lost');
    return record;
  }
  // 장비 드롭 (GDD 91장 2번): 강적·보스 높게, 일반 낮게. 따로 만든 난수라 다른 굴림을 밀지 않는다
  rollGearDrop(exp, pending.boss ? 'boss' : pending.enemy.class === 'elite' ? 'elite' : 'normal');
  // 승리 보상: 바퀴 첫 승리 1장, 강적(소굴·조합)이면 추가 1장. 바퀴 합계는 tilesPerLap.max 까지
  if (exp.victoriesThisLap === 0) drawTile(exp);
  if (pending.enemy.class === 'elite') recordEvolutionElite(exp.evolution);
  if (pending.elite) for (let i = 0; i < PX.eliteBonusTiles; i++) drawTile(exp);
  const mods = pending.mods ?? NO_MODS;
  const elite = pending.enemy.class === 'elite';
  if (st) {
    // 스토리 목표·중간 대사 (GDD 25-4): 처치 목표는 그 등급만, 보스는 보스 처치
    st.kills++;
    const o = storyEpisodeOf(exp)!;
    if (o.objective.type === 'defeat' && !pending.boss && pending.enemy.class === o.objective.enemyClass) st.progress++;
    if (o.objective.type === 'boss' && pending.boss) st.progress = 1;
    const mid = o.dialogue.mid;
    if (mid && !st.midShown && st.kills >= mid.afterKills) {
      st.midShown = true;
      st.cue = 'mid';
    }
  }
  if (pending.boss) {
    // 보스 보상 (GDD 25-3): 골드·희귀 먹이 (일반 전리품 대신), 흡수 화면은 늘 열리고 보스 특성이 확정 후보. 자유 원정은 골드 × 원정 골드 배율 (GDD 37장 4번)
    const bossGold = Math.round((exp.story ? BX.reward.gold : Math.round(BX.reward.gold * difficultyGoldMultiplier(exp.difficulty, exp.streak))) * petGoldMult(exp));
    exp.goldLoot.push({ amount: bossGold, lap: exp.lap });
    exp.foodLoot.push({ food: BX.reward.food as FoodId, lap: exp.lap });
    exp.victoriesThisLap++;
    exp.absorbOffer = buildOffer(exp.rng, pending.enemy, exp.build, battle, mods.absorbBonus, getBoss(pending.boss).trait, 1, offerElementsOf(pending.boss, pending.enemy.element));
    markSpecialGates(exp, exp.absorbOffer, elite, true);
    exp.phase = 'absorb';
    return record;
  }
  // 먹이 전리품 (GDD 23-1): 일반 50% 1개, 강적 확정 1개 + 30% 1개 더. 시너지·변이·상위 타일·함정 배율은 굴림 횟수로 (GDD 25-5)
  for (const food of rollBattleFoodMult(exp.lootRng, elite, getGround(exp.groundId).food, mods.rewardMult * mods.foodMult, mods.foodChanceBonus)) exp.foodLoot.push({ food, lap: exp.lap });
  // 골드 (C.57): 일반·강적 바탕값 × 보상·골드 배율
  const gold = Math.round((elite ? GX.elite : GX.normal) * mods.rewardMult * mods.goldMult * petGoldMult(exp));
  if (gold > 0) (exp.goldLoot ??= []).push({ amount: gold, lap: exp.lap });
  if (elite && mods.eliteSoulBonus > 0) exp.bonusSoul = (exp.bonusSoul ?? 0) + mods.eliteSoulBonus;
  if ((mods.trainingEv ?? 0) > 0) trainingTileEv(exp, pending.enemy, mods.trainingEv!);
  exp.victoriesThisLap++;
  // 사냥 무리 2연전: 흡수 화면을 마친 뒤 다음 advance 에서
  if (mods.extraBattle > 0) exp.queuedBattle = { cell: pending.cell, synergy: pending.synergy ?? null };
  // 이기면 언제나 흡수 화면 (C.125, GDD 71장: 흡수 조건 삭제 — 흡수 / 놓아줌 네 갈래). 첫 원정 튜토리얼(67장)은 tutorialAbsorb 로 끝난다
  exp.absorbOffer = buildOffer(exp.rng, pending.enemy, exp.build, battle, mods.absorbBonus, null, mods.absorbMult ?? 1);
  markSpecialGates(exp, exp.absorbOffer, elite);
  if (exp.tutorial) exp.absorbOffer.reasons = ['tutorial'];
  exp.phase = 'absorb';
  return record;
}

export type AbsorbResult = { ok: true } | { ok: false; reason: string };

/** 뼈 표식/수련 말뚝 (C.124, GDD 65장): 그 적의 노력치(ev)가 가장 큰 능력치 하나에 n (단계 상한 안 — 넘으면 0). 오른 양을 엔진 이벤트로 */
function trainingTileEv(exp: ExpeditionState, enemy: EnemyDef, n: number): void {
  const stat = trainingStatOf(enemy);
  if (!stat) return;
  const got = addEv(exp.evolution, { [stat]: n })[stat] ?? 0;
  exp.events.push({ kind: 'tile-ev', stat, amount: got });
}

/** 수련 타일이 올릴 능력치: 적 ev 가 가장 큰 것 (같으면 STAT_IDS 순서 앞). ev 가 없으면 null */
export function trainingStatOf(enemy: Pick<EnemyDef, 'ev'>): StatId | null {
  let best: StatId | null = null;
  for (const s of STAT_IDS) {
    const v = enemy.ev?.[s] ?? 0;
    if (v > 0 && (best === null || v > (enemy.ev?.[best] ?? 0))) best = s;
  }
  return best;
}

/** 특수 속성 특성 숨김이 풀릴 확률 (GDD 49-7 ①): 강적·보스 / 바퀴 변이 / 원정 난이도 */
/** 흡수 특성 후보를 뽑는 속성 (C.125, GDD 70장): 적 속성, 보스는 속성 바뀜 기믹(elementShifts)의 속성까지 — "적이 속성을 여러 개 가지면 그 속성들 안에서" */
export function offerElementsOf(bossId: string | null, element: string): string[] {
  const shifts = bossId ? getBoss(bossId).elementShifts ?? [] : [];
  return [...new Set([element, ...shifts])];
}

/** 특수 속성(혈·독·허) 적 등장 숨김의 출현 배율·까닭 (GDD 75장, C.127): 강적·보스 / 바퀴 변이(공허의 밤) / 원정 난이도 ★ */
function specialGateOf(exp: Pick<ExpeditionState, 'difficulty' | 'mutation'>, elite: boolean, boss = false): ReturnType<typeof specialEnemyGate> {
  return specialEnemyGate({ elite, boss, difficulty: exp.difficulty, mutationChance: mutationMods(exp.mutation).specialEnemyChance });
}

/** 특수 속성 적의 흡수 화면이면 그 적이 나온 까닭을 붙인다 (런 로그 specialGates, GDD 9장 — 히든 조건 대비) */
function markSpecialGates(exp: ExpeditionState, offer: AbsorbOffer, elite: boolean, boss = false): void {
  if (!isSpecialTrait({ element: offer.element })) return;
  const gates = specialGateOf(exp, elite, boss).gates;
  if (exp.mutation && mutationMods(exp.mutation).elementBias === offer.element && !gates.includes('mutation')) gates.push('mutation');
  offer.specialGates = gates;
}

function logAbsorb(exp: ExpeditionState, offer: AbsorbOffer, absorbed: boolean, traitId: string | null, mode?: AbsorbMode, enhance?: number): void {
  // 특수 속성 적 (GDD 75장, 9장): 그 적이 나온 까닭(등장 숨김이 풀린 까닭)과, 고른 특성이 특수 속성이었는지
  const hidden = offer.specialGates ? { specialGates: [...offer.specialGates], ...(absorbed && traitId && isSpecialTrait(getTrait(traitId)) ? { hiddenTrait: true } : {}) } : {};
  // 흡수 갈래 (GDD 52, 9장): 흡수했을 때만, 기본 갈래(둘 다)는 적지 않는다(없음 = both, absorbModeOf) — 저장 크기
  exp.absorbRecords.push({ runId: exp.runId, enemyId: offer.enemyId, element: offer.element, rare: offer.rare, absorbed, traitId, lap: exp.lap, ...(offer.rerolled ? { rerolled: true } : {}), ...hidden, ...(absorbed && mode && mode !== 'both' ? { mode } : {}), ...(enhance !== undefined ? { enhance } : {}) });
}

/** 다시 뽑기 (GDD 25-9): 흡수 화면에서 특성 후보를 한 번 다시 뽑는다(흡수 1번에 1장 — 이미 다시 뽑았으면 거절). 다시 뽑기권은 부르는 쪽(세이브)이 쓴다.
 *  난수는 원정 난수와 따로(같은 시드 원정의 적·타일·흡수 결과를 바꾸지 않는다) */
export function rerollAbsorb(exp: ExpeditionState): AbsorbResult {
  const offer = exp.absorbOffer;
  if (exp.phase !== 'absorb' || !offer) return { ok: false, reason: '흡수를 고를 수 없는 때' };
  if (offer.rerolled) return { ok: false, reason: '이 흡수에서는 이미 다시 뽑았다' };
  if (offer.candidates.length === 0) return { ok: false, reason: '다시 뽑을 후보가 없다' };
  const rng = createRng((exp.seed ^ REROLL_SEED_SALT ^ Math.imul(exp.absorbRecords.length + 1, 2654435761)) >>> 0);
  const boss = isBossId(offer.enemyId) ? offer.enemyId : null;
  offer.candidates = rerollCandidates(rng, offer, exp.build, boss ? getBoss(boss).trait : null, offerElementsOf(boss, offer.element));
  offer.rerolled = true;
  return { ok: true };
}

/** 놓아줌: 리스크 하락 + 안정 수치 상승 (GDD 4장 "흡수 안 하면") */
export function chooseRelease(exp: ExpeditionState): AbsorbResult {
  const offer = exp.absorbOffer;
  if (exp.phase !== 'absorb' || !offer) return { ok: false, reason: '흡수를 고를 수 없는 때' };
  if (exp.tutorial) return tutorialAbsorb(exp);
  logAbsorb(exp, offer, false, null);
  releaseEffect(exp);
  recordEvolutionRelease(exp.evolution);
  exp.absorbOffer = null;
  exp.phase = 'moving';
  checkStoryClear(exp);
  return { ok: true };
}

/** 흡수 갈래의 노력치: 적 ev × 갈래 배율(둘 다 1·속성만 0·스탯만 2) × 난이도 보상 배율 (GDD 52·32-1 5번, 정수 반올림) */
export function absorbEvOf(offer: Pick<AbsorbOffer, 'ev'>, mode: AbsorbMode, difficulty: number, streak = 0): Partial<Record<StatId, number>> {
  const k = absorbModeRule(mode).ev;
  if (k <= 0) return {};
  const ev: Partial<Record<StatId, number>> = {};
  for (const [s, v] of Object.entries(offer.ev)) if (typeof v === 'number' && v > 0) ev[s as StatId] = v * k;
  return scaleEv(ev, difficulty, streak);
}

/** 흡수 (GDD 4장, 4-1 → 52장 갈래): 후보 중 traitId 를 슬롯에 장착(가득 차면 replaceSlot 과 교체, traitId null 이면 특성을 포기하고 효과만).
 *  mode = 'both'(특성·속성 카운트 + 노력치 ×1) / 'trait'(특성·속성 카운트만, 리스크 ×0.7) / 'stat'(노력치 ×2, 리스크 ×0.5, 특성·속성 카운트 없음 — traitId 는 null 이어야 한다).
 *  공통 효과: 허기 리셋, 리스크 상승(강할수록 많이), 보상 타일 +1. 실패하면 아무것도 바뀌지 않는다 */
export function chooseAbsorb(exp: ExpeditionState, traitId: string | null, replaceSlot?: number | null, mode: AbsorbMode = 'both'): AbsorbResult {
  const offer = exp.absorbOffer;
  if (exp.phase !== 'absorb' || !offer) return { ok: false, reason: '흡수를 고를 수 없는 때' };
  if (mode === 'stat' && traitId !== null) return { ok: false, reason: '스탯만 흡수할 때는 특성을 고를 수 없다' };
  if (exp.tutorial) return tutorialAbsorb(exp);
  if (traitId !== null) {
    if (!offer.candidates.includes(traitId)) return { ok: false, reason: '후보에 없는 특성이다' };
    // 106장 1: 이미 가진 특성(블록)이면 중복 블록 없이 아래 속성 강화 +1 만
    if (!exp.build.owned.includes(traitId)) {
      const r = gainTrait(exp.build, traitId, replaceSlot);
      if (!r.ok) return r;
      exp.acquiredTraits.push({ traitId, lap: exp.lap });
    }
  }
  // 속성 강화 (GDD 84장 8번): 특성·속성 카운트가 있는 갈래면 그 적 속성 강화 +1 — 이미 가진 계열이어도, 100 뒤에도 센다(효과는 100 에서 멈춤)
  const enhance = mode !== 'stat' ? addEnhance(exp.build, offer.element) : undefined;
  logAbsorb(exp, offer, true, traitId, mode, enhance);
  const ev = absorbEvOf(offer, mode, exp.difficulty, exp.streak);
  const evK = dyingReward(exp); // 빈사면 노력치 절반 (GDD 102장 수정)
  recordEvolutionAbsorb(exp.evolution, offer.element, evK === 1 ? ev : Object.fromEntries(Object.entries(ev).map(([k, v]) => [k, (v ?? 0) * evK])), mode !== 'stat');
  exp.hunger = Math.min(exp.hunger, AX.hungerAfterAbsorb);
  for (let i = 0; i < AX.bonusTiles; i++) drawTile(exp, 1);
  changeRisk(exp, absorbRisk(offer.strength, mode), 'absorb');
  // 스토리 흡수 목표 (GDD 25-4): 그 등급 적을 흡수
  const ob = storyEpisodeOf(exp)?.objective;
  if (exp.story && ob?.type === 'absorb' && (offer.elite ? 'elite' : 'normal') === ob.enemyClass) exp.story.progress++;
  exp.absorbOffer = null;
  exp.phase = 'moving';
  checkStoryClear(exp);
  return { ok: true };
}

/** 튜토리얼 첫 흡수 (GDD 67장 3번): 시스템상 흡수가 아니다 — 흡수 수·속성 카운트·특성·리스크·흡수 기록·보상 타일 없음.
 *  대신 능력치 6종 노력치를 같은 양(tutorialRun.statEv) 올리고(단계 상한 안), 원정을 끝낸다(귀환). 런 로그에는 귀환 때 '튜토리얼 보상'으로 따로 남는다 */
export function tutorialAbsorb(exp: ExpeditionState): AbsorbResult {
  const offer = exp.absorbOffer;
  if (exp.phase !== 'absorb' || !offer || !exp.tutorial) return { ok: false, reason: '튜토리얼 흡수를 고를 수 없는 때' };
  const want: Partial<Record<StatId, number>> = {};
  for (const s of STAT_IDS) want[s] = TUT.statEv;
  exp.tutorialReward = { enemyId: offer.enemyId, element: offer.element, ev: addEv(exp.evolution, want) };
  exp.absorbOffer = null;
  exp.phase = 'moving';
  endExpedition(exp, 'returned', 'tutorial-clear');
  return { ok: true };
}

/** 쌓인 엔진 이벤트(한계 돌파 등)를 꺼낸다. 화면이 연출하고 비운다 */
export function drainEvents(exp: ExpeditionState): EngineEvent[] {
  return exp.events.splice(0, exp.events.length);
}

/** 휴식 타일 효과: 허기·컨디션 회복, 시간 소모 */
export function finishRest(exp: ExpeditionState): void {
  if (exp.phase !== 'rest') throw new Error('휴식 중이 아니다');
  // 회복 배율: 상위 타일(휴식+)·시너지(오아시스) (GDD 25-5)
  const k = exp.restMult ?? 1;
  // 영혼 샘/정화의 샘 (C.124): 회복 대신 리스크만 크게
  const sp = exp.restSpring ? TT.spring : { hungerMult: 1, conditionMult: 1, riskReliefMult: 1 };
  exp.hunger = Math.max(0, exp.hunger - PX.restHunger * k * sp.hungerMult);
  changeRisk(exp, -RX.restRelief * k * sp.riskReliefMult, 'rest');
  exp.condition = Math.min(PX.conditionMax, exp.condition + PX.restCondition * k * sp.conditionMult);
  exp.restMult = 1;
  exp.restSpring = false;
  exp.elapsedSeconds += PX.restTimeTiles * EX.restSecondsPerTile;
  // 휴식 타일을 지나면 간식 +1 (GDD 23-1)
  for (let i = 0; i < FX.restSnack; i++) exp.foodLoot.push({ food: 'snack', lap: exp.lap });
  exp.phase = 'moving';
}

/** 둥지 칸에서: 귀환 */
export function chooseReturn(exp: ExpeditionState): void {
  if (exp.phase !== 'nest-choice') throw new Error('귀환을 고를 수 없는 때');
  discardDraft(exp);
  endExpedition(exp, 'returned', 'returned');
}

/** 원정 도중 귀환할 수 있나 (GDD 81장): 걷기·휴식 중만(전투·이벤트·둥지 칸 선택 중은 아님), 첫 원정 튜토리얼은 숨김 */
export function canAbort(exp: Pick<ExpeditionState, 'phase' | 'tutorial'>): boolean {
  return !exp.tutorial && (exp.phase === 'moving' || exp.phase === 'rest');
}

/** 원정 전투 일시정지 [귀환] (GDD 100장 v5.220, C.172): 그 전투는 패배로 치지 않고 끝내고 걷기 중간 귀환과 같은 처리(abortExpedition). 첫 원정 튜토리얼은 안 됨 */
export function canAbortBattle(exp: Pick<ExpeditionState, 'phase' | 'tutorial'>): boolean {
  return !exp.tutorial && exp.phase === 'battle';
}

/** 원정 도중 [귀환하기] (GDD 81장, C.132): 지금까지 모은 것은 바퀴 끝 귀환처럼 지킨다. 바퀴 완주 보상(둥지 칸 타일)은 둥지 칸에 닿지 않았으니 없다.
 *  쉬던 중이면 휴식 효과도 없다. 연속 클리어는 settleStreak 가 끊는다 */
export function abortExpedition(exp: ExpeditionState): void {
  if (!canAbort(exp) && !canAbortBattle(exp)) throw new Error('지금은 귀환할 수 없다');
  exp.restMult = 1;
  exp.restSpring = false;
  endExpedition(exp, 'returned', 'abort');
}

/** 둥지 칸에서: 한 바퀴 더 */
export function chooseContinue(exp: ExpeditionState): void {
  if (exp.phase !== 'nest-choice') throw new Error('계속을 고를 수 없는 때');
  discardDraft(exp);
  exp.lap++;
  exp.pos = 0;
  planLap(exp);
  exp.phase = 'moving';
}

/** 드래프트 고르기 (GDD 25-5 ①): 바퀴 끝 팝업에서 카드 한 장을 손에 쥔다. 이번 바퀴 길에 놓을 수 있고 덱·보유에는 들어가지 않는다 */
export function chooseDraft(exp: ExpeditionState, index: number): PlaceResult {
  const d = exp.draft;
  if (exp.phase !== 'nest-choice' || !d) return { ok: false, reason: '지금은 고를 수 없다' };
  if (d.picked !== null) return { ok: false, reason: '이미 골랐다' };
  const id = d.options[index];
  if (id === undefined) return { ok: false, reason: '없는 카드다' };
  d.picked = index;
  exp.hand.push(id);
  exp.variantLog.drafts.push({ tileId: id, lap: exp.lap });
  return { ok: true };
}

/** 확정(계속·귀환) 때 놓지 않은 드래프트 타일은 사라진다. 같은 타일이 손에 여럿이면 하나만 뺀다 */
function discardDraft(exp: ExpeditionState): void {
  const d = exp.draft;
  exp.draft = null;
  if (!d || d.picked === null) return;
  const i = exp.hand.lastIndexOf(d.options[d.picked]!);
  if (i >= 0) exp.hand.splice(i, 1);
}

/** 지금 쓸 수 있는 골드: 가진 골드 + 이번 원정에서 번(쓴) 골드 */
export function goldAvailable(exp: Pick<ExpeditionState, 'goldBank' | 'goldLoot'>): number {
  return (exp.goldBank ?? 0) + (exp.goldLoot ?? []).reduce((a, g) => a + g.amount, 0);
}

export type EventResult = { ok: true; text: string } | { ok: false; reason: string };

/** 이벤트 타일 고르기 (GDD 25-5 ③). choice: 상인 = 판매 줄 번호(null 그냥 지나감), 제단 = 특성 후보 번호(null 거절), 갈림길 = 0 보호막 / 1 골드, 보물·함정 = 무시.
 *  끝나면 그 타일은 길에서 사라지고 이동을 이어간다. 실패하면 아무것도 바뀌지 않는다 */
export function resolveEvent(exp: ExpeditionState, choice: number | null): EventResult {
  const ev = exp.eventPending;
  if (exp.phase !== 'event' || !ev) return { ok: false, reason: '이벤트가 없다' };
  const E = TV.events;
  let log: string;
  let text: string;
  if (ev.event === 'merchant') {
    if (choice === null) {
      log = 'leave';
      text = '그냥 지나갔다';
    } else {
      const o = ev.offers?.[choice];
      if (!o) return { ok: false, reason: '없는 물건이다' };
      if (goldAvailable(exp) < o.price) return { ok: false, reason: '골드가 모자란다' };
      exp.goldLoot.push({ amount: -o.price, lap: exp.lap });
      if (o.kind === 'food') exp.foodLoot.push({ food: o.id as FoodId, lap: exp.lap });
      else {
        exp.acquired.push({ tileId: o.id, lap: exp.lap });
        exp.hand.push(o.id);
      }
      log = `buy:${o.kind}:${o.id}`;
      text = `${o.price} 골드에 샀다`;
    }
  } else if (ev.event === 'altar') {
    if (choice === null) {
      log = 'decline';
      text = '제단을 지나쳤다';
    } else {
      const id = ev.traits?.[choice];
      if (!id) return { ok: false, reason: '없는 특성이다' };
      changeRisk(exp, E.altar.risk, 'altar');
      exp.traitBoosts[id] = (exp.traitBoosts[id] ?? 0) + E.altar.traitPower;
      log = `trait:${id}`;
      text = `위력 +${Math.round(E.altar.traitPower * 100)}% (이번 원정)`;
    }
  } else if (ev.event === 'treasure') {
    const t = ev.treasure ?? {};
    if (t.food) {
      exp.foodLoot.push({ food: t.food, lap: exp.lap });
      log = `food:${t.food}`;
    } else {
      exp.goldLoot.push({ amount: t.gold ?? 0, lap: exp.lap });
      log = `gold:${t.gold ?? 0}`;
    }
    text = '보물을 챙겼다';
  } else if (ev.event === 'trap') {
    exp.trapArmed = true;
    log = 'armed';
    text = '다음 전투는 상처를 입은 채 시작한다. 이기면 보상이 크다';
  } else {
    if (choice === 0) {
      exp.nextShield = Math.max(exp.nextShield, E.crossroads.shield);
      log = 'shield';
      text = `다음 전투 보호막 ${Math.round(E.crossroads.shield * 100)}%`;
    } else if (choice === 1) {
      exp.goldLoot.push({ amount: E.crossroads.gold, lap: exp.lap });
      log = 'gold';
      text = `골드 +${E.crossroads.gold}`;
    } else return { ok: false, reason: '길을 골라야 한다' };
  }
  exp.variantLog.events.push({ event: ev.event, choice: log, lap: exp.lap });
  if (exp.slots[ev.cell] === ev.tileId) exp.slots[ev.cell] = null; // 한 번 밟으면 사라진다 (메아리 칸에서 한 번 더 난 이벤트면 메아리는 남는다)
  exp.eventPending = null;
  exp.phase = 'moving';
  return { ok: true, text };
}

/** 펫 허기 배율 (GDD 90장 pet-belly): 1 − 감소율. 펫이 없으면 1 */
function petHungerMult(exp: Pick<ExpeditionState, 'pet'>): number {
  return 1 - petBonus(exp.pet, 'belly');
}

/** 펫 골드 배율 (GDD 90장 pet-gold): 1 + 증가율. 펫이 없으면 1 */
function petGoldMult(exp: Pick<ExpeditionState, 'pet'>): number {
  return 1 + petBonus(exp.pet, 'gold');
}

/** 장비 드롭 굴림 (GDD 91장 2번): gearDrops 일 때만. ★ = 원정 난이도, 등급 = dropGrades[상대 등급], 종류 무작위 */
function rollGearDrop(exp: ExpeditionState, from: 'normal' | 'elite' | 'boss'): void {
  if (!exp.gearDrops || exp.tutorial) return;
  const G = BALANCE.provisional.gear;
  const rng = createRng((exp.seed ^ GEAR_SEED_SALT ^ Math.imul(exp.battles.length, 2246822519)) >>> 0);
  const rand = () => nextFloat(rng);
  if (rand() >= G.dropChance[from]) return;
  const roll = rollGear({ grade: rollGrade(G.dropGrades[from]!, rand), star: exp.difficulty }, rand);
  (exp.gearFinds ??= []).push({ roll, lap: exp.lap, from });
}

/** 바퀴 끝 펫 굴림 (GDD 90장): 바퀴 끝 보상 펫(petDrops, 2%) · pet-seek 타일 +1장(10%). 바퀴마다 따로 만든 난수라 다른 굴림을 밀지 않는다 */
function lapPetRolls(exp: ExpeditionState): { petTile?: string | null; petFound?: string | null } {
  if (exp.tutorial || (!exp.pet && !exp.petDrops)) return {};
  const rng = createRng((exp.seed ^ PET_SEED_SALT ^ Math.imul(exp.lap, 2654435761)) >>> 0);
  const out: { petTile?: string | null; petFound?: string | null } = {};
  if (exp.petDrops) {
    const hit = nextFloat(rng) < BALANCE.provisional.pets.lapDropChance;
    const id = rollAnyPet(() => nextFloat(rng));
    if (hit) {
      (exp.petFinds ??= []).push({ petId: id, lap: exp.lap });
      out.petFound = id;
    }
  }
  const tileChance = petBonus(exp.pet, 'seekTile');
  if (tileChance > 0 && nextFloat(rng) < tileChance) out.petTile = drawTile(exp);
  return out;
}

/** 덱에서 타일 1장 획득. 바퀴 합계 상한(tilesPerLap.max)을 넘기면 얻지 않는다. reserve 만큼은 남겨 둔다(흡수 보상이 바퀴 완주 보상을 밀어내지 않게) */
function drawTile(exp: ExpeditionState, reserve = 0): string | null {
  if (exp.deck.length === 0 || exp.tilesThisLap >= EX.tilesPerLap.max - reserve) return null;
  const id = exp.deck[nextInt(exp.rng, exp.deck.length)]!;
  exp.acquired.push({ tileId: id, lap: exp.lap });
  exp.hand.push(id);
  exp.tilesThisLap++;
  return id;
}

export type PlaceResult = { ok: true } | { ok: false; reason: string };

/** 타일 배치 (임시 규칙): 전투/휴식 중이 아닐 때, 지금 위치보다 앞쪽 칸의 빈 슬롯에, 손에 든 타일만. 한 번 놓으면 원정 동안 유지 */
export function placeTile(exp: ExpeditionState, tileId: string, cell: number): PlaceResult {
  if (exp.phase !== 'moving' && exp.phase !== 'nest-choice') return { ok: false, reason: '지금은 배치할 수 없다' };
  if (!Number.isInteger(cell) || cell < 1 || cell >= EX.loopTiles) return { ok: false, reason: '슬롯이 없는 칸이다' };
  if (cell <= exp.pos) return { ok: false, reason: '지나간 칸에는 놓을 수 없다' };
  if (exp.slots[cell] !== null) return { ok: false, reason: '이미 타일이 있다' };
  const i = exp.hand.indexOf(tileId);
  if (i < 0) return { ok: false, reason: '손에 없는 타일이다' };
  if (exp.planLimit !== undefined && placedCount(exp) >= exp.planLimit) return { ok: false, reason: `배치는 최대 ${exp.planLimit}칸이다` };
  exp.hand.splice(i, 1);
  exp.slots[cell] = tileId;
  // 전투 타일은 이번 바퀴의 야생 전투 하나를 대신한다 (그 칸이 야생 칸이면 그 칸, 아니면 남은 것 중 하나)
  const w = exp.wildCells.indexOf(cell);
  if (w >= 0) exp.wildCells.splice(w, 1);
  else if (causesBattle(tileId) && exp.wildCells.length > 0) exp.wildCells.pop();
  if (w >= 0 && !causesBattle(tileId)) {
    // 휴식 타일이 야생 칸에 놓이면 그 야생 전투는 다른 빈 칸으로 옮긴다
    const free = [];
    for (let c = Math.max(exp.pos + 1, 1); c < EX.loopTiles; c++) if (exp.slots[c] === null && !exp.wildCells.includes(c)) free.push(c);
    if (free.length > 0) exp.wildCells.push(free[nextInt(exp.rng, free.length)]!);
  }
  return { ok: true };
}

/** 놓은 타일 되돌리기 (GDD 18-4): 확정(출발·계속) 전에 놓은 타일을 칸에서 빼 손으로 돌려보낸다. 전투 타일이 대신했던 야생 전투는 그 칸으로 돌아온다(길을 걷는 중일 때만 — 바퀴 끝 팝업에서는 다음 바퀴 계획이 새로 짜인다) */
export function unplaceTile(exp: ExpeditionState, cell: number): PlaceResult {
  if (exp.phase !== 'moving' && exp.phase !== 'nest-choice') return { ok: false, reason: '지금은 되돌릴 수 없다' };
  if (!Number.isInteger(cell) || cell < 1 || cell >= EX.loopTiles) return { ok: false, reason: '슬롯이 없는 칸이다' };
  if (cell <= exp.pos) return { ok: false, reason: '지나간 칸이다' };
  const id = exp.slots[cell];
  if (id === null || id === undefined) return { ok: false, reason: '타일이 없는 칸이다' };
  exp.slots[cell] = null;
  exp.hand.push(id);
  if (exp.phase === 'moving' && causesBattle(id)) {
    const tileBattles = exp.slots.filter((t, c) => c >= 1 && t !== null && causesBattle(t)).length;
    if (exp.wildCells.length < Math.max(0, plannedBattles(exp.lap) - tileBattles)) exp.wildCells.push(cell);
  }
  return { ok: true };
}

/** 놓은 타일 옮기기 (GDD 18-4): from 칸의 타일을 to 칸(빈 칸)으로. 실패하면 아무것도 바꾸지 않는다 */
export function moveTile(exp: ExpeditionState, from: number, to: number): PlaceResult {
  if (from === to) return { ok: false, reason: '같은 칸이다' };
  const id = exp.slots[from];
  if (id === null || id === undefined) return { ok: false, reason: '타일이 없는 칸이다' };
  if (exp.slots[to] !== null && exp.slots[to] !== undefined) return { ok: false, reason: '이미 타일이 있다' };
  const before = { slots: [...exp.slots], hand: [...exp.hand], wild: [...exp.wildCells] };
  const u = unplaceTile(exp, from);
  const p = u.ok ? placeTile(exp, id, to) : u;
  if (!p.ok) {
    exp.slots = before.slots;
    exp.hand = before.hand;
    exp.wildCells = before.wild;
  }
  return p;
}

/** 놓은 타일 두 칸 맞바꾸기 (GDD 18-8): 둘 다 타일이 있는 칸이어야 한다. 야생 전투 칸 계산은 둘 다 이미 찬 칸이라 바뀌지 않는다 */
export function swapTiles(exp: ExpeditionState, a: number, b: number): PlaceResult {
  if (exp.phase !== 'moving' && exp.phase !== 'nest-choice') return { ok: false, reason: '지금은 바꿀 수 없다' };
  if (a === b) return { ok: false, reason: '같은 칸이다' };
  for (const c of [a, b]) {
    if (!Number.isInteger(c) || c < 1 || c >= EX.loopTiles) return { ok: false, reason: '슬롯이 없는 칸이다' };
    if (c <= exp.pos) return { ok: false, reason: '지나간 칸이다' };
    if (exp.slots[c] === null || exp.slots[c] === undefined) return { ok: false, reason: '타일이 없는 칸이다' };
  }
  const t = exp.slots[a]!;
  exp.slots[a] = exp.slots[b]!;
  exp.slots[b] = t;
  return { ok: true };
}

/** 손의 타일과 놓은 타일 교체 (GDD 18-8): cell 의 타일은 손으로, 손의 tileId 는 그 칸으로. 실패하면 아무것도 바꾸지 않는다 */
export function swapWithHand(exp: ExpeditionState, tileId: string, cell: number): PlaceResult {
  const old = exp.slots[cell];
  if (old === null || old === undefined) return { ok: false, reason: '타일이 없는 칸이다' };
  if (old === tileId) return { ok: false, reason: '같은 타일이다' };
  if (!exp.hand.includes(tileId)) return { ok: false, reason: '손에 없는 타일이다' };
  const before = { slots: [...exp.slots], hand: [...exp.hand], wild: [...exp.wildCells], rng: structuredClone(exp.rng) };
  const u = unplaceTile(exp, cell);
  const p = u.ok ? placeTile(exp, tileId, cell) : u;
  if (!p.ok) {
    exp.slots = before.slots;
    exp.hand = before.hand;
    exp.wildCells = before.wild;
    exp.rng = before.rng;
  }
  return p;
}

/**
 * 카드 배치 단계 (GDD 17-1): 원정이 시작되기 직전에 덱의 타일을 손에 쥐어 12칸 길에 놓게 한다.
 * 덱은 보상으로 뽑을 타일 목록이기도 해서 그대로 두고, 손에만 사본을 쥔다. 단계가 끝나면 finishPlanning 이 손을 비운다.
 */
/** 사냥터 고르기 (GDD 24-2): 배치 단계(출발 전)에서만. 적·먹이는 전투 때 뽑으므로 시드·길 계획은 그대로 */
export function chooseGround(exp: ExpeditionState, groundId: string): void {
  if (exp.phase !== 'moving' || exp.pos !== 0 || exp.lap !== 1 || exp.elapsedSeconds !== 0) throw new Error('원정 시작 전에만 사냥터를 고를 수 있다');
  if (!isGroundId(groundId)) throw new Error(`알 수 없는 사냥터: ${groundId}`);
  exp.groundId = groundId;
}

/** 원정 난이도 ★ 고르기 (GDD 32-1 4번): 배치 단계(출발 전)에서만. 스토리 화는 못 바꾼다. unlockedMax 를 주면 그보다 높은 ★ 는 거부한다 */
export function chooseDifficulty(exp: ExpeditionState, star: number, unlockedMax?: number): void {
  if (exp.phase !== 'moving' || exp.pos !== 0 || exp.lap !== 1 || exp.elapsedSeconds !== 0) throw new Error('원정 시작 전에만 난이도를 고를 수 있다');
  if (exp.story) throw new Error('스토리 화의 난이도는 정해져 있다');
  const s = clampDifficulty(star);
  if (s !== star) throw new Error(`알 수 없는 난이도: ${star}`);
  if (unlockedMax !== undefined && s > unlockedMax) throw new Error(`아직 열리지 않은 난이도: ${star}`);
  exp.difficulty = s;
}

/** 길에 놓인 타일 수 (0번 둥지 칸 제외) */
export function placedCount(exp: Pick<ExpeditionState, 'slots'>): number {
  return exp.slots.filter((s, c) => c >= 1 && s !== null).length;
}

/** 배치 단계 시작: 손 = 가져온 타일 전부(C.140 부터 가진 타일 전부). limit 를 주면 그 칸 수까지만 놓을 수 있다 (GDD 85장 11번 8칸) */
export function beginPlanning(exp: ExpeditionState, limit?: number): void {
  if (exp.phase !== 'moving' || exp.pos !== 0 || exp.lap !== 1 || exp.elapsedSeconds !== 0) throw new Error('원정 시작 전에만 배치 단계를 열 수 있다');
  exp.hand = [...exp.deck];
  if (limit !== undefined) exp.planLimit = Math.max(0, Math.floor(limit));
  else delete exp.planLimit;
}

/** 배치 단계 끝: 놓지 않은 타일은 버린다(어차피 보유 타일이라 잃지 않는다). 손은 원정 중 획득한 타일 전용이 된다.
 *  C.140: 보상으로 뽑힐 타일(deck) = 놓은 타일 (옛 '8장 덱'과 같은 역할 — 하나도 안 놓았으면 가진 타일 전부 그대로). 놓은 칸 수를 돌려준다 */
export function finishPlanning(exp: ExpeditionState): number {
  exp.hand = [];
  delete exp.planLimit;
  const placed = exp.slots.filter((s, c): s is string => c >= 1 && s !== null);
  if (placed.length > 0) exp.deck = placed;
  return placed.length;
}

/**
 * 원정이 끝났을 때 놓지 않고 남은 획득 타일 (GDD 17-1): 다음 원정 덱으로 보관한다. 패배로 잃은 타일(마지막 바퀴 획득분)은 뺀다.
 * 호출하는 쪽(game.ts)이 덱 상한·보유 수량을 지켜 덱에 넣는다
 */
export function unplacedKept(exp: ExpeditionState): string[] {
  if (exp.phase !== 'ended') throw new Error('원정이 끝나지 않았다');
  const lost = [...summarize(exp).lost];
  const kept: string[] = [];
  for (const id of exp.hand) {
    const li = lost.indexOf(id);
    if (li >= 0) lost.splice(li, 1);
    else kept.push(id);
  }
  return kept;
}

function endExpedition(exp: ExpeditionState, outcome: 'returned' | 'defeated', reason: EndReason): StepEvent {
  exp.phase = 'ended';
  exp.absorbOffer = null;
  if (outcome === 'defeated') {
    // 마지막 바퀴에서 얻은 특성·계통 진행도를 잃는다: 보유에서 빼고 슬롯은 바퀴 시작 때로 되돌린다
    const lostIds = new Set(exp.acquiredTraits.filter((a) => a.lap === exp.lap).map((a) => a.traitId));
    exp.build.owned = exp.build.owned.filter((id) => !lostIds.has(id));
    exp.build.slots = exp.lapStartSlots.map((id) => (id !== null && exp.build.owned.includes(id) ? id : null));
  }
  exp.outcome = outcome;
  exp.endReason = reason;
  exp.pending = null;
  exp.eventPending = null;
  exp.queuedBattle = null;
  exp.draft = null;
  return { kind: 'ended', outcome, reason };
}

export interface ExpeditionSummary {
  outcome: 'returned' | 'defeated';
  /** 보존되는 획득 타일 */
  kept: string[];
  /** 잃는 타일: 패배 시 마지막 바퀴에서 얻은 것만 */
  lost: string[];
  /** 보존되는 / 잃는 새 특성 */
  keptTraits: string[];
  lostTraits: string[];
  /** 지킨 / 잃은 먹이 전리품 (GDD 23-1, 패배 시 마지막 바퀴 것만 잃는다) */
  keptFood: FoodId[];
  lostFood: FoodId[];
  /** 지킨 골드(번 것 − 쓴 것) / 잃은 골드 (패배 시 마지막 바퀴에 번 것) (C.57) */
  keptGold: number;
  lostGold: number;
  laps: number;
}

export function summarize(exp: ExpeditionState): ExpeditionSummary {
  if (exp.phase !== 'ended' || !exp.outcome) throw new Error('원정이 끝나지 않았다');
  const lostEntries = exp.outcome === 'defeated' ? exp.acquired.filter((a) => a.lap === exp.lap) : [];
  const keptEntries = exp.acquired.filter((a) => !lostEntries.includes(a));
  const lostTraitEntries = exp.outcome === 'defeated' ? exp.acquiredTraits.filter((a) => a.lap === exp.lap) : [];
  const loot = exp.foodLoot ?? [];
  const lostFoodEntries = exp.outcome === 'defeated' ? loot.filter((a) => a.lap === exp.lap) : [];
  return {
    outcome: exp.outcome,
    kept: keptEntries.map((a) => a.tileId),
    lost: lostEntries.map((a) => a.tileId),
    keptTraits: exp.acquiredTraits.filter((a) => !lostTraitEntries.includes(a)).map((a) => a.traitId),
    lostTraits: lostTraitEntries.map((a) => a.traitId),
    keptFood: loot.filter((a) => !lostFoodEntries.includes(a)).map((a) => a.food),
    lostFood: lostFoodEntries.map((a) => a.food),
    ...goldSplit(exp),
    // 도달 바퀴: 둥지 칸 귀환 = 마친 바퀴, 패배·스토리 목표 달성(바퀴 도중 귀환) = 지금 바퀴 (C.68: 1바퀴 도중 클리어가 0 으로 보이던 것)
    laps: exp.outcome === 'returned' && exp.endReason !== 'story-clear' && exp.endReason !== 'tutorial-clear' ? exp.lapsCompleted : exp.lap,
  };
}

function goldSplit(exp: ExpeditionState): { keptGold: number; lostGold: number } {
  const loot = exp.goldLoot ?? [];
  const lost = exp.outcome === 'defeated' ? loot.filter((g) => g.lap === exp.lap && g.amount > 0) : [];
  const lostGold = lost.reduce((a, g) => a + g.amount, 0);
  return { keptGold: loot.reduce((a, g) => a + g.amount, 0) - lostGold, lostGold };
}

/** 런 로그 RunRecord (GDD 9장): 바퀴 수, 귀환/패배, 획득·상실 목록 */
export function buildRunRecord(exp: ExpeditionState): RunRecord {
  const s = summarize(exp);
  return {
    runId: exp.runId,
    laps: s.laps,
    outcome: s.outcome,
    gained: s.kept,
    lost: s.lost,
    gainedTraits: s.keptTraits,
    lostTraits: s.lostTraits,
    riskPeak: exp.riskPeak,
    breakthrough: exp.breakthrough !== null,
    endReason: exp.endReason!,
    seed: exp.seed,
    factionId: exp.factionId,
    groundId: exp.groundId,
    difficulty: exp.difficulty,
    streak: exp.streak,
    synergies: (exp.variantLog?.synergies ?? []).map((x) => x.id),
    mutations: (exp.variantLog?.mutations ?? []).map((x) => ({ ...x })),
    events: (exp.variantLog?.events ?? []).map((x) => ({ ...x })),
    drafts: (exp.variantLog?.drafts ?? []).map((x) => ({ ...x })),
    gold: s.keptGold,
    ...(exp.story ? { story: { chapterId: exp.story.chapterId, episodeId: exp.story.episodeId, cleared: exp.story.cleared } } : {}),
    ...(exp.tutorial ? { tutorial: true } : {}),
  };
}

/** 이 종족이 쓸 수 있는 타일만 덱에 넣을 수 있다 (스킨 이름이 있는 타일, 이벤트 타일 제외 — 드래프트로만) */
export function deckOptions(factionId: string): string[] {
  return deckTilesFor(factionId).map((t) => t.id);
}
