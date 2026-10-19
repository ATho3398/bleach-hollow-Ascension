// 둥지 / 대원실 최소 버전 (GDD 7장, P2): 허기·컨디션 두 수치와 행동 3개. 종족 무관 순수 로직.
// 행동 이름·문구는 종족 설정(FactionConfig.nestActions)에서 읽는다. 자아/영압 안정도 같은 수치는 아직 없다.

import { BALANCE } from '../config/balance';
import { nestRiskAction, settleRiskToNest } from './absorb/risk';
import type { FoodId, NestAction } from './faction';
import type { ExpeditionState } from './expedition';
import { summarize } from './expedition';

const NX = BALANCE.provisional.nest;
const MAX = BALANCE.provisional.expedition.conditionMax;

export interface NestState {
  /** 0(배부름) ~ 100. 방치하면 시간이 지나며 오른다. 죽지 않는다 */
  hunger: number;
  /** 0(최악) ~ 100. 나쁘면 전투 시작 보드의 공허 타일이 늘어난다 */
  condition: number;
  /** 패배 후 쇠약 상태 (GDD 1장). 재우기로 풀린다 */
  weakened: boolean;
  /** 리스크 게이지(호로 광기 / 사신 호로화) 둥지 저장값. 원정은 이 값으로 시작하고 귀환하면 합쳐진다 */
  risk: number;
  /** 안정 수치(호로 자아 / 사신 영압 안정도). 컨디션·허기와 별개 */
  stability: number;
  /** 마지막으로 방치 허기를 계산한 시각(ms) */
  lastTickMs: number;
}

export function newNest(nowMs: number): NestState {
  return { hunger: NX.startHunger, condition: NX.startCondition, weakened: false, risk: 0, stability: BALANCE.provisional.risk.stabilityStart, lastTickMs: nowMs };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** 방치한 시간만큼 허기가 오른다 (상한 idleHungerCap, 죽지 않음) */
export function applyIdle(nest: NestState, nowMs: number): void {
  const hours = Math.max(0, nowMs - nest.lastTickMs) / 3_600_000;
  nest.lastTickMs = nowMs;
  if (nest.hunger >= NX.idleHungerCap) return;
  nest.hunger = Math.min(NX.idleHungerCap, nest.hunger + hours * NX.idleHungerPerHour);
}

/** 먹이 한 종류의 효과 (허기 감소, 컨디션 변화). 임시 수치 (BALANCE.provisional.nest.foods) */
export function foodEffect(food: FoodId): { hunger: number; condition: number } {
  return NX.foods[food];
}

/** 둥지 행동: 먹이(허기↓, 종류별 컨디션 변화) / 재우기(컨디션↑, 쇠약 해소) / 쓰다듬기(컨디션 소량↑). food 는 먹이일 때만 쓰고 기본은 basic(예전 단일 먹이) */
export function doNestAction(nest: NestState, action: NestAction, food: FoodId = 'basic'): void {
  if (action === 'feed') {
    const f = foodEffect(food);
    nest.hunger = clamp(nest.hunger - f.hunger, 0, 100);
    nest.condition = clamp(nest.condition + f.condition, 0, MAX);
  } else if (action === 'sleep') {
    nest.condition = clamp(nest.condition + NX.sleepCondition, 0, MAX);
    nest.weakened = false;
  } else nest.condition = clamp(nest.condition + NX.petCondition, 0, MAX);
  nestRiskAction(nest, action);
}

/** 원정이 끝난 뒤 둥지 상태 갱신. 귀환: 원정에서 남은 허기·컨디션 그대로. 패배: 쇠약 + 컨디션 급락. 폭주했으면 컨디션 추가 하락 */
export function applyExpeditionEnd(nest: NestState, exp: ExpeditionState, nowMs: number): void {
  const s = summarize(exp);
  nest.hunger = Math.min(100, exp.hunger + (s.outcome === 'defeated' ? NX.defeatHunger : 0));
  nest.condition = s.outcome === 'defeated' ? Math.min(exp.condition, NX.defeatCondition) : exp.condition;
  nest.weakened = s.outcome === 'defeated';
  // 폭주(한계 돌파)한 원정에서 돌아오면 컨디션 −30 (GDD 23-2). 패배로 돌아와도 같다
  if (exp.breakthrough) nest.condition = clamp(nest.condition - BALANCE.provisional.risk.frenzyConditionLoss, 0, MAX);
  settleRiskToNest(nest, exp);
  nest.lastTickMs = nowMs;
}
