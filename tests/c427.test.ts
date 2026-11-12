// C.427 (GDD 6-16 v6.017, 코딩280): 특수던전 — 월드맵 탑 자리 이름 '특수던전', 위 탭 [탑][주간던전][보스전], 주간던전·보스전(주 초기화·횟수·3판 연속·보상), 드래그 목록
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { FACTIONS } from '../src/data/factions';
import { specialDungeonLabels, worldMapOf } from '../src/engine/faction';
import {
  bossKey, bossRushEnemy, bossRushEntries, bossRushOpen, createSpecialCombat, entriesLeft, hpFractionAfter, newSpecialState, nextResetAt, OWNER_BOSS_ID, rollWeek, spendEntry, weeklyEnemies, weeklyKey, weekStartOf,
} from '../src/engine/specialDungeon';
import { playCombatBot } from '../src/engine/combat/bot';
import { enterSpecial, migrateSave, newSaveData, SAVE_FORMAT_VERSION, settleSpecialRun, specialState } from '../src/game';
import type { CombatState } from '../src/engine/combat';
import { enableDragScrollY } from '../src/ui/bha/dragScroll';

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

  it('주가 바뀌면 쓴 횟수가 비워진다 (최고 기록은 남음)', () => {
    const st = newSpecialState(kst(2026, 11, 12, 12));
    const k = weeklyKey('soul');
    st.best[k] = 2;
    for (let i = 0; i < SX.weekly.entries; i++) expect(spendEntry(st, k, kst(2026, 11, 12, 12))).toBe(true);
    expect(spendEntry(st, k, kst(2026, 11, 15, 23))).toBe(false); // 일요일 = 같은 주
    expect(entriesLeft(st, k, kst(2026, 11, 16, 6))).toBe(SX.weekly.entries); // 월요일 06시 = 새 주로 보임
    expect(rollWeek(st, kst(2026, 11, 16, 6))).toBe(true);
    expect(st.used).toEqual({});
    expect(st.best[k]).toBe(2);
  });
});

describe('C.427 입장 횟수 차감', () => {
  it('주간던전 던전마다 주 3회·보스 보스마다 주 1회, 실패해도 차감', () => {
    const s = newSaveData('hollow', 1);
    const now = kst(2026, 11, 12, 19);
    expect(SX.weekly.entries).toBe(3);
    expect(SX.boss.entries).toBe(1);
    for (let i = 0; i < 3; i++) expect(enterSpecial(s, 'weekly', 'shard', now)).toBe(true);
    expect(enterSpecial(s, 'weekly', 'shard', now)).toBe(false);
    expect(enterSpecial(s, 'weekly', 'soul', now)).toBe(true); // 다른 던전은 따로
    expect(enterSpecial(s, 'boss', 'sand-maw', now)).toBe(true);
    settleSpecialRun(s, { mode: 'boss', target: 'sand-maw', bossId: 'sand-maw', star: 1, battles: [fake(false)], total: 1, quit: false }, now);
    expect(enterSpecial(s, 'boss', 'sand-maw', now)).toBe(false); // 졌어도 이번 주 끝
    expect(entriesLeft(specialState(s, now), bossKey('canyon-king'), now)).toBe(1);
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
    const lose = settleSpecialRun(s, { mode: 'weekly', target: 'shard', star: 3, battles: [fake(true), fake(false)], total: 3, quit: false }, now);
    expect(lose.won).toBe(false);
    expect(s.shared.hogyokuShards).toBe(0);
    const win = settleSpecialRun(s, { mode: 'weekly', target: 'shard', star: 3, battles: [fake(true), fake(true), fake(true)], total: 3, quit: false }, now);
    expect(win.won).toBe(true);
    expect(s.shared.hogyokuShards).toBe(SX.weekly.material[2]);
    expect(s.shared.tradeCoins).toBe(SX.weekly.goldPerStar * 3);
    expect(SX.weekly.material[3]!).toBeGreaterThan(SX.weekly.material[0]!);
    expect(s.slotLog.hogyokuMaterials.at(-1)).toMatchObject({ kind: 'shard', source: 'weekly', amount: SX.weekly.material[2] });
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
  it('월드맵 탑 자리 이름 = 특수던전 (두 종족, 종족 설정), 탭 탑·주간던전·보스전, 그림 키 = 데이터', () => {
    for (const f of FACTIONS) {
      expect(worldMapOf(f).places.tower).toBe('특수던전');
      const L = specialDungeonLabels(f);
      expect(L.tabs).toEqual({ tower: '탑', weekly: '주간던전', boss: '보스전' });
      for (const t of ['soul', 'shard', 'essence']) expect(L.weekly[t]?.art).toBeTruthy();
      for (const e of bossRushEntries()) expect(L.bossArt[e.id]).toBeTruthy();
    }
    const app = read('src/ui/app.ts');
    expect(app).toMatch(/specialTab = 'tower'; \/\/ 월드맵에서 들어오면 처음 = 탑/);
  });

  it('세이브 형식 80 → 81: shared.special 새로·런 로그 specialRuns', () => {
    expect(SAVE_FORMAT_VERSION).toBe(85);
    const raw = JSON.parse(JSON.stringify(newSaveData('hollow', 1))) as Record<string, unknown> & { meta: { format: number }; shared: Record<string, unknown>; runLog: Record<string, unknown> };
    raw.meta.format = 80;
    delete raw.shared.special;
    delete raw.runLog.specialRuns;
    const m = migrateSave(raw)!;
    expect(m.meta.format).toBe(85);
    expect(m.shared.special.used).toEqual({});
    expect(m.runLog.specialRuns).toEqual([]);
  });
});
