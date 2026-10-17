// 진화체 선택 (GDD 4-2 v1.0). 종족 무관 순수 함수: 단계별 테이블 + 현재 진화체 + 현재 단계 계통별 누적 → 진화체.
// 조건은 계통별 누적 카운트 어휘뿐이다 (안정 수치·리스크 돌파·전투 성과는 쓰지 않는다).

import type { FormCondition, FormDef } from '../../data/schema';

/** 현재 단계 계통별 누적의 스냅샷. 런 로그(EvolutionRecord.accumulation)에도 그대로 기록된다 */
export interface Accumulation {
  /** 이 단계 진화에 필요한 흡수 횟수 N (비율 조건의 기준) */
  need: number;
  /** 계통 id → 누적(희귀 ×가중). 모든 계통을 0 포함해 적는다 */
  scores: Record<string, number>;
  /** 희귀 흡수 횟수 */
  rare: number;
  /** 계통별 마지막 흡수 순번 (동률일 때 최근 흡수가 앞선다) */
  lastSeq: Record<string, number>;
}

/** 비율 × N 의 올림 (부동소수점 오차 보정) */
export function thresholdOf(ratio: number, need: number): number {
  return Math.ceil(ratio * need - 1e-9);
}

/** 누적이 1 이상인 계통을 많은 순 → 동률은 최근 흡수 → 그래도 같으면 id 순 */
export function rankLineages(acc: Accumulation): string[] {
  return Object.keys(acc.scores)
    .filter((id) => acc.scores[id]! > 0)
    .sort((a, b) => acc.scores[b]! - acc.scores[a]! || (acc.lastSeq[b] ?? 0) - (acc.lastSeq[a] ?? 0) || (a < b ? -1 : 1));
}

/** 조건 평가에 쓰는 계산값 (한 번만 계산해 여러 조건·진화체에 재사용) */
export interface AccContext {
  acc: Accumulation;
  ranked: string[];
  total: number;
  maxShare: number;
}

export function contextOf(acc: Accumulation): AccContext {
  const ranked = rankLineages(acc);
  let total = 0;
  for (const id of Object.keys(acc.scores)) total += acc.scores[id]!;
  const maxShare = total > 0 && ranked.length > 0 ? acc.scores[ranked[0]!]! / total : 0;
  return { acc, ranked, total, maxShare };
}

const share = (c: AccContext, id: string) => (c.total > 0 ? (c.acc.scores[id] ?? 0) / c.total : 0);

/** 상위 n개 계통이 정확히 이 집합인가 (순서 무관, 누적 1 이상인 계통이 n개 이상 있어야 한다) */
function topSetIs(c: AccContext, ids: string[]): boolean {
  if (c.ranked.length < ids.length) return false;
  const top = new Set(c.ranked.slice(0, ids.length));
  return ids.every((id) => top.has(id)) && top.size === ids.length;
}

export function conditionMet(cond: FormCondition, c: AccContext): boolean {
  switch (cond.type) {
    case 'lineageCount':
      return (c.acc.scores[cond.lineage] ?? 0) >= thresholdOf(cond.ratio, c.acc.need);
    case 'lineageShare':
      return share(c, cond.lineage) >= cond.min - 1e-9;
    case 'lineagesShareSum':
      return cond.lineages.reduce((s, id) => s + share(c, id), 0) >= cond.min - 1e-9;
    case 'top1':
      return c.ranked[0] === cond.lineage;
    case 'top2':
      return topSetIs(c, cond.lineages);
    case 'top3':
      return topSetIs(c, cond.lineages);
    case 'maxShareAtLeast':
      return c.total > 0 && c.maxShare >= cond.min - 1e-9;
    case 'maxShareAtMost':
      return c.total > 0 && c.maxShare <= cond.max + 1e-9;
    case 'activeLineages':
      return c.ranked.length >= cond.min;
    case 'allLineagesCount': {
      const k = thresholdOf(cond.ratio, c.acc.need);
      return Object.values(c.acc.scores).every((v) => v >= k);
    }
    case 'rareCount':
      return c.acc.rare >= Math.max(1, thresholdOf(cond.ratio, c.acc.need));
  }
}

export function meetsAll(requires: readonly FormCondition[], c: AccContext): boolean {
  return requires.every((r) => conditionMet(r, c));
}

/** 후보 정렬: priority 높은 쪽 → 조건 수 많은 쪽 → id 순 (결정적). 앞이 더 우선 */
export function compareForms(a: FormDef, b: FormDef): number {
  return b.priority - a.priority || b.requires.length - a.requires.length || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** 두 진화체의 우선순위가 id 순까지 가서야 갈리는가 (점검 도구가 "모호함"으로 센다) */
export function tiedByRules(a: FormDef, b: FormDef): boolean {
  return a.priority === b.priority && a.requires.length === b.requires.length;
}

export function fromMatches(form: FormDef, currentFormId: string | null): boolean {
  return form.from === 'any' || (currentFormId !== null && form.from.includes(currentFormId));
}

export function formsOfTier(table: readonly FormDef[], tier: number): FormDef[] {
  return table.filter((f) => f.tier === tier);
}

export function fallbackOf(table: readonly FormDef[], tier: number): FormDef {
  const f = table.find((x) => x.tier === tier && x.fallback);
  if (!f) throw new Error(`${tier}단계 기본형이 없다`);
  return f;
}

/** 조건을 채운 진화체들 (경로 `from` 은 보지 않는다). 우선순위가 높은 순. 기본형은 후보가 아니다 */
export function matchingForms(tierForms: readonly FormDef[], c: AccContext): FormDef[] {
  return tierForms.filter((f) => !f.fallback && meetsAll(f.requires, c)).sort(compareForms);
}

/** 후보 = 경로(`from`)가 현재 진화체와 맞고 조건을 모두 채운 진화체. 우선순위가 높은 순 */
export function candidateForms(table: readonly FormDef[], tier: number, currentFormId: string | null, acc: Accumulation): FormDef[] {
  return matchingForms(formsOfTier(table, tier), contextOf(acc)).filter((f) => fromMatches(f, currentFormId));
}

/**
 * 진화할 진화체를 고른다. tier 는 도달하는 단계(2~5). 후보가 없으면 그 단계 기본형.
 * 후보가 여럿이면 priority 높은 것 → 조건 수 많은 것 → id 순.
 */
export function selectForm(table: readonly FormDef[], tier: number, currentFormId: string | null, acc: Accumulation): FormDef {
  return candidateForms(table, tier, currentFormId, acc)[0] ?? fallbackOf(table, tier);
}

/** 테이블 구조 검사. 문제 목록 (비면 정상). lineageIds 는 지금 있는 계통 id */
export function validateFormTable(table: readonly FormDef[], lineageIds: readonly string[], maxTier = 5): string[] {
  const errors: string[] = [];
  const known = new Set(lineageIds);
  const byId = new Map<string, FormDef>();
  for (const f of table) {
    if (byId.has(f.id)) errors.push(`진화체 id 중복: ${f.id}`);
    byId.set(f.id, f);
  }
  const checkLineages = (f: FormDef, ids: readonly string[]) => {
    for (const id of ids) if (!known.has(id)) errors.push(`${f.id}: 알 수 없는 계통 ${id}`);
  };
  for (let tier = 2; tier <= maxTier; tier++) {
    const forms = formsOfTier(table, tier);
    const fallbacks = forms.filter((f) => f.fallback);
    if (fallbacks.length !== 1) errors.push(`${tier}단계 기본형이 ${fallbacks.length}개 (정확히 1개여야 한다)`);
  }
  for (const f of table) {
    if (f.tier < 2 || f.tier > maxTier) errors.push(`${f.id}: 단계 ${f.tier} 는 2~${maxTier} 가 아니다`);
    if (f.fallback && f.requires.length > 0) errors.push(`${f.id}: 기본형은 조건이 없어야 한다`);
    if (!f.fallback && f.requires.length === 0) errors.push(`${f.id}: 조건이 없는 진화체는 기본형뿐이다`);
    if (f.tier === 2 && f.from !== 'any') errors.push(`${f.id}: 2단계 진화체의 from 은 'any'`);
    if (f.from !== 'any') {
      for (const p of f.from) {
        const prev = byId.get(p);
        if (!prev) errors.push(`${f.id}: from ${p} 가 없다`);
        else if (prev.tier !== f.tier - 1) errors.push(`${f.id}: from ${p} 는 ${f.tier - 1}단계가 아니다`);
      }
    }
    checkLineages(f, f.label.lineages);
    for (const r of f.requires) {
      if ('lineage' in r) checkLineages(f, [r.lineage]);
      if ('lineages' in r) checkLineages(f, r.lineages);
      if (r.type === 'top2' && r.lineages.length !== 2) errors.push(`${f.id}: top2 는 계통 2개`);
      if (r.type === 'top3' && r.lineages.length !== 3) errors.push(`${f.id}: top3 는 계통 3개`);
    }
  }
  return errors;
}
