// C.412 (GDD 243장 1·2·3): 붕옥 등장 = 스토리 전부 클리어(두 번째 트랙 같은 순간) · 상점 타일·전투 소모품 해금 판정 · 장비 해금 때 낡은 장비 3종
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { FACTIONS, getFaction } from '../src/data/factions';
import { STARTER_GEAR } from '../src/data/gear';
import { GUIDES } from '../src/data/help';
import { STORY_CHAPTERS } from '../src/data/story';
import { guidePending } from '../src/engine/tutorial';
import { checkTrackOpen, checkUnlocks, migrateSave, newSaveData, SAVE_FORMAT_VERSION, SAVE_MIGRATIONS, storyAllCleared, type SaveData } from '../src/game';
import { gearName } from '../src/inventory';
import { goldGate, goldRows } from '../src/shop';
import { getGoldItem } from '../src/data/shop';
import { clearStory } from './helpers/storyClear';

describe('243장 1 붕옥 등장 = 스토리 전부 클리어', () => {
  it('장 하나라도 덜 깼으면 아니다 · 다 깨면 붕옥 탭·등장 컷·두 번째 트랙이 한 번에 (두 종족)', () => {
    for (const f of FACTIONS) {
      const s = newSaveData(f.id, 1);
      s.evolution.tierIndex = 3;
      s.story[f.id] = { ...(s.story[f.id] ?? { cleared: {}, chapters: [] }), chapters: STORY_CHAPTERS.slice(0, -1).map((c) => c.id) } as never;
      expect(storyAllCleared(s, f.id)).toBe(false);
      expect(checkTrackOpen(s, 5)).toBeNull();
      expect(s.hogyoku.tabOpen).toBe(false);
      clearStory(s);
      expect(storyAllCleared(s, f.id)).toBe(true);
      const opened = checkTrackOpen(s, 6);
      expect(opened).not.toBeNull();
      expect(opened).not.toBe(f.id);
      expect(s.hogyoku).toMatchObject({ tabOpen: true, tabNotice: true, appearedAt: 6 });
      expect(guidePending(s.help, 'hogyoku-appear')).toBe(true);
      expect(s.slotLog.trackOpens).toEqual([{ at: 6, factionId: opened, byFactionId: f.id }]);
    }
  });

  it('옛 openTierIndex 는 없다 — 마지막 단계 진화만으로는 트랙이 안 열린다', () => {
    expect('openTierIndex' in BALANCE.provisional.twoTrack).toBe(false);
    const s = newSaveData('hollow', 1);
    s.evolution.tierIndex = 3;
    s.rebirth.count = 2;
    expect(checkTrackOpen(s, 2)).toBeNull();
    expect(s.otherTracks).toHaveLength(0);
  });

  it('옛 세이브에서 이미 열린 두 번째 트랙·붕옥 탭은 닫지 않는다 (77 → 78: 열린 붕옥 등장 시각 0)', () => {
    const s = newSaveData('hollow', 1);
    s.hogyoku.tabOpen = true;
    const raw = JSON.parse(JSON.stringify(s)) as SaveData & { meta: { format: number } };
    raw.meta.format = 77;
    delete (raw.hogyoku as Partial<SaveData['hogyoku']>).appearedAt;
    expect(SAVE_FORMAT_VERSION).toBe(83);
    expect(typeof SAVE_MIGRATIONS[77]).toBe('function');
    const m = migrateSave(raw)!;
    expect(m.hogyoku.tabOpen).toBe(true);
    expect(m.hogyoku.appearedAt).toBe(0);
    const fresh = migrateSave({ ...JSON.parse(JSON.stringify(newSaveData('hollow', 1))), meta: { ...s.meta, format: 77 } })!;
    expect(fresh.hogyoku.appearedAt).toBeNull();
  });

  it('등장 컷 문구 3장 · 붕옥 아이콘을 가리킨다', () => {
    const sc = GUIDES['hogyoku-appear'];
    expect(sc.map((x) => x.id)).toEqual(['appear', 'track', 'tab']);
    expect(sc[0]!.targets).toContain('@.bha-prop--hogyoku');
  });
});

describe('243장 2 상점 해금 판정', () => {
  const H = getFaction('hollow');
  it('타일 뽑기·희귀 타일·배치 칸 = 타일 해금 · 전투 전용 소모품 = 전투 소모품 해금 · 회복 물건은 처음부터', () => {
    expect(goldGate(getGoldItem('tile-draw')!)).toBe('tiles');
    expect(goldGate(getGoldItem('deck-slot')!)).toBe('tiles');
    expect(goldGate(getGoldItem('battle-haste')!)).toBe('battleItem');
    expect(goldGate(getGoldItem('heal-patch')!)).toBeNull();
    expect(goldGate(getGoldItem('battle-potion')!)).toBeNull(); // 회복 물건(가방 '약' 칸)
    const s = newSaveData('hollow', 1);
    s.shared.tradeCoins = 99999;
    const row = (id: string) => goldRows(s, H).find((r) => r.id === id)!;
    expect(row('battle-haste')).toMatchObject({ canBuy: false, lock: '아쥬커스가 되면 전투 소모품이 열린다' });
    expect(row('deck-slot').canBuy).toBe(false);
    expect(row('heal-patch').canBuy).toBe(true);
    s.shared.unlocks.battleItem = 0;
    s.shared.unlocks.tiles = 0;
    expect(row('battle-haste').canBuy).toBe(true);
    expect(row('deck-slot').canBuy).toBe(true);
  });
});

describe('243장 3 장비 해금 때 낡은 장비 3종', () => {
  it('3단계에 닿는 순간 낡은 무기·방어구·신발 노멀 1개씩 (종족 공통 이름) · 런 로그 source unlock · 한 번만', () => {
    expect(STARTER_GEAR.map((g) => g.name)).toEqual(['낡은 무기', '낡은 방어구', '낡은 신발']);
    for (const f of FACTIONS) {
      const s = newSaveData(f.id, 1);
      s.evolution.tierIndex = 2;
      expect(checkUnlocks(s, 10)).toContain('gear');
      const items = s.shared.gear.items;
      expect(items.map((i) => [i.kind, i.grade, i.name])).toEqual([['weapon', 'normal', '낡은 무기'], ['armor', 'normal', '낡은 방어구'], ['shoes', 'normal', '낡은 신발']]);
      expect(items.every((i) => Object.keys(i.stats).length > 0)).toBe(true);
      expect(Object.values(s.shared.gear.equipped).every((v) => v === null)).toBe(true); // 착용은 안내 카드에서 직접
      expect(gearName({ ...items[0]!, plus: 1 }, getFaction(f.id))).toBe('낡은 무기 +1');
      expect(s.runLog.gear.map((g) => g.source)).toEqual(['unlock', 'unlock', 'unlock']);
      checkUnlocks(s, 11);
      expect(s.shared.gear.items).toHaveLength(3);
    }
  });
  it('이름은 저장·불러오기로 남는다', () => {
    const s = newSaveData('hollow', 1);
    s.evolution.tierIndex = 2;
    checkUnlocks(s, 1);
    const back = migrateSave(JSON.parse(JSON.stringify(s)))!;
    expect(back.shared.gear.items.map((i) => i.name)).toEqual(['낡은 무기', '낡은 방어구', '낡은 신발']);
  });
});
