// 단계별 진화체 테이블 진화 엔진 (GDD 4-2 v1.0). 종족 무관 순수 로직 — 이름·문구는 데이터/종족 설정이 정한다.
// 모든 수치·규칙은 임시(provisional)다. 사망·퇴화·단계 스킵은 없다. 어떤 진화체로 가는지는 select.ts 의 selectForm 이 정한다.

import { BALANCE } from '../../config/balance';
import { FORM_TABLE, getForm } from '../../data/evolution';
import { LINEAGES } from '../../data/lineages';
import type { FormDef, PassiveStat } from '../../data/schema';
import type { BuildState } from '../absorb/build';
import type { EvolutionRecord } from '../runLog';
import { candidateForms, selectForm, type Accumulation } from './select';

const EV = BALANCE.provisional.evolution;

/** 육성 단계 수 (GDD 8-1). index 0~4 */
export const TIER_COUNT = 5;
export const MAX_TIER_INDEX = TIER_COUNT - 1;

/** 저장 구조(SaveData.evolution)이자 원정 중 사본. 현재 단계의 흡수 누적과 지금까지의 진화체 */
export interface EvolutionState {
  /** 현재 육성 단계 (0 ~ 4) */
  tierIndex: number;
  /** 현재 진화체 id (경로 `from` 판정에 쓴다). 처음 단계는 null */
  formId: string | null;
  /** 지금까지 진화한 진화체 id (순서대로, 효과는 곱해진다) */
  formHistory: string[];
  /** 현재 단계에서 흡수한 횟수 (가중 없음, 진화 조건) */
  absorbs: number;
  /** 현재 단계의 계통별 흡수 누적 (희귀 가중 ×2) */
  lineageScores: Record<string, number>;
  /** 계통별 마지막 흡수 순번 (동률일 때 최근 우선) */
  lastAbsorbSeq: Record<string, number>;
  /** 현재 단계 흡수 순번 카운터 */
  seq: number;
  /** 현재 단계의 희귀 흡수 횟수 */
  rareAbsorbs: number;
}

export function newEvolution(): EvolutionState {
  return { tierIndex: 0, formId: null, formHistory: [], absorbs: 0, lineageScores: {}, lastAbsorbSeq: {}, seq: 0, rareAbsorbs: 0 };
}

export function cloneEvolution(e: EvolutionState): EvolutionState {
  return { ...e, formHistory: [...e.formHistory], lineageScores: { ...e.lineageScores }, lastAbsorbSeq: { ...e.lastAbsorbSeq } };
}

/** 흡수가 확정될 때 누적을 올린다. 희귀 개체는 가중 ×rareWeight */
export function recordEvolutionAbsorb(e: EvolutionState, lineageId: string, rare: boolean): void {
  e.absorbs++;
  e.seq++;
  if (rare) e.rareAbsorbs++;
  e.lineageScores[lineageId] = (e.lineageScores[lineageId] ?? 0) + (rare ? EV.rareWeight : 1);
  e.lastAbsorbSeq[lineageId] = e.seq;
}

/** 선택 규칙이 읽는 누적 스냅샷: 모든 계통을 0 포함해 적는다. 마지막 단계면 need = 0 */
export function accumulationOf(e: EvolutionState, lineageIds: readonly string[] = LINEAGES.map((l) => l.id)): Accumulation {
  const scores: Record<string, number> = {};
  const lastSeq: Record<string, number> = {};
  for (const id of lineageIds) {
    scores[id] = e.lineageScores[id] ?? 0;
    lastSeq[id] = e.lastAbsorbSeq[id] ?? 0;
  }
  return { need: absorbsNeeded(e) ?? 0, scores, rare: e.rareAbsorbs, lastSeq };
}

export function isMaxTier(e: EvolutionState): boolean {
  return e.tierIndex >= MAX_TIER_INDEX;
}

/** 다음 단계로 가는 데 필요한 흡수 횟수. 마지막 단계면 null */
export function absorbsNeeded(e: EvolutionState): number | null {
  return isMaxTier(e) ? null : (EV.absorbsNeeded[e.tierIndex] ?? null);
}

/** 진화까지 남은 흡수 횟수 (0 이면 진화 가능). 마지막 단계면 null */
export function absorbsRemaining(e: EvolutionState): number | null {
  const need = absorbsNeeded(e);
  return need === null ? null : Math.max(0, need - e.absorbs);
}

export function canEvolve(e: EvolutionState): boolean {
  return absorbsRemaining(e) === 0;
}

/** 진화하면 도달하는 단계 (2~5, 1-based). 마지막 단계면 null */
export function nextTier(e: EvolutionState): number | null {
  return isMaxTier(e) ? null : e.tierIndex + 2;
}

/** 지금 분포로 갈 수 있는 후보 진화체 (경로·조건을 모두 채운 것, 우선순위 순). 기본형은 포함하지 않는다. 화면은 개수만 보여 준다 */
export function currentCandidates(e: EvolutionState, table: readonly FormDef[] = FORM_TABLE): FormDef[] {
  const tier = nextTier(e);
  return tier === null ? [] : candidateForms(table, tier, e.formId, accumulationOf(e));
}

/** 진화하면 갈 진화체 (확정 전 미리보기용 — 화면은 "?" 로 가린다) */
export function previewForm(e: EvolutionState, table: readonly FormDef[] = FORM_TABLE): FormDef | null {
  const tier = nextTier(e);
  return tier === null ? null : selectForm(table, tier, e.formId, accumulationOf(e));
}

export type EvolveResult =
  | { ok: true; form: FormDef; record: EvolutionRecord; slotsAdded: number }
  | { ok: false; reason: string };

/** 진화 확정 (둥지에서만 부른다). 슬롯 +1, 누적 리셋. 안정 수치·리스크는 건드리지 않는다. 런 로그 기록은 호출한 쪽이 record 를 더한다 */
export function evolve(e: EvolutionState, build: BuildState, nowMs: number, table: readonly FormDef[] = FORM_TABLE): EvolveResult {
  if (isMaxTier(e)) return { ok: false, reason: '이미 마지막 단계다' };
  if (!canEvolve(e)) return { ok: false, reason: `흡수가 ${absorbsRemaining(e)}회 더 필요하다` };
  const acc = accumulationOf(e);
  const fromTier = e.tierIndex;
  const fromFormId = e.formId;
  const form = selectForm(table, fromTier + 2, fromFormId, acc);
  e.tierIndex = fromTier + 1;
  e.formId = form.id;
  e.formHistory.push(form.id);
  e.absorbs = 0;
  e.lineageScores = {};
  e.lastAbsorbSeq = {};
  e.seq = 0;
  e.rareAbsorbs = 0;
  for (let i = 0; i < EV.slotsPerEvolution; i++) build.slots.push(null);
  return {
    ok: true,
    form,
    record: { fromTier, toTier: fromTier + 1, fromFormId, toFormId: form.id, formId: form.id, accumulation: acc, at: nowMs },
    slotsAdded: EV.slotsPerEvolution,
  };
}

/** 지금까지의 형태 효과 합: 최대 체력·기본 공격 위력 배율, 패시브 배율 (진화할 때마다 곱) */
export interface EvolutionMultipliers {
  hp: number;
  attack: number;
  passive: Record<PassiveStat, number>;
}

export function evolutionMultipliers(e: EvolutionState): EvolutionMultipliers {
  const m: EvolutionMultipliers = { hp: 1, attack: 1, passive: { attackPower: 1, attackSpeed: 1, damageTaken: 1 } };
  for (const id of e.formHistory) {
    const f = getForm(id);
    m.hp *= f.effects.hpMultiplier;
    m.attack *= f.effects.attackMultiplier;
    for (const [stat, v] of Object.entries(f.effects.passive) as [PassiveStat, number][]) m.passive[stat] *= v;
  }
  return m;
}

/** 형태 효과를 전투 파라미터에 곱한다 (전투 엔진은 건드리지 않고 기존 파라미터만 쓴다) */
export function applyEvolutionToParams(
  params: { playerMaxHp?: number; attackPowerMultiplier?: number; attackSpeedMultiplier?: number; damageTakenMultiplier?: number },
  e: EvolutionState,
): void {
  if (e.formHistory.length === 0) return;
  const m = evolutionMultipliers(e);
  params.playerMaxHp = (params.playerMaxHp ?? BALANCE.provisional.combat.playerMaxHp) * m.hp;
  params.attackPowerMultiplier = (params.attackPowerMultiplier ?? 1) * m.attack * m.passive.attackPower;
  params.attackSpeedMultiplier = (params.attackSpeedMultiplier ?? 1) * m.passive.attackSpeed;
  params.damageTakenMultiplier = (params.damageTakenMultiplier ?? 1) * m.passive.damageTaken;
}

