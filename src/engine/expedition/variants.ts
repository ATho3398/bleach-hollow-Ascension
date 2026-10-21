// 원정 타일 변수 5종의 규칙 조각 (GDD 25-5, S-13 C.57): 인접 시너지 찾기, 효과 묶음(시너지·변이·상위 타일) 합치기, 드래프트 카드 뽑기, 이벤트 내용 만들기.
// 종족 무관 순수 로직. 표(짝·이름)는 src/data/tiles, 수치는 BALANCE.provisional.tileVariants. 엔진은 kind·preset·id 로만 판정한다.

import { BALANCE } from '../../config/balance';
import { baseTilesFor, eventTilesFor, getTile, matchesTile, MUTATIONS, SYNERGIES, tileEventOf } from '../../data/tiles';
import type { CombatParams } from '../combat';
import type { BuildState } from '../absorb';
import type { FoodId } from '../faction';
import { nextFloat, nextInt, type Rng } from '../rng';
import type { TileEvent } from '../../data/schema';

const TV = BALANCE.provisional.tileVariants;

/** 효과 묶음: 시너지·바퀴 변이·상위 타일이 같은 키를 쓴다 (배율은 곱하고 가산은 더한다) */
export interface VariantMods {
  /** 그 전투의 먹이·골드 배율 */
  rewardMult?: number;
  goldMult?: number;
  /** 먹이 드롭 굴림 횟수 배율 */
  foodMult?: number;
  /** 일반 적 먹이 드롭 확률 가산 */
  foodChanceBonus?: number;
  enemyFirstStrike?: boolean;
  enemyAttackMult?: number;
  enemyHpMult?: number;
  /** 강적일 때만 체력 배율 */
  eliteHpMult?: number;
  /** 공허 블록 생성 확률 가산 / 기본 확률 배율 */
  voidBonus?: number;
  voidMult?: number;
  /** 흡수 후보 +n */
  absorbBonus?: number;
  /** 같은 칸에서 일반 적과 한 번 더 싸운다 (시너지 오른쪽 칸만) */
  extraBattle?: number;
  /** 휴식 회복 배율 */
  restMult?: number;
  /** 다음 전투 시작 보호막(최대 체력 비율, 시너지 왼쪽 칸에 닿을 때) */
  nextShield?: number;
  /** 리스크 한 번 (시너지 오른쪽 칸에 닿을 때) */
  riskOnce?: number;
  /** 이동·전투 허기 배율 */
  hungerMult?: number;
  /** 이 속성 적이 사냥터 주 속성처럼 자주 나온다 */
  elementBias?: string;
  /** 강적을 이기면 영혼 결정 +n */
  eliteSoulBonus?: number;
  /** 환경 타일 효과 크기 배율 (상위 타일) */
  envMult?: number;
  /** 특수 속성(혈·독·허) 특성이 흡수 후보에 들 확률 (바퀴 변이 공허의 밤, GDD 49-7 ①) */
  specialTraitChance?: number;
}

const MULT_KEYS = ['rewardMult', 'goldMult', 'foodMult', 'enemyAttackMult', 'enemyHpMult', 'eliteHpMult', 'voidMult', 'restMult', 'hungerMult', 'envMult'] as const;
const ADD_KEYS = ['foodChanceBonus', 'voidBonus', 'absorbBonus', 'extraBattle', 'nextShield', 'riskOnce', 'eliteSoulBonus'] as const;

/** 여러 효과 묶음을 하나로 (없는 값은 건너뛴다) */
export function combineMods(...list: (VariantMods | null | undefined)[]): VariantMods {
  const out: VariantMods = {};
  for (const m of list) {
    if (!m) continue;
    for (const k of MULT_KEYS) if (m[k] !== undefined) out[k] = (out[k] ?? 1) * m[k]!;
    for (const k of ADD_KEYS) if (m[k] !== undefined) out[k] = (out[k] ?? 0) + m[k]!;
    if (m.enemyFirstStrike) out.enemyFirstStrike = true;
    if (m.elementBias) out.elementBias = m.elementBias;
  }
  return out;
}

export const synergyMods = (id: string): VariantMods => (TV.synergies[id] ?? {}) as VariantMods;
export const mutationMods = (id: string | null | undefined): VariantMods => (id ? ((TV.mutations[id] ?? {}) as VariantMods) : {});
/** 상위 타일("+")의 강화 (바탕 타일이면 빈 묶음) */
export function upgradeMods(tileId: string | null | undefined): VariantMods {
  if (!tileId) return {};
  const t = getTile(tileId);
  return t.upgradeOf ? ((TV.upgrade[t.kind] ?? {}) as VariantMods) : {};
}

// ── ② 인접 시너지 ──
export interface SynergyPair {
  id: string;
  left: number;
  right: number;
}

/** 길 위 시너지 짝 (GDD 25-5 ②): 바로 붙은 두 칸, a·b 순서 무관, 한 칸은 하나만 — 왼쪽부터 짝을 짓는다. 0번 둥지 칸은 슬롯이 없어 끼지 않는다 */
export function synergyPairs(slots: readonly (string | null)[]): SynergyPair[] {
  const out: SynergyPair[] = [];
  for (let c = 1; c < slots.length - 1; c++) {
    const a = slots[c];
    const b = slots[c + 1];
    if (!a || !b) continue;
    const ta = getTile(a);
    const tb = getTile(b);
    const syn = SYNERGIES.find((s) => (matchesTile(s.a, ta) && matchesTile(s.b, tb)) || (matchesTile(s.b, ta) && matchesTile(s.a, tb)));
    if (!syn) continue;
    out.push({ id: syn.id, left: c, right: c + 1 });
    c++; // 오른쪽 칸은 이 짝에 쓰였다
  }
  return out;
}

/** 이 칸이 속한 시너지 짝과 칸의 자리 */
export function synergyAt(slots: readonly (string | null)[], cell: number): (SynergyPair & { role: 'left' | 'right' }) | null {
  const p = synergyPairs(slots).find((x) => x.left === cell || x.right === cell);
  return p ? { ...p, role: p.left === cell ? 'left' : 'right' } : null;
}

// ── ① 드래프트 ──
/** 바퀴 끝 드래프트 카드 (GDD 25-5 ①): 앞 장들은 덱에서, 마지막 1장은 specialChance 로 덱 밖 타일·이벤트 타일. 덱이 비었으면 바탕 타일에서 */
export function drawDraft(rng: Rng, factionId: string, deck: readonly string[]): string[] {
  const D = TV.draft;
  const pool = deck.length > 0 ? [...deck] : baseTilesFor(factionId).map((t) => t.id);
  const out: string[] = [];
  for (let i = 0; i < D.cards - 1; i++) out.push(pool[nextInt(rng, pool.length)]!);
  const outside = baseTilesFor(factionId).map((t) => t.id).filter((id) => !deck.includes(id));
  const events = eventTilesFor(factionId).map((t) => t.id);
  if (nextFloat(rng) < D.specialChance && (events.length > 0 || outside.length > 0)) {
    const useEvent = outside.length === 0 || (events.length > 0 && nextFloat(rng) < D.eventShare);
    const list = useEvent ? events : outside;
    out.push(list[nextInt(rng, list.length)]!);
  } else out.push(pool[nextInt(rng, pool.length)]!);
  return out;
}

// ── ④ 바퀴 변이 ──
/** 바퀴 시작 변이 굴림: fromLap 바퀴부터 chance 확률로 하나 */
export function rollMutation(rng: Rng, lap: number): string | null {
  if (lap < TV.mutation.fromLap || MUTATIONS.length === 0) return null;
  if (nextFloat(rng) >= TV.mutation.chance) return null;
  return MUTATIONS[nextInt(rng, MUTATIONS.length)]!.id;
}

// ── ③ 이벤트 타일 ──
export interface MerchantOffer {
  kind: 'food' | 'tile';
  /** 먹이 id 또는 타일 id */
  id: string;
  price: number;
}

/** 밟은 이벤트 타일의 내용 (엔진이 미리 굴려 둔다 — 새로고침해도 같다) */
export interface EventPending {
  tileId: string;
  cell: number;
  event: TileEvent;
  offers?: MerchantOffer[];
  /** 보물: 먹이 하나 또는 골드 */
  treasure?: { food?: FoodId; gold?: number };
  /** 제단: 위력을 올릴 수 있는 장착 특성 */
  traits?: string[];
}

function pickWeighted<T extends string>(rng: Rng, table: Record<string, number>): T {
  const entries = Object.entries(table);
  let x = nextFloat(rng) * entries.reduce((a, [, w]) => a + w, 0);
  for (const [k, w] of entries) {
    x -= w;
    if (x < 0) return k as T;
  }
  return entries[entries.length - 1]![0] as T;
}

/** 이벤트 내용 만들기: 상인 판매 줄(먹이 foodOffers 개 + 타일 1), 보물 결과, 제단 후보(장착 특성) */
export function makeEvent(rng: Rng, tileId: string, cell: number, o: { factionId: string; deck: readonly string[]; build: BuildState }): EventPending {
  const event = tileEventOf(tileId);
  if (!event) throw new Error(`이벤트 타일이 아니다: ${tileId}`);
  const E = TV.events;
  const p: EventPending = { tileId, cell, event };
  if (event === 'merchant') {
    const foods = Object.keys(E.merchant.prices).filter((k) => k !== 'tile');
    const offers: MerchantOffer[] = [];
    for (let i = 0; i < E.merchant.foodOffers && foods.length > 0; i++) {
      const f = foods.splice(nextInt(rng, foods.length), 1)[0]!;
      offers.push({ kind: 'food', id: f, price: E.merchant.prices[f]! });
    }
    offers.sort((a, b) => a.price - b.price);
    const tiles = o.deck.length > 0 ? o.deck : baseTilesFor(o.factionId).map((t) => t.id);
    offers.push({ kind: 'tile', id: tiles[nextInt(rng, tiles.length)]!, price: E.merchant.prices.tile! });
    p.offers = offers;
  } else if (event === 'treasure') {
    const [lo, hi] = E.treasure.gold;
    p.treasure = nextFloat(rng) < E.treasure.foodChance ? { food: pickWeighted<FoodId>(rng, E.treasure.foodTable) } : { gold: lo + nextInt(rng, hi - lo + 1) };
  } else if (event === 'altar') {
    p.traits = o.build.slots.filter((s): s is string => s !== null);
  }
  return p;
}

/** 제단 위력 (GDD 25-5 ③): 장착한 그 특성이 skill 이면 블록 위력, 아니면 기본 공격 위력에 곱한다 */
export function applyTraitBoosts(params: Partial<CombatParams>, build: BuildState, boosts: Record<string, number>): void {
  for (const [id, b] of Object.entries(boosts)) {
    if (!build.slots.includes(id) || !(b > 0)) continue;
    const skill = params.skills?.find((s) => s.id === id);
    if (skill) skill.powerMultiplier *= 1 + b;
    else params.attackPowerMultiplier = (params.attackPowerMultiplier ?? 1) * (1 + b);
  }
}
