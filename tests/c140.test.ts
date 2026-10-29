// C.140 (GDD 85장 4·5·6·11번, 86장 4·5번, 88장 7번): 에스파다 1~10 칭호 · 떠돌이 상인 · 대기 모드 · 배치 프리셋(덱 삭제) · 보관함
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { getFaction } from '../src/data/factions';
import { TITLES, titleName } from '../src/data/titles';
import { ITEM_CATEGORIES, itemCategoryOf, WANDERER_ITEMS } from '../src/data/shop';
import { createExpedition, beginPlanning, placeTile } from '../src/engine/expedition';
import { advanceWanderer, expectedLapsToVisit, newWandererState, rollWandererStock, sanitizeWanderer, wandererChance, wandererGradeOdds } from '../src/engine/wanderer';
import { idleActiveHours, idleYield, offlineHours } from '../src/engine/idle';
import { createRng, nextFloat } from '../src/engine/rng';
import { migrateSave, newSaveData, recordExpedition, settleIdle, MIN_LOADABLE_SAVE_FORMAT, SAVE_FORMAT_VERSION, type SaveData } from '../src/game';
import { buyShopItem, buyWandererItem, wandererRows } from '../src/shop';
import { equipInventoryItem, inventoryOf, unequipInventoryItem, useInventoryItem } from '../src/inventory';
import { applyTilePreset, cellsOfPlan, deleteTilePreset, ownedTileList, placementLimitOf, sanitizeTilePresets, saveTilePreset, tilePresetsFor } from '../src/tilePresets';

const H = getFaction('hollow');
const S = getFaction('shinigami');
const WX = BALANCE.provisional.wanderer;
const IX = BALANCE.provisional.idle;
const HOUR = 3_600_000;

/** 원정 하나를 laps 바퀴 마치고 귀환한 상태로 */
function ended(save: SaveData, laps: number, seed = 7) {
  const exp = createExpedition({ factionId: save.factionId, seed, hunger: 20, condition: 80, deck: [], build: save.build, evolution: save.evolution });
  exp.phase = 'ended';
  exp.outcome = 'returned';
  exp.endReason = 'returned';
  exp.lapsCompleted = laps;
  return exp;
}

describe('85장 4번 칭호 도감 에스파다 No.1~10', () => {
  it('등급 칭호가 No.10~No.1 열 개, 조건은 등급전 그 번호 도달(provisional), 사신 이름은 21-1 등급표', () => {
    const ranks = TITLES.filter((t) => t.kind === 'rank');
    expect(ranks.map((t) => titleName(t, 'hollow'))).toEqual([10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((n) => `에스파다 No.${n}`));
    expect(ranks.map((t) => (t.condition as { rank: number }).rank)).toEqual([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
    expect(ranks.every((t) => t.provisional === true && !t.hidden)).toBe(true);
    expect(ranks.map((t) => titleName(t, 'shinigami'))).toEqual(['9석', '8석', '7석', '6석', '5석', '4석', '3석', '부대장', '대장 대행', '대장']);
    // 종족 설정 rankNames(번호 1~10)와 같은 이름
    for (const f of [H, S]) expect(ranks.map((t) => titleName(t, f.id))).toEqual([10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((n) => f.rankNames[n - 1]));
  });
});

describe('85장 5번 떠돌이 상인', () => {
  it('바퀴마다 가중: 앞 바퀴는 거의 0, 평균 30~50바퀴, 30바퀴 안에 올 확률은 절반 미만', () => {
    expect(wandererChance(1)).toBeLessThan(0.002);
    expect(wandererChance(10)).toBeCloseTo(WX.perLap * 10);
    const mean = expectedLapsToVisit();
    expect(mean).toBeGreaterThanOrEqual(30);
    expect(mean).toBeLessThanOrEqual(50);
    let surv = 1;
    for (let k = 1; k <= 30; k++) surv *= 1 - wandererChance(k);
    expect(1 - surv).toBeLessThan(0.5);
    // 몬테카를로로도 평균 30~50
    const rng = createRng(42);
    let sum = 0;
    const N = 3000;
    for (let i = 0; i < N; i++) {
      const st = newWandererState();
      let laps = 0;
      while (!st.visit) {
        advanceWanderer(st, 1, { at: 0, runId: 0 }, () => nextFloat(rng));
        laps++;
      }
      sum += laps;
    }
    expect(sum / N).toBeGreaterThan(30);
    expect(sum / N).toBeLessThan(50);
  });
  it('숨은 티어마다 등급표가 다르다: 티어 1 은 전설 없음, 티어 4 는 보통 없음. 품목 4칸·중복 없음·상인 전용', () => {
    expect(wandererGradeOdds(1).legendary).toBe(0);
    expect(wandererGradeOdds(4).normal).toBe(0);
    for (let t = 1; t <= 4; t++) {
      const o = wandererGradeOdds(t);
      expect(Object.values(o).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    }
    const rng = createRng(3);
    for (let i = 0; i < 50; i++) {
      const stock = rollWandererStock(4, () => nextFloat(rng));
      expect(stock).toHaveLength(WX.stockSize);
      expect(new Set(stock.map((s) => s.itemId)).size).toBe(WX.stockSize);
      expect(stock.every((s) => s.price === WX.items[s.itemId]!.price)).toBe(true);
    }
    // 상인 품목은 골드 상점 목록에 없다
    expect(WANDERER_ITEMS.every((w) => buyShopItem(newSaveData('hollow', 1), H, w.id).ok === false)).toBe(true);
  });
  it('원정 귀환 때 바퀴를 굴려 오면 런 로그 arrive, 사면 효과·buy, 다음 귀환 때 leave', () => {
    const s = newSaveData('hollow', 1);
    s.shared.wanderer.lapsSince = 2000; // 다음 바퀴 확률 1
    recordExpedition(s, ended(s, 3), 100);
    const v = s.shared.wanderer.visit!;
    expect(v).not.toBeNull();
    expect(v.stock).toHaveLength(WX.stockSize);
    expect(s.runLog.wanderer).toEqual([{ at: 100, factionId: 'hollow', kind: 'arrive', tier: v.tier, runId: 0, waited: 2001 }]);
    expect(s.shared.wanderer.lapsSince).toBe(2); // 온 뒤 남은 바퀴는 다음 방문 쪽으로 센다
    s.shared.tradeCoins = 10_000;
    s.tiles.unlocked = true;
    const rows = wandererRows(s, H);
    expect(rows.map((r) => r.id)).toEqual(v.stock.map((x) => x.itemId));
    const first = rows.find((r) => r.canBuy)!;
    const r = buyWandererItem(s, H, first.id, 200, () => 0);
    expect(r.ok).toBe(true);
    expect(s.shared.tradeCoins).toBe(10_000 - first.price!);
    expect(buyWandererItem(s, H, first.id, 201)).toEqual({ ok: false, reason: '이미 팔렸다' });
    expect(s.runLog.wanderer.at(-1)).toEqual({ at: 200, factionId: 'hollow', kind: 'buy', tier: v.tier, itemId: first.id, price: first.price });
    s.shared.wanderer.lapsSince = 0;
    recordExpedition(s, ended(s, 1), 300);
    expect(s.runLog.wanderer.find((x) => x.kind === 'leave')).toMatchObject({ at: 300, unsold: WX.stockSize - 1 });
  });
  it('같은 원정 시드 = 같은 결과 (테스트가 흔들리지 않게 원정 시드로 굴린다)', () => {
    const a = newSaveData('hollow', 1);
    const b = newSaveData('hollow', 1);
    a.shared.wanderer.lapsSince = b.shared.wanderer.lapsSince = 300;
    recordExpedition(a, ended(a, 5, 99), 1);
    recordExpedition(b, ended(b, 5, 99), 1);
    expect(a.shared.wanderer).toEqual(b.shared.wanderer);
  });
  it('상인 소모품은 보관함으로, 영혼 정수 = 광기 −100·컨디션 가득·쇠약 해소', () => {
    const s = newSaveData('hollow', 1);
    s.shared.tradeCoins = 5000;
    s.shared.wanderer.visit = { at: 1, runId: 1, tier: 4, stock: [{ itemId: 'w-soul-elixir', price: 700, sold: false }] };
    expect(buyWandererItem(s, H, 'w-soul-elixir').ok).toBe(true);
    expect(s.shared.items['w-soul-elixir']).toBe(1);
    s.nest.risk = 80;
    s.nest.condition = 10;
    s.nest.weakened = true;
    expect(useInventoryItem(s, H, 'w-soul-elixir').ok).toBe(true);
    expect([s.nest.risk, s.nest.condition, s.nest.weakened]).toEqual([0, BALANCE.provisional.expedition.conditionMax, false]);
    expect(s.shared.items['w-soul-elixir']).toBeUndefined();
  });
  it('상인 상태 저장 정리: 모르는 품목은 버리고, 칸이 없으면 방문 없음', () => {
    expect(sanitizeWanderer({ lapsSince: -3, visit: { at: 5, runId: 2, tier: 9, stock: [{ itemId: 'x' }, { itemId: 'w-calm-deep', price: 140, sold: true }] } }))
      .toEqual({ lapsSince: 0, visit: { at: 5, runId: 2, tier: 4, stock: [{ itemId: 'w-calm-deep', price: 140, sold: true }] } });
    expect(sanitizeWanderer({ lapsSince: 4, visit: { stock: [{ itemId: 'nope' }] } })).toEqual({ lapsSince: 4, visit: null });
    expect(sanitizeWanderer(null)).toEqual(newWandererState());
  });
});

describe('85장 6번 대기 모드', () => {
  const played = () => {
    const s = newSaveData('hollow', 1);
    recordExpedition(s, ended(s, 1), 0);
    s.lastSeenAt = 1_000_000;
    s.nest.hunger = 0;
    s.nest.weakened = false;
    return s;
  };
  it('꺼 둔 시간: 벽시계 기준, 최대 24시간, 되돌린 시계·깨진 값은 0', () => {
    expect(offlineHours(0, 5 * HOUR)).toBe(5);
    expect(offlineHours(0, 100 * HOUR)).toBe(IX.maxHours);
    expect(offlineHours(10 * HOUR, 5 * HOUR)).toBe(0);
    expect(offlineHours(Number.NaN, 5 * HOUR)).toBe(0);
  });
  it('24시간 내내 = 기준량 × 24 × share(10%), 런 로그는 요약 1건, 접속 시각은 그대로(applyAbsence 몫)', () => {
    const s = played();
    const gold0 = s.shared.tradeCoins;
    const runs0 = s.runLog.runs.length;
    const r = settleIdle(s, s.lastSeenAt + 30 * HOUR, () => 0)!;
    expect(r.hours).toBe(24);
    // C.175 (GDD 102-1): 허기 0 에서 100 까지 100/7.5 시간이면 멈춘다 (옛 +60 상한 삭제)
    const act = 100 / BALANCE.provisional.nest.idleHungerPerHour;
    const y = idleYield(act);
    expect(y.gold).toBe(Math.floor(IX.fullHour.gold * act * IX.share));
    expect(r.gold).toBe(y.gold);
    expect(s.shared.tradeCoins - gold0).toBe(y.gold);
    expect(r.laps).toBe(Math.floor(IX.fullHour.laps * act * IX.share));
    expect(s.runLog.idle).toHaveLength(1);
    expect(s.runLog.runs).toHaveLength(runs0); // 원정·전투 기록을 낱낱이 쌓지 않는다 (88장 7번)
    expect(s.lastSeenAt).toBe(1_000_000);
  });
  it('걸음은 다음 진화에 필요한 만큼까지만(진화는 다음 원정 귀환 때), 노력치는 상한 안에서', () => {
    const s = played();
    const need = BALANCE.provisional.evolution.stepsNeeded[0]!;
    s.evolution.steps = need - 5;
    const r = settleIdle(s, s.lastSeenAt + 24 * HOUR)!;
    expect(r.steps).toBe(5);
    expect(s.evolution.steps).toBe(need);
    expect(s.evolution.tierIndex).toBe(0);
    expect(r.ev).toBeGreaterThan(0);
  });
  it('짧은 부재(10분 미만)·원정 중간 저장·첫 원정 전에는 돌지 않는다', () => {
    const s = played();
    expect(settleIdle(s, s.lastSeenAt + 5 * 60_000)).toBeNull();
    s.activeExpedition = {} as SaveData['activeExpedition'];
    expect(settleIdle(s, s.lastSeenAt + 5 * HOUR)).toBeNull();
    const fresh = newSaveData('hollow', 1);
    expect(settleIdle(fresh, fresh.lastSeenAt + 5 * HOUR)).toBeNull();
  });
  it('82장 허기: 허기가 100 에 닿으면 그때 멈추고(C.175 상한 삭제로 늘), 쇠약·빈사면 효율 절반, 사망이면 0', () => {
    const NX = BALANCE.provisional.nest;
    expect(idleActiveHours(10, { hunger: 0, weakened: false })).toBe(10);
    expect(idleActiveHours(24, { hunger: 0, weakened: false })).toBeCloseTo(100 / NX.idleHungerPerHour);
    const h = 60;
    expect(idleActiveHours(24, { hunger: h, weakened: false })).toBeCloseTo((100 - h) / NX.idleHungerPerHour);
    expect(idleActiveHours(4, { hunger: 0, weakened: false, collapsed: true })).toBe(4 * NX.care.dying.rewardMult);
    expect(idleActiveHours(4, { hunger: 0, weakened: false, dead: true })).toBe(0);
    expect(idleActiveHours(4, { hunger: 0, weakened: true })).toBe(4 * IX.weakenedRate);
  });
  it('시계를 앞으로 돌려 받은 뒤 되돌리면 다시 쌓이지 않는다 (마지막 접속 시각은 앞으로만)', () => {
    const s = played();
    const future = s.lastSeenAt + 24 * HOUR;
    expect(settleIdle(s, future)).not.toBeNull();
    s.lastSeenAt = future; // applyAbsence → markSeen
    expect(settleIdle(s, future - 2 * HOUR)).toBeNull();
  });
});

describe('85장 11번 배치 프리셋 (덱 삭제)', () => {
  const owned = () => {
    const s = newSaveData('hollow', 1);
    s.tiles.unlocked = true;
    s.tiles.collection = { 'prey-nest-a': 3, 'elite-den-a': 1, 'rest-a': 2 };
    return s;
  };
  it('출발 손 = 가진 타일 전부, 배치는 8칸(+ 상점 배치 칸)까지', () => {
    const s = owned();
    expect(ownedTileList(s.tiles, 'hollow')).toEqual(['prey-nest-a', 'prey-nest-a', 'prey-nest-a', 'elite-den-a', 'rest-a', 'rest-a']);
    expect(placementLimitOf(s)).toBe(8);
    s.shared.deckSlots = 2;
    expect(placementLimitOf(s)).toBe(10);
  });
  it('저장·불러오기·지우기: 가진 장수·칸 수 안에서만, 종족마다 최대 5개', () => {
    const s = owned();
    const cells = [null, 'prey-nest-a', null, 'rest-a', 'prey-nest-a', null, null, null, null, null, null, null];
    expect(saveTilePreset(s, '사냥', cells)).toEqual({ ok: true, index: 0 });
    expect(saveTilePreset(s, '', cells.map((c, i) => (i >= 1 && i <= 4 ? 'rest-a' : null)))).toEqual({ ok: false, reason: '가진 장수보다 많다' });
    expect(saveTilePreset(s, 'x', Array(12).fill(null))).toEqual({ ok: false, reason: '놓은 타일이 없다' });
    s.tiles.collection['prey-nest-a'] = 20;
    expect(saveTilePreset(s, 'x', [null, ...Array(9).fill('prey-nest-a'), null, null])).toEqual({ ok: false, reason: '배치는 최대 8칸이다' });
    for (let i = 0; i < 4; i++) expect(saveTilePreset(s, `p${i}`, cells).ok).toBe(true);
    expect(saveTilePreset(s, 'over', cells)).toEqual({ ok: false, reason: `프리셋은 ${BALANCE.provisional.tilePresets.max}개까지` });
    expect(tilePresetsFor(s.tiles, 'hollow').map((p) => p.preset.name)[0]).toBe('사냥');
    expect(tilePresetsFor(s.tiles, 'shinigami')).toEqual([]);
    expect(deleteTilePreset(s, 4)).toBe(true);
    expect(tilePresetsFor(s.tiles, 'hollow')).toHaveLength(4);
    // 덮어쓰기
    expect(saveTilePreset(s, '새 이름', cells, 0)).toEqual({ ok: true, index: 0 });
    expect(s.tiles.presets[0]!.name).toBe('새 이름');
  });
  it('배치 단계에서 불러오기: 지금 놓인 것을 되돌리고 프리셋대로, 손에 없는 타일은 건너뜀', () => {
    const s = owned();
    const exp = createExpedition({ factionId: 'hollow', seed: 5, hunger: 20, condition: 80, deck: ownedTileList(s.tiles, 'hollow') });
    beginPlanning(exp, placementLimitOf(s));
    expect(placeTile(exp, 'elite-den-a', 7).ok).toBe(true);
    const r = applyTilePreset(exp, { cells: [null, 'prey-nest-a', 'rest-a', 'rest-a', 'rest-a', null, null, null, null, null, null, null] });
    expect(r).toEqual({ placed: 3, missing: ['rest-a'] });
    expect(exp.slots[7]).toBeNull();
    expect(cellsOfPlan(exp).slice(1, 5)).toEqual(['prey-nest-a', 'rest-a', 'rest-a', null]);
    expect(exp.hand.filter((x) => x === 'elite-den-a')).toHaveLength(1);
  });
  it('저장된 프리셋 정리: 모르는 종족·타일, 빈 프리셋은 버린다', () => {
    expect(sanitizeTilePresets([{ factionId: 'hollow', name: ' a ', cells: [null, 'prey-nest-a', 'zzz', 3] }, { factionId: 'nope', cells: [null, 'prey-nest-a'] }, { factionId: 'hollow', cells: [null, 'x'] }, 5], ['hollow', 'shinigami']))
      .toEqual([{ name: 'a', factionId: 'hollow', cells: [null, 'prey-nest-a', ...Array(10).fill(null)] }]);
  });
});

describe('86장 보관함', () => {
  it('카테고리 7개(음식·소모품·장비·펫·스킨·타일·기타 — 펫은 C.144), 품목마다 카테고리 필드', () => {
    expect(ITEM_CATEGORIES).toEqual(['food', 'consumable', 'equipment', 'pet', 'skin', 'tile', 'etc']);
    expect(itemCategoryOf('food-basic')).toBe('food');
    expect(itemCategoryOf('calm')).toBe('consumable');
    expect(itemCategoryOf('tile-draw')).toBe('tile');
    expect(itemCategoryOf('training-ticket')).toBe('etc');
    expect(itemCategoryOf('w-soul-elixir')).toBe('consumable');
    expect(itemCategoryOf('aura-smoke') ?? 'skin').toBe('skin');
    expect(itemCategoryOf('nope')).toBeNull();
  });
  it('스킨·꾸밈은 사도 바로 끼지 않고 보관함에서 착용·해제', () => {
    const s = newSaveData('hollow', 1);
    s.shared.jade = 999;
    const aura = inventoryOf(s, H).find((e) => e.category === 'skin' && e.cosmeticCategory === 'aura');
    expect(aura).toBeUndefined();
    const r = buyShopItem(s, H, 'aura-smoke');
    expect(r.ok).toBe(true);
    expect(s.wear.aura).toBeUndefined();
    const e = inventoryOf(s, H).find((x) => x.id === 'aura-smoke')!;
    expect(e).toMatchObject({ category: 'skin', action: 'equip' });
    expect(equipInventoryItem(s, 'aura-smoke')).toBe(true);
    expect(s.wear.aura).toBe('aura-smoke');
    expect(inventoryOf(s, H).find((x) => x.id === 'aura-smoke')!.action).toBe('unequip');
    expect(unequipInventoryItem(s, 'aura-smoke')).toBe(true);
    expect(s.wear.aura).toBeUndefined();
  });
  it('보관함 목록: 먹이·소모품·타일·수련권이 카테고리 순서로, 먹이는 보관함에서 먹인다', () => {
    const s = newSaveData('hollow', 1);
    s.shared.items = { wake: 2 };
    s.tiles.collection = { 'rest-a': 2 };
    s.training.tickets = 1;
    const inv = inventoryOf(s, H);
    const cats = inv.map((e) => e.category);
    expect(cats).toEqual([...cats].sort((a, b) => ITEM_CATEGORIES.indexOf(a) - ITEM_CATEGORIES.indexOf(b)));
    expect(inv.find((e) => e.id === 'wake')).toMatchObject({ category: 'consumable', count: 2, action: 'use' });
    expect(inv.find((e) => e.id === 'rest-a')).toMatchObject({ category: 'tile', count: 2, action: null });
    expect(inv.find((e) => e.id === 'training-ticket')).toMatchObject({ category: 'etc', count: 1 });
    const food = inv.find((e) => e.category === 'food')!;
    s.nest.hunger = 80;
    const before = s.shared.food[food.id.slice(5) as keyof SaveData['shared']['food']];
    expect(useInventoryItem(s, H, food.id).ok).toBe(true);
    expect(s.shared.food[food.id.slice(5) as keyof SaveData['shared']['food']]).toBe(before - 1);
    expect(s.nest.hunger).toBeLessThan(80);
  });
});

describe('세이브 형식 41→42 (61장: 마이그레이션 없음)', () => {
  it('형식·문턱 44(C.150 장비로 올림), 프리셋·보관함 소모품·상인·런 로그 wanderer/idle 이 저장·불러오기로 남고 깨진 값은 정리', () => {
    expect([SAVE_FORMAT_VERSION, MIN_LOADABLE_SAVE_FORMAT]).toEqual([53, 53]); // C.188 // C.184 // C.181: 먹이 한도로 49. C.167: 해방 칸 폐지로 45
    const s = newSaveData('hollow', 1);
    s.tiles.collection = { 'rest-a': 1 };
    saveTilePreset(s, 'p', [null, 'rest-a', ...Array(10).fill(null)]);
    s.shared.items = { calm: 3 };
    s.shared.wanderer = { lapsSince: 7, visit: { at: 1, runId: 2, tier: 3, stock: [{ itemId: 'w-calm-deep', price: 140, sold: false }] } };
    s.runLog.idle.push({ at: 1, factionId: 'hollow', from: 0, hours: 1, activeHours: 1, share: 0.1, laps: 4, steps: 48, gold: 88, ev: 1, tiles: [], food: 0, gear: 0 });
    const m = migrateSave(JSON.parse(JSON.stringify(s)))!;
    expect(m.tiles.presets).toEqual(s.tiles.presets);
    expect(m.shared.items).toEqual({ calm: 3 });
    expect(m.shared.wanderer).toEqual(s.shared.wanderer);
    expect(m.runLog.idle).toHaveLength(1);
    expect(m.runLog.wanderer).toEqual([]);
    const raw = JSON.parse(JSON.stringify(s));
    raw.shared.items = { calm: -2, wake: 'x', nope: 4, 'w-wake-deep': 2.7 };
    delete raw.runLog.idle;
    const m2 = migrateSave(raw)!;
    expect(m2.shared.items).toEqual({ 'w-wake-deep': 2 });
    expect(m2.runLog.idle).toEqual([]);
    const old = JSON.parse(JSON.stringify(s));
    old.meta.format = 40;
    expect(migrateSave(old)).toBeNull();
  });
});
