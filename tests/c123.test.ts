// C.123 (GDD 62장 후속): C.118 뒤 목표 미달 맞추기 — 보스 sand-maw 공격 ↑ · ★2 강적 입문 보정 · 탑 ★2 강적 층 상쇄. 체인 보상 수치는 그대로(66장)
import { describe, expect, it } from 'vitest';
import { BALANCE, BALANCE_VERSION } from '../src/config/balance';
import { getBoss } from '../src/data/bosses';
import { difficultyEnemyScale } from '../src/engine/difficulty';
import { towerFloor, towerFloorMultiplier } from '../src/engine/tower';

const DX = BALANCE.provisional.difficulty;
const TX = BALANCE.provisional.tower;

describe('C.123 C.118 뒤 밸런스 목표 맞추기', () => {
  it('BALANCE_VERSION 60 이상', () => {
    expect(BALANCE_VERSION).toBeGreaterThanOrEqual(60);
  });

  it('★2 보스 sand-maw 공격 0.37 (체력 150 그대로)', () => {
    const e = getBoss('sand-maw').enemy;
    expect(e.attackInAttacks).toBe(0.37);
    expect(e.hpInAttacks).toBe(150);
  });

  it('★2 강적만 입문 보정 ×0.9, 일반 적과 ★3 강적은 1', () => {
    expect(DX.eliteEase[2]).toEqual({ hp: 0.9, attack: 0.9 });
    const elite = difficultyEnemyScale(2, 'elite');
    const normal = difficultyEnemyScale(2, 'normal');
    expect(elite.hp).toBeCloseTo(normal.hp * 0.9);
    expect(elite.attack).toBeCloseTo(normal.attack * 0.9);
    expect(DX.eliteEase[3]).toBeUndefined();
  });

  it('탑 ★2 강적 층(15층)은 입문 보정을 상쇄해 실제 적 배율이 C.122 와 같다', () => {
    expect(TX.eliteScaleByBand[2]! * DX.eliteEase[2]!.hp).toBeCloseTo(1);
    const f = towerFloor(15);
    expect(f.floorMult).toBeCloseTo(towerFloorMultiplier(15));
    const net = f.floorMult * difficultyEnemyScale(2, 'elite').hp;
    expect(net).toBeCloseTo((1 + 4 * TX.perFloorByBand[2]!) * TX.eliteScale * difficultyEnemyScale(2, 'normal').hp);
    // 다른 구간 강적 층은 그대로
    expect(towerFloorMultiplier(25)).toBeCloseTo((1 + 4 * TX.perFloorInBand) * TX.eliteScale);
  });

  it('체인 보상 수치는 C.118 그대로 (66장 사용자: 수정하지 말 것)', () => {
    expect(BALANCE.provisional.combat.chainMultipliers).toEqual([1, 2.2, 3.6]);
    expect(BALANCE.provisional.combat.chainBonusFromChain).toBe(3);
  });
});
