// 전투 결과 → 런 로그 BattleRecord (GDD 9장, CLAUDE.md 규칙 4). 매치3 시절 필드는 0/빈 값으로 채워 호환한다
import { canAbsorb } from '../absorb/offer';
import { emptyLegacyMatches, type BattleRecord } from '../runLog';
import { elapsedSeconds, liberationUsedAt, zeroElementDamage, type CombatState } from './combat';

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
    specialUsed: false, // SP 필살 블록은 C.118 에 삭제 (GDD 66장) — 런 로그 필드는 옛 기록 호환으로 남긴다
    finisherKind: s.finisher?.kind ?? null,
    finisherTraitId: s.finisher?.traitId ?? null,
    finisherElement: s.finisher?.element ?? null,
    absorbable: canAbsorb(s),
    storedUsed: 0, // 저장형 필살기는 C.134 에 삭제 (GDD 83장) — 런 로그 필드는 구조 유지
    storedWasted: 0,
    liberationUsed: s.liberation.usedAtTick !== null,
    liberationAt: liberationUsedAt(s),
    liberationUses: s.liberation.uses,
    liberationChains: s.liberation.chains,
    crits: s.crits ?? 0,
    enemyCrits: s.enemyCrits ?? 0,
    abilityProcs: { ...s.abilityProcs },
    elementDamage: { ...zeroElementDamage(), ...s.params.elementDamage },
  };
}
