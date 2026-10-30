// C.227 (GDD 150장): 상점 4개로 분리 · 특성 상점(탈착 특성)
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { FACTIONS } from '../src/data/factions';
import { marketOf, MARKET_SPOTS } from '../src/engine/faction';
import { ITEM_CATEGORIES, SHOP_KINDS, SHOP_KIND_TABS } from '../src/data/shop';
import { SHOP_SPOT, shopName } from '../src/ui/shopView';

describe('150장 1 상점 4개', () => {
  it('소모품 = 음식·약·소모품·타일·기타 / 장비 / 스킨 / 특성', () => {
    expect([...SHOP_KINDS]).toEqual(['consumable', 'gear', 'skin', 'trait']);
    expect(SHOP_KIND_TABS.consumable).toEqual(['food', 'medicine', 'consumable', 'tile', 'etc']);
    expect(SHOP_KIND_TABS.gear).toEqual(['equipment']);
    expect(SHOP_KIND_TABS.skin).toEqual(['skin']);
    expect(SHOP_KIND_TABS.trait).toEqual(['trait']);
    // 펫을 뺀 아이템 분류는 모두 어느 한 상점에 있다 (펫은 상점 판매 없음)
    const all = Object.values(SHOP_KIND_TABS).flat();
    for (const c of ITEM_CATEGORIES) if (c !== 'pet') expect(all).toContain(c);
    expect(new Set(all).size).toBe(all.length);
  });
  it('상점 이름 = 종족 설정 market.props (두 종족 같은 이름)', () => {
    for (const f of FACTIONS) {
      expect(SHOP_KINDS.map((k) => shopName(f, k))).toEqual(['소모품 상점', '장비 상점', '스킨 상점', '특성 상점']);
      expect(marketOf(f).shopsLabel).toBe('상점');
    }
  });
});

describe('150장 2 들어가는 곳', () => {
  it('시장 자리 = 상점 4곳 + 온천 + 떠돌이 상인, 상점마다 자리 하나', () => {
    for (const k of SHOP_KINDS) expect(MARKET_SPOTS as readonly string[]).toContain(SHOP_SPOT[k]);
    expect(new Set(Object.values(SHOP_SPOT)).size).toBe(4);
  });
  it('방 [상점] = 4곳 고르는 창, 시장 자리 = 그 상점', () => {
    const app = readFileSync('src/ui/app.ts', 'utf8');
    expect(app).toContain('onShop: () => shopPicker(faction, (kind) =>');
    expect(app).toContain('onShop: (kind) => open(\'shop\', () => shopView(dev, faction, s, { persist, kind,');
    expect(readFileSync('src/ui/roomView.ts', 'utf8')).toContain('marketOf(faction).shopsLabel');
  });
  it('튜토리얼 구급상자 안내 = 소모품 상점', () => {
    const t = readFileSync('src/data/help/tutorial.json', 'utf8');
    expect(t).toContain('구급상자는 소모품 상점에서 산다.');
    expect(t).not.toMatch(/구급상자는 상점에서/);
  });
});

describe('153장 2 장터 대장장이', () => {
  it('자리 + 이름만, 누르면 안내 한 줄(기능 없음)', () => {
    expect(MARKET_SPOTS as readonly string[]).toContain('smith');
    for (const f of FACTIONS) expect(marketOf(f).props.smith).toBe('대장장이');
    expect(readFileSync('src/ui/app.ts', 'utf8')).toContain('아직 문을 열지 않았다');
  });
});

describe('153장 1 장터의 온천 칸 삭제', () => {
  it('장터에 서는 자리에 온천이 없다 (이름 market.props.spa 는 온천 화면이 쓴다)', async () => {
    const { marketSpots } = await import('../src/ui/marketView');
    const { newSaveData } = await import('../src/game');
    expect(marketSpots(newSaveData('hollow'))).not.toContain('spa');
    expect(readFileSync('src/ui/app.ts', 'utf8')).not.toContain('onSpa: () => openSpa(faction, s)');
  });
});

// ── 150장 3~6 특성 상점 탈착 특성 ──
import { BALANCE } from '../src/config/balance';
import { getForm } from '../src/data/evolution';
import { gainEvolutionAbility, newAbilityLoadout, applyEvolutionToParams, setAbilitySlots, type AbilityLoadout } from '../src/engine/evolution';
import { DETACH_TRAITS, detachEffectText, equipDetach, makeRoomForEvolution, unequipDetach } from '../src/engine/traitShop';
import { migrateSave, MIN_LOADABLE_SAVE_FORMAT, newSaveData, SAVE_FORMAT_VERSION, SAVE_MIGRATIONS } from '../src/game';
import { buyTraitItem, equipTrait, traitItemId, traitRows, traitToggleLock, unequipTrait, TRAIT_LOCKED_IN_RUN } from '../src/shop';
import { abilityGainRow } from '../src/ui/evolutionPanel';

const lo = (slots = 1): AbilityLoadout => ({ ...newAbilityLoadout(), slots });

describe('150장 4 처음 품목 4개 (provisional)', () => {
  it('날 세우기·단단한 껍질·질긴 몸·집중 — 가격·효과는 balance.ts', () => {
    expect(DETACH_TRAITS.map((t) => [t.id, t.name, t.price])).toEqual([
      ['sharpen', '날 세우기', 800], ['shell', '단단한 껍질', 800], ['tough', '질긴 몸', 900], ['focus', '집중', 900],
    ]);
    expect(DETACH_TRAITS.map(detachEffectText)).toEqual(['주는 피해 +5%', '받는 피해 −5%', '최대 체력 +8%', '블록 치명 +5%p']);
    expect(BALANCE.provisional.traitShop.tough!.maxHp).toBe(0.08);
  });
});

describe('150장 3 사기 · 끼우기 · 빼기', () => {
  it('사면 영구 보유, 같은 특성 두 번 못 산다, 돈이 모자라면 실패', () => {
    const s = newSaveData('hollow', 1000);
    s.shared.tradeCoins = 1000;
    expect(buyTraitItem(s, traitItemId('tough')).ok).toBe(true);
    expect(s.shared.tradeCoins).toBe(100);
    expect(s.shared.traits).toEqual(['tough']);
    expect(s.runLog.shopPurchases.at(-1)).toMatchObject({ itemId: 'trait-tough', currency: 'gold', price: 900 });
    expect(buyTraitItem(s, traitItemId('tough'))).toEqual({ ok: false, reason: '이미 가지고 있다' });
    const r = buyTraitItem(s, traitItemId('sharpen'));
    expect(r.ok).toBe(false);
    expect(s.shared.traits).toEqual(['tough']);
    expect(traitRows(s).find((x) => x.id === 'trait-tough')).toMatchObject({ owned: true, canBuy: false, worn: false });
  });
  it('빈 칸에만 끼우고, 빼면 보유 목록에 남는다 · 원정 중 잠금', () => {
    const s = newSaveData('hollow', 1000);
    s.shared.traits = ['sharpen', 'shell'];
    expect(equipTrait(s, 'sharpen')).toBe(true);
    expect(s.evolution.abilities!.detached).toEqual(['sharpen']);
    expect(traitToggleLock(s, 'shell')).toBe('빈 특성 칸이 없다'); // 칸 1개
    expect(equipTrait(s, 'shell')).toBe(false);
    expect(equipTrait(s, 'tough')).toBe(false); // 안 가진 것
    s.activeExpedition = {} as never;
    expect(traitToggleLock(s, 'sharpen')).toBe(TRAIT_LOCKED_IN_RUN);
    expect(unequipTrait(s, 'sharpen')).toBe(false);
    s.activeExpedition = null;
    expect(unequipTrait(s, 'sharpen')).toBe(true);
    expect(s.evolution.abilities!.detached).toBeUndefined();
    expect(s.shared.traits).toEqual(['sharpen', 'shell']);
  });
  it('진화 특성 칸과 같은 칸 수를 나눠 쓴다', () => {
    const l = lo(2);
    gainEvolutionAbility(l, getForm('t3:water'));
    expect(equipDetach(l, ['sharpen', 'shell'], 'sharpen')).toBe(true);
    expect(equipDetach(l, ['sharpen', 'shell'], 'shell')).toBe(false);
    expect(unequipDetach(l, 'shell')).toBe(false);
  });
});

describe('150장 3 진화 특성 우선', () => {
  it('칸이 탈착 특성으로 차 있으면 하나가 보유 목록으로 빠지고 진화 특성이 들어온다 + 안내 한 줄', () => {
    const l = lo(1);
    equipDetach(l, ['focus'], 'focus');
    const g = gainEvolutionAbility(l, getForm('t3:water'));
    expect(g).toEqual({ kind: 'new', id: 'el:water', bumped: 'focus' });
    expect(l.detached).toBeUndefined();
    expect(l.equipped).toEqual(['el:water']);
    expect(abilityGainRow(g, 1, 'hollow')!.value).toContain('집중은 보유 목록으로 뺐다');
  });
  it('4단계 교체는 칸을 더 안 써서 탈착 특성이 그대로', () => {
    const l = lo(2);
    gainEvolutionAbility(l, getForm('t3:water'));
    equipDetach(l, ['focus'], 'focus');
    const g = gainEvolutionAbility(l, getForm('t4:water:special')); // 4단계 칸 +1 → 3칸
    expect(g.kind).toBe('replaced');
    expect(l.detached).toEqual(['focus']);
  });
  it('칸이 줄면 탈착 특성부터 뺀다 · 빈 칸이 있으면 안 뺀다', () => {
    const l = lo(2);
    equipDetach(l, ['focus', 'tough'], 'focus');
    equipDetach(l, ['focus', 'tough'], 'tough');
    setAbilitySlots(l, 1);
    expect(l.detached).toEqual(['focus']);
    expect(makeRoomForEvolution(lo(2))).toBeNull();
  });
});

describe('150장 4 전투에 실림', () => {
  it('주는 피해·받는 피해·최대 체력·블록 치명', () => {
    const s = newSaveData('hollow', 1000);
    const base: Record<string, any> = {};
    applyEvolutionToParams(base, s.evolution, 'hollow');
    s.evolution.abilities!.slots = 4;
    s.evolution.abilities!.detached = ['sharpen', 'shell', 'tough', 'focus'];
    const p: Record<string, any> = {};
    applyEvolutionToParams(p, s.evolution, 'hollow');
    expect(p.abilityEffects.mutation).toEqual({ dealt: 0.05, taken: 0.05 });
    const hp0 = base.playerMaxHp ?? BALANCE.provisional.combat.playerMaxHp;
    expect(p.playerMaxHp).toBeCloseTo(hp0 * 1.08);
    expect(p.blockCritChance).toBeCloseTo((base.blockCritChance ?? BALANCE.provisional.combat.blockCritChance) + 0.05);
    expect(p.blockCritChanceMax).toBeCloseTo((base.blockCritChanceMax ?? BALANCE.provisional.combat.blockCritChanceMax) + 0.05);
  });
});

describe('150장 6 세이브 형식 61', () => {
  it('형식 61 · 문턱 54 고정 · 60 → 61 마이그레이션', () => {
    expect(SAVE_FORMAT_VERSION).toBe(61);
    expect(MIN_LOADABLE_SAVE_FORMAT).toBe(54);
    expect(typeof SAVE_MIGRATIONS[60]).toBe('function');
    const old = JSON.parse(JSON.stringify(newSaveData('hollow', 1000))) as Record<string, any>;
    old.meta.format = 60;
    delete old.shared.traits;
    const m = migrateSave(old)!;
    expect(m.meta.format).toBe(61);
    expect(m.shared.traits).toEqual([]);
    expect(m.evolution.abilities!.detached).toBeUndefined();
  });
  it('보유·끼운 칸이 저장을 오간다 · 안 가진 것·모르는 것·넘친 것은 버린다', () => {
    const s = JSON.parse(JSON.stringify(newSaveData('hollow', 1000))) as Record<string, any>;
    s.shared.traits = ['tough', 'nope', 'tough', 'focus'];
    s.evolution.abilities.detached = ['tough', 'shell', 'focus'];
    const m = migrateSave(s)!;
    expect(m.shared.traits).toEqual(['tough', 'focus']);
    expect(m.evolution.abilities!.detached).toEqual(['tough']); // 칸 1개
  });
});
