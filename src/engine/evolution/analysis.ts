// 진화체 테이블 점검 (GDD 4-2 "점검 도구"): ① 도달 가능성 ② 단계마다 기본형 1개 ③ 선택 모호성 ④ "후보 없음 → 기본형" 비율.
// 흡수 분포를 전수(계통이 적을 때)·무작위로 훑어 selectForm 이 실제로 어떤 진화체를 고르는지 센다. 종족 무관, 데이터만 본다.
import type { FormDef } from '../../data/schema';
import { createRng, nextFloat, nextInt, type Rng } from '../rng';
import {
  contextOf, fallbackOf, formsOfTier, fromMatches, matchingForms, tiedByRules, type Accumulation,
} from './select';

export interface AnalysisConfig {
  /** 단계당 무작위 샘플 수 */
  randomSamples: number;
  seed: number;
  /** 편향 지수 목록: 계통 가중치 = 난수^지수 (클수록 한 계통에 쏠린다) */
  skews: readonly number[];
  /** 계통 수가 이 이하면 가능한 모든 흡수 분포(횟수 조합)를 전수 조사한다 */
  enumerateMaxLineages: number;
  /** 희귀 흡수 가중 (누적에 더해지는 값, 임시 ×2) */
  rareWeight: number;
  /** 집중형 분포(1계통·2계통·3계통 몰림, 균등) 프로필마다의 샘플 수 (v1.1) */
  concentratedSamples: number;
}

/** 집중형 분포 프로필: 몰아 먹는 계통 수 (0 = 균등) */
export const CONCENTRATION_PROFILES = [
  { key: 'focus1', label: '1계통 몰림', focus: 1 },
  { key: 'focus2', label: '2계통 몰림', focus: 2 },
  { key: 'focus3', label: '3계통', focus: 3 },
  { key: 'even', label: '균등', focus: 0 },
] as const;
export type ProfileKey = (typeof CONCENTRATION_PROFILES)[number]['key'];

/** 집중형 분포 하나: focus 개 계통에 가중 1, 나머지는 0~0.15 의 소량(가끔 0)으로 need 번 흡수한다 */
export function concentratedAccumulation(lineageIds: readonly string[], need: number, focus: number, rng: Rng, cfg: AnalysisConfig): Accumulation {
  const n = lineageIds.length;
  const k = focus === 0 ? n : Math.min(focus, n);
  const order = lineageIds.map((_, i) => i).sort(() => nextFloat(rng) - 0.5);
  const focused = new Set(order.slice(0, k));
  const weights = lineageIds.map((_, i) => (focused.has(i) ? 0.6 + nextFloat(rng) * 0.4 : nextFloat(rng) < 0.5 ? 0 : nextFloat(rng) * 0.15));
  const sum = weights.reduce((a, b) => a + b, 0);
  const rareP = [0, 0.1, 0.1, 0.25][nextInt(rng, 4)]!;
  const scores = lineageIds.map(() => 0);
  const lastSeq = lineageIds.map(() => 0);
  let rare = 0;
  for (let i = 0; i < need; i++) {
    let x = nextFloat(rng) * sum;
    let j = 0;
    while (j < weights.length - 1 && x >= weights[j]!) x -= weights[j++]!;
    const isRare = nextFloat(rng) < rareP;
    scores[j]! += isRare ? cfg.rareWeight : 1;
    if (isRare) rare++;
    lastSeq[j] = i + 1;
  }
  return accOf(lineageIds, need, scores, lastSeq, rare);
}

/** 모든 횟수 조합 (합 = total, 각 ≥ 0). 순서대로 하나씩 낸다 */
function* compositions(parts: number, total: number): Generator<number[]> {
  if (parts === 1) {
    yield [total];
    return;
  }
  for (let first = 0; first <= total; first++) for (const rest of compositions(parts - 1, total - first)) yield [first, ...rest];
}

function accOf(lineageIds: readonly string[], need: number, scores: number[], lastSeq: number[], rare: number): Accumulation {
  const s: Record<string, number> = {};
  const q: Record<string, number> = {};
  lineageIds.forEach((id, i) => {
    s[id] = scores[i]!;
    q[id] = lastSeq[i]!;
  });
  return { need, scores: s, rare, lastSeq: q };
}

/** 무작위 분포 하나: 계통 가중치로 need 번 흡수하고, 일부는 희귀(누적 가중)로 친다. 마지막 흡수 순번도 실제 순서로 정한다 */
export function randomAccumulation(lineageIds: readonly string[], need: number, rng: Rng, cfg: AnalysisConfig): Accumulation {
  const skew = cfg.skews[nextInt(rng, cfg.skews.length)]!;
  const weights = lineageIds.map(() => nextFloat(rng) ** skew + 1e-6);
  const sum = weights.reduce((a, b) => a + b, 0);
  const rareP = [0, 0.1, 0.1, 0.25][nextInt(rng, 4)]!;
  const scores = lineageIds.map(() => 0);
  const lastSeq = lineageIds.map(() => 0);
  let rare = 0;
  for (let i = 0; i < need; i++) {
    let x = nextFloat(rng) * sum;
    let k = 0;
    while (k < weights.length - 1 && x >= weights[k]!) x -= weights[k++]!;
    const isRare = nextFloat(rng) < rareP;
    scores[k]! += isRare ? cfg.rareWeight : 1;
    if (isRare) rare++;
    lastSeq[k] = i + 1;
  }
  return accOf(lineageIds, need, scores, lastSeq, rare);
}

/** 점검할 흡수 분포들: (계통 수가 적으면) 전수 조사 + 무작위 샘플 */
export function* accumulationSamples(lineageIds: readonly string[], need: number, cfg: AnalysisConfig): Generator<Accumulation> {
  const n = lineageIds.length;
  if (n <= cfg.enumerateMaxLineages) {
    const order = lineageIds.map((_, i) => i + 1);
    const reversed = [...order].reverse();
    let idx = 0;
    for (const counts of compositions(n, need)) {
      // 동률일 때 최근 흡수 순서가 정방향/역방향인 두 경우
      yield accOf(lineageIds, need, counts, order, 0);
      yield accOf(lineageIds, need, counts, reversed, 0);
      // 희귀 흡수가 섞인 경우도 가끔 (희귀 5회: 처음으로 흡수가 있는 계통에 가중이 얹힌다)
      if (idx++ % 40 === 0) {
        const first = counts.findIndex((c) => c > 0);
        const sc = counts.map((c, i) => (i === first ? c + 5 * (cfg.rareWeight - 1) : c));
        yield accOf(lineageIds, need, sc, order, 5);
      }
    }
  }
  const rng = createRng(cfg.seed + need);
  for (let i = 0; i < cfg.randomSamples; i++) yield randomAccumulation(lineageIds, need, rng, cfg);
}

export interface TierReport {
  tier: number;
  /** 기본형을 뺀 진화체 수 */
  formCount: number;
  fallbackCount: number;
  need: number;
  /** 분포 샘플 수 (경로 판정은 현재 진화체 수만큼 곱해진다) */
  samples: number;
  /** 진화체 id → 선택된 횟수 (현재 진화체를 이전 단계 진화체 중 균등하게 본 경로 포함 판정) */
  selected: Record<string, number>;
  /** 한 번도 선택되지 않은 진화체 (도달 불가). 기본형은 안전망이라 뺀다 — 선택 횟수는 selected 에 있다 */
  unreachable: string[];
  /** 경로를 무시한 "후보 없음 → 기본형" 비율 (점검 ④ 기준) */
  fallbackRate: number;
  /** 경로를 포함한 비율 (참고: 현재 진화체를 이전 단계 진화체 중 균등하게 본다) */
  fallbackRateWithPath: number;
  /** 집중형 프로필별 "후보 없음 → 기본형" 비율(경로 포함) */
  fallbackByProfile: Record<ProfileKey, number>;
  /** 우선순위·조건 수까지 같아 id 순으로만 갈린 경우 수와 예 */
  ambiguous: number;
  ambiguousExamples: string[];
}

export function analyzeTier(table: readonly FormDef[], tier: number, lineageIds: readonly string[], need: number, cfg: AnalysisConfig): TierReport {
  const forms = formsOfTier(table, tier);
  const fallback = fallbackOf(table, tier);
  const currents: (string | null)[] = tier === 2 ? [null] : formsOfTier(table, tier - 1).map((f) => f.id);
  const selected: Record<string, number> = Object.fromEntries(forms.map((f) => [f.id, 0]));
  const ambiguousExamples: string[] = [];
  let samples = 0;
  let fb = 0;
  let fbPath = 0;
  let ambiguous = 0;
  const profFb = {} as Record<ProfileKey, number>;
  const profRng = createRng(cfg.seed * 7 + need);
  const profileSamples = CONCENTRATION_PROFILES.flatMap((pr) =>
    Array.from({ length: cfg.concentratedSamples }, () => ({ key: pr.key as ProfileKey, acc: concentratedAccumulation(lineageIds, need, pr.focus, profRng, cfg) })),
  );
  const all: { key: ProfileKey | null; acc: Accumulation }[] = [...accumulationSamples(lineageIds, need, cfg)].map((acc) => ({ key: null, acc }));
  all.push(...profileSamples);
  for (const { key, acc } of all) {
    samples++;
    const matching = matchingForms(forms, contextOf(acc));
    if (matching.length === 0) fb++;
    for (const cur of currents) {
      const cand = matching.filter((f) => fromMatches(f, cur));
      if (cand.length === 0) {
        fbPath++;
        if (key) profFb[key] = (profFb[key] ?? 0) + 1;
      }
      selected[(cand[0] ?? fallback).id]!++;
      if (cand.length >= 2 && tiedByRules(cand[0]!, cand[1]!)) {
        ambiguous++;
        if (ambiguousExamples.length < 5) ambiguousExamples.push(`${cand[0]!.id} / ${cand[1]!.id} (현재 ${cur ?? '-'})`);
      }
    }
  }
  return {
    tier,
    formCount: forms.filter((f) => !f.fallback).length,
    fallbackCount: forms.filter((f) => f.fallback).length,
    need,
    samples,
    selected,
    unreachable: forms.filter((f) => !f.fallback && selected[f.id] === 0).map((f) => f.id),
    fallbackRate: fb / samples,
    fallbackRateWithPath: fbPath / (samples * currents.length),
    fallbackByProfile: Object.fromEntries(
      CONCENTRATION_PROFILES.map((pr) => [pr.key, (profFb[pr.key] ?? 0) / (cfg.concentratedSamples * currents.length)]),
    ) as Record<ProfileKey, number>,
    ambiguous,
    ambiguousExamples,
  };
}

/** 단계 2~5 전체 점검. needs[i] = (i+2)단계로 가는 진화에 필요한 흡수 횟수 */
export function analyzeTable(table: readonly FormDef[], lineageIds: readonly string[], needs: readonly number[], cfg: AnalysisConfig): TierReport[] {
  return [2, 3, 4, 5].map((tier) => analyzeTier(table, tier, lineageIds, needs[tier - 2]!, cfg));
}

/** 점검 결과에서 문제 목록을 뽑는다 (비면 통과). maxFallbackRate 는 경로 포함 기준(v1.1), 집중형 프로필도 각각 본다 */
export function reportProblems(reports: readonly TierReport[], maxFallbackRate: number): string[] {
  const out: string[] = [];
  for (const r of reports) {
    if (r.fallbackCount !== 1) out.push(`${r.tier}단계 기본형 ${r.fallbackCount}개`);
    if (r.unreachable.length > 0) out.push(`${r.tier}단계 도달 불가 ${r.unreachable.length}종: ${r.unreachable.join(', ')}`);
    if (r.ambiguous > 0) out.push(`${r.tier}단계 선택 모호 ${r.ambiguous}건: ${r.ambiguousExamples.join(' ; ')}`);
    if (r.fallbackRateWithPath > maxFallbackRate) out.push(`${r.tier}단계 "후보 없음 → 기본형"(경로 포함) ${(r.fallbackRateWithPath * 100).toFixed(1)}% > ${(maxFallbackRate * 100).toFixed(0)}%`);
    for (const pr of CONCENTRATION_PROFILES) {
      if (r.fallbackByProfile[pr.key] > maxFallbackRate) out.push(`${r.tier}단계 ${pr.label} 분포 기본형(경로 포함) ${(r.fallbackByProfile[pr.key] * 100).toFixed(1)}% > ${(maxFallbackRate * 100).toFixed(0)}%`);
    }
  }
  return out;
}
