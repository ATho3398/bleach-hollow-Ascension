// 전투 v2: 실시간 자동 전투 + 스킬 블록 체인 (GDD 3-5). 종족 무관 순수 로직, 화면과 분리.
// 고정 틱(BALANCE.provisional.combat.tickSeconds) 시뮬레이션: createCombat(seed, setup) → step(state, input?) 반복.
// 같은 시드 + 같은 입력 기록 = 같은 결과. 상태는 평범한 객체(rng 포함)라 structuredClone 으로 복제할 수 있다.
// 화면은 step 을 실시간(1x/2x)으로 부르고, 테스트·봇은 헤드리스로 빠르게 돌린다.

import { BALANCE } from '../../config/balance';
import { hasSpecialActions } from '../../data/enemies';
import { lineageFamily } from '../../data/lineages';
import type { ChainBonus, ChainBonusKind, EnemyDef, EnemyPattern, SkillRole } from '../../data/schema';
import type { FinisherKind } from '../runLog';
import { createRng, nextFloat, nextInt, type Rng } from '../rng';
import { chainGroup, inTray, type Block, type Tray } from './tray';

const CX = BALANCE.provisional.combat;

/** 기본 블록 특성 id: 슬롯에 skill 특성이 없으면 이 블록만 나온다 (GDD 3-5 "기본 공격 강화") */
export const BASIC_SKILL_ID = 'basic-skill';

/** 전투에 가져온 블록 생성원 하나 (장착 skill 특성, 또는 기본 블록) */
export interface CombatSkill {
  id: string;
  /** 계통 id (기본 블록은 null). 적 약점 계통과 같으면 위력 ×1.5 */
  lineageId: string | null;
  role: SkillRole;
  /** 공격 계열 id (GDD 17-3, 종족 설정 families). 막기·회복·기본 블록은 null */
  family?: string | null;
  /** 블록 위력: 플레이어 기본 공격 N회 분량의 피해 */
  powerInAttacks: number;
  chainBonus: ChainBonus;
  /** 위력 배율(계통 보너스 등). 피해·막기 지속·회복량에 모두 곱한다. 1 = 없음 */
  powerMultiplier: number;
}

/** 계열 한 개의 단계별 효과 (GDD 17-3, 종족 설정 families 에서 옮긴다). tiers[k] = (k+1)단계 */
export interface FamilyCombat {
  tiers: { multiplier: number; bonus?: ChainBonus }[];
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
  /** 블록 바 칸 수 (일자 8칸, GDD 3-5 v0.8) */
  trayCapacity: number;
  blockSpawnSeconds: number;
  familySpawnSlowdown: number;
  chainMultipliers: readonly number[];
  chainBonusFromChain: number;
  /** 계열 id → 단계별 위력 배율·추가 효과 (종족 설정에서 옮김, GDD 17-3). 없는 계열·기본/막기/회복 블록은 chainMultipliers·skill.chainBonus 를 쓴다 */
  families: Record<string, FamilyCombat>;
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
  /** 저장형 필살기 (C.17, GDD 14-6) */
  storedGaugePerBlock: number;
  storedChainBonus: readonly number[];
  storedGaugeMax: number;
  storedChargesMax: number;
  storedPowerInAttacks: number;
  storedGuardSeconds: number;
  storedStartGaugeMax: number;
  /** 전투 시작 저장 게이지 (둥지 애착: 안정 수치에 비례, storedStartGaugeOf). 0 = 없음 */
  storedStartGauge: number;
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
  /** 환경(안개): 이 간격(초)마다 블록 바의 순서가 섞인다. 0 = 없음 */
  trayShuffleSeconds: number;
  /** 컨디션·환경(폐가)·5바퀴 이후·한계 돌파: 공허 블록 생성 확률 가산 */
  voidChanceBonus: number;
}

export function defaultCombatParams(): CombatParams {
  return {
    ...CX,
    families: {},
    riskPerVoidBlock: BALANCE.provisional.risk.perVoidBlock,
    storedStartGauge: 0,
    skills: [],
    attackPowerMultiplier: 1,
    attackSpeedMultiplier: 1,
    damageTakenMultiplier: 1,
    playerPowerMultiplier: 1,
    trayShuffleSeconds: 0,
    voidChanceBonus: 0,
  };
}

/** 엔진이 받는 입력은 둘뿐이다 (GDD 3-5, 17-2: 블록 순서는 바꿀 수 없다 — 나온 순서대로 쓴다).
 *  use: 바의 cell 번째 블록 클릭 — 붙어 있는 같은 계열 공격 블록(막기·회복·기본 블록은 같은 특성)이 함께 발동해 체인이 된다 (GDD 17-3).
 *  stored: 저장형 필살기 사용 (충전 1개 소모, GDD 14-6). */
export type CombatInput =
  | { type: 'use'; cell: number }
  | { type: 'stored' };

export type CombatStatus = 'playing' | 'won' | 'lost';

export interface Finisher {
  kind: FinisherKind;
  traitId: string | null;
  lineageId: string | null;
  /** 마무리 일격 블록의 계열 (계열 없는 블록은 null) */
  family?: string | null;
  /** 마무리 일격이 약점 계열(약점 ×1.5)이었는가 (흡수 조건, GDD 17-3) */
  weak?: boolean;
}

/** 화면 연출용 사건. 화면이 drainCombatEvents 로 비우며 그린다 */
export type CombatEvent =
  | { kind: 'player-attack'; damage: number }
  | { kind: 'enemy-attack'; damage: number; guarded: boolean }
  | { kind: 'block'; block: Block['kind']; traitId: string | null; family: string | null; role: SkillRole | null; chain: number; damage: number; weak: boolean; heal: number; guardSeconds: number; bonus: ChainBonusKind | null }
  | { kind: 'heavy-cast'; seconds: number }
  | { kind: 'heavy-hit'; damage: number; guarded: boolean; reflected: number }
  | { kind: 'seal'; seconds: number }
  | { kind: 'stance'; seconds: number }
  | { kind: 'stance-end' }
  | { kind: 'counter'; damage: number; guarded: boolean }
  | { kind: 'stored-use'; damage: number; guardSeconds: number; charges: number }
  | { kind: 'stored-ready'; charges: number }
  | { kind: 'spawn'; index: number; block: Block['kind'] }
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
    /** 다음 특수 행동(강공격·봉인·방어 자세)까지 남은 틱 (특수 행동이 있는 패턴만) */
    actionTimer: number;
    /** 다음 특수 행동이 패턴 순서의 몇 번째인가 */
    actionIndex: number;
    /** 강공격 시전(예고) 중이면 남은 틱. hitsLeft = 이 시전 뒤에 이어질 연속 강공격 수 */
    cast: { ticks: number; total: number; hitsLeft: number } | null;
    /** 이 적의 약점 계열 (약점 계통의 계열, GDD 17-3). 약점 계통에 계열이 없으면 null */
    weakFamily?: string | null;
    /** 방어 자세 중이면 남은 틱: 내 블록 피해가 줄고, 블록을 쓸 때마다 반격을 받는다 */
    stance: { ticks: number } | null;
  };
  player: { hp: number; maxHp: number; attackTimer: number };
  tray: Tray;
  nextUid: number;
  /** 블록 생성원(skills, 비면 기본 블록)마다 다음 생성까지 남은 틱 */
  spawnTimers: number[];
  voidTimer: number;
  shuffleTimer: number;
  sp: number;
  /** 저장 게이지(0~storedGaugeMax 미만)와 충전 개수 (전투 안에서만 유효, GDD 14-6) */
  storedGauge: number;
  storedCharges: number;
  storedUsed: number;
  /** 충전이 상한이라 버려진 게이지 합계 */
  storedWasted: number;
  /** 봉인: 남은 틱 동안 스킬 블록 생성 정지 */
  sealTicks: number;
  /** 막기 상태: 남은 틱, 그 막기에 붙은 반사 배율 */
  guard: { ticks: number; reflect: number };
  // ── 기록 (BattleRecord) ──
  skillsUsed: string[];
  blocksByTrait: Record<string, number>;
  blocksByChain: [number, number, number];
  /** 계열별 체인 발동 횟수: 계열 id → [체인1, 체인2, 체인3] (계열 있는 공격 블록만, GDD 17-3) */
  chainsByFamily: Record<string, [number, number, number]>;
  chain3Count: number;
  /** 콤보 발동(특수 블록 생성) 횟수와 콤보 블록 사용 횟수 (GDD 17-3) */
  combosTriggered: number;
  comboBlocksUsed: number;
  /** 약점 계통 스킬 블록으로 발동한 체인3 횟수 (흡수 조건, GDD 3-5 v0.7) */
  weakChain3Count: number;
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
  return [{ id: BASIC_SKILL_ID, lineageId: null, family: null, role: 'attack', powerInAttacks: p.basicBlockPowerInAttacks, chainBonus: p.basicBlockChainBonus, powerMultiplier: 1 }];
}

/** 이 생성원의 블록 생성 간격(초): 같은 계열 공격 특성이 여럿이면 체인이 쉬워지므로 그만큼 늘린다 (GDD 17-3, familySpawnSlowdown) */
export function spawnSecondsOf(p: CombatParams, src: CombatSkill): number {
  if (!src.family) return p.blockSpawnSeconds;
  const same = blockSources(p).filter((x) => x.family === src.family).length;
  return p.blockSpawnSeconds * (1 + p.familySpawnSlowdown * (same - 1));
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
      attackTimer: t(enemyAttackSecondsOf(params, setup.enemy.pattern)),
      actionTimer: hasSpecialActions(setup.enemy.pattern) ? t(setup.enemy.pattern.everySeconds) : 0,
      actionIndex: 0,
      weakFamily: lineageFamily(setup.enemy.weaknessLineageId),
      cast: null,
      stance: null,
    },
    player: { hp: params.playerMaxHp, maxHp: params.playerMaxHp, attackTimer: t(params.playerAttackSeconds / params.attackSpeedMultiplier) },
    tray: [],
    nextUid: 1,
    // 생성원이 여럿이면 생성 시점을 고르게 엇갈린다 (첫 블록은 간격의 절반 뒤)
    spawnTimers: sources.map((src, i) => Math.max(1, Math.round((t(spawnSecondsOf(params, src)) * (i + 0.5)) / sources.length))),
    voidTimer: t(params.voidCheckSeconds),
    shuffleTimer: params.trayShuffleSeconds > 0 ? t(params.trayShuffleSeconds) : 0,
    sp: 0,
    ...startStored(params),
    storedUsed: 0,
    storedWasted: 0,
    sealTicks: 0,
    guard: { ticks: 0, reflect: 0 },
    skillsUsed: [],
    blocksByTrait: {},
    blocksByChain: [0, 0, 0],
    chainsByFamily: {},
    chain3Count: 0,
    combosTriggered: 0,
    comboBlocksUsed: 0,
    weakChain3Count: 0,
    guardSuccesses: 0,
    voidUsed: 0,
    specialUsed: false,
    riskGained: 0,
    finisher: null,
    inputs: [],
    events: [],
  };
}

/** 안정 수치(0~stabilityMax) → 전투 시작 저장 게이지 (0~storedStartGaugeMax, 비례) */
export function storedStartGaugeOf(stability: number): number {
  const max = BALANCE.provisional.risk.stabilityMax;
  return (Math.min(max, Math.max(0, stability)) / max) * CX.storedStartGaugeMax;
}

/** 시작 게이지를 게이지·충전으로 나눈다 (시작 게이지가 100 이상이어도 되게 충전 환산) */
function startStored(p: CombatParams): { storedGauge: number; storedCharges: number } {
  const total = Math.max(0, p.storedStartGauge);
  const charges = Math.min(p.storedChargesMax, Math.floor(total / p.storedGaugeMax));
  return { storedGauge: charges >= p.storedChargesMax ? 0 : total - charges * p.storedGaugeMax, storedCharges: charges };
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

/** 약점인가 (GDD 17-3): 공격 블록은 적의 약점 계열과 같은 계열이면, 계열 없는 블록(막기·회복)은 약점 계통과 같은 계통이면 ×1.5 */
export function isWeak(s: CombatState, skill: CombatSkill): boolean {
  if (skill.family) return skill.family === (s.enemy.weakFamily ?? null);
  return skill.lineageId !== null && skill.lineageId === s.enemy.def.weaknessLineageId;
}

/** 계열 단계 기술(위력 배율·추가 효과): 종족 설정에서 온 계열 표가 있으면 그것, 없으면 체인 배율 + 특성의 체인 추가 효과 (chain = 1~3) */
export function tierEffect(p: CombatParams, skill: CombatSkill, chain: number): { multiplier: number; bonus: ChainBonus | null } {
  const fam = skill.family ? p.families[skill.family]?.tiers[chain - 1] : undefined;
  if (fam) return { multiplier: fam.multiplier, bonus: fam.bonus ?? null };
  return { multiplier: p.chainMultipliers[chain - 1] ?? 1, bonus: chain >= p.chainBonusFromChain ? skill.chainBonus : null };
}

/** 스킬 블록 위력 배율: 계통 보너스 × 단계 기술 배율(체인 배율을 이어받음) × 약점(×1.5). chain = 함께 발동하는 블록 수(1~3), 바에 있는 블록 하나만 볼 때는 1 */
export function blockEffect(s: CombatState, b: Block, chain = 1): { skill: CombatSkill; mult: number; weak: boolean } | null {
  if (b.kind !== 'skill') return null;
  const skill = sourceOf(s.params, b.traitId);
  if (!skill) return null;
  const weak = isWeak(s, skill);
  return { skill, mult: skill.powerMultiplier * tierEffect(s.params, skill, chain).multiplier * (weak ? s.params.weaknessMultiplier : 1), weak };
}

/** 이 블록을 지금 쓰면 줄 피해 (봇·화면 예고용) */
export function blockDamage(s: CombatState, b: Block, chain = 1): number {
  const p = s.params;
  const guardPose = stanceMultiplier(s);
  if (b.kind === 'special') return p.specialPowerInAttacks * unitDamage(p) * guardPose;
  if (b.kind === 'void') return p.voidPowerInAttacks * unitDamage(p) * guardPose;
  const e = blockEffect(s, b, chain);
  return e ? e.skill.powerInAttacks * e.mult * unitDamage(p) * guardPose : 0;
}

/** 방어 자세 중이면 내 블록 피해 배율(<1), 아니면 1 */
export function stanceMultiplier(s: CombatState): number {
  const pat = s.enemy.def.pattern;
  return s.enemy.stance && pat?.kind === 'stance' ? pat.blockDamageMultiplier : 1;
}

/** 이 적의 기본 공격 간격(초): 패턴이 정하면(속공·단단) 그 값, 아니면 공통 값 */
export function enemyAttackSecondsOf(p: CombatParams, pattern: EnemyPattern | undefined): number {
  return pattern && 'attackSeconds' in pattern ? pattern.attackSeconds : p.enemyAttackSeconds;
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

function spawn(s: CombatState, kind: Block['kind'], traitId: string | null, family: string | null = null): boolean {
  if (s.tray.length >= s.params.trayCapacity) return false;
  s.tray.push({ uid: s.nextUid++, kind, traitId, family });
  emit(s, { kind: 'spawn', index: s.tray.length - 1, block: kind });
  return true;
}

/** 저장 게이지 적립: 100 이 차면 충전 +1 (최대 storedChargesMax), 상한이면 버려진 양을 기록 */
function addStored(s: CombatState, v: number): void {
  const p = s.params;
  s.storedGauge += v;
  while (s.storedGauge >= p.storedGaugeMax) {
    s.storedGauge -= p.storedGaugeMax;
    if (s.storedCharges < p.storedChargesMax) {
      s.storedCharges++;
      emit(s, { kind: 'stored-ready', charges: s.storedCharges });
    } else {
      s.storedWasted += p.storedGaugeMax;
    }
  }
  if (s.storedCharges >= p.storedChargesMax && s.storedGauge > 0) {
    s.storedWasted += s.storedGauge;
    s.storedGauge = 0;
  }
}

/** 저장형 필살기 사용: 충전 1개 소모, 기본 공격 N회 분량 피해(약점·체인·방어 자세 무시) + 직후 막기 상태 */
export function storedDamage(s: CombatState): number {
  return s.params.storedPowerInAttacks * unitDamage(s.params);
}

function useStored(s: CombatState): boolean {
  if (s.storedCharges <= 0) return false;
  const p = s.params;
  s.storedCharges--;
  s.storedUsed++;
  s.guard.ticks = Math.max(s.guard.ticks, ticksOf(p, p.storedGuardSeconds));
  const damage = storedDamage(s);
  emit(s, { kind: 'stored-use', damage, guardSeconds: p.storedGuardSeconds, charges: s.storedCharges });
  dealDamage(s, damage, { kind: 'stored', traitId: null, lineageId: null });
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
    if (hasSpecialActions(s.enemy.def.pattern)) s.enemy.actionTimer += d;
    if (s.enemy.cast) s.enemy.cast.ticks += d;
  } else if (bonus.kind === 'reflect') {
    s.guard.reflect = Math.max(s.guard.reflect, bonus.value);
  } else {
    s.sealTicks = 0;
    addSp(s, bonus.value);
  }
}

/** 블록 사용 (클릭). 스킬 블록 = 붙어 있는 같은 특성 블록이 함께 발동(체인) → 역할 효과 + 피해, 필살 = 큰 피해, 공허 = 큰 피해 + 리스크 상승 */
function useBlock(s: CombatState, index: number): boolean {
  const b = s.tray[index];
  if (!b) return false;
  const p = s.params;
  if (b.kind === 'special') {
    s.tray.splice(index, 1);
    s.specialUsed = true;
    addStored(s, p.storedGaugePerBlock);
    const damage = blockDamage(s, b);
    emit(s, { kind: 'block', block: 'special', traitId: null, family: null, role: null, chain: 1, damage, weak: false, heal: 0, guardSeconds: 0, bonus: null });
    dealDamage(s, damage, { kind: 'special', traitId: null, lineageId: null });
    counterIfStance(s);
    return true;
  }
  if (b.kind === 'void') {
    s.tray.splice(index, 1);
    s.voidUsed++;
    s.riskGained += p.riskPerVoidBlock;
    addStored(s, p.storedGaugePerBlock);
    addSp(s, p.spPerBlock);
    const damage = blockDamage(s, b);
    emit(s, { kind: 'block', block: 'void', traitId: null, family: null, role: null, chain: 1, damage, weak: false, heal: 0, guardSeconds: 0, bonus: null });
    dealDamage(s, damage, { kind: 'void', traitId: null, lineageId: null });
    counterIfStance(s);
    return true;
  }
  // 스킬 블록: 함께 발동하는 칸들이 모두 소모된다. 체인 단계 = 함께 쓰인 블록 수
  const group = chainGroup(s.tray, index, maxChain(p));
  const chain = group.length;
  s.tray.splice(group[0]!, chain);
  const eff = blockEffect(s, b, chain);
  if (!eff) return true; // 생성원에 없는 블록(있을 수 없음)은 그냥 사라진다
  const { skill, mult, weak } = eff;
  const id = skill.id;
  // 기록: 특성별·skillsUsed 는 소모된 블록 수, 체인별은 발동 횟수 (한 번 눌러 체인N = blocksByChain[N-1] + 1)
  for (let k = 0; k < chain; k++) s.skillsUsed.push(id);
  s.blocksByTrait[id] = (s.blocksByTrait[id] ?? 0) + chain;
  s.blocksByChain[chain - 1]!++;
  if (skill.family) {
    const rec = (s.chainsByFamily[skill.family] ??= [0, 0, 0]);
    rec[chain - 1]!++;
  }
  if (chain >= maxChain(p)) {
    s.chain3Count++;
    if (weak) s.weakChain3Count++;
  }
  addSp(s, p.spPerBlock * chain);
  addStored(s, p.storedGaugePerBlock * chain + (p.storedChainBonus[chain - 1] ?? 0));
  let heal = 0;
  let guardSeconds = 0;
  if (skill.role === 'guard') {
    guardSeconds = p.guardSeconds * mult;
    s.guard.ticks = Math.max(s.guard.ticks, ticksOf(p, guardSeconds));
  } else if (skill.role === 'heal') {
    heal = Math.min(s.player.maxHp - s.player.hp, s.player.maxHp * p.healFraction * mult);
    s.player.hp += heal;
  }
  const bonus = tierEffect(p, skill, chain).bonus;
  if (bonus) applyChainBonus(s, bonus);
  const damage = blockDamage(s, b, chain);
  emit(s, { kind: 'block', block: 'skill', traitId: id, family: skill.family ?? null, role: skill.role, chain, damage, weak, heal, guardSeconds, bonus: bonus?.kind ?? null });
  dealDamage(s, damage, { kind: 'skill', traitId: id, lineageId: skill.lineageId, family: skill.family ?? null, weak });
  counterIfStance(s);
  return true;
}

/** 입력 하나 적용. 규칙에 맞지 않으면 false (상태 그대로) */
export function applyInput(s: CombatState, input: CombatInput): boolean {
  if (s.status !== 'playing') return false;
  let ok = false;
  if (input.type === 'stored') {
    ok = useStored(s);
  } else if (input.type === 'use') {
    ok = inTray(s.tray, input.cell) && useBlock(s, input.cell);
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
  const pattern = s.enemy.def.pattern;
  if (!pattern || !('heavyInAttacks' in pattern)) return;
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

/** 패턴의 특수 행동 하나를 시작한다 (종류별 일반 처리, 적 id 분기 없음) */
function startAction(s: CombatState, pattern: Extract<EnemyPattern, { everySeconds: number }>): void {
  const e = s.enemy;
  const t = (sec: number) => ticksOf(s.params, sec);
  if (pattern.kind === 'stance') {
    e.stance = { ticks: t(pattern.stanceSeconds) };
    e.actionTimer = t(pattern.everySeconds);
    emit(s, { kind: 'stance', seconds: pattern.stanceSeconds });
    return;
  }
  const action = pattern.kind === 'heavy-seal' ? pattern.sequence[e.actionIndex % pattern.sequence.length]! : 'heavy';
  e.actionIndex++;
  if (action === 'heavy') {
    const total = t(pattern.castSeconds);
    e.cast = { ticks: total, total, hitsLeft: pattern.kind === 'heavy-chain' ? pattern.hits - 1 : 0 };
    emit(s, { kind: 'heavy-cast', seconds: pattern.castSeconds });
  } else if (pattern.kind === 'heavy-seal') {
    s.sealTicks = Math.max(s.sealTicks, t(pattern.sealSeconds));
    emit(s, { kind: 'seal', seconds: pattern.sealSeconds });
    e.actionTimer = t(pattern.everySeconds);
  }
}

/** 방어 자세 중 블록을 쓰면 반격을 받는다 (막기 상태면 기본 공격처럼 경감). 적이 이미 쓰러졌으면 없다 */
function counterIfStance(s: CombatState): void {
  const pattern = s.enemy.def.pattern;
  if (!s.enemy.stance || pattern?.kind !== 'stance' || s.status !== 'playing') return;
  const raw = enemyDamage(s, pattern.counterInAttacks);
  const guarded = s.guard.ticks > 0;
  const damage = guarded ? raw * (1 - s.params.guardReduction) : raw;
  emit(s, { kind: 'counter', damage, guarded });
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
  // 블록 생성: 생성원마다 일정 간격. 바가 가득 차거나 봉인 중이면 타이머가 멈춘다
  if (s.sealTicks === 0) {
    const sources = blockSources(p);
    sources.forEach((src, i) => {
      if (s.tray.length >= p.trayCapacity) return;
      if (--s.spawnTimers[i]! <= 0) {
        spawn(s, 'skill', src.id, src.family ?? null);
        s.spawnTimers[i] = t(spawnSecondsOf(p, src));
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
  // 적: 시전 중이면 강공격 대기, 아니면 기본 공격 + 패턴의 특수 행동(강공격 예고 / 봉인 / 방어 자세)
  const e = s.enemy;
  const pattern = e.def.pattern;
  const attackTicks = t(enemyAttackSecondsOf(p, pattern));
  if (e.stance && --e.stance.ticks <= 0) {
    e.stance = null;
    emit(s, { kind: 'stance-end' });
  }
  if (e.cast) {
    if (--e.cast.ticks <= 0) {
      const more = e.cast.hitsLeft;
      e.cast = null;
      resolveHeavy(s);
      if (s.status === 'playing' && more > 0 && pattern?.kind === 'heavy-chain') {
        const total = t(pattern.followCastSeconds);
        e.cast = { ticks: total, total, hitsLeft: more - 1 };
        emit(s, { kind: 'heavy-cast', seconds: pattern.followCastSeconds });
      } else {
        e.attackTimer = attackTicks;
        if (hasSpecialActions(pattern)) e.actionTimer = t(pattern.everySeconds);
      }
    }
  } else {
    if (--e.attackTimer <= 0) {
      e.attackTimer = attackTicks;
      const raw = enemyDamage(s, e.def.attackInAttacks);
      const guarded = s.guard.ticks > 0;
      const damage = guarded ? raw * (1 - p.guardReduction) : raw;
      emit(s, { kind: 'enemy-attack', damage, guarded });
      takeDamage(s, damage);
    }
    if (hasSpecialActions(pattern) && s.status === 'playing' && --e.actionTimer <= 0) startAction(s, pattern);
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
