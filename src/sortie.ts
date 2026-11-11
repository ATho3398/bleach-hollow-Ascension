// 출정품 세이브 조작 (GDD 241-D 5, C.400): 칸에 끼우기·빼기, 모험 출발 때 소모. 판정·효과 수치는 engine/sortie.ts, 화면은 ui/sortieView.ts.
import { isSortieId, SORTIE_SLOTS } from './engine/sortie';
import type { ExpeditionState } from './engine/expedition/expedition';
import type { SaveData } from './game';

/** 칸 index 에 품목(null = 빼기). 모험 중에는 못 바꾼다. 가진 것만 끼운다(0개가 된 것은 칸에 남아 흐리게) */
export function setSortieSlot(save: Pick<SaveData, 'shared' | 'activeExpedition'>, index: number, id: string | null): boolean {
  if (save.activeExpedition != null || index < 0 || index >= SORTIE_SLOTS) return false;
  if (id !== null && (!isSortieId(id) || (save.shared.items[id] ?? 0) <= 0)) return false;
  if (save.shared.sortie[index] === id) return false;
  save.shared.sortie[index] = id;
  return true;
}

/** 이 품목이 든 칸 번호들 */
export function sortieSlotsOf(save: Pick<SaveData, 'shared'>, id: string): number[] {
  return save.shared.sortie.flatMap((s, i) => (s === id ? [i] : []));
}

/** 끼울 칸: 빈 칸 → 첫 칸 */
export function sortieTargetSlot(save: Pick<SaveData, 'shared'>): number {
  const i = save.shared.sortie.indexOf(null);
  return i >= 0 ? i : 0;
}

/** 모험 출발 (GDD 241-D 5): 칸마다 1개씩 소모 → exp.sortie (그 원정 효과·런 로그). 0개인 칸은 건너뛴다. 쓴 품목 id 목록 */
export function departSortie(save: Pick<SaveData, 'shared'>, exp: Pick<ExpeditionState, 'sortie' | 'tutorial'>): string[] {
  if (exp.tutorial) return [];
  const used: string[] = [];
  for (const id of save.shared.sortie) {
    if (!id || (save.shared.items[id] ?? 0) <= 0) continue;
    save.shared.items[id]! -= 1;
    if (save.shared.items[id]! <= 0) delete save.shared.items[id];
    used.push(id);
  }
  if (used.length) exp.sortie = used;
  return used;
}
