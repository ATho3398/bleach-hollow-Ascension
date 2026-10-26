// 장비 (GDD 91장 v5.187 확정, C.150 가칭·provisional): 칸 5개(무기·방어구·신발·장신구 1·2), 등급 4(노말·레어·영웅·전설), 골드 강화 +1~+5(실패 없음).
// 종족 무관 — 칸 이름은 종족 설정 gearSlotNames, 수치는 balance.ts provisional.gear. 진화·환생·트랙 바꿈에도 그대로(세이브 shared.gear, 공용 보관함).
// 여기는 상태·굴림·효과 계산만 — 세이브 기록·런 로그는 game.ts·inventory.ts·shop.ts 가 한다.
import { BALANCE } from '../config/balance';
import { STAT_IDS, type StatId, type Stats } from '../data/schema';
import {
  GEAR_GRADES, GEAR_KINDS, GEAR_SLOT_KIND, GEAR_SLOTS, GEAR_SPECIALS, getGearSpecial, isGearGrade, isGearKind, isGearSlot, slotsForKind,
  type GearGrade, type GearKind, type GearSlot, type GearSpecialEffect,
} from '../data/gear';
import type { CombatParams } from './combat/combat';
import { refStatOf } from './evolution/evolution';

const GX = BALANCE.provisional.gear;
const STAR_MAX = BALANCE.provisional.stats.tierTotals.length;

/** 장비 능력치 줄 키: 능력치 6종 + 치명(확률) */
export type GearStat = StatId | 'crit';
const GEAR_STATS: readonly GearStat[] = [...STAT_IDS, 'crit'];

/** 장비 한 개 (만들 때 굴린 값이 고정된다). plus = 강화 단계 */
export interface GearItem {
  uid: string;
  kind: GearKind;
  grade: GearGrade;
  /** 얻은 원정 ★ (값의 바탕 = 그 ★ 기준 능력치) */
  star: number;
  /** 강화 0 일 때의 능력치 줄 (치명은 확률 0~1) */
  stats: Partial<Record<GearStat, number>>;
  /** 특수 효과 (영웅·전설만) */
  special: { id: string; value: number } | null;
  plus: number;
  gotAt: number;
}

/** 슬롯 공유 장비 상태 (세이브 shared.gear, 형식 44) */
export interface GearState {
  items: GearItem[];
  equipped: Record<GearSlot, string | null>;
  /** 다음 uid 번호 */
  nextId: number;
}

/** 전투에 싣는 장착 장비 합계 (원정 출발 때 복사, 등급전·탑·연습은 그때그때) */
export interface GearCarry {
  stats: Partial<Record<StatId, number>>;
  crit: number;
  /** 계열 id → 그 계열 블록 피해 + 비율 */
  family: Record<string, number>;
  elite: number;
  critDamage: number;
  shield: number;
}

/** 새로 굴린 장비 (uid 없음 — 보관함에 넣을 때 붙는다) */
export type GearRoll = Omit<GearItem, 'uid' | 'plus' | 'gotAt'>;

export function newGearState(): GearState {
  return { items: [], equipped: { weapon: null, armor: null, shoes: null, acc1: null, acc2: null }, nextId: 1 };
}

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const nonNeg = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
const clampStar = (v: unknown): number => Math.min(STAR_MAX, Math.max(1, nonNeg(v) || 1));

/** 저장된 장비 상태 정리: 모르는 종류·깨진 값은 버리고, 없는 장비·칸에 안 맞는 장비를 낀 칸은 비운다 */
export function sanitizeGear(raw: unknown): GearState {
  const r = isRec(raw) ? raw : {};
  const out = newGearState();
  const seen = new Set<string>();
  for (const v of Array.isArray(r.items) ? r.items : []) {
    if (!isRec(v) || typeof v.uid !== 'string' || seen.has(v.uid) || !isGearKind(v.kind) || !isGearGrade(v.grade)) continue;
    const stats: Partial<Record<GearStat, number>> = {};
    if (isRec(v.stats)) for (const k of GEAR_STATS) {
      const n = v.stats[k];
      if (typeof n === 'number' && Number.isFinite(n) && n > 0) stats[k] = n;
    }
    const sp = isRec(v.special) && typeof v.special.id === 'string' && getGearSpecial(v.special.id) && typeof v.special.value === 'number' && Number.isFinite(v.special.value)
      ? { id: v.special.id, value: v.special.value } : null;
    seen.add(v.uid);
    out.items.push({ uid: v.uid, kind: v.kind, grade: v.grade, star: clampStar(v.star), stats, special: sp, plus: Math.min(GX.maxPlus, nonNeg(v.plus)), gotAt: nonNeg(v.gotAt) });
    if (out.items.length >= GX.cap) break;
  }
  const eq = isRec(r.equipped) ? r.equipped : {};
  const used = new Set<string>();
  for (const s of GEAR_SLOTS) {
    const uid = eq[s];
    const it = typeof uid === 'string' ? out.items.find((i) => i.uid === uid) : undefined;
    if (it && it.kind === GEAR_SLOT_KIND[s] && !used.has(it.uid)) {
      out.equipped[s] = it.uid;
      used.add(it.uid);
    }
  }
  const maxNum = Math.max(0, ...out.items.map((i) => Number(i.uid.replace(/^g/, '')) || 0));
  out.nextId = Math.max(nonNeg(r.nextId), maxNum + 1, 1);
  return out;
}

const pickOf = <T>(list: readonly T[], rand: () => number): T => list[Math.min(list.length - 1, Math.floor(rand() * list.length))]!;

/** 등급 굴림: 가중표(%) */
export function rollGrade(weights: Record<string, number>, rand: () => number): GearGrade {
  const total = GEAR_GRADES.reduce((a, g) => a + (weights[g] ?? 0), 0);
  let r = rand() * total;
  for (const g of GEAR_GRADES) {
    const w = weights[g] ?? 0;
    if (r < w) return g;
    r -= w;
  }
  return 'normal';
}

/** 능력치 한 줄 값 (강화 0): ★ 기준 능력치 × 등급 비율 × 종류 가중. 치명 줄은 등급 확률 */
export function gearLineValue(kind: GearKind, grade: GearGrade, star: number, stat: GearStat): number {
  if (stat === 'crit') return GX.critLine[grade]!;
  return Math.max(1, Math.round(refStatOf(clampStar(star) - 1) * GX.lineFrac[grade]! * GX.kinds[kind]!.weight));
}

/** 특수 효과 값 (영웅 = [0], 전설 = [1]). 노말·레어는 없음 */
export function specialValue(effect: GearSpecialEffect, grade: GearGrade): number {
  const row = GX.special[effect];
  return row ? (grade === 'legendary' ? row[1] : row[0]) : 0;
}

/** 장비 하나를 굴린다: 종류(없으면 무작위)·등급·★. 장신구 줄 수 1~2, 영웅·전설은 특수 효과 1줄 */
export function rollGear(o: { kind?: GearKind; grade: GearGrade; star: number }, rand: () => number): GearRoll {
  const kind = o.kind ?? pickOf(GEAR_KINDS, rand);
  const star = clampStar(o.star);
  const K = GX.kinds[kind]!;
  const [lo, hi] = K.lines;
  const n = lo + Math.min(hi - lo, Math.floor(rand() * (hi - lo + 1)));
  const pool = [...K.pool] as GearStat[];
  const stats: Partial<Record<GearStat, number>> = {};
  for (let i = 0; i < n && pool.length > 0; i++) {
    const at = Math.min(pool.length - 1, Math.floor(rand() * pool.length));
    const stat = pool.splice(at, 1)[0]!;
    stats[stat] = gearLineValue(kind, o.grade, star, stat);
  }
  let special: GearRoll['special'] = null;
  if (o.grade === 'epic' || o.grade === 'legendary') {
    const def = pickOf(GEAR_SPECIALS, rand);
    special = { id: def.id, value: specialValue(def.effect, o.grade) };
  }
  return { kind, grade: o.grade, star, stats, special };
}

/** 강화 배율: 1 + plusStep × 단계 */
export function plusMult(plus: number): number {
  return 1 + GX.plusStep * Math.max(0, Math.min(GX.maxPlus, plus));
}

/** 강화가 입혀진 능력치 줄. 치명은 확률 그대로 곱, 나머지는 반올림하되 단계마다 최소 +1 (작은 값이 반올림으로 안 오르는 것을 막는다). plus 를 주면 그 단계로 셈한다(미리보기) */
export function gearStatsOf(it: Pick<GearItem, 'stats' | 'plus'>, plus = it.plus): Partial<Record<GearStat, number>> {
  const out: Partial<Record<GearStat, number>> = {};
  const n = Math.max(0, Math.min(GX.maxPlus, plus));
  const k = plusMult(n);
  for (const s of GEAR_STATS) {
    const v = it.stats[s];
    if (v === undefined) continue;
    out[s] = s === 'crit' ? Math.round(v * k * 10000) / 10000 : Math.max(Math.round(v * k), v + n);
  }
  return out;
}

/** 다음 강화 비용 (최대면 null) */
export function enhanceCost(it: Pick<GearItem, 'grade' | 'plus'>): number | null {
  return it.plus >= GX.maxPlus ? null : GX.enhanceCost[it.grade]! * (it.plus + 1);
}

/** 판매 골드 */
export function sellGold(it: Pick<GearItem, 'grade'>): number {
  return GX.sellGold[it.grade]!;
}

export function findGear(state: GearState, uid: string): GearItem | undefined {
  return state.items.find((i) => i.uid === uid);
}

/** 이 장비를 낀 칸 (안 꼈으면 null) */
export function equippedSlotOf(state: GearState, uid: string): GearSlot | null {
  return GEAR_SLOTS.find((s) => state.equipped[s] === uid) ?? null;
}

/** 보관함이 가득 찼나 */
export function gearFull(state: GearState): boolean {
  return state.items.length >= GX.cap;
}

/** 보관함에 넣는다. 가득이면 null (부르는 쪽이 골드로 바꾼다) */
export function grantGear(state: GearState, roll: GearRoll, at: number): GearItem | null {
  if (gearFull(state)) return null;
  const it: GearItem = { ...roll, stats: { ...roll.stats }, special: roll.special ? { ...roll.special } : null, uid: `g${state.nextId++}`, plus: 0, gotAt: at };
  state.items.push(it);
  return it;
}

/** 끼운다. slot 을 안 주면 그 종류의 빈 칸(없으면 첫 칸). 다른 칸에 끼워져 있으면 옮긴다. 성공하면 끼운 칸 */
export function equipGear(state: GearState, uid: string, slot?: GearSlot): GearSlot | null {
  const it = findGear(state, uid);
  if (!it) return null;
  const slots = slotsForKind(it.kind);
  const to = slot ?? slots.find((s) => state.equipped[s] === null) ?? slots[0]!;
  if (!isGearSlot(to) || GEAR_SLOT_KIND[to] !== it.kind) return null;
  if (state.equipped[to] === uid) return null;
  const from = equippedSlotOf(state, uid);
  if (from) state.equipped[from] = null;
  state.equipped[to] = uid;
  return to;
}

/** 칸을 비운다. 비어 있었으면 false */
export function unequipGear(state: GearState, slot: GearSlot): boolean {
  if (!state.equipped[slot]) return false;
  state.equipped[slot] = null;
  return true;
}

/** 강화 +1 (돈 확인은 부르는 쪽). 최대면 null, 성공하면 새 단계 */
export function enhanceGear(state: GearState, uid: string): number | null {
  const it = findGear(state, uid);
  if (!it || it.plus >= GX.maxPlus) return null;
  it.plus++;
  return it.plus;
}

/** 판다 (낀 장비는 못 판다). 성공하면 받은 골드 */
export function sellGearItem(state: GearState, uid: string): number | null {
  const at = state.items.findIndex((i) => i.uid === uid);
  if (at < 0 || equippedSlotOf(state, uid)) return null;
  const [it] = state.items.splice(at, 1);
  return sellGold(it!);
}

/** 빈 합계 */
export function emptyCarry(): GearCarry {
  return { stats: {}, crit: 0, family: {}, elite: 0, critDamage: 0, shield: 0 };
}

/** 장비 목록 → 전투 합계 */
export function carryOfItems(items: readonly Pick<GearItem, 'stats' | 'plus' | 'special'>[]): GearCarry {
  const c = emptyCarry();
  for (const it of items) {
    const st = gearStatsOf(it);
    for (const s of STAT_IDS) if (st[s]) c.stats[s] = (c.stats[s] ?? 0) + st[s]!;
    if (st.crit) c.crit += st.crit;
    const def = it.special ? getGearSpecial(it.special.id) : undefined;
    if (!def || !it.special) continue;
    if (def.effect === 'family' && def.family) c.family[def.family] = (c.family[def.family] ?? 0) + it.special.value;
    else if (def.effect === 'elite') c.elite += it.special.value;
    else if (def.effect === 'critDamage') c.critDamage += it.special.value;
    else if (def.effect === 'shield') c.shield += it.special.value;
  }
  return c;
}

/** 지금 낀 장비 합계 (없으면 null — 전투에 아무것도 안 싣는다) */
export function gearCarry(state: GearState): GearCarry | null {
  const items = GEAR_SLOTS.map((s) => state.equipped[s]).filter((u): u is string => u !== null).map((u) => findGear(state, u)).filter((i): i is GearItem => i !== undefined);
  return items.length > 0 ? carryOfItems(items) : null;
}

/** 전투 파라미터에 장비를 싣는다 (applyEvolutionToParams 뒤): 능력치 더함 · 치명 확률 더함 · 계열 블록 피해 · 치명 피해 · 시작 보호막.
 *  strong = 강적·보스 상대(특수 효과 elite). carry 가 없으면 그대로 */
export function applyGearToParams(params: Partial<CombatParams>, carry: GearCarry | null | undefined, strong = false): void {
  if (!carry) return;
  const CX = BALANCE.provisional.combat;
  if (params.playerStats) {
    const st: Stats = { ...params.playerStats };
    for (const s of STAT_IDS) if (carry.stats[s]) st[s] += carry.stats[s]!;
    params.playerStats = st;
  }
  if (carry.crit > 0) params.critChance = (params.critChance ?? CX.critChance) + carry.crit;
  if (carry.critDamage > 0) params.critMultiplier = (params.critMultiplier ?? CX.critMultiplier) + carry.critDamage;
  if (carry.shield > 0) params.startShieldFraction = (params.startShieldFraction ?? 0) + carry.shield;
  if (strong && carry.elite > 0) params.playerPowerMultiplier = (params.playerPowerMultiplier ?? 1) * (1 + carry.elite);
  if (params.families) {
    const fams = { ...params.families };
    for (const [f, v] of Object.entries(carry.family)) {
      const fam = fams[f];
      if (fam && v > 0) fams[f] = { tiers: fam.tiers.map((t) => ({ ...t, multiplier: t.multiplier * (1 + v) })) };
    }
    params.families = fams;
  }
}

/** 그 단계 평균 장비 (balance:check 참고 줄, GDD 91장 7번): 5칸 모두 refLoadout 등급·강화, ★ = 권장(단계 + 1). 무기 = 힘, 장신구 = 정신력 + 치명. 특수 효과 없음(레어) */
export function referenceLoadout(tierIndex: number): GearCarry {
  const star = Math.min(STAR_MAX, tierIndex + 1);
  const grade = GX.refLoadout.grade as GearGrade;
  const mk = (kind: GearKind, stats: GearStat[]) => ({ stats: Object.fromEntries(stats.map((s) => [s, gearLineValue(kind, grade, star, s)])), plus: GX.refLoadout.plus, special: null });
  return carryOfItems([mk('weapon', ['atk']), mk('armor', ['hp', 'def']), mk('shoes', ['spd']), mk('accessory', ['spr', 'crit']), mk('accessory', ['spr', 'crit'])]);
}
