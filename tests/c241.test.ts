// C.241 (GDD 164장): 평소 온천 = 약 20초에 체력 가득 (가득까지 배부름 총량 10 그대로) · 포션은 배부름을 쓰지 않는다 · 상점 하루 판매 수 = nowMs 기준
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { getFaction } from '../src/data/factions';
import { enterSpa, newNest, passNestTime } from '../src/engine/nest';
import { newSaveData } from '../src/game';
import { CONSUMABLE_IDS, HEAL_ITEM_IDS, useHealItemOnWalk, useInventoryItem } from '../src/inventory';
import { spaRateLines } from '../src/ui/spaView';
import { statusInfo } from '../src/ui/bha/statusInfo';

const H = getFaction('hollow');
const T0 = new Date(2026, 9, 31, 12, 0, 0).getTime();
const HH = BALANCE.provisional.nest.homeHp;

describe('164장 1: 평소 온천 약 20초', () => {
  it('수치: 체력·컨디션 0 → 가득 20초, 가득까지 배부름 총량 10 그대로 · 튜토리얼 온천 10초 그대로', () => {
    expect(HH.spa.hpPerSecond * 20).toBeCloseTo(1, 9);
    expect(HH.spa.conditionPerSecond * 20).toBeCloseTo(100, 9);
    expect(HH.spa.fullnessPerSecond * 20).toBeCloseTo(10, 9);
    expect(HH.tutorialSpa).toEqual({ hpPerSecond: 0.1, fullnessPerSecond: 1, conditionPerSecond: 10 });
  });
  it('0 → 10초에 절반, 20초에 가득 → 저절로 방으로', () => {
    const n = newNest(0);
    n.hpFraction = 0;
    n.condition = 0;
    n.hunger = 0;
    expect(enterSpa(n, 0)).toBeNull();
    passNestTime(n, 10 / 3600, false, 10_000);
    expect(n.spa).not.toBeNull();
    expect(n.hpFraction).toBeCloseTo(0.5, 6);
    const f = passNestTime(n, 10.5 / 3600, false, 20_500);
    expect(f.spaEnded?.reason).toBe('full');
    expect(n.hpFraction).toBeCloseTo(1, 6);
    expect(n.hunger).toBeGreaterThanOrEqual(10 - 1e-6); // 배부름 −10 (허기 +10)
  });
  it('문구: 온천 화면 = 1초 단위·약 20초, 컨디션 ⓘ = 1초에 +5 (옛 "1분에"·"5분" 없음)', () => {
    const lines = spaRateLines(HH.spa, '배부름');
    expect(lines[0]).toBe('1초에 체력 +5% · 컨디션 +5 · 배부름 −0.5');
    expect(lines[1]).toBe('체력 1% → 가득 약 20초');
    const cond = statusInfo('cond', H).groups.flatMap((g) => g.lines).join('\n');
    expect(cond).toMatch(/1초에 \+5/);
    expect(cond).not.toMatch(/5분/);
  });
});

describe('164장 3: 포션은 배부름을 쓰지 않는다', () => {
  it('회복 물건 4종(반창고·붕대·회복약·치료제) 걷기 중 사용 — 배부름 그대로', () => {
    expect(HEAL_ITEM_IDS.length).toBe(4);
    for (const id of HEAL_ITEM_IDS) {
      const s = newSaveData('hollow', T0);
      s.nest.hunger = 40;
      s.shared.items = { [id]: 1 };
      const exp = { hpFraction: 0.05 };
      expect(useHealItemOnWalk(s, exp, id).ok).toBe(true);
      expect(s.nest.hunger).toBe(40);
    }
  });
  it('구급상자 등 방에서 쓰는 소모품도 배부름 그대로', () => {
    for (const id of CONSUMABLE_IDS) {
      const s = newSaveData('hollow', T0);
      s.nest.hunger = 40;
      s.nest.hpFraction = 0.3;
      s.shared.items = { [id]: 1 };
      useInventoryItem(s, H, id);
      expect(s.nest.hunger).toBe(40);
    }
  });
});
