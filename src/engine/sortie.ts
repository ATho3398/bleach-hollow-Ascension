// 출정품 (GDD 241-D 5, C.400 provisional — 마스터 이름): 칸 2개에 끼워 두면 모험 출발 때 1개씩 소모 → 그 원정 동안 효과.
// 종족 무관 — 품목은 상점 데이터(items.json kind 'sortie'), 수치는 balance.ts provisional.sortie. 여기는 판정·효과 계산만(세이브 기록은 src/sortie.ts).
import { BALANCE } from '../config/balance';
import { GOLD_ITEMS } from '../data/shop';

const SX = BALANCE.provisional.sortie;
export type SortieEffect = 'power' | 'guard' | 'drop';
export const SORTIE_SLOTS: number = SX.slots;
/** 출정품 id (상점 데이터 순서) */
export const SORTIE_IDS: readonly string[] = GOLD_ITEMS.filter((g) => g.kind === 'sortie' && SX.items[g.id]).map((g) => g.id);

export const isSortieId = (v: unknown): v is string => typeof v === 'string' && SORTIE_IDS.includes(v);

/** 빈 칸 (세이브 shared.sortie) */
export function newSortieSlots(): (string | null)[] {
  return Array.from({ length: SORTIE_SLOTS }, () => null);
}

/** 저장된 칸 정리: 길이 = 칸 수, 모르는 id 는 비움, 같은 품목 두 칸 허용(각 1개씩 소모) */
export function sanitizeSortie(raw: unknown): (string | null)[] {
  const r = Array.isArray(raw) ? raw : [];
  return newSortieSlots().map((_, i) => (isSortieId(r[i]) ? r[i] : null));
}

/** 원정 동안의 출정품 효과 합 (소모된 목록) */
export interface SortieMods {
  power: number;
  guard: number;
  drop: number;
}
export function sortieMods(used: readonly string[] | null | undefined): SortieMods {
  const out: SortieMods = { power: 0, guard: 0, drop: 0 };
  for (const id of used ?? []) {
    const d = SX.items[id];
    if (d) out[d.effect] += d.value;
  }
  return out;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
/** 효과 한 줄 ("이번 모험 동안 공격 피해 +10%") */
export function sortieEffectText(id: string): string {
  const d = SX.items[id];
  if (!d) return '';
  const what = d.effect === 'power' ? `공격 피해 +${pct(d.value)}` : d.effect === 'guard' ? `받는 피해 −${pct(d.value)}` : `드롭 확률 +${pct(d.value)}`;
  return `이번 모험 동안 ${what}`;
}
/** 짧은 효과 (가방 카드) */
export function sortieBrief(id: string): string {
  const d = SX.items[id];
  if (!d) return '';
  return d.effect === 'power' ? `공격 +${pct(d.value)}` : d.effect === 'guard' ? `받는 피해 −${pct(d.value)}` : `드롭 +${pct(d.value)}`;
}
export function sortiePrice(id: string): number | null {
  return SX.items[id]?.price ?? null;
}
