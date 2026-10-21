// 진화체 자동 생성기 (GDD 20-5, 임시 템플릿). 속성·분류 목록과 BALANCE 템플릿만 받아 트리를 만든다 — 속성 수가 달라져도 동작한다.
// 결과는 forms.json 에 커밋하고 손으로 고쳐 쓴다 (`npm run gen:forms`). 이름은 자리 표시이고 원작 호로 이름은 쓰지 않는다.
import type { Locomotion } from '../../engine/locomotion';
import { STAT_IDS, type AttackCategory, type FormDef, type FormKind, type StatId, type Stats } from '../schema';

export type Tendency = Partial<Record<string, number>>;

export interface FormTemplate {
  base: Record<number, Tendency>;
  element: Record<string, Tendency>;
  category: Record<string, Tendency>;
  hidden: Record<string, Tendency>;
  fusionScale: number;
  specialScale: number;
  totalScale: Record<string, number>;
  pureStab: number;
}

export interface GenerateInput {
  /** 단계별 종족값 합계 (index 0 = 1단계) */
  tierTotals: readonly number[];
  /** 노멀 속성 id, 원소 id(순환 순서), 특수 속성 id */
  normal: string;
  elemental: readonly string[];
  special: readonly string[];
  categories: readonly AttackCategory[];
  /** 원소 순환에서 마주 보는 쌍(서로 상성이 아닌 쌍): 융합 히든 */
  fusionPairs: readonly [string, string][];
  template: FormTemplate;
  /** 실패형 줄기 종족값 오름분 비율 (GDD 49-8 1번, BALANCE.provisional.evolution.failLine.gainRatio) */
  failGainRatio: number;
}

/** 실패형 줄기 종족값 합계 (GDD 49-8 1번): startTier 단계에서 실패형이 된 뒤 tier 단계의 합계.
 *  startTier − 1 단계 합계에서, 단계마다 일반 오름분(tierTotals 차이) × ratio 만 더한다 */
export function failLineTotal(tierTotals: readonly number[], ratio: number, tier: number, startTier: number): number {
  let total = tierTotals[startTier - 2] ?? tierTotals[0]!;
  for (let t = startTier; t <= tier; t++) total += ((tierTotals[t - 1] ?? total) - (tierTotals[t - 2] ?? total)) * ratio;
  return Math.round(total);
}

/** 이동 방식 배정 (GDD 18-11, 임시): 속성 순번 + 분류 순번으로 걷기/부유/날기를 돌려 단계마다 3종이 고르게 나온다 */
const LOCO_CYCLE: readonly Locomotion[] = ['walk', 'float', 'fly'];
/** 진화체 체인 묶음 상한 (GDD 19-2, provisional): 지금은 전원 3. 4·5체인 캐릭터는 그 진화체 값만 올린다(단계 기술·배율도 같이 추가) */
export const FORM_MAX_CHAIN = 3;

function addTendency(...ts: (Tendency | undefined)[]): Tendency {
  const out: Tendency = {};
  for (const t of ts) for (const [k, v] of Object.entries(t ?? {})) out[k] = (out[k] ?? 0) + (v ?? 0);
  return out;
}

function scaleTendency(t: Tendency | undefined, k: number): Tendency {
  return Object.fromEntries(Object.entries(t ?? {}).map(([s, v]) => [s, (v ?? 0) * k]));
}

/** 종족값 분배: 기준 능력치(합계 ÷ 6) × (1 + 성향). 정수로 내리고 합계가 정확히 total 이 되게 남은 값을 큰 소수부 순으로 더한다 */
export function distribute(total: number, tendency: Tendency): Stats {
  const ref = total / STAT_IDS.length;
  const raw = STAT_IDS.map((s) => Math.max(1, ref * (1 + (tendency[s] ?? 0))));
  const sum = raw.reduce((a, b) => a + b, 0);
  const scaled = raw.map((v) => (v * total) / sum);
  const floors = scaled.map(Math.floor);
  let left = total - floors.reduce((a, b) => a + b, 0);
  const order = scaled.map((v, i) => ({ i, frac: v - Math.floor(v) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const o of order) {
    if (left <= 0) break;
    floors[o.i]!++;
    left--;
  }
  return Object.fromEntries(STAT_IDS.map((s, i) => [s, floors[i]!])) as Stats;
}

function form(id: string, tier: number, kind: FormKind, stats: Stats, extra: Partial<FormDef> & { elements?: string[] }, labelEls: string[], loco: number, category?: AttackCategory): FormDef {
  const hidden = !['base', 'element', 'arrancar'].includes(kind);
  return {
    id,
    tier,
    label: { kind, elements: labelEls, ...(category ? { category } : {}) },
    ...(hidden ? { hidden: true } : {}),
    ...extra,
    stats,
    locomotion: LOCO_CYCLE[loco % LOCO_CYCLE.length]!,
    maxChain: FORM_MAX_CHAIN,
    provisional: true,
  };
}

export function generateForms(input: GenerateInput): FormDef[] {
  const T = input.template;
  const total = (tier: number, kind?: string) => Math.round(input.tierTotals[tier - 1]! * (kind ? (T.totalScale[kind] ?? 1) : 1));
  const all = [input.normal, ...input.elemental, ...input.special];
  const out: FormDef[] = [];
  // 1~3단계: 분기 없음 (2·3단계 각 1종)
  for (const tier of [2, 3]) out.push(form(`t${tier}:base`, tier, 'base', distribute(total(tier), T.base[tier] ?? {}), { elements: [input.normal] }, [], tier));
  // 4단계 바스트로데 일반: 노멀 + 원소 (GDD 49-7 ②, C.106 — 특수 속성은 히든 특수형으로만)
  [input.normal, ...input.elemental].forEach((el, i) => out.push(form(`t4:${el}`, 4, 'element', distribute(total(4), T.element[el] ?? {}), { elements: [el] }, [el], i)));
  // 4단계 히든 8: 원소 융합 2 · 완전체 · 특수 3 · 노멀 순수 · 노멀 실패
  input.fusionPairs.forEach(([a, b], i) =>
    out.push(form(`h4:fusion:${a}+${b}`, 4, 'fusion', distribute(total(4), scaleTendency(addTendency(T.element[a], T.element[b]), T.fusionScale)), { elements: [a, b] }, [a, b], i + 1)),
  );
  out.push(form('h4:complete', 4, 'complete', distribute(total(4, 'complete'), T.hidden.complete ?? {}), { elements: [input.normal] }, [], 1));
  input.special.forEach((el, i) => out.push(form(`h4:special:${el}`, 4, 'special', distribute(total(4), scaleTendency(T.element[el], T.specialScale)), { elements: [el] }, [el], i + 2)));
  out.push(form('h4:pure', 4, 'pure', distribute(total(4), T.hidden.pure ?? {}), { elements: [input.normal], stab: T.pureStab }, [input.normal], 1));
  out.push(form('h4:fail', 4, 'fail', distribute(failLineTotal(input.tierTotals, input.failGainRatio, 4, 4), T.hidden.fail ?? {}), { elements: [input.normal] }, [input.normal], 0));
  // 5단계 아란칼: 속성 × 분류 24
  all.forEach((el, i) =>
    input.categories.forEach((cat, j) =>
      out.push(form(`t5:${el}:${cat}`, 5, 'arrancar', distribute(total(5), addTendency(T.element[el], T.category[cat])), { elements: [el] }, [el], i + j, cat)),
    ),
  );
  // 5단계 히든 4: 속성은 바스트로데에서 잇는다 (elements 없음). reborn = 환생 N회 이상 전용 (GDD 22-7)
  (['limit', 'restraint', 'hunter', 'reborn'] as const).forEach((kind, i) => out.push(form(`h5:${kind}`, 5, kind, distribute(total(5, kind), T.hidden[kind] ?? {}), {}, [], i)));
  return out;
}

/** 이 진화체의 가장 높은 종족값 능력치 (동률은 STAT_IDS 순) */
export function topStat(stats: Stats): StatId {
  return STAT_IDS.reduce((best, s) => (stats[s] > stats[best] ? s : best), STAT_IDS[0] as StatId);
}
