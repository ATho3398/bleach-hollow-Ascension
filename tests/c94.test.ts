// C.94 (GDD 41장 2번): 탑 구간별 층당 +%·보스 층 배율 (perFloorByBand·bossScaleByBand)
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { towerFloor, towerFloorMultiplier, towerStar } from '../src/engine/tower';
import { getBoss } from '../src/data/bosses';
import { difficultyEnemyScale } from '../src/engine/difficulty';

const TX = BALANCE.provisional.tower;

describe('C.94 탑 구간별 배율', () => {
  it('★2 구간(11~20층)은 구간별 층당 +% 를 쓰고 다른 구간은 perFloorInBand 그대로', () => {
    expect(TX.perFloorByBand[2]).toBe(0.02);
    expect(towerStar(15)).toBe(2);
    expect(towerFloorMultiplier(11)).toBeCloseTo(1);
    expect(towerFloorMultiplier(13)).toBeCloseTo(1 + 2 * 0.02);
    expect(towerFloorMultiplier(15)).toBeCloseTo((1 + 4 * 0.02) * TX.eliteScale * TX.eliteScaleByBand[2]!); // C.123: ★2 강적 층 배율
    // ★3 구간은 기본 +4%
    expect(towerFloorMultiplier(23)).toBeCloseTo(1 + 2 * TX.perFloorInBand);
    expect(towerFloorMultiplier(25)).toBeCloseTo((1 + 4 * TX.perFloorInBand) * TX.eliteScale * TX.eliteScaleByBand[3]!); // C.174: ★3 강적 층 ×0.9
  });

  it('★2·★3 구간 보스 층(20·30층)만 보스 층 배율을 곱하고 40층은 1 (C.136: ★3 0.65 → C.176 0.72)', () => {
    expect(TX.bossScaleByBand[2]).toBe(0.72);
    expect(TX.bossScaleByBand[3]).toBe(0.72);
    expect(towerFloorMultiplier(20)).toBeCloseTo((1 + 9 * 0.02) * 0.72);
    expect(towerFloorMultiplier(30)).toBeCloseTo((1 + 9 * TX.perFloorInBand) * 0.72);
    expect(towerFloorMultiplier(40)).toBeCloseTo(1 + 9 * TX.perFloorInBand);
    // 보스 층 배율은 보통·강적 층에는 붙지 않는다
    expect(towerFloorMultiplier(19)).toBeCloseTo(1 + 8 * 0.02);
  });

  it('20층 적(canyon-king)의 체력·공격에 ★2 배율 × 층 배율이 실린다', () => {
    const f = towerFloor(20);
    expect(f.bossId).toBe('canyon-king');
    const k = difficultyEnemyScale(2, 'normal');
    const base = getBoss('canyon-king').enemy;
    expect(f.floorMult).toBeCloseTo(1.18 * 0.72);
    expect(f.enemy.hpInAttacks).toBeCloseTo(base.hpInAttacks * k.hp * f.floorMult);
    expect(f.enemy.attackInAttacks).toBeCloseTo(base.attackInAttacks * k.attack * f.floorMult);
  });

  it('구간 값이 없으면 기본값으로 돌아간다 (설정 비우기)', () => {
    const savedP = TX.perFloorByBand[2];
    const savedB = TX.bossScaleByBand[2];
    delete TX.perFloorByBand[2];
    delete TX.bossScaleByBand[2];
    try {
      expect(towerFloorMultiplier(15)).toBeCloseTo((1 + 4 * TX.perFloorInBand) * TX.eliteScale * TX.eliteScaleByBand[2]!);
      expect(towerFloorMultiplier(20)).toBeCloseTo(1 + 9 * TX.perFloorInBand);
    } finally {
      TX.perFloorByBand[2] = savedP!;
      TX.bossScaleByBand[2] = savedB!;
    }
  });
});
