// C.52 (GDD 23장): 먹이 전리품·리스크 폭주·튜토리얼 보상·거래 재화 자리, 세이브 형식 16
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { FACTIONS, getFaction } from '../src/data/factions';
import { TUTORIAL_GOALS, parseTutorialGoal } from '../src/data/tutorials';
import { helpVars, placeholdersOf } from '../src/data/help';
import { FOOD_IDS } from '../src/engine/faction';
import { addFood, newFoodStock, rollBattleFood, sanitizeFoodStock, settleFood, totalFood } from '../src/engine/food';
import { createRng } from '../src/engine/rng';
import {
  advance, applyFrenzy, chooseReturn, createExpedition, finishBattle, finishRest, inFrenzy, playExpedition, restoreExpedition, serializeExpedition, startBattle, summarize,
  type ExpeditionState,
} from '../src/engine/expedition';
import { changeRisk } from '../src/engine/absorb';
import { applyExpeditionEnd, doNestAction, newNest } from '../src/engine/nest';
import { goalAchieved } from '../src/engine/tutorialGoals';
import { claimTutorialGoals, feedNest, loadSave, migrateSave, newSaveData, nextRunId, recordExpedition, SAVE_FORMAT_VERSION, writeSave } from '../src/game';
import { emptyRunLog } from '../src/engine/runLog';
import { useLegacyMigrations } from './helpers/legacyGate';

useLegacyMigrations(); // 옛 형식 마이그레이션 시험 (C.120, GDD 61장)

const FX = BALANCE.provisional.food;
const RX = BALANCE.provisional.risk;
const DECK = ['prey-nest-a', 'prey-nest-a', 'elite-den-a', 'env-fog', 'rest-a', 'prey-nest-b', 'env-ruin', 'elite-den-b'];
const mk = (over: Partial<Parameters<typeof createExpedition>[0]> = {}) => createExpedition({ factionId: 'hollow', seed: 1, hunger: 10, condition: 100, deck: DECK, ...over });

function win(exp: ExpeditionState): void {
  const b = startBattle(exp);
  b.enemy.hp = 0;
  b.status = 'won';
  b.params = { ...b.params, skills: [{ id: 't-fire-a', element: 'fire', category: 'physical', role: 'attack', powerInAttacks: 1, chainBonus: { kind: 'stagger', value: 1 }, powerMultiplier: 1 }] };
  finishBattle(exp, b);
}
function toBattle(exp: ExpeditionState): void {
  for (let i = 0; i < 200 && exp.phase !== 'battle'; i++) {
    if (exp.phase === 'moving') advance(exp);
    else if (exp.phase === 'rest') finishRest(exp);
    else break;
  }
}
const storage = () => {
  const mem: Record<string, string> = {};
  return { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => void (mem[k] = v) };
};

describe('먹이 = 전리품 (GDD 23-1)', () => {
  it('시작 지급 간식 5·보통 3, 상한 9, 모르는 값 정리', () => {
    const s = newFoodStock();
    expect(s).toEqual({ snack: 5, basic: 3, hearty: 0, tonic: 0, feast: 0 });
    expect(addFood(s, 'snack', 10)).toBe(FX.cap - 5);
    expect(s.snack).toBe(FX.cap);
    expect(sanitizeFoodStock({ snack: 99, basic: -3, hearty: 2.7, bogus: 4 })).toEqual({ snack: FX.cap, basic: 0, hearty: 2, tonic: 0, feast: 0 });
  });

  it('드롭 표: 일반 적은 약 50% 1개(간식·보통·든든), 강적은 확정 1개 + 약 30% 1개 더(든든·보양식·잔치)', () => {
    const rng = createRng(7);
    const N = 4000;
    let normal = 0;
    let elite = 0;
    const normalKinds = new Set<string>();
    const eliteKinds = new Set<string>();
    for (let i = 0; i < N; i++) {
      const a = rollBattleFood(rng, false);
      expect(a.length).toBeLessThanOrEqual(1);
      normal += a.length;
      a.forEach((x) => normalKinds.add(x));
      const b = rollBattleFood(rng, true);
      expect(b.length === 1 || b.length === 2).toBe(true);
      elite += b.length;
      b.forEach((x) => eliteKinds.add(x));
    }
    expect(normal / N).toBeGreaterThan(0.45);
    expect(normal / N).toBeLessThan(0.55);
    expect(elite / N - 1).toBeGreaterThan(0.25);
    expect(elite / N - 1).toBeLessThan(0.35);
    expect([...normalKinds].sort()).toEqual(['basic', 'hearty', 'snack']);
    expect([...eliteKinds].sort()).toEqual(['feast', 'hearty', 'tonic']);
  });

  it('원정: 이기면 먹이가 쌓이고 휴식 타일은 간식 +1, 전리품 난수가 따로라 적·타일 결과는 그대로', () => {
    const a = mk({ seed: 5 });
    const b = mk({ seed: 5 });
    b.lootRng = createRng(999); // 전리품 난수만 다르게
    for (const e of [a, b]) {
      for (let k = 0; k < 4; k++) {
        toBattle(e);
        if (e.phase === 'battle') win(e);
        if (e.phase === 'absorb') e.phase = 'moving', (e.absorbOffer = null);
      }
    }
    expect(a.battles.map((x) => x.enemyId)).toEqual(b.battles.map((x) => x.enemyId));
    expect(a.acquired).toEqual(b.acquired);
    const r = mk({ seed: 6 });
    r.slots[1] = 'rest-a';
    r.wildCells = [];
    advance(r);
    expect(r.phase).toBe('rest');
    finishRest(r);
    expect(r.foodLoot).toEqual([{ food: 'snack', lap: 1 }]);
  });

  it('귀환하면 지킨 먹이가 보유에 들어가고(상한까지), 패배하면 마지막 바퀴 먹이는 잃는다', () => {
    const save = newSaveData('hollow', 0);
    const exp = playExpedition(mk({ seed: 11, runId: nextRunId(save) }), { returnAfterLap: 2 });
    const before = { ...save.shared.food };
    recordExpedition(save, exp, 1);
    const kept = summarize(exp).keptFood;
    expect(exp.foodSettled?.gained).toEqual(kept);
    for (const id of FOOD_IDS) expect(save.shared.food[id]).toBe(Math.min(FX.cap, before[id] + kept.filter((x) => x === id).length));
    const lost = mk({ seed: 3 });
    lost.foodLoot = [{ food: 'hearty', lap: 1 }, { food: 'snack', lap: 2 }];
    lost.lap = 2;
    toBattle(lost);
    const bt = startBattle(lost);
    bt.status = 'lost';
    bt.lossReason = 'hp';
    finishBattle(lost, bt);
    expect(summarize(lost).keptFood).toEqual(['hearty']);
    expect(summarize(lost).lostFood).toEqual(['snack']);
  });

  it('막힘 방지: 돌아왔을 때 먹이가 하나도 없으면 간식 2개', () => {
    const s = { snack: 0, basic: 0, hearty: 0, tonic: 0, feast: 0 };
    const r = settleFood(s, []);
    expect(r.fallback).toBe(FX.fallbackSnack);
    expect(s.snack).toBe(2);
    const t = { snack: 0, basic: 1, hearty: 0, tonic: 0, feast: 0 };
    expect(settleFood(t, []).fallback).toBe(0);
    expect(totalFood(t)).toBe(1);
  });

  it('둥지 먹이 주기는 하나를 쓰고, 0개면 먹이지 못한다', () => {
    const save = newSaveData('hollow', 0);
    save.nest.hunger = 80;
    expect(feedNest(save, 'snack')).toBe(true);
    expect(save.shared.food.snack).toBe(4);
    expect(save.nest.hunger).toBe(80 - BALANCE.provisional.nest.foods.snack.hunger);
    const h = save.nest.hunger;
    expect(feedNest(save, 'feast')).toBe(false);
    expect(save.nest.hunger).toBe(h);
    expect(save.shared.food.feast).toBe(0);
  });

  it('원정 중간 저장 왕복: 전리품·전리품 난수가 그대로', () => {
    const e = mk({ seed: 8 });
    e.foodLoot.push({ food: 'basic', lap: 1 });
    const r = restoreExpedition(JSON.parse(JSON.stringify(serializeExpedition(e, 1, 0))));
    expect(r.ok && r.exp.foodLoot).toEqual([{ food: 'basic', lap: 1 }]);
    expect(r.ok && r.exp.lootRng).toEqual(e.lootRng);
    const broken = JSON.parse(JSON.stringify(serializeExpedition(e, 1, 0)));
    broken.exp.foodLoot = [{ food: 'cake', lap: 1 }];
    expect(restoreExpedition(broken).ok).toBe(false);
  });
});

describe('리스크 수치·폭주 (GDD 23-2)', () => {
  it('재우기·쓰다듬기는 리스크를 한 번에 −10 안팎 내린다 (C.136 GDD 84장 10번: −20 → −10)', () => {
    for (const a of ['sleep', 'pet'] as const) {
      const n = newNest(0);
      n.risk = 50;
      doNestAction(n, a);
      expect(50 - n.risk).toBeGreaterThanOrEqual(8);
      expect(50 - n.risk).toBeLessThanOrEqual(12);
    }
  });

  it('폭주: 돌파한 원정의 다음 전투부터 주는·받는 피해 +30%', () => {
    const params: { playerPowerMultiplier?: number; damageTakenMultiplier?: number } = { damageTakenMultiplier: 0.8 };
    applyFrenzy(params);
    expect(params.playerPowerMultiplier).toBeCloseTo(RX.frenzyDamageDealt);
    expect(params.damageTakenMultiplier).toBeCloseTo(0.8 * RX.frenzyDamageTaken);
    const pick = (risk: number) => {
      const e = mk({ seed: 22, risk, condition: 100 });
      e.wildCells = [1];
      changeRisk(e, 0, 'void-block');
      advance(e);
      return { frenzy: inFrenzy(e), params: startBattle(e).params };
    };
    const calm = pick(10);
    const wild = pick(RX.limit);
    expect(calm.frenzy).toBe(false);
    expect(wild.frenzy).toBe(true);
    expect((wild.params.playerPowerMultiplier ?? 1) / (calm.params.playerPowerMultiplier ?? 1)).toBeCloseTo(1.3);
    expect((wild.params.damageTakenMultiplier ?? 1) / (calm.params.damageTakenMultiplier ?? 1)).toBeCloseTo(1.3);
  });

  it('폭주는 원정당 1회, 귀환하면 컨디션 −30·리스크 60·안정 수치 하락', () => {
    const e = mk({ seed: 30, risk: 90, stability: 70, condition: 80 });
    changeRisk(e, 50, 'absorb');
    changeRisk(e, -50, 'release');
    changeRisk(e, 60, 'absorb');
    expect(e.events.filter((x) => x.kind === 'breakthrough')).toHaveLength(1);
    while (e.phase !== 'nest-choice') {
      if (e.phase === 'moving') advance(e);
      else if (e.phase === 'battle') win(e);
      else if (e.phase === 'rest') finishRest(e);
      else if (e.phase === 'absorb') (e.phase = 'moving'), (e.absorbOffer = null);
    }
    chooseReturn(e);
    const n = newNest(0);
    applyExpeditionEnd(n, e, 1);
    // C.95 (GDD 42장 3번): 바퀴당 감소 하한(출발 − 25 × 바퀴) 아래로는 안 깎는다
    expect(n.condition).toBe(Math.max(0, e.condition - RX.frenzyConditionLoss, 80 - BALANCE.provisional.expedition.conditionLossPerLapMax * e.lap));
    expect(n.risk).toBeLessThanOrEqual(RX.riskAfterBreakthrough);
    expect(n.stability).toBe(Math.max(0, e.stability - RX.breakthroughStabilityLoss));
  });

  it('폭주 문구는 종족 설정 (호로 폭주 / 사신 가면 폭주)', () => {
    expect(getFaction('hollow').frenzyName).toBe('폭주');
    expect(getFaction('shinigami').frenzyName).toBe('가면 폭주');
  });
});

describe('튜토리얼 보상 (GDD 23-3)', () => {
  it('목표 10개 데이터: 문구 자리표시자는 양 종족에서 채워지고, 전부 켜짐 (수련 C.54, 환생 C.56)', () => {
    expect(TUTORIAL_GOALS).toHaveLength(10);
    expect(new Set(TUTORIAL_GOALS.map((g) => g.id)).size).toBe(10);
    for (const f of FACTIONS) for (const g of TUTORIAL_GOALS) for (const k of placeholdersOf(g.text)) expect(helpVars(f)[k], `${g.id} {${k}}`).toBeTruthy();
    expect(TUTORIAL_GOALS.filter((g) => !g.available).map((g) => g.check)).toEqual([]); // 환생은 C.56 에서 켬
    expect(() => parseTutorialGoal({ id: 'x', check: 'nope', text: 'a', reward: { soulCrystals: 1 } })).toThrow();
    expect(() => parseTutorialGoal({ id: 'x', check: 'returned', text: 'a', reward: {} })).toThrow();
  });

  it('비활성 목표는 판정하지 않는다', () => {
    const v = { factionId: 'hollow', tutorialSeen: true, runLog: emptyRunLog(), tierIndex: 4, everRanked: true };
    expect(goalAchieved({ check: 'training', available: false }, v)).toBe(false);
    expect(goalAchieved({ check: 'tier5', available: true }, v)).toBe(true);
  });

  it('자동 판정·지급: 이룬 목표만 한 번씩, 먹이는 상한까지, 영혼 결정은 더한다', () => {
    const save = newSaveData('hollow', 0);
    expect(claimTutorialGoals(save, 1)).toEqual([]);
    save.help.tutorialSeen = true;
    save.shared.food.snack = 8;
    const g = claimTutorialGoals(save, 2);
    expect(g.map((x) => x.goal.id)).toEqual(['tutorial']);
    expect(g[0]!.food).toEqual([['snack', 1]]); // 3 중 상한까지 1
    expect(save.shared.food.snack).toBe(FX.cap);
    expect(claimTutorialGoals(save, 3)).toEqual([]);
    save.evolution.tierIndex = 4;
    save.rank.history.everRanked = true;
    const g2 = claimTutorialGoals(save, 4);
    expect(g2.map((x) => x.goal.id)).toEqual(['first-evolution', 'tier5', 'first-rank']);
    expect(save.shared.soulCrystals).toBe(6);
    expect(save.shared.tutorials.hollow!.map((c) => c.goalId)).toEqual(['tutorial', 'first-evolution', 'tier5', 'first-rank']);
  });

  it('트랙(종족)마다 1회: 종족을 바꾸면 그 종족 기록으로 다시 받을 수 있다', () => {
    const save = newSaveData('hollow', 0);
    save.runLog.runs.push({ runId: 1, laps: 4, outcome: 'returned', gained: [], lost: [], endReason: 'returned', seed: 1, factionId: 'hollow', gainedTraits: [], lostTraits: [], riskPeak: 0, breakthrough: false });
    expect(claimTutorialGoals(save, 1).map((x) => x.goal.id)).toEqual(['first-return']);
    save.factionId = 'shinigami';
    expect(claimTutorialGoals(save, 2)).toEqual([]); // 사신 원정 기록이 없다
    save.runLog.runs.push({ runId: 2, laps: 4, outcome: 'returned', gained: [], lost: [], endReason: 'returned', seed: 2, factionId: 'shinigami', gainedTraits: [], lostTraits: [], riskPeak: 0, breakthrough: false });
    expect(claimTutorialGoals(save, 3).map((x) => x.goal.id)).toEqual(['first-return']);
    expect(Object.keys(save.shared.tutorials).sort()).toEqual(['hollow', 'shinigami']);
  });

  it('기존 세이브: 이미 이룬 목표는 처음 판정할 때 한꺼번에 지급', () => {
    const save = newSaveData('hollow', 0);
    save.help.tutorialSeen = true;
    const exp = playExpedition(mk({ seed: 11, runId: nextRunId(save) }), { returnAfterLap: 4, absorb: 'absorb' });
    recordExpedition(save, exp, 1);
    const old = JSON.parse(JSON.stringify(save));
    old.meta.format = 15;
    old.shared = { soulCrystals: save.shared.soulCrystals };
    const m = migrateSave(old)!;
    expect(m.shared.tutorials).toEqual({});
    const got = claimTutorialGoals(m, 5).map((x) => x.goal.id);
    expect(got).toContain('tutorial');
    if (exp.outcome === 'returned') expect(got).toContain('first-return');
    if (exp.absorbRecords.some((a) => a.absorbed)) expect(got).toContain('first-absorb');
  });
});

describe('세이브 형식 16 (먹이·영전·튜토리얼 기록)', () => {
  it('형식 15 → 16: 먹이는 시작 지급량, 영전 0, 튜토리얼 기록 빈 것, 영혼 결정 유지', () => {
    const old = JSON.parse(JSON.stringify(newSaveData('shinigami', 0)));
    old.meta.format = 15;
    old.shared = { soulCrystals: 4 };
    const m = migrateSave(old)!;
    expect(m.meta.format).toBe(SAVE_FORMAT_VERSION);
    expect(m.shared).toEqual({ soulCrystals: 4, food: newFoodStock(), tradeCoins: 0, jade: 0, tutorials: {}, dexRewards: [], rerollTickets: 0, deckSlots: 0, cosmetics: ['keyring-orb', 'device-badge', 'device-zaraki'], items: {}, wanderer: { lapsSince: 0, visit: null }, pets: { owned: {}, active: null, gifted: false } }); // 기본 키링 (C.64)·기본 기기 (C.65)
  });

  it('새 세이브: 영전 0 자리, 저장·불러오기 왕복', () => {
    const save = newSaveData('hollow', 0);
    expect(save.shared.tradeCoins).toBe(0);
    save.shared.food.tonic = 2;
    save.shared.tutorials.hollow = [{ goalId: 'tutorial', at: 3 }];
    const st = storage();
    writeSave(st, save);
    expect(loadSave(st)!.shared).toEqual(save.shared);
  });

  it('깨진 공유 자원은 정리된다', () => {
    const old = JSON.parse(JSON.stringify(newSaveData('hollow', 0)));
    old.shared = { soulCrystals: -2, food: { snack: 'x' }, tradeCoins: 'a', tutorials: { hollow: [{ goalId: 'tutorial', at: 1 }, { goalId: 'tutorial', at: 2 }, 5] } };
    const m = migrateSave(old)!;
    expect(m.shared.soulCrystals).toBe(0);
    expect(m.shared.tradeCoins).toBe(0);
    expect(m.shared.food.snack).toBe(0);
    expect(m.shared.tutorials.hollow).toEqual([{ goalId: 'tutorial', at: 1 }]);
  });
});
