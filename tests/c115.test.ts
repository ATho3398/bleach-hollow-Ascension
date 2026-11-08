// C.115 (S-23, GDD 59): 초반(1·2단계) 노력치 상한 15% → 약 8% (A안 10% 에서 3회 조정: 30·37 → 24·32), 3~5단계·능력치 1개 50% 유지. 세이브 형식 변경 없음
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { getFaction } from '../src/data/factions';
import { STAT_IDS } from '../src/data/schema';
import { addEv, currentStats, evCaps, evTotal, newEvolution } from '../src/engine/evolution';

const SX = BALANCE.provisional.stats;

describe('C.115 초반 노력치 상한 (GDD 59 → 182장 3 → 202장)', () => {
  it('상한 = [56, 108, 168, 240] (GDD 202장), 단계마다 오른다', () => {
    expect(SX.evCapTotal).toEqual([56, 108, 168, 240]); // GDD 202장 (C.334): 각 단계 상한까지 '둘 다' 약 15번·'스탯만' 약 8번. 옛 [36, 44, 70, 88] = C.280 (182장 3)
    SX.evCapTotal.forEach((cap, i) => {
      const ratio = cap / SX.tierTotals[i]!;
      // 202장: 단계 합계 대비 약 19 / 29 / 36 / 41% (흡수 횟수 기준으로 잡아 비율은 결과값)
      expect(ratio).toBeGreaterThan(0.18);
      expect(ratio).toBeLessThan(0.42);
      if (i > 0) expect(ratio).toBeGreaterThan(SX.evCapTotal[i - 1]! / SX.tierTotals[i - 1]!);
    });
    // 단계가 오를수록 상한도 오른다(진화하면 상한만 오르고 노력치는 유지)
    for (let i = 1; i < SX.evCapTotal.length; i++) expect(SX.evCapTotal[i]!).toBeGreaterThan(SX.evCapTotal[i - 1]!);
  });
  it('능력치 1개 상한 60% (GDD 202장 2): 1단계 33, 2단계 64, 3단계 100', () => {
    expect(SX.evCapPerStatRatio).toBe(0.6);
    expect(evCaps(0)).toEqual({ total: 56, perStat: 33 });
    expect(evCaps(1)).toEqual({ total: 108, perStat: 64 });
    expect(evCaps(2)).toEqual({ total: 168, perStat: 100 });
  });
  it('1단계 새 몸: 한 능력치 33 에서 멈추고 합계 56 에서 멈춘다', () => {
    const e = newEvolution();
    expect(addEv(e, { atk: 99 })).toEqual({ atk: 33 });
    expect(addEv(e, { hp: 99, spd: 99 })).toEqual({ hp: 23 });
    expect(addEv(e, { spd: 1 })).toEqual({});
    expect(evTotal(e.ev)).toBe(56);
  });
  it('2단계: 합계 108 — 1단계에서 채운 56 위에 52 만 더 들어간다', () => {
    const e = newEvolution();
    addEv(e, { atk: 33, hp: 23 });
    e.tierIndex = 1;
    expect(addEv(e, { spd: 99 })).toEqual({ spd: 52 });
    expect(evTotal(e.ev)).toBe(108);
    e.tierIndex = 2; // 3단계 168 (능력치 1개 100)
    expect(addEv(e, { spr: 99 })).toEqual({ spr: 60 });
    expect(addEv(e, { def: 99 })).toEqual({});
    expect(evTotal(e.ev)).toBe(168);
  });
  it('이미 상한을 넘긴 1단계 세이브(옛 규칙·계승 등): 더 오르지 않지만 깎지도 않는다 — currentStats 는 노력치를 상한으로 자르지 않는다(마이그레이션 없음)', () => {
    const e = newEvolution();
    e.ev.atk = 30;
    e.ev.hp = 30;
    e.ev.spd = 1;
    expect(evTotal(e.ev)).toBe(61);
    expect(addEv(e, { atk: 5, spd: 5, def: 5 })).toEqual({});
    const base = getFaction('hollow').baseStats;
    const cur = currentStats(e, 'hollow');
    expect(cur.atk).toBe(base.atk + 30);
    expect(cur.hp).toBe(base.hp + 30);
    expect(STAT_IDS.reduce((a, s) => a + cur[s] - base[s], 0)).toBe(61);
  });
});
