// 전투 v2: 실시간 자동 전투 + 스킬 블록 체인 (GDD 3-5). 종족 무관 순수 로직, 화면과 분리.
// 고정 틱(BALANCE.provisional.combat.tickSeconds) 시뮬레이션: createCombat(seed, setup) → step(state, input?) 반복.
// 같은 시드 + 같은 입력 기록 = 같은 결과. 상태는 평범한 객체(rng 포함)라 structuredClone 으로 복제할 수 있다.
// 화면은 step 을 실시간(1x/2x)으로 부르고, 테스트·봇은 헤드리스로 빠르게 돌린다.

import { BALANCE } from '../../config/balance';
import type { ChainBonus, ChainBonusKind, EnemyDef, SkillRole } from '../../data/schema';
import type { FinisherKind } from '../runLog';
import { createRng, nextFloat, nextInt, type Rng } from '../rng';
import { canMerge, canMove, emptyCells, inTray, type Block, type Tray } from './tray';

const CX = BALANCE.provisional.combat;

/** 기본 블록 특성 id: 슬롯에 skill 특성이 없으면 이 블록만 나온다 (GDD 3-5 "기본 공격 강화") */
export const BASIC_SKILL_ID = 'basic-skill';

/** 전투에 가져온 블록 생성원 하나 (장착 skill 특성, 또는 기본 블록) */
export interface CombatSkill {
  id: string;
  /** 계통 id (기본 블록은 null). 적 약점 계통과 같으면 위력 ×1.5 */
  lineageId: string | null;
  role: SkillRole;
  /** 블록 위력: 플레이어 기본 공격 N회 분량의 피해 */
  powerInAttacks: number;
  chainBonus: ChainBonus;
  /** 위력 배율(계통 보너스 등). 피해·막기 지속·회복량에 모두 곱한다. 1 = 없음 */
  powerMultiplier: number;
}

export interface CombatParams {
  tickSeconds: number;
  playerAttackSeconds: number;
  enemyAttackSeconds: number;
  playerAttackDamage: number;
  hpAttackScale: number;
  growthMultiplier: number;
  playerMaxHp: number;
  timeLimitSeconds: number;
  enemyDamageVariance: number;
  trayCols: number;
  trayRows: number;
  blockSpawnSeconds: number;
  chainMultipliers: readonly number[];
  chainBonusFromChain: number;
  spPerBlock: number;
  spMax: number;
  specialPowerInAttacks: number;
  basicBlockPowerInAttacks: number;
  basicBlockChainBonus: ChainBonus;
  weaknessMultiplier: number;
  guardSeconds: number;
  guardReduction: number;
  heavyGuardReduction: number;
  healFraction: number;
  voidCheckSeconds: number;
  voidChance: number;
  voidChanceMax: number;
  voidPowerInAttacks: number;
  /** 공허 블록 1개 사용 → 리스크 게이지 상승량 (BALANCE.provisional.risk.perVoidBlock) */
  riskPerVoidBlock: number;
  /** 장착 skill 특성 블록 생성원(슬롯 순서). 비면 기본 블록 하나 */
  skills: CombatSkill[];
  /** passive: 기본 공격 위력·속도 배율 */
  attackPowerMultiplier: number;
  attackSpeedMultiplier: number;
  /** passive·환경(결계): 받는 피해 배율 */
  damageTakenMultiplier: number;
  /** 환경(황무지): 내 공격 위력 전체 배율 */
  playerPowerMultiplier: number;
  /** 환경(안개): 이 간격(초)마다 트레이 블록이 섞인다. 0 = 없음 */
  trayShuffleSeconds: number;
  /** 컨디션·환경(폐가)·5바퀴 이후·한계 돌파: 공허 블록 생성 확률 가산 */
  voidChanceBonus: number;
}

export function defaultCombatParams(): CombatParams {
  return {
    ...CX,
    riskPerVoidBlock: BALANCE.provisional.risk.perVoidBlock,
    skills: [],
    attackPowerMultiplier: 1,
    attackSpeedMultiplier: 1,
    damageTakenMultiplier: 1,
    playerPowerMultiplier: 1,
    trayShuffleSeconds: 0,
    voidChanceBonus: 0,
  };
}

export type CombatInput =
  | { type: 'use'; cell: number }
  | { type: 'move'; from: number; to: number }
  | { type: 'merge'; from: number; to: number };

export type CombatStatus = 'playing' | 'won' | 'lost';

export interface Finisher {
  kind: FinisherKind;
  traitId: string | null;
  lineageId: string | null;
}

/** 화면 연출용 사건. 화면이 drainCombatEvents 로 비우며 그린다 */
export type CombatEvent =
  | { kind: 'player-attack'; damage: number }
  | { kind: 'enemy-attack'; damage: number; guarded: boolean }
  | { kind: 'block'; block: Block['kind']; traitId: string | null; role: SkillRole | null; chain: number; damage: number; weak: boolean; heal: number; guardSeconds: number; bonus: ChainBonusKind | null }
  | { kind: 'heavy-cast'; seconds: number }
  | { kind: 'heavy-hit'; damage: number; guarded: boolean; reflected: number }
  | { kind: 'seal'; seconds: number }
  | { kind: 'spawn'; cell: number; block: Block['kind'] }
  | { kind: 'merge'; cell: number; chain: number }
  | { kind: 'shuffle' }
  | { kind: 'end'; status: CombatStatus };

export interface CombatState {
  seed: number;
  params: CombatParams;
  rng: Rng;
  /** 지난 틱 수 (전투 시간 = tick × tickSeconds) */
  tick: number;
  status: CombatStatus;
  lossReason: 'hp' | 'timeout' | null;
  enemy: {
    def: EnemyDef;
    hp: number;
    maxHp: number;
    /** 다음 기본 공격까지 남은 틱 */
    attackTimer: number;
    /** 다음 특수 행동(강공격·봉인)까지 남은 틱 (패턴이 있는 강적만) */
    actionTimer: number;
    /** 다음 특수 행동이 패턴 순서의 몇 번째인가 */
    actionIndex: number;
    /** 강공격 시전(예고) 중이면 남은 틱 */
    cast: { ticks: number; total: number } | null;
  };
  player: { hp: number; maxHp: number; attackTimer: number };
  tray: Tray;
  nextUid: number;
  /** 블록 생성원(skills, 비면 기본 블록)마다 다음 생성까지 남은 틱 */
  spawnTimers: number[];
  voidTimer: number;
  shuffleTimer: number;
  sp: number;
  /** 봉인: 남은 틱 동안 스킬 블록 생성 정지 */
  sealTicks: number;
  /** 막기 상태: 남은 틱, 그 막기에 붙은 반사 배율 */
  guard: { ticks: number; reflect: number };
  // ── 기록 (BattleRecord) ──
  skillsUsed: string[];
  blocksByTrait: Record<string, number>;
  blocksByChain: [number, number, number];
  chain3Count: number;
  guardSuccesses: number;
  voidUsed: number;
  specialUsed: boolean;
  /** 공허 블록 사용으로 오른 리스크 게이지 값 */
  riskGained: number;
  finisher: Finisher | null;
  /** 받아들여진 입력 기록 (같은 시드로 다시 돌리면 같은 결과) */
  inputs: { tick: number; input: CombatInput }[];
  events: CombatEvent[];
}

export interface CombatSetup {
  enemy: EnemyDef;
  params?: Partial<CombatParams>;
}

export function ticksOf(p: CombatParams, seconds: number): number {
  return Math.max(1, Math.round(seconds / p.tickSeconds));
}

export function maxChain(p: CombatParams): number {
  return p.chainMultipliers.length;
}

/** 블록 생성원: 장착 skill 특성들, 하나도 없으면 기본 블록 */
export function blockSources(p: CombatParams): CombatSkill[] {
  if (p.skills.length > 0) return p.skills;
  return [{ id: BASIC_SKILL_ID, lineageId: null, role: 'attack', powerInAttacks: p.basicBlockPowerInAttacks, chainBonus: p.basicBlockChainBonus, powerMultiplier: 1 }];
}

export function sourceOf(p: CombatParams, traitId: string | null): CombatSkill | undefined {
  return blockSources(p).find((x) => x.id === traitId);
}

export function createCombat(seed: number, setup: CombatSetup): CombatState {
  const params: CombatParams = { ...defaultCombatParams(), ...setup.params };
  const t = (sec: number) => ticksOf(params, sec);
  // 적 체력 = 플레이어 기본 공격 N회 분량 (CLAUDE.md 규칙 3). 육성으로 공격력이 오르면 같이 오른다
  const maxHp = setup.enemy.hpInAttacks * params.hpAttackScale * params.playerAttackDamage * params.growthMultiplier;
  const sources = blockSources(params);
  const spawnTicks = t(params.blockSpawnSeconds);
  return {
    seed,
    params,
    rng: createRng(seed),
    tick: 0,
    status: 'playing',
    lossReason: null,
    enemy: {
      def: setup.enemy,
      hp: maxHp,
      maxHp,
      attackTimer: t(params.enemyAttackSeconds),
      actionTimer: setup.enemy.pattern ? t(setup.enemy.pattern.everySeconds) : 0,
      actionIndex: 0,
      cast: null,
    },
    player: { hp: params.playerMaxHp, maxHp: params.playerMaxHp, attackTimer: t(params.playerAttackSeconds / params.attackSpeedMultiplier) },
    tray: Array.from({ length: params.trayCols * params.trayRows }, () => null),
    nextUid: 1,
    // 생성원이 여럿이면 생성 시점을 고르게 엇갈린다 (첫 블록은 간격의 절반 뒤)
    spawnTimers: sources.map((_, i) => Math.max(1, Math.round((spawnTicks * (i + 0.5)) / sources.length))),
    voidTimer: t(params.voidCheckSeconds),
    shuffleTimer: params.trayShuffleSeconds > 0 ? t(params.trayShuffleSeconds) : 0,
    sp: 0,
    sealTicks: 0,
    guard: { ticks: 0, reflect: 0 },
    skillsUsed: [],
    blocksByTrait: {},
    blocksByChain: [0, 0, 0],
    chain3Count: 0,
    guardSuccesses: 0,
    voidUsed: 0,
    specialUsed: false,
    riskGained: 0,
    finisher: null,
    inputs: [],
    events: [],
  };
}

export function elapsedSeconds(s: CombatState): number {
  return s.tick * s.params.tickSeconds;
}

export function timeLeftSeconds(s: CombatState): number {
  return Math.max(0, s.params.timeLimitSeconds - elapsedSeconds(s));
}

/** 공허 블록 생성 확률: 기본 + 컨디션·환경·바퀴·돌파 가산 (상한 있음) */
export function voidChanceOf(p: CombatParams): number {
  return Math.min(p.voidChanceMax, p.voidChance + p.voidChanceBonus);
}

/** 내 공격 1단위(기본 공격 1회) 피해: 육성·환경 반영 */
function unitDamage(p: CombatParams): number {
  return p.playerAttackDamage * p.growthMultiplier * p.playerPowerMultiplier;
}

/** 스킬 블록 위력 배율: 계통 보너스 × 체인 배율 × 약점(×1.5) */
export function blockEffect(s: CombatState, b: Block): { skill: CombatSkill; mult: number; weak: boolean } | null {
  if (b.kind !== 'skill') return null;
  const skill = sourceOf(s.params, b.traitId);
  if (!skill) return null;
  const weak = skill.lineageId !== null && skill.lineageId === s.enemy.def.weaknessLineageId;
  const chainMult = s.params.chainMultipliers[b.chain - 1] ?? 1;
  return { skill, mult: skill.powerMultiplier * chainMult * (weak ? s.params.weaknessMultiplier : 1), weak };
}

/** 이 블록을 지금 쓰면 줄 피해 (봇·화면 예고용) */
export function blockDamage(s: CombatState, b: Block): number {
  const p = s.params;
  if (b.kind === 'special') return p.specialPowerInAttacks * unitDamage(p);
  if (b.kind === 'void') return p.voidPowerInAttacks * unitDamage(p);
  const e = blockEffect(s, b);
  return e ? e.skill.powerInAttacks * e.mult * unitDamage(p) : 0;
}

function emit(s: CombatState, e: CombatEvent): void {
  s.events.push(e);
}

export function drainCombatEvents(s: CombatState): CombatEvent[] {
  return s.events.splice(0, s.events.length);
}

function dealDamage(s: CombatState, amount: number, finisher: Finisher): void {
  if (s.status !== 'playing') return;
  s.enemy.hp = Math.max(0, s.enemy.hp - amount);
  if (s.enemy.hp <= 0) {
    s.status = 'won';
    s.finisher = finisher;
    emit(s, { kind: 'end', status: 'won' });
  }
}

function takeDamage(s: CombatState, amount: number): void {
  if (s.status !== 'playing') return;
  s.player.hp = Math.max(0, s.player.hp - amount);
  if (s.player.hp <= 0) {
    s.status = 'lost';
    s.lossReason = 'hp';
    emit(s, { kind: 'end', status: 'lost' });
  }
}

function spawn(s: CombatState, kind: Block['kind'], traitId: string | null): boolean {
  const free = emptyCells(s.tray);
  if (free.length === 0) return false;
  const cell = free[nextInt(s.rng, free.length)]!;
  s.tray[cell] = { uid: s.nextUid++, kind, traitId, chain: 1 };
  emit(s, { kind: 'spawn', cell, block: kind });
  return true;
}

function addSp(s: CombatState, v: number): void {
  s.sp = Math.min(s.params.spMax, s.sp + v);
}

function applyChainBonus(s: CombatState, bonus: ChainBonus): void {
  const p = s.params;
  if (bonus.kind === 'stagger') {
    // 적의 다음 행동을 늦춘다: 기본 공격, 특수 행동, 시전 중인 강공격 모두
    const d = ticksOf(p, bonus.value);
    s.enemy.attackTimer += d;
    if (s.enemy.def.pattern) s.enemy.actionTimer += d;
    if (s.enemy.cast) s.enemy.cast.ticks += d;
  } else if (bonus.kind === 'reflect') {
    s.guard.reflect = Math.max(s.guard.reflect, bonus.value);
  } else {
    s.sealTicks = 0;
    addSp(s, bonus.value);
  }
}

/** 블록 사용 (탭). 스킬 블록 = 역할 효과 + 피해, 필살 = 큰 피해, 공허 = 큰 피해 + 리스크 상승 */
function useBlock(s: CombatState, cell: number): boolean {
  const b = s.tray[cell];
  if (!b) return false;
  s.tray[cell] = null;
  const p = s.params;
  if (b.kind === 'special') {
    s.specialUsed = true;
    const damage = blockDamage(s, b);
    emit(s, { kind: 'block', block: 'special', traitId: null, role: null, chain: 1, damage, weak: false, heal: 0, guardSeconds: 0, bonus: null });
    dealDamage(s, damage, { kind: 'special', traitId: null, lineageId: null });
    return true;
  }
  if (b.kind === 'void') {
    s.voidUsed++;
    s.riskGained += p.riskPerVoidBlock;
    addSp(s, p.spPerBlock);
    const damage = blockDamage(s, b);
    emit(s, { kind: 'block', block: 'void', traitId: null, role: null, chain: 1, damage, weak: false, heal: 0, guardSeconds: 0, bonus: null });
    dealDamage(s, damage, { kind: 'void', traitId: null, lineageId: null });
    return true;
  }
  const eff = blockEffect(s, b);
  if (!eff) return true; // 생성원에 없는 블록(있을 수 없음)은 그냥 사라진다
  const { skill, mult, weak } = eff;
  const id = skill.id;
  s.skillsUsed.push(id);
  s.blocksByTrait[id] = (s.blocksByTrait[id] ?? 0) + 1;
  s.blocksByChain[Math.min(3, b.chain) - 1]!++;
  if (b.chain >= maxChain(p)) s.chain3Count++;
  addSp(s, p.spPerBlock);
  let heal = 0;
  let guardSeconds = 0;
  if (skill.role === 'guard') {
    guardSeconds = p.guardSeconds * mult;
    s.guard.ticks = Math.max(s.guard.ticks, ticksOf(p, guardSeconds));
  } else if (skill.role === 'heal') {
    heal = Math.min(s.player.maxHp - s.player.hp, s.player.maxHp * p.healFraction * mult);
    s.player.hp += heal;
  }
  const bonus = b.chain >= p.chainBonusFromChain ? skill.chainBonus : null;
  if (bonus) applyChainBonus(s, bonus);
  const damage = blockDamage(s, b);
  emit(s, { kind: 'block', block: 'skill', traitId: id, role: skill.role, chain: b.chain, damage, weak, heal, guardSeconds, bonus: bonus?.kind ?? null });
  dealDamage(s, damage, { kind: 'skill', traitId: id, lineageId: skill.lineageId });
  return true;
}

/** 입력 하나 적용. 규칙에 맞지 않으면 false (상태 그대로) */
export function applyInput(s: CombatState, input: CombatInput): boolean {
  if (s.status !== 'playing') return false;
  const p = s.params;
  let ok = false;
  if (input.type === 'use') {
    ok = inTray(s.tray, input.cell) && useBlock(s, input.cell);
  } else if (input.type === 'merge') {
    if (canMerge(s.tray, input.from, input.to, p.trayCols, maxChain(p))) {
      const target = s.tray[input.to]!;
      target.chain++;
      s.tray[input.from] = null;
      emit(s, { kind: 'merge', cell: input.to, chain: target.chain });
      ok = true;
    }
  } else if (canMove(s.tray, input.from, input.to, p.trayCols)) {
    const t = s.tray[input.to]!;
    s.tray[input.to] = s.tray[input.from]!;
    s.tray[input.from] = t;
    ok = true;
  }
  if (ok) s.inputs.push({ tick: s.tick, input });
  return ok;
}

function shuffleTray(s: CombatState): void {
  const t = s.tray;
  for (let i = t.length - 1; i > 0; i--) {
    const j = nextInt(s.rng, i + 1);
    [t[i], t[j]] = [t[j]!, t[i]!];
  }
  emit(s, { kind: 'shuffle' });
}

function enemyDamage(s: CombatState, inAttacks: number): number {
  const p = s.params;
  const jitter = 1 + (nextFloat(s.rng) * 2 - 1) * p.enemyDamageVariance;
  return inAttacks * p.playerAttackDamage * jitter * p.damageTakenMultiplier;
}

/** 강공격 착탄: 막기 상태면 크게 줄고(막기 성공), 반사 효과가 있으면 막은 피해를 돌려준다 */
function resolveHeavy(s: CombatState): void {
  const pattern = s.enemy.def.pattern!;
  let damage = enemyDamage(s, pattern.heavyInAttacks);
  const guarded = s.guard.ticks > 0;
  let reflected = 0;
  if (guarded) {
    const blocked = damage * s.params.heavyGuardReduction;
    damage -= blocked;
    s.guardSuccesses++;
    reflected = blocked * s.guard.reflect;
  }
  emit(s, { kind: 'heavy-hit', damage, guarded, reflected });
  if (reflected > 0) dealDamage(s, reflected, { kind: 'reflect', traitId: null, lineageId: null });
  takeDamage(s, damage);
}

/** 한 틱 진행: 버프 → 안개 섞기 → 블록 생성 → 내 기본 공격 → 적 행동 → 시간 제한 */
function advanceTick(s: CombatState): void {
  const p = s.params;
  const t = (sec: number) => ticksOf(p, sec);
  s.tick++;
  if (s.guard.ticks > 0 && --s.guard.ticks === 0) s.guard.reflect = 0;
  if (s.sealTicks > 0) s.sealTicks--;
  if (p.trayShuffleSeconds > 0 && --s.shuffleTimer <= 0) {
    s.shuffleTimer = t(p.trayShuffleSeconds);
    shuffleTray(s);
  }
  // 블록 생성: 생성원마다 일정 간격. 트레이가 가득 차거나 봉인 중이면 타이머가 멈춘다
  if (s.sealTicks === 0) {
    const sources = blockSources(p);
    sources.forEach((src, i) => {
      if (emptyCells(s.tray).length === 0) return;
      if (--s.spawnTimers[i]! <= 0) {
        spawn(s, 'skill', src.id);
        s.spawnTimers[i] = t(p.blockSpawnSeconds);
      }
    });
  }
  if (--s.voidTimer <= 0) {
    s.voidTimer = t(p.voidCheckSeconds);
    if (nextFloat(s.rng) < voidChanceOf(p)) spawn(s, 'void', null);
  }
  if (s.sp >= p.spMax && spawn(s, 'special', null)) s.sp = 0;
  // 내 자동 기본 공격
  if (--s.player.attackTimer <= 0) {
    s.player.attackTimer = t(p.playerAttackSeconds / p.attackSpeedMultiplier);
    const damage = unitDamage(p) * p.attackPowerMultiplier;
    emit(s, { kind: 'player-attack', damage });
    dealDamage(s, damage, { kind: 'basic-attack', traitId: null, lineageId: null });
    if (s.status !== 'playing') return;
  }
  // 적: 시전 중이면 강공격 대기, 아니면 기본 공격 + 패턴(강공격 예고 / 봉인)
  const e = s.enemy;
  const pattern = e.def.pattern;
  if (e.cast) {
    if (--e.cast.ticks <= 0) {
      e.cast = null;
      resolveHeavy(s);
      e.attackTimer = t(p.enemyAttackSeconds);
      if (pattern) e.actionTimer = t(pattern.everySeconds);
    }
  } else {
    if (--e.attackTimer <= 0) {
      e.attackTimer = t(p.enemyAttackSeconds);
      const raw = enemyDamage(s, e.def.attackInAttacks);
      const guarded = s.guard.ticks > 0;
      const damage = guarded ? raw * (1 - p.guardReduction) : raw;
      emit(s, { kind: 'enemy-attack', damage, guarded });
      takeDamage(s, damage);
    }
    if (pattern && s.status === 'playing' && --e.actionTimer <= 0) {
      const action = pattern.sequence[e.actionIndex % pattern.sequence.length]!;
      e.actionIndex++;
      if (action === 'heavy') {
        const total = t(pattern.castSeconds);
        e.cast = { ticks: total, total };
        emit(s, { kind: 'heavy-cast', seconds: pattern.castSeconds });
      } else {
        s.sealTicks = Math.max(s.sealTicks, t(pattern.sealSeconds));
        emit(s, { kind: 'seal', seconds: pattern.sealSeconds });
        e.actionTimer = t(pattern.everySeconds);
      }
    }
  }
  if (s.status === 'playing' && s.tick >= t(p.timeLimitSeconds)) {
    s.status = 'lost';
    s.lossReason = 'timeout';
    emit(s, { kind: 'end', status: 'lost' });
  }
}

/** 입력(없음/하나/여럿)을 적용하고 한 틱 진행한다. 각 입력이 받아들여졌는지 돌려준다 */
export function step(s: CombatState, input?: CombatInput | CombatInput[] | null): boolean[] {
  if (s.status !== 'playing') return [];
  const list = input ? (Array.isArray(input) ? input : [input]) : [];
  const accepted = list.map((x) => applyInput(s, x));
  if (s.status === 'playing') advanceTick(s);
  return accepted;
}

/** 같은 시드 + 입력 기록으로 처음부터 다시 돌린다 (결정성 확인·리플레이) */
export function replayCombat(seed: number, setup: CombatSetup, inputs: { tick: number; input: CombatInput }[]): CombatState {
  const s = createCombat(seed, setup);
  let i = 0;
  while (s.status === 'playing') {
    const now: CombatInput[] = [];
    while (i < inputs.length && inputs[i]!.tick === s.tick) now.push(inputs[i++]!.input);
    step(s, now);
    s.events.length = 0;
  }
  return s;
}
