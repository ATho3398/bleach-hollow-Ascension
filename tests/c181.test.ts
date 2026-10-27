// C.181 (GDD 109장 6·7): 먹이 배부름 고기 3·사냥감 5, 10분에 3개(넘으면 뱉음), 배부름 시간당 감소, 테스트 모드 키링·진화·아이템 생성·스킨·시간 앞당기기
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { feedFood, feedResetMs, feedsLeft, fullnessOfNest, newNest, passNestTime } from '../src/engine/nest';
import { feedNest, loadSave, newSaveData, writeSave, SAVE_FORMAT_VERSION } from '../src/game';
import { useInventoryItem } from '../src/inventory';
import { getFaction } from '../src/data/factions';
import {
  advanceTestTime, countKeyringTap, createTestItem, KEYRING_WINDOW_MS, newTestSave, setForm, testEvolveNext, testItemIds, testSkins, testUnwearAll, testWearCosmetic, testWearSkin, TEST_ITEM_KINDS,
} from '../src/engine/testMode';
import { COSMETIC_ITEMS } from '../src/data/shop';

const NX = BALANCE.provisional.nest;
const MIN = 60_000;
const H = 3_600_000;
/** 실제 시각 근처 (lastFedAt 0 = 먹인 적 없음) */
const T = Date.now();

describe('109장 6 먹이 수치', () => {
  it('고기(basic) +3 · 사냥감(hearty) +5, 다른 먹이도 약 0.09배', () => {
    expect(NX.foods.basic.hunger).toBe(3);
    expect(NX.foods.hearty.hunger).toBe(5);
    expect(NX.foods.snack.hunger).toBeLessThan(NX.foods.basic.hunger);
    expect(NX.foods.feast.hunger).toBeGreaterThan(NX.foods.hearty.hunger);
    expect(NX.foods.feast.hunger).toBeLessThanOrEqual(10);
  });
  it('한 번 와서 3개 = 고기 약 1.8시간 · 사냥감 3시간 버팀 (시간당 감소)', () => {
    const r = NX.idleHungerPerHour;
    expect((3 * NX.foods.basic.hunger) / r).toBeGreaterThanOrEqual(1);
    expect((3 * NX.foods.basic.hunger) / r).toBeLessThanOrEqual(2);
    expect((3 * NX.foods.hearty.hunger) / r).toBeLessThanOrEqual(3);
  });
  it('밤 8시간 비우기: 배부름 61 이상이면 쇠약 없음, 48시간 전에는 빈사 없음', () => {
    const n = newNest(0);
    n.hunger = 100 - 61;
    passNestTime(n, 8, true);
    expect(fullnessOfNest(n)).toBeGreaterThan(NX.care.weakFullness);
    expect(n.weakened).toBe(false);
    expect(n.collapsed).toBe(false);
  });
});

describe('109장 6 10분에 3개 — 넘으면 뱉음', () => {
  it('3개까지 먹고 4번째는 뱉는다 (효과·교감 없음), 남은 개수 3 → 0', () => {
    const n = newNest(0);
    n.hunger = 80;
    expect(feedsLeft(n, T)).toBe(3);
    for (let i = 0; i < 3; i++) expect(feedFood(n, 'basic', T + i * MIN)).toBe('ate');
    expect(n.hunger).toBe(80 - 9);
    expect(feedsLeft(n, T + 3 * MIN)).toBe(0);
    const bond = n.bond;
    expect(feedFood(n, 'hearty', T + 3 * MIN)).toBe('spat');
    expect(n.hunger).toBe(71);
    expect(n.bond).toBe(bond);
    expect(feedResetMs(n, T + 3 * MIN)).toBe(2 * MIN + 10 * MIN - 3 * MIN);
  });
  it('마지막으로 먹인 뒤 10분이 지나면 다시 3개 (뱉은 건 시각을 안 옮긴다)', () => {
    const n = newNest(0);
    n.hunger = 90;
    for (let i = 0; i < 3; i++) feedFood(n, 'snack', T);
    feedFood(n, 'snack', T + 5 * MIN); // 뱉음
    expect(feedsLeft(n, T + 9 * MIN)).toBe(0);
    expect(feedsLeft(n, T + 10 * MIN)).toBe(3);
    expect(feedFood(n, 'snack', T + 10 * MIN)).toBe('ate');
    expect(feedsLeft(n, T + 10 * MIN)).toBe(2);
  });
  it('세이브: 먹이는 없어지고 런 로그 vitals 에 spit 한 줄, 보관함 사용도 같은 규칙', () => {
    const save = newSaveData('hollow', 0);
    save.shared.food.basic = 9;
    const now = Date.now();
    for (let i = 0; i < 3; i++) expect(feedNest(save, 'basic', now)).toBe('ate');
    expect(feedNest(save, 'basic', now)).toBe('spat');
    expect(save.shared.food.basic).toBe(5);
    expect(save.runLog.vitals.filter((v) => v.kind === 'spit')).toEqual([expect.objectContaining({ kind: 'spit', food: 'basic', at: now })]);
    const r = useInventoryItem(save, getFaction('hollow'), 'food-basic');
    expect(r).toMatchObject({ ok: true, spat: true });
    expect(save.shared.food.basic).toBe(4);
  });
  it('세이브 왕복: 먹인 개수·시각이 남고 형식 49', () => {
    expect(SAVE_FORMAT_VERSION).toBe(49);
    const store = new Map<string, string>();
    const st = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
    const save = newSaveData('hollow', 0);
    save.nest.feedCount = 2;
    save.nest.lastFedAt = 12345;
    writeSave(st, save);
    const back = loadSave(st);
    expect(back?.nest.feedCount).toBe(2);
    expect(back?.nest.lastFedAt).toBe(12345);
  });
});

describe('109장 7 테스트 모드', () => {
  it('키링: 1초 안 3번이면 켜기, 간격이 벌어지면 다시 센다', () => {
    let t = countKeyringTap([], 0);
    t = countKeyringTap(t.taps, 300);
    expect(t.fire).toBe(false);
    expect(countKeyringTap(t.taps, 900).fire).toBe(true);
    let u = countKeyringTap([], 0);
    u = countKeyringTap(u.taps, 600);
    expect(countKeyringTap(u.taps, KEYRING_WINDOW_MS + 1).fire).toBe(false);
  });
  it('진화: 1단계에서 다음 진화를 바로 (슬롯 +1·기록), 마지막 단계면 안 됨', () => {
    const s = newTestSave('hollow', 1);
    expect(testEvolveNext(s, 2).ok).toBe(false);
    setForm(s, null);
    const slots = s.build.slots.length;
    const evo0 = s.runLog.tiers.evolutions.length;
    const r = testEvolveNext(s, 3);
    expect(r.ok).toBe(true);
    expect(s.evolution.tierIndex).toBe(1);
    expect(s.build.slots.length).toBe(slots + 1);
    expect(s.runLog.tiers.evolutions.length).toBe(evo0 + 1);
  });
  it('아이템 생성: 분류마다 목록이 있고, 장비는 등급·강화, 먹이는 상한까지', () => {
    for (const k of TEST_ITEM_KINDS) expect(testItemIds(k).length).toBeGreaterThan(0);
    const s = newSaveData('hollow', 0);
    expect(createTestItem(s, { kind: 'gear', id: 'weapon', count: 2, grade: 'legendary', plus: 3 }, 1, () => 0.5)).toBe(2);
    expect(s.shared.gear.items.map((i) => [i.kind, i.grade, i.plus])).toEqual([['weapon', 'legendary', 3], ['weapon', 'legendary', 3]]);
    s.shared.food.hearty = 0;
    expect(createTestItem(s, { kind: 'food', id: 'hearty', count: 50 })).toBe(BALANCE.provisional.food.cap);
    expect(createTestItem(s, { kind: 'currency', id: 'gold', count: 777 })).toBe(777);
    expect(s.shared.tradeCoins).toBe(777);
    const cos = testItemIds('cosmetic').find((id) => !s.shared.cosmetics.includes(id))!;
    expect(createTestItem(s, { kind: 'cosmetic', id: cos, count: 1 })).toBe(1);
    expect(s.shared.cosmetics).toContain(cos);
    const med = testItemIds('consumable')[0]!;
    expect(createTestItem(s, { kind: 'consumable', id: med, count: 2 })).toBe(2);
  });
  it('스킨: 이 종족 스킨 전부 착용·해제, 꾸밈은 안 가져도 입힌다, 전부 해제', () => {
    const s = newSaveData('hollow', 0);
    const skins = testSkins('hollow');
    expect(skins.length).toBeGreaterThan(0);
    for (const k of skins) expect(testWearSkin(s, k.id)).toBe(true);
    expect(testWearSkin(s, null)).toBe(true);
    expect(s.skin).toBe(null);
    const c = COSMETIC_ITEMS.find((x) => x.category !== 'skin' && x.category !== 'device' && !s.shared.cosmetics.includes(x.id))!;
    expect(testWearCosmetic(s, c.id)).toBe(true);
    expect(Object.values(s.wear)).toContain(c.id);
    testUnwearAll(s);
    expect(s.wear).toEqual({});
  });
  it('시간 앞당기기: +10분이면 먹이 한도가 다시 열리고, +1일이면 배부름이 하루치 준다', () => {
    const now = 100 * H;
    const s = newSaveData('hollow', now);
    s.lastSeenAt = now;
    s.nest.lastTickMs = now;
    s.nest.hunger = 0;
    s.shared.food.snack = 9;
    for (let i = 0; i < 3; i++) feedNest(s, 'snack', now);
    expect(feedsLeft(s.nest, now)).toBe(0);
    advanceTestTime(s, 10, now);
    expect(feedsLeft(s.nest, now)).toBe(3);
    const before = s.nest.hunger;
    const rep = advanceTestTime(s, 24 * 60, now);
    expect(rep.hours).toBeCloseTo(24);
    expect(s.nest.hunger).toBeCloseTo(Math.min(100, before + 24 * NX.idleHungerPerHour));
  });
});
