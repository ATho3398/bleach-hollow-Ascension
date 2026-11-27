// 우라하라 (GDD 5-5, C.549): 자유 모험에서 길 한 칸에 들어설 때마다 낮은 확률로 마주치는 방문 상인 — 마주친 순간부터 15분(실제 시간) 시장에 와 있다. 종족 무관 —
// 확률·머무는 시간·티어·등급표·가격은 balance.ts provisional.wanderer, 품목(이름·등급·효과 종류)은 src/data/shop/wanderer.json.
// 티어는 화면에 보이지 않는다(파는 품목 등급만 달라진다). 여기는 판정만 — 세이브·런 로그 기록은 game.ts·shop.ts 가 한다.
import { BALANCE } from '../config/balance';
import { createRng, nextFloat } from './rng';
import { WANDERER_GRADES, WANDERER_ITEMS, type WandererGrade } from '../data/shop';

const WX = BALANCE.provisional.wanderer;

/** 상인이 펼친 품목 한 칸 */
export interface WandererStockItem {
  itemId: string;
  price: number;
  /** 이미 샀나 (한 칸에 1개) */
  sold: boolean;
}

/** 지금 시장에 와 있는 상인 */
export interface WandererVisit {
  /** 마주친(온) 실제 시각 (ms) — 떠나는 시각 = at + stayMinutes 분 (wandererLeaveAt) */
  at: number;
  /** 마주친 원정의 runId (테스트 패널로 부르면 0) */
  runId: number;
  /** 숨은 티어 1~4 (화면에 안 보임) */
  tier: number;
  stock: WandererStockItem[];
}

/** 슬롯 공유 상인 상태 (세이브 shared.wanderer, 형식 99 — 옛 lapsSince 는 C.549 에 삭제) */
export interface WandererState {
  visit: WandererVisit | null;
}

export function newWandererState(): WandererState {
  return { visit: null };
}

/** 머무는 시간 (ms) */
export function wandererStayMs(): number {
  return WX.stayMinutes * 60_000;
}

/** 떠나는 시각 (ms) */
export function wandererLeaveAt(visit: Pick<WandererVisit, 'at'>): number {
  return visit.at + wandererStayMs();
}

/** 지금 와 있나: 방문이 있고 떠날 시각 전 */
export function wandererHereAt(state: WandererState, nowMs: number): boolean {
  return state.visit !== null && nowMs < wandererLeaveAt(state.visit);
}

/** 남은 시간 (ms, 와 있지 않으면 0) */
export function wandererRemainingMs(state: WandererState, nowMs: number): number {
  return state.visit ? Math.max(0, wandererLeaveAt(state.visit) - nowMs) : 0;
}

/** 남은 시간 'mm:ss' (초 올림 — 15:00 에서 시작해 00:01 다음 사라짐) */
export function wandererClock(ms: number): string {
  const sec = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
}

/** 이 바퀴에서 칸 하나에 들어설 때 마주칠 확률: 1~2바퀴 meetChance, meetFromLap 바퀴부터 meetChanceFromLap3. chanceMult = 펫 seekWanderer 배율(없으면 1), 최대 1 */
export function wandererMeetChance(lap: number, chanceMult = 1): number {
  const base = lap >= WX.meetFromLap ? WX.meetChanceFromLap3 : WX.meetChance;
  return Math.max(0, Math.min(1, base * chanceMult));
}

/** 원정 전용 난수 (재현 가능): 원정 시드·바퀴·칸 → 그 칸의 굴림 난수. salt 로 마주침 판정(0)과 품목 뽑기(1)를 나눈다 */
export function wandererCellRng(seed: number, lap: number, cell: number, salt = 0): () => number {
  const mix = (seed ^ 0x5eed77a1 ^ Math.imul(lap + 1, 0x9e3779b1) ^ Math.imul(cell + 1, 0x85ebca6b) ^ Math.imul(salt + 1, 0xc2b2ae35)) >>> 0;
  const rng = createRng(mix);
  nextFloat(rng); // 첫 값은 버린다 (가까운 시드끼리 첫 값이 닮지 않게)
  return () => nextFloat(rng);
}

/** 이 칸에서 마주치나 (원정 시드로 재현 가능) */
export function rollWandererMeet(seed: number, lap: number, cell: number, chanceMult = 1): boolean {
  return wandererCellRng(seed, lap, cell)() < wandererMeetChance(lap, chanceMult);
}

function weighted<T>(entries: readonly (readonly [T, number])[], rand: () => number): T {
  const total = entries.reduce((a, [, w]) => a + Math.max(0, w), 0);
  let r = rand() * total;
  for (const [v, w] of entries) {
    if (w <= 0) continue;
    if (r < w) return v;
    r -= w;
  }
  return entries.filter(([, w]) => w > 0).at(-1)![0];
}

/** 숨은 티어 뽑기 (1~티어 수) */
export function rollWandererTier(rand: () => number): number {
  return weighted(WX.tierWeights.map((w, i) => [i + 1, w] as const), rand);
}

/** 그 티어의 등급 확률 (0~1). 품목이 없는 등급은 뺀다 */
export function wandererGradeOdds(tier: number): Record<WandererGrade, number> {
  const row = WX.gradeWeights[Math.max(0, Math.min(WX.gradeWeights.length - 1, tier - 1))]!;
  const usable = WANDERER_GRADES.filter((g) => WANDERER_ITEMS.some((it) => it.grade === g));
  const sum = usable.reduce((a, g) => a + (row[g] ?? 0), 0);
  return Object.fromEntries(WANDERER_GRADES.map((g) => [g, usable.includes(g) && sum > 0 ? (row[g] ?? 0) / sum : 0])) as Record<WandererGrade, number>;
}

/** 품목 가격 (balance) */
export function wandererPrice(itemId: string): number {
  return WX.items[itemId]?.price ?? 0;
}

/** 효과량 (balance) */
export function wandererAmount(itemId: string): number {
  return WX.items[itemId]?.amount ?? 0;
}

/** 품목 stockSize 개 뽑기: 칸마다 등급을 티어 표로 뽑고 그 등급에서 아직 안 나온 품목 하나 (그 등급이 바닥나면 남은 품목 아무거나) */
export function rollWandererStock(tier: number, rand: () => number, skip?: (itemId: string) => boolean): WandererStockItem[] {
  const odds = wandererGradeOdds(tier);
  // skip = 아직 못 쓰는 품목은 목록에서 뺀다 (GDD 241-0: 펫 해금 전 펫 알)
  const left = WANDERER_ITEMS.filter((it) => !skip?.(it.id));
  const out: WandererStockItem[] = [];
  while (out.length < WX.stockSize && left.length > 0) {
    const grade = weighted(WANDERER_GRADES.map((g) => [g, odds[g]] as const), rand);
    const pool = left.filter((it) => it.grade === grade);
    const from = pool.length > 0 ? pool : left;
    const it = from[Math.min(from.length - 1, Math.floor(rand() * from.length))]!;
    left.splice(left.indexOf(it), 1);
    out.push({ itemId: it.id, price: wandererPrice(it.id), sold: false });
  }
  return out;
}

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const finiteNonNeg = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);

/** 저장된 상인 상태 정리: 모르는 품목·깨진 칸은 버리고, 칸이 하나도 안 남으면 방문 없음 */
export function sanitizeWanderer(raw: unknown): WandererState {
  const r = isRec(raw) ? raw : {};
  const v = isRec(r.visit) ? r.visit : null;
  let visit: WandererVisit | null = null;
  if (v && Array.isArray(v.stock)) {
    const stock = v.stock.filter((s): s is Record<string, unknown> => isRec(s) && typeof s.itemId === 'string' && WANDERER_ITEMS.some((it) => it.id === s.itemId))
      .map((s) => ({ itemId: s.itemId as string, price: finiteNonNeg(s.price), sold: s.sold === true }));
    const tier = finiteNonNeg(v.tier);
    if (stock.length > 0) visit = { at: finiteNonNeg(v.at), runId: finiteNonNeg(v.runId), tier: Math.max(1, Math.min(WX.tierWeights.length, tier || 1)), stock };
  }
  return { visit };
}
