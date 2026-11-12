// C.400 (GDD 241-D 5·7): 출정품(칸 2개·출발 때 소모·원정 효과·드롭·상점·팔기·런 로그·세이브 74) · 가방 [타일 배치하러 가기]
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { getFaction } from '../src/data/factions';
import { advance, buildRunRecord, createExpedition, startBattle } from '../src/engine/expedition';
import { SORTIE_IDS, sortieMods, sanitizeSortie } from '../src/engine/sortie';
import { checkUnlocks, migrateSave, newSaveData, SAVE_FORMAT_VERSION, SAVE_MIGRATIONS } from '../src/game';
import { inventoryOf } from '../src/inventory';
import { buyShopItem, goldRows } from '../src/shop';
import { sellRows } from '../src/sell';
import { departSortie, setSortieSlot } from '../src/sortie';

const read = (p: string) => readFileSync(p, 'utf8');
const SX = BALANCE.provisional.sortie;
const H = getFaction('hollow');

describe('241-D 5 출정품 데이터·효과', () => {
  it('시작 3종(용기의 물약·철피 물약·행운의 부적 가루), 칸 2개, 효과 합', () => {
    expect(SORTIE_IDS).toEqual(['sortie-courage', 'sortie-ironskin', 'sortie-luck']);
    expect(SX.slots).toBe(2);
    expect(sortieMods(['sortie-courage', 'sortie-courage', 'sortie-luck'])).toEqual({ power: 0.2, guard: 0, drop: 0.15 });
    expect(sanitizeSortie(['sortie-luck', 'nope', 'x'])).toEqual(['sortie-luck', null]);
  });
  it('끼우기(가진 것만, 모험 중 금지) → 출발 때 칸마다 1개 소모 → 원정 sortie · 0개 칸은 건너뜀 · 튜토리얼은 안 씀', () => {
    const s = newSaveData('hollow', 0);
    expect(setSortieSlot(s, 0, 'sortie-courage')).toBe(false);
    s.shared.items['sortie-courage'] = 1;
    s.shared.items['sortie-ironskin'] = 2;
    expect(setSortieSlot(s, 0, 'sortie-courage')).toBe(true);
    expect(setSortieSlot(s, 1, 'sortie-ironskin')).toBe(true);
    const exp = createExpedition({ factionId: 'hollow', seed: 3, hunger: 20, condition: 80, deck: [] });
    expect(departSortie(s, exp)).toEqual(['sortie-courage', 'sortie-ironskin']);
    expect(exp.sortie).toEqual(['sortie-courage', 'sortie-ironskin']);
    expect(s.shared.items['sortie-courage']).toBeUndefined();
    expect(s.shared.items['sortie-ironskin']).toBe(1);
    expect(s.shared.sortie).toEqual(['sortie-courage', 'sortie-ironskin']); // 0개가 돼도 칸에 남는다
    const exp2 = createExpedition({ factionId: 'hollow', seed: 4, hunger: 20, condition: 80, deck: [] });
    expect(departSortie(s, exp2)).toEqual(['sortie-ironskin']);
    const tut = createExpedition({ factionId: 'hollow', seed: 5, hunger: 20, condition: 80, deck: [], tutorial: true });
    s.shared.items['sortie-ironskin'] = 1;
    expect(departSortie(s, tut)).toEqual([]);
    s.activeExpedition = {} as never;
    expect(setSortieSlot(s, 0, null)).toBe(false);
  });
  it('원정 전투: 공격 피해 ×(1+power) · 받는 피해 ×(1−guard), 런 로그 원정 기록 sortie', () => {
    const mk = (sortie?: string[]) => {
      const exp = createExpedition({ factionId: 'hollow', seed: 11, hunger: 20, condition: 80, deck: ['prey-nest-a'] });
      if (sortie) exp.sortie = sortie;
      for (let i = 0; i < 500 && exp.phase !== 'battle'; i++) advance(exp);
      return { exp, b: startBattle(exp) };
    };
    const base = mk();
    const buff = mk(['sortie-courage', 'sortie-ironskin']);
    expect(buff.b.params.playerPowerMultiplier).toBeCloseTo(base.b.params.playerPowerMultiplier * 1.1, 9);
    expect(buff.b.params.damageTakenMultiplier).toBeCloseTo(base.b.params.damageTakenMultiplier * 0.9, 9);
    for (const x of [buff, base]) Object.assign(x.exp, { phase: 'ended', outcome: 'returned', endReason: 'returned' });
    expect(buildRunRecord(buff.exp).sortie).toEqual(['sortie-courage', 'sortie-ironskin']);
    expect(buildRunRecord(base.exp).sortie).toBeUndefined();
  });
});

describe('241-D 5 상점·가방·팔기·세이브', () => {
  it('상점 전투 소모품 탭: 잠김(첫 환생 전) → 열리면 산다 · 가방 소모품 \'출정품\' 칸 · 팔기 목록', () => {
    const s = newSaveData('hollow', 0);
    s.shared.tradeCoins = 1000;
    const row = () => goldRows(s, H).find((r) => r.id === 'sortie-courage')!;
    expect(row()).toMatchObject({ name: '용기의 물약', price: SX.items['sortie-courage']!.price, canBuy: false, lock: '첫 환생 후 출정품이 열린다' });
    s.rebirth.count = 1;
    checkUnlocks(s, 1); // C.403: 해금은 환생 때 저장된다 (engine/unlocks)
    expect(row().canBuy).toBe(true);
    expect(buyShopItem(s, H, 'sortie-courage', 5)).toMatchObject({ ok: true });
    expect(s.shared.items['sortie-courage']).toBe(1);
    expect(inventoryOf(s, H).find((e) => e.id === 'sortie-courage')).toMatchObject({ category: 'consumable', action: null, sortie: { slots: [] } });
    expect(sellRows(s, H).find((e) => e.key === 'sortie-courage')).toMatchObject({ count: 1, group: 'battle' });
  });
  it('세이브 형식 74: 73 → 74 = 빈 칸 2개, 저장·불러오기로 칸·개수가 남는다', () => {
    expect(SAVE_FORMAT_VERSION).toBe(84); // C.406 쇠약 시계·터치·숨은 모습
    const s = newSaveData('hollow', 0);
    s.shared.items['sortie-luck'] = 3;
    s.shared.sortie = ['sortie-luck', null];
    const m = migrateSave(JSON.parse(JSON.stringify(s)))!;
    expect(m.shared.sortie).toEqual(['sortie-luck', null]);
    expect(m.shared.items['sortie-luck']).toBe(3);
    const raw = JSON.parse(JSON.stringify(s));
    delete raw.shared.sortie;
    SAVE_MIGRATIONS[73]!(raw);
    expect(raw.shared.sortie).toEqual([null, null]);
  });
  it('출발 때 소모(app onStart) · 드롭 굴림 · 귀환 정산 연결', () => {
    expect(read('src/ui/app.ts')).toContain('const sortieUsed = departSortie(save!, exp);');
    const ex = read('src/engine/expedition/expedition.ts');
    expect(ex).toContain("rollSortieDrop(exp, pending.boss ? 'boss'");
    expect(read('src/game.ts')).toContain('settleSortieFinds(save, exp);');
  });
});

describe('241-D 7 가방 [타일 배치하러 가기]', () => {
  it('가방 타일 창 버튼 → 배치만 하는 창(출발 없음·[닫기]·프리셋 저장)', () => {
    expect(read('src/ui/lcdScreens.ts')).toContain("label: '타일 배치하러 가기'");
    expect(read('src/ui/app.ts')).toContain('placeOnly: { onClose: () => nav.pop() },');
    const pv = read('src/ui/planView.ts');
    expect(pv).toContain("const close = button({ label: '닫기'");
    expect(pv).toContain("main.dataset.screen = 'tile-place';");
  });
});

describe('241-0 수정 전투 소모품 칸 게이트', () => {
  it('3단계 전에는 잠김(이미 넣은 칸이 있으면 열림), 장비 탭 칸은 자물쇠', async () => {
    const { gateOpen, gateHint } = await import('../src/unlockGate');
    const s = newSaveData('hollow', 0);
    s.shared.battleItem = null;
    expect(gateOpen(s, 'battleItem')).toBe(false);
    s.evolution.tierIndex = 2;
    checkUnlocks(s, 1); // C.403: 해금은 진화 때 저장된다 (engine/unlocks)
    expect(gateOpen(s, 'battleItem')).toBe(true);
    expect(gateHint(H, 'battleItem')).toBe('아쥬커스가 되면 전투 소모품이 열린다');
    expect(read('src/ui/equipView.ts')).toContain("const battleOpen = gateOpen(save, 'battleItem');");
  });
});
