// C.175 돌봄 패널티 (GDD 102장): 시간 흐름·쇠약/피곤·쓰러짐/사망·부활·약·용어·교감
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { getFaction } from '../src/data/factions';
import { applyAbsenceTime, applyExpeditionEnd, cureStatus, deathHoursOf, departCare, doNestAction, dyingLeftMs, gainBond, newNest, passNestTime, reviveEvLossOf, tickNestOnline } from '../src/engine/nest';
import { applyCareToParams, createExpedition, type ExpeditionState } from '../src/engine/expedition';
import { absenceOf, careBlock, cureNest, fastForward, newSaveData, performRevive, recordExpedition, type SaveData } from '../src/game';
import { buyShopItem, goldRows } from '../src/shop';
import { inventoryOf, useInventoryItem } from '../src/inventory';
import { absenceText, careBlockText, dyingClock, moodOf, statusChips } from '../src/ui/bha/roomLogic';
import { riskText } from '../src/data/help/riskText';

const H = 3_600_000;
const NX = BALANCE.provisional.nest;
const CP = NX.care;

function ended(save: SaveData, outcome: 'returned' | 'defeated'): ExpeditionState {
  const exp = createExpedition({ factionId: save.factionId, seed: 7, hunger: save.nest.hunger, condition: save.nest.condition, deck: [], build: save.build, evolution: save.evolution });
  exp.phase = 'ended';
  exp.outcome = outcome;
  exp.endReason = outcome === 'returned' ? 'returned' : 'battle-lost';
  return exp;
}

describe('102-1 시간 흐름', () => {
  it('배부름 30 초과면 컨디션 그대로(70 이상 회복은 C.214 에서 폐기), 30 이하면 시간당 −4, 0 이면 ×2', () => {
    const n = newNest(0);
    n.hunger = 31; // 배부름 69
    n.condition = 80;
    passNestTime(n, 4, false); // 배부름 69 → 49
    expect(n.condition).toBe(80);
    const m = newNest(0);
    m.hunger = 70; // 배부름 30
    m.condition = 80;
    passNestTime(m, 1, false);
    expect(m.condition).toBeCloseTo(80 - CP.conditionPerHour, 5);
    const z = newNest(0);
    z.hunger = 100;
    z.condition = 80;
    passNestTime(z, 1, false);
    expect(z.condition).toBeCloseTo(80 - CP.conditionPerHour * 2, 5);
  });
  it('영압 안정도는 꺼 둔 동안만 시간당 −2, 배부름·컨디션 30 이하면 ×2', () => {
    const n = newNest(0);
    n.hunger = 0;
    n.stability = 50;
    passNestTime(n, 1, false);
    expect(n.stability).toBe(50);
    passNestTime(n, 1, true);
    expect(n.stability).toBeCloseTo(50 - CP.stabilityPerHour, 5);
    const low = newNest(0);
    low.hunger = 0;
    low.condition = 20;
    low.stability = 50;
    passNestTime(low, 1, true);
    expect(low.stability).toBeCloseTo(50 - CP.stabilityPerHour * 2, 5);
  });
  it('+60 상한이 없어 100/시간당 흐름(C.181: 5 → 20시간)이면 배부름 0, 리스크는 그대로', () => {
    const n = newNest(0);
    n.hunger = 0;
    n.risk = 33;
    applyAbsenceTime(n, 0, (100 / BALANCE.provisional.nest.idleHungerPerHour + 1) * H);
    expect(n.hunger).toBe(100);
    expect(n.risk).toBe(33);
  });
  it('켜 둔 동안도 허기·컨디션이 흐른다 (원정 중이면 시각만 옮김)', () => {
    const n = newNest(0);
    n.hunger = 70;
    n.condition = 80;
    n.stability = 50;
    tickNestOnline(n, 2 * H);
    expect(n.hunger).toBeCloseTo(70 + 2 * BALANCE.provisional.nest.idleHungerPerHour);
    expect(n.condition).toBeLessThan(80);
    expect(n.stability).toBe(50);
    const before = n.hunger;
    tickNestOnline(n, 3 * H, true);
    expect(n.hunger).toBe(before);
    expect(n.lastTickMs).toBe(3 * H);
  });
});

describe('102-2 쇠약·피곤', () => {
  it('문턱 이하가 되는 순간 걸리고, 먹이·재우기로 수치를 채워도 안 풀린다', () => {
    const n = newNest(0);
    n.hunger = 79;
    n.condition = 31;
    passNestTime(n, 0.2, false);
    expect(n.weakened).toBe(true); // 배부름 20 이하
    n.condition = 30;
    passNestTime(n, 0.01, false);
    expect(n.tired).toBe(true);
    doNestAction(n, 'feed', 'feast');
    doNestAction(n, 'sleep');
    expect(100 - n.hunger).toBeGreaterThan(CP.weakFullness);
    expect(n.condition).toBeGreaterThan(CP.tiredCondition);
    expect([n.weakened, n.tired]).toEqual([true, true]);
  });
  it('수치를 되돌린 뒤 출발해 귀환하면 풀리고, 되돌리기 전에 출발했으면 안 풀린다', () => {
    const s = newSaveData('hollow', 0);
    Object.assign(s.nest, { weakened: true, tired: true, hunger: 50, condition: 20 });
    expect(departCare(s.nest)).toEqual({ weak: true, tired: true, dying: false });
    s.nest.condition = 60; // 출발 뒤에 올려도 이번 원정은 안 친다
    recordExpedition(s, ended(s, 'returned'), 1000);
    expect(s.nest.weakened).toBe(false);
    expect(s.nest.tired).toBe(true);
    expect(s.runLog.vitals.filter((v) => v.kind === 'recover').map((v) => v.status)).toEqual(['weak']);
  });
  it('쇠약 = 전투 최대 체력 −20%, 피곤 = 블록 생성 간격 +15%', () => {
    const p: { playerHpScale?: number; blockSpawnMultiplier?: number } = {};
    applyCareToParams(p, { weak: true, tired: true });
    expect(p.playerHpScale).toBeCloseTo(BALANCE.provisional.combat.playerHpScale * (1 - CP.weakMaxHpCut));
    expect(1 / p.blockSpawnMultiplier!).toBeCloseTo(1 + CP.tiredSpawnSlow);
    const exp = createExpedition({ factionId: 'hollow', seed: 1, hunger: 0, condition: 80, deck: [], care: { weak: true, tired: false } });
    expect(exp.care).toEqual({ weak: true, tired: false });
  });
});

describe('102-3 빈사(옛 쓰러짐)·사망·부활 (102장 수정 v5.228)', () => {
  it('48시간 미접속 = 빈사(그 시각부터, 교감 −5), 빈사 시간이 다 되면 사망(교감 절반), 런 로그', () => {
    const s = newSaveData('hollow', 0);
    s.nest.bond = 20;
    s.lastSeenAt = 0;
    const r = absenceOf(s, 48 * H);
    expect(r.collapsed).toBe(true);
    expect(s.nest.collapsed).toBe(true);
    expect(s.nest.collapsedAt).toBe(48 * H);
    expect(s.nest.bond).toBe(20 - 4 - NX.bond.collapseLoss); // 12시간마다 −1 × 4
    expect(careBlock(s)).toBeNull(); // 빈사는 모험할 수 있다(출발 확인 창)
    const t = newSaveData('shinigami', 0);
    t.lastSeenAt = 0;
    const d = absenceOf(t, 72 * H);
    expect(d.died).toBe(true);
    expect(t.runLog.vitals.map((v) => v.kind)).toEqual(['collapse', 'death']);
  });
  it('빈사 시간 = 실제 시간 6 + 교감 × 0.18 (교감 100 = 24시간) — 켜 둔 동안에도 흐른다', () => {
    expect([deathHoursOf(0), deathHoursOf(50), deathHoursOf(100)]).toEqual([6, 15, 24]);
    const n = newNest(0);
    Object.assign(n, { collapsed: true, collapsedAt: 0, bond: 0, lastTickMs: 0 });
    expect(dyingClock(dyingLeftMs(n, 0)!)).toBe('6:00');
    tickNestOnline(n, 5.9 * H);
    expect(n.dead).toBe(false);
    tickNestOnline(n, 6 * H);
    expect(n.dead).toBe(true);
  });
  it('원정 패배로 돌아오면 빈사, 빈사에서 또 지면 사망 · 사망이면 막힘 안내', () => {
    const s = newSaveData('hollow', 0);
    recordExpedition(s, ended(s, 'defeated'), 1000);
    expect(s.nest.collapsed).toBe(true);
    expect(s.runLog.vitals.at(-1)).toMatchObject({ kind: 'collapse', cause: 'defeat' });
    expect(departCare(s.nest).dying).toBe(true);
    recordExpedition(s, ended(s, 'defeated'), 2000);
    expect(s.nest.dead).toBe(true);
    expect(s.runLog.vitals.at(-1)).toMatchObject({ kind: 'death', cause: 'defeat' });
    expect(careBlock(s)).toBe('dead');
    expect(careBlockText('dead').title).toContain('부활');
  });
  it('빈사 모험 = 체력 10%(최대치 자체) · 공격·블록 속도 절반', () => {
    const p: { playerHpScale?: number; blockSpawnMultiplier?: number; attackSpeedMultiplier?: number } = {};
    applyCareToParams(p, { dying: true });
    expect(p.playerHpScale).toBeCloseTo(BALANCE.provisional.combat.playerHpScale * CP.dying.hpFraction);
    expect([p.attackSpeedMultiplier, p.blockSpawnMultiplier]).toEqual([0.5, 0.5]);
  });
  it('부활: 노력치 × (1 − 손실), 1단계로, 수치 시작값·상태 해제, 물건·골드는 그대로', () => {
    const s = newSaveData('hollow', 0);
    s.evolution.tierIndex = 3;
    s.evolution.formId = 'x';
    s.evolution.formHistory = ['a', 'b', 'c'];
    s.evolution.ev = { hp: 41, atk: 30, def: 0, spr: 9, int: 10, spd: 3 } as SaveData['evolution']['ev'];
    s.shared.tradeCoins = 777;
    Object.assign(s.nest, { dead: true, collapsed: true, weakened: true, tired: true, hunger: 100, condition: 0, stability: 0, bond: 0 });
    expect(performRevive(s, 5).ok).toBe(true);
    expect(s.evolution).toMatchObject({ tierIndex: 0, formId: null, formHistory: [] });
    expect(s.evolution.ev.hp).toBe(Math.floor(41 * (1 - reviveEvLossOf(0))));
    expect(s.evolution.ev.atk).toBe(15);
    expect(s.nest).toMatchObject({ dead: false, collapsed: false, weakened: false, tired: false, hunger: NX.startHunger, condition: NX.startCondition });
    expect(s.shared.tradeCoins).toBe(777);
    expect(s.runLog.vitals.at(-1)).toMatchObject({ kind: 'revive', evLoss: 0.5, tierIndex: 3 });
    expect(s.runLog.rebirths).toHaveLength(0); // 환생과 다르다
    expect(reviveEvLossOf(80)).toBe(0.3);
    expect(performRevive(s, 6).ok).toBe(false); // 살아 있으면 못 한다
  });
  it('접속 시간 빨리 감기 (테스트 모드)', () => {
    const s = newSaveData('hollow', 0);
    const r = fastForward(s, 12, 100 * H);
    expect(r.hours).toBeCloseTo(12);
    expect(absenceText(r, getFaction('hollow'))).toMatch(/^12시간 동안 비웠다 — 배부름 −\d+/);
  });
});

describe('102-4 약 3종', () => {
  it('상점 약 칸: 구급상자·링거·에너지 드링크, 값 = 보통 먹이 6·3·3배쯤, 보관함 소모품으로', () => {
    const s = newSaveData('hollow', 0);
    s.shared.tradeCoins = 1000;
    const f = getFaction('hollow');
    const rows = goldRows(s, f).filter((r) => r.id.startsWith('med-'));
    expect(rows.map((r) => [r.name, r.price])).toEqual([['구급상자', 210], ['링거', 105], ['에너지 드링크', 105]]);
    for (const id of ['med-cure', 'med-iv', 'med-energy']) expect(buyShopItem(s, f, id, 0).ok).toBe(true);
    expect(inventoryOf(s, f).filter((e) => e.id.startsWith('med-')).every((e) => e.category === 'consumable' && e.lock !== null)).toBe(true); // 상태가 없으면 못 쓴다
    Object.assign(s.nest, { collapsed: true, weakened: true, tired: true });
    const hunger = s.nest.hunger;
    expect(useInventoryItem(s, f, 'med-cure').ok).toBe(true);
    expect([s.nest.collapsed, s.nest.weakened, s.nest.tired]).toEqual([false, true, true]); // 쓰러짐만
    expect(useInventoryItem(s, f, 'med-iv').ok).toBe(true);
    expect(useInventoryItem(s, f, 'med-energy').ok).toBe(true);
    expect([s.nest.weakened, s.nest.tired, s.nest.hunger, s.nest.bond]).toEqual([false, false, hunger, 0]); // 수치·교감은 그대로
    expect(s.runLog.vitals.filter((v) => v.kind === 'cure').map((v) => v.status)).toEqual(['collapsed', 'weak', 'tired']);
    expect(cureNest(s, 'tired')).toBe(false);
  });
});

describe('102-5 용어', () => {
  it('두 종족 모두 영압 안정도, 폭주 상태 = 호로 폭주 / 사신 호로화, 도움말에 한계 돌파 없음', () => {
    const h = getFaction('hollow');
    const s = getFaction('shinigami');
    expect([h.stabilityName, s.stabilityName]).toEqual(['영압 안정도', '영압 안정도']);
    expect([h.frenzyName, s.frenzyName]).toEqual(['폭주', '호로화']);
    for (const f of [h, s]) {
      const t = riskText(f);
      expect(JSON.stringify(t)).not.toContain('한계 돌파');
      expect(t.riskTip).toContain(f.frenzyName);
    }
  });
});

describe('102-6 교감', () => {
  it('먹이 +1 · 재우기 +1 · 쓰다듬기 +2, 하루 최대 +6, 날이 바뀌면 다시', () => {
    const n = newNest(0);
    const day = new Date(2026, 9, 27, 10).getTime();
    doNestAction(n, 'feed', 'basic', day);
    doNestAction(n, 'sleep', 'basic', day);
    doNestAction(n, 'pet', 'basic', day);
    expect(n.bond).toBe(4);
    for (let i = 0; i < 5; i++) doNestAction(n, 'pet', 'basic', day);
    expect(n.bond).toBe(NX.bond.dailyMax);
    expect(gainBond(n, 2, new Date(2026, 9, 28, 1).getTime())).toBe(2);
  });
  it('방 상태 칩: 영압 안정도(교감은 상태 화면에서만, 109장 수정 v5.243)·쓰러짐·쇠약·피곤 칩(풀리는 법), 기분 = 쓰러짐 먼저', () => {
    const chips = statusChips({ hunger: 90, condition: 20, risk: 0, weakened: true, tired: true, collapsed: true, stability: 42 }, getFaction('hollow'));
    expect(chips.map((c) => c.kind)).toEqual(['hunger', 'cond', 'stab', 'risk', 'collapsed', 'weak', 'tired']);
    expect(chips.find((c) => c.kind === 'stab')).toMatchObject({ value: 42, label: '영압 안정도' });
    expect(chips.filter((c) => c.hint).length).toBe(3);
    expect(moodOf({ weakened: true, collapsed: true, condition: 10, risk: 0, riskLimit: 100 })).toBe('collapsed');
  });
  it('끝난 원정 패배로 쓰러지면 교감 −5', () => {
    const s = newSaveData('hollow', 0);
    s.nest.bond = 10;
    applyExpeditionEnd(s.nest, ended(s, 'defeated'), 0);
    expect(s.nest.bond).toBe(10 - NX.bond.collapseLoss);
    expect(cureStatus(s.nest, 'collapsed')).toBe(true);
  });
});
