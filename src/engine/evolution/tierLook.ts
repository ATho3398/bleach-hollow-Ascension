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

/** 표에 나오는 모든 외형 id (검증·테스트용) */
export function tierLookIds(faction: Pick<FactionConfig, 'tierLooks'>): string[] {
  const out = new Set<string>();
  for (const t of Object.values(faction.tierLooks ?? {})) {
    for (const s of STAT_IDS) if (t.stat[s]) out.add(t.stat[s]!);
    for (const p of t.pairs ?? []) out.add(p.look);
  }
  return [...out];
}

export type { StatId };
