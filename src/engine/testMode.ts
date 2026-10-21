// 테스트 모드 (GDD 38장, C.88): 전체 해금된 따로 된 세이브 칸으로 무엇이든 바로 시험한다. 엔진 쪽 로직은 여기 한곳에 모은다(화면은 src/ui/testMode*.ts).
// - 세이브 분리(38-2): 진짜 세이브 키(SAVE_KEY 로 시작하는 모든 키 — 슬롯·백업·압축 덩어리·슬롯 기록)를 테스트 칸 키(TEST_SAVE_KEY 로 시작)로 바꿔 끼운 저장소를 쓴다.
//   그래서 슬롯·백업·덩어리 코드를 그대로 써도 진짜 세이브는 읽지도 쓰지도 않는다. SaveData 구조는 그대로(형식 번호 무변화).
// - 목록(진화체·특성·적·보스·스토리·꾸밈)은 모두 데이터에서 읽는다. 종족 id 로 분기하지 않는다(38-6).
import { BALANCE } from '../config/balance';
import { BOSSES } from '../data/bosses';
import { ENEMIES, scaleEnemy } from '../data/enemies';
import { FORM_TABLE, tryGetForm } from '../data/evolution';
import { FACTIONS } from '../data/factions';
import { STAT_IDS, type EnemyDef, type FormDef, type Stats, type StatId } from '../data/schema';
import { COSMETIC_ITEMS } from '../data/shop';
import { STORY_CHAPTERS, chapterContent, episodeKey } from '../data/story';
import { TRAITS } from '../data/traits';
import { SAVE_KEY, newSaveData, storyProgressOf, type SaveData, type StorageLike } from '../game';
import { clampDifficulty, clampStreak, enemyAtDifficulty, MAX_DIFFICULTY, streakEnemyFactor } from './difficulty';
import { baseStatsOf, currentStats, elementDamageOf, STAT_MAX, zeroStats } from './evolution';
import { ELEMENT_DAMAGE_IDS } from './combat/combat';
import { FOOD_IDS } from './faction';

/** 테스트 칸 저장 키 (38-2). 진짜 세이브 키 `SAVE_KEY…` 는 모두 이 앞부분으로 바뀐다 (슬롯 1 = 이 키 그대로) */
export const TEST_SAVE_KEY = 'bha-save-test';
/** 테스트 모드를 켜 둔 표시 (세이브 밖, 이 기기만) */
export const TEST_FLAG_KEY = 'bha-test-mode';
/** 테스트 패널 설정(속도 등). 세이브 밖이라 SaveData 형식과 무관 */
export const TEST_CFG_KEY = `${TEST_SAVE_KEY}.cfg`;
/** 테스트 모드 고정 슬롯 (테스트 칸 = 슬롯 1 자리) */
export const TEST_SLOT = 1;
/** 넉넉한 재화 (38-3) */
export const TEST_WEALTH = 99999;
/** 설정 > [정보] 버전 줄을 이만큼 연속으로 누르면 켜진다 (38-1) */
export const TEST_TAPS = 7;
/** 연속 누르기로 치는 간격(ms) */
export const TEST_TAP_GAP_MS = 1500;
/** 전투·원정 속도 (38-4) */
export const TEST_SPEEDS = [1, 2, 4] as const;
export type TestSpeed = (typeof TEST_SPEEDS)[number];

// ── 켜기·끄기 (38-1) ──

/** 주소의 test 값: '1' = 켜기, '0' = 끄기, 없으면 null */
export function testParam(search: string): boolean | null {
  const v = new URLSearchParams(search).get('test');
  if (v === '1') return true;
  if (v === '0') return false;
  return null;
}

/** 지금 테스트 모드인가: 주소(?test=1/0)가 먼저, 없으면 기기에 켜 둔 표시. 주소로 켜면 표시도 남긴다 */
export function resolveTestMode(search: string, store: StorageLike | null): boolean {
  const p = testParam(search);
  if (p !== null) {
    setTestFlag(store, p);
    return p;
  }
  try {
    return store?.getItem(TEST_FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

export function setTestFlag(store: StorageLike | null, on: boolean): void {
  try {
    if (on) store?.setItem(TEST_FLAG_KEY, '1');
    else store?.removeItem?.(TEST_FLAG_KEY);
  } catch {
    /* 저장소 막힘: 이번 실행만 */
  }
}

/** 버전 줄 연속 누르기 세기: 간격이 TEST_TAP_GAP_MS 안이면 이어 센다. 돌려준 count 가 TEST_TAPS 에 닿으면 켠다 */
export function countTap(prev: { count: number; at: number }, nowMs: number): { count: number; at: number } {
  return { count: nowMs - prev.at <= TEST_TAP_GAP_MS ? prev.count + 1 : 1, at: nowMs };
}

// ── 세이브 분리 (38-2) ──

/** 저장소 모양 (localStorage 와 같음): 덩어리 정리(collectChunks)까지 쓰려면 key·length 도 */
export interface FullStorage extends StorageLike {
  key(index: number): string | null;
  readonly length: number;
  removeItem(key: string): void;
}

const toTest = (k: string): string => (k.startsWith(SAVE_KEY) ? TEST_SAVE_KEY + k.slice(SAVE_KEY.length) : k);
const fromTest = (k: string): string | null => (k.startsWith(TEST_SAVE_KEY) ? SAVE_KEY + k.slice(TEST_SAVE_KEY.length) : null);

/** 테스트 칸 저장소: 진짜 세이브 키로 묻고 쓰면 테스트 칸 키로 바꿔 원래 저장소에 간다. 키 목록에는 테스트 칸 키만(진짜 키로 바꿔) 보인다 —
 *  덩어리 정리가 진짜 세이브의 덩어리를 지우지 않는다. 세이브가 아닌 키(설정 등)는 그대로 지나간다 */
export function testStorage(base: StorageLike & Partial<Pick<FullStorage, 'key' | 'length'>>): FullStorage {
  const testKeys = (): string[] => {
    const out: string[] = [];
    const n = base.length ?? 0;
    for (let i = 0; i < n; i++) {
      const k = base.key?.(i);
      const real = k ? fromTest(k) : null;
      if (real !== null) out.push(real);
    }
    return out;
  };
  return {
    getItem: (k) => base.getItem(toTest(k)),
    setItem: (k, v) => base.setItem(toTest(k), v),
    removeItem: (k) => base.removeItem?.(toTest(k)),
    key: (i) => testKeys()[i] ?? null,
    get length() {
      return testKeys().length;
    },
  };
}

/** 테스트 칸 전부 지우기 ([초기화], 38-2): 테스트 칸 키만 */
export function clearTestSlot(base: StorageLike & Partial<Pick<FullStorage, 'key' | 'length'>>): number {
  const keys: string[] = [];
  const n = base.length ?? 0;
  for (let i = 0; i < n; i++) {
    const k = base.key?.(i);
    if (k && k.startsWith(TEST_SAVE_KEY) && k !== TEST_CFG_KEY) keys.push(k);
  }
  for (const k of keys) base.removeItem?.(k);
  return keys.length;
}

// ── 테스트 패널 설정 (세이브 밖) ──

export interface TestConfig {
  speed: TestSpeed;
}

export function loadTestConfig(store: StorageLike | null): TestConfig {
  try {
    const r = JSON.parse(store?.getItem(TEST_CFG_KEY) ?? '{}') as Partial<TestConfig>;
    return { speed: (TEST_SPEEDS as readonly number[]).includes(r.speed as number) ? (r.speed as TestSpeed) : 1 };
  } catch {
    return { speed: 1 };
  }
}

export function saveTestConfig(store: StorageLike | null, cfg: TestConfig): void {
  try {
    store?.setItem(TEST_CFG_KEY, JSON.stringify(cfg));
  } catch {
    /* 이번 실행만 */
  }
}

// ── 전체 해금 (38-3) ──

/** 가장 높은 단계 진화체 중 첫 번째 (데이터 순서). 없으면 null */
export function topForm(table: readonly FormDef[] = FORM_TABLE): FormDef | null {
  const max = Math.max(...table.map((f) => f.tier));
  return table.find((f) => f.tier === max && !f.hidden) ?? table.find((f) => f.tier === max) ?? null;
}

/** 트랙 하나(지금 평평한 필드)를 다 연 상태로: 최고 단계 몸·★ 전부·수련 완료·수련권 가득·등급 이력·튜토리얼 본 것 */
function unlockTrack(save: SaveData, nowMs: number): void {
  const top = topForm();
  if (top) setForm(save, top.id);
  save.difficulty.unlocked = MAX_DIFFICULTY;
  const T = BALANCE.provisional.training;
  save.training.points = Math.max(save.training.points, T.pointsToComplete);
  save.training.tickets = T.ticketsMax;
  save.training.completed = true;
  save.training.completedAt ??= nowMs;
  save.rank.history.everRanked = true;
  save.rank.history.firstRankedAt ??= nowMs;
  save.help.tutorialSeen = true;
}

/** 전체 해금 (38-3, 켤 때·[초기화] 때 한 번): 모든 진화체 도감·사냥터(최고 단계로 열림)·★1~★5·스토리 모든 장·화·수련·환생·등급전·꾸밈 전부·재화 넉넉히·먹이 상한·보스 도감.
 *  탑은 세이브에 `tower.best` 자리가 있으면 최고 층 바로 아래까지 연다(탑 데이터가 들어오면 그대로 따라온다) */
export function fillAllUnlocked(save: SaveData, nowMs: number = Date.now()): SaveData {
  unlockTrack(save, nowMs);
  fillDefaultTraits(save);
  save.formDex = [...new Set([...save.formDex, ...FORM_TABLE.map((f) => f.id)])];
  // 스토리: 모든 종족·장·화 클리어 + 장 보상 받음 (내용이 있는 장만)
  for (const f of FACTIONS) {
    const prog = storyProgressOf({ story: save.story, factionId: f.id });
    for (const ch of STORY_CHAPTERS) {
      const content = chapterContent(f.id, ch.id);
      if (!content) continue;
      for (const ep of content.episodes) prog.cleared[episodeKey(ch.id, ep.id)] ??= { firstAt: nowMs, clears: 1 };
      if (!prog.chapters.includes(ch.id)) prog.chapters.push(ch.id);
    }
  }
  for (const b of BOSSES) save.bossDex[b.id] ??= { kills: 1, firstAt: nowMs };
  const sh = save.shared;
  sh.tradeCoins = TEST_WEALTH;
  sh.jade = TEST_WEALTH;
  sh.soulCrystals = TEST_WEALTH;
  for (const id of FOOD_IDS) sh.food[id] = BALANCE.provisional.food.cap;
  sh.rerollTickets = BALANCE.shop.rerollMax;
  sh.deckSlots = BALANCE.shop.deckSlotPrices.length;
  sh.cosmetics = [...new Set([...sh.cosmetics, ...COSMETIC_ITEMS.map((c) => c.id)])];
  unlockTower(save as SaveData & { tower?: unknown });
  return save;
}

/** 기본 특성 (GDD 42장 2번): 장착 특성 칸이 모두 비어 있으면 그 몸 속성(없으면 노멀)의 공격·막기·회복을 채운다. 남는 칸은 같은 속성 공격 → 노멀 공격.
 *  이미 하나라도 장착했으면 그대로 둔다. 채운 칸 수를 돌려준다 */
export function fillDefaultTraits(save: SaveData): number {
  const b = save.build;
  if (b.slots.some((id) => id !== null)) return 0;
  const TM = BALANCE.provisional.testMode;
  const form = save.evolution.formId ? tryGetForm(save.evolution.formId) : null;
  const element = form?.elements?.[0] ?? TM.fallbackElement;
  const usable = (el: string, role: string) => TRAITS.filter((t) => t.kind === 'skill' && !t.rare && !t.boss && t.element === el && t.role === role);
  const picks: string[] = [];
  const take = (role: string): void => {
    const t = [...usable(element, role), ...usable(TM.fallbackElement, role)].find((x) => !picks.includes(x.id));
    if (t) picks.push(t.id);
  };
  for (const role of TM.defaultTraitRoles) take(role);
  while (picks.length < b.slots.length) {
    const before = picks.length;
    take('attack');
    if (picks.length === before) break;
  }
  setTraitSlots(save, picks.slice(0, b.slots.length));
  return Math.min(picks.length, b.slots.length);
}

/** 탑 최고 층 자리(GDD 36-9 `tower { best }`)가 세이브에 있으면 마지막 층 바로 아래까지 (모든 층 도전 가능) */
function unlockTower(save: { tower?: unknown }): void {
  const t = save.tower as { best?: unknown; floors?: unknown } | undefined;
  if (t && typeof t === 'object' && typeof t.best === 'number') t.best = Math.max(t.best, TOWER_FLOORS - 1);
}

/** 테스트 칸 새 세이브: 종족을 골라 전체 해금으로 */
export function newTestSave(factionId: string, nowMs: number = Date.now()): SaveData {
  return fillAllUnlocked(newSaveData(factionId, nowMs), nowMs);
}

// ── 테스트 패널: 진화체·능력치·특성·둥지 값 (38-4) ──

/** 진화체 고르기: null = 1단계(진화 전). 단계·도감·이력도 맞춘다. 고유 특성은 그대로(따로 고른다) */
export function setForm(save: SaveData, formId: string | null): boolean {
  const e = save.evolution;
  if (formId === null) {
    e.tierIndex = 0;
    e.formId = null;
    e.formHistory = [];
    return true;
  }
  const form = tryGetForm(formId);
  if (!form) return false;
  e.tierIndex = form.tier - 1;
  e.formId = form.id;
  e.formHistory = [form.id];
  if (!save.formDex.includes(form.id)) save.formDex.push(form.id);
  return true;
}

/** 능력치 직접 입력: 노력치는 0, 계승분(carry, 성장 상한이 없는 자리)에 "원하는 값 − 진화체 기본값"을 넣는다 → 모든 전투(원정·등급전·연습)에 그대로 실린다.
 *  값은 0~STAT_MAX 정수. 슬롯 보너스(붕옥·초월체)가 있으면 그만큼 더 붙는다 */
export function setCustomStats(save: SaveData, want: Partial<Stats>): Stats {
  const e = save.evolution;
  const base = baseStatsOf(e, save.factionId);
  const carry = zeroStats();
  for (const s of STAT_IDS) {
    const v = want[s];
    const target = typeof v === 'number' && Number.isFinite(v) ? Math.min(STAT_MAX, Math.max(0, Math.round(v))) : base[s] + e.ev[s] + (e.carry?.[s] ?? 0);
    carry[s] = target - base[s];
  }
  e.ev = zeroStats();
  e.carry = carry;
  return currentStats(e, save.factionId);
}

/** 속성 피해 입력 상한 % (GDD 48장 5번, 테스트 전용) */
export const TEST_ELEMENT_DAMAGE_MAX = 500;

/** 속성 피해 직접 입력 (GDD 48장 5번): 칸 = 노멀 + 기본 원소(ELEMENT_DAMAGE_IDS), 0~TEST_ELEMENT_DAMAGE_MAX 정수 %. 모두 0 이면 지운다. 원정·등급전·연습·바로 전투에 실린다 */
export function setElementDamage(save: SaveData, want: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of ELEMENT_DAMAGE_IDS) {
    const v = want[id];
    const pct = typeof v === 'number' && Number.isFinite(v) ? Math.min(TEST_ELEMENT_DAMAGE_MAX, Math.max(0, Math.round(v))) : 0;
    if (pct !== 0) out[id] = pct;
  }
  if (Object.keys(out).length > 0) save.evolution.testElementDamage = out;
  else delete save.evolution.testElementDamage;
  return elementDamageOf(save.evolution);
}

/** [진화체 기본값으로]: 노력치·계승분·속성 피해 입력을 비운다 */
export function resetStats(save: SaveData): Stats {
  save.evolution.ev = zeroStats();
  delete save.evolution.carry;
  delete save.evolution.testElementDamage;
  return currentStats(save.evolution, save.factionId);
}

/** 흡수 특성 칸을 직접 채운다: 없는 특성·중복은 빈칸. 가진 목록·장착 순서도 맞춘다 */
export function setTraitSlots(save: SaveData, ids: readonly (string | null)[]): (string | null)[] {
  const b = save.build;
  const known = new Set(TRAITS.map((t) => t.id));
  const used = new Set<string>();
  b.slots = b.slots.map((_, i) => {
    const id = ids[i] ?? null;
    if (id === null || !known.has(id) || used.has(id)) return null;
    used.add(id);
    return id;
  });
  b.owned = [...new Set([...b.owned, ...used])];
  b.equipOrder = b.slots.filter((x): x is string => x !== null);
  return b.slots;
}

/** 고유 특성 방향 고르기 (null = 없음) */
export function setAbility(save: SaveData, stat: StatId | null): void {
  save.evolution.ability = stat !== null && (STAT_IDS as readonly string[]).includes(stat) ? stat : null;
}

export interface NestValues {
  risk?: number;
  hunger?: number;
  condition?: number;
}

/** 리스크·허기·컨디션 직접 넣기: 각자 범위로 자른다 (리스크 0~한계, 허기·컨디션 0~100) */
export function setNestValues(save: SaveData, v: NestValues): void {
  const clip = (x: number | undefined, max: number, cur: number) => (typeof x === 'number' && Number.isFinite(x) ? Math.min(max, Math.max(0, Math.round(x))) : cur);
  const n = save.nest;
  n.risk = clip(v.risk, BALANCE.provisional.risk.limit, n.risk);
  n.hunger = clip(v.hunger, 100, n.hunger);
  n.condition = clip(v.condition, 100, n.condition);
}

// ── 바로 전투 (38-4) ──

export interface TestFoe {
  id: string;
  kind: 'enemy' | 'boss';
  def: EnemyDef;
}

/** 고를 수 있는 상대: 공유 적 테이블 전부 + 보스 전부 (데이터 순서, 보스가 늘면 그대로 따라온다) */
export function testFoes(): TestFoe[] {
  return [
    ...ENEMIES.map((d) => ({ id: d.id, kind: 'enemy' as const, def: d })),
    ...BOSSES.map((b) => ({ id: b.id, kind: 'boss' as const, def: b.enemy })),
  ];
}

/** 탑 층 수 (GDD 36장) */
export const TOWER_FLOORS = 50;

/** 탑 층 세기 (GDD 36-5): ★ = ⌈n/10⌉, 같은 10층 안에서 층마다 +4%, 50층 +20% 더. 탑 엔진(src/engine/tower.ts)이 들어와도 같은 규칙 */
export function towerFloorScale(floor: number): { star: number; factor: number } {
  const n = Math.min(TOWER_FLOORS, Math.max(1, Math.floor(floor)));
  const star = clampDifficulty(Math.ceil(n / 10));
  const factor = (1 + ((n - 1) % 10) * 0.04) * (n === TOWER_FLOORS ? 1.2 : 1);
  return { star, factor };
}

export interface TestBattleChoice {
  foeId: string;
  star: number;
  /** 연속 클리어 수 (32-1 10번 배율) */
  streak: number;
  /** 탑 층 (있으면 ★·배율을 층 규칙으로) */
  floor?: number | null;
}

/** 바로 전투 상대 정의와 그 ★: 고른 적에 ★ 배율 → 연속(또는 탑 층) 배율을 입힌다. 보스면 bossId(페이즈·기믹은 원정과 같은 bossSetupOf) */
export function testBattleEnemy(c: TestBattleChoice): { enemy: EnemyDef; star: number; bossId: string | null } | null {
  const foe = testFoes().find((f) => f.id === c.foeId);
  if (!foe) return null;
  const tower = c.floor ? towerFloorScale(c.floor) : null;
  const star = tower ? tower.star : clampDifficulty(c.star);
  const k = tower ? tower.factor : streakEnemyFactor(clampStreak(c.streak));
  const atStar = enemyAtDifficulty(foe.def, star);
  return { enemy: k === 1 ? atStar : scaleEnemy(atStar, { hp: k, attack: k }), star, bossId: foe.kind === 'boss' ? foe.id : null };
}
