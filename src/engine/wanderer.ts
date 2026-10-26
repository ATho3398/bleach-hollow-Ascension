// 떠돌이 상인 (GDD 85장 5번, C.140): 원정 바퀴를 마칠 때마다 등장 확률이 쌓이는 드문 방문 상인. 종족 무관 —
// 확률·티어·등급표·가격은 balance.ts provisional.wanderer, 품목(이름·등급·효과 종류)은 src/data/shop/wanderer.json.
// 티어는 화면에 보이지 않는다(파는 품목 등급만 달라진다). 여기는 판정만 — 세이브·런 로그 기록은 game.ts·shop.ts 가 한다.
import { BALANCE } from '../config/balance';
import { WANDERER_GRADES, WANDERER_ITEMS, type WandererGrade } from '../data/shop';

const WX = BALANCE.provisional.wanderer;

/** 상인이 펼친 품목 한 칸 */
export interface WandererStockItem {
  itemId: string;
  price: number;
  /** 이미 샀나 (한 칸에 1개) */
  sold: boolean;
}

/** 지금 둥지에 와 있는 상인 */
export interface WandererVisit {
  /** 온 시각 (ms) */
  at: number;
  /** 온 원정의 runId (그 원정의 바퀴에서 왔다) */
  runId: number;
  /** 숨은 티어 1~4 (화면에 안 보임) */
  tier: number;
  stock: WandererStockItem[];
}

/** 슬롯 공유 상인 상태 (세이브 shared.wanderer, 형식 41) */
export interface WandererState {
  /** 지난 방문 뒤 마친 바퀴 수 (다음 바퀴 확률 = perLap × (이 값 + 1)) */
  lapsSince: number;
  visit: WandererVisit | null;
}

export function newWandererState(): WandererState {
  return { lapsSince: 0, visit: null };
}

/** 지난 방문 뒤 k번째 바퀴를 마쳤을 때 그 바퀴에 상인이 올 확률 (선형 가중, 최대 1) */
export function wandererChance(k: number): number {
  return Math.max(0, Math.min(1, WX.perLap * k));
}

/** 처음 올 때까지 바퀴 수의 기댓값 (점검·테스트용): Σ_{n≥0} Π_{k≤n}(1 − p_k) */
export function expectedLapsToVisit(): number {
  let surv = 1;
  let sum = 0;
  for (let k = 1; surv > 1e-9 && k < 100_000; k++) {
    sum += surv;
    surv *= 1 - wandererChance(k);
  }
  return sum;
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
export function rollWandererStock(tier: number, rand: () => number): WandererStockItem[] {
  const odds = wandererGradeOdds(tier);
  const left = [...WANDERER_ITEMS];
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

/** 원정에서 laps 바퀴를 마쳤다: 바퀴마다 가중 확률로 굴린다. 이미 와 있으면 굴리지 않고 바퀴만 센다.
 *  오면 visit 을 채우고 '기다린 바퀴 수'를 돌려준다(안 오면 null) */
export function advanceWanderer(state: WandererState, laps: number, o: { at: number; runId: number }, rand: () => number): { waited: number } | null {
  let arrived: { waited: number } | null = null;
  for (let i = 0; i < Math.max(0, Math.floor(laps)); i++) {
    state.lapsSince++;
    if (state.visit) continue;
    if (rand() < wandererChance(state.lapsSince)) {
      const tier = rollWandererTier(rand);
      state.visit = { at: o.at, runId: o.runId, tier, stock: rollWandererStock(tier, rand) };
      arrived = { waited: state.lapsSince };
      state.lapsSince = 0;
    }
  }
  return arrived;
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
  return { lapsSince: finiteNonNeg(r.lapsSince), visit };
}
