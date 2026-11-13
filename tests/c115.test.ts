// C.115 (S-23, GDD 59): 초반(1·2단계) 노력치 상한 15% → 약 8% (A안 10% 에서 3회 조정: 30·37 → 24·32), 3~5단계·능력치 1개 50% 유지. 세이브 형식 변경 없음
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { getFaction } from '../src/data/factions';
import { STAT_IDS } from '../src/data/schema';
import { addEv, currentStats, evCaps, evTotal, newEvolution } from '../src/engine/evolution';

const SX = BALANCE.provisional.stats;

describe('C.115 초반 노력치 상한 (GDD 59 → 182장 3 → 202장 → 207장)', () => {
  it('상한 = [96, 204, 324, 472] (GDD 207장), 단계마다 오른다', () => {
    expect(SX.evCapTotal).toEqual([96, 204, 324, 472]); // GDD 207장 (C.342): 각 단계 상한까지 '둘 다' 약 30번·'스탯만' 약 16번. 202장 [56, 108, 168, 240] = 15·8번. 옛 [36, 44, 70, 88] = C.280 (182장 3)
    SX.evCapTotal.forEach((cap, i) => {
      const ratio = cap / ((SX.tierTotals[i]! * 6) / 7); // C.446: 비율은 옛 6종 합계 기준(합계 × 7/6 이 되며 기준 능력치는 그대로)
      // 207장: 단계 합계 대비 약 32 / 54 / 69 / 81% (흡수 횟수 기준으로 잡아 비율은 결과값. 202장은 19 / 29 / 36 / 41%)
      expect(ratio).toBeGreaterThan(0.3);
      expect(ratio).toBeLessThan(0.82);
      if (i > 0) expect(ratio).toBeGreaterThan(SX.evCapTotal[i - 1]! / SX.tierTotals[i - 1]!);
    });
    // 단계가 오를수록 상한도 오른다(진화하면 상한만 오르고 노력치는 유지)
    for (let i = 1; i < SX.evCapTotal.length; i++) expect(SX.evCapTotal[i]!).toBeGreaterThan(SX.evCapTotal[i - 1]!);
  });
  it('능력치 1개 상한 70% (GDD 207장, 202장 2 는 60%): 1단계 67, 2단계 142, 3단계 226', () => {
    expect(SX.evCapPerStatRatio).toBe(0.7);
    expect(evCaps(0)).toEqual({ total: 96, perStat: 67 });
    expect(evCaps(1)).toEqual({ total: 204, perStat: 142 });
    expect(evCaps(2)).toEqual({ total: 324, perStat: 226 });
  });
  it('1단계 새 몸: 한 능력치 67 에서 멈추고 합계 96 에서 멈춘다', () => {
    const e = newEvolution();
    expect(addEv(e, { atk: 99 })).toEqual({ atk: 67 });
    expect(addEv(e, { hp: 99, aspd: 99 })).toEqual({ hp: 29 });
    expect(addEv(e, { aspd: 1 })).toEqual({});
    expect(evTotal(e.ev)).toBe(96);
  });
  it('2단계: 합계 204 — 1단계에서 채운 96 위에 108 만 더 들어간다', () => {
    const e = newEvolution();
    addEv(e, { atk: 67, hp: 29 });
    e.tierIndex = 1;
    expect(addEv(e, { aspd: 99 })).toEqual({ aspd: 99 });
    expect(addEv(e, { aspd: 99 })).toEqual({ aspd: 9 });
    expect(evTotal(e.ev)).toBe(204);
    e.tierIndex = 2; // 3단계 324 (능력치 1개 226)
    expect(addEv(e, { spr: 99 })).toEqual({ spr: 99 });
    expect(addEv(e, { spr: 99 })).toEqual({ spr: 21 });
    expect(addEv(e, { def: 99 })).toEqual({});
    expect(evTotal(e.ev)).toBe(324);
  });
  it('이미 상한을 넘긴 1단계 세이브(옛 규칙·계승 등): 더 오르지 않지만 깎지도 않는다 — currentStats 는 노력치를 상한으로 자르지 않는다(마이그레이션 없음)', () => {
    const e = newEvolution();
    e.ev.atk = 50;
    e.ev.hp = 50;
    e.ev.aspd = 1;
    expect(evTotal(e.ev)).toBe(101); // 1단계 상한 96 넘김
    expect(addEv(e, { atk: 5, aspd: 5, def: 5 })).toEqual({});
    const base = getFaction('hollow').baseStats;
    const cur = currentStats(e, 'hollow');
    expect(cur.atk).toBe(base.atk + 50);
    expect(cur.hp).toBe(base.hp + 50);
    expect(STAT_IDS.reduce((a, s) => a + cur[s] - base[s], 0)).toBe(101);
  });
});
