// 수련 미니게임 4종의 핵심 규칙 (GDD 22-5). 종족 무관 순수 로직: 시간(초)과 입력만 받아 상태를 바꾼다. 화면은 이 상태를 그리기만 한다.
// 같은 시드 + 같은 입력 = 같은 결과. 조작은 전부 한 손가락(PC 방향키·스페이스): 방향 3개(위·정면·아래) / 위아래 이동 / 한 번 누르기 / 칸 누르기.
// 수치는 BALANCE.provisional.training (단계별 배열은 index 0 = 1단계).

import { BALANCE } from '../../config/balance';
import { createRng, nextFloat, nextInt, type Rng } from '../rng';
import type { TrainingGameId } from './training';

const TX = BALANCE.provisional.training;

export type GameStatus = 'playing' | 'won' | 'lost';

/** 단계별 값 (1~4단계, 범위 밖이면 끝 값) */
function byLevel<T>(arr: readonly T[], level: number): T {
  return arr[Math.max(0, Math.min(arr.length - 1, level - 1))]!;
}

// ── 1. 본능(정령) 대결: 상대가 위·정면·아래 중 하나로 공격을 예고 → 예고가 끝난 뒤 받아치는 창 안에 그 방향을 누른다 ──
export const DUEL_DIRS = ['up', 'mid', 'down'] as const;
export type DuelDir = (typeof DUEL_DIRS)[number];

export interface DuelState {
  kind: 'duel';
  level: number;
  rng: Rng;
  t: number;
  status: GameStatus;
  /** wait = 다음 예고까지 대기, tele = 예고 중(아직 누르면 안 됨), window = 받아치는 창 */
  phase: 'wait' | 'tele' | 'window';
  /** 지금 단계가 끝나는 시각 */
  until: number;
  /** 예고(또는 공격) 방향. 페이크면 예고 중간에 바뀐다 */
  dir: DuelDir;
  /** 페이크: 이 시각에 dir 이 fakeTo 로 바뀐다 (3단계부터) */
  fake: { at: number; to: DuelDir } | null;
  /** 다음 공격이 연속 공격인가 (4단계: 짧은 간격으로 한 번 더) */
  double: boolean;
  /** 받아친 횟수 / 놓친 횟수 */
  hits: number;
  misses: number;
  /** 화면 연출용 마지막 판정 */
  last: { at: number; ok: boolean; dir: DuelDir } | null;
}

export function createDuel(level: number, seed: number): DuelState {
  const s: DuelState = { kind: 'duel', level, rng: createRng(seed), t: 0, status: 'playing', phase: 'wait', until: 0, dir: 'mid', fake: null, double: false, hits: 0, misses: 0, last: null };
  scheduleDuel(s, 1.0);
  return s;
}

function scheduleDuel(s: DuelState, gap?: number): void {
  const [lo, hi] = TX.duel.gapSeconds;
  s.phase = 'wait';
  s.until = s.t + (gap ?? (s.double ? TX.duel.doubleGapSeconds : lo! + nextFloat(s.rng) * (hi! - lo!)));
  s.double = false;
}

function duelJudge(s: DuelState, ok: boolean): void {
  if (ok) s.hits++;
  else s.misses++;
  s.last = { at: s.t, ok, dir: s.dir };
  if (s.hits >= TX.duel.hits) s.status = 'won';
  else if (s.misses >= TX.duel.misses) s.status = 'lost';
  else {
    s.double = nextFloat(s.rng) < byLevel(TX.duel.doubleChance, s.level);
    scheduleDuel(s);
  }
}

export function stepDuel(s: DuelState, dt: number, press?: DuelDir | null): void {
  if (s.status !== 'playing') return;
  if (press) {
    // 예고 중에 누르면 이르다(놓침), 창 안에서 방향이 맞으면 받아치기, 틀리면 놓침. 대기 중 누름은 무시한다
    if (s.phase === 'tele') duelJudge(s, false);
    else if (s.phase === 'window') duelJudge(s, press === s.dir);
    if (s.status !== 'playing') return;
  }
  s.t += dt;
  if (s.fake && s.t >= s.fake.at) {
    s.dir = s.fake.to;
    s.fake = null;
  }
  if (s.t < s.until) return;
  if (s.phase === 'wait') {
    s.phase = 'tele';
    const tele = byLevel(TX.duel.telegraphSeconds, s.level);
    s.until = s.t + tele;
    s.dir = DUEL_DIRS[nextInt(s.rng, DUEL_DIRS.length)]!;
    s.fake = null;
    if (nextFloat(s.rng) < byLevel(TX.duel.fakeChance, s.level)) {
      const others = DUEL_DIRS.filter((d) => d !== s.dir);
      s.fake = { at: s.t + tele * TX.duel.fakeAtShare, to: others[nextInt(s.rng, others.length)]! };
    }
  } else if (s.phase === 'tele') {
    s.phase = 'window';
    s.until = s.t + byLevel(TX.duel.windowSeconds, s.level);
  } else {
    duelJudge(s, false); // 창이 지나도록 못 누름
  }
}

// ── 2. 탄막 피하기: 오른쪽에서 탄이 날아온다. 위/아래 두 칸을 오가며 버틴다 ──
export type Lane = 0 | 1;

export interface DodgeState {
  kind: 'dodge';
  level: number;
  rng: Rng;
  t: number;
  status: GameStatus;
  /** 내 칸 (0 = 위, 1 = 아래) */
  lane: Lane;
  /** 탄: x 는 1(오른쪽 끝) → 0(왼쪽 끝). 내 위치(PLAYER_X)를 지나는 순간 같은 칸이면 맞는다 */
  shots: { id: number; lane: Lane; x: number; hit: boolean }[];
  nextShotAt: number;
  nextId: number;
  hits: number;
  last: { at: number } | null;
}

/** 내 캐릭터의 가로 위치 (0~1) */
export const DODGE_PLAYER_X = 0.12;

export function createDodge(level: number, seed: number): DodgeState {
  return { kind: 'dodge', level, rng: createRng(seed), t: 0, status: 'playing', lane: 0, shots: [], nextShotAt: 1.0, nextId: 1, hits: 0, last: null };
}

/** move: 'up'/'down' 은 그 칸으로, 'toggle' 은 다른 칸으로 */
export function stepDodge(s: DodgeState, dt: number, move?: 'up' | 'down' | 'toggle' | null): void {
  if (s.status !== 'playing') return;
  if (move) s.lane = move === 'up' ? 0 : move === 'down' ? 1 : (s.lane === 0 ? 1 : 0);
  s.t += dt;
  const travel = byLevel(TX.dodge.travelSeconds, s.level);
  for (const shot of s.shots) {
    const before = shot.x;
    shot.x -= dt / travel;
    if (!shot.hit && before > DODGE_PLAYER_X && shot.x <= DODGE_PLAYER_X && shot.lane === s.lane) {
      shot.hit = true;
      s.hits++;
      s.last = { at: s.t };
    }
  }
  s.shots = s.shots.filter((x) => x.x > -0.1);
  if (s.hits >= TX.dodge.hitsToLose) {
    s.status = 'lost';
    return;
  }
  if (s.t >= TX.dodge.seconds) {
    s.status = 'won';
    return;
  }
  if (s.t >= s.nextShotAt) {
    s.shots.push({ id: s.nextId++, lane: nextInt(s.rng, 2) as Lane, x: 1, hit: false });
    const gap = byLevel(TX.dodge.spawnSeconds, s.level);
    s.nextShotAt = s.t + gap * (TX.dodge.spawnJitter.base + nextFloat(s.rng) * TX.dodge.spawnJitter.range);
  }
}

// ── 3. 칼날 맞대기: 막대 위 표시가 좌우로 오가고, 가운데 구간에서 누르면 성공. 판마다 속도가 다르다 ──
export interface ClashState {
  kind: 'clash';
  level: number;
  rng: Rng;
  t: number;
  status: GameStatus;
  /** 지금 판 (0부터) */
  round: number;
  /** 표시 위치 0~1, 한 번 왕복(0→1→0)에 걸리는 시간 */
  pos: number;
  period: number;
  /** 이 판이 시작된 시각 (표시는 이 시각부터 움직인다). pause 동안은 멈춤 */
  roundStart: number;
  pauseUntil: number;
  successes: number;
  fails: number;
  last: { at: number; ok: boolean } | null;
}

/** 판 사이(칼이 다시 맞부딪치기까지) 쉬는 시간(초): 판정 연출을 보고 다음 판을 준비한다 */
export const CLASH_PAUSE = 1.6;

export function clashZone(level: number): { lo: number; hi: number } {
  const w = byLevel(TX.clash.zoneWidth, level);
  return { lo: 0.5 - w / 2, hi: 0.5 + w / 2 };
}

export function createClash(level: number, seed: number): ClashState {
  const s: ClashState = { kind: 'clash', level, rng: createRng(seed), t: 0, status: 'playing', round: 0, pos: 0, period: 1, roundStart: CLASH_PAUSE, pauseUntil: CLASH_PAUSE, successes: 0, fails: 0, last: null };
  newClashRound(s);
  return s;
}

function newClashRound(s: ClashState): void {
  const [lo, hi] = byLevel(TX.clash.sweepSeconds, s.level) as readonly number[];
  s.period = lo! + nextFloat(s.rng) * (hi! - lo!);
  s.pos = 0;
}

function clashJudge(s: ClashState, ok: boolean): void {
  if (ok) s.successes++;
  else s.fails++;
  s.last = { at: s.t, ok };
  s.round++;
  // 다섯 번을 다 맞대고 판정한다. 이미 질 것이 정해지면(실패가 넘치면) 바로 끝
  if (s.fails > TX.clash.rounds - TX.clash.toWin) s.status = 'lost';
  else if (s.round >= TX.clash.rounds) s.status = s.successes >= TX.clash.toWin ? 'won' : 'lost';
  else {
    s.pauseUntil = s.t + CLASH_PAUSE;
    s.roundStart = s.pauseUntil;
    newClashRound(s);
  }
}

export function stepClash(s: ClashState, dt: number, press?: boolean): void {
  if (s.status !== 'playing') return;
  if (press && s.t >= s.pauseUntil) {
    const z = clashZone(s.level);
    clashJudge(s, s.pos >= z.lo && s.pos <= z.hi);
    if (s.status !== 'playing') return;
  }
  s.t += dt;
  if (s.t < s.pauseUntil) return;
  const e = s.t - s.roundStart;
  // 삼각파: 0 → 1 → 0. 두 번 왕복하도록 못 누르면 실패
  const ph = (e / s.period) % 1;
  s.pos = ph < 0.5 ? ph * 2 : 2 - ph * 2;
  if (e >= s.period * 2) clashJudge(s, false);
}

// ── 4. 먹이사슬: 칸 곳곳에 먹잇감(+1)과 포식자(−3)가 잠깐씩 나타난다. 시간 안에 목표 점수 ──
export interface ChainState {
  kind: 'chain';
  level: number;
  rng: Rng;
  t: number;
  status: GameStatus;
  /** 칸마다 지금 나와 있는 것 (없으면 null): 사라지는 시각 */
  cells: ({ kind: 'prey' | 'predator'; until: number; id: number } | null)[];
  nextSpawnAt: number;
  nextId: number;
  score: number;
  last: { at: number; cell: number; delta: number } | null;
}

export function createChain(level: number, seed: number): ChainState {
  return { kind: 'chain', level, rng: createRng(seed), t: 0, status: 'playing', cells: Array.from({ length: TX.chain.cells }, () => null), nextSpawnAt: TX.chain.firstSpawnSeconds, nextId: 1, score: 0, last: null };
}

export function stepChain(s: ChainState, dt: number, tap?: number | null): void {
  if (s.status !== 'playing') return;
  if (tap !== null && tap !== undefined && tap >= 0 && tap < s.cells.length) {
    const c = s.cells[tap];
    if (c) {
      const delta = c.kind === 'prey' ? TX.chain.preyScore : TX.chain.predatorScore;
      s.score = Math.max(0, s.score + delta);
      s.cells[tap] = null;
      s.last = { at: s.t, cell: tap, delta };
      if (s.score >= TX.chain.target) {
        s.status = 'won';
        return;
      }
    }
  }
  s.t += dt;
  s.cells = s.cells.map((c) => (c && c.until > s.t ? c : null));
  if (s.t >= TX.chain.seconds) {
    s.status = 'lost';
    return;
  }
  if (s.t >= s.nextSpawnAt) {
    const empty = s.cells.map((c, i) => (c ? -1 : i)).filter((i) => i >= 0);
    if (empty.length > 0) {
      const cell = empty[nextInt(s.rng, empty.length)]!;
      const kind = nextFloat(s.rng) < byLevel(TX.chain.predatorShare, s.level) ? 'predator' : 'prey';
      s.cells[cell] = { kind, until: s.t + byLevel(TX.chain.showSeconds, s.level), id: s.nextId++ };
    }
    s.nextSpawnAt = s.t + byLevel(TX.chain.spawnSeconds, s.level) * (TX.chain.spawnJitter.base + nextFloat(s.rng) * TX.chain.spawnJitter.range);
  }
}

// ── 공통 ──
export type MiniGameState = DuelState | DodgeState | ClashState | ChainState;

/** 한 판의 입력 (종목마다 하나) */
export type MiniGameInput =
  | { kind: 'duel'; dir: DuelDir }
  | { kind: 'dodge'; move: 'up' | 'down' | 'toggle' }
  | { kind: 'clash' }
  | { kind: 'chain'; cell: number };

export function createMiniGame(game: TrainingGameId, level: number, seed: number): MiniGameState {
  if (game === 'duel') return createDuel(level, seed);
  if (game === 'dodge') return createDodge(level, seed);
  if (game === 'clash') return createClash(level, seed);
  return createChain(level, seed);
}

/** dt 초 진행. 입력이 그 종목 것이 아니면 무시한다 */
export function stepMiniGame(s: MiniGameState, dt: number, input?: MiniGameInput | null): void {
  if (s.kind === 'duel') stepDuel(s, dt, input?.kind === 'duel' ? input.dir : null);
  else if (s.kind === 'dodge') stepDodge(s, dt, input?.kind === 'dodge' ? input.move : null);
  else if (s.kind === 'clash') stepClash(s, dt, input?.kind === 'clash');
  else stepChain(s, dt, input?.kind === 'chain' ? input.cell : null);
}

/** 점검 봇: 반응 지연(초)·실수 확률로 한 판을 끝까지 돌린다 (테스트·밸런스용). 같은 시드면 같은 결과 */
export function playMiniGameBot(s: MiniGameState, opt: { reaction?: number; mistake?: number; seed?: number } = {}): MiniGameState {
  const dt = 0.05;
  const reaction = opt.reaction ?? 0.25;
  const mistake = opt.mistake ?? 0;
  const rng = createRng(opt.seed ?? 7);
  let guard = 0;
  while (s.status === 'playing' && guard++ < 100000) {
    stepMiniGame(s, dt, botMove(s, reaction, mistake, rng));
  }
  return s;
}

function botMove(s: MiniGameState, reaction: number, mistake: number, rng: Rng): MiniGameInput | null {
  const slip = () => nextFloat(rng) < mistake;
  if (s.kind === 'duel') {
    if (s.phase !== 'window' || s.t < s.until - byLevel(TX.duel.windowSeconds, s.level) + reaction) return null;
    const dir = slip() ? DUEL_DIRS[(DUEL_DIRS.indexOf(s.dir) + 1) % 3]! : s.dir;
    return { kind: 'duel', dir };
  }
  if (s.kind === 'dodge') {
    // 내 칸으로 곧(반응 시간 + 여유) 올 탄이 있으면 다른 칸으로
    const travel = byLevel(TX.dodge.travelSeconds, s.level);
    const danger = s.shots.some((x) => !x.hit && x.lane === s.lane && x.x > DODGE_PLAYER_X && (x.x - DODGE_PLAYER_X) * travel < reaction + 0.15);
    if (!danger || slip()) return null;
    const other: Lane = s.lane === 0 ? 1 : 0;
    const blocked = s.shots.some((x) => !x.hit && x.lane === other && x.x > DODGE_PLAYER_X && (x.x - DODGE_PLAYER_X) * travel < 0.2);
    return blocked ? null : { kind: 'dodge', move: 'toggle' };
  }
  if (s.kind === 'clash') {
    if (s.t < s.pauseUntil) return null;
    const z = clashZone(s.level);
    const inZone = s.pos >= z.lo + 0.02 && s.pos <= z.hi - 0.02;
    if (!inZone) return null;
    return slip() ? null : { kind: 'clash' };
  }
  // chain: 나온 지 반응 시간이 지난 먹잇감을 누른다. 실수면 포식자를 누른다
  const show = byLevel(TX.chain.showSeconds, s.level);
  const ready = s.cells.findIndex((c) => c !== null && c.kind === 'prey' && s.t - (c.until - show) >= reaction);
  if (ready < 0) return null;
  if (slip()) {
    const bad = s.cells.findIndex((c) => c !== null && c.kind === 'predator');
    if (bad >= 0) return { kind: 'chain', cell: bad };
  }
  return { kind: 'chain', cell: ready };
}
