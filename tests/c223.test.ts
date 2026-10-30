// C.223 (GDD 144·145장): 체력 회복 물건 4종(원정·전투 전용) · 상점 하루 판매 수 · 온천 5분(튜토리얼만 10초) · 진화하면 체력 가득 · 시작 가방
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { getFaction } from '../src/data/factions';
import { getGoldItem, getWandererItem } from '../src/data/shop';
import { RECOVER_SCENES } from '../src/data/help';
import { dayKey, enterSpa, newNest, passNestTime } from '../src/engine/nest';
import { testEvolveNext } from '../src/engine/testMode';
import { migrateSave, newSaveData, SAVE_FORMAT_VERSION, SAVE_MIGRATIONS } from '../src/game';
import { battleItemEffectOf, HEAL_ITEM_IDS, HEAL_ROOM_LOCK, inventoryOf, useHealItemOnWalk, useInventoryItem } from '../src/inventory';
import { buyShopItem, goldRows, shopDailyLeft, SOLD_OUT_TODAY } from '../src/shop';

const H = getFaction('hollow');
const T0 = new Date(2026, 9, 30, 12, 0, 0).getTime();
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('144장 1: 회복 물건 4종', () => {
  it('반창고 10% · 붕대 25%(옛 battle-potion) · 회복약 50% · 치료제 100%(옛 w-hp-potion), 값·하루 판매 수', () => {
    expect(HEAL_ITEM_IDS).toEqual(['heal-patch', 'battle-potion', 'heal-salve', 'w-hp-potion']);
    expect(HEAL_ITEM_IDS.map((id) => getGoldItem(id)?.name)).toEqual(['반창고', '붕대', '회복약', '치료제']);
    const BI = BALANCE.provisional.battleItems;
    expect(HEAL_ITEM_IDS.map((id) => { const b = BI[id]!; return b.effect === 'heal' ? [b.fraction, b.price, b.daily] : null; })).toEqual([[0.1, 20, 5], [0.25, 50, 3], [0.5, 110, 2], [1, 320, 1]]);
    expect(getWandererItem('w-hp-potion')?.name).toBe('치료제'); // 떠돌이 상인도 그대로 판다
  });
  it("'체력 포션' 이름이 화면·도움말·튜토리얼에 없다", () => {
    for (const p of ['src/data/shop/items.json', 'src/data/shop/wanderer.json', 'src/data/help/tutorial.json', 'src/data/help/glossary.json', 'src/shop.ts', 'src/inventory.ts']) expect(read(p), p).not.toContain('체력 포션');
  });
});

describe('144장 2·3: 쓰는 곳 = 원정 걷기·전투만', () => {
  it('방에서는 가방 카드가 잠겨 있고 안 쓴다', () => {
    const s = newSaveData('hollow', T0);
    s.nest.hpFraction = 0.3;
    for (const id of HEAL_ITEM_IDS) {
      s.shared.items[id] = 1;
      expect(inventoryOf(s, H).find((e) => e.id === id)?.lock).toBe(HEAL_ROOM_LOCK);
      expect(useInventoryItem(s, H, id).ok).toBe(false);
    }
    expect(s.nest.hpFraction).toBe(0.3);
  });
  it('걷기 중 가방: 원정 체력이 차고 1개 줄고 런 로그에 남는다 · 가득이면 못 쓴다', () => {
    const s = newSaveData('hollow', T0);
    s.shared.items = { 'heal-salve': 2 };
    const exp = { hpFraction: 0.3 };
    expect(useHealItemOnWalk(s, exp, 'heal-salve')).toEqual({ ok: true, from: 0.3, to: 0.8 });
    expect(exp.hpFraction).toBeCloseTo(0.8);
    expect(s.shared.items['heal-salve']).toBe(1);
    expect(s.runLog.homeHeals.at(-1)).toMatchObject({ kind: 'item', itemId: 'heal-salve', hpFrom: 0.3, hpTo: 0.8 });
    expect(useHealItemOnWalk(s, exp, 'heal-salve')).toMatchObject({ ok: true, to: 1 });
    expect(useHealItemOnWalk(s, exp, 'heal-patch')).toMatchObject({ ok: false });
  });
  it('전투: 소모품 칸에 4종 무엇이든 — 회복량 = 그 물건 비율', () => {
    const s = newSaveData('hollow', T0);
    for (const id of HEAL_ITEM_IDS) {
      s.shared.items[id] = 1;
      s.shared.battleItem = id;
      const b = BALANCE.provisional.battleItems[id]!;
      expect(battleItemEffectOf(s)).toEqual({ id, effect: 'heal', fraction: b.effect === 'heal' ? b.fraction : 0 });
    }
  });
  it('원정 화면 [가방] 버튼 · 앱이 회복 물건 창을 연다', () => {
    expect(read('src/ui/expeditionView.ts')).toContain("if (h.openBag) cornerRow.append(bagBtn);");
    expect(read('src/ui/app.ts')).toContain('const r = useHealItemOnWalk(sv, exp, id);');
  });
});

describe('144장 4·145장 3: 튜토리얼 회복 안내 · 시작 가방', () => {
  it('방 포션 단계·상인 안내 삭제 → 구급상자 → 온천', () => {
    expect(RECOVER_SCENES.map((s) => s.id)).toEqual(['dying', 'to-bag', 'cure', 'to-spa', 'spa-rest', 'feed', 'done']);
  });
  it('새 세이브 가방 = 구급상자 3 + 반창고 3·붕대 2·회복약 1', () => {
    expect(newSaveData('hollow', T0).shared.items).toEqual({ 'med-cure': 3, 'heal-patch': 3, 'battle-potion': 2, 'heal-salve': 1 });
  });
  it('첫 원정 회복 물건 안내 한 줄(노란 알림)', () => {
    expect(read('src/ui/app.ts')).toContain("title: '원정·전투 중에 체력이 모자라면 회복 물건을 쓴다'");
  });
});

describe('145장 1: 온천 = 약 5분, 튜토리얼 온천만 10초', () => {
  it('평소: 5분에 체력 0 → 가득·컨디션 +100·배부름 −10', () => {
    const n = newNest(0);
    n.hpFraction = 0;
    n.condition = 0;
    n.hunger = 0;
    expect(enterSpa(n, 0)).toBeNull();
    passNestTime(n, 299 / 3600, false, 299_000);
    expect(n.spa).not.toBeNull();
    const f = passNestTime(n, 2 / 3600, false, 301_000);
    expect(f.spaEnded?.reason).toBe('full');
    expect(n.hpFraction).toBeCloseTo(1, 6);
    expect(100 - n.hunger).toBeGreaterThan(89); // 온천 −10 + 평소 시간 흐름 5분
  });
  it('튜토리얼(회복 안내 중) 온천 = fast, 10초에 가득', () => {
    const n = newNest(0);
    n.hpFraction = 0;
    n.condition = 0;
    n.hunger = 0;
    enterSpa(n, 0, true);
    expect(n.spa?.fast).toBe(true);
    passNestTime(n, 10 / 3600, false, 10_000);
    expect(n.hpFraction).toBeCloseTo(1, 6);
  });
  it('쉬기 카드: 수치 없이 상황만 (GDD 157장 4 — "튜토리얼 온천은 10초…·평소 n분" 삭제), 평소 5분은 그대로', () => {
    expect(RECOVER_SCENES.find((s) => s.id === 'spa-rest')!.body).toBe('{spaName}에서는 체력이 빠르게 찬다.\n이제 방으로 돌아가자.');
    expect(Math.round(1 / BALANCE.provisional.nest.homeHp.spa.hpPerSecond / 60)).toBe(5);
  });
});

describe('145장 2: 진화하면 체력 가득', () => {
  it('진화 순간 체력 = 가득(빈사면 상한까지), 런 로그 evolution', () => {
    const s = newSaveData('hollow', T0);
    s.nest.hpFraction = 0.25;
    expect(testEvolveNext(s, T0).ok).toBe(true);
    expect(s.nest.hpFraction).toBe(1);
    expect(s.runLog.homeHeals.at(-1)).toMatchObject({ kind: 'evolution', hpFrom: 0.25, hpTo: 1 });
  });
});

describe('145장 4: 상점 약 칸 — 하루 판매 수', () => {
  it('약 칸에 4종 · 반창고 하루 5개 다 사면 오늘 다 팔림 · 다음 날 다시', () => {
    const s = newSaveData('hollow', T0);
    s.shared.items = {};
    s.shared.tradeCoins = 10_000;
    const row = () => goldRows(s, H).find((r) => r.id === 'heal-patch')!;
    expect(row().have).toBe('오늘 5/5');
    for (let i = 0; i < 5; i++) expect(buyShopItem(s, H, 'heal-patch', T0).ok).toBe(true);
    expect(s.shared.shopDaily).toEqual({ day: dayKey(T0), bought: { 'heal-patch': 5 } });
    expect(shopDailyLeft(s, 'heal-patch', T0)).toBe(0);
    expect(goldRows(s, H).find((r) => r.id === 'heal-patch')!.lock).toBe(SOLD_OUT_TODAY);
    expect(buyShopItem(s, H, 'heal-patch', T0).ok).toBe(false);
    expect(shopDailyLeft(s, 'heal-patch', T0 + 86_400_000)).toBe(5);
    expect(shopDailyLeft(s, 'med-cure', T0)).toBeNull(); // 구급상자는 하루 제한 없음
  });
});

describe('세이브 형식 57 (56 → 57 마이그레이션)', () => {
  it('하루 판매 기록이 빈 것으로 생기고, 가방 개수(옛 id)는 그대로', () => {
    expect(SAVE_FORMAT_VERSION).toBe(61); // C.227 · C.226 · C.225
    expect(typeof SAVE_MIGRATIONS[56]).toBe('function');
    const s = newSaveData('hollow', T0);
    s.shared.items = { 'battle-potion': 4, 'w-hp-potion': 1 };
    const raw = JSON.parse(JSON.stringify(s));
    raw.meta.format = 56;
    delete raw.shared.shopDaily;
    const m = migrateSave(raw)!;
    expect(m.meta.format).toBe(SAVE_FORMAT_VERSION);
    expect(m.shared.shopDaily).toEqual({ day: '', bought: {} });
    expect(m.shared.items).toEqual({ 'battle-potion': 4, 'w-hp-potion': 1 });
  });
});
