// C.115 (S-23, GDD 59): 초반(1·2단계) 노력치 상한 15% → 약 8% (A안 10% 에서 3회 조정: 30·37 → 24·32), 3~5단계·능력치 1개 50% 유지. 세이브 형식 변경 없음
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { getFaction } from '../src/data/factions';
import { STAT_IDS } from '../src/data/schema';
import { addEv, currentStats, evCaps, evTotal, newEvolution } from '../src/engine/evolution';

const SX = BALANCE.provisional.stats;

describe('C.115 초반 노력치 상한 약 8% (GDD 59, A안 조정)', () => {
  it('상한 = 1·2단계 합계의 약 8%(24·32), 3~5단계는 15%(70·88·110) 유지', () => {
    expect(SX.evCapTotal).toEqual([24, 32, 70, 88]); // C.220: 4단계 (마지막 110 삭제)
    SX.evCapTotal.forEach((cap, i) => {
      const ratio = cap / SX.tierTotals[i]!;
      if (i < 2) {
        expect(ratio).toBeGreaterThan(0.07);
        expect(ratio).toBeLessThan(0.09);
      } else {
        expect(ratio).toBeGreaterThan(0.14);
        expect(ratio).toBeLessThan(0.16);
      }
    });
    // 단계가 오를수록 상한도 오른다(진화하면 상한만 오르고 노력치는 유지)
    for (let i = 1; i < SX.evCapTotal.length; i++) expect(SX.evCapTotal[i]!).toBeGreaterThan(SX.evCapTotal[i - 1]!);
  });
  it('능력치 1개 상한 50% 유지: 1단계 12, 2단계 16', () => {
    expect(SX.evCapPerStatRatio).toBe(0.5);
    expect(evCaps(0)).toEqual({ total: 24, perStat: 12 });
    expect(evCaps(1)).toEqual({ total: 32, perStat: 16 });
    expect(evCaps(2)).toEqual({ total: 70, perStat: 35 });
  });
  it('1단계 새 몸: 한 능력치 12 에서 멈추고 합계 24 에서 멈춘다', () => {
    const e = newEvolution();
    expect(addEv(e, { atk: 99 })).toEqual({ atk: 12 });
    expect(addEv(e, { hp: 99, spd: 99 })).toEqual({ hp: 12 });
    expect(addEv(e, { spd: 1 })).toEqual({});
    expect(evTotal(e.ev)).toBe(24);
  });
  it('2단계: 합계 32 — 1단계에서 채운 24 위에 8 만 더 들어간다', () => {
    const e = newEvolution();
    addEv(e, { atk: 12, hp: 12 });
    e.tierIndex = 1;
    expect(addEv(e, { spd: 99 })).toEqual({ spd: 8 });
    expect(evTotal(e.ev)).toBe(32);
    e.tierIndex = 2; // 3단계부터는 옛 상한 그대로 70 (능력치 1개 35)
    expect(addEv(e, { spr: 99 })).toEqual({ spr: 35 });
    expect(addEv(e, { def: 99 })).toEqual({ def: 3 });
    expect(evTotal(e.ev)).toBe(70);
  });
  it('이미 옛 상한(45)을 채운 1단계 세이브: 더 오르지 않지만 깎지도 않는다 — currentStats 는 노력치를 상한으로 자르지 않는다(마이그레이션 없음)', () => {
    const e = newEvolution();
    e.ev.atk = 22;
    e.ev.hp = 22;
    e.ev.spd = 1;
    expect(evTotal(e.ev)).toBe(45);
    expect(addEv(e, { atk: 5, spd: 5, def: 5 })).toEqual({});
    const base = getFaction('hollow').baseStats;
    const cur = currentStats(e, 'hollow');
    expect(cur.atk).toBe(base.atk + 22);
    expect(cur.hp).toBe(base.hp + 22);
    expect(STAT_IDS.reduce((a, s) => a + cur[s] - base[s], 0)).toBe(45);
  });
});
