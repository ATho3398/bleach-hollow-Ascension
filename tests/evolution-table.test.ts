// 단계별 진화체 테이블 (GDD 4-2 v1.0): 조건 어휘, 선택 규칙, 데이터 생성기, 도달 가능성 점검
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { FORM_TABLE, formName, formsOfTier, generateFormTable, generateForms, tierFallback } from '../src/data/evolution';
import type { FormTemplate } from '../src/data/evolution/generate';
import { LINEAGES } from '../src/data/lineages';
import type { FormCondition, FormDef } from '../src/data/schema';
import {
  analyzeTable, analyzeTier, candidateForms, conditionMet, contextOf, reportProblems, selectForm, thresholdOf, validateFormTable, type Accumulation,
} from '../src/engine/evolution';

const EV = BALANCE.provisional.evolution;
const IDS = ['lineage-a', 'lineage-b', 'lineage-c', 'lineage-d', 'lineage-e'];
const [A, B, C, D, E] = IDS as [string, string, string, string, string];
const CFG = { ...EV.analysis, skews: [...EV.analysis.skews], rareWeight: EV.rareWeight };

/** 누적 스냅샷: 적지 않은 계통은 0. 동률일 때 최근 흡수는 recent 순서(앞이 가장 최근), 기본은 id 가 뒤인 쪽이 최근 */
function acc(scores: Record<string, number>, o: { need?: number; rare?: number; recent?: string[]; ids?: string[] } = {}): Accumulation {
  const ids = o.ids ?? IDS;
  const lastSeq: Record<string, number> = {};
  ids.forEach((id, i) => (lastSeq[id] = o.recent ? ids.length - (o.recent.indexOf(id) < 0 ? ids.length : o.recent.indexOf(id)) : i + 1));
  return { need: o.need ?? 30, scores: Object.fromEntries(ids.map((id) => [id, scores[id] ?? 0])), rare: o.rare ?? 0, lastSeq };
}
const meets = (c: FormCondition, a: Accumulation) => conditionMet(c, contextOf(a));

describe('조건 어휘 (현재 단계 계통별 누적 기준)', () => {
  it('계통 X 누적 ≥ k: 비율 × N 올림, N 에 맞춰 스케일된다', () => {
    const c: FormCondition = { type: 'lineageCount', lineage: A, ratio: 0.5 };
    expect(meets(c, acc({ [A]: 15 }, { need: 30 }))).toBe(true);
    expect(meets(c, acc({ [A]: 14 }, { need: 30 }))).toBe(false);
    expect(meets(c, acc({ [A]: 9 }, { need: 17 }))).toBe(true); // ceil(8.5) = 9
    expect(meets(c, acc({ [A]: 8 }, { need: 17 }))).toBe(false);
    expect(meets(c, acc({ [A]: 19 }, { need: 40 }))).toBe(false);
    expect(meets(c, acc({ [A]: 20 }, { need: 40 }))).toBe(true);
    expect(thresholdOf(0.1, 30)).toBe(3); // 0.1 × 30 = 3.0000000000000004 라도 3
  });

  it('계통 X 비중 ≥ p, 계통들의 비중 합 ≥ p', () => {
    const a = acc({ [A]: 14, [B]: 6, [C]: 10 }); // 합 30: A 46.7% · B 20% · C 33.3%
    expect(meets({ type: 'lineageShare', lineage: A, min: 0.46 }, a)).toBe(true);
    expect(meets({ type: 'lineageShare', lineage: A, min: 0.47 }, a)).toBe(false);
    expect(meets({ type: 'lineagesShareSum', lineages: [B, C], min: 0.53 }, a)).toBe(true);
    expect(meets({ type: 'lineagesShareSum', lineages: [B, C], min: 0.54 }, a)).toBe(false);
    expect(meets({ type: 'lineageShare', lineage: A, min: 0.1 }, acc({}))).toBe(false); // 흡수 0
  });

  it('1위 = X, 1·2위 = {X,Y} (순서 무관), 1·2·3위 = {X,Y,Z}', () => {
    const a = acc({ [A]: 10, [B]: 8, [C]: 5, [D]: 2 });
    expect(meets({ type: 'top1', lineage: A }, a)).toBe(true);
    expect(meets({ type: 'top1', lineage: B }, a)).toBe(false);
    expect(meets({ type: 'top2', lineages: [A, B] }, a)).toBe(true);
    expect(meets({ type: 'top2', lineages: [B, A] }, a)).toBe(true);
    expect(meets({ type: 'top2', lineages: [A, C] }, a)).toBe(false);
    expect(meets({ type: 'top3', lineages: [C, A, B] }, a)).toBe(true);
    expect(meets({ type: 'top3', lineages: [A, B, D] }, a)).toBe(false);
    // 누적이 있는 계통이 모자라면 해당 조합은 성립하지 않는다
    expect(meets({ type: 'top2', lineages: [A, B] }, acc({ [A]: 20 }))).toBe(false);
    expect(meets({ type: 'top3', lineages: [A, B, C] }, acc({ [A]: 10, [B]: 10 }))).toBe(false);
  });

  it('동률이면 가장 최근에 흡수한 계통이 앞선다', () => {
    const tie = { [A]: 10, [B]: 10, [C]: 10 };
    expect(meets({ type: 'top1', lineage: C }, acc(tie, { recent: [C, B, A] }))).toBe(true);
    expect(meets({ type: 'top1', lineage: A }, acc(tie, { recent: [A, B, C] }))).toBe(true);
    expect(meets({ type: 'top2', lineages: [A, B] }, acc({ [A]: 20, [B]: 10, [C]: 10 }, { recent: [B, C, A] }))).toBe(true);
    expect(meets({ type: 'top2', lineages: [A, C] }, acc({ [A]: 20, [B]: 10, [C]: 10 }, { recent: [B, C, A] }))).toBe(false);
  });

  it('최다 비중 ≥ p / ≤ p, 누적 1 이상인 계통 수 ≥ k, 모든 계통 ≥ k, 희귀 수 ≥ n', () => {
    const skew = acc({ [A]: 21, [B]: 9 }); // A 70%
    expect(meets({ type: 'maxShareAtLeast', min: 0.7 }, skew)).toBe(true);
    expect(meets({ type: 'maxShareAtLeast', min: 0.71 }, skew)).toBe(false);
    expect(meets({ type: 'maxShareAtMost', max: 0.7 }, skew)).toBe(true);
    expect(meets({ type: 'maxShareAtMost', max: 0.69 }, skew)).toBe(false);
    expect(meets({ type: 'maxShareAtMost', max: 0.9 }, acc({}))).toBe(false); // 흡수 0 이면 균형도 아니다
    const even = acc({ [A]: 6, [B]: 6, [C]: 6, [D]: 6, [E]: 6 });
    expect(meets({ type: 'activeLineages', min: 5 }, even)).toBe(true);
    expect(meets({ type: 'activeLineages', min: 3 }, skew)).toBe(false);
    expect(meets({ type: 'allLineagesCount', ratio: 0.2 }, even)).toBe(true); // 6 ≥ ceil(0.2 × 30)
    expect(meets({ type: 'allLineagesCount', ratio: 0.21 }, even)).toBe(false);
    expect(meets({ type: 'allLineagesCount', ratio: 0.1 }, acc({ [A]: 20, [B]: 10 }))).toBe(false);
    expect(meets({ type: 'rareCount', ratio: 0.2 }, acc({ [A]: 30 }, { rare: 6 }))).toBe(true);
    expect(meets({ type: 'rareCount', ratio: 0.2 }, acc({ [A]: 30 }, { rare: 5 }))).toBe(false);
    expect(meets({ type: 'rareCount', ratio: 0 }, acc({ [A]: 30 }, { rare: 0 }))).toBe(false); // 최소 1회
  });
});

/** 선택 규칙 시험용 작은 테이블: 2단계에 진화체 몇 개 */
function form(id: string, o: Partial<FormDef> & { tier?: number }): FormDef {
  return {
    id, tier: o.tier ?? 2, label: { kind: 'dominant', lineages: [] }, from: 'any', requires: [{ type: 'top1', lineage: A }], priority: 10,
    effects: { hpMultiplier: 1, attackMultiplier: 1, passive: {} }, ...o,
  };
}

describe('선택 규칙 selectForm', () => {
  const base = form('base2', { fallback: true, requires: [], priority: 0 });

  it('경로(from) 필터: 현재 진화체와 맞는 진화체만 후보다. any 는 항상', () => {
    const prev = form('prev', { tier: 2 });
    const t3a = form('t3a', { tier: 3, from: ['prev'] });
    const t3any = form('t3any', { tier: 3, from: 'any', priority: 1 });
    const t3base = form('t3base', { tier: 3, fallback: true, requires: [], priority: 0 });
    const table = [prev, t3a, t3any, t3base];
    const a = acc({ [A]: 30 });
    expect(selectForm(table, 3, 'prev', a).id).toBe('t3a');
    expect(selectForm(table, 3, 'other', a).id).toBe('t3any'); // t3a 는 경로가 안 맞는다
    expect(selectForm(table, 3, null, a).id).toBe('t3any');
    expect(candidateForms(table, 3, 'prev', a).map((f) => f.id)).toEqual(['t3a', 't3any']); // 우선순위 순
  });

  it('후보가 여럿이면 priority → 조건 수 → id 순 (결정적)', () => {
    const hi = form('z-hi', { priority: 20 });
    const lo = form('a-lo', { priority: 10 });
    expect(selectForm([lo, hi, base], 2, null, acc({ [A]: 30 })).id).toBe('z-hi');
    // priority 가 같으면 조건 수가 많은 쪽
    const two = form('z-two', { requires: [{ type: 'top1', lineage: A }, { type: 'maxShareAtLeast', min: 0.5 }] });
    const one = form('a-one', {});
    expect(selectForm([one, two, base], 2, null, acc({ [A]: 30 })).id).toBe('z-two');
    // 그래도 같으면 id 순, 입력 순서와 무관
    const x = form('x', {});
    const y = form('y', {});
    expect(selectForm([y, x, base], 2, null, acc({ [A]: 30 })).id).toBe('x');
    expect(selectForm([x, y, base], 2, null, acc({ [A]: 30 })).id).toBe('x');
  });

  it('후보가 없으면 그 단계 기본형, 기본형은 후보에 끼지 않는다', () => {
    const f = form('only-b', { requires: [{ type: 'top1', lineage: B }] });
    expect(selectForm([f, base], 2, null, acc({ [A]: 30 })).id).toBe('base2');
    expect(candidateForms([f, base], 2, null, acc({ [A]: 30 }))).toEqual([]);
    expect(() => selectForm([f], 2, null, acc({ [A]: 30 }))).toThrow();
  });

  it('실제 테이블: 같은 누적이라도 이전 진화체에 따라 갈 수 있는 곳이 좁아진다', () => {
    const a = acc({ [C]: 17, [D]: 17 }, { need: 34 });
    expect(selectForm(FORM_TABLE, 4, 't3:pair@lineage-c+lineage-e', a).id).toBe('t4:deep-pair@lineage-c+lineage-d');
    expect(selectForm(FORM_TABLE, 4, 't3:pair@lineage-a+lineage-b', a).id).toBe('t4:base'); // A+B형에서는 C+D 심화형으로 갈 수 없다
    expect(selectForm(FORM_TABLE, 4, 't3:base', a).id).toBe('t4:deep-pair@lineage-c+lineage-d'); // 기본형은 막다른 길이 아니다
    // 3단계 2조합은 어느 2단계 진화체에서든 갈 수 있다 (v1.1)
    expect(selectForm(FORM_TABLE, 3, 't2:dominant@lineage-a', acc({ [C]: 15, [D]: 15 }, { need: 30 })).id).toBe('t3:pair@lineage-c+lineage-d');
  });

  it('실제 테이블: 특수형이 조합형보다 우선하고, 심화 2조합이 일반 3조합보다 우선한다', () => {
    const prev3 = 't3:pair@lineage-a+lineage-b';
    // 3단계: 한 계통 80% = 편식형 (A+B 2조합도 성립하지만 편식형이 우선), 희귀 6회 = 희귀형이 편식형보다 우선
    expect(selectForm(FORM_TABLE, 3, 't2:dominant@lineage-a', acc({ [A]: 24, [B]: 6 })).label.kind).toBe('picky');
    expect(selectForm(FORM_TABLE, 3, 't2:dominant@lineage-a', acc({ [A]: 24, [B]: 6 }, { rare: 6 })).label.kind).toBe('rare');
    // 균형형(최다 ≤ 35%, 4계통 이상)이 2조합보다 우선
    expect(selectForm(FORM_TABLE, 3, 't2:base', acc({ [A]: 9, [B]: 9, [C]: 6, [D]: 6 })).label.kind).toBe('balanced');
    // 4단계: 상위 두 계통 합 ≥ 70% = 심화 (3조합도 성립), 그보다 낮으면 3조합
    expect(selectForm(FORM_TABLE, 4, prev3, acc({ [A]: 14, [B]: 13, [C]: 7 }, { need: 34 })).label.kind).toBe('deep-pair'); // 27/34 = 79%, 최다 41%
    expect(selectForm(FORM_TABLE, 4, prev3, acc({ [A]: 12, [B]: 11, [C]: 11 }, { need: 34 })).label.kind).toBe('triple'); // 34/… 최다 35.3% > 35%
    // 5단계 (v1.1): 3계통을 채우면 3조합, 두 계통에 몰리면 2조합 (3조합이 우선)
    const prev4 = 't4:triple@lineage-a+lineage-b+lineage-c';
    expect(selectForm(FORM_TABLE, 5, prev4, acc({ [A]: 15, [B]: 13, [C]: 10 }, { need: 38 })).id).toBe('t5:triple@lineage-a+lineage-b+lineage-c');
    expect(selectForm(FORM_TABLE, 5, prev4, acc({ [A]: 24, [B]: 14 }, { need: 38 })).id).toBe('t5:pair@lineage-a+lineage-b');
  });

  it('입력 누적이 같으면 결과도 같다 (순수 함수)', () => {
    const a = acc({ [A]: 9, [B]: 9, [C]: 12 });
    expect(selectForm(FORM_TABLE, 3, 't2:base', a)).toBe(selectForm(FORM_TABLE, 3, 't2:base', { ...a }));
  });
});

describe('진화체 데이터 생성기', () => {
  const countOf = (t: FormDef[], tier: number) => t.filter((f) => f.tier === tier && !f.fallback).length;

  it('5계통 기준 단계별 5 / 13 / 22 / 21종, 기본형은 단계마다 정확히 1개 (종 수에 세지 않는다)', () => {
    const t = generateFormTable(IDS);
    expect([2, 3, 4, 5].map((tier) => countOf(t, tier))).toEqual([5, 13, 22, 21]);
    for (const tier of [2, 3, 4, 5]) expect(t.filter((f) => f.tier === tier && f.fallback)).toHaveLength(1);
    expect(new Set(t.map((f) => f.id)).size).toBe(t.length);
    expect(validateFormTable(t, IDS)).toEqual([]);
    const kinds = (tier: number) => Object.fromEntries([...new Set(t.filter((f) => f.tier === tier).map((f) => f.label.kind))].map((k) => [k, t.filter((f) => f.tier === tier && f.label.kind === k).length]));
    expect(kinds(3)).toEqual({ pair: 10, balanced: 1, picky: 1, rare: 1, base: 1 });
    expect(kinds(4)).toEqual({ triple: 10, 'deep-pair': 10, balanced: 1, picky: 1, base: 1 });
    expect(kinds(5)).toEqual({ triple: 10, pair: 10, picky: 1, base: 1 });
  });

  it('커밋된 forms.json 도 같은 규모이고 검사를 통과한다 (손으로 고쳐도 구조는 지켜야 한다)', () => {
    expect([2, 3, 4, 5].map((tier) => countOf([...FORM_TABLE], tier))).toEqual([5, 13, 22, 21]);
    expect(validateFormTable(FORM_TABLE, LINEAGES.map((l) => l.id))).toEqual([]);
    for (const tier of [2, 3, 4, 5]) expect(tierFallback(tier).fallback).toBe(true);
    expect(formsOfTier(3).length).toBe(14);
  });

  it('경로(from) 자동 생성: 요구 계통을 이전 단계 진화체가 포함하면 연결, 특수형·기본형은 any', () => {
    const t = generateFormTable(IDS);
    const get = (id: string) => t.find((f) => f.id === id)!;
    expect(get('t2:dominant@lineage-a').from).toBe('any');
    expect(get('t3:pair@lineage-a+lineage-b').from).toBe('any'); // v1.1
    const ab = get('t4:deep-pair@lineage-a+lineage-b');
    expect(ab.from).toEqual(expect.arrayContaining(['t3:pair@lineage-a+lineage-b', 't3:pair@lineage-a+lineage-c', 't3:pair@lineage-b+lineage-e', 't3:base']));
    expect(ab.from).not.toContain('t3:pair@lineage-c+lineage-d');
    for (const id of ['t3:balanced', 't3:picky', 't3:rare', 't3:base', 't4:balanced', 't4:picky', 't4:base', 't5:base']) expect(get(id).from).toBe('any');
    const abc = get('t4:triple@lineage-a+lineage-b+lineage-c');
    expect(abc.from).toContain('t3:pair@lineage-a+lineage-b');
    expect(abc.from).toContain('t3:pair@lineage-b+lineage-c');
    expect(abc.from).toContain('t3:pair@lineage-a+lineage-d');
    expect(abc.from).not.toContain('t3:pair@lineage-d+lineage-e'); // 겹치는 계통이 없다
    expect(abc.from).toEqual(expect.arrayContaining(['t3:balanced', 't3:picky', 't3:rare', 't3:base']));
    // 연결은 항상 바로 이전 단계 진화체로만
    for (const f of t) if (f.from !== 'any') for (const p of f.from) expect(get(p).tier).toBe(f.tier - 1);
  });

  it('요구 계통의 성향을 섞은 패시브와 기본형은 낮은 효과', () => {
    const t = generateFormTable(IDS);
    const ab = t.find((f) => f.id === 't3:pair@lineage-a+lineage-b')!;
    expect(ab.effects.passive.attackPower).toBeGreaterThan(1); // A: 공격 위력
    expect(ab.effects.passive.damageTaken).toBeLessThan(1); // B: 받는 피해
    expect(t.find((f) => f.id === 't3:balanced')!.effects.passive).toEqual({});
    for (const tier of [2, 3, 4, 5]) {
      const base = t.find((f) => f.tier === tier && f.fallback)!;
      for (const f of t.filter((x) => x.tier === tier && !x.fallback)) {
        expect(f.effects.hpMultiplier).toBeGreaterThan(base.effects.hpMultiplier);
        expect(f.effects.attackMultiplier).toBeGreaterThan(base.effects.attackMultiplier);
      }
    }
  });

  it('우선순위: 같은 단계에서 겹칠 수 있는 종류끼리는 우선순위가 다르다 (좁은 진화체가 높다)', () => {
    const p = EV.template.priority;
    expect(p.rare).toBeGreaterThan(p.picky);
    expect(p.picky).toBeGreaterThan(p.balanced);
    expect(p.balanced).toBeGreaterThan(p.pair);
    expect(p['deep-pair']).toBeGreaterThan(p.triple);
    expect(p.triple).toBeGreaterThan(p.pair); // 5단계: 3조합 > 2조합
    expect(p.base).toBe(0);
  });

  it('이름은 자리 표시이고, 종족별 이름을 손으로 넣으면 그것이 우선한다 (종족 id 분기 없이 데이터로)', () => {
    expect(formName(FORM_TABLE.find((f) => f.id === 't2:dominant@lineage-a')!, 'hollow')).toBe('A우세형');
    expect(formName(FORM_TABLE.find((f) => f.id === 't3:pair@lineage-a+lineage-b')!, 'hollow')).toBe('A+B형');
    expect(formName(FORM_TABLE.find((f) => f.id === 't4:deep-pair@lineage-a+lineage-b')!, 'hollow')).toBe('A+B형(심화)');
    expect(formName(FORM_TABLE.find((f) => f.id === 't3:balanced')!, 'shinigami')).toBe('균형형');
    expect(formName(tierFallback(4), 'hollow')).toBe('기본형');
    const named: FormDef = { ...FORM_TABLE[0]!, name: { hollow: '이름가', shinigami: '이름나', '*': '공통' } };
    expect(formName(named, 'hollow')).toBe('이름가');
    expect(formName(named, 'shinigami')).toBe('이름나');
    expect(formName(named, 'third')).toBe('공통');
  });

  it('계통 수 3개·7개에서도 생성기와 선택기가 동작한다 (구조 검사 · 선택 · 도달 가능성)', () => {
    for (const n of [3, 7]) {
      const ids = Array.from({ length: n }, (_, i) => `x${i + 1}`);
      const t = generateForms(ids, EV.template as unknown as FormTemplate, () => undefined);
      expect(validateFormTable(t, ids)).toEqual([]);
      const pairs = (n * (n - 1)) / 2;
      const triples = (n * (n - 1) * (n - 2)) / 6;
      expect([2, 3, 4, 5].map((tier) => countOf(t, tier))).toEqual([n, pairs + 3, triples + pairs + 2, triples + pairs + 1]); // 5단계: 3조합 + 2조합 + 편식형(C.31)
      for (const tier of [2, 3, 4, 5]) expect(t.filter((f) => f.tier === tier && f.fallback)).toHaveLength(1);
      // 선택기: 상위 3계통 x1 > x2 > x3 인 분포가 성립한다
      const a: Accumulation = { need: 30, scores: Object.fromEntries(ids.map((id, i) => [id, i < 3 ? 12 - i * 3 : 0])), rare: 0, lastSeq: Object.fromEntries(ids.map((id) => [id, 1])) };
      expect(selectForm(t, 2, null, a).id).toBe('t2:dominant@x1');
      expect(selectForm(t, 3, 't2:base', a).id).toBe('t3:pair@x1+x2');
      // 도달 가능성 (n=3 은 전수 + 무작위, n=7 은 무작위 위주)
      const needs = EV.absorbsNeeded;
      const reports = analyzeTable(t, ids, needs, { ...CFG, randomSamples: n === 7 ? 60000 : 20000 });
      expect(reports.flatMap((r) => r.unreachable)).toEqual([]);
      expect(reports.flatMap((r) => r.ambiguousExamples)).toEqual([]);
    }
  }, 60000);
});

describe('도달 가능성 점검 (npm run balance 와 같은 점검)', () => {
  const reports = analyzeTable(FORM_TABLE, IDS, EV.absorbsNeeded, CFG);

  it('모든 진화체가 어떤 흡수 분포에서 선택될 수 있다 (도달 불가 0)', () => {
    expect(reports.map((r) => [r.tier, r.unreachable])).toEqual([[2, []], [3, []], [4, []], [5, []]]);
    expect(reports.map((r) => r.formCount)).toEqual([5, 13, 22, 21]);
    expect(reports.every((r) => r.samples > 10000)).toBe(true);
  }, 60000);

  it('단계마다 기본형이 정확히 1개이고, 같은 분포에서 선택이 모호한(우선순위·조건 수까지 같은) 경우가 없다', () => {
    expect(reports.map((r) => r.fallbackCount)).toEqual([1, 1, 1, 1]);
    expect(reports.map((r) => r.ambiguous)).toEqual([0, 0, 0, 0]);
  });

  it('무작위 분포에서 "후보 없음 → 기본형" 비율이 상한 이하', () => {
    for (const r of reports) expect(r.fallbackRateWithPath).toBeLessThanOrEqual(EV.analysis.maxFallbackRate);
    // v1.1: 1계통·2계통 몰림·3계통·균등 분포 각각도 경로 포함 20% 이하
    for (const r of reports) for (const v of Object.values(r.fallbackByProfile)) expect(v).toBeLessThanOrEqual(EV.analysis.maxFallbackRate);
    expect(reportProblems(reports, EV.analysis.maxFallbackRate)).toEqual([]);
  });

  it('3단계 2조합은 경로 제한이 없고(any), 4·5단계는 경로로 좁혀진다', () => {
    for (const f of FORM_TABLE.filter((x) => x.tier === 3)) expect(f.from).toBe('any');
    const t5 = FORM_TABLE.find((f) => f.id === 't5:pair@lineage-a+lineage-b')!;
    expect(t5.from).not.toBe('any');
    expect(t5.from).toContain('t4:triple@lineage-a+lineage-b+lineage-c');
  });

  it('점검 도구는 문제를 잡아낸다 (도달 불가·모호·기본형 없음)', () => {
    const broken = FORM_TABLE.map((f) => (f.id === 't3:balanced' ? { ...f, requires: [{ type: 'maxShareAtMost', max: 0.05 } as FormCondition] } : f));
    expect(analyzeTier(broken, 3, IDS, EV.absorbsNeeded[1]!, { ...CFG, randomSamples: 3000 }).unreachable).toContain('t3:balanced');
    const dup = FORM_TABLE.map((f) => (f.id === 't3:picky' ? { ...f, priority: 50, requires: [{ type: 'rareCount', ratio: 0.2 } as FormCondition] } : f));
    expect(analyzeTier(dup, 3, IDS, EV.absorbsNeeded[1]!, { ...CFG, randomSamples: 3000 }).ambiguous).toBeGreaterThan(0);
    expect(validateFormTable(FORM_TABLE.filter((f) => f.id !== 't4:base'), IDS)[0]).toContain('4단계 기본형이 0개');
    expect(validateFormTable([...FORM_TABLE, { ...tierFallback(3), id: 't3:base2' }], IDS).some((e) => e.includes('3단계 기본형이 2개'))).toBe(true);
  });
});
