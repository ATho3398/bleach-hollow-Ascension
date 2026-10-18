// 전투 결과 → 런 로그 BattleRecord (GDD 9장, CLAUDE.md 규칙 4). 매치3 시절 필드는 0/빈 값으로 채워 호환한다
import { canAbsorb } from '../absorb/offer';
import { emptyLegacyMatches, type BattleRecord } from '../runLog';
import { elapsedSeconds, type CombatState } from './combat';

export interface BattleContext {
  factionId: string;
  /** 원정 밖(전투 연습)은 0 */
  runId?: number;
  lap?: number;
  tierIndex?: number;
}

export function buildBattleRecord(s: CombatState, ctx: BattleContext): BattleRecord {
  return {
    runId: ctx.runId ?? 0,
    lap: ctx.lap ?? 0,
    turns: 0,
    matchesByRole: emptyLegacyMatches(),
    won: s.status === 'won',
    skillsUsed: [...s.skillsUsed],
    enemyClass: s.enemy.def.class,
    tierIndex: ctx.tierIndex ?? 0,
    enemyId: s.enemy.def.id,
    factionId: ctx.factionId,
    seed: s.seed,
    riskGained: s.riskGained,
    absorbGained: 0,
    lossReason: s.lossReason,
    durationSeconds: Math.round(elapsedSeconds(s) * 10) / 10,
    blocksByTrait: { ...s.blocksByTrait },
    blocksByChain: [...s.blocksByChain],
    chain3Count: s.chain3Count,
    chainsByFamily: Object.fromEntries(Object.entries(s.chainsByFamily).map(([k, v]) => [k, [...v] as [number, number, number]])),
    combosTriggered: s.combosTriggered,
    comboBlocksUsed: s.comboBlocksUsed,
    guardSuccesses: s.guardSuccesses,
    voidUsed: s.voidUsed,
    specialUsed: s.specialUsed,
    finisherKind: s.finisher?.kind ?? null,
    finisherTraitId: s.finisher?.traitId ?? null,
    finisherLineageId: s.finisher?.lineageId ?? null,
    absorbable: canAbsorb(s),
    storedUsed: s.storedUsed,
    storedWasted: Math.round(s.storedWasted * 10) / 10,
  };
}
