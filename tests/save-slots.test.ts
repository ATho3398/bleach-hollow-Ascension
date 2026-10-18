import { describe, expect, it } from 'vitest';
import { loadSave, newSaveData, SAVE_KEY, writeSave } from '../src/game';
import { applyImport, hasBackup, swapWithBackup } from '../src/saveBackup';
import {
  allSlotSummaries, lastPlayedSlot, SLOT_COUNT, slotBackupKey, slotKey, slotSummary, stashSlot, touchSlot,
} from '../src/saveSlots';

function memStore(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

describe('세이브 슬롯 (Q-3)', () => {
  it('슬롯 1 은 예전 단일 세이브 키 그대로, 나머지는 슬롯별 키', () => {
    expect(SLOT_COUNT).toBe(3);
    expect(slotKey(1)).toBe(SAVE_KEY);
    expect(slotKey(2)).not.toBe(slotKey(3));
    expect(slotBackupKey(1)).toBe(`${SAVE_KEY}.backup`);
  });

  it('옛 세이브(기존 키)는 마이그레이션 없이 슬롯 1 요약으로 보이고 나머지는 비어 있다', () => {
    const store = memStore();
    const save = newSaveData('hollow', 1);
    writeSave(store, save);
    const sums = allSlotSummaries(store);
    expect(sums.map((s) => s.state)).toEqual(['ok', 'empty', 'empty']);
    const first = sums[0]!;
    expect(first.state === 'ok' && first.factionId).toBe('hollow');
    expect(first.state === 'ok' && first.playedAt).toBeNull();
    expect(lastPlayedSlot(sums)).toBe(1);
  });

  it('슬롯마다 따로 저장·로드되고 서로 섞이지 않는다', () => {
    const store = memStore();
    writeSave(store, newSaveData('hollow', 1), slotKey(1));
    writeSave(store, newSaveData('shinigami', 1), slotKey(3));
    expect(loadSave(store, slotKey(1))!.factionId).toBe('hollow');
    expect(loadSave(store, slotKey(2))).toBeNull();
    expect(loadSave(store, slotKey(3))!.factionId).toBe('shinigami');
  });

  it('이어하기는 마지막 플레이가 가장 최근인 슬롯을 연다', () => {
    const store = memStore();
    writeSave(store, newSaveData('hollow', 1), slotKey(1));
    writeSave(store, newSaveData('shinigami', 1), slotKey(2));
    touchSlot(store, 1, 1000);
    touchSlot(store, 2, 5000);
    expect(lastPlayedSlot(allSlotSummaries(store))).toBe(2);
    touchSlot(store, 1, 9000);
    expect(lastPlayedSlot(allSlotSummaries(store))).toBe(1);
    expect(lastPlayedSlot([{ slot: 1, state: 'empty' }])).toBeNull();
  });

  it('손상된 슬롯은 broken 으로 보이고 이어하기 후보에서 빠진다', () => {
    const store = memStore({ [slotKey(1)]: '{not json', [slotKey(2)]: JSON.stringify({ hello: 1 }) });
    expect(slotSummary(store, 1).state).toBe('broken');
    expect(slotSummary(store, 2).state).toBe('broken');
    expect(lastPlayedSlot(allSlotSummaries(store))).toBeNull();
  });

  it('덮어쓰기 전 stash 는 그 슬롯의 백업 키에 한 번 보관하고, 빈 슬롯은 건드리지 않는다', () => {
    const store = memStore();
    expect(stashSlot(store, 2)).toBe(true);
    expect(store.m.has(slotBackupKey(2))).toBe(false);
    writeSave(store, newSaveData('hollow', 1), slotKey(2));
    const before = store.m.get(slotKey(2))!;
    expect(stashSlot(store, 2)).toBe(true);
    expect(store.m.get(slotBackupKey(2))).toBe(before);
  });

  it('백업 가져오기·되돌리기는 지정한 슬롯에만 작용한다', () => {
    const store = memStore();
    writeSave(store, newSaveData('hollow', 1), slotKey(1));
    writeSave(store, newSaveData('hollow', 1), slotKey(2));
    const slot1 = store.m.get(slotKey(1));
    expect(applyImport(store, newSaveData('shinigami', 1), 2)).toBe(true);
    expect(store.m.get(slotKey(1))).toBe(slot1);
    expect(loadSave(store, slotKey(2))!.factionId).toBe('shinigami');
    expect(hasBackup(store, 2)).toBe(true);
    expect(hasBackup(store, 1)).toBe(false);
    expect(swapWithBackup(store, 2)).toBe(true);
    expect(loadSave(store, slotKey(2))!.factionId).toBe('hollow');
  });

  it('시각 메타가 깨져도 요약은 동작한다', () => {
    const store = memStore({ [`${SAVE_KEY}.slots`]: 'zzz' });
    writeSave(store, newSaveData('hollow', 1));
    const s = slotSummary(store, 1);
    expect(s.state === 'ok' && s.playedAt).toBeNull();
  });
});
