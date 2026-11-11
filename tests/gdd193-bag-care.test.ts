// GDD 193장 6·9·15·16·17 (코딩222): 전투 소모품 칸 자동 채우기·가방 한 곳·상태이상 푸는 법·먹이 카드 가득·대기 보상 빈사
import { describe, expect, it } from 'vitest';
import { getFaction } from '../src/data/factions';
import { idleActiveHours } from '../src/engine/idle';
import { accrueIdle, newSaveData } from '../src/game';
import { autoEquipGear, bestBattleItem, BATTLE_ITEM_IDS, fillBattleSlot, inventoryOf, ownedBattleItems } from '../src/inventory';
import { storeConsumable } from '../src/shop';
import { careStatusShort, statusChips } from '../src/ui/bha/roomLogic';
import { foodEffectsNow } from '../src/engine/nest';
import { actionChipOf } from '../src/ui/lcdScreens';
import { idleShortfall, idleSummaryText, idleYieldLines } from '../src/ui/idleView';
import { idleYield } from '../src/engine/idle';

const HOUR = 3_600_000;
const fresh = () => {
  const s = newSaveData('hollow', 1);
  s.shared.items = {};
  s.shared.battleItem = null;
  return s;
};

describe('193장 6 전투 소모품 칸', () => {
  it('첫 획득 때 칸이 비었으면 바로 넣는다 — 이미 든 것이 있으면 그대로', () => {
    const s = fresh();
    storeConsumable(s, 'heal-patch', 3);
    expect(s.shared.battleItem).toBe('heal-patch');
    storeConsumable(s, 'battle-potion', 2);
    expect(s.shared.battleItem).toBe('heal-patch');
  });
  it('전투 소모품이 아닌 것(약·정화제)은 칸에 안 넣는다', () => {
    const s = fresh();
    const med = 'med-energy';
    storeConsumable(s, med, 1);
    expect(s.shared.battleItem).toBeNull();
  });
  it('칸에 든 것이 0개면 빈 칸 — 새로 얻은 전투 소모품이 들어간다', () => {
    const s = fresh();
    s.shared.battleItem = 'heal-patch';
    storeConsumable(s, 'heal-salve', 1);
    expect(s.shared.battleItem).toBe('heal-salve');
  });
  it('[자동 착용]이 빈 소모품 칸을 가장 많이 회복하는 물건으로 채운다', () => {
    const s = fresh();
    s.shared.items = { 'heal-patch': 3, 'battle-potion': 2, 'heal-salve': 1 };
    expect(ownedBattleItems(s)).toEqual(['heal-patch', 'battle-potion', 'heal-salve']);
    expect(bestBattleItem(s)).toBe('heal-salve');
    expect(autoEquipGear(s)).toBe(1);
    expect(s.shared.battleItem).toBe('heal-salve');
    expect(autoEquipGear(s)).toBe(0); // 이미 찼으면 그대로
  });
  it('빈 칸 고르기는 원정 중에도 된다(빈 칸만) — 찬 칸은 안 바꾼다', () => {
    const s = fresh();
    s.shared.items = { 'heal-patch': 1, 'battle-haste': 1 };
    s.activeExpedition = {} as never;
    expect(fillBattleSlot(s, 'battle-haste')).toBe(true);
    expect(fillBattleSlot(s, 'heal-patch')).toBe(false);
    expect(fillBattleSlot(s, 'med-energy')).toBe(false);
    expect(s.shared.battleItem).toBe('battle-haste');
  });
});

describe('193장 9 가방 전투 소모품 = 소모품 탭 한 곳', () => {
  it('전투 각성제도 가방 소모품 목록에 들고, 전투 소모품은 칸 표시를 단다', () => {
    const s = fresh();
    s.shared.items = { 'heal-patch': 2, 'battle-haste': 1 };
    s.shared.battleItem = 'battle-haste';
    const inv = inventoryOf(s, getFaction('hollow'));
    const haste = inv.find((e) => e.id === 'battle-haste')!;
    expect(haste).toBeDefined();
    expect(haste.battleSlot).toEqual({ inSlot: true });
    expect(inv.find((e) => e.id === 'heal-patch')!.battleSlot).toEqual({ inSlot: false });
    expect(actionChipOf(haste)).toBe('칸에 넣음');
    expect(actionChipOf({ ...haste, battleSlot: { inSlot: false } })).toBe('칸에 넣기');
    for (const id of BATTLE_ITEM_IDS) if (s.shared.items[id]) expect(inv.some((e) => e.id === id)).toBe(true);
  });
});

describe('193장 15 상태이상 푸는 법 짧게', () => {
  it('수치를 넘겼으면 모험 1번, 아직이면 채울 수치', () => {
    const f = getFaction('shinigami');
    expect(careStatusShort({ hunger: 0, condition: 100 }, f).tired).toBe('모험 1번');
    expect(careStatusShort({ hunger: 0, condition: 10 }, f).tired).toBe('컨디션 채우기');
    expect(careStatusShort({ hunger: 95, condition: 100 }, f).weak).toBe(`${f.fullnessName} 채우기`);
    const chips = statusChips({ hunger: 0, condition: 100, risk: 0, weakened: false, tired: true }, f);
    expect(chips.find((c) => c.kind === 'tired')!.short).toBe('모험 1번');
  });
});

describe('193장 16 먹이 카드 가득 찬 수치 (211장부터 효과 전부 중 움직이는 것)', () => {
  it('컨디션이 가득이면 컨디션 +n 이 빠지고, 다 가득이면 빈 목록(카드 = 가득)', () => {
    const s = newSaveData('shinigami');
    const now = Date.now();
    Object.assign(s.nest, { hunger: 50, condition: 50, hpFraction: 0.5 });
    // C.387 (GDD 235장): 컨디션이 오르는 먹이 = 특식(tonic)
    expect(foodEffectsNow('tonic', s.nest, now).map((e) => e.key)).toEqual(['hunger', 'cond', 'hp', 'bond']);
    s.nest.condition = 100;
    expect(foodEffectsNow('tonic', s.nest, now).map((e) => e.key)).toEqual(['hunger', 'hp', 'bond']);
    Object.assign(s.nest, { hunger: 0, hpFraction: 1, bond: 100, risk: 100 });
    expect(foodEffectsNow('tonic', s.nest, now)).toEqual([]);
    // 줄이는 효과(싸구려 교감 −)는 가득이어도 움직이므로 남는다
    expect(foodEffectsNow('snack', s.nest, now).map((e) => e.key)).toEqual(['bond']);
  });
});

describe('193장 17 대기 보상 창', () => {
  it('빈사 중에는 자동 모험이 돌지 않는다', () => {
    expect(idleActiveHours(3, { hunger: 0, weakened: false, collapsed: true })).toBe(0);
    const s = newSaveData('hollow', 1);
    s.runLog.runs.push({} as never);
    s.nest.collapsed = true;
    const acc = accrueIdle(s, s.lastSeenAt + 2 * HOUR)!;
    expect(acc.pending.activeHours).toBe(0);
    expect(idleShortfall(acc.pending, s.nest)).toBe('빈사라 자동 모험을 하지 못했다');
  });
  it('미리 보기는 확정 개수만, 받은 뒤 요약은 시간 없이 받은 것만', () => {
    const y = { ...idleYield(1), gear: 0, gearChance: 0.4 };
    expect(idleYieldLines(y, getFaction('hollow')).some((l) => l.startsWith('장비'))).toBe(false);
    const t = idleSummaryText({ at: 0, factionId: 'hollow', from: 0, hours: 0.45, activeHours: 0.3, share: 0.1, laps: 1, steps: 15, gold: 27, ev: 0, tiles: [], food: 0, gear: 1 }, getFaction('hollow'));
    expect(t.title).toBe('대기 보상을 받았다');
    expect(t.body).not.toMatch(/분|시간/);
    expect(t.body).toContain('장비 1개');
  });
});
