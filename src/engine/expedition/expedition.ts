// 원정 엔진 (GDD 1장, 2-1, 6장). 종족 무관 순수 로직. 화면은 상태만 읽고, 시간(칸당 5초·배속)은 화면이 돌린다.
// 상태는 평범한 객체(rng 포함)라 structuredClone 으로 복제할 수 있고, 같은 시드 = 같은 원정.

import { BALANCE } from '../../config/balance';
import { scaleEnemy } from '../../data/enemies';
import { enemyPool, pickFromPool } from '../enemyPool';
import type { EnemyDef, EnvironmentPreset } from '../../data/schema';
import { getTile, tilesFor } from '../../data/tiles';
import { buildBattleRecord, createCombat, storedStartGaugeOf, type CombatParams, type CombatState } from '../combat';
import { createRng, nextFloat, nextInt, type Rng } from '../rng';
import {
  absorbRisk, breakthroughSpawnBonus, buildCombatParams, buildOffer, canAbsorb, changeRisk, cloneBuild, gainTrait, lateLapRisk,
  newBuild, releaseEffect, type AbsorbOffer, type BuildState, type EngineEvent, type RiskState,
} from '../absorb';
import { applyEvolutionToParams, cloneEvolution, newEvolution, recordEvolutionAbsorb, type EvolutionState } from '../evolution';
import type { AbsorbRecord, BattleRecord, RunRecord } from '../runLog';

const EX = BALANCE.expedition;
const PX = BALANCE.provisional.expedition;
const AX = BALANCE.provisional.absorb;
const RX = BALANCE.provisional.risk;

export type ExpeditionPhase = 'moving' | 'battle' | 'absorb' | 'rest' | 'nest-choice' | 'ended';
export type EndReason = 'returned' | 'forced-max-laps' | 'battle-lost' | 'exhausted';

/** 지금 치를 전투 (전투 엔진에 넘길 재료) */
export interface PendingBattle {
  enemy: EnemyDef;
  seed: number;
  params: Partial<CombatParams>;
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

export interface AcquiredTrait {
  traitId: string;
  lap: number;
}

export interface ExpeditionState extends RiskState {
  runId: number;
  factionId: string;
  seed: number;
  rng: Rng;
  maxLaps: number;
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
  /** 흡수 빌드(특성 보유·슬롯) 사본. 귀환하면 세이브에 합쳐진다 */
  build: BuildState;
  /** 이번 바퀴 시작 때의 슬롯. 패배하면 슬롯을 이것으로 되돌린다("마지막 바퀴에서 얻은 것만 잃는다") */
  lapStartSlots: (string | null)[];
  /** 원정 중 새로 얻은 특성 (패배 시 마지막 바퀴 것을 잃는다) */
  acquiredTraits: AcquiredTrait[];
  /** 흡수 화면 대기 중인 제안 (phase 'absorb') */
  absorbOffer: AbsorbOffer | null;
  absorbRecords: AbsorbRecord[];
  /** 진화 상태 사본 (GDD 4-2): 흡수가 확정되면 계통별 누적이 오르고, 귀환하면 세이브에 합쳐진다. 진화 자체는 둥지에서만 */
  evolution: EvolutionState;
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
  /** 둥지에서 가져온 리스크 게이지·안정 수치·흡수 빌드 (없으면 0 / 시작값 / 빈 빌드) */
  risk?: number;
  stability?: number;
  build?: BuildState;
  /** 둥지에서 가져온 진화 상태 (없으면 1단계 새 상태) */
  evolution?: EvolutionState;
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
    build: setup.build ? cloneBuild(setup.build) : newBuild(),
    lapStartSlots: [],
    acquiredTraits: [],
    absorbOffer: null,
    absorbRecords: [],
    evolution: setup.evolution ? cloneEvolution(setup.evolution) : newEvolution(),
    risk: setup.risk ?? 0,
    riskPeak: setup.risk ?? 0,
    stability: setup.stability ?? RX.stabilityStart,
    breakthrough: null,
    events: [],
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
  exp.lapStartSlots = [...exp.build.slots];
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

/** 공허 블록 생성 확률 가산: 컨디션이 나쁠수록, 5바퀴 이후, 한계 돌파 뒤 (GDD 3-2, 2-1, 4-1) */
export function riskBonus(exp: ExpeditionState): number {
  const cond = PX.conditionRiskBonusMax * (1 - exp.condition / PX.conditionMax);
  const late = Math.max(0, exp.lap - PX.lateLapStart + 1) * PX.lateLapRiskBonusPerLap;
  return cond + late + breakthroughSpawnBonus(exp);
}

/** 출처(야생/타일 종류/조합)와 바퀴에 맞는 풀에서 적을 뽑고 바퀴 강화를 입힌다 (GDD 14-5) */
function pickEnemy(exp: ExpeditionState, cls: 'normal' | 'elite', source: string): EnemyDef {
  const pool = enemyPool(cls, exp.lap, source);
  if (pool.length === 0) throw new Error(`적 출현 풀이 비었다: ${cls} ${exp.lap}바퀴 ${source}`);
  const base = pickFromPool(exp.rng, pool);
  const rare = nextFloat(exp.rng) < base.rareChance;
  return { ...scaleEnemy(base, lapScale(exp.lap)), rare };
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
  const late = lateLapRisk(exp.lap, PX.lateLapStart);
  if (late > 0) changeRisk(exp, late, 'late-lap');
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
  // 장착한 특성(skill → 스킬 블록, passive → 자동 배율)이 전투 파라미터가 된다. 환경 타일 효과는 그 위에 더하거나 곱한다
  const params: Partial<CombatParams> = { ...buildCombatParams(exp.build, exp.factionId), voidChanceBonus: riskBonus(exp), storedStartGauge: storedStartGaugeOf(exp.stability) };
  applyEvolutionToParams(params, exp.evolution);
  if (tile?.effect.type === 'environment') applyEnvironment(params, tile.effect.preset);
  const pending: PendingBattle = {
    enemy: pickEnemy(exp, cls, combo ? 'combo' : tile ? tile.kind : 'wild'),
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

/** 환경 타일 프리셋 → 전투 조건 (GDD 6장, 효과 종류는 엔진·이름은 종족 스킨): 안개 = 트레이 섞임, 황무지 = 공격 위력, 결계 = 받는 피해 경감, 폐가 = 공허 블록 증가 */
export function applyEnvironment(params: Partial<CombatParams>, preset: EnvironmentPreset): void {
  const T = BALANCE.provisional.tiles;
  if (preset === 'reshuffle') params.trayShuffleSeconds = T.reshuffle.trayShuffleSeconds;
  else if (preset === 'power') params.playerPowerMultiplier = (params.playerPowerMultiplier ?? 1) * T.power.playerPowerMultiplier;
  else if (preset === 'shield') params.damageTakenMultiplier = (params.damageTakenMultiplier ?? 1) * T.shield.damageTakenMultiplier;
  else params.voidChanceBonus = (params.voidChanceBonus ?? 0) + T.void.voidChanceBonus;
}

/** 대기 중인 전투를 전투 엔진(v2)으로 만든다 */
export function startBattle(exp: ExpeditionState): CombatState {
  if (exp.phase !== 'battle' || !exp.pending) throw new Error('치를 전투가 없다');
  return createCombat(exp.pending.seed, { enemy: exp.pending.enemy, params: exp.pending.params });
}

/** 끝난 전투를 원정에 반영한다. 승리 → 이동 재개, 패배 → 원정 끝 */
export function finishBattle(exp: ExpeditionState, battle: CombatState): BattleRecord {
  const pending = exp.pending;
  if (exp.phase !== 'battle' || !pending || battle.status === 'playing') throw new Error('끝나지 않은 전투');
  const record = buildBattleRecord(battle, { factionId: exp.factionId, runId: exp.runId, lap: exp.lap, tierIndex: exp.evolution.tierIndex });
  exp.battles.push(record);
  exp.battlesByLap[exp.lap - 1] = (exp.battlesByLap[exp.lap - 1] ?? 0) + 1;
  exp.pending = null;
  exp.hunger = Math.min(PX.hungerMax, exp.hunger + PX.hungerPerBattle);
  exp.condition = Math.max(0, exp.condition - PX.conditionPerBattle);
  // 공허 블록 사용 → 리스크 게이지 상승 (GDD 3-5)
  if (battle.riskGained > 0) changeRisk(exp, battle.riskGained, 'void-block');
  if (battle.status === 'lost') {
    endExpedition(exp, 'defeated', 'battle-lost');
    return record;
  }
  // 승리 보상: 바퀴 첫 승리 1장, 강적(소굴·조합)이면 추가 1장. 바퀴 합계는 tilesPerLap.max 까지
  if (exp.victoriesThisLap === 0) drawTile(exp);
  if (pending.elite) for (let i = 0; i < PX.eliteBonusTiles; i++) drawTile(exp);
  exp.victoriesThisLap++;
  // 흡수 조건(마무리 일격이 약점 계통 스킬 / 약점 계통 체인3 1회 이상 / 첫 흡수 보장)을 채웠으면 흡수 화면으로 (흡수 / 놓아줌). 아니면 그대로 이동
  if (canAbsorb(battle)) {
    exp.absorbOffer = buildOffer(exp.rng, pending.enemy, exp.build, battle);
    exp.phase = 'absorb';
  } else exp.phase = 'moving';
  return record;
}

export type AbsorbResult = { ok: true } | { ok: false; reason: string };

function logAbsorb(exp: ExpeditionState, offer: AbsorbOffer, absorbed: boolean, traitId: string | null): void {
  exp.absorbRecords.push({ runId: exp.runId, enemyId: offer.enemyId, lineageId: offer.lineageId, rare: offer.rare, absorbed, traitId, lap: exp.lap });
}

/** 놓아줌: 리스크 하락 + 안정 수치 상승 (GDD 4장 "흡수 안 하면") */
export function chooseRelease(exp: ExpeditionState): AbsorbResult {
  const offer = exp.absorbOffer;
  if (exp.phase !== 'absorb' || !offer) return { ok: false, reason: '흡수를 고를 수 없는 때' };
  logAbsorb(exp, offer, false, null);
  releaseEffect(exp);
  exp.absorbOffer = null;
  exp.phase = 'moving';
  return { ok: true };
}

/** 흡수: 후보 중 traitId 를 슬롯에 장착(가득 차면 replaceSlot 과 교체, traitId null 이면 특성을 포기하고 효과만).
 *  효과: 허기 리셋, 리스크 상승(강할수록 많이), 보상 타일 +1 (GDD 4장, 4-1). 실패하면 아무것도 바뀌지 않는다 */
export function chooseAbsorb(exp: ExpeditionState, traitId: string | null, replaceSlot?: number | null): AbsorbResult {
  const offer = exp.absorbOffer;
  if (exp.phase !== 'absorb' || !offer) return { ok: false, reason: '흡수를 고를 수 없는 때' };
  if (traitId !== null) {
    if (!offer.candidates.includes(traitId)) return { ok: false, reason: '후보에 없는 특성이다' };
    const r = gainTrait(exp.build, traitId, replaceSlot);
    if (!r.ok) return r;
    exp.acquiredTraits.push({ traitId, lap: exp.lap });
  }
  logAbsorb(exp, offer, true, traitId);
  recordEvolutionAbsorb(exp.evolution, offer.lineageId, offer.rare);
  exp.hunger = Math.min(exp.hunger, AX.hungerAfterAbsorb);
  for (let i = 0; i < AX.bonusTiles; i++) drawTile(exp, 1);
  changeRisk(exp, absorbRisk(offer.strength), 'absorb');
  exp.absorbOffer = null;
  exp.phase = 'moving';
  return { ok: true };
}

/** 쌓인 엔진 이벤트(한계 돌파 등)를 꺼낸다. 화면이 연출하고 비운다 */
export function drainEvents(exp: ExpeditionState): EngineEvent[] {
  return exp.events.splice(0, exp.events.length);
}

/** 휴식 타일 효과: 허기·컨디션 회복, 시간 소모 */
export function finishRest(exp: ExpeditionState): void {
  if (exp.phase !== 'rest') throw new Error('휴식 중이 아니다');
  exp.hunger = Math.max(0, exp.hunger - PX.restHunger);
  changeRisk(exp, -RX.restRelief, 'rest');
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

/** 덱에서 타일 1장 획득. 바퀴 합계 상한(tilesPerLap.max)을 넘기면 얻지 않는다. reserve 만큼은 남겨 둔다(흡수 보상이 바퀴 완주 보상을 밀어내지 않게) */
function drawTile(exp: ExpeditionState, reserve = 0): string | null {
  if (exp.deck.length === 0 || exp.tilesThisLap >= EX.tilesPerLap.max - reserve) return null;
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

/** 놓은 타일 되돌리기 (GDD 18-4): 확정(출발·계속) 전에 놓은 타일을 칸에서 빼 손으로 돌려보낸다. 전투 타일이 대신했던 야생 전투는 그 칸으로 돌아온다(길을 걷는 중일 때만 — 바퀴 끝 팝업에서는 다음 바퀴 계획이 새로 짜인다) */
export function unplaceTile(exp: ExpeditionState, cell: number): PlaceResult {
  if (exp.phase !== 'moving' && exp.phase !== 'nest-choice') return { ok: false, reason: '지금은 되돌릴 수 없다' };
  if (!Number.isInteger(cell) || cell < 1 || cell >= EX.loopTiles) return { ok: false, reason: '슬롯이 없는 칸이다' };
  if (cell <= exp.pos) return { ok: false, reason: '지나간 칸이다' };
  const id = exp.slots[cell];
  if (id === null || id === undefined) return { ok: false, reason: '타일이 없는 칸이다' };
  exp.slots[cell] = null;
  exp.hand.push(id);
  if (exp.phase === 'moving' && causesBattle(id)) {
    const tileBattles = exp.slots.filter((t, c) => c >= 1 && t !== null && causesBattle(t)).length;
    if (exp.wildCells.length < Math.max(0, plannedBattles(exp.lap) - tileBattles)) exp.wildCells.push(cell);
  }
  return { ok: true };
}

/** 놓은 타일 옮기기 (GDD 18-4): from 칸의 타일을 to 칸(빈 칸)으로. 실패하면 아무것도 바꾸지 않는다 */
export function moveTile(exp: ExpeditionState, from: number, to: number): PlaceResult {
  if (from === to) return { ok: false, reason: '같은 칸이다' };
  const id = exp.slots[from];
  if (id === null || id === undefined) return { ok: false, reason: '타일이 없는 칸이다' };
  if (exp.slots[to] !== null && exp.slots[to] !== undefined) return { ok: false, reason: '이미 타일이 있다' };
  const before = { slots: [...exp.slots], hand: [...exp.hand], wild: [...exp.wildCells] };
  const u = unplaceTile(exp, from);
  const p = u.ok ? placeTile(exp, id, to) : u;
  if (!p.ok) {
    exp.slots = before.slots;
    exp.hand = before.hand;
    exp.wildCells = before.wild;
  }
  return p;
}

/**
 * 카드 배치 단계 (GDD 17-1): 원정이 시작되기 직전에 덱의 타일을 손에 쥐어 12칸 길에 놓게 한다.
 * 덱은 보상으로 뽑을 타일 목록이기도 해서 그대로 두고, 손에만 사본을 쥔다. 단계가 끝나면 finishPlanning 이 손을 비운다.
 */
export function beginPlanning(exp: ExpeditionState): void {
  if (exp.phase !== 'moving' || exp.pos !== 0 || exp.lap !== 1 || exp.elapsedSeconds !== 0) throw new Error('원정 시작 전에만 배치 단계를 열 수 있다');
  exp.hand = [...exp.deck];
}

/** 배치 단계 끝: 놓지 않은 타일은 버린다(어차피 보유 타일이라 잃지 않는다). 손은 원정 중 획득한 타일 전용이 된다. 놓은 칸 수를 돌려준다 */
export function finishPlanning(exp: ExpeditionState): number {
  exp.hand = [];
  return exp.slots.filter((s) => s !== null).length;
}

/**
 * 원정이 끝났을 때 놓지 않고 남은 획득 타일 (GDD 17-1): 다음 원정 덱으로 보관한다. 패배로 잃은 타일(마지막 바퀴 획득분)은 뺀다.
 * 호출하는 쪽(game.ts)이 덱 상한·보유 수량을 지켜 덱에 넣는다
 */
export function unplacedKept(exp: ExpeditionState): string[] {
  if (exp.phase !== 'ended') throw new Error('원정이 끝나지 않았다');
  const lost = [...summarize(exp).lost];
  const kept: string[] = [];
  for (const id of exp.hand) {
    const li = lost.indexOf(id);
    if (li >= 0) lost.splice(li, 1);
    else kept.push(id);
  }
  return kept;
}

function endExpedition(exp: ExpeditionState, outcome: 'returned' | 'defeated', reason: EndReason): StepEvent {
  exp.phase = 'ended';
  exp.absorbOffer = null;
  if (outcome === 'defeated') {
    // 마지막 바퀴에서 얻은 특성·계통 진행도를 잃는다: 보유에서 빼고 슬롯은 바퀴 시작 때로 되돌린다
    const lostIds = new Set(exp.acquiredTraits.filter((a) => a.lap === exp.lap).map((a) => a.traitId));
    exp.build.owned = exp.build.owned.filter((id) => !lostIds.has(id));
    exp.build.slots = exp.lapStartSlots.map((id) => (id !== null && exp.build.owned.includes(id) ? id : null));
  }
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
  /** 보존되는 / 잃는 새 특성 */
  keptTraits: string[];
  lostTraits: string[];
  laps: number;
}

export function summarize(exp: ExpeditionState): ExpeditionSummary {
  if (exp.phase !== 'ended' || !exp.outcome) throw new Error('원정이 끝나지 않았다');
  const lostEntries = exp.outcome === 'defeated' ? exp.acquired.filter((a) => a.lap === exp.lap) : [];
  const keptEntries = exp.acquired.filter((a) => !lostEntries.includes(a));
  const lostTraitEntries = exp.outcome === 'defeated' ? exp.acquiredTraits.filter((a) => a.lap === exp.lap) : [];
  return {
    outcome: exp.outcome,
    kept: keptEntries.map((a) => a.tileId),
    lost: lostEntries.map((a) => a.tileId),
    keptTraits: exp.acquiredTraits.filter((a) => !lostTraitEntries.includes(a)).map((a) => a.traitId),
    lostTraits: lostTraitEntries.map((a) => a.traitId),
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
    gainedTraits: s.keptTraits,
    lostTraits: s.lostTraits,
    riskPeak: exp.riskPeak,
    breakthrough: exp.breakthrough !== null,
    endReason: exp.endReason!,
    seed: exp.seed,
    factionId: exp.factionId,
  };
}

/** 이 종족이 쓸 수 있는 타일만 덱에 넣을 수 있다 (스킨 이름이 있는 타일) */
export function deckOptions(factionId: string): string[] {
  return tilesFor(factionId).map((t) => t.id);
}
