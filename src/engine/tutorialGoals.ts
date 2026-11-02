// 튜토리얼 보상 목표 판정 (GDD 23-3). 종족 무관 순수 로직: 런 로그·진행 상태만 읽어 "처음 해 보기" 목표를 이뤘는지 본다.
// 트랙(종족)마다 1회: 원정·전투·흡수 기록은 그 종족 기록만 센다. 진화 단계·등급 이력·튜토리얼 플래그는 세이브 하나에 하나뿐이라 그대로 본다.

import type { TutorialCheck, TutorialGoalDef } from '../data/tutorials';
import type { RunLog } from './runLog';
import { MAX_TIER_INDEX } from './evolution/evolution';

/** 판정에 쓰는 세이브의 일부 */
export interface TutorialGoalView {
  factionId: string;
  tutorialSeen: boolean;
  runLog: Pick<RunLog, 'runs' | 'battles' | 'absorbs' | 'tiers'>;
  tierIndex: number;
  everRanked: boolean;
  /** 해방 수련 완료 (GDD 22-5) */
  trainingCompleted?: boolean;
  /** 환생 횟수 (GDD 22-7) */
  rebirths?: number;
}

/** 이 목표를 이뤘는가. available: false(아직 없는 시스템) 는 항상 false */
export function goalAchieved(def: Pick<TutorialGoalDef, 'check' | 'available'>, v: TutorialGoalView): boolean {
  if (!def.available) return false;
  return CHECKS[def.check](v);
}

const runIdsOf = (v: TutorialGoalView): Set<number> => new Set(v.runLog.runs.filter((r) => r.factionId === v.factionId).map((r) => r.runId));

const CHECKS: Record<TutorialCheck, (v: TutorialGoalView) => boolean> = {
  tutorialSeen: (v) => v.tutorialSeen,
  returned: (v) => v.runLog.runs.some((r) => r.factionId === v.factionId && r.outcome === 'returned' && r.endReason !== 'abort'),
  absorbed: (v) => {
    const ids = runIdsOf(v);
    return v.runLog.absorbs.some((a) => a.absorbed && ids.has(a.runId));
  },
  chain3: (v) => v.runLog.battles.some((b) => b.factionId === v.factionId && (b.chain3Count ?? 0) > 0),
  evolved: (v) => v.tierIndex >= 1 || v.runLog.tiers.evolutions.length > 0,
  eliteWin: (v) => v.runLog.battles.some((b) => b.factionId === v.factionId && b.won && b.enemyClass === 'elite'),
  tier5: (v) => v.tierIndex >= MAX_TIER_INDEX, // id 는 옛 이름 그대로(받은 기록 키) — C.220: 마지막 단계(4단계)
  ranked: (v) => v.everRanked,
  training: (v) => v.trainingCompleted === true,
  rebirth: (v) => (v.rebirths ?? 0) >= 1,
};

/** 아직 받지 않았고 지금 이룬 목표 (목록 순서대로) */
export function newlyAchieved(defs: readonly TutorialGoalDef[], claimedIds: readonly string[], v: TutorialGoalView): TutorialGoalDef[] {
  return defs.filter((d) => !claimedIds.includes(d.id) && goalAchieved(d, v));
}
