// C.528 — 측정 노력치 칸 = 진화체 능력이 요구하는 스탯에 몰아 찍기 (GDD 8-7 v6.181, 마스터AS · 사용자 "여우불은 5개로 하라고 건들지말고")
import { describe, expect, it } from 'vitest';
import { BALANCE, BALANCE_VERSION } from '../src/config/balance';
import raw from '../src/data/evolution/balanceProfiles.json';
import { validateBalanceProfiles, type BalanceProfileFile } from '../src/data/evolution/balanceProfiles';
import { STAT_IDS } from '../src/data/schema';
import { evCaps, evoEffortOf } from '../src/engine/evolution';
import { attackSecondsNow, createCombat } from '../src/engine/combat';
import { enemyAtDifficulty } from '../src/engine/difficulty';
import { ENEMIES } from '../src/data/enemies';
import { EVO_PROFILE_KNOWN, evoProfileInvest, evoProfileTargets, evProfileAllocation } from '../scripts/lib/evoProfile';
import { evoBodyParams } from '../scripts/lib/evoUniqueBalance';
import { PATCH_LABEL } from '../src/version';

const D = raw as unknown as BalanceProfileFile;
const F = BALANCE.provisional.evoUniques.forms as Record<string, Record<string, Record<string, unknown>>>;
const soro = () => evoProfileTargets().find((t) => t.formId === 't4:fire:physical' && t.factionId === 'hollow')!;

describe('요구 스탯 데이터 (balanceProfiles.json investFocus)', () => {
  it('고유 능력이 있고 목표가 있는 몸 35칸 모두 요구 스탯이 있고, 능력 없는 몸은 없다 · 데이터 검사 통과', () => {
    const ts = evoProfileTargets().filter((t) => t.goal);
    expect(ts.filter((t) => t.hasAbility && t.goal!.investFocus)).toHaveLength(35);
    expect(ts.filter((t) => !t.hasAbility && t.goal!.investFocus)).toHaveLength(0);
    for (const t of ts) if (t.goal!.investFocus) expect(STAT_IDS).toContain(t.goal!.investFocus);
    expect(validateBalanceProfiles()).toEqual([]);
  });
  it('시간 제한 몸 = 공속(일반 공격 창) 또는 블록속도(블록으로 켜짐) · 소로 = 공속', () => {
    for (const byFac of Object.values(D.forms)) for (const g of Object.values(byFac)) if (g?.timed) expect(['aspd', 'bspd']).toContain(g.investFocus);
    expect(soro().goal!.investFocus).toBe('aspd');
  });
  it('모르는 능력치는 데이터 검사가 잡는다', () => {
    const bad = JSON.parse(JSON.stringify(D)) as BalanceProfileFile;
    (bad.forms['t4:fire:physical']!.hollow as { investFocus: string }).investFocus = 'luck';
    expect(validateBalanceProfiles(bad).join(' ')).toMatch(/investFocus/);
  });
});

describe('측정 노력치 배분 (scripts/lib/evoProfile.ts)', () => {
  const cap = evCaps(3);
  it('요구 스탯 = 능력치 하나 상한까지, 남은 합계는 지금 비율(요구 스탯 몫 뺌)대로 · 합계 ≤ 상한 합계', () => {
    const a = evProfileAllocation({ tier: 4, category: 'physical', goal: { investFocus: 'aspd' } });
    expect(a.aspd).toBe(cap.perStat);
    const sum = Object.values(a).reduce((x, y) => x + y, 0);
    expect(sum).toBeLessThanOrEqual(cap.total);
    expect(sum).toBeGreaterThan(cap.total - 5);
    expect(a.atk).toBe(Math.floor((cap.total - cap.perStat) * 0.35 / 0.65));
    expect(a.int ?? 0).toBe(0);
    for (const v of Object.values(a)) expect(v).toBeLessThanOrEqual(cap.perStat);
  });
  it('요구 스탯이 없으면 옛 고정 비율 그대로', () => {
    expect(evProfileAllocation({ tier: 4, category: 'physical' })).toEqual(evProfileAllocation({ tier: 4, category: 'physical', goal: null }));
    expect(evProfileAllocation({ tier: 4, category: 'physical' }).aspd).toBe(Math.floor(cap.total * 0.35));
  });
  it('노력치만·둘 다 칸이 요구 스탯 배분을 쓴다 · 무투자·블록만 칸은 노력치 없음', () => {
    const t = soro();
    expect(evoProfileInvest(t, 'ev').ev).toEqual(evProfileAllocation(t));
    expect(evoProfileInvest(t, 'both').ev!.aspd).toBe(cap.perStat);
    expect(evoProfileInvest(t, 'none').ev).toBeNull();
    expect(evoProfileInvest(t, 'blk').ev).toBeNull();
  });
  it('게임 규칙 그대로: 물리 몸 공속 몰기여도 엔진 노력치 투자율(공격+공속) = 1', () => {
    expect(evoEffortOf(evProfileAllocation({ tier: 4, category: 'physical', goal: { investFocus: 'aspd' } }), 3, 'physical')).toBe(1);
    expect(BALANCE.provisional.evoInvest.mainStats.physical).toEqual(['atk', 'aspd']);
  });
});

describe('소로 여우불 2.5초·5개 그대로 — 공속 몰기면 일반 공격 간격 ≤ 0.5초', () => {
  it('여우불 2.5초·5개(사용자 확정) 그대로', () => {
    expect(F['t4:fire:physical']!.hollow).toMatchObject({ seconds: 2.5, need: 5 });
  });
  it('측정 몸: 무투자 0.79초(5개 못 모음) · 노력치만 0.47초(2.5초 안 5개) · 옛 35% 배분이면 0.56초', () => {
    const t = soro();
    const enemy = enemyAtDifficulty(ENEMIES.find((e) => e.class === 'normal')!, 4);
    const iv = (inv: 'none' | 'ev', tt = t) => attackSecondsNow(createCombat(1, { enemy, params: { ...evoBodyParams(tt, true, false, 4, evoProfileInvest(tt, inv)) } }));
    expect(iv('none')).toBeGreaterThan(0.5);
    expect(iv('ev')).toBeLessThanOrEqual(0.5);
    expect(iv('ev', { ...t, goal: { ...t.goal!, investFocus: undefined } })).toBeGreaterThan(0.5);
  });
});

describe('노력치 기울기 보정 (시간 제한 몸, 3회)', () => {
  const full = (id: string, fac: string, k: string, g: string, rel = false) => {
    const f = F[id]![fac]!;
    const r = (rel ? f.release : {}) as Record<string, number>;
    return (r[k] ?? (f[k] as number)) * (1 + (r[g] ?? (f[g] as number)));
  };
  it('노도 ×2.5 → ×4·연격 ×1.5 → ×2.5 · 소로 ×20 → ×48 · 에스카라바호 ×5.5 → ×9 · 무랄라 ×6 → ×14', () => {
    expect(F['t4:water:physical']!.shinigami).toMatchObject({ perStackGrow: 4, hitsGrow: 2.5 });
    expect(F['t4:fire:physical']!.hollow).toMatchObject({ burn: 0.03, burnGrow: 48 });
    expect(F['t4:earth:physical']!.hollow).toMatchObject({ bonusGrow: 9, regrow: 12 });
    expect(F['t4:earth:special']!.hollow).toMatchObject({ shieldGrow: 14, s1: 0.03, s2: 0.06, s3: 0.1 });
  });
  it('소로 해방: 다 키운 해방 = 다 키운 평소 ×1.5 (2배 안 · 평소보다 큼, C.527 원칙)', () => {
    const n = full('t4:fire:physical', 'hollow', 'burn', 'burnGrow');
    const r = full('t4:fire:physical', 'hollow', 'burn', 'burnGrow', true);
    expect(n).toBeCloseTo(1.47, 6);
    expect(r).toBeCloseTo(2.2, 6);
    expect(r / n).toBeLessThanOrEqual(2);
    expect(r).toBeGreaterThan(n);
  });
  it('되돌린 몸 = C.527 값 그대로 (에스칼레라·토르투가·브라사·게파르도·비전·토르멘타·비보라·나다·석양홍)', () => {
    expect(F['t4:normal:mixed']!.hollow).toMatchObject({ stepGrow: 20, stepSecondsGrow: 3 });
    expect(F['t4:earth:mixed']!.hollow).toMatchObject({ reflect: 0.4, reflectGrow: 10 });
    expect(F['t4:fire:mixed']!.hollow).toMatchObject({ dealtGrow: 30 });
    expect(F['t4:thunder:mixed']!.hollow).toMatchObject({ cutGrow: 2, boltSecondsGrow: 1 });
    expect(F['t4:thunder:mixed']!.shinigami).toMatchObject({ hasteGrow: 4, hasteSecondsGrow: 2 });
    expect(F['t4:thunder:special']!.hollow).toMatchObject({ dotGrow: 15, fieldSeconds: 5 });
    expect(F['t4:poison:special']!.hollow).toMatchObject({ venomGrow: 10 });
    expect(F['h4:void']!.hollow).toMatchObject({ hollowGrow: 10, hollowSecondsGrow: 2 });
    expect(F['t4:fire:special']!.shinigami).toMatchObject({ shotGrow: 6 });
  });
  it('목표 미달 사유: 시간 제한 몸은 C.528 수치 · 새로 미달 4칸(무랄라·콜리브리·반석·섬뢰각) · 통과한 노도·에스카라바호는 없음', () => {
    for (const k of ['t4:earth:special/hollow', 't4:thunder:physical/hollow', 't4:earth:physical/shinigami', 't4:thunder:physical/shinigami', 't4:fire:physical/hollow']) expect(EVO_PROFILE_KNOWN[k]).toMatch(/C\.528/);
    expect(EVO_PROFILE_KNOWN['t4:water:physical/shinigami']).toBeUndefined();
    expect(EVO_PROFILE_KNOWN['t4:earth:physical/hollow']).toBeUndefined();
  });
  it('BALANCE 163 · 패치 C.528', () => {
    expect(BALANCE_VERSION).toBeGreaterThanOrEqual(163);
    expect(Number(PATCH_LABEL.slice(2))).toBeGreaterThanOrEqual(528);
  });
});
