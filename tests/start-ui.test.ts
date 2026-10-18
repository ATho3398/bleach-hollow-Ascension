// 시작 화면·이어하기 슬롯 선택 (GDD 18-1, C.38)
import { describe, expect, it } from 'vitest';
import { newSaveData, writeSave } from '../src/game';
import { allSlotSummaries, slotKey, touchSlot } from '../src/saveSlots';
import { continueChoices } from '../src/ui/slotView';

function memStore() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

describe('이어하기 슬롯 선택 (GDD 18-1)', () => {
  it('세이브가 없으면 열 수 있는 슬롯도 기본 선택도 없다', () => {
    const c = continueChoices(allSlotSummaries(memStore()));
    expect(c.openable).toEqual([]);
    expect(c.defaultSlot).toBeNull();
  });

  it('정상 슬롯만 열 수 있고, 가장 최근에 한 슬롯이 기본 선택이다', () => {
    const store = memStore();
    writeSave(store, newSaveData('hollow', 1), slotKey(1));
    writeSave(store, newSaveData('shinigami', 1), slotKey(3));
    store.setItem(slotKey(2), '{깨진');
    touchSlot(store, 1);
    touchSlot(store, 3);
    const sums = allSlotSummaries(store);
    const c = continueChoices(sums);
    expect(c.openable).toEqual([1, 3]);
    expect(c.defaultSlot).toBe(sums.filter((s) => s.state === 'ok').sort((a, b) => ((b as { playedAt: number | null }).playedAt ?? 0) - ((a as { playedAt: number | null }).playedAt ?? 0))[0]!.slot);
  });
});
