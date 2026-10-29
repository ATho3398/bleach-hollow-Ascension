// 테스트 모드 (GDD 38장, C.88): 전체 해금된 따로 된 세이브 칸으로 무엇이든 바로 시험한다. 엔진 쪽 로직은 여기 한곳에 모은다(화면은 src/ui/testMode*.ts).
// - 세이브 분리(38-2): 진짜 세이브 키(SAVE_KEY 로 시작하는 모든 키 — 슬롯·백업·압축 덩어리·슬롯 기록)를 테스트 칸 키(TEST_SAVE_KEY 로 시작)로 바꿔 끼운 저장소를 쓴다.
//   그래서 슬롯·백업·덩어리 코드를 그대로 써도 진짜 세이브는 읽지도 쓰지도 않는다. SaveData 구조는 그대로(형식 번호 무변화).
// - 목록(진화체·특성·적·보스·스토리·꾸밈)은 모두 데이터에서 읽는다. 종족 id 로 분기하지 않는다(38-6).
import { setHomeHp } from './nest';
import { GUIDE_IDS } from './tutorial';
import { BALANCE } from '../config/balance';
import { BOSSES } from '../data/bosses';
import { ENEMIES, scaleEnemy } from '../data/enemies';
import { FORM_TABLE, tryGetForm } from '../data/evolution';
import { FACTIONS, getFaction } from '../data/factions';
import { STAT_IDS, type EnemyDef, type FormDef, type Stats, type StatId } from '../data/schema';
import { STORY_CHAPTERS, chapterContent, episodeKey } from '../data/story';
import { TRAITS } from '../data/traits';
import { SAVE_KEY, fastForward, newSaveData, performEvolution, storyProgressOf, type SaveData, type StorageLike } from '../game';
import { COSMETIC_ITEMS, getCosmetic, WANDERER_ITEMS } from '../data/shop';
import { canWear, skinsFor, type SkinDef } from '../data/skins';
import { GEAR_KINDS, GEAR_SPECIALS, getGearSpecial, isGearGrade, isGearKind, type GearGrade, type GearKind } from '../data/gear';
import { CONSUMABLE_IDS } from '../inventory';
import { buyWandererItem, storeConsumable, wearCosmetic } from '../shop';
import { grantGear, rollGear, specialValue } from './gear';
import { rollWandererStock, type WandererVisit } from './wanderer';
import { CARE_ACTIONS, type CareAction } from './nest';
import { eventTilesFor, isMutationId, MUTATIONS, TERRAIN_TILES } from '../data/tiles';
import type { ExpeditionState } from './expedition';
import { addFood } from './food';
import { recommendedDifficulty } from './difficulty';
import { stepsNeeded, type EvolveResult } from './evolution/evolution';
import type { AbsenceReport } from './nest';
import { pickLook } from './evolution/tierLook';
import { clampDifficulty, clampStreak, enemyAtDifficulty, MAX_DIFFICULTY, streakEnemyFactor } from './difficulty';
import { baseStatsOf, currentStats, elementDamageOf, STAT_MAX, zeroStats } from './evolution';
import { ELEMENT_DAMAGE_IDS } from './combat/combat';
import { dropBasicBlockTraits, isBasicBlockTrait } from './absorb/build';
import { FOOD_IDS, type FoodId } from './faction';

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
  // 타일 (GDD 64장): 열린 상태 + 기준 21장, 첫 원정·타일 안내는 본 것으로 (C.120)
  for (const [id, n] of Object.entries(BALANCE.provisional.expedition.referenceCollection)) save.tiles.collection[id] = Math.max(save.tiles.collection[id] ?? 0, n);
  save.tiles.unlocked = true;
  save.tiles.draws = Math.max(1, save.tiles.draws);
  for (const g of GUIDE_IDS) save.help.guides[g] = 'done';
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

/** 기본 특성 (GDD 42장 2번): 장착 특성 칸이 모두 비어 있으면 그 몸 속성(없으면 노멀)의 공격 특성을 채운다(C.136: 막기·회복 속성 특성 삭제). 남는 칸은 같은 속성 공격 → 노멀 공격.
 *  이미 하나라도 장착했으면 그대로 둔다. 채운 칸 수를 돌려준다 */
export function fillDefaultTraits(save: SaveData): number {
  const b = save.build;
  if (b.slots.some((id) => id !== null)) return 0;
  const TM = BALANCE.provisional.testMode;
  const form = save.evolution.formId ? tryGetForm(save.evolution.formId) : null;
  const element = form?.elements?.[0] ?? TM.fallbackElement;
  // 노멀 skill 특성은 기본 블록이 그 역할이라 채우지 않는다 (GDD 111장 1) — 노멀 몸이면 비워 둔다
  const usable = (el: string, role: string) => TRAITS.filter((t) => t.kind === 'skill' && !t.rare && !t.boss && t.element === el && t.role === role && !isBasicBlockTrait(t.id));
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

/** 테스트 칸의 단계 외형 (GDD 53): 지금 능력치(직접 입력 포함) 순위로 다시 정한다. 진짜 게임은 진화 순간 한 번만 정한다 */
function refreshLook(save: SaveData): void {
  const e = save.evolution;
  const form = e.formId ? tryGetForm(e.formId) : undefined;
  e.look = form ? pickLook(getFaction(save.factionId), form, currentStats(e, save.factionId), e.stageSeed) : null;
}

/** 진화체 고르기: null = 1단계(진화 전). 단계·도감·이력도 맞춘다. 고유 특성은 그대로(따로 고른다) */
export function setForm(save: SaveData, formId: string | null): boolean {
  const e = save.evolution;
  if (formId === null) {
    e.tierIndex = 0;
    e.formId = null;
    e.formHistory = [];
    e.look = null;
    return true;
  }
  const form = tryGetForm(formId);
  if (!form) return false;
  e.tierIndex = form.tier - 1;
  e.formId = form.id;
  e.formHistory = [form.id];
  if (!save.formDex.includes(form.id)) save.formDex.push(form.id);
  refreshLook(save);
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
  refreshLook(save);
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
    if (id === null || !known.has(id) || used.has(id) || isBasicBlockTrait(id)) return null;
    used.add(id);
    return id;
  });
  b.owned = [...new Set([...b.owned, ...used])];
  b.equipOrder = b.slots.filter((x): x is string => x !== null);
  dropBasicBlockTraits(b);
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
  /** 홈 체력 % (0~100) */
  hp?: number;
}

/** 리스크·허기·컨디션 직접 넣기: 각자 범위로 자른다 (리스크 0~한계, 허기·컨디션 0~100) */
export function setNestValues(save: SaveData, v: NestValues): void {
  const clip = (x: number | undefined, max: number, cur: number) => (typeof x === 'number' && Number.isFinite(x) ? Math.min(max, Math.max(0, Math.round(x))) : cur);
  const n = save.nest;
  n.risk = clip(v.risk, BALANCE.provisional.risk.limit, n.risk);
  n.hunger = clip(v.hunger, 100, n.hunger);
  n.condition = clip(v.condition, 100, n.condition);
  // 홈 체력 % (GDD 123장, C.198): 상한(빈사 10%) 안
  if (typeof v.hp === 'number' && Number.isFinite(v.hp)) setHomeHp(n, Math.min(100, Math.max(0, v.hp)) / 100);
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

// ── 키링 3번 (GDD 109장 7, C.181): 다마고치 모드 키링을 1초 안에 3번 누르면 테스트 모드 (이스터에그) ──

/** 키링 누르기 횟수·시간 창 */
export const KEYRING_TAPS = 3;
export const KEYRING_WINDOW_MS = 1000;

/** 키링 누른 시각 목록에 지금을 더하고, 창(1초) 밖은 버린다. fire = 창 안에 KEYRING_TAPS 번 → 목록은 비운다 */
export function countKeyringTap(prev: readonly number[], nowMs: number): { taps: number[]; fire: boolean } {
  const taps = [...prev.filter((t) => nowMs - t < KEYRING_WINDOW_MS && t <= nowMs), nowMs];
  return taps.length >= KEYRING_TAPS ? { taps: [], fire: true } : { taps, fire: false };
}

// ── 진화 (GDD 109장 7): 지금 몸에서 다음 진화를 바로 ──

/** 걸음 수를 채우고 진짜 진화(performEvolution — 판정·슬롯 +1·도감·런 로그·칭호·첫 진화 타일·펫 선물 모두 같다)를 한다. 마지막 단계면 ok:false */
export function testEvolveNext(save: SaveData, nowMs: number = Date.now()): EvolveResult {
  const need = stepsNeeded(save.evolution);
  if (need === null) return { ok: false, reason: '이미 마지막 단계다' };
  save.evolution.steps = Math.max(save.evolution.steps, need);
  return performEvolution(save, nowMs);
}

// ── 아이템 생성 (GDD 109장 7): 장비·소모품·먹이·꾸밈·재화 ──

export const TEST_ITEM_KINDS = ['gear', 'wanderer', 'consumable', 'food', 'cosmetic', 'currency'] as const;
export type TestItemKind = (typeof TEST_ITEM_KINDS)[number];
export const TEST_ITEM_KIND_NAMES: Record<TestItemKind, string> = { gear: '장비', wanderer: '떠돌이 상인 물건', consumable: '소모품', food: '먹이', cosmetic: '꾸밈', currency: '재화' };
/** 재화 id → 세이브 자리 (골드 = tradeCoins) */
export const TEST_CURRENCIES = ['gold', 'jade', 'soulCrystals', 'rerollTickets', 'trainingTickets'] as const;
export type TestCurrency = (typeof TEST_CURRENCIES)[number];
export const TEST_CURRENCY_NAMES: Record<TestCurrency, string> = { gold: '골드', jade: '영옥', soulCrystals: '영혼 결정', rerollTickets: '다시 뽑기권', trainingTickets: '수련권' };
/** 한 번에 만들 수 있는 최대 개수 */
export const TEST_ITEM_MAX = 99999;

/** 그 분류에서 고를 수 있는 id (데이터 순서). 이름은 화면이 종족 설정으로 붙인다 */
export function testItemIds(kind: TestItemKind): readonly string[] {
  if (kind === 'gear') return testGearIds();
  if (kind === 'wanderer') return WANDERER_ITEMS.map((w) => w.id);
  if (kind === 'consumable') return CONSUMABLE_IDS;
  if (kind === 'food') return FOOD_IDS;
  if (kind === 'cosmetic') return COSMETIC_ITEMS.filter((c) => c.category !== 'skin').map((c) => c.id);
  return TEST_CURRENCIES;
}

export interface TestItemChoice {
  kind: TestItemKind;
  id: string;
  count: number;
  /** 장비만: 등급·강화·★(없으면 지금 단계 권장 ★) */
  grade?: GearGrade;
  plus?: number;
  star?: number;
}

/** 고른 것을 만들어 넣는다. 실제로 들어간 개수 (상한·보관함 가득이면 그만큼 적다) */
export function createTestItem(save: SaveData, c: TestItemChoice, nowMs: number = Date.now(), rand: () => number = Math.random): number {
  const n = Math.max(0, Math.min(TEST_ITEM_MAX, Math.floor(Number.isFinite(c.count) ? c.count : 0)));
  const sh = save.shared;
  if (c.kind === 'gear') {
    const g = parseTestGearId(c.id);
    if (!g) return 0;
    let made = 0;
    for (let i = 0; i < n; i++) {
      if (!makeTestGear(save, g, c, nowMs, rand)) break;
      made++;
    }
    return made;
  }
  if (c.kind === 'wanderer') {
    let made = 0;
    for (let i = 0; i < n; i++) {
      if (!grantWandererTest(save, c.id, nowMs, rand)) break;
      made++;
    }
    return made;
  }
  if (c.kind === 'consumable') return CONSUMABLE_IDS.includes(c.id) ? storeConsumable(save, c.id, n) : 0;
  if (c.kind === 'food') return (FOOD_IDS as readonly string[]).includes(c.id) ? addFood(sh.food, c.id as FoodId, n) : 0;
  if (c.kind === 'cosmetic') {
    if (!getCosmetic(c.id) || sh.cosmetics.includes(c.id)) return 0;
    sh.cosmetics.push(c.id);
    return 1;
  }
  const cur = c.id as TestCurrency;
  if (cur === 'gold') sh.tradeCoins += n;
  else if (cur === 'jade') sh.jade += n;
  else if (cur === 'soulCrystals') sh.soulCrystals += n;
  else if (cur === 'rerollTickets') return addCapped(sh, 'rerollTickets', n, BALANCE.shop.rerollMax);
  else if (cur === 'trainingTickets') {
    const add = Math.max(0, Math.min(n, BALANCE.provisional.training.ticketsMax - save.training.tickets));
    save.training.tickets += add;
    return add;
  } else return 0;
  return n;
}

function addCapped(sh: SaveData['shared'], key: 'rerollTickets', n: number, cap: number): number {
  const add = Math.max(0, Math.min(n, cap - sh[key]));
  sh[key] += add;
  return add;
}

// ── 장비 전부 (GDD 112장 3): 종류(gear.json kinds) × 특수 효과(specials) — 상점(노말 종류별)·떠돌이 상인(레어~전설 무작위 종류) 장비도 이 조합 안에 든다 ──

/** 장비 품목 id: 종류만 = "weapon"(영웅·전설이면 특수 효과 무작위) · 특수 효과 지정 = "weapon:sp-shield" */
export function testGearIds(): string[] {
  return [...GEAR_KINDS, ...GEAR_KINDS.flatMap((k) => GEAR_SPECIALS.map((sp) => `${k}:${sp.id}`))];
}

export function parseTestGearId(id: string): { kind: GearKind; special: string | null } | null {
  const [kind, special = null, ...rest] = id.split(':');
  if (rest.length || !isGearKind(kind) || (special !== null && !getGearSpecial(special))) return null;
  return { kind, special };
}

/** [전부 한 개씩 받기] 목록: 종류마다 하나 + 특수 효과마다 하나(종류는 차례로 돌려 붙인다) — 모든 종류·모든 특수 효과가 한 번씩 나온다 */
export function testGearAllIds(): string[] {
  return [...GEAR_KINDS, ...GEAR_SPECIALS.map((sp, i) => `${GEAR_KINDS[i % GEAR_KINDS.length]}:${sp.id}`)];
}

/** 특수 효과 줄은 영웅·전설만(GDD 91장 4번) — 특수 효과를 고르고 노말·레어면 영웅으로 만든다 */
export function testGearGrade(id: string, grade: GearGrade | undefined): GearGrade {
  const g = grade && isGearGrade(grade) ? grade : 'normal';
  return parseTestGearId(id)?.special && (g === 'normal' || g === 'rare') ? 'epic' : g;
}

function makeTestGear(save: SaveData, g: { kind: GearKind; special: string | null }, c: Pick<TestItemChoice, 'id' | 'grade' | 'plus' | 'star'>, nowMs: number, rand: () => number): boolean {
  const grade = testGearGrade(c.id, c.grade);
  const roll = rollGear({ kind: g.kind, grade, star: c.star ?? recommendedDifficulty(save.evolution.tierIndex) }, rand);
  const def = g.special ? getGearSpecial(g.special) : undefined;
  if (def) roll.special = { id: def.id, value: specialValue(def.effect, grade) };
  const it = grantGear(save.shared.gear, roll, nowMs);
  if (!it) return false;
  it.plus = Math.max(0, Math.min(BALANCE.provisional.gear.maxPlus, Math.floor(c.plus ?? 0)));
  return true;
}

/** 장비 전부 한 개씩: 실제로 들어간 개수 (보관함이 차면 멈춘다) */
export function createTestGearAll(save: SaveData, o: { grade: GearGrade; plus: number; star?: number }, nowMs: number = Date.now(), rand: () => number = Math.random): number {
  let made = 0;
  for (const id of testGearAllIds()) {
    if (!makeTestGear(save, parseTestGearId(id)!, { id, ...o }, nowMs, rand)) break;
    made++;
  }
  return made;
}

/** 떠돌이 상인 물건 하나를 공짜로: 그 물건 한 칸짜리 상인을 잠깐 세워 진짜 구매 효과(buyWandererItem)를 그대로 낸 뒤 상인·골드·구매 기록을 되돌린다 */
function grantWandererTest(save: SaveData, itemId: string, nowMs: number, rand: () => number): boolean {
  if (!WANDERER_ITEMS.some((w) => w.id === itemId)) return false;
  const w = save.shared.wanderer;
  const keep = w.visit;
  const logLen = save.runLog.wanderer.length;
  w.visit = { at: nowMs, runId: 0, tier: 1, stock: [{ itemId, price: 0, sold: false }] };
  const r = buyWandererItem(save, getFaction(save.factionId), itemId, nowMs, rand);
  w.visit = keep;
  save.runLog.wanderer.length = logLen;
  return r.ok;
}

// ── 불러오기 (GDD 112장 2): 무작위로 뜨는 것을 바로 부른다 — 떠돌이 상인 · 돌봄 요청 · 대기 보상 · 원정 이벤트 타일·바퀴 변이 ──

/** 떠돌이 상인 단계 수 (숨은 티어 1~n) */
export const TEST_WANDERER_TIERS = BALANCE.provisional.wanderer.tierWeights.length;

/** 떠돌이 상인을 지금 부른다 (와 있으면 바꿔 세운다): 그 단계 물건을 새로 뽑는다. 런 로그 wanderer 에 arrive */
export function testCallWanderer(save: SaveData, tier: number, nowMs: number = Date.now(), rand: () => number = Math.random): WandererVisit {
  const w = save.shared.wanderer;
  const t = Math.max(1, Math.min(TEST_WANDERER_TIERS, Math.floor(tier) || 1));
  if (w.visit) save.runLog.wanderer.push({ at: nowMs, factionId: save.factionId, kind: 'leave', tier: w.visit.tier, unsold: w.visit.stock.filter((x) => !x.sold).length });
  w.visit = { at: nowMs, runId: 0, tier: t, stock: rollWandererStock(t, rand) };
  w.lapsSince = 0;
  save.runLog.wanderer.push({ at: nowMs, factionId: save.factionId, kind: 'arrive', tier: t, runId: 0, waited: 0 });
  return w.visit;
}

/** 와 있는 상인의 물건을 다시 뽑는다 (팔린 칸도 새로). 상인이 없으면 false */
export function testRerollWanderer(save: SaveData, rand: () => number = Math.random): boolean {
  const v = save.shared.wanderer.visit;
  if (!v) return false;
  v.stock = rollWandererStock(v.tier, rand);
  return true;
}

/** 상인을 보낸다 (런 로그 leave). 없으면 false */
export function testSendWanderer(save: SaveData, nowMs: number = Date.now()): boolean {
  const w = save.shared.wanderer;
  if (!w.visit) return false;
  save.runLog.wanderer.push({ at: nowMs, factionId: save.factionId, kind: 'leave', tier: w.visit.tier, unsold: w.visit.stock.filter((x) => !x.sold).length });
  w.visit = null;
  return true;
}

/** 돌봄 요청을 지금 띄운다 (GDD 82장): 유지 시간은 진짜 요청과 같다 */
export function testCallCare(save: SaveData, action: CareAction, nowMs: number = Date.now()): boolean {
  if (!CARE_ACTIONS.includes(action) || save.nest.dead) return false;
  save.nest.careRequest = { action, until: nowMs + BALANCE.provisional.nest.careRequest.holdMinutes * 60_000 };
  return true;
}

/** 돌봄 요청을 걷는다 (다음 요청은 진짜 간격 뒤) */
export function testClearCare(save: SaveData, nowMs: number = Date.now()): boolean {
  if (!save.nest.careRequest) return false;
  save.nest.careRequest = null;
  save.nest.nextCareAt = nowMs + BALANCE.provisional.nest.careRequest.intervalMinutes[0] * 60_000;
  return true;
}

/** 대기 보상 시간 고르기 (시간). 마지막 = 상한 */
export const TEST_IDLE_HOURS: readonly number[] = [1, 4, 8, BALANCE.provisional.idle.maxHours];

/** 대기 보상을 지금 쌓는다 (GDD 92장): 받을 보상(idlePending)을 그 시간만큼 — 시간은 흐르지 않는다(허기·컨디션 그대로). 자동 모험 시간 = 쌓은 시간 전부 */
export function testCallIdle(save: SaveData, hours: number, nowMs: number = Date.now()): boolean {
  const h = Math.max(0, Math.min(BALANCE.provisional.idle.maxHours, hours));
  if (!(h > 0)) return false;
  save.idlePending = { from: nowMs - h * 3_600_000, hours: h, activeHours: h };
  return true;
}

export function testClearIdle(save: SaveData): boolean {
  if (!save.idlePending) return false;
  save.idlePending = null;
  return true;
}

/** 다음 자유 원정에 부를 것 (세이브 밖, 이 화면이 열린 동안만): 이벤트 타일(첫 빈 칸에 놓임)·1바퀴 변이 */
export interface TestExpeditionForce {
  eventTile: string | null;
  mutation: string | null;
}
let expForce: TestExpeditionForce = { eventTile: null, mutation: null };

/** 이 종족 원정에 나오는 이벤트 타일 id (드래프트로만 나오는 것) */
export function testEventTiles(factionId: string): string[] {
  return eventTilesFor(factionId).map((t) => t.id);
}
export function testMutations(): string[] {
  return MUTATIONS.map((m) => m.id);
}
export function getTestExpeditionForce(): TestExpeditionForce {
  return { ...expForce };
}
export function setTestExpeditionForce(f: Partial<TestExpeditionForce>): TestExpeditionForce {
  const next = { ...expForce, ...f };
  expForce = {
    eventTile: next.eventTile && TERRAIN_TILES.some((t) => t.id === next.eventTile && t.kind === 'event') ? next.eventTile : null,
    mutation: next.mutation && isMutationId(next.mutation) ? next.mutation : null,
  };
  return getTestExpeditionForce();
}

/** 원정을 만든 직후(배치 단계 전) 예약을 입힌다: 이벤트 타일은 1번 칸부터 첫 빈 칸(야생 전투 칸이면 그 칸은 야생에서 뺀다), 변이는 1바퀴 변이로.
 *  스토리·튜토리얼·타일 잠금 원정은 건드리지 않는다. 입힌 뒤 예약은 비운다. 입힌 것 목록을 돌려준다 */
export function applyTestExpeditionForce(exp: ExpeditionState): { eventTile: string | null; mutation: string | null } {
  const out = { eventTile: null as string | null, mutation: null as string | null };
  if (exp.story || exp.tutorial || exp.tilesLocked || !exp.tileVariants) return out;
  const f = expForce;
  if (f.eventTile) {
    const cell = exp.slots.findIndex((s, c) => c >= 1 && s === null);
    if (cell >= 1) {
      exp.slots[cell] = f.eventTile;
      exp.wildCells = exp.wildCells.filter((c) => c !== cell);
      out.eventTile = f.eventTile;
    }
  }
  if (f.mutation) {
    exp.mutation = f.mutation;
    exp.variantLog.mutations.push({ id: f.mutation, lap: exp.lap });
    out.mutation = f.mutation;
  }
  expForce = { eventTile: null, mutation: null };
  return out;
}

// ── 스킨 끼워보기 (GDD 109장 7): 가진 것 상관없이 이 종족이 입을 수 있는 스킨·꾸밈 전부 ──

/** 이 종족이 입을 수 있는 스킨 전부 (단계 외형·아란칼 외형 포함 — 상점에 안 나오는 것도) */
export function testSkins(factionId: string): SkinDef[] {
  return skinsFor(factionId);
}

/** 스킨을 입힌다 (null = 벗기). 이 종족이 못 입는 스킨이면 false */
export function testWearSkin(save: SaveData, skinId: string | null): boolean {
  if (skinId === null) {
    save.skin = null;
    return true;
  }
  if (!canWear(save.factionId, skinId)) return false;
  save.skin = skinId;
  return true;
}

/** 꾸밈을 입힌다: 안 가졌으면 갖게 하고 입는다 (스킨은 testWearSkin) */
export function testWearCosmetic(save: SaveData, id: string): boolean {
  const c = getCosmetic(id);
  if (!c || c.category === 'skin') return false;
  if (!save.shared.cosmetics.includes(id)) save.shared.cosmetics.push(id);
  return wearCosmetic(save, id);
}

/** 스킨·꾸밈 전부 벗기 */
export function testUnwearAll(save: SaveData): void {
  save.skin = null;
  save.wear = {};
}

// ── 시간 앞당기기 (GDD 109장 7): +10분·+1시간·+1일 ──

/** 앞당기기 단추 (분) */
export const TEST_TIME_STEPS: readonly { minutes: number; label: string }[] = [
  { minutes: 10, label: '+10분' },
  { minutes: 60, label: '+1시간' },
  { minutes: 24 * 60, label: '+1일' },
];

/** 그만큼 시간이 지난 것처럼: 둥지의 시각 기록(먹이 한도·돌봄 요청·빈사 시각)을 그만큼 앞으로 당기고, 꺼 두었다 다시 연 것처럼 셈한다(fastForward — 시간 흐름·대기 보상·교감·빈사·사망) */
export function advanceTestTime(save: SaveData, minutes: number, nowMs: number = Date.now()): AbsenceReport {
  const back = Math.max(0, minutes) * 60_000;
  const n = save.nest;
  if (n.lastFedAt) n.lastFedAt -= back;
  if (n.careRequest) n.careRequest = { ...n.careRequest, until: n.careRequest.until - back };
  n.nextCareAt -= back;
  if (n.collapsed && n.collapsedAt) n.collapsedAt -= back;
  return fastForward(save, minutes / 60, nowMs);
}
