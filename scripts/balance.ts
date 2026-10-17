// 밸런스 점검 (npm run balance, CI 는 --check 로 회귀 가드 판정)
// 시스템별 지표를 여기에 더한다. 가드를 어기면 --check 일 때 종료 코드 1.

import { BALANCE, BALANCE_VERSION } from '../src/config/balance';
import { ENEMIES } from '../src/data/enemies';
import { createBattle, playGreedy } from '../src/engine/battle';
import { createExpedition, playExpedition } from '../src/engine/expedition';
import { canAbsorb, completedLineages } from '../src/engine/absorb';
import { sanitizeDeck, newTileStock } from '../src/game';

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

// ── 원정 루프(P2): 자동 플레이(타일을 앞 슬롯에 채워 놓음, 탐욕 봇), 시드 고정 ──
const M = 60;
const deck = sanitizeDeck(newTileStock(), 'hollow');
console.log(`\n원정 (자동 플레이 ${M}회, 타일 배치 포함, 시작 허기 20·컨디션 80)`);
for (const stopLap of [4, 6]) {
  let exhausted = 0;
  let defeated = 0;
  let battles = 0;
  let tiles = 0;
  let hunger = 0;
  const byLap = Array.from({ length: 6 }, () => 0);
  for (let seed = 1; seed <= M; seed++) {
    const e = playExpedition(createExpedition({ factionId: 'hollow', seed, hunger: 20, condition: 80, deck }), { returnAfterLap: stopLap });
    if (e.endReason === 'exhausted') exhausted++;
    if (e.outcome === 'defeated') defeated++;
    battles += e.battles.length;
    tiles += e.acquired.length;
    hunger += e.hunger;
    e.battlesByLap.forEach((n, i) => (byLap[i] = (byLap[i] ?? 0) + n));
  }
  console.log(`  ${stopLap}바퀴 귀환 계획: 패배 ${defeated}/${M} (탈진 ${exhausted}) · 평균 전투 ${(battles / M).toFixed(1)}회 · 타일 ${(tiles / M).toFixed(1)}장 · 끝 허기 ${(hunger / M).toFixed(0)} · 바퀴별 전투 ${byLap.map((n) => (n / M).toFixed(1)).join('/')}`);
  // 회귀 가드: 기본 4바퀴 런은 허기로 쓰러지지 않아야 하고, 6바퀴 런은 허기 급상승으로 쓰러질 만해야 한다
  if (stopLap === 4 && exhausted > 0) failures.push(`4바퀴 런에서 탈진 ${exhausted}회`);
  if (stopLap === 6 && exhausted < M * 0.5) failures.push(`6바퀴 런 탈진 ${exhausted}/${M} < 50% (허기 급상승이 약하다)`);
}

// ── 흡수·리스크(P3): 임계값을 넘는 전투 비율, 흡수 자동 플레이(계통 모으기) ──
console.log(`\n흡수 임계값 ${BALANCE.provisional.absorb.threshold} (임시) — 탐욕 봇 ${N}판당 흡수 가능 비율`);
let absorbableTotal = 0;
for (const enemy of ENEMIES) {
  let ok = 0;
  let gained = 0;
  let risk = 0;
  for (let seed = 1; seed <= N; seed++) {
    const s = playGreedy(createBattle({ seed, enemy }));
    gained += s.absorbGained;
    risk += s.riskGained;
    if (s.status === 'won' && canAbsorb(s.absorbGained)) ok++;
  }
  absorbableTotal += ok / N;
  console.log(`  ${enemy.id}: 흡수 가능 ${((ok / N) * 100).toFixed(0)}% · 평균 흡수 게이지 ${(gained / N).toFixed(1)} · 평균 공허 리스크 +${(risk / N).toFixed(1)}`);
}
const absorbableAvg = absorbableTotal / ENEMIES.length;
if (absorbableAvg < 0.25 || absorbableAvg > 0.85) failures.push(`흡수 가능 비율 평균 ${(absorbableAvg * 100).toFixed(0)}% (25~85% 밖)`);

console.log(`\n흡수 원정 (자동 플레이 ${M}회: 흡수 가능하면 흡수하고 계통을 모음 / 비교: 항상 놓아줌)`);
const absorbStats: Record<string, { breakthrough: number; defeated: number }> = {};
for (const stopLap of [4, 6]) {
  for (const policy of ['absorb', 'release'] as const) {
    let absorbs = 0;
    let releases = 0;
    let bt = 0;
    let defeated = 0;
    let traits = 0;
    let lineage = 0;
    let risk = 0;
    let turns = 0;
    let battles = 0;
    for (let seed = 1; seed <= M; seed++) {
      const e = playExpedition(createExpedition({ factionId: 'hollow', seed, hunger: 20, condition: 80, deck }), { returnAfterLap: stopLap, absorb: policy });
      absorbs += e.absorbRecords.filter((a) => a.absorbed).length;
      releases += e.absorbRecords.filter((a) => !a.absorbed).length;
      if (e.breakthrough) bt++;
      if (e.outcome === 'defeated') defeated++;
      traits += e.build.owned.length;
      if (completedLineages(e.build).length > 0) lineage++;
      risk += e.risk;
      for (const b of e.battles) {
        turns += b.turns;
        battles++;
      }
    }
    absorbStats[`${stopLap}-${policy}`] = { breakthrough: bt, defeated };
    console.log(`  ${stopLap}바퀴 ${policy === 'absorb' ? '흡수' : '놓아줌'}: 흡수 ${(absorbs / M).toFixed(1)}회 · 놓아줌 ${(releases / M).toFixed(1)}회 · 한계 돌파 ${bt}/${M} · 패배 ${defeated}/${M} · 끝 특성 ${(traits / M).toFixed(1)}개 · 계통 완성 ${lineage}/${M} · 끝 리스크 ${(risk / M).toFixed(0)} · 전투당 ${(turns / battles).toFixed(1)}턴`);
  }
}
// 회귀 가드(흡수 봇은 쉬지도 놓아주지도 않는 극단이다): 기본 4바퀴 흡수 플레이는 절반 이하만 돌파하고, 항상 놓아주면 돌파하지 않으며, 6바퀴 흡수 플레이는 돌파가 의미 있게 생겨야 한다
if ((absorbStats['4-absorb']?.breakthrough ?? 0) > M * 0.5) failures.push(`4바퀴 흡수 플레이 돌파 ${absorbStats['4-absorb']?.breakthrough}/${M} > 50%`);
if ((absorbStats['6-absorb']?.breakthrough ?? 0) < M * 0.6) failures.push(`6바퀴 흡수 플레이 돌파 ${absorbStats['6-absorb']?.breakthrough}/${M} < 60% (리스크가 약하다)`);
if ((absorbStats['4-release']?.breakthrough ?? 0) > 0) failures.push('4바퀴에서 항상 놓아줘도 한계 돌파가 생긴다');

if (check) {
  if (failures.length > 0) {
    console.error(`회귀 가드 실패:\n- ${failures.join('\n- ')}`);
    process.exit(1);
  }
  console.log('\n회귀 가드 통과');
}
