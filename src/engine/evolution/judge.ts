// 진화 판정 (GDD 20-5 v3.7~v4.2). 종족 무관 순수 함수: 진화 상태 + 장착 특성 + 돌보기 상태 → 진화체.
// 일반 후보 1개(1~3단계 base, 바스트로데 = 장착 최다 속성, 아란칼 = 바스트로데 속성 × 장착 최다 분류) + 조건을 채운 히든 0~n.
// 후보가 여럿이면 가중 랜덤(조건을 많이 넘을수록 무겁다), 실패형은 강제. 난수는 그 단계 진입 때 정한 시드(stageSeed)로 고정.

import { BALANCE } from '../../config/balance';
import { ELEMENTAL_IDS, NORMAL_ELEMENT, SPECIAL_ELEMENT_IDS } from '../../data/elements';
import { FORM_TABLE } from '../../data/evolution';
import { fusionPairs } from '../../data/evolution/build';
import { topStat } from '../../data/evolution/generate';
import { getTrait } from '../../data/traits';
import { STAT_IDS, type AttackCategory, type FormDef, type StatId } from '../../data/schema';
import { categoryCounts, elementCounts, equipRecency, familyCategory, type BuildState } from '../absorb/build';
import { createRng, nextFloat } from '../rng';
import type { EvolutionState } from './evolution';

const H = BALANCE.provisional.evolution.hidden;
const W = BALANCE.provisional.evolution.weight;

export interface JudgeContext {
  factionId: string;
  build: BuildState;
  /** 진화 순간 돌보기 상태 (둥지 귀환 직후) */
  hunger: number;
  condition: number;
}

export interface EvolutionCandidate {
  formId: string;
  /** 가중치 (일반 1) */
  weight: number;
  /** 조건 초과량 (값 ÷ 기준 − 1, 일반은 0) */
  excess: number;
}

/** 진화 순간 스냅샷 (런 로그 EvolutionRecord.snapshot, GDD 9장) */
export interface EvolutionSnapshot {
  steps: number;
  absorbs: number;
  releases: number;
  elementAbsorbs: Record<string, number>;
  breakthroughs: number;
  elitesDefeated: number;
  hunger: number;
  condition: number;
  /** 장착 특성 최다 속성 / 최다 공격 분류 */
  equippedElement: string;
  equippedCategory: AttackCategory;
  /** 판정 후보와 가중치. forced 면 실패형 강제 */
  candidates: EvolutionCandidate[];
  forced: boolean;
  /** 가중 랜덤 값 (0~1) */
  roll: number;
  /** 정해진 고유 특성 방향 */
  ability: StatId;
}

/** 장착 특성 중 가장 많은 속성. 동률이면 가장 최근에 장착한 특성의 속성, 장착이 없으면 노멀 (GDD 20-5) */
export function dominantElement(build: BuildState): string {
  const counts = elementCounts(build);
  return pickTop(counts, build, (id) => getTrait(id).element) ?? NORMAL_ELEMENT;
}

/** 장착한 공격 특성 중 가장 많은 분류. 동률이면 최근 장착, 공격 특성이 없으면 혼합 */
export function dominantCategory(build: BuildState, factionId: string): AttackCategory {
  const counts = categoryCounts(build, factionId);
  const catOf = (id: string): string | null => {
    const t = getTrait(id);
    return t.kind === 'skill' && t.role === 'attack' && t.family ? familyCategory(factionId, t.family) : null;
  };
  return (pickTop(counts, build, catOf) as AttackCategory | null) ?? 'mixed';
}

function pickTop(counts: Record<string, number>, build: BuildState, keyOf: (traitId: string) => string | null): string | null {
  const max = Math.max(0, ...Object.values(counts));
  if (max <= 0) return null;
  const tied = Object.keys(counts).filter((k) => counts[k] === max);
  if (tied.length === 1) return tied[0]!;
  // 동률: 가장 최근에 장착한 특성의 값
  let best: { key: string; rec: number } | null = null;
  for (const id of build.slots) {
    if (!id) continue;
    const k = keyOf(id);
    if (k === null || !tied.includes(k)) continue;
    const rec = equipRecency(build, id);
    if (!best || rec > best.rec) best = { key: k, rec };
  }
  return best?.key ?? tied.sort()[0]!;
}

function shareOf(e: EvolutionState, el: string): number {
  const total = Object.values(e.elementAbsorbs).reduce((a, b) => a + b, 0);
  return total > 0 ? (e.elementAbsorbs[el] ?? 0) / total : 0;
}

/** 가중치 = 1 + (max − 1) × min(1, 초과량 ÷ fullExcess) */
export function hiddenWeight(excess: number): number {
  return 1 + (W.max - 1) * Math.min(1, Math.max(0, excess) / W.fullExcess);
}

function hidden(formId: string, excess: number): EvolutionCandidate {
  return { formId, weight: hiddenWeight(excess), excess: Math.max(0, excess) };
}

/** 장착 특성이 없거나 돌보기 실패(허기·컨디션 나쁨) → 바스트로데 실패형 강제 */
export function isCareFailure(ctx: JudgeContext): boolean {
  const any = ctx.build.slots.some((id) => id !== null);
  return !any || ctx.hunger >= H.failHunger || ctx.condition <= H.failCondition;
}

/** 바스트로데 시점 속성 히든 후보 (그 단계 흡수의 속성 분포) */
export function elementHiddenCandidates(e: EvolutionState, ctx: JudgeContext): EvolutionCandidate[] {
  if (e.absorbs < H.minAbsorbs) return [];
  const out: EvolutionCandidate[] = [];
  for (const [a, b] of fusionPairs()) {
    const sa = shareOf(e, a);
    const sb = shareOf(e, b);
    if (sa >= H.fusionShare && sb >= H.fusionShare) out.push(hidden(`h4:fusion:${a}+${b}`, Math.min(sa, sb) / H.fusionShare - 1));
  }
  const elementalMin = Math.min(...ELEMENTAL_IDS.map((el) => shareOf(e, el)));
  if (elementalMin >= H.completeShare) out.push(hidden('h4:complete', elementalMin / H.completeShare - 1));
  // 특수 속성: 하나 40%↑ + 다른 속성 하나도 40%↑ (짝 무관). 특수끼리면 흡수 수 많은 쪽 하나만
  const qualified = Object.keys(e.elementAbsorbs).filter((el) => shareOf(e, el) >= H.specialShare);
  const specials = qualified.filter((el) => SPECIAL_ELEMENT_IDS.includes(el)).sort((x, y) => (e.elementAbsorbs[y] ?? 0) - (e.elementAbsorbs[x] ?? 0) || (x < y ? -1 : 1));
  const top = specials[0];
  if (top) {
    const partner = qualified.filter((el) => el !== top).sort((x, y) => shareOf(e, y) - shareOf(e, x))[0];
    if (partner) out.push(hidden(`h4:special:${top}`, Math.min(shareOf(e, top), shareOf(e, partner)) / H.specialShare - 1));
  }
  const normalShare = shareOf(e, NORMAL_ELEMENT);
  if (dominantElement(ctx.build) === NORMAL_ELEMENT && normalShare >= H.pureShare && ctx.condition >= H.pureCondition && ctx.hunger <= H.pureHungerMax) {
    out.push(hidden('h4:pure', normalShare / H.pureShare - 1));
  }
  return out;
}

/** 아란칼 시점 행동 히든 후보 */
export function behaviorHiddenCandidates(e: EvolutionState): EvolutionCandidate[] {
  const out: EvolutionCandidate[] = [];
  if (e.breakthroughs >= H.breakthroughs) out.push(hidden('h5:limit', e.breakthroughs / H.breakthroughs - 1));
  if (e.releases > e.absorbs) out.push(hidden('h5:restraint', e.releases / Math.max(1, e.absorbs) - 1));
  if (e.elitesDefeated >= H.elites) out.push(hidden('h5:hunter', e.elitesDefeated / H.elites - 1));
  return out;
}

/** 아란칼 일반형의 속성 = 바스트로데의 (첫) 속성. 행동 히든(속성 잇기)을 지나도 마지막 속성 */
function vastoElement(e: EvolutionState, table: readonly FormDef[]): string {
  for (let i = e.formHistory.length - 1; i >= 0; i--) {
    const f = table.find((x) => x.id === e.formHistory[i]);
    if (f?.elements?.length) return f.elements[0]!;
  }
  return NORMAL_ELEMENT;
}

/** 이번 진화의 일반 후보와 히든 후보 (판정 전 미리보기·점검 도구용) */
export function evolutionCandidates(e: EvolutionState, ctx: JudgeContext, table: readonly FormDef[] = FORM_TABLE): { normal: FormDef; hidden: EvolutionCandidate[]; forced: FormDef | null } {
  const tier = e.tierIndex + 2;
  const find = (id: string) => {
    const f = table.find((x) => x.id === id);
    if (!f) throw new Error(`진화체가 없다: ${id}`);
    return f;
  };
  const ok = (c: EvolutionCandidate) => table.some((x) => x.id === c.formId);
  if (tier <= 3) return { normal: find(`t${tier}:base`), hidden: [], forced: null };
  if (tier === 4) {
    if (isCareFailure(ctx)) return { normal: find('h4:fail'), hidden: [], forced: find('h4:fail') };
    return { normal: find(`t4:${dominantElement(ctx.build)}`), hidden: elementHiddenCandidates(e, ctx).filter(ok), forced: null };
  }
  return { normal: find(`t5:${vastoElement(e, table)}:${dominantCategory(ctx.build, ctx.factionId)}`), hidden: behaviorHiddenCandidates(e).filter(ok), forced: null };
}

/** 고유 특성 방향: 노력치가 가장 높은 능력치. 동률(모두 0 포함)이면 진화체 종족값이 높은 쪽 → STAT_IDS 순 */
export function abilityFor(ev: Record<StatId, number>, form: FormDef): StatId {
  const max = Math.max(...STAT_IDS.map((s) => ev[s]));
  const tied = STAT_IDS.filter((s) => ev[s] === max);
  if (tied.length === 1) return tied[0]!;
  const top = topStat(form.stats);
  if (tied.includes(top)) return top;
  return tied.reduce((best, s) => (form.stats[s] > form.stats[best] ? s : best), tied[0]!);
}

/** 진화 판정: 후보(일반 1 + 히든) 가중 랜덤, 실패형은 강제 */
export function judgeEvolution(e: EvolutionState, ctx: JudgeContext, table: readonly FormDef[] = FORM_TABLE): { form: FormDef; snapshot: EvolutionSnapshot } {
  const { normal, hidden: hiddenList, forced } = evolutionCandidates(e, ctx, table);
  const candidates: EvolutionCandidate[] = [{ formId: normal.id, weight: forced ? 1 : W.normal, excess: 0 }, ...(forced ? [] : hiddenList)];
  const rng = createRng(e.stageSeed ^ Math.imul(e.tierIndex + 7, 0x2545f491));
  const roll = nextFloat(rng);
  const totalW = candidates.reduce((a, c) => a + c.weight, 0);
  let acc = 0;
  let chosen = candidates[0]!;
  for (const c of candidates) {
    acc += c.weight / totalW;
    if (roll < acc) {
      chosen = c;
      break;
    }
  }
  const form = table.find((f) => f.id === chosen.formId)!;
  return {
    form,
    snapshot: {
      steps: e.steps,
      absorbs: e.absorbs,
      releases: e.releases,
      elementAbsorbs: { ...e.elementAbsorbs },
      breakthroughs: e.breakthroughs,
      elitesDefeated: e.elitesDefeated,
      hunger: ctx.hunger,
      condition: ctx.condition,
      equippedElement: dominantElement(ctx.build),
      equippedCategory: dominantCategory(ctx.build, ctx.factionId),
      candidates,
      forced: forced !== null,
      roll,
      ability: abilityFor(e.ev, form),
    },
  };
}
