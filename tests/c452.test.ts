// C.452 (GDD v6.066 12-4, 사용자 2026-11-14): 아이젠 — 붕옥 블록 등장 = 허 블록과 똑같이(옛 ×0.5 삭제) ·
// 경화수월 등장 = 허 공식 확률로 따로 굴림(붕옥 먼저, 둘 다 안 걸리면 귀도, 옛 고정 10% 삭제) · 회피 뒤 3초 치명 +20%p·치명 피해 +30%.
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { getEnemy } from '../src/data/enemies';
import {
  applyInput, createCombat, drainCombatEvents, KIT_TRAIT_PREFIX, kitEvadeBuffOn, kitEvadeBuffSecondsLeft, liberationActive, spawnTableOf, step, ticksOf,
  type CombatParams, type CombatState,
} from '../src/engine/combat';
import { buildCombatParams } from '../src/engine/absorb/build';
import { applyEvolutionToParams } from '../src/engine/evolution';
import { testGrantTranscendent } from '../src/engine/testMode';
import { newSaveData } from '../src/game';
import { useImmediateHits } from './helpers/hitDelay';

useImmediateHits();

const K = BALANCE.provisional.transcendentKits.aizen!;
const normal = getEnemy('test-a');
const id = (b: string) => KIT_TRAIT_PREFIX + b;

function aizenParams(): Partial<CombatParams> {
  const s = newSaveData('hollow', 1000);
  expect(testGrantTranscendent(s, 'aizen', 2000)).toBe('added');
  const p: Partial<CombatParams> = { ...buildCombatParams(s.build, s.factionId) };
  applyEvolutionToParams(p, s.evolution, s.factionId, 0, false);
  return p;
}
const mk = (seed = 1): CombatState => {
  const s = createCombat(seed, { enemy: normal, params: aizenParams() });
  s.spawnTimer = 1e9;
  s.enemy.attackTimer = 1e9;
  s.enemy.actionTimer = 1e9;
  s.player.attackTimer = 1e9;
  s.params.timeLimitSeconds = 1e9;
  return s;
};
/** 허 확률 v 로 고정한 출현표 */
const tableAt = (s: CombatState, v: number, risk = 20) => spawnTableOf({ ...s.params, voidChance: v, voidChanceBonus: 0, voidChanceMax: 1 }, false, risk).entries;
const chanceOf = (entries: ReturnType<typeof tableAt>, b: string) => entries.find((e) => e.source?.id === id(b))?.chance ?? 0;

describe('수치·데이터', () => {
  it('붕옥 voidScale 1(먼저), 경화수월 = 허 공식 몫(다음)·고정 몫 없음, 회피 버프 3초·+20%p·+30%', () => {
    expect(K.blocks.hogyoku!.voidSlot).toEqual({ voidScale: 1, riskGain: 10, order: 0 });
    expect(K.blocks.kyoka!.voidSlot).toEqual({ voidScale: 1, order: 1 });
    expect(K.blocks.kyoka!.weight).toBe(0);
    expect(K.blocks.kyoka!.maxOnRail).toBe(2);
    expect(K.evadeBuff).toEqual({ seconds: 3, critChance: 0.2, critDamage: 0.3 });
    expect(mk().params.kit?.evadeBuff).toEqual(K.evadeBuff);
  });
});

describe('출현표 (허 공식으로 따로 굴림)', () => {
  it('붕옥 = v, 경화수월 = (1 − v) × v, 귀도 = 나머지 · 합 1 · 허 블록 없음', () => {
    const s = mk();
    for (const v of [0.02, 0.095, 0.215]) {
      const t = tableAt(s, v);
      expect(t.some((e) => e.kind === 'void')).toBe(false);
      expect(chanceOf(t, 'hogyoku')).toBeCloseTo(v, 12);
      expect(chanceOf(t, 'kyoka')).toBeCloseTo((1 - v) * v, 12);
      expect(chanceOf(t, 'kido')).toBeCloseTo((1 - v) * (1 - v), 12);
      expect(t.reduce((a, e) => a + e.chance, 0)).toBeCloseTo(1, 12);
    }
  });
  it('감응도 100: 붕옥 없음 → 경화수월 = v, 귀도 = 1 − v', () => {
    const s = mk();
    const t = tableAt(s, 0.095, 100);
    expect(chanceOf(t, 'hogyoku')).toBe(0);
    expect(chanceOf(t, 'kyoka')).toBeCloseTo(0.095, 12);
    expect(chanceOf(t, 'kido')).toBeCloseTo(0.905, 12);
  });
  it('융합 중: 경화수월·붕옥 굴림 없음 (귀도·프라고르만)', () => {
    const s = mk();
    const t = spawnTableOf({ ...s.params, voidChance: 0.2, voidChanceBonus: 0, voidChanceMax: 1 }, true, 50).entries;
    expect(t.map((e) => e.source?.id)).toEqual([id('kido'), id('fragor')]);
  });
  it('19초 전투 · 블록 1초에 1개 가정의 기대 개수 (허 2%·9.5%·21.5%) — 표 계산 = 실제 생성 표본', () => {
    const N = 19;
    const expected: Record<string, { hogyoku: number; kyoka: number }> = {};
    for (const v of [0.02, 0.095, 0.215]) {
      const s = mk(7);
      const t = tableAt(s, v);
      const hg = N * chanceOf(t, 'hogyoku');
      const ky = N * chanceOf(t, 'kyoka');
      expected[v] = { hogyoku: hg, kyoka: ky };
      // 엔진 표본: 블록 하나 생성할 때마다 바를 비워(레일 상한 영향 없이) 2000 전투 × 19 개
      const r = createCombat(11, { enemy: normal, params: { ...aizenParams(), voidChance: v, voidChanceBonus: 0, voidChanceMax: 1 } });
      r.enemy.attackTimer = r.enemy.actionTimer = r.player.attackTimer = 1e9;
      r.params.timeLimitSeconds = 1e9;
      let total = 0;
      const n = { hogyoku: 0, kyoka: 0 };
      for (let i = 0; total < 2000 * N && i < 5e7; i++) {
        r.kit!.risk = 20; // 붕옥으로 감응도가 차서 100 이 되지 않게
        step(r);
        for (const e of drainCombatEvents(r)) if (e.kind === 'spawn') {
          total++;
          const tid = r.tray[e.index]?.traitId;
          if (tid === id('hogyoku')) n.hogyoku++;
          if (tid === id('kyoka')) n.kyoka++;
        }
        r.tray = [];
      }
      expect(total).toBe(2000 * N);
      expect((n.hogyoku / total) * N).toBeCloseTo(hg, 1);
      expect((n.kyoka / total) * N).toBeCloseTo(ky, 1);
    }
    // 보고용 값 (붕옥 19v · 경화수월 19(1−v)v)
    expect(expected[0.02]!.hogyoku).toBeCloseTo(0.38, 6);
    expect(expected[0.02]!.kyoka).toBeCloseTo(0.3724, 6);
    expect(expected[0.095]!.hogyoku).toBeCloseTo(1.805, 6);
    expect(expected[0.095]!.kyoka).toBeCloseTo(1.633525, 6);
    expect(expected[0.215]!.hogyoku).toBeCloseTo(4.085, 6);
    expect(expected[0.215]!.kyoka).toBeCloseTo(3.206725, 6);
  });
});

describe('회피 뒤 치명 버프', () => {
  /** 적 공격이 곧 오는 전투 (회피 100%) */
  const evading = (): CombatState => {
    const s = mk();
    s.params.evadeChance = 1;
    s.player.hp = s.player.maxHp = 1e12;
    s.enemy.attackTimer = 0.01;
    return s;
  };
  const runUntilEvade = (s: CombatState): void => {
    for (let i = 0; i < 2000; i++) {
      step(s);
      if (drainCombatEvents(s).some((e) => e.kind === 'evade')) return;
    }
    throw new Error('회피가 없었다');
  };
  it('회피하면 3초 동안 켜지고, 3초 뒤 꺼진다', () => {
    const s = evading();
    expect(kitEvadeBuffOn(s)).toBe(false);
    runUntilEvade(s);
    s.enemy.attackTimer = 1e9;
    expect(kitEvadeBuffOn(s)).toBe(true);
    expect(kitEvadeBuffSecondsLeft(s)).toBeCloseTo(3, 6);
    expect(s.kit!.evadeBuffs).toBe(1);
    for (let i = 0; i < ticksOf(s.params, 3); i++) step(s);
    expect(kitEvadeBuffOn(s)).toBe(true); // 3초째 틱까지
    step(s);
    expect(kitEvadeBuffOn(s)).toBe(false);
  });
  it('다시 회피하면 3초를 새로 센다', () => {
    const s = evading();
    runUntilEvade(s);
    s.enemy.attackTimer = 1e9;
    for (let i = 0; i < ticksOf(s.params, 2); i++) step(s);
    expect(kitEvadeBuffSecondsLeft(s)).toBeCloseTo(1, 6);
    s.enemy.attackTimer = 0.01;
    runUntilEvade(s);
    expect(kitEvadeBuffSecondsLeft(s)).toBeCloseTo(3, 6);
    expect(s.kit!.evadeBuffs).toBe(2);
  });
  it('버프 중 치명 확률 +20%p · 치명 피해 배율 +0.3', () => {
    const s = mk(3);
    s.params.critChance = 0;
    s.params.critChanceMax = 1;
    s.enemy.hp = s.enemy.maxHp = 1e15;
    s.kit!.evadeBuffUntil = 1e12; // 버프 켠 채로
    s.player.attackTimer = 0;
    let atk = 0;
    let crit = 0;
    const dmg: { crit: number[]; plain: number[] } = { crit: [], plain: [] };
    for (let i = 0; i < 200000 && atk < 3000; i++) {
      step(s);
      for (const e of drainCombatEvents(s)) if (e.kind === 'player-attack' && e.damage > 0) {
        atk++;
        if (e.crit) { crit++; dmg.crit.push(e.damage); } else dmg.plain.push(e.damage);
      }
    }
    expect(atk).toBe(3000);
    expect(crit / atk).toBeGreaterThan(0.17);
    expect(crit / atk).toBeLessThan(0.23);
    const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
    expect(avg(dmg.crit) / avg(dmg.plain)).toBeCloseTo(s.params.critMultiplier + 0.3, 1);
    // 버프 없으면 치명 0
    s.kit!.evadeBuffUntil = -1;
    const c0 = s.crits ?? 0;
    for (let i = 0; i < 20000; i++) { step(s); drainCombatEvents(s); }
    expect(s.crits ?? 0).toBe(c0);
  });
  it('융합 중엔 회피가 없어 버프가 안 붙는다', () => {
    const s = evading();
    s.kit!.risk = 60;
    expect(applyInput(s, { type: 'liberate' })).toBe(true);
    expect(liberationActive(s)).toBe(true);
    for (let i = 0; i < 3000; i++) step(s);
    expect(drainCombatEvents(s).some((e) => e.kind === 'evade')).toBe(false);
    expect(s.kit!.evadeBuffs).toBe(0);
    expect(kitEvadeBuffOn(s)).toBe(false);
  });
});
