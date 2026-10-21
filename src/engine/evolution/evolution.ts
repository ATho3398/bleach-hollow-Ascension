// 진화 엔진 (GDD 20-5 v3.7~v4.2). 종족 무관 순수 로직 — 이름·문구는 데이터/종족 설정이 정한다. 수치는 모두 임시(provisional).
// 진화 타이밍 = 그 단계에서 원정으로 걸은 칸 수(숨김). 흡수는 진화 결과(속성·노력치·히든)만 정한다. 어떤 진화체로 가는지는 judge.ts.
// 사망·퇴화·단계 스킵은 없다. 진화는 둥지로 돌아올 때 자동으로 일어난다(원정 중에는 일어나지 않는다).

import { BALANCE } from '../../config/balance';
import { combosAtTier, FORM_TABLE, formName, getForm, tryGetForm } from '../../data/evolution';
import { distribute, failLineTotal } from '../../data/evolution/generate';
import { NORMAL_ELEMENT } from '../../data/elements';
import { getFaction } from '../../data/factions';
import { STAT_IDS, type FormDef, type StatId, type Stats } from '../../data/schema';
import { ELEMENT_DAMAGE_IDS, zeroElementDamage, type ComboRule, type CombatParams } from '../combat/combat';
import type { BuildState } from '../absorb/build';
import type { EvolutionRecord } from '../runLog';
import { abilityEffectsOf, formAbilitiesOf, physBlockOf, physSpawnSecondsFor } from './formAbilities';
import { judgeEvolution, type JudgeContext } from './judge';
import { pickTierLook } from './tierLook';

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
  /** 단계 외형 스킨 id (GDD 53, 형식 33): 진화 순간 종족 설정 tierLooks 표로 정해 고정한다. 없거나 null = 기존 단계 그림 */
  look?: string | null;
  /** 환생 계승 노력치 (GDD 22-7, 형식 20): 이 생을 시작할 때 받은 값(정수). 단계 상한과 따로 더해진다. 없으면 0 */
  carry?: Stats;
  /** 시작 외형 스탯 편향 (GDD 52 연동, C.108, 형식 34): 새 세이브 추첨 때 종족 설정 startLookBias 로 정한 ±값(합계 0). 진화·환생을 지나도 그대로. 없으면 0 */
  bias?: Stats;
  /** 테스트 모드(GDD 38장·48장 5번) 속성 피해 입력 %: 속성 id → %. 진짜 게임에는 없다(출처가 생기면 elementDamageOf 에 더한다) */
  testElementDamage?: Record<string, number>;
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
  return { ...e, formHistory: [...e.formHistory], elementAbsorbs: { ...e.elementAbsorbs }, ev: { ...e.ev }, ...(e.carry ? { carry: { ...e.carry } } : {}), ...(e.bias ? { bias: { ...e.bias } } : {}), ...(e.testElementDamage ? { testElementDamage: { ...e.testElementDamage } } : {}) };
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

/** 흡수가 확정될 때: 단계 기록(흡수 수·속성별 흡수) + 노력치. countElement false(스탯만 흡수, GDD 52)면 속성 카운트는 안 올린다(흡수 수는 올린다) */
export function recordEvolutionAbsorb(e: EvolutionState, element: string, ev: Partial<Record<StatId, number>> = {}, countElement = true): Partial<Record<StatId, number>> {
  e.absorbs++;
  if (countElement) e.elementAbsorbs[element] = (e.elementAbsorbs[element] ?? 0) + 1;
  return addEv(e, ev);
}

/** 시작 외형 스탯 편향 (GDD 52 연동, C.108): 한 능력치 +up, 나머지 −down (합계 0 이 되게 balance 의 startBias 가 up = 5 × down) */
export function startBiasStats(stat: StatId): Stats {
  const out = zeroStats();
  for (const s of STAT_IDS) out[s] = s === stat ? SX.startBias.up : -SX.startBias.down;
  return out;
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

/** 그 단계 기준 능력치 = 종족값 합계 ÷ 6 (GDD 20-3). C.75(32-1)부터 적 쪽(원정 난이도 ★n = n단계 기준)에만 쓰고, 내 쪽은 worldRefStat 하나로 환산한다 */
export function refStatOf(tierIndex: number): number {
  return (SX.tierTotals[Math.min(tierIndex, SX.tierTotals.length - 1)] ?? SX.tierTotals[0]!) / STAT_IDS.length;
}

/** 세계 기준 능력치 (GDD 32-1): 1단계 기준 능력치 하나. 내 체력·평타 간격은 늘 이 값에 대한 비 — 단계가 올라도 나누는 값이 커지지 않는다 */
export function worldRefStat(): number {
  return refStatOf(0);
}

/** 실패형 줄기 (GDD 49-8, C.106): 지금까지 거친 진화체 중 실패형(label.kind fail)이 처음 나온 단계. 실패형을 안 거쳤으면 null */
export function failLineStartTier(e: Pick<EvolutionState, 'formHistory'>): number | null {
  for (const id of e.formHistory) {
    const f = tryGetForm(id);
    if (f?.label.kind === 'fail') return f.tier;
  }
  return null;
}

export function isFailLine(e: Pick<EvolutionState, 'formHistory'>): boolean {
  return failLineStartTier(e) !== null;
}

/** 지금 종족값: 진화체 값, 1단계는 종족 설정 baseStats.
 *  실패형 줄기(GDD 49-8 1번)는 진화체 값의 비율 그대로 합계만 실패형 합계(단계 오름분 × failLine.gainRatio)로 줄인다 — 5단계 아란칼도 같은 낮춤 */
export function baseStatsOf(e: EvolutionState, factionId: string): Stats {
  const form = e.formId ? tryGetForm(e.formId) : undefined;
  if (!form) return { ...getFaction(factionId).baseStats };
  const start = failLineStartTier(e);
  if (start === null || form.tier < start) return { ...form.stats };
  const target = failLineTotal(SX.tierTotals, EV.failLine.gainRatio, form.tier, start);
  const sum = STAT_IDS.reduce((a, k) => a + form.stats[k], 0);
  if (sum === target) return { ...form.stats };
  const ref = sum / STAT_IDS.length;
  return distribute(target, Object.fromEntries(STAT_IDS.map((k) => [k, form.stats[k] / ref - 1])));
}

/** 표시 이름 (GDD 49-8 2번): 실패형 줄기는 4·5단계가 되어도 종족 설정 1단계 이름, 그 밖에는 진화체 이름(1단계는 1단계 이름) */
export function formDisplayName(e: EvolutionState, factionId: string): string {
  const fac = getFaction(factionId);
  if (isFailLine(e)) return fac.tierNames[0]!;
  const form = e.formId ? tryGetForm(e.formId) : undefined;
  return form ? formName(form, factionId, playerElementsOf(e)) : fac.tierNames[e.tierIndex]!;
}

/** 표시 단계 이름 (GDD 49-8 2번): 실패형 줄기는 종족 설정 1단계 이름 그대로 */
export function tierDisplayName(e: Pick<EvolutionState, 'formHistory' | 'tierIndex'>, factionId: string, tierIndex: number = e.tierIndex): string {
  const fac = getFaction(factionId);
  return fac.tierNames[isFailLine(e) ? 0 : tierIndex] ?? `${tierIndex + 1}단계`;
}

/** 능력치 절대 상한 (GDD 22-1 v4.7, 6개 모두) */
export const STAT_MAX: number = SX.statMax;

/** 지금 능력치 = (종족값 + 노력치 + 환생 계승 + 시작 외형 편향) × (1 + 슬롯 보너스) (GDD 20-4·22-7·22-3·52), 능력치마다 STAT_MAX 에서 멈춘다.
 *  statBonus = 붕옥 해방·초월체 보유 패시브 (0.05 = +5%, 반올림). 0 이면 예전과 같은 값 */
export function currentStats(e: EvolutionState, factionId: string, statBonus = 0): Stats {
  const base = baseStatsOf(e, factionId);
  for (const s of STAT_IDS) {
    const raw = base[s] + e.ev[s] + (e.carry?.[s] ?? 0) + (e.bias?.[s] ?? 0);
    base[s] = Math.min(STAT_MAX, statBonus > 0 ? Math.round(raw * (1 + statBonus)) : raw);
  }
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
  e.look = pickTierLook(getFaction(ctx.factionId), e.tierIndex + 1, e.ev, form);
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
 * 진화 상태를 전투 파라미터에 싣는다: 세계 기준 능력치·내 능력치(종족값+노력치, 붕옥·초월체 보너스 statBonus)·내 속성·자기 속성 보정·고유 특성·콤보·체인 상한.
 * 전투 엔진은 종족을 모르고 이 값만 쓴다. buildCombatParams(빌드) 뒤에 부른다
 */
export function applyEvolutionToParams(params: Partial<CombatParams>, e: EvolutionState, factionId: string, statBonus = 0): void {
  params.combos = comboRulesOf(e);
  // 체인 묶음 상한 (GDD 19-2): 지금 진화체 값이 있으면 종족 기본값(buildCombatParams)보다 우선
  const form = e.formId ? tryGetForm(e.formId) : undefined;
  if (form?.maxChain !== undefined) params.maxChain = form.maxChain;
  // 내 쪽 기준은 세계 기준(고정). 적 기준(refStat)은 원정 난이도가 정한다 (src/engine/difficulty.ts) — 여기서 내 단계로 덮어쓰지 않는다
  params.playerRefStat = worldRefStat();
  params.playerStats = currentStats(e, factionId, statBonus);
  params.playerElements = playerElementsOf(e);
  params.stabMultiplier = stabOf(e);
  // 해방 블록 분류 (GDD 22-5): 진화체 분류(아란칼 일반형), 없으면 혼합
  params.liberationCategory = form?.label.category ?? 'mixed';
  // 특성 칸 2개 (GDD 39장): 성향(실패형 2개) + 속성·전용 효과
  const fa = formAbilitiesOf(form ?? null, e.ev, e.ability);
  for (const d of fa.dispositions) applyAbility(params, d);
  // 블록 풀 성향 보정 (GDD 44장 4번)
  params.dispositions = [...fa.dispositions];
  const { effects, critChance } = abilityEffectsOf(fa);
  params.abilityEffects = effects;
  // 물공 특수 블록 (GDD 49장, C.103): 5단계 물리 단일 속성 진화체의 기본 공격 블록이 전부 이 블록이 된다
  params.physBlock = physBlockOf(fa);
  params.physBlockSpawnSeconds = physSpawnSecondsFor(params.physBlock?.element ?? null);
  params.elementDamage = elementDamageOf(e);
  // 실패형 줄기 (GDD 49-8 1번): 블록 관련 피해 배율
  params.blockDamageMultiplier = isFailLine(e) ? EV.failLine.blockDamage : 1;
  if (critChance > 0) {
    params.critChance = (params.critChance ?? BALANCE.provisional.combat.critChance) + critChance;
    // 치명 상한 돌파 (GDD 45장 1번): 치명 특성(물 '날카로운 물결')이 있는 몸만 상한 = 기본 상한 + 그 특성 값
    params.critChanceMax = (params.critChanceMax ?? BALANCE.provisional.combat.critChanceMax) + critChance;
  }
}

/** 속성 피해 % (C.101, GDD 48장): 출처를 모두 더한 값, 칸 = 노멀 + 기본 원소(ELEMENT_DAMAGE_IDS). 지금 출처는 테스트 모드 입력뿐이라 보통 모두 0 */
export function elementDamageOf(e: EvolutionState): Record<string, number> {
  const out = zeroElementDamage();
  for (const id of ELEMENT_DAMAGE_IDS) {
    const v = e.testElementDamage?.[id];
    if (typeof v === 'number' && Number.isFinite(v)) out[id]! += v;
  }
  return out;
}

/** 진화체 하나 (외부에서 이름·속성 표시용) */
export function currentForm(e: EvolutionState): FormDef | null {
  return e.formId ? getForm(e.formId) : null;
}
