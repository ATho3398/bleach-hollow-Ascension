// C.555 (GDD 4-5 v6.232, 사용자 2026-11-27 정정 "먹이 상한이 모험당갯수 말하는거지? 상한이 아니라, 확률을 그정도로 맞추란거엿어"):
// C.550 의 바퀴당 1개 상한·바퀴 굴림 공유·첫 먹이 뒤 건너뛰기를 걷어내고 옛 출처별 독립 굴림으로 되돌린 뒤, 출처별 먹이 확률 전체에
// 배율 하나(provisional expedition.foodRate)를 곱해 권장 ★·2바퀴 기준 바퀴당 평균 약 0.5개(대부분 0~1, 가끔 2). 강적 '확정'도 확률로.
// 보스 확정 희귀 먹이·원정 상인·우라하라·상점·대기 보상·막힘 방지 간식은 밖.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BALANCE, BALANCE_VERSION } from '../src/config/balance';
import { createExpedition, playExpedition, type ExpeditionState } from '../src/engine/expedition';
import { makeEvent } from '../src/engine/expedition/variants';
import type { CombatState } from '../src/engine/combat';
import { emptyFoodStock, foodRate, rollBattleFood, rollCount, settleFood } from '../src/engine/food';
import { createRng } from '../src/engine/rng';
import { newSaveData, referenceTileStock, sanitizeDeck } from '../src/game';

const PX = BALANCE.provisional.expedition;
const F = BALANCE.provisional.food;
const autoWin = (s: CombatState) => {
  s.enemy.hp = 0;
  s.status = 'won';
  s.finisher = { kind: 'basic-attack', traitId: null, element: null };
};
/** 그 바퀴 모험 먹이 수 (원정 상인에서 산 것 빼고) */
const lapFood = (e: ExpeditionState, lap: number) =>
  e.foodLoot.filter((a) => a.lap === lap).length - e.variantLog.events.filter((v) => v.lap === lap && v.choice.startsWith('buy:food:')).length;

describe('C.555 모험 먹이 = 확률로 바퀴당 평균 약 0.5개 (GDD 4-5 v6.232)', () => {
  it('balance: foodRate 0.15 (옛 C.550 foodPerLap 삭제), BALANCE_VERSION 173 이상', () => {
    expect(PX.foodRate).toBe(0.15);
    expect('foodPerLap' in PX).toBe(false);
    expect(BALANCE_VERSION).toBeGreaterThanOrEqual(173);
    expect(foodRate()).toBe(0.15);
  });

  it('배율 1 이면 옛 굴림 그대로(같은 난수 흐름), 배율 < 1 이면 강적 확정 1개도 확률', () => {
    for (let s = 1; s <= 50; s++) {
      expect(rollBattleFood(createRng(s), true, F, 1)).toEqual(rollBattleFood(createRng(s), true, F));
      expect(rollBattleFood(createRng(s), false, F, 1)).toEqual(rollBattleFood(createRng(s), false, F));
    }
    let eliteZero = 0;
    let elite = 0;
    let normal = 0;
    const rng = createRng(7);
    for (let i = 0; i < 20000; i++) {
      const a = rollBattleFood(rng, true, F, 0.15);
      if (a.length === 0) eliteZero++;
      elite += a.length;
      normal += rollBattleFood(rng, false, F, 0.15).length;
    }
    expect(eliteZero).toBeGreaterThan(15000); // 확정이 아님
    expect(elite / 20000).toBeCloseTo((1 + F.eliteExtraChance) * 0.15, 1); // 기대 = (1 + 0.3) × 배율
    expect(normal / 20000).toBeCloseTo(F.normalDropChance * 0.15, 1);
  });

  it('휴식 간식 = restSnack × 배율(소수는 확률), 보물 먹이 몫 = foodChance × 배율', () => {
    const rng = createRng(3);
    let n = 0;
    for (let i = 0; i < 20000; i++) n += rollCount(rng, F.restSnack * foodRate());
    expect(n / 20000).toBeCloseTo(F.restSnack * 0.15, 1);
    const s = newSaveData('hollow', 1000);
    let food = 0;
    const vr = createRng(11);
    for (let i = 0; i < 4000; i++) if (makeEvent(vr, 'event-treasure', 3, { factionId: 'hollow', deck: [], build: s.build }).treasure?.food) food++;
    expect(food / 4000).toBeCloseTo(BALANCE.provisional.tileVariants.events.treasure.foodChance * 0.15, 1);
  });

  it('분포(권장 ★1~4 × 두 종족 × 200판, 2바퀴, 전투 승리 처리·타일 변수 켬): 평균 ≈ 0.5개/바퀴, 대부분 0~1, 가끔 2 이상, 상한 없음, 특식 섞임', () => {
    let all = 0;
    let laps = 0;
    let twoPlus = 0;
    let special = 0;
    const lines: string[] = [];
    for (const fid of ['hollow', 'shinigami']) {
      const deck = sanitizeDeck(referenceTileStock(), fid);
      for (const star of [1, 2, 3, 4]) {
        let food = 0;
        let n = 0;
        for (let seed = 1; seed <= 200; seed++) {
          const e = playExpedition(createExpedition({ factionId: fid, seed, hunger: 0, condition: 100, deck, tileVariants: true, difficulty: star }), { returnAfterLap: 2, playBattle: autoWin });
          for (const lap of [1, 2]) {
            const c = lapFood(e, lap);
            food += c;
            n++;
            if (c >= 2) twoPlus++;
            special += e.foodLoot.filter((a) => a.lap === lap && !(a.food in F.normalTable) && a.food !== 'snack').length;
          }
        }
        all += food;
        laps += n;
        lines.push(`${fid} ★${star} ${(food / n).toFixed(3)}`);
      }
    }
    console.log(`C.555 바퀴당 먹이: ${lines.join(' · ')} · 전체 ${(all / laps).toFixed(3)} · 2개 이상 ${(twoPlus / laps * 100).toFixed(1)}% · 특식 ${(special / laps).toFixed(3)}/바퀴`);
    expect(all / laps).toBeGreaterThan(0.4);
    expect(all / laps).toBeLessThan(0.6);
    expect(twoPlus).toBeGreaterThan(0); // 상한 없음 — 가끔 2개
    expect(twoPlus / laps).toBeLessThan(0.15); // 대부분 0~1
    expect(special).toBeGreaterThan(0); // 강적·보물 특식 몫 그대로
  });

  it('보스 확정 희귀 먹이·막힘 방지 간식은 배율 밖 (c58 옛 기대값 그대로)', () => {
    const src = readFileSync('src/engine/expedition/expedition.ts', 'utf8');
    expect(src).toMatch(/exp\.foodLoot\.push\(\{ food: BX\.reward\.food as FoodId, lap: exp\.lap \}\);/);
    expect(src).not.toMatch(/lapFood(Taken|Open|Roll)|foodPerLap/);
    expect(settleFood(emptyFoodStock(), []).fallback).toBe(F.fallbackSnack);
    const c58 = readFileSync('tests/c58.test.ts', 'utf8');
    expect(c58).toMatch(/expect\(e\.foodLoot\.at\(-1\)!\.food\)\.toBe\(BX\.reward\.food\);/);
  });

  it('엔진에 종족 분기 없음, 기획서 4-5 줄', () => {
    const src = readFileSync('src/engine/expedition/expedition.ts', 'utf8') + readFileSync('src/engine/food.ts', 'utf8') + readFileSync('src/engine/expedition/variants.ts', 'utf8');
    expect(src).not.toMatch(/faction(Id)? === '(hollow|shinigami)'/);
    const gdd = readFileSync('docs/GDD.md', 'utf8');
    expect(gdd).toMatch(/바퀴당 평균 약 0\.5개/);
    expect(gdd).toMatch(/expedition\.foodRate/);
  });
});
