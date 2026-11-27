// C.550 (GDD 4-5 v6.225, 사용자 2026-11-27 "모험 1바퀴에 음식0~1개정도 뜨게하고"):
// 한 바퀴 동안 전투·보물·휴식 타일·보스 등 모든 모험 출처를 합쳐 먹이 최대 1개, 바퀴에 먹이가 나올 확률 ≈ provisional expedition.foodPerLap(0.5).
// 난이도·이어하기 배율은 확률에만 곱하고 1개 상한 그대로. 원정 상인(구매)·우라하라·상점·대기 보상·막힘 방지 간식은 규칙 밖.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BALANCE, BALANCE_VERSION } from '../src/config/balance';
import {
  advance, chooseContinue, chooseRelease, createExpedition, finishBattle, finishRest, lapFoodTaken, playExpedition, resolveEvent, startBattle, type ExpeditionState,
} from '../src/engine/expedition';
import type { CombatState } from '../src/engine/combat';
import { lapFoodChance, lapFoodRoll, pickBattleFood, settleFood, emptyFoodStock } from '../src/engine/food';
import { createRng } from '../src/engine/rng';
import { referenceTileStock, sanitizeDeck } from '../src/game';

const PX = BALANCE.provisional.expedition;
const TV = BALANCE.provisional.tileVariants;

const autoWin = (s: CombatState) => {
  s.enemy.hp = 0;
  s.status = 'won';
  s.finisher = { kind: 'basic-attack', traitId: null, element: null };
};

/** 바퀴마다 모험 출처 먹이 수 (원정 상인에서 산 것은 뺀다) */
function perLap(e: ExpeditionState): number[] {
  const out: number[] = [];
  for (let lap = 1; lap <= e.lap; lap++) {
    const got = e.foodLoot.filter((a) => a.lap === lap).length;
    const bought = e.variantLog.events.filter((v) => v.lap === lap && v.event === 'merchant' && v.choice.startsWith('buy:food:')).length;
    out.push(got - bought);
  }
  return out;
}

/** 자동 원정 N판 (타일 배치·이벤트 포함, 전투는 이긴 것으로) → 바퀴 번호별 [0개, 1개, 그 이상] */
function survey(n: number, extra: Partial<Parameters<typeof createExpedition>[0]> = {}, laps = 4) {
  const deck = sanitizeDeck(referenceTileStock(), 'hollow');
  const byLap: { zero: number; one: number; more: number }[] = Array.from({ length: laps }, () => ({ zero: 0, one: 0, more: 0 }));
  for (let seed = 1; seed <= n; seed++) {
    const e = playExpedition(createExpedition({ factionId: 'hollow', seed, hunger: 0, condition: 100, deck, tileVariants: true, ...extra }), { returnAfterLap: laps, playBattle: autoWin });
    // 마지막 바퀴는 귀환으로 끝난 원정만 센다(진 원정은 그 바퀴 전리품을 잃음)
    perLap(e).forEach((c, i) => {
      if (i >= laps) return;
      const row = byLap[i]!;
      if (c === 0) row.zero++;
      else if (c === 1) row.one++;
      else row.more++;
    });
  }
  return byLap;
}

describe('C.550 모험 먹이 = 바퀴당 0~1개 (GDD 4-5 v6.225)', () => {
  it('balance: provisional expedition.foodPerLap = 0.5, BALANCE_VERSION 171 이상', () => {
    expect(PX.foodPerLap).toBe(0.5);
    expect(BALANCE_VERSION).toBeGreaterThanOrEqual(171); // C.552: 172 로 올라가 '이상'으로
    const src = readFileSync('src/config/balance.ts', 'utf8');
    expect(src).toMatch(/foodPerLap: 0\.5/);
  });

  it('바퀴 굴림은 원정 시드·바퀴로 재현 가능하고 0~1 고르게 퍼진다', () => {
    expect(lapFoodRoll(7, 1)).toBe(lapFoodRoll(7, 1));
    expect(lapFoodRoll(7, 1)).not.toBe(lapFoodRoll(7, 2));
    let below = 0;
    for (let s = 1; s <= 4000; s++) if (lapFoodRoll(s, 1) < 0.5) below++;
    expect(below / 4000).toBeGreaterThan(0.47);
    expect(below / 4000).toBeLessThan(0.53);
  });

  it('출처 확률 = foodPerLap × 배율 + 더하기, 0~1 로 자름 (배율은 확률에만)', () => {
    expect(lapFoodChance()).toBe(0.5);
    expect(lapFoodChance(1.2)).toBeCloseTo(0.6);
    expect(lapFoodChance(0.5)).toBeCloseTo(0.25); // 빈사 보상 절반
    expect(lapFoodChance(1, 0.1)).toBeCloseTo(0.6);
    expect(lapFoodChance(5)).toBe(1); // 아무리 커도 확률 1 = 바퀴에 1개
  });

  it('품목은 기존 출처별 표 (일반 적 = 일반 6종, 강적 = 일반 + 특식)', () => {
    const F = BALANCE.provisional.food;
    const rng = createRng(3);
    const normal = new Set<string>();
    const elite = new Set<string>();
    for (let i = 0; i < 600; i++) {
      normal.add(pickBattleFood(rng, false));
      elite.add(pickBattleFood(rng, true));
    }
    expect([...normal].every((id) => (F.normalTable[id] ?? 0) > 0)).toBe(true);
    expect([...elite].every((id) => (F.eliteTable[id] ?? 0) > 0)).toBe(true);
    expect([...elite].some((id) => !(id in F.normalTable))).toBe(true); // 특식이 섞인다
  });

  it('분포: 600판 × 4바퀴 — 어느 바퀴도 먹이 2개 이상 없음, 1바퀴(배율 1) 평균 ≈ 0.5, 이어하기 배율만큼 조금씩 오름', () => {
    const rows = survey(600);
    const avg = rows.map((r) => r.one / Math.max(1, r.zero + r.one + r.more));
    console.log('C.550 바퀴별 먹이 1개 비율', avg.map((a) => a.toFixed(3)).join(' · '), rows);
    for (const r of rows) expect(r.more).toBe(0);
    expect(avg[0]!).toBeGreaterThan(0.43);
    expect(avg[0]!).toBeLessThan(0.57);
    // 이어하기 배율 (1 + reward × (n − 1)) 은 확률에만 — 4바퀴째도 1개 상한
    const k4 = 1 + PX.continueScale.reward * 3;
    expect(avg[3]!).toBeGreaterThan(avg[0]!);
    expect(avg[3]!).toBeLessThan(Math.min(1, 0.5 * k4) + 0.08);
  });

  it('난이도 배율도 확률에만 — ★5 연속 10 도 바퀴당 1개 넘지 않음', () => {
    const rows = survey(200, { difficulty: 5, streak: 10 }, 2);
    for (const r of rows) expect(r.more).toBe(0);
    const avg = rows[0]!.one / (rows[0]!.zero + rows[0]!.one);
    expect(avg).toBeGreaterThan(0.5);
  });

  it('전투: 첫 먹이가 나온 바퀴는 다음 전투에서 먹이 굴림을 건너뜀(골드는 그대로)', () => {
    // 바퀴 굴림이 낮은(= 첫 전투에서 나오는) 시드를 고른다
    let seed = 1;
    while (lapFoodRoll(seed, 1) >= 0.3) seed++;
    const e = createExpedition({ factionId: 'hollow', seed, hunger: 0, condition: 100, deck: [] });
    let wins = 0;
    for (let g = 0; g < 400 && e.lap === 1 && e.phase !== 'ended'; g++) {
      if (e.phase === 'moving') advance(e);
      else if (e.phase === 'battle') {
        const b = startBattle(e);
        autoWin(b);
        const goldBefore = e.goldLoot.length;
        finishBattle(e, b);
        wins++;
        expect(e.goldLoot.length).toBeGreaterThan(goldBefore);
      } else if (e.phase === 'absorb') chooseRelease(e);
      else if (e.phase === 'rest') finishRest(e);
      else if (e.phase === 'nest-choice') chooseContinue(e);
      else if (e.phase === 'event') resolveEvent(e, null);
      else break;
      e.hunger = 0;
    }
    expect(wins).toBeGreaterThan(1);
    expect(e.foodLoot.filter((a) => a.lap === 1)).toHaveLength(1);
  });

  it('바퀴 굴림을 못 넘은 바퀴는 먹이 0개', () => {
    let seed = 1;
    while (lapFoodRoll(seed, 1) < 0.9) seed++;
    const e = playExpedition(createExpedition({ factionId: 'hollow', seed, hunger: 0, condition: 100, deck: [], tileVariants: false }), { returnAfterLap: 1, playBattle: autoWin });
    expect(perLap(e)[0]).toBe(0);
  });

  it('원정 상인에서 산 먹이는 규칙 밖 — 상한에 안 세고, 사도 그 바퀴 먹이를 막지 않음', () => {
    const e = createExpedition({ factionId: 'hollow', seed: 5, hunger: 0, condition: 100, deck: [] });
    e.foodLoot.push({ food: 'basic', lap: 1 });
    e.variantLog.events.push({ event: 'merchant', choice: 'buy:food:basic', lap: 1 });
    expect(lapFoodTaken(e)).toBe(false);
    e.foodLoot.push({ food: 'sushi', lap: 1 });
    expect(lapFoodTaken(e)).toBe(true);
    e.lap = 2;
    expect(lapFoodTaken(e)).toBe(false); // 다음 바퀴는 새로
  });

  it('보물: 이 바퀴에 먹이가 이미 나왔으면 먹이 보물 대신 골드 보물', () => {
    const e = createExpedition({ factionId: 'hollow', seed: 9, hunger: 0, condition: 100, deck: [] });
    e.foodLoot.push({ food: 'basic', lap: 1 });
    e.phase = 'event';
    e.eventPending = { tileId: 'x', cell: 3, event: 'treasure', treasure: { food: 'feast' } };
    const r = resolveEvent(e, null);
    expect(r.ok).toBe(true);
    expect(e.foodLoot).toHaveLength(1);
    const g = e.goldLoot.at(-1)!.amount;
    expect(g).toBeGreaterThanOrEqual(TV.events.treasure.gold[0]);
    expect(g).toBeLessThanOrEqual(TV.events.treasure.gold[1]);
    expect(e.variantLog.events.at(-1)!.choice).toBe(`gold:${g}`);
  });

  it('휴식 간식도 바퀴 먹이 — 이미 나온 바퀴는 간식 없음', () => {
    const e = createExpedition({ factionId: 'hollow', seed: 1, hunger: 0, condition: 100, deck: [] });
    e.foodLoot.push({ food: 'basic', lap: 1 });
    e.phase = 'rest';
    finishRest(e);
    expect(e.foodLoot).toHaveLength(1);
  });

  it('막힘 방지 간식(먹이 0개 귀환 시 간식 2)은 그대로', () => {
    const s = emptyFoodStock();
    const r = settleFood(s, []);
    expect(r.fallback).toBe(BALANCE.provisional.food.fallbackSnack);
  });

  it('엔진에 종족 분기 없음, 기획서 4-5 줄', () => {
    const src = readFileSync('src/engine/expedition/expedition.ts', 'utf8') + readFileSync('src/engine/food.ts', 'utf8');
    expect(src).not.toMatch(/faction(Id)? === '(hollow|shinigami)'/);
    const gdd = readFileSync('docs/GDD.md', 'utf8');
    expect(gdd).toMatch(/모험 먹이 = 바퀴당 0~1개/);
    expect(gdd).toMatch(/foodPerLap/);
  });
});
