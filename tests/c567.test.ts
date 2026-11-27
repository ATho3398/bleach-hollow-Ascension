// C.567 (GDD 6-16 v6.248 → v6.253, 코딩361): 마스터AT 추가 지시(입장권 3종 + 연습 모드) 점검 — 본체는 C.564(요일·보스권·연습)·C.566(토벌권) 에 들어갔고,
// 여기서는 연습 결과 화면 '연습 — 보상 없음' 한 줄과 세 탭 입장권 칩·상점 입장권 3종을 한 번에 확인한다
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { getFaction } from '../src/data/factions';
import { specialState, newSaveData, settleSpecialRun } from '../src/game';
import { goldRows } from '../src/shop';
import { cornerValues, specialCornerKind } from '../src/ui/bha/corner';
import type { CombatState } from '../src/engine/combat';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const NOW = Date.UTC(2026, 10, 29, 3); // 일요일 KST 12시
const won = { status: 'won', lossReason: null, tick: 1, enemy: { def: { id: 'e' } }, player: { hp: 1, maxHp: 1 }, params: { playerStartHpFraction: 1 } } as unknown as CombatState;

describe('C.567 입장권 3종 + 연습 (마스터 지시 대조)', () => {
  it('채움 2·3·2, 상점 기타 탭 100·300·500, 탭마다 칩 = 그 입장권(탑 = 골드·영옥)', () => {
    const T = BALANCE.provisional.specialDungeon.tickets;
    expect([T.daily.refill, T.boss.refill, T.raid.refill]).toEqual([2, 3, 2]);
    const s = newSaveData('hollow', 1);
    specialState(s, NOW);
    expect(goldRows(s, getFaction('hollow'), NOW).filter((r) => r.id.startsWith('ticket-')).map((r) => r.price)).toEqual([100, 300, 500]);
    expect(['daily', 'boss', 'raid'].map((k) => cornerValues(specialCornerKind(`special-${k}`)!, s, NOW)[0]!.value)).toEqual([2, 3, 2]);
    expect(specialCornerKind('tower')).toBeNull();
  });

  it('연습 = 입장권·보상·기록 그대로, 결과 화면 "연습 — 보상 없음"', () => {
    const s = newSaveData('hollow', 1);
    specialState(s, NOW);
    const before = JSON.stringify([s.tower.tickets, s.shared.special, s.shared.tradeCoins, s.bossDex, s.nest]);
    settleSpecialRun(s, { mode: 'raid', target: 'raid-seireitei', bossId: 'br-byakuya', star: 1, battles: [won, won, won, won, won], total: 5, quit: false, practice: true }, NOW);
    expect(JSON.stringify([s.tower.tickets, s.shared.special, s.shared.tradeCoins, s.bossDex, s.nest])).toBe(before);
    expect(s.runLog.specialRuns.at(-1)).toMatchObject({ practice: true, mode: 'raid' });
    const v = read('src/ui/specialDungeonView.ts');
    expect(v).toMatch(/value: run\.practice \? '연습 — 보상 없음'/);
    expect(v).toMatch(/const reason = run\.practice \? `연습 — 보상 없음\./);
  });
});
