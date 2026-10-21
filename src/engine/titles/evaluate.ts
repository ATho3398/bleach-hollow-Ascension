// 칭호 조건 평가기 (GDD 14-7). 순수 함수: 런 로그·진화 기록·세이브 상태를 읽어 새로 충족된 칭호를 돌려준다.
// 종족 id 로 분기하지 않는다(종족 차이는 칭호 데이터의 이름 텍스트뿐).
import type { TitleCondition, TitleDef } from '../../data/schema';
import type { RunLog } from '../runLog';
import { BALANCE } from '../../config/balance';

/** 지금 상태 (런 로그에 없는 값, lineageStatTotal 조건이 읽는다 — GDD 49-8). 부르는 쪽(game.ts)이 채운다 */
export interface TitleLive {
  /** 거친 진화체들의 label.kind */
  lineageKinds: string[];
  /** 지금 단계 (1부터) */
  tier: number;
  /** 지금 능력치 6종 합계 */
  statTotal: number;
}

/** 해금 순간의 스냅샷 (영구 기록) */
export interface TitleSnapshot {
  runs: number;
  returned: number;
  defeated: number;
  absorbs: number;
  maxLap: number;
  tierIndex: number;
  formId: string | null;
  factionId: string;
}

export interface UnlockedTitle {
  titleId: string;
  /** 해금 시각(ms) */
  at: number;
  /** 어느 시점에 해금됐나 */
  trigger: TitleTrigger;
  snapshot: TitleSnapshot;
  /** 해금 알림을 보여 줬는가 */
  seen: boolean;
}

export type TitleTrigger = 'expedition' | 'evolution' | 'load' | 'rank' | 'training' | 'fusion' | 'tower';

/** 평가기가 읽는 세이브 상태 (SaveData 의 일부) */
export interface TitleEvalState {
  factionId: string;
  titles: UnlockedTitle[];
  evolution: { tierIndex: number; formId: string | null };
  /** 지금 상태 (없으면 lineageStatTotal 조건은 늘 거짓) */
  live?: TitleLive;
}

export function checkCondition(c: TitleCondition, log: RunLog, live?: TitleLive): boolean {
  switch (c.type) {
    case 'and':
      return c.all.every((x) => checkCondition(x, log, live));
    case 'or':
      return c.any.some((x) => checkCondition(x, log, live));
    case 'lineageStatTotal': {
      const need = BALANCE.provisional.stats.tierTotals[c.totalOfTier - 1];
      return live !== undefined && need !== undefined && live.lineageKinds.includes(c.lineageKind) && live.tier >= c.minTier && live.statTotal >= need;
    }
    case 'absorbCount':
      return log.absorbs.filter((a) => a.absorbed && (!c.element || a.element === c.element) && (!c.rareOnly || a.rare)).length >= c.min;
    case 'passedForm':
      return log.tiers.evolutions.some((e) => e.toFormId === c.formId || e.fromFormId === c.formId);
    case 'breakthroughs':
      return log.risk.breakthroughs >= c.min;
    case 'survivedBreakthroughs':
      return log.risk.survivedBreakthroughs >= c.min;
    case 'chain3Total':
      return log.battles.reduce((n, b) => n + (b.chain3Count ?? 0), 0) >= c.min;
    case 'guardTotal':
      return log.battles.reduce((n, b) => n + (b.guardSuccesses ?? 0), 0) >= c.min;
    case 'elitesDefeated':
      return log.battles.filter((b) => b.won && b.enemyClass === 'elite').length >= c.min;
    case 'runsReturned':
      return log.runs.filter((r) => r.outcome === 'returned').length >= c.min;
    case 'runsDefeated':
      return log.runs.filter((r) => r.outcome === 'defeated').length >= c.min;
    case 'maxLap':
      return log.runs.reduce((m, r) => Math.max(m, r.laps), 0) >= c.min;
    case 'defeatedAtTier':
      return log.battles.filter((b) => b.won && b.tierIndex === c.tier && (!c.enemyClass || b.enemyClass === c.enemyClass)).length >= c.min;
    case 'rankReached':
      return (log.rankBattles ?? []).some((r) => r.won && r.rankAfter !== null && r.rankAfter <= c.rank);
    case 'trainingCompleted':
      return (log.trainings ?? []).some((t) => t.completedNow);
    case 'bossDefeated':
      return (log.bossBattles ?? []).some((b) => b.won && b.bossId === c.bossId);
    case 'storyChapterCleared':
      return (log.storyRuns ?? []).some((r) => r.chapterCleared && r.chapterId === c.chapterId);
    case 'towerFloorCleared':
      return (log.towerBattles ?? []).some((b) => b.won && b.floor >= c.floor);
    case 'transcendentsCollected':
      return new Set((log.fusions ?? []).map((f) => f.transcendentId)).size >= c.min;
  }
}

/** 새로 충족된 칭호(이미 해금한 것·조건 없는 것·다른 종족 전용 제외). 상태를 바꾸지 않는다 */
export function evaluateTitles(runLog: RunLog, state: Pick<TitleEvalState, 'titles'> & Partial<Pick<TitleEvalState, 'factionId' | 'live'>>, defs: readonly TitleDef[]): TitleDef[] {
  const have = new Set(state.titles.map((t) => t.titleId));
  const mine = (d: TitleDef) => d.factions === undefined || state.factionId === undefined || d.factions.includes(state.factionId);
  return defs.filter((d) => d.condition !== null && !have.has(d.id) && mine(d) && checkCondition(d.condition, runLog, state.live));
}

export function snapshotOf(runLog: RunLog, state: TitleEvalState): TitleSnapshot {
  return {
    runs: runLog.runs.length,
    returned: runLog.runs.filter((r) => r.outcome === 'returned').length,
    defeated: runLog.runs.filter((r) => r.outcome === 'defeated').length,
    absorbs: runLog.absorbs.filter((a) => a.absorbed).length,
    maxLap: runLog.runs.reduce((m, r) => Math.max(m, r.laps), 0),
    tierIndex: state.evolution.tierIndex,
    formId: state.evolution.formId,
    factionId: state.factionId,
  };
}

/** 평가해서 새 해금을 state.titles 에 기록하고 그 정의를 돌려준다. 한 번 해금하면 지우지 않는다 */
export function unlockTitles(
  runLog: RunLog,
  state: TitleEvalState,
  defs: readonly TitleDef[],
  trigger: TitleTrigger,
  nowMs: number,
): TitleDef[] {
  const fresh = evaluateTitles(runLog, state, defs);
  if (fresh.length === 0) return fresh;
  const snapshot = snapshotOf(runLog, state);
  for (const d of fresh) state.titles.push({ titleId: d.id, at: nowMs, trigger, snapshot: { ...snapshot }, seen: false });
  return fresh;
}
