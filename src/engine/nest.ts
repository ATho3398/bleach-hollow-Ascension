// 둥지 / 대원실 최소 버전 (GDD 7장, P2): 허기·컨디션 두 수치와 행동 3개. 종족 무관 순수 로직.
// 행동 이름·문구는 종족 설정(FactionConfig.nestActions)에서 읽는다. 자아/영압 안정도 같은 수치는 아직 없다.

import { BALANCE } from '../config/balance';
import { nestRiskAction, settleRiskToNest } from './absorb/risk';
import type { FoodId, NestAction } from './faction';
import type { ExpeditionState } from './expedition';
import { conditionFloor, summarize } from './expedition';

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

/** 꺼 둔 동안 허기 (GDD 24-1): 마지막 접속 시각부터 지금까지 시간당 idleHungerPerHour, 한 번에 최대 +idleHungerMaxGain, 허기 100 이하.
 *  paused(원정 중간 저장이 있음)면 오르지 않는다. 기기 시계를 되돌려 지금이 마지막 접속보다 앞이면 오르지 않는다(음수 없음).
 *  올라간 양을 돌려준다 — 접속 시각 갱신은 부르는 쪽(저장할 때)이 한다 */
export function applyAbsenceHunger(nest: NestState, lastSeenAt: number, nowMs: number, paused = false): number {
  if (paused || !Number.isFinite(lastSeenAt) || nowMs <= lastSeenAt) return 0;
  const hours = (nowMs - lastSeenAt) / 3_600_000;
  const gain = Math.min(NX.idleHungerMaxGain, hours * NX.idleHungerPerHour, Math.max(0, 100 - nest.hunger));
  nest.hunger += gain;
  nest.lastTickMs = nowMs;
  return gain;
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

/** 원정이 끝나 둥지로 돌아갈 때의 허기·컨디션 (결과 화면 표시와 둥지 갱신이 같은 값을 쓴다, C.68). 패배: 허기 가산 + 컨디션 급락. 폭주했으면 컨디션 추가 하락 */
export function expeditionEndVitals(exp: ExpeditionState): { hunger: number; condition: number } {
  const defeated = summarize(exp).outcome === 'defeated';
  const hunger = Math.min(100, exp.hunger + (defeated ? NX.defeatHunger : 0));
  let condition = defeated ? Math.min(exp.condition, NX.defeatCondition) : exp.condition;
  // 폭주(한계 돌파)한 원정에서 돌아오면 컨디션 −30 (GDD 23-2). 패배로 돌아와도 같다.
  // 단 바퀴당 감소 하한(GDD 42장 3번) 아래로는 안 깎는다 — 패배 급락(defeatCondition)은 그대로 두고 폭주분만 막는다
  if (exp.breakthrough) condition = Math.max(clamp(condition - BALANCE.provisional.risk.frenzyConditionLoss, 0, MAX), conditionFloor({ ...exp, condition }));
  return { hunger, condition };
}

/** 원정이 끝난 뒤 둥지 상태 갱신. 귀환: 원정에서 남은 허기·컨디션 그대로. 패배: 쇠약 + 컨디션 급락. 폭주했으면 컨디션 추가 하락 */
export function applyExpeditionEnd(nest: NestState, exp: ExpeditionState, nowMs: number): void {
  const v = expeditionEndVitals(exp);
  nest.hunger = v.hunger;
  nest.condition = v.condition;
  nest.weakened = summarize(exp).outcome === 'defeated';
  settleRiskToNest(nest, exp);
  nest.lastTickMs = nowMs;
}
