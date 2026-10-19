// 진화 엔진 (GDD 20-5 v3.7~v4.2). 종족 무관 순수 로직 — 이름·문구는 데이터/종족 설정이 정한다. 수치는 모두 임시(provisional).
// 진화 타이밍 = 그 단계에서 원정으로 걸은 칸 수(숨김). 흡수는 진화 결과(속성·노력치·히든)만 정한다. 어떤 진화체로 가는지는 judge.ts.
// 사망·퇴화·단계 스킵은 없다. 진화는 둥지로 돌아올 때 자동으로 일어난다(원정 중에는 일어나지 않는다).

import { BALANCE } from '../../config/balance';
import { combosAtTier, FORM_TABLE, getForm, tryGetForm } from '../../data/evolution';
import { NORMAL_ELEMENT } from '../../data/elements';
import { getFaction } from '../../data/factions';
import { STAT_IDS, type FormDef, type StatId, type Stats } from '../../data/schema';
import type { ComboRule, CombatParams } from '../combat/combat';
import type { BuildState } from '../absorb/build';
import type { EvolutionRecord } from '../runLog';
import { judgeEvolution, type JudgeContext } from './judge';

const EV = BALANCE.provisional.evolution;
const SX = BALANCE.provisional.stats;

/** 육성 단계 수 (GDD 8-1). index 0~4 */
export const TIER_COUNT = 5;
export const MAX_TIER_INDEX = TIER_COUNT - 1;

/** 저장 구조(SaveData.evolution)이자 원정 중 사본 (C.47, 세이브 형식 14) */
export interface EvolutionState {
  /** 현재 육성 단계 (0 ~ 4) */
  tierIndex: number;
  /** 현재 진화체 id. 처음 단계는 null */
  formId: string | null;
  /** 지금까지 진화한 진화체 id (순서대로) */
  formHistory: string[];
  /** 이 단계에서 원정으로 걸은 칸 수 (진화 타이밍, 화면에 보이지 않는다) */
  steps: number;
  /** 이 단계에서 띄운 진화 임박 알림 수 (0~2: 남은 20%, 10%) */
  alerts: number;
  /** 이 단계의 진화 난수 시드 (단계 진입 때 정한다 → 같은 상태 = 같은 결과, v4.2) */
  stageSeed: number;
  /** 이 단계 기록 (진화하면 0): 흡수 수, 놓아준 수, 흡수한 적의 속성별 수, 한계 돌파 수, 강적 처치 수 */
  absorbs: number;
  releases: number;
  elementAbsorbs: Record<string, number>;
  breakthroughs: number;
  elitesDefeated: number;
  /** 노력치 (GDD 20-4): 흡수로 오르고 진화해도 유지된다. 단계별 상한 */
  ev: Stats;
  /** 지금 진화체의 고유 특성 방향 (진화 순간 노력치 최고 능력치, v4.0). 1단계는 null */
  ability: StatId | null;
}

export function zeroStats(): Stats {
  return { hp: 0, atk: 0, int: 0, def: 0, spr: 0, spd: 0 };
}

export function newEvolution(stageSeed = 0): EvolutionState {
  return {
    tierIndex: 0, formId: null, formHistory: [], steps: 0, alerts: 0, stageSeed: stageSeed >>> 0,
    absorbs: 0, releases: 0, elementAbsorbs: {}, breakthroughs: 0, elitesDefeated: 0, ev: zeroStats(), ability: null,
  };
}

export function cloneEvolution(e: EvolutionState): EvolutionState {
  return { ...e, formHistory: [...e.formHistory], elementAbsorbs: { ...e.elementAbsorbs }, ev: { ...e.ev } };
}

export function isMaxTier(e: EvolutionState): boolean {
  return e.tierIndex >= MAX_TIER_INDEX;
}

/** 노력치 상한 (그 단계): 합계와 능력치 하나 */
export function evCaps(tierIndex: number): { total: number; perStat: number } {
  const total = SX.evCapTotal[Math.min(tierIndex, SX.evCapTotal.length - 1)] ?? 0;
  return { total, perStat: Math.floor(total * SX.evCapPerStatRatio) };
}

export function evTotal(ev: Stats): number {
  return STAT_IDS.reduce((a, s) => a + ev[s], 0);
}

/** 노력치를 더한다 (상한까지만). 실제로 오른 양을 돌려준다 */
export function addEv(e: EvolutionState, gain: Partial<Record<StatId, number>>): Partial<Record<StatId, number>> {
  const cap = evCaps(e.tierIndex);
  const out: Partial<Record<StatId, number>> = {};
  for (const s of STAT_IDS) {
    const want = gain[s] ?? 0;
    if (want <= 0) continue;
    const room = Math.max(0, Math.min(cap.perStat - e.ev[s], cap.total - evTotal(e.ev)));
    const v = Math.min(want, room);
    if (v > 0) {
      e.ev[s] += v;
      out[s] = v;
    }
  }
  return out;
}

/** 흡수가 확정될 때: 단계 기록(속성별 흡수) + 노력치 */
export function recordEvolutionAbsorb(e: EvolutionState, element: string, ev: Partial<Record<StatId, number>> = {}): Partial<Record<StatId, number>> {
  e.absorbs++;
  e.elementAbsorbs[element] = (e.elementAbsorbs[element] ?? 0) + 1;
  return addEv(e, ev);
}

export function recordEvolutionRelease(e: EvolutionState): void {
  e.releases++;
}

export function recordEvolutionBreakthrough(e: EvolutionState): void {
  e.breakthroughs++;
}

export function recordEvolutionElite(e: EvolutionState): void {
  e.elitesDefeated++;
}

/** 다음 진화까지 필요한 걸음 수 (마지막 단계면 null). 화면에는 보이지 않는다 */
export function stepsNeeded(e: EvolutionState): number | null {
  return isMaxTier(e) ? null : (EV.stepsNeeded[e.tierIndex] ?? null);
}

export function canEvolve(e: EvolutionState): boolean {
  const need = stepsNeeded(e);
  return need !== null && e.steps >= need;
}

/** 원정에서 한 칸 걸었다. 남은 걸음이 20%·10% 가 되는 순간이면 그 알림 번호(1, 2)를 돌려준다 (각각 한 번) */
export function recordEvolutionStep(e: EvolutionState): number | null {
  const need = stepsNeeded(e);
  if (need === null) return null;
  e.steps++;
  const left = need - e.steps;
  const next = EV.alertsAt[e.alerts];
  if (next !== undefined && left >= 0 && left <= Math.floor(need * next)) {
    e.alerts++;
    return e.alerts;
  }
  return null;
}

/** 진화하면 도달하는 단계 (2~5, 1-based). 마지막 단계면 null */
export function nextTier(e: EvolutionState): number | null {
  return isMaxTier(e) ? null : e.tierIndex + 2;
}

/** 그 단계 기준 능력치 = 종족값 합계 ÷ 6 (GDD 20-3): 적 능력치·체력·속도 환산의 기준 */
export function refStatOf(tierIndex: number): number {
  return (SX.tierTotals[Math.min(tierIndex, SX.tierTotals.length - 1)] ?? SX.tierTotals[0]!) / STAT_IDS.length;
}

/** 지금 종족값: 진화체 값, 1단계는 종족 설정 baseStats */
export function baseStatsOf(e: EvolutionState, factionId: string): Stats {
  const form = e.formId ? tryGetForm(e.formId) : undefined;
  return { ...(form?.stats ?? getFaction(factionId).baseStats) };
}

/** 지금 능력치 = 종족값 + 노력치 (GDD 20-4) */
export function currentStats(e: EvolutionState, factionId: string): Stats {
  const base = baseStatsOf(e, factionId);
  for (const s of STAT_IDS) base[s] += e.ev[s];
  return base;
}

/** 직전 진화체 (5단계의 속성 잇기에 쓴다) */
function previousForm(e: EvolutionState): FormDef | undefined {
  const id = e.formHistory[e.formHistory.length - 2];
  return id ? tryGetForm(id) : undefined;
}

/** 아란칼이 바스트로데 히든(융합·완전체·특수·순수)의 성질을 잇는가: 일반 아란칼이고 직전이 그 속성을 가진 히든일 때 */
function inheritsHidden(form: FormDef, prev: FormDef | undefined): prev is FormDef {
  return form.label.kind === 'arrancar' && prev !== undefined && prev.hidden === true && prev.label.kind !== 'fail' && (prev.elements ?? []).includes(form.elements?.[0] ?? '');
}

/** 내 캐릭터 속성 (GDD 20-2 v3.5): 1단계 노멀. 속성을 잇는 진화체(아란칼 행동 히든)는 직전 진화체 속성, 융합 바스트로데에서 온 아란칼은 두 속성을 그대로 잇는다 */
export function playerElementsOf(e: EvolutionState): string[] {
  for (let i = e.formHistory.length - 1; i >= 0; i--) {
    const f = tryGetForm(e.formHistory[i]!);
    if (!f?.elements) continue;
    const prev = i > 0 ? tryGetForm(e.formHistory[i - 1]!) : undefined;
    return inheritsHidden(f, prev) ? [...prev.elements!] : [...f.elements];
  }
  return [NORMAL_ELEMENT];
}

/** 자기 속성 보정 배율: 진화체 stab(순수형), 아란칼은 직전 히든의 stab 을 잇는다. 없으면 BALANCE.elements.stab */
export function stabOf(e: EvolutionState): number {
  const form = e.formId ? tryGetForm(e.formId) : undefined;
  if (!form) return BALANCE.elements.stab;
  const prev = previousForm(e);
  if (form.stab !== undefined) return form.stab;
  if (form.elements === undefined || inheritsHidden(form, prev)) return prev?.stab ?? BALANCE.elements.stab;
  return BALANCE.elements.stab;
}

export type EvolveResult =
  | { ok: true; form: FormDef; record: EvolutionRecord; slotsAdded: number }
  | { ok: false; reason: string };

/** 단계 시드 다음 값 (결정적): 진화할 때마다 새 단계 시드를 만든다 */
export function nextStageSeed(seed: number, tierIndex: number): number {
  let x = (seed ^ Math.imul(tierIndex + 1, 0x9e3779b1)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}

/** 진화 확정 (둥지 귀환 때 자동). 슬롯 +1, 단계 기록 리셋(노력치는 유지), 고유 특성 결정. 런 로그 기록은 호출한 쪽이 record 를 더한다 */
export function evolve(e: EvolutionState, build: BuildState, ctx: Omit<JudgeContext, 'build'>, nowMs: number, table: readonly FormDef[] = FORM_TABLE): EvolveResult {
  if (isMaxTier(e)) return { ok: false, reason: '이미 마지막 단계다' };
  if (!canEvolve(e)) return { ok: false, reason: '아직 진화할 때가 아니다' };
  const fromTier = e.tierIndex;
  const fromFormId = e.formId;
  const { form, snapshot } = judgeEvolution(e, { ...ctx, build }, table);
  e.tierIndex = fromTier + 1;
  e.formId = form.id;
  e.formHistory.push(form.id);
  e.ability = snapshot.ability;
  e.steps = 0;
  e.alerts = 0;
  e.absorbs = 0;
  e.releases = 0;
  e.elementAbsorbs = {};
  e.breakthroughs = 0;
  e.elitesDefeated = 0;
  e.stageSeed = nextStageSeed(e.stageSeed, e.tierIndex);
  for (let i = 0; i < EV.slotsPerEvolution; i++) build.slots.push(null);
  return {
    ok: true,
    form,
    record: { fromTier, toTier: fromTier + 1, fromFormId, toFormId: form.id, formId: form.id, snapshot, at: nowMs },
    slotsAdded: EV.slotsPerEvolution,
  };
}

/** 이 육성 단계에서 켜진 콤보 규칙 (GDD 17-3, 진화 단계마다 1개씩 열림) */
export function comboRulesOf(e: Pick<EvolutionState, 'tierIndex'>): ComboRule[] {
  return combosAtTier(e.tierIndex).map((c) => ({ id: c.id, family: c.family, minChain: c.minChain, repeat: c.repeat, powerInAttacks: c.powerInAttacks }));
}

/** 고유 특성 효과를 전투 파라미터에 (BALANCE.provisional.abilities) */
function applyAbility(params: Partial<CombatParams>, ability: StatId | null): void {
  if (!ability) return;
  const a = BALANCE.provisional.abilities[ability] as Partial<Record<'maxHp' | 'physicalPower' | 'blockSpawn' | 'physicalTaken' | 'specialTaken' | 'attackSpeed', number>>;
  if (a.maxHp) params.playerMaxHp = (params.playerMaxHp ?? BALANCE.provisional.combat.playerMaxHp) * a.maxHp;
  if (a.blockSpawn) params.blockSpawnMultiplier = (params.blockSpawnMultiplier ?? 1) * a.blockSpawn;
  if (a.attackSpeed) params.attackSpeedMultiplier = (params.attackSpeedMultiplier ?? 1) * a.attackSpeed;
  const power = { physical: 1, special: 1, mixed: 1, ...params.categoryPower };
  const taken = { physical: 1, special: 1, mixed: 1, ...params.categoryTaken };
  if (a.physicalPower) power.physical *= a.physicalPower;
  if (a.physicalTaken) taken.physical *= a.physicalTaken;
  if (a.specialTaken) taken.special *= a.specialTaken;
  params.categoryPower = power;
  params.categoryTaken = taken;
}

/**
 * 진화 상태를 전투 파라미터에 싣는다: 기준 능력치·내 능력치(종족값+노력치)·내 속성·자기 속성 보정·고유 특성·콤보·체인 상한.
 * 전투 엔진은 종족을 모르고 이 값만 쓴다. buildCombatParams(빌드) 뒤에 부른다
 */
export function applyEvolutionToParams(params: Partial<CombatParams>, e: EvolutionState, factionId: string): void {
  params.combos = comboRulesOf(e);
  // 체인 묶음 상한 (GDD 19-2): 지금 진화체 값이 있으면 종족 기본값(buildCombatParams)보다 우선
  const form = e.formId ? tryGetForm(e.formId) : undefined;
  if (form?.maxChain !== undefined) params.maxChain = form.maxChain;
  params.refStat = refStatOf(e.tierIndex);
  params.playerStats = currentStats(e, factionId);
  params.playerElements = playerElementsOf(e);
  params.stabMultiplier = stabOf(e);
  applyAbility(params, e.ability);
}

/** 진화체 하나 (외부에서 이름·속성 표시용) */
export function currentForm(e: EvolutionState): FormDef | null {
  return e.formId ? getForm(e.formId) : null;
}
