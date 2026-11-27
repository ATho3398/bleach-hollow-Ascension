// C.564 (GDD 6-16 v6.246, 코딩361): 특수던전 요일던전 — 옛 주간던전 탭 이름 → 요일던전, 붕옥 재료 던전 요일 개방(월·목 / 화·금 / 수·토, 일요일 셋 다, 05:00 KST),
// 새 던전 4개(골드·장비·장신구·장비 재료) 매일, 던전마다 하루 2회, 세이브 형식 99 → 100
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { FACTIONS } from '../src/data/factions';
import { MATERIAL_IDS } from '../src/data/materials';
import { specialDungeonLabels } from '../src/engine/faction';
import {
  DAILY_DUNGEONS, dailyEnemies, dailyKey, dailyOpenDays, dailyOpenText, dailyOpenToday, dailyReward, dayStartOf, entriesLeft, gameWeekday, nextDayAt, SPECIAL_TABS,
} from '../src/engine/specialDungeon';
import { dailyAvailable, enterSpecial, migrateDailyDungeon, migrateSave, newSaveData, SAVE_FORMAT_VERSION, settleSpecialRun, specialState } from '../src/game';
import type { CombatState } from '../src/engine/combat';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const SX = BALANCE.provisional.specialDungeon;
const kst = (y: number, mo: number, d: number, h: number, mi = 0) => Date.UTC(y, mo - 1, d, h - 9, mi);
const fake = (won: boolean): CombatState => ({ status: won ? 'won' : 'lost', lossReason: won ? null : 'hp', tick: 100, enemy: { def: { id: 'e1' } }, player: { hp: 50, maxHp: 100 }, params: { playerStartHpFraction: 1 } } as unknown as CombatState);
const win3 = () => [fake(true), fake(true), fake(true)];
// 2026-11-30 월 · 12-01 화 · 12-02 수 · 12-03 목 · 12-04 금 · 12-05 토 · 12-06 일
const MON = kst(2026, 11, 30, 12);
const SUN = kst(2026, 12, 6, 12);

describe('C.564 날 바뀜 = 05:00 KST', () => {
  it('하루 시작·요일은 05:00 KST 에 바뀐다 (월요일 04:59 = 아직 일요일)', () => {
    expect(dayStartOf(kst(2026, 11, 30, 4, 59))).toBe(kst(2026, 11, 29, 5));
    expect(dayStartOf(kst(2026, 11, 30, 5))).toBe(kst(2026, 11, 30, 5));
    expect(gameWeekday(kst(2026, 11, 30, 4, 59))).toBe(0);
    expect(gameWeekday(kst(2026, 11, 30, 5))).toBe(1);
    expect(nextDayAt(MON)).toBe(kst(2026, 12, 1, 5));
  });

  it('붕옥 재료 던전 = 세공 월·목 · 정제 화·금 · 주입 수·토 · 일요일 셋 다, 새 던전 4개 = 매일', () => {
    expect(dailyOpenDays('soul')).toEqual([0, 1, 4]);
    expect(dailyOpenDays('shard')).toEqual([0, 2, 5]);
    expect(dailyOpenDays('essence')).toEqual([0, 3, 6]);
    const open = (t: number) => DAILY_DUNGEONS.filter((id) => dailyOpenToday(id, t));
    expect(open(MON)).toEqual(['soul', 'gold', 'gear', 'accessory', 'gearMat']);
    expect(open(kst(2026, 12, 1, 12))).toEqual(['shard', 'gold', 'gear', 'accessory', 'gearMat']);
    expect(open(kst(2026, 12, 5, 12))).toEqual(['essence', 'gold', 'gear', 'accessory', 'gearMat']);
    expect(open(SUN)).toEqual([...DAILY_DUNGEONS]);
    expect(dailyOpenText('soul')).toBe('월·목에 열린다');
    expect(dailyOpenText('shard')).toBe('화·금에 열린다');
    expect(dailyOpenText('essence')).toBe('수·토에 열린다');
  });
});

describe('C.564 입장 — 던전마다 하루 2회, 닫힌 날·해금 전은 못 들어간다', () => {
  it('하루 2회, 다음 날 05:00 에 다시 2회 (보스전 주 1회는 그대로)', () => {
    const s = newSaveData('hollow', 1);
    expect(SX.daily.entries).toBe(2);
    expect(enterSpecial(s, 'daily', 'gold', MON)).toBe(true);
    expect(enterSpecial(s, 'daily', 'gold', MON + 1)).toBe(true);
    expect(enterSpecial(s, 'daily', 'gold', MON + 2)).toBe(false);
    expect(entriesLeft(specialState(s, MON), dailyKey('gold'), MON)).toBe(0);
    const tue = kst(2026, 12, 1, 5);
    expect(entriesLeft(specialState(s, tue), dailyKey('gold'), tue)).toBe(2);
    expect(enterSpecial(s, 'daily', 'gold', tue)).toBe(true);
  });

  it('닫힌 요일의 붕옥 재료 던전은 입장 안 됨, 장비·장신구 던전은 그 기능 해금 전 자물쇠', () => {
    const s = newSaveData('hollow', 1);
    expect(enterSpecial(s, 'daily', 'shard', MON)).toBe(false); // 정제 = 화·금
    expect(enterSpecial(s, 'daily', 'soul', MON)).toBe(true);
    expect(dailyAvailable(s, 'gear', MON)).toBe(false);
    expect(dailyAvailable(s, 'accessory', MON)).toBe(false);
    s.shared.unlocks.gear = 1;
    expect(dailyAvailable(s, 'gear', MON)).toBe(true);
    expect(dailyAvailable(s, 'accessory', MON)).toBe(false);
    s.shared.unlocks.accessory = 1;
    expect(enterSpecial(s, 'daily', 'accessory', MON)).toBe(true);
  });
});

describe('C.564 보상 (다 이겼을 때만)', () => {
  it('골드 던전 = 골드 150 × ★ (빈사면 절반)', () => {
    const s = newSaveData('hollow', 1);
    s.shared.tradeCoins = 0;
    expect(dailyReward('gold', 3).gold).toBe(SX.daily.gold.goldPerStar * 3);
    settleSpecialRun(s, { mode: 'daily', target: 'gold', star: 3, battles: win3(), total: 3, quit: false }, MON);
    expect(s.shared.tradeCoins).toBe(450);
    s.nest.collapsed = true;
    settleSpecialRun(s, { mode: 'daily', target: 'gold', star: 2, battles: win3(), total: 3, quit: false }, MON);
    expect(s.shared.tradeCoins).toBe(450 + Math.floor(300 * BALANCE.provisional.nest.care.dying.rewardMult));
  });

  it('장비 던전 = 무기·방어구·신발 1개(★ = 고른 ★), 장신구 던전 = 장신구 1개, 가방 가득이면 판 골드, 런 로그 source special', () => {
    const s = newSaveData('hollow', 1);
    const n0 = s.shared.gear.items.length;
    const r = settleSpecialRun(s, { mode: 'daily', target: 'gear', star: 2, battles: win3(), total: 3, quit: false }, MON);
    expect(r.gear).toHaveLength(1);
    expect(['weapon', 'armor', 'shoes']).toContain(r.gear[0]!.kind);
    expect(s.shared.gear.items.length).toBe(n0 + 1);
    expect(s.shared.gear.items.at(-1)!.star).toBe(2);
    expect(s.runLog.gear.at(-1)).toMatchObject({ kind: 'get', source: 'special' });
    const a = settleSpecialRun(s, { mode: 'daily', target: 'accessory', star: 4, battles: win3(), total: 3, quit: false }, MON + 7);
    expect(a.gear[0]!.kind).toBe('accessory');
    expect(s.runLog.specialRuns.at(-1)).toMatchObject({ mode: 'daily', target: 'accessory', won: true });
    expect(s.runLog.specialRuns.at(-1)!.gear).toHaveLength(1);
    // 가방 가득 → 바로 판 골드
    while (s.shared.gear.items.length < BALANCE.provisional.gear.cap) s.shared.gear.items.push({ ...s.shared.gear.items[0]!, uid: `x${s.shared.gear.items.length}` });
    s.shared.tradeCoins = 0;
    const full = settleSpecialRun(s, { mode: 'daily', target: 'gear', star: 1, battles: win3(), total: 3, quit: false }, MON + 9);
    expect(full.gear[0]!.sold).toBeGreaterThan(0);
    expect(s.shared.tradeCoins).toBe(full.gear[0]!.sold);
  });

  it('장비 재료 던전 = 재료 22종 중 2·3·5·7개 → 가방(보관함 shared.items)', () => {
    const s = newSaveData('hollow', 1);
    const r = settleSpecialRun(s, { mode: 'daily', target: 'gearMat', star: 3, battles: win3(), total: 3, quit: false }, MON);
    const total = Object.values(r.items).reduce((a, b) => a + b, 0);
    expect(total).toBe(SX.daily.gearMat.count[2]);
    for (const [id, n] of Object.entries(r.items)) {
      expect(MATERIAL_IDS).toContain(id);
      expect(s.shared.items[id]).toBe(n);
    }
    expect(s.runLog.specialRuns.at(-1)!.items).toEqual(r.items);
  });

  it('하나라도 지면 보상 없음, 입장은 차감 (공통 규칙 그대로)', () => {
    const s = newSaveData('hollow', 1);
    s.shared.tradeCoins = 0;
    expect(enterSpecial(s, 'daily', 'gold', MON)).toBe(true);
    const r = settleSpecialRun(s, { mode: 'daily', target: 'gold', star: 4, battles: [fake(true), fake(false)], total: 3, quit: false }, MON);
    expect(r.won).toBe(false);
    expect(s.shared.tradeCoins).toBe(0);
    expect(entriesLeft(s.shared.special, dailyKey('gold'), MON)).toBe(1);
  });

  it('한 입장 = 일반·일반·강적 3판, 같은 날·던전·★ = 같은 적', () => {
    for (const id of DAILY_DUNGEONS) {
      const a = dailyEnemies(id, 2, dayStartOf(MON));
      expect(a.map((e) => e.class)).toEqual(['normal', 'normal', 'elite']);
      expect(dailyEnemies(id, 2, dayStartOf(MON + 3_600_000)).map((e) => e.id)).toEqual(a.map((e) => e.id));
    }
  });
});

describe('C.564 이름·화면·세이브', () => {
  it('탭 = 탑·요일던전·보스전, 던전 7개 이름·그림 키 = 종족 설정 (두 종족)', () => {
    expect(SPECIAL_TABS).toContain('daily');
    expect(SPECIAL_TABS).not.toContain('weekly');
    for (const f of FACTIONS) {
      const L = specialDungeonLabels(f);
      expect(L.tabs.daily).toBe('요일던전');
      for (const id of DAILY_DUNGEONS) {
        expect(L.daily[id]?.name).toBeTruthy();
        expect(L.daily[id]?.art).toBeTruthy();
      }
      expect(L.daily.gold?.name).toBe('골드 던전');
      expect(L.daily.gearMat?.name).toBe('장비 재료 던전');
    }
  });

  it('화면: 닫힌 날 = 자물쇠 + 열리는 요일, 하루 남은 횟수·매일 05:00, 종족 분기 없음', () => {
    const v = read('src/ui/specialDungeonView.ts');
    expect(v).toMatch(/lockText: !featOpen && feat \? .* : dailyOpenText\(id\)/);
    expect(v).toMatch(/c\.open \? c\.sub : c\.lockText/);
    expect(v).toMatch(/오늘 남은 횟수/);
    expect(v).toMatch(/매일 05:00/);
    expect(v).not.toMatch(/factionId === '|faction\.id === '/);
  });

  it('세이브 형식 99 → 100: 하루 칸 dayStart·daily, 옛 주간던전 키 → 요일던전 키 (쓴 횟수는 지움)', () => {
    expect(SAVE_FORMAT_VERSION).toBe(100);
    const raw = JSON.parse(JSON.stringify(newSaveData('hollow', 1))) as Record<string, unknown> & { meta: { format: number }; shared: { special: Record<string, unknown> } };
    raw.meta.format = 99;
    raw.shared.special = { weekStart: 5, used: { 'weekly:soul': 2, 'boss:sand-maw': 1 }, best: { 'weekly:soul': 3, 'boss:sand-maw': 2 }, clears: { 'weekly:shard': 4 } };
    const m = migrateSave(raw)!;
    expect(m.meta.format).toBe(100);
    expect(m.shared.special.used).toEqual({ 'boss:sand-maw': 1 });
    expect(m.shared.special.best).toEqual({ 'daily:soul': 3, 'boss:sand-maw': 2 });
    expect(m.shared.special.clears).toEqual({ 'daily:shard': 4 });
    expect(m.shared.special.daily).toEqual({});
    expect(m.shared.special.dayStart).toBe(0);
    // 빈 세이브도 견딘다
    const empty = { shared: {} } as unknown as Parameters<typeof migrateDailyDungeon>[0];
    expect(() => migrateDailyDungeon(empty)).not.toThrow();
  });

  it('밸런스·기획서', () => {
    expect(SX.daily.hogyokuDays).toEqual({ soul: [1, 4], shard: [2, 5], essence: [3, 6] });
    expect(SX.daily.allOpenDay).toBe(0);
    const gdd = read('docs/GDD.md');
    expect(gdd).toMatch(/요일던전/);
  });
});
