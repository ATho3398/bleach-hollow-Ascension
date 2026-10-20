// 원정 난이도 ★ (GDD 32장, C.75): 적의 세기는 플레이어 단계가 아니라 난이도 ★1~★5 로 정한다. 종족 무관 — ★ 이름·문구는 종족 설정(difficulty)에서 읽는다.
//  - ★n 적 능력치 = n단계 기준 능력치(tierTotals[n-1] ÷ 6) × 적 성향. 체력·공격("기본 공격 N회분")은 그 난이도의 권장 단계 플레이어 기준이라 k = 기준 능력치 비만큼 같이 오른다
//  - ★n 은 n단계에 처음 닿으면 열린다(영구, 환생해도 유지). 기본 선택 = 내 단계(권장)
//  - 보상은 재화마다(11번): 먹이·노력치 ★당 rewardPerStar + 연속당, 골드 ★당 goldPerStar + 연속당(상한). 영옥 없음. 리스크는 그대로
//  - 연속 클리어(10번): 같은 ★ 자유 원정을 클리어할 때마다 다음 원정 적 +enemyPerClear(최대 maxClears), 지거나 ★를 바꾸면 0
import { BALANCE } from '../config/balance';
import { scaleEnemy } from '../data/enemies';
import type { EnemyDef, StatId } from '../data/schema';
import type { CombatParams } from './combat/combat';
import { refStatOf, worldRefStat } from './evolution/evolution';

const DX = BALANCE.provisional.difficulty;

/** ★ 최대 = 단계 수 */
export const MAX_DIFFICULTY: number = BALANCE.provisional.stats.tierTotals.length;

/** ★ 값 보정: 정수 1~MAX_DIFFICULTY */
export function clampDifficulty(star: number): number {
  if (!Number.isFinite(star)) return 1;
  return Math.min(MAX_DIFFICULTY, Math.max(1, Math.round(star)));
}

/** 그 단계(tierIndex, 0부터)의 권장 난이도 = 단계 번호 */
export function recommendedDifficulty(tierIndex: number): number {
  return clampDifficulty(tierIndex + 1);
}

/** 이 단계까지 닿은 몸이 연 ★ 최대 (n단계 = ★n) */
export function unlockedByTier(maxTierIndex: number): number {
  return clampDifficulty(maxTierIndex + 1);
}

/** ★n 의 적 기준 능력치 = n단계 기준 능력치 */
export function difficultyRefStat(star: number): number {
  return refStatOf(clampDifficulty(star) - 1);
}

/** k = ★n 기준 능력치 ÷ 세계 기준(★1 = 1) */
export function difficultyFactor(star: number): number {
  return difficultyRefStat(star) / worldRefStat();
}

/** ★n 적 체력·공격 배율 (바퀴 강화·사냥터와 곱한다) */
export function difficultyEnemyScale(star: number): { hp: number; attack: number } {
  const k = difficultyFactor(star);
  return { hp: 1 + (k - 1) * DX.hpGrowth, attack: 1 + (k - 1) * DX.attackGrowth };
}

/** 적 정의에 ★ 배율을 입힌다 (등급전·연습·튜토리얼처럼 원정 밖에서 바로 싸울 때) */
export function enemyAtDifficulty(enemy: EnemyDef, star: number): EnemyDef {
  return scaleEnemy(enemy, difficultyEnemyScale(star));
}

/** 전투 파라미터에 ★ 의 적 기준 능력치를 싣는다 (applyEvolutionToParams 뒤에 불러도, 앞에 불러도 된다) */
export function applyDifficultyToParams(params: Partial<CombatParams>, star: number): void {
  params.refStat = difficultyRefStat(star);
}

/** 연속 클리어 수 보정: 정수 0~maxClears */
export function clampStreak(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(DX.streak.maxClears, Math.max(0, Math.floor(n)));
}

/** 연속 클리어가 적에 곱하는 배율 (체력·공격 같이): 1 + 연속 × enemyPerClear (GDD 32-1 10번) */
export function streakEnemyFactor(streak: number): number {
  return 1 + clampStreak(streak) * DX.streak.enemyPerClear;
}

/** 먹이 굴림·흡수 노력치 보상 배율 = 1 + (★ − 1) × rewardPerStar + 연속 × foodPerClear (GDD 32-1 5·11번) */
export function difficultyRewardMultiplier(star: number, streak = 0): number {
  return 1 + (clampDifficulty(star) - 1) * DX.rewardPerStar + clampStreak(streak) * DX.streak.foodPerClear;
}

/** 골드 보상 배율 = 1 + (★ − 1) × goldPerStar + min(연속 × goldPerClear, goldMaxBonus) (GDD 32-1 11번: 재화 인플레 막기) */
export function difficultyGoldMultiplier(star: number, streak = 0): number {
  return 1 + (clampDifficulty(star) - 1) * DX.goldPerStar + Math.min(DX.streak.goldMaxBonus, clampStreak(streak) * DX.streak.goldPerClear);
}

/** 흡수 노력치에 보상 배율을 입힌다 (정수로 반올림, 0 은 0) */
export function scaleEv(ev: Partial<Record<StatId, number>>, star: number, streak = 0): Partial<Record<StatId, number>> {
  const m = difficultyRewardMultiplier(star, streak);
  const out: Partial<Record<StatId, number>> = {};
  for (const [k, v] of Object.entries(ev)) if (typeof v === 'number' && v > 0) out[k as StatId] = Math.round(v * m);
  return out;
}
