// 진화 외형 (GDD 53, C.109): 어느 단계에 닿을 때 노력치 순위로 그 단계 전용 외형(스킨 id)을 고른다.
// 표는 종족 설정 `tierLooks`(단계 번호 → 능력치별 외형 + 1·2위 쌍 외형)에 있고 여기엔 종족 이름이 없다.
import { STAT_IDS, type FormDef, type StatId, type Stats } from '../../data/schema';
import type { FactionConfig } from '../faction';
import { rankedStats } from './formAbilities';

/** tier = 단계 번호(1부터, 아쥬커스 = 3). 표가 없거나 맞는 칸이 없으면 null (기존 단계 그림) */
export function pickTierLook(faction: Pick<FactionConfig, 'tierLooks'>, tier: number, ev: Stats, form: FormDef): string | null {
  const table = faction.tierLooks?.[String(tier)];
  if (!table) return null;
  const rank = rankedStats(ev, form);
  const [first, second] = rank;
  // 1·2위 쌍(순서 무관)을 먼저 본다. 2위도 노력치가 0보다 커야 한다(0 동률의 순서로 쌍이 되지 않게)
  for (const pair of table.pairs ?? []) {
    const [a, b] = pair.stats;
    if (first !== undefined && second !== undefined && ev[first] > 0 && ev[second] > 0 && ((first === a && second === b) || (first === b && second === a))) return pair.look;
  }
  return first !== undefined ? table.stat[first] ?? null : null;
}

/** 진화체 id 로 정한 외형 (GDD 54): formLooks[form.id] 가 하나면 그것, 둘 이상이면 seed 로 하나를 뽑는다(같은 seed → 같은 결과). 표에 없으면 null */
export function pickFormLook(faction: Pick<FactionConfig, 'formLooks'>, formId: string, seed: number): string | null {
  const list = faction.formLooks?.[formId];
  if (!list?.length) return null;
  let x = (seed ^ 0x9e3779b1) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  return list[x % list.length]!;
}

/** 진화체 외형: 진화체 표 → 없으면 단계 표(능력치 순위). C.220 (GDD 126장 3): 종족 설정 ascension.lookChange 면 진화체 표(아란칼 모습)는 아란칼화를 깬 뒤에만 */
export function pickLook(faction: Pick<FactionConfig, 'formLooks' | 'tierLooks'> & { ascension?: Pick<FactionConfig['ascension'], 'lookChange'> }, form: FormDef, ev: Stats, seed: number, ascended = true): string | null {
  const formLook = faction.ascension?.lookChange && !ascended ? null : pickFormLook(faction, form.id, seed);
  return formLook ?? pickTierLook(faction, form.tier, ev, form);
}

/** 표에 나오는 모든 외형 id (검증·테스트용) */
export function tierLookIds(faction: Pick<FactionConfig, 'tierLooks' | 'formLooks'>): string[] {
  const out = new Set<string>();
  for (const list of Object.values((faction as Pick<FactionConfig, 'formLooks'>).formLooks ?? {})) for (const id of list) out.add(id);
  for (const t of Object.values(faction.tierLooks ?? {})) {
    for (const s of STAT_IDS) if (t.stat[s]) out.add(t.stat[s]!);
    for (const p of t.pairs ?? []) out.add(p.look);
  }
  return [...out];
}

export type { StatId };
