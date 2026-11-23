// C.520 진화체 고유 능력 밸런스 (사용자 2026-11-23 "진화체는 지금 구현한 애들 밸런스 맞춰놓고, 다음 짤 애들은 이 밸런스에 맞춰서 진행하자", 마스터AR provisional 기준)
// 측정 도구(scripts/lib/evoUniqueBalance.ts) · 판정(중앙값 ±10%p 기여 · ±15%p 강적 승률) · balance.ts 가드 구간 · 점검D 밸런스 도구 2건 · 백련 수치
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { BALANCE } from '../src/config/balance';
import { FORM_TABLE } from '../src/data/evolution';
import { evoFormEntry, evoFormIds } from '../src/data/evolution/uniques';
import { newBuild, gainTrait, isBasicBlockTrait } from '../src/engine/absorb';
import { uniformStats } from '../src/engine/combat';
import { refStatOf } from '../src/engine/evolution';
import {
  EVO_BAL_KNOWN, EVO_BAL_RULE, evoBalKey, evoBalParams, evoBalSkills, evoBalTargets, evoContribution, judgeEvoBal, measureEvoBal, median,
  type EvoBalBody, type EvoBalTarget,
} from '../scripts/lib/evoUniqueBalance';

const side = (win: number, secs: number) => ({ win, secs, taken: 0.3, games: 10 });
const body = (eWin: number, eSecs: number): EvoBalBody => ({ n: side(1, 10), e: side(eWin, eSecs), b: side(0.5, 40) });
const tgt = (formId: string, extra: Partial<EvoBalTarget> = {}): EvoBalTarget => ({ formId, factionId: 'hollow', tier: 4, category: 'mixed', element: 'fire', usesPet: false, exempt: null, ...extra });
/** 끔 강적 20초 기준, 켬 = 20 × (1 − 기여) */
const row = (formId: string, contrib: number, win: number, extra: Partial<EvoBalTarget> = {}) => ({ target: tgt(formId, extra), on: body(win, 20 * (1 - contrib)), off: body(win, 20) });

describe('측정 대상 = uniques.json 고유 능력 칸 전부 (새 진화체가 들어오면 저절로 같은 기준)', () => {
  const ts = evoBalTargets();
  it('1·2차 구현분 35칸: 사신 18 · 호로 17 (부오·프레네시 = 고유 능력 없음 · 바시오·허곡 = 삭제 제외)', () => {
    expect(ts.filter((t) => t.factionId === 'shinigami')).toHaveLength(18);
    expect(ts.filter((t) => t.factionId === 'hollow')).toHaveLength(17);
    expect(ts.some((t) => t.formId === 't4:kyo:mixed')).toBe(false);
    expect(ts.some((t) => t.formId === 't4:normal:special' && t.factionId === 'hollow')).toBe(false); // 부오
    expect(ts.some((t) => t.formId === 'h4:frenzy' && t.factionId === 'hollow')).toBe(false); // 프레네시
  });
  it('ability 가 있는 칸은 하나도 빠지지 않는다 (retired 아닌 4단계)', () => {
    let n = 0;
    for (const id of evoFormIds()) for (const fid of ['hollow', 'shinigami']) {
      const f = FORM_TABLE.find((x) => x.id === id);
      if (evoFormEntry(id, fid)?.ability && f && !f.retired) n++;
    }
    expect(ts).toHaveLength(n);
  });
  it('타입은 종족별(허무형 사신 특수·호로 물리), 펫 능력 = 추성만, 측정 제외 = 능력치 기반(천평환)만', () => {
    const get = (id: string, fid: string) => ts.find((t) => t.formId === id && t.factionId === fid)!;
    expect(get('h4:void', 'shinigami').category).toBe('special');
    expect(get('h4:void', 'hollow').category).toBe('physical');
    expect(ts.filter((t) => t.usesPet).map(evoBalKey)).toEqual(['h4:hunter/shinigami']);
    expect(ts.filter((t) => t.exempt).map(evoBalKey)).toEqual(['t4:normal:mixed/shinigami']);
  });
});

describe('기준 몸', () => {
  it('표준 빌드 = 그 진화체 타입 계열 + 다음 계열의 같은 속성 공격 특성 2개, 노멀 몸 = 뇌·불 (전부 실제 블록이 된다)', () => {
    expect(evoBalSkills({ factionId: 'hollow', category: 'special', element: 'water' })).toEqual(['t-water-c', 't-water-a']);
    expect(evoBalSkills({ factionId: 'shinigami', category: 'physical', element: 'fire' })).toEqual(['t-fire-b', 't-fire-c']);
    expect(evoBalSkills({ factionId: 'shinigami', category: 'special', element: 'normal' })).toEqual(['t-thunder-c', 't-fire-a']);
    for (const t of evoBalTargets()) for (const id of evoBalSkills(t)) {
      expect(isBasicBlockTrait(id)).toBe(false);
      expect(gainTrait(newBuild(), id).ok).toBe(true);
    }
  });
  it('켬/끔 = params.evo 있음/없음, 능력치 = 4단계 기준 균일, 해방 몸 = 레스렉시온/만해', () => {
    const t = evoBalTargets().find((x) => x.formId === 't4:fire:physical' && x.factionId === 'shinigami')!;
    const on = evoBalParams(t, true, true);
    const off = evoBalParams(t, false, false);
    expect(on.evo?.formId).toBe('t4:fire:physical');
    expect(off.evo).toBeNull();
    expect(on.playerStats).toEqual(uniformStats(refStatOf(3)));
    expect(on.liberationUnique).toBe(true);
    expect(off.liberationUnique).toBe(false);
    expect(on.refStat).toBe(refStatOf(3)); // ★4 = 4단계 기준
  });
  it('추성만 기준 펫, 2번째 칸 펫은 고유 능력 켬일 때만', () => {
    const t = evoBalTargets().find((x) => x.formId === 'h4:hunter')!;
    expect(evoBalParams(t, true, false).petAttack2).toBeTruthy();
    expect(evoBalParams(t, false, false).petAttack2).toBeNull();
    expect(evoBalParams(t, false, false).petAttack).toBeTruthy();
    const other = evoBalTargets().find((x) => x.formId === 't4:water:special')!;
    expect(evoBalParams(other, true, false).petAttack ?? null).toBeNull();
  });
  it('한 칸 측정 (작은 판 수): 켬/끔 × 해방 전/해방 몸, 두 몸 평균', () => {
    const t = evoBalTargets().find((x) => x.formId === 't4:water:physical' && x.factionId === 'shinigami')!;
    const r = measureEvoBal(t, { n: 1, e: 1, b: 0 });
    expect(r.star).toBe(4);
    expect(r.on.e.games).toBe(r.pre.on.e.games + r.rel.on.e.games);
    expect(r.on.e.win).toBeCloseTo((r.pre.on.e.win + r.rel.on.e.win) / 2, 9);
    expect(Number.isFinite(evoContribution(r))).toBe(true);
  });
});

describe('판정 (마스터AR provisional: 기여 중앙값 ±10%p · 강적 승률 중앙값 ±15%p)', () => {
  it('중앙값', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBe(0);
  });
  it('기여 = 1 − 켬 ÷ 끔 (강적 처치 시간), 끔이 못 이기면 0', () => {
    expect(evoContribution(row('a', 0.1, 0.9))).toBeCloseTo(0.1, 9);
    expect(evoContribution({ on: body(1, 10), off: body(0, 0) })).toBe(0);
  });
  it('밖이면 실패, 안이면 통과 — 경계는 포함', () => {
    expect(EVO_BAL_RULE).toEqual({ contribBand: 0.1, winBand: 0.15 });
    const base = [row('a', 0.02, 0.9), row('b', 0.03, 0.9), row('c', 0.04, 0.9)];
    expect(judgeEvoBal(base)[0]!.failures).toEqual([]);
    const v = judgeEvoBal([...base, row('d', 0.2, 0.9), row('e', 0.03, 0.6)])[0]!;
    expect(v.medContrib).toBeCloseTo(0.03, 9);
    expect(v.medWin).toBeCloseTo(0.9, 9);
    expect(v.failures.some((f) => f.includes('d/hollow') && f.includes('기여'))).toBe(true);
    expect(v.failures.some((f) => f.includes('e/hollow') && f.includes('강적 승률'))).toBe(true);
    expect(v.failures).toHaveLength(2);
    expect(judgeEvoBal([...base, row('f', 0.13, 0.75)])[0]!.failures).toEqual([]); // 정확히 +10%p·−15%p
  });
  it('측정 제외 칸은 중앙값에도 판정에도 안 들어가고, 목표 미달 칸은 경고(known)로(중앙값에는 들어감)', () => {
    const v = judgeEvoBal([row('a', 0.02, 0.9), row('b', 0.03, 0.9), row('c', 0.04, 0.9), row('x', 0.9, 0.1, { exempt: '능력치 기반' }), row('k', -1, 0.9)], EVO_BAL_RULE, { 'k/hollow': '사유' })[0]!;
    expect(v.medContrib).toBeCloseTo(0.025, 9); // a·b·c·k 4칸 (x 제외)
    expect(v.failures).toEqual([]);
    expect(v.known).toHaveLength(1);
  });
  it('지금 목표 미달 = 호로 콜리브리(몸 차이)·추파카브라(봇 즉시 사용 + 사용자 확정값, C.521) 2칸 — 사유가 적혀 있다', () => {
    expect(Object.keys(EVO_BAL_KNOWN).sort()).toEqual(['t4:blood:physical/hollow', 't4:thunder:physical/hollow']);
    for (const why of Object.values(EVO_BAL_KNOWN)) expect(why).toContain('목표 미달');
  });
});

describe('밸런스 도구 연결 (scripts/balance.ts)', () => {
  const src = readFileSync('scripts/balance.ts', 'utf8');
  it("'evoUnique' 구간이 SECTIONS 에 있고 실패는 failures(후반 보류 아님)로", () => {
    expect(src).toMatch(/\{ name: 'evoUnique', seconds: \d+ \}/);
    expect(src).toContain("if (want('evoUnique'))");
    expect(src).toContain('for (const f of v.failures) failures.push(f);');
  });
  it('점검D ①: 물공 6속성 측정은 진화체 고유 능력을 뺀다 (evo = null, 테스트 c105b 와 같이)', () => {
    const phys = src.slice(src.indexOf("if (want('phys'))"), src.indexOf("if (want('difficulty'))"));
    expect(phys).toMatch(/applyEvolutionToParams\(params, \{ \.\.\.body\.evolution, formId, abilities: undefined \}, 'hollow'\);\s*\/\/[^\n]*\n\s*params\.evo = null;/);
  });
  it('점검D ②: 흙 강적 패배율 비교는 표시(정수 %) 기준 — 0% 와 0% 는 같다', () => {
    expect(src).toContain('Math.round((1 - r.on.eWin) * 100) > Math.round(lowestLoss * 100)');
  });
});

describe('보정 수치 (balance provisional.evoUniques)', () => {
  it('사신 백련 = 평타 2대마다 · 바 블록당 +6% · 만해 1대 (C.520, 옛 4대·+3%·2대)', () => {
    const n = (BALANCE.provisional.evoUniques.forms['t4:normal:physical'] as Record<string, Record<string, unknown>>).shinigami as Record<string, unknown>;
    expect(n.every).toBe(2);
    expect(n.perBlock).toBe(0.06);
    expect(n.release).toEqual({ every: 1 });
  });
  it('사용자 확정값은 그대로: 소로 여우불 2.5초·5개, 공용 화상 8초 +8%, 토르멘타 필드 5초, 추파카브라 저장 100%·피해 ×1.0', () => {
    const F = BALANCE.provisional.evoUniques.forms as Record<string, Record<string, Record<string, unknown>>>;
    expect(F['t4:fire:physical']!.hollow).toMatchObject({ seconds: 2.5, need: 5 });
    expect(F['t4:fire:mixed']!.hollow).toMatchObject({ burnSeconds: 8, burn: 0.08 });
    expect(F['t4:fire:special']!.shinigami).toMatchObject({ burnSeconds: 8, burnPct: 0.08 });
    expect(F['t4:thunder:special']!.hollow).toMatchObject({ fieldSeconds: 5, stormSeconds: 5 });
    expect(F['t4:blood:physical']!.hollow).toMatchObject({ store: 1, useMult: 1 });
  });
});
