// 도전의 탑 (GDD 36장, C.85): 원정과 따로, 한 층 = 전투 한 판. 1층부터 50층까지 차례로 올라간다. 종족 무관 — 이름·문구는 종족 설정 tower.
//  - 층 구성: 보통 층 = 일반 적, 5의 배수 = 강적, 10의 배수 = 보스(BALANCE tower.bossFloors). 적은 공유 적 테이블에서 층 번호를 시드로 고른다(같은 층 = 늘 같은 적)
//  - 세기: ★ = ⌈층 ÷ 10⌉, 같은 구간 안에서 층마다 +4%(32-1 10번 연속 클리어 배율처럼 체력·공격에 곱함), 마지막 층은 +20% 더
//  - 전투: 원정 전투 엔진 그대로(체력 가득 시작). 리스크·허기·컨디션은 바꾸지 않는다(세이브 쪽 recordTowerBattle). 흡수 없음
//  - 보상은 첫 클리어만: 골드 10 × ★, 5의 배수 먹이 1, 10의 배수 영옥 3 + 칭호, 50층 영옥 10 추가
import { BALANCE } from '../config/balance';
import { ENEMIES, scaleEnemy } from '../data/enemies';
import { getBoss, isBossId } from '../data/bosses';
import { chapterContent, STORY_CHAPTERS } from '../data/story';
import type { EnemyDef } from '../data/schema';
import { createCombat, type CombatParams, type CombatState } from './combat';
import { applyDifficultyToParams, clampDifficulty, difficultyEnemyScale } from './difficulty';
import { enemyPool, pickFromPool } from './enemyPool';
import { bossSetupOf } from './expedition';
import type { FoodId } from './faction';
import { createRng } from './rng';
import type { RunLog } from './runLog';

const TX = BALANCE.provisional.tower;

/** 탑 꼭대기 층 */
export const TOWER_FLOORS: number = TX.floors;

export type TowerFloorKind = 'normal' | 'elite' | 'boss';

export interface TowerReward {
  gold: number;
  /** 먹이 1개 (강적 층) */
  food: FoodId | null;
  jade: number;
  /** 보스 층 칭호 id ("tower-10" …) */
  titleId: string | null;
}

export interface TowerFloor {
  floor: number;
  star: number;
  kind: TowerFloorKind;
  /** 보스 층이면 보스 id (없는 id 는 fallbackBoss 로 이어 둔 결과) */
  bossId: string | null;
  /** 이 층이 꼭대기인가 (보스 이름은 종족 설정 tower.finalBossName) */
  final: boolean;
  /** 층 배율 (체력·공격, ★ 배율과 곱함) */
  floorMult: number;
  /** ★·층 배율을 입힌 전투용 적 정의 */
  enemy: EnemyDef;
  reward: TowerReward;
}

/** 층 번호 보정: 정수 1~TOWER_FLOORS */
export function clampFloor(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(TOWER_FLOORS, Math.max(1, Math.floor(n)));
}

/** 층의 ★ = ⌈층 ÷ 구간⌉ (1~10층 ★1 … 41~50층 ★5) */
export function towerStar(floor: number): number {
  return clampDifficulty(Math.ceil(clampFloor(floor) / TX.bandSize));
}

/** 층 배율 = 1 + 구간 안 순서(0부터) × perFloorInBand, 꼭대기 층은 × (1 + finalFloorBonus), 강적 층은 × eliteScale */
export function towerFloorMultiplier(floor: number): number {
  const n = clampFloor(floor);
  const inBand = (n - 1) % TX.bandSize;
  const elite = towerFloorKind(n) === 'elite' ? TX.eliteScale : 1;
  return (1 + inBand * TX.perFloorInBand) * (n === TOWER_FLOORS ? 1 + TX.finalFloorBonus : 1) * elite;
}

export function towerFloorKind(floor: number): TowerFloorKind {
  const n = clampFloor(floor);
  if (n % TX.bossEvery === 0) return 'boss';
  if (n % TX.eliteEvery === 0) return 'elite';
  return 'normal';
}

/** 보스 층의 보스 id: 설정한 보스가 보스 테이블에 없으면 fallbackBoss (C.85 — 다른 패치가 보스를 더하면 저절로 이어진다) */
export function towerBossId(floor: number): string | null {
  const n = clampFloor(floor);
  if (towerFloorKind(n) !== 'boss') return null;
  const want = TX.bossFloors[n];
  return want && isBossId(want) ? want : TX.fallbackBoss;
}

/** 보스 층 칭호 id */
export function towerTitleId(floor: number): string | null {
  const n = clampFloor(floor);
  return towerFloorKind(n) === 'boss' ? `tower-${n}` : null;
}

/** 이 층의 적(★·층 배율 전): 보스 = 보스 데이터, 아니면 그 등급의 출현 풀에서 층 번호를 시드로 하나 */
export function towerBaseEnemy(floor: number): EnemyDef {
  const n = clampFloor(floor);
  const boss = towerBossId(n);
  if (boss) return getBoss(boss).enemy;
  const cls = towerFloorKind(n) === 'elite' ? 'elite' : 'normal';
  // 바퀴 제한 없이 그 등급 전부 (패턴 종류 가중치 그대로)
  return pickFromPool(createRng(n * 7919 + 17), enemyPool(cls, Number.MAX_SAFE_INTEGER));
}

/** 첫 클리어 보상 */
export function towerReward(floor: number): TowerReward {
  const n = clampFloor(floor);
  const kind = towerFloorKind(n);
  const R = TX.reward;
  return {
    gold: R.goldPerStar * towerStar(n),
    food: kind === 'elite' ? (R.eliteFood as FoodId) : null,
    jade: (kind === 'boss' ? R.bossJade : 0) + (n === TOWER_FLOORS ? R.finalJade : 0),
    titleId: towerTitleId(n),
  };
}

/** 층 하나의 모든 것 */
export function towerFloor(floor: number): TowerFloor {
  const n = clampFloor(floor);
  const star = towerStar(n);
  const kind = towerFloorKind(n);
  const floorMult = towerFloorMultiplier(n);
  // ★ 배율: 보스는 스토리처럼 'normal' 로(강적 입문 보정 없음), 강적은 등급대로
  const k = difficultyEnemyScale(star, kind === 'boss' ? 'normal' : kind);
  const enemy = scaleEnemy(towerBaseEnemy(n), { hp: k.hp * floorMult, attack: k.attack * floorMult });
  return { floor: n, star, kind, bossId: towerBossId(n), final: n === TOWER_FLOORS, floorMult, enemy, reward: towerReward(n) };
}

/** 지금 도전할 층 = 깬 최고 층 + 1 (꼭대기를 깼으면 null) */
export function nextTowerFloor(best: number): number | null {
  const b = Math.max(0, Math.floor(Number.isFinite(best) ? best : 0));
  return b >= TOWER_FLOORS ? null : b + 1;
}

/** 탑 전투를 만든다: 전투 파라미터(빌드·진화·안정)는 부르는 쪽이 채우고, 여기서는 ★ 기준 능력치·체력 가득·보스 재료만 */
export function createTowerCombat(f: TowerFloor, params: Partial<CombatParams>, seed: number): CombatState {
  applyDifficultyToParams(params, f.star);
  params.playerStartHpFraction = 1;
  return createCombat(seed, { enemy: f.enemy, params, ...(f.bossId ? { boss: bossSetupOf(f.bossId) } : {}) });
}

/** 탑을 여는 보스 = 스토리 첫 장의 보스 (종족별 스토리 데이터에서) */
export function towerUnlockBossId(factionId: string): string | null {
  const first = STORY_CHAPTERS[0];
  if (!first) return null;
  return chapterContent(factionId, first.id)?.episodes.find((e) => e.boss)?.boss?.id ?? null;
}

/** 탑이 열렸나 (GDD 36장 2번): 이 트랙이 스토리 첫 장 보스를 이긴 적이 있다. 이미 한 층이라도 깼으면 열린 것으로 */
export function towerOpen(log: Pick<RunLog, 'bossBattles'>, factionId: string, best = 0): boolean {
  if (best > 0) return true;
  const boss = towerUnlockBossId(factionId);
  return boss !== null && (log.bossBattles ?? []).some((b) => b.won && b.bossId === boss);
}
