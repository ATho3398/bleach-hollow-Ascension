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
