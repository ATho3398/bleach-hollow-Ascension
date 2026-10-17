// 밸런스 점검 (npm run balance, CI 는 --check 로 회귀 가드 판정)
// 시스템별 지표를 여기에 더한다. 가드를 어기면 --check 일 때 종료 코드 1.

import { BALANCE, BALANCE_VERSION } from '../src/config/balance';
import { ENEMIES } from '../src/data/enemies';
import { createBattle, playGreedy } from '../src/engine/battle';

const check = process.argv.includes('--check');
const failures: string[] = [];

console.log(`밸런스 버전 ${BALANCE_VERSION}`);

// ── 전투 코어(P1): 탐욕 봇 200판, 시드 고정 ──
const N = 200;
console.log(`\n전투 (탐욕 봇 ${N}판, 시드 1~${N}) — 기획서 목표: 일반 평균 6~8턴`);
for (const enemy of ENEMIES) {
  let wins = 0;
  let turns = 0;
  let skills = 0;
  let timeouts = 0;
  for (let seed = 1; seed <= N; seed++) {
    const s = playGreedy(createBattle({ seed, enemy }));
    if (s.status === 'won') wins++;
    if (s.lossReason === 'timeout') timeouts++;
    turns += s.turns;
    skills += s.skillsUsed.length;
  }
  const avgTurns = turns / N;
  const winRate = wins / N;
  console.log(`  ${enemy.id} (${enemy.class}, 체력 ${enemy.hpInMatches}회분): 승률 ${(winRate * 100).toFixed(0)}% · 평균 ${avgTurns.toFixed(1)}턴 · 기술 ${(skills / N).toFixed(1)}회 · 턴초과 ${timeouts}`);
  // 회귀 가드: 봇이 거의 못 이기거나 턴 한도에 자주 걸리면 수치가 어긋난 것
  if (winRate < 0.5) failures.push(`${enemy.id}: 봇 승률 ${(winRate * 100).toFixed(0)}% < 50%`);
  if (timeouts / N > 0.05) failures.push(`${enemy.id}: 턴 초과 패배 ${timeouts}/${N}`);
  if (enemy.class === 'normal' && (avgTurns < 4 || avgTurns > 9)) failures.push(`${enemy.id}: 봇 평균 ${avgTurns.toFixed(1)}턴 (4~9 밖)`);
  const hp = enemy.class === 'normal' ? BALANCE.battle.enemyHpInMatches.normal : BALANCE.battle.enemyHpInMatches.elite;
  const [lo, hi] = typeof hp === 'number' ? [hp, hp] : [hp.min, hp.max];
  if (enemy.hpInMatches < lo || enemy.hpInMatches > hi) failures.push(`${enemy.id}: hpInMatches ${enemy.hpInMatches} 가 기획서 범위 ${lo}~${hi} 밖`);
}

if (check) {
  if (failures.length > 0) {
    console.error(`회귀 가드 실패:\n- ${failures.join('\n- ')}`);
    process.exit(1);
  }
  console.log('\n회귀 가드 통과');
}
