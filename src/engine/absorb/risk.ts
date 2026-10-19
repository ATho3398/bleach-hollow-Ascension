// 리스크 게이지(호로 광기 / 사신 호로화, 이름은 종족 설정) 순수 로직 (GDD 5장, 4-1).
// 한계 돌파 = 폭주 (GDD 23-2, 원정당 1회): 남은 원정 주는·받는 피해 증가(expedition applyFrenzy), 공허 생성 증가, 귀환 때 컨디션·안정 수치 하락, 게이지 60.

import { BALANCE } from '../../config/balance';
import type { NestAction } from '../faction';

const RX = BALANCE.provisional.risk;

export type RiskCause = 'void-block' | 'absorb' | 'late-lap' | 'release' | 'rest' | 'nest-action';

/** 엔진 공통 이벤트. 화면이 비워 가며(drainEvents) 연출한다 */
export type EngineEvent =
  | { kind: 'breakthrough'; lap: number; cell: number; risk: number }
  /** 진화 임박 알림 (GDD 20-5 v4.1): level 1 = 남은 걸음 20%, 2 = 10%. 수치는 화면에 보이지 않는다 */
  | { kind: 'evolution-near'; level: number };

/** 리스크를 들고 있는 상태(원정 상태가 이를 확장한다) */
export interface RiskState {
  lap: number;
  pos: number;
  /** 리스크 게이지 값 (0 ~ limit) */
  risk: number;
  /** 이번 원정의 최고치 */
  riskPeak: number;
  /** 안정 수치 (호로 자아 / 사신 영압 안정도). 컨디션·허기와 별개 */
  stability: number;
  /** 이번 원정에서 한계 돌파가 일어났는가 → 남은 동안 임시 페널티 */
  breakthrough: { lap: number; cell: number } | null;
  events: EngineEvent[];
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** 리스크 변화. 한계값 이상이 되면 (원정당 1번) breakthrough 이벤트. 값은 한계값에서 멈춘다 */
export function changeRisk(s: RiskState, delta: number, _cause: RiskCause): void {
  s.risk = clamp(s.risk + delta, 0, RX.limit);
  s.riskPeak = Math.max(s.riskPeak, s.risk);
  if (s.risk >= RX.limit && s.breakthrough === null) {
    s.breakthrough = { lap: s.lap, cell: s.pos };
    s.events.push({ kind: 'breakthrough', lap: s.lap, cell: s.pos, risk: s.risk });
  }
}

export function changeStability(s: { stability: number }, delta: number): void {
  s.stability = clamp(s.stability + delta, 0, RX.stabilityMax);
}

/** 강한 적을 흡수했을 때의 상승량: 적 강함(hpInAttacks)에 비례 — 강적이 일반 적의 약 2배 */
export function absorbRisk(strength: number): number {
  return strength * RX.absorbPerHpAttack;
}

/** 5바퀴째부터 칸을 지날 때마다 오르는 양 (GDD 5장 "5바퀴 이후") */
export function lateLapRisk(lap: number, lateLapStart: number): number {
  return lap >= lateLapStart ? (lap - lateLapStart + 1) * RX.lateLapPerTile : 0;
}

/** 놓아주기: 리스크 하락 + 안정 수치 상승 */
export function releaseEffect(s: RiskState): void {
  changeRisk(s, -RX.releaseRelief, 'release');
  changeStability(s, RX.releaseStability);
}

/** 돌파 임시 페널티: 그 원정 남은 동안 공허 생성률 가산 */
export function breakthroughSpawnBonus(s: RiskState): number {
  return s.breakthrough ? RX.breakthroughSpawnBonus : 0;
}

/** 둥지 쪽 수치 (저장 구조 NestState 가 들고 있다) */
export interface NestRisk {
  risk: number;
  stability: number;
}

/** 둥지 행동: 리스크 하락 + 안정 수치 상승 (GDD 5장 "둥지 쓰다듬기" 등, 행동별 수치는 임시) */
export function nestRiskAction(n: NestRisk, action: NestAction): void {
  const e = RX.nestActions[action];
  n.risk = clamp(n.risk + e.risk, 0, RX.limit);
  n.stability = clamp(n.stability + e.stability, 0, RX.stabilityMax);
}

/** 원정이 끝나 둥지로 돌아올 때: 게이지 값을 둥지 저장값으로 합친다.
 *  돌파했으면 안정 수치 하락(임시 페널티)하고 게이지는 riskAfterBreakthrough 아래로 가라앉는다(바로 또 돌파하지 않게) */
export function settleRiskToNest(n: NestRisk, s: RiskState): void {
  n.risk = s.risk;
  n.stability = s.stability;
  if (s.breakthrough) {
    n.stability = clamp(n.stability - RX.breakthroughStabilityLoss, 0, RX.stabilityMax);
    n.risk = Math.min(n.risk, RX.riskAfterBreakthrough);
  }
}
