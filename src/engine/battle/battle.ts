// 전투 상태 머신 (GDD 2-2, 3장). 종족 무관 순수 로직. 화면은 PhaseReport 만 읽는다.
// 상태는 평범한 객체(rng 포함)라 structuredClone 으로 복제할 수 있다 (봇·테스트용).

import { BALANCE } from '../../config/balance';
import type { EnemyDef } from '../../data/schema';
import { TILE_ROLES, type TileRole } from '../faction';
import {
  createBoard, emptyRoleCount, findMoves, inBounds, isAdjacent, reshuffleBoard, resolveBoard, swapCells,
  findRuns, type Board, type Cell, type ResolveStep,
} from './board';
import { createRng, nextInt, type Rng } from './rng';

/** 기본 기술 id. 흡수 특성 기술(P3)이 생기면 그 id 가 들어간다 */
export const BASIC_SKILL_ID = 'basic-skill';

export interface BattleParams {
  playerMatchDamage: number;
  hpMatchScale: number;
  playerDamageMultiplier: number;
  playerMaxHp: number;
  shieldPerMatch: number;
  skillPowerInMatches: number;
  riskSpawnRate: number;
  riskDamageMultiplier: number;
  riskPerMatch: number;
  maxTurns: number;
  /** 적이 플레이어 N턴마다 한 번 공격한다 (GDD 3-4, 임시) */
  enemyAttackEveryTurns: number;
  /** 전투 시작 보드의 공허 생성률 가산(둥지 컨디션·환경 등). 기본 0 */
  riskSpawnBonus: number;
  /** 환경 타일: 데미지·실드 효과 배율. 기본 1 */
  damageEffectMultiplier: number;
  shieldEffectMultiplier: number;
  /** 환경 타일: 매 플레이어 턴 뒤 보드를 섞는다 (호로 스킨 안개) */
  reshuffleEachTurn: boolean;
  weaknessMultiplier: number;
  spiritMatchesPerSkill: number;
  /** 영력 게이지 상한 = 기술 N회분 (GDD 3-4: 2) */
  spiritGaugeCapInSkills: number;
}

export function defaultBattleParams(): BattleParams {
  return {
    ...BALANCE.provisional.battle,
    weaknessMultiplier: BALANCE.battle.weaknessMultiplier,
    spiritMatchesPerSkill: BALANCE.battle.spiritMatchesPerSkill,
    spiritGaugeCapInSkills: BALANCE.battle.spiritGaugeCapInSkills,
    riskSpawnBonus: 0,
    damageEffectMultiplier: 1,
    shieldEffectMultiplier: 1,
    reshuffleEachTurn: false,
  };
}

export type BattleStatus = 'playing' | 'won' | 'lost';

export interface BattleState {
  seed: number;
  params: BattleParams;
  rng: Rng;
  board: Board;
  enemy: { def: EnemyDef; hp: number; maxHp: number };
  player: { hp: number; maxHp: number; shield: number };
  /** 누적한 영력 매칭 횟수 (기술 쓰면 spiritMatchesPerSkill 만큼 차감) */
  spiritMatches: number;
  turns: number;
  matchesByRole: Record<TileRole, number>;
  tilesByRole: Record<TileRole, number>;
  /** 공허 매칭으로 오른 리스크 값 (기록만, 게이지 효과는 P3) */
  riskGained: number;
  /** 흡수 타일 매칭 누적(매칭 1회 = 1). 전투 후 흡수 판정은 P3 */
  absorbGained: number;
  skillsUsed: string[];
  status: BattleStatus;
  lossReason: 'hp' | 'timeout' | null;
}

export interface Hud {
  enemyHp: number;
  enemyMaxHp: number;
  playerHp: number;
  playerMaxHp: number;
  shield: number;
  spiritMatches: number;
  skillReady: boolean;
  turns: number;
  /** 적 공격까지 남은 플레이어 턴 (1 = 이번 턴 뒤 공격) */
  enemyAttackIn: number;
  riskGained: number;
  absorbGained: number;
}

export interface PhaseReport {
  kind: 'player' | 'enemy' | 'skill';
  steps: ResolveStep[];
  damageDealt: number;
  weakHit: boolean;
  shieldGained: number;
  damageTaken: number;
  blocked: number;
  /** 이 적 턴에 공격이 있었는가 */
  attacked: boolean;
  hud: Hud;
}

export interface ActionResult {
  accepted: boolean;
  phases: PhaseReport[];
  /** 움직일 수 있는 수가 없어 보드를 새로 섞었는가 */
  reshuffled: boolean;
  status: BattleStatus;
}

export interface BattleSetup {
  seed: number;
  enemy: EnemyDef;
  params?: Partial<BattleParams>;
}

export function createBattle(setup: BattleSetup): BattleState {
  const params = { ...defaultBattleParams(), ...setup.params };
  const rng = createRng(setup.seed);
  const board = createBoard(rng, spawnRate(params));
  // 적 체력 = 플레이어 매칭 N회 분량 (CLAUDE.md 규칙 3). 육성으로 공격력이 오르면 같이 오른다
  const maxHp = setup.enemy.hpInMatches * params.hpMatchScale * params.playerMatchDamage * params.playerDamageMultiplier;
  return {
    seed: setup.seed,
    params,
    rng,
    board,
    enemy: { def: setup.enemy, hp: maxHp, maxHp },
    player: { hp: params.playerMaxHp, maxHp: params.playerMaxHp, shield: 0 },
    spiritMatches: 0,
    turns: 0,
    matchesByRole: emptyRoleCount(),
    tilesByRole: emptyRoleCount(),
    riskGained: 0,
    absorbGained: 0,
    skillsUsed: [],
    status: 'playing',
    lossReason: null,
  };
}

/** 보드에 공허가 생기는 비율: 기본 생성률 + 컨디션·환경 가산 */
export function spawnRate(p: BattleParams): number {
  return Math.min(0.6, p.riskSpawnRate + p.riskSpawnBonus);
}

export function spiritCap(p: BattleParams): number {
  return p.spiritMatchesPerSkill * p.spiritGaugeCapInSkills;
}

function attackIn(s: BattleState): number {
  const n = s.params.enemyAttackEveryTurns;
  return n - (s.turns % n) || n;
}

export function hudOf(s: BattleState): Hud {
  return {
    enemyHp: s.enemy.hp,
    enemyMaxHp: s.enemy.maxHp,
    playerHp: s.player.hp,
    playerMaxHp: s.player.maxHp,
    shield: s.player.shield,
    spiritMatches: s.spiritMatches,
    skillReady: canUseSkill(s),
    turns: s.turns,
    enemyAttackIn: attackIn(s),
    riskGained: s.riskGained,
    absorbGained: s.absorbGained,
  };
}

export function canUseSkill(s: BattleState): boolean {
  return s.status === 'playing' && s.spiritMatches >= s.params.spiritMatchesPerSkill;
}

function newPhase(s: BattleState, kind: PhaseReport['kind']): PhaseReport {
  return { kind, steps: [], damageDealt: 0, weakHit: false, shieldGained: 0, damageTaken: 0, blocked: 0, attacked: false, hud: hudOf(s) };
}

/** 플레이어 매칭 효과 적용. 3타일 = 매칭 1회 분량(단위)으로 환산한다.
 *  약점 색(데미지·영력·실드 중 하나) 매칭은 그 매칭의 효과가 1.5배 (GDD 3-4) */
function applySteps(s: BattleState, steps: ResolveStep[], rep: PhaseReport): void {
  const p = s.params;
  const weak = s.enemy.def.weakness;
  const unitDamage = p.playerMatchDamage * p.playerDamageMultiplier * p.damageEffectMultiplier;
  let spiritGain = 0;
  for (const step of steps) {
    for (const role of TILE_ROLES) {
      s.matchesByRole[role] += step.matchesByRole[role];
      s.tilesByRole[role] += step.clearedByRole[role];
      const units = step.clearedByRole[role] / BALANCE.battle.minMatch;
      if (units === 0) continue;
      const mult = role === weak ? p.weaknessMultiplier : 1;
      if (role === weak) rep.weakHit = true;
      if (role === 'damage') rep.damageDealt += units * unitDamage * mult;
      else if (role === 'risk') rep.damageDealt += units * p.riskDamageMultiplier * unitDamage;
      else if (role === 'spirit') spiritGain += step.matchesByRole.spirit * mult;
      else if (role === 'shield') rep.shieldGained += units * p.shieldPerMatch * p.shieldEffectMultiplier * mult;
      else if (role === 'absorb') s.absorbGained += units;
      if (role === 'risk') s.riskGained += units * p.riskPerMatch;
    }
  }
  s.spiritMatches = Math.min(spiritCap(p), s.spiritMatches + spiritGain);
  s.enemy.hp = Math.max(0, s.enemy.hp - rep.damageDealt);
  s.player.shield += rep.shieldGained;
}

function checkWin(s: BattleState): void {
  if (s.enemy.hp <= 0) s.status = 'won';
}

/** 인접 두 칸 교환. 매치가 없으면 되돌리고 턴을 쓰지 않는다 */
export function playerSwap(s: BattleState, a: Cell, b: Cell): ActionResult {
  const rejected: ActionResult = { accepted: false, phases: [], reshuffled: false, status: s.status };
  if (s.status !== 'playing' || !inBounds(s.board, a) || !inBounds(s.board, b) || !isAdjacent(a, b)) return rejected;
  swapCells(s.board, a, b);
  if (findRuns(s.board).length === 0) {
    swapCells(s.board, a, b);
    return rejected;
  }
  const phases: PhaseReport[] = [];
  const rep = newPhase(s, 'player');
  rep.steps = resolveBoard(s.board, s.rng, spawnRate(s.params));
  applySteps(s, rep.steps, rep);
  s.turns++;
  checkWin(s);
  rep.hud = hudOf(s);
  phases.push(rep);
  return finishTurn(s, phases);
}

/** 플레이어가 턴을 쓴 뒤 처리: 적 턴 → 턴 한도 → 막힌 보드 섞기 */
function finishTurn(s: BattleState, phases: PhaseReport[]): ActionResult {
  if (s.status === 'playing') phases.push(enemyTurn(s));
  if (s.status === 'playing' && s.turns >= s.params.maxTurns) {
    s.status = 'lost';
    s.lossReason = 'timeout';
  }
  let reshuffled = false;
  if (s.status === 'playing' && (s.params.reshuffleEachTurn || findMoves(s.board).length === 0)) {
    s.board = reshuffleBoard(s.board, s.rng, spawnRate(s.params));
    reshuffled = true;
  }
  return { accepted: true, phases, reshuffled, status: s.status };
}

/** 적 턴: 같은 보드에서 가능한 교환 중 하나를 골라 자동 매칭(보드만 바뀜, 효과 없음).
 *  공격은 별도 주기(enemyAttackEveryTurns)마다 한 번, 실드가 먼저 흡수 (GDD 3-4) */
function enemyTurn(s: BattleState): PhaseReport {
  const rep = newPhase(s, 'enemy');
  const moves = findMoves(s.board);
  if (moves.length > 0) {
    const [a, b] = moves[nextInt(s.rng, moves.length)]!;
    swapCells(s.board, a, b);
    rep.steps = resolveBoard(s.board, s.rng, spawnRate(s.params));
  }
  if (s.turns % s.params.enemyAttackEveryTurns === 0) {
    const damage = s.enemy.def.attackInMatches * s.params.shieldPerMatch;
    rep.attacked = true;
    rep.blocked = Math.min(s.player.shield, damage);
    s.player.shield -= rep.blocked;
    rep.damageTaken = damage - rep.blocked;
    s.player.hp = Math.max(0, s.player.hp - rep.damageTaken);
    if (s.player.hp <= 0) {
      s.status = 'lost';
      s.lossReason = 'hp';
    }
  }
  rep.hud = hudOf(s);
  return rep;
}

/** 기술 발동: 그 턴을 쓴다(적 턴이 이어진다). 영력 매칭 spiritMatchesPerSkill 회를 소모 (GDD 3-4) */
export function useSkill(s: BattleState): ActionResult {
  if (!canUseSkill(s)) return { accepted: false, phases: [], reshuffled: false, status: s.status };
  s.spiritMatches -= s.params.spiritMatchesPerSkill;
  s.skillsUsed.push(BASIC_SKILL_ID);
  const rep = newPhase(s, 'skill');
  rep.damageDealt = s.params.skillPowerInMatches * s.params.playerMatchDamage * s.params.playerDamageMultiplier * s.params.damageEffectMultiplier;
  s.enemy.hp = Math.max(0, s.enemy.hp - rep.damageDealt);
  s.turns++;
  checkWin(s);
  rep.hud = hudOf(s);
  return finishTurn(s, [rep]);
}
