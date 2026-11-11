// 둥지 / 대원실 (GDD 7장, P2 → 102장 돌봄 패널티 C.175): 허기·컨디션·영압 안정도·교감 수치와 돌봄 행동, 시간 흐름, 쇠약·피곤·쓰러짐·사망 상태. 종족 무관 순수 로직.
// 행동 이름·문구는 종족 설정(FactionConfig.nestActions)에서 읽는다. 수치는 balance.ts provisional.nest(care·bond).

import { BALANCE } from '../config/balance';
import { nestRiskAction, settleRiskToNest } from './absorb/risk';
import type { FoodId, NestAction } from './faction';
import { foodTypeOf, type FoodReaction } from './foodPref';
import type { ExpeditionState } from './expedition';
import { conditionFloor, summarize } from './expedition';

const NX = BALANCE.provisional.nest;
const MAX = BALANCE.provisional.expedition.conditionMax;

export interface NestState {
  /** 0(배부름) ~ 100. 시간이 지나며 오른다 (화면 배부름 = 100 − 허기, GDD 102-1) */
  hunger: number;
  /** 0(최악) ~ 100. 나쁘면 전투 시작 보드의 공허 타일이 늘어난다 */
  condition: number;
  /** 쇠약 (GDD 102-2, C.175): 배부름이 care.weakFullness 이하가 되는 순간 걸린다. 배부름을 넘긴 뒤 원정을 한 번 마치거나 링거로만 풀린다(먹이·재우기로는 안 풀림).
   *  C.175 전에는 '패배 후 쇠약'이었다 — 패배는 이제 쓰러짐(collapsed) */
  weakened: boolean;
  /** 피곤 (GDD 102-2): 컨디션이 care.tiredCondition 이하가 되는 순간. 컨디션을 넘긴 뒤 원정 한 번 또는 에너지 드링크 */
  tired: boolean;
  /** 빈사 (GDD 102-3, v5.228 수정 — 옛 쓰러짐): collapseHours 미접속 또는 원정 패배. 구급상자로만 풀림. 모험은 되지만 체력 10%·속도·보상 절반, 지면 사망 */
  collapsed: boolean;
  /** 빈사가 된 시각(ms). 여기부터 실제 시간 deathHoursOf(교감) 이 지나면 사망. 빈사가 아니면 0 */
  collapsedAt: number;
  /** 사망 (GDD 102-3): 빈사 시간이 다 됐거나 빈사에서 졌다. 할 수 있는 건 부활뿐 */
  dead: boolean;
  /** 출발 때 정한 '이번 원정을 마치고 돌아오면 풀릴 상태' (GDD 102-2: 수치를 되돌린 뒤 원정 한 번). 출발 때 수치가 문턱을 넘었으면 true */
  cureOnReturn: { weak: boolean; tired: boolean };
  /** 교감 (GDD 102-6): 0~bond.max. 먹이·재우기·쓰다듬기로만 오르고(약 안 됨) 하루 최대 dailyMax */
  bond: number;
  /** 교감이 오른 날(기기 시계 0시 기준 'YYYY-MM-DD')과 그날 오른 양 */
  bondDay: string;
  bondToday: number;
  /** 리스크 게이지(호로 광기 / 사신 호로화) 둥지 저장값. 원정은 이 값으로 시작하고 귀환하면 합쳐진다 */
  risk: number;
  /** 안정 수치(호로 자아 / 사신 영압 안정도). 컨디션·허기와 별개 */
  stability: number;
  /** 마지막으로 방치 허기를 계산한 시각(ms) */
  lastTickMs: number;
  /** 돌봄 요청 (GDD 82장): 캐릭터가 지금 원하는 돌봄(쓰다듬기·재우기)과 유지 끝 시각. 없으면 null */
  careRequest: CareRequest | null;
  /** 다음 돌봄 요청이 나올 시각(ms). 지난 뒤 방에 오면(오프라인 복귀 포함) 요청이 하나 생긴다 — 쌓이지 않고 최대 1개 */
  nextCareAt: number;
  /** 먹이 한도 (GDD 109장 6, C.181): 지금 묶음에서 먹은 개수와 마지막으로 먹은 시각(ms, 0 = 없음). 마지막으로 먹은 뒤 feedLimit.windowMinutes 가 지나면 묶음이 새로 시작 */
  feedCount: number;
  lastFedAt: number;
  /** 같은 먹이 한도 (GDD 234장 3, C.387 · 형식 70): 종류별로 지금 묶음에서 먹은 개수와 그 종류를 마지막으로 먹은 시각(ms). 그 뒤 feedLimit.windowMinutes 가 지나면 그 종류 묶음이 새로 시작 */
  foodStreak: Partial<Record<FoodId, FoodStreak>>;
  /** 비선호 일반 먹이를 연달아 먹은 횟수 (GDD 235장 2, 형식 70): 비선호가 아닌 먹이를 먹으면 0. 2번째부터 교감 −foodPref.dislikeRunLoss */
  dislikeRun: number;
  /** 홈 체력 (GDD 123장 2, C.198): 최대 체력 대비 비율 0~1. 원정 출발 체력이 되고 원정이 끝나면 남은 체력으로 돌아온다(귀환해도 가득 아님). 빈사면 상한 care.dying.hpFraction */
  hpFraction: number;
  /** 온천에 있는 중 (GDD 123장 4): 들어간 시각과 그때 체력·배부름(런 로그용). 방에 있으면 null. 앱을 꺼도 유지되고, 체력 상한 또는 배부름 0 이면 저절로 나온다 */
  spa: SpaStay | null;
}

/** 같은 먹이 묶음 (GDD 234장 3): 개수·마지막으로 먹인 시각 */
export interface FoodStreak {
  count: number;
  at: number;
}

/** 온천에 들어간 기록 (런 로그 홈 회복에 남긴다) */
export interface SpaStay {
  at: number;
  hp: number;
  fullness: number;
  /** 튜토리얼 온천 (GDD 145장 1, 형식 57): 옛 빠르기(homeHp.tutorialSpa, 10초에 가득) — 평소 온천은 약 20초(GDD 164장) */
  fast?: true;
}

/** 온천에서 나온 결과 (GDD 123장 4): reason = full(체력 상한) / hungry(배부름 0) / left(뒤로) / away(원정·빈사로 끊김) */
export interface SpaEnd {
  at: number;
  minutes: number;
  hpFrom: number;
  hpTo: number;
  fullnessFrom: number;
  fullnessTo: number;
  reason: 'full' | 'hungry' | 'left' | 'away';
}

/** 요청 대상 돌봄 (GDD 82장): 먹이는 요청제가 아니다 */
export type CareAction = Exclude<NestAction, 'feed'>;
export const CARE_ACTIONS: readonly CareAction[] = ['pet', 'sleep'];
export interface CareRequest {
  action: CareAction;
  /** 요청이 사라지는 시각(ms). 놓쳐도 벌칙 없음 */
  until: number;
}
/** 돌봄 버튼을 눌렀을 때 결과: answered = 요청에 응답(효과 있음) / refused = 요청이 없거나 다른 요청(거절, 효과 없음) */
export type CareOutcome = 'answered' | 'refused';

export function newNest(nowMs: number): NestState {
  return { hunger: NX.startHunger, condition: NX.startCondition, weakened: false, tired: false, collapsed: false, collapsedAt: 0, dead: false, cureOnReturn: { weak: false, tired: false }, bond: 0, bondDay: '', bondToday: 0, risk: 0, stability: BALANCE.provisional.risk.stabilityStart, lastTickMs: nowMs, careRequest: null, nextCareAt: nowMs + NX.careRequest.firstDelayMinutes * 60_000, feedCount: 0, lastFedAt: 0, foodStreak: {}, dislikeRun: 0, hpFraction: 1, spa: null };
}

const CR = NX.careRequest;
const CP = NX.care;
const BX = NX.bond;
const HOUR = 3_600_000;
/** 다음 요청까지 간격(ms): intervalMinutes 범위에서 무작위 */
function careInterval(rand: () => number): number {
  const [lo, hi] = CR.intervalMinutes;
  return (lo + (hi - lo) * rand()) * 60_000;
}

/**
 * 돌봄 요청 시계 (GDD 82장). 방에 있을 때 주기적으로, 그리고 방을 열 때 부른다.
 *  - 요청이 유지 시간을 넘겼으면 사라진다(놓침, 벌칙 없음). 다음 시각 = 사라진 시각 + 간격.
 *  - 요청이 없고 다음 시각이 지났으면 새 요청 하나(지금부터 holdMinutes 유지). 오래 꺼 두었다 와도 하나만 생긴다.
 *  - 피곤이거나 컨디션이 sleepBelowCondition 미만이면 재우기를 청한다(쇠약·낮은 컨디션은 재우기로 푸는 것이라, 코드 판단). 아니면 sleepWeight 확률로 재우기, 나머지 쓰다듬기.
 * 돌려주는 값: created = 새 요청이 생김, missed = 응답 못 한 요청이 사라짐 (오래 꺼 두었다 오면 둘 다 true 일 수 있다)
 */
export function tickCareRequest(nest: NestState, nowMs: number, rand: () => number = Math.random): { created: boolean; missed: boolean } {
  let missed = false;
  if (nest.careRequest && nowMs >= nest.careRequest.until) {
    nest.nextCareAt = Math.max(nest.nextCareAt, nest.careRequest.until + careInterval(rand));
    nest.careRequest = null;
    missed = true;
  }
  if (!nest.careRequest && nowMs >= nest.nextCareAt) {
    const action: CareAction = nest.tired || nest.condition < CR.sleepBelowCondition || rand() < CR.sleepWeight ? 'sleep' : 'pet';
    nest.careRequest = { action, until: nowMs + CR.holdMinutes * 60_000 };
    return { created: true, missed };
  }
  return { created: false, missed };
}

/** 쓰다듬기·재우기 버튼 (GDD 82장): 같은 요청이 살아 있으면 응답 — 지금 수치 그대로 효과, 요청은 풀리고 다음 시각을 새로 잡는다.
 *  요청이 없거나 다른 요청이면 거절 — 효과 없음, 요청은 그대로 남는다 */
export function respondCare(nest: NestState, action: CareAction, nowMs: number, rand: () => number = Math.random): CareOutcome {
  const r = nest.careRequest;
  if (!r || r.action !== action || nowMs >= r.until) return 'refused';
  doNestAction(nest, action, 'basic', nowMs);
  nest.careRequest = null;
  nest.nextCareAt = nowMs + careInterval(rand);
  return 'answered';
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** 배부름 (화면 값) = 100 − 허기 */
export function fullnessOfNest(nest: Pick<NestState, 'hunger'>): number {
  return 100 - nest.hunger;
}

/** 쇠약·피곤이 걸리는 순간 (GDD 102-2): 문턱 이하가 되면 켠다. 끄는 것은 원정 귀환(applyExpeditionEnd)·약(cureStatus)뿐 */
export function refreshCareStatus(nest: NestState): void {
  if (fullnessOfNest(nest) <= CP.weakFullness) nest.weakened = true;
  if (nest.condition <= CP.tiredCondition) nest.tired = true;
}

/** 시간 흐름 변화량 */
export interface TimeFlow {
  hunger: number;
  condition: number;
  stability: number;
  /** 홈 체력 변화 (비율, GDD 123장 4) */
  hp?: number;
  /** 이 시간 안에 온천에서 저절로 나왔으면 그 결과 */
  spaEnded?: SpaEnd | null;
}

// ── 홈 체력 (GDD 123장 2·4, C.198) ──
const HH = NX.homeHp;

/** 지금 홈 체력 상한: 빈사면 care.dying.hpFraction(10%), 아니면 1 */
export function homeHpCap(nest: Pick<NestState, 'collapsed'>): number {
  return nest.collapsed ? CP.dying.hpFraction : 1;
}

/** 홈 체력 (0~상한) */
export function homeHpOf(nest: Pick<NestState, 'hpFraction' | 'collapsed'>): number {
  const v = Number.isFinite(nest.hpFraction) ? nest.hpFraction : 1;
  return clamp(v, 0, homeHpCap(nest));
}

/** 온천을 끝낸다 (기록을 돌려준다). 온천이 아니면 null */
function closeSpa(nest: NestState, atMs: number, reason: SpaEnd['reason']): SpaEnd | null {
  const st = nest.spa;
  if (!st) return null;
  nest.spa = null;
  return { at: atMs, minutes: Math.max(0, (atMs - st.at) / 60_000), hpFrom: st.hp, hpTo: homeHpOf(nest), fullnessFrom: st.fullness, fullnessTo: fullnessOfNest(nest), reason };
}

/** 홈 체력 즉시 회복 (먹이·포션·튜토리얼): 상한까지. 오른 양. 온천에서 상한에 닿으면 저절로 나온다(그 결과는 spaEnded 로 돌려받으려면 healHome 대신 부르는 쪽이 leaveSpa) */
export function healHomeHp(nest: NestState, amount: number): number {
  if (nest.dead) return 0;
  const before = homeHpOf(nest);
  nest.hpFraction = Math.min(homeHpCap(nest), before + Math.max(0, amount));
  return nest.hpFraction - before;
}

/** 홈 체력을 그 값으로 맞춘다 (튜토리얼 연출 — 상한 안). 바뀐 뒤 값 */
export function setHomeHp(nest: NestState, fraction: number): number {
  nest.hpFraction = clamp(Number.isFinite(fraction) ? fraction : 1, 0, homeHpCap(nest));
  return nest.hpFraction;
}

/** 온천에서 더 오를 게 없다: 체력 상한과 컨디션 가득 둘 다 (GDD 135장 2) */
export function spaFull(nest: Pick<NestState, 'hpFraction' | 'collapsed' | 'condition'>): boolean {
  return homeHpOf(nest) >= homeHpCap(nest) - 1e-9 && nest.condition >= MAX - 1e-9;
}

/** 온천에 들어간다 (GDD 123장 4): 사망·이미 온천·체력·컨디션 둘 다 가득(135장 2)·배부름 0 이면 못 들어간다(이유). 들어가면 null */
export function enterSpa(nest: NestState, nowMs: number, fast = false): 'dead' | 'already' | 'full' | 'hungry' | null {
  if (nest.dead) return 'dead';
  if (nest.spa) return 'already';
  if (spaFull(nest)) return 'full';
  if (fullnessOfNest(nest) <= 0) return 'hungry';
  nest.spa = { at: nowMs, hp: homeHpOf(nest), fullness: fullnessOfNest(nest), ...(fast ? { fast: true as const } : {}) };
  return null;
}

/** 온천에서 나온다 (뒤로). 온천이 아니면 null */
export function leaveSpa(nest: NestState, nowMs: number, reason: SpaEnd['reason'] = 'left'): SpaEnd | null {
  return closeSpa(nest, nowMs, reason);
}

/** 온천 빠르기 (GDD 145장 1): 평소 = homeHp.spa(약 20초에 가득, GDD 164장), 튜토리얼 온천 = homeHp.tutorialSpa(10초) */
export function spaRateOf(stay: Pick<SpaStay, 'fast'> | null | undefined): { hpPerSecond: number; conditionPerSecond: number; fullnessPerSecond: number } {
  return stay?.fast ? HH.tutorialSpa : HH.spa;
}

/** 온천 시간 한 토막: 1초에 체력 +spa.hpPerSecond·컨디션 +spa.conditionPerSecond(GDD 135장 2·139장 2)·배부름 −spa.fullnessPerSecond (아래 계산은 분 단위라 ×60), 체력 상한과 컨디션 가득 둘 다 닿거나 배부름 0 이 되는 순간 저절로 나온다.
 *  startMs = 이 토막이 시작한 시각(나온 시각 계산용). 온천에서 보낸 분과 나온 결과 */
function spaStep(nest: NestState, minutes: number, startMs: number): { used: number; ended: SpaEnd | null } {
  if (!nest.spa || minutes <= 0) return { used: 0, ended: null };
  const cap = homeHpCap(nest);
  nest.hpFraction = homeHpOf(nest);
  const rate = spaRateOf(nest.spa);
  const hpPm = rate.hpPerSecond * 60;
  const condPm = rate.conditionPerSecond * 60;
  const fullPm = rate.fullnessPerSecond * 60;
  const toCap = Math.max(0, (cap - nest.hpFraction) / hpPm, (MAX - nest.condition) / condPm);
  const toEmpty = Math.max(0, fullnessOfNest(nest) / fullPm);
  const used = Math.min(minutes, toCap, toEmpty);
  nest.hpFraction = Math.min(cap, nest.hpFraction + used * hpPm);
  nest.condition = Math.min(MAX, nest.condition + used * condPm);
  nest.hunger = clamp(nest.hunger + used * fullPm, 0, 100);
  const full = spaFull(nest);
  const ended = full || fullnessOfNest(nest) <= 1e-9 ? closeSpa(nest, Math.round(startMs + used * 60_000), full ? 'full' : 'hungry') : null;
  return { used, ended };
}

/** 온천 시간을 바로 흘린다 (GDD 123장 4 — 튜토리얼 회복 안내 '쉬게 하기'): 온천이 아니면 들어가서 minutes 분 만큼. 나오지는 않는다(상한·배부름 0 이면 저절로 나옴).
 *  들어갈 수 없으면(enterSpa 이유) 아무것도 안 바뀐다. 오른 체력과 저절로 나온 결과 */
export function soakSpa(nest: NestState, minutes: number, nowMs: number): { hp: number; ended: SpaEnd | null } {
  if (!nest.spa && enterSpa(nest, nowMs)) return { hp: 0, ended: null };
  const before = homeHpOf(nest);
  const r = spaStep(nest, Math.max(0, minutes), nowMs);
  return { hp: homeHpOf(nest) - before, ended: r.ended };
}

/** 지금 홈 체력 미리 보기 (방 체력 막대·온천 화면): 마지막으로 셈한 시각(lastTickMs)부터 지금까지 흘렀다고 치고 계산만 한다(세이브는 그대로).
 *  spaEnded = 그사이 온천에서 저절로 나왔을 결과 — 화면은 이걸 보고 tickIdle 로 실제 반영한 뒤 방으로 */
export function previewHomeHp(nest: NestState, nowMs: number): { fraction: number; fullness: number; condition: number; spaEnded: SpaEnd | null } {
  const c: NestState = { ...nest, spa: nest.spa ? { ...nest.spa } : null };
  const r = Number.isFinite(c.lastTickMs) && nowMs > c.lastTickMs ? passHomeHp(c, (nowMs - c.lastTickMs) / HOUR, nowMs) : { spaEnded: null };
  return { fraction: homeHpOf(c), fullness: fullnessOfNest(c), condition: c.condition, spaEnded: r.spaEnded };
}

/** 홈 체력 시간 흐름 (GDD 123장 4): 온천이면 온천 토막(spaStep) 뒤 남은 시간은 대기 회복. 대기 회복 = 1분에 +idlePerMinute, 빈사면 없음(온천은 빈사 상한까지).
 *  endMs = 이 구간이 끝나는 시각 */
export function passHomeHp(nest: NestState, hours: number, endMs: number): { hp: number; spaEnded: SpaEnd | null; spaMinutes: number } {
  if (nest.dead) return { hp: 0, spaEnded: null, spaMinutes: 0 };
  const before = homeHpOf(nest);
  nest.hpFraction = before;
  let minutes = Number.isFinite(hours) ? Math.max(0, hours) * 60 : 0;
  const spa = spaStep(nest, minutes, endMs - minutes * 60_000);
  minutes -= spa.used;
  if (!nest.spa && !nest.collapsed && minutes > 0) nest.hpFraction = Math.min(homeHpCap(nest), nest.hpFraction + minutes * HH.idlePerMinute);
  return { hp: nest.hpFraction - before, spaEnded: spa.ended, spaMinutes: spa.used };
}

/** 시간 흐름 (GDD 102-1): hours 동안 허기 +idleHungerPerHour/시, 배부름 conditionBelowFullness 이하면 컨디션 −conditionPerHour/시(배부름 0 이면 ×2),
 *  배부름 30 초과면 컨디션 그대로(홈 대기 회복 없음 — GDD 135장 수정 v5.315, 컨디션은 온천·잠·쓰다듬기로만 오름),
 *  offline(꺼 둔 동안)이면 영압 안정도 −stabilityPerHour/시(배부름 또는 컨디션 stabilityDoubleBelow 이하면 ×2). 0.1시간 걸음으로 나눠 그 순간 값으로 배율을 정하고, 걸음마다 쇠약·피곤을 본다.
 *  리스크·교감은 여기서 안 바뀐다. 변화량(음수 = 줄어듦, 허기는 오른 양)을 돌려준다 */
export function passNestTime(nest: NestState, hours: number, offline: boolean, endMs: number = Date.now()): TimeFlow {
  const before = { hunger: nest.hunger, condition: nest.condition, stability: nest.stability };
  // 홈 체력·온천 (GDD 123장 4): 온천 배부름 소모를 먼저 반영하고 아래 걸음이 그 값으로 쇠약·컨디션을 본다
  const home = passHomeHp(nest, hours, endMs);
  let left = Number.isFinite(hours) ? Math.max(0, hours) : 0;
  while (left > 1e-9) {
    const dt = Math.min(0.1, left);
    left -= dt;
    const full = fullnessOfNest(nest);
    const lowFull = full <= CP.conditionBelowFullness;
    if (lowFull) nest.condition = clamp(nest.condition - CP.conditionPerHour * dt * (full <= 0 ? 2 : 1), 0, MAX);
    if (offline) nest.stability = clamp(nest.stability - CP.stabilityPerHour * dt * (full <= CP.stabilityDoubleBelow || nest.condition <= CP.stabilityDoubleBelow ? 2 : 1), 0, BALANCE.provisional.risk.stabilityMax);
    nest.hunger = clamp(nest.hunger + NX.idleHungerPerHour * dt, 0, 100);
    refreshCareStatus(nest);
  }
  return { hunger: nest.hunger - before.hunger, condition: nest.condition - before.condition, stability: nest.stability - before.stability, hp: home.hp, spaEnded: home.spaEnded };
}

/** 교감 문턱 표 [[문턱, 값], …](높은 것부터)에서 지금 교감의 값 */
export function byBond(table: readonly (readonly [number, number])[], bond: number): number {
  for (const [at, v] of table) if (bond >= at) return v;
  return table[table.length - 1]![1];
}

/** 빈사에서 사망까지 실제 시간(시간, GDD 102장 수정 v5.228): 6 + 교감 × 0.18 (교감 100 = 24시간) */
export function deathHoursOf(bond: number): number {
  return CP.dyingBaseHours + Math.max(0, bond) * CP.dyingHoursPerBond;
}

/** 빈사가 된다 (교감 −collapseLoss). 이미 빈사·사망이면 그대로 */
export function collapseNest(nest: NestState, atMs: number): boolean {
  if (nest.collapsed || nest.dead) return false;
  nest.collapsed = true;
  nest.collapsedAt = atMs;
  nest.bond = Math.max(0, nest.bond - BX.collapseLoss);
  // 빈사 = 체력 상한 10% (GDD 102장 수정·123장 4): 넘던 체력은 상한으로
  nest.hpFraction = homeHpOf(nest);
  return true;
}

/** 사망한다 (교감 절반, GDD 102-6) */
export function dieNest(nest: NestState): void {
  if (nest.dead) return;
  nest.dead = true;
  nest.bond = Math.floor(nest.bond / 2);
}

/** 빈사 남은 시간(ms). 빈사가 아니면 null */
export function dyingLeftMs(nest: Pick<NestState, 'collapsed' | 'collapsedAt' | 'bond' | 'dead'>, nowMs: number): number | null {
  if (!nest.collapsed || nest.dead) return null;
  return Math.max(0, nest.collapsedAt + deathHoursOf(nest.bond) * HOUR - nowMs);
}

/** 빈사 시간이 다 됐으면 사망 (실제 시간, 켜 있든 꺼 있든). 죽었으면 true */
export function checkDying(nest: NestState, nowMs: number): boolean {
  const left = dyingLeftMs(nest, nowMs);
  if (left === null || left > 0) return false;
  dieNest(nest);
  return true;
}

/** 부활 노력치 손실 비율 (GDD 102-6 ②): 50% → 교감 50 이상 40%, 80 이상 30% */
export function reviveEvLossOf(bond: number): number {
  return byBond(CP.reviveEvLoss, bond);
}

/** 교감 단계 (GDD 102-6 ④): 0 서먹 / 1 친함 / 2 단짝 */
export function bondStage(bond: number): 0 | 1 | 2 {
  return bond >= BX.stages[1] ? 2 : bond >= BX.stages[0] ? 1 : 0;
}

/** 대기 보상 교감 보너스 (GDD 102-6 ③): +교감 × idleBonusPerPoint, 최대 idleBonusMax */
export function bondIdleBonus(bond: number): number {
  return Math.min(BX.idleBonusMax, Math.max(0, bond) * BX.idleBonusPerPoint);
}

/** 기기 시계 날짜 키 (0시 기준) */
export function dayKey(nowMs: number): string {
  const d = new Date(nowMs);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 교감 오름 (GDD 102-6): 하루 dailyMax 까지. 오른 양 */
export function gainBond(nest: NestState, amount: number, nowMs: number): number {
  const day = dayKey(nowMs);
  if (nest.bondDay !== day) {
    nest.bondDay = day;
    nest.bondToday = 0;
  }
  const add = Math.max(0, Math.min(amount, BX.dailyMax - nest.bondToday, BX.max - nest.bond));
  nest.bond += add;
  nest.bondToday += add;
  return add;
}

/** 다시 열었을 때 꺼 둔 동안의 결과 (복귀 알림 띠·런 로그) */
export interface AbsenceReport {
  /** 비운 실제 시간 */
  hours: number;
  flow: TimeFlow;
  /** 교감 변화(음수) */
  bond: number;
  /** 이번에 새로 쓰러졌나 / 죽었나 */
  collapsed: boolean;
  died: boolean;
}

/** 꺼 둔 동안 (GDD 24-1 → 102-1·102-3): 마지막 접속 시각부터 시간 흐름(offline), 교감 decayHours 마다 −1, 그리고
 *  collapseHours 이상 비웠으면 빈사(그 시각부터, 교감 −collapseLoss) · 빈사 시간(실제 시간, deathHoursOf)이 지났으면 사망(교감 절반).
 *  paused(원정 중간 저장이 있음)·사망 상태면 아무것도 안 바뀐다. 기기 시계를 되돌렸으면(지금이 마지막 접속보다 앞) 0. 접속 시각 갱신은 부르는 쪽이 한다 */
export function applyAbsenceTime(nest: NestState, lastSeenAt: number, nowMs: number, paused = false): AbsenceReport {
  const none: AbsenceReport = { hours: 0, flow: { hunger: 0, condition: 0, stability: 0, hp: 0, spaEnded: null }, bond: 0, collapsed: false, died: false };
  if (paused || nest.dead || !Number.isFinite(lastSeenAt) || nowMs <= lastSeenAt) return none;
  const hours = (nowMs - lastSeenAt) / HOUR;
  const bond0 = nest.bond;
  const flow = passNestTime(nest, hours, true, nowMs);
  nest.bond = Math.max(0, nest.bond - Math.floor(hours / BX.decayHours));
  const collapsed = hours >= CP.collapseHours && collapseNest(nest, lastSeenAt + CP.collapseHours * HOUR);
  const died = checkDying(nest, nowMs);
  nest.lastTickMs = nowMs;
  return { hours, flow, bond: nest.bond - bond0, collapsed, died };
}

/** 옛 이름 (C.140~C.174): 꺼 둔 동안 허기 오른 양만 돌려준다 */
export function applyAbsenceHunger(nest: NestState, lastSeenAt: number, nowMs: number, paused = false): number {
  return applyAbsenceTime(nest, lastSeenAt, nowMs, paused).flow.hunger;
}

/** 켜 둔 동안 시간 흐름 (GDD 102-1): 마지막으로 셈한 시각(lastTickMs)부터 지금까지. 영압 안정도는 안 줄고(돌봄 요청이 그 역할), 48시간 미접속 빈사는 없다(접속이 곧 '왔다').
 *  빈사 시간은 켜 있어도 흐른다(v5.228) — 다 되면 사망. paused(원정 중 — 원정은 자기 허기·컨디션을 쓴다, 빈사 사망은 귀환 때 본다)·사망이면 시각만 옮긴다. 시계를 되돌렸으면 그대로 */
export function tickNestOnline(nest: NestState, nowMs: number, paused = false): TimeFlow | null {
  if (!Number.isFinite(nest.lastTickMs) || nowMs <= nest.lastTickMs) return null;
  const hours = (nowMs - nest.lastTickMs) / HOUR;
  nest.lastTickMs = nowMs;
  if (paused || nest.dead) return null;
  const flow = passNestTime(nest, hours, false, nowMs);
  checkDying(nest, nowMs);
  return flow;
}

/** 돌봄 상태 이름 (GDD 102장): 두 종족 공통 */
export const CARE_STATUS_NAMES = { collapsed: '빈사', weak: '쇠약', tired: '피곤', dead: '사망' } as const;

/** 약 (GDD 102-4): 그 상태 하나만 푼다. 수치는 안 바뀐다. 풀렸으면 true */
export type CareStatus = 'collapsed' | 'weak' | 'tired';
export function cureStatus(nest: NestState, status: CareStatus): boolean {
  if (nest.dead) return false;
  if (status === 'collapsed' && nest.collapsed) {
    nest.collapsedAt = 0;
    return !(nest.collapsed = false);
  }
  if (status === 'weak' && nest.weakened) return !(nest.weakened = false);
  if (status === 'tired' && nest.tired) return !(nest.tired = false);
  return false;
}

/** 출발 (GDD 102-2): 지금 수치가 문턱을 넘었으면 이번 원정을 마치고 돌아올 때 그 상태가 풀린다. 원정에 실을 쇠약·피곤·빈사를 돌려준다 */
export function departCare(nest: NestState): { weak: boolean; tired: boolean; dying: boolean } {
  nest.cureOnReturn = { weak: fullnessOfNest(nest) > CP.weakFullness, tired: nest.condition > CP.tiredCondition };
  return { weak: nest.weakened, tired: nest.tired, dying: nest.collapsed };
}

/** 먹이 한 개의 체력 회복(최대 체력 대비): 유형별(GDD 235장 5), 체력 가득 특식은 1 */
export function foodHpHeal(food: FoodId): number {
  const d = NX.foods[food];
  if (d?.hpFull) return 1;
  return NX.foodTypes[foodTypeOf(food)].heal;
}

/** 먹이 한 종류의 기본 효과 (GDD 235장): 유형의 배부름·교감 + 특식 추가 효과(컨디션·리스크). 선호·비선호 배율 전 값. 임시 수치 (BALANCE.provisional.nest.foodTypes·foods) */
export function foodEffect(food: FoodId): { hunger: number; condition: number; risk: number; bond: number } {
  const d = NX.foods[food];
  const t = NX.foodTypes[foodTypeOf(food)];
  return { hunger: t.hunger, condition: d?.condition ?? 0, risk: d?.risk ?? 0, bond: t.bond };
}

/** 먹이 효과 한 줄의 값 이름 (GDD 211장 · 235장): hunger = 배부름 +, cond = 컨디션 ±, risk = 리스크 게이지 +, hp = 홈 체력 +(최대 체력 %), bond = 교감 ± */
export type FoodFxKey = 'hunger' | 'cond' | 'risk' | 'hp' | 'bond';
export interface FoodFx { key: FoodFxKey; amount: number }

/** 먹이 한 개의 효과 전부 (GDD 211장 — 먹이 = 이 목록뿐. 선호·비선호는 표 없이 먹을 때 반응으로만, 235장 2). 방 먹이 카드·가방·상점 설명과 실제 적용(doNestAction feed)이 같은 값을 쓴다.
 *  순서 = 배부름 · 컨디션 · 리스크 · 체력 · 교감. 0 인 값은 뺀다 */
export function foodEffectList(food: FoodId): FoodFx[] {
  const f = foodEffect(food);
  const out: FoodFx[] = [];
  if (f.hunger) out.push({ key: 'hunger', amount: f.hunger });
  if (f.condition) out.push({ key: 'cond', amount: f.condition });
  if (f.risk) out.push({ key: 'risk', amount: f.risk });
  const hp = Math.round(foodHpHeal(food) * 100);
  if (hp) out.push({ key: 'hp', amount: hp });
  if (f.bond) out.push({ key: 'bond', amount: f.bond });
  return out;
}

/** 지금 먹이면 실제로 움직이는 효과만 (GDD 193장 16 '가득이면 안 보임' + 211장): 가득·상한·하루 교감 한도에 닿은 값은 뺀다. 줄이는 효과는 0 이 아닐 때만 */
export function foodEffectsNow(food: FoodId, nest: NestState, nowMs: number = Date.now()): FoodFx[] {
  const bondLeft = Math.min(BX.max - nest.bond, nest.bondDay === dayKey(nowMs) ? BX.dailyMax - nest.bondToday : BX.dailyMax);
  return foodEffectList(food).filter((e) => {
    switch (e.key) {
      case 'hunger': return nest.hunger > 0;
      case 'cond': return e.amount > 0 ? nest.condition < MAX : nest.condition > 0;
      case 'hp': return !nest.dead && homeHpOf(nest) < homeHpCap(nest);
      case 'risk': return e.amount > 0 ? nest.risk < RISK_LIMIT : nest.risk > 0;
      case 'bond': return e.amount > 0 ? bondLeft > 0 : nest.bond > 0;
    }
  });
}

const FL = NX.feedLimit;
const FP = NX.foodPref;
const RISK_LIMIT = BALANCE.provisional.risk.limit;
/** 지금 먹일 수 있는 남은 개수 (GDD 109장 6): 마지막으로 먹은 뒤 windowMinutes 가 지났으면(또는 시계를 되돌렸으면) max */
export function feedsLeft(nest: Pick<NestState, 'feedCount' | 'lastFedAt'>, nowMs: number): number {
  if (!nest.lastFedAt || nowMs - nest.lastFedAt >= FL.windowMinutes * 60_000 || nowMs < nest.lastFedAt) return FL.max;
  return Math.max(0, FL.max - nest.feedCount);
}

/** 묶음이 다시 열릴 때까지 남은 시간(ms). 지금 먹일 수 있으면 0 */
export function feedResetMs(nest: Pick<NestState, 'feedCount' | 'lastFedAt'>, nowMs: number): number {
  return feedsLeft(nest, nowMs) > 0 ? 0 : Math.max(0, nest.lastFedAt + FL.windowMinutes * 60_000 - nowMs);
}

/** 같은 먹이를 지금 더 먹일 수 있는 개수 (GDD 234장 3): 그 종류를 마지막으로 먹인 뒤 windowMinutes 가 지났으면(또는 시계를 되돌렸으면) sameMax */
export function sameFoodLeft(nest: Pick<NestState, 'foodStreak'>, food: FoodId, nowMs: number): number {
  const st = nest.foodStreak?.[food];
  if (!st || !st.at || nowMs - st.at >= FL.windowMinutes * 60_000 || nowMs < st.at) return FL.sameMax;
  return Math.max(0, FL.sameMax - st.count);
}

/** 먹이 하나를 먹인다 (GDD 109장 6 · 234장 3): 같은 종류를 10분 안에 sameMax 개 먹었으면 거절(refused — 아무것도 안 바뀜, 먹이 차감도 하지 않는다).
 *  그 밖에 전체 남은 개수가 있으면 먹음(doNestAction feed, 묶음 +1, 마지막 시각 = 지금, 그 종류 묶음 +1).
 *  없으면 뱉음 — 효과·교감 없음, 마지막 시각도 그대로(뱉은 건 '먹인 것'이 아니다). 먹이 개수 차감은 부르는 쪽 */
export function feedFood(nest: NestState, food: FoodId, nowMs: number, reaction: FoodReaction = null): 'ate' | 'spat' | 'refused' {
  if (sameFoodLeft(nest, food, nowMs) <= 0) return 'refused';
  if (feedsLeft(nest, nowMs) <= 0) return 'spat';
  if (feedsLeft(nest, nowMs) >= FL.max) nest.feedCount = 0;
  const sameFresh = sameFoodLeft(nest, food, nowMs) >= FL.sameMax;
  doNestAction(nest, 'feed', food, nowMs, reaction);
  nest.feedCount++;
  nest.lastFedAt = nowMs;
  if (!nest.foodStreak) nest.foodStreak = {};
  nest.foodStreak[food] = { count: (sameFresh ? 0 : nest.foodStreak[food]?.count ?? 0) + 1, at: nowMs };
  return 'ate';
}

/** 같은 먹이 한도를 그 종류만 비운다 (GDD 234장 3 — 튜토리얼 회복 안내 먹이 단계는 막히지 않게) */
export function clearFoodStreak(nest: NestState, food: FoodId): void {
  if (nest.foodStreak) delete nest.foodStreak[food];
}

/** 둥지 행동: 먹이(배부름↑ — 유형·특식 효과, GDD 235장) / 재우기(컨디션↑) / 쓰다듬기(컨디션 소량↑) — 재우기·쓰다듬기는 배부름 −careFullnessCost(GDD 170장 1). food 는 먹이일 때만 쓰고 기본은 basic.
 *  reaction (GDD 235장 2·3): like = 배부름·교감 ×likeMult, dislike = 배부름 ×dislikeHunger·교감 0(연달아 2번째부터 −dislikeRunLoss), cheap 은 유형 교감(−1) 그대로.
 *  C.175 (GDD 102-2·102-6): 수치만 올리고 쇠약·피곤은 안 푼다. 교감 +bond.gain(하루 상한) — 먹이는 유형 교감 */
export function doNestAction(nest: NestState, action: NestAction, food: FoodId = 'basic', nowMs: number = Date.now(), reaction: FoodReaction = null): void {
  let bond: number = BX.gain[action];
  if (action === 'feed') {
    const f = foodEffect(food);
    let hunger = f.hunger;
    bond = f.bond;
    if (reaction === 'like') {
      hunger *= FP.likeMult;
      bond *= FP.likeMult;
    } else if (reaction === 'dislike') {
      hunger = Math.round(hunger * FP.dislikeHunger);
      nest.dislikeRun = (nest.dislikeRun ?? 0) + 1;
      bond = nest.dislikeRun >= 2 ? -FP.dislikeRunLoss : 0;
    }
    if (reaction !== 'dislike') nest.dislikeRun = 0;
    nest.hunger = clamp(nest.hunger - hunger, 0, 100);
    nest.condition = clamp(nest.condition + f.condition, 0, MAX);
    if (f.risk) nest.risk = clamp(nest.risk + f.risk, 0, RISK_LIMIT); // 특식 리스크 (GDD 235장 1)
    healHomeHp(nest, foodHpHeal(food)); // 먹이 체력 회복 (GDD 123장 4 · 235장 5)
  } else {
    nest.condition = clamp(nest.condition + (action === 'sleep' ? NX.sleepCondition : NX.petCondition), 0, MAX);
    // 돌보기도 배가 꺼진다 (GDD 170장 1): 배부름 −careFullnessCost(0 아래 없음), 쇠약 문턱 아래로 내려가면 지금 규칙 그대로 쇠약
    nest.hunger = clamp(nest.hunger + NX.careFullnessCost, 0, 100);
    refreshCareStatus(nest);
  }
  nestRiskAction(nest, action);
  if (bond > 0) gainBond(nest, bond, nowMs);
  else if (bond < 0) nest.bond = Math.max(0, nest.bond + bond); // 싸구려·비선호 연속 (GDD 235장): 하루 한도와 상관없이 깎인다
}

/** 원정이 끝나 둥지로 돌아갈 때의 허기·컨디션 (결과 화면 표시와 둥지 갱신이 같은 값을 쓴다, C.68). 패배: 허기 가산 + 컨디션 급락. 폭주했으면 컨디션 추가 하락 */
export function expeditionEndVitals(exp: ExpeditionState): { hunger: number; condition: number } {
  const defeated = summarize(exp).outcome === 'defeated';
  const hunger = Math.min(100, exp.hunger + (defeated ? NX.defeatHunger : 0));
  let condition = defeated ? Math.min(exp.condition, NX.defeatCondition) : exp.condition;
  // 폭주(폭주(호로화))한 원정에서 돌아오면 컨디션 −30 (GDD 23-2). 패배로 돌아와도 같다.
  // 단 바퀴당 감소 하한(GDD 42장 3번) 아래로는 안 깎는다 — 패배 급락(defeatCondition)은 그대로 두고 폭주분만 막는다
  if (exp.breakthrough) condition = Math.max(clamp(condition - BALANCE.provisional.risk.frenzyConditionLoss, 0, MAX), conditionFloor({ ...exp, condition }));
  return { hunger, condition };
}

/** 원정이 끝난 뒤 둥지 상태 갱신. 귀환: 원정에서 남은 허기·컨디션 그대로. 패배: 빈사(GDD 102-3, 교감 −collapseLoss) — 이미 빈사였으면 사망 + 컨디션 급락. 폭주했으면 컨디션 추가 하락.
 *  귀환이면 출발 때 정한 cureOnReturn 대로 쇠약·피곤이 풀리고(GDD 102-2), 그다음 돌아온 수치로 다시 걸릴 수 있다. 빈사 시간이 원정 중에 다 됐으면 돌아와서 사망. 풀린 상태를 돌려준다 */
export function applyExpeditionEnd(nest: NestState, exp: ExpeditionState, nowMs: number): { collapsed: boolean; died: boolean; recovered: ('weak' | 'tired')[] } {
  const v = expeditionEndVitals(exp);
  nest.hunger = v.hunger;
  nest.condition = v.condition;
  const defeated = summarize(exp).outcome === 'defeated';
  const recovered: ('weak' | 'tired')[] = [];
  let collapsed = false;
  let died = false;
  if (defeated) {
    if (nest.collapsed) {
      dieNest(nest);
      died = true;
    } else collapsed = collapseNest(nest, nowMs);
  } else {
    if (nest.cureOnReturn.weak && nest.weakened) { nest.weakened = false; recovered.push('weak'); }
    if (nest.cureOnReturn.tired && nest.tired) { nest.tired = false; recovered.push('tired'); }
  }
  nest.cureOnReturn = { weak: false, tired: false };
  // 홈 체력 (GDD 123장 2): 남은 원정 체력을 그대로 가져온다(빈사 원정은 최대 체력이 상한만큼이라 그 비율로). 지면 빈사 상한(10%)
  nest.spa = null;
  nest.hpFraction = defeated ? homeHpCap(nest) : homeHpOf({ collapsed: nest.collapsed, hpFraction: Math.min(1, Math.max(0, exp.hpFraction ?? 1)) * (exp.care?.dying ? CP.dying.hpFraction : 1) });
  refreshCareStatus(nest);
  settleRiskToNest(nest, exp);
  nest.lastTickMs = nowMs;
  if (!died) died = checkDying(nest, nowMs);
  return { collapsed, died, recovered };
}
