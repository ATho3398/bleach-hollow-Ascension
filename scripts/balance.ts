// 밸런스 점검 (npm run balance, CI 는 --check 로 회귀 가드 판정)
// 시스템별 지표를 여기에 더한다. 가드를 어기면 --check 일 때 종료 코드 1.

import { BALANCE, BALANCE_VERSION } from '../src/config/balance';
import { ENEMIES, enemyPatternKind, POOL_CONFIG, scaleEnemy } from '../src/data/enemies';
import { ENEMY_PATTERN_KINDS } from '../src/data/schema';
import { createCombat, elapsedSeconds, playCombatBot, playCombatHuman, storedStartGaugeOf, type CombatParams, type CombatState } from '../src/engine/combat';
import { enemyPool } from '../src/engine/enemyPool';
import { createExpedition, enemyScale, playExpedition, summarize, type ExpeditionState } from '../src/engine/expedition';
import { buildCombatParams, canAbsorb, completedElements, gainTrait, newBuild } from '../src/engine/absorb';
import { FORM_TABLE, formName, formsOfTier } from '../src/data/evolution';
import { ELEMENT_IDS } from '../src/data/elements';
import { ATTACK_CATEGORIES } from '../src/data/schema';
import { analyzeTree, applyEvolutionToParams, comboRulesOf, currentStats, newEvolution, worldRefStat } from '../src/engine/evolution';
import { newSaveData, nextRunId, performRebirth, recordExpedition, sanitizeDeck, newTileStock, type SaveData } from '../src/game';
import { inheritableTraits } from '../src/engine/rebirth';
import { RANK_HOLDERS } from '../src/data/ranks';
import { GROUNDS } from '../src/data/grounds';
import { BOSSES } from '../src/data/bosses';
import { STORY_CHAPTERS, chapterContent, groundBossId } from '../src/data/story';
import { bossSetupOf } from '../src/engine/expedition';
import { createTowerCombat, towerFloor } from '../src/engine/tower';
import { applyDifficultyToParams, difficultyEnemyScale, enemyAtDifficulty, recommendedDifficulty, MAX_DIFFICULTY } from '../src/engine/difficulty';

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
  // C.47: 특성은 속성 8종 × 8개. 기준 빌드는 원소 공격 특성(적 속성에 따라 강·약·보통이 섞인다)
  { name: 'skill 1개(공격)', params: buildOf(['t-thunder-c']), ref: true, elite: [0.6, 0.85] },
  { name: 'skill 2개(공격·막기)', params: buildOf(['t-thunder-c', 't-fire-guard']), ref: true, elite: [0.6, 0.85] },
  // C.34 (GDD 17-3): 같은 계열 공격 특성 둘은 서로 체인이 된다 — 체인이 쉬워진 빌드
  { name: 'skill 2개(같은 계열 공격 2)', params: buildOf(['t-thunder-c', 't-water-c']), ref: true, elite: [0.6, 0.85] },
  // C.34 ③ (GDD 17-3): 2단계 콤보(탄 계열 체인2 연속 2번 → 콤보 블록)가 켜진 같은 빌드 — 참고 출력만
  { name: 'skill 1개(공격)+콤보(2단계 규칙)', params: { ...buildOf(['t-thunder-c']), combos: comboRulesOf({ ...newEvolution(), tierIndex: 1 }) }, ref: false },
  { name: 'skill 3개(공격·막기·회복)', params: buildOf(['t-fire-a', 't-earth-guard', 't-thunder-heal']), ref: false },
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
// C.15 (GDD 14-5): 적 풀 전체(테스트 고정 적 제외)를 패턴 종류별로 묶어서 본다. 종류마다 적 8종(속성 8, C.47) × N판
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
// ── 분류·속성별 승률 (C.47, GDD 20-1·20-2): 공격 특성 1개 빌드를 분류 3종 × 속성 8종으로 바꿔 사람형 봇으로 돌린다. 일반 적 90%↑ 가드, 강적은 참고 ──
{
  const NC = 60;
  const FAM_OF: Record<string, string> = { physical: 'a', special: 'c', mixed: 'b' };
  console.log(`\n분류·속성별 승률 (사람형 봇, 공격 특성 1개, 적 풀 전체 × ${NC}판) — 일반 ${TARGET.normal.win * 100}%↑ 가드`);
  const rowOf = (label: string, traitId: string) => {
    const params = buildOf([traitId]);
    let nw = 0;
    let ng = 0;
    let ew = 0;
    let eg = 0;
    let secs = 0;
    for (const enemy of POOL_ENEMIES) {
      for (let seed = 1; seed <= NC; seed++) {
        const st = playCombatHuman(createCombat(seed, { enemy, params }));
        if (enemy.class === 'normal') {
          ng++;
          if (st.status === 'won') {
            nw++;
            secs += elapsedSeconds(st);
          }
        } else {
          eg++;
          if (st.status === 'won') ew++;
        }
      }
    }
    console.log(`  ${label.padEnd(14)} 일반 ${((nw / ng) * 100).toFixed(0)}% (승리 ${(secs / Math.max(1, nw)).toFixed(1)}초) · 강적 ${((ew / eg) * 100).toFixed(0)}%`);
    if (nw / ng < TARGET.normal.win) failures.push(`분류·속성 ${label}: 일반 승률 ${((nw / ng) * 100).toFixed(0)}% < ${TARGET.normal.win * 100}%`);
  };
  for (const cat of ATTACK_CATEGORIES) rowOf(`분류 ${cat}`, `t-fire-${FAM_OF[cat]}`);
  for (const el of ELEMENT_IDS) rowOf(`속성 ${el}`, `t-${el}-a`);
  console.log(`  (혈 흡혈 ${BALANCE.provisional.elements.drainFraction * 100}% · 한 전투 상한 최대 체력 ${BALANCE.provisional.elements.drainCapFraction * 100}%, C.53)`);
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
  s.finisher = { kind: 'basic-attack', traitId: null, element: null };
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

// ── 적 출현 풀 분포 (C.15, GDD 14-5): 바퀴·출처별 풀 구성과 속성 분포 (C.47: 약점 계통 → 적 속성) ──
{
  const LIDS = [...ELEMENT_IDS];
  const WEAK_MIN = 0.06; // 가드: 속성 하나의 적 비율 하한 (균등이면 1/속성 수 = 12.5%)
  console.log('\n적 출현 풀 (가중치 기준 구성, 속성 분포는 풀 가중치 합산)');
  console.log('  등급   출처         바퀴  풀(종)  패턴 종류 비율                       속성 비율');
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
          byWeak[e.enemy.element] = (byWeak[e.enemy.element] ?? 0) + e.weight / total;
        }
        const kinds = Object.entries(byKind).map(([k, v]) => `${k} ${(v * 100).toFixed(0)}%`).join(' · ');
        const weak = LIDS.map((l) => `${(((byWeak[l] ?? 0)) * 100).toFixed(0)}%`).join('/');
        console.log(`  ${cls.padEnd(6)} ${source.padEnd(11)} ${String(lap).padStart(3)}  ${String(pool.length).padStart(4)}   ${kinds.padEnd(44)} ${weak}`);
        for (const l of LIDS) {
          if ((byWeak[l] ?? 0) < WEAK_MIN) failures.push(`적 풀(${cls} ${source} ${lap}바퀴): ${l} 속성 적 비율 ${(((byWeak[l] ?? 0)) * 100).toFixed(0)}% < ${WEAK_MIN * 100}%`);
        }
      }
    }
  }
  // 실제 원정에서 만난 적 (전투 승리 처리, 6바퀴까지): 속성·패턴 종류 분포
  const seenWeak: Record<string, number> = {};
  const seenKind: Record<string, number> = {};
  let seen = 0;
  const kindOf = new Map(ENEMIES.map((e) => [e.id, enemyPatternKind(e)]));
  const weakOf = new Map(ENEMIES.map((e) => [e.id, e.element]));
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
  console.log(`  실제 원정 200회(6바퀴까지, 전투 승리 처리)에서 만난 적 ${seen}마리: 속성 ${LIDS.map((l) => `${(((seenWeak[l] ?? 0) / seen) * 100).toFixed(0)}%`).join('/')} · 종류 ${Object.entries(seenKind).map(([k, n]) => `${k} ${((n / seen) * 100).toFixed(0)}%`).join(' · ')}`);
  for (const l of LIDS) {
    if ((seenWeak[l] ?? 0) / seen < WEAK_MIN) failures.push(`원정에서 만난 적: ${l} 속성 적 비율 ${(((seenWeak[l] ?? 0) / seen) * 100).toFixed(0)}% < ${WEAK_MIN * 100}%`);
  }
}

// ── 흡수·리스크(P3, C.6 조건): 흡수 가능 비율, 흡수 자동 플레이(계통 모으기) ──
console.log(`\n흡수 원정 (자동 플레이 ${M}회: 흡수 가능하면 흡수하고 같은 속성을 모음 / 비교: 항상 놓아줌) — 흡수 조건(임시): 마무리 일격이 상성 우위 스킬(약점 없는 적은 아무 스킬) 또는 그 체인3 ${BALANCE.provisional.absorb.weakChain3ForAbsorb}회 이상, 장착 skill 없으면 첫 흡수 보장`);
const absorbStats: Record<string, { breakthrough: number; defeated: number; absorbableRate: number; endRisk: number }> = {};
// 섞음 봇 (GDD 23-2 "평범한 원정"): 흡수 화면마다 흡수와 놓아주기를 번갈아 한다
const mixedWanted = (e: ExpeditionState) => e.absorbRecords.filter((a) => a.absorbed).length <= e.absorbRecords.filter((a) => !a.absorbed).length;
const POLICY_NAME = { absorb: '흡수', mixed: '섞음', release: '놓아줌' } as const;
for (const stopLap of [4, 6]) {
  for (const policy of ['absorb', 'mixed', 'release'] as const) {
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
    let food = 0;
    for (let seed = 1; seed <= M; seed++) {
      const e = playExpedition(createExpedition({ factionId: 'hollow', seed, hunger: 20, condition: 80, deck }), { returnAfterLap: stopLap, absorb: policy === 'release' ? 'release' : 'absorb', ...(policy === 'mixed' ? { absorbWanted: mixedWanted } : {}) });
      absorbs += e.absorbRecords.filter((a) => a.absorbed).length;
      releases += e.absorbRecords.filter((a) => !a.absorbed).length;
      if (e.breakthrough) bt++;
      if (e.outcome === 'defeated') defeated++;
      traits += e.build.owned.length;
      if (completedElements(e.build).length > 0) lineage++;
      risk += e.risk;
      food += e.foodLoot.length;
      for (const b of e.battles) {
        secs += b.durationSeconds;
        battles++;
        voids += b.voidUsed;
        if (b.won) wins++;
        if (b.absorbable) absorbable++;
      }
    }
    absorbStats[`${stopLap}-${policy}`] = { breakthrough: bt, defeated, absorbableRate: wins ? absorbable / wins : 0, endRisk: risk / M };
    console.log(
      `  ${stopLap}바퀴 ${POLICY_NAME[policy]}: 흡수 ${(absorbs / M).toFixed(1)}회 · 놓아줌 ${(releases / M).toFixed(1)}회 · 승리 중 흡수 가능 ${wins ? ((absorbable / wins) * 100).toFixed(0) : 0}% · 한계 돌파 ${bt}/${M} · 패배 ${defeated}/${M} · 끝 특성 ${(traits / M).toFixed(1)}개 · 속성 보너스 ${lineage}/${M} · 끝 리스크 ${(risk / M).toFixed(0)} · 전투당 ${(secs / battles).toFixed(1)}초 · 공허 사용 ${(voids / battles).toFixed(2)}/전투 · 먹이 전리품 ${(food / M).toFixed(1)}개`,
    );
  }
}
// 회귀 가드(흡수 봇은 쉬지도 놓아주지도 않는 극단이다): 기본 4바퀴 흡수 플레이는 절반 이하만 돌파하고, 항상 놓아주면 돌파하지 않으며, 6바퀴 흡수 플레이는 돌파가 의미 있게 생겨야 한다
if ((absorbStats['4-absorb']?.breakthrough ?? 0) > M * 0.5) failures.push(`4바퀴 흡수 플레이 돌파 ${absorbStats['4-absorb']?.breakthrough}/${M} > 50%`);
if ((absorbStats['6-absorb']?.breakthrough ?? 0) < M * 0.5) failures.push(`6바퀴 흡수 플레이 돌파 ${absorbStats['6-absorb']?.breakthrough}/${M} < 50% (리스크가 약하다)`);
if ((absorbStats['4-release']?.breakthrough ?? 0) > 0) failures.push('4바퀴에서 항상 놓아줘도 한계 돌파가 생긴다');
// GDD 23-2 리스크 목표 (C.52): 평범한 4바퀴(흡수·놓아주기 섞음)는 끝 40~60·돌파 10% 이하, 둥지 재우기·쓰다듬기는 한 번에 −20 안팎(−15~−25)
{
  const m4 = absorbStats['4-mixed']!;
  // C.63 (마스터 결정): 끝 리스크 판정은 60판이면 잡음이 ±3 쯤이라 경계(40)에서 흔들린다 → 같은 봇을 시드 1~RISK_M 으로 더 돌린 평균으로 판정한다 (위 60판 줄은 참고)
  const RISK_M = 300;
  let riskSum = 0;
  for (let seed = 1; seed <= RISK_M; seed++) {
    riskSum += playExpedition(createExpedition({ factionId: 'hollow', seed, hunger: 20, condition: 80, deck }), { returnAfterLap: 4, absorb: 'absorb', absorbWanted: mixedWanted }).risk;
  }
  m4.endRisk = riskSum / RISK_M;
  console.log(`  리스크 판정 표본: 4바퀴 섞음 ${RISK_M}판(시드 1~${RISK_M}) 평균 끝 리스크 ${m4.endRisk.toFixed(1)}`);
  // C.63 (마스터 승인, GDD 28-1): 300판 판정에서 치명타 전(39.40)·후(39.4) 모두 40 바로 아래 — 목표 40~60(23-2, provisional)은 그대로 두고 회귀 가드 하한만 39
  // C.69 (B-1): 놓아주기 −6 → −5 로 41.3 이 되어 가드 하한을 목표대로 40 으로 되돌림
  const RISK_GUARD_MIN = 40;
  console.log(`  리스크 목표(23-2): 4바퀴 섞음 끝 ${m4.endRisk.toFixed(1)} (목표 40~60, 가드 하한 ${RISK_GUARD_MIN} — C.69) · 돌파 ${m4.breakthrough}/${M} (10% 이하) · 6바퀴 흡수 돌파 ${absorbStats['6-absorb']!.breakthrough}/${M} (50% 이상) · 둥지 재우기 ${BALANCE.provisional.risk.nestActions.sleep.risk} · 쓰다듬기 ${BALANCE.provisional.risk.nestActions.pet.risk}`);
  if (m4.endRisk < RISK_GUARD_MIN || m4.endRisk > 60) failures.push(`4바퀴 섞음 원정 끝 리스크 ${m4.endRisk.toFixed(1)} — 가드 ${RISK_GUARD_MIN}~60 (목표 40~60, GDD 23-2·28-1)`);
  if (m4.breakthrough > M * 0.1) failures.push(`4바퀴 섞음 원정 돌파 ${m4.breakthrough}/${M} > 10% (GDD 23-2 "무리해야 돌파")`);
  for (const a of ['sleep', 'pet'] as const) {
    const r = BALANCE.provisional.risk.nestActions[a].risk;
    if (r > -15 || r < -25) failures.push(`둥지 ${a} 리스크 ${r} — 목표 −20 안팎 (GDD 23-2)`);
  }
}
// ── 타일 변수 5종 (C.57, GDD 25-5): 4바퀴 섞음 봇으로 타일 변수 끔/켬 비교 (켬 = 드래프트 카드를 시너지 우선으로 골라 바로 놓음, 이벤트는 봇 선택, 바퀴 변이·시너지 발동) ──
// 가드(두 종족 합산 평균): 보상(먹이 개수·번 골드) 증가 +25% 이하, 켬 끝 리스크 40~60, 패배율 +5%p 이하. 종족별 값은 참고 출력
{
  const TVN = 1000;
  const tvStat = (fid: string, on: boolean) => {
    const dk = sanitizeDeck(newTileStock(), fid);
    let food = 0;
    let gold = 0;
    let def = 0;
    let risk = 0;
    let syn = 0;
    let ev = 0;
    let mut = 0;
    let dr = 0;
    for (let seed = 1; seed <= TVN; seed++) {
      const e = playExpedition(createExpedition({ factionId: fid, seed, hunger: 20, condition: 80, deck: dk, tileVariants: on }), { returnAfterLap: 4, absorb: 'absorb', absorbWanted: mixedWanted });
      food += e.foodLoot.length;
      gold += e.goldLoot.filter((g) => g.amount > 0).reduce((x, g) => x + g.amount, 0);
      if (e.outcome === 'defeated') def++;
      risk += e.risk;
      syn += e.variantLog.synergies.length;
      ev += e.variantLog.events.length;
      mut += e.variantLog.mutations.length;
      dr += e.variantLog.drafts.length;
    }
    return { food: food / TVN, gold: gold / TVN, def: def / TVN, risk: risk / TVN, syn: syn / TVN, ev: ev / TVN, mut: mut / TVN, dr: dr / TVN };
  };
  console.log(`\n타일 변수 (GDD 25-5, 4바퀴 섞음 봇 ${TVN}회 × 종족, 끔 → 켬)`);
  const sumOff = { food: 0, gold: 0, def: 0, risk: 0 };
  const sumOn = { food: 0, gold: 0, def: 0, risk: 0 };
  for (const fid of ['hollow', 'shinigami']) {
    const off = tvStat(fid, false);
    const on = tvStat(fid, true);
    for (const k of ['food', 'gold', 'def', 'risk'] as const) {
      sumOff[k] += off[k] / 2;
      sumOn[k] += on[k] / 2;
    }
    const pct = (a: number, b: number) => `${b >= a ? '+' : ''}${(((b - a) / a) * 100).toFixed(1)}%`;
    console.log(
      `  ${fid.padEnd(9)} 먹이 ${off.food.toFixed(2)} → ${on.food.toFixed(2)} (${pct(off.food, on.food)}) · 골드 ${off.gold.toFixed(1)} → ${on.gold.toFixed(1)} (${pct(off.gold, on.gold)}) · 패배 ${(off.def * 100).toFixed(1)} → ${(on.def * 100).toFixed(1)}% · 끝 리스크 ${off.risk.toFixed(1)} → ${on.risk.toFixed(1)} · 원정당 시너지 ${on.syn.toFixed(2)}·이벤트 ${on.ev.toFixed(2)}·변이 ${on.mut.toFixed(2)}·드래프트 ${on.dr.toFixed(2)}`,
    );
  }
  const fInc = sumOn.food / sumOff.food - 1;
  const gInc = sumOn.gold / sumOff.gold - 1;
  const dInc = sumOn.def - sumOff.def;
  console.log(`  합산 평균: 먹이 +${(fInc * 100).toFixed(1)}% · 골드 +${(gInc * 100).toFixed(1)}% (가드 +25% 이하) · 켬 끝 리스크 ${sumOn.risk.toFixed(1)} (40~60) · 패배율 ${dInc >= 0 ? '+' : ''}${(dInc * 100).toFixed(1)}%p (가드 +5%p 이하)`);
  if (fInc > 0.25) failures.push(`타일 변수: 먹이 보상 +${(fInc * 100).toFixed(1)}% > +25% (GDD 25-5)`);
  if (gInc > 0.25) failures.push(`타일 변수: 골드 보상 +${(gInc * 100).toFixed(1)}% > +25% (GDD 25-5)`);
  if (sumOn.risk < 40 || sumOn.risk > 60) failures.push(`타일 변수: 4바퀴 섞음 끝 리스크 ${sumOn.risk.toFixed(1)} — 목표 40~60 (GDD 25-5)`);
  if (dInc > 0.05) failures.push(`타일 변수: 패배율 +${(dInc * 100).toFixed(1)}%p > +5%p (GDD 25-5)`);
  // 상점 (GDD 25-9, C.60): 원정 1판(4바퀴 섞음, 타일 변수 켬) 평균 골드로 살 수 있는 보통 먹이 수 — 원정 전리품(판당 9~11개)을 대체하지 못하게
  const SHX = BALANCE.provisional.shop;
  const basicPerRun = sumOn.gold / SHX.goldPrices['food-basic']!;
  const [bLo, bHi] = SHX.basicFoodPerRunGuard;
  console.log(`\n상점 (GDD 25-9): 원정 1판 평균 골드 ${sumOn.gold.toFixed(1)} → 보통 먹이(${SHX.goldPrices['food-basic']}골드) ${basicPerRun.toFixed(2)}개 (가드 ${bLo}~${bHi}) · 원정 전리품 먹이 ${sumOn.food.toFixed(2)}개`);
  if (basicPerRun < bLo! || basicPerRun > bHi!) failures.push(`상점: 판당 골드로 살 수 있는 보통 먹이 ${basicPerRun.toFixed(2)}개 (가드 ${bLo}~${bHi} 밖, GDD 25-9)`);
}

// ── 보스 자유 원정 등장 (C.86, GDD 37장): 장 보스가 있는 사냥터마다 4바퀴 섞음 봇(타일 변수 켬, 1단계 새 몸·★1)으로 보스를 이기기 전/후 비교 ──
// 등장 굴림은 따로 난수라 같은 시드 = 보스 칸 전까지 같은 원정(짝 비교). 가드: 두 종족 합산 패배율 +5%p 이하
{
  const FBN = 1000;
  const BF = BALANCE.provisional.boss;
  for (const g of GROUNDS) {
    const bosses = ['hollow', 'shinigami'].map((fid) => groundBossId(fid, g.id));
    if (bosses.every((b) => b === null)) continue;
    let defOff = 0;
    let defOn = 0;
    let appeared = 0;
    let bossLost = 0;
    let goldOn = 0;
    let goldOff = 0;
    const runs = FBN * 2;
    ['hollow', 'shinigami'].forEach((fid, i) => {
      const dk = sanitizeDeck(newTileStock(), fid);
      const boss = bosses[i];
      for (let seed = 1; seed <= FBN; seed++) {
        const mk = (beaten: string[]) => createExpedition({ factionId: fid, seed, hunger: 20, condition: 80, deck: dk, tileVariants: true, groundId: g.id, bossesBeaten: beaten });
        const off = playExpedition(mk([]), { returnAfterLap: 4, absorb: 'absorb', absorbWanted: mixedWanted });
        const on = playExpedition(mk(boss ? [boss] : []), { returnAfterLap: 4, absorb: 'absorb', absorbWanted: mixedWanted });
        if (off.outcome === 'defeated') defOff++;
        if (on.outcome === 'defeated') defOn++;
        if (on.freeBoss?.appear) appeared++;
        if (on.freeBoss?.result && !on.freeBoss.result.won) bossLost++;
        goldOff += summarize(off).keptGold;
        goldOn += summarize(on).keptGold;
      }
    });
    const dInc = (defOn - defOff) / runs;
    console.log(`\n보스 자유 원정 등장 (GDD 37장, 사냥터 ${g.id} 보스 ${bosses.map((b) => b ?? '-').join('/')}, 4바퀴 섞음 봇 ${FBN}회 × 종족, ${BF.freeFromLap}바퀴째부터 ${Math.round(BF.freeChance * 100)}%)`);
    console.log(`  등장 ${appeared}/${runs}(${((appeared / runs) * 100).toFixed(1)}%) · 보스에게 짐 ${bossLost}/${appeared} · 패배율 ${((defOff / runs) * 100).toFixed(1)} → ${((defOn / runs) * 100).toFixed(1)}% (${dInc >= 0 ? '+' : ''}${(dInc * 100).toFixed(1)}%p, 가드 +5%p 이하) · 골드 ${(goldOff / runs).toFixed(1)} → ${(goldOn / runs).toFixed(1)}`);
    if (dInc > 0.05) failures.push(`보스 자유 원정(${g.id}): 패배율 +${(dInc * 100).toFixed(1)}%p > +5%p (GDD 37장 7번)`);
  }
}
// 흡수 가능 비율: 거의 안 되면 빌드가 자라지 않고(가드 25% 이상), 거의 항상이면 조건이 의미 없다(가드 85% 이하).
// C.7: 측정은 "흡수하는 봇" 기준. 항상 놓아주는 봇은 skill 이 하나도 없어 첫 흡수 보장으로 늘 100% 라 의미가 없다 (참고 출력만)
for (const lap of [4, 6]) {
  const ar = absorbStats[`${lap}-absorb`]?.absorbableRate ?? 0;
  if (ar < 0.25) failures.push(`${lap}바퀴 흡수 플레이: 승리 중 흡수 가능 비율 ${(ar * 100).toFixed(0)}% < 25%`);
  if (ar > 0.85) failures.push(`${lap}바퀴 흡수 플레이: 승리 중 흡수 가능 비율 ${(ar * 100).toFixed(0)}% > 85% (조건이 거의 항상 열린다)`);
}

// ── 진화 (C.47, GDD 20-5): 걸음 수 진화. 흡수 봇이 4바퀴 원정을 반복하고, 둥지에 돌아올 때 걸음이 차 있으면 자동 진화한다 ──
// 목표(provisional, 마스터 레벨 디자인): 단계마다 약 1.5 / 2.5 / 3 / 4.5원정. 가드는 단계별 평균이 목표의 0.6~1.8배, 5단계 도달 80% 이상(원정 MAX_RUNS 안)
const CAMPAIGNS = 30;
const MAX_RUNS = 40;
const STAGE_TARGET = [1.5, 2.5, 3, 4.5];
const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
type CampaignStats = { stageRuns: number[][]; finalRuns: number[]; formCounts: Record<number, Record<string, number>>; stepsPerRun: number[]; hidden: number; evolutions: number; finalDefeats: number[]; saves: SaveData[]; /** 그 단계(tierIndex)에 갓 닿은 순간의 세이브 사본 (사냥터 점검용) */ firstAt: Record<number, SaveData[]> };
function campaign(policy: { absorbWanted?: (seed: number) => (exp: ExpeditionState) => boolean; care?: 'good' | 'neglect'; stage?: number } = {}): CampaignStats {
  const out: CampaignStats = { stageRuns: [[], [], [], []], finalRuns: [], formCounts: { 2: {}, 3: {}, 4: {}, 5: {} }, stepsPerRun: [], hidden: 0, evolutions: 0, finalDefeats: [], saves: [], firstAt: {} };
  for (let seed = 1; seed <= CAMPAIGNS; seed++) {
    const save = newSaveData('hollow', seed * 7919);
    save.tiles.deck = sanitizeDeck(save.tiles, 'hollow');
    let stageStart = 0;
    let defeats = 0;
    // 정책은 노리는 단계(stage, tierIndex)에서만 쓴다: 그 전에는 다 흡수해 특성을 모은다 (사람이 노리는 방식)
    const pick = policy.absorbWanted?.(seed);
    const wanted = pick ? (exp: ExpeditionState) => (policy.stage === undefined || exp.evolution.tierIndex === policy.stage ? pick(exp) : true) : undefined;
    for (let run = 1; run <= MAX_RUNS; run++) {
      // 둥지에서 쉬고 먹인다 (패배 쇠약 해소). 돌보지 않는 봇은 허기·컨디션을 그대로 둔다
      if (policy.care !== 'neglect') {
        save.nest.hunger = 20;
        save.nest.condition = 80;
        save.nest.weakened = false;
      }
      const e = playExpedition(
        createExpedition({
          factionId: 'hollow', seed: seed * 1000 + run, runId: nextRunId(save), hunger: save.nest.hunger, condition: save.nest.condition,
          deck: sanitizeDeck(save.tiles, 'hollow'), risk: save.nest.risk, stability: save.nest.stability, build: save.build, evolution: save.evolution,
        }),
        { returnAfterLap: 4, absorb: 'absorb', ...(wanted ? { absorbWanted: wanted } : {}) },
      );
      if (save.evolution.tierIndex < 4) out.stepsPerRun.push(e.evolution.steps - save.evolution.steps); // 마지막 단계는 걸음을 세지 않는다
      if (save.evolution.tierIndex < 4 && e.outcome === 'defeated') defeats++;
      const tier = save.evolution.tierIndex;
      const r = recordExpedition(save, e, 0);
      if (r?.ok) {
        out.evolutions++;
        out.stageRuns[tier]!.push(run - stageStart);
        stageStart = run;
        if (tier === 3) {
          out.finalRuns.push(run);
          out.finalDefeats.push(defeats);
        }
        out.formCounts[r.form.tier]![r.form.id] = (out.formCounts[r.form.tier]![r.form.id] ?? 0) + 1;
        if (r.form.hidden) out.hidden++;
        (out.firstAt[save.evolution.tierIndex] ??= []).push(structuredClone(save));
      }
    }
    out.saves.push(save);
  }
  return out;
}
const stageNames = ['1→2', '2→3', '3→4', '4→5'];
let campaignSaves: SaveData[] = [];
let campaignFirstAt: Record<number, SaveData[]> = {};
let campaignFinalRuns: number[] = [];
let campaignFinalDefeats: number[] = [];
{
  const st = campaign();
  campaignSaves = st.saves;
  campaignFirstAt = st.firstAt;
  campaignFinalRuns = st.finalRuns;
  campaignFinalDefeats = st.finalDefeats;
  console.log(`\n진화 (흡수 봇 ${CAMPAIGNS}명 × 4바퀴 원정 최대 ${MAX_RUNS}회, 귀환 때 자동 진화) — 필요 걸음 ${BALANCE.provisional.evolution.stepsNeeded.join('/')}칸 (숨김)`);
  console.log(`  원정 1회 평균 ${avg(st.stepsPerRun).toFixed(1)}칸 (최소 ${Math.min(...st.stepsPerRun)} · 최대 ${Math.max(...st.stepsPerRun)})`);
  console.log('  단계(진화)   도달 인원  평균 원정  목표   최소  최대   (그 단계 시작부터 센 원정 수)');
  st.stageRuns.forEach((rs, i) => {
    console.log(`  ${stageNames[i]}단계      ${String(rs.length).padStart(2)}/${CAMPAIGNS}     ${avg(rs).toFixed(1).padStart(5)}   ${String(STAGE_TARGET[i]).padStart(4)}   ${String(rs.length ? Math.min(...rs) : '-').padStart(3)}   ${String(rs.length ? Math.max(...rs) : '-').padStart(3)}`);
    const m = avg(rs);
    if (rs.length < CAMPAIGNS * 0.8) failures.push(`진화: ${stageNames[i]}단계 도달 ${rs.length}/${CAMPAIGNS} < 80% (원정 ${MAX_RUNS}회 안)`);
    else if (m < STAGE_TARGET[i]! * 0.6 || m > STAGE_TARGET[i]! * 1.8) failures.push(`진화: ${stageNames[i]}단계 평균 ${m.toFixed(1)}원정 (목표 ${STAGE_TARGET[i]}의 0.6~1.8배 밖)`);
  });
  console.log(`  5단계 도달 ${st.finalRuns.length}/${CAMPAIGNS} · 평균 ${avg(st.finalRuns).toFixed(1)}번째 원정 · 히든 ${st.hidden}/${st.evolutions}회`);
  console.log(`  진화체 분포 (총 진화 ${st.evolutions}회)`);
  for (const tier of [2, 3, 4, 5]) {
    const counts = st.formCounts[tier]!;
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const top = sorted.map(([id, n]) => `${formName(FORM_TABLE.find((f) => f.id === id)!, 'hollow')} ${n}`).slice(0, 8).join(' · ');
    console.log(`    ${tier}단계 ${sorted.length}/${formsOfTier(tier).length}종: ${top}`);
  }
}

// ── 환생 (C.56, GDD 22-7): 위 진화 봇 중 5단계에 닿은 세이브(원정 MAX_RUNS 회를 마친 몸)가 환생(장착 첫 특성 계승)하고 같은 방식으로 다시 5단계까지.
// 계승 효과 = 노력치 10% 누적 + 특성 1개. 진화 타이밍은 걸음 수라 원정 수는 패배(걸음이 덜 쌓임)로만 달라진다 — 그 차이와 패배 수를 본다. 가드는 없음(보고용)
{
  const ready = campaignSaves.filter((s) => s.evolution.tierIndex >= 4).map((s) => structuredClone(s));
  type LifeStat = { runs: number[]; defeats: number[]; carry: number[]; reborn: number };
  const lives: LifeStat[] = [];
  // 첫 생: 위 캠페인의 5단계 도달 원정 수·패배 수 (같은 봇·같은 정책)
  ready.forEach((save, i) => {
    for (let life = 1; life <= 3; life++) {
      const st = (lives[life] ??= { runs: [], defeats: [], carry: [], reborn: 0 });
      const keep = inheritableTraits(save.build)[0] ?? null;
      if (!performRebirth(save, keep, 0).ok) break;
      st.carry.push(Object.values(save.evolution.carry ?? {}).reduce((a, b) => a + b, 0));
      let defeats = 0;
      for (let run = 1; run <= MAX_RUNS; run++) {
        save.nest.hunger = 20;
        save.nest.condition = 80;
        save.nest.weakened = false;
        const e = playExpedition(
          createExpedition({
            factionId: 'hollow', seed: (i + 1) * 100003 + life * 1009 + run, runId: nextRunId(save), hunger: save.nest.hunger, condition: save.nest.condition,
            deck: sanitizeDeck(save.tiles, 'hollow'), risk: save.nest.risk, stability: save.nest.stability, build: save.build, evolution: save.evolution,
          }),
          { returnAfterLap: 4, absorb: 'absorb' },
        );
        if (e.outcome === 'defeated') defeats++;
        const r = recordExpedition(save, e, 0);
        if (r?.ok && r.form.id === 'h5:reborn') st.reborn++;
        if (save.evolution.tierIndex >= 4) {
          st.runs.push(run);
          st.defeats.push(defeats);
          break;
        }
      }
      if (save.evolution.tierIndex < 4) break;
      // 다음 환생 전 5단계에서 노력치를 채운다 (첫 생 세이브처럼 원정을 더 다닌 몸): 남은 원정만큼 더 다닌다
      for (let run = 1; run <= 6; run++) {
        const e = playExpedition(
          createExpedition({
            factionId: 'hollow', seed: (i + 1) * 7777 + life * 31 + run, runId: nextRunId(save), hunger: 20, condition: 80,
            deck: sanitizeDeck(save.tiles, 'hollow'), risk: save.nest.risk, stability: save.nest.stability, build: save.build, evolution: save.evolution,
          }),
          { returnAfterLap: 4, absorb: 'absorb' },
        );
        recordExpedition(save, e, 0);
      }
    }
  });
  const first = campaignFinalRuns;
  const firstDefeats = campaignFinalDefeats;
  console.log(`\n환생 (5단계 세이브 ${ready.length}개가 환생 → 다시 5단계까지, 같은 흡수 봇·4바퀴) — 계승: 노력치 ${BALANCE.provisional.rebirth.evCarryRate * 100}% 누적 + 장착 첫 특성`);
  console.log(`  첫 생      5단계 평균 ${avg(first).toFixed(2)}번째 원정 · 그때까지 패배 평균 ${avg(firstDefeats).toFixed(2)}회`);
  for (const life of [1, 2, 3]) {
    const st = lives[life];
    if (!st) continue;
    console.log(`  환생 ${life}회 후 5단계 ${st.runs.length}/${ready.length} · 평균 ${avg(st.runs).toFixed(2)}번째 원정 (첫 생 대비 ${(avg(st.runs) - avg(first)).toFixed(2)}) · 패배 평균 ${avg(st.defeats).toFixed(2)}회 · 계승 노력치 합 평균 ${avg(st.carry).toFixed(1)} · 환생 히든 ${st.reborn}`);
  }
}

// ── 정책 봇 (C.47): 한 속성만 / 마주 보는 두 원소만 / 노멀만 흡수, 돌보지 않음, 놓아주기 위주. 히든 도달률을 본다 ──
{
  type Policy = { name: string; wanted?: (seed: number) => (exp: ExpeditionState) => boolean; care?: 'good' | 'neglect'; stage?: number; expect?: string };
  const only = (els: string[]) => () => (exp: ExpeditionState) => els.includes(exp.absorbOffer!.element);
  const policies: Policy[] = [
    { name: '물·흙만 흡수', wanted: only(['water', 'earth']), stage: 2, expect: 'h4:fusion:water+earth' },
    { name: '불·뇌만 흡수', wanted: only(['fire', 'thunder']), stage: 2, expect: 'h4:fusion:fire+thunder' },
    { name: '혈+불만 흡수', wanted: only(['blood', 'fire']), stage: 2, expect: 'h4:special:blood' },
    { name: '노멀만 흡수', wanted: only(['normal']), stage: 2, expect: 'h4:pure' },
    { name: '돌보지 않음', care: 'neglect', expect: 'h4:fail' },
    { name: '대부분 놓아줌', wanted: (seed) => (exp) => (exp.absorbRecords.length * 7 + seed) % 4 === 0, stage: 3, expect: 'h5:restraint' },
  ];
  console.log(`\n정책 봇 진화 (봇 ${CAMPAIGNS}명 × 4바퀴 원정 최대 ${MAX_RUNS}회, 정책은 노리는 단계에서만) — 히든 도달 (그 정책이 노리는 히든 / 전체 히든)`);
  for (const pol of policies) {
    const st = campaign({ absorbWanted: pol.wanted, care: pol.care, stage: pol.stage });
    const all = Object.values(st.formCounts).flatMap((c) => Object.entries(c));
    const target = all.filter(([id]) => id === pol.expect).reduce((a, [, n]) => a + n, 0);
    const hiddenTop = all.filter(([id]) => FORM_TABLE.find((f) => f.id === id)?.hidden).sort((a, b) => b[1] - a[1]).map(([id, n]) => `${formName(FORM_TABLE.find((f) => f.id === id)!, 'hollow')} ${n}`).join(' · ');
    console.log(`  ${pol.name.padEnd(10)} 노림 ${pol.expect} ${target}/${CAMPAIGNS} · 히든 ${st.hidden}/${st.evolutions} · 5단계 ${st.finalRuns.length}/${CAMPAIGNS} — ${hiddenTop || '히든 없음'}`);
  }
}

// ── 진화 트리 점검 (GDD 20-5): 모든 진화체(일반 35 + 히든 12)가 무작위 상태에서 실제로 뽑히는가, 단계별 히든 비율 ──
{
  const EVC = BALANCE.provisional.evolution;
  const t0 = Date.now();
  const rep = analyzeTree(FORM_TABLE, 'hollow', EVC.analysis.samples, EVC.analysis.seed);
  const normalCount = FORM_TABLE.filter((f) => !f.hidden).length;
  const hiddenCount = FORM_TABLE.filter((f) => f.hidden).length;
  console.log(`\n진화 트리 점검 (일반 ${normalCount}+1단계 + 히든 ${hiddenCount}, 단계당 무작위 상태 ${EVC.analysis.samples}개, ${((Date.now() - t0) / 1000).toFixed(1)}초)`);
  for (const [tier, r] of Object.entries(rep.hiddenRate)) console.log(`  ${tier}단계: 히든 ${((r.hidden / r.samples) * 100).toFixed(1)}%`);
  console.log(`  한 번도 안 뽑힌 진화체: ${rep.unreachable.length ? rep.unreachable.join(', ') : '없음'}`);
  if (rep.unreachable.length > 0) failures.push(`진화 트리: 뽑히지 않는 진화체 ${rep.unreachable.join(', ')}`);
  // 기획의 일반 35종 = 1단계(진화체 없음, 종족 설정 baseStats) + 진화체 34
  if (normalCount !== 34 || hiddenCount !== 12) failures.push(`진화 트리: 일반 진화체 ${normalCount}·히든 ${hiddenCount} (기획 34(+1단계) + 12, 환생 전용 포함)`);
}

// ── 권장 단계 등가 점검 (C.75, GDD 32-1 2번): n단계 몸(그 단계 기본 진화체, 노력치 0, skill 1개 빌드)이 ★n 적 풀과 1:1 로 싸우면 1단계 몸 ★1 과 같은 길이·승률이어야 한다 ──
// (내 능력치는 절대값이지만 적 기준 능력치·체력·공격이 ★ 를 따라 같이 오르므로 "권장 단계 = 일반 약 45초·강적 약 90초" 가 단계마다 유지된다.) 가드: 일반 처치 시간이 2~5단계 평균의 0.8~1.25배, 강적 승률이 평균 ±15%p 안 (★1 은 입문 보정으로 더 쉬움, C.76)
{
  const NM = 40;
  const forms = [null, 't2:base', 't3:base', 't4:normal', 't5:normal:mixed'];
  console.log(`\n권장 단계 등가 (사람형 봇, n단계 기본 몸 + skill 1개 vs ★n 적 풀, 종류마다 ${NM}판) — 체력 배율 (k−1)×${BALANCE.provisional.difficulty.hpGrowth}, 공격 배율 (k−1)×${BALANCE.provisional.difficulty.attackGrowth}`);
  const rows: { nSecs: number; eWin: number; eSecs: number }[] = [];
  for (let tier = 0; tier < MAX_DIFFICULTY; tier++) {
    const star = tier + 1;
    const evo = { ...newEvolution(), tierIndex: tier, formId: forms[tier] ?? null, formHistory: forms.slice(1, tier + 1) as string[] };
    const stat = (cls: 'normal' | 'elite') => {
      let g = 0, w = 0, secs = 0;
      for (const base of POOL_ENEMIES.filter((e) => e.class === cls)) {
        for (let seed = 1; seed <= NM; seed++) {
          const params = { ...buildOf(['t-thunder-c']) } as Partial<CombatParams>;
          applyEvolutionToParams(params, evo, BALANCE_FACTION);
          applyDifficultyToParams(params, star);
          const end = playCombatHuman(createCombat(seed * 31 + star, { enemy: enemyAtDifficulty(base, star), params }));
          g++;
          if (end.status === 'won') { w++; secs += elapsedSeconds(end); }
        }
      }
      return { win: g ? w / g : 0, secs: w ? secs / w : 0 };
    };
    const n = stat('normal');
    const e = stat('elite');
    rows.push({ nSecs: n.secs, eWin: e.win, eSecs: e.secs });
    const st = currentStats(evo, BALANCE_FACTION);
    console.log(`  ${tier + 1}단계 몸 (체력 ${st.hp}·힘 ${st.atk}·속도 ${st.spd}, 최대 체력 ${Math.round(CX.playerMaxHp * st.hp / worldRefStat())}) vs ★${star}: 일반 ${(n.win * 100).toFixed(0)}% ${n.secs.toFixed(1)}초 · 강적 ${(e.win * 100).toFixed(0)}% ${e.secs.toFixed(1)}초`);
  }
  // C.76: ★1 강적은 입문 보정(eliteEase)으로 쉬우므로 기준은 2~5단계의 평균. 1단계 줄은 참고(강적 승률이 2단계보다 높아야 한다)
  const rest = rows.slice(1);
  const b = { nSecs: rest.reduce((a, r) => a + r.nSecs, 0) / rest.length, eWin: rest.reduce((a, r) => a + r.eWin, 0) / rest.length };
  rows.forEach((r, i) => {
    if (r.nSecs < b.nSecs * 0.8 || r.nSecs > b.nSecs * 1.25) failures.push(`권장 단계 등가: ${i + 1}단계 몸 ★${i + 1} 일반 ${r.nSecs.toFixed(1)}초 가 2~5단계 평균 ${b.nSecs.toFixed(1)}초 의 0.8~1.25배 밖`);
    if (i === 0) { if (r.eWin < rows[1]!.eWin) failures.push(`권장 단계 등가: 1단계 몸 ★1 강적 승률 ${(r.eWin * 100).toFixed(0)}% < 2단계 ${(rows[1]!.eWin * 100).toFixed(0)}% (입문 보정이 안 먹었다)`); }
    else if (Math.abs(r.eWin - b.eWin) > 0.15) failures.push(`권장 단계 등가: ${i + 1}단계 몸 ★${i + 1} 강적 승률 ${(r.eWin * 100).toFixed(0)}% 가 2~5단계 평균 ${(b.eWin * 100).toFixed(0)}% 와 15%p 넘게 다르다`);
  });
}

// ── 원정 난이도 ★ (C.75, GDD 32-1): 그 단계에 갓 닿은 몸(위 진화 봇 세이브, 1단계는 새 세이브)으로 사람형 봇이 ★ = 단계−1 / 단계(권장) / 단계+1 에서 4바퀴 원정 ──
// 목표(32-1 3번, provisional): 권장 ★ 에서 일반 약 45초·강적 약 90초(원정 안이라 바퀴 강화·빌드 성장이 섞여 전투 구간보다 짧다 — 1단계 권장 값을 기준선으로 삼아 단계별로 ±25% 안),
//  한 단계 위(★ = 단계−1)는 일반이 권장의 약 2/3 길이·강적 승률 상승, 한 단계 아래(★ = 단계+1)는 강적 승률이 크게(15%p 이상) 떨어진다.
// 가드: 권장 ★ 일반 승률 85% 이상, 위·아래 방향이 맞을 것(한 단계 위 강적 승률 ≥ 권장, 한 단계 아래 강적 승률 ≤ 권장 − 10%p)
{
  const DR = 3;
  console.log(`\n원정 난이도 ★ (GDD 32-1, 사람형 봇, 그 단계에 갓 닿은 몸 × ${DR}원정, 4바퀴 귀환·흡수) — 종족값 합계 ${BALANCE.provisional.stats.tierTotals.join('/')}, ★ 체력 배율 ${Array.from({ length: MAX_DIFFICULTY }, (_, i) => difficultyEnemyScale(i + 1).hp.toFixed(2)).join('/')}`);
  type Row = { win: number; nWin: number; eWin: number; nSecs: number; eSecs: number; defeat: number; n: number; e: number; gold: number; food: number };
  const rows: Record<string, Row> = {};
  const measure = (bodies: SaveData[], star: number, tier: number, streak = 0): Row => {
    let battles = 0, wins = 0, nW = 0, nG = 0, eW = 0, eG = 0, nS = 0, eS = 0, defeated = 0, runs = 0, gold = 0, food = 0;
    bodies.forEach((body, bi) => {
      for (let k = 0; k < DR; k++) {
        const save = structuredClone(body);
        const e = playExpedition(
          createExpedition({
            factionId: 'hollow', difficulty: star, streak, seed: 50000 + bi * 97 + k * 13 + tier * 7 + star * 1000, runId: nextRunId(save), hunger: 20, condition: 80,
            deck: sanitizeDeck(save.tiles, 'hollow'), risk: save.nest.risk, stability: save.nest.stability, build: save.build, evolution: save.evolution,
          }),
          { returnAfterLap: 4, absorb: 'absorb', playBattle: (b) => void playCombatHuman(b) },
        );
        runs++;
        battles += e.battles.length;
        for (const b of e.battles) {
          if (b.won) wins++;
          if (b.enemyClass === 'elite') { eG++; if (b.won) { eW++; eS += b.durationSeconds; } }
          else if (b.enemyClass === 'normal') { nG++; if (b.won) { nW++; nS += b.durationSeconds; } }
        }
        if (e.outcome === 'defeated') defeated++;
        const sm = summarize(e);
        gold += sm.keptGold;
        food += sm.keptFood.length;
      }
    });
    return { win: battles ? wins / battles : 0, nWin: nG ? nW / nG : 0, eWin: eG ? eW / eG : 0, nSecs: nW ? nS / nW : 0, eSecs: eW ? eS / eW : 0, defeat: runs ? defeated / runs : 0, n: nG, e: eG, gold: runs ? gold / runs : 0, food: runs ? food / runs : 0 };
  };
  const freshBodies: SaveData[] = Array.from({ length: CAMPAIGNS }, (_, i) => { const sv = newSaveData('hollow', 777 + i * 31); sv.tiles.deck = sanitizeDeck(sv.tiles, 'hollow'); return sv; });
  const recNormalSecs: number[] = [];
  for (let tier = 0; tier < MAX_DIFFICULTY; tier++) {
    const bodies = tier === 0 ? freshBodies : campaignFirstAt[tier] ?? [];
    if (bodies.length < CAMPAIGNS * 0.8) { failures.push(`난이도: ${tier + 1}단계 몸 ${bodies.length}/${CAMPAIGNS}`); continue; }
    const rec = recommendedDifficulty(tier);
    const stars = [rec - 1, rec, rec + 1].filter((st) => st >= 1 && st <= MAX_DIFFICULTY);
    for (const star of stars) {
      const r = (rows[`${tier}/${star}`] = measure(bodies, star, tier));
      const tagTxt = star === rec ? '권장' : star < rec ? '한 단계 위 몸' : '한 단계 아래 몸';
      console.log(`  ${tier + 1}단계 몸 ${String(bodies.length).padStart(2)}명 · ★${star} (${tagTxt.padEnd(7)}) 일반 ${(r.nWin * 100).toFixed(0).padStart(3)}% ${r.nSecs.toFixed(1).padStart(5)}초 (${r.n}판) · 강적 ${(r.eWin * 100).toFixed(0).padStart(3)}% ${r.eSecs.toFixed(1).padStart(5)}초 (${r.e}판) · 원정 패배 ${(r.defeat * 100).toFixed(0)}%`);
    }
    const R = rows[`${tier}/${rec}`]!;
    recNormalSecs.push(R.nSecs);
    if (R.nWin < 0.85) failures.push(`난이도: ${tier + 1}단계 몸 권장 ★${rec} 일반 승률 ${(R.nWin * 100).toFixed(0)}% < 85%`);
    // C.76 (마스터G): 새 몸(1단계·특성 없음) ★1 4바퀴 원정 패배 15% 이하 — 새 플레이어 첫 경험
    if (tier === 0 && R.defeat > 0.15) failures.push(`난이도: 새 몸 ★1 4바퀴 원정 패배 ${(R.defeat * 100).toFixed(0)}% > 15% (C.76 목표)`);
    const up = rows[`${tier}/${rec - 1}`];
    const down = rows[`${tier}/${rec + 1}`];
    if (up && up.eWin < R.eWin) failures.push(`난이도: ${tier + 1}단계 몸이 ★${rec - 1} 에서 강적 승률 ${(up.eWin * 100).toFixed(0)}% < 권장 ${(R.eWin * 100).toFixed(0)}% (한 단계 위가 더 쉽지 않다)`);
    if (down && down.eWin > R.eWin - 0.1) failures.push(`난이도: ${tier + 1}단계 몸이 ★${rec + 1} 에서 강적 승률 ${(down.eWin * 100).toFixed(0)}% > 권장 ${(R.eWin * 100).toFixed(0)}% − 10%p (한 단계 아래가 충분히 어렵지 않다)`);
  }
  // 1단계 몸은 특성이 없는 새 세이브, 2단계부터는 흡수 특성 2~4개·노력치가 있는 진화 봇 몸이라 처치 시간은 참고로만 (단계 간 등가는 위 '권장 단계 등가' 표가 가드)
  console.log(`  권장 ★ 일반 처치 시간 단계별: ${recNormalSecs.map((x) => x.toFixed(1)).join(' / ')}초 (참고 — 1단계는 특성 없는 새 몸)`);

  // ── 재화 경제 (GDD 32-1 10·11번): 권장 ★ × 연속 0/5/10 의 원정 1판 지킨 골드·먹이. 목표: ★5·10연속 골드 ≤ ★1(새 몸, 연속 0)의 2배 ──
  const DX = BALANCE.provisional.difficulty;
  const SHX = BALANCE.provisional.shop;
  console.log(`\n재화 경제 (GDD 32-1 11번, 사람형 봇, 권장 ★ 몸 × ${DR}원정 4바퀴): 골드 ★당 +${DX.goldPerStar * 100}%·연속당 +${DX.streak.goldPerClear * 100}%(최대 +${DX.streak.goldMaxBonus * 100}%), 먹이·노력치 ★당 +${DX.rewardPerStar * 100}%·연속당 +${DX.streak.foodPerClear * 100}%, 적 연속당 +${DX.streak.enemyPerClear * 100}%`);
  const econ: Record<string, Row> = {};
  for (let tier = 0; tier < MAX_DIFFICULTY; tier++) {
    const bodies = tier === 0 ? freshBodies : campaignFirstAt[tier] ?? [];
    if (bodies.length < CAMPAIGNS * 0.8) continue;
    const star = recommendedDifficulty(tier);
    const line: string[] = [];
    for (const streak of [0, 5, DX.streak.maxClears]) {
      const r = (econ[`${star}/${streak}`] = streak === 0 ? rows[`${tier}/${star}`]! : measure(bodies, star, tier, streak));
      line.push(`연속 ${String(streak).padStart(2)}: 골드 ${r.gold.toFixed(0).padStart(4)}·먹이 ${r.food.toFixed(1).padStart(4)}·패배 ${(r.defeat * 100).toFixed(0).padStart(3)}%`);
    }
    console.log(`  ${tier + 1}단계 몸 ★${star}  ${line.join(' | ')}`);
  }
  const g1 = econ['1/0']?.gold ?? 0;
  const g5 = econ[`${MAX_DIFFICULTY}/${DX.streak.maxClears}`]?.gold ?? 0;
  if (g1 > 0 && g5 > 0) {
    console.log(`  ★1 연속 0 골드 ${g1.toFixed(0)} → ★${MAX_DIFFICULTY} 연속 ${DX.streak.maxClears} 골드 ${g5.toFixed(0)} (${(g5 / g1).toFixed(2)}배, 목표 2배 이하) · 보통 먹이(${SHX.goldPrices['food-basic']}골드) ${(g1 / SHX.goldPrices['food-basic']!).toFixed(1)} → ${(g5 / SHX.goldPrices['food-basic']!).toFixed(1)}개/판 · 다시 뽑기권(${SHX.goldPrices.reroll}) ${(SHX.goldPrices.reroll! / g1).toFixed(1)} → ${(SHX.goldPrices.reroll! / g5).toFixed(1)}판 · 덱 칸(${SHX.deckSlotPrices[0]}) ${(SHX.deckSlotPrices[0]! / g1).toFixed(1)} → ${(SHX.deckSlotPrices[0]! / g5).toFixed(1)}판`);
    if (g5 > g1 * 2) failures.push(`재화 경제: ★${MAX_DIFFICULTY} ${DX.streak.maxClears}연속 골드 ${g5.toFixed(0)} > ★1 ${g1.toFixed(0)} 의 2배 (GDD 32-1 11번)`);
  }
}

// ── 사냥터 (C.53, GDD 24-2 → C.75 32-1 6번): 강도는 난이도로 일원화(모두 ×1). 새로 열린 사냥터는 먹이가 기본 사냥터보다 많이 나오는지만 본다 ──
{
  const GR = 3;
  console.log(`\n사냥터 (사람형 봇, 그 단계에 갓 닿은 세이브 × ${GR}원정, 권장 ★, 4바퀴 귀환·흡수) — 강도는 ×1(난이도로 일원화), 먹이만 다르다`);
  for (const tier of [...new Set(GROUNDS.map((g) => g.unlockTierIndex))].filter((t) => t > 0)) {
    const bodies = campaignFirstAt[tier] ?? [];
    const rows: Record<string, { win: number; defeat: number; food: number }> = {};
    for (const g of GROUNDS.filter((x) => x.unlockTierIndex <= tier)) {
      let battles = 0, wins = 0, defeated = 0, food = 0, runs = 0;
      bodies.forEach((body, bi) => {
        for (let k = 0; k < GR; k++) {
          const save = structuredClone(body);
          const e = playExpedition(
            createExpedition({
              factionId: 'hollow', groundId: g.id, seed: 50000 + bi * 97 + k * 13 + tier, runId: nextRunId(save), hunger: 20, condition: 80,
              deck: sanitizeDeck(save.tiles, 'hollow'), risk: save.nest.risk, stability: save.nest.stability, build: save.build, evolution: save.evolution,
            }),
            { returnAfterLap: 4, absorb: 'absorb', playBattle: (b) => void playCombatHuman(b) },
          );
          runs++;
          battles += e.battles.length;
          wins += e.battles.filter((b) => b.won).length;
          if (e.outcome === 'defeated') defeated++;
          food += e.foodLoot.length;
        }
      });
      rows[g.id] = { win: battles ? wins / battles : 0, defeat: runs ? defeated / runs : 0, food: runs ? food / runs : 0 };
      console.log(`  ${tier + 1}단계 몸 ${String(bodies.length).padStart(2)}명 · ${g.id.padEnd(10)} (주 속성 ${g.elements.join('·')}): 전투 승률 ${(rows[g.id]!.win * 100).toFixed(1)}% · 원정 패배 ${(rows[g.id]!.defeat * 100).toFixed(0)}% · 먹이 ${rows[g.id]!.food.toFixed(1)}개/원정`);
    }
    const base = rows[GROUNDS[0]!.id]!;
    for (const g of GROUNDS.filter((x) => x.unlockTierIndex === tier)) {
      const r = rows[g.id]!;
      if (bodies.length < CAMPAIGNS * 0.8) failures.push(`사냥터 ${g.id}: ${tier + 1}단계 몸 ${bodies.length}/${CAMPAIGNS}`);
      if (g.strength.hp !== 1 || g.strength.attack !== 1) failures.push(`사냥터 ${g.id}: 강도 ×${g.strength.hp}·×${g.strength.attack} — C.75 부터 난이도로 일원화(×1)`);
      if (r.defeat > 0.45) failures.push(`사냥터 ${g.id}: ${tier + 1}단계 몸 원정 패배 ${(r.defeat * 100).toFixed(0)}% > 45% (너무 어렵다)`);
      if (r.food <= base.food) failures.push(`사냥터 ${g.id}: 먹이 ${r.food.toFixed(1)}개 ≤ 기본 사냥터 ${base.food.toFixed(1)}개`);
    }
  }
}

// ── 해방 (C.54, GDD 22-5): 5단계에 갓 닿은 몸(위 진화 봇 세이브)이 강적과 싸울 때 해방을 쓰면(봇은 게이지가 차면 바로) 승률이 얼마나 오르나 ──
// 목표(마스터 v5.13, provisional): 해방 사용 시 강적 승률 +10~15%p. 적은 그 단계에 열리는 사냥터(5단계 = 마지막 사냥터) 1~6바퀴(원정 최대) 강화.
// 1~4바퀴만 보면 해방 없이도 약 89% 라 올릴 자리가 11%p 뿐이다(dev-log C.54) — 늦은 바퀴까지 넣어 해방이 필요한 싸움을 함께 본다
{
  const LR = 3;
  const LIB_STREAK = 5;
  const tier = BALANCE.provisional.liberation.minTierIndex;
  const bodies = campaignFirstAt[tier] ?? [];
  const ground = [...GROUNDS].filter((g) => g.unlockTierIndex <= tier).sort((a, b) => b.unlockTierIndex - a.unlockTierIndex)[0]!;
  const elites = POOL_ENEMIES.filter((e) => e.class === 'elite');
  const rate = (liberation: boolean) => {
    let wins = 0;
    let games = 0;
    let used = 0;
    let usedAt = 0;
    bodies.forEach((body, bi) => {
      for (const base of elites) {
        for (let lap = 1; lap <= BALANCE.expedition.maxLaps; lap++) {
          for (let k = 0; k < LR; k++) {
            const params = buildCombatParams(body.build, 'hollow');
            applyEvolutionToParams(params, body.evolution, 'hollow');
            params.storedStartGauge = storedStartGaugeOf(body.nest.stability);
            params.liberationEnabled = liberation;
            applyDifficultyToParams(params, recommendedDifficulty(tier));
            // C.76: 기준 = 권장 ★ · 연속 LIB_STREAK(적 +25%) — 사냥터 강도 일원화 뒤 "해방이 필요한 싸움"
            const end = playCombatHuman(createCombat(70000 + bi * 1009 + lap * 101 + k * 7 + base.hpInAttacks, { enemy: scaleEnemy(base, enemyScale(lap, ground.id, recommendedDifficulty(tier), LIB_STREAK, 'elite')), params }));
            games++;
            if (end.status === 'won') wins++;
            if (end.liberation.usedAtTick !== null) {
              used++;
              usedAt += end.liberation.usedAtTick * end.params.tickSeconds;
            }
          }
        }
      }
    });
    return { win: games ? wins / games : 0, games, used, usedAt: used ? usedAt / used : 0 };
  };
  const off = rate(false);
  const on = rate(true);
  const gain = on.win - off.win;
  const LB = BALANCE.provisional.liberation;
  console.log(`\n해방 (사람형 봇, ${tier + 1}단계 몸 ${bodies.length}명 × 강적 ${elites.length}종 × 1~${BALANCE.expedition.maxLaps}바퀴 × ${LR}판, 사냥터 ${ground.id}, ★${recommendedDifficulty(tier)} 연속 ${LIB_STREAK}) — 목표(임시): 해방 사용 시 강적 승률 +10~15%p`);
  console.log(`  해방 수치: 게이지 = 적 최대 체력 ${LB.gaugeEnemyHpFraction * 100}%, ${LB.seconds}초 능력치 ×${LB.statMultiplier}, 해방 블록 ${LB.blocks}칸 × 기본 블록 ${LB.blockPowerMultiplier}배, 끝나면 리스크 +${LB.riskOnEnd}`);
  console.log(`  해방 없음 ${(off.win * 100).toFixed(1)}% → 해방 사용 ${(on.win * 100).toFixed(1)}% (${gain >= 0 ? '+' : ''}${(gain * 100).toFixed(1)}%p) · 해방 쓴 전투 ${on.used}/${on.games} · 평균 ${on.usedAt.toFixed(1)}초에 사용`);
  if (bodies.length < CAMPAIGNS * 0.8) failures.push(`해방: ${tier + 1}단계 몸 ${bodies.length}/${CAMPAIGNS}`);
  // 회귀 가드는 목표보다 넓게(+5~25%p): 다른 수치를 고칠 때 해방이 무의미해지거나 압도적이 되는 것만 막는다
  if (gain < 0.05 || gain > 0.25) failures.push(`해방: 강적 승률 변화 ${(gain * 100).toFixed(1)}%p (가드 +5~25%p 밖)`);
}

// ── 보스전 (C.58, GDD 25-3·25-7): 보스가 나오는 스토리 장의 권장 단계에 갓 닿은 몸(위 진화 봇 세이브)으로 사람형 봇이 보스와 싸운다 ──
// 목표(마스터 25-7, provisional): 승률 50~70%. 가드는 목표보다 넓게(35~85%) — 다른 수치를 고칠 때 보스가 무의미하거나 못 깨는 벽이 되는 것만 막는다
{
  const BR = 4;
  for (const boss of BOSSES) {
    // 이 보스가 나오는 화의 권장 단계 (두 종족 중 처음 찾은 것)
    let tier = -1;
    let ground = GROUNDS[0]!.id;
    for (const ch of STORY_CHAPTERS) {
      for (const fid of ['hollow', 'shinigami']) {
        const ep = chapterContent(fid, ch.id)?.episodes.find((e) => e.boss?.id === boss.id);
        if (ep && tier < 0) {
          tier = ep.recommendedTier - 1;
          ground = ch.groundId;
        }
      }
    }
    if (tier < 0) continue;
    const bodies = campaignFirstAt[tier] ?? [];
    let wins = 0;
    let games = 0;
    let secs = 0;
    let timeouts = 0;
    let phase2 = 0;
    let seals = 0;
    bodies.forEach((body, bi) => {
      for (let k = 0; k < BR; k++) {
        const params = buildCombatParams(body.build, 'hollow');
        applyEvolutionToParams(params, body.evolution, 'hollow');
        applyDifficultyToParams(params, boss.difficulty);
        params.storedStartGauge = storedStartGaugeOf(body.nest.stability);
        const end = playCombatHuman(createCombat(80000 + bi * 131 + k * 17, { enemy: scaleEnemy(boss.enemy, enemyScale(1, ground, boss.difficulty)), params, boss: bossSetupOf(boss.id) }));
        games++;
        if (end.status === 'won') {
          wins++;
          secs += elapsedSeconds(end);
        }
        if (end.lossReason === 'timeout') timeouts++;
        if ((end.boss?.phase ?? 1) >= 2) phase2++;
        seals += end.boss?.seals ?? 0;
      }
    });
    const rate = games ? wins / games : 0;
    const BX = BALANCE.provisional.boss;
    console.log(`\n보스전 (사람형 봇, ${tier + 1}단계에 갓 닿은 몸 ${bodies.length}명 × ${BR}판, 사냥터 ${ground}, 보스 ★${boss.difficulty}) — 목표(임시): 승률 50~70%`);
    console.log(`  ${boss.id}: 체력 ${boss.enemy.hpInAttacks}회분 · 공격 ${boss.enemy.attackInAttacks} · 페이즈 ${boss.phases.map((p) => `${p.belowHpFraction * 100}% 이하 공격 간격 ×${p.attackSecondsMult}`).join(' / ')} · 기믹 ${boss.gimmick}(${BX.seal.everySeconds}초마다 ${BX.seal.cells}칸 ${BX.seal.seconds}초) · 시간 ${BX.timeLimitSeconds}초`);
    console.log(`  승률 ${(rate * 100).toFixed(0)}% · 승리 평균 ${wins ? (secs / wins).toFixed(1) : '-'}초 · 시간 초과 ${timeouts}/${games} · 2페이즈 도달 ${phase2}/${games} · 봉인 ${(seals / Math.max(1, games)).toFixed(1)}칸/판`);
    if (bodies.length < CAMPAIGNS * 0.8) failures.push(`보스전 ${boss.id}: ${tier + 1}단계 몸 ${bodies.length}/${CAMPAIGNS}`);
    if (rate < 0.35 || rate > 0.85) failures.push(`보스전 ${boss.id}: 승률 ${(rate * 100).toFixed(0)}% (가드 35~85% 밖)`);
  }
}

// ── 등급전 (C.49, GDD 21장): 번호 보유자 No.10 → No.1 승률 곡선. 위 진화 봇 중 5단계(아란칼)에 닿은 세이브(원정 MAX_RUNS 회를 마친 몸)로 사람형 봇이 각 보유자와 싸운다 ──
// 목표(provisional, 코딩41 판단): 위로 갈수록 내려가 No.1 약 20~30%. 이 봇은 원정 40회를 마친 다 자란 몸이라 No.10 은 거의 이긴다(갓 5단계가 된 몸은 약 85%, dev-log C.49). 가드: No.10 ≥ 60%, No.1 10~50%, 한 칸 위로 갈 때 승률이 12%p 넘게 오르지 않는다
{
  const RK = 4;
  const ready = campaignSaves.filter((s) => s.evolution.tierIndex >= BALANCE.rank.unlockTierIndex);
  console.log(`\n등급전 (사람형 봇, 5단계 세이브 ${ready.length}개 × 보유자마다 ${RK}판) — 목표(임시): 위로 갈수록 내려가 No.1 약 20~30%`);
  const rates: number[] = [];
  for (const h of [...RANK_HOLDERS].reverse()) {
    let wins = 0;
    let games = 0;
    let secs = 0;
    for (const save of ready) {
      for (let k = 0; k < RK; k++) {
        const params = buildCombatParams(save.build, 'hollow');
        applyEvolutionToParams(params, save.evolution, 'hollow');
        applyDifficultyToParams(params, h.difficulty);
        params.storedStartGauge = storedStartGaugeOf(save.nest.stability);
        const end = playCombatHuman(createCombat(9000 + h.rank * 100 + k * 7 + games, { enemy: enemyAtDifficulty(h, h.difficulty), params }));
        games++;
        if (end.status === 'won') {
          wins++;
          secs += elapsedSeconds(end);
        }
      }
    }
    const rate = games ? wins / games : 0;
    rates.push(rate);
    console.log(`  No.${String(h.rank).padStart(2)}  ${h.id.padEnd(15)} ★${h.difficulty} 체력 ${h.hpInAttacks}회분 · 공격 ${h.attackInAttacks} · ${h.element}/${h.category}/${enemyPatternKind(h)}  승률 ${(rate * 100).toFixed(0).padStart(3)}% · 승리 평균 ${wins ? (secs / wins).toFixed(1) : '-'}초`);
  }
  if (ready.length < CAMPAIGNS * 0.8) failures.push(`등급전: 5단계 세이브 ${ready.length}/${CAMPAIGNS}`);
  const [no10, no1] = [rates[0]!, rates[rates.length - 1]!];
  if (no10 < 0.6) failures.push(`등급전: No.10 승률 ${(no10 * 100).toFixed(0)}% < 60%`);
  if (no1 < 0.1 || no1 > 0.5) failures.push(`등급전: No.1 승률 ${(no1 * 100).toFixed(0)}% (10~50% 밖)`);
  for (let i = 1; i < rates.length; i++) if (rates[i]! > rates[i - 1]! + 0.12) failures.push(`등급전: No.${10 - i} 승률이 No.${11 - i} 보다 ${((rates[i]! - rates[i - 1]!) * 100).toFixed(0)}%p 높다`);
}

// ── 도전의 탑 (C.85, GDD 36장 11번): 그 ★ 권장 단계 몸(1단계 = 새 몸, 2~5단계 = 그 단계에 갓 닿은 진화 봇 몸)으로 사람형 봇이 구간 첫 층·5층(강적)·끝 층(보스)과 싸운다.
// 50층은 5단계 + 특성·노력치를 잘 키운 몸(원정 MAX_RUNS 회를 마친 5단계 세이브). 체력 가득·흡수 없음.
// 목표(provisional): 구간 첫 층 거의 100%, 5층 강적 약 70%, 끝 층 보스 약 40~60%, 50층 약 30~50%. 가드는 목표보다 넓게
{
  const TR = 4;
  const fight = (bodies: SaveData[], floor: number, seedBase: number) => {
    const f = towerFloor(floor);
    let wins = 0;
    let games = 0;
    let secs = 0;
    bodies.forEach((body, bi) => {
      for (let k = 0; k < TR; k++) {
        const params = buildCombatParams(body.build, 'hollow');
        applyEvolutionToParams(params, body.evolution, 'hollow');
        params.storedStartGauge = storedStartGaugeOf(body.nest.stability);
        const end = playCombatHuman(createTowerCombat(f, params, seedBase + floor * 1009 + bi * 131 + k * 17));
        games++;
        if (end.status === 'won') {
          wins++;
          secs += elapsedSeconds(end);
        }
      }
    });
    return { rate: games ? wins / games : 0, secs: wins ? secs / wins : 0, games };
  };
  const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
  const fresh: SaveData[] = Array.from({ length: CAMPAIGNS }, (_, i) => newSaveData('hollow', 555 + i * 37));
  const TT = BALANCE.provisional.tower;
  console.log(`\n도전의 탑 (사람형 봇, ★n = n단계 몸 × ${TR}판, 층 배율 구간 안 +${TT.perFloorInBand * 100}%/층·${TT.floors}층 +${TT.finalFloorBonus * 100}%) — 목표(임시): 구간 첫 층 ≈100%, 5층 강적 ≈70%, 끝 층 보스 40~60%, ${TT.floors}층 30~50%`);
  for (let star = 1; star <= TT.floors / TT.bandSize; star++) {
    // ★1 은 탑이 열리는 몸(스토리 1장 보스 권장 = 2단계에 갓 닿은 몸)으로 잰다 — 특성 없는 새 1단계 몸은 탑에 들어올 수 없어 참고 줄만
    const bodies = star === 1 ? campaignFirstAt[1] ?? [] : campaignFirstAt[star - 1] ?? [];
    if (bodies.length < CAMPAIGNS * 0.8) { failures.push(`탑 ★${star}: ${star}단계 몸 ${bodies.length}/${CAMPAIGNS}`); continue; }
    const base = (star - 1) * TT.bandSize;
    const first = fight(bodies, base + 1, 61000);
    const elite = fight(bodies, base + TT.eliteEvery, 62000);
    const bossFloor = base + TT.bandSize;
    const boss = bossFloor === TT.floors ? null : fight(bodies, bossFloor, 63000);
    const bossId = towerFloor(bossFloor).bossId;
    console.log(`  ★${star} (${star === 1 ? 2 : star}단계 몸 ${bodies.length}명): ${base + 1}층 일반 ${pct(first.rate)} ${first.secs.toFixed(1)}초 · ${base + TT.eliteEvery}층 강적 ${pct(elite.rate)} ${elite.secs.toFixed(1)}초${boss ? ` · ${bossFloor}층 보스 ${bossId} ${pct(boss.rate)} ${boss.secs.toFixed(1)}초` : ''}`);
    if (star === 1) {
      const fe = fight(fresh, base + TT.eliteEvery, 62000);
      const fb = fight(fresh, base + TT.bandSize, 63000);
      console.log(`    (참고) 특성 없는 새 1단계 몸: ${base + TT.eliteEvery}층 강적 ${pct(fe.rate)} · ${base + TT.bandSize}층 보스 ${pct(fb.rate)}`);
    }
    if (first.rate < 0.85) failures.push(`탑 ${base + 1}층: 일반 승률 ${pct(first.rate)} < 85%`);
    // ★1 은 한 단계 위 몸(탑이 열리는 2단계)이라 강적·보스는 참고만
    if (star > 1 && (elite.rate < 0.4 || elite.rate > 0.97)) failures.push(`탑 ${base + TT.eliteEvery}층: 강적 승률 ${pct(elite.rate)} (가드 40~97% 밖)`);
    // 보스가 아직 없어 fallbackBoss 로 이어 둔 층은 참고만 (그 보스가 들어오면 가드)
    const tempLink = TT.bossFloors[bossFloor] !== bossId;
    if (boss && tempLink) console.log(`    (임시 연결: ${TT.bossFloors[bossFloor]} 없음 → ${bossId}, 가드 제외)`);
    if (boss && star > 1 && !tempLink && (boss.rate < 0.2 || boss.rate > 0.85)) failures.push(`탑 ${bossFloor}층: 보스 승률 ${pct(boss.rate)} (가드 20~85% 밖)`);
  }
  const grown = campaignSaves.filter((s) => s.evolution.tierIndex >= MAX_DIFFICULTY - 1);
  const top = fight(grown, TT.floors, 64000);
  const top5 = fight(campaignFirstAt[MAX_DIFFICULTY - 1] ?? [], TT.floors, 64000);
  console.log(`  ${TT.floors}층 (${towerFloor(TT.floors).bossId} 강화판): 키운 5단계 몸 ${grown.length}명 ${pct(top.rate)} ${top.secs.toFixed(1)}초 · 갓 5단계 몸 ${pct(top5.rate)} (참고)`);
  if (grown.length < CAMPAIGNS * 0.8) failures.push(`탑 ${TT.floors}층: 5단계 세이브 ${grown.length}/${CAMPAIGNS}`);
  if (top.rate < 0.15 || top.rate > 0.75) failures.push(`탑 ${TT.floors}층: 승률 ${pct(top.rate)} (가드 15~75% 밖)`);
}

if (check) {
  if (failures.length > 0) {
    console.error(`회귀 가드 실패:\n- ${failures.join('\n- ')}`);
    process.exit(1);
  }
  console.log('\n회귀 가드 통과');
}
