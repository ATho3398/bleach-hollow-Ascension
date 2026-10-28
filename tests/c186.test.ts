// C.186 (GDD 112장): 테스트 모드 불러오기 — 떠돌이 상인·돌봄 요청·대기 보상·원정 이벤트 타일·바퀴 변이, 장비 종류 × 특수 효과 전부·떠돌이 상인 물건
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { GEAR_KINDS, GEAR_SPECIALS } from '../src/data/gear';
import { WANDERER_ITEMS } from '../src/data/shop';
import { idleClaimable } from '../src/game';
import { createExpedition } from '../src/engine/expedition';
import {
  applyTestExpeditionForce, createTestGearAll, createTestItem, getTestExpeditionForce, newTestSave, parseTestGearId, setTestExpeditionForce,
  testCallCare, testCallIdle, testCallWanderer, testClearCare, testClearIdle, testEventTiles, testGearAllIds, testGearGrade, testGearIds, testItemIds,
  testMutations, testRerollWanderer, testSendWanderer, TEST_WANDERER_TIERS,
} from '../src/engine/testMode';
import { FACTIONS } from '../src/data/factions';

const fid = FACTIONS[0]!.id;
let seed = 1;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

describe('112장 3 장비 전부', () => {
  it('품목 = 종류 + 종류 × 특수 효과 전부, 전부 한 개씩 = 종류마다·특수 효과마다 한 번', () => {
    expect(testGearIds().length).toBe(GEAR_KINDS.length * (1 + GEAR_SPECIALS.length));
    expect(testItemIds('gear')).toEqual(testGearIds());
    for (const id of testGearIds()) expect(parseTestGearId(id)).not.toBeNull();
    expect(parseTestGearId('nope')).toBeNull();
    expect(parseTestGearId('weapon:nope')).toBeNull();
    const all = testGearAllIds().map((id) => parseTestGearId(id)!);
    expect(new Set(all.map((g) => g.kind))).toEqual(new Set(GEAR_KINDS));
    expect(new Set(all.filter((g) => g.special).map((g) => g.special))).toEqual(new Set(GEAR_SPECIALS.map((s) => s.id)));
  });
  it('특수 효과 지정 장비는 그 효과가 붙고, 노말·레어를 고르면 영웅으로', () => {
    const s = newTestSave(fid);
    s.shared.gear = { ...s.shared.gear, items: [], equipped: { weapon: null, armor: null, shoes: null, acc1: null, acc2: null } };
    expect(testGearGrade('armor:sp-shield', 'normal')).toBe('epic');
    expect(testGearGrade('armor:sp-shield', 'legendary')).toBe('legendary');
    expect(testGearGrade('armor', 'rare')).toBe('rare');
    expect(createTestItem(s, { kind: 'gear', id: 'armor:sp-shield', count: 1, grade: 'rare', plus: 2 }, 1, rnd)).toBe(1);
    const it = s.shared.gear.items.at(-1)!;
    expect(it.kind).toBe('armor');
    expect(it.grade).toBe('epic');
    expect(it.special?.id).toBe('sp-shield');
    expect(it.plus).toBe(2);
  });
  it('[전부 한 개씩 받기]: 보관함이 비었으면 목록 수만큼, 차면 멈춘다', () => {
    const s = newTestSave(fid);
    s.shared.gear = { ...s.shared.gear, items: [], equipped: { weapon: null, armor: null, shoes: null, acc1: null, acc2: null } };
    const n = createTestGearAll(s, { grade: 'legendary', plus: 0 }, 1, rnd);
    expect(n).toBe(Math.min(testGearAllIds().length, BALANCE.provisional.gear.cap));
    expect(s.shared.gear.items.slice(GEAR_KINDS.length).map((g) => g.special!.id).sort()).toEqual(GEAR_SPECIALS.map((x) => x.id).sort());
  });
});

describe('112장 3 떠돌이 상인 물건', () => {
  it('품목 = 상인 물건 전부, 공짜로 효과만 (상인·골드·구매 기록 그대로)', () => {
    expect(testItemIds('wanderer')).toEqual(WANDERER_ITEMS.map((w) => w.id));
    const s = newTestSave(fid);
    s.shared.gear.items = [];
    const gold = s.shared.tradeCoins;
    const log = s.runLog.wanderer.length;
    expect(createTestItem(s, { kind: 'wanderer', id: 'w-gear-legend', count: 1 }, 1, rnd)).toBe(1);
    expect(s.shared.gear.items.at(-1)!.grade).toBe('legendary');
    expect(s.shared.tradeCoins).toBe(gold);
    expect(s.runLog.wanderer.length).toBe(log);
    expect(s.shared.wanderer.visit).toBeNull();
    expect(createTestItem(s, { kind: 'wanderer', id: 'nope', count: 1 })).toBe(0);
  });
});

describe('112장 2 불러오기', () => {
  it('떠돌이 상인: 단계 고르기 → 부르기 · 다시 뽑기 · 보내기 (런 로그 arrive·leave)', () => {
    const s = newTestSave(fid);
    expect(testRerollWanderer(s)).toBe(false);
    expect(testSendWanderer(s)).toBe(false);
    const v = testCallWanderer(s, TEST_WANDERER_TIERS + 5, 10, rnd);
    expect(v.tier).toBe(TEST_WANDERER_TIERS);
    expect(v.stock.length).toBe(BALANCE.provisional.wanderer.stockSize);
    expect(s.runLog.wanderer.at(-1)!.kind).toBe('arrive');
    v.stock[0]!.sold = true;
    expect(testRerollWanderer(s, rnd)).toBe(true);
    expect(s.shared.wanderer.visit!.stock.every((x) => !x.sold)).toBe(true);
    expect(testSendWanderer(s, 20)).toBe(true);
    expect(s.shared.wanderer.visit).toBeNull();
    expect(s.runLog.wanderer.at(-1)!.kind).toBe('leave');
  });
  it('돌봄 요청: 띄우기 · 걷기', () => {
    const s = newTestSave(fid);
    expect(testCallCare(s, 'sleep', 1000)).toBe(true);
    expect(s.nest.careRequest).toEqual({ action: 'sleep', until: 1000 + BALANCE.provisional.nest.careRequest.holdMinutes * 60_000 });
    expect(testClearCare(s, 1000)).toBe(true);
    expect(s.nest.careRequest).toBeNull();
    expect(testClearCare(s, 1000)).toBe(false);
  });
  it('대기 보상: 쌓기 → 받을 수 있다 · 비우기', () => {
    const s = newTestSave(fid);
    expect(testCallIdle(s, 4, 10 * 3_600_000)).toBe(true);
    expect(idleClaimable(s)).toBe(true);
    expect(testCallIdle(s, 0)).toBe(false);
    expect(testClearIdle(s)).toBe(true);
    expect(s.idlePending).toBeNull();
  });
  it('원정 이벤트 타일·바퀴 변이: 예약 → 다음 자유 원정 첫 빈 칸·1바퀴 변이, 입힌 뒤 비운다', () => {
    const ev = testEventTiles(fid);
    const mu = testMutations();
    expect(ev.length).toBeGreaterThan(0);
    expect(mu.length).toBeGreaterThan(0);
    expect(setTestExpeditionForce({ eventTile: 'nope', mutation: 'nope' })).toEqual({ eventTile: null, mutation: null });
    setTestExpeditionForce({ eventTile: ev[0]!, mutation: mu[0]! });
    const s = newTestSave(fid);
    const exp = createExpedition({ factionId: fid, seed: 7, hunger: 0, condition: 100, deck: [], risk: 0, build: s.build, evolution: s.evolution, tileVariants: true });
    const r = applyTestExpeditionForce(exp);
    expect(r).toEqual({ eventTile: ev[0], mutation: mu[0] });
    const cell = exp.slots.indexOf(ev[0]!);
    expect(cell).toBeGreaterThanOrEqual(1);
    expect(exp.wildCells).not.toContain(cell);
    expect(exp.mutation).toBe(mu[0]);
    expect(getTestExpeditionForce()).toEqual({ eventTile: null, mutation: null });
  });
});
