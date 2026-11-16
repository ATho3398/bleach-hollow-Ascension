// 수련장 훈련 인형 = 전투 안 설정 창 (GDD 8-9, C.471 — 사용자 2026-11-17 "전투 들어간 뒤에 훈련장 설정 있고 그 창에서 설정해서 나오는 식"):
// 테스트 전투 적 설정 창(17-4, C.457)과 같은 흐름. 창 칸: 적 종류 = 기본 훈련 인형 + 적 도감에서 본 적 / ★ = 연 난이도까지 /
// 체력·공격력(내 기본 공격 n회 분량)·공격 간격 / 공격함·안 함 / 죽음·무적. 테스트 전용(연속·탑 층·보스)은 없다. 종족 분기 없음.
import { ENEMIES, PRACTICE_DUMMY } from '../data/enemies';
import type { EnemyDef } from '../data/schema';
import { clampDifficulty, enemyAtDifficulty } from './difficulty';
import type { EnemyDex } from './enemyDex';
import { arenaStatsOf, withArenaStats, type TestArenaChoice } from './testMode';

export const PRACTICE_DUMMY_ID = PRACTICE_DUMMY.id;

/** 창의 적 목록: 기본 훈련 인형 → 적 도감에서 만난(seen ≥ 1) 일반·강적 (적 테이블 순서). includeTest = 테스트 모드면 테스트 적도 */
export function practiceFoes(dex: Readonly<EnemyDex> | null | undefined, includeTest = false): EnemyDef[] {
  return [PRACTICE_DUMMY, ...ENEMIES.filter((e) => (e.testOnly ? includeTest : (dex?.[e.id]?.seen ?? 0) > 0))];
}

/** ★ 를 1 ~ 연 ★ 안으로 */
export function practiceStar(star: number, maxStar: number): number {
  return Math.min(clampDifficulty(maxStar), clampDifficulty(star));
}

/** 그 적·★ 의 창 기본 수치 (없는 적이면 null) */
export function practiceArenaDefaults(foes: readonly EnemyDef[], foeId: string, star: number, maxStar: number): { hpAttacks: number; attackAttacks: number; attackSeconds: number } | null {
  const foe = foes.find((f) => f.id === foeId);
  return foe ? arenaStatsOf(enemyAtDifficulty(foe, practiceStar(star, maxStar))) : null;
}

/** 창 값 → 싸울 적 (★ 배율 다음, 넣은 체력·공격력으로). 목록에 없는 적이면 null */
export function practiceArenaEnemy(foes: readonly EnemyDef[], c: TestArenaChoice, maxStar: number): { enemy: EnemyDef; star: number; bossId: null } | null {
  const foe = foes.find((f) => f.id === c.foeId);
  if (!foe) return null;
  const star = practiceStar(c.star, maxStar);
  return { enemy: withArenaStats(enemyAtDifficulty(foe, star), c), star, bossId: null };
}
