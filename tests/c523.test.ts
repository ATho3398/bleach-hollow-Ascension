// C.523 진화체 모양 = 성장 곡선 × 전투 성향 (GDD 8-7 v6.171~v6.173, 사용자 2026-11-23) — 측정 틀(투자 4칸 × 콘텐츠 3) · 자동 분류 규칙(성향 6) · 12칸 점수표·넓이·바닥·천장 ·
// 목표 데이터 칸 검사 · 목표 비교 가드 · C.520 가드 넘김 · 개발용 내부 표기(화면 코드가 읽지 않음)
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { BALANCE } from '../src/config/balance';
import { FORM_TABLE } from '../src/data/evolution';
import { balanceProfileOf, PROFILE_CURVES, PROFILE_LEANS, validateBalanceProfiles, type BalanceProfileFile } from '../src/data/evolution/balanceProfiles';
import raw from '../src/data/evolution/balanceProfiles.json';
import { createCombat, playCombatHuman } from '../src/engine/combat';
import { evCaps } from '../src/engine/evolution';
import { enemyAtDifficulty } from '../src/engine/difficulty';
import { ENEMIES } from '../src/data/enemies';
import { EVO_BAL_STANDARD_INVEST, evoBalParams, evoBalTargets, evoBodyParams, judgeEvoBal, type EvoBalBody } from '../scripts/lib/evoUniqueBalance';
import {
  classifyAll, classifyProfile, scoreTable, evoProfileInvest, evoProfileTargets, evProfileAllocation, judgeProfileGoal, leanScores, measureEvoProfile, profileDistribution, profileValue, tierMedians, typeGap,
  type InvestId, type ProfileInput, type ProfileTarget,
} from '../scripts/lib/evoProfile';

const EP = BALANCE.provisional.evoProfile;

describe('측정 대상 = 4단계 진화체 × 종족 전부 (고유 능력 없는 몸 포함)', () => {
  const ts = evoProfileTargets();
  const t4 = FORM_TABLE.filter((f) => f.tier === 4 && !f.retired);
  it('27종 × 2종족 = 54칸, 고유 능력 35칸 = C.520 측정 대상과 같은 칸', () => {
    expect(ts).toHaveLength(t4.length * 2);
    expect(ts.filter((t) => t.hasAbility).map((t) => `${t.formId}/${t.factionId}`).sort()).toEqual(evoBalTargets().map((t) => `${t.formId}/${t.factionId}`).sort());
    expect(ts.filter((t) => t.hasAbility)).toHaveLength(35);
  });
  // C.524: 1차 배정(마스터AS 11-23, docs/drafts/evo-assign-1123.md 1장) — 옛 기대 '전부 null'
  it('목표 모양 = 고유 능력 있는 35칸 + 강제 3칸(곡선 null — 카사도르 강적 · 칼마·정심 잡몹), 능력 없는 그 밖 몸은 null', () => {
    const goals = ts.filter((t) => t.goal !== null);
    expect(goals).toHaveLength(38);
    expect(goals.filter((t) => t.hasAbility)).toHaveLength(35);
    expect(ts.filter((t) => t.hasAbility).every((t) => t.goal?.curve)).toBe(true);
    const forced = goals.filter((t) => !t.hasAbility).map((t) => `${t.formId}/${t.factionId}=${t.goal!.lean}`).sort();
    expect(forced).toEqual(['h4:hunter/hollow=elite', 'h4:stable/hollow=mob', 'h4:stable/shinigami=mob']);
    const cnt = (f: (t: (typeof goals)[number]) => unknown) => goals.reduce<Record<string, number>>((a, t) => { const k = String(f(t)); a[k] = (a[k] ?? 0) + 1; return a; }, {});
    // C.524 조정 중 v6.176(배정 기준 = 능력 설계)으로 바꾼 9칸: 라나 동반→특성 · 게파르도·천일야장도 동반→평탄 · 비전 노력·선공→평탄 · 추성 노력→평탄(강적 강제 그대로) · 나다 특성·잡몹→평탄·해방 · 토르멘타·봉수대 강적·노도 한방 → 성향 없음
    // C.525 (GDD v6.178 '시간 제한 능력 = 노력 곡선'): 시간 제한 능력 15칸(timed)을 노력 곡선으로 — 라나·소로(그대로)·노도(그대로)·에스카라바호·에스칼레라·브라사·토르투가·게파르도·토르멘타·비보라·무랄라·나다 / 비전·석양홍·공화. 성향은 그대로
    expect(cnt((t) => t.goal!.curve)).toEqual({ effort: 18, block: 5, joint: 3, flat: 7, trait: 2, null: 3 });
    expect(goals.filter((t) => t.goal!.timed !== undefined)).toHaveLength(15);
    expect(cnt((t) => t.goal!.lean)).toEqual({ null: 19, burst: 3, elite: 3, mob: 3, opener: 2, survive: 4, release: 4 });
  });
});

describe('투자 4칸', () => {
  const t = evoProfileTargets().find((x) => x.formId === 't4:fire:physical' && x.factionId === 'shinigami')!;
  // C.525 (마스터AS 결정): 무투자·노력치만 칸에도 그 진화체 속성 공격 블록 1개(강화 0) — 옛 기대 = 특성 0개(블록으로 켜지는 능력이 안 켜져 소로 노력 곡선이 안 나옴)
  it('무투자 = 노력치 없음·그 속성 공격 블록 1개(강화 0) / 노력치만 / 블록만 = 특성 2개 + 강화 표준 / 둘 다', () => {
    expect(EP.invest.baseSkills).toBe(1);
    expect(evoProfileInvest(t, 'none')).toEqual({ skills: 1, enhance: 0, ev: null });
    expect(evoProfileInvest(t, 'ev')).toEqual({ skills: 1, enhance: 0, ev: evProfileAllocation(t) });
    expect(evoProfileInvest(t, 'blk')).toEqual({ skills: 2, enhance: EP.invest.enhance, ev: null });
    expect(evoProfileInvest(t, 'both')).toEqual({ skills: 2, enhance: EP.invest.enhance, ev: evProfileAllocation(t) });
  });
  it('노력치 = 그 단계 상한 합계 안, 능력치 하나 상한 안, 타입별 주 능력치(물리 = 공격·공속)', () => {
    for (const cat of ['physical', 'special', 'mixed']) {
      const a = evProfileAllocation({ tier: 4, category: cat });
      const cap = evCaps(3);
      expect(Object.values(a).reduce((x, y) => x + y, 0)).toBeLessThanOrEqual(cap.total);
      for (const v of Object.values(a)) expect(v).toBeLessThanOrEqual(cap.perStat);
    }
    const p = evProfileAllocation({ tier: 4, category: 'physical' });
    expect(p.atk).toBeGreaterThan(p.hp!);
    expect(p.int ?? 0).toBe(0);
  });
  it('전투 재료: 노력치는 능력치에, 블록만은 특성 블록·강화가 실리고, C.520 기준 몸(evoBalParams)은 그대로', () => {
    const none = evoBodyParams(t, true, false, 4, evoProfileInvest(t, 'none'));
    const ev = evoBodyParams(t, true, false, 4, evoProfileInvest(t, 'ev'));
    const blk = evoBodyParams(t, true, false, 4, evoProfileInvest(t, 'blk'));
    expect(ev.playerStats!.atk).toBeGreaterThan(none.playerStats!.atk);
    expect(blk.playerStats).toEqual(none.playerStats);
    expect(JSON.stringify(blk)).not.toEqual(JSON.stringify(none));
    expect(evoBalParams(t, true, true)).toEqual(evoBodyParams(t, true, true, 4, EVO_BAL_STANDARD_INVEST));
  });
});

describe('사람형 봇 관찰자 onStep (측정 전용, 전투 결과 그대로)', () => {
  it('틱마다 한 번 · 없을 때와 같은 결과', () => {
    const t = evoProfileTargets().find((x) => x.formId === 't4:water:special' && x.factionId === 'hollow')!;
    const params = evoBodyParams(t, true, false, 4, evoProfileInvest(t, 'both'));
    const base = ENEMIES.find((e) => e.class === 'elite' && !e.testOnly)!;
    const mk = () => createCombat(424242, { enemy: enemyAtDifficulty(base, 4), params: { ...params } });
    let n = 0;
    const a = playCombatHuman(mk(), { onStep: () => { n++; } });
    const b = playCombatHuman(mk());
    expect(n).toBe(a.tick);
    expect([a.status, a.tick, a.enemy.hp, a.player.hp]).toEqual([b.status, b.tick, b.enemy.hp, b.player.hp]);
  });
});

describe('한 몸 측정 (판 수 줄임)', () => {
  it('투자 4칸 × 일반/강적/보스 칸과 성향 지표가 채워진다', () => {
    const t = evoProfileTargets().find((x) => x.formId === 't4:fire:special' && x.factionId === 'shinigami')!;
    const r = measureEvoProfile(t, { n: 1, e: 1, b: 0 });
    const kinds = ENEMIES.filter((e) => !e.testOnly && e.class === 'elite').length;
    for (const i of ['none', 'ev', 'blk', 'both'] as const) {
      expect(r.cells[i].e.games).toBe(kinds * 2); // 해방 전/해방 몸 2
      expect(r.cells[i].b.games).toBe(0);
    }
    expect(r.cells.both.e.win).toBeGreaterThanOrEqual(r.cells.none.e.win);
    expect(r.timeline.front).toBeGreaterThan(0);
    expect(r.lib.in).not.toBeNull();
  });
});

// ── 분류 규칙 (합성 입력) ──
type Vals = Record<InvestId, number>;
const tgt = (id: string): ProfileTarget => ({ formId: id, factionId: 'hollow', tier: 4, category: 'special', element: 'fire', usesPet: false, exempt: null, hasAbility: true, goal: null });
/** 칸 값 v = 승률 1 ÷ 초 → 초 = 1/v (세 콘텐츠 같은 값, contentMul 로 콘텐츠별 배율) */
function mk(id: string, v: Vals, o: Partial<{ content: [number, number, number]; win: number; cv: number; late: number; lib: number | null }> = {}): ProfileInput {
  const [cn, ce, cb] = o.content ?? [1, 1, 1];
  const w = o.win ?? 1;
  const cell = (x: number, k: number, win = 1) => ({ win, secs: win / (x * k), games: 10 });
  const cells = {} as ProfileInput['cells'];
  for (const i of ['none', 'ev', 'blk', 'both'] as const) cells[i] = { n: cell(v[i], cn), e: cell(v[i], ce, w), b: cell(v[i], cb, w) };
  return { target: tgt(id), cells, spread: { cv: o.cv ?? 0.3, p10: 0.6 }, timeline: { front: 10, back: 10 * (o.late ?? 2) }, lib: { in: o.lib === null ? null : 10 * (o.lib ?? 1), out: 10 } };
}
const BASE: Vals = { none: 1, ev: 1.5, blk: 1.5, both: 2.2 };
const baseline = (): ProfileInput[] => ['a', 'b', 'c', 'd', 'e'].map((id) => mk(id, BASE, { win: 0.8 }));
const classify = (x: ProfileInput) => classifyProfile(x, tierMedians([...baseline(), x]));

describe('곡선 자동 추정 = 방향이 가장 가까운 원형', () => {
  it('곡선 5종: 평탄 · 노력 · 블록 · 동반 · 특성', () => {
    expect(PROFILE_CURVES.map((c) => c.id)).toEqual(['flat', 'effort', 'block', 'joint', 'trait']);
    expect(classify(mk('x', { none: 1.3, ev: 1.6, blk: 1.6, both: 1.9 }, { win: 0.8 })).curve.id).toBe('flat');
    expect(classify(mk('x', { none: 0.8, ev: 1.6, blk: 1.2, both: 2.4 }, { win: 0.8 })).curve.id).toBe('effort');
    expect(classify(mk('x', { none: 0.8, ev: 1.2, blk: 1.6, both: 2.4 }, { win: 0.8 })).curve.id).toBe('block');
    expect(classify(mk('x', { none: 0.8, ev: 1.2, blk: 1.2, both: 3.0 }, { win: 0.8 })).curve.id).toBe('joint');
    expect(classify(mk('x', { none: 0.8, ev: 1.2, blk: 1.2, both: 1.76 }, { win: 0.8 })).curve.id).toBe('trait');
  });
  it('확신도: 원형과 같은 방향이고 중앙에서 멀면 높음, 중앙값 몸은 낮음', () => {
    expect(classify(mk('x', { none: 0.8, ev: 1.2, blk: 1.2, both: 3.0 }, { win: 0.8 })).curve.conf).toBe('높음');
    expect(classify(mk('x', BASE, { win: 0.8 })).curve.conf).toBe('낮음');
  });
});

describe('성향 자동 추정 = 점수(특징 ÷ 문턱) 가장 큰 것, 1 미만이면 없음', () => {
  const lean = (o: Parameters<typeof mk>[2], v: Vals = BASE) => classify(mk('x', v, { win: 0.8, ...o })).lean.id;
  it('성향 6종 (GDD v6.173 — 지구전·체인 뺌)', () => {
    expect(PROFILE_LEANS.map((l) => l.id)).toEqual(['burst', 'elite', 'mob', 'opener', 'survive', 'release']);
  });
  it('강적 · 잡몹 · 선공 · 해방 · 한방 · 생존 · 없음 (뒤가 센 몸은 성향 없음 — 지구전 판정 없음)', () => {
    expect(lean({ content: [0.8, 1.2, 1.2] })).toBe('elite');
    expect(lean({ content: [1.2, 1, 0.8] })).toBe('mob');
    expect(lean({ late: 3 })).toBeNull();
    expect(lean({ late: 1.3 })).toBe('opener');
    expect(lean({ lib: 1.5 })).toBe('release');
    expect(lean({ cv: 0.5 })).toBe('burst');
    // 생존: 강적·보스 거의 안 짐(승률 1) + 처치는 느림(초 ×1.25 → 칸 값 같음)
    expect(lean({ win: 1 }, { none: 0.8, ev: 1.2, blk: 1.2, both: 1.76 })).toBe('survive');
    expect(lean({})).toBeNull();
  });
  it('한방은 강적 승률이 중앙값보다 높으면 반으로 · 해방 없는 몸은 해방 0', () => {
    const m = tierMedians(baseline());
    expect(leanScores(mk('x', BASE, { win: 0.9, cv: 0.5 }), m).burst).toBeCloseTo(leanScores(mk('x', BASE, { win: 0.8, cv: 0.5 }), m).burst! / 2, 6);
    expect(leanScores(mk('x', BASE, { win: 0.8, lib: null }), m).release).toBe(0);
  });
});

describe('넓이 = 12칸 점수표 × 칸 무게 (투자 4 × 콘텐츠 3 가중 합)', () => {
  it('가중치 합 1 → 중앙값 몸 = 1, 모든 칸 ×1.3 = 1.3', () => {
    const W = EP.value;
    expect(Object.values(W.invest).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
    expect(Object.values(W.content).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
    const m = tierMedians(baseline());
    expect(profileValue(mk('x', BASE), m)).toBeCloseTo(1, 6);
    const big: Vals = { none: 1.3, ev: 1.95, blk: 1.95, both: 2.86 };
    expect(profileValue(mk('x', big), m)).toBeCloseTo(1.3, 6);
  });
  it('분포 = 곡선별·성향별 몇 칸 + 총량 평균, 모양은 단계·타입별 중앙값 · 총량은 단계 중앙값', () => {
    const phys = { ...mk('p', { none: 0.5, ev: 0.75, blk: 0.75, both: 1.1 }), target: { ...tgt('p'), category: 'physical' } };
    const all = [...baseline(), phys];
    const c = classifyAll(all);
    expect([...c.shapeMedians.keys()].sort()).toEqual(['4/physical', '4/special']);
    const v = c.verdicts.find((x) => x.key === 'p/hollow')!;
    expect(Math.abs(v.feat.lo)).toBeLessThan(1e-9); // 같은 타입 안에선 혼자라 중앙
    expect(v.valueDev).toBeCloseTo(0, 6); // C.524: 넓이도 같은 단계·같은 타입 중앙값 대비(혼자라 0) — 옛 기대 단계 전체 대비 −50%
    expect(typeGap(c).find((g) => g.category === 'physical')!.value).toBeCloseTo(0.5, 6); // 타입 차는 따로(단계 중앙값 대비 절반)
    const d = profileDistribution(c.verdicts);
    expect(d.curves.reduce((a, x) => a + x.n, 0)).toBe(all.length);
    expect(d.leans.reduce((a, x) => a + x.n, 0)).toBe(all.length);
  });
});

describe('목표 비교 가드 (balanceProfile 이 있는 몸만)', () => {
  const flat = classify(mk('x', { none: 1.3, ev: 1.6, blk: 1.6, both: 1.9 }, { win: 0.8 }));
  it('목표 곡선 조건을 맞추면 통과, 다른 곡선 목표면 실패 한 줄', () => {
    expect(judgeProfileGoal({ curve: 'flat', lean: null }, flat)).toEqual([]);
    expect(judgeProfileGoal({ curve: 'effort', lean: null }, flat).join()).toMatch(/노력 곡선 조건/);
    expect(judgeProfileGoal({ curve: 'block', lean: null }, flat).join()).toMatch(/블록 곡선 조건/);
    expect(judgeProfileGoal({ curve: 'joint', lean: null }, flat).join()).toMatch(/동반 곡선 조건/);
    expect(judgeProfileGoal({ curve: 'trait', lean: null }, flat).join()).toMatch(/특성 곡선 조건/);
  });
  it('목표 성향 점수 < 1 이면 실패 · 넓이 ±10% 밖이면 실패(특성 곡선은 −20%까지)', () => {
    expect(judgeProfileGoal({ curve: 'flat', lean: 'elite' }, flat).join()).toMatch(/성향 점수/);
    const strong = classify(mk('x', { none: 2, ev: 2.46, blk: 2.46, both: 2.9 }, { win: 0.8 }));
    expect(strong.curve.id).toBe('flat');
    expect(judgeProfileGoal({ curve: 'flat', lean: null }, strong).join()).toMatch(/넓이/);
    const weak = classify(mk('x', { none: 0.85, ev: 1.275, blk: 1.275, both: 1.87 }, { win: 0.8 }));
    expect(weak.valueDev).toBeCloseTo(-0.15, 6);
    expect(judgeProfileGoal({ curve: 'trait', lean: null }, weak)).toEqual([]);
    expect(judgeProfileGoal({ curve: null, lean: null }, weak).join()).toMatch(/넓이/);
    const weaker = classify(mk('x', { none: 0.7, ev: 1.05, blk: 1.05, both: 1.54 }, { win: 0.8 }));
    expect(judgeProfileGoal({ curve: 'trait', lean: null }, weaker).join()).toMatch(/넓이/);
  });
  it('곡선 null = 성향만 정한 몸(강제 배정 등): 곡선 조건 없이 성향·넓이·바닥·천장', () => {
    const elite = classify(mk('x', BASE, { win: 0.8, content: [0.85, 1.15, 1.1] }));
    expect(elite.lean.id).toBe('elite');
    expect(judgeProfileGoal({ curve: null, lean: 'elite' }, elite)).toEqual([]);
    expect(judgeProfileGoal({ curve: null, lean: 'mob' }, elite).join()).toMatch(/성향 점수/);
  });
  it('바닥: 칸 승률이 콘텐츠별 최저선 아래면 미달 칸 · 가드 실패', () => {
    const low = classify(mk('x', BASE, { win: 0.2 }));
    expect(low.floor).toHaveLength(8); // 강적·보스 × 투자 4
    expect(low.floor[0]).toMatch(/무투자 강적 20%/);
    expect(judgeProfileGoal({ curve: null, lean: null }, low).join()).toMatch(/바닥/);
    expect(classify(mk('x', BASE, { win: 0.8 })).floor).toEqual([]);
  });
  it('천장: 같은 단계에서 12칸 전부 1등이면 실패', () => {
    const c = classifyAll([...baseline(), mk('top', { none: 1.3, ev: 1.95, blk: 1.95, both: 2.86 }, { win: 0.8 })]);
    const top = c.verdicts.find((v) => v.key === 'top/hollow')!;
    expect(top.topCells).toBe(12);
    expect(judgeProfileGoal({ curve: null, lean: null }, top).join()).toMatch(/천장: 12칸/);
    expect(c.verdicts.find((v) => v.key === 'a/hollow')!.topCells).toBe(0);
  });
  it('12칸 점수표 = 칸 값 ÷ 같은 단계 칸별 중앙값 × 100', () => {
    const m = tierMedians(baseline());
    const sc = scoreTable(mk('x', { none: 1.1, ev: 1.5, blk: 1.2, both: 2.2 }, { content: [1, 1, 0.5] }), m);
    expect(sc.none.n).toBeCloseTo(110, 6);
    expect(sc.blk.e).toBeCloseTo(80, 6);
    expect(sc.both.b).toBeCloseTo(50, 6);
  });
  it('기준 수치는 balance provisional.evoProfile', () => {
    expect(EP.guard).toEqual({ flat: { loMin: 0.05, bothGainMax: 0 }, effort: { evMin: 0.15, overBlk: 0, timedHiMin: 0.1 }, block: { blkMin: 0.15, overEv: 0 }, joint: { synMin: 0.1, bothGainMin: 0.1 }, trait: { loMax: -0.05, hiMax: -0.05 } });
    expect(EP.value.band).toBe(0.1);
    expect(EP.value.traitLow).toBe(-0.2);
    expect(EP.floor).toEqual({ n: 0.9, e: 0.5, b: 0.25 });
    expect(EP.ceiling.maxTopCells).toBe(11);
  });
});

describe('목표 데이터 칸 (balanceProfiles.json, 종족 분기 없음)', () => {
  const D = raw as unknown as BalanceProfileFile;
  const clone = (): BalanceProfileFile => JSON.parse(JSON.stringify(D)) as BalanceProfileFile;
  it('지금 데이터는 검사 통과, 4단계 진화체마다 종족 칸 · 1차 배정 38칸 (C.524 — 옛 기대 전부 null)', () => {
    expect(validateBalanceProfiles()).toEqual([]);
    let n = 0;
    for (const f of FORM_TABLE.filter((x) => x.tier === 4 && !x.retired)) for (const fid of ['hollow', 'shinigami']) if (balanceProfileOf(f.id, fid) !== null) n++;
    expect(n).toBe(38);
    expect(balanceProfileOf('t4:fire:physical', 'hollow')).toEqual({ curve: 'effort', lean: null, timed: '여우불 2.5초 안 5개', investFocus: 'aspd' }); // C.528: 요구 스탯 공속(investFocus) · 소로 = 대표 노력 곡선(사용자 예) · C.525 시간 제한 능력 표시(timed)
  });
  it('값이 있으면 곡선·성향 id 검사', () => {
    const ok = clone();
    ok.forms['t4:fire:special']!.hollow = { curve: 'joint', lean: 'release' };
    expect(validateBalanceProfiles(ok)).toEqual([]);
    expect(balanceProfileOf('t4:fire:special', 'hollow', ok)).toEqual({ curve: 'joint', lean: 'release' });
    const bad = clone();
    bad.forms['t4:fire:special']!.hollow = { curve: 'wavy', lean: 'nap' };
    expect(validateBalanceProfiles(bad).join()).toMatch(/모르는 곡선 wavy.*모르는 성향 nap/);
    const leanOnly = clone();
    leanOnly.forms['h4:hunter']!.hollow = { curve: null, lean: 'elite' };
    expect(validateBalanceProfiles(leanOnly)).toEqual([]);
    const empty = clone();
    empty.forms['h4:hunter']!.hollow = { curve: null, lean: null };
    expect(validateBalanceProfiles(empty).join()).toMatch(/둘 다 null/);
    const noLean = clone();
    noLean.forms['t4:fire:special']!.hollow = { curve: 'flat' } as never;
    expect(validateBalanceProfiles(noLean).join()).toMatch(/모르는 성향 undefined/);
  });
  it('4단계 진화체 칸 빠짐 · 없는 진화체 · 종족 칸 빠짐 · 모르는 종족', () => {
    const d = clone();
    delete d.forms['h4:void'];
    d.forms['t3:fire'] = { hollow: null, shinigami: null };
    delete d.forms['t4:fire:mixed']!.shinigami;
    d.forms['t4:water:mixed']!.quincy = null;
    const e = validateBalanceProfiles(d).join('\n');
    expect(e).toMatch(/h4:void: balanceProfiles.json 에 칸이 없다/);
    expect(e).toMatch(/t3:fire: 4단계 진화체가 아니다/);
    expect(e).toMatch(/t4:fire:mixed: 종족 shinigami 칸이 없다/);
    expect(e).toMatch(/모르는 종족 quincy/);
    // 3번째 종족은 종족 목록만 넓히면 같은 검사
    expect(validateBalanceProfiles(d, ['hollow', 'shinigami', 'quincy']).join('\n')).not.toMatch(/모르는 종족 quincy/);
  });
  it('곡선·성향 목록 = balance 원형·문턱·가드 키', () => {
    expect(Object.keys(EP.curve.prototypes).sort()).toEqual(PROFILE_CURVES.map((c) => c.id).sort());
    expect(Object.keys(EP.guard).sort()).toEqual(PROFILE_CURVES.map((c) => c.id).sort());
    expect(Object.keys(EP.lean.thresholds).sort()).toEqual(PROFILE_LEANS.map((c) => c.id).sort());
  });
});

describe('C.520 중앙값 가드는 목표가 비어 있는 몸에만', () => {
  const side = (win: number, secs: number) => ({ win, secs, taken: 0.3, games: 10 });
  const body = (eWin: number, eSecs: number): EvoBalBody => ({ n: side(1, 10), e: side(eWin, eSecs), b: side(0.5, 40) });
  const t = (formId: string) => ({ formId, factionId: 'hollow', tier: 4, category: 'mixed', element: 'fire', usesPet: false, exempt: null });
  const row = (formId: string, contrib: number) => ({ target: t(formId), on: body(0.9, 20 * (1 - contrib)), off: body(0.9, 20) });
  const rows = [row('a', 0.02), row('b', 0.03), row('c', 0.04), row('x', 0.5)];
  it('목표가 없으면 그대로 실패 · 목표가 있으면 넘김(profiled)', () => {
    expect(judgeEvoBal(rows)[0]!.failures.join()).toMatch(/x\/hollow/);
    const v = judgeEvoBal(rows, undefined, undefined, (tt) => tt.formId === 'x')[0]!;
    expect(v.failures).toEqual([]);
    expect(v.profiled).toEqual(['x/hollow']);
    expect(v.medContrib).toBeCloseTo(0.035, 6); // 중앙값 계산에는 넣는다
  });
});

describe("balance.ts 'evoProfile' 구간", () => {
  const src = readFileSync('scripts/balance.ts', 'utf8');
  it('SECTIONS 에 있고, --check 에선 목표가 있는 단계만 재며 실패는 failures 로', () => {
    expect(src).toMatch(/\{ name: 'evoProfile', seconds: \d+ \}/); // C.524: 목표가 생겨 --check 도 54칸을 잰다
    expect(src).toContain("if (want('evoProfile'))");
    expect(src).toContain('const targets = check ? all.filter((t) => goalTiers.has(t.tier)) : all;');
    expect(src).toMatch(/for \(const f of judgeProfileGoal\(r\.target\.goal, .+\)\) \{/);
    expect(src).toContain('else failures.push(f);'); // 목표 미달·측정 제외·능력 없는 몸(profileGoalHeld)만 경고
    expect(src).toContain('--profile-md=');
  });
});

describe('곡선·성향 = 개발용 내부 표기 (사용자 2026-11-23 "참고로 이건 우리만 알고있는거지, 유저가 보는건 아니다??")', () => {
  const files: string[] = [];
  const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(ts|json|css|html)$/.test(f)) files.push(p); } };
  walk('src');
  // 자기 파일 + 밸런스 수치(src/config/balance.ts — 측정 기준 주석·키만, 화면에 안 나감)만 예외
  const own = (p: string) => { const q = p.replace(/\\/g, '/'); return q.startsWith('src/data/evolution/balanceProfiles.') || q === 'src/config/balance.ts'; };
  it('src 의 다른 파일(화면·엔진·데이터)은 balanceProfiles 를 읽지 않는다', () => {
    const hits = files.filter((p) => !own(p) && /balanceProfiles/.test(readFileSync(p, 'utf8')));
    expect(hits).toEqual([]);
  });
  it('곡선·성향 이름이 src 의 다른 파일(화면 문구)에 없다', () => {
    const names = [...PROFILE_CURVES, ...PROFILE_LEANS].map((x) => x.name);
    const hits = files.filter((p) => !own(p)).flatMap((p) => { const t = readFileSync(p, 'utf8'); return names.filter((n) => t.includes(n)).map((n) => `${p}: ${n}`); });
    expect(hits).toEqual([]);
  });
});
