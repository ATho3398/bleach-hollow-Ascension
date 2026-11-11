// C.351 (GDD 211장): 먹이 = 적힌 효과만. 먹이마다 '설명에 적힌 효과'와 '실제로 바뀌는 값'(C.346 바뀐 값 칩이 보여 주는 값 + 교감)을 전수 비교한다.
// 경로: 방 먹이(feedNest — 독 먹이 카드·튜토리얼 회복 먹이 공통) · 방 가방(useInventoryItem). 걷기 중에는 먹이를 쓸 수 없다(가방 잠금).
import { isFullyFed } from '../src/game';
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { getFaction } from '../src/data/factions';
import { FOOD_IDS, type FoodId } from '../src/engine/faction';
import { dayKey, foodEffectList, foodEffectsNow, homeHpOf, type FoodFx, type NestState } from '../src/engine/nest';
import { feedNest, foodReactionFor, newSaveData, type SaveData } from '../src/game';
import { foodEffectText, foodFxText } from '../src/foodText';
import { inventoryOf, useInventoryItem } from '../src/inventory';
import { goldRows } from '../src/shop';
import { changedKeys } from '../src/ui/bha/gaugeBlink';
import { nestShown } from '../src/ui/bha/statusBox';

const FACTIONS = ['hollow', 'shinigami'] as const;

/** 먹이기 전후 값 (화면 단위: 배부름 0~100 · 체력 % · 교감) */
function snap(n: NestState) {
  return { hunger: 100 - n.hunger, cond: n.condition, hp: Math.round(homeHpOf(n) * 1000) / 10, bond: n.bond, risk: n.risk };
}
type Snap = ReturnType<typeof snap>;
const diff = (a: Snap, b: Snap) => Object.fromEntries((Object.keys(a) as (keyof Snap)[]).map((k) => [k, Math.round((b[k] - a[k]) * 10) / 10])) as Snap;

/** 적힌 효과 → 기대 변화 (적히지 않은 값은 0) */
function expected(list: readonly FoodFx[], before?: Snap): Snap {
  const e: Snap = { hunger: 0, cond: 0, hp: 0, bond: 0, risk: 0 };
  for (const f of list) e[f.key] = f.amount;
  if (before && e.hp >= 100) e.hp = Math.round((100 - before.hp) * 10) / 10; // 체력 가득 특식 (GDD 235장 1): 가득까지
  if (before && e.hunger >= 100) e.hunger = Math.round((100 - before.hunger) * 10) / 10; // 배부름 가득 = 첫 끼니 (GDD 241-B 5): 가득까지
  return e;
}

/** 진화체 선호·비선호 먹이는 표 없이 반응으로만 드러난다 (GDD 235장 2) — 적힌 효과 = 평범할 때 값 */
const plain = (s: SaveData, food: FoodId) => { const r = foodReactionFor(s, food); return r !== 'like' && r !== 'dislike'; };

/** 가운데 상태(아무 값도 가득·0 이 아님): 적힌 수치가 그대로 다 들어간다 */
function midSave(faction: string): SaveData {
  const s = newSaveData(faction);
  const now = Date.now();
  Object.assign(s.nest, { hunger: 50, condition: 50, hpFraction: 0.5, bond: 10, bondToday: 0, bondDay: '', risk: 40, lastTickMs: now, feedCount: 0, lastFedAt: 0, careRequest: null });
  for (const id of FOOD_IDS) s.shared.food[id] = 3;
  return s;
}

describe('C.351 먹이 숨은 효과 없음 — 설명 = 실제 변화 (전수)', () => {
  it('먹이 행동 자체는 리스크를 움직이지 않는다 (GDD 211장 — 리스크는 특식 효과로만 적힌다, 235장 1 · 안정 수치는 C.391 삭제)', () => {
    expect(BALANCE.provisional.risk.nestActions.feed).toEqual({ risk: 0 });
  });

  for (const fid of FACTIONS) {
    const faction = getFaction(fid);
    for (const food of FOOD_IDS) {
      it(`${fid} ${food}: 방 먹이 · 방 가방 둘 다 적힌 효과만 바뀐다`, () => {
        const list = foodEffectList(food);
        // 방 먹이 (독 카드 · 튜토리얼 회복 먹이)
        const a = midSave(fid);
        if (!plain(a, food)) return;
        const before = snap(a.nest);
        const hpBefore = homeHpOf(a.nest);
        expect(feedNest(a, food)).toBe('ate');
        expect(diff(before, snap(a.nest))).toEqual(expected(list, before));
        // 바뀐 값 칩(C.346) = 적힌 상태창 값(배부름·컨디션·체력)과 같다 — 리스크·안정 칩이 뜨면 안 된다
        const chips = changedKeys(nestShown({ hunger: 100 - before.hunger, condition: before.cond, risk: before.risk }, hpBefore), nestShown(a.nest, homeHpOf(a.nest)));
        expect(chips).toEqual(list.map((e) => e.key).filter((k) => k !== 'bond'));
        // 방 가방
        const b = midSave(fid);
        const b0 = snap(b.nest);
        expect(useInventoryItem(b, faction, `food-${food}`).ok).toBe(true);
        expect(diff(b0, snap(b.nest))).toEqual(expected(list, b0));
      });

      it(`${fid} ${food}: 가방·상점·카드 설명 글 = 효과 목록 전부, 다른 값 이름 없음`, () => {
        const s = midSave(fid);
        const text = foodEffectText(food, faction);
        const list = foodEffectList(food);
        expect(text).toBe(list.map((e) => foodFxText(e, faction)).join(' · '));
        expect(inventoryOf(s, faction).find((e) => e.id === `food-${food}`)!.detail).toBe(text);
        expect(goldRows(s, faction).find((r) => r.id === `food-${food}`)?.effect ?? text).toBe(text);
        if (!list.some((e) => e.key === 'risk')) expect(text).not.toContain(faction.riskGaugeName);
        expect(text).not.toContain('영압 안정도');
        // 카드(지금 움직이는 효과)는 가운데 상태에서 효과 전부
        expect(foodEffectsNow(food, s.nest)).toEqual(list);
      });
    }
  }

  it('어떤 상태에서도 카드에 보인 효과(foodEffectsNow) = 실제로 움직인 값', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    const pick = <T,>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)]!;
    for (let i = 0; i < 400; i++) {
      const food = FOOD_IDS[i % FOOD_IDS.length] as FoodId;
      const s = midSave(i % 2 ? 'hollow' : 'shinigami');
      if (!plain(s, food)) continue;
      const now = Date.now();
      Object.assign(s.nest, {
        hunger: pick([0, 0.5, 30, 100]), condition: pick([0, 50, 99.5, 100]), hpFraction: pick([0.2, 0.999, 1]),
        bond: pick([0, 50, 100]), bondDay: pick(['', 'today']), bondToday: pick([0, 5, 6]),
      });
      if (s.nest.bondDay === 'today') s.nest.bondDay = dayKey(now);
      const shown = foodEffectsNow(food, s.nest, now).map((e) => e.key).sort();
      const b = snap(s.nest);
      if (isFullyFed(s.nest)) { // 배부름 가득 = 안 먹음·아무것도 안 바뀜 (GDD 243장 6)
        expect(feedNest(s, food, now)).toBe('full');
        expect(snap(s.nest)).toEqual(b);
        continue;
      }
      expect(feedNest(s, food, now)).toBe('ate');
      const d = diff(b, snap(s.nest));
      const moved = (['hunger', 'cond', 'risk', 'hp', 'bond'] as const).filter((k) => d[k] !== 0).sort();
      expect(moved, `${food} ${JSON.stringify(b)}`).toEqual(shown);
    }
  });
});
