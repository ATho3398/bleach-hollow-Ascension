// 런 로그 구조 (GDD 9장). 히든 등급·태그 조건이 나중에 이 기록을 읽는다.
// 지금은 구조만 있고 기록하는 로직은 없다. 필드를 빼지 말고, 필요하면 더한다.

import type { Accumulation } from './evolution/select';

export interface AbsorbRecord {
  runId: number;
  /** 적 종족 (src/data/enemies 의 id) */
  enemyId: string;
  /** 흡수한 계통 id (임시 데이터면 provisional 계통) */
  lineageId: string;
  rare: boolean;
  /** 흡수했는가(false = 놓아줌) */
  absorbed: boolean;
  /** P3 에서 더한 필드 (세이브 형식 4): 얻은 특성 id(없으면 null), 몇 바퀴째 */
  traitId: string | null;
  lap: number;
}

export interface LineageRecord {
  lineageId: string;
  completed: boolean;
  /** 상극 조합을 시도했는가 (상극 규칙은 미정이라 지금은 항상 false) */
  conflictingTried: boolean;
  /** P3 에서 더한 필드 (세이브 형식 4): 처음 완성한 원정 runId */
  firstCompletedRunId?: number;
}

export interface RiskRecord {
  /** 역대 리스크 게이지 최고치 */
  peak: number;
  /** 한계 돌파 횟수 */
  breakthroughs: number;
  /** 돌파 후 생존 횟수 */
  survivedBreakthroughs: number;
}

/** 매치3 시절(형식 4까지) 타일 역할 키. 전투 v2(C.6) 이후 기록은 모두 0 (호환용) */
export const LEGACY_TILE_ROLES = ['damage', 'spirit', 'shield', 'absorb', 'risk'] as const;
export type LegacyTileRole = (typeof LEGACY_TILE_ROLES)[number];

export function emptyLegacyMatches(): Record<LegacyTileRole, number> {
  return { damage: 0, spirit: 0, shield: 0, absorb: 0, risk: 0 };
}

/** 마무리 일격(적을 쓰러뜨린 공격) 종류 (C.6) */
export type FinisherKind = 'basic-attack' | 'skill' | 'special' | 'void' | 'reflect' | 'stored' | 'combo';

export interface BattleRecord {
  runId: number;
  lap: number;
  /** 매치3 턴 수. 전투 v2(C.6) 이후는 0 — 길이는 durationSeconds */
  turns: number;
  /** 매치3 타일 종류별 매칭 횟수. 전투 v2(C.6) 이후는 모두 0 (호환용) */
  matchesByRole: Record<LegacyTileRole, number>;
  won: boolean;
  /** 사용한 기술(특성) id. C.6 부터 사용한 스킬 블록의 특성 id (기본 블록은 basic-skill), 사용 순서대로 */
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
  /** 리스크 게이지 상승량: C.6 부터 공허 블록 사용으로 오른 값(게이지 단위) */
  riskGained: number;
  /** 매치3 흡수 타일 매칭 누적. 전투 v2(C.6) 이후는 0 (흡수 조건이 바뀜) */
  absorbGained: number;
  /** 패배 사유: hp = 체력 0, timeout = 시간 제한(C.6 부터 초). 승리면 null */
  lossReason: 'hp' | 'timeout' | null;
  /** C.6 에서 더한 필드 (세이브 형식 5, 전투 v2) */
  /** 전투 시간(초) */
  durationSeconds: number;
  /** 블록 사용 횟수: 특성 id 별(기본 블록 basic-skill), 체인 단계별([체인1, 체인2, 체인3]) */
  blocksByTrait: Record<string, number>;
  blocksByChain: [number, number, number];
  /** 체인3 발동 횟수 */
  chain3Count: number;
  /** C.34 에서 더한 필드 (세이브 형식 12, 체인 계열 개편 GDD 17-3): 계열별 체인 발동 횟수(계열 id → [체인1, 체인2, 체인3]), 콤보 발동(특수 블록 생성) 횟수, 콤보 블록 사용 횟수. 옛 기록은 빈 객체/0 */
  chainsByFamily: Record<string, [number, number, number]>;
  combosTriggered: number;
  comboBlocksUsed: number;
  /** 강공격을 막기(guard)로 막은 횟수 */
  guardSuccesses: number;
  /** 공허 블록 사용 횟수 */
  voidUsed: number;
  /** 필살 블록을 썼는가 */
  specialUsed: boolean;
  /** 마무리 일격: 종류와 그 블록의 특성·계통 (스킬 블록이 아니면 null). 패배면 kind 도 null */
  finisherKind: FinisherKind | null;
  finisherTraitId: string | null;
  finisherLineageId: string | null;
  /** 이 전투로 흡수 조건을 채웠는가 (마무리 일격이 약점 계통 스킬 / 약점 계통 체인3 1회 이상 / 첫 흡수 보장) */
  absorbable: boolean;
  /** C.17 에서 더한 필드 (세이브 형식 10, 저장형 필살기): 사용 횟수, 충전 낭비(상한에서 버려진 게이지). 옛 기록은 0 */
  storedUsed: number;
  storedWasted: number;
}

/** 진화 1회 기록 (GDD 4-2, 9장): 히든 조건이 나중에 읽는다. C.11 에서 단계별 진화체 테이블 구조로 바뀌었다 */
export interface EvolutionRecord {
  fromTier: number;
  toTier: number;
  /** C.11: 진화 전 진화체 id (1→2단계 진화면 null) */
  fromFormId: string | null;
  /** C.11: 진화한 진화체 id (src/data/evolution) */
  toFormId: string;
  /** 진화 순간의 현재 단계 계통별 누적 스냅샷 */
  accumulation: Accumulation;
  /** 진화한 시각(ms) */
  at: number;
  /** C.9 호환용 = toFormId. 새 기록에도 채운다 */
  formId: string;
  /** C.9 필드(조합 키, 진화 순간의 안정 수치): 의미가 사라져 새 기록에서는 비운다. C.9 기록에만 있다 */
  comboKey?: string;
  stability?: number;
}

export interface TierRecord {
  /** 건너뛴 단계가 있는가 */
  skipped: boolean;
  /** 진화 기록 (C.9) */
  evolutions: EvolutionRecord[];
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
  /** P3 에서 더한 필드 (세이브 형식 4): 얻은/잃은 새 특성, 이 원정의 리스크 최고치, 한계 돌파 여부 */
  gainedTraits: string[];
  lostTraits: string[];
  riskPeak: number;
  breakthrough: boolean;
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
    tiers: { skipped: false, evolutions: [], defeatedWhileAtTier: {} },
    rankChanges: [],
    runs: [],
  };
}
