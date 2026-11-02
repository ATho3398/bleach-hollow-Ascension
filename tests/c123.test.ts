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

  it('★2 보스 sand-maw 공격 0.37 → C.127 0.35 → C.132 0.37 → C.134 0.35 (체력 150 그대로)', () => {
    const e = getBoss('sand-maw').enemy;
    expect(e.attackInAttacks).toBe(0.38); // C.177: 강공격 20%·막기 0.5초(GDD 105장 수정)로 보스전 ★2 92% → 0.38. C.174: 막기·회복 버튼(GDD 105장) 뒤 보스 자유 원정 outskirts 패배율 +5.1~6.7%p → 0.32. C.132: 기본 몫 ×0.75 로 보스전 ★2 65 → 72% → 0.37 66%. C.134: 저장 필살기(25회분) 삭제로 보스전 ★2 61 → 51% → 0.35
    expect(e.hpInAttacks).toBe(150);
  });

  it('★2 강적 입문 보정 ×0.9 → C.127 ×1 (혈·독·허 적이 ★1~2 길에서 빠져 되돌림), ★3 강적은 1', () => {
    expect(DX.eliteEase[2]).toEqual({ hp: 0.9, attack: 0.9 }); // C.177 (GDD 107장 원정 체력 이어 가기): 1 → 0.9
    const elite = difficultyEnemyScale(2, 'elite');
    const normal = difficultyEnemyScale(2, 'normal');
    expect(elite.hp).toBeCloseTo(normal.hp * 0.9);
    expect(elite.attack).toBeCloseTo(normal.attack * 0.9);
    expect(DX.eliteEase[3]).toBeUndefined();
  });

  it('탑 ★2 강적 층(15층)은 입문 보정을 상쇄한 배율에 ×1.08 을 곱한다 (C.195)', () => {
    // C.136 A안: 원정 강적 공격 ×1.42 를 탑 15층에서 조금 덜어냄 (상쇄 1 → 0.92). C.195 (GDD 121장 11): 첫 강공격이 막기 게이지 뒤로 미뤄져 15층 강적 83 → 100% → ×1.08 (79%)
    expect(TX.eliteScaleByBand[2]! * DX.eliteEase[2]!.hp).toBeCloseTo(1.08);
    const f = towerFloor(15);
    expect(f.floorMult).toBeCloseTo(towerFloorMultiplier(15));
    const net = f.floorMult * difficultyEnemyScale(2, 'elite').hp;
    expect(net).toBeCloseTo((1 + 4 * TX.perFloorByBand[2]!) * TX.eliteScale * 1.08 * difficultyEnemyScale(2, 'normal').hp);
    // 다른 구간 강적 층은 그대로
    // C.174: ★3 구간도 ×0.9 (막기 버튼이 연속 강공격 세 타를 다 못 막아 25층 강적 29~37%)
    expect(towerFloorMultiplier(25)).toBeCloseTo((1 + 4 * TX.perFloorInBand) * TX.eliteScale * TX.eliteScaleByBand[3]!);
  });

  it('체인 보상 수치는 C.118 그대로 (66장 사용자: 수정하지 말 것)', () => {
    expect(BALANCE.provisional.combat.chainMultipliers).toEqual([1, 2.2, 3.6]);
    expect(BALANCE.provisional.combat.chainBonusFromChain).toBe(3);
  });
});
