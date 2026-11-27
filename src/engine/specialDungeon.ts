// 특수던전 요일던전·보스전 (GDD 6-16 v6.017 → v6.248, C.427·C.564): 종족 무관 엔진. 이름·그림 키는 종족 설정 specialDungeon, 수치는 BALANCE.provisional.specialDungeon(전부 provisional).
//  - 입장권 3종(C.564, GDD 6-16 v6.248 — 던전·보스마다 세던 하루·주 횟수 대체, 트랙마다 tower.tickets): 요일던전권 = 매일 05:00 KST 에 n장까지 채움, 보스전권·토벌전권 = 매주 월요일 05:00 KST 에 n장까지 채움.
//    채움은 '그 수까지'(쌓이지 않음), 상점에서 산 것은 상한 없이 쌓인다. 입장 1번 = 그 종류 1장(지거나 그만둬도 돌려주지 않음)
//  - 요일던전(C.564, 옛 주간던전): 던전 7개(붕옥 재료 3 + 골드·장비·장신구·장비 재료), 요일표(일요일 = 전부, 월~토 3개씩), 한 입장 = 전투 3판 연속(일반·일반·강적, 체력 이어감)
//  - 연습 모드(C.564): 입장권 없이 같은 적·같은 ★ — 보상·도감·열림 진행·기록 없음(런 로그에 연습 표시만)
//  - 적 세기: 탑처럼 ★ 배율(difficultyEnemyScale) × enemyScale — 적은 '★n 권장 단계 플레이어 일반 공격 N회분'(hpInAttacks)
import { BALANCE } from '../config/balance';
import { scaleEnemy } from '../data/enemies';
import { BOSSES, getBoss, isBossId } from '../data/bosses';
import type { EnemyDef } from '../data/schema';
import { createCombat, type CombatParams, type CombatState } from './combat';
import { applyDifficultyToParams, clampDifficulty, difficultyEnemyScale, MAX_DIFFICULTY } from './difficulty';
import { enemyPool, pickFromPool } from './enemyPool';
import { bossSetupOf } from './expedition';
import { createRng } from './rng';
import { HOGYOKU_TRACK_IDS, type HogyokuTrackId } from './transcend';
import type { FeatureId } from './unlocks';

const SX = BALANCE.provisional.specialDungeon;
const DAY = 86_400_000;
const KST = 9 * 3_600_000;

/** 특수던전 탭 (C.564: 옛 'weekly' 주간던전 → 'daily' 요일던전) */
export const SPECIAL_TABS = ['tower', 'daily', 'boss'] as const;
export type SpecialTab = (typeof SPECIAL_TABS)[number];
/** 입장 종류 (런 로그 mode — 옛 기록의 'weekly' 는 주간던전) */
export type SpecialMode = 'daily' | 'boss';

/** 탑의 주인 보스 칸 id (보스 테이블 id 와 겹치지 않게) */
export const OWNER_BOSS_ID = 'tower-owner';

/** 세이브 shared.special (형식 81 → 100, 슬롯 공유): 던전/보스마다 이긴 최고 ★·이긴 수. C.564 에 옛 주·하루 횟수 칸(weekStart·used)은 입장권으로 대체되어 없어짐 */
export interface SpecialDungeonState {
  /** 이긴 최고 ★ ('daily:<던전 id>' · 'boss:<보스 칸 id>', 기록용·영구) */
  best: Record<string, number>;
  /** 이긴 횟수 (같은 키, 영구) */
  clears: Record<string, number>;
}

export function newSpecialState(): SpecialDungeonState {
  return { best: {}, clears: {} };
}

const posIntMap = (raw: unknown): Record<string, number> => {
  const out: Record<string, number> = {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if (typeof v === 'number' && Number.isFinite(v) && v > 0) out[k] = Math.floor(v);
  return out;
};
const nonNegNum = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);

export function sanitizeSpecial(raw: unknown): SpecialDungeonState {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  return { best: posIntMap(r.best), clears: posIntMap(r.clears) };
}

// ── 시계: 날 바뀜 = 매일 05:00 KST, 주 바뀜 = 월요일 05:00 KST ──

/** '초기화 시각'을 그날 0시로 옮기는 값 (KST − 05시) */
const SHIFT = KST - SX.resetHourKst * 3_600_000;
/** 게임 날 번호 (1970-01-01 = 0, 날 바뀜 = 05:00 KST) */
const gameDay = (nowMs: number): number => Math.floor((nowMs + SHIFT) / DAY);

/** 이 시각이 든 게임 날의 시작 = 그날(또는 전날) 05:00 KST 의 ms (C.564) */
export function dayStartOf(nowMs: number): number {
  return gameDay(nowMs) * DAY - SHIFT;
}

/** 게임 날의 요일 (0 = 일요일, 05:00 KST 에 바뀜 — 월요일 04:59 는 아직 일요일) */
export function gameWeekday(nowMs: number): number {
  return (((gameDay(nowMs) + 4) % 7) + 7) % 7; // 1970-01-01 = 목요일(요일 4)
}

/** 이 시각이 든 주의 시작 = 직전(또는 같은) 월요일 05:00 KST 의 ms */
export function weekStartOf(nowMs: number): number {
  const back = (((gameWeekday(nowMs) - SX.resetWeekday) % 7) + 7) % 7;
  return (gameDay(nowMs) - back) * DAY - SHIFT;
}

/** 다음 주 초기화 시각 */
export function nextResetAt(nowMs: number): number {
  return weekStartOf(nowMs) + 7 * DAY;
}

/** 다음 날 바뀜 시각 (C.564) */
export function nextDayAt(nowMs: number): number {
  return dayStartOf(nowMs) + DAY;
}

// ── 입장권 (C.564, GDD 6-16 v6.248) ──

export const TICKET_KINDS = ['daily', 'boss', 'raid'] as const;
export type TicketKind = (typeof TICKET_KINDS)[number];
/** 하루마다 채우는 입장권인가 (요일던전권) — 나머지는 주마다 */
export const isDailyTicket = (k: TicketKind): boolean => k === 'daily';

/** 트랙 칸 tower.tickets (형식 100): 종류별 장수 + 마지막으로 채운 날·주 시작 */
export interface SpecialTickets {
  daily: number;
  boss: number;
  raid: number;
  /** 요일던전권을 채운 날의 시작(ms) — 오늘과 다르면 채운다 */
  dayStart: number;
  /** 보스전권·토벌전권을 채운 주의 시작(ms) */
  weekStart: number;
}

/** 새 칸: 채운 날·주가 0 이라 처음 볼 때 가득 채운다 */
export function newTickets(): SpecialTickets {
  return { daily: 0, boss: 0, raid: 0, dayStart: 0, weekStart: 0 };
}

export function sanitizeTickets(raw: unknown): SpecialTickets {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const n = (v: unknown) => Math.floor(nonNegNum(v));
  return { daily: n(r.daily), boss: n(r.boss), raid: n(r.raid), dayStart: nonNegNum(r.dayStart), weekStart: nonNegNum(r.weekStart) };
}

/** 날·주가 바뀌었으면 그 종류를 채움 장수'까지' 채운다(산 것으로 이미 넘으면 그대로). 바뀌었으면 true */
export function refillTickets(t: SpecialTickets, nowMs: number): boolean {
  let changed = false;
  const ds = dayStartOf(nowMs);
  if (t.dayStart !== ds) {
    t.dayStart = ds;
    t.daily = Math.max(t.daily, SX.tickets.daily.refill);
    changed = true;
  }
  const ws = weekStartOf(nowMs);
  if (t.weekStart !== ws) {
    t.weekStart = ws;
    t.boss = Math.max(t.boss, SX.tickets.boss.refill);
    t.raid = Math.max(t.raid, SX.tickets.raid.refill);
    changed = true;
  }
  return changed;
}

/** 지금 장수 (날·주가 바뀌었으면 채운 뒤 값 — 상태는 바꾸지 않음) */
export function ticketsLeft(t: SpecialTickets, kind: TicketKind, nowMs: number): number {
  const c = { ...t };
  refillTickets(c, nowMs);
  return c[kind];
}

/** 입장권 1장 쓰기 (없으면 false). 지거나 그만둬도 돌려주지 않는다 */
export function spendTicket(t: SpecialTickets, kind: TicketKind, nowMs: number): boolean {
  refillTickets(t, nowMs);
  if (t[kind] <= 0) return false;
  t[kind] -= 1;
  return true;
}

/** 입장 종류 → 입장권 종류 */
export const ticketOf = (mode: SpecialMode): TicketKind => mode;

export const dailyKey = (id: DailyDungeonId): string => `daily:${id}`;
export const bossKey = (bossId: string): string => `boss:${bossId}`;

// ── 요일던전 (C.564) ──

/** 요일던전 id: 붕옥 재료 던전 3개(트랙 id) + 골드·장비·장신구·장비 재료 */
export const DAILY_DUNGEONS = [...HOGYOKU_TRACK_IDS, 'gold', 'gear', 'accessory', 'gearMat'] as const;
export type DailyDungeonId = (typeof DAILY_DUNGEONS)[number];
export const isDailyDungeon = (id: string): id is DailyDungeonId => (DAILY_DUNGEONS as readonly string[]).includes(id);
/** 붕옥 재료 던전인가 (요일에만 열림) */
export const isHogyokuDungeon = (id: string): id is HogyokuTrackId => (HOGYOKU_TRACK_IDS as readonly string[]).includes(id);

/** 이 던전이 열리는 요일 (0 = 일요일) — 요일표 SX.daily.days (일요일 = 전부, 월~토 3개씩) */
export function dailyOpenDays(id: DailyDungeonId): number[] {
  return [0, 1, 2, 3, 4, 5, 6].filter((d) => (SX.daily.days[d] ?? []).includes(id));
}

/** 오늘(05:00 KST 기준) 열렸나 */
export function dailyOpenToday(id: DailyDungeonId, nowMs: number): boolean {
  return dailyOpenDays(id).includes(gameWeekday(nowMs));
}

/** 오늘 열린 던전 (목록 순서) */
export function dailyOpenList(nowMs: number): DailyDungeonId[] {
  return DAILY_DUNGEONS.filter((id) => dailyOpenToday(id, nowMs));
}

const WEEKDAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'] as const;
/** 닫힌 날 한 줄: "월·목에 열린다" (일요일은 다 열려 따로 적지 않는다) */
export function dailyOpenText(id: DailyDungeonId): string {
  const days = dailyOpenDays(id).filter((d) => d !== 0);
  return `${days.map((d) => WEEKDAY_NAMES[d]).join('·')}에 열린다`;
}

/** 이 던전을 여는 기능 해금 (장비 던전 = 장비, 장신구 던전 = 장신구 칸). 없으면 null */
export function dailyFeature(id: DailyDungeonId): FeatureId | null {
  return id === 'gear' ? 'gear' : id === 'accessory' ? 'accessory' : null;
}

/** 요일던전 보상 (★마다): 붕옥 재료 던전 = 재료 + 골드 · 골드 = 골드 · 장비/장신구 = 1개(등급표 키) · 장비 재료 = 재료 n개 */
export interface DailyReward {
  id: DailyDungeonId;
  gold: number;
  /** 붕옥 재료 (붕옥 재료 던전만) */
  hogyoku: { track: HogyokuTrackId; amount: number } | null;
  /** 장비 1개: 종류 후보·등급표 키 (장비·장신구 던전만) */
  gear: { kinds: readonly ('weapon' | 'armor' | 'shoes' | 'accessory')[]; grades: string } | null;
  /** 장비 재료 개수 (장비 재료 던전만) */
  gearMats: number;
}

const byStar = (list: readonly number[], s: number): number => list[s - 1] ?? list[list.length - 1] ?? 0;

export function dailyReward(id: DailyDungeonId, star: number): DailyReward {
  const s = clampDifficulty(star);
  const out: DailyReward = { id, gold: 0, hogyoku: null, gear: null, gearMats: 0 };
  if (isHogyokuDungeon(id)) {
    out.hogyoku = { track: id, amount: byStar(SX.daily.material, s) };
    out.gold = SX.daily.goldPerStar * s;
  } else if (id === 'gold') out.gold = SX.daily.gold.goldPerStar * s;
  else if (id === 'gear') out.gear = { kinds: SX.daily.gear.kinds, grades: SX.daily.gear.grades };
  else if (id === 'accessory') out.gear = { kinds: ['accessory'], grades: SX.daily.accessory.grades };
  else out.gearMats = byStar(SX.daily.gearMat.count, s);
  return out;
}

/** 한 입장의 전투 n판 적 (★ 배율 입힘). 같은 날·던전·★ = 같은 적 (오늘 시작 시각 시드) */
export function dailyEnemies(id: DailyDungeonId, star: number, dayStart: number): EnemyDef[] {
  const s = clampDifficulty(star);
  const ti = Math.max(0, DAILY_DUNGEONS.indexOf(id));
  const rng = createRng((Math.floor(dayStart / DAY) * 131 + ti * 977 + s * 53 + 7) >>> 0);
  return SX.daily.battles.map((cls) => {
    const k = difficultyEnemyScale(s, cls);
    return scaleEnemy(pickFromPool(rng, enemyPool(cls, Number.MAX_SAFE_INTEGER)), { hp: k.hp * SX.daily.enemyScale, attack: k.attack * SX.daily.enemyScale });
  });
}

// ── 보스전 ──

export interface BossRushEntry {
  /** 칸 id: 보스 테이블 id 또는 OWNER_BOSS_ID */
  id: string;
  /** 실제 싸울 보스 테이블 id (기믹·페이즈) */
  bossId: string;
  owner: boolean;
}

/** 보스전 목록 = 스토리 보스(보스 테이블 순서) + 탑의 주인 */
export function bossRushEntries(): BossRushEntry[] {
  const owner = isBossId(SX.boss.ownerBoss) ? SX.boss.ownerBoss : BOSSES[0]?.id;
  return [...BOSSES.map((b) => ({ id: b.id, bossId: b.id, owner: false })), ...(owner ? [{ id: OWNER_BOSS_ID, bossId: owner, owner: true }] : [])];
}

export function bossRushEntry(id: string): BossRushEntry | undefined {
  return bossRushEntries().find((e) => e.id === id);
}

export interface BossRushReward {
  /** 재료 세 종 각각 */
  each: number;
  gold: number;
}

export function bossRushReward(star: number): BossRushReward {
  const s = clampDifficulty(star);
  return { each: SX.boss.materialEach[s - 1] ?? SX.boss.materialEach[SX.boss.materialEach.length - 1] ?? 0, gold: SX.boss.goldPerStar * s };
}

/** 보스전 적 (★ 배율 × enemyScale, 탑의 주인은 × ownerScale). 보스는 강적 입문 보정 없음(탑 보스 층과 같다) */
export function bossRushEnemy(e: BossRushEntry, star: number): EnemyDef {
  const k = difficultyEnemyScale(clampDifficulty(star), 'normal');
  const m = SX.boss.enemyScale * (e.owner ? SX.boss.ownerScale : 1);
  return scaleEnemy(getBoss(e.bossId).enemy, { hp: k.hp * m, attack: k.attack * m });
}

/** 보스전이 열렸나 (추천안): 스토리 보스 = 이 슬롯에서 한 번이라도 이긴 보스(보스 도감 처치 1 이상), 탑의 주인 = 탑 꼭대기를 깼을 때 */
export function bossRushOpen(e: BossRushEntry, bossDex: Record<string, { kills: number } | undefined>, towerBest: number, towerTop: number): boolean {
  if (e.owner) return towerBest >= towerTop;
  return (bossDex[e.bossId]?.kills ?? 0) > 0;
}

// ── 공통 ──

/** 고를 수 있는 ★ = 1 ~ 연 난이도 */
export function selectableStars(unlocked: number): number[] {
  const n = Math.min(MAX_DIFFICULTY, Math.max(1, Math.floor(unlocked)));
  return Array.from({ length: n }, (_, i) => i + 1);
}

/** 특수던전 전투 하나: ★ 기준 능력치 + 시작 체력 비율 + (보스면) 보스 재료 */
export function createSpecialCombat(enemy: EnemyDef, star: number, params: Partial<CombatParams>, seed: number, startHp = 1, bossId?: string): CombatState {
  applyDifficultyToParams(params, clampDifficulty(star));
  params.playerStartHpFraction = Math.min(1, Math.max(0.01, startHp));
  return createCombat(seed, { enemy, params, ...(bossId ? { boss: bossSetupOf(bossId) } : {}) });
}

/** 전투가 끝난 뒤 체력 비율 (다음 판으로 이어 간다) */
export function hpFractionAfter(s: CombatState): number {
  return s.player.maxHp > 0 ? Math.min(1, Math.max(0, s.player.hp / s.player.maxHp)) : 1;
}
