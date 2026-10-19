// 진화체 자동 생성기 (GDD 4-2 v1.0, 임시 템플릿). 계통 id 목록만 받아 단계별 테이블을 만든다 — 계통 수가 달라져도 동작한다.
// 결과는 forms.json 에 커밋하고 손으로 고쳐 쓴다 (`npm run gen:forms`). 이름은 자리 표시이고 원작 호로 이름은 쓰지 않는다.
import type { Locomotion } from '../../engine/locomotion';
import type { FormCondition, FormDef, FormEffects, FormKind, PassiveStat } from '../schema';

export interface FormTemplate {
  balancedMaxShare: number;
  balancedMinActive: number;
  pickyMinShare: number;
  rareMinRatio: number;
  deepPairMinShare: number;
  priority: Record<FormKind, number>;
  effects: {
    base: { hp: number; attack: number };
    normal: { hp: number; attack: number };
    perWeight: { hp: number; attack: number };
    weight: Record<FormKind, number>;
  };
}

export type TendencyOf = (lineageId: string) => { stat: PassiveStat; multiplier: number } | undefined;

function combinations<T>(items: readonly T[], k: number): T[][] {
  if (k === 0) return [[]];
  const out: T[][] = [];
  items.forEach((x, i) => {
    for (const rest of combinations(items.slice(i + 1), k - 1)) out.push([x, ...rest]);
  });
  return out;
}

const round = (v: number, digits: number) => Math.round(v * 10 ** digits) / 10 ** digits;

/** 이동 방식 배정 (GDD 18-11, 임시): 요구 계통 번호(정렬 순) 합을 3으로 나눈 나머지로 걷기/부유/날기를 돌려 단계마다 3종이 고르게 나온다. 계통 없는 특수형은 종류별로 고정 */
const LOCO_CYCLE: readonly Locomotion[] = ['walk', 'float', 'fly'];
const LOCO_BY_KIND: Partial<Record<FormKind, Locomotion>> = { balanced: 'float', picky: 'fly', rare: 'walk', base: 'walk' };
export function locomotionOf(kind: FormKind, lineages: readonly string[], sortedIds: readonly string[]): Locomotion {
  if (lineages.length === 0) return LOCO_BY_KIND[kind] ?? 'walk';
  const sum = lineages.reduce((a, l) => a + Math.max(0, sortedIds.indexOf(l)), 0);
  return LOCO_CYCLE[sum % LOCO_CYCLE.length]!;
}

export function formIdOf(tier: number, kind: FormKind, lineages: readonly string[]): string {
  return `t${tier}:${kind}${lineages.length > 0 ? `@${lineages.join('+')}` : ''}`;
}

/** 요구 계통의 성향을 섞은 패시브: 계통 n개면 각 성향을 1/n 만큼 반영한다 (C.9 방식 재사용) */
function derivePassive(lineages: readonly string[], tendencyOf: TendencyOf): FormEffects['passive'] {
  const out: FormEffects['passive'] = {};
  for (const id of lineages) {
    const t = tendencyOf(id);
    if (!t) continue;
    out[t.stat] = round((out[t.stat] ?? 1) * (1 + (t.multiplier - 1) / lineages.length), 4);
  }
  return out;
}

function effectsOf(kind: FormKind, lineages: readonly string[], tpl: FormTemplate, tendencyOf: TendencyOf): FormEffects {
  const fx = tpl.effects;
  if (kind === 'base') return { hpMultiplier: fx.base.hp, attackMultiplier: fx.base.attack, passive: {} };
  const w = fx.weight[kind];
  return {
    hpMultiplier: round(fx.normal.hp + fx.perWeight.hp * w, 3),
    attackMultiplier: round(fx.normal.attack + fx.perWeight.attack * w, 3),
    passive: derivePassive(lineages, tendencyOf),
  };
}

/** 계통 id 목록으로 단계(2~5) 전체 진화체 테이블을 만든다 */
export function generateForms(lineageIds: readonly string[], tpl: FormTemplate, tendencyOf: TendencyOf): FormDef[] {
  const ids = [...lineageIds].sort();
  const n = ids.length;
  const balancedMax = Math.max(tpl.balancedMaxShare, 1 / n + 0.03);
  const balancedActive = Math.min(tpl.balancedMinActive, n);
  const out: FormDef[] = [];
  let prev: FormDef[] = [];

  const make = (tier: number, kind: FormKind, lineages: string[], requires: FormCondition[], from: FormDef['from']): FormDef => ({
    id: formIdOf(tier, kind, lineages),
    tier,
    label: { kind, lineages },
    from,
    requires,
    priority: tpl.priority[kind],
    ...(kind === 'base' ? { fallback: true as const } : {}),
    effects: effectsOf(kind, lineages, tpl, tendencyOf),
    locomotion: locomotionOf(kind, lineages, ids),
    provisional: true,
  });
  /** 경로 규칙(임시): 이전 단계 진화체가 요구 계통을 하나라도 포함하면 연결. 계통이 없는 이전 진화체(특수형·기본형)는 막다른 길을 피하려 모든 곳에 연결 */
  const connect = (lineages: readonly string[]): string[] =>
    prev.filter((p) => p.label.lineages.length === 0 || p.label.lineages.some((l) => lineages.includes(l))).map((p) => p.id);

  const specials = (tier: number, kinds: FormKind[]): FormDef[] => {
    const conds: Record<string, FormCondition[]> = {
      balanced: [{ type: 'maxShareAtMost', max: round(balancedMax, 4) }, { type: 'activeLineages', min: balancedActive }],
      picky: [{ type: 'maxShareAtLeast', min: tpl.pickyMinShare }],
      rare: [{ type: 'rareCount', ratio: tpl.rareMinRatio }],
    };
    return kinds.map((k) => make(tier, k, [], conds[k]!, 'any'));
  };

  // 2단계: 계통별 우세형 (1위 = X)
  let cur = ids.map((x) => make(2, 'dominant', [x], [{ type: 'top1', lineage: x }], 'any'));
  cur.push(make(2, 'base', [], [], 'any'));
  out.push(...cur);
  prev = cur;

  // 3단계 (v1.1: 2조합은 경로 제한 없음): 2조합 + 균형형 + 편식형 + 희귀형
  cur = combinations(ids, 2).map((c) => make(3, 'pair', c, [{ type: 'top2', lineages: c }], 'any'));
  cur.push(...specials(3, ['balanced', 'picky', 'rare']), make(3, 'base', [], [], 'any'));
  out.push(...cur);
  prev = cur;

  // 4단계: 3조합 + 2조합 심화 + 균형형 + 편식형
  cur = combinations(ids, 3).map((c) => make(4, 'triple', c, [{ type: 'top3', lineages: c }], connect(c)));
  cur.push(
    ...combinations(ids, 2).map((c) =>
      make(4, 'deep-pair', c, [{ type: 'top2', lineages: c }, { type: 'lineagesShareSum', lineages: c, min: tpl.deepPairMinShare }], connect(c)),
    ),
    ...specials(4, ['balanced', 'picky']),
    make(4, 'base', [], [], 'any'),
  );
  out.push(...cur);
  prev = cur;

  // 5단계 (v1.1): 3조합 + 2조합. 3조합이 우선순위가 높아 3계통을 채우면 더 구체적인 형태, 몰린 분포는 2조합으로 간다
  // (v1.7 보강 C.31: 한 계통에만 몰린 분포는 2조합 조건(1·2위가 모두 누적 있음)을 못 채워 기본형이 18.9%였다 → 편식형 추가)
  cur = [
    ...combinations(ids, 3).map((c) => make(5, 'triple', c, [{ type: 'top3', lineages: c }], connect(c))),
    ...combinations(ids, 2).map((c) => make(5, 'pair', c, [{ type: 'top2', lineages: c }], connect(c))),
    ...specials(5, ['picky']),
  ];
  cur.push(make(5, 'base', [], [], 'any'));
  out.push(...cur);
  return out;
}
