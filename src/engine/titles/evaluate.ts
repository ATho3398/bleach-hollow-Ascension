// 칭호 조건 평가기 (GDD 14-7). 순수 함수: 런 로그·진화 기록·세이브 상태를 읽어 새로 충족된 칭호를 돌려준다.
// 종족 id 로 분기하지 않는다(종족 차이는 칭호 데이터의 이름 텍스트뿐).
import type { TitleCondition, TitleDef } from '../../data/schema';
import type { RunLog } from '../runLog';

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

export type TitleTrigger = 'expedition' | 'evolution' | 'load' | 'rank' | 'training';

/** 평가기가 읽는 세이브 상태 (SaveData 의 일부) */
export interface TitleEvalState {
  factionId: string;
  titles: UnlockedTitle[];
  evolution: { tierIndex: number; formId: string | null };
}

export function checkCondition(c: TitleCondition, log: RunLog): boolean {
  switch (c.type) {
    case 'and':
      return c.all.every((x) => checkCondition(x, log));
    case 'or':
      return c.any.some((x) => checkCondition(x, log));
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
  }
}

/** 새로 충족된 칭호(이미 해금한 것·조건 없는 것 제외). 상태를 바꾸지 않는다 */
export function evaluateTitles(runLog: RunLog, state: Pick<TitleEvalState, 'titles'>, defs: readonly TitleDef[]): TitleDef[] {
  const have = new Set(state.titles.map((t) => t.titleId));
  return defs.filter((d) => d.condition !== null && !have.has(d.id) && checkCondition(d.condition, runLog));
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
