// C.387 (GDD 234장 1·3 · 235장): 가방 알림 = 상태이상 풀 때만 · 같은 먹이 10분 2개 · 먹이 3유형(특식·일반 선호/비선호·싸구려) · 세이브 형식 70
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { getFaction } from '../src/data/factions';
import { FOOD_IDS } from '../src/engine/faction';
import { FOOD_PREFS, foodReactionOf, foodTypeOf, NORMAL_FOODS } from '../src/engine/foodPref';
import { ELEMENTAL_IDS, ELEMENT_IDS, weaknessesOf } from '../src/data/elements';
import { doNestAction, feedFood, foodEffect, newNest, sameFoodLeft } from '../src/engine/nest';
import { foodOverflowGold } from '../src/engine/food';
import { feedNest, foodReactionFor, migrateSave, newSaveData, SAVE_FORMAT_VERSION, SAVE_MIGRATIONS, MIN_LOADABLE_SAVE_FORMAT } from '../src/game';
import { SAME_FOOD_REFUSED, useInventoryItem } from '../src/inventory';
import { grantRecoverFood } from '../src/recoverTutorial';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const MIN = 60_000;
const T = 1_700_000_000_000;
const H = getFaction('hollow');
const NX = BALANCE.provisional.nest;

describe('234장 1: 가방 알림 = 상태이상이 풀렸을 때만', () => {
  it('약으로 상태이상을 풀면 cured 에 이름, 걸려 있지 않으면 빈 목록', () => {
    const s = newSaveData('hollow', T);
    s.shared.items['med-iv'] = 2;
    s.nest.weakened = true;
    const r = useInventoryItem(s, H, 'med-iv');
    expect(r).toMatchObject({ ok: true, cured: ['쇠약'] });
  });
  it('먹이를 먹여도 상태이상이 안 풀리면 cured 없음 → 알림 없음', () => {
    const s = newSaveData('hollow', T);
    s.shared.food.basic = 3;
    const r = useInventoryItem(s, H, 'food-basic');
    expect(r.ok && r.cured).toEqual([]);
  });
  it('가방 화면: cured 가 있을 때만 "○○이(가) 풀렸다" 알림, 일반 사용은 상태창 연출만', () => {
    const l = read('src/ui/lcdScreens.ts');
    expect(l).toContain("if (r.ok && r.cured?.length) showToast({ eyebrow: '가방', title: fixParticles(`${r.cured.join('·')}이(가) 풀렸다`) }, 0, 2400);");
    expect(l).toContain('else if (r.ok && !r.spat) useFx(faction, save, e, art, before);');
  });
});

describe('234장 3: 같은 먹이 10분에 2개 — 3개째는 거절(먹이 그대로)', () => {
  it('엔진: 같은 종류 2개 뒤 3번째 refused, 다른 종류는 먹는다, 10분 지나면 다시 2개', () => {
    const n = newNest(T);
    n.hunger = 90;
    expect(feedFood(n, 'basic', T)).toBe('ate');
    expect(feedFood(n, 'basic', T + MIN)).toBe('ate');
    expect(sameFoodLeft(n, 'basic', T + MIN)).toBe(0);
    const h = n.hunger, b = n.bond;
    expect(feedFood(n, 'basic', T + 2 * MIN)).toBe('refused');
    expect([n.hunger, n.bond, n.feedCount]).toEqual([h, b, 2]); // 효과·교감·전체 한도 그대로
    expect(feedFood(n, 'sushi', T + 2 * MIN)).toBe('ate');
    expect(sameFoodLeft(n, 'basic', T + 11 * MIN)).toBe(2); // 마지막 basic(T+1분) 뒤 10분
  });
  it('세이브: 거절이면 먹이 개수 그대로 + 런 로그 vitals refuse', () => {
    const s = newSaveData('hollow', T);
    s.shared.food.sushi = 5;
    const now = Date.now(); // 가방 사용은 지금 시각
    feedNest(s, 'sushi', now);
    feedNest(s, 'sushi', now);
    expect(feedNest(s, 'sushi', now)).toBe('refused');
    expect(s.shared.food.sushi).toBe(3);
    expect(s.runLog.vitals.at(-1)).toMatchObject({ kind: 'refuse', food: 'sushi' });
    const r = useInventoryItem(s, H, 'food-sushi');
    expect(r).toEqual({ ok: false, reason: SAME_FOOD_REFUSED });
    expect(s.shared.food.sushi).toBe(3);
  });
  it('튜토리얼 회복 안내 먹이는 같은 먹이 한도에 막히지 않는다(그 종류 묶음을 비움)', () => {
    const s = newSaveData('hollow', T);
    const f = BALANCE.provisional.tutorialRecover.food;
    s.nest.foodStreak[f] = { count: 2, at: Date.now() };
    grantRecoverFood(s);
    expect(sameFoodLeft(s.nest, f, Date.now())).toBe(NX.feedLimit.sameMax);
  });
  it('방: 거절은 종족 말투 말풍선(picky) — 종족 설정에 있음', () => {
    expect(read('src/ui/roomView.ts')).toContain("return say(pickLine(room.talk, 'picky'));");
    for (const id of ['hollow', 'shinigami'] as const) expect(getFaction(id).room?.talk?.picky?.length).toBeGreaterThan(0);
  });
});

describe('235장: 먹이 3유형', () => {
  it('14종 = 일반 6 · 특식 6 · 싸구려 2 (C.391 GDD 239장: 특식 살점·정화 추가), 옛 id 매핑(간식 → 싸구려, 고기·사냥감 → 일반, 보양·잔치 → 특식)', () => {
    const by = (t: string) => FOOD_IDS.filter((f) => foodTypeOf(f) === t);
    expect(FOOD_IDS).toHaveLength(15); // + 튜토리얼 전용 '첫 끼니'(GDD 241-B 5, 특식 유형·공용 이름)
    expect(by('normal')).toHaveLength(6);
    expect(by('special')).toEqual(['feast', 'tonic', 'flesh', 'elixir', 'purify', 'relic', 'tutorial']);
    expect(by('cheap')).toEqual(['snack', 'scrap']);
    expect([foodTypeOf('basic'), foodTypeOf('hearty')]).toEqual(['normal', 'normal']);
    for (const id of ['hollow', 'shinigami'] as const) for (const f of FOOD_IDS) expect(getFaction(id).foodNames[f].length).toBeGreaterThan(0);
  });
  it('특식 = 먹이마다 배부름 + 득실 (C.391 GDD 239장): 대식 · 응축 · 살점 · 재생 · 정화 · 진상품(판매가 = 넘침 골드)', () => {
    const n = newNest(T);
    Object.assign(n, { hunger: 100, risk: 10, condition: 20, hpFraction: 0.3, bond: 10 });
    doNestAction(n, 'feed', 'feast', T); // 배부름 40, 컨디션 −15
    expect([n.hunger, n.risk, n.condition]).toEqual([60, 10, 5]);
    doNestAction(n, 'feed', 'tonic', T); // 배부름 8, 컨디션 +25
    expect([n.hunger, n.condition]).toEqual([52, 30]);
    doNestAction(n, 'feed', 'flesh', T); // 배부름 20, 리스크 +20
    expect([n.hunger, n.risk]).toEqual([32, 30]);
    doNestAction(n, 'feed', 'elixir', T); // 배부름 10, 체력 가득, 컨디션 −10
    expect([n.hunger, n.hpFraction, n.condition]).toEqual([22, 1, 20]);
    const bond = n.bond;
    doNestAction(n, 'feed', 'purify', T); // 배부름 5, 리스크 −15, 교감 −1
    expect([n.hunger, n.risk, n.bond]).toEqual([17, 15, bond - 1]);
    expect(foodOverflowGold('relic')).toBe(BALANCE.provisional.sell.prices['food-relic']);
    expect(foodEffect('relic')).toMatchObject({ hunger: 10, condition: 0, risk: 0 });
    expect(NX.foods.feast).toMatchObject({ hunger: 40, condition: -15 });
    expect(NX.foods.tonic).toMatchObject({ hunger: 8, condition: 25 });
    expect(NX.foods.flesh).toMatchObject({ hunger: 20, risk: 20 });
    expect(NX.foods.elixir).toMatchObject({ hunger: 10, hpFull: true, condition: -10 });
    expect(NX.foods.purify).toMatchObject({ hunger: 5, risk: -15, bond: -1 });
  });
  it('일반: 배부름 8(C.391)·교감 +1, 선호 ×2, 비선호 배부름 ×0.5·교감 0, 연달아 2번째부터 교감 −1', () => {
    const n = newNest(T);
    Object.assign(n, { hunger: 100, bond: 10 });
    doNestAction(n, 'feed', 'basic', T);
    expect([n.hunger, n.bond]).toEqual([92, 11]);
    doNestAction(n, 'feed', 'basic', T, 'like');
    expect([n.hunger, n.bond]).toEqual([76, 13]);
    doNestAction(n, 'feed', 'basic', T, 'dislike');
    expect([n.hunger, n.bond, n.dislikeRun]).toEqual([72, 13, 1]);
    doNestAction(n, 'feed', 'basic', T, 'dislike');
    expect([n.hunger, n.bond, n.dislikeRun]).toEqual([68, 12, 2]);
    doNestAction(n, 'feed', 'basic', T);
    expect(n.dislikeRun).toBe(0);
  });
  it('싸구려: 배부름 4(C.391), 먹을 때마다 교감 −1 (하루 한도와 상관없이)', () => {
    const n = newNest(T);
    Object.assign(n, { hunger: 100, bond: 5 });
    doNestAction(n, 'feed', 'snack', T, 'cheap');
    expect([n.hunger, n.bond]).toEqual([96, 4]);
  });
  it('선호·비선호 = 진화체 속성 (사용자 추가): 자기 속성 먹이 선호, 약점 속성(나를 이기는 속성) 먹이 비선호', () => {
    for (const el of ELEMENTAL_IDS) {
      const p = FOOD_PREFS[el]!;
      const weak = weaknessesOf([el])[0]!;
      expect(p.dislike, el).toBe(FOOD_PREFS[weak]!.like);
    }
    for (const el of ELEMENT_IDS) {
      const p = FOOD_PREFS[el]!;
      expect(NORMAL_FOODS).toContain(p.like);
      expect(NORMAL_FOODS).toContain(p.dislike);
      expect(p.like).not.toBe(p.dislike);
    }
    expect(new Set(ELEMENT_IDS.map((e) => FOOD_PREFS[e]!.like)).size).toBe(6); // 6종 모두 누군가의 선호
    expect(foodReactionOf('roast', ['fire'])).toBe('like');
    expect(foodReactionOf('sushi', ['fire'])).toBe('dislike');
    expect(foodReactionOf('sushi', ['fire', 'water'])).toBe('like'); // 융합: 선호가 이긴다
    expect(foodReactionOf('basic', ['fire'])).toBe(null);
    expect(foodReactionOf('snack', ['fire'])).toBe('cheap');
    expect(foodReactionOf('feast', ['fire'])).toBe(null);
  });
  it('이름: 일반·싸구려 = 두 종족 공통, 특식만 종족별', () => {
    const S = getFaction('shinigami');
    for (const f of FOOD_IDS) {
      if (foodTypeOf(f) === 'special' && f !== 'tutorial') expect(H.foodNames[f]).not.toBe(S.foodNames[f]); // 첫 끼니(GDD 241-B 5)는 공용 이름
      else expect(H.foodNames[f]).toBe(S.foodNames[f]);
    }
    expect(H.foodNames.roast).toBe('구운 고기');
    expect(H.foodNames.sushi).toBe('초밥');
  });
  it('세이브 경로: 1단계(노멀) = 주먹밥 선호(배부름 16) · 검은 버섯 비선호(배부름 4) (C.391 일반 8)', () => {
    const s = newSaveData('hollow', T);
    s.nest.hunger = 100;
    s.shared.food.basic = 1;
    s.shared.food.mushroom = 1;
    expect(foodReactionFor(s, 'basic')).toBe('like');
    feedNest(s, 'basic', T);
    expect(s.nest.hunger).toBe(84);
    feedNest(s, 'mushroom', T);
    expect(s.nest.hunger).toBe(80);
  });
  it('방: 선호·비선호·싸구려 반응 말풍선(종족 설정), 코드에 종족 분기 없음', () => {
    const v = read('src/ui/roomView.ts');
    expect(v).toContain("if (reactKey) say(pickLine(room.talk, reactKey));");
    expect(v).toContain("if (reaction === 'like') window.setTimeout(() => main.isConnected && hopChar(), ACTION_FILL_MS);");
    for (const id of ['hollow', 'shinigami'] as const) {
      const t = getFaction(id).room!.talk!;
      for (const k of ['foodLike', 'foodDislike', 'foodCheap'] as const) expect(t[k]?.length).toBeGreaterThan(0);
    }
    for (const p of ['src/engine/foodPref.ts', 'src/engine/nest.ts', 'src/ui/roomView.ts']) expect(read(p)).not.toMatch(/=== '(hollow|shinigami)'/);
  });
  it('상점: 지금 먹이 그대로 + 싸구려 2종 판매 (234장 4 예정 — 아직 안 뺌)', () => {
    const g = BALANCE.shop.goldPrices;
    for (const k of ['food-snack', 'food-scrap', 'food-basic', 'food-hearty', 'food-tonic', 'food-feast']) expect(g[k]).toBeGreaterThan(0);
  });
});

describe('세이브 형식 70', () => {
  it('형식 70 · 문턱 54, 69 → 70 = 빈 foodStreak·dislikeRun 0, 옛 먹이 개수 그대로 + 새 종류 0', () => {
    expect([SAVE_FORMAT_VERSION, MIN_LOADABLE_SAVE_FORMAT]).toEqual([79, 54]); // C.406 쇠약 시계·터치·숨은 모습
    const s = newSaveData('hollow', T) as unknown as Record<string, any>;
    delete s.nest.foodStreak;
    delete s.nest.dislikeRun;
    s.shared.food = { snack: 4, basic: 2, hearty: 1, tonic: 3, feast: 1 };
    s.meta.format = 69;
    SAVE_MIGRATIONS[69]!(s as never);
    expect([s.nest.foodStreak, s.nest.dislikeRun]).toEqual([{}, 0]);
    s.meta.format = 69;
    const m = migrateSave(JSON.parse(JSON.stringify(s)))!;
    expect(m.meta.format).toBe(79);
    expect(m.shared.food).toMatchObject({ snack: 4, basic: 2, hearty: 1, tonic: 3, feast: 1, sushi: 0, elixir: 0, relic: 0, scrap: 0 });
    expect(m.nest.foodStreak).toEqual({});
  });
});
