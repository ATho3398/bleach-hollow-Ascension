// C.388 (GDD 236장): 팔기 — 어느 상점에서든 같은 목록, 상점 물건 = 산 값 절반, 그 밖 = 판매가 표, 받는 돈 = 골드, 런 로그 sales, 세이브 형식 71
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { getFaction } from '../src/data/factions';
import { equipGear, grantGear, rollGear, sellGold } from '../src/engine/gear';
import { DETACH_TRAITS } from '../src/engine/traitShop';
import { migrateSave, newSaveData, SAVE_FORMAT_VERSION, SAVE_MIGRATIONS } from '../src/game';
import { foodSellPrice, itemSellPrice, sellEntry, sellNeedsConfirm, sellRows } from '../src/sell';
import { shopBuyPrice } from '../src/shop';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const H = getFaction('hollow');
const T = 1_700_000_000_000;
const SL = BALANCE.provisional.sell;

function fresh() {
  const s = newSaveData('hollow', T);
  s.help.guides.recover = 'done';
  s.shared.items = {};
  s.shared.tradeCoins = 0;
  return s;
}

describe('236장 2: 값', () => {
  it('상점 물건 = 산 값 × 0.5 내림(최소 1): 먹이·약·전투 소모품·정화제·다시 뽑기권', () => {
    expect(foodSellPrice('basic')).toBe(Math.floor(BALANCE.shop.goldPrices['food-basic']! / 2));
    expect(foodSellPrice('snack')).toBe(10);
    expect(foodSellPrice('feast')).toBe(70);
    expect(itemSellPrice('med-cure')).toBe(Math.floor(shopBuyPrice('med-cure')! / 2));
    expect(itemSellPrice('calm')).toBe(40);
    expect(itemSellPrice('reroll')).toBe(60);
    expect(itemSellPrice('heal-patch')).toBe(Math.max(1, Math.floor(shopBuyPrice('heal-patch')! / 2)));
  });
  it('상점에 없는 물건 = 판매가 표: 특식 높게, 거금 특식(relic) 가장 높게, 일반 먹이 15, 떠돌이 상인 품목은 등급 값', () => {
    expect(foodSellPrice('relic')).toBe(600);
    expect(foodSellPrice('elixir')).toBe(200);
    expect(foodSellPrice('sushi')).toBe(15);
    const others = (['basic', 'sushi', 'feast', 'tonic', 'elixir', 'snack'] as const).map(foodSellPrice);
    expect(Math.max(...others)).toBeLessThan(foodSellPrice('relic'));
    expect(itemSellPrice('w-calm-deep')).toBe(SL.wandererGrade.rare);
  });
  it('장비 = 지금 장비 판매가(gear.sellGold, 가방 일괄 판매와 같은 함수) · 특성 = 산 값 절반', () => {
    const s = fresh();
    const it = grantGear(s.shared.gear, rollGear({ grade: 'epic', star: 1 }, () => 0.3), T)!;
    const t = DETACH_TRAITS[0]!;
    s.shared.traits = [t.id];
    const rows = sellRows(s, H);
    expect(rows.find((r) => r.key === `gear:${it.uid}`)?.unit).toBe(sellGold(it));
    expect(rows.find((r) => r.key === `trait-${t.id}`)?.unit).toBe(Math.floor(t.price / 2));
  });
});

describe('236장 1·3: 목록·팔 수 없는 것', () => {
  it('먹이·소모품·장비·특성이 한 목록에, 스킨·꾸밈·펫·수련권·타일은 없음', () => {
    const s = fresh();
    s.shared.food.basic = 3;
    s.shared.items['med-iv'] = 2;
    s.training.tickets = 4;
    const keys = sellRows(s, H).map((r) => r.key);
    expect(keys).toContain('food-basic');
    expect(keys).toContain('med-iv');
    expect(keys.some((k) => k.startsWith('skin') || k.includes('ticket') || k.startsWith('tile'))).toBe(false);
    for (const c of s.shared.cosmetics) expect(keys).not.toContain(c);
  });
  it('장착 중 장비·끼운 특성은 목록에 없다(빼고 판다)', () => {
    const s = fresh();
    const it = grantGear(s.shared.gear, rollGear({ grade: 'normal', star: 1 }, () => 0.1), T)!;
    equipGear(s.shared.gear, it.uid);
    const t = DETACH_TRAITS[0]!;
    s.shared.traits = [t.id];
    s.evolution.abilities = { ...(s.evolution.abilities ?? { owned: {}, equipped: [], slots: 1 }), detached: [t.id] } as never;
    const keys = sellRows(s, H).map((r) => r.key);
    expect(keys).not.toContain(`gear:${it.uid}`);
    expect(keys).not.toContain(`trait-${t.id}`);
  });
  it('튜토리얼 회복 안내 중엔 구급상자 잠김', () => {
    const s = fresh();
    s.help.guides.recover = 'pending';
    s.shared.items['med-cure'] = 1;
    const r = sellRows(s, H).find((e) => e.key === 'med-cure')!;
    expect(r.lock).not.toBe(null);
    expect(sellEntry(s, H, 'med-cure', 1, 'consumable').ok).toBe(false);
    expect(s.shared.items['med-cure']).toBe(1);
  });
});

describe('236장 4·5: 팔기 · 런 로그', () => {
  it('개수만큼 빼고 골드 +, 런 로그 sales (무엇·개수·골드·어느 상점)', () => {
    const s = fresh();
    s.shared.food.basic = 5;
    const r = sellEntry(s, H, 'food-basic', 3, 'gear', T);
    expect(r).toEqual({ ok: true, gold: foodSellPrice('basic') * 3, count: 3 });
    expect([s.shared.food.basic, s.shared.tradeCoins]).toEqual([2, foodSellPrice('basic') * 3]);
    expect(s.runLog.sales).toEqual([{ at: T, factionId: 'hollow', itemId: 'food-basic', count: 3, gold: foodSellPrice('basic') * 3, where: 'gear' }]);
    expect(sellEntry(s, H, 'food-basic', 99, 'gear', T)).toMatchObject({ ok: true, count: 2 }); // 전부 = 가진 만큼
    expect(sellRows(s, H).some((e) => e.key === 'food-basic')).toBe(false);
  });
  it('소모품 상점에서 장비 팔기 — 장비가 목록에서 빠지고 판매가만큼 골드', () => {
    const s = fresh();
    const it = grantGear(s.shared.gear, rollGear({ grade: 'rare', star: 1 }, () => 0.5), T)!;
    const r = sellEntry(s, H, `gear:${it.uid}`, 1, 'consumable', T);
    expect(r).toMatchObject({ ok: true, gold: sellGold(it) });
    expect(s.shared.gear.items.some((g) => g.uid === it.uid)).toBe(false);
    expect(s.runLog.sales[0]!.itemId).toBe(`gear:rare:${it.kind}`);
  });
  it('확인 창: 합계 100 이상 · 특식 · 희귀 이상 장비', () => {
    const e = (key: string, unit: number, group = 'food', grade?: string) => ({ key, unit, group, grade, name: '', count: 9, lock: null }) as never;
    expect(sellNeedsConfirm(e('food-basic', 17), 1)).toBe(false);
    expect(sellNeedsConfirm(e('food-basic', 17), 6)).toBe(true);
    expect(sellNeedsConfirm(e('food-tonic', 50), 1)).toBe(true);
    expect(sellNeedsConfirm(e('gear:x', 40, 'equipment', 'rare'), 1)).toBe(true);
    expect(sellNeedsConfirm(e('gear:x', 15, 'equipment', 'normal'), 1)).toBe(false);
  });
  it('판 뒤 알림 없음(233장) · 모든 상점·떠돌이 상인 탭 끝에 [팔기]', () => {
    const v = read('src/ui/shopView.ts');
    expect(v).toContain("const tabIds: ShopTab[] = only ? ['wanderer', 'sell'] : [...kindTabs, 'sell'];");
    const i = v.indexOf('const doSell');
    expect(v.slice(i, v.indexOf('const openSell'))).not.toMatch(/showToast\(\{ eyebrow: '팔기', title: '팔았다/);
    expect(v).toContain("qty: { max: e.count, ten: true, maxLabel: '전부' }");
  });
});

describe('세이브 형식 71', () => {
  it('70 → 71: 두 트랙 런 로그에 빈 sales', () => {
    expect(SAVE_FORMAT_VERSION).toBe(80); // C.406 쇠약 시계·터치·숨은 모습
    const s = newSaveData('hollow', T) as unknown as Record<string, any>;
    delete s.runLog.sales;
    s.meta.format = 70;
    SAVE_MIGRATIONS[70]!(s as never);
    expect(s.runLog.sales).toEqual([]);
    delete s.runLog.sales;
    s.meta.format = 70;
    const m = migrateSave(JSON.parse(JSON.stringify(s)))!;
    expect(m.meta.format).toBe(80);
    expect(m.runLog.sales).toEqual([]);
  });
});
