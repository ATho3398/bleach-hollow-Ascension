// 특수던전 주간던전·보스전 (GDD 6-16 v6.017, C.427): 종족 무관 엔진. 이름·그림 키는 종족 설정 specialDungeon, 수치는 BALANCE.provisional.specialDungeon(전부 provisional).
//  - 주간 초기화: 매주 월요일 05:00 KST(resetWeekday·resetHourKst). 세이브 shared.special.weekStart 가 이번 주 시작과 다르면 횟수를 0 으로
//  - 주간던전: 붕옥 트랙 테마(세공·정제·주입 = 트랙 id) 던전마다 주 n회, 한 입장 = 전투 3판 연속(일반·일반·강적, 체력 이어감)
//  - 보스전: 스토리 보스 + 탑의 주인. 보스마다 주 1회
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

const SX = BALANCE.provisional.specialDungeon;
const DAY = 86_400_000;
const KST = 9 * 3_600_000;

/** 특수던전 세 탭 */
export const SPECIAL_TABS = ['tower', 'weekly', 'boss'] as const;
export type SpecialTab = (typeof SPECIAL_TABS)[number];

/** 탑의 주인 보스 칸 id (보스 테이블 id 와 겹치지 않게) */
export const OWNER_BOSS_ID = 'tower-owner';

/** 세이브 shared.special (형식 81): 이번 주 시작 시각·던전/보스마다 쓴 입장 수·이긴 최고 ★ */
export interface SpecialDungeonState {
  /** 이번 주 시작 시각(ms) — 이 값이 이번 주와 다르면 used 를 비운다 */
  weekStart: number;
  /** 이번 주에 쓴 입장 수: 'weekly:<트랙 id>' · 'boss:<보스 id>' → 회 */
  used: Record<string, number>;
  /** 이긴 최고 ★ (같은 키, 기록용·영구) */
  best: Record<string, number>;
  /** 이긴 횟수 (같은 키, 영구) */
  clears: Record<string, number>;
}

export function newSpecialState(nowMs = 0): SpecialDungeonState {
  return { weekStart: nowMs > 0 ? weekStartOf(nowMs) : 0, used: {}, best: {}, clears: {} };
}

const posIntMap = (raw: unknown): Record<string, number> => {
  const out: Record<string, number> = {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if (typeof v === 'number' && Number.isFinite(v) && v > 0) out[k] = Math.floor(v);
  return out;
};

export function sanitizeSpecial(raw: unknown): SpecialDungeonState {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const ws = typeof r.weekStart === 'number' && Number.isFinite(r.weekStart) && r.weekStart >= 0 ? r.weekStart : 0;
  return { weekStart: ws, used: posIntMap(r.used), best: posIntMap(r.best), clears: posIntMap(r.clears) };
}

/** 이 시각이 든 주의 시작 = 직전(또는 같은) 월요일 05:00 KST 의 ms */
export function weekStartOf(nowMs: number): number {
  const shift = KST - SX.resetHourKst * 3_600_000; // 이 만큼 더하면 '초기화 시각' = 그날 0시
  const day = Math.floor((nowMs + shift) / DAY); // 1970-01-01 = 목요일(요일 4)
  const weekday = (((day + 4) % 7) + 7) % 7; // 0 = 일요일
  const back = (((weekday - SX.resetWeekday) % 7) + 7) % 7;
  return (day - back) * DAY - shift;
}

/** 다음 초기화 시각 */
export function nextResetAt(nowMs: number): number {
  return weekStartOf(nowMs) + 7 * DAY;
}

/** 주가 바뀌었으면 쓴 횟수를 비운다 (바뀌었으면 true) */
export function rollWeek(st: SpecialDungeonState, nowMs: number): boolean {
  const ws = weekStartOf(nowMs);
  if (st.weekStart === ws) return false;
  st.weekStart = ws;
  st.used = {};
  return true;
}

export const weeklyKey = (track: HogyokuTrackId): string => `weekly:${track}`;
export const bossKey = (bossId: string): string => `boss:${bossId}`;

/** 주간 한도 */
export function entryLimit(key: string): number {
  return key.startsWith('boss:') ? SX.boss.entries : SX.weekly.entries;
}

/** 이번 주 남은 횟수 (주가 바뀌었으면 가득) */
export function entriesLeft(st: SpecialDungeonState, key: string, nowMs: number): number {
  const used = st.weekStart === weekStartOf(nowMs) ? st.used[key] ?? 0 : 0;
  return Math.max(0, entryLimit(key) - used);
}

/** 입장 1회 차감 (남은 게 없으면 false). 실패해도 돌려주지 않는다 */
export function spendEntry(st: SpecialDungeonState, key: string, nowMs: number): boolean {
  rollWeek(st, nowMs);
  if (entriesLeft(st, key, nowMs) <= 0) return false;
  st.used[key] = (st.used[key] ?? 0) + 1;
  return true;
}

// ── 주간던전 ──

/** 주간던전 목록 = 붕옥 트랙 순서(세공·정제·주입) */
export const WEEKLY_DUNGEONS: readonly HogyokuTrackId[] = HOGYOKU_TRACK_IDS;

export interface WeeklyReward {
  track: HogyokuTrackId;
  material: number;
  gold: number;
}

export function weeklyReward(track: HogyokuTrackId, star: number): WeeklyReward {
  const s = clampDifficulty(star);
  return { track, material: SX.weekly.material[s - 1] ?? SX.weekly.material[SX.weekly.material.length - 1] ?? 0, gold: SX.weekly.goldPerStar * s };
}

/** 한 입장의 전투 n판 적 (★ 배율 입힘). 같은 주·던전·★ = 같은 적 (주 시작 시각 시드) */
export function weeklyEnemies(track: HogyokuTrackId, star: number, weekStart: number): EnemyDef[] {
  const s = clampDifficulty(star);
  const ti = Math.max(0, WEEKLY_DUNGEONS.indexOf(track));
  const rng = createRng((Math.floor(weekStart / DAY) * 131 + ti * 977 + s * 53 + 7) >>> 0);
  return SX.weekly.battles.map((cls) => {
    const k = difficultyEnemyScale(s, cls);
    return scaleEnemy(pickFromPool(rng, enemyPool(cls, Number.MAX_SAFE_INTEGER)), { hp: k.hp * SX.weekly.enemyScale, attack: k.attack * SX.weekly.enemyScale });
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
