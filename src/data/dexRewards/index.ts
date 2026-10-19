// 도감 보상 (GDD 24-3, 표·보상 provisional): 진화체 도감·칭호 도감 등록 수가 이정표에 닿으면 먹이·영옥(꾸밈 재화 — 한 번만 받는 달성 보상, v5.11)을 조금 준다.
// 튜토리얼 보상(23-3)과 같은 틀 — 판정·지급은 game.ts claimDexRewards, 토스트는 tutorialGoalsView 의 같은 토스트.
import { FOOD_IDS, type FoodId } from '../../engine/faction';
import raw from './milestones.json';

export const DEX_KINDS = ['forms', 'titles'] as const;
export type DexKind = (typeof DEX_KINDS)[number];

export interface DexReward {
  food?: Partial<Record<FoodId, number>>;
  jade?: number;
}

export interface DexMilestoneDef {
  id: string;
  dex: DexKind;
  /** 이 도감의 등록 수가 이 값 이상이면 받는다 */
  count: number;
  reward: DexReward;
}

export function parseDexMilestone(r: unknown): DexMilestoneDef {
  const m = (r ?? {}) as Record<string, unknown>;
  const errors: string[] = [];
  if (typeof m.id !== 'string' || !m.id) errors.push('id');
  if (!(DEX_KINDS as readonly unknown[]).includes(m.dex)) errors.push(`dex: ${DEX_KINDS.join(' | ')}`);
  if (!Number.isInteger(m.count) || (m.count as number) < 1) errors.push('count: 1 이상 정수');
  const rw = (m.reward ?? {}) as Record<string, unknown>;
  const food = (rw.food ?? {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(food)) if (!(FOOD_IDS as readonly string[]).includes(k) || !(Number.isInteger(v) && (v as number) > 0)) errors.push(`reward.food.${k}: 먹이 종류와 양의 정수`);
  if (rw.jade !== undefined && !(Number.isInteger(rw.jade) && (rw.jade as number) > 0)) errors.push('reward.jade: 양의 정수');
  if (Object.keys(food).length === 0 && rw.jade === undefined) errors.push('reward: 먹이나 영옥 하나 이상');
  if (errors.length > 0) throw new Error(`도감 보상 데이터 오류 (${String(m.id ?? '?')}): ${errors.join(', ')}`);
  return { id: m.id as string, dex: m.dex as DexKind, count: m.count as number, reward: { food: food as DexReward['food'], ...(rw.jade !== undefined ? { jade: rw.jade as number } : {}) } };
}

export const DEX_MILESTONES: readonly DexMilestoneDef[] = raw.milestones.map(parseDexMilestone);
export const DEX_MILESTONES_PROVISIONAL: boolean = raw.provisional;
/** 도감 이름 (토스트 문구) */
export const DEX_LABEL: Record<DexKind, string> = { forms: '진화체 도감', titles: '칭호 도감' };

/** 지금 등록 수로 새로 닿은 이정표 (표 순서) */
export function newlyReachedMilestones(defs: readonly DexMilestoneDef[], claimedIds: readonly string[], counts: Record<DexKind, number>): DexMilestoneDef[] {
  return defs.filter((d) => !claimedIds.includes(d.id) && counts[d.dex] >= d.count);
}
