// 특성 상점 탈착 특성 (GDD 150장 3~6, C.227): 진화 특성(147장, 영구)과 따로, 상점에서 사서 빈 특성 칸에 끼우고 방에서 빼는 특성.
// 보유 = 공유 자원 shared.traits(한 번 사면 계속, 중복 구매 없음), 끼운 것 = 트랙의 특성 칸 AbilityLoadout.detached(진화 특성과 같은 칸 수를 나눠 쓴다).
// 진화 특성이 들어올 칸이 없으면 진화 특성이 우선 — 끼운 탈착 특성 하나(마지막에 끼운 것)가 보유 목록으로 빠진다. 원정 중에는 끼우기·빼기 잠금(화면).
// 이름은 src/data/traitShop/traits.json, 가격·효과는 BALANCE.provisional.traitShop (provisional). 종족 분기 없음.
import { BALANCE } from '../config/balance';
import raw from '../data/traitShop/traits.json';
import type { AbilityLoadout } from './evolution/formAbilities';

export interface DetachTraitDef {
  id: string;
  name: string;
  price: number;
  /** 주는 피해 + */
  dealt?: number;
  /** 받는 피해 − */
  taken?: number;
  /** 최대 체력 + */
  maxHp?: number;
  /** 블록 치명 확률 +%p (상한도 같이) */
  blockCrit?: number;
}

export const DETACH_TRAITS: readonly DetachTraitDef[] = (raw.traits as { id: string; name: string }[]).map((t) => {
  const v = BALANCE.provisional.traitShop[t.id];
  if (!v) throw new Error(`traitShop: ${t.id} 의 가격·효과가 balance.ts 에 없다`);
  return { id: t.id, name: t.name, ...v };
});

export function getDetachTrait(id: string): DetachTraitDef | undefined {
  return DETACH_TRAITS.find((t) => t.id === id);
}

const pct = (x: number) => `${Math.round(x * 1000) / 10}%`;
const MINUS = '−';

/** 효과 한 줄 (text-style 수치 줄): "주는 피해 +5%" */
export function detachEffectText(t: Pick<DetachTraitDef, 'dealt' | 'taken' | 'maxHp' | 'blockCrit'>): string {
  const parts: string[] = [];
  if (t.dealt) parts.push(`주는 피해 +${pct(t.dealt)}`);
  if (t.taken) parts.push(`받는 피해 ${MINUS}${pct(t.taken)}`);
  if (t.maxHp) parts.push(`최대 체력 +${pct(t.maxHp)}`);
  if (t.blockCrit) parts.push(`블록 치명 +${pct(t.blockCrit)}p`);
  return parts.join(' · ');
}

/** 칸에 끼운 탈착 특성 id */
export function detachedOf(l: Pick<AbilityLoadout, 'detached'> | undefined): string[] {
  return l?.detached ?? [];
}

/** 쓴 칸 = 진화 특성 + 탈착 특성 */
export function usedAbilitySlots(l: Pick<AbilityLoadout, 'owned' | 'detached'>): number {
  return Object.keys(l.owned).length + detachedOf(l).length;
}

/** 끼울 수 없는 이유 한 줄. 끼울 수 있으면 null */
export function detachLock(l: AbilityLoadout, owned: readonly string[], id: string): string | null {
  if (!getDetachTrait(id)) return '모르는 특성이다';
  if (!owned.includes(id)) return '가지고 있지 않다';
  if (detachedOf(l).includes(id)) return '이미 끼웠다';
  if (usedAbilitySlots(l) >= l.slots) return '빈 특성 칸이 없다';
  return null;
}

/** 빈 칸에 끼운다. 안 되면 false (아무것도 안 바뀜) */
export function equipDetach(l: AbilityLoadout, owned: readonly string[], id: string): boolean {
  if (detachLock(l, owned, id) !== null) return false;
  l.detached = [...detachedOf(l), id];
  return true;
}

/** 칸에서 뺀다 (보유 목록에는 남는다). 끼우지 않았으면 false */
export function unequipDetach(l: AbilityLoadout, id: string): boolean {
  const list = detachedOf(l);
  if (!list.includes(id)) return false;
  const rest = list.filter((x) => x !== id);
  if (rest.length > 0) l.detached = rest;
  else delete l.detached;
  return true;
}

/** 진화 특성이 들어올 칸을 만든다 (GDD 150장 3: 진화 특성 우선): 칸이 꽉 찼고 탈착 특성이 끼워져 있으면 마지막에 끼운 것을 뺀다. 뺀 id(없으면 null) */
export function makeRoomForEvolution(l: AbilityLoadout): string | null {
  const list = detachedOf(l);
  if (usedAbilitySlots(l) < l.slots || list.length === 0) return null;
  const out = list[list.length - 1]!;
  unequipDetach(l, out);
  return out;
}

/** 칸 수가 줄었거나 진화 특성이 늘어 넘치면 탈착 특성을 뒤에서부터 뺀다. 뺀 id 목록 */
export function trimDetached(l: AbilityLoadout): string[] {
  const out: string[] = [];
  while (detachedOf(l).length > 0 && usedAbilitySlots(l) > l.slots) {
    const id = makeRoomForEvolution(l);
    if (id === null) break;
    out.push(id);
  }
  return out;
}

/** 끼운 탈착 특성 효과 합 */
export function detachTotals(ids: readonly string[]): { dealt: number; taken: number; maxHp: number; blockCrit: number } {
  const t = { dealt: 0, taken: 0, maxHp: 0, blockCrit: 0 };
  for (const id of ids) {
    const d = getDetachTrait(id);
    if (!d) continue;
    t.dealt += d.dealt ?? 0;
    t.taken += d.taken ?? 0;
    t.maxHp += d.maxHp ?? 0;
    t.blockCrit += d.blockCrit ?? 0;
  }
  return t;
}
