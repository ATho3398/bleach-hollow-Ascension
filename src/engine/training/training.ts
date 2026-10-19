// 해방 수련 (GDD 22-4·22-5 v5.13). 종족 무관 순수 로직: 수련치·수련권·종목별 승리 수·완료 여부와 한 판 결과 반영.
// 종목 이름·문구는 종족 설정 training 에서 읽는다. 수치는 BALANCE.provisional.training.
// 수련 완료(completed)는 등급 이력(rank.history)과 같이 환생(22-1)해도 유지할 자리 — resetTrainingKeepCompletion.

import { BALANCE } from '../../config/balance';
import { STAT_IDS, type StatId } from '../../data/schema';
import { addEv, type EvolutionState } from '../evolution';
import type { NestState } from '../nest';

const TX = BALANCE.provisional.training;

/** 4종목 (GDD 22-4): 본능(정령) 대결 · 탄막 피하기 · 칼날 맞대기 · 먹이사슬. 표시 이름은 종족 설정 training.games */
export const TRAINING_GAMES = ['duel', 'dodge', 'clash', 'chain'] as const;
export type TrainingGameId = (typeof TRAINING_GAMES)[number];

export interface TrainingState {
  /** 수련치 (완료 기준 pointsToComplete). 완료 뒤에도 쌓인다(노력치 목적으로 계속 가능) */
  points: number;
  /** 수련권 (원정 귀환마다 +1, 최대 ticketsMax). 한 판에 1장 */
  tickets: number;
  /** 종목별 누적 승리 (난이도 단계 기준) */
  wins: Record<TrainingGameId, number>;
  /** 수련 완료 (영구, 환생해도 유지할 자리) */
  completed: boolean;
  completedAt: number | null;
}

export function newTrainingState(): TrainingState {
  return { points: 0, tickets: 0, wins: { duel: 0, dodge: 0, clash: 0, chain: 0 }, completed: false, completedAt: null };
}

const nonNegInt = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);

/** 저장된 수련 상태 정리 (모르는 값·음수·상한 넘는 수련권 보정) */
export function sanitizeTraining(raw: unknown): TrainingState {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<Record<keyof TrainingState, unknown>>;
  const w = (typeof r.wins === 'object' && r.wins !== null ? r.wins : {}) as Record<string, unknown>;
  const wins = newTrainingState().wins;
  for (const g of TRAINING_GAMES) wins[g] = nonNegInt(w[g]);
  const completed = r.completed === true;
  return {
    points: nonNegInt(r.points),
    tickets: Math.min(TX.ticketsMax, nonNegInt(r.tickets)),
    wins,
    completed,
    completedAt: completed && typeof r.completedAt === 'number' ? r.completedAt : null,
  };
}

/** 환생(GDD 22-1)용: 수련치·수련권·종목 승리는 처음으로, 완료 여부는 유지 */
export function resetTrainingKeepCompletion(t: TrainingState): TrainingState {
  return { ...newTrainingState(), completed: t.completed, completedAt: t.completedAt };
}

/** 그 종목의 난이도 단계 1~4 (누적 승리 0/3/6/10) */
export function trainingLevel(t: Pick<TrainingState, 'wins'>, game: TrainingGameId): number {
  const w = t.wins[game] ?? 0;
  let level = 1;
  TX.levelWins.forEach((need, i) => {
    if (w >= need) level = i + 1;
  });
  return level;
}

/** 원정에서 돌아올 때 수련권 +1 (최대 ticketsMax). 실제로 늘었는지 돌려준다 */
export function addTrainingTicket(t: TrainingState): boolean {
  if (t.tickets >= TX.ticketsMax) return false;
  t.tickets = Math.min(TX.ticketsMax, t.tickets + TX.ticketsPerReturn);
  return true;
}

export type TrainingBlock = 'tier' | 'tickets' | 'condition';

/** 수련을 시작할 수 있는가: 5단계(아란칼/수석 대원) 이상, 수련권 1장 이상, 컨디션 minCondition 이상 */
export function trainingGate(t: Pick<TrainingState, 'tickets'>, tierIndex: number, condition: number): { ok: true } | { ok: false; reason: TrainingBlock } {
  if (tierIndex < BALANCE.provisional.liberation.minTierIndex) return { ok: false, reason: 'tier' };
  if (t.tickets <= 0) return { ok: false, reason: 'tickets' };
  if (condition < TX.minCondition) return { ok: false, reason: 'condition' };
  return { ok: true };
}

/** 리스크가 한계 근처인가 (경고 한 줄) */
export function trainingRiskWarning(risk: number): boolean {
  return risk >= TX.riskWarn;
}

/** 종목 한 판의 보상·비용 표 (22-4) */
export function gameRule(game: TrainingGameId): (typeof TX.games)[string] {
  return TX.games[game]!;
}

export interface TrainingOutcome {
  game: TrainingGameId;
  won: boolean;
  /** 이 판을 한 난이도 단계 */
  level: number;
  points: number;
  /** 실제로 오른 노력치 (상한까지만) */
  ev: Partial<Record<StatId, number>>;
  /** 이 판으로 수련이 완료됐는가 (처음 완료한 판만 true) */
  completedNow: boolean;
  /** 둥지 수치 변화 (실제 반영량) */
  hunger: number;
  condition: number;
  risk: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** 한 판 시작: 수련권 1장을 먼저 쓴다 (도중에 꺼도 돌려받지 않는다 — 진 판을 되돌리지 못하게). 없으면 false */
export function beginTraining(t: TrainingState): boolean {
  if (t.tickets <= 0) return false;
  t.tickets--;
  return true;
}

/** 한 판 결과 반영 (수련권은 beginTraining 이 이미 썼다): 승리 = 표의 수련치·노력치(+ 먹이사슬 배부름), 패배 = 수련치 lossPoints. 비용은 이기든 지든.
 *  난이도 단계는 이 판을 시작할 때의 단계. 수련치가 완료 기준에 닿으면 완료 */
export function applyTraining(t: TrainingState, nest: NestState, evolution: EvolutionState, game: TrainingGameId, won: boolean, nowMs: number = Date.now()): TrainingOutcome {
  const rule = gameRule(game);
  const level = trainingLevel(t, game);
  const points = won ? rule.points : TX.lossPoints;
  t.points += points;
  if (won) t.wins[game] = (t.wins[game] ?? 0) + 1;
  const ev = won ? addEv(evolution, Object.fromEntries(Object.entries(rule.ev).filter(([k]) => (STAT_IDS as readonly string[]).includes(k))) as Partial<Record<StatId, number>>) : {};
  const before = { hunger: nest.hunger, condition: nest.condition, risk: nest.risk };
  nest.condition = clamp(nest.condition + rule.condition, 0, BALANCE.provisional.expedition.conditionMax);
  nest.hunger = clamp(nest.hunger + rule.hunger + (won ? rule.winHunger ?? 0 : 0), 0, 100);
  nest.risk = clamp(nest.risk + rule.risk, 0, BALANCE.provisional.risk.limit);
  const completedNow = !t.completed && t.points >= TX.pointsToComplete;
  if (completedNow) {
    t.completed = true;
    t.completedAt = nowMs;
  }
  return {
    game, won, level, points, ev, completedNow,
    hunger: nest.hunger - before.hunger, condition: nest.condition - before.condition, risk: nest.risk - before.risk,
  };
}
