/** C.527 진화체 능력 상한·해방 값 기울기 (GDD 8-7, 마스터AS provisional):
 *  ① 진화체 능력으로 줄어드는 일반 공격 간격 합계 하한 = 줄기 전 × 0.4(최대 −60%, 옛 ×0.05) ② 능력 치명 확률 + 합계 ≤ 100%p → C.529(GDD 7-4 v6.182, 사용자)가 '상한 70% 안, critBreak 능력만 돌파'로 대체 (tests/c529.test.ts)
 *  ③ 해방(레스렉시온/만해) = 평소 값의 강화판 — 다 키운 해방 값 ≤ 다 키운 평소 값 × 2 (release 에 grow 키를 따로 둬 해방 쪽 기울기만 낮춤) */
import { describe, expect, it } from 'vitest';
import { useImmediateHits } from './helpers/hitDelay';
import raw from '../src/data/evolution/uniques.json';
import { BALANCE, BALANCE_VERSION } from '../src/config/balance';
import { getEnemy } from '../src/data/enemies';
import { getForm } from '../src/data/evolution';
import { evoNumsOf, validateEvoUniques } from '../src/data/evolution/uniques';
import {
  BASIC_SKILL_ID, applyInput, attackSecondsNow, createCombat, drainCombatEvents, evoStat, playerCritChanceOf, step,
  type Block, type CombatParams, type CombatState,
} from '../src/engine/combat';
import { evoParamsOf } from '../src/engine/evolution';
import { evoUniqueLines } from '../src/ui/evolutionPanel';
import { PATCH_LABEL } from '../src/version';
useImmediateHits();

const CAPS = BALANCE.provisional.evoAbilityCaps;
const foe = getEnemy('test-a');
const STILL: Partial<CombatParams> = { critChance: 0, blockCritChance: 0, enemyCritChance: 0, enemyDamageVariance: 0, voidChance: 0, enemyPassive: true, enemyImmortal: true };
let uid = 90000;
const blk = (over: Partial<Block> = {}): Block => ({ uid: uid++, kind: 'skill', traitId: BASIC_SKILL_ID, family: 'family-a', ...over });
const mk = (extra: Partial<CombatParams>, seed = 7): CombatState => createCombat(seed, { enemy: foe, params: { ...STILL, trayCapacity: 0, ...extra } });
const full = (id: string, fac: string) => ({ ...evoParamsOf(getForm(id), fac)!, effort: 1, blockLv: 1 });
const libNow = (s: CombatState) => {
  s.liberation.gauge = 100;
  applyInput(s, { type: 'liberate' });
  drainCombatEvents(s);
};
const useOne = (s: CombatState, family = 'family-a') => {
  s.tray.push(blk({ family }));
  applyInput(s, { type: 'use', cell: s.tray.length - 1 });
  drainCombatEvents(s);
};
const basics = (s: CombatState, n: number) => {
  let got = 0;
  for (let i = 0; i < 20000 && got < n && s.status === 'playing'; i++) {
    step(s);
    got += drainCombatEvents(s).filter((e) => e.kind === 'player-attack').length;
  }
};

type Grow = { value: string | number; per: unknown };
/** 모든 진화체 × 종족의 grow·secondsGrow 칸: [진화체, 종족, 값 키, 기울기 키] */
function growSites(): [string, string, string, string][] {
  const out: [string, string, string, string][] = [];
  const walk = (o: unknown, id: string, fac: string) => {
    if (Array.isArray(o)) return o.forEach((x) => walk(x, id, fac));
    if (!o || typeof o !== 'object') return;
    const r = o as Record<string, unknown>;
    for (const [gk, vk] of [['grow', 'value'], ['secondsGrow', 'seconds']] as const) {
      const g = r[gk] as Grow | undefined;
      if (g && typeof r[vk] === 'string' && typeof g.value === 'string') out.push([id, fac, r[vk] as string, g.value]);
    }
    for (const v of Object.values(r)) walk(v, id, fac);
  };
  for (const [id, by] of Object.entries((raw as { forms: Record<string, Record<string, unknown>> }).forms)) for (const [fac, e] of Object.entries(by)) walk(e, id, fac);
  return out;
}

describe('C.527 진화체 능력 상한 (엔진 공용)', () => {
  it('수치: 간격 하한 ×0.4 (provisional) · 치명 = critBreakMax 100%(돌파 능력만, C.529 가 옛 critMax 대체)', () => {
    expect(CAPS).toEqual({ intervalFloor: 0.4, critBreakMax: 1 });
  });
  it('간격 하한: 사신 비전 만해 다 키우면 −0.75초라도 줄기 전 간격 × 0.4 아래로 안 줄어든다', () => {
    const s = mk({ evo: full('t4:thunder:mixed', 'shinigami'), liberationUnique: true, liberationSeconds: 300 });
    libNow(s);
    const t0 = attackSecondsNow(s);
    useOne(s);
    const t1 = attackSecondsNow(s);
    expect(evoStat(s, 'intervalCut')).toBeCloseTo(0.75, 5);
    expect(t0 - 0.75).toBeLessThan(t0 * CAPS.intervalFloor); // 하한이 없으면 더 짧아질 몸
    expect(t1).toBeCloseTo(Math.max(BALANCE.provisional.combat.attackSecondsMin, Math.round(t0 * CAPS.intervalFloor * 100) / 100), 5);
  });
  it('간격 하한: 콜리브리 다 키우면 −60%(maxCut 0.6) = 하한과 같은 값 — 줄기 전 × 0.4', () => {
    const s = mk({ evo: full('t4:thunder:physical', 'hollow') });
    const t0 = attackSecondsNow(s);
    basics(s, 30);
    expect(evoStat(s, 'interval')).toBeCloseTo(0.6, 5);
    expect(attackSecondsNow(s)).toBeGreaterThanOrEqual(Math.max(BALANCE.provisional.combat.attackSecondsMin, t0 * CAPS.intervalFloor) - 0.011);
  });
  it('간격 하한: 게파르도 레스렉시온 낙뢰 다 키우면 −60%(옛 −120% → 공속 20배)', () => {
    const n = evoNumsOf('t4:thunder:mixed', 'hollow');
    expect(n.release!.cut! * (1 + n.release!.cutGrow!)).toBeCloseTo(0.6, 6);
    expect(n.release!.seconds! * (1 + n.release!.boltSecondsGrow!)).toBeCloseTo(16, 6);
  });
  it('치명 상한 (C.529 로 바뀜 — 옛 +100%p): 라나 = 물 속성 돌파 진화체(GDD 7-4 v6.183) — 스택 합이 100%p 를 넘어도 평타 치명 최대 100%', () => {
    const s = mk({ evo: full('t4:water:physical', 'hollow') });
    for (let k = 0; k < 10; k++) useOne(s, k % 2 ? 'family-a' : 'family-b');
    expect(evoStat(s, 'crit')).toBeGreaterThan(1);
    expect(playerCritChanceOf(s)).toBeCloseTo(CAPS.critBreakMax, 6);
    const z = mk({ evo: evoParamsOf(getForm('t4:water:physical'), 'hollow')! });
    useOne(z);
    expect(playerCritChanceOf(z)).toBeCloseTo(evoStat(z, 'crit'), 6); // 상한 아래면 그대로 (기본 0)
  });
});

describe('C.527 해방 값 기울기 (데이터 검사)', () => {
  it('데이터 검사 통과', () => {
    expect(validateEvoUniques()).toEqual([]);
  });
  it('모든 진화체 × 종족: 다 키운 해방 값 ≤ 다 키운 평소 값 × 2', () => {
    let checked = 0;
    for (const [id, fac, key, gk] of growSites()) {
      const n = evoNumsOf(id, fac);
      const rel = n.release ?? {};
      if (rel[key] === undefined && rel[gk] === undefined) continue;
      const normal = n[key]! * (1 + n[gk]!);
      const release = (rel[key] ?? n[key]!) * (1 + (rel[gk] ?? n[gk]!));
      expect(release / normal, `${id}/${fac} ${key}@${gk}`).toBeLessThanOrEqual(2 + 1e-9);
      checked++;
    }
    expect(checked).toBeGreaterThanOrEqual(14);
  });
  it('전 → 후 대표: 토르투가 반사 2200% → 880% · 석양홍 ×21 → ×14 · 소로 +252% → +126% · 바라쿠다 +105%p → +90%p', () => {
    const v = (id: string, fac: string, key: string, gk: string) => {
      const n = evoNumsOf(id, fac);
      return n.release![key]! * (1 + n.release![gk]!);
    };
    expect(v('t4:earth:mixed', 'hollow', 'reflect', 'reflectGrow')).toBeCloseTo(8.8, 6);
    expect(v('t4:fire:special', 'shinigami', 'shotMult', 'shotGrow')).toBeCloseTo(14, 6);
    expect(v('t4:fire:physical', 'hollow', 'burn', 'burnGrow')).toBeCloseTo(1.26, 6);
    expect(v('t4:water:mixed', 'hollow', 'crit', 'critGrow')).toBeCloseTo(0.9, 6);
  });
  it('해방 기본값(투자 0)은 그대로 — 기울기만 낮춤', () => {
    expect(evoNumsOf('t4:thunder:mixed', 'hollow').release).toMatchObject({ seconds: 9, cut: 0.4 });
    expect(evoNumsOf('t4:earth:mixed', 'hollow').release).toMatchObject({ reflect: 2 });
    expect(evoNumsOf('t4:fire:special', 'shinigami').release).toMatchObject({ shotMult: 3, shotMax: 3 });
    expect(evoNumsOf('t4:fire:physical', 'hollow').release).toMatchObject({ seconds: 3, burn: 0.12 });
  });
});

describe('C.527 설명 문구', () => {
  const allIds = (): [string, string][] => Object.entries((raw as { forms: Record<string, Record<string, unknown>> }).forms).flatMap(([id, by]) => Object.keys(by).map((fac) => [id, fac] as [string, string]));
  it("모든 진화체 × 종족 능력 설명에 '−1xx%'(간격 −100% 이상)·'+1xx%p'(치명 100%p 이상) 없음", () => {
    for (const [id, fac] of allIds()) {
      const t = evoUniqueLines(id, fac, '해방').map((l) => l.text).join(' ');
      expect(t, `${id}/${fac}`).not.toMatch(/−\d{3,}(\.\d+)?%/);
      expect(t, `${id}/${fac}`).not.toMatch(/\+\d{3,}(\.\d+)?%p/);
    }
  });
  it('게파르도·토르투가 해방 문구 = 새 다 키운 값', () => {
    const rel = (id: string) => evoUniqueLines(id, 'hollow', '해방').find((l) => l.label === '해방')?.text ?? '';
    expect(rel('t4:thunder:mixed')).toBe('9초 · 간격 −40%(다 키우면 16초 · −60%)');
    expect(rel('t4:earth:mixed')).toBe('반사 200%(다 키우면 880%)');
  });
  it('패치 C.527 · BALANCE 162', () => {
    expect(BALANCE_VERSION).toBeGreaterThanOrEqual(162); // C.529: 163 (정확한 값은 c529 가 지킨다)
    expect(Number(PATCH_LABEL.slice(2))).toBeGreaterThanOrEqual(527);
  });
});
