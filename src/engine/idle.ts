// 대기 모드 = 방치 자동 모험 (GDD 85장 6번, C.140): 접속하지 않은 실제 시간(최대 24시간)을 자동 모험으로 셈해
// '그 시간 내내 직접 원정했을 때의 기준량 × share' 만 준다. 종족 무관, 수치는 balance.ts provisional.idle.
// 시간은 저장된 벽시계(세이브 lastSeenAt) 기준 — 실행 중 경과용 monoNow(C.139)는 꺼 둔 시간을 모른다.
// 시계 방어: 지금이 마지막 접속보다 앞(되돌림)이면 0, 경과는 maxHours 로 자른다. 마지막 접속 시각은 앞으로만 움직이므로(markSeen)
// 시계를 앞으로 돌려 받은 뒤 되돌리면 그 미래 시각이 지날 때까지 다시 쌓이지 않는다.
// 82장 돌봄·허기: 꺼 둔 동안 허기는 그대로 오르고(applyAbsenceHunger), 자동 모험은 허기가 100 에 닿는 순간 멈춘다. 쇠약이면 효율 weakenedRate.
import { BALANCE } from '../config/balance';
import type { NestState } from './nest';

const IX = BALANCE.provisional.idle;
const NX = BALANCE.provisional.nest;
const HOUR = 3_600_000;

/** 꺼 둔 실제 시간(시간 단위, 0~maxHours). 값이 깨졌거나 시계가 되돌려졌으면 0 */
export function offlineHours(lastSeenAt: number, nowMs: number): number {
  if (!Number.isFinite(lastSeenAt) || !Number.isFinite(nowMs) || nowMs <= lastSeenAt) return 0;
  return Math.min(IX.maxHours, (nowMs - lastSeenAt) / HOUR);
}

/** 자동 모험이 실제로 돈 시간: 허기가 100 에 닿으면 멈춤(꺼 둔 동안 허기 상승 규칙 그대로, 상승 한도 idleHungerMaxGain 안에서는 100 에 못 닿음), 쇠약이면 효율 배율 */
export function idleActiveHours(hours: number, nest: Pick<NestState, 'hunger' | 'weakened'>): number {
  const room = Math.max(0, 100 - nest.hunger);
  const stop = room <= NX.idleHungerMaxGain ? room / NX.idleHungerPerHour : Infinity;
  return Math.max(0, Math.min(hours, stop)) * (nest.weakened ? IX.weakenedRate : 1);
}

/** 지급량 (정수로 내림). activeHours = idleActiveHours 결과 */
export interface IdleYield {
  laps: number;
  steps: number;
  gold: number;
  ev: number;
  tiles: number;
  food: number;
}

export function idleYield(activeHours: number): IdleYield {
  const k = Math.max(0, activeHours) * IX.share;
  const f = IX.fullHour;
  return {
    laps: Math.floor(f.laps * k), steps: Math.floor(f.steps * k), gold: Math.floor(f.gold * k),
    ev: Math.floor(f.ev * k), tiles: Math.floor(f.tiles * k), food: Math.floor(f.food * k),
  };
}

/** 셈할 만큼 꺼 두었나 (minMinutes 이상) */
export function idleCounts(hours: number): boolean {
  return hours * 60 >= IX.minMinutes;
}
