// C.564 (GDD 6-16 v6.246·v6.248, 코딩361): 특수던전 요일던전 — 옛 주간던전 탭 이름 → 요일던전, 던전 7개(붕옥 재료 3 + 골드·장비·장신구·장비 재료) 요일표(일요일 전부, 월~토 3개씩, 05:00 KST),
// 입장권 3종(요일 매일 2장·보스 주 3장·토벌 주 2장까지 채움 + 상점 구매, 트랙마다), 연습 모드, 세이브 형식 99 → 100
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { FACTIONS, getFaction } from '../src/data/factions';
import { MATERIAL_IDS } from '../src/data/materials';
import { specialDungeonLabels } from '../src/engine/faction';
import {
  DAILY_DUNGEONS, dailyEnemies, dailyOpenDays, dailyOpenList, dailyOpenText, dailyReward, dayStartOf, gameWeekday, nextDayAt, SPECIAL_TABS, ticketsLeft,
} from '../src/engine/specialDungeon';
import { dailyAvailable, enterSpecial, migrateDailyDungeon, migrateSave, newSaveData, SAVE_FORMAT_VERSION, settleSpecialRun, specialState } from '../src/game';
import { buyShopItem, goldRows } from '../src/shop';
import { cornerValues, specialCornerKind } from '../src/ui/bha/corner';
import type { CombatState } from '../src/engine/combat';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const SX = BALANCE.provisional.specialDungeon;
const kst = (y: number, mo: number, d: number, h: number, mi = 0) => Date.UTC(y, mo - 1, d, h - 9, mi);
const fake = (won: boolean): CombatState => ({ status: won ? 'won' : 'lost', lossReason: won ? null : 'hp', tick: 100, enemy: { def: { id: 'e1' } }, player: { hp: 50, maxHp: 100 }, params: { playerStartHpFraction: 1 } } as unknown as CombatState);
const win3 = () => [fake(true), fake(true), fake(true)];
// 2026-11-29 일 · 11-30 월 · 12-01 화 … 12-05 토
const MON = kst(2026, 11, 30, 12);
const SUN = kst(2026, 11, 29, 12);

describe('C.564 날 바뀜 = 05:00 KST · 요일표', () => {
  it('하루 시작·요일은 05:00 KST 에 바뀐다 (월요일 04:59 = 아직 일요일)', () => {
    expect(dayStartOf(kst(2026, 11, 30, 4, 59))).toBe(kst(2026, 11, 29, 5));
    expect(dayStartOf(kst(2026, 11, 30, 5))).toBe(kst(2026, 11, 30, 5));
    expect(gameWeekday(kst(2026, 11, 30, 4, 59))).toBe(0);
    expect(gameWeekday(kst(2026, 11, 30, 5))).toBe(1);
    expect(nextDayAt(MON)).toBe(kst(2026, 12, 1, 5));
  });

  it('요일표 (v6.248): 일요일 = 7개 전부, 월~토 = 3개씩 고르게(던전마다 일주일에 3~4번)', () => {
    const day = (d: number) => kst(2026, 11, 29 + d, 12);
    expect(dailyOpenList(day(0))).toEqual([...DAILY_DUNGEONS]);
    expect(dailyOpenList(day(1))).toEqual(['soul', 'gold', 'gear']);
    expect(dailyOpenList(day(2))).toEqual(['shard', 'accessory', 'gearMat']);
    expect(dailyOpenList(day(3))).toEqual(['essence', 'gold', 'gear']);
    expect(dailyOpenList(day(4))).toEqual(['soul', 'accessory', 'gearMat']);
    expect(dailyOpenList(day(5))).toEqual(['shard', 'gold', 'gear']);
    expect(dailyOpenList(day(6))).toEqual(['essence', 'accessory', 'gearMat']);
    for (const id of DAILY_DUNGEONS) expect(dailyOpenDays(id).length).toBeGreaterThanOrEqual(3);
    expect(dailyOpenText('soul')).toBe('월·목에 열린다');
    expect(dailyOpenText('gold')).toBe('월·수·금에 열린다');
    expect(dailyOpenText('gearMat')).toBe('화·목·토에 열린다');
  });
});

describe('C.564 입장권 3종 (트랙마다)', () => {
  it('요일던전권 = 매일 05:00 에 2장까지, 보스전권 = 월요일 3장까지, 토벌전권 = 월요일 2장까지 (쌓이지 않음), 던전 공통', () => {
    const s = newSaveData('hollow', 1);
    specialState(s, MON);
    expect([s.tower.tickets.daily, s.tower.tickets.boss, s.tower.tickets.raid]).toEqual([2, 3, 2]);
    expect(enterSpecial(s, 'daily', 'gold', MON)).toBe(true);
    expect(enterSpecial(s, 'daily', 'soul', MON + 1)).toBe(true);
    expect(enterSpecial(s, 'daily', 'gold', MON + 2)).toBe(false);
    const tue = kst(2026, 12, 1, 5);
    expect(ticketsLeft(s.tower.tickets, 'daily', tue)).toBe(2);
    specialState(s, tue);
    specialState(s, kst(2026, 12, 2, 5));
    expect(s.tower.tickets.daily).toBe(2); // 안 써도 2장에서 멈춤
  });

  it('상점(기타 탭)에서 산 입장권은 채움 위로 쌓인다, 가격 100·300골드', () => {
    const s = newSaveData('hollow', 1);
    const f = getFaction('hollow');
    s.shared.tradeCoins = 10_000;
    const rows = goldRows(s, f, MON).filter((r) => r.id.startsWith('ticket-'));
    expect(rows.map((r) => [r.id, r.price])).toEqual([['ticket-daily', 100], ['ticket-boss', 300], ['ticket-raid', 500]]); // C.566: 토벌전 입장권
    for (let i = 0; i < 3; i++) expect(buyShopItem(s, f, 'ticket-daily', MON).ok).toBe(true);
    expect(s.tower.tickets.daily).toBe(5); // 처음 채움 2 + 산 3
    expect(s.shared.tradeCoins).toBe(10_000 - 300);
    specialState(s, kst(2026, 12, 1, 6));
    expect(s.tower.tickets.daily).toBe(5); // 다음 날 채움은 '2장까지'라 그대로
    const items = JSON.parse(read('src/data/shop/items.json')) as { gold: { id: string; category: string }[] };
    expect(items.gold.filter((g) => g.id.startsWith('ticket-')).every((g) => g.category === 'etc')).toBe(true);
  });

  it('닫힌 요일의 던전은 입장 안 됨(입장권 그대로), 장비·장신구 던전은 그 기능 해금 전 자물쇠', () => {
    const s = newSaveData('hollow', 1);
    expect(enterSpecial(s, 'daily', 'shard', MON)).toBe(false); // 정제 = 화·금·일
    expect(ticketsLeft(s.tower.tickets, 'daily', MON)).toBe(2);
    expect(dailyAvailable(s, 'gear', MON)).toBe(false);
    s.shared.unlocks.gear = 1;
    expect(dailyAvailable(s, 'gear', MON)).toBe(true);
    const tue = kst(2026, 12, 1, 12);
    expect(dailyAvailable(s, 'accessory', tue)).toBe(false);
    s.shared.unlocks.accessory = 1;
    expect(enterSpecial(s, 'daily', 'accessory', tue)).toBe(true);
  });

  it('오른쪽 위 칩: 요일던전·보스전 탭 = 그 입장권 장수, 탑 탭 = 골드·영옥', () => {
    const s = newSaveData('hollow', 1);
    specialState(s, MON);
    expect(specialCornerKind('special-daily')).toBe('special-daily');
    expect(specialCornerKind('special-boss')).toBe('special-boss');
    expect(specialCornerKind('tower')).toBe(null);
    expect(cornerValues('special-boss', s, MON)).toEqual([{ kind: 'special', value: 3 }]);
    expect(read('src/ui/app.ts')).toMatch(/specialCornerKind\(app\.dataset\.screen\)/);
  });
});

describe('C.564 연습 모드', () => {
  it('보상·최고 ★·도감·판 기록 없음, 연습 표시만 · 입장권 안 씀 · 빈사 사망 없음', () => {
    const s = newSaveData('hollow', 1);
    s.shared.tradeCoins = 0;
    specialState(s, SUN);
    const r = settleSpecialRun(s, { mode: 'daily', target: 'gold', star: 3, battles: win3(), total: 3, quit: false, practice: true }, SUN);
    expect(r.won).toBe(true);
    expect(r.gold).toBe(0);
    expect(s.shared.tradeCoins).toBe(0);
    expect(s.shared.special.best).toEqual({});
    expect(s.tower.tickets.daily).toBe(2);
    expect(s.runLog.specialRuns.at(-1)).toMatchObject({ practice: true, battles: [], gold: 0 });
    s.nest.collapsed = true;
    settleSpecialRun(s, { mode: 'boss', target: 'sand-maw', bossId: 'sand-maw', star: 1, battles: [fake(false)], total: 1, quit: false, practice: true }, SUN);
    expect(s.nest.dead).toBeFalsy();
    expect(s.bossDex['sand-maw']).toBeUndefined();
  });

  it('화면: [연습] 버튼(잠긴 던전은 잠김) · 연습은 입장권·판 기록·소모품 없이', () => {
    const v = read('src/ui/specialDungeonView.ts');
    expect(v).toMatch(/label: '연습'[^\n]*disabled: !c\.open/);
    const app = read('src/ui/app.ts');
    const run = app.slice(app.indexOf('function startSpecialRun'), app.indexOf('function sideBattleParams'));
    expect(run).toMatch(/if \(!practice && !enterSpecial\(/);
    expect(run).toMatch(/if \(!practice\) recordSpecialBattle/);
    expect(run).toMatch(/practice \? \{\} : battleItemOpts/);
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

  it('붕옥 재료 던전 = 그 재료 3·5·8·12 + 골드 30 × ★ (옛 주간던전 표 그대로), 기록 출처 daily', () => {
    const s = newSaveData('hollow', 1);
    s.shared.resonanceEssence = 0;
    settleSpecialRun(s, { mode: 'daily', target: 'essence', star: 4, battles: win3(), total: 3, quit: false }, MON);
    expect(s.shared.resonanceEssence).toBe(12);
    expect(s.slotLog.hogyokuMaterials.at(-1)).toMatchObject({ kind: 'essence', source: 'daily', amount: 12 });
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
    while (s.shared.gear.items.length < BALANCE.provisional.gear.cap) s.shared.gear.items.push({ ...s.shared.gear.items[0]!, uid: `x${s.shared.gear.items.length}` });
    s.shared.tradeCoins = 0;
    const full = settleSpecialRun(s, { mode: 'daily', target: 'gear', star: 1, battles: win3(), total: 3, quit: false }, MON + 9);
    expect(full.gear[0]!.sold).toBeGreaterThan(0);
    expect(s.shared.tradeCoins).toBe(full.gear[0]!.sold);
  });

  it('장비 재료 던전 = 재료 22종 중 2·3·5·7개 → 가방(보관함 shared.items)', () => {
    const s = newSaveData('hollow', 1);
    const r = settleSpecialRun(s, { mode: 'daily', target: 'gearMat', star: 3, battles: win3(), total: 3, quit: false }, MON);
    expect(Object.values(r.items).reduce((a, b) => a + b, 0)).toBe(SX.daily.gearMat.count[2]);
    for (const [id, n] of Object.entries(r.items)) {
      expect(MATERIAL_IDS).toContain(id);
      expect(s.shared.items[id]).toBe(n);
    }
    expect(s.runLog.specialRuns.at(-1)!.items).toEqual(r.items);
  });

  it('하나라도 지면 보상 없음, 입장권은 차감 (공통 규칙 그대로)', () => {
    const s = newSaveData('hollow', 1);
    s.shared.tradeCoins = 0;
    expect(enterSpecial(s, 'daily', 'gold', MON)).toBe(true);
    const r = settleSpecialRun(s, { mode: 'daily', target: 'gold', star: 4, battles: [fake(true), fake(false)], total: 3, quit: false }, MON);
    expect(r.won).toBe(false);
    expect(s.shared.tradeCoins).toBe(0);
    expect(ticketsLeft(s.tower.tickets, 'daily', MON)).toBe(1);
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
  it('탭 = 탑·요일던전·보스전, 던전 7개 이름·그림 키·입장권 이름 = 종족 설정 (두 종족)', () => {
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
      expect(L.tickets).toEqual({ daily: '요일던전 입장권', boss: '보스전 입장권', raid: '토벌전 입장권' });
    }
  });

  it('화면: 닫힌 날 = 자물쇠 + 열리는 요일, 입장권 장수·채움 한 줄, 종족 분기 없음', () => {
    const v = read('src/ui/specialDungeonView.ts');
    expect(v).toMatch(/lockText: !featOpen && feat \? .* : dailyOpenText\(id\)/);
    expect(v).toMatch(/c\.open \? c\.sub : c\.lockText/);
    expect(v).toMatch(/입장 1번 = 1장/);
    expect(v).toMatch(/매일 05:00 에 \$\{n\}장까지 채움/);
    expect(v).not.toMatch(/factionId === '|faction\.id === '/);
  });

  it('세이브 형식 99 → 100: 주 횟수 칸 삭제 → 트랙마다 입장권 칸, 옛 주간던전 키 → 요일던전 키', () => {
    expect(SAVE_FORMAT_VERSION).toBe(100);
    const raw = JSON.parse(JSON.stringify(newSaveData('hollow', 1))) as Record<string, unknown> & { meta: { format: number }; shared: { special: Record<string, unknown> }; tower: Record<string, unknown> };
    raw.meta.format = 99;
    raw.shared.special = { weekStart: 5, used: { 'weekly:soul': 2, 'boss:sand-maw': 1 }, best: { 'weekly:soul': 3, 'boss:sand-maw': 2 }, clears: { 'weekly:shard': 4 } };
    raw.tower = { best: 12 };
    const m = migrateSave(raw)!;
    expect(m.meta.format).toBe(100);
    expect(m.shared.special).toEqual({ best: { 'daily:soul': 3, 'boss:sand-maw': 2 }, clears: { 'daily:shard': 4 } });
    expect(m.tower.best).toBe(12);
    expect(m.tower.tickets).toEqual({ daily: 0, boss: 0, raid: 0, dayStart: 0, weekStart: 0 });
    specialState(m, MON);
    expect([m.tower.tickets.daily, m.tower.tickets.boss]).toEqual([2, 3]); // 처음 열 때 가득
    const empty = { shared: {} } as unknown as Parameters<typeof migrateDailyDungeon>[0];
    expect(() => migrateDailyDungeon(empty)).not.toThrow();
  });

  it('밸런스·기획서', () => {
    expect(SX.tickets).toEqual({ daily: { refill: 2, price: 100 }, boss: { refill: 3, price: 300 }, raid: { refill: 2, price: 500 } });
    expect(SX.daily.days[0]).toHaveLength(7);
    const gdd = read('docs/GDD.md');
    expect(gdd).toMatch(/요일던전[^\n]*구현 C\.564/);
  });
});
