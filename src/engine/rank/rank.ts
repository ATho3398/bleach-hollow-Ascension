// 등급전 (GDD 21장): 번호 10개(No.1 ~ No.10) 사다리. 엔진은 번호만 다루고 표시 이름은 종족 설정 rankNames 에서 읽는다 (종족 분기 없음).
// 사다리 = 번호 순서의 참가자 목록(번호 보유자 NPC 10명 + 플레이어). 앞 10칸이 No.1~No.10, 11번째 칸이 무번호.
//  - 도전: 바로 위 1칸만 (무번호면 No.10). 이기면 그 번호를 뺏고 상대는 한 칸 내려간다(자리 맞바꿈).
//  - 지면 한 칸 하락(바로 아래 참가자와 자리 맞바꿈). No.10 에서 지면 무번호. 무번호에서 지면 그대로.
//  - 진 상대에게 재도전은 다음 원정을 한 번 다녀온 뒤 (원정 수로 센다).
// 등급 이력(한 번이라도 번호를 단 적 있음)은 history 에 따로 둔다: 환생(GDD 22-1)이 ladder 는 초기화해도 history 는 유지한다 (22-2 해방 자격).

import { BALANCE } from '../../config/balance';
import { RANK_COUNT, RANK_HOLDERS } from '../../data/ranks';

/** 사다리에서 플레이어를 가리키는 id */
export const PLAYER_ID = 'player';

/** 등급 이력 (영구, 환생해도 유지할 자리): 해방 자격(GDD 22-2)·히든 조건이 읽는다 */
export interface RankHistory {
  /** 한 번이라도 번호를 단 적 있는가 */
  everRanked: boolean;
  /** 지금까지 가장 높은 번호 (1 이 맨 위). 없으면 null */
  best: number | null;
  /** 처음 번호를 단 시각(ms) */
  firstRankedAt: number | null;
}

export interface RankState {
  /** 번호 순서의 참가자 id (길이 RANK_COUNT + 1). [0] = No.1 … [RANK_COUNT-1] = No.10, [RANK_COUNT] = 무번호 */
  ladder: string[];
  /** 진 상대 id → 진 시점의 원정 수. 원정 수가 이 값 + rematchAfterRuns 이상이면 다시 도전할 수 있다 */
  lostTo: Record<string, number>;
  wins: number;
  losses: number;
  history: RankHistory;
}

export function newRankHistory(): RankHistory {
  return { everRanked: false, best: null, firstRankedAt: null };
}

/** 새 사다리: NPC 는 처음 번호 순, 플레이어는 무번호 */
export function newRankState(history: RankHistory = newRankHistory()): RankState {
  return { ladder: [...RANK_HOLDERS.map((h) => h.id), PLAYER_ID], lostTo: {}, wins: 0, losses: 0, history: { ...history } };
}

/** 환생(GDD 22-1)용: 사다리·전적은 처음으로, 등급 이력은 유지 */
export function resetRankKeepHistory(r: RankState): RankState {
  return newRankState(r.history);
}

/** 등급전이 열렸는가: 아란칼(5단계) 이상 */
export function rankUnlocked(tierIndex: number): boolean {
  return tierIndex >= BALANCE.rank.unlockTierIndex;
}

/** 참가자의 지금 번호 (1~10), 무번호면 null */
export function rankOf(r: RankState, id: string = PLAYER_ID): number | null {
  const i = r.ladder.indexOf(id);
  return i >= 0 && i < RANK_COUNT ? i + 1 : null;
}

/** 번호 n(1~10)의 보유자 id */
export function holderAt(r: RankState, n: number): string | undefined {
  return r.ladder[n - 1];
}

/** 지금 도전할 상대: 바로 위 1칸의 보유자 id (No.1 이면 null) */
export function challengeTarget(r: RankState): { opponentId: string; targetRank: number } | null {
  const i = r.ladder.indexOf(PLAYER_ID);
  if (i <= 0) return null;
  return { opponentId: r.ladder[i - 1]!, targetRank: i };
}

export type ChallengeBlock = 'locked' | 'top' | 'rematch';

/** 도전할 수 있는가. 막히면 이유: locked = 아란칼 전, top = 이미 No.1, rematch = 진 상대 재도전 대기(다음 원정 후) */
export function canChallenge(r: RankState, tierIndex: number, runsCompleted: number): { ok: true; opponentId: string; targetRank: number } | { ok: false; reason: ChallengeBlock; opponentId?: string } {
  if (!rankUnlocked(tierIndex)) return { ok: false, reason: 'locked' };
  const t = challengeTarget(r);
  if (!t) return { ok: false, reason: 'top' };
  const lost = r.lostTo[t.opponentId];
  if (lost !== undefined && runsCompleted < lost + BALANCE.rank.rematchAfterRuns) return { ok: false, reason: 'rematch', opponentId: t.opponentId };
  return { ok: true, ...t };
}

export interface ChallengeResult {
  opponentId: string;
  won: boolean;
  /** 도전 전·후 내 번호 (무번호 null) */
  before: number | null;
  after: number | null;
  /** 상대의 전·후 번호 */
  opponentBefore: number | null;
  opponentAfter: number | null;
  /** 이번에 처음 번호를 달았는가 (등급 이력이 생김) */
  firstRanked: boolean;
}

function swap(ladder: string[], i: number, j: number): void {
  const t = ladder[i]!;
  ladder[i] = ladder[j]!;
  ladder[j] = t;
}

/** 도전 결과를 사다리에 반영한다. 도전 가능 여부는 부르는 쪽이 canChallenge 로 먼저 본다 */
export function applyChallenge(r: RankState, won: boolean, runsCompleted: number, nowMs: number = Date.now()): ChallengeResult {
  const t = challengeTarget(r);
  if (!t) throw new Error('도전할 상대가 없다 (이미 No.1)');
  const before = rankOf(r);
  const opponentBefore = rankOf(r, t.opponentId);
  const i = r.ladder.indexOf(PLAYER_ID);
  let firstRanked = false;
  if (won) {
    swap(r.ladder, i, i - 1);
    r.wins++;
    delete r.lostTo[t.opponentId];
    const now = rankOf(r)!;
    if (!r.history.everRanked) {
      r.history.everRanked = true;
      r.history.firstRankedAt = nowMs;
      firstRanked = true;
    }
    r.history.best = r.history.best === null ? now : Math.min(r.history.best, now);
  } else {
    if (i < RANK_COUNT) swap(r.ladder, i, i + 1); // 무번호(i = RANK_COUNT)면 더 내려갈 곳이 없다
    r.losses++;
    r.lostTo[t.opponentId] = runsCompleted;
  }
  return { opponentId: t.opponentId, won, before, after: rankOf(r), opponentBefore, opponentAfter: rankOf(r, t.opponentId), firstRanked };
}

/** 세이브에서 읽은 값을 고친다: 모르는 id·빠진 NPC·중복이 있으면 남은 순서를 지키며 다시 채운다 */
export function sanitizeRankState(raw: unknown): RankState {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<RankState>;
  const known = new Set([...RANK_HOLDERS.map((h) => h.id), PLAYER_ID]);
  const ladder: string[] = [];
  for (const id of Array.isArray(r.ladder) ? r.ladder : []) if (typeof id === 'string' && known.has(id) && !ladder.includes(id)) ladder.push(id);
  for (const h of RANK_HOLDERS) if (!ladder.includes(h.id)) ladder.splice(Math.min(ladder.length, h.rank - 1), 0, h.id);
  if (!ladder.includes(PLAYER_ID)) ladder.push(PLAYER_ID);
  const h = (r.history ?? {}) as Partial<RankHistory>;
  const best = typeof h.best === 'number' && h.best >= 1 && h.best <= RANK_COUNT ? h.best : null;
  const lostTo: Record<string, number> = {};
  for (const [k, v] of Object.entries(r.lostTo ?? {})) if (known.has(k) && typeof v === 'number') lostTo[k] = v;
  return {
    ladder,
    lostTo,
    wins: typeof r.wins === 'number' ? r.wins : 0,
    losses: typeof r.losses === 'number' ? r.losses : 0,
    history: { everRanked: h.everRanked === true || best !== null, best, firstRankedAt: typeof h.firstRankedAt === 'number' ? h.firstRankedAt : null },
  };
}
