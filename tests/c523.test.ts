// C.523 진화체 모양 = 성장 곡선 × 전투 성향 (GDD 8-7 v6.171, 사용자 2026-11-23) — 측정 틀(투자 4칸 × 콘텐츠 3) · 자동 분류 규칙 · 목표 데이터 칸 검사 · 목표 비교 가드 · C.520 가드 넘김
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
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
  classifyAll, classifyProfile, evoProfileInvest, evoProfileTargets, evProfileAllocation, judgeProfileGoal, leanScores, measureEvoProfile, profileDistribution, profileValue, tierMedians,
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
  it('목표 모양은 지금 전부 비어 있다(null) — 배정은 기획A·사용자', () => {
    expect(ts.every((t) => t.goal === null)).toBe(true);
  });
});

describe('투자 4칸', () => {
  const t = evoProfileTargets().find((x) => x.formId === 't4:fire:physical' && x.factionId === 'shinigami')!;
  it('무투자 = 특성·강화·노력치 없음 / 노력치만 / 블록만 = 특성 2개 + 강화 표준 / 둘 다', () => {
    expect(evoProfileInvest(t, 'none')).toEqual({ skills: false, enhance: 0, ev: null });
    expect(evoProfileInvest(t, 'ev')).toEqual({ skills: false, enhance: 0, ev: evProfileAllocation(t) });
    expect(evoProfileInvest(t, 'blk')).toEqual({ skills: true, enhance: EP.invest.enhance, ev: null });
    expect(evoProfileInvest(t, 'both')).toEqual({ skills: true, enhance: EP.invest.enhance, ev: evProfileAllocation(t) });
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
    expect(r.chain3).toBeGreaterThanOrEqual(0);
    expect(r.chain3).toBeLessThanOrEqual(1);
    expect(r.timeline.front).toBeGreaterThan(0);
    expect(r.lib.in).not.toBeNull();
  });
});

// ── 분류 규칙 (합성 입력) ──
type Vals = Record<InvestId, number>;
const tgt = (id: string): ProfileTarget => ({ formId: id, factionId: 'hollow', tier: 4, category: 'special', element: 'fire', usesPet: false, exempt: null, hasAbility: true, goal: null });
/** 칸 값 v = 승률 1 ÷ 초 → 초 = 1/v (세 콘텐츠 같은 값, contentMul 로 콘텐츠별 배율) */
function mk(id: string, v: Vals, o: Partial<{ content: [number, number, number]; win: number; cv: number; late: number; lib: number | null; chain3: number }> = {}): ProfileInput {
  const [cn, ce, cb] = o.content ?? [1, 1, 1];
  const w = o.win ?? 1;
  const cell = (x: number, k: number, win = 1) => ({ win, secs: win / (x * k), games: 10 });
  const cells = {} as ProfileInput['cells'];
  for (const i of ['none', 'ev', 'blk', 'both'] as const) cells[i] = { n: cell(v[i], cn), e: cell(v[i], ce, w), b: cell(v[i], cb, w) };
  return { target: tgt(id), cells, spread: { cv: o.cv ?? 0.3, p10: 0.6 }, timeline: { front: 10, back: 10 * (o.late ?? 2) }, lib: { in: o.lib === null ? null : 10 * (o.lib ?? 1), out: 10 }, chain3: o.chain3 ?? 0.2 };
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
  it('성향 8종', () => {
    expect(PROFILE_LEANS.map((l) => l.id)).toEqual(['burst', 'elite', 'mob', 'long', 'opener', 'survive', 'release', 'chain']);
  });
  it('강적 · 잡몹 · 지구전 · 선공 · 해방 · 체인 · 한방 · 생존 · 없음', () => {
    expect(lean({ content: [0.8, 1.2, 1.2] })).toBe('elite');
    expect(lean({ content: [1.2, 1, 0.8] })).toBe('mob');
    expect(lean({ late: 3 })).toBe('long');
    expect(lean({ late: 1.3 })).toBe('opener');
    expect(lean({ lib: 1.5 })).toBe('release');
    expect(lean({ chain3: 0.5 })).toBe('chain');
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

describe('가치 총량 (투자 4 × 콘텐츠 3 가중 합)', () => {
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
    expect(v.valueDev).toBeCloseTo(-0.5, 6); // 단계 전체 중앙값 대비 절반
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
  it('목표 성향 점수 < 1 이면 실패 · 가치 총량 ±band 밖이면 실패(특성 곡선은 총량 검사 밖)', () => {
    expect(judgeProfileGoal({ curve: 'flat', lean: 'chain' }, flat).join()).toMatch(/성향 점수/);
    const strong = classify(mk('x', { none: 2, ev: 2.46, blk: 2.46, both: 2.9 }, { win: 0.8 }));
    expect(strong.curve.id).toBe('flat');
    expect(judgeProfileGoal({ curve: 'flat', lean: null }, strong).join()).toMatch(/가치 총량/);
    const weak = classify(mk('x', { none: 0.5, ev: 0.75, blk: 0.75, both: 1.1 }, { win: 0.8 }));
    expect(judgeProfileGoal({ curve: 'trait', lean: null }, weak)).toEqual([]);
  });
  it('기준 수치는 balance provisional.evoProfile', () => {
    expect(EP.guard).toEqual({ flat: { loMin: 0.05, bothGainMax: 0 }, effort: { evMin: 0.15, overBlk: 0 }, block: { blkMin: 0.15, overEv: 0 }, joint: { synMin: 0.1, bothGainMin: 0.1 }, trait: { loMax: -0.05, hiMax: -0.05 } });
    expect(EP.value.band).toBe(0.15);
  });
});

describe('목표 데이터 칸 (balanceProfiles.json, 종족 분기 없음)', () => {
  const D = raw as unknown as BalanceProfileFile;
  const clone = (): BalanceProfileFile => JSON.parse(JSON.stringify(D)) as BalanceProfileFile;
  it('지금 데이터는 검사 통과, 4단계 진화체마다 종족 칸 · 전부 null', () => {
    expect(validateBalanceProfiles()).toEqual([]);
    for (const f of FORM_TABLE.filter((x) => x.tier === 4 && !x.retired)) for (const fid of ['hollow', 'shinigami']) expect(balanceProfileOf(f.id, fid)).toBeNull();
  });
  it('값이 있으면 곡선·성향 id 검사', () => {
    const ok = clone();
    ok.forms['t4:fire:special']!.hollow = { curve: 'joint', lean: 'long' };
    expect(validateBalanceProfiles(ok)).toEqual([]);
    expect(balanceProfileOf('t4:fire:special', 'hollow', ok)).toEqual({ curve: 'joint', lean: 'long' });
    const bad = clone();
    bad.forms['t4:fire:special']!.hollow = { curve: 'wavy', lean: 'nap' };
    expect(validateBalanceProfiles(bad).join()).toMatch(/모르는 곡선 wavy.*모르는 성향 nap/);
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
    expect(src).toMatch(/\{ name: 'evoProfile', seconds: check \? 1 : \d+ \}/);
    expect(src).toContain("if (want('evoProfile'))");
    expect(src).toContain('const targets = check ? all.filter((t) => goalTiers.has(t.tier)) : all;');
    expect(src).toMatch(/for \(const f of judgeProfileGoal\(r\.target\.goal, .+\)\) failures\.push\(f\);/);
    expect(src).toContain('--profile-md=');
  });
});
