// 밸런스 점검 (npm run balance, CI 는 --check 로 회귀 가드 판정)
// 시스템별 지표를 여기에 더한다. 가드를 어기면 --check 일 때 종료 코드 1.

import { BALANCE, BALANCE_VERSION } from '../src/config/balance';
import { ENEMIES, enemyPatternKind, POOL_CONFIG, scaleEnemy } from '../src/data/enemies';
import { ENEMY_PATTERN_KINDS } from '../src/data/schema';
import { createCombat, elapsedSeconds, playCombatBot, playCombatHuman, liberationStartGaugeOf, type CombatParams, type CombatState } from '../src/engine/combat';
import { enemyPool } from '../src/engine/enemyPool';
import { createExpedition, enemyScale, mutationMods, playExpedition, summarize, type ExpeditionState } from '../src/engine/expedition';
import { referenceLoadout, type GearCarry } from '../src/engine/gear';
import { addEnhance, buildCombatParams, canAbsorb, gainTrait, isBasicBlockTrait, newBuild } from '../src/engine/absorb';
import { FORM_TABLE, formName, formsOfTier, PHYS_ABILITY_EFFECTS, PHYS_ELEMENT_IDS } from '../src/data/evolution';
import { ELEMENT_IDS, NORMAL_ELEMENT, SPECIAL_ELEMENT_IDS } from '../src/data/elements';
import { getTrait } from '../src/data/traits';
import { ATTACK_CATEGORIES } from '../src/data/schema';
import { abilityEffectsOf, abilityFor, analyzeTree, applyEvolutionToParams, comboRulesOf, currentStats, formAbilitiesOf, newEvolution, worldRefStat, zeroStats } from '../src/engine/evolution';
import { newSaveData, nextRunId, performRebirth, recordExpedition, sanitizeDeck, referenceTileStock, type SaveData } from '../src/game';
import { buyShopItem } from '../src/shop';
import { getFaction } from '../src/data/factions';
import { createRng, nextFloat } from '../src/engine/rng';
import { inheritableTraits } from '../src/engine/rebirth';
import { RANK_HOLDERS } from '../src/data/ranks';
import { GROUNDS } from '../src/data/grounds';
import { BOSSES } from '../src/data/bosses';
import { STORY_CHAPTERS, chapterContent, groundBossId } from '../src/data/story';
import { bossSetupOf } from '../src/engine/expedition';
import { createTowerCombat, towerFloor } from '../src/engine/tower';
import { applyDifficultyToParams, difficultyEnemyScale, enemyAtDifficulty, recommendedDifficulty, MAX_DIFFICULTY } from '../src/engine/difficulty';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

/** 봇의 보상 타일 목록 (C.140: 게임은 덱이 없어졌다 — GDD 85장 11번. 점검 기준을 바꾸지 않으려고 봇만 옛 '덱' 규칙(8장, 뽑은 타일 추가)을 들고 다닌다) */
const botDecks = new WeakMap<object, string[]>();
const botDeck = (tiles: SaveData['tiles'], fid: string): string[] => sanitizeDeck({ collection: tiles.collection, deck: botDecks.get(tiles) ?? [] }, fid);

const check = process.argv.includes('--check');
// ── 구간 선택·병렬 실행 (C.108): 구간은 서로 독립(시드 고정, 공유 상태 없음)이라 --only=이름,… 으로 일부만 돌릴 수 있고,
//    --parallel 이면 이 프로세스가 구간(--only 가 있으면 그 구간만)을 워커 수(--workers=N, 기본 min(4, CPU))만큼 자식(--only)으로 나눠 돌린 뒤 출력을 모은다. 가드 판정·수치는 직렬과 같다.
//    진화 봇 세이브(campaign)가 필요한 구간은 자식마다 캠페인을 다시 만든다(약 60초, 중복 허용). seconds = 로컬 직렬 측정(배분용 추정치) ──
const SECTIONS: { name: string; seconds: number }[] = [
  { name: 'combat', seconds: 230 }, { name: 'expedition', seconds: 5 }, { name: 'absorb', seconds: 25 }, { name: 'variants', seconds: 105 }, { name: 'boss1', seconds: 31 },
  { name: 'boss23', seconds: 107 }, { name: 'rebirth', seconds: 40 }, { name: 'policy', seconds: 211 }, { name: 'tree', seconds: 1 }, { name: 'equiv', seconds: 15 }, { name: 'abilities', seconds: 145 },
  { name: 'phys', seconds: 77 }, { name: 'difficulty', seconds: 44 }, { name: 'grounds', seconds: 101 }, { name: 'liberation', seconds: 2 }, { name: 'bosses', seconds: 2 }, { name: 'rank', seconds: 3 }, { name: 'tower', seconds: 6 },
];
const CAMPAIGN_SECONDS = 63;
const CAMPAIGN_USERS = ['boss23', 'rebirth', 'phys', 'difficulty', 'grounds', 'liberation', 'bosses', 'rank', 'tower'];
const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const ONLY: Set<string> | null = onlyArg ? new Set(onlyArg.slice('--only='.length).split(',').filter(Boolean)) : null;
if (ONLY) for (const s of ONLY) if (!SECTIONS.some((x) => x.name === s) && s !== 'campaign') throw new Error(`모르는 구간 ${s} (${SECTIONS.map((x) => x.name).join(', ')})`);
const want = (s: string): boolean => ONLY === null || ONLY.has(s);
const needCampaign = want('campaign') || CAMPAIGN_USERS.some(want);
if (process.argv.includes('--parallel')) {
  const parSections = ONLY ? SECTIONS.filter((s) => ONLY.has(s.name)) : SECTIONS;
  const wArg = process.argv.find((a) => a.startsWith('--workers='));
  const cpus = typeof os.availableParallelism === 'function' ? os.availableParallelism() : os.cpus().length;
  const workers = Math.max(1, Math.min(SECTIONS.length, wArg ? Number(wArg.slice('--workers='.length)) || 1 : Math.min(4, cpus)));
  // 큰 구간부터 가장 덜 찬 워커에. 캠페인이 필요한 구간이 그 워커에 처음 들어갈 때 캠페인 시간을 더한다
  const bins = Array.from({ length: workers }, () => ({ names: [] as string[], seconds: 0 }));
  for (const s of [...parSections].sort((a, b) => b.seconds - a.seconds)) {
    const bin = bins.reduce((m, b) => (b.seconds < m.seconds ? b : m));
    const extra = CAMPAIGN_USERS.includes(s.name) && !bin.names.some((n) => CAMPAIGN_USERS.includes(n)) ? CAMPAIGN_SECONDS : 0;
    bin.names.push(s.name);
    bin.seconds += s.seconds + extra;
  }
  const jobs = bins.filter((b) => b.names.length > 0);
  const viteNode = path.resolve('node_modules/.bin/vite-node');
  const t0 = Date.now();
  console.log(`병렬 ${jobs.length}워커 (CPU ${cpus}): ${jobs.map((b, i) => `#${i + 1} ${b.names.join(',')} (~${b.seconds}초)`).join(' / ')}`);
  // 자식 stderr(구간 소요 시간·후반 보류 경고)는 바로 흘려보내 진행이 보이게 하고, 끝나면 워커별 stdout 뒤에 다시 모아 적는다
  const results = await Promise.all(jobs.map((b) => new Promise<{ code: number; out: string; err: string }>((resolve) => {
    const child = spawn(viteNode, ['scripts/balance.ts', '--', ...(check ? ['--check'] : []), `--only=${b.names.join(',')}`], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d: Buffer) => { out += d.toString(); });
    child.stderr.on('data', (d: Buffer) => { err += d.toString(); process.stderr.write(d); });
    child.on('error', (e) => resolve({ code: 1, out: `${out}\n워커 실행 실패: ${String(e)}`, err }));
    child.on('close', (code) => resolve({ code: code ?? 1, out, err }));
  })));
  const nl = (s: string) => (s.length === 0 || s.endsWith('\n') ? s : s + '\n');
  results.forEach((r, i) => {
    console.log(`\n======== 워커 #${i + 1}: ${jobs[i]!.names.join(', ')} (종료 코드 ${r.code}) ========`);
    process.stdout.write(nl(r.out));
    if (r.err.trim().length > 0) process.stdout.write(`-- 워커 #${i + 1} stderr --\n${nl(r.err)}`);
  });
  const failed = results.map((r, i) => (r.code === 0 ? null : i + 1)).filter((x): x is number => x !== null);
  console.log(`\n병렬 전체 ${((Date.now() - t0) / 1000).toFixed(0)}초 · ${failed.length === 0 ? '회귀 가드 통과 (전 워커)' : `회귀 가드 실패: 워커 #${failed.join(', #')} (위 출력 참조)`}`);
  process.exit(failed.length === 0 ? 0 : 1);
}

const failures: string[] = [];
/**
 * 후반 보류 (GDD 45장 6번, C.97): 4단계(바스트로데) 이후 블록 효과를 만들기 전까지 4단계 이후 가드는 실패 대신 경고로 남긴다.
 * 4단계 이후 블록 효과를 다 만든 뒤 LATE_HOLD = false 로 되돌리면 전부 다시 가드가 된다
 */
const LATE_HOLD = true;
/** 이 tierIndex(0부터) 이상이 후반 = 4단계 */
const LATE_TIER_INDEX = 3;
const lateHeld: string[] = [];
function lateFail(msg: string): void {
  (LATE_HOLD ? lateHeld : failures).push(msg);
}
/** tierIndex 단계의 가드: 후반이면 lateFail */
function failAt(tierIndex: number, msg: string): void {
  if (tierIndex >= LATE_TIER_INDEX) lateFail(msg);
  else failures.push(msg);
}
const CX = BALANCE.provisional.combat;

console.log(`밸런스 버전 ${BALANCE_VERSION}`);
// 구간 소요 시간 (C.108): 구간 머리글('\n' 으로 시작하는 줄)마다 stderr 에 누적 초를 찍는다. stdout 출력·가드 판정은 그대로
const T0 = Date.now();
const origLog = console.log.bind(console);
console.log = (...a: unknown[]): void => {
  if (typeof a[0] === 'string' && a[0].startsWith('\n')) process.stderr.write(`[${((Date.now() - T0) / 1000).toFixed(0)}s] ${a[0].trim().split('\n')[0]!.slice(0, 60)}\n`);
  origLog(...a);
};

// ── 전투 v2(P4): 블록 봇 N판, 시드 고정 ──
// C.7 (GDD 3-5 v0.7): 승률 목표의 기준 빌드 = skill 특성 1~2개 장착 (공격 1개 / 공격+막기 2개).
// 빈 슬롯(기본 블록만)은 일반 적 승률 90%↑만 가드, 강적은 참고 출력. skill 3개 빌드는 비교용.
const N = 200;
/** 계열 단계 기술 표를 읽을 종족 (두 종족의 계열 수치는 같으므로 하나로 점검한다) */
const BALANCE_FACTION = 'hollow';
const buildOf = (ids: string[]): Partial<CombatParams> => {
  const b = newBuild();
  for (const id of ids) if (!gainTrait(b, id).ok && isBasicBlockTrait(id)) addEnhance(b, NORMAL_ELEMENT); // 노멀 skill 특성 = 기본 블록 (C.184, GDD 111장 1): 고른 것처럼 노멀 강화 +1
  // 점검 봇은 1단계(진화 전)라 켜진 콤보가 없다. 콤보 효과는 아래 참고 빌드로 따로 본다 (GDD 17-3)
  return { ...buildCombatParams(b, BALANCE_FACTION), combos: comboRulesOf(newEvolution()), ...START };
};
/** C.17: 점검 봇의 시작 저장 게이지 = 새 세이브 안정 수치(stabilityStart)에 비례한 값 */
const START = { liberationStartGauge: liberationStartGaugeOf(BALANCE.provisional.risk.stabilityStart) };
type BuildDef = { name: string; params: Partial<CombatParams>; ref: boolean; /** 사람형 봇 강적 승률 목표 [하한, 상한]. 없으면 참고 출력만 */ elite?: [number, number] };
const builds: BuildDef[] = [
  { name: '빈 슬롯(기본 블록)', params: { ...START }, ref: false },
  // C.47: 특성은 속성 8종 × 8개. 기준 빌드는 원소 공격 특성(적 속성에 따라 강·약·보통이 섞인다)
  { name: 'skill 1개(공격)', params: buildOf(['t-thunder-c']), ref: true, elite: [0.6, 0.85] },
  // C.136 (GDD 84장 7번): 속성 막기 특성이 없어져 공격·막기 빌드 → 다른 계열 공격 2개 (막기는 기본 막기 블록 고정 몫)
  { name: 'skill 2개(다른 계열 공격 2)', params: buildOf(['t-thunder-c', 't-fire-a']), ref: true, elite: [0.6, 0.85] },
  // C.34 (GDD 17-3): 같은 계열 공격 특성 둘은 서로 체인이 된다 — 체인이 쉬워진 빌드
  { name: 'skill 2개(같은 계열 공격 2)', params: buildOf(['t-thunder-c', 't-water-c']), ref: true, elite: [0.6, 0.85] },
  // C.34 ③ (GDD 17-3): 2단계 콤보(탄 계열 체인2 연속 2번 → 콤보 블록)가 켜진 같은 빌드 — 참고 출력만
  { name: 'skill 1개(공격)+콤보(2단계 규칙)', params: { ...buildOf(['t-thunder-c']), combos: comboRulesOf({ ...newEvolution(), tierIndex: 1 }) }, ref: false },
  { name: 'skill 3개(공격 3)', params: buildOf(['t-fire-a', 't-earth-c', 't-thunder-b']), ref: false },
];
// C.16 (GDD 14-4): 완벽형 봇(참고)과 사람형 봇(목표 기준) 둘 다 돌린다.
//  - 완벽형: 0.5초 간격, 반응 지연·실수 없음. 강공격을 다 막고 체인을 다 붙여서 기술 2개부터 100% 로 절벽이 생긴다 → 참고 출력, 일반 적 승률·길이만 가드
//  - 사람형: 입력 간격과 막기 반응 지연 0.5~1.2초 무작위, 막기 성공 70%, 붙이기(체인 정리) 입력당 50%. 승률·길이 목표는 이 봇 기준
const TARGET = {
  // C.118 (GDD 62장): 한 전투 시간 = 옛 목표(일반 45초·강적 90초)의 약 절반
  normal: { seconds: 22, win: 0.9 },
  elite: { seconds: 45 },
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
  const st = { games: 0, wins: 0, secs: 0, winSecs: 0, timeouts: 0, chain3: 0, guards: 0, voids: 0, absorbable: 0, hpLeft: 0, stored: 0, wasted: 0 };
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
      st.stored += s.liberation.uses;
      st.wasted += s.liberation.chains;
      if (canAbsorb(s)) st.absorbable++;
    }
  }
  const g = st.games;
  const line = `    ${kind.padEnd(11)} (${group[0]!.class}, 체력 ${group[0]!.hpInAttacks}회분, 적 ${group.length}종): 승률 ${((st.wins / g) * 100).toFixed(0)}% · 평균 ${(st.secs / g).toFixed(1)}초(승리 ${(st.wins ? st.winSecs / st.wins : 0).toFixed(1)}초) · 남은 체력 ${st.wins ? ((st.hpLeft / st.wins) * 100).toFixed(0) : '-'}% · 체인3 ${(st.chain3 / g).toFixed(1)}회 · 막기 성공 ${(st.guards / g).toFixed(1)} · 공허 ${(st.voids / g).toFixed(1)} · 해방 ${(st.stored / g).toFixed(1)}회(해방 중 체인 ${(st.wasted / g).toFixed(1)}) · 흡수 가능 ${((st.absorbable / g) * 100).toFixed(0)}% · 시간 초과 ${st.timeouts}`;
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
if (want('combat')) for (const bot of BOTS) {
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
        // 일반 적: 두 봇 모두 승률 90%↑·길이·시간 초과 가드 (빈 슬롯은 약 22초 근처 — C.118 GDD 62장, 옛 45초·가드 18~75/30~70 의 절반)
        if (winRate < TARGET.normal.win) failures.push(`${tag}: 승률 ${(winRate * 100).toFixed(0)}% < ${TARGET.normal.win * 100}%`);
        if (avgWin < 9 || avgWin > 38) failures.push(`${tag}: 승리 평균 ${avgWin.toFixed(1)}초 (9~38 밖)`);
        if (build.name.startsWith('빈') && (avgWin < 15 || avgWin > 35)) failures.push(`${tag}: 승리 평균 ${avgWin.toFixed(1)}초 (15~35 밖)`);
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
      if (build.elite && build.name.startsWith('skill 1') && (pe.winSecs < 37 || pe.winSecs > 53)) failures.push(`사람형 봇/${build.name}: 강적 승리 평균 ${pe.winSecs.toFixed(1)}초 (목표 약 45초, 37~53 밖 — C.118 GDD 62장)`);
    }
  }
}
// ── 분류·속성별 승률 (C.47, GDD 20-1·20-2): 공격 특성 1개 빌드를 분류 3종 × 속성 8종으로 바꿔 사람형 봇으로 돌린다. 일반 적 90%↑ 가드, 강적은 참고 ──
if (want('combat')) {
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

if (want('combat')) for (const enemy of POOL_ENEMIES) {
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
const deck = sanitizeDeck(referenceTileStock(), 'hollow');
/** 허기 가드용: 전투를 바로 이긴 것으로 친다 (허기 시스템만 따로 본다. 전투 승패는 위 전투 점검이 본다) */
const autoWin = (s: CombatState) => {
  s.enemy.hp = 0;
  s.status = 'won';
  s.finisher = { kind: 'basic-attack', traitId: null, element: null };
};
console.log(`\n원정 (자동 플레이 ${M}회, 타일 배치 포함, 시작 허기 20·컨디션 80)`);
if (want('expedition')) for (const [label, playBattle] of [['블록 봇 전투', undefined], ['허기 점검: 전투는 승리 처리', autoWin]] as const) {
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
if (want('expedition')) {
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
  // C.129 (GDD 75장): 혈·독·허(특수 속성) 적은 강적·보스·공허의 밤·★3 이상에서만 나온다 → 특수 속성은 '전체 비율 하한' 대신 그 규칙을 검사한다.
  //  ① ★1 원정(바퀴 변이 없음·있음 각 200회): 규칙 밖(★1~2 일반 적, 그 바퀴 변이가 부르지 않음) 혈·독·허 등장 = 0  ② ★1 강적 · ★1 공허의 밤 일반 · ★3 일반 에서는 나온다(하한 SPECIAL_MIN)
  //  일반 속성(특수 제외)은 예전처럼 각 WEAK_MIN 이상 (분포는 변이 없는 ★1 원정 기준)
  const SPECIAL_MIN = { elite: 0.12, voidNight: 0.1, difficulty3: 0.08 }; // 측정(C.129, 혈·독·허 합): ★1 강적 19% · ★1 공허의 밤 일반 19%(247마리) · ★3 일반 14%
  const isSpecial = (el: string) => SPECIAL_ELEMENT_IDS.includes(el);
  const seenWeak: Record<string, number> = {};
  const seenKind: Record<string, number> = {};
  let seen = 0;
  const kindOf = new Map(ENEMIES.map((e) => [e.id, enemyPatternKind(e)]));
  const weakOf = new Map(ENEMIES.map((e) => [e.id, e.element]));
  // 특수 속성 등장 집계: [만난 수, 그중 혈·독·허]
  type Tally = [number, number];
  const sp = { offRule: 0, offRuleIds: new Set<string>(), elite: [0, 0] as Tally, voidNight: [0, 0] as Tally, normal: [0, 0] as Tally, d3normal: [0, 0] as Tally, d3elite: [0, 0] as Tally };
  for (const [difficulty, tileVariants] of [[1, false], [1, true], [3, false]] as const) {
    for (let seed = 1; seed <= 200; seed++) {
      const e = playExpedition(createExpedition({ factionId: 'hollow', seed, hunger: 0, condition: 100, difficulty, tileVariants, deck: sanitizeDeck(referenceTileStock(), 'hollow') }), { returnAfterLap: 6, playBattle: autoWin });
      for (const b of e.battles) {
        const w = weakOf.get(b.enemyId)!;
        const special = isSpecial(w) ? 1 : 0;
        if (difficulty === 3) {
          if (b.enemyClass === 'normal') { sp.d3normal[0]++; sp.d3normal[1] += special; }
          if (b.enemyClass === 'elite') { sp.d3elite[0]++; sp.d3elite[1] += special; }
          continue;
        }
        if (!tileVariants) {
          seen++;
          seenWeak[w] = (seenWeak[w] ?? 0) + 1;
          const k = kindOf.get(b.enemyId)!;
          seenKind[k] = (seenKind[k] ?? 0) + 1;
        }
        if (b.enemyClass === 'elite') { sp.elite[0]++; sp.elite[1] += special; continue; }
        if (b.enemyClass !== 'normal') continue; // 보스는 보스 데이터 고정 적
        const mut = mutationMods(e.variantLog.mutations.find((m) => m.lap === b.lap)?.id);
        if ((mut.specialEnemyChance ?? 0) > 0) { sp.voidNight[0]++; sp.voidNight[1] += special; continue; }
        sp.normal[0]++; sp.normal[1] += special;
        if (special && mut.elementBias !== w) { sp.offRule++; sp.offRuleIds.add(b.enemyId); } // 피의 달은 혈 적을 일부러 부른다 (75장 판단)
      }
    }
  }
  const pct = (a: Tally) => (a[0] ? (a[1] / a[0]) * 100 : 0).toFixed(0);
  console.log(`  실제 원정 200회(★1, 6바퀴까지, 전투 승리 처리)에서 만난 적 ${seen}마리: 속성 ${LIDS.map((l) => `${(((seenWeak[l] ?? 0) / seen) * 100).toFixed(0)}%`).join('/')} · 종류 ${Object.entries(seenKind).map(([k, n]) => `${k} ${((n / seen) * 100).toFixed(0)}%`).join(' · ')}`);
  console.log(`  혈·독·허 적(GDD 75장): ★1 일반(공허의 밤 밖) ${pct(sp.normal)}%(규칙 밖 ${sp.offRule}마리) · ★1 강적 ${pct(sp.elite)}%(${sp.elite[0]}마리) · ★1 공허의 밤 일반 ${pct(sp.voidNight)}%(${sp.voidNight[0]}마리) · ★3 일반 ${pct(sp.d3normal)}%(${sp.d3normal[0]}마리) · ★3 강적 ${pct(sp.d3elite)}%`);
  for (const l of LIDS) {
    if (isSpecial(l)) continue;
    if ((seenWeak[l] ?? 0) / seen < WEAK_MIN) failures.push(`원정에서 만난 적: ${l} 속성 적 비율 ${(((seenWeak[l] ?? 0) / seen) * 100).toFixed(0)}% < ${WEAK_MIN * 100}%`);
  }
  if (sp.offRule > 0) failures.push(`원정에서 만난 적: ★1~2 일반 칸에 혈·독·허 적 ${sp.offRule}마리 (${[...sp.offRuleIds].join(', ')}) — GDD 75장 위반`);
  const spMin = (label: string, a: Tally, min: number) => {
    if (!a[0] || a[1] / a[0] < min) failures.push(`원정에서 만난 적: ${label} 혈·독·허 비율 ${pct(a)}%(${a[0]}마리 중) < ${min * 100}% — GDD 75장 강적·★3·공허의 밤에서는 나와야 한다`);
  };
  spMin('★1 강적', sp.elite, SPECIAL_MIN.elite);
  spMin('★1 공허의 밤 일반', sp.voidNight, SPECIAL_MIN.voidNight);
  spMin('★3 일반', sp.d3normal, SPECIAL_MIN.difficulty3);
}

// ── 흡수·리스크(P3, C.6 조건): 흡수 가능 비율, 흡수 자동 플레이(계통 모으기) ──
console.log(`\n흡수 원정 (자동 플레이 ${M}회: 흡수 가능하면 흡수하고 같은 속성을 모음 / 비교: 항상 놓아줌) — 흡수 조건 없음(C.125 GDD 71장: 이기면 언제나)`);
const absorbStats: Record<string, { breakthrough: number; defeated: number; absorbableRate: number; endRisk: number }> = {};
// 섞음 봇 (GDD 23-2 "평범한 원정"): 흡수 화면마다 흡수와 놓아주기를 번갈아 한다
const mixedWanted = (e: ExpeditionState) => e.absorbRecords.filter((a) => a.absorbed).length <= e.absorbRecords.filter((a) => !a.absorbed).length;
const POLICY_NAME = { absorb: '흡수', mixed: '섞음', release: '놓아줌' } as const;
if (want('absorb')) for (const stopLap of [4, 6]) {
  for (const policy of ['absorb', 'mixed', 'release'] as const) {
    let absorbs = 0;
    let releases = 0;
    let bt = 0;
    let defeated = 0;
    let traits = 0;
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
      `  ${stopLap}바퀴 ${POLICY_NAME[policy]}: 흡수 ${(absorbs / M).toFixed(1)}회 · 놓아줌 ${(releases / M).toFixed(1)}회 · 승리 중 흡수 가능 ${wins ? ((absorbable / wins) * 100).toFixed(0) : 0}% · 한계 돌파 ${bt}/${M} · 패배 ${defeated}/${M} · 끝 특성 ${(traits / M).toFixed(1)}개 · 끝 리스크 ${(risk / M).toFixed(0)} · 전투당 ${(secs / battles).toFixed(1)}초 · 공허 사용 ${(voids / battles).toFixed(2)}/전투 · 먹이 전리품 ${(food / M).toFixed(1)}개`,
    );
  }
}
// 회귀 가드(흡수 봇은 쉬지도 놓아주지도 않는 극단이다): 기본 4바퀴 흡수 플레이는 절반 이하만 돌파하고, 항상 놓아주면 돌파하지 않으며, 6바퀴 흡수 플레이는 돌파가 의미 있게 생겨야 한다
if (want('absorb')) {
if ((absorbStats['4-absorb']?.breakthrough ?? 0) > M * 0.5) failures.push(`4바퀴 흡수 플레이 돌파 ${absorbStats['4-absorb']?.breakthrough}/${M} > 50%`);
if ((absorbStats['6-absorb']?.breakthrough ?? 0) < M * 0.5) failures.push(`6바퀴 흡수 플레이 돌파 ${absorbStats['6-absorb']?.breakthrough}/${M} < 50% (리스크가 약하다)`);
if ((absorbStats['4-release']?.breakthrough ?? 0) > 0) failures.push('4바퀴에서 항상 놓아줘도 한계 돌파가 생긴다');
}
// GDD 23-2 리스크 목표 (C.52): 평범한 4바퀴(흡수·놓아주기 섞음)는 끝 40~60·돌파 10% 이하, 둥지 재우기·쓰다듬기는 한 번에 −20 안팎(−15~−25)
if (want('absorb')) {
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
    // C.136 (GDD 84장 10번 "광기 수치 너무 잘 줄어드는듯"): 23-2 의 "한 번에 크게(−20)" → −10 안팎으로 기획 변경 (가드 목표값을 새 기획에 맞춤)
    if (r > -8 || r < -12) failures.push(`둥지 ${a} 리스크 ${r} — 목표 −10 안팎 (GDD 23-2 → 84장 10번)`);
  }
}
// ── 타일 변수 5종 (C.57, GDD 25-5): 4바퀴 섞음 봇으로 타일 변수 끔/켬 비교 (켬 = 드래프트 카드를 시너지 우선으로 골라 바로 놓음, 이벤트는 봇 선택, 바퀴 변이·시너지 발동) ──
// 가드(두 종족 합산 평균): 보상(먹이 개수·번 골드) 증가 +25% 이하, 켬 끝 리스크 40~60, 패배율 +5%p 이하. 종족별 값은 참고 출력
if (want('variants')) {
  const TVN = 1000;
  const tvStat = (fid: string, on: boolean) => {
    const dk = sanitizeDeck(referenceTileStock(), fid);
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
  console.log(`  합산 평균: 먹이 +${(fInc * 100).toFixed(1)}% · 골드 +${(gInc * 100).toFixed(1)}% (가드 +25% 이하) · 켬 끝 리스크 ${sumOn.risk.toFixed(1)} (40~60) · 패배율 ${dInc >= 0 ? '+' : ''}${(dInc * 100).toFixed(1)}%p (가드 +8%p 이하)`);
  if (fInc > 0.25) failures.push(`타일 변수: 먹이 보상 +${(fInc * 100).toFixed(1)}% > +25% (GDD 25-5)`);
  if (gInc > 0.25) failures.push(`타일 변수: 골드 보상 +${(gInc * 100).toFixed(1)}% > +25% (GDD 25-5)`);
  if (sumOn.risk < 40 || sumOn.risk > 60) failures.push(`타일 변수: 4바퀴 섞음 끝 리스크 ${sumOn.risk.toFixed(1)} — 목표 40~60 (GDD 25-5)`);
  // C.177 (GDD 107장 8번 '가드 재조정'): 원정 체력 이어 가기로 전투가 늘어나는 만큼(켬 = 원정당 전투 약 +2.7) 이어 오는 손해가 쌓여 +5%p → +8%p
  if (dInc > 0.08) failures.push(`타일 변수: 패배율 +${(dInc * 100).toFixed(1)}%p > +8%p (GDD 25-5·107장 8번)`);
  // 상점 (GDD 25-9, C.60): 원정 1판(4바퀴 섞음, 타일 변수 켬) 평균 골드로 살 수 있는 보통 먹이 수 — 원정 전리품(판당 9~11개)을 대체하지 못하게
  const SHX = BALANCE.shop;
  const basicPerRun = sumOn.gold / SHX.goldPrices['food-basic']!;
  const [bLo, bHi] = SHX.basicFoodPerRunGuard;
  console.log(`\n상점 (GDD 25-9): 원정 1판 평균 골드 ${sumOn.gold.toFixed(1)} → 보통 먹이(${SHX.goldPrices['food-basic']}골드) ${basicPerRun.toFixed(2)}개 (가드 ${bLo}~${bHi}) · 원정 전리품 먹이 ${sumOn.food.toFixed(2)}개`);
  if (basicPerRun < bLo! || basicPerRun > bHi!) failures.push(`상점: 판당 골드로 살 수 있는 보통 먹이 ${basicPerRun.toFixed(2)}개 (가드 ${bLo}~${bHi} 밖, GDD 25-9)`);
}

// ── 보스 자유 원정 등장 (C.86, GDD 37장): 장 보스가 있는 사냥터마다 4바퀴 섞음 봇(타일 변수 켬, 1단계 새 몸·★1)으로 보스를 이기기 전/후 비교 ──
// 등장 굴림은 따로 난수라 같은 시드 = 보스 칸 전까지 같은 원정(짝 비교). 가드: 두 종족 합산 패배율 +5%p 이하
if (want('boss1')) {
  const FBN = 1000;
  const BF = BALANCE.provisional.boss;
  for (const g of GROUNDS) {
    const bosses = ['hollow', 'shinigami'].map((fid) => groundBossId(fid, g.id));
    if (bosses.every((b) => b === null)) continue;
    // 3·5단계 사냥터(2·3장 보스, C.84)는 그 보스를 스토리에서 이긴 몸만 만난다 — 아래 진화 봇 몸으로 따로 본다
    if (g.unlockTierIndex > 0) continue;
    let defOff = 0;
    let defOn = 0;
    let appeared = 0;
    let bossLost = 0;
    let goldOn = 0;
    let goldOff = 0;
    const runs = FBN * 2;
    ['hollow', 'shinigami'].forEach((fid, i) => {
      const dk = sanitizeDeck(referenceTileStock(), fid);
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
    console.log(`  등장 ${appeared}/${runs}(${((appeared / runs) * 100).toFixed(1)}%) · 보스에게 짐 ${bossLost}/${appeared} · 패배율 ${((defOff / runs) * 100).toFixed(1)} → ${((defOn / runs) * 100).toFixed(1)}% (${dInc >= 0 ? '+' : ''}${(dInc * 100).toFixed(1)}%p, 가드 +8%p 이하) · 골드 ${(goldOff / runs).toFixed(1)} → ${(goldOn / runs).toFixed(1)}`);
    // C.177 (GDD 107장 8번): 보스는 4바퀴째 이어 온 체력으로 만난다 — +5%p → +8%p
    if (dInc > 0.08) failures.push(`보스 자유 원정(${g.id}): 패배율 +${(dInc * 100).toFixed(1)}%p > +8%p (GDD 37장 7번·107장 8번)`);
  }
}
// 흡수 가능 비율: C.125 (GDD 71장) 흡수 조건 삭제 — 이긴 전투는 늘 흡수 가능이어야 한다 (옛 가드 25~85% 대신)
if (want('absorb')) for (const lap of [4, 6]) {
  const ar = absorbStats[`${lap}-absorb`]?.absorbableRate ?? 0;
  if (ar < 1) failures.push(`${lap}바퀴 흡수 플레이: 승리 중 흡수 가능 비율 ${(ar * 100).toFixed(0)}% < 100% (GDD 71장: 이기면 언제나 흡수)`);
}

// ── 진화 (C.47, GDD 20-5): 걸음 수 진화. 흡수 봇이 4바퀴 원정을 반복하고, 둥지에 돌아올 때 걸음이 차 있으면 자동 진화한다 ──
// 목표(provisional, 마스터 레벨 디자인): 단계마다 약 1.5 / 2.5 / 3 / 4.5원정. 가드는 단계별 평균이 목표의 0.6~1.8배, 5단계 도달 80% 이상(원정 MAX_RUNS 안)
const CAMPAIGNS = 30;
const MAX_RUNS = 40;
const STAGE_TARGET = [1.5, 2.5, 3, 4.5];
const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
type CampaignStats = { stageRuns: number[][]; finalRuns: number[]; formCounts: Record<number, Record<string, number>>; stepsPerRun: number[]; hidden: number; evolutions: number; finalDefeats: number[]; saves: SaveData[]; /** 그 단계(tierIndex)에 갓 닿은 순간의 세이브 사본 (사냥터 점검용) */ firstAt: Record<number, SaveData[]> };
/** 첫 원정 튜토리얼 (C.120, GDD 67장): 새 세이브는 고정 길 1판(약한 적 1마리 → 튜토리얼 흡수 = 모든 능력치 +3)부터 */
function botTutorialRun(save: SaveData, seed: number): void {
  const e = playExpedition(createExpedition({ factionId: save.factionId, seed, runId: nextRunId(save), hunger: save.nest.hunger, condition: save.nest.condition, deck: [], risk: save.nest.risk, stability: save.nest.stability, build: save.build, evolution: save.evolution, tutorial: true }), { returnAfterLap: 1, absorb: 'absorb' });
  recordExpedition(save, e, 0);
}
/** 타일 뽑기 봇 (C.120, GDD 64장 2번): 타일이 열렸으면 골드가 되는 만큼 상점 [타일 뽑기]를 하고, 덱에 빈 칸이 있으면 넣는다. 뽑은 수를 돌려준다 */
const botDraws = { count: 0, goldByTier: [[], [], [], [], []] as number[][], battleGoldByTier: [[], [], [], [], []] as number[][] };
function botBuyTiles(save: SaveData, seed: number): number {
  if (!save.tiles.unlocked) return 0;
  const rng = createRng(seed >>> 0);
  const f = getFaction(save.factionId);
  let n = 0;
  for (;;) {
    const r = buyShopItem(save, f, 'tile-draw', 0, () => nextFloat(rng));
    if (!r.ok || !r.tile) break;
    n++;
    const dk = botDecks.get(save.tiles) ?? [];
    if (dk.length < BALANCE.provisional.expedition.deckSize + save.shared.deckSlots) botDecks.set(save.tiles, [...dk, r.tile]);
  }
  botDraws.count += n;
  return n;
}
function campaign(policy: { absorbWanted?: (seed: number) => (exp: ExpeditionState) => boolean; care?: 'good' | 'neglect'; stage?: number; keepElements?: string[] } = {}): CampaignStats {
  const out: CampaignStats = { stageRuns: [[], [], [], []], finalRuns: [], formCounts: { 2: {}, 3: {}, 4: {}, 5: {} }, stepsPerRun: [], hidden: 0, evolutions: 0, finalDefeats: [], saves: [], firstAt: {} };
  for (let seed = 1; seed <= CAMPAIGNS; seed++) {
    const save = newSaveData('hollow', seed * 7919);
    botTutorialRun(save, seed * 1000);
    botDecks.set(save.tiles, botDeck(save.tiles, 'hollow'));
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
      // 노리는 단계에서 그 속성 아닌 장착을 둥지에서 뺀다 (C.184, GDD 111장 1: 노멀 skill 특성은 칸에 들지 않으니 노멀을 노리면 칸을 비운다 — 사람이 노리는 방식)
      const keep = policy.keepElements;
      if (keep && save.evolution.tierIndex === policy.stage) save.build.slots = save.build.slots.map((id) => (id !== null && keep.includes(getTrait(id).element) ? id : null));
      const e = playExpedition(
        createExpedition({
          factionId: 'hollow', seed: seed * 1000 + run, runId: nextRunId(save), hunger: save.nest.hunger, condition: save.nest.condition,
          deck: botDeck(save.tiles, 'hollow'), risk: save.nest.risk, stability: save.nest.stability, build: save.build, evolution: save.evolution, tilesLocked: !save.tiles.unlocked,
        }),
        { returnAfterLap: 4, absorb: 'absorb', ...(wanted ? { absorbWanted: wanted } : {}) },
      );
      const goldBefore = save.shared.tradeCoins;
      if (save.evolution.tierIndex < 4) out.stepsPerRun.push(e.evolution.steps - save.evolution.steps); // 마지막 단계는 걸음을 세지 않는다
      if (save.evolution.tierIndex < 4 && e.outcome === 'defeated') defeats++;
      const tier = save.evolution.tierIndex;
      const r = recordExpedition(save, e, 0);
      botDraws.goldByTier[tier]!.push(save.shared.tradeCoins - goldBefore);
      botDraws.battleGoldByTier[tier]!.push(summarize(e).keptGold);
      botBuyTiles(save, seed * 7 + run);
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
if (needCampaign) {
  const st = campaign();
  campaignSaves = st.saves;
  campaignFirstAt = st.firstAt;
  campaignFinalRuns = st.finalRuns;
  campaignFinalDefeats = st.finalDefeats;
  console.log(`\n진화 (흡수 봇 ${CAMPAIGNS}명 × 4바퀴 원정 최대 ${MAX_RUNS}회, 귀환 때 자동 진화) — 필요 걸음 ${BALANCE.provisional.evolution.stepsNeeded.join('/')}칸 (숨김)`);
  console.log(`  원정 1회 평균 ${avg(st.stepsPerRun).toFixed(1)}칸 (최소 ${Math.min(...st.stepsPerRun)} · 최대 ${Math.max(...st.stepsPerRun)})`);
  // C.120 (GDD 64·67장): 첫 원정 튜토리얼 1판 → 타일 0장 시작 → 첫 진화 3장 → 상점 타일 뽑기(골드가 되는 만큼)
  const TDp = BALANCE.provisional.tileDraw.price;
  const tutOk = st.saves.filter((x) => (x.runLog.tutorialRewards ?? []).length === 1 && x.runLog.runs[0]?.tutorial === true && x.runLog.absorbs.length > 0).length;
  const goldLine = (by: number[][]) => by.map((g, i) => (g.length ? `${i + 1}단계 ${avg(g).toFixed(0)}` : '')).filter(Boolean).join(' · ');
  console.log(`  첫 원정 튜토리얼 통과 ${tutOk}/${st.saves.length} · 타일 뽑기 ${botDraws.count}회(가격 ${TDp})`);
  console.log(`  원정 1회(4바퀴) 골드 = 전투 ${goldLine(botDraws.battleGoldByTier)} / 먹이 넘침 포함 ${goldLine(botDraws.goldByTier)} → 2단계 전투 골드로 뽑기 1회 = 원정 ${(TDp / Math.max(1, avg(botDraws.battleGoldByTier[1]!))).toFixed(1)}회`);
  if (tutOk !== st.saves.length) failures.push(`첫 원정 튜토리얼: 통과 ${tutOk}/${st.saves.length}`);
  const unlockedAll = st.saves.filter((x) => x.evolution.tierIndex >= 1).every((x) => x.tiles.unlocked && (x.tiles.collection['prey-nest-a'] ?? 0) >= 1);
  if (!unlockedAll) failures.push('첫 진화 시작 타일: 진화한 세이브 중 타일이 안 열린 세이브가 있다');
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

// ── 보스 자유 원정 등장 — 2·3장 사냥터 (C.84 측정, C.94 정식 가드, GDD 37장 7번·41장 2번 ④): 그 장 보스를 스토리에서 이긴 몸 = 보스 화의 권장 단계에 갓 닿은 진화 봇 몸, 그 화의 ★.
// 1단계 새 몸은 이 보스를 만날 수 없다(스토리 보스가 4·5단계 권장). 같은 시드로 보스 처치 전/후 짝 비교, 가드 패배율 +5%p 이하 ──
if (want('boss23')) {
  const K = 30;
  const BF = BALANCE.provisional.boss;
  for (const g of GROUNDS.filter((x) => x.unlockTierIndex > 0)) {
    const boss = groundBossId('hollow', g.id);
    if (!boss) continue;
    let tier = 0;
    let star = 1;
    for (const ch of STORY_CHAPTERS) {
      const ep = chapterContent('hollow', ch.id)?.episodes.find((e) => e.boss?.id === boss);
      if (ep) {
        tier = ep.recommendedTier - 1;
        star = ep.difficulty;
      }
    }
    const bodies = campaignFirstAt[tier] ?? [];
    let defOff = 0;
    let defOn = 0;
    let appeared = 0;
    let bossLost = 0;
    let runs = 0;
    bodies.forEach((body, bi) => {
      for (let k = 1; k <= K; k++) {
        const seed = 90000 + bi * 101 + k;
        const mk = (beaten: string[]) => createExpedition({
          factionId: 'hollow', seed, hunger: 20, condition: 80, deck: botDeck(body.tiles, 'hollow'), stability: body.nest.stability,
          build: body.build, evolution: body.evolution, tileVariants: true, groundId: g.id, difficulty: star, bossesBeaten: beaten,
        });
        const off = playExpedition(mk([]), { returnAfterLap: 4, absorb: 'absorb', absorbWanted: mixedWanted });
        const on = playExpedition(mk([boss]), { returnAfterLap: 4, absorb: 'absorb', absorbWanted: mixedWanted });
        runs++;
        if (off.outcome === 'defeated') defOff++;
        if (on.outcome === 'defeated') defOn++;
        if (on.freeBoss?.appear) appeared++;
        if (on.freeBoss?.result && !on.freeBoss.result.won) bossLost++;
      }
    });
    const dInc = runs ? (defOn - defOff) / runs : 0;
    console.log(`\n보스 자유 원정 등장 (GDD 37장, 사냥터 ${g.id} 보스 ${boss}, ${tier + 1}단계에 갓 닿은 몸 ${bodies.length}명 × ${K}판 ★${star}, ${BF.freeFromLap}바퀴째부터 ${Math.round(BF.freeChance * 100)}%)`);
    console.log(`  등장 ${appeared}/${runs}(${((appeared / Math.max(1, runs)) * 100).toFixed(1)}%) · 보스에게 짐 ${bossLost}/${appeared} · 패배율 ${((defOff / Math.max(1, runs)) * 100).toFixed(1)} → ${((defOn / Math.max(1, runs)) * 100).toFixed(1)}% (${dInc >= 0 ? '+' : ''}${(dInc * 100).toFixed(1)}%p, 가드 +8%p 이하)`);
    if (bodies.length < CAMPAIGNS * 0.8) failures.push(`보스 자유 원정(${g.id}): ${tier + 1}단계 몸 ${bodies.length}/${CAMPAIGNS}`);
    // C.177 (GDD 107장 8번): 보스는 4바퀴째 이어 온 체력으로 만난다 — +5%p → +8%p
    if (dInc > 0.08) failAt(tier, `보스 자유 원정(${g.id}): 패배율 +${(dInc * 100).toFixed(1)}%p > +8%p (GDD 37장 7번·107장 8번)`);
  }
}

// ── 환생 (C.56, GDD 22-7): 위 진화 봇 중 5단계에 닿은 세이브(원정 MAX_RUNS 회를 마친 몸)가 환생(장착 첫 특성 계승)하고 같은 방식으로 다시 5단계까지.
// 계승 효과 = 노력치 10% 누적 + 특성 1개. 진화 타이밍은 걸음 수라 원정 수는 패배(걸음이 덜 쌓임)로만 달라진다 — 그 차이와 패배 수를 본다. 가드는 없음(보고용)
if (want('rebirth')) {
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
            deck: botDeck(save.tiles, 'hollow'), risk: save.nest.risk, stability: save.nest.stability, build: save.build, evolution: save.evolution,
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
            deck: botDeck(save.tiles, 'hollow'), risk: save.nest.risk, stability: save.nest.stability, build: save.build, evolution: save.evolution,
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
if (want('policy')) {
  type Policy = { name: string; wanted?: (seed: number) => (exp: ExpeditionState) => boolean; care?: 'good' | 'neglect'; stage?: number; expect?: string; keepElements?: string[] };
  const only = (els: string[]) => () => (exp: ExpeditionState) => els.includes(exp.absorbOffer!.element);
  const policies: Policy[] = [
    { name: '물·흙만 흡수', wanted: only(['water', 'earth']), stage: 2, expect: 'h4:fusion:water+earth' },
    { name: '불·뇌만 흡수', wanted: only(['fire', 'thunder']), stage: 2, expect: 'h4:fusion:fire+thunder' },
    { name: '혈+불만 흡수', wanted: only(['blood', 'fire']), stage: 2, expect: 'h4:special:blood' },
    { name: '노멀만 흡수', wanted: only(['normal']), stage: 2, expect: 'h4:pure', keepElements: ['normal'] },
    { name: '돌보지 않음', care: 'neglect', expect: 'h4:fail' },
    { name: '대부분 놓아줌', wanted: (seed) => (exp) => (exp.absorbRecords.length * 7 + seed) % 4 === 0, stage: 3, expect: 'h5:restraint' },
  ];
  console.log(`\n정책 봇 진화 (봇 ${CAMPAIGNS}명 × 4바퀴 원정 최대 ${MAX_RUNS}회, 정책은 노리는 단계에서만) — 히든 도달 (그 정책이 노리는 히든 / 전체 히든)`);
  for (const pol of policies) {
    const st = campaign({ absorbWanted: pol.wanted, care: pol.care, stage: pol.stage, keepElements: pol.keepElements });
    const all = Object.values(st.formCounts).flatMap((c) => Object.entries(c));
    const target = all.filter(([id]) => id === pol.expect).reduce((a, [, n]) => a + n, 0);
    const hiddenTop = all.filter(([id]) => FORM_TABLE.find((f) => f.id === id)?.hidden).sort((a, b) => b[1] - a[1]).map(([id, n]) => `${formName(FORM_TABLE.find((f) => f.id === id)!, 'hollow')} ${n}`).join(' · ');
    console.log(`  ${pol.name.padEnd(10)} 노림 ${pol.expect} ${target}/${CAMPAIGNS} · 히든 ${st.hidden}/${st.evolutions} · 5단계 ${st.finalRuns.length}/${CAMPAIGNS} — ${hiddenTop || '히든 없음'}`);
  }
}

// ── 진화 트리 점검 (GDD 20-5): 모든 진화체(일반 35 + 히든 12)가 무작위 상태에서 실제로 뽑히는가, 단계별 히든 비율 ──
if (want('tree')) {
  const EVC = BALANCE.provisional.evolution;
  const t0 = Date.now();
  const rep = analyzeTree(FORM_TABLE, 'hollow', EVC.analysis.samples, EVC.analysis.seed);
  const normalCount = FORM_TABLE.filter((f) => !f.hidden).length;
  const hiddenCount = FORM_TABLE.filter((f) => f.hidden).length;
  console.log(`\n진화 트리 점검 (일반 ${normalCount}+1단계 + 히든 ${hiddenCount}, 단계당 무작위 상태 ${EVC.analysis.samples}개, ${((Date.now() - t0) / 1000).toFixed(1)}초)`);
  for (const [tier, r] of Object.entries(rep.hiddenRate)) console.log(`  ${tier}단계: 히든 ${((r.hidden / r.samples) * 100).toFixed(1)}%`);
  console.log(`  한 번도 안 뽑힌 진화체: ${rep.unreachable.length ? rep.unreachable.join(', ') : '없음'}`);
  if (rep.unreachable.length > 0) failures.push(`진화 트리: 뽑히지 않는 진화체 ${rep.unreachable.join(', ')}`);
  // 기획의 일반 32종 = 1단계(진화체 없음, 종족 설정 baseStats) + 진화체 31 (C.106, GDD 49-7 ②: 4단계 일반 = 노멀 + 원소 5종)
  if (normalCount !== 31 || hiddenCount !== 12) failures.push(`진화 트리: 일반 진화체 ${normalCount}·히든 ${hiddenCount} (기획 31(+1단계) + 12, 환생 전용 포함)`);
}

// ── 권장 단계 등가 점검 (C.75, GDD 32-1 2번): n단계 몸(그 단계 기본 진화체, 노력치 0, skill 1개 빌드)이 ★n 적 풀과 1:1 로 싸우면 1단계 몸 ★1 과 같은 길이·승률이어야 한다 ──
// (내 능력치는 절대값이지만 적 기준 능력치·체력·공격이 ★ 를 따라 같이 오르므로 "권장 단계 = 일반 약 45초·강적 약 90초" 가 단계마다 유지된다.) 가드: 일반 처치 시간이 2~5단계 평균의 0.8~1.30배 (×1.30: C.134 해방 후 1단계 여유, 마스터M), 강적 승률이 평균 ±15%p 안 (★1 은 입문 보정으로 더 쉬움, C.76)
if (want('equiv')) {
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
    if (r.nSecs < b.nSecs * 0.8 || r.nSecs > b.nSecs * 1.3) failAt(i, `권장 단계 등가: ${i + 1}단계 몸 ★${i + 1} 일반 ${r.nSecs.toFixed(1)}초 가 2~5단계 평균 ${b.nSecs.toFixed(1)}초 의 0.8~1.30배 밖`);
    if (i === 0) { if (r.eWin < rows[1]!.eWin) failures.push(`권장 단계 등가: 1단계 몸 ★1 강적 승률 ${(r.eWin * 100).toFixed(0)}% < 2단계 ${(rows[1]!.eWin * 100).toFixed(0)}% (입문 보정이 안 먹었다)`); }
    else if (Math.abs(r.eWin - b.eWin) > 0.15) failAt(i, `권장 단계 등가: ${i + 1}단계 몸 ★${i + 1} 강적 승률 ${(r.eWin * 100).toFixed(0)}% 가 2~5단계 평균 ${(b.eWin * 100).toFixed(0)}% 와 15%p 넘게 다르다`);
  });
}

// ── 진화체 특성 (C.89, GDD 39장 7번): 4·5단계 진화체마다(노력치 0, 성향 = 종족값 최고, skill 1개) 권장 ★ 적 풀과 1:1 — 특성(속성·전용) 켬/끔 ──
// 가드: 특성이 올려 주는 강적 승률(켬 − 끔)이 같은 단계 평균 ±10%p 안, 특성 끔 대비 일반 처치 시간 −15% 이내(너무 쉬워지지 않게). 5단계 히든(속성 잇기)은 4단계 노멀을 이어받은 몸.
// 기획서(39장 7번)는 "강적 승률 차 ±10%p" — 특성 끔 상태에서 이미 진화체 종족값·속성 상성 차로 37~88%(실패형 0%) 벌어져 있어 특성 몫(켬 − 끔)만 가드하고 절대 승률은 참고 출력 (C.89 판단)
if (want('abilities')) {
  const NA = 32;
  const t5 = [...ELEMENT_IDS.map((el) => `t5:${el}:mixed`), 'h5:limit', 'h5:restraint', 'h5:hunter', 'h5:reborn'];
  const groups: [number, string[]][] = [[3, formsOfTier(4).map((f) => f.id)], [4, t5]];
  console.log(`\n진화체 특성 (GDD 39장 7번, 사람형 봇, 진화체 몸 + skill 1개 vs 권장 ★ 적 풀, 종류마다 ${NA}판) — 특성 몫(켬 − 끔) 강적 승률 단계 평균 ±10%p · 일반 처치 시간 −15% 이내`);
  for (const [tier, ids] of groups) {
    const star = recommendedDifficulty(tier);
    const rows = ids.map((id) => {
      const form = FORM_TABLE.find((f) => f.id === id)!;
      const prev = form.tier === 5 && !form.elements ? 't4:normal' : form.tier === 5 ? (FORM_TABLE.some((f) => f.id === `t4:${form.label.elements[0]}`) ? `t4:${form.label.elements[0]}` : `h4:special:${form.label.elements[0]}`) : 't3:base'; // C.106: 특수 속성 바스트로데는 히든 특수형만
      const evo = { ...newEvolution(), tierIndex: tier, formId: id, formHistory: ['t2:base', 't3:base', ...(tier === 4 ? [prev] : []), id], ability: abilityFor(zeroStats(), form) };
      const stat = (cls: 'normal' | 'elite', on: boolean) => {
        let g = 0, w = 0, secs = 0;
        for (const base of POOL_ENEMIES.filter((e) => e.class === cls)) {
          for (let seed = 1; seed <= NA; seed++) {
            const params = { ...buildOf(['t-thunder-c']) } as Partial<CombatParams>;
            applyEvolutionToParams(params, evo, BALANCE_FACTION);
            if (!on) {
              params.critChance = (params.critChance ?? CX.critChance) - abilityEffectsOf(formAbilitiesOf(form, evo.ev, evo.ability)).critChance;
              params.abilityEffects = {};
            }
            applyDifficultyToParams(params, star);
            const end = playCombatHuman(createCombat(seed * 37 + star, { enemy: enemyAtDifficulty(base, star), params }));
            g++;
            if (end.status === 'won') { w++; secs += elapsedSeconds(end); }
          }
        }
        return { win: g ? w / g : 0, secs: w ? secs / w : 0 };
      };
      return { id, on: { n: stat('normal', true), e: stat('elite', true) }, off: { n: stat('normal', false), e: stat('elite', false) } };
    });
    const mean = rows.reduce((a, r) => a + r.on.e.win, 0) / rows.length;
    const meanOff = rows.reduce((a, r) => a + r.off.e.win, 0) / rows.length;
    const gain = mean - meanOff;
    console.log(`  ${tier + 1}단계 ★${star}: 강적 승률 평균 켬 ${(mean * 100).toFixed(0)}% / 끔 ${(meanOff * 100).toFixed(0)}% (특성 몫 평균 +${(gain * 100).toFixed(1)}%p)`);
    for (const r of rows) {
      const ratio = r.off.n.secs ? r.on.n.secs / r.off.n.secs : 1;
      console.log(`    ${r.id.padEnd(22)} 일반 ${r.on.n.secs.toFixed(1).padStart(5)}초 (끔 ${r.off.n.secs.toFixed(1).padStart(5)}, ×${ratio.toFixed(2)}) · 강적 ${(r.on.e.win * 100).toFixed(0).padStart(3)}% (끔 ${(r.off.e.win * 100).toFixed(0).padStart(3)}%, 특성 몫 ${((r.on.e.win - r.off.e.win) * 100).toFixed(0).padStart(3)}%p)`);
      const g = r.on.e.win - r.off.e.win;
      if (Math.abs(g - gain) > 0.1) lateFail(`진화체 특성: ${r.id} 특성 몫(강적 승률 켬 − 끔) ${(g * 100).toFixed(0)}%p 가 ${tier + 1}단계 평균 ${(gain * 100).toFixed(1)}%p 와 10%p 넘게 다르다 (GDD 39장 7번)`);
      if (ratio < 0.85) lateFail(`진화체 특성: ${r.id} 일반 처치 시간 ×${ratio.toFixed(2)} (특성 끔 대비 −15% 넘게 빨라짐, GDD 39장 7번)`);
    }
  }
}

// ── 물공 6속성 (C.103 → C.105, GDD 49-1 5번 · 49-9 · 49-11): 5단계에 갓 닿은 몸(위 진화 봇 세이브 30명)의 진화체만 t5:<속성>:physical 로 바꿔 사람형 봇이 ★5 적 풀(일반·강적) · forest-lord 보스 · 탑 41/45/50층.
// 물공 생성원 간격은 속성별(physBlocks.spawnSecondsByElement, 없으면 spawnSeconds — C.105b 혈만 짧게).
// '전' = 같은 몸에서 물공 블록·물공 특성만 뗀 옛 규칙, 특수(탄)·혼합(교)은 옛 규칙 그대로(비교표). 받은 피해 = 판당 최대 체력 대비 %, 버티는 초 = 판 시간 ÷ 받은 피해(체력 전부를 잃기까지).
// 목표(49-9): 흙 = 버티기(버티는 초가 다른 5속성 최대의 1.2배 이상 · 강적 패배율이 가장 낮음, 처치 속도 목표 없음) · 혈 = 일반·강적 처치 시간 6속성 중 가장 빠름(승률 ±10%p 예외) ·
//  혈 뺀 5속성 ★5 강적 승률 서로 ±10%p — 5단계라 후반 보류(45-6) 경고로. 49-1 5번 ②(전 대비 −10~−25%)는 v5.180 에 폐기.
// 84장 3번 (C.142, 가드): 블록형(같은 속성 특수·혼합 평균, 블록 다 쓰는 사람형 봇)이 평타형(물공)보다 일반 처치가 조금 빠르다 — 혈 뺀 5속성 각각 블록형/평타형 시간 비 < 1,
//  5속성 합 비 0.8~0.97 (너무 벌어지지 않게). 혈은 49-11 "물공 중 가장 빠름"이 우선이라 예외(출력만) ──
if (want('phys')) {
  const bodies = campaignFirstAt[4] ?? [];
  const PR = 1;
  const BR = 2;
  const FOREST = BOSSES.find((b) => b.id === 'forest-lord');
  type PhysRow = { nWin: number; nSecs: number; eWin: number; eSecs: number; taken: number; survive: number; physPer: number; boss: number; t41: number; t45: number; t50: number };
  const measure = (formId: string, physOn: boolean, full: boolean): PhysRow => {
    const paramsOf = (body: SaveData): Partial<CombatParams> => {
      const params = buildCombatParams(body.build, 'hollow');
      applyEvolutionToParams(params, { ...body.evolution, formId }, 'hollow');
      if (!physOn) {
        params.physBlock = null;
        const fx = { ...params.abilityEffects } as Record<string, unknown>;
        for (const k of PHYS_ABILITY_EFFECTS) delete fx[k];
        params.abilityEffects = fx as CombatParams['abilityEffects'];
      }
      params.liberationStartGauge = liberationStartGaugeOf(body.nest.stability);
      return params;
    };
    let ng = 0, nw = 0, ns = 0, eg = 0, ew = 0, es = 0, n = 0, taken = 0, secs = 0, phys = 0;
    bodies.forEach((body, bi) => {
      POOL_ENEMIES.forEach((enemy, ei) => {
        for (let k = 0; k < PR; k++) {
          const params = paramsOf(body);
          applyDifficultyToParams(params, MAX_DIFFICULTY);
          const end = playCombatHuman(createCombat(90000 + bi * 131 + k * 17 + ei * 7, { enemy: enemyAtDifficulty(enemy, MAX_DIFFICULTY), params }));
          n++; taken += (end.damageTaken ?? 0) / end.player.maxHp; secs += elapsedSeconds(end); phys += end.physSpawned ?? 0;
          if (enemy.class === 'normal') { ng++; if (end.status === 'won') { nw++; ns += elapsedSeconds(end); } }
          else { eg++; if (end.status === 'won') { ew++; es += elapsedSeconds(end); } }
        }
      });
    });
    const takenAvg = n ? taken / n : 0;
    const row: PhysRow = { nWin: ng ? nw / ng : 0, nSecs: nw ? ns / nw : 0, eWin: eg ? ew / eg : 0, eSecs: ew ? es / ew : 0, taken: takenAvg, survive: takenAvg > 0 ? secs / n / takenAvg : 0, physPer: n ? phys / n : 0, boss: 0, t41: 0, t45: 0, t50: 0 };
    if (!full) return row;
    let bw = 0, bg = 0;
    const tower: Record<number, { w: number; g: number }> = { 41: { w: 0, g: 0 }, 45: { w: 0, g: 0 }, 50: { w: 0, g: 0 } };
    bodies.forEach((body, bi) => {
      for (let k = 0; k < BR; k++) {
        if (FOREST) {
          const params = paramsOf(body);
          applyDifficultyToParams(params, FOREST.difficulty);
          const end = playCombatHuman(createCombat(80000 + bi * 131 + k * 17, { enemy: scaleEnemy(FOREST.enemy, enemyScale(1, 'forest', FOREST.difficulty)), params, boss: bossSetupOf(FOREST.id) }));
          bg++; if (end.status === 'won') bw++;
        }
        for (const f of [41, 45, 50]) {
          const end = playCombatHuman(createTowerCombat(towerFloor(f), paramsOf(body), 61000 + f * 1009 + bi * 131 + k * 17));
          tower[f]!.g++; if (end.status === 'won') tower[f]!.w++;
        }
      }
    });
    row.boss = bg ? bw / bg : 0;
    row.t41 = tower[41]!.w / Math.max(1, tower[41]!.g);
    row.t45 = tower[45]!.w / Math.max(1, tower[45]!.g);
    row.t50 = tower[50]!.w / Math.max(1, tower[50]!.g);
    return row;
  };
  const pct = (x: number) => `${(x * 100).toFixed(0).padStart(3)}%`;
  const line = (label: string, r: PhysRow, full = true) => console.log(`  ${label.padEnd(16)} 일반 ${pct(r.nWin)} ${r.nSecs.toFixed(1).padStart(5)}초 · 강적 ${pct(r.eWin)} ${r.eSecs.toFixed(1).padStart(5)}초 · 받은 피해 ${pct(r.taken)} · 버티는 ${r.survive.toFixed(0).padStart(3)}초${full ? ` · 물공 ${r.physPer.toFixed(1)}개/판 · 보스 ${pct(r.boss)} · 탑 41층 ${pct(r.t41)} · 45층 ${pct(r.t45)} · 50층 ${pct(r.t50)}` : ''}`);
  console.log(`\n물공 6속성 (C.105, GDD 49-9·49-11, 사람형 봇, 5단계에 갓 닿은 몸 ${bodies.length}명 × ★${MAX_DIFFICULTY} 적 풀 ${POOL_ENEMIES.length}종 × ${PR}판 · forest-lord·탑 41/45/50층 × ${BR}판, 물공 생성원 ${BALANCE.provisional.physBlocks.spawnSeconds}초${Object.entries(BALANCE.provisional.physBlocks.spawnSecondsByElement).map(([k, v]) => ` · ${k} ${v}초`).join('')}) — 목표 흙 버티기(버티는 초 ≥ 남 최대 ×1.2·강적 패배율 최저) · 혈 처치 시간 최단 · 혈 뺀 5속성 강적 승률 ±10%p (후반 보류) · 블록형 > 평타형(84장 3번, 가드)`);
  if (bodies.length < CAMPAIGNS * 0.8) failAt(4, `물공 6속성: 5단계 몸 ${bodies.length}/${CAMPAIGNS}`);
  else {
    const rows = PHYS_ELEMENT_IDS.map((el) => ({ el, on: measure(`t5:${el}:physical`, true, true), off: measure(`t5:${el}:physical`, false, true), special: measure(`t5:${el}:special`, false, false), mixed: measure(`t5:${el}:mixed`, false, false) }));
    const TANK = 'earth', FAST = 'blood';
    const five = rows.filter((r) => r.el !== FAST);
    const mean = five.reduce((a, r) => a + r.on.eWin, 0) / five.length;
    const others = (el: string) => rows.filter((r) => r.el !== el);
    const blockSecsOf = (r: (typeof rows)[number]) => (r.special.nSecs + r.mixed.nSecs) / 2;
    for (const r of rows) {
      line(`${r.el} 물공 후`, r.on);
      line(`${r.el} 물공 전`, r.off);
      line(`${r.el} 특수(옛)`, r.special, false);
      line(`${r.el} 혼합(옛)`, r.mixed, false);
      const ratio = r.off.nSecs ? r.on.nSecs / r.off.nSecs : 1;
      // C.142 (GDD 84장 3번): 블록형 몸(특수·혼합, 블록을 다 쓰는 사람형 봇)이 평타형 몸(물공)보다 조금 빨리 잡는다
      const blockSecs = blockSecsOf(r);
      const bvp = blockSecs / Math.max(0.1, r.on.nSecs);
      console.log(`    → 블록형(특수·혼합 평균) 일반 ${blockSecs.toFixed(1)}초 vs 평타형(물공) ${r.on.nSecs.toFixed(1)}초 (×${bvp.toFixed(2)}, 84장 3번 목표 ×1 미만${r.el === FAST ? ' — 혈은 49-11 속도 우선, 예외' : ''})`);
      if (r.el !== FAST && bvp >= 1) failures.push(`물공 6속성: ${r.el} 블록형 일반 ${blockSecs.toFixed(1)}초 가 평타형(물공) ${r.on.nSecs.toFixed(1)}초 보다 빠르지 않다 (×${bvp.toFixed(2)}, GDD 84장 3번)`);
      console.log(`    → 물공 전 대비 일반 처치 시간 ×${ratio.toFixed(2)} (${((ratio - 1) * 100).toFixed(1)}%, 참고 — 49-1 5번 ② 폐기) · 강적 승률 ${((r.on.eWin - r.off.eWin) * 100).toFixed(0)}%p · 5속성 평균과 차 ${((r.on.eWin - mean) * 100).toFixed(0)}%p · 버티는 초 ${r.off.survive.toFixed(0)} → ${r.on.survive.toFixed(0)}`);
      if (r.el === TANK) {
        const bestOther = Math.max(...others(TANK).map((o) => o.on.survive));
        const lowestLoss = Math.min(...others(TANK).map((o) => 1 - o.on.eWin));
        if (r.on.survive < bestOther * 1.2) failAt(4, `물공 6속성: 흙 버티는 초 ${r.on.survive.toFixed(0)} 가 다른 속성 최대 ${bestOther.toFixed(0)} 의 1.2배 미만 (GDD 49-9 흙 버티기)`);
        if (1 - r.on.eWin > lowestLoss) failAt(4, `물공 6속성: 흙 ★${MAX_DIFFICULTY} 강적 패배율 ${pct(1 - r.on.eWin)} 이 다른 속성 최저 ${pct(lowestLoss)} 보다 높다 (GDD 49-9 흙 버티기)`);
      } else if (r.el === FAST) {
        const fastestN = Math.min(...others(FAST).map((o) => o.on.nSecs));
        const fastestE = Math.min(...others(FAST).map((o) => o.on.eSecs));
        if (r.on.nSecs > fastestN) failAt(4, `물공 6속성: 혈 일반 처치 ${r.on.nSecs.toFixed(1)}초 가 가장 빠르지 않다 (다른 속성 최단 ${fastestN.toFixed(1)}초, GDD 49-9 혈 속도)`);
        if (r.on.eSecs > fastestE) failAt(4, `물공 6속성: 혈 강적 처치 ${r.on.eSecs.toFixed(1)}초 가 가장 빠르지 않다 (다른 속성 최단 ${fastestE.toFixed(1)}초, GDD 49-9 혈 속도)`);
      } else {
        if (Math.abs(r.on.eWin - mean) > 0.1) failAt(4, `물공 6속성: ${r.el} ★${MAX_DIFFICULTY} 강적 승률 ${pct(r.on.eWin)} 이 혈 뺀 5속성 평균 ${pct(mean)} 과 10%p 넘게 다르다 (GDD 49-1 5번 ①·49-9)`);
      }
    }
    const sumBlock = five.reduce((a, r) => a + blockSecsOf(r), 0);
    const sumPhys = five.reduce((a, r) => a + r.on.nSecs, 0);
    const total = sumBlock / Math.max(0.1, sumPhys);
    console.log(`  블록형 vs 평타형 (84장 3번, 혈 뺀 5속성 합): 일반 ${sumBlock.toFixed(1)}초 / ${sumPhys.toFixed(1)}초 = ×${total.toFixed(2)} (가드 0.8~0.97) · 치명 블록형 +${(CX.blockPlayCrit * 100).toFixed(0)}%p · 물공 몸 피해 ×${BALANCE.provisional.physBlocks.damage}${Object.entries(BALANCE.provisional.physBlocks.damageByElement).map(([k, v]) => ` · ${k} ×${v}`).join('')}`);
    if (total < 0.8 || total > 0.97) failures.push(`물공 6속성: 블록형/평타형 일반 처치 시간 비 ×${total.toFixed(2)} 가 0.8~0.97 밖 (혈 뺀 5속성 합, GDD 84장 3번)`);
    if (!(CX.blockPlayCrit > 0)) failures.push(`블록형 치명 가산 blockPlayCrit ${CX.blockPlayCrit} 이 0 이하 (GDD 84장 3번 "클률 살짝 더 높게")`);
  }
}

// ── 원정 난이도 ★ (C.75, GDD 32-1): 그 단계에 갓 닿은 몸(위 진화 봇 세이브, 1단계는 새 세이브)으로 사람형 봇이 ★ = 단계−1 / 단계(권장) / 단계+1 에서 4바퀴 원정 ──
// 목표(32-1 3번, provisional): 권장 ★ 에서 일반 약 45초·강적 약 90초(원정 안이라 바퀴 강화·빌드 성장이 섞여 전투 구간보다 짧다 — 1단계 권장 값을 기준선으로 삼아 단계별로 ±25% 안),
//  한 단계 위(★ = 단계−1)는 일반이 권장의 약 2/3 길이·강적 승률 상승, 한 단계 아래(★ = 단계+1)는 강적 승률이 크게(15%p 이상) 떨어진다.
// 가드: 권장 ★ 일반 승률 85% 이상, 위·아래 방향이 맞을 것(한 단계 위 강적 승률 ≥ 권장, 한 단계 아래 강적 승률 ≤ 권장 − 10%p)
if (want('difficulty')) {
  const DR = 3;
  console.log(`\n원정 난이도 ★ (GDD 32-1, 사람형 봇, 그 단계에 갓 닿은 몸 × ${DR}원정, 4바퀴 귀환·흡수) — 종족값 합계 ${BALANCE.provisional.stats.tierTotals.join('/')}, ★ 체력 배율 ${Array.from({ length: MAX_DIFFICULTY }, (_, i) => difficultyEnemyScale(i + 1).hp.toFixed(2)).join('/')}`);
  type Row = { win: number; nWin: number; eWin: number; nSecs: number; eSecs: number; defeat: number; n: number; e: number; gold: number; food: number };
  const rows: Record<string, Row> = {};
  const measure = (bodies: SaveData[], star: number, tier: number, streak = 0, gear: GearCarry | null = null): Row => {
    let battles = 0, wins = 0, nW = 0, nG = 0, eW = 0, eG = 0, nS = 0, eS = 0, defeated = 0, runs = 0, gold = 0, food = 0;
    bodies.forEach((body, bi) => {
      for (let k = 0; k < DR; k++) {
        const save = structuredClone(body);
        const e = playExpedition(
          createExpedition({
            factionId: 'hollow', difficulty: star, streak, seed: 50000 + bi * 97 + k * 13 + tier * 7 + star * 1000, runId: nextRunId(save), hunger: 20, condition: 80,
            deck: botDeck(save.tiles, 'hollow'), risk: save.nest.risk, stability: save.nest.stability, build: save.build, evolution: save.evolution, gear,
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
  // 새 몸 = 첫 원정 튜토리얼을 마친 1단계 (C.120: 타일 0장·노력치 6종 +3)
  const freshBodies: SaveData[] = Array.from({ length: CAMPAIGNS }, (_, i) => { const sv = newSaveData('hollow', 777 + i * 31); botTutorialRun(sv, 4242 + i); botDecks.set(sv.tiles, botDeck(sv.tiles, 'hollow')); return sv; });
  const recNormalSecs: number[] = [];
  for (let tier = 0; tier < MAX_DIFFICULTY; tier++) {
    const bodies = tier === 0 ? freshBodies : campaignFirstAt[tier] ?? [];
    if (bodies.length < CAMPAIGNS * 0.8) { failAt(tier, `난이도: ${tier + 1}단계 몸 ${bodies.length}/${CAMPAIGNS}`); continue; }
    const rec = recommendedDifficulty(tier);
    const stars = [rec - 1, rec, rec + 1].filter((st) => st >= 1 && st <= MAX_DIFFICULTY);
    for (const star of stars) {
      const r = (rows[`${tier}/${star}`] = measure(bodies, star, tier));
      const tagTxt = star === rec ? '권장' : star < rec ? '한 단계 위 몸' : '한 단계 아래 몸';
      console.log(`  ${tier + 1}단계 몸 ${String(bodies.length).padStart(2)}명 · ★${star} (${tagTxt.padEnd(7)}) 일반 ${(r.nWin * 100).toFixed(0).padStart(3)}% ${r.nSecs.toFixed(1).padStart(5)}초 (${r.n}판) · 강적 ${(r.eWin * 100).toFixed(0).padStart(3)}% ${r.eSecs.toFixed(1).padStart(5)}초 (${r.e}판) · 원정 패배 ${(r.defeat * 100).toFixed(0)}%`);
    }
    const R = rows[`${tier}/${rec}`]!;
    recNormalSecs.push(R.nSecs);
    if (R.nWin < 0.85) failAt(tier, `난이도: ${tier + 1}단계 몸 권장 ★${rec} 일반 승률 ${(R.nWin * 100).toFixed(0)}% < 85%`);
    // C.76 (마스터G): 새 몸(1단계·특성 없음) ★1 4바퀴 원정 패배 15% 이하 — 새 플레이어 첫 경험
    if (tier === 0 && R.defeat > 0.15) failAt(tier, `난이도: 새 몸 ★1 4바퀴 원정 패배 ${(R.defeat * 100).toFixed(0)}% > 15% (C.76 목표)`);
    const up = rows[`${tier}/${rec - 1}`];
    const down = rows[`${tier}/${rec + 1}`];
    // C.120: 1단계 몸은 타일이 없어(GDD 64장) 4바퀴 빈 길에 강적이 나오지 않는다 — 강적 표본이 0판인 쪽은 비교하지 않는다
    const elite = (r: Row | undefined): r is Row => !!r && r.e > 0 && R.e > 0;
    if (elite(up) && up.eWin < R.eWin) failAt(tier, `난이도: ${tier + 1}단계 몸이 ★${rec - 1} 에서 강적 승률 ${(up.eWin * 100).toFixed(0)}% < 권장 ${(R.eWin * 100).toFixed(0)}% (한 단계 위가 더 쉽지 않다)`);
    if (elite(down) && down.eWin > R.eWin - 0.1) failAt(tier, `난이도: ${tier + 1}단계 몸이 ★${rec + 1} 에서 강적 승률 ${(down.eWin * 100).toFixed(0)}% > 권장 ${(R.eWin * 100).toFixed(0)}% − 10%p (한 단계 아래가 충분히 어렵지 않다)`);
  }
  // 1단계 몸은 특성이 없는 새 세이브, 2단계부터는 흡수 특성 2~4개·노력치가 있는 진화 봇 몸이라 처치 시간은 참고로만 (단계 간 등가는 위 '권장 단계 등가' 표가 가드)
  console.log(`  권장 ★ 일반 처치 시간 단계별: ${recNormalSecs.map((x) => x.toFixed(1)).join(' / ')}초 (참고 — 1단계는 특성 없는 새 몸)`);
  // ── 장비 참고 줄 (GDD 91장 7번, C.150): 기준 봇은 장비 없음(위 가드 그대로) — 같은 몸·같은 시드에 '그 단계 평균 장비'(5칸 레어 +2, ★ = 권장)를 끼우면 얼마나 쉬워지나. 가드 아님 ──
  const RL = BALANCE.provisional.gear.refLoadout;
  console.log(`  참고 — 그 단계 평균 장비 (5칸 ${RL.grade} +${RL.plus}, ★ = 권장, 기준 봇과 같은 몸·시드):`);
  for (let tier = 0; tier < MAX_DIFFICULTY; tier++) {
    const bodies = tier === 0 ? freshBodies : campaignFirstAt[tier] ?? [];
    const rec = recommendedDifficulty(tier);
    const base = rows[`${tier}/${rec}`];
    if (!base || bodies.length === 0) continue;
    const load = referenceLoadout(tier);
    const g = measure(bodies, rec, tier, 0, load);
    const st = Object.entries(load.stats).map(([k, v]) => `${k}+${v}`).join(' ');
    console.log(`    ${tier + 1}단계 ★${rec} 장비 [${st} 치명+${(load.crit * 100).toFixed(1)}%] 일반 ${(g.nWin * 100).toFixed(0).padStart(3)}% ${g.nSecs.toFixed(1).padStart(5)}초 (없음 ${base.nSecs.toFixed(1)}초) · 강적 ${(g.eWin * 100).toFixed(0).padStart(3)}% ${g.eSecs.toFixed(1).padStart(5)}초 (없음 ${(base.eWin * 100).toFixed(0)}% ${base.eSecs.toFixed(1)}초) · 원정 패배 ${(g.defeat * 100).toFixed(0)}% (없음 ${(base.defeat * 100).toFixed(0)}%)`);
  }

  // ── 재화 경제 (GDD 32-1 10·11번): 권장 ★ × 연속 0/5/10 의 원정 1판 지킨 골드·먹이. 목표: ★5·10연속 골드 ≤ ★1(새 몸, 연속 0)의 2배 ──
  const DX = BALANCE.provisional.difficulty;
  const SHX = BALANCE.shop;
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
    if (g5 > g1 * 2) lateFail(`재화 경제: ★${MAX_DIFFICULTY} ${DX.streak.maxClears}연속 골드 ${g5.toFixed(0)} > ★1 ${g1.toFixed(0)} 의 2배 (GDD 32-1 11번)`);
  }
}

// ── 사냥터 (C.53, GDD 24-2 → C.75 32-1 6번): 강도는 난이도로 일원화(모두 ×1). 새로 열린 사냥터는 먹이가 기본 사냥터보다 많이 나오는지만 본다 ──
if (want('grounds')) {
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
              deck: botDeck(save.tiles, 'hollow'), risk: save.nest.risk, stability: save.nest.stability, build: save.build, evolution: save.evolution,
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
      if (bodies.length < CAMPAIGNS * 0.8) failAt(tier, `사냥터 ${g.id}: ${tier + 1}단계 몸 ${bodies.length}/${CAMPAIGNS}`);
      if (g.strength.hp !== 1 || g.strength.attack !== 1) failAt(tier, `사냥터 ${g.id}: 강도 ×${g.strength.hp}·×${g.strength.attack} — C.75 부터 난이도로 일원화(×1)`);
      if (r.defeat > 0.45) failAt(tier, `사냥터 ${g.id}: ${tier + 1}단계 몸 원정 패배 ${(r.defeat * 100).toFixed(0)}% > 45% (너무 어렵다)`);
      if (r.food <= base.food) failAt(tier, `사냥터 ${g.id}: 먹이 ${r.food.toFixed(1)}개 ≤ 기본 사냥터 ${base.food.toFixed(1)}개`);
    }
  }
}

// ── 해방 (C.54, GDD 22-5): 5단계에 갓 닿은 몸(위 진화 봇 세이브)이 강적과 싸울 때 해방을 쓰면(봇은 게이지가 차면 바로) 승률이 얼마나 오르나 ──
// 목표(마스터 v5.13, provisional): 해방 사용 시 강적 승률 +10~15%p. 적은 그 단계에 열리는 사냥터(5단계 = 마지막 사냥터) 1~6바퀴(원정 최대) 강화.
// 1~4바퀴만 보면 해방 없이도 약 89% 라 올릴 자리가 11%p 뿐이다(dev-log C.54) — 늦은 바퀴까지 넣어 해방이 필요한 싸움을 함께 본다
if (want('liberation')) {
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
    let uses = 0;
    bodies.forEach((body, bi) => {
      for (const base of elites) {
        for (let lap = 1; lap <= BALANCE.expedition.maxLaps; lap++) {
          for (let k = 0; k < LR; k++) {
            const params = buildCombatParams(body.build, 'hollow');
            applyEvolutionToParams(params, body.evolution, 'hollow');
            params.liberationStartGauge = liberationStartGaugeOf(body.nest.stability);
            params.liberationEnabled = liberation;
            applyDifficultyToParams(params, recommendedDifficulty(tier));
            // C.76: 기준 = 권장 ★ · 연속 LIB_STREAK(적 +25%) — 사냥터 강도 일원화 뒤 "해방이 필요한 싸움"
            const end = playCombatHuman(createCombat(70000 + bi * 1009 + lap * 101 + k * 7 + base.hpInAttacks, { enemy: scaleEnemy(base, enemyScale(lap, ground.id, recommendedDifficulty(tier), LIB_STREAK, 'elite')), params }));
            games++;
            if (end.status === 'won') wins++;
            uses += end.liberation.uses;
            if (end.liberation.usedAtTick !== null) {
              used++;
              usedAt += end.liberation.usedAtTick * end.params.tickSeconds;
            }
          }
        }
      }
    });
    return { win: games ? wins / games : 0, games, used, uses, usedAt: used ? usedAt / used : 0 };
  };
  const off = rate(false);
  const on = rate(true);
  const gain = on.win - off.win;
  const LB = BALANCE.provisional.liberation;
  console.log(`\n해방 (사람형 봇, ${tier + 1}단계 몸 ${bodies.length}명 × 강적 ${elites.length}종 × 1~${BALANCE.expedition.maxLaps}바퀴 × ${LR}판, 사냥터 ${ground.id}, ★${recommendedDifficulty(tier)} 연속 ${LIB_STREAK}) — 목표(임시): 해방 사용 시 강적 승률 +10~15%p`);
  console.log(`  해방 수치(GDD 83장): 게이지 블록당 +${LB.gaugePerBlock}, ${LB.seconds}초 동안 블록 생성 ×${LB.spawnSpeed}(전부 해방 블록), 고유 효과 공속 ×${LB.uniqueAttackSpeed}·체인 속도 ×${LB.uniqueChainSpeed}·능력치 ×${LB.uniqueStatMultiplier}, 끝날 때마다 리스크 +${LB.riskOnEnd} · 평균 사용 ${on.games ? (on.uses / on.games).toFixed(1) : 0}회/전투`);
  console.log(`  해방 없음 ${(off.win * 100).toFixed(1)}% → 해방 사용 ${(on.win * 100).toFixed(1)}% (${gain >= 0 ? '+' : ''}${(gain * 100).toFixed(1)}%p) · 해방 쓴 전투 ${on.used}/${on.games} · 평균 ${on.usedAt.toFixed(1)}초에 사용`);
  if (bodies.length < CAMPAIGNS * 0.8) lateFail(`해방: ${tier + 1}단계 몸 ${bodies.length}/${CAMPAIGNS}`);
  // 회귀 가드는 목표보다 넓게(+5~25%p): 다른 수치를 고칠 때 해방이 무의미해지거나 압도적이 되는 것만 막는다
  if (gain < 0.05 || gain > 0.25) lateFail(`해방: 강적 승률 변화 ${(gain * 100).toFixed(1)}%p (가드 +5~25%p 밖)`);
}

// ── 보스전 (C.58, GDD 25-3·25-7): 보스가 나오는 스토리 장의 권장 단계에 갓 닿은 몸(위 진화 봇 세이브)으로 사람형 봇이 보스와 싸운다 ──
// 목표(마스터 25-7, provisional): 승률 50~70%. 가드는 목표보다 넓게(35~85%) — 다른 수치를 고칠 때 보스가 무의미하거나 못 깨는 벽이 되는 것만 막는다
if (want('bosses')) {
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
    let summons = 0;
    let minionKills = 0;
    bodies.forEach((body, bi) => {
      for (let k = 0; k < BR; k++) {
        const params = buildCombatParams(body.build, 'hollow');
        applyEvolutionToParams(params, body.evolution, 'hollow');
        applyDifficultyToParams(params, boss.difficulty);
        params.liberationStartGauge = liberationStartGaugeOf(body.nest.stability);
        const end = playCombatHuman(createCombat(80000 + bi * 131 + k * 17, { enemy: scaleEnemy(boss.enemy, enemyScale(1, ground, boss.difficulty)), params, boss: bossSetupOf(boss.id) }));
        games++;
        if (end.status === 'won') {
          wins++;
          secs += elapsedSeconds(end);
        }
        if (end.lossReason === 'timeout') timeouts++;
        if ((end.boss?.phase ?? 1) >= 2) phase2++;
        seals += end.boss?.seals ?? 0;
        summons += end.boss?.summons ?? 0;
        minionKills += end.boss?.minionKills ?? 0;
      }
    });
    const rate = games ? wins / games : 0;
    const BX = BALANCE.provisional.boss;
    const gimmickText = boss.gimmick === 'seal' ? `seal(${BX.seal.everySeconds}초마다 ${BX.seal.cells}칸 ${BX.seal.seconds}초)`
      : boss.gimmick === 'summon' ? `summon(${BX.summon.everySeconds}초마다 졸개 1, 체력 ${BX.summon.hpInAttacks}회분, ${BX.summon.attackSeconds}초마다 ${BX.summon.attackInAttacks}회분 · 판당 ${(summons / Math.max(1, games)).toFixed(1)}마리 부름/${(minionKills / Math.max(1, games)).toFixed(1)}마리 쓰러뜨림)`
      : boss.gimmick === 'element' ? `element(${[boss.enemy.element, ...(boss.elementShifts ?? [])].join(' → ')})` : boss.gimmick;
    console.log(`\n보스전 (사람형 봇, ${tier + 1}단계에 갓 닿은 몸 ${bodies.length}명 × ${BR}판, 사냥터 ${ground}, 보스 ★${boss.difficulty}) — 목표(임시): 승률 50~70%`);
    console.log(`  ${boss.id}: 체력 ${boss.enemy.hpInAttacks}회분 · 공격 ${boss.enemy.attackInAttacks} · 페이즈 ${boss.phases.map((p) => `${p.belowHpFraction * 100}% 이하 공격 간격 ×${p.attackSecondsMult}`).join(' / ')} · 기믹 ${gimmickText} · 시간 ${BX.timeLimitSeconds}초`);
    console.log(`  승률 ${(rate * 100).toFixed(0)}% · 승리 평균 ${wins ? (secs / wins).toFixed(1) : '-'}초 · 시간 초과 ${timeouts}/${games} · 2페이즈 도달 ${phase2}/${games} · 봉인 ${(seals / Math.max(1, games)).toFixed(1)}칸/판`);
    if (bodies.length < CAMPAIGNS * 0.8) failAt(tier, `보스전 ${boss.id}: ${tier + 1}단계 몸 ${bodies.length}/${CAMPAIGNS}`);
    if (rate < 0.35 || rate > 0.85) failAt(tier, `보스전 ${boss.id}: 승률 ${(rate * 100).toFixed(0)}% (가드 35~85% 밖)`);
  }
}

// ── 등급전 (C.49, GDD 21장): 번호 보유자 No.10 → No.1 승률 곡선. 위 진화 봇 중 5단계(아란칼)에 닿은 세이브(원정 MAX_RUNS 회를 마친 몸)로 사람형 봇이 각 보유자와 싸운다 ──
// 목표(provisional, 코딩41 판단): 위로 갈수록 내려가 No.1 약 20~30%. 이 봇은 원정 40회를 마친 다 자란 몸이라 No.10 은 거의 이긴다(갓 5단계가 된 몸은 약 85%, dev-log C.49). 가드: No.10 ≥ 60%, No.1 10~50%, 한 칸 위로 갈 때 승률이 12%p 넘게 오르지 않는다
if (want('rank')) {
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
        params.liberationStartGauge = liberationStartGaugeOf(save.nest.stability);
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
  if (ready.length < CAMPAIGNS * 0.8) lateFail(`등급전: 5단계 세이브 ${ready.length}/${CAMPAIGNS}`);
  const [no10, no1] = [rates[0]!, rates[rates.length - 1]!];
  if (no10 < 0.6) lateFail(`등급전: No.10 승률 ${(no10 * 100).toFixed(0)}% < 60%`);
  if (no1 < 0.1 || no1 > 0.5) lateFail(`등급전: No.1 승률 ${(no1 * 100).toFixed(0)}% (10~50% 밖)`);
  for (let i = 1; i < rates.length; i++) if (rates[i]! > rates[i - 1]! + 0.12) lateFail(`등급전: No.${10 - i} 승률이 No.${11 - i} 보다 ${((rates[i]! - rates[i - 1]!) * 100).toFixed(0)}%p 높다`);
}

// ── 도전의 탑 (C.85, GDD 36장 11번): 그 ★ 권장 단계 몸(1단계 = 새 몸, 2~5단계 = 그 단계에 갓 닿은 진화 봇 몸)으로 사람형 봇이 구간 첫 층·5층(강적)·끝 층(보스)과 싸운다.
// 50층은 5단계 + 특성·노력치를 잘 키운 몸(원정 MAX_RUNS 회를 마친 5단계 세이브). 체력 가득·흡수 없음.
// 목표(provisional): 구간 첫 층 거의 100%, 5층 강적 약 70%, 끝 층 보스 약 40~60%, 50층 약 30~50%. 가드는 목표보다 넓게
if (want('tower')) {
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
        params.liberationStartGauge = liberationStartGaugeOf(body.nest.stability);
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
  const bandText = Object.entries(TT.perFloorByBand).map(([k, v]) => `★${k} +${(v * 100).toFixed(0)}%/층`).concat(Object.entries(TT.bossScaleByBand).map(([k, v]) => `★${k} 보스 층 ×${v}`)).join('·');
  console.log(`\n도전의 탑 (사람형 봇, ★n = n단계 몸 × ${TR}판, 층 배율 구간 안 +${TT.perFloorInBand * 100}%/층${bandText ? `(${bandText})` : ''}·강적 층 ×${TT.eliteScale}·${TT.floors}층 +${TT.finalFloorBonus * 100}%) — 목표(임시): 구간 첫 층 ≈100%, 5층 강적 ≈70%, 끝 층 보스 40~60%, ${TT.floors}층 30~50%`);
  for (let star = 1; star <= TT.floors / TT.bandSize; star++) {
    // ★1 은 탑이 열리는 몸(스토리 1장 보스 권장 = 2단계에 갓 닿은 몸)으로 잰다 — 특성 없는 새 1단계 몸은 탑에 들어올 수 없어 참고 줄만
    const bodies = star === 1 ? campaignFirstAt[1] ?? [] : campaignFirstAt[star - 1] ?? [];
    if (bodies.length < CAMPAIGNS * 0.8) { failAt(star - 1, `탑 ★${star}: ${star}단계 몸 ${bodies.length}/${CAMPAIGNS}`); continue; }
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
    if (first.rate < 0.85) failAt(star - 1, `탑 ${base + 1}층: 일반 승률 ${pct(first.rate)} < 85%`);
    // ★1 은 한 단계 위 몸(탑이 열리는 2단계)이라 강적·보스는 참고만
    if (star > 1 && (elite.rate < 0.4 || elite.rate > 0.97)) failAt(star - 1, `탑 ${base + TT.eliteEvery}층: 강적 승률 ${pct(elite.rate)} (가드 40~97% 밖)`);
    // 보스가 아직 없어 fallbackBoss 로 이어 둔 층은 참고만 (그 보스가 들어오면 가드)
    const tempLink = TT.bossFloors[bossFloor] !== bossId;
    if (boss && tempLink) console.log(`    (임시 연결: ${TT.bossFloors[bossFloor]} 없음 → ${bossId}, 가드 제외)`);
    // C.94: ★2 구간은 구간별 층당 +%·보스 층 배율(perFloorByBand·bossScaleByBand)로 맞춰 20층도 가드에 든다 (C.85·C.84 의 '기록된 미달' 예외는 지움)
    if (boss && star > 1 && !tempLink && (boss.rate < 0.2 || boss.rate > 0.85)) failAt(star - 1, `탑 ${bossFloor}층: 보스 승률 ${pct(boss.rate)} (가드 20~85% 밖)`);
  }
  const grown = campaignSaves.filter((s) => s.evolution.tierIndex >= MAX_DIFFICULTY - 1);
  const top = fight(grown, TT.floors, 64000);
  const top5 = fight(campaignFirstAt[MAX_DIFFICULTY - 1] ?? [], TT.floors, 64000);
  console.log(`  ${TT.floors}층 (${towerFloor(TT.floors).bossId} 강화판): 키운 5단계 몸 ${grown.length}명 ${pct(top.rate)} ${top.secs.toFixed(1)}초 · 갓 5단계 몸 ${pct(top5.rate)} (참고)`);
  if (grown.length < CAMPAIGNS * 0.8) lateFail(`탑 ${TT.floors}층: 5단계 세이브 ${grown.length}/${CAMPAIGNS}`);
  if (top.rate < 0.15 || top.rate > 0.75) lateFail(`탑 ${TT.floors}층: 승률 ${pct(top.rate)} (가드 15~75% 밖)`);
}

if (lateHeld.length > 0) console.warn(`\n후반 보류(45-6) — 4단계 이후 가드 ${lateHeld.length}건, 실패 대신 경고:\n- ${lateHeld.join('\n- ')}`);
else if (LATE_HOLD) console.log('\n후반 보류(45-6): 4단계 이후 가드 경고 없음');
if (check) {
  if (failures.length > 0) {
    console.error(`회귀 가드 실패:\n- ${failures.join('\n- ')}`);
    process.exit(1);
  }
  console.log('\n회귀 가드 통과');
}
