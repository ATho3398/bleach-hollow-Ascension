// 게임 상태와 세이브. 런 로그(GDD 9장)는 처음부터 저장 구조에 들어 있다 (CLAUDE.md 규칙 4)

import { BALANCE_VERSION } from './config/balance';
import { BALANCE } from './config/balance';
import { completedElements, gainTrait, newBuild, type BuildState } from './engine/absorb';
import { applyExpeditionEnd, doNestAction, newNest, type NestState } from './engine/nest';
import { buildRunRecord, restoreExpedition, summarize, unplacedKept, type ExpeditionSnapshot, type ExpeditionState, type RestoreResult, type StorySettlement } from './engine/expedition';
export type { StorySettlement } from './engine/expedition';
import { canEvolve, cloneEvolution, evolve, newEvolution, nextStageSeed, playerElementsOf, recordEvolutionBreakthrough, type EvolutionState, type EvolveResult } from './engine/evolution';
import { tryGetForm } from './data/evolution';
import { migrateBuild, migrateEvolution } from './saveLegacy';
import { emptyLegacyMatches, emptyRunLog, emptySlotLog, type BattleRecord, type FusionCharacterSummary, type FusionRecord, type RankBattleRecord, type RebirthRecord, type RunLog, type SlotLog } from './engine/runLog';
import { applyChallenge, canChallenge, newRankState, rankOf, resetRankKeepHistory, sanitizeRankState, type ChallengeResult, type RankState } from './engine/rank';
import { RANK_HOLDERS } from './data/ranks';
import { FACTIONS } from './data/factions';
import { TRANSCENDENTS, tryGetTranscendent, type TranscendentDef } from './data/transcendents';
import { allTranscendentsOwned, conditionMet, decideTranscendent, slotStatBonus, type FusionInput } from './engine/transcend';
import { buildBattleRecord, type CombatState } from './engine/combat';
import { deckTilesFor, getTile, upgradeIdOf } from './data/tiles';
import { TITLES } from './data/titles';
import { newHelpState, sanitizeHelpState, type HelpState } from './engine/tutorial';
import { unlockTitles, type TitleTrigger, type UnlockedTitle } from './engine/titles';
import type { TitleDef } from './data/schema';
import { PATCH_LABEL } from './version';
import { addFood, newFoodStock, sanitizeFoodStock, settleFood, takeFood, type FoodSettlement, type FoodStock } from './engine/food';
import type { FoodId } from './engine/faction';
import { TUTORIAL_GOALS, type TutorialGoalDef } from './data/tutorials';
import { newlyAchieved } from './engine/tutorialGoals';
import { DEX_MILESTONES, newlyReachedMilestones, type DexMilestoneDef } from './data/dexRewards';
import { DEFAULT_GROUND_ID } from './data/grounds';
import { canWear } from './data/skins';
import { applyAbsenceHunger } from './engine/nest';
import { canRebirth, inheritableTraits, newRebirthState, nextCarry, sanitizeRebirth, startingCarry, type RebirthState } from './engine/rebirth';
import { addTrainingTicket, applyTraining, newTrainingState, sanitizeTraining, type TrainingGameId, type TrainingOutcome, type TrainingState } from './engine/training';
import { chapterContent, episodeKey, STORY_CHAPTERS } from './data/story';
import { isBossId } from './data/bosses';
import { getCosmetic, skinItemId, WEAR_CATEGORIES, type WearCategory } from './data/shop';

/** 세이브 구조를 바꾸면 올리고 마이그레이션을 추가한다 */
export const SAVE_FORMAT_VERSION = 25;

/** 이어하기가 바로 열 화면 키 (GDD 19-3, 형식 13). 원정 중이면 'expedition'(전투 중이었으면 14-1 대로 전투 직전), 아니면 'room' */
export type ScreenKey = 'room' | 'expedition';
export const SCREEN_KEYS: readonly ScreenKey[] = ['room', 'expedition'];

export interface SaveMeta {
  format: number;
  balanceVersion: number;
  /** 세이브를 시작한 패치 (docs/dev-log.md 소절) */
  startPatch: string;
}

export function newSaveMeta(): SaveMeta {
  return { format: SAVE_FORMAT_VERSION, balanceVersion: BALANCE_VERSION, startPatch: PATCH_LABEL };
}

export interface SaveData {
  meta: SaveMeta;
  /** 선택한 종족 id (src/data/factions). 게임 시작 때 고른다 (GDD 12장) */
  factionId: string;
  /** 둥지 상태: 허기·컨디션 (GDD 7장) */
  nest: NestState;
  /** 흡수 빌드: 가진 특성과 슬롯·장착 순서 (GDD 4장). 속성·특성은 임시 데이터 */
  build: BuildState;
  /** 진화 상태 (GDD 20-5, 형식 14): 단계·진화 경로·이 단계 걸음/흡수 속성/행동 기록·노력치·고유 특성. 수치·데이터는 임시 */
  evolution: EvolutionState;
  /** 진화체 도감 해금 목록 (진화체 id). 한 번 진화한 진화체가 해금된다 (C.11) */
  formDex: string[];
  /** 보유 타일 수량과 원정에 가져갈 덱 (GDD 6장). 시작 구성은 임시 */
  tiles: TileStock;
  /** 히든 조건용 영구 기록 */
  runLog: RunLog;
  /** 칭호 해금 목록 (C.14, 형식 8): 한 번 해금하면 영구. 해금 시각·시점·스냅샷 포함 */
  titles: UnlockedTitle[];
  /** 원정 중간 저장 (GDD 14-1, C.13). 완료된 런 로그와 섞이지 않는 별도 영역. 원정이 끝나면(귀환·패배) 비운다 */
  activeExpedition: ExpeditionSnapshot | null;
  /** 도움말 플래그 (C.19, 형식 11): 첫 플레이 튜토리얼을 봤는가. 이전 세이브는 false 로 올려 한 번 보여 준다 */
  help: HelpState;
  /** 마지막으로 보던 화면 키 (GDD 19-3, 형식 13). 화면 키만 저장하고 화면 상태는 저장하지 않는다(원정 지점은 activeExpedition 이 갖고 있다) */
  lastScreen: ScreenKey;
  /** 등급전 상태 (GDD 21장, 형식 15): 번호 사다리·재도전 대기·전적 + 등급 이력(history, 환생해도 유지할 자리 — 22-2 해방 자격) */
  rank: RankState;
  /** 슬롯 공유 자원 (GDD 22-3, 형식 15·16·17): 두 트랙이 함께 쓰는 재화 — 영혼 결정, 먹이(23-1), 골드(23-4)·영옥(25-1), 튜토리얼 보상 수령 기록(23-3), 도감 보상 수령 기록(24-3) */
  shared: SharedState;
  /** 마지막 접속 시각(ms, GDD 24-1, 형식 17): 저장할 때마다 갱신. 다시 열 때 이 시각부터 꺼 둔 시간만큼 허기가 오른다. 시계를 되돌려도 줄지 않는다 */
  lastSeenAt: number;
  /** 해방 수련 (GDD 22-4·22-5, 형식 18): 수련치·수련권(이 트랙의 원정 귀환으로만)·종목별 승리 수·완료 여부. 완료는 등급 이력처럼 환생해도 유지할 자리 */
  training: TrainingState;
  /** 입고 있는 스킨 id (GDD 25-1·26-5, 형식 19). null = 진화체 그림 그대로. 이 종족이 입을 수 있는 스킨이 아니면 null 로 고친다 */
  skin: string | null;
  /** 환생 (GDD 22-1·22-7, 형식 20): 환생 횟수·누적 계승 노력치. 환생해도 남는다 */
  rebirth: RebirthState;
  /** 착용한 꾸밈 (GDD 25-9, 형식 24): 분류(오라·색조·발밑·공격 이펙트 색·블록 바·기기 껍데기·이름표 테)마다 품목 id 하나. 스킨은 skin. 보유(shared.cosmetics)한 것만 */
  wear: WearState;
  /** 스토리 진행 (GDD 25-4, 형식 22): 트랙(종족 id)마다 깬 화와 보상을 받은 장. 환생해도 남는다 */
  story: Record<string, StoryProgress>;
  /** 보스 도감 (GDD 25-3, 형식 22): 보스 id → 처치 수·첫 처치 시각. 세이브 하나에 하나(도감처럼 트랙 구분 없음) */
  bossDex: Record<string, BossDexEntry>;
  /** 지금 키우지 않는 캐릭터 트랙 (GDD 22-3, 형식 23). 슬롯 = 캐릭터 트랙 최대 2(지금 트랙은 위 평평한 필드 TRACK_KEYS, 나머지는 여기) + 공유 + 붕옥 + 초월체 도감.
   *  트랙 전환은 둘을 맞바꾼다(switchTrack). 형식을 올릴 때 트랙 필드를 바꾸면 여기 트랙도 같이 올린다(forEachTrack) */
  otherTracks: TrackData[];
  /** 투트랙 개방 알림 (형식 23): 새로 열린 트랙 종족 id — 방에 들어가면 한 번 알리고 비운다 */
  trackNotice: string | null;
  /** 붕옥 (GDD 22-3, 형식 23): 탭 개방·1단계 게이지·해방·2단계 게이지 */
  hogyoku: HogyokuState;
  /** 초월체 도감 (GDD 22-3, 형식 23): 합체로 얻은 초월체(전시). 슬롯 단위, 합체해도 남는다 */
  transcendentDex: TranscendentEntry[];
  /** 슬롯 단위 런 로그 (GDD 9장·22-3, 형식 23): 합체·트랙 개방 기록 */
  slotLog: SlotLog;
  /** 기기 기록 (GDD 27장, 형식 25): 다마고치 모드 뒷면 기록 판 — 세이브를 만든 시각(처음 시작한 날·제조 번호)·켜 두고 논 시간. 슬롯 단위 */
  machine: MachineRecord;
}

export interface MachineRecord {
  /** 세이브를 만든 시각(ms). 형식 25 이전 세이브는 기록에 남은 가장 이른 시각 */
  createdAt: number;
  /** 화면을 켜 두고 논 시간(ms). 형식 25 이전은 0부터 센다 */
  playMs: number;
}

/** 트랙 하나의 꾸밈 착용 (GDD 25-9): 분류 → 품목 id. 없는 분류 = 기본 */
export type WearState = Partial<Record<WearCategory, string>>;

/** 캐릭터 트랙 하나가 가진 것 (GDD 22-3): 키우기(진화·특성·등급·환생·원정·수련)는 각자. 나머지 SaveData 필드는 슬롯 공유 */
export const TRACK_KEYS = ['factionId', 'nest', 'build', 'evolution', 'runLog', 'activeExpedition', 'lastScreen', 'rank', 'training', 'skin', 'rebirth', 'wear'] as const;
export type TrackKey = (typeof TRACK_KEYS)[number];
export type TrackData = Pick<SaveData, TrackKey> & {
  /** 이 트랙에서 떠난 시각(ms): 돌아오면 그동안의 허기가 오른다 (GDD 24-1 과 같은 계산) */
  parkedAt: number;
};

export interface HogyokuState {
  /** 붕옥 탭이 열렸나 (모든 트랙이 5단계에 한 번씩 닿으면, 영구) */
  tabOpen: boolean;
  /** 탭이 열렸다는 알림을 아직 안 보였나 */
  tabNotice: boolean;
  /** 1단계에 먹인 영혼 결정 (liberateCost 가 차면 해방할 수 있다) */
  fed: number;
  liberated: boolean;
  liberatedAt: number | null;
  /** 2단계(합체)에 먹인 영혼 결정. 합체하면 0 */
  fusionFed: number;
}

export interface TranscendentEntry {
  id: string;
  at: number;
  /** 몇 번째 합체로 얻었나 */
  fusionIndex: number;
}

export function newHogyokuState(): HogyokuState {
  return { tabOpen: false, tabNotice: false, fed: 0, liberated: false, liberatedAt: null, fusionFed: 0 };
}

/** 한 트랙의 스토리 진행: 깬 화(키 "ch1/ep2" → 첫 클리어 시각·클리어 횟수), 장 클리어 보상을 받은 장 id */
export interface StoryProgress {
  cleared: Record<string, { firstAt: number; clears: number }>;
  chapters: string[];
}

export interface BossDexEntry {
  kills: number;
  firstAt: number;
}

export function newStoryProgress(): StoryProgress {
  return { cleared: {}, chapters: [] };
}

/** 저장된 스토리 진행 정리 (깨진 값 보정) */
export function sanitizeStory(raw: unknown): Record<string, StoryProgress> {
  const out: Record<string, StoryProgress> = {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return out;
  for (const [fid, v] of Object.entries(raw as Record<string, unknown>)) {
    const r = (typeof v === 'object' && v !== null ? v : {}) as Partial<Record<keyof StoryProgress, unknown>>;
    const cleared: StoryProgress['cleared'] = {};
    if (typeof r.cleared === 'object' && r.cleared !== null && !Array.isArray(r.cleared)) {
      for (const [k, c] of Object.entries(r.cleared as Record<string, unknown>)) {
        const e = (c ?? {}) as { firstAt?: unknown; clears?: unknown };
        if (typeof k === 'string' && k.includes('/')) cleared[k] = { firstAt: nonNegInt(e.firstAt), clears: Math.max(1, nonNegInt(e.clears)) };
      }
    }
    const chapters = Array.isArray(r.chapters) ? [...new Set(r.chapters.filter((x): x is string => typeof x === 'string'))] : [];
    out[fid] = { cleared, chapters };
  }
  return out;
}

export function sanitizeBossDex(raw: unknown): Record<string, BossDexEntry> {
  const out: Record<string, BossDexEntry> = {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return out;
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    const e = (v ?? {}) as { kills?: unknown; firstAt?: unknown };
    if (isBossId(id) && nonNegInt(e.kills) > 0) out[id] = { kills: nonNegInt(e.kills), firstAt: nonNegInt(e.firstAt) };
  }
  return out;
}

/** 지금 트랙의 스토리 진행 (없으면 만든다) */
export function storyProgressOf(save: Pick<SaveData, 'story' | 'factionId'>): StoryProgress {
  return (save.story[save.factionId] ??= newStoryProgress());
}

/** 장이 열렸나 (GDD 25-4): 진화 단계 + 내용이 있는 장 */
export function chapterOpen(save: Pick<SaveData, 'evolution' | 'factionId'>, chapterId: string): boolean {
  const c = STORY_CHAPTERS.find((x) => x.id === chapterId);
  return !!c && save.evolution.tierIndex >= c.unlockTierIndex && chapterContent(save.factionId, chapterId) !== null;
}

/** 화가 열렸나 (GDD 25-7): 장이 열려 있고, 첫 화이거나 바로 앞 화를 깼다 (순서대로 열림) */
export function episodeOpen(save: Pick<SaveData, 'evolution' | 'factionId' | 'story'>, chapterId: string, episodeId: string): boolean {
  if (!chapterOpen(save, chapterId)) return false;
  const eps = chapterContent(save.factionId, chapterId)!.episodes;
  const i = eps.findIndex((e) => e.id === episodeId);
  if (i < 0) return false;
  return i === 0 || storyProgressOf(save as SaveData).cleared[episodeKey(chapterId, eps[i - 1]!.id)] !== undefined;
}



/** 튜토리얼 보상 수령 1건 (GDD 23-3) */
export interface TutorialClaim {
  goalId: string;
  at: number;
}

export interface SharedState {
  /** 영혼 결정: 강적 처치 +1, 등급전 승리 +3, 환생 +10. 수치 provisional */
  soulCrystals: number;
  /** 먹이 종류별 보유 개수 (GDD 23-1, 형식 16). 상한 9, 시작 간식 5·보통 3 */
  food: FoodStock;
  /** 일반 재화 '골드' (GDD 23-4, 형식 16, v5.11 옛 이름 영전 — 키는 그대로): 원정 전투 승리·보물·갈림길로 얻고 원정 상인에게 쓴다(C.57, GDD 25-5). 상점은 준비 중 */
  tradeCoins: number;
  /** 꾸밈 재화 '영옥' (GDD 25-1 v5.11, 형식 17): 한 번만 받는 달성 보상(도감 이정표 등)에서만 */
  jade: number;
  /** 튜토리얼 보상 수령 기록 (GDD 23-3, 형식 16): 트랙(종족 id)마다 받은 목표 */
  tutorials: Record<string, TutorialClaim[]>;
  /** 도감 보상 수령 기록 (GDD 24-3, 형식 17): 받은 이정표 id. 도감은 세이브 하나에 하나라 트랙 구분 없음 */
  dexRewards: TutorialClaim[];
  /** 다시 뽑기권 (GDD 25-9, 형식 24): 상점에서 산 장수(상한 3). 흡수 화면에서 1장씩 */
  rerollTickets: number;
  /** 산 타일 덱 칸 (형식 24): 0~2, 영구. 원정 덱 = 기본 8 + 이 값 */
  deckSlots: number;
  /** 보유한 꾸밈 품목 id (형식 24, 스킨 = skin-<id>). 두 트랙이 같이 쓴다 — 착용은 트랙마다(wear·skin) */
  cosmetics: string[];
}

export function newSharedState(): SharedState {
  return { soulCrystals: 0, food: newFoodStock(), tradeCoins: 0, jade: 0, tutorials: {}, dexRewards: [], rerollTickets: 0, deckSlots: 0, cosmetics: [] };
}

const nonNegInt = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);

/** 저장된 공유 자원을 정리한다 (모르는 값·음수·깨진 기록 보정) */
export function sanitizeShared(raw: unknown): SharedState {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<Record<keyof SharedState, unknown>>;
  const tutorials: Record<string, TutorialClaim[]> = {};
  if (typeof r.tutorials === 'object' && r.tutorials !== null && !Array.isArray(r.tutorials)) {
    for (const [fid, list] of Object.entries(r.tutorials as Record<string, unknown>)) {
      if (Array.isArray(list)) tutorials[fid] = sanitizeClaims(list);
    }
  }
  const dexRewards = Array.isArray(r.dexRewards) ? sanitizeClaims(r.dexRewards) : [];
  const SX = BALANCE.provisional.shop;
  const cosmetics = Array.isArray(r.cosmetics) ? [...new Set(r.cosmetics.filter((id): id is string => typeof id === 'string' && getCosmetic(id) !== undefined))] : [];
  return {
    soulCrystals: nonNegInt(r.soulCrystals), food: sanitizeFoodStock(r.food), tradeCoins: nonNegInt(r.tradeCoins), jade: nonNegInt(r.jade), tutorials, dexRewards,
    rerollTickets: Math.min(SX.rerollMax, nonNegInt(r.rerollTickets)), deckSlots: Math.min(SX.deckSlotPrices.length, nonNegInt(r.deckSlots)), cosmetics,
  };
}

/** 수령 기록 목록 정리: 깨진 항목·중복 id 를 버린다 */
function sanitizeClaims(list: unknown[]): TutorialClaim[] {
  const seen = new Set<string>();
  return list.filter((c): c is TutorialClaim => {
    const ok = typeof c === 'object' && c !== null && typeof (c as TutorialClaim).goalId === 'string' && !seen.has((c as TutorialClaim).goalId);
    if (ok) seen.add((c as TutorialClaim).goalId);
    return ok;
  }).map((c) => ({ goalId: c.goalId, at: typeof c.at === 'number' ? c.at : 0 }));
}

/** 둥지에서 먹이 주기 (GDD 23-1): 그 먹이가 있어야 먹일 수 있고, 하나 쓴다. 없으면 false (아무것도 바뀌지 않는다) */
export function feedNest(save: SaveData, food: FoodId): boolean {
  if (!takeFood(save.shared.food, food)) return false;
  doNestAction(save.nest, 'feed', food);
  return true;
}

/** 튜토리얼 보상 1건의 실제 지급량 (먹이는 상한까지만) */
export interface TutorialGrant {
  goal: TutorialGoalDef;
  food: [FoodId, number][];
  soulCrystals: number;
  /** 영옥 (GDD 25-9: 목표마다 +1) */
  jade: number;
}

/** 지금 트랙(종족)에서 새로 이룬 튜토리얼 목표를 판정해 보상을 준다 (GDD 23-3). 자동 판정·자동 지급 — 화면은 돌려준 목록으로 토스트를 띄운다.
 *  기존 세이브는 처음 부를 때 이미 이룬 목표를 한꺼번에 받는다 */
export function claimTutorialGoals(save: SaveData, nowMs: number = Date.now(), defs: readonly TutorialGoalDef[] = TUTORIAL_GOALS): TutorialGrant[] {
  const claims = (save.shared.tutorials[save.factionId] ??= []);
  const fresh = newlyAchieved(defs, claims.map((c) => c.goalId), {
    factionId: save.factionId, tutorialSeen: save.help.tutorialSeen, runLog: save.runLog, tierIndex: save.evolution.tierIndex, everRanked: save.rank.history.everRanked, trainingCompleted: save.training.completed, rebirths: save.rebirth.count,
  });
  return fresh.map((goal) => {
    claims.push({ goalId: goal.id, at: nowMs });
    const food: [FoodId, number][] = [];
    for (const [id, n] of Object.entries(goal.reward.food ?? {}) as [FoodId, number][]) food.push([id, addFood(save.shared.food, id, n)]);
    const soulCrystals = goal.reward.soulCrystals ?? 0;
    save.shared.soulCrystals += soulCrystals;
    // 영옥 (GDD 25-9): 목표 하나마다 +1 (기존 보상은 그대로)
    const jade = BALANCE.provisional.shop.tutorialJade;
    save.shared.jade += jade;
    return { goal, food, soulCrystals, jade };
  });
}

/** 도감 보상 1건의 실제 지급량 (먹이는 상한까지만) */
export interface DexGrant {
  milestone: DexMilestoneDef;
  food: [FoodId, number][];
  jade: number;
}

/** 도감 등록 수 (GDD 24-3): 진화체 도감 = 해금한 진화체, 칭호 도감 = 해금한 칭호 */
export function dexCounts(save: Pick<SaveData, 'formDex' | 'titles'>): { forms: number; titles: number } {
  return { forms: save.formDex.length, titles: save.titles.length };
}

/** 도감 등록 수가 새 이정표에 닿았으면 보상을 준다 (GDD 24-3, 튜토리얼 보상과 같은 틀). 기존 세이브는 처음 부를 때 이미 닿은 이정표를 한꺼번에 받는다 */
export function claimDexRewards(save: SaveData, nowMs: number = Date.now(), defs: readonly DexMilestoneDef[] = DEX_MILESTONES): DexGrant[] {
  const claims = save.shared.dexRewards;
  const fresh = newlyReachedMilestones(defs, claims.map((c) => c.goalId), dexCounts(save));
  return fresh.map((milestone) => {
    claims.push({ goalId: milestone.id, at: nowMs });
    const food: [FoodId, number][] = [];
    for (const [id, n] of Object.entries(milestone.reward.food ?? {}) as [FoodId, number][]) food.push([id, addFood(save.shared.food, id, n)]);
    const jade = milestone.reward.jade ?? 0;
    save.shared.jade += jade;
    return { milestone, food, jade };
  });
}

/** 다시 열 때 꺼 둔 동안의 허기 (GDD 24-1): 마지막 접속 시각부터. 원정 중간 저장이 있으면 오르지 않는다. 오른 양을 돌려주고 접속 시각을 지금으로(되돌린 시계면 그대로) */
export function applyAbsence(save: SaveData, nowMs: number = Date.now()): number {
  const gained = applyAbsenceHunger(save.nest, save.lastSeenAt, nowMs, save.activeExpedition != null);
  markSeen(save, nowMs);
  return gained;
}

/** 마지막 접속 시각 갱신 (저장할 때마다). 기기 시계를 되돌렸으면 앞선 값을 그대로 둔다 — 같은 시간을 두 번 세지 않는다 */
export function markSeen(save: SaveData, nowMs: number = Date.now()): void {
  if (!(save.lastSeenAt >= nowMs)) save.lastSeenAt = nowMs;
}

export interface TileStock {
  collection: Record<string, number>;
  /** 가져갈 덱: 타일 id 목록(중복 가능, 보유 수량 이내) */
  deck: string[];
}

export function newTileStock(): TileStock {
  return { collection: { ...BALANCE.provisional.expedition.startingCollection }, deck: [] };
}

export function newSaveData(factionId: string, nowMs: number = Date.now()): SaveData {
  return {
    meta: newSaveMeta(), ...newTrack(factionId, nowMs), formDex: [], tiles: newTileStock(), titles: [], help: newHelpState(), shared: newSharedState(), lastSeenAt: nowMs, story: {}, bossDex: {},
    otherTracks: [], trackNotice: null, hogyoku: newHogyokuState(), transcendentDex: [], slotLog: emptySlotLog(), machine: { createdAt: nowMs, playMs: 0 },
  };
}

/** 세이브 안 기록에서 가장 이른 시각(ms): 런 로그·칭호·슬롯 기록의 `at`/`…At` 숫자 (2001년 이후 값만). 없으면 null — 형식 25 마이그레이션의 "처음 시작한 날" */
export function earliestStamp(raw: unknown): number | null {
  let best: number | null = null;
  const walk = (v: unknown, key: string, depth: number): void => {
    if (depth > 6 || v === null || v === undefined) return;
    if (typeof v === 'number') {
      if ((key === 'at' || /At$/.test(key)) && Number.isFinite(v) && v > 1e12 && (best === null || v < best)) best = v;
      return;
    }
    if (Array.isArray(v)) for (const x of v) walk(x, key, depth + 1);
    else if (typeof v === 'object') for (const [k, x] of Object.entries(v as Record<string, unknown>)) walk(x, k, depth + 1);
  };
  const r = (isRec(raw) ? raw : {}) as Record<string, unknown>;
  for (const k of ['runLog', 'titles', 'slotLog', 'otherTracks', 'transcendentDex', 'lastSeenAt']) walk(r[k], k, 0);
  return best;
}

/** 기기 기록 보정 (깨진 값) */
export function sanitizeMachine(raw: unknown, fallbackAt: number): MachineRecord {
  const r = (isRec(raw) ? raw : {}) as Partial<Record<keyof MachineRecord, unknown>>;
  const at = typeof r.createdAt === 'number' && Number.isFinite(r.createdAt) && r.createdAt >= 0 ? r.createdAt : fallbackAt;
  return { createdAt: at, playMs: nonNegInt(r.playMs) };
}

/** 새 캐릭터 트랙 (1단계 완전 초기 상태). seedSalt 로 같은 시각에 만든 두 트랙의 단계 시드를 다르게 한다 */
export function newTrack(factionId: string, nowMs: number = Date.now(), seedSalt = 0): Omit<TrackData, 'parkedAt'> {
  return {
    factionId, nest: newNest(nowMs), build: newBuild(), evolution: newEvolution(nextStageSeed((Math.floor(nowMs) + seedSalt) >>> 0, 0)), runLog: emptyRunLog(), activeExpedition: null,
    lastScreen: 'room', rank: newRankState(), training: newTrainingState(), skin: null, rebirth: newRebirthState(), wear: {},
  };
}

/** 지금 트랙의 필드만 떼어 낸다 (같은 객체를 가리킨다) */
export function activeTrackOf(save: SaveData, nowMs: number = Date.now()): TrackData {
  const t = { parkedAt: nowMs } as TrackData;
  for (const k of TRACK_KEYS) (t as Record<string, unknown>)[k] = save[k];
  return t;
}

function putActiveTrack(save: SaveData, t: Omit<TrackData, 'parkedAt'>): void {
  for (const k of TRACK_KEYS) (save as unknown as Record<string, unknown>)[k] = (t as Record<string, unknown>)[k];
}

/** 슬롯의 모든 트랙 (지금 트랙 먼저) */
export function allTracks(save: SaveData): Pick<SaveData, TrackKey>[] {
  return [save, ...save.otherTracks];
}

/** 트랙마다 같은 일을 한다 (마이그레이션·보정): 지금 트랙(세이브 자신)과 쉬는 트랙 */
export function forEachTrack(save: SaveData, fn: (t: Pick<SaveData, TrackKey>) => void): void {
  for (const t of allTracks(save)) fn(t);
}

/** 이 트랙이 투트랙 개방 단계(5단계)에 한 번이라도 닿았나: 지금 단계·진화 기록·환생(5단계에서만 한다) */
export function trackReachedOpenTier(t: Pick<SaveData, 'evolution' | 'runLog' | 'rebirth'>): boolean {
  const at = BALANCE.provisional.twoTrack.openTierIndex;
  return t.evolution.tierIndex >= at || t.rebirth.count > 0 || t.runLog.tiers.evolutions.some((e) => e.toTier >= at);
}

/** 투트랙·붕옥 탭 개방 판정 (GDD 22-3): 어떤 트랙이 5단계에 닿았고 트랙 칸이 남았으면 아직 없는 종족(종족 데이터 순서에서 첫 번째) 트랙을 연다.
 *  모든 트랙(최대 수만큼)이 한 번씩 닿았으면 붕옥 탭을 연다(영구). 새로 연 트랙의 종족 id 를 돌려준다 (없으면 null) */
export function checkTrackOpen(save: SaveData, nowMs: number = Date.now(), factions: readonly { id: string }[] = FACTIONS): string | null {
  const TT = BALANCE.provisional.twoTrack;
  let opened: string | null = null;
  const tracks = allTracks(save);
  if (tracks.length < TT.maxTracks) {
    const by = tracks.find(trackReachedOpenTier);
    const next = factions.find((f) => !tracks.some((t) => t.factionId === f.id));
    if (by && next) {
      save.otherTracks.push({ ...newTrack(next.id, nowMs, 1), parkedAt: nowMs });
      save.slotLog.trackOpens.push({ at: nowMs, factionId: next.id, byFactionId: by.factionId });
      save.trackNotice = next.id;
      opened = next.id;
    }
  }
  const all = allTracks(save);
  if (!save.hogyoku.tabOpen && all.length >= TT.maxTracks && all.every(trackReachedOpenTier)) {
    save.hogyoku.tabOpen = true;
    save.hogyoku.tabNotice = true;
  }
  return opened;
}

/** 트랙 전환 (GDD 22-3): 지금 트랙을 쉬게 하고 그 종족 트랙을 꺼낸다. 쉬는 동안의 허기는 돌아올 때 오른다(원정 중간 저장이 있으면 오르지 않음).
 *  원정 중간 저장은 트랙마다 따로 남는다. 그 종족 트랙이 없으면 false */
export function switchTrack(save: SaveData, factionId: string, nowMs: number = Date.now()): boolean {
  const i = save.otherTracks.findIndex((t) => t.factionId === factionId);
  if (i < 0 || factionId === save.factionId) return false;
  const next = save.otherTracks[i]!;
  const parked = activeTrackOf(save, nowMs);
  const { parkedAt, ...track } = next;
  applyAbsenceHunger(track.nest, parkedAt, nowMs, track.activeExpedition != null);
  putActiveTrack(save, track);
  save.otherTracks.splice(i, 1, parked);
  return true;
}

/** 슬롯 보너스 (GDD 22-3): 붕옥 해방 +5% + 초월체 1종마다 +2%. 지금 캐릭터 둘 모두에 */
export function statBonusOf(save: Pick<SaveData, 'hogyoku' | 'transcendentDex'>): ReturnType<typeof slotStatBonus> {
  return slotStatBonus(save.hogyoku.liberated, save.transcendentDex.length);
}

/** 붕옥에 영혼 결정을 먹인다 (GDD 22-3): 해방 전에는 1단계, 해방 뒤에는 2단계 게이지에 — 모자란 만큼만(가진 만큼). 먹인 수를 돌려준다 */
export function feedHogyoku(save: SaveData): number {
  const HX = BALANCE.provisional.hogyoku;
  const h = save.hogyoku;
  if (!h.tabOpen) return 0;
  const key = h.liberated ? 'fusionFed' : 'fed';
  const cost = h.liberated ? HX.fusionCost : HX.liberateCost;
  const n = Math.max(0, Math.min(save.shared.soulCrystals, cost - h[key]));
  h[key] += n;
  save.shared.soulCrystals -= n;
  return n;
}

/** 붕옥 해방 (GDD 22-3): 1단계 게이지가 차면. 영구 */
export function liberateHogyoku(save: SaveData, nowMs: number = Date.now()): boolean {
  const h = save.hogyoku;
  if (!h.tabOpen || h.liberated || h.fed < BALANCE.provisional.hogyoku.liberateCost) return false;
  h.liberated = true;
  h.liberatedAt = nowMs;
  return true;
}

/** 이 트랙이 지금 등급 1위인가 (1위 번호는 등급 데이터의 맨 위 번호) */
export function trackIsTopRank(t: Pick<SaveData, 'rank'>): boolean {
  return rankOf(t.rank) === RANK_HOLDERS[0]!.rank;
}

/** 합체 판정에 쓰는 한 캐릭터의 상태 */
export function fusionInputOf(t: Pick<SaveData, 'evolution' | 'rebirth'>): FusionInput {
  const form = t.evolution.formId ? tryGetForm(t.evolution.formId) : undefined;
  return { rebirths: t.rebirth.count, hidden: form?.hidden === true, elements: playerElementsOf(t.evolution), category: form?.label.category ?? 'mixed' };
}

export type FusionBlock = 'tab' | 'liberation' | 'tracks' | 'gauge' | 'rank' | 'expedition' | 'complete';

/** 합체할 수 있나 (GDD 22-3): 붕옥 해방 + 2단계 게이지 가득 + 모든 트랙 등급 1위 + 원정 중간 저장 없음 + 아직 못 모은 초월체. 막힌 이유를 모두 돌려준다 */
export function fusionGate(save: SaveData): { ok: boolean; missing: FusionBlock[] } {
  const h = save.hogyoku;
  const tracks = allTracks(save);
  const missing: FusionBlock[] = [];
  if (!h.tabOpen) missing.push('tab');
  if (!h.liberated) missing.push('liberation');
  if (tracks.length < BALANCE.provisional.twoTrack.maxTracks) missing.push('tracks');
  if (h.fusionFed < BALANCE.provisional.hogyoku.fusionCost) missing.push('gauge');
  if (!tracks.every(trackIsTopRank)) missing.push('rank');
  if (tracks.some((t) => t.activeExpedition != null)) missing.push('expedition');
  if (allTranscendentsOwned(save.transcendentDex.map((x) => x.id))) missing.push('complete');
  return { ok: missing.length === 0, missing };
}

/** 합체 미리보기 (GDD 22-3 "이 조합이면 ○○"): 지금 두 캐릭터 상태로 정해질 초월체와 조건이 맞았는지. 다 모았으면 def null */
export function fusionPreview(save: SaveData): { def: TranscendentDef | null; matched: boolean; inputs: FusionInput[] } {
  const inputs = allTracks(save).map(fusionInputOf);
  const owned = save.transcendentDex.map((x) => x.id);
  const def = decideTranscendent(inputs, owned);
  return { def, matched: def !== null && conditionMet(def.condition, inputs), inputs };
}

export type FusionResult =
  | { ok: true; def: TranscendentDef; record: FusionRecord; jade: number; completed: boolean }
  | { ok: false; missing: FusionBlock[] };

function summaryOf(t: Pick<SaveData, TrackKey>): FusionCharacterSummary {
  const inp = fusionInputOf(t);
  const ev = t.evolution.ev;
  return {
    factionId: t.factionId, tierIndex: t.evolution.tierIndex, formId: t.evolution.formId, elements: [...inp.elements], category: inp.category, hidden: inp.hidden, rebirths: t.rebirth.count,
    rank: rankOf(t.rank), runs: t.runLog.runs.length, elitesDefeated: t.runLog.battles.filter((b) => b.won && b.enemyClass === 'elite').length,
    evTotal: Object.values(ev).reduce((a, b) => a + b, 0),
  };
}

/** 합체 (GDD 22-3): 되돌릴 수 없다 — 자동 백업(24-5 stashSlot 'fusion')은 부르는 쪽(화면)이 먼저 한다.
 *  두 캐릭터는 초월체가 되어 사라지고(초월체 도감에 보관), 같은 종족들의 새 트랙이 1단계 완전 초기 상태로 열린다(환생 계승 없음).
 *  남김(슬롯): 도감·칭호, 초월체 도감, 붕옥 해방, 먹이·타일·골드·영옥·남은 영혼 결정, 스토리·보스 도감, 스킨·꾸밈 착용과 보유. 붕옥 2단계 게이지는 0.
 *  첫 초월체는 영옥 10. 6종을 다 모으면 칭호 "붕옥 완성"(칭호 평가) */
export function performFusion(save: SaveData, nowMs: number = Date.now()): FusionResult {
  const gate = fusionGate(save);
  if (!gate.ok) return { ok: false, missing: gate.missing };
  const { def, matched } = fusionPreview(save);
  if (!def) return { ok: false, missing: ['complete'] };
  const HX = BALANCE.provisional.hogyoku;
  const tracks = allTracks(save);
  const characters = tracks.map(summaryOf);
  const jade = save.transcendentDex.length === 0 ? HX.firstTranscendentJade : 0;
  const index = save.slotLog.fusions.length + 1;
  const record: FusionRecord = { at: nowMs, index, transcendentId: def.id, matched, characters, soulSpent: save.hogyoku.fusionFed, jade };
  save.slotLog.fusions.push(record);
  save.transcendentDex.push({ id: def.id, at: nowMs, fusionIndex: index });
  save.hogyoku.fusionFed = 0;
  save.shared.jade += jade;
  // 새 두 트랙: 같은 종족들, 1단계 완전 초기. 스킨(꾸밈)만 그대로 입는다
  const fresh = (t: Pick<SaveData, TrackKey>, salt: number) => ({ ...newTrack(t.factionId, nowMs, salt), skin: t.skin, wear: { ...t.wear } });
  const others = save.otherTracks.map((t, i) => ({ ...fresh(t, i + 1), parkedAt: nowMs }));
  putActiveTrack(save, fresh(save, 0));
  save.otherTracks = others;
  checkTitles(save, 'fusion', nowMs);
  return { ok: true, def, record, jade, completed: allTranscendentsOwned(save.transcendentDex.map((x) => x.id)) };
}

/** 끝난 원정을 세이브에 반영: 전투 기록·런 기록, 보존된 타일을 보유에 더함, 둥지 상태 갱신.
 *  진화 타이밍(걸음 수)에 닿았으면 둥지에 돌아온 그 순간 상태로 자동 진화한다 (GDD 20-5 v4.1, 패배로 돌아와도). 진화했으면 그 결과를 돌려준다(화면이 연출) */
export function recordExpedition(save: SaveData, exp: ExpeditionState, nowMs: number = Date.now()): EvolveResult | null {
  const log = save.runLog;
  log.battles.push(...exp.battles);
  log.runs.push(buildRunRecord(exp));
  log.absorbs.push(...exp.absorbRecords);
  // 리스크 기록: 최고치, 한계 돌파 횟수, 돌파 후 생존(= 돌파하고도 귀환) 횟수 (GDD 9장)
  log.risk.peak = Math.max(log.risk.peak, exp.riskPeak);
  if (exp.breakthrough) {
    log.risk.breakthroughs++;
    if (exp.outcome === 'returned') log.risk.survivedBreakthroughs++;
  }
  // 이 원정이 끝난 뒤의 슬롯으로 속성 보너스 완성 기록 (패배로 잃은 진행도는 세지 않는다). 기록 이름은 옛 구조(lineageId) 그대로, 값은 속성 id
  for (const lineageId of completedElements(exp.build)) {
    let rec = log.lineages.find((l) => l.lineageId === lineageId);
    if (!rec) log.lineages.push((rec = { lineageId, completed: false, conflictingTried: false }));
    if (!rec.completed) {
      rec.completed = true;
      rec.firstCompletedRunId = exp.runId;
    }
  }
  // 영혼 결정 (GDD 22-3): 이 원정에서 이긴 강적 수만큼 (+ 바퀴 변이 폭풍의 추가분, GDD 25-5)
  save.shared.soulCrystals += exp.battles.filter((b) => b.won && b.enemyClass === 'elite').length * BALANCE.provisional.soulCrystals.perElite + (exp.bonusSoul ?? 0);
  // 먹이 전리품 (GDD 23-1): 지킨 먹이를 보유에 넣고(상한 9), 그래도 하나도 없으면 간식 2개 (막힘 방지). 결과 화면이 exp.foodSettled 를 읽는다
  const sum = summarize(exp);
  exp.foodSettled = settleFood(save.shared.food, sum.keptFood, sum.lostFood);
  // 골드 (C.57): 번 것 − 상인에게 쓴 것 (패배하면 마지막 바퀴에 번 것은 잃는다)
  save.shared.tradeCoins = Math.max(0, save.shared.tradeCoins + sum.keptGold);
  save.build = cloneBuildOf(exp.build);
  // 진화 상태: 원정 중 쌓인 걸음·흡수 속성·노력치·행동 기록을 합친다. 한계 돌파는 원정당 한 번 센다 (아란칼 행동 히든, GDD 20-5)
  save.evolution = cloneEvolution(exp.evolution);
  if (exp.breakthrough) recordEvolutionBreakthrough(save.evolution);
  for (const id of sum.kept) save.tiles.collection[id] = (save.tiles.collection[id] ?? 0) + 1;
  storeUnplacedTiles(save.tiles, unplacedKept(exp), deckSizeOf(save));
  applyExpeditionEnd(save.nest, exp, nowMs);
  // 수련권 (GDD 22-5): 원정에서 돌아올 때마다(승패 무관) +1, 최대 3
  addTrainingTicket(save.training);
  save.activeExpedition = null;
  save.lastScreen = 'room';
  // 스토리 화·보스 (GDD 25-3·25-4): 기록·보상. 칭호(보스 첫 처치·장 클리어)는 바로 아래 칭호 평가가 런 로그를 읽어 준다
  if (exp.story) exp.storySettled = settleStory(save, exp, nowMs);
  checkTitles(save, 'expedition', nowMs);
  // 돌보기 판정은 원정을 마친 몸 상태로 (패배 페널티 쇠약은 넣지 않는다: 지고 돌아왔다고 실패형이 되지는 않는다, C.47 정한 것)
  return canEvolve(save.evolution) ? performEvolution(save, nowMs, { hunger: exp.hunger, condition: exp.condition }) : null;
}

/** 스토리 화가 끝났을 때 (GDD 25-4·25-7): 런 로그(보스전·화), 보스 도감, 보상 — 화 클리어 골드·먹이(매번), 첫 클리어 영옥, 장 첫 완주 영옥, 보스 첫 처치 영옥.
 *  보스 처치 골드·희귀 먹이는 원정 전리품으로 이미 들어왔다 (패배로 잃지 않게 보스는 화의 마지막). 칭호는 부르는 쪽의 checkTitles 가 런 로그로 준다 */
export function settleStory(save: SaveData, exp: ExpeditionState, nowMs: number = Date.now()): StorySettlement {
  const st = exp.story!;
  const SX = BALANCE.provisional.story;
  const BX = BALANCE.provisional.boss;
  const prog = storyProgressOf(save);
  const key = episodeKey(st.chapterId, st.episodeId);
  const out: StorySettlement = { chapterId: st.chapterId, episodeId: st.episodeId, cleared: st.cleared, firstClear: false, gold: 0, food: [SX.episodeFood as FoodId, 0], jade: 0, chapterCleared: false, bossFirstKill: null };
  const br = st.bossResult;
  if (br) {
    const dex = save.bossDex[br.bossId];
    const firstKill = br.won && !dex;
    if (br.won) save.bossDex[br.bossId] = { kills: (dex?.kills ?? 0) + 1, firstAt: dex?.firstAt ?? nowMs };
    if (firstKill) {
      out.bossFirstKill = br.bossId;
      out.jade += BX.reward.firstJade;
    }
    save.runLog.bossBattles.push({ at: nowMs, runId: exp.runId, factionId: save.factionId, bossId: br.bossId, won: br.won, firstKill, durationSeconds: br.durationSeconds, phase: br.phase, seals: br.seals, lossReason: br.lossReason, tierIndex: exp.evolution.tierIndex, episode: key });
  }
  if (st.cleared) {
    const had = prog.cleared[key];
    out.firstClear = !had;
    prog.cleared[key] = { firstAt: had?.firstAt ?? nowMs, clears: (had?.clears ?? 0) + 1 };
    out.gold = SX.episodeGold;
    save.shared.tradeCoins += out.gold;
    out.food = [SX.episodeFood as FoodId, addFood(save.shared.food, SX.episodeFood as FoodId, 1)];
    if (out.firstClear) out.jade += SX.firstClearJade;
    const eps = chapterContent(save.factionId, st.chapterId)?.episodes ?? [];
    if (!prog.chapters.includes(st.chapterId) && eps.length > 0 && eps.every((e) => prog.cleared[episodeKey(st.chapterId, e.id)])) {
      prog.chapters.push(st.chapterId);
      out.chapterCleared = true;
      out.jade += SX.chapterJade;
    }
  }
  save.shared.jade += out.jade;
  save.runLog.storyRuns.push({ at: nowMs, runId: exp.runId, factionId: save.factionId, chapterId: st.chapterId, episodeId: st.episodeId, cleared: st.cleared, firstClear: out.firstClear, chapterCleared: out.chapterCleared, tierIndex: exp.evolution.tierIndex });
  return out;
}

export type SynthResult = { ok: true; upgradedId: string } | { ok: false; reason: string };

/** 타일 합성 (GDD 25-5 ⑤): 같은 바탕 타일 synthCost(3)장 → 상위 타일("+") 1장. 상위·이벤트 타일은 합성하지 않는다. 덱은 보유 수량에 맞춰 줄인다 */
export function synthesizeTile(save: SaveData, tileId: string): SynthResult {
  const cost = BALANCE.provisional.tileVariants.synthCost;
  let up: string | null;
  try {
    up = upgradeIdOf(tileId);
  } catch {
    return { ok: false, reason: '모르는 타일이다' };
  }
  if (!up || !deckTilesFor(save.factionId).some((t) => t.id === tileId)) return { ok: false, reason: '합성할 수 없는 타일이다' };
  const have = save.tiles.collection[tileId] ?? 0;
  if (have < cost) return { ok: false, reason: `같은 타일 ${cost}장이 필요하다` };
  save.tiles.collection[tileId] = have - cost;
  save.tiles.collection[up] = (save.tiles.collection[up] ?? 0) + 1;
  // 덱에 넣어 둔 장수가 보유보다 많아지면 뒤에서부터 뺀다
  while (save.tiles.deck.filter((x) => x === tileId).length > save.tiles.collection[tileId]!) save.tiles.deck.splice(save.tiles.deck.lastIndexOf(tileId), 1);
  return { ok: true, upgradedId: up };
}

/** 합성할 수 있는 타일인가 (보유 수량 무관) */
export function canSynthesize(tileId: string): boolean {
  const t = getTile(tileId);
  return !t.upgradeOf && upgradeIdOf(tileId) !== null;
}

/** 원정에 가져가는 덱 크기 (GDD 25-9): 기본 8 + 상점에서 산 덱 칸(최대 +2, 슬롯 공유) */
export function deckSizeOf(save: Pick<SaveData, 'shared'>): number {
  return BALANCE.provisional.expedition.deckSize + (save.shared.deckSlots ?? 0);
}

/** 놓지 않고 남은 획득 타일을 다음 원정 덱에 넣는다 (GDD 17-1): 덱 상한과 보유 수량을 넘기면 덱에는 못 넣는다(보유에는 이미 들어 있다) */
export function storeUnplacedTiles(stock: TileStock, ids: string[], size: number = BALANCE.provisional.expedition.deckSize): void {
  for (const id of ids) {
    const inDeck = stock.deck.filter((x) => x === id).length;
    if (stock.deck.length >= size || inDeck >= (stock.collection[id] ?? 0)) continue;
    stock.deck.push(id);
  }
}

/** 이어할 원정이 있는가. 저장된 값이 손상·구버전이면 영역을 비우고 이유를 알려 준다 (이어하기를 숨긴다) */
export function readActiveExpedition(save: SaveData): (RestoreResult & { ok: true }) | { ok: false; reason: 'none' | 'corrupt' | 'version' } {
  if (save.activeExpedition == null) return { ok: false, reason: 'none' };
  const r = restoreExpedition(save.activeExpedition);
  if (r.ok) return r;
  save.activeExpedition = null;
  return r;
}

/** 이어하기가 열 화면 (GDD 19-3): 마지막 화면이 원정이고 원정 중간 저장이 남아 있으면 원정, 아니면 방. 저장 내용의 손상 검사는 readActiveExpedition 이 한다 */
export function resumeTarget(save: Pick<SaveData, 'lastScreen' | 'activeExpedition'>): ScreenKey {
  return save.lastScreen === 'expedition' && save.activeExpedition != null ? 'expedition' : 'room';
}

function cloneBuildOf(b: BuildState): BuildState {
  return { owned: [...b.owned], slots: [...b.slots], equipOrder: [...(b.equipOrder ?? [])] };
}

/** 둥지에서 진화를 확정한다 (원정 중에는 부르지 않는다, 귀환 때 recordExpedition 이 부른다). 그 순간 장착 특성·허기·컨디션으로 판정.
 *  슬롯 +1, 단계 기록 리셋(노력치 유지), 도감 해금, 런 로그에 기록. 안정 수치·리스크는 그대로 */
export function performEvolution(save: SaveData, nowMs: number = Date.now(), care: { hunger: number; condition: number } = save.nest): EvolveResult {
  const r = evolve(save.evolution, save.build, { factionId: save.factionId, hunger: care.hunger, condition: care.condition, rebirths: save.rebirth.count }, nowMs);
  if (r.ok) {
    save.runLog.tiers.evolutions.push(r.record);
    if (!save.formDex.includes(r.form.id)) save.formDex.push(r.form.id);
    checkTitles(save, 'evolution', nowMs);
    // 5단계에 닿으면 다른 종족 트랙이 열리고, 모든 트랙이 닿으면 붕옥 탭이 열린다 (GDD 22-3)
    checkTrackOpen(save, nowMs);
  }
  return r;
}

/** 칭호 평가 훅 (원정 종료·진화·로드). 새로 해금된 칭호 정의를 돌려주고, 알림은 UI 가 unlocked.seen 으로 띄운다 */
export function checkTitles(save: SaveData, trigger: TitleTrigger, nowMs: number = Date.now(), defs: readonly TitleDef[] = TITLES): TitleDef[] {
  // 합체 기록은 슬롯 단위라 지금 트랙의 런 로그에 붙여 읽는다 (칭호 '붕옥 완성')
  return unlockTitles({ ...save.runLog, fusions: save.slotLog?.fusions ?? [] }, save, defs, trigger, nowMs);
}

/** 지금까지 마친 원정 수 (등급전 재도전 대기 기준, GDD 21-1) */
export function runsCompleted(save: SaveData): number {
  return save.runLog.runs.length;
}

/** 등급전 도전 가능 여부 (GDD 21장): 아란칼 이상 · 바로 위 1칸 · 진 상대는 다음 원정 1회 후 */
export function rankChallenge(save: SaveData): ReturnType<typeof canChallenge> {
  return canChallenge(save.rank, save.evolution.tierIndex, runsCompleted(save));
}

/** 등급전 결과를 세이브에 반영한다: 사다리(번호 뺏기/한 칸 하락)·등급 이력, 전투 기록(enemyClass 'rank')과 등급전 기록을 런 로그에,
 *  이기면 영혼 결정 +3. 도전 가능 여부는 부르는 쪽이 rankChallenge 로 먼저 본다 */
export function recordRankBattle(save: SaveData, s: CombatState, nowMs: number = Date.now()): ChallengeResult {
  const won = s.status === 'won';
  const runs = runsCompleted(save);
  const r = applyChallenge(save.rank, won, runs, nowMs);
  const battle = buildBattleRecord(s, { factionId: save.factionId, tierIndex: save.evolution.tierIndex });
  battle.enemyClass = 'rank'; // 강적 처치 수(칭호·히든)에 섞이지 않게
  save.runLog.battles.push(battle);
  const rec: RankBattleRecord = {
    at: nowMs, runsCompleted: runs, opponentId: r.opponentId, won, rankBefore: r.before, rankAfter: r.after, firstRanked: r.firstRanked,
    seed: s.seed, durationSeconds: battle.durationSeconds, tierIndex: save.evolution.tierIndex, formId: save.evolution.formId,
  };
  save.runLog.rankBattles.push(rec);
  if (won) save.shared.soulCrystals += BALANCE.provisional.soulCrystals.perRankWin;
  checkTitles(save, 'rank', nowMs);
  return r;
}

/** 해방 자격 (GDD 22-2·22-5): 수련 완료 그리고 등급 이력, 그리고 지금 단계 5 이상.
 *  visible = 버튼을 보이는가(5단계 이상), usable = 쓸 수 있는가, missing = 부족한 것(잠긴 버튼 한 줄) */
export function liberationAccess(save: Pick<SaveData, 'training' | 'rank' | 'evolution'>): { visible: boolean; usable: boolean; missing: ('training' | 'rank')[] } {
  const visible = save.evolution.tierIndex >= BALANCE.provisional.liberation.minTierIndex;
  const missing: ('training' | 'rank')[] = [];
  if (!save.training.completed) missing.push('training');
  if (!save.rank.history.everRanked) missing.push('rank');
  return { visible, usable: visible && missing.length === 0, missing };
}

/** 원정 밖 전투(등급전·연습)에서 해방이 끝나며 오른 리스크를 둥지 게이지에 더한다 (원정 전투는 finishBattle 이 원정 게이지에) */
export function settleLiberationRisk(save: SaveData, s: Pick<CombatState, 'liberation'>): void {
  if (s.liberation.risk > 0) save.nest.risk = Math.min(BALANCE.provisional.risk.limit, save.nest.risk + s.liberation.risk);
}

/** 수련 한 판 결과를 세이브에 반영한다 (GDD 22-5): 수련권 1장, 수련치·노력치·둥지 비용, 런 로그, 완료면 칭호 평가. 시작 가능 여부는 부르는 쪽이 trainingGate 로 먼저 본다 */
export function recordTraining(save: SaveData, game: TrainingGameId, won: boolean, nowMs: number = Date.now()): TrainingOutcome {
  const out = applyTraining(save.training, save.nest, save.evolution, game, won, nowMs);
  save.runLog.trainings.push({ at: nowMs, factionId: save.factionId, game, won, level: out.level, points: out.points, completedNow: out.completedNow });
  checkTitles(save, 'training', nowMs);
  return out;
}

/** 환생 결과 (화면이 연출·안내에 쓴다) */
export type RebirthResult =
  | { ok: true; record: RebirthRecord; soulCrystals: number; jade: number }
  | { ok: false; reason: 'tier' | 'expedition' | 'trait' };

/** 환생 (GDD 22-1·22-7): 5단계 이상에서 둥지로부터. 되돌릴 수 없다 — 자동 백업(24-5 stashSlot 'rebirth')은 부르는 쪽(화면)이 먼저 한다.
 *  초기화: 단계·진화체·경로·장착 특성(계승 1개 제외)·걸음·등급 사다리(번호·전적)·노력치(10% 누적 계승)·리스크 0·허기·컨디션 기본값·원정 중간 저장.
 *  남김: 도감·칭호, 등급 이력, 수련(완료·수련치·수련권), 공유 자원(먹이·골드·영옥·영혼 결정), 타일, 스킨, 안정 수치, 런 로그.
 *  보상: 영혼 결정 +10, 첫 환생만 영옥 10 (튜토리얼 first-rebirth 는 다음 저장 때 claimTutorialGoals 가 준다) */
export function performRebirth(save: SaveData, keepTraitId: string | null, nowMs: number = Date.now()): RebirthResult {
  if (!canRebirth(save.evolution)) return { ok: false, reason: 'tier' };
  if (save.activeExpedition != null) return { ok: false, reason: 'expedition' };
  if (keepTraitId !== null && !inheritableTraits(save.build).includes(keepTraitId)) return { ok: false, reason: 'trait' };
  const prev = save.evolution;
  const carry = nextCarry(save.rebirth, prev);
  const count = save.rebirth.count + 1;
  save.rebirth = { count, carry };
  const evolution = newEvolution(nextStageSeed(prev.stageSeed, 100 + count));
  evolution.carry = startingCarry(carry);
  save.evolution = evolution;
  const build = newBuild();
  if (keepTraitId !== null) gainTrait(build, keepTraitId);
  save.build = build;
  save.rank = resetRankKeepHistory(save.rank);
  const fresh = newNest(nowMs);
  save.nest = { ...save.nest, hunger: fresh.hunger, condition: fresh.condition, risk: 0, weakened: false };
  save.activeExpedition = null;
  save.lastScreen = 'room';
  const RB = BALANCE.provisional.rebirth;
  const soulCrystals = BALANCE.provisional.soulCrystals.perRebirth;
  const jade = count === 1 ? RB.firstJade : 0;
  save.shared.soulCrystals += soulCrystals;
  save.shared.jade += jade;
  const record: RebirthRecord = {
    at: nowMs, count, factionId: save.factionId, prevFormId: prev.formId, prevTierIndex: prev.tierIndex, prevElements: playerElementsOf(prev),
    keptTraitId: keepTraitId, carry: { ...evolution.carry }, runsCompleted: runsCompleted(save),
  };
  save.runLog.rebirths.push(record);
  return { ok: true, record, soulCrystals, jade };
}

/** 새 원정의 runId = 지금까지 기록된 원정 수 + 1 */
export function nextRunId(save: SaveData): number {
  return save.runLog.runs.length + 1;
}

/** 세이브에 전투 기록을 더한다 */
export function recordBattle(save: SaveData, record: BattleRecord): void {
  save.runLog.battles.push(record);
}

// ── 저장·불러오기 (localStorage) ──
export const SAVE_KEY = 'bleach-hollow-ascension.save';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** 이전 형식 세이브를 현재 형식으로 올린다. 알 수 없는 데이터는 null */
export function migrateSave(raw: unknown): SaveData | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as { meta?: { format?: number }; factionId?: unknown; runLog?: RunLog };
  if (typeof r.factionId !== 'string' || !r.runLog || typeof r.meta?.format !== 'number') return null;
  const save = r as SaveData;
  if (save.meta.format > SAVE_FORMAT_VERSION) return null;
  if (save.meta.format < 2) {
    // 형식 1 → 2: BattleRecord 에 enemyId, factionId, seed, riskGained, absorbGained, lossReason 추가
    save.runLog.battles = save.runLog.battles.map((b) => ({
      ...b,
      enemyId: b.enemyId ?? 'unknown',
      factionId: b.factionId ?? save.factionId,
      seed: b.seed ?? 0,
      riskGained: b.riskGained ?? 0,
      absorbGained: b.absorbGained ?? 0,
      lossReason: b.lossReason ?? null,
    }));
    save.meta.format = 2;
  }
  if (save.meta.format < 3) {
    // 형식 2 → 3: 둥지 상태·타일 보유 추가, RunRecord 에 endReason/seed/factionId 추가
    save.nest = newNest(Date.now());
    save.tiles = newTileStock();
    save.runLog.runs = (save.runLog.runs ?? []).map((r) => ({
      ...r,
      endReason: r.endReason ?? (r.outcome === 'returned' ? 'returned' : 'battle-lost'),
      seed: r.seed ?? 0,
      factionId: r.factionId ?? save.factionId,
    }));
    save.meta.format = 3;
  }
  if (save.meta.format < 4) {
    // 형식 3 → 4 (P3): 둥지에 리스크 게이지·안정 수치, 흡수 빌드 추가, AbsorbRecord·RunRecord 필드 추가
    save.nest = { ...save.nest, risk: save.nest.risk ?? 0, stability: save.nest.stability ?? BALANCE.provisional.risk.stabilityStart };
    save.build = save.build ?? newBuild();
    save.runLog.absorbs = (save.runLog.absorbs ?? []).map((a) => ({ ...a, traitId: a.traitId ?? null, lap: a.lap ?? 0 }));
    save.runLog.runs = save.runLog.runs.map((r) => ({
      ...r,
      gainedTraits: r.gainedTraits ?? [],
      lostTraits: r.lostTraits ?? [],
      riskPeak: r.riskPeak ?? 0,
      breakthrough: r.breakthrough ?? false,
    }));
    save.meta.format = 4;
  }
  if (save.meta.format < 5) {
    // 형식 4 → 5 (C.6 전투 v2): BattleRecord 에 전투 시간·블록 사용·체인3·막기·공허·필살·마무리 일격·흡수 조건 필드 추가.
    // 매치3 시절 기록은 그 값이 없으므로 0/빈 값으로 채운다 (기존 필드는 그대로)
    save.runLog.battles = save.runLog.battles.map((b) => ({
      ...b,
      matchesByRole: { ...emptyLegacyMatches(), ...(b.matchesByRole ?? {}) },
      durationSeconds: b.durationSeconds ?? 0,
      blocksByTrait: b.blocksByTrait ?? {},
      blocksByChain: b.blocksByChain ?? [0, 0, 0],
      chain3Count: b.chain3Count ?? 0,
      guardSuccesses: b.guardSuccesses ?? 0,
      voidUsed: b.voidUsed ?? 0,
      specialUsed: b.specialUsed ?? false,
      finisherKind: b.finisherKind ?? null,
      finisherTraitId: b.finisherTraitId ?? null,
      finisherLineageId: b.finisherLineageId ?? null,
      absorbable: b.absorbable ?? false,
    }));
    save.meta.format = 5;
  }
  if (save.meta.format < 6) {
    // 형식 5 → 6 (C.9 조합 진화): 진화 상태 추가(1단계), RunLog.tiers.evolutions 추가. (옛 계통 누적 옮기기는 형식 14 에서 버리므로 생략)
    save.evolution = newEvolution();
    save.runLog.tiers = { ...save.runLog.tiers, evolutions: save.runLog.tiers?.evolutions ?? [] };
    save.meta.format = 6;
  }
  if (save.meta.format < 7) {
    // 형식 6 → 7 (C.11 단계별 진화체 테이블): 현재 단계만 유지 (진화 경로는 형식 14 가 옛 진화체 id 를 읽어 새 트리로 만든다)
    save.evolution = save.evolution ?? newEvolution();
    save.formDex = [];
    save.meta.format = 7;
  }
  if (save.meta.format < 8) {
    // 형식 7 → 8 (C.14 칭호 도감): 해금 목록 추가. 지금까지의 런 로그로 충족된 칭호는 로드 때 평가되어 해금된다
    save.titles = [];
    save.meta.format = 8;
  }
  save.titles = save.titles ?? [];
  if (save.meta.format < 9) {
    // 형식 8 → 9 (C.13 원정 중간 저장): 원정 중 저장 영역 추가. 이전 세이브는 중간 저장이 없다
    save.activeExpedition = null;
    save.meta.format = 9;
  }
  if (save.meta.format < 10) {
    // 형식 9 → 10 (C.17 저장형 필살기): BattleRecord 에 저장 필살 사용 횟수·충전 낭비 추가 (옛 기록은 0)
    save.runLog.battles = save.runLog.battles.map((b) => ({ ...b, storedUsed: b.storedUsed ?? 0, storedWasted: b.storedWasted ?? 0 }));
    save.meta.format = 10;
  }
  if (save.meta.format < 11) {
    // 형식 10 → 11 (C.19 튜토리얼): 도움말 플래그 추가. 이전 세이브는 '이미 봄'으로 두지 않고 한 번 보여 준다
    save.help = newHelpState();
    save.meta.format = 11;
  }
  if (save.meta.format < 12) {
    // 형식 11 → 12 (C.34 체인 계열 개편): BattleRecord 에 계열별 체인·콤보 횟수 추가 (옛 기록은 빈 객체/0).
    // 장착 특성은 id 만 저장하고 계열은 데이터(특성 family)에서 읽으므로 빌드·슬롯은 그대로 열린다
    save.runLog.battles = save.runLog.battles.map((b) => ({ ...b, chainsByFamily: b.chainsByFamily ?? {}, combosTriggered: b.combosTriggered ?? 0, comboBlocksUsed: b.comboBlocksUsed ?? 0 }));
    save.meta.format = 12;
  }
  if (save.meta.format < 13) {
    // 형식 12 → 13 (C.46 이어하기): 마지막 화면 키 추가. 원정 중간 저장이 있으면 원정, 없으면 방
    save.lastScreen = save.activeExpedition != null ? 'expedition' : 'room';
    save.meta.format = 13;
  }
  if (save.meta.format < 14) {
    // 형식 13 → 14 (C.47 속성·능력치·진화 간략화, GDD 20장): 옛 특성 id → 속성 특성, 진화 경로 → 새 트리의 대응 형태(단계 유지), 계통 누적은 버림, 걸음 0부터.
    // 도감은 새 경로로 다시 채운다. 원정 중간 저장은 옛 전투·빌드 구조라 이어할 수 없어 비운다(빌드는 원정 출발 전 세이브 값이 남아 있다).
    // 런 로그 옛 기록은 그대로 두고 새 필드(흡수 속성·마무리 속성)는 null 로 채운다
    save.build = migrateBuild(save.build, save.build?.slots?.length ?? BALANCE.absorb.slotCount);
    save.evolution = migrateEvolution(save.evolution, save.build, save.factionId, save.runLog.runs?.length ?? 0);
    save.formDex = [...save.evolution.formHistory];
    save.activeExpedition = null;
    if (save.lastScreen === 'expedition') save.lastScreen = 'room';
    save.runLog.absorbs = (save.runLog.absorbs ?? []).map((a) => ({ ...a, element: a.element ?? null }));
    save.runLog.battles = save.runLog.battles.map((b) => ({ ...b, finisherElement: b.finisherElement ?? null }));
    save.meta.format = 14;
  }
  if (save.meta.format < 15) {
    // 형식 14 → 15 (C.49 등급전, GDD 21장·22-3): 등급전 상태(무번호에서 시작, 등급 이력 없음)·슬롯 공유 자원(영혼 결정 0부터)·등급전 기록 추가.
    // 지난 강적 처치로 영혼 결정을 소급하지 않는다(연습 전투 기록과 섞여 있어 원정 처치만 가려낼 수 없다)
    save.rank = newRankState();
    save.shared = newSharedState();
    save.runLog.rankBattles = [];
    save.meta.format = 15;
  }
  if (save.meta.format < 16) {
    // 형식 15 → 16 (C.52, GDD 23장): 먹이 개수제(시작 지급량 간식 5·보통 3으로 채움)·거래 재화(지금 골드) 0·튜토리얼 보상 기록(빈 기록 —
    // 이미 이룬 목표는 처음 저장할 때 claimTutorialGoals 가 한꺼번에 지급한다)
    save.shared = { ...newSharedState(), soulCrystals: save.shared?.soulCrystals ?? 0 };
    save.meta.format = 16;
  }
  if (save.meta.format < 17) {
    // 형식 16 → 17 (C.53, GDD 24장·25-1): 꾸밈 재화 영옥 0·마지막 접속 시각(옛 둥지 방치 시각으로, 미래 값이면 지금)·도감 보상 기록(빈 기록 — 이미 닿은 이정표는 처음 저장 때
    // claimDexRewards 가 한꺼번에 지급)·원정 기록의 사냥터(옛 기록은 기본 사냥터)
    const t = save.nest?.lastTickMs;
    save.lastSeenAt = typeof t === 'number' && Number.isFinite(t) && t >= 0 ? Math.min(t, Date.now()) : Date.now();
    save.shared = { ...(save.shared ?? newSharedState()), jade: 0, dexRewards: [] };
    save.runLog.runs = (save.runLog.runs ?? []).map((r) => ({ ...r, groundId: r.groundId ?? DEFAULT_GROUND_ID }));
    save.meta.format = 17;
  }
  if (save.meta.format < 18) {
    // 형식 17 → 18 (C.54, GDD 22-5): 해방 수련 상태(수련치 0·수련권 0·미완료), 수련 기록(빈 목록), 전투 기록의 해방 사용(옛 기록은 안 씀)
    save.training = newTrainingState();
    save.runLog.trainings = [];
    save.runLog.battles = save.runLog.battles.map((b) => ({ ...b, liberationUsed: b.liberationUsed ?? false, liberationAt: b.liberationAt ?? null }));
    save.meta.format = 18;
  }
  if (save.meta.format < 19) {
    // 형식 18 → 19 (C.55, GDD 26-5): 입고 있는 스킨 (옛 세이브는 진화체 그림 그대로)
    save.skin = null;
    save.meta.format = 19;
  }
  if (save.meta.format < 20) {
    // 형식 19 → 20 (C.56, GDD 22-7): 환생 상태(0회·계승 없음)·환생 기록(빈 목록). 진화 상태의 계승 노력치는 없음(0)
    save.rebirth = newRebirthState();
    save.runLog.rebirths = [];
    save.meta.format = 20;
  }
  if (save.meta.format < 21) {
    // 형식 20 → 21 (C.57, GDD 25-5 타일 변수): 원정 기록에 발동한 시너지·바퀴 변이·이벤트 선택·드래프트·골드(옛 기록은 빈 목록·0).
    // 상위 타일은 보유 수량(tiles.collection)에 id 로 들어가므로 따로 옮길 것이 없다. 원정 중간 저장은 형식 5 가 아니면 이어하지 않는다(readActiveExpedition)
    save.runLog.runs = (save.runLog.runs ?? []).map((r) => ({ ...r, synergies: r.synergies ?? [], mutations: r.mutations ?? [], events: r.events ?? [], drafts: r.drafts ?? [], gold: r.gold ?? 0 }));
    save.meta.format = 21;
  }
  if (save.meta.format < 22) {
    // 형식 21 → 22 (C.58, GDD 25-3·25-4): 스토리 진행(빈 진행)·보스 도감(빈 도감)·보스전·스토리 화 기록(빈 목록). 원정 중간 저장은 형식 6 이 아니면 이어하지 않는다
    save.story = {};
    save.bossDex = {};
    save.runLog.bossBattles = [];
    save.runLog.storyRuns = [];
    save.meta.format = 22;
  }
  if (save.meta.format < 23) {
    // 형식 22 → 23 (C.59, GDD 22-3 투트랙·붕옥): 지금 세이브 = 트랙 1개(위 평평한 필드 그대로 — 데이터 손실 없음), 쉬는 트랙 없음, 붕옥 처음 상태,
    // 초월체 도감·합체 기록 빈 값. 이미 5단계에 닿은 세이브는 로드 때 checkTrackOpen 이 다른 종족 트랙을 연다
    save.otherTracks = [];
    save.trackNotice = null;
    save.hogyoku = newHogyokuState();
    save.transcendentDex = [];
    save.slotLog = emptySlotLog();
    save.meta.format = 23;
  }
  if (save.meta.format < 24) {
    // 형식 23 → 24 (C.60, GDD 25-9 상점): 꾸밈 착용 없음·상점 구매 기록 빈 목록(트랙마다), 다시 뽑기권 0·덱 칸 +0·보유 꾸밈 —
    // 지금 스킨을 입고 있는 트랙이 있으면 그 스킨을 보유로 넣는다(입은 옷을 벗기지 않는다). 튜토리얼 목표 영옥 +1 은 이미 받은 목표만큼 소급
    const owned: string[] = [];
    let claimed = 0;
    forEachTrack(save, (t) => {
      t.wear = {};
      if (isRec(t.runLog)) t.runLog.shopPurchases = [];
      if (typeof t.skin === 'string' && canWear(t.factionId, t.skin) && !owned.includes(skinItemId(t.skin))) owned.push(skinItemId(t.skin));
    });
    const tut = save.shared?.tutorials;
    if (tut && typeof tut === 'object') for (const list of Object.values(tut)) if (Array.isArray(list)) claimed += list.length;
    save.shared = { ...(save.shared ?? newSharedState()), rerollTickets: 0, deckSlots: 0, cosmetics: owned };
    save.shared.jade = (typeof save.shared.jade === 'number' ? save.shared.jade : 0) + claimed * BALANCE.provisional.shop.tutorialJade;
    save.meta.format = 24;
  }
  if (save.meta.format < 25) {
    // 형식 24 → 25 (C.62, GDD 27장 다마고치 모드 뒷면): 기기 기록 — 처음 시작한 날은 기록에 남은 가장 이른 시각(없으면 지금), 논 시간은 0부터
    if (!isRec(save.machine)) save.machine = { createdAt: earliestStamp(save) ?? Date.now(), playMs: 0 };
    save.meta.format = 25;
  }
  save.otherTracks = (Array.isArray(save.otherTracks) ? save.otherTracks : []).filter((t): t is TrackData => isTrackShape(t) && t.factionId !== save.factionId).slice(0, BALANCE.provisional.twoTrack.maxTracks - 1);
  if (new Set(save.otherTracks.map((t) => t.factionId)).size !== save.otherTracks.length) save.otherTracks = save.otherTracks.filter((t, i, a) => a.findIndex((x) => x.factionId === t.factionId) === i);
  for (const t of save.otherTracks) if (typeof t.parkedAt !== 'number' || !Number.isFinite(t.parkedAt)) t.parkedAt = Date.now();
  save.trackNotice = typeof save.trackNotice === 'string' && save.otherTracks.some((t) => t.factionId === save.trackNotice) ? save.trackNotice : null;
  save.hogyoku = sanitizeHogyoku(save.hogyoku);
  save.transcendentDex = sanitizeTranscendentDex(save.transcendentDex);
  save.slotLog = { fusions: Array.isArray(save.slotLog?.fusions) ? save.slotLog.fusions : [], trackOpens: Array.isArray(save.slotLog?.trackOpens) ? save.slotLog.trackOpens : [] };
  save.shared = sanitizeShared(save.shared);
  save.machine = sanitizeMachine(save.machine, earliestStamp(save) ?? Date.now());
  forEachTrack(save, (t) => sanitizeTrackFields(t, save.shared.cosmetics));
  save.story = sanitizeStory(save.story);
  save.bossDex = sanitizeBossDex(save.bossDex);
  if (typeof save.lastSeenAt !== 'number' || !Number.isFinite(save.lastSeenAt)) save.lastSeenAt = Date.now();
  save.formDex = (save.formDex ?? []).filter((id) => tryGetForm(id) !== undefined);
  save.help = sanitizeHelpState(save.help);
  return save;
}

/** 트랙 필드 보정 (깨진 값·없는 기록). 지금 트랙과 쉬는 트랙에 똑같이 */
function sanitizeTrackFields(t: Pick<SaveData, TrackKey>, owned: readonly string[]): void {
  t.runLog.shopPurchases = Array.isArray(t.runLog.shopPurchases) ? t.runLog.shopPurchases : [];
  t.wear = sanitizeWear(t.wear, owned);
  t.runLog.bossBattles = Array.isArray(t.runLog.bossBattles) ? t.runLog.bossBattles : [];
  t.runLog.storyRuns = Array.isArray(t.runLog.storyRuns) ? t.runLog.storyRuns : [];
  t.rebirth = sanitizeRebirth(t.rebirth);
  t.runLog.rebirths = Array.isArray(t.runLog.rebirths) ? t.runLog.rebirths : [];
  t.skin = canWear(t.factionId, t.skin) && owned.includes(skinItemId(t.skin!)) ? t.skin : null;
  t.training = sanitizeTraining(t.training);
  t.runLog.trainings = Array.isArray(t.runLog.trainings) ? t.runLog.trainings : [];
  t.rank = sanitizeRankState(t.rank);
  t.runLog.rankBattles = Array.isArray(t.runLog.rankBattles) ? t.runLog.rankBattles : [];
  delete (t.runLog as Partial<RunLog>).fusions; // 합체 기록은 슬롯 단위(slotLog)
  // 이어하기 영역이 객체가 아니면 비운다 (내용 검사는 이어하기를 열 때 readActiveExpedition 이 한다)
  if (typeof t.activeExpedition !== 'object' || Array.isArray(t.activeExpedition)) t.activeExpedition = null;
  if (!SCREEN_KEYS.includes(t.lastScreen)) t.lastScreen = 'room';
}

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** 쉬는 트랙의 뼈대 검사: 화면·엔진이 바로 읽는 구조가 있어야 쓴다 (없으면 그 트랙은 버린다) */
function isTrackShape(t: unknown): boolean {
  if (!isRec(t) || typeof t.factionId !== 'string' || !FACTIONS.some((f) => f.id === t.factionId)) return false;
  const evo = t.evolution, b = t.build, log = t.runLog;
  return isRec(t.nest) && isRec(b) && Array.isArray(b.owned) && Array.isArray(b.slots) && isRec(evo) && typeof evo.tierIndex === 'number' && isRec(evo.ev) && isRec(evo.elementAbsorbs) && Array.isArray(evo.formHistory)
    && isRec(log) && Array.isArray(log.battles) && Array.isArray(log.runs) && Array.isArray(log.absorbs) && isRec(log.tiers) && Array.isArray((log.tiers as Record<string, unknown>).evolutions) && isRec(log.risk);
}

export function sanitizeHogyoku(raw: unknown): HogyokuState {
  const r = (isRec(raw) ? raw : {}) as Partial<Record<keyof HogyokuState, unknown>>;
  const HX = BALANCE.provisional.hogyoku;
  const liberated = r.liberated === true;
  return {
    tabOpen: r.tabOpen === true,
    tabNotice: r.tabNotice === true && r.tabOpen === true,
    fed: liberated ? HX.liberateCost : Math.min(HX.liberateCost, nonNegInt(r.fed)),
    liberated,
    liberatedAt: liberated && typeof r.liberatedAt === 'number' ? r.liberatedAt : null,
    fusionFed: liberated ? Math.min(HX.fusionCost, nonNegInt(r.fusionFed)) : 0,
  };
}

export function sanitizeTranscendentDex(raw: unknown): TranscendentEntry[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw.filter((e): e is TranscendentEntry => isRec(e) && typeof e.id === 'string' && tryGetTranscendent(e.id) !== undefined && !seen.has(e.id) && (seen.add(e.id), true))
    .map((e) => ({ id: e.id, at: nonNegInt(e.at), fusionIndex: Math.max(1, nonNegInt(e.fusionIndex)) }));
}

/** 착용 정리: 아는 분류·그 분류의 품목·보유한 것만 */
export function sanitizeWear(raw: unknown, owned: readonly string[]): WearState {
  const out: WearState = {};
  if (!isRec(raw)) return out;
  for (const c of WEAR_CATEGORIES) {
    const id = raw[c];
    if (typeof id === 'string' && getCosmetic(id)?.category === c && owned.includes(id)) out[c] = id;
  }
  return out;
}

/** 스킨 입기/벗기 (GDD 26-5·25-9). 이 종족이 입을 수 없거나 보유(상점에서 산 것)하지 않은 스킨이면 false(바뀌지 않는다). null = 기본(진화체)으로 되돌리기 */
export function equipSkin(save: SaveData, skinId: string | null): boolean {
  if (skinId !== null && (!canWear(save.factionId, skinId) || !save.shared.cosmetics.includes(skinItemId(skinId)))) return false;
  save.skin = skinId;
  return true;
}

export function loadSave(storage: StorageLike, key: string = SAVE_KEY): SaveData | null {
  try {
    const text = storage.getItem(key);
    const save = text ? migrateSave(JSON.parse(text)) : null;
    if (save) {
      checkTitles(save, 'load');
      checkTrackOpen(save); // 이미 5단계에 닿은 옛 세이브는 여기서 다른 종족 트랙이 열린다 (GDD 22-3)
    }
    return save;
  } catch {
    return null;
  }
}

export function writeSave(storage: StorageLike, save: SaveData, key: string = SAVE_KEY): void {
  try {
    storage.setItem(key, JSON.stringify(save));
  } catch {
    // 저장 공간이 막힌 환경(시크릿 모드 등)에서는 이번 판만 기록이 남지 않는다
  }
}

/** 가져갈 덱을 정리한다: 이 종족이 쓰는 타일만, 보유 수량 이내로. 비면 보유량이 많은 순으로 채운다 */
export function sanitizeDeck(stock: TileStock, factionId: string, size: number = BALANCE.provisional.expedition.deckSize): string[] {
  const options = deckTilesFor(factionId).map((t) => t.id);
  const used: Record<string, number> = {};
  const deck: string[] = [];
  for (const id of stock.deck) {
    if (deck.length >= size || !options.includes(id)) continue;
    if ((used[id] ?? 0) >= (stock.collection[id] ?? 0)) continue;
    used[id] = (used[id] ?? 0) + 1;
    deck.push(id);
  }
  if (deck.length === 0) {
    for (let round = 0; deck.length < size; round++) {
      let added = false;
      for (const id of options) {
        if (deck.length < size && (stock.collection[id] ?? 0) > round) {
          deck.push(id);
          added = true;
        }
      }
      if (!added) break;
    }
  }
  return deck;
}
