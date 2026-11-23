/** C.530 공속 진화체 = 일반 공격 간격 0.6초가 '다 키움' (GDD 8-7 v6.186, 사용자 "공속애들은 템도 있으니까 0.6까지만 올리면 맥스라고 생각하고 짜").
 *  능력 데이터 effortBasis 'attackInterval' 몸의 출처 effort = 몸 기본 공속 간격 → 지금 공속 간격이 0.6초까지 줄어든 비율(더 빠른 몫 = 장비 덤) ·
 *  측정 노력치 칸 = 공속은 0.6초에 닿는 만큼, 남은 노력치는 옛 비율 · 반석·섬뢰각 요구 스탯 블록속도 → 공속 · 기울기 재보정 */
import { describe, expect, it } from 'vitest';
import { BALANCE, BALANCE_VERSION } from '../src/config/balance';
import profilesRaw from '../src/data/evolution/balanceProfiles.json';
import uniquesRaw from '../src/data/evolution/uniques.json';
import type { BalanceProfileFile } from '../src/data/evolution/balanceProfiles';
import { evoFormEntry, evoNumsOf, evoText, fillEvoText, validateEvoUniques, type EvoFile } from '../src/data/evolution/uniques';
import { buildCombatParams, newBuild } from '../src/engine/absorb';
import {
  applyEvolutionToParams, baseStatsOf, evCaps, evoEffortOf, evoIntervalEffortOf, evoIntervalFullAspd, newEvolution, refStatOf, statAttackSecondsOf,
} from '../src/engine/evolution';
import { EVO_PROFILE_KNOWN, evProfileAllocation } from '../scripts/lib/evoProfile';
import { PATCH_LABEL } from '../src/version';
import { createCombat, evoStat, playerCritChanceOf, type EvoParams } from '../src/engine/combat';
import { getEnemy } from '../src/data/enemies';
import { getForm } from '../src/data/evolution';
import { evoParamsOf } from '../src/engine/evolution';

const PROFILES = profilesRaw as unknown as BalanceProfileFile;
const UNIQUES = uniquesRaw as unknown as EvoFile;
const F = BALANCE.provisional.evoUniques.forms as Record<string, Record<string, Record<string, unknown>>>;
const FULL = BALANCE.provisional.evoInvest.intervalFull;

describe('출처 effort — 일반 공격 간격 기준 (evoIntervalEffortOf)', () => {
  it('기준 = balance evoInvest.intervalFull 0.6초 (provisional)', () => {
    expect(FULL).toBe(0.6);
    expect(statAttackSecondsOf(evoIntervalFullAspd())).toBeLessThanOrEqual(FULL);
    expect(statAttackSecondsOf(evoIntervalFullAspd() - 1)).toBeGreaterThan(FULL);
  });
  it('몸 기본 간격 = 0 · 0.6초 = 1 · 더 빠르면 1 고정(장비 덤) · 중간은 간격이 줄어든 비율', () => {
    const base = refStatOf(3);
    expect(evoIntervalEffortOf(base, base)).toBe(0);
    expect(evoIntervalEffortOf(base, evoIntervalFullAspd())).toBe(1);
    expect(evoIntervalEffortOf(base, 437)).toBe(1);
    const i0 = statAttackSecondsOf(base);
    const mid = 150;
    expect(evoIntervalEffortOf(base, mid)).toBeCloseTo((i0 - statAttackSecondsOf(mid)) / (i0 - FULL), 9);
    expect(evoIntervalEffortOf(base, base - 10)).toBe(0); // 느려지면 0 아래로 안 감
  });
  it('몸 기본 간격이 이미 0.6초 이하면 1', () => {
    expect(evoIntervalEffortOf(evoIntervalFullAspd() + 50, evoIntervalFullAspd() + 50)).toBe(1);
  });
});

describe('데이터: effortBasis = 측정 요구 스탯 공속인 몸 (종족 분기 없음)', () => {
  const interval = () => Object.entries(UNIQUES.forms).flatMap(([id, by]) => Object.entries(by).filter(([, e]) => e.ability?.effortBasis === 'attackInterval').map(([fac]) => `${id}/${fac}`));
  const aspdFocus = () => Object.entries(PROFILES.forms).flatMap(([id, by]) => Object.entries(by).filter(([, v]) => v?.investFocus === 'aspd').map(([fac]) => `${id}/${fac}`));
  it('12칸 = investFocus aspd 12칸과 같다 (반석·섬뢰각 블록속도 → 공속 포함)', () => {
    expect(interval().sort()).toEqual(aspdFocus().sort());
    expect(interval()).toHaveLength(12);
    expect(PROFILES.forms['t4:earth:physical']!.shinigami!.investFocus).toBe('aspd');
    expect(PROFILES.forms['t4:thunder:physical']!.shinigami!.investFocus).toBe('aspd');
  });
  it('데이터 검사: effortBasis 는 attackInterval 만', () => {
    expect(validateEvoUniques()).toEqual([]);
    const bad = JSON.parse(JSON.stringify(UNIQUES)) as EvoFile;
    (bad.forms['t4:fire:physical']!.hollow!.ability as unknown as Record<string, unknown>).effortBasis = 'evShare';
    expect(validateEvoUniques(bad).join('\n')).toMatch(/effortBasis 는 'attackInterval' 만/);
  });
});

describe('엔진: applyEvolutionToParams', () => {
  const soro = (ev: Record<string, number>, carry?: Record<string, number>) => {
    const p = buildCombatParams(newBuild(), 'hollow');
    const e = { ...newEvolution(), tierIndex: 3, formId: 't4:fire:physical', formHistory: ['t2:base', 't3:fire', 't4:fire:physical'] };
    e.ev = { ...e.ev, ...ev };
    if (carry) e.carry = { ...e.ev, hp: 0, atk: 0, int: 0, def: 0, spr: 0, aspd: 0, bspd: 0, ...carry };
    applyEvolutionToParams(p, e, 'hollow');
    return { effort: p.evo!.effort!, base: baseStatsOf(e, 'hollow').aspd };
  };
  it('소로: 공속 노력치 0 = 0 · 간격 0.6초까지 찍으면 1 · 공격 노력치는 안 셈', () => {
    expect(soro({}).effort).toBe(0);
    const { base } = soro({});
    expect(soro({ aspd: evoIntervalFullAspd() - base }).effort).toBe(1);
    expect(soro({ atk: 330 }).effort).toBe(0);
    const half = soro({ aspd: Math.round((evoIntervalFullAspd() - base) / 2) }).effort;
    expect(half).toBeGreaterThan(0.3);
    expect(half).toBeLessThan(1);
  });
  it('장비 공속(carry)도 간격을 줄이면 같이 센다 — 0.6초 넘는 몫은 덤(1 고정)', () => {
    const { base } = soro({});
    const need = evoIntervalFullAspd() - base;
    expect(soro({ aspd: need - 20 }, { aspd: 20 }).effort).toBe(1);
    expect(soro({ aspd: 330 }, { aspd: 40 }).effort).toBe(1);
  });
  it('간격 기준이 아닌 몸은 노력치 투자율 그대로 (에스칼레라)', () => {
    const p = buildCombatParams(newBuild(), 'hollow');
    const e = { ...newEvolution(), tierIndex: 3, formId: 't4:normal:mixed', formHistory: ['t2:base', 't3:normal', 't4:normal:mixed'] };
    e.ev = { ...e.ev, aspd: 100 };
    applyEvolutionToParams(p, e, 'hollow');
    expect(p.evo!.effort).toBeCloseTo(evoEffortOf(e.ev, 3, 'mixed'), 9);
  });
});

describe('측정 노력치 칸 (scripts/lib/evoProfile.ts)', () => {
  it('공속 = 간격 0.6초에 닿는 만큼(기준 몸 0.79초 → 노력치 119) · 남은 노력치는 옛 비율 · 합계 ≤ 상한', () => {
    const cap = evCaps(3);
    const a = evProfileAllocation({ tier: 4, category: 'physical', goal: { investFocus: 'aspd' } });
    expect(statAttackSecondsOf(refStatOf(3))).toBeCloseTo(0.79, 2);
    expect(a.aspd).toBe(119);
    expect(statAttackSecondsOf(refStatOf(3) + a.aspd!)).toBeLessThanOrEqual(FULL);
    const sum = Object.values(a).reduce((x, y) => x + y, 0);
    expect(sum).toBeLessThanOrEqual(cap.total);
    expect(sum).toBeGreaterThan(cap.total - 5);
    expect(a.atk).toBe(Math.floor((cap.total - 119) * 0.35 / 0.65));
  });
});

describe('설명: 「공격 속도를 키울수록 … 간격 0.6초에 최대 — 다 키우면」', () => {
  it('공속 몸의 노력치 문구 = 공격 속도 · {intervalFull} = 0.6 · {키} 다 채움', () => {
    for (const [id, by] of Object.entries(UNIQUES.forms)) for (const [fac, e] of Object.entries(by)) {
      if (e.ability?.effortBasis !== 'attackInterval') continue;
      const t = fillEvoText(evoText(evoFormEntry(id, fac)!.ability!.description, fac), evoNumsOf(id, fac) as Record<string, number>);
      expect(t, `${id}/${fac}`).not.toMatch(/노력치를 키울수록|노력치·이 속성/);
      expect(t, `${id}/${fac}`).not.toMatch(/\{[A-Za-z0-9_@]+%?\}/);
      if (/키울수록/.test(t) && !/블록\(흡수 특성·강화\)을 키울수록/.test(t)) expect(t, `${id}/${fac}`).toMatch(/공격 속도(·이 속성 블록을 같이|를) 키울수록 커짐, 일반 공격 간격 0\.6초에 최대 — 다 키우면/);
    }
    expect(fillEvoText('{intervalFull}초', {})).toBe('0.6초');
  });
});

describe('기울기 재보정 (3회) · 사용자 확정 값 그대로', () => {
  it('노도 ×3.2·연격 ×2 · 백련 ×4 · 마르티요 ×88 · 에스카라바호 ×6.5 · 콜리브리 ×36', () => {
    expect(F['t4:water:physical']!.shinigami).toMatchObject({ perStackGrow: 3.2, hitsGrow: 2 });
    expect(F['t4:normal:physical']!.shinigami).toMatchObject({ perBlockGrow: 4 });
    expect(F['t4:normal:physical']!.hollow).toMatchObject({ perStackGrow: 88 });
    expect(F['t4:earth:physical']!.hollow).toMatchObject({ bonusGrow: 6.5 });
    expect(F['t4:thunder:physical']!.hollow).toMatchObject({ perStackGrow: 36, maxCut: 0.6 });
  });
  it('소로 여우불 2.5초·5개·화상 기울기 ×48(C.528 값 — 0.6초면 5개가 거의 안 모여 올려도 고점 그대로) · 갑각 12초', () => {
    expect(F['t4:fire:physical']!.hollow).toMatchObject({ seconds: 2.5, need: 5, burnGrow: 48 });
    expect(F['t4:earth:physical']!.hollow).toMatchObject({ regrow: 12 });
  });
  it('목표 미달 목록 26칸 — 콜리브리·반석·섬뢰각 통과로 빠짐, 소로·라나·나다 사유 = C.530', () => {
    expect(Object.keys(EVO_PROFILE_KNOWN)).toHaveLength(26);
    for (const k of ['t4:thunder:physical/hollow', 't4:earth:physical/shinigami', 't4:thunder:physical/shinigami']) expect(EVO_PROFILE_KNOWN[k]).toBeUndefined();
    for (const k of ['t4:fire:physical/hollow', 't4:water:physical/hollow', 'h4:void/hollow']) expect(EVO_PROFILE_KNOWN[k]).toMatch(/C\.530/);
  });
  it('BALANCE 165 · 패치 C.530', () => {
    expect(BALANCE_VERSION).toBeGreaterThanOrEqual(165);
    expect(Number(PATCH_LABEL.slice(2))).toBeGreaterThanOrEqual(530);
  });
});

describe('사신 주홍장 만해 = 혈 블록 치명 + 상한 돌파 (GDD 7절 v6.187, 사용자 11-12 "상한 뚫음" — critBreak { when: release })', () => {
  const body = (releasing: boolean) => {
    const evo = { ...evoParamsOf(getForm('t4:blood:physical'), 'shinigami')!, effort: 1, blockLv: 1 } as EvoParams;
    const s = createCombat(7, { enemy: getEnemy('test-a'), params: { enemyPassive: true, enemyImmortal: true, trayCapacity: 0, evo, critChance: 0.7, liberationUnique: true } });
    s.evo!.stacks.blood = { n: 6 }; // 만해 중 생긴 혈 블록 6개
    s.liberation.ticksLeft = releasing ? 100 : 0;
    return s;
  };
  it('데이터 = 만해 중에만 돌파', () => {
    expect(UNIQUES.forms['t4:blood:physical']!.shinigami!.ability!.critBreak).toEqual({ when: 'release' });
  });
  it('만해 중: 평타 치명 70% 위로(70% + 혈 블록 6 × 5%p = 100%) · 평소: 70%', () => {
    const r = body(true);
    expect(evoStat(r, 'crit')).toBeCloseTo(0.3, 6);
    expect(playerCritChanceOf(r)).toBeCloseTo(1, 6);
    expect(playerCritChanceOf(r)).toBeGreaterThan(0.7);
    const n = body(false);
    expect(playerCritChanceOf(n)).toBeCloseTo(0.7, 6);
  });
});
