// 튜토리얼 보상 목표 (GDD 23-3, 목록·보상 provisional). 판정 종류(check)는 엔진(src/engine/tutorialGoals.ts)이, 문구는 {자리표시자}로 종족 설정에서 채운다.
// available: false = 아직 없는 시스템(수련·환생)의 목표. 목록에는 '준비 중'으로 보이고 판정·지급하지 않는다 — 그 기능이 구현될 때 켠다.
import { FOOD_IDS, type FoodId } from '../../engine/faction';
import raw from './goals.json';

export const TUTORIAL_CHECKS = ['tutorialSeen', 'returned', 'absorbed', 'chain3', 'evolved', 'eliteWin', 'tier5', 'ranked', 'training', 'rebirth'] as const;
export type TutorialCheck = (typeof TUTORIAL_CHECKS)[number];

/** 보상 = 먹이 (없을 수 있음 — 목표마다 영옥 +1 은 따로). 옛 영혼 결정 보상은 C.425 에 삭제 (GDD 12-3 v6.015: 붕옥 재료는 사냥·우라하라뿐) */
export interface TutorialReward {
  food?: Partial<Record<FoodId, number>>;
}

export interface TutorialGoalDef {
  id: string;
  check: TutorialCheck;
  /** 목표 문구 템플릿 (자리표시자 = 도움말과 같은 helpVars) */
  text: string;
  reward: TutorialReward;
  /** false 면 아직 없는 시스템이라 비활성 (기본 true) */
  available: boolean;
}

export function parseTutorialGoal(r: unknown): TutorialGoalDef {
  const g = (r ?? {}) as Record<string, unknown>;
  const errors: string[] = [];
  if (typeof g.id !== 'string' || !g.id) errors.push('id');
  if (!(TUTORIAL_CHECKS as readonly unknown[]).includes(g.check)) errors.push(`check: ${TUTORIAL_CHECKS.join(' | ')}`);
  if (typeof g.text !== 'string' || !g.text) errors.push('text');
  const rw = (g.reward ?? {}) as Record<string, unknown>;
  const food = (rw.food ?? {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(food)) if (!(FOOD_IDS as readonly string[]).includes(k) || !(Number.isInteger(v) && (v as number) > 0)) errors.push(`reward.food.${k}: 먹이 종류와 양의 정수`);
  if (rw.soulCrystals !== undefined) errors.push('reward.soulCrystals: 삭제됨 (C.425)');
  if (g.available !== undefined && typeof g.available !== 'boolean') errors.push('available: boolean');
  if (errors.length > 0) throw new Error(`튜토리얼 목표 데이터 오류 (${String(g.id ?? '?')}): ${errors.join(', ')}`);
  return { id: g.id as string, check: g.check as TutorialCheck, text: g.text as string, reward: { food: food as TutorialReward['food'] }, available: g.available !== false };
}

export const TUTORIAL_GOALS: readonly TutorialGoalDef[] = raw.goals.map(parseTutorialGoal);
export const TUTORIAL_GOALS_PROVISIONAL: boolean = raw.provisional;
