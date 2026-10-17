// 런 로그 구조 (GDD 9장). 히든 등급·태그 조건이 나중에 이 기록을 읽는다.
// 지금은 구조만 있고 기록하는 로직은 없다. 필드를 빼지 말고, 필요하면 더한다.

import type { TileRole } from './faction';

export interface AbsorbRecord {
  runId: number;
  /** 적 종족 (src/data/enemies 의 id) */
  enemyId: string;
  /** 흡수한 계통 id (임시 데이터면 provisional 계통) */
  lineageId: string;
  rare: boolean;
  /** 흡수했는가(false = 놓아줌) */
  absorbed: boolean;
}

export interface LineageRecord {
  lineageId: string;
  completed: boolean;
  /** 상극 조합을 시도했는가 */
  conflictingTried: boolean;
}

export interface RiskRecord {
  /** 역대 리스크 게이지 최고치 */
  peak: number;
  /** 한계 돌파 횟수 */
  breakthroughs: number;
  /** 돌파 후 생존 횟수 */
  survivedBreakthroughs: number;
}

export interface BattleRecord {
  runId: number;
  lap: number;
  turns: number;
  /** 타일 종류별 매칭 횟수 (비율은 여기서 계산) */
  matchesByRole: Record<TileRole, number>;
  won: boolean;
  /** 사용한 기술(특성) id */
  skillsUsed: string[];
  /** 적 등급 (일반/강적 등) */
  enemyClass: string;
  /** 이 전투 때 머물던 육성 단계(0부터) */
  tierIndex: number;
  /** P1 에서 더한 필드 (세이브 형식 2) */
  enemyId: string;
  /** 어느 종족으로 치렀는가 */
  factionId: string;
  /** 전투 난수 시드(같은 시드 = 같은 전투) */
  seed: number;
  /** 공허 매칭으로 오른 리스크 값 (게이지 반영은 P3) */
  riskGained: number;
  /** 흡수 타일 매칭 누적 (흡수 판정은 P3) */
  absorbGained: number;
  /** 패배 사유: hp = 체력 0, timeout = 턴 초과. 승리면 null */
  lossReason: 'hp' | 'timeout' | null;
}

export interface TierRecord {
  /** 건너뛴 단계가 있는가 */
  skipped: boolean;
  /** 특정 단계에 머문 채 격파한 적 등급 기록: 단계 index → 적 등급 목록 */
  defeatedWhileAtTier: Record<number, string[]>;
}

export interface RankChangeRecord {
  at: number;
  titleId: string;
  kind: 'gained' | 'lost' | 'regained';
}

export interface RunRecord {
  runId: number;
  laps: number;
  outcome: 'returned' | 'defeated';
  /** 획득한 것 / 잃은 것 (마지막 바퀴 손실 등) id 목록 */
  gained: string[];
  lost: string[];
  /** P2 에서 더한 필드 (세이브 형식 3): 끝난 이유, 시드, 종족 */
  endReason: 'returned' | 'forced-max-laps' | 'battle-lost' | 'exhausted';
  seed: number;
  factionId: string;
}

export interface RunLog {
  absorbs: AbsorbRecord[];
  lineages: LineageRecord[];
  risk: RiskRecord;
  battles: BattleRecord[];
  tiers: TierRecord;
  rankChanges: RankChangeRecord[];
  runs: RunRecord[];
}

export function emptyRunLog(): RunLog {
  return {
    absorbs: [],
    lineages: [],
    risk: { peak: 0, breakthroughs: 0, survivedBreakthroughs: 0 },
    battles: [],
    tiers: { skipped: false, defeatedWhileAtTier: {} },
    rankChanges: [],
    runs: [],
  };
}
