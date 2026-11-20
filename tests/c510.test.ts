// C.510 (사용자 2026-11-20 "특식은 상점에서 안팔고 드랍으로" · 점검C 2번 패배 무르기 막기, GDD 4-5·6-11 v6.147)
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { playCombatBot } from '../src/engine/combat';
import {
  advance, botPickTrait, chooseAbsorb, chooseContinue, chooseReturn, createExpedition, finishBattle, finishRest, placeAll, serializeExpedition, startBattle, type ExpeditionState,
} from '../src/engine/expedition';
import { collapseNest } from '../src/engine/nest';
import { migrateSave, newSaveData, readActiveExpedition, recordExpedition, restartBattleOnResume, resumeTarget } from '../src/game';
import { GOLD_ITEMS } from '../src/data/shop';
import { foodSellPrice } from '../src/sell';
import foodRows from '../src/data/foods/rows.json';
import grounds from '../src/data/grounds/grounds.json';

const read = (p: string) => readFileSync(p, 'utf8');
const T0 = 1_700_000_000_000;
const DECK = ['prey-nest-a', 'prey-nest-a', 'elite-den-a', 'env-fog', 'rest-a', 'prey-nest-b', 'env-ruin', 'elite-den-b'];
const SPECIAL = foodRows.kinds.find((k) => k.id === 'special')!.foods;

describe('특식은 상점에서 안 판다 — 드롭으로만 (GDD 4-5)', () => {
  it('골드 상점 품목에 특식이 없다', () => {
    const sold = GOLD_ITEMS.filter((g) => g.kind === 'food').map((g) => g.id);
    expect(sold).toEqual(['food-snack', 'food-scrap', 'food-basic', 'food-hearty']);
    for (const f of SPECIAL) expect(BALANCE.shop.goldPrices[`food-${f}`]).toBeUndefined();
  });
  it('특식 6종 모두 강적 드롭 표(기본·사냥터별)와 보물 표에 있다', () => {
    const P = BALANCE.provisional;
    const tables: Record<string, number>[] = [P.food.eliteTable, P.tileVariants.events.treasure.foodTable];
    for (const g of grounds.grounds as { food?: { eliteTable?: Record<string, number> } | null }[]) if (g.food?.eliteTable) tables.push(g.food.eliteTable);
    expect(tables.length).toBeGreaterThanOrEqual(4);
    for (const t of tables) for (const f of SPECIAL) expect(t[f], f).toBeGreaterThan(0);
  });
  it('이미 가진 특식은 그대로 팔 수 있고 값도 그대로 (응축 50·대식 70 = 옛 산 값 절반)', () => {
    expect(foodSellPrice('tonic')).toBe(50);
    expect(foodSellPrice('feast')).toBe(70);
  });
});

function drive(exp: ExpeditionState, stop: (e: ExpeditionState) => boolean): ExpeditionState {
  for (let g = 0; exp.phase !== 'ended' && g < 5000; g++) {
    if (stop(exp)) return exp;
    if (exp.phase === 'moving') { placeAll(exp); advance(exp); }
    else if (exp.phase === 'battle') { const b = startBattle(exp); playCombatBot(b); finishBattle(exp, b); }
    else if (exp.phase === 'absorb') { const p = botPickTrait(exp); chooseAbsorb(exp, p.traitId, p.replaceSlot); }
    else if (exp.phase === 'rest') finishRest(exp);
    else if (exp.phase === 'nest-choice') { placeAll(exp); if (exp.lap >= 3) chooseReturn(exp); else chooseContinue(exp); }
  }
  return exp;
}

/** 원정 전투 직전까지 가서 전투 직전 저장(앱 beginBattle 과 같음)을 해 둔다 */
function atBattle() {
  const save = newSaveData('hollow', T0 - 60_000);
  const exp = drive(createExpedition({ factionId: 'hollow', seed: 11, hunger: 10, condition: 100, deck: DECK }), (e) => e.phase === 'battle');
  expect(exp.phase).toBe('battle');
  save.activeExpedition = serializeExpedition(exp, 1, T0)!;
  save.lastScreen = 'expedition';
  return { save, exp };
}

/** 앱의 판정 순간 정산(app.ts beginBattle settle)과 같은 순서: finishBattle → 패배면 recordExpedition(진화 보류), 승리면 원정 중간 저장 */
function settleAtDecision(save: ReturnType<typeof newSaveData>, exp: ExpeditionState, nowMs: number): void {
  const b = startBattle(exp);
  playCombatBot(b);
  expect(b.status).not.toBe('playing');
  finishBattle(exp, b);
  if (exp.phase === 'ended') recordExpedition(save, exp, nowMs, { holdEvolution: true });
  else save.activeExpedition = serializeExpedition(exp, 1, nowMs)!;
}

/** 저장본을 다시 연다 (새로고침): JSON 으로 저장했다가 읽은 것과 같게 */
const reopen = (save: ReturnType<typeof newSaveData>) => migrateSave(JSON.parse(JSON.stringify(save)))!;

describe('전투가 끝나는 순간 결과 저장 — 패배 무르기 없음 (GDD 6-11 v6.147, 점검C 2번)', () => {
  it('패배 판정 직후 저장본을 다시 열면: 이어할 원정이 없고(전투 재시작 안 함) 빈사 상태로 이어진다', () => {
    const { save, exp } = atBattle();
    exp.hpFraction = 0.001; // 확실히 지는 전투
    settleAtDecision(save, exp, T0 + 1000);
    expect(exp.outcome).toBe('defeated');
    const again = reopen(save);
    expect(again.activeExpedition).toBeNull();
    expect(resumeTarget(again)).toBe('room');
    expect(readActiveExpedition(again, T0 + 2000)).toMatchObject({ ok: false, reason: 'none' });
    expect(again.nest.collapsed).toBe(true);
    expect(again.runLog.runs.at(-1)).toMatchObject({ outcome: 'defeated' });
    expect(again.runLog.battleRestarts).toEqual([]);
  });

  it('빈사 중 패배도 판정 순간 저장 → 다시 열어도 사망 그대로', () => {
    const { save, exp } = atBattle();
    collapseNest(save.nest, T0 - 30_000);
    exp.hpFraction = 0.001;
    settleAtDecision(save, exp, T0 + 1000);
    const again = reopen(save);
    expect(again.nest.dead).toBe(true);
    expect(again.activeExpedition).toBeNull();
  });

  it('승리 판정 직후 저장본을 다시 열면: 흡수 대기 상태 그대로(같은 후보), 전투를 다시 하지 않는다', () => {
    const { save, exp } = atBattle();
    settleAtDecision(save, exp, T0 + 1000);
    expect(exp.phase).toBe('absorb');
    const again = reopen(save);
    const r = readActiveExpedition(again, T0 + 2000);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.exp.phase).toBe('absorb');
    expect(r.exp.pending).toBeNull();
    expect(r.exp.battles).toHaveLength(exp.battles.length);
    expect(r.exp.absorbOffer?.candidates).toEqual(exp.absorbOffer?.candidates);
    expect(restartBattleOnResume(again, r.exp, T0 + 3000)).toBe(false);
    expect(again.runLog.battleRestarts).toEqual([]);
  });

  it('화면 연결: 전투 화면은 판정 순간 onDecided 를 부르고, 원정 전투는 거기서 정산·저장한다', () => {
    const bv = read('src/ui/battleView.ts');
    const at = bv.indexOf("if (s.status !== 'playing') {\n      stop();\n      opts.onDecided?.(s);");
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThan(bv.indexOf('window.setTimeout(showResult, 700)'));
    const app = read('src/ui/app.ts');
    expect(app).toMatch(/onDecided: \(done\) => settle\(done\)/);
    expect(app).toMatch(/if \(exp\.phase === 'ended'\) settleExpeditionEnd\(faction, exp\);\n\s+else saveProgress\(exp\);/);
    // 미리 정산한 원정은 [결과 보기] 뒤 다시 기록하지 않는다(결과 화면만)
    expect(app).toMatch(/const show = settledEnds\.get\(exp\) \?\? prepareExpeditionEnd\(faction, exp\);/);
  });
});
