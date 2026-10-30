// C.145 (GDD 93장): 슬롯은 고르기만, ✓ 확인으로 시작, [삭제] 버튼
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { newSaveData, writeSave } from '../src/game';
import { hasBackup } from '../src/saveBackup';
import { allSlotSummaries, deleteSlot, lastPlayedSlot, readBackupMeta, slotBackupKey, slotKey, touchSlot } from '../src/saveSlots';

function memStore() {
  const m = new Map<string, string>();
  return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
}
const read = (p: string): string => readFileSync(p, 'utf8');

describe('C.145 슬롯 선택·확인·삭제', () => {
  it('슬롯 행을 누르면 고르기만 한다 — onPick(시작)은 ✓ 확인 버튼에만 걸려 있다', () => {
    const v = read('src/ui/slotView.ts');
    expect(v).toMatch(/slotRows\(summaries, factions, \(s\) => \{\s*selected = s\.slot;\s*sync\(\);/);
    expect(v).toContain("onClick: () => sum && onPick(sum)");
    expect(v.match(/onPick\(/g)!.length).toBe(1);
    expect(v).toContain("icon: 'i-check'");
    expect(v).toContain("variant: 'danger'");
  });
  it('삭제: 기록 있는 슬롯만, 확인창 문구 + 예 → deleteSlot, 세 모드 모두 같은 화면', () => {
    const v = read('src/ui/slotView.ts');
    expect(v).toContain("sum.state === 'empty'");
    const a = read('src/ui/app.ts');
    expect(a).toContain('을(를) 지운다. 지우기 전 세이브 하나는 백업으로 남는다.'); // C.237 (GDD 159장 15) // C.218: 슬롯 번호 뒤 조사는 fixParticles
    expect(a).toContain('deleteSlot(store, sum.slot)');
  });
  it('deleteSlot: 슬롯이 비고, 지우기 전 내용은 슬롯 백업에 보관, 다른 슬롯·마지막 플레이 갱신', () => {
    const st = memStore();
    writeSave(st, newSaveData('hollow'), slotKey(1));
    writeSave(st, newSaveData('shinigami'), slotKey(2));
    touchSlot(st, 1, 1000);
    touchSlot(st, 2, 2000);
    const before = st.getItem(slotKey(2));
    expect(lastPlayedSlot(allSlotSummaries(st))).toBe(2);
    expect(deleteSlot(st, 2)).toBe(true);
    const sums = allSlotSummaries(st);
    expect(sums[1]!.state).toBe('empty');
    expect(sums[0]!.state).toBe('ok');
    expect(st.getItem(slotBackupKey(2))).toBe(before);
    expect(hasBackup(st, 2)).toBe(true);
    expect(readBackupMeta(st, 2)?.reason).toBe('delete');
    expect(lastPlayedSlot(sums)).toBe(1);
  });
  it('deleteSlot: removeItem 이 없는 저장소는 false (아무것도 지우지 않음)', () => {
    const st = memStore();
    writeSave(st, newSaveData('hollow'), slotKey(1));
    const bare = { getItem: st.getItem, setItem: st.setItem };
    expect(deleteSlot(bare, 1)).toBe(false);
    expect(st.getItem(slotKey(1))).not.toBeNull();
  });
});
