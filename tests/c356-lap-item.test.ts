// GDD 212장 (C.356, 코딩248): 모험 중 소모품 = 소모품 칸에 끼운 1개, 걷기·전투 어디서든 바퀴당 1번, 바퀴 끝 창에서 바꿔 끼우기·빼기, 런 로그 lapItems
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { newSaveData, SAVE_MIGRATIONS } from '../src/game';
import { lapItemUsed, markLapItem } from '../src/engine/expedition';
import { departFillBattleSlot, LAP_ITEM_USED, lapItemLine, lapItemLock, setLapItem, spendLapItem, useSlotItemOnWalk } from '../src/inventory';

const read = (p: string) => readFileSync(p, 'utf8');
const fresh = () => {
  const s = newSaveData('hollow', 1);
  s.shared.items = { 'heal-salve': 2, 'heal-patch': 3 };
  s.shared.battleItem = 'heal-salve';
  return s;
};
const walkExp = (lap = 1) => ({ lap, hpFraction: 0.3, phase: 'moving', lapItems: undefined as undefined | { lap: number; itemId: string; where: 'walk' | 'battle' }[] });

describe('212장 1: 끼운 1개만', () => {
  it('걷기 가방: 끼운 것만 쓴다 — 다른 회복 물건은 못 쓴다', () => {
    const s = fresh();
    const exp = walkExp();
    expect(useSlotItemOnWalk(s, exp, 'heal-patch')).toMatchObject({ ok: false });
    expect(s.shared.items['heal-patch']).toBe(3);
    expect(useSlotItemOnWalk(s, exp, 'heal-salve')).toMatchObject({ ok: true });
    expect(s.shared.items['heal-salve']).toBe(1);
  });
  it('빈 칸이면 못 쓴다', () => {
    const s = fresh();
    s.shared.battleItem = null;
    expect(lapItemLock(s, walkExp())).not.toBeNull();
  });
});

describe('212장 2: 바퀴당 1번 (걷기·전투 공통)', () => {
  it('걷기에서 쓰면 같은 바퀴 전투에서도 잠김, 다음 바퀴는 다시 1번', () => {
    const s = fresh();
    const exp = walkExp();
    expect(useSlotItemOnWalk(s, exp, 'heal-salve').ok).toBe(true);
    expect(lapItemUsed(exp)).toBe(true);
    expect(lapItemLock(s, exp)).toBe(LAP_ITEM_USED);
    exp.hpFraction = 0.2;
    expect(useSlotItemOnWalk(s, exp, 'heal-salve')).toEqual({ ok: false, reason: LAP_ITEM_USED });
    exp.lap = 2;
    expect(lapItemLock(s, exp)).toBeNull();
    expect(useSlotItemOnWalk(s, exp, 'heal-salve').ok).toBe(true);
    expect(exp.lapItems).toEqual([{ lap: 1, itemId: 'heal-salve', where: 'walk' }, { lap: 2, itemId: 'heal-salve', where: 'walk' }]);
  });
  it('전투에서 쓰면 1개 줄고 그 바퀴 걷기에서도 못 쓴다', () => {
    const s = fresh();
    const exp = walkExp(3);
    spendLapItem(s, exp, 'heal-salve');
    expect(s.shared.items['heal-salve']).toBe(1);
    expect(exp.lapItems).toEqual([{ lap: 3, itemId: 'heal-salve', where: 'battle' }]);
    expect(useSlotItemOnWalk(s, exp, 'heal-salve')).toMatchObject({ ok: false });
    expect(markLapItem(exp, 'heal-salve', 'walk')).toBe(false);
    expect(lapItemLine(s, exp)).toContain('이번 바퀴에 이미 썼다');
  });
  it('모험 전투는 이번 바퀴에 썼으면 소모품을 싣지 않는다 (앱 연결)', () => {
    const app = read('src/ui/app.ts');
    expect(app).toContain('...(save ? expBattleItemOpts(save, exp, s) : {}),');
    expect(app).toContain('spendLapItem(sv, exp, it.id)');
    expect(app).toContain('const r = useSlotItemOnWalk(sv, exp, id);');
  });
});

describe('212장 3: 바퀴 끝 창에서 바꿔 끼우기·빼기', () => {
  it('둥지 칸 도착(nest-choice) 때만, 가진 것으로만', () => {
    const s = fresh();
    const exp = { ...walkExp(), phase: 'moving' };
    expect(setLapItem(s, exp, 'heal-patch')).toBe(false);
    exp.phase = 'nest-choice';
    expect(setLapItem(s, exp, 'heal-patch')).toBe(true);
    expect(s.shared.battleItem).toBe('heal-patch');
    expect(setLapItem(s, exp, 'battle-haste')).toBe(false); // 안 가진 것
    expect(setLapItem(s, exp, null)).toBe(true);
    expect(s.shared.battleItem).toBeNull();
  });
  it('바퀴 끝 창에 소모품 칸 줄', () => {
    expect(read('src/ui/expeditionView.ts')).toContain('lapItemSlot({');
  });
});

describe('212장 4·5: 출발 때 자동 채움 · 런 로그 · 세이브', () => {
  it('출발 때 빈 칸이면 회복량 큰 것을 넣고, 찬 칸은 그대로', () => {
    const s = fresh();
    s.shared.battleItem = null;
    expect(departFillBattleSlot(s)).toBe(true);
    expect(s.shared.battleItem).toBe('heal-salve');
    expect(departFillBattleSlot(s)).toBe(false);
  });
  it('모험 전투에는 빈 칸 고르기 창이 없다', () => {
    const app = read('src/ui/app.ts');
    const fn = app.slice(app.indexOf('function expBattleItemOpts'), app.indexOf('/** 탑 전투 화면'));
    expect(fn).not.toContain('pickBattleItem');
  });
  it('런 로그 원정 기록 lapItems · 형식 65 → 66 변환', () => {
    expect(read('src/engine/expedition/expedition.ts')).toContain('lapItems: exp.lapItems.map((u) => ({ ...u }))');
    expect(typeof SAVE_MIGRATIONS[65]).toBe('function');
  });
});
