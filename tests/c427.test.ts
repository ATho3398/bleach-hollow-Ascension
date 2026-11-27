// C.564: 옛 주간던전(주 3회)·보스 주 1회 → 요일던전 + 입장권 3종(GDD 6-16 v6.248) — 기대값을 바꾼 곳은 '옛 값' 주석. C.427 (GDD 6-16 v6.017, 코딩280): 특수던전 — 월드맵 탑 자리 이름 '특수던전', 위 탭 [탑][주간던전][보스전], 주간던전·보스전(주 초기화·횟수·3판 연속·보상), 드래그 목록
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { FACTIONS } from '../src/data/factions';
import { specialDungeonLabels, worldMapOf } from '../src/engine/faction';
import {
  bossRushEnemy, bossRushEntries, bossRushOpen, createSpecialCombat, dailyEnemies as weeklyEnemies, dailyKey as weeklyKey, hpFractionAfter, newTickets, nextResetAt, OWNER_BOSS_ID, refillTickets, spendTicket, ticketsLeft, weekStartOf,
} from '../src/engine/specialDungeon';
import { playCombatBot } from '../src/engine/combat/bot';
import { enterSpecial, migrateSave, newSaveData, SAVE_FORMAT_VERSION, settleSpecialRun, specialState } from '../src/game';
import type { CombatState } from '../src/engine/combat';
import { enableDragScrollY } from '../src/ui/bha/dragScroll';
import { useLegacyMigrations } from './helpers/legacyGate';

// C.446: 게임은 형식 87 미만을 열지 않는다(MIN_LOADABLE_SAVE_FORMAT 87) — 이 파일의 옛 형식 마이그레이션 시험 동안만 문턱을 내린다
useLegacyMigrations();

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const SX = BALANCE.provisional.specialDungeon;
/** KST 시각 → ms */
const kst = (y: number, mo: number, d: number, h: number, mi = 0) => Date.UTC(y, mo - 1, d, h - 9, mi);
/** 결과만 맞춘 가짜 전투 */
const fake = (won: boolean, hp = 0.5): CombatState => ({ status: won ? 'won' : 'lost', lossReason: won ? null : 'hp', tick: 100, enemy: { def: { id: 'e1' } }, player: { hp: hp * 100, maxHp: 100 }, params: { playerStartHpFraction: 1 } } as unknown as CombatState);

describe('C.427 주간 초기화 (월요일 05:00 KST)', () => {
  it('주 시작 = 직전 월요일 05:00 KST', () => {
    // 2026-11-12(목) 18:36 KST → 2026-11-09(월) 05:00 KST
    expect(weekStartOf(kst(2026, 11, 12, 18, 36))).toBe(kst(2026, 11, 9, 5));
    // 월요일 04:59 = 아직 지난 주, 05:00 = 새 주
    expect(weekStartOf(kst(2026, 11, 16, 4, 59))).toBe(kst(2026, 11, 9, 5));
    expect(weekStartOf(kst(2026, 11, 16, 5, 0))).toBe(kst(2026, 11, 16, 5));
    expect(nextResetAt(kst(2026, 11, 12, 18))).toBe(kst(2026, 11, 16, 5));
  });

  it('주가 바뀌면 보스전 입장권을 채운다 (C.564: 옛 쓴 횟수 비우기 → 입장권 3장까지 채움)', () => {
    const t = newTickets();
    refillTickets(t, kst(2026, 11, 12, 12));
    for (let i = 0; i < SX.tickets.boss.refill; i++) expect(spendTicket(t, 'boss', kst(2026, 11, 12, 12))).toBe(true);
    expect(spendTicket(t, 'boss', kst(2026, 11, 15, 23))).toBe(false); // 일요일 = 같은 주
    expect(ticketsLeft(t, 'boss', kst(2026, 11, 16, 6))).toBe(SX.tickets.boss.refill); // 월요일 06시 = 새 주로 보임
    expect(refillTickets(t, kst(2026, 11, 16, 6))).toBe(true);
    expect(t.boss).toBe(SX.tickets.boss.refill);
  });
});

describe('C.427 입장 차감 (C.564: 입장권)', () => {
  it('요일던전권 하루 2장·보스전권 주 3장(옛 던전마다 주 3회·보스마다 주 1회), 실패해도 차감', () => {
    const s = newSaveData('hollow', 1);
    const now = kst(2026, 11, 15, 19); // C.564: 일요일 = 요일던전 전부 열림 (옛 11-12 목)
    expect(SX.tickets.daily.refill).toBe(2); // 옛 SX.weekly.entries 3
    expect(SX.tickets.boss.refill).toBe(3); // 옛 SX.boss.entries 1
    for (let i = 0; i < 2; i++) expect(enterSpecial(s, 'daily', 'shard', now)).toBe(true);
    expect(enterSpecial(s, 'daily', 'shard', now)).toBe(false);
    expect(enterSpecial(s, 'daily', 'soul', now)).toBe(false); // 입장권은 던전 공통 (옛: 다른 던전은 따로)
    for (let i = 0; i < 2; i++) expect(enterSpecial(s, 'boss', 'sand-maw', now)).toBe(true);
    settleSpecialRun(s, { mode: 'boss', target: 'sand-maw', bossId: 'sand-maw', star: 1, battles: [fake(false)], total: 1, quit: false }, now);
    expect(enterSpecial(s, 'boss', 'sand-maw', now)).toBe(true); // 3장째
    expect(enterSpecial(s, 'boss', 'canyon-king', now)).toBe(false); // 졌어도 차감 — 이번 주 끝
    specialState(s, now);
    expect(ticketsLeft(s.tower.tickets, 'boss', now)).toBe(0);
  });
});

describe('C.427 한 입장 = 전투 3판 연속 (일반·일반·강적, 체력 이어감)', () => {
  it('적 3명 = 일반·일반·강적, 같은 주·던전·★ = 같은 적', () => {
    const ws = weekStartOf(kst(2026, 11, 12, 19));
    const a = weeklyEnemies('soul', 2, ws);
    expect(a.map((e) => e.class)).toEqual(['normal', 'normal', 'elite']);
    expect(weeklyEnemies('soul', 2, ws).map((e) => e.id)).toEqual(a.map((e) => e.id));
  });

  it('앞 판 끝 체력이 다음 판 시작 체력, ★ 기준 능력치(권장 단계)', () => {
    const ws = weekStartOf(kst(2026, 11, 12, 19));
    const [e1, e2] = weeklyEnemies('essence', 1, ws);
    const s1 = createSpecialCombat(e1!, 1, {}, 7, 1);
    playCombatBot(s1);
    const hp = hpFractionAfter(s1);
    expect(hp).toBeGreaterThan(0);
    const s2 = createSpecialCombat(e2!, 1, {}, 8, hp);
    expect(s2.params.playerStartHpFraction).toBeCloseTo(Math.max(0.01, hp), 6);
    expect(s2.player.hp / s2.player.maxHp).toBeCloseTo(Math.max(0.01, hp), 6);
  });

  it('보스전 = 스토리 보스 3 + 탑의 주인(× ownerScale), 열림 = 이긴 보스·탑 꼭대기', () => {
    const list = bossRushEntries();
    expect(list.map((e) => e.id)).toEqual(['sand-maw', 'canyon-king', 'forest-lord', OWNER_BOSS_ID]);
    const owner = list[3]!;
    expect(bossRushEnemy(owner, 4).hpInAttacks).toBeCloseTo(bossRushEnemy(list.find((e) => e.id === SX.boss.ownerBoss)!, 4).hpInAttacks * SX.boss.ownerScale, 6);
    expect(bossRushOpen(list[0]!, {}, 0, 50)).toBe(false);
    expect(bossRushOpen(list[0]!, { 'sand-maw': { kills: 1 } }, 0, 50)).toBe(true);
    expect(bossRushOpen(owner, {}, 49, 50)).toBe(false);
    expect(bossRushOpen(owner, {}, 50, 50)).toBe(true);
  });
});

describe('C.427 보상 지급', () => {
  it('주간던전: 다 이기면 그 테마 재료(★마다 늘어남) + 골드, 하나라도 지면 없음, 런 로그', () => {
    const s = newSaveData('hollow', 1);
    const now = kst(2026, 11, 12, 19);
    s.shared.hogyokuShards = 0; s.shared.tradeCoins = 0;
    const lose = settleSpecialRun(s, { mode: 'daily', target: 'shard', star: 3, battles: [fake(true), fake(false)], total: 3, quit: false }, now);
    expect(lose.won).toBe(false);
    expect(s.shared.hogyokuShards).toBe(0);
    const win = settleSpecialRun(s, { mode: 'daily', target: 'shard', star: 3, battles: [fake(true), fake(true), fake(true)], total: 3, quit: false }, now);
    expect(win.won).toBe(true);
    expect(s.shared.hogyokuShards).toBe(SX.daily.material[2]);
    expect(s.shared.tradeCoins).toBe(SX.daily.goldPerStar * 3);
    expect(SX.daily.material[3]!).toBeGreaterThan(SX.daily.material[0]!);
    expect(s.slotLog.hogyokuMaterials.at(-1)).toMatchObject({ kind: 'shard', source: 'daily', amount: SX.daily.material[2] }); // 옛 source 'weekly'
    expect(s.runLog.specialRuns.map((r) => r.won)).toEqual([false, true]);
    expect(s.runLog.specialRuns[1]!.battles).toHaveLength(3);
    expect(s.shared.special.best[weeklyKey('shard')]).toBe(3);
  });

  it('보스전: 재료 세 종 고루 + 골드, 보스 도감 +1 (중간 나가기 = 보상 없음)', () => {
    const s = newSaveData('hollow', 1);
    const now = kst(2026, 11, 12, 19);
    s.shared.soulCrystals = 0; s.shared.hogyokuShards = 0; s.shared.resonanceEssence = 0;
    const quit = settleSpecialRun(s, { mode: 'boss', target: 'canyon-king', bossId: 'canyon-king', star: 2, battles: [], total: 1, quit: true }, now);
    expect(quit.won).toBe(false);
    settleSpecialRun(s, { mode: 'boss', target: 'canyon-king', bossId: 'canyon-king', star: 2, battles: [fake(true)], total: 1, quit: false }, now);
    const each = SX.boss.materialEach[1]!;
    expect([s.shared.soulCrystals, s.shared.hogyokuShards, s.shared.resonanceEssence]).toEqual([each, each, each]);
    expect(s.bossDex['canyon-king']?.kills).toBe(1);
    expect(s.runLog.specialRuns.at(-1)).toMatchObject({ mode: 'boss', target: 'canyon-king', won: true, gold: SX.boss.goldPerStar * 2 });
  });
});

describe('C.427 드래그 목록 선택', () => {
  /** 이벤트만 흉내 내는 가짜 목록 상자 */
  const fakeBox = () => {
    const on: Record<string, ((e: unknown) => void)[]> = {};
    const box = {
      style: {} as Record<string, string>, scrollTop: 0,
      addEventListener: (t: string, fn: (e: unknown) => void) => { (on[t] ??= []).push(fn); },
      setPointerCapture: () => {},
    };
    const fire = (t: string, e: Record<string, unknown>) => { for (const fn of on[t] ?? []) fn({ pointerType: 'touch', button: 0, pointerId: 1, stopPropagation() {}, preventDefault() {}, ...e }); };
    return { box, fire };
  };

  it('위아래로 끌면 목록이 넘어가고, 끈 뒤 클릭(버튼 누름)은 먹는다 — 터치·마우스 모두', () => {
    for (const pointerType of ['touch', 'mouse']) {
      const { box, fire } = fakeBox();
      box.scrollTop = 50;
      enableDragScrollY(box as unknown as HTMLElement);
      expect(box.style.touchAction).toBe('none');
      fire('pointerdown', { pointerType, clientX: 10, clientY: 200 });
      fire('pointermove', { pointerType, clientX: 10, clientY: 140 });
      expect(box.scrollTop).toBe(110);
      fire('pointerup', { pointerType });
      const click: Record<string, unknown> = {};
      fire('click', { pointerType, stopPropagation() { click.stopped = true; } });
      expect(click.stopped).toBe(true);
    }
  });

  it('조금(6px 미만)만 움직인 누름은 클릭 그대로 → 선택', () => {
    const { box, fire } = fakeBox();
    enableDragScrollY(box as unknown as HTMLElement);
    fire('pointerdown', { clientX: 0, clientY: 100 });
    fire('pointermove', { clientX: 0, clientY: 103 });
    fire('pointerup', {});
    const click: Record<string, unknown> = {};
    fire('click', { stopPropagation() { click.stopped = true; } });
    expect(click.stopped).toBeUndefined();
    expect(box.scrollTop).toBe(0);
  });

  it('목록 버튼을 누르면 선택 강조 + 오른쪽 큰 그림 칸 교체 (화면 구조)', () => {
    const v = read('src/ui/specialDungeonView.ts');
    expect(v).toMatch(/enableDragScrollY\(list\)/);
    expect(v).toMatch(/b\.onclick = \(\) => show\(i\)/);
    expect(v).toMatch(/classList\.toggle\('is-selected', j === i\)/);
    expect(v).toMatch(/stage\.replaceChildren\(art, info\)/);
    expect(v).not.toMatch(/factionId === '|faction\.id === '/); // 종족 분기 없음
    const css = read('src/ui/bha/story.css');
    expect(css).toMatch(/\.bha-sdg__list \{[^}]*overflow-y: auto/);
    expect(css).toMatch(/\.bha-sdg__item\.is-selected/);
  });
});

describe('C.427 이름·탭·세이브', () => {
  it('월드맵 탑 자리 이름 = 특수던전 (두 종족, 종족 설정), 탭 탑·요일던전(옛 주간던전)·보스전, 그림 키 = 데이터', () => {
    for (const f of FACTIONS) {
      expect(worldMapOf(f).places.tower).toBe('특수던전');
      const L = specialDungeonLabels(f);
      expect(L.tabs).toMatchObject({ tower: '탑', daily: '요일던전', boss: '보스전' });
      for (const t of ['soul', 'shard', 'essence']) expect(L.daily[t]?.art).toBeTruthy();
      for (const e of bossRushEntries()) expect(L.bossArt[e.id]).toBeTruthy();
    }
    const app = read('src/ui/app.ts');
    expect(app).toMatch(/specialTab = 'tower'; \/\/ 월드맵에서 들어오면 처음 = 탑/);
  });

  it('세이브 형식 80 → 81: shared.special 새로·런 로그 specialRuns', () => {
    expect(SAVE_FORMAT_VERSION).toBe(100);
    const raw = JSON.parse(JSON.stringify(newSaveData('hollow', 1))) as Record<string, unknown> & { meta: { format: number }; shared: Record<string, unknown>; runLog: Record<string, unknown> };
    raw.meta.format = 80;
    delete raw.shared.special;
    delete raw.runLog.specialRuns;
    const m = migrateSave(raw)!;
    expect(m.meta.format).toBe(100);
    expect(m.shared.special.best).toEqual({}); // C.564: 옛 used 칸 없음
    expect(m.runLog.specialRuns).toEqual([]);
  });
});
