// 게임 상태와 세이브. 런 로그(GDD 9장)는 처음부터 저장 구조에 들어 있다 (CLAUDE.md 규칙 4)

import { BALANCE_VERSION } from './config/balance';
import { BALANCE } from './config/balance';
import { completedElements, newBuild, type BuildState } from './engine/absorb';
import { applyExpeditionEnd, doNestAction, newNest, type NestState } from './engine/nest';
import { buildRunRecord, restoreExpedition, summarize, unplacedKept, type ExpeditionSnapshot, type ExpeditionState, type RestoreResult } from './engine/expedition';
import { canEvolve, cloneEvolution, evolve, newEvolution, nextStageSeed, recordEvolutionBreakthrough, type EvolutionState, type EvolveResult } from './engine/evolution';
import { tryGetForm } from './data/evolution';
import { migrateBuild, migrateEvolution } from './saveLegacy';
import { emptyLegacyMatches, emptyRunLog, type BattleRecord, type RankBattleRecord, type RunLog } from './engine/runLog';
import { applyChallenge, canChallenge, newRankState, sanitizeRankState, type ChallengeResult, type RankState } from './engine/rank';
import { buildBattleRecord, type CombatState } from './engine/combat';
import { tilesFor } from './data/tiles';
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
import { addTrainingTicket, applyTraining, newTrainingState, sanitizeTraining, type TrainingGameId, type TrainingOutcome, type TrainingState } from './engine/training';

/** 세이브 구조를 바꾸면 올리고 마이그레이션을 추가한다 */
export const SAVE_FORMAT_VERSION = 19;

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
}

/** 튜토리얼 보상 수령 1건 (GDD 23-3) */
export interface TutorialClaim {
  goalId: string;
  at: number;
}

export interface SharedState {
  /** 영혼 결정: 강적 처치 +1, 등급전 승리 +3 (환생 +10 은 환생 구현 때). 수치 provisional */
  soulCrystals: number;
  /** 먹이 종류별 보유 개수 (GDD 23-1, 형식 16). 상한 9, 시작 간식 5·보통 3 */
  food: FoodStock;
  /** 일반 재화 '골드' (GDD 23-4, 형식 16, v5.11 옛 이름 영전 — 키는 그대로): 얻는 곳·쓰는 곳은 [미정]. 지금은 0 자리만 */
  tradeCoins: number;
  /** 꾸밈 재화 '영옥' (GDD 25-1 v5.11, 형식 17): 한 번만 받는 달성 보상(도감 이정표 등)에서만 */
  jade: number;
  /** 튜토리얼 보상 수령 기록 (GDD 23-3, 형식 16): 트랙(종족 id)마다 받은 목표 */
  tutorials: Record<string, TutorialClaim[]>;
  /** 도감 보상 수령 기록 (GDD 24-3, 형식 17): 받은 이정표 id. 도감은 세이브 하나에 하나라 트랙 구분 없음 */
  dexRewards: TutorialClaim[];
}

export function newSharedState(): SharedState {
  return { soulCrystals: 0, food: newFoodStock(), tradeCoins: 0, jade: 0, tutorials: {}, dexRewards: [] };
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
  return { soulCrystals: nonNegInt(r.soulCrystals), food: sanitizeFoodStock(r.food), tradeCoins: nonNegInt(r.tradeCoins), jade: nonNegInt(r.jade), tutorials, dexRewards };
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
}

/** 지금 트랙(종족)에서 새로 이룬 튜토리얼 목표를 판정해 보상을 준다 (GDD 23-3). 자동 판정·자동 지급 — 화면은 돌려준 목록으로 토스트를 띄운다.
 *  기존 세이브는 처음 부를 때 이미 이룬 목표를 한꺼번에 받는다 */
export function claimTutorialGoals(save: SaveData, nowMs: number = Date.now(), defs: readonly TutorialGoalDef[] = TUTORIAL_GOALS): TutorialGrant[] {
  const claims = (save.shared.tutorials[save.factionId] ??= []);
  const fresh = newlyAchieved(defs, claims.map((c) => c.goalId), {
    factionId: save.factionId, tutorialSeen: save.help.tutorialSeen, runLog: save.runLog, tierIndex: save.evolution.tierIndex, everRanked: save.rank.history.everRanked, trainingCompleted: save.training.completed,
  });
  return fresh.map((goal) => {
    claims.push({ goalId: goal.id, at: nowMs });
    const food: [FoodId, number][] = [];
    for (const [id, n] of Object.entries(goal.reward.food ?? {}) as [FoodId, number][]) food.push([id, addFood(save.shared.food, id, n)]);
    const soulCrystals = goal.reward.soulCrystals ?? 0;
    save.shared.soulCrystals += soulCrystals;
    return { goal, food, soulCrystals };
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
  return { meta: newSaveMeta(), factionId, nest: newNest(nowMs), build: newBuild(), evolution: newEvolution(nextStageSeed(Math.floor(nowMs) >>> 0, 0)), formDex: [], tiles: newTileStock(), runLog: emptyRunLog(), titles: [], activeExpedition: null, help: newHelpState(), lastScreen: 'room', rank: newRankState(), shared: newSharedState(), lastSeenAt: nowMs, training: newTrainingState(), skin: null };
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
  // 영혼 결정 (GDD 22-3): 이 원정에서 이긴 강적 수만큼
  save.shared.soulCrystals += exp.battles.filter((b) => b.won && b.enemyClass === 'elite').length * BALANCE.provisional.soulCrystals.perElite;
  // 먹이 전리품 (GDD 23-1): 지킨 먹이를 보유에 넣고(상한 9), 그래도 하나도 없으면 간식 2개 (막힘 방지). 결과 화면이 exp.foodSettled 를 읽는다
  const sum = summarize(exp);
  exp.foodSettled = settleFood(save.shared.food, sum.keptFood, sum.lostFood);
  save.build = cloneBuildOf(exp.build);
  // 진화 상태: 원정 중 쌓인 걸음·흡수 속성·노력치·행동 기록을 합친다. 한계 돌파는 원정당 한 번 센다 (아란칼 행동 히든, GDD 20-5)
  save.evolution = cloneEvolution(exp.evolution);
  if (exp.breakthrough) recordEvolutionBreakthrough(save.evolution);
  for (const id of sum.kept) save.tiles.collection[id] = (save.tiles.collection[id] ?? 0) + 1;
  storeUnplacedTiles(save.tiles, unplacedKept(exp));
  applyExpeditionEnd(save.nest, exp, nowMs);
  // 수련권 (GDD 22-5): 원정에서 돌아올 때마다(승패 무관) +1, 최대 3
  addTrainingTicket(save.training);
  save.activeExpedition = null;
  save.lastScreen = 'room';
  checkTitles(save, 'expedition', nowMs);
  // 돌보기 판정은 원정을 마친 몸 상태로 (패배 페널티 쇠약은 넣지 않는다: 지고 돌아왔다고 실패형이 되지는 않는다, C.47 정한 것)
  return canEvolve(save.evolution) ? performEvolution(save, nowMs, { hunger: exp.hunger, condition: exp.condition }) : null;
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
  const r = evolve(save.evolution, save.build, { factionId: save.factionId, hunger: care.hunger, condition: care.condition }, nowMs);
  if (r.ok) {
    save.runLog.tiers.evolutions.push(r.record);
    if (!save.formDex.includes(r.form.id)) save.formDex.push(r.form.id);
    checkTitles(save, 'evolution', nowMs);
  }
  return r;
}

/** 칭호 평가 훅 (원정 종료·진화·로드). 새로 해금된 칭호 정의를 돌려주고, 알림은 UI 가 unlocked.seen 으로 띄운다 */
export function checkTitles(save: SaveData, trigger: TitleTrigger, nowMs: number = Date.now(), defs: readonly TitleDef[] = TITLES): TitleDef[] {
  return unlockTitles(save.runLog, save, defs, trigger, nowMs);
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
  save.skin = canWear(save.factionId, save.skin) ? save.skin : null;
  if (typeof save.lastSeenAt !== 'number' || !Number.isFinite(save.lastSeenAt)) save.lastSeenAt = Date.now();
  save.training = sanitizeTraining(save.training);
  save.runLog.trainings = Array.isArray(save.runLog.trainings) ? save.runLog.trainings : [];
  save.rank = sanitizeRankState(save.rank);
  save.shared = sanitizeShared(save.shared);
  save.runLog.rankBattles = Array.isArray(save.runLog.rankBattles) ? save.runLog.rankBattles : [];
  save.formDex = (save.formDex ?? []).filter((id) => tryGetForm(id) !== undefined);
  save.help = sanitizeHelpState(save.help);
  // 이어하기 영역이 객체가 아니면 비운다 (내용 검사는 이어하기를 열 때 readActiveExpedition 이 한다)
  if (typeof save.activeExpedition !== 'object' || Array.isArray(save.activeExpedition)) save.activeExpedition = null;
  if (!SCREEN_KEYS.includes(save.lastScreen)) save.lastScreen = 'room';
  return save;
}

/** 스킨 입기/벗기 (GDD 26-5). 이 종족이 입을 수 없는 스킨이면 false(바뀌지 않는다). null = 기본(진화체)으로 되돌리기. 상점 전까지는 있는 스킨 전부 열림(provisional) */
export function equipSkin(save: SaveData, skinId: string | null): boolean {
  if (skinId !== null && !canWear(save.factionId, skinId)) return false;
  save.skin = skinId;
  return true;
}

export function loadSave(storage: StorageLike, key: string = SAVE_KEY): SaveData | null {
  try {
    const text = storage.getItem(key);
    const save = text ? migrateSave(JSON.parse(text)) : null;
    if (save) checkTitles(save, 'load');
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
  const options = tilesFor(factionId).map((t) => t.id);
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
