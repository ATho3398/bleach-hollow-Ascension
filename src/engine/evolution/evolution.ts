// 다마고치형 조합 진화 엔진 (GDD 4-2). 종족 무관 순수 로직 — 이름·문구는 데이터/종족 설정이 정한다.
// 모든 수치·규칙은 임시(provisional)다. 사망·퇴화·단계 스킵은 없다.

import { BALANCE } from '../../config/balance';
import { BASE_COMBO, getForm, makeForm } from '../../data/evolution';
import type { FormDef, FormVariant, PassiveStat } from '../../data/schema';
import type { BuildState } from '../absorb/build';
import type { EvolutionRecord } from '../runLog';

const EV = BALANCE.provisional.evolution;

/** 육성 단계 수 (GDD 8-1). index 0~4 */
export const TIER_COUNT = 5;
export const MAX_TIER_INDEX = TIER_COUNT - 1;

/** 저장 구조(SaveData.evolution)이자 원정 중 사본. 현재 단계의 흡수 누적과 지금까지의 형태 */
export interface EvolutionState {
  /** 현재 육성 단계 (0 ~ 4) */
  tierIndex: number;
  /** 현재 형태 id. 처음 단계는 null */
  formId: string | null;
  /** 지금까지 진화한 형태 id (순서대로, 효과는 곱해진다) */
  formHistory: string[];
  /** 현재 단계에서 흡수한 횟수 (가중 없음, 진화 조건) */
  absorbs: number;
  /** 현재 단계의 계통별 흡수 누적 (희귀 가중 ×2) */
  lineageScores: Record<string, number>;
  /** 계통별 마지막 흡수 순번 (동률일 때 최근 우선) */
  lastAbsorbSeq: Record<string, number>;
  /** 현재 단계 흡수 순번 카운터 */
  seq: number;
  /** 현재 단계에서 한계 돌파를 했는가 (세 번째 후보가 열린다) */
  breakthroughThisTier: boolean;
}

export function newEvolution(): EvolutionState {
  return { tierIndex: 0, formId: null, formHistory: [], absorbs: 0, lineageScores: {}, lastAbsorbSeq: {}, seq: 0, breakthroughThisTier: false };
}

export function cloneEvolution(e: EvolutionState): EvolutionState {
  return { ...e, formHistory: [...e.formHistory], lineageScores: { ...e.lineageScores }, lastAbsorbSeq: { ...e.lastAbsorbSeq } };
}

/** 흡수가 확정될 때 누적을 올린다. 희귀 개체는 가중 ×rareWeight */
export function recordEvolutionAbsorb(e: EvolutionState, lineageId: string, rare: boolean): void {
  e.absorbs++;
  e.seq++;
  e.lineageScores[lineageId] = (e.lineageScores[lineageId] ?? 0) + (rare ? EV.rareWeight : 1);
  e.lastAbsorbSeq[lineageId] = e.seq;
}

/** 이 단계에서 한계 돌파를 했다고 표시 (원정이 끝나 둥지로 돌아올 때) */
export function noteEvolutionBreakthrough(e: EvolutionState): void {
  e.breakthroughThisTier = true;
}

/** 누적 많은 순 → 동률은 가장 최근 흡수한 계통 먼저. 누적이 0인 계통은 없다 */
export function rankLineages(e: EvolutionState): string[] {
  return Object.keys(e.lineageScores)
    .filter((id) => e.lineageScores[id]! > 0)
    .sort((a, b) => e.lineageScores[b]! - e.lineageScores[a]! || (e.lastAbsorbSeq[b] ?? 0) - (e.lastAbsorbSeq[a] ?? 0));
}

/** 조합에 들어가는 계통들 (정렬된 id): 1·2위, 3위가 2위의 thirdRatio 이상이면 3위도. 흡수 0이면 빈 목록. 계통이 1개뿐이면 그 1개 */
export function comboLineageIds(e: EvolutionState): string[] {
  const r = rankLineages(e);
  let pick = r.slice(0, 2);
  const third = r[2];
  if (third !== undefined && e.lineageScores[third]! >= e.lineageScores[r[1]!]! * EV.thirdRatio) pick = r.slice(0, 3);
  return pick.sort();
}

/** 조합 키: 정렬된 계통 id 를 '+' 로 이은 문자열. 흡수 0이면 "base" */
export function comboKeyOf(e: EvolutionState): string {
  const ids = comboLineageIds(e);
  return ids.length === 0 ? BASE_COMBO : ids.join('+');
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

/** 형태 종류 선택: 돌파했으면 세 번째 후보, 아니면 안정 수치 임계 이상 = 정통, 미만 = 변이 */
export function chooseVariant(stability: number, breakthrough: boolean): FormVariant {
  if (breakthrough) return 'breakthrough';
  return stability >= EV.stabilityThreshold ? 'orthodox' : 'mutant';
}

/** 진화하면 갈 형태 (확정 전 미리보기용 — 화면은 "?" 로 가린다) */
export function previewForm(e: EvolutionState, stability: number): FormDef | null {
  if (isMaxTier(e)) return null;
  return makeForm(comboKeyOf(e), e.tierIndex + 1, chooseVariant(stability, e.breakthroughThisTier));
}

export type EvolveResult =
  | { ok: true; form: FormDef; record: EvolutionRecord; slotsAdded: number }
  | { ok: false; reason: string };

/** 진화 확정 (둥지에서만 부른다). 슬롯 +1, 누적 리셋, 안정 수치·리스크는 건드리지 않는다. 런 로그 기록은 호출한 쪽이 record 를 더한다 */
export function evolve(e: EvolutionState, build: BuildState, stability: number, nowMs: number): EvolveResult {
  if (isMaxTier(e)) return { ok: false, reason: '이미 마지막 단계다' };
  if (!canEvolve(e)) return { ok: false, reason: `흡수가 ${absorbsRemaining(e)}회 더 필요하다` };
  const comboKey = comboKeyOf(e);
  const from = e.tierIndex;
  const form = makeForm(comboKey, from + 1, chooseVariant(stability, e.breakthroughThisTier));
  e.tierIndex = from + 1;
  e.formId = form.id;
  e.formHistory.push(form.id);
  e.absorbs = 0;
  e.lineageScores = {};
  e.lastAbsorbSeq = {};
  e.seq = 0;
  e.breakthroughThisTier = false;
  for (let i = 0; i < EV.slotsPerEvolution; i++) build.slots.push(null);
  return { ok: true, form, record: { fromTier: from, toTier: from + 1, comboKey, formId: form.id, stability, at: nowMs }, slotsAdded: EV.slotsPerEvolution };
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
    m.hp *= f.hpMultiplier;
    m.attack *= f.attackMultiplier;
    for (const [stat, v] of Object.entries(f.passive) as [PassiveStat, number][]) m.passive[stat] *= v;
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

