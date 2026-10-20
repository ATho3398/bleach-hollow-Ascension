// C.60 (S-16, GDD 25-9): 상점 1차 — 골드 탭 11종(산 즉시 쓰기·상한), 영옥 탭 꾸밈 8분류(보유 공유·착용 트랙별·분류당 1개),
// 다시 뽑기권(흡수 1번에 1장), 덱 칸, 튜토리얼 영옥 +1, 세이브 형식 24 마이그레이션, 런 로그 shopPurchases·흡수 rerolled
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { FACTIONS, getFaction } from '../src/data/factions';
import { ENEMIES } from '../src/data/enemies';
import { TRAITS } from '../src/data/traits';
import { baseTilesFor } from '../src/data/tiles';
import { TUTORIAL_GOALS } from '../src/data/tutorials';
import { CATEGORIES, COSMETIC_ITEMS, GOLD_ITEMS, WEAR_CATEGORIES, cosmeticToken, getCosmetic, skinIdOfItem, skinItemId } from '../src/data/shop';
import { chooseAbsorb, createExpedition, rerollAbsorb } from '../src/engine/expedition';
import type { AbsorbOffer } from '../src/engine/absorb';
import {
  claimTutorialGoals, deckSizeOf, equipSkin, migrateSave, newSaveData, SAVE_FORMAT_VERSION, sanitizeDeck, switchTrack, checkTrackOpen, type SaveData,
} from '../src/game';
import { buyShopItem, goldRows, jadeRows, rareTilePool, shortText, unwearCategory, useRerollTicket, wearCosmetic, wornCosmetics } from '../src/shop';
import { COSMETIC_PARTS } from '../src/ui/bha/cosmetics';
import { boughtText, shopConfirmText } from '../src/ui/shopView';

const SX = BALANCE.provisional.shop;
const H = getFaction('hollow');
const rich = (fid = 'hollow'): SaveData => {
  const s = newSaveData(fid, 1000);
  s.shared.tradeCoins = 5000;
  s.shared.jade = 200;
  return s;
};
const row = (s: SaveData, id: string) => [...goldRows(s, getFaction(s.factionId)), ...jadeRows(s)].find((r) => r.id === id);

describe('상점 데이터 (25-9 표)', () => {
  it('골드 11종·영옥 꾸밈 8분류, 가격은 balance.ts', () => {
    expect(GOLD_ITEMS.map((g) => g.id)).toEqual(['food-snack', 'food-basic', 'food-hearty', 'food-tonic', 'food-feast', 'calm', 'wake', 'training-ticket', 'rare-tile', 'reroll', 'deck-slot']);
    expect(CATEGORIES.map((c) => c.id).slice(0, 8)).toEqual(['skin', 'aura', 'tint', 'trail', 'fx', 'bar', 'shell', 'plate']); // 2차 분류는 c61
    const count = (c: string) => COSMETIC_ITEMS.filter((x) => x.category === c).length;
    expect([count('aura'), count('tint'), count('trail'), count('fx'), count('bar'), count('shell'), count('plate')]).toEqual([4, 4, 3, 3, 3, 3, 3]);
    expect(getCosmetic('skin-grandfisher')?.category).toBe('skin');
    expect(skinIdOfItem(skinItemId('grandfisher'))).toBe('grandfisher');
    expect(Object.values(SX.goldPrices)).toEqual([20, 35, 60, 100, 140, 80, 60, 90, 60, 120]);
    expect(SX.deckSlotPrices).toEqual([400, 800]);
    expect(SX.cosmeticPrices).toMatchObject({ aura: 8, tint: 6, trail: 5, fx: 6, bar: 5, shell: 6, plate: 3 }); // 2차 가격은 c61
    expect(SX.skinPrice).toBe(30);
  });
  it('꾸밈마다 쓰는 색 토큰(--bha-cos-*)이 tokens.css 에 있다 — 화면 코드는 토큰만 참조', () => {
    const css = readFileSync('src/ui/bha/design-system/tokens.css', 'utf8');
    for (const c of COSMETIC_ITEMS.filter((x) => x.category !== 'skin')) {
      for (const part of COSMETIC_PARTS[c.category as (typeof WEAR_CATEGORIES)[number]]) {
        const tok = cosmeticToken(c, part);
        expect(css.includes(`${tok}:`), tok).toBe(true);
      }
    }
  });
  it('상점 코드에 종족 id 분기가 없다', () => {
    for (const f of ['src/shop.ts', 'src/data/shop/index.ts', 'src/ui/shopView.ts', 'src/ui/bha/cosmetics.ts']) {
      const src = readFileSync(f, 'utf8');
      for (const fac of FACTIONS) expect(src.includes(`'${fac.id}'`), `${f}: ${fac.id}`).toBe(false);
    }
  });
});

describe('골드 탭: 산 즉시 쓰기·상한·잠김', () => {
  it('먹이: +1, 골드 차감, 런 로그 기록. 종류별 9개면 잠김. 모자라면 "골드 n 부족"', () => {
    const s = rich();
    const before = s.shared.food.basic;
    const r = buyShopItem(s, H, 'food-basic', 777);
    expect(r.ok).toBe(true);
    expect(s.shared.food.basic).toBe(before + 1);
    expect(s.shared.tradeCoins).toBe(5000 - 35);
    expect(s.runLog.shopPurchases).toEqual([{ at: 777, factionId: 'hollow', itemId: 'food-basic', currency: 'gold', price: 35 }]);
    s.shared.food.snack = 9;
    expect(row(s, 'food-snack')!.canBuy).toBe(false);
    expect(row(s, 'food-snack')!.lock).toBe('보관 가득 (9/9)');
    expect(buyShopItem(s, H, 'food-snack').ok).toBe(false);
    s.shared.tradeCoins = 15;
    expect(row(s, 'food-hearty')!.lock).toBe('골드 45 부족');
    expect(shortText('gold', 45)).toBe('골드 45 부족');
    expect(buyShopItem(s, H, 'food-hearty').ok).toBe(false);
    expect(s.shared.tradeCoins).toBe(15);
  });
  it('정화제 리스크 −30(0 아래로 안 감)·각성제 컨디션 +30(100 위로 안 감), 이미 0/가득이면 잠김, 원정 중간 저장이 있으면 잠김', () => {
    const s = rich();
    s.nest.risk = 20;
    s.nest.condition = 90;
    expect(buyShopItem(s, H, 'calm').ok).toBe(true);
    expect(buyShopItem(s, H, 'wake').ok).toBe(true);
    expect([s.nest.risk, s.nest.condition]).toEqual([0, 100]);
    expect(row(s, 'calm')!.canBuy).toBe(false);
    expect(row(s, 'wake')!.canBuy).toBe(false);
    s.nest.risk = 50;
    s.activeExpedition = {} as SaveData['activeExpedition'];
    expect(row(s, 'calm')!.lock).toContain('원정 중');
  });
  it('수련권: 5단계 이상 트랙에서만 보이고, 지금 트랙 +1 (상한 3)', () => {
    const s = rich();
    expect(row(s, 'training-ticket')).toBeUndefined();
    s.evolution.tierIndex = 4;
    s.training.tickets = 2;
    expect(buyShopItem(s, H, 'training-ticket').ok).toBe(true);
    expect(s.training.tickets).toBe(3);
    expect(row(s, 'training-ticket')!.canBuy).toBe(false);
  });
  it('희귀 타일 꾸러미: 덱 밖 바탕 타일 1장 → 보관함', () => {
    const s = rich();
    s.tiles.deck = ['prey-nest-a', 'prey-nest-a', 'elite-den-a'];
    const pool = rareTilePool(s);
    expect(pool.length).toBeGreaterThan(0);
    expect(pool.every((id) => !s.tiles.deck.includes(id))).toBe(true);
    expect(pool.every((id) => baseTilesFor('hollow').some((t) => t.id === id))).toBe(true);
    const before = { ...s.tiles.collection };
    const r = buyShopItem(s, H, 'rare-tile', 1, () => 0);
    expect(r.ok).toBe(true);
    expect(s.tiles.collection[pool[0]!]).toBe((before[pool[0]!] ?? 0) + 1);
    // 덱에 바탕 타일이 다 있으면 바탕 타일 전체에서
    s.tiles.deck = baseTilesFor('hollow').map((t) => t.id);
    expect(rareTilePool(s).length).toBe(baseTilesFor('hollow').length);
  });
  it('다시 뽑기권: 보유 상한 3, 쓰면 1장 줄어든다', () => {
    const s = rich();
    for (let i = 0; i < 3; i++) expect(buyShopItem(s, H, 'reroll').ok).toBe(true);
    expect(s.shared.rerollTickets).toBe(3);
    expect(row(s, 'reroll')!.lock).toBe('보유 가득 (3/3)');
    expect(useRerollTicket(s)).toBe(true);
    expect(s.shared.rerollTickets).toBe(2);
  });
  it('덱 칸: 400 → 800, 최대 +2, 원정 덱 8 → 9 → 10 (확인 창 품목)', () => {
    const s = rich();
    expect(row(s, 'deck-slot')).toMatchObject({ price: 400, confirm: true });
    expect(row(s, 'food-basic')!.confirm).toBe(false);
    buyShopItem(s, H, 'deck-slot');
    expect([deckSizeOf(s), row(s, 'deck-slot')!.price]).toEqual([9, 800]);
    buyShopItem(s, H, 'deck-slot');
    expect(deckSizeOf(s)).toBe(10);
    expect(row(s, 'deck-slot')).toMatchObject({ price: null, canBuy: false });
    expect(s.shared.tradeCoins).toBe(5000 - 1200);
    for (const id of Object.keys(s.tiles.collection)) s.tiles.collection[id] = 3;
    expect(sanitizeDeck({ ...s.tiles, deck: [] }, 'hollow', deckSizeOf(s)).length).toBe(10);
  });
});

describe('영옥 탭: 꾸밈 보유(공유)·착용(트랙별, 분류당 1개)', () => {
  it('사면 보유, 영옥 차감·기록, 다시 못 산다. 확인 창. 착용·해제', () => {
    const s = rich();
    expect(row(s, 'aura-blue')).toMatchObject({ price: 8, canBuy: true, confirm: true, owned: false });
    expect(wearCosmetic(s, 'aura-blue')).toBe(false); // 안 산 것은 못 입는다
    const r = buyShopItem(s, H, 'aura-blue', 5);
    expect(r.ok).toBe(true);
    expect(s.shared.jade).toBe(192);
    expect(s.shared.cosmetics).toContain('aura-blue');
    expect(s.runLog.shopPurchases.at(-1)).toEqual({ at: 5, factionId: 'hollow', itemId: 'aura-blue', currency: 'jade', price: 8 });
    expect(buyShopItem(s, H, 'aura-blue').ok).toBe(false);
    expect(wearCosmetic(s, 'aura-blue')).toBe(true);
    expect(row(s, 'aura-blue')!.worn).toBe(true);
    buyShopItem(s, H, 'aura-gold');
    wearCosmetic(s, 'aura-gold');
    expect(s.wear.aura).toBe('aura-gold'); // 분류당 1개
    expect(row(s, 'aura-blue')!.worn).toBe(false);
    unwearCategory(s, 'aura');
    expect(s.wear.aura).toBeUndefined();
    s.shared.jade = 2;
    expect(row(s, 'plate-gold')!.lock).toBe('영옥 1 부족');
  });
  it('스킨: 이 종족이 입을 수 있는 것만 줄에 나오고, 산 뒤 [착용] = 스킨을 입는다. 상태 화면 스킨 패널은 보유만', () => {
    const h = rich('hollow');
    const other = FACTIONS.find((f) => f.id !== 'hollow')!.id;
    expect(jadeRows(h).some((r) => r.id === 'skin-grandfisher')).toBe(true);
    expect(jadeRows(rich(other)).some((r) => r.id === 'skin-grandfisher')).toBe(false);
    expect(equipSkin(h, 'grandfisher')).toBe(false);
    expect(buyShopItem(h, H, 'skin-grandfisher').ok).toBe(true);
    expect(h.shared.jade).toBe(200 - SX.skinPrice);
    expect(wearCosmetic(h, 'skin-grandfisher')).toBe(true);
    expect(h.skin).toBe('grandfisher');
    unwearCategory(h, 'skin');
    expect(h.skin).toBeNull();
  });
  it('보유는 두 트랙 공유, 착용은 트랙마다 (트랙 전환 후 따로)', () => {
    const s = rich();
    s.evolution.tierIndex = 4;
    checkTrackOpen(s, 2000);
    buyShopItem(s, H, 'tint-mono');
    wearCosmetic(s, 'tint-mono');
    const other = s.otherTracks[0]!.factionId;
    expect(switchTrack(s, other, 3000)).toBe(true);
    expect(s.wear).toEqual({ keyring: 'keyring-orb', device: 'device-badge' }); // 새 트랙도 기본 키링 (C.64)·기본 기기 (C.65)
    expect(row(s, 'tint-mono')!.owned).toBe(true);
    wearCosmetic(s, 'tint-mono');
    unwearCategory(s, 'tint');
    switchTrack(s, 'hollow', 4000);
    expect(s.wear.tint).toBe('tint-mono');
    expect(wornCosmetics(s).map((c) => c.id)).toEqual(['keyring-orb', 'device-badge', 'tint-mono']);
  });
  it('확인 창·토스트 문구', () => {
    const s = rich();
    const r = row(s, 'shell-gold')!;
    const t = shopConfirmText(r);
    expect(t.title).toBe('금박 — 영옥 6');
    expect(t.body).toContain('기기 껍데기');
    const b = buyShopItem(s, H, 'food-snack');
    expect(b.ok && boughtText(row(s, 'food-snack')!, b).eyebrow).toBe('상점 — 골드 −20');
  });
});

describe('다시 뽑기 (흡수 화면)', () => {
  const offerFor = (cands: string[], el: string, enemyId: string): AbsorbOffer => ({
    enemyId, element: el, ev: {}, rare: false, elite: false, strength: 30, candidates: cands, reasons: ['first-absorb'], chain3Count: 0, weakChain3Count: 0, finisherElement: null,
  });
  it('후보를 같은 수로 다시 뽑고(겹치지 않게), 흡수 1번에 1번만. 흡수 기록에 rerolled', () => {
    const s = newSaveData('hollow', 1);
    const e = createExpedition({ factionId: 'hollow', seed: 99, hunger: 20, condition: 80, deck: sanitizeDeck(s.tiles, 'hollow'), build: s.build, evolution: s.evolution });
    const enemy = ENEMIES.find((x) => x.class === 'normal' && !x.testOnly)!;
    const own = TRAITS.filter((t) => t.element === enemy.element && !t.rare && !t.boss).map((t) => t.id);
    e.phase = 'absorb';
    e.absorbOffer = offerFor(own.slice(0, 2), enemy.element, enemy.id);
    const before = [...e.absorbOffer.candidates];
    expect(rerollAbsorb(e).ok).toBe(true);
    const after = e.absorbOffer!.candidates;
    expect(after.length).toBe(2);
    expect(after.some((id) => !before.includes(id))).toBe(true);
    expect(e.absorbOffer!.rerolled).toBe(true);
    expect(rerollAbsorb(e)).toEqual({ ok: false, reason: '이 흡수에서는 이미 다시 뽑았다' });
    expect(chooseAbsorb(e, after[0]!).ok).toBe(true);
    expect(e.absorbRecords.at(-1)!.rerolled).toBe(true);
  });
  it('확정 후보(희귀 특성)는 그대로 남는다', () => {
    const s = newSaveData('hollow', 1);
    const e = createExpedition({ factionId: 'hollow', seed: 5, hunger: 20, condition: 80, deck: sanitizeDeck(s.tiles, 'hollow'), build: s.build, evolution: s.evolution });
    const rare = TRAITS.find((t) => t.rare && !t.boss)!;
    const plain = TRAITS.find((t) => t.element === rare.element && !t.rare && !t.boss)!;
    const enemy = ENEMIES.find((x) => x.element === rare.element) ?? ENEMIES[0]!;
    e.phase = 'absorb';
    e.absorbOffer = { ...offerFor([rare.id, plain.id], rare.element, enemy.id), rare: true };
    rerollAbsorb(e);
    expect(e.absorbOffer!.candidates[0]).toBe(rare.id);
    expect(e.absorbOffer!.candidates.length).toBe(2);
  });
});

describe('튜토리얼 영옥 +1 · 세이브 형식 24', () => {
  it('튜토리얼 목표 하나마다 영옥 +1 (기존 보상은 그대로)', () => {
    const s = newSaveData('hollow', 1);
    s.help.tutorialSeen = true;
    const g = claimTutorialGoals(s, 10);
    expect(g.map((x) => x.goal.id)).toEqual(['tutorial']);
    expect(g[0]!.jade).toBe(SX.tutorialJade);
    expect(s.shared.jade).toBe(SX.tutorialJade);
    expect(TUTORIAL_GOALS.length).toBe(10);
  });
  it('형식 23 → 24: 그랜드피셔를 입고 있으면 보유로(벗기지 않음), 그 밖에는 보유 없음·뽑기권 0·덱 칸 0, 받은 튜토리얼만큼 영옥 소급, 구매 기록 빈 목록', () => {
    expect(SAVE_FORMAT_VERSION).toBeGreaterThanOrEqual(24);
    const s = newSaveData('hollow', 1);
    const old = JSON.parse(JSON.stringify(s)) as Record<string, any>;
    old.meta.format = 23;
    old.skin = 'grandfisher';
    delete old.wear;
    delete old.runLog.shopPurchases;
    old.shared = { ...old.shared, jade: 7, tutorials: { hollow: [{ goalId: 'tutorial', at: 1 }, { goalId: 'first-return', at: 2 }] } };
    delete old.shared.rerollTickets;
    delete old.shared.deckSlots;
    delete old.shared.cosmetics;
    const m = migrateSave(old)!;
    expect(m.meta.format).toBe(SAVE_FORMAT_VERSION);
    expect(m.skin).toBe('grandfisher');
    expect(m.shared.cosmetics).toEqual(['keyring-orb', 'device-badge', 'skin-grandfisher']); // 기본 키링 (C.64)·기본 기기 (C.65)
    expect([m.shared.rerollTickets, m.shared.deckSlots]).toEqual([0, 0]);
    expect(m.shared.jade).toBe(7 + 2 * SX.tutorialJade);
    expect(m.wear).toEqual({ keyring: 'keyring-orb', device: 'device-badge' }); // 기본 키링 (C.64)·기본 기기 (C.65)
    expect(m.runLog.shopPurchases).toEqual([]);
    // 입지 않은 옛 세이브: 산 것 없음(기본 키링만)
    const plain = JSON.parse(JSON.stringify(s)) as Record<string, any>;
    plain.meta.format = 23;
    delete plain.shared.cosmetics;
    expect(migrateSave(plain)!.shared.cosmetics).toEqual(['keyring-orb', 'device-badge']);
  });
  it('저장 왕복: 깨진 착용·안 산 착용·상한 넘는 값은 보정', () => {
    const s = rich();
    buyShopItem(s, H, 'bar-ink');
    wearCosmetic(s, 'bar-ink');
    const raw = JSON.parse(JSON.stringify(s)) as Record<string, any>;
    raw.wear.shell = 'shell-gold'; // 안 샀다
    raw.wear.aura = 'tint-mono'; // 분류가 다르다
    raw.shared.rerollTickets = 99;
    raw.shared.deckSlots = 7;
    raw.shared.cosmetics.push('nope');
    raw.skin = 'grandfisher'; // 안 샀다
    const m = migrateSave(raw)!;
    expect(m.wear).toEqual({ bar: 'bar-ink', keyring: 'keyring-orb', device: 'device-badge' }); // 기본 키링·기기 자동 착용 (C.64·C.65)
    expect([m.shared.rerollTickets, m.shared.deckSlots]).toEqual([SX.rerollMax, SX.deckSlotPrices.length]);
    expect(m.shared.cosmetics).toEqual(['keyring-orb', 'device-badge', 'bar-ink']);
    expect(m.skin).toBeNull();
  });
});
