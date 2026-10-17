// 전투 결과 → 런 로그 BattleRecord (GDD 9장, CLAUDE.md 규칙 4)
import type { BattleRecord } from '../runLog';
import type { BattleState } from './battle';

export interface BattleContext {
  factionId: string;
  /** 원정(P2) 전에는 0 */
  runId?: number;
  lap?: number;
  tierIndex?: number;
}

export function buildBattleRecord(s: BattleState, ctx: BattleContext): BattleRecord {
  return {
    runId: ctx.runId ?? 0,
    lap: ctx.lap ?? 0,
    turns: s.turns,
    matchesByRole: { ...s.matchesByRole },
    won: s.status === 'won',
    skillsUsed: [...s.skillsUsed],
    enemyClass: s.enemy.def.class,
    tierIndex: ctx.tierIndex ?? 0,
    enemyId: s.enemy.def.id,
    factionId: ctx.factionId,
    seed: s.seed,
    riskGained: s.riskGained,
    absorbGained: s.absorbGained,
    lossReason: s.lossReason,
  };
}
