// 진화체 자동 생성기 (GDD 20-5 → 126장 4단계 개편 C.220, 임시 템플릿). 속성·분류 목록과 BALANCE 템플릿만 받아 트리를 만든다 — 속성 수가 달라져도 동작한다.
// 결과는 forms.json 에 커밋하고 손으로 고쳐 쓴다 (`npm run gen:forms`). 이름은 자리 표시이고 원작 호로 이름은 쓰지 않는다.
import { STAT_IDS, type AttackCategory, type FormDef, type FormKind, type StatId, type Stats } from '../schema';

export type Tendency = Partial<Record<string, number>>;

export interface FormTemplate {
  base: Record<number, Tendency>;
  element: Record<string, Tendency>;
  category: Record<string, Tendency>;
  hidden: Record<string, Tendency>;
  fusionScale: number;
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

function form(id: string, tier: number, kind: FormKind, stats: Stats, extra: Partial<FormDef> & { elements?: string[] }, labelEls: string[], category?: AttackCategory): FormDef {
  const hidden = !['base', 'element', 'arrancar'].includes(kind);
  return {
    id,
    tier,
    label: { kind, elements: labelEls, ...(category ? { category } : {}) },
    ...(hidden ? { hidden: true } : {}),
    ...extra,
    stats,
    maxChain: FORM_MAX_CHAIN,
    provisional: true,
  };
}

/** 4단계 히든 10종 (GDD 126장 7): 종류 · 공격 타입 · 속성(없으면 3단계 속성을 잇는다). 융합 2종은 fusionPairs 에서 따로 */
export const TIER4_HIDDEN: readonly { kind: FormKind; category: AttackCategory }[] = [
  { kind: 'complete', category: 'mixed' },
  { kind: 'fail', category: 'physical' },
  { kind: 'awakened', category: 'mixed' },
  { kind: 'frenzy', category: 'physical' },
  { kind: 'restraint', category: 'special' },
  { kind: 'stable', category: 'special' },
  { kind: 'hunter', category: 'physical' },
  { kind: 'void', category: 'mixed' },
];

/** 4단계 일반에서 특수 속성(혈·독·허)이 가지는 단 하나의 공격 타입 (GDD 126장 6: 혈 = 물리 · 독 = 특수 · 허 = 혼합). 특수 속성 순서대로 */
export const SPECIAL_ELEMENT_CATEGORY: readonly AttackCategory[] = ['physical', 'special', 'mixed'];

export function generateForms(input: GenerateInput): FormDef[] {
  const T = input.template;
  const total = (tier: number, kind?: string) => Math.round(input.tierTotals[tier - 1]! * (kind ? (T.totalScale[kind] ?? 1) : 1));
  const out: FormDef[] = [];
  // 2단계: 분기 없음
  out.push(form('t2:base', 2, 'base', distribute(total(2), T.base[2] ?? {}), { elements: [input.normal] }, []));
  // 3단계 7종 (GDD 126장 4): 노멀 + 원소 4 · 망한 진화체 · 히든 통로
  [input.normal, ...input.elemental].forEach((el) => out.push(form(`t3:${el}`, 3, 'element', distribute(total(3), T.element[el] ?? {}), { elements: [el] }, [el])));
  out.push(form('h3:fail', 3, 'fail', distribute(failLineTotal(input.tierTotals, input.failGainRatio, 3, 3), T.hidden.fail ?? {}), { elements: [input.normal] }, [input.normal]));
  out.push(form('h3:passage', 3, 'passage', distribute(total(3), T.hidden.passage ?? {}), { elements: [input.normal] }, []));
  // 4단계 일반 18종 (GDD 126장 6): 노멀·원소 × 공격 타입 3 + 특수 속성은 타입 하나씩
  [input.normal, ...input.elemental].forEach((el) =>
    input.categories.forEach((cat) =>
      out.push(form(`t4:${el}:${cat}`, 4, 'arrancar', distribute(total(4), addTendency(T.element[el], T.category[cat])), { elements: [el] }, [el], cat)),
    ),
  );
  input.special.forEach((el, i) => {
    const cat = SPECIAL_ELEMENT_CATEGORY[i] ?? 'mixed';
    out.push(form(`t4:${el}:${cat}`, 4, 'arrancar', distribute(total(4), addTendency(T.element[el], T.category[cat])), { elements: [el] }, [el], cat));
  });
  // 4단계 히든 10종 (GDD 126장 7): 융합 2 + TIER4_HIDDEN. 속성이 없는 종류는 3단계 속성을 잇는다
  input.fusionPairs.forEach(([a, b]) =>
    out.push(form(`h4:fusion:${a}+${b}`, 4, 'fusion', distribute(total(4), scaleTendency(addTendency(T.element[a], T.element[b]), T.fusionScale)), { elements: [a, b] }, [a, b], 'mixed')),
  );
  for (const { kind, category } of TIER4_HIDDEN) {
    const stats = kind === 'fail'
      ? distribute(failLineTotal(input.tierTotals, input.failGainRatio, 4, 4), T.hidden.fail ?? {})
      : distribute(total(4, kind), T.hidden[kind] ?? {});
    const extra: Partial<FormDef> & { elements?: string[] } =
      kind === 'complete' || kind === 'fail' ? { elements: [input.normal] }
      : kind === 'void' ? { elements: [input.special[input.special.length - 1] ?? input.normal] }
      : kind === 'stable' ? { stab: T.pureStab }
      : {};
    // 특성 칸용 label 속성 (C.220 provisional — 진화체 특성 표는 2차): 허무형 = 특수 속성 셋, 안정형 = 노멀, 실패형 = 노멀
    const labelEls = kind === 'void' ? [...input.special] : kind === 'stable' || kind === 'fail' ? [input.normal] : [];
    out.push(form(`h4:${kind}`, 4, kind, stats, extra, labelEls, category));
  }
  return out;
}

/** 이 진화체의 가장 높은 종족값 능력치 (동률은 STAT_IDS 순) */
export function topStat(stats: Stats): StatId {
  return STAT_IDS.reduce((best, s) => (stats[s] > stats[best] ? s : best), STAT_IDS[0] as StatId);
}
