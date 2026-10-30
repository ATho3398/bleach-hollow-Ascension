// 진화 판정 (GDD 126장 4단계 개편, C.220). 종족 무관 순수 함수: 진화 상태 + 장착 특성 + 돌보기 상태 → 진화체.
// 2단계 = base. 3단계 = 장착 최다 속성(노멀·원소) · 망한 진화체(강제) · 히든 통로(가중 랜덤). 4단계 = 속성 × 장착 최다 공격 타입,
// 우선순위 일반 < 혈·독·허 < 히든(조건을 채운 히든이 있으면 그중 가중 랜덤). 난수는 그 단계 진입 때 정한 시드(stageSeed)로 고정.

import { BALANCE } from '../../config/balance';
import { ELEMENTAL_IDS, NORMAL_ELEMENT, SPECIAL_ELEMENT_IDS } from '../../data/elements';
import { FORM_TABLE } from '../../data/evolution';
import { fusionPairs } from '../../data/evolution/build';
import { topStat } from '../../data/evolution/generate';
import { getTrait } from '../../data/traits';
import { STAT_IDS, type AttackCategory, type FormDef, type StatId } from '../../data/schema';
import { categoryCounts, elementCounts, enhanceLevel, equipRecency, familyCategory, type BuildState } from '../absorb/build';
import { createRng, nextFloat } from '../rng';
import type { EvolutionState } from './evolution';

const H = BALANCE.provisional.evolution.hidden;
const W = BALANCE.provisional.evolution.weight;

export interface JudgeContext {
  factionId: string;
  build: BuildState;
  /** 진화 순간 돌보기 상태 (둥지 귀환 직후). hunger 0 = 배부름 100 */
  hunger: number;
  condition: number;
  /** 지금까지 환생한 횟수 (허무형·각성형). 없으면 0 */
  rebirths?: number;
  /** 진화 순간 안정 수치(호로 자아 / 사신 영압 안정도, 폭주형). 없으면 조건을 못 채운 것으로 본다 */
  stability?: number;
  /** 진화 순간 교감 (안정형). 없으면 0 */
  bond?: number;
  /** 실패형(망한 진화체 포함)을 거친 적 있는 계보 (각성형) */
  failLineage?: boolean;
  /** 진화 순간 능력치 합계 (각성형 — 4단계 종족값 합계와 비교). 없으면 0 */
  statTotal?: number;
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

/** 진화 판정용 장착 속성 개수 (GDD 111장 후속 결정 ②, C.184 후속): 장착 특성 개수 + 노멀 강화 1↑이면 빈 본체 칸 하나를 노멀 1개로 센다
 *  (노멀 skill 특성은 기본 블록이라 칸에 안 든다 — basicPerEmptySlot 과 같은 생각). 빈 칸에는 장착 순서가 없어 동률이면 장착한 특성이 이긴다 */
export function judgeElementCounts(build: BuildState): Record<string, number> {
  const counts = elementCounts(build);
  const empty = enhanceLevel(build, NORMAL_ELEMENT) > 0 ? build.slots.filter((id) => id === null).length : 0;
  if (empty > 0) counts[NORMAL_ELEMENT] = (counts[NORMAL_ELEMENT] ?? 0) + empty;
  return counts;
}

/** 장착 특성 중 가장 많은 속성. 동률이면 가장 최근에 장착한 특성의 속성, 장착이 없으면 노멀 (GDD 20-5) */
export function dominantElement(build: BuildState): string {
  const counts = judgeElementCounts(build);
  return pickTop(counts, build, (id) => getTrait(id).element) ?? NORMAL_ELEMENT;
}

/** 3단계 일반 진화의 속성 (GDD 126장 4): 3단계 진화체(t3:속성)가 표에 있는 속성 중 장착 최다. 혈·독·허는 3단계에 없어 세지 않는다.
 *  동률은 최근 장착, 맞는 장착이 없으면 노멀 */
export function tier3Element(build: BuildState, table: readonly FormDef[] = FORM_TABLE): string {
  const counts = Object.fromEntries(Object.entries(judgeElementCounts(build)).filter(([el]) => table.some((f) => f.id === `t3:${el}`)));
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

/** 그 단계 흡수의 최다 속성 비율 (흡수가 없으면 1 — 망함 판정 안 함) */
function topShare(e: EvolutionState): number {
  const total = Object.values(e.elementAbsorbs).reduce((a, b) => a + b, 0);
  return total > 0 ? Math.max(...Object.values(e.elementAbsorbs)) / total : 1;
}

/** 흩어지게 먹음 (GDD 126장 4 망한 진화체 · 7 실패형): 흡수 minAbsorbs 이상인데 최다 속성이 failTopShare 미만 */
export function isScattered(e: EvolutionState): boolean {
  return e.absorbs >= H.minAbsorbs && topShare(e) < H.failTopShare;
}

/** 가중치 = 1 + (max − 1) × min(1, 초과량 ÷ fullExcess) */
export function hiddenWeight(excess: number): number {
  return 1 + (W.max - 1) * Math.min(1, Math.max(0, excess) / W.fullExcess);
}

function hidden(formId: string, excess: number): EvolutionCandidate {
  return { formId, weight: hiddenWeight(excess), excess: Math.max(0, excess) };
}

/** 장착 특성이 없거나 돌보기 실패(허기·컨디션 나쁨) → 망한 진화체(3단계)·실패형(4단계) 강제 */
export function isCareFailure(ctx: JudgeContext): boolean {
  // C.184 (GDD 111장 1): 노멀 skill 특성은 기본 블록이라 슬롯에 들지 않는다 — 노멀을 한 번이라도 흡수했으면(노멀 강화 1↑) 기본 블록을 장착한 것으로 본다
  const any = ctx.build.slots.some((id) => id !== null) || enhanceLevel(ctx.build, NORMAL_ELEMENT) > 0;
  return !any || ctx.hunger >= H.failHunger || ctx.condition <= H.failCondition;
}

/** 이 단계 기록의 새 칸 (C.220, 옛 세이브엔 없을 수 있다) */
const faintsOf = (e: EvolutionState): number => e.faints ?? 0;
const longAbsencesOf = (e: EvolutionState): number => e.longAbsences ?? 0;
const hunterRunsOf = (e: EvolutionState): number => e.hunterRuns ?? 0;

/** 노력치가 고른가 (각성형 ③): 가장 낮은 값 ≥ 가장 높은 값 × awakenedEvBalance. 노력치가 전부 0 이면 아니다 */
export function evBalanced(e: Pick<EvolutionState, 'ev'>): boolean {
  const vals = STAT_IDS.map((s) => e.ev[s]);
  const max = Math.max(...vals);
  return max > 0 && Math.min(...vals) >= max * H.awakenedEvBalance;
}

/** 4단계 히든 후보 (GDD 126장 7·협의 답): 그 단계(3단계) 기록과 진화 순간 상태 */
export function tier4HiddenCandidates(e: EvolutionState, ctx: JudgeContext): EvolutionCandidate[] {
  const out: EvolutionCandidate[] = [];
  const rebirths = ctx.rebirths ?? 0;
  if (e.absorbs >= H.minAbsorbs) {
    for (const [a, b] of fusionPairs()) {
      const m = Math.min(shareOf(e, a), shareOf(e, b));
      if (m >= H.fusionShare) out.push(hidden(`h4:fusion:${a}+${b}`, m / H.fusionShare - 1));
    }
    const elementalMin = Math.min(...ELEMENTAL_IDS.map((el) => shareOf(e, el)));
    if (elementalMin >= H.completeShare) out.push(hidden('h4:complete', elementalMin / H.completeShare - 1));
    const voidMin = Math.min(...SPECIAL_ELEMENT_IDS.map((el) => shareOf(e, el)));
    if (rebirths >= H.voidRebirths && voidMin >= H.voidShare) out.push(hidden('h4:void', voidMin / H.voidShare - 1));
    if (isScattered(e)) out.push(hidden('h4:fail', H.failTopShare / Math.max(0.01, topShare(e)) - 1));
  }
  if (e.breakthroughs >= H.breakthroughs && ctx.stability !== undefined && ctx.stability < H.frenzyStabilityBelow) out.push(hidden('h4:frenzy', e.breakthroughs / H.breakthroughs - 1));
  if (e.releases > e.absorbs && 100 - ctx.hunger <= H.restraintFullnessMax) out.push(hidden('h4:restraint', e.releases / Math.max(1, e.absorbs) - 1));
  if ((ctx.bond ?? 0) >= H.stableBond && faintsOf(e) === 0 && e.breakthroughs === 0 && longAbsencesOf(e) === 0) out.push(hidden('h4:stable', 0));
  if (hunterRunsOf(e) >= H.hunterRuns) out.push(hidden('h4:hunter', hunterRunsOf(e) / H.hunterRuns - 1));
  const tier4Total = BALANCE.provisional.stats.tierTotals[3] ?? Infinity;
  if (ctx.failLineage && rebirths >= H.awakenedRebirths && (e.practices ?? 0) >= H.awakenedPractices && evBalanced(e) && (ctx.statTotal ?? 0) >= tier4Total) {
    out.push(hidden('h4:awakened', (e.practices ?? 0) / H.awakenedPractices - 1));
  }
  return out;
}

/** 3단계 히든 통로 후보 (협의 답 — 2단계 동안 4단계 조건의 약 60%): 문턱 하나라도 넘으면 h3:passage 하나, 초과량은 가장 크게 넘은 것.
 *  실패형·각성형·허무형(환생 조건형)은 통로 없이 4단계에서 직접 */
export function passageCandidates(e: EvolutionState, ctx: JudgeContext): EvolutionCandidate[] {
  const P = H.passage;
  const excess: number[] = [];
  if (e.absorbs >= H.minAbsorbs) {
    for (const [a, b] of fusionPairs()) {
      const m = Math.min(shareOf(e, a), shareOf(e, b));
      if (m >= P.fusionShare) excess.push(m / P.fusionShare - 1);
    }
    const elementalMin = Math.min(...ELEMENTAL_IDS.map((el) => shareOf(e, el)));
    if (elementalMin >= P.completeShare) excess.push(elementalMin / P.completeShare - 1);
  }
  if (e.breakthroughs >= P.breakthroughs) excess.push(e.breakthroughs / P.breakthroughs - 1);
  if (e.releases > 0 && e.releases >= e.absorbs * P.restraintRatio) excess.push(e.releases / Math.max(1, e.absorbs * P.restraintRatio) - 1);
  if ((ctx.bond ?? 0) >= P.stableBond && faintsOf(e) === 0 && e.breakthroughs === 0 && longAbsencesOf(e) === 0) excess.push(0);
  if (hunterRunsOf(e) >= P.hunterRuns) excess.push(hunterRunsOf(e) / P.hunterRuns - 1);
  return excess.length > 0 ? [hidden('h3:passage', Math.max(...excess))] : [];
}

/** 4단계 일반 진화체 (GDD 126장 6·확정 5): 속성 = 3단계 속성(통로·망함이면 장착 최다), 타입 = 장착 최다 공격 분류.
 *  혈·독·허가 장착 최다(동률 포함)면 그 속성의 단 하나 타입 진화체가 우선. 망한 진화체에서 오면 실패형 */
export function tier4Normal(e: EvolutionState, ctx: JudgeContext, table: readonly FormDef[] = FORM_TABLE): FormDef {
  const find = (id: string) => table.find((x) => x.id === id);
  const cur = e.formId ? find(e.formId) : undefined;
  if (cur?.label.kind === 'fail') return find('h4:fail')!;
  const counts = judgeElementCounts(ctx.build);
  const max = Math.max(0, ...Object.values(counts));
  if (max > 0) {
    const special = SPECIAL_ELEMENT_IDS.filter((el) => counts[el] === max).map((el) => table.find((f) => f.tier === 4 && !f.hidden && f.label.elements[0] === el)).find((f) => f !== undefined);
    if (special) return special;
  }
  const el = cur?.label.kind === 'element' && cur.elements?.[0] ? cur.elements[0] : tier3Element(ctx.build, table);
  return find(`t4:${el}:${dominantCategory(ctx.build, ctx.factionId)}`) ?? find(`t4:${NORMAL_ELEMENT}:mixed`)!;
}

/** 이번 진화의 일반 후보와 히든 후보 (판정 전 미리보기·점검 도구용). priority = 히든이 있으면 일반을 빼고 히든끼리 고른다(4단계) */
export function evolutionCandidates(e: EvolutionState, ctx: JudgeContext, table: readonly FormDef[] = FORM_TABLE): { normal: FormDef; hidden: EvolutionCandidate[]; forced: FormDef | null; priority: boolean } {
  const tier = e.tierIndex + 2;
  const find = (id: string) => {
    const f = table.find((x) => x.id === id);
    if (!f) throw new Error(`진화체가 없다: ${id}`);
    return f;
  };
  const ok = (c: EvolutionCandidate) => table.some((x) => x.id === c.formId);
  if (tier <= 2) return { normal: find(`t${tier}:base`), hidden: [], forced: null, priority: false };
  if (tier === 3) {
    if (isCareFailure(ctx) || isScattered(e)) return { normal: find('h3:fail'), hidden: [], forced: find('h3:fail'), priority: false };
    return { normal: find(`t3:${tier3Element(ctx.build, table)}`), hidden: passageCandidates(e, ctx).filter(ok), forced: null, priority: false };
  }
  if (isCareFailure(ctx)) return { normal: find('h4:fail'), hidden: [], forced: find('h4:fail'), priority: false };
  return { normal: tier4Normal(e, ctx, table), hidden: tier4HiddenCandidates(e, ctx).filter(ok), forced: null, priority: true };
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
  const { normal, hidden: hiddenList, forced, priority } = evolutionCandidates(e, ctx, table);
  const candidates: EvolutionCandidate[] = forced || hiddenList.length === 0 ? [{ formId: normal.id, weight: 1, excess: 0 }]
    : priority ? hiddenList : [{ formId: normal.id, weight: W.normal, excess: 0 }, ...hiddenList];
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
