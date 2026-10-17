// 밸런스 점검·테스트용 자동 플레이어: 복제한 상태로 각 수를 시험해 가장 좋은 수를 둔다.
import { findMoves } from './board';
import { canUseSkill, playerSwap, useSkill, type BattleState } from './battle';

export function playGreedy(s: BattleState): BattleState {
  while (s.status === 'playing') {
    if (canUseSkill(s)) useSkill(s);
    if (s.status !== 'playing') break;
    let best: { score: number; move: ReturnType<typeof findMoves>[number] } | null = null;
    for (const move of findMoves(s.board)) {
      const trial = structuredClone(s);
      const res = playerSwap(trial, move[0], move[1]);
      const p = res.phases[0];
      if (!p) continue;
      const score = p.damageDealt + 0.5 * p.shieldGained + 3 * p.hud.spiritMatches;
      if (!best || score > best.score) best = { score, move };
    }
    if (!best) break;
    playerSwap(s, best.move[0], best.move[1]);
  }
  return s;
}
