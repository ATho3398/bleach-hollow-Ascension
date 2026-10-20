// 런 로그 구조 (GDD 9장). 히든 등급·태그 조건이 나중에 이 기록을 읽는다.
// 지금은 구조만 있고 기록하는 로직은 없다. 필드를 빼지 말고, 필요하면 더한다.

import type { EvolutionSnapshot } from './evolution/judge';

export interface AbsorbRecord {
  runId: number;
  /** 적 종족 (src/data/enemies 의 id) */
  enemyId: string;
  /** 흡수한 적의 속성 id (C.47, 세이브 형식 14). 그 전 기록은 null */
  element: string | null;
  /** 옛 흡수 계통 id (형식 13 까지의 기록에만 있다. C.47 에서 계통이 속성으로 바뀜) */
  lineageId?: string;
  rare: boolean;
  /** 흡수했는가(false = 놓아줌) */
  absorbed: boolean;
  /** P3 에서 더한 필드 (세이브 형식 4): 얻은 특성 id(없으면 null), 몇 바퀴째 */
  traitId: string | null;
  lap: number;
  /** C.60 (세이브 형식 24, GDD 25-9): 이 흡수에서 다시 뽑기권으로 후보를 다시 뽑았나 (옛 기록은 없음 = false) */
  rerolled?: boolean;
}

/** 슬롯 같은 속성 3개 완성 기록 (GDD 4-1 보너스). C.47 부터 lineageId 에는 속성 id 가 들어간다 (옛 기록은 계통 id) */
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
export type FinisherKind = 'basic-attack' | 'skill' | 'special' | 'void' | 'reflect' | 'stored' | 'combo' | 'dot' | 'liberation';

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
  /** C.47 (형식 14): 마무리 일격의 속성. 옛 기록은 null */
  finisherElement: string | null;
  /** 옛 필드(형식 13 까지): 마무리 일격의 계통 */
  finisherLineageId?: string | null;
  /** 이 전투로 흡수 조건을 채웠는가 (마무리 일격이 약점 계통 스킬 / 약점 계통 체인3 1회 이상 / 첫 흡수 보장) */
  absorbable: boolean;
  /** C.17 에서 더한 필드 (세이브 형식 10, 저장형 필살기): 사용 횟수, 충전 낭비(상한에서 버려진 게이지). 옛 기록은 0 */
  storedUsed: number;
  storedWasted: number;
  /** C.54 에서 더한 필드 (세이브 형식 18, 해방 GDD 22-5): 해방을 썼는가, 쓴 시각(전투 시작부터 초, 안 썼으면 null). 옛 기록은 false/null */
  liberationUsed: boolean;
  liberationAt: number | null;
  /** 치명타 횟수: 내 공격 / 적 공격 (C.63, GDD 28장 5번). 옛 기록은 없음 */
  crits?: number;
  enemyCrits?: number;
  /** 진화체 특성 발동 횟수 (C.89, GDD 39장 8번): 연타·되갚기·다시 일어남·연쇄·화상 */
  abilityProcs?: Partial<Record<'doubleHit' | 'thorns' | 'lastStand' | 'chainHaste' | 'burn', number>>;
}

/** 수련 한 판 기록 (GDD 22-5, 세이브 형식 18): 히든·태그 조건이 나중에 읽는다 */
export interface TrainingRecord {
  /** 시각(ms) */
  at: number;
  factionId: string;
  /** 종목 id (duel·dodge·clash·chain) */
  game: string;
  won: boolean;
  /** 그 판의 난이도 단계 (1~4) */
  level: number;
  /** 얻은 수련치 */
  points: number;
  /** 이 판으로 수련이 완료됐는가 */
  completedNow: boolean;
}

/** 환생 1회 기록 (GDD 22-1·22-7, 세이브 형식 20): 환생 히든·초월체(22-3 유하바하)·태그 조건이 읽는다 */
export interface RebirthRecord {
  /** 시각(ms) */
  at: number;
  /** 이 환생으로 몇 번째 환생이 되었나 (1부터) */
  count: number;
  factionId: string;
  /** 이전 생의 최종 진화체·단계(tierIndex)·속성 */
  prevFormId: string | null;
  prevTierIndex: number;
  prevElements: string[];
  /** 계승한 특성 (없으면 null) */
  keptTraitId: string | null;
  /** 새 생이 받은 계승 노력치 (정수) */
  carry: Record<string, number>;
  /** 환생까지 마친 원정 수 */
  runsCompleted: number;
}

/** 진화 1회 기록 (GDD 20-5, 9장): 히든 조건이 나중에 읽는다. C.11 단계별 진화체 테이블 → C.47 속성 트리 */
export interface EvolutionRecord {
  fromTier: number;
  toTier: number;
  /** C.11: 진화 전 진화체 id (1→2단계 진화면 null) */
  fromFormId: string | null;
  /** C.11: 진화한 진화체 id (src/data/evolution) */
  toFormId: string;
  /** C.47: 진화 순간의 단계 기록 스냅샷 (걸음·흡수 속성 분포·장착 속성/분류·돌보기 상태·후보와 가중치·고유 특성) */
  snapshot?: EvolutionSnapshot;
  /** C.11~C.46 기록: 진화 순간의 계통별 누적 (C.47 부터는 snapshot) */
  accumulation?: unknown;
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

/** 등급전 1회 기록 (GDD 21장, 세이브 형식 15): 이기든 지든 남긴다. 히든 등급·태그·해방 조건이 나중에 읽는다 */
export interface RankBattleRecord {
  /** 시각(ms) */
  at: number;
  /** 이 도전 때까지 마친 원정 수 (재도전 대기 판정과 같은 기준) */
  runsCompleted: number;
  /** 상대 번호 보유자 id (src/data/ranks) */
  opponentId: string;
  won: boolean;
  /** 도전 전·후 내 번호 (1 = 맨 위, 무번호 null) */
  rankBefore: number | null;
  rankAfter: number | null;
  /** 이 승리로 처음 번호를 달았는가 */
  firstRanked: boolean;
  /** 전투 시드·시간, 그때의 단계·진화체 */
  seed: number;
  durationSeconds: number;
  tierIndex: number;
  formId: string | null;
  /** C.75 (형식 29, GDD 32-1 7번): 상대 보유자의 난이도 ★. 옛 기록에는 없다 */
  difficulty?: number;
}

export interface RunRecord {
  runId: number;
  laps: number;
  outcome: 'returned' | 'defeated';
  /** 획득한 것 / 잃은 것 (마지막 바퀴 손실 등) id 목록 */
  gained: string[];
  lost: string[];
  /** P2 에서 더한 필드 (세이브 형식 3): 끝난 이유, 시드, 종족 */
  endReason: 'returned' | 'forced-max-laps' | 'battle-lost' | 'exhausted' | 'story-clear';
  seed: number;
  factionId: string;
  /** P3 에서 더한 필드 (세이브 형식 4): 얻은/잃은 새 특성, 이 원정의 리스크 최고치, 한계 돌파 여부 */
  gainedTraits: string[];
  lostTraits: string[];
  riskPeak: number;
  breakthrough: boolean;
  /** 사냥터 id (GDD 24-2, 세이브 형식 17). 형식 17 마이그레이션이 옛 기록을 기본 사냥터로 채운다 */
  groundId?: string;
  /** C.57 (세이브 형식 21, GDD 25-5 타일 변수): 발동한 인접 시너지 id(짝에 들어설 때마다), 바퀴 변이, 이벤트 타일 선택, 드래프트로 고른 타일, 지킨 골드(번 것 − 쓴 것).
   *  형식 21 마이그레이션이 옛 기록을 빈 목록·0 으로 채운다 */
  synergies?: string[];
  mutations?: { id: string; lap: number }[];
  events?: { event: string; choice: string; lap: number }[];
  drafts?: { tileId: string; lap: number }[];
  gold?: number;
  /** C.58 (세이브 형식 22, GDD 25-4): 스토리 화로 떠난 원정이면 그 장·화와 목표를 이뤘는가. 자유 원정은 없음 */
  story?: { chapterId: string; episodeId: string; cleared: boolean };
  /** C.75 (세이브 형식 29, GDD 32-1 8번): 이 원정의 난이도 ★ (1~5). 형식 29 이전 기록에는 없다(그때는 적이 내 단계 기준이었다 — 채우지 않는다) */
  difficulty?: number;
  /** C.75 (GDD 32-1 10번): 출발 때 적용된 같은 ★ 연속 클리어 수 (0~10). 스토리 화는 0 */
  streak?: number;
}

/** 보스전 1회 기록 (GDD 25-3, 세이브 형식 22): 이기든 지든 남긴다. 보스 칭호·히든 조건이 읽는다 */
export interface BossBattleRecord {
  /** 시각(ms) */
  at: number;
  runId: number;
  factionId: string;
  bossId: string;
  won: boolean;
  /** 이 판이 그 보스 첫 처치였나 */
  firstKill: boolean;
  durationSeconds: number;
  /** 닿은 페이즈(1부터)·기믹으로 봉인된 블록 수·패배 사유 */
  phase: number;
  seals: number;
  lossReason: 'hp' | 'timeout' | null;
  tierIndex: number;
  /** 스토리 화 키 ("ch1/ep4"). 자유 원정 등장이면 null */
  episode: string | null;
  /** 어디서 싸웠나 (GDD 37장 6번, C.86): story = 스토리 화, free = 자유 원정 등장. C.86 전 기록은 없음(= story) */
  source?: 'story' | 'free';
  /** 그 원정 난이도 ★ (C.86 부터) */
  difficulty?: number;
}

/** 스토리 화 1회 기록 (GDD 25-4, 세이브 형식 22): 깨든 못 깨든 남긴다 */
export interface StoryRunRecord {
  at: number;
  runId: number;
  factionId: string;
  chapterId: string;
  episodeId: string;
  cleared: boolean;
  /** 처음 깬 판인가 */
  firstClear: boolean;
  /** 이 판으로 장을 처음 다 깼나 */
  chapterCleared: boolean;
  tierIndex: number;
}

/** 도전의 탑 전투 1회 기록 (GDD 36장 10번, C.85): 이기든 지든 남긴다 — 히든 조건·탑 칭호가 읽는다 */
export interface TowerBattleRecord {
  at: number;
  factionId: string;
  floor: number;
  /** 그 층의 ★ */
  star: number;
  /** 적 id (보스 층은 보스 id) */
  enemyId: string;
  bossId: string | null;
  won: boolean;
  durationSeconds: number;
  tierIndex: number;
  formId: string | null;
  /** 이 판이 그 층 첫 클리어였나 (보상을 받은 판) */
  firstClear: boolean;
}

export interface RunLog {
  absorbs: AbsorbRecord[];
  lineages: LineageRecord[];
  risk: RiskRecord;
  battles: BattleRecord[];
  tiers: TierRecord;
  rankChanges: RankChangeRecord[];
  /** 등급전 기록 (C.49, 세이브 형식 15) */
  rankBattles: RankBattleRecord[];
  runs: RunRecord[];
  /** 수련 기록 (C.54, 세이브 형식 18) */
  trainings: TrainingRecord[];
  /** 환생 기록 (C.56, 세이브 형식 20) */
  rebirths: RebirthRecord[];
  /** 보스전·스토리 화 기록 (C.58, 세이브 형식 22) */
  bossBattles: BossBattleRecord[];
  storyRuns: StoryRunRecord[];
  /** 상점 구매 기록 (C.60, 세이브 형식 24, GDD 25-9): 한 번 살 때마다 */
  shopPurchases: ShopPurchaseRecord[];
  /** 도전의 탑 전투 기록 (C.85, 세이브 형식 30, GDD 36장) */
  towerBattles: TowerBattleRecord[];
  /** 합체 기록 — 저장은 슬롯 단위(SaveData.slotLog)이고, 칭호 평가 때만 이 자리에 넣어 읽는다 (C.59) */
  fusions?: FusionRecord[];
}

/** 상점 구매 1건 (GDD 25-9·9장, 세이브 형식 24): 시각·트랙 종족·품목 id·화폐·가격. 꾸밈 착용 변화는 남기지 않는다 */
export interface ShopPurchaseRecord {
  at: number;
  factionId: string;
  itemId: string;
  currency: 'gold' | 'jade';
  price: number;
}

/** 합체 기록의 캐릭터 한 명 요약 (GDD 22-3, C.59): 합체로 사라진 캐릭터가 어떤 몸이었나 */
export interface FusionCharacterSummary {
  factionId: string;
  tierIndex: number;
  formId: string | null;
  elements: string[];
  category: string;
  hidden: boolean;
  rebirths: number;
  /** 합체 순간의 번호 (1 = 맨 위) */
  rank: number | null;
  /** 마친 원정 수·이긴 강적 수 (그 캐릭터의 런 로그) */
  runs: number;
  elitesDefeated: number;
  evTotal: number;
}

/** 합체 기록 (GDD 22-3·9장, 세이브 형식 23): 슬롯 단위 — 캐릭터 트랙이 새로 시작해도 남는다 */
export interface FusionRecord {
  at: number;
  /** 이 슬롯의 몇 번째 합체 (1부터) */
  index: number;
  transcendentId: string;
  /** 조건이 맞아서 정해졌나 (false = 조건 맞는 미보유가 없어 표 아래쪽부터 채움) */
  matched: boolean;
  characters: FusionCharacterSummary[];
  soulSpent: number;
  jade: number;
}

/** 다른 종족 트랙이 열린 기록 (GDD 22-3, 형식 23) */
export interface TrackOpenRecord {
  at: number;
  /** 열린 트랙의 종족 */
  factionId: string;
  /** 연 캐릭터의 종족 (5단계에 닿은 쪽, 마이그레이션이면 그 세이브의 종족) */
  byFactionId: string;
}

/** 슬롯 단위 런 로그 (GDD 9장·22-3, 형식 23): 캐릭터 트랙마다의 RunLog 와 따로, 슬롯 하나에 하나 */
export interface SlotLog {
  fusions: FusionRecord[];
  trackOpens: TrackOpenRecord[];
}

export function emptySlotLog(): SlotLog {
  return { fusions: [], trackOpens: [] };
}

export function emptyRunLog(): RunLog {
  return {
    absorbs: [],
    lineages: [],
    risk: { peak: 0, breakthroughs: 0, survivedBreakthroughs: 0 },
    battles: [],
    tiers: { skipped: false, evolutions: [], defeatedWhileAtTier: {} },
    rankChanges: [],
    rankBattles: [],
    runs: [],
    trainings: [],
    rebirths: [],
    bossBattles: [],
    shopPurchases: [],
    storyRuns: [],
    towerBattles: [],
  };
}
