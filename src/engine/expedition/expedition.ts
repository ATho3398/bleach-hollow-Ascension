// 원정 엔진 (GDD 1장, 2-1, 6장). 종족 무관 순수 로직. 화면은 상태만 읽고, 시간(칸당 5초·배속)은 화면이 돌린다.
// 상태는 평범한 객체(rng 포함)라 structuredClone 으로 복제할 수 있고, 같은 시드 = 같은 원정.

import { BALANCE } from '../../config/balance';
import { ENEMIES } from '../../data/enemies';
import type { EnemyDef } from '../../data/schema';
import { getTile, tilesFor } from '../../data/tiles';
import { buildBattleRecord, createBattle, type BattleParams, type BattleState } from '../battle';
import { createRng, nextFloat, nextInt, type Rng } from '../battle/rng';
import type { BattleRecord, RunRecord } from '../runLog';

const EX = BALANCE.expedition;
const PX = BALANCE.provisional.expedition;

export type ExpeditionPhase = 'moving' | 'battle' | 'rest' | 'nest-choice' | 'ended';
export type EndReason = 'returned' | 'forced-max-laps' | 'battle-lost' | 'exhausted';

/** 지금 치를 전투 (전투 엔진에 넘길 재료) */
export interface PendingBattle {
  enemy: EnemyDef;
  seed: number;
  params: Partial<BattleParams>;
  cell: number;
  lap: number;
  elite: boolean;
  /** 조합 효과로 강적이 된 전투 */
  combo: boolean;
  /** 이 전투를 일으킨 타일 id (야생 전투면 null) */
  tileId: string | null;
}

export interface Acquired {
  tileId: string;
  lap: number;
}

export interface ExpeditionState {
  runId: number;
  factionId: string;
  seed: number;
  rng: Rng;
  maxLaps: number;
  /** 지금 도는 바퀴 (1부터) */
  lap: number;
  /** 길 위 위치 0..loopTiles-1, 0 = 둥지 칸 */
  pos: number;
  phase: ExpeditionPhase;
  hunger: number;
  condition: number;
  /** 가져온 덱: 보상으로 뽑힐 타일 id (중복 가능) */
  deck: string[];
  /** 원정 중 획득했지만 아직 놓지 않은 타일 */
  hand: string[];
  /** 길 칸 옆 슬롯: 칸 번호 → 놓은 타일 id (0번 둥지 칸은 슬롯 없음). 한 번 놓으면 원정 동안 유지 */
  slots: (string | null)[];
  acquired: Acquired[];
  /** 이번 바퀴에서 야생 전투가 일어날 칸 (놓은 타일이 없는 칸 중에서 뽑는다) */
  wildCells: number[];
  elitesThisLap: number;
  victoriesThisLap: number;
  tilesThisLap: number;
  /** 바퀴별 치른 전투 횟수 (index 0 = 1바퀴) */
  battlesByLap: number[];
  pending: PendingBattle | null;
  battles: BattleRecord[];
  /** 지나온 시간(초, 배속 전 기준) */
  elapsedSeconds: number;
  lapsCompleted: number;
  outcome: 'returned' | 'defeated' | null;
  endReason: EndReason | null;
}

export interface ExpeditionSetup {
  factionId: string;
  seed: number;
  runId?: number;
  /** 둥지에서 가져온 상태 */
  hunger: number;
  condition: number;
  deck: string[];
  maxLaps?: number;
}

export function createExpedition(setup: ExpeditionSetup): ExpeditionState {
  const rng = createRng(setup.seed);
  const exp: ExpeditionState = {
    runId: setup.runId ?? 0,
    factionId: setup.factionId,
    seed: setup.seed,
    rng,
    maxLaps: setup.maxLaps ?? EX.maxLaps,
    lap: 1,
    pos: 0,
    phase: 'moving',
    hunger: setup.hunger,
    condition: setup.condition,
    deck: [...setup.deck],
    hand: [],
    slots: Array.from({ length: EX.loopTiles }, () => null),
    acquired: [],
    wildCells: [],
    elitesThisLap: 0,
    victoriesThisLap: 0,
    tilesThisLap: 0,
    battlesByLap: [0],
    pending: null,
    battles: [],
    elapsedSeconds: 0,
    lapsCompleted: 0,
    outcome: null,
    endReason: null,
  };
  planLap(exp);
  return exp;
}

/** 바퀴별 기본 전투 횟수: 1바퀴 2회, 2바퀴 3회, 3바퀴 이후 4회 (GDD 2-1) */
export function plannedBattles(lap: number): number {
  const b = EX.battlesPerLap;
  return lap <= 1 ? b.first : lap === 2 ? b.second : b.later;
}

function randomSeed(rng: Rng): number {
  return Math.floor(nextFloat(rng) * 2 ** 32);
}

/** 전투를 일으키는 타일인가 (휴식은 아님) */
function causesBattle(id: string | null): boolean {
  return id !== null && getTile(id).effect.type !== 'rest';
}

/** 새 바퀴 시작: 야생 전투 칸을 뽑는다. 놓은 전투 타일이 기본 전투 횟수를 대신하고, 기본 횟수보다 많이 놓으면 그만큼 전투가 는다 */
function planLap(exp: ExpeditionState): void {
  const free: number[] = [];
  let tileBattles = 0;
  for (let c = 1; c < EX.loopTiles; c++) {
    if (exp.slots[c] === null) free.push(c);
    else if (causesBattle(exp.slots[c]!)) tileBattles++;
  }
  for (let i = free.length - 1; i > 0; i--) {
    const j = nextInt(exp.rng, i + 1);
    [free[i], free[j]] = [free[j]!, free[i]!];
  }
  exp.wildCells = free.slice(0, Math.max(0, plannedBattles(exp.lap) - tileBattles));
  exp.elitesThisLap = 0;
  exp.victoriesThisLap = 0;
  exp.tilesThisLap = 0;
  if (exp.battlesByLap.length < exp.lap) exp.battlesByLap.push(0);
}

export function lapScale(lap: number): { hp: number; attack: number } {
  return { hp: 1 + PX.lapHpScale * (lap - 1), attack: 1 + PX.lapAttackScale * (lap - 1) };
}

/** 컨디션이 나쁠수록 시작 보드에 공허가 늘고, 5바퀴 이후는 공허 생성률이 오른다 */
export function riskBonus(exp: ExpeditionState): number {
  const cond = PX.conditionRiskBonusMax * (1 - exp.condition / PX.conditionMax);
  const late = Math.max(0, exp.lap - PX.lateLapStart + 1) * PX.lateLapRiskBonusPerLap;
  return cond + late;
}

function pickEnemy(exp: ExpeditionState, cls: 'normal' | 'elite'): EnemyDef {
  const pool = ENEMIES.filter((e) => e.class === cls);
  if (pool.length === 0) throw new Error(`적 테이블에 ${cls} 적이 없다`);
  const base = pool[nextInt(exp.rng, pool.length)]!;
  const k = lapScale(exp.lap);
  return { ...base, hpInMatches: base.hpInMatches * k.hp, attackInMatches: base.attackInMatches * k.attack };
}

/** 이 칸이 조합(같은 comboGroup 3칸 인접)의 끝 칸인가 */
function isComboEnd(exp: ExpeditionState, cell: number): boolean {
  if (cell < 3) return false; // 1,2,3 이 첫 삼연속 → 끝 칸은 3 이상
  const groups = [cell - 2, cell - 1, cell].map((c) => {
    const id = exp.slots[c];
    return id ? getTile(id).comboGroup ?? null : null;
  });
  return groups[0] !== null && groups.every((g) => g === groups[0]);
}

export type StepEvent =
  | { kind: 'move'; cell: number; lap: number }
  | { kind: 'battle'; cell: number; battle: PendingBattle }
  | { kind: 'rest'; cell: number }
  | { kind: 'lap-complete'; lap: number; rewardTile: string | null }
  | { kind: 'ended'; outcome: 'returned' | 'defeated'; reason: EndReason };

/** 한 칸 이동. phase 가 moving 일 때만 */
export function advance(exp: ExpeditionState): StepEvent | null {
  if (exp.phase !== 'moving') return null;
  exp.pos = (exp.pos + 1) % EX.loopTiles;
  exp.elapsedSeconds += EX.secondsPerTile;
  exp.hunger += exp.lap >= PX.hungerSpikeLap ? PX.hungerPerTileSpike : PX.hungerPerTile;
  if (exp.hunger >= PX.hungerMax) {
    exp.hunger = PX.hungerMax;
    return endExpedition(exp, 'defeated', 'exhausted');
  }
  if (exp.pos === 0) {
    exp.lapsCompleted = exp.lap;
    const reward = drawTile(exp);
    if (exp.lap >= exp.maxLaps) return endExpedition(exp, 'returned', 'forced-max-laps');
    exp.phase = 'nest-choice';
    return { kind: 'lap-complete', lap: exp.lap, rewardTile: reward };
  }
  const cell = exp.pos;
  const id = exp.slots[cell];
  const tile = id ? getTile(id) : null;
  if (tile?.effect.type === 'rest') {
    exp.phase = 'rest';
    return { kind: 'rest', cell };
  }
  let cls: 'normal' | 'elite' | null = null;
  let combo = false;
  const wild = exp.wildCells.indexOf(cell);
  if (wild >= 0) {
    exp.wildCells.splice(wild, 1);
    cls = 'normal';
  }
  if (tile?.effect.type === 'spawn') cls = tile.effect.enemyClass;
  else if (tile?.effect.type === 'environment') cls = 'normal';
  if (tile && isComboEnd(exp, cell)) {
    cls = 'elite';
    combo = true;
  }
  if (cls === null) return { kind: 'move', cell, lap: exp.lap };
  // 강적은 바퀴당 최대 1마리: 넘치면 일반 적으로 낮춘다 (GDD 2-1)
  if (cls === 'elite' && exp.elitesThisLap >= BALANCE.battle.maxElitesPerLap) {
    cls = 'normal';
    combo = false;
  }
  if (cls === 'elite') exp.elitesThisLap++;
  const params: Partial<BattleParams> = { riskSpawnBonus: riskBonus(exp) };
  if (tile?.effect.type === 'environment') {
    const preset = BALANCE.provisional.tiles[tile.effect.preset];
    if ('riskSpawnBonus' in preset) params.riskSpawnBonus = (params.riskSpawnBonus ?? 0) + preset.riskSpawnBonus;
    else Object.assign(params, preset);
  }
  const pending: PendingBattle = {
    enemy: pickEnemy(exp, cls),
    seed: randomSeed(exp.rng),
    params,
    cell,
    lap: exp.lap,
    elite: cls === 'elite',
    combo,
    tileId: id ?? null,
  };
  exp.pending = pending;
  exp.phase = 'battle';
  return { kind: 'battle', cell, battle: pending };
}

/** 대기 중인 전투를 전투 엔진으로 만든다 (P1 엔진 그대로) */
export function startBattle(exp: ExpeditionState): BattleState {
  if (exp.phase !== 'battle' || !exp.pending) throw new Error('치를 전투가 없다');
  return createBattle({ seed: exp.pending.seed, enemy: exp.pending.enemy, params: exp.pending.params });
}

/** 끝난 전투를 원정에 반영한다. 승리 → 이동 재개, 패배 → 원정 끝 */
export function finishBattle(exp: ExpeditionState, battle: BattleState): BattleRecord {
  const pending = exp.pending;
  if (exp.phase !== 'battle' || !pending || battle.status === 'playing') throw new Error('끝나지 않은 전투');
  const record = buildBattleRecord(battle, { factionId: exp.factionId, runId: exp.runId, lap: exp.lap });
  exp.battles.push(record);
  exp.battlesByLap[exp.lap - 1] = (exp.battlesByLap[exp.lap - 1] ?? 0) + 1;
  exp.pending = null;
  exp.hunger = Math.min(PX.hungerMax, exp.hunger + PX.hungerPerBattle);
  exp.condition = Math.max(0, exp.condition - PX.conditionPerBattle);
  if (battle.status === 'lost') {
    endExpedition(exp, 'defeated', 'battle-lost');
    return record;
  }
  // 승리 보상: 바퀴 첫 승리 1장, 강적(소굴·조합)이면 추가 1장. 바퀴 합계는 tilesPerLap.max 까지
  if (exp.victoriesThisLap === 0) drawTile(exp);
  if (pending.elite) for (let i = 0; i < PX.eliteBonusTiles; i++) drawTile(exp);
  exp.victoriesThisLap++;
  exp.phase = 'moving';
  return record;
}

/** 휴식 타일 효과: 허기·컨디션 회복, 시간 소모 */
export function finishRest(exp: ExpeditionState): void {
  if (exp.phase !== 'rest') throw new Error('휴식 중이 아니다');
  exp.hunger = Math.max(0, exp.hunger - PX.restHunger);
  exp.condition = Math.min(PX.conditionMax, exp.condition + PX.restCondition);
  exp.elapsedSeconds += PX.restTimeTiles * EX.secondsPerTile;
  exp.phase = 'moving';
}

/** 둥지 칸에서: 귀환 */
export function chooseReturn(exp: ExpeditionState): void {
  if (exp.phase !== 'nest-choice') throw new Error('귀환을 고를 수 없는 때');
  endExpedition(exp, 'returned', 'returned');
}

/** 둥지 칸에서: 한 바퀴 더 */
export function chooseContinue(exp: ExpeditionState): void {
  if (exp.phase !== 'nest-choice') throw new Error('계속을 고를 수 없는 때');
  exp.lap++;
  exp.pos = 0;
  planLap(exp);
  exp.phase = 'moving';
}

/** 덱에서 타일 1장 획득. 바퀴 합계 상한(tilesPerLap.max)을 넘기면 얻지 않는다 */
function drawTile(exp: ExpeditionState): string | null {
  if (exp.deck.length === 0 || exp.tilesThisLap >= EX.tilesPerLap.max) return null;
  const id = exp.deck[nextInt(exp.rng, exp.deck.length)]!;
  exp.acquired.push({ tileId: id, lap: exp.lap });
  exp.hand.push(id);
  exp.tilesThisLap++;
  return id;
}

export type PlaceResult = { ok: true } | { ok: false; reason: string };

/** 타일 배치 (임시 규칙): 전투/휴식 중이 아닐 때, 지금 위치보다 앞쪽 칸의 빈 슬롯에, 손에 든 타일만. 한 번 놓으면 원정 동안 유지 */
export function placeTile(exp: ExpeditionState, tileId: string, cell: number): PlaceResult {
  if (exp.phase !== 'moving' && exp.phase !== 'nest-choice') return { ok: false, reason: '지금은 배치할 수 없다' };
  if (!Number.isInteger(cell) || cell < 1 || cell >= EX.loopTiles) return { ok: false, reason: '슬롯이 없는 칸이다' };
  if (cell <= exp.pos) return { ok: false, reason: '지나간 칸에는 놓을 수 없다' };
  if (exp.slots[cell] !== null) return { ok: false, reason: '이미 타일이 있다' };
  const i = exp.hand.indexOf(tileId);
  if (i < 0) return { ok: false, reason: '손에 없는 타일이다' };
  exp.hand.splice(i, 1);
  exp.slots[cell] = tileId;
  // 전투 타일은 이번 바퀴의 야생 전투 하나를 대신한다 (그 칸이 야생 칸이면 그 칸, 아니면 남은 것 중 하나)
  const w = exp.wildCells.indexOf(cell);
  if (w >= 0) exp.wildCells.splice(w, 1);
  else if (causesBattle(tileId) && exp.wildCells.length > 0) exp.wildCells.pop();
  if (w >= 0 && !causesBattle(tileId)) {
    // 휴식 타일이 야생 칸에 놓이면 그 야생 전투는 다른 빈 칸으로 옮긴다
    const free = [];
    for (let c = Math.max(exp.pos + 1, 1); c < EX.loopTiles; c++) if (exp.slots[c] === null && !exp.wildCells.includes(c)) free.push(c);
    if (free.length > 0) exp.wildCells.push(free[nextInt(exp.rng, free.length)]!);
  }
  return { ok: true };
}

function endExpedition(exp: ExpeditionState, outcome: 'returned' | 'defeated', reason: EndReason): StepEvent {
  exp.phase = 'ended';
  exp.outcome = outcome;
  exp.endReason = reason;
  exp.pending = null;
  return { kind: 'ended', outcome, reason };
}

export interface ExpeditionSummary {
  outcome: 'returned' | 'defeated';
  /** 보존되는 획득 타일 */
  kept: string[];
  /** 잃는 타일: 패배 시 마지막 바퀴에서 얻은 것만 */
  lost: string[];
  laps: number;
}

export function summarize(exp: ExpeditionState): ExpeditionSummary {
  if (exp.phase !== 'ended' || !exp.outcome) throw new Error('원정이 끝나지 않았다');
  const lostEntries = exp.outcome === 'defeated' ? exp.acquired.filter((a) => a.lap === exp.lap) : [];
  const keptEntries = exp.acquired.filter((a) => !lostEntries.includes(a));
  return {
    outcome: exp.outcome,
    kept: keptEntries.map((a) => a.tileId),
    lost: lostEntries.map((a) => a.tileId),
    laps: exp.outcome === 'returned' ? exp.lapsCompleted : exp.lap,
  };
}

/** 런 로그 RunRecord (GDD 9장): 바퀴 수, 귀환/패배, 획득·상실 목록 */
export function buildRunRecord(exp: ExpeditionState): RunRecord {
  const s = summarize(exp);
  return {
    runId: exp.runId,
    laps: s.laps,
    outcome: s.outcome,
    gained: s.kept,
    lost: s.lost,
    endReason: exp.endReason!,
    seed: exp.seed,
    factionId: exp.factionId,
  };
}

/** 이 종족이 쓸 수 있는 타일만 덱에 넣을 수 있다 (스킨 이름이 있는 타일) */
export function deckOptions(factionId: string): string[] {
  return tilesFor(factionId).map((t) => t.id);
}
