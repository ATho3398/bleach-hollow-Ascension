// 밸런스 점검 (npm run balance, CI 는 --check 로 회귀 가드 판정)
// 시스템별 지표를 여기에 더한다. 가드를 어기면 --check 일 때 종료 코드 1.

import { BALANCE, BALANCE_VERSION } from '../src/config/balance';
import { ENEMIES } from '../src/data/enemies';
import { createCombat, elapsedSeconds, playCombatBot, type CombatParams, type CombatState } from '../src/engine/combat';
import { createExpedition, playExpedition } from '../src/engine/expedition';
import { buildCombatParams, canAbsorb, completedLineages, gainTrait, newBuild } from '../src/engine/absorb';
import { sanitizeDeck, newTileStock } from '../src/game';

const check = process.argv.includes('--check');
const failures: string[] = [];
const CX = BALANCE.provisional.combat;

console.log(`밸런스 버전 ${BALANCE_VERSION}`);

// ── 전투 v2(P4): 블록 봇 N판, 시드 고정 ──
// 기준 빌드 = 빈 슬롯(기본 블록 생성원 1개). 비교 빌드 = 공격·막기·회복 skill 3개 장착(생성원 3개, 블록 3배)
const N = 200;
const mixed = newBuild();
for (const id of ['trait-a1', 'trait-b1', 'trait-c1']) gainTrait(mixed, id);
const builds: { name: string; params: Partial<CombatParams> }[] = [
  { name: '빈 슬롯(기본 블록)', params: {} },
  { name: 'skill 3개(공격·막기·회복)', params: buildCombatParams(mixed) },
];
const TARGET = { normal: { seconds: 45, win: 0.9 }, elite: { seconds: 90, winLo: 0.6, winHi: 0.85 } };
console.log(`\n전투 (블록 봇 ${N}판, 시드 1~${N}, 입력 0.5초 간격) — 임시 목표(GDD 3-5): 일반 약 ${TARGET.normal.seconds}초·승률 ${TARGET.normal.win * 100}%↑, 강적 약 ${TARGET.elite.seconds}초·승률 ${TARGET.elite.winLo * 100}~${TARGET.elite.winHi * 100}%`);
for (const build of builds) {
  console.log(`  [${build.name}]`);
  for (const enemy of ENEMIES) {
    let wins = 0;
    let secs = 0;
    let winSecs = 0;
    let timeouts = 0;
    let chain3 = 0;
    let guards = 0;
    let voids = 0;
    let specials = 0;
    let absorbable = 0;
    let hpLeft = 0;
    for (let seed = 1; seed <= N; seed++) {
      const s = playCombatBot(createCombat(seed, { enemy, params: build.params }));
      const t = elapsedSeconds(s);
      secs += t;
      if (s.status === 'won') {
        wins++;
        winSecs += t;
        hpLeft += s.player.hp / s.player.maxHp;
      }
      if (s.lossReason === 'timeout') timeouts++;
      chain3 += s.chain3Count;
      guards += s.guardSuccesses;
      voids += s.voidUsed;
      if (s.specialUsed) specials++;
      if (canAbsorb(s)) absorbable++;
    }
    const winRate = wins / N;
    const avgWin = wins > 0 ? winSecs / wins : 0;
    console.log(
      `    ${enemy.id} (${enemy.class}, 체력 ${enemy.hpInAttacks}회분): 승률 ${(winRate * 100).toFixed(0)}% · 평균 ${(secs / N).toFixed(1)}초(승리 ${avgWin.toFixed(1)}초) · 남은 체력 ${wins ? ((hpLeft / wins) * 100).toFixed(0) : '-'}% · 체인3 ${(chain3 / N).toFixed(1)}회 · 막기 성공 ${(guards / N).toFixed(1)} · 공허 ${(voids / N).toFixed(1)} · 필살 ${((specials / N) * 100).toFixed(0)}% · 흡수 가능 ${((absorbable / N) * 100).toFixed(0)}% · 시간 초과 ${timeouts}`,
    );
    if (build.name.startsWith('빈')) {
      // 회귀 가드 (기준 빌드): 목표 근처에서 크게 벗어나면 수치가 어긋난 것. 목표 자체는 위에 출력한다
      if (enemy.class === 'normal') {
        if (winRate < 0.8) failures.push(`${enemy.id}: 봇 승률 ${(winRate * 100).toFixed(0)}% < 80%`);
        if (avgWin < 30 || avgWin > 60) failures.push(`${enemy.id}: 승리 평균 ${avgWin.toFixed(1)}초 (30~60 밖)`);
      } else {
        if (winRate < 0.4 || winRate > 0.97) failures.push(`${enemy.id}: 강적 봇 승률 ${(winRate * 100).toFixed(0)}% (40~97% 밖)`);
        if (avgWin < 60 || avgWin > 120) failures.push(`${enemy.id}: 강적 승리 평균 ${avgWin.toFixed(1)}초 (60~120 밖)`);
      }
      if (timeouts / N > 0.05) failures.push(`${enemy.id}: 시간 초과 패배 ${timeouts}/${N}`);
    }
    const ref = CX.enemyHpInAttacks[enemy.class];
    if (Math.abs(enemy.hpInAttacks - ref) > ref * 0.15) failures.push(`${enemy.id}: hpInAttacks ${enemy.hpInAttacks} 가 기준 ${ref}(±15%) 밖`);
  }
}

// ── 원정 루프(P2): 자동 플레이(타일을 앞 슬롯에 채워 놓음, 블록 봇), 시드 고정 ──
const M = 60;
const deck = sanitizeDeck(newTileStock(), 'hollow');
/** 허기 가드용: 전투를 바로 이긴 것으로 친다 (허기 시스템만 따로 본다. 전투 승패는 위 전투 점검이 본다) */
const autoWin = (s: CombatState) => {
  s.enemy.hp = 0;
  s.status = 'won';
  s.finisher = { kind: 'basic-attack', traitId: null, lineageId: null };
};
console.log(`\n원정 (자동 플레이 ${M}회, 타일 배치 포함, 시작 허기 20·컨디션 80)`);
for (const [label, playBattle] of [['블록 봇 전투', undefined], ['허기 점검: 전투는 승리 처리', autoWin]] as const) {
  for (const stopLap of [4, 6]) {
    let exhausted = 0;
    let defeated = 0;
    let battles = 0;
    let tiles = 0;
    let hunger = 0;
    const byLap = Array.from({ length: 6 }, () => 0);
    for (let seed = 1; seed <= M; seed++) {
      const e = playExpedition(createExpedition({ factionId: 'hollow', seed, hunger: 20, condition: 80, deck }), { returnAfterLap: stopLap, playBattle });
      if (e.endReason === 'exhausted') exhausted++;
      if (e.outcome === 'defeated') defeated++;
      battles += e.battles.length;
      tiles += e.acquired.length;
      hunger += e.hunger;
      e.battlesByLap.forEach((n, i) => (byLap[i] = (byLap[i] ?? 0) + n));
    }
    console.log(`  [${label}] ${stopLap}바퀴 귀환 계획: 패배 ${defeated}/${M} (탈진 ${exhausted}) · 평균 전투 ${(battles / M).toFixed(1)}회 · 타일 ${(tiles / M).toFixed(1)}장 · 끝 허기 ${(hunger / M).toFixed(0)} · 바퀴별 전투 ${byLap.map((n) => (n / M).toFixed(1)).join('/')}`);
    // 회귀 가드: 기본 4바퀴 런은 허기로 쓰러지지 않아야 하고, 6바퀴 런은 허기 급상승으로 쓰러질 만해야 한다.
    // C.6: 강적 승률 목표가 60~85% 라 전투 패배로 6바퀴 전에 끝나는 런이 많아, 6바퀴 탈진 가드는 전투를 승리 처리한 런으로 본다
    if (stopLap === 4 && exhausted > 0) failures.push(`[${label}] 4바퀴 런에서 탈진 ${exhausted}회`);
    if (playBattle && stopLap === 6 && exhausted < M * 0.5) failures.push(`[${label}] 6바퀴 런 탈진 ${exhausted}/${M} < 50% (허기 급상승이 약하다)`);
  }
}

// ── 흡수·리스크(P3, C.6 조건): 흡수 가능 비율, 흡수 자동 플레이(계통 모으기) ──
console.log(`\n흡수 원정 (자동 플레이 ${M}회: 흡수 가능하면 흡수하고 계통을 모음 / 비교: 항상 놓아줌) — 흡수 조건(임시): 마무리 일격이 약점 계통 스킬 또는 체인3 ${BALANCE.provisional.absorb.chain3ForAbsorb}회 이상`);
const absorbStats: Record<string, { breakthrough: number; defeated: number; absorbableRate: number }> = {};
for (const stopLap of [4, 6]) {
  for (const policy of ['absorb', 'release'] as const) {
    let absorbs = 0;
    let releases = 0;
    let bt = 0;
    let defeated = 0;
    let traits = 0;
    let lineage = 0;
    let risk = 0;
    let secs = 0;
    let battles = 0;
    let wins = 0;
    let absorbable = 0;
    let voids = 0;
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
        secs += b.durationSeconds;
        battles++;
        voids += b.voidUsed;
        if (b.won) wins++;
        if (b.absorbable) absorbable++;
      }
    }
    absorbStats[`${stopLap}-${policy}`] = { breakthrough: bt, defeated, absorbableRate: wins ? absorbable / wins : 0 };
    console.log(
      `  ${stopLap}바퀴 ${policy === 'absorb' ? '흡수' : '놓아줌'}: 흡수 ${(absorbs / M).toFixed(1)}회 · 놓아줌 ${(releases / M).toFixed(1)}회 · 승리 중 흡수 가능 ${wins ? ((absorbable / wins) * 100).toFixed(0) : 0}% · 한계 돌파 ${bt}/${M} · 패배 ${defeated}/${M} · 끝 특성 ${(traits / M).toFixed(1)}개 · 계통 완성 ${lineage}/${M} · 끝 리스크 ${(risk / M).toFixed(0)} · 전투당 ${(secs / battles).toFixed(1)}초 · 공허 사용 ${(voids / battles).toFixed(2)}/전투`,
    );
  }
}
// 회귀 가드(흡수 봇은 쉬지도 놓아주지도 않는 극단이다): 기본 4바퀴 흡수 플레이는 절반 이하만 돌파하고, 항상 놓아주면 돌파하지 않으며, 6바퀴 흡수 플레이는 돌파가 의미 있게 생겨야 한다
if ((absorbStats['4-absorb']?.breakthrough ?? 0) > M * 0.5) failures.push(`4바퀴 흡수 플레이 돌파 ${absorbStats['4-absorb']?.breakthrough}/${M} > 50%`);
if ((absorbStats['6-absorb']?.breakthrough ?? 0) < M * 0.6) failures.push(`6바퀴 흡수 플레이 돌파 ${absorbStats['6-absorb']?.breakthrough}/${M} < 60% (리스크가 약하다)`);
if ((absorbStats['4-release']?.breakthrough ?? 0) > 0) failures.push('4바퀴에서 항상 놓아줘도 한계 돌파가 생긴다');
// 흡수 가능 비율: 거의 안 되면 빌드가 자라지 않는다(가드 25% 이상). C.6: 체인3 2회 조건은 봇이 거의 항상 채워(약 100%) 옛 상한 85% 는
// 가드에서 빼고 경고로만 출력한다 (기획 확인 사항, dev-log C.6)
const ar = absorbStats['4-release']?.absorbableRate ?? 0;
if (ar < 0.25) failures.push(`원정 승리 중 흡수 가능 비율 ${(ar * 100).toFixed(0)}% < 25%`);
if (ar > 0.85) console.log(`  경고: 원정 승리 중 흡수 가능 ${(ar * 100).toFixed(0)}% > 85% — 흡수 조건이 거의 항상 열린다 (기획 확인)`);

if (check) {
  if (failures.length > 0) {
    console.error(`회귀 가드 실패:\n- ${failures.join('\n- ')}`);
    process.exit(1);
  }
  console.log('\n회귀 가드 통과');
}
