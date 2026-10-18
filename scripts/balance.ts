// 밸런스 점검 (npm run balance, CI 는 --check 로 회귀 가드 판정)
// 시스템별 지표를 여기에 더한다. 가드를 어기면 --check 일 때 종료 코드 1.

import { BALANCE, BALANCE_VERSION } from '../src/config/balance';
import { ENEMIES, enemyPatternKind, POOL_CONFIG } from '../src/data/enemies';
import { ENEMY_PATTERN_KINDS } from '../src/data/schema';
import { createCombat, elapsedSeconds, playCombatBot, playCombatHuman, storedStartGaugeOf, type CombatParams, type CombatState } from '../src/engine/combat';
import { enemyPool } from '../src/engine/enemyPool';
import { createExpedition, playExpedition, type ExpeditionState } from '../src/engine/expedition';
import { buildCombatParams, canAbsorb, completedLineages, gainTrait, newBuild } from '../src/engine/absorb';
import { FORM_TABLE, formName, formsOfTier } from '../src/data/evolution';
import { LINEAGES } from '../src/data/lineages';
import { analyzeTable, canEvolve, comboRulesOf, CONCENTRATION_PROFILES, newEvolution, reportProblems } from '../src/engine/evolution';
import { newSaveData, nextRunId, performEvolution, recordExpedition, sanitizeDeck, newTileStock } from '../src/game';

const check = process.argv.includes('--check');
const failures: string[] = [];
const CX = BALANCE.provisional.combat;

console.log(`밸런스 버전 ${BALANCE_VERSION}`);

// ── 전투 v2(P4): 블록 봇 N판, 시드 고정 ──
// C.7 (GDD 3-5 v0.7): 승률 목표의 기준 빌드 = skill 특성 1~2개 장착 (공격 1개 / 공격+막기 2개).
// 빈 슬롯(기본 블록만)은 일반 적 승률 90%↑만 가드, 강적은 참고 출력. skill 3개 빌드는 비교용.
const N = 200;
/** 계열 단계 기술 표를 읽을 종족 (두 종족의 계열 수치는 같으므로 하나로 점검한다) */
const BALANCE_FACTION = 'hollow';
const buildOf = (ids: string[]): Partial<CombatParams> => {
  const b = newBuild();
  for (const id of ids) gainTrait(b, id);
  // 점검 봇은 1단계(진화 전)라 켜진 콤보가 없다. 콤보 효과는 아래 참고 빌드로 따로 본다 (GDD 17-3)
  return { ...buildCombatParams(b, BALANCE_FACTION), combos: comboRulesOf(newEvolution()), ...START };
};
/** C.17: 점검 봇의 시작 저장 게이지 = 새 세이브 안정 수치(stabilityStart)에 비례한 값 */
const START = { storedStartGauge: storedStartGaugeOf(BALANCE.provisional.risk.stabilityStart) };
type BuildDef = { name: string; params: Partial<CombatParams>; ref: boolean; /** 사람형 봇 강적 승률 목표 [하한, 상한]. 없으면 참고 출력만 */ elite?: [number, number] };
const builds: BuildDef[] = [
  { name: '빈 슬롯(기본 블록)', params: { ...START }, ref: false },
  { name: 'skill 1개(공격)', params: buildOf(['trait-c5']), ref: true, elite: [0.6, 0.85] },
  { name: 'skill 2개(공격·막기)', params: buildOf(['trait-c5', 'trait-a5']), ref: true, elite: [0.6, 0.85] },
  // C.34 (GDD 17-3): 같은 계열 공격 특성 둘은 서로 체인이 된다 — 체인이 쉬워진 빌드
  { name: 'skill 2개(같은 계열 공격 2)', params: buildOf(['trait-c5', 'trait-e4']), ref: true, elite: [0.6, 0.85] },
  // C.34 ③ (GDD 17-3): 2단계 콤보(탄 계열 체인2 연속 2번 → 콤보 블록)가 켜진 같은 빌드 — 참고 출력만
  { name: 'skill 1개(공격)+콤보(2단계 규칙)', params: { ...buildOf(['trait-c5']), combos: comboRulesOf({ ...newEvolution(), tierIndex: 1 }) }, ref: false },
  { name: 'skill 3개(공격·막기·회복)', params: buildOf(['trait-a1', 'trait-b1', 'trait-c1']), ref: false },
];
// C.16 (GDD 14-4): 완벽형 봇(참고)과 사람형 봇(목표 기준) 둘 다 돌린다.
//  - 완벽형: 0.5초 간격, 반응 지연·실수 없음. 강공격을 다 막고 체인을 다 붙여서 기술 2개부터 100% 로 절벽이 생긴다 → 참고 출력, 일반 적 승률·길이만 가드
//  - 사람형: 입력 간격과 막기 반응 지연 0.5~1.2초 무작위, 막기 성공 70%, 붙이기(체인 정리) 입력당 50%. 승률·길이 목표는 이 봇 기준
const TARGET = {
  normal: { seconds: 45, win: 0.9 },
  elite: { seconds: 90 },
  /** 사람형 봇 강적 승률 목표 (C.34: 빈 슬롯은 참고만, skill 1~2개 60~85%, skill 3개 이상은 목표 미달 유지 가능 — 빌드별 elite 필드) */
  eliteWin: { 'skill 1·2개': [0.6, 0.85] } as Record<string, [number, number]>,
};
const BOTS = [
  { key: 'perfect', name: '완벽형 봇', play: (s: CombatState) => playCombatBot(s) },
  { key: 'human', name: '사람형 봇', play: (s: CombatState) => playCombatHuman(s) },
] as const;
console.log(`\n전투 (봇 ${N}판, 시드 1~${N}) — 사람형 봇 목표(GDD 14-4, 임시): 일반 승률 ${TARGET.normal.win * 100}%↑·약 ${TARGET.normal.seconds}초, 강적 약 ${TARGET.elite.seconds}초, 강적 승률 ${Object.entries(TARGET.eliteWin).map(([k, [lo, hi]]) => `${k} ${Math.round(lo * 100)}~${Math.round(hi * 100)}%`).join(' / ')} (빈 슬롯·skill 3개는 참고)`);
// C.15 (GDD 14-5): 적 풀 전체(테스트 고정 적 제외)를 패턴 종류별로 묶어서 본다. 종류마다 적 5종(계통 A~E 약점) × N판
const POOL_ENEMIES = ENEMIES.filter((e) => !e.testOnly);
const KINDS = ENEMY_PATTERN_KINDS.filter((k) => POOL_ENEMIES.some((e) => enemyPatternKind(e) === k));
type KindStat = { kind: string; cls: string; games: number; wins: number; secs: number; winSecs: number; timeouts: number; line: string };
function measureKind(play: (s: CombatState) => CombatState, build: BuildDef, kind: string): KindStat {
  const group = POOL_ENEMIES.filter((e) => enemyPatternKind(e) === kind);
  const st = { games: 0, wins: 0, secs: 0, winSecs: 0, timeouts: 0, chain3: 0, guards: 0, voids: 0, specials: 0, absorbable: 0, hpLeft: 0, stored: 0, wasted: 0 };
  for (const enemy of group) {
    for (let seed = 1; seed <= N; seed++) {
      const s = play(createCombat(seed, { enemy, params: build.params }));
      const t = elapsedSeconds(s);
      st.games++;
      st.secs += t;
      if (s.status === 'won') {
        st.wins++;
        st.winSecs += t;
        st.hpLeft += s.player.hp / s.player.maxHp;
      }
      if (s.lossReason === 'timeout') st.timeouts++;
      st.chain3 += s.chain3Count;
      st.guards += s.guardSuccesses;
      st.voids += s.voidUsed;
      st.stored += s.storedUsed;
      st.wasted += s.storedWasted;
      if (s.specialUsed) st.specials++;
      if (canAbsorb(s)) st.absorbable++;
    }
  }
  const g = st.games;
  const line = `    ${kind.padEnd(11)} (${group[0]!.class}, 체력 ${group[0]!.hpInAttacks}회분, 적 ${group.length}종): 승률 ${((st.wins / g) * 100).toFixed(0)}% · 평균 ${(st.secs / g).toFixed(1)}초(승리 ${(st.wins ? st.winSecs / st.wins : 0).toFixed(1)}초) · 남은 체력 ${st.wins ? ((st.hpLeft / st.wins) * 100).toFixed(0) : '-'}% · 체인3 ${(st.chain3 / g).toFixed(1)}회 · 막기 성공 ${(st.guards / g).toFixed(1)} · 공허 ${(st.voids / g).toFixed(1)} · 필살 ${((st.specials / g) * 100).toFixed(0)}% · 저장필살 ${(st.stored / g).toFixed(1)}회(낭비 ${(st.wasted / g).toFixed(0)}) · 흡수 가능 ${((st.absorbable / g) * 100).toFixed(0)}% · 시간 초과 ${st.timeouts}`;
  return { kind, cls: group[0]!.class, games: g, wins: st.wins, secs: st.secs, winSecs: st.winSecs, timeouts: st.timeouts, line };
}
/** 풀 가중치(POOL_CONFIG)로 종류별 결과를 합친 승률·승리 평균 시간 */
function pooled(stats: KindStat[]): { win: number; winSecs: number } {
  const w = (k: KindStat) => POOL_CONFIG.kinds[k.kind as keyof typeof POOL_CONFIG.kinds].weight;
  const tw = stats.reduce((a, k) => a + w(k), 0);
  const win = stats.reduce((a, k) => a + (w(k) * k.wins) / k.games, 0) / tw;
  const winSecs = stats.reduce((a, k) => a + (w(k) * (k.wins ? k.winSecs / k.wins : 0)), 0) / tw;
  return { win, winSecs };
}
const humanElite: Record<string, { win: number; winSecs: number }> = {};
for (const bot of BOTS) {
  console.log(`\n  ===== ${bot.name} =====`);
  for (const build of builds) {
    console.log(`  [${build.name}]`);
    const stats = KINDS.map((kind) => measureKind(bot.play, build, kind));
    for (const st of stats) {
      console.log(st.line);
      const winRate = st.wins / st.games;
      const avgWin = st.wins ? st.winSecs / st.wins : 0;
      const tag = `${bot.name}/${st.kind}/${build.name}`;
      if (st.cls === 'normal') {
        // 일반 적: 두 봇 모두 승률 90%↑·길이·시간 초과 가드 (빈 슬롯은 약 45초 근처)
        if (winRate < TARGET.normal.win) failures.push(`${tag}: 승률 ${(winRate * 100).toFixed(0)}% < ${TARGET.normal.win * 100}%`);
        if (avgWin < 18 || avgWin > 75) failures.push(`${tag}: 승리 평균 ${avgWin.toFixed(1)}초 (18~75 밖)`);
        if (build.name.startsWith('빈') && (avgWin < 30 || avgWin > 70)) failures.push(`${tag}: 승리 평균 ${avgWin.toFixed(1)}초 (30~70 밖)`);
      }
      if (st.timeouts / st.games > 0.05) failures.push(`${tag}: 시간 초과 패배 ${st.timeouts}/${st.games}`);
    }
    const ns = stats.filter((x) => x.cls === 'normal');
    const es = stats.filter((x) => x.cls === 'elite');
    const pn = pooled(ns);
    const pe = pooled(es);
    console.log(`      → 일반 전체(풀 가중): 승률 ${(pn.win * 100).toFixed(0)}% · 승리 ${pn.winSecs.toFixed(1)}초 / 강적 전체(풀 가중): 승률 ${(pe.win * 100).toFixed(0)}% · 승리 ${pe.winSecs.toFixed(1)}초`);
    if (bot.key === 'human') {
      humanElite[build.name] = pe;
      if (build.elite) {
        const [lo, hi] = build.elite;
        const ok = pe.win >= lo && pe.win <= hi;
        console.log(`      → 강적 승률 목표 ${Math.round(lo * 100)}~${Math.round(hi * 100)}%: ${ok ? '맞음' : '벗어남'}`);
        if (!ok) failures.push(`사람형 봇/${build.name}: 강적 승률 ${(pe.win * 100).toFixed(0)}% (목표 ${Math.round(lo * 100)}~${Math.round(hi * 100)}% 밖)`);
      } else {
        // 빈 슬롯은 참고 값. skill 3개 이상은 강적 남은 체력이 95% 이상일 만큼 압도적이라 강적 패턴·체력·공격만으로는 못 맞춘다 (dev-log C.16 목표 미달 유지)
        console.log(`      → 강적 승률 ${Math.round(pe.win * 100)}% (참고, 목표 없음)`);
      }
      if (build.elite && build.name.startsWith('skill 1') && (pe.winSecs < 75 || pe.winSecs > 105)) failures.push(`사람형 봇/${build.name}: 강적 승리 평균 ${pe.winSecs.toFixed(1)}초 (목표 약 90초, 75~105 밖)`);
    }
  }
}
for (const enemy of POOL_ENEMIES) {
  const ref = CX.enemyHpByKind[enemyPatternKind(enemy)];
  if (Math.abs(enemy.hpInAttacks - ref) > ref * 0.15) failures.push(`${enemy.id}: hpInAttacks ${enemy.hpInAttacks} 가 ${enemyPatternKind(enemy)} 기준 ${ref}(±15%) 밖`);
}

// 개발용: --combat 이면 전투 점검만 하고 끝낸다 (전투 수치를 고칠 때 빠르게 돌려 본다)
if (process.argv.includes('--combat')) {
  console.log(failures.length ? `전투 가드 실패:\n- ${failures.join('\n- ')}` : '전투 가드 통과');
  process.exit(failures.length ? 1 : 0);
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

// ── 적 출현 풀 분포 (C.15, GDD 14-5): 바퀴·출처별 풀 구성과 약점 계통 분포 ──
{
  const LIDS = LINEAGES.map((l) => l.id);
  const WEAK_MIN = 0.1; // 가드: 계통 하나의 약점 적 비율 하한 (균등이면 1/계통 수 = 20%)
  console.log('\n적 출현 풀 (가중치 기준 구성, 약점 계통 분포는 풀 가중치 합산)');
  console.log('  등급   출처         바퀴  풀(종)  패턴 종류 비율                       약점 계통 비율');
  for (const cls of ['normal', 'elite'] as const) {
    for (const source of ['wild', 'environment', 'combo'] as const) {
      if (cls === 'normal' && source === 'combo') continue;
      if (cls === 'elite' && source === 'environment') continue;
      for (const lap of [1, 2, 3, 4, 6]) {
        const pool = enemyPool(cls, lap, source);
        const total = pool.reduce((a, e) => a + e.weight, 0);
        const byKind: Record<string, number> = {};
        const byWeak: Record<string, number> = {};
        for (const e of pool) {
          const k = enemyPatternKind(e.enemy);
          byKind[k] = (byKind[k] ?? 0) + e.weight / total;
          byWeak[e.enemy.weaknessLineageId] = (byWeak[e.enemy.weaknessLineageId] ?? 0) + e.weight / total;
        }
        const kinds = Object.entries(byKind).map(([k, v]) => `${k} ${(v * 100).toFixed(0)}%`).join(' · ');
        const weak = LIDS.map((l) => `${(((byWeak[l] ?? 0)) * 100).toFixed(0)}%`).join('/');
        console.log(`  ${cls.padEnd(6)} ${source.padEnd(11)} ${String(lap).padStart(3)}  ${String(pool.length).padStart(4)}   ${kinds.padEnd(44)} ${weak}`);
        for (const l of LIDS) {
          if ((byWeak[l] ?? 0) < WEAK_MIN) failures.push(`적 풀(${cls} ${source} ${lap}바퀴): ${l} 약점 적 비율 ${(((byWeak[l] ?? 0)) * 100).toFixed(0)}% < ${WEAK_MIN * 100}%`);
        }
      }
    }
  }
  // 실제 원정에서 만난 적 (전투 승리 처리, 6바퀴까지): 약점 계통·패턴 종류 분포
  const seenWeak: Record<string, number> = {};
  const seenKind: Record<string, number> = {};
  let seen = 0;
  const kindOf = new Map(ENEMIES.map((e) => [e.id, enemyPatternKind(e)]));
  const weakOf = new Map(ENEMIES.map((e) => [e.id, e.weaknessLineageId]));
  for (let seed = 1; seed <= 200; seed++) {
    const e = playExpedition(createExpedition({ factionId: 'hollow', seed, hunger: 0, condition: 100, deck: sanitizeDeck(newTileStock(), 'hollow') }), { returnAfterLap: 6, playBattle: autoWin });
    for (const b of e.battles) {
      seen++;
      const w = weakOf.get(b.enemyId)!;
      const k = kindOf.get(b.enemyId)!;
      seenWeak[w] = (seenWeak[w] ?? 0) + 1;
      seenKind[k] = (seenKind[k] ?? 0) + 1;
    }
  }
  console.log(`  실제 원정 200회(6바퀴까지, 전투 승리 처리)에서 만난 적 ${seen}마리: 약점 ${LIDS.map((l) => `${(((seenWeak[l] ?? 0) / seen) * 100).toFixed(0)}%`).join('/')} · 종류 ${Object.entries(seenKind).map(([k, n]) => `${k} ${((n / seen) * 100).toFixed(0)}%`).join(' · ')}`);
  for (const l of LIDS) {
    if ((seenWeak[l] ?? 0) / seen < WEAK_MIN) failures.push(`원정에서 만난 적: ${l} 약점 적 비율 ${(((seenWeak[l] ?? 0) / seen) * 100).toFixed(0)}% < ${WEAK_MIN * 100}%`);
  }
}

// ── 흡수·리스크(P3, C.6 조건): 흡수 가능 비율, 흡수 자동 플레이(계통 모으기) ──
console.log(`\n흡수 원정 (자동 플레이 ${M}회: 흡수 가능하면 흡수하고 계통을 모음 / 비교: 항상 놓아줌) — 흡수 조건(임시): 마무리 일격이 약점 계통 스킬 또는 약점 계통 체인3 ${BALANCE.provisional.absorb.weakChain3ForAbsorb}회 이상, 장착 skill 없으면 첫 흡수 보장`);
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
if ((absorbStats['6-absorb']?.breakthrough ?? 0) < M * 0.5) failures.push(`6바퀴 흡수 플레이 돌파 ${absorbStats['6-absorb']?.breakthrough}/${M} < 50% (리스크가 약하다)`);
if ((absorbStats['4-release']?.breakthrough ?? 0) > 0) failures.push('4바퀴에서 항상 놓아줘도 한계 돌파가 생긴다');
// 흡수 가능 비율: 거의 안 되면 빌드가 자라지 않고(가드 25% 이상), 거의 항상이면 조건이 의미 없다(가드 85% 이하).
// C.7: 측정은 "흡수하는 봇" 기준. 항상 놓아주는 봇은 skill 이 하나도 없어 첫 흡수 보장으로 늘 100% 라 의미가 없다 (참고 출력만)
for (const lap of [4, 6]) {
  const ar = absorbStats[`${lap}-absorb`]?.absorbableRate ?? 0;
  if (ar < 0.25) failures.push(`${lap}바퀴 흡수 플레이: 승리 중 흡수 가능 비율 ${(ar * 100).toFixed(0)}% < 25%`);
  if (ar > 0.85) failures.push(`${lap}바퀴 흡수 플레이: 승리 중 흡수 가능 비율 ${(ar * 100).toFixed(0)}% > 85% (조건이 거의 항상 열린다)`);
}

// ── 진화(C.9·C.10, GDD 2-3·4-2): 흡수하는 봇이 4바퀴 원정을 반복하다 진화할 수 있으면 둥지에서 진화한다 ──
// C.10: 목표는 "진화 1단계 ≈ 원정 8~12회, 5단계 ≈ 원정 40~50회". 단계마다 걸린 원정 수(그 단계 시작부터)를 표로 낸다
// 가드: 단계별 평균 6~14, 5단계 도달 평균 30~60번째 원정, 단계별 진화체 한 가지가 90% 미만 (C.11)
const CAMPAIGNS = 30;
const MAX_RUNS = 60;
const firstEvoRuns: number[] = [];
/** 단계(2~5)별 진화체 선택 횟수 (봇 실제 경로 포함) */
const formCounts: Record<number, Record<string, number>> = { 2: {}, 3: {}, 4: {}, 5: {} };
let allEvos = 0;
const stageRuns: number[][] = [[], [], [], []];
const finalRuns: number[] = [];
for (let seed = 1; seed <= CAMPAIGNS; seed++) {
  const save = newSaveData('hollow', 0);
  save.tiles.deck = sanitizeDeck(save.tiles, 'hollow');
  let stageStart = 0;
  for (let run = 1; run <= MAX_RUNS; run++) {
    const e = playExpedition(
      createExpedition({
        factionId: 'hollow', seed: seed * 1000 + run, runId: nextRunId(save), hunger: save.nest.hunger, condition: save.nest.condition,
        deck: sanitizeDeck(save.tiles, 'hollow'), risk: save.nest.risk, stability: save.nest.stability, build: save.build, evolution: save.evolution,
      }),
      { returnAfterLap: 4, absorb: 'absorb' },
    );
    recordExpedition(save, e, 0);
    // 둥지에서 쉬고 먹인다 (패배 쇠약 해소). 안정 수치는 둥지 행동으로 오르므로 쓰다듬기 한 번을 돌본다
    save.nest.hunger = 20;
    save.nest.condition = 80;
    save.nest.weakened = false;
    if (canEvolve(save.evolution)) {
      const tier = save.evolution.tierIndex;
      const r = performEvolution(save, 0);
      if (r.ok) {
        allEvos++;
        stageRuns[tier]!.push(run - stageStart);
        stageStart = run;
        if (tier === 0) firstEvoRuns.push(run);
        if (tier === 3) finalRuns.push(run);
        formCounts[r.form.tier]![r.form.id] = (formCounts[r.form.tier]![r.form.id] ?? 0) + 1;
      }
    }
  }
}
const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
console.log(`\n진화 (흡수 봇 ${CAMPAIGNS}명 × 4바퀴 원정 최대 ${MAX_RUNS}회, 진화 가능하면 둥지에서 진화) — 필요 흡수 ${BALANCE.provisional.evolution.absorbsNeeded.join('/')}`);
console.log('  단계(진화)   도달 인원  평균 원정  최소  최대   (그 단계 시작부터 센 원정 수)');
const stageNames = ['1→2', '2→3', '3→4', '4→5'];
stageRuns.forEach((rs, i) => {
  console.log(`  ${stageNames[i]}단계      ${String(rs.length).padStart(2)}/${CAMPAIGNS}     ${avg(rs).toFixed(1).padStart(5)}    ${String(rs.length ? Math.min(...rs) : '-').padStart(3)}   ${String(rs.length ? Math.max(...rs) : '-').padStart(3)}`);
});
console.log(`  5단계 도달 ${finalRuns.length}/${CAMPAIGNS} · 평균 ${avg(finalRuns).toFixed(1)}번째 원정 (최소 ${finalRuns.length ? Math.min(...finalRuns) : '-'} · 최대 ${finalRuns.length ? Math.max(...finalRuns) : '-'})`);
// 진화체 분포: 단계별로 나온 진화체와 비율 (이름은 자리 표시, 호로 설정). 기본형 = 후보 없음 (경로 포함)
console.log(`  진화체 분포 (총 진화 ${allEvos}회)`);
for (const tier of [2, 3, 4, 5]) {
  const counts = formCounts[tier]!;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const top = sorted.map(([id, n]) => `${formName(FORM_TABLE.find((f) => f.id === id)!, 'hollow')} ${n}`).slice(0, 8).join(' · ');
  const base = FORM_TABLE.find((f) => f.tier === tier && f.fallback)!.id;
  const baseShare = (counts[base] ?? 0) / Math.max(1, total);
  console.log(`    ${tier}단계 ${sorted.length}/${formsOfTier(tier).length}종 (기본형 ${(baseShare * 100).toFixed(0)}%): ${top}`);
  // 독점 가드는 기본형을 뺀 진화체 기준. 기본형 비율은 참고로 출력한다 (봇 분포가 1~2계통에 몰려 높게 나온다: dev-log C.11)
  const real = sorted.filter(([id]) => id !== base);
  const realTotal = real.reduce((a, [, n]) => a + n, 0);
  if (realTotal >= 5 && real[0]![1] / realTotal >= 0.9) failures.push(`진화: ${tier}단계 ${formName(FORM_TABLE.find((f) => f.id === real[0]![0])!, 'hollow')} 가 ${((real[0]![1] / realTotal) * 100).toFixed(0)}% 독점 (>= 90%, 기본형 제외)`);
  if (baseShare > 0.8) console.log(`      → 참고: 기본형이 ${(baseShare * 100).toFixed(0)}% (봇이 1~2계통에 집중해 흡수해서 조건에 맞는 진화체가 없다)`);
}
if (firstEvoRuns.length < CAMPAIGNS * 0.8) failures.push(`진화: 흡수 봇 중 첫 진화 도달 ${firstEvoRuns.length}/${CAMPAIGNS} < 80%`);
stageRuns.forEach((rs, i) => {
  const m = avg(rs);
  if (rs.length < CAMPAIGNS * 0.8) failures.push(`진화: ${stageNames[i]}단계 도달 ${rs.length}/${CAMPAIGNS} < 80% (원정 ${MAX_RUNS}회 안)`);
  else if (m < 6 || m > 14) failures.push(`진화: ${stageNames[i]}단계 평균 ${m.toFixed(1)}번째 원정 (목표 6~14)`);
});
if (finalRuns.length >= CAMPAIGNS * 0.8) {
  const m = avg(finalRuns);
  if (m < 30 || m > 60) failures.push(`진화: 5단계 도달 평균 ${m.toFixed(1)}번째 원정 (목표 30~60)`);
}

// ── 정책 봇 (C.12, GDD 4-2 v1.1): 집중 봇(1~2계통만 선호해 흡수)과 분산 봇(가장 적게 쌓인 계통을 선호)으로 같은 캠페인을 돌린다 ──
// 선호하지 않는 계통은 50% 확률로만 흡수한다(0 이면 진화에 필요한 횟수를 못 채울 수 있다). 독점 가드는 기본형 제외 진화체 기준
{
  const LIDS = LINEAGES.map((l) => l.id);
  type Policy = { name: string; wanted: (seed: number) => (exp: ExpeditionState) => boolean };
  const policies: Policy[] = [
    { name: '집중 봇(1계통 선호)', wanted: (seed) => { const f = LIDS[seed % LIDS.length]!; return (exp) => exp.absorbOffer!.lineageId === f || (exp.absorbRecords.length * 7 + seed) % 2 === 0; } },
    { name: '집중 봇(2계통 선호)', wanted: (seed) => { const f = [LIDS[seed % LIDS.length]!, LIDS[(seed + 2) % LIDS.length]!]; return (exp) => f.includes(exp.absorbOffer!.lineageId) || (exp.absorbRecords.length * 7 + seed) % 2 === 0; } },
    { name: '분산 봇', wanted: (seed) => (exp) => {
      const sc = LIDS.map((l) => exp.evolution.lineageScores[l] ?? 0);
      return (exp.evolution.lineageScores[exp.absorbOffer!.lineageId] ?? 0) <= Math.min(...sc) + 1 || (exp.absorbRecords.length * 7 + seed) % 2 === 0;
    } },
  ];
  console.log(`\n정책 봇 진화 (봇 ${CAMPAIGNS}명 × 4바퀴 원정 최대 ${MAX_RUNS}회, 선호 밖 계통은 약 50%만 흡수)`);
  console.log('  봇                  1→2    2→3    3→4    4→5   (도달/평균 원정)   단계별 기본형 비율');
  for (const pol of policies) {
    const reach: number[][] = [[], [], [], []];
    const counts: Record<number, Record<string, number>> = { 2: {}, 3: {}, 4: {}, 5: {} };
    for (let seed = 1; seed <= CAMPAIGNS; seed++) {
      const save = newSaveData('hollow', 0);
      save.tiles.deck = sanitizeDeck(save.tiles, 'hollow');
      let stageStart = 0;
      const wanted = pol.wanted(seed);
      for (let run = 1; run <= MAX_RUNS; run++) {
        const e = playExpedition(
          createExpedition({
            factionId: 'hollow', seed: seed * 1000 + run, runId: nextRunId(save), hunger: save.nest.hunger, condition: save.nest.condition,
            deck: sanitizeDeck(save.tiles, 'hollow'), risk: save.nest.risk, stability: save.nest.stability, build: save.build, evolution: save.evolution,
          }),
          { returnAfterLap: 4, absorb: 'absorb', absorbWanted: wanted },
        );
        recordExpedition(save, e, 0);
        save.nest.hunger = 20;
        save.nest.condition = 80;
        save.nest.weakened = false;
        if (canEvolve(save.evolution)) {
          const tier = save.evolution.tierIndex;
          const r = performEvolution(save, 0);
          if (r.ok) {
            reach[tier]!.push(run - stageStart);
            stageStart = run;
            counts[r.form.tier]![r.form.id] = (counts[r.form.tier]![r.form.id] ?? 0) + 1;
          }
        }
      }
    }
    const baseRates = [2, 3, 4, 5].map((tier) => {
      const base = FORM_TABLE.find((f) => f.tier === tier && f.fallback)!.id;
      const total = Object.values(counts[tier]!).reduce((a, b) => a + b, 0);
      return total ? `${(((counts[tier]![base] ?? 0) / total) * 100).toFixed(0)}%` : '-';
    });
    console.log(`  ${pol.name.padEnd(18)} ${reach.map((rs) => `${String(rs.length).padStart(2)}/${avg(rs).toFixed(1).padStart(4)}`).join('  ')}   ${baseRates.join(' / ')}`);
    for (const tier of [2, 3, 4, 5]) {
      const base = FORM_TABLE.find((f) => f.tier === tier && f.fallback)!.id;
      const sorted = Object.entries(counts[tier]!).sort((a, b) => b[1] - a[1]);
      const top = sorted.map(([id, n]) => `${formName(FORM_TABLE.find((f) => f.id === id)!, 'hollow')} ${n}`).slice(0, 6).join(' · ');
      console.log(`      ${tier}단계 ${sorted.length}/${formsOfTier(tier).length}종: ${top}`);
      const real = sorted.filter(([id]) => id !== base);
      const realTotal = real.reduce((a, [, n]) => a + n, 0);
      // 분산 봇이 균형형을 얻는 것은 의도한 결과다(계통을 고르게 쌓는 정책). C.41: 공격 계열이 3가지로 섞여 약점 적중이 빌드와 무관해지면서 흡수 계통 분포가 균일해져
      // 분산 봇의 4단계가 거의 전부 균형형이 되므로 이 조합만 독점 가드에서 뺀다 (집중 봇·전체 봇 가드는 그대로)
      const intendedBalanced = pol.name === '분산 봇' && formName(FORM_TABLE.find((f) => f.id === real[0]?.[0])!, 'hollow').startsWith('균형형');
      if (!intendedBalanced && realTotal >= 5 && real[0]![1] / realTotal >= 0.9) failures.push(`진화(${pol.name}): ${tier}단계 ${formName(FORM_TABLE.find((f) => f.id === real[0]![0])!, 'hollow')} 가 ${((real[0]![1] / realTotal) * 100).toFixed(0)}% 독점 (>= 90%, 기본형 제외)`);
    }
    const lastRuns = reach[3]!;
    if (lastRuns.length < CAMPAIGNS * 0.8) console.log(`      → 참고: 5단계 도달 ${lastRuns.length}/${CAMPAIGNS}`);
  }
}

// ── 진화체 테이블 점검 (GDD 4-2 v1.0): 도달 가능성 · 기본형 1개 · 선택 모호성 · "후보 없음 → 기본형" 비율 ──
{
  const EVC = BALANCE.provisional.evolution;
  const t0 = Date.now();
  const reports = analyzeTable(FORM_TABLE, LINEAGES.map((l) => l.id), EVC.absorbsNeeded, { ...EVC.analysis, skews: [...EVC.analysis.skews], rareWeight: EVC.rareWeight });
  console.log(`\n진화체 테이블 점검 (계통 ${LINEAGES.length}개, 흡수 분포 전수+무작위, ${((Date.now() - t0) / 1000).toFixed(1)}초)`);
  console.log('  단계  진화체(+기본형)  필요 흡수  분포 샘플  도달 불가  모호  후보 없음→기본형(경로 무시)  (경로 포함)');
  for (const r of reports) {
    console.log(`  ${r.tier}     ${String(r.formCount).padStart(3)}(+${r.fallbackCount})        ${String(r.need).padStart(3)}    ${String(r.samples).padStart(8)}    ${String(r.unreachable.length).padStart(3)}    ${String(r.ambiguous).padStart(3)}      ${(r.fallbackRate * 100).toFixed(1).padStart(5)}%                    ${(r.fallbackRateWithPath * 100).toFixed(1).padStart(5)}%`);
  }
  console.log('  단계별 집중형 분포 기본형 비율(경로 포함): 1계통 몰림 / 2계통 몰림 / 3계통 / 균등');
  for (const r of reports) {
    console.log(`  ${r.tier}     ${CONCENTRATION_PROFILES.map((p) => `${(r.fallbackByProfile[p.key] * 100).toFixed(1).padStart(5)}%`).join(' / ')}`);
  }
  failures.push(...reportProblems(reports, EVC.analysis.maxFallbackRate).map((p) => `진화체 테이블: ${p}`));
}

if (check) {
  if (failures.length > 0) {
    console.error(`회귀 가드 실패:\n- ${failures.join('\n- ')}`);
    process.exit(1);
  }
  console.log('\n회귀 가드 통과');
}
