// 공격 연출(몸통박치기) 로직 (GDD 17-4, R-4, C.35).
// 위쪽은 DOM 이 없는 순수 함수(사건 → 강도 단계, 연출 큐, 애니메이션 계획)라 단위 테스트한다 (tests/attackfx.test.ts).
// 아래쪽 attackFx() 가 Web Animations 로 그림 한 장을 움직인다. 엔진 틱·결과는 건드리지 않고, 사건이 났을 때 연출만 얹는다.
import { blockHitKey, type CombatEvent, type HitDelayParams } from '../engine/combat';
import type { AttackFxKind, FamilyMotionKind } from '../engine/faction';
import type { AnimAction } from '../data/art/anim';
import type { PixelFxStage } from '../engine/faction';
import { NORMAL_ELEMENT } from '../data/elements';
import { fxSheetName, mountPixelFx, pixelFxKeyframes, pixelFxTransform, sheetDurationMs, type PixelFxSheet } from './bha/pixelFx';
import { flyPoint, hasPixelStage, pixelPlan, type PixelBodySlot, type PixelInst, type PixelPlan } from './pixelAttack';
import type { AnimPlayer } from './bha/animPlayer';
import {
  ATTACK_FX, ATTACK_TIER_ORDER, ELITE_HEAVY_ELEMENT, FAMILY_MOTION, FAMILY_STAGE_FX, FX_RATE_MAX, FX_RATE_MIN, FX_SAFETY_MS, GHOST_LAG_MS, GHOST_OPACITY, HIT_FLASH_MIN_MS,
  GUARDED_HIT_RATIO, REACH_RATIO, SKILL_NAME_MS, type AttackFxLevel, type AttackTier, type FamilyMotion,
} from './attackFxConfig';

export type Side = 'player' | 'enemy';

export interface AttackCue {
  side: Side;
  tier: AttackTier;
  /** 상대가 막았다 (피격 연출을 줄인다) */
  guarded: boolean;
  /** 계열 공격 블록의 연출 종류 (GDD 19-2, 종족 설정 families[].fx). 없으면 몸통박치기 */
  fx?: AttackFxKind;
  /** 계열 기술 단계 1~3 (같은 계열 묶음 크기) */
  stage?: number;
  /** 화면에 크게 띄울 기술 이름 (계열 단계 기술·콤보·필살) */
  name?: string;
  /** 필살·콤보 이름 (더 크게) */
  ult?: boolean;
  /** 계열 id (효과 색: data-fam → 계열 색 토큰) */
  fam?: string;
  /** 단계 고유 모양·색 (C.63, 종족 설정 tiers[].fxLook): bha-afx--look-<id> */
  look?: string;
  /** 계열 몸동작 (GDD 118장 2, 종족 설정 families[].motion): 종이인형은 이 동작 묶음에서 고른다. 없으면 특수 동작 그대로 */
  motion?: FamilyMotionKind;
  /** 이 단계 종이인형 동작 고정 (GDD 181장, 종족 설정 tiers[].rigMotion): 있으면 그 동작 하나만 */
  rigMotion?: string;
  /** 블록 도트 이펙트·연결 동작 (이펙트 배치 도구 확정 값, 종족 설정 families[].pixelFx.stages[블록-1]) + 블록 속성(속성 색 시트) */
  pixel?: { stage: PixelFxStage; element: string };
  /** 즉발 (GDD 117장 3, 블록 공격): 타격(맞음 반응·자국)을 맨 앞에 보이고 몸 움직임은 뒤따른다. 재생 중인 기본 공격 연출을 기다리지 않는다 */
  instant?: boolean;
  /** 각본 마무리 체인 (GDD 146장): 즉발처럼 기다리지 않고 바로 시작하되, 동작을 처음부터(휘두르기 → 스킬 → 타격) 보인다 */
  windup?: boolean;
  /** 도트 연결 동작을 처음부터 (GDD 224장 2, 튜토리얼 각본 전투): 첫 동작의 '타격 프레임부터'(bodyFromHit)를 무시하고 휘두르기부터 보이며, 그 타격 프레임 = 첫 맞음 반응 = 피해. windup 이면 언제나 */
  bodyWindup?: boolean;
  /** 연출이 적에게 닿는 순간(마지막 타격) 한 번 부른다 — 각본 전투가 이때 피해를 넣는다 (GDD 146장) */
  onLand?: () => void;
  /** 엔진 피해가 들어가기까지 남은 ms(1배) (GDD 214장, C.357): 연출의 첫 맞음 반응을 이 시각에 맞춘다 — 동작의 타격 시각이 더 늦으면 앞을 건너뛰고, 더 이르면 기다렸다 시작. 없으면 옛 타이밍(즉발·동작 그대로) */
  hitInMs?: number;
}

/** 계열 연출 조회 결과: 종류만, 또는 종류 + 단계 고유 모양 (C.63) */
export type FamilyFxSpec = AttackFxKind | { fx: AttackFxKind; look?: string | null; motion?: FamilyMotionKind | null; rigMotion?: string | null; pixel?: PixelFxStage | null };

/** 단계의 세기 순위 (클수록 세다) */
export const tierRank = (t: AttackTier): number => ATTACK_TIER_ORDER.indexOf(t);

/** 체인 단계(1~) → 연출 단계. top = 체인 최대 단계 */
export function chainTier(chain: number, top: number): AttackTier {
  const c = Math.max(1, Math.min(chain, top, 3));
  return c >= 3 ? 'chain3' : c === 2 ? 'chain2' : 'chain1';
}

/**
 * 전투 사건 하나 → 연출. 연출이 필요 없는 사건(막기·회복·공허·상태 변화 …)은 null.
 * familyFx(계열 id) = 그 계열의 연출 종류 (종족 설정에서 읽는 함수, 없으면 몸통박치기). 자동 기본 공격은 늘 몸통박치기.
 */
export function attackCueOf(e: CombatEvent, top: number, familyFx?: (familyId: string, stage: number) => FamilyFxSpec | null | undefined, heavyPixel?: PixelFxStage | null): AttackCue | null {
  switch (e.kind) {
    case 'player-attack':
      return e.damage > 0 ? { side: 'player', tier: 'basic', guarded: false } : null;
    case 'block': {
      if (e.damage <= 0 || e.block === 'void') return null;
      if (e.block === 'combo') return { side: 'player', tier: 'special', guarded: false, ult: true, instant: true };
      const cue: AttackCue = { side: 'player', tier: e.matchup === 'strong' ? 'weak' : chainTier(e.chain, top), guarded: false, instant: true };
      const stage = familyStage(e.chain);
      if (e.family && e.role === 'attack') applyFamilySpec(cue, e.family, stage, familyFx?.(e.family, stage), e.element);
      return cue;
    }
    case 'enemy-attack':
      return e.damage > 0 || e.guarded ? { side: 'enemy', tier: 'basic', guarded: e.guarded } : null;
    case 'counter':
      return { side: 'enemy', tier: 'chain1', guarded: e.guarded };
    case 'heavy-hit':
      return heavyCue(e.guarded, heavyPixel);
    default:
      return null;
  }
}

/** 적 강공격 신호 (GDD 227장): heavyPixel(강적 = 빨간 세로)이 있으면 그 도트 연출 — 엔진 지연 표(hitDelaysOf)도 같은 신호로 잰다 */
export function heavyCue(guarded: boolean, heavyPixel?: PixelFxStage | null): AttackCue {
  return { side: 'enemy', tier: 'special', guarded, ...(heavyPixel ? { pixel: { stage: heavyPixel, element: ELITE_HEAVY_ELEMENT } } : {}) };
}

/** 계열 연출 설정을 신호에 얹는다 (종류·단계·계열·모양·몸동작·도트 연출) */
function applyFamilySpec(cue: AttackCue, family: string, stage: number, spec: FamilyFxSpec | null | undefined, element: string | null): void {
  const fx = typeof spec === 'string' ? spec : spec?.fx;
  if (!fx) return;
  cue.fx = fx;
  cue.stage = stage;
  cue.fam = family;
  if (typeof spec === 'object' && spec?.look) cue.look = spec.look;
  if (typeof spec === 'object' && spec?.motion) cue.motion = spec.motion;
  if (typeof spec === 'object' && spec?.rigMotion) cue.rigMotion = spec.rigMotion;
  if (typeof spec === 'object' && spec?.pixel) cue.pixel = { stage: spec.pixel, element: element ?? NORMAL_ELEMENT };
}

/** 동작 시각만 보는 재생기 조각 (hitDelaysOf 용 — 재생하지 않는다) */
export type AnimTiming = Pick<AnimPlayer, 'has' | 'peek'>;

/**
 * 이 연출에서 맞는 쪽이 처음 맞는 시각(ms, 1배, 시작부터) (GDD 214장, C.357) — run() 과 같은 규칙:
 * 도트 연출 연결 동작이면 그 계획의 첫 반응, 아니면 동작(peek 타격 시각 — 변형 중 가장 늦은 것) 또는 몸통박치기·발사 계획의 닿는 시각 + 도트 연출 첫 반응.
 * 엔진은 이 값만큼 피해를 미루고, run() 은 cue.hitInMs 로 다시 이 시각에 맞춘다
 */
/**
 * 도트 연결 동작을 처음부터 보일 때(GDD 224장 2) 첫 동작의 휘두르기 길이(ms, 1배): 첫 동작이 '타격 프레임부터'(bodyFromHit)면 그 동작의 타격 시각 ÷ 빠르기, 아니면 0.
 * 몸은 원래 시작 시각(body.at)보다 이만큼 먼저 시작해 도구가 정한 순간(= 첫 맞음 반응)에 타격 프레임이 온다
 */
export function bodySwingMs(body: PixelPlan['body'], anim: AnimTiming | null): number {
  const first = body?.chain[0];
  if (!body || !first || !body.bodyFromHit || !anim) return 0;
  const r = 'pose' in anim ? anim.peek('skill', { rigMotion: first.id }) : anim.peek(first.id as AnimAction);
  const rate = (first.rate > 0 ? first.rate : 1) * body.speed;
  return r ? r.hitAtMs / rate : 0;
}

/**
 * 연결 동작의 마지막 동작 타격 시각(ms, 1배, 몸 시작부터) (GDD 224장 2): 앞 동작 길이 합 + 마지막 동작 타격 — 각 동작 ÷ 빠르기.
 * fromStart 가 아니고 첫 동작이 '타격 프레임부터'면 첫 동작은 타격 뒤만 센다. 알 수 없으면 null
 */
export function bodyLastHitMs(body: PixelPlan['body'], anim: AnimTiming | null, fromStart: boolean): number | null {
  if (!body || !anim || !body.chain.length) return null;
  let t = 0;
  for (const [i, st] of body.chain.entries()) {
    const r = 'pose' in anim ? anim.peek('skill', { rigMotion: st.id }) : anim.peek(st.id as AnimAction);
    if (!r) return null;
    const k = (st.rate > 0 ? st.rate : 1) * body.speed;
    const skip = i === 0 && body.bodyFromHit && !fromStart ? r.hitAtMs : 0;
    if (i === body.chain.length - 1) return t + (r.hitAtMs - skip) / k;
    t += (r.durationMs - skip) / k;
  }
  return null;
}

/** 휘두르기가 연출 시작(0) 앞으로 넘치는 만큼(ms) — 이펙트·맞음 반응·피해를 이만큼 뒤로 민다 */
export const bodyLeadMs = (body: PixelPlan['body'], anim: AnimTiming | null): number => (body ? Math.max(0, bodySwingMs(body, anim) - body.at) : 0);

export function cueHitMs(cue: Pick<AttackCue, 'tier' | 'fx' | 'ult' | 'pixel' | 'motion' | 'rigMotion' | 'bodyWindup'>, anim: AnimTiming | null, slot: PixelBodySlot): number {
  const act = anim ? animActionOf(cue, (a) => anim.has(a)) : null;
  const pplan = cue.pixel && hasPixelStage(cue.pixel.stage, slot) ? pixelPlan(cue.pixel.stage, slot) : null;
  const chainBody = !!pplan?.body && !!anim;
  const level = ATTACK_FX[cue.tier];
  const motion = cue.fx ? familyMotion(cue.fx) : null;
  const clipHit = chainBody ? (cue.bodyWindup ? bodyLeadMs(pplan!.body, anim) : 0) : act && anim ? anim.peek(act, { motion: cue.motion, rigMotion: cue.rigMotion })?.hitAtMs ?? null : null;
  const base = clipHit !== null ? clipHit : motion?.move === 'cast' ? Math.max(60, level.backMs) + motion.travelMs : level.backMs + level.lungeMs;
  return base + (pplan ? pplan.reactAt[0] ?? 0 : 0);
}

/**
 * 엔진 타격 지연 표(초) (GDD 214장, C.357): 실제 동작 데이터로 — 내 평타·블록(계열:단계·콤보·해방)·적 기본 공격·강공격·반격.
 * 동작이 없는 쪽은 몸통박치기 계획의 닿는 시각. fallback 은 표에 없는 키의 값(balance 기본)
 */
export function hitDelaysOf(o: {
  player: AnimTiming | null;
  enemy: AnimTiming | null;
  slot: PixelBodySlot;
  familyIds: readonly string[];
  familyFx?: (familyId: string, stage: number) => FamilyFxSpec | null | undefined;
  fallback: HitDelayParams;
  /** 블록 도트 연결 동작을 처음부터 (GDD 224장 2 — 튜토리얼 각본 전투) */
  bodyWindup?: boolean;
  /** 적 강공격 도트 연출 (강적 = 빨간 세로, GDD 227장) */
  heavyPixel?: PixelFxStage | null;
}): HitDelayParams {
  const sec = (ms: number) => Math.round(ms) / 1000;
  const blockBy: Record<string, number> = { ...(o.fallback.blockBy ?? {}) };
  for (const id of o.familyIds) {
    for (let stage = 1; stage <= FAMILY_STAGE_FX.length; stage++) {
      const cue: AttackCue = { side: 'player', tier: chainTier(stage, FAMILY_STAGE_FX.length), guarded: false, instant: true, bodyWindup: o.bodyWindup };
      applyFamilySpec(cue, id, stage, o.familyFx?.(id, stage), null);
      blockBy[blockHitKey(id, stage)!] = sec(cueHitMs(cue, o.player, o.slot));
    }
  }
  blockBy.combo = sec(cueHitMs({ tier: 'special', ult: true }, o.player, o.slot));
  blockBy.liberation = sec(cueHitMs({ tier: 'chain1' }, o.player, o.slot));
  return {
    basic: sec(cueHitMs({ tier: 'basic' }, o.player, o.slot)),
    block: sec(cueHitMs({ tier: 'chain1' }, o.player, o.slot)),
    blockBy,
    enemy: sec(cueHitMs({ tier: 'basic' }, o.enemy, o.slot)),
    heavy: sec(cueHitMs(heavyCue(false, o.heavyPixel), o.enemy, o.slot)),
    counter: sec(cueHitMs({ tier: 'chain1' }, o.enemy, o.slot)),
  };
}

/** 체인 수 → 계열 연출 단계 (1~3) */
export function familyStage(chain: number): number {
  return Math.max(1, Math.min(FAMILY_STAGE_FX.length, Math.floor(chain) || 1));
}

export interface FamilyHit {
  /** 연출 시작부터 이 타격까지(ms, 1배 기준) */
  atMs: number;
  /** 효과 크기 배율 */
  scale: number;
}

/**
 * 계열 공격의 타격 시각표 (순수, GDD 19-2). firstMs = 첫 타격 시각(돌진이 닿는 때 / 투사체가 닿는 때).
 * 1단계 1회, 2단계 연타 3회, 3단계 연타 뒤 마지막 타격이 크게.
 */
export function familyHits(stage: number, firstMs: number): FamilyHit[] {
  const st = FAMILY_STAGE_FX[familyStage(stage) - 1]!;
  return Array.from({ length: st.hits }, (_, i) => ({
    atMs: firstMs + st.gapMs * i,
    scale: i === st.hits - 1 ? st.scale : Math.min(st.scale, 1.1),
  }));
}

/**
 * 연출이 적에게 닿는 순간(ms, 1배, 시작부터) (GDD 146장): 계열 공격이면 마지막 타격, 아니면 첫 타격(hitAtMs).
 * 각본 마무리 체인은 이 순간에 피해가 들어간다 — 언제나 hitAtMs(동작이 닿는 때) 이상이다
 */
export function landAtMs(hitAtMs: number, stage: number | null): number {
  if (stage === null) return hitAtMs;
  const hits = familyHits(stage, hitAtMs);
  return hits[hits.length - 1]!.atMs;
}

/** 이 단계에서 화면을 흔드는가 */
export const familyShakes = (stage: number): boolean => FAMILY_STAGE_FX[familyStage(stage) - 1]!.shake;

/** 연출 종류의 몸 움직임 (데이터 FAMILY_MOTION) */
export const familyMotion = (fx: AttackFxKind): FamilyMotion => FAMILY_MOTION[fx];

/** 제자리 발사(cast)의 몸 반동: 뒤로 살짝 젖혔다가 앞으로 튕기고 제자리. 전체 길이 = travelMs 와 맞춘다 */
export function castPlan(level: AttackFxLevel, dir: 1 | -1, travelMs: number): LungePlan {
  const wind = Math.max(60, level.backMs);
  const total = wind + Math.max(travelMs, 120) + level.returnMs;
  const at = (x: number, sc: number): string => `translateX(${(x * dir).toFixed(1)}px) scale(${sc})`;
  return {
    durationMs: total,
    hitAtMs: wind + travelMs,
    ghosts: 0,
    keyframes: [
      { offset: 0, transform: at(0, 1), easing: 'ease-out' },
      { offset: wind / total, transform: at(-level.backPx * 0.6, 1.03), easing: 'cubic-bezier(.2,.9,.3,1.4)' },
      { offset: (wind + 70) / total, transform: at(level.backPx * 0.5, 1), easing: 'ease-out' },
      { offset: 1, transform: at(0, 1) },
    ],
  };
}

/** 배속 → 재생 속도 (1~4배) */
export function fxRate(speed: number): number {
  return Number.isFinite(speed) ? Math.max(FX_RATE_MIN, Math.min(FX_RATE_MAX, speed)) : FX_RATE_MIN;
}

/** 연출 방식: full = 몸통박치기, flash = 돌진 없이 번쩍임만(모션 줄이기·화면 흔들림 끔) */
export type FxMode = 'full' | 'flash';

export function fxModeOf(reducedMotion: boolean, shakeOn: boolean): FxMode {
  return reducedMotion || !shakeOn ? 'flash' : 'full';
}

/**
 * 연출 큐: 한 번에 하나만 재생하고 대기는 최대 1개. 재생 중에 새 연출이 오면 대기 자리에 둔다
 * (이미 대기 중인 것이 더 세면 새 것을 버리고, 같거나 약하면 새 것으로 바꾼다 — 가장 최근의 같은 세기를 보여 주려고).
 * 즉발 연출(블록 공격, GDD 117장 3)은 즉발 아닌 것(기본 공격)이 재생 중이면 기다리지 않고 바로 시작한다 — 앞 것의 done 은 무시된다.
 */
export class AttackQueue {
  private running: AttackCue | null = null;
  private waiting: AttackCue | null = null;

  /** run(cue, done): cue 를 재생하고 끝나면 done() 을 부른다. done 은 여러 번 불러도 한 번만 친다 */
  constructor(private readonly run: (cue: AttackCue, done: () => void) => void) {}

  get isRunning(): boolean {
    return this.running !== null;
  }

  get pending(): AttackCue | null {
    return this.waiting;
  }

  /** 결과: started 바로 재생 / queued 대기 / replaced 대기 중이던 것을 바꿈 / dropped 새 것을 버림 */
  push(cue: AttackCue): 'started' | 'queued' | 'replaced' | 'dropped' {
    // 각본 마무리 체인(windup)은 무엇이 재생 중이든 바로 (GDD 146장 — 닿는 순간 피해가 들어가므로 기다리면 안 된다)
    if (!this.running || cue.windup || (cue.instant && !this.running.instant)) {
      this.start(cue);
      return 'started';
    }
    if (!this.waiting) {
      this.waiting = cue;
      return 'queued';
    }
    if (tierRank(cue.tier) >= tierRank(this.waiting.tier)) {
      this.waiting = cue;
      return 'replaced';
    }
    return 'dropped';
  }

  /** 대기 중인 것을 버린다 (전투 끝·화면 닫힘) */
  clear(): void {
    this.waiting = null;
  }

  /** 지금 재생 중인 연출 번호 (끼어들기 뒤 앞 것의 done 을 거르려고) */
  private gen = 0;

  private start(cue: AttackCue): void {
    this.running = cue;
    const my = ++this.gen;
    let finished = false;
    this.run(cue, () => {
      if (finished || my !== this.gen) return;
      finished = true;
      this.running = null;
      const next = this.waiting;
      this.waiting = null;
      if (next) this.start(next);
    });
  }
}

/** 마무리 체인 착탄 안전장치 (GDD 224장 2): 마지막 동작 타격 예상 시각 + 이만큼(ms) 지나도 onHit 이 안 오면 그때 넣는다 */
const FINAL_HIT_SAFETY_MS = 400;

// ───────────────────────── 애니메이션 계획 (순수) ─────────────────────────

export interface LungePlan {
  keyframes: Keyframe[];
  /** 기본 속도(1배)에서의 전체 길이(ms) */
  durationMs: number;
  /** 부딪히는 시각(ms, 1배 기준) */
  hitAtMs: number;
  ghosts: number;
  /** 시작 전에 기다리는 ms (GDD 214장: 엔진 착탄이 계획의 닿는 시각보다 늦을 때 그만큼) — durationMs·hitAtMs 에 이미 더해져 있다. 음수 = 그만큼 건너뛰고 시작(224장 3) */
  leadMs?: number;
}

/** 계획의 닿는 시각을 hitInMs 에 맞춘다 (GDD 214장): 더 늦게 닿아야 하면 그만큼 기다렸다 시작, 더 일찍이면 앞을 건너뛴다(224장 3) */
export function alignPlan(plan: LungePlan, hitInMs: number | undefined): LungePlan {
  if (hitInMs === undefined || hitInMs === plan.hitAtMs) return plan;
  // 더 일찍 맞아야 하면 앞을 건너뛴다 (GDD 224장 3, C.367 — 동작 그림 hitInMs 와 같은 규칙): leadMs 음수 = 그만큼 진행된 채 시작. 안 그러면 피해가 닿기 전에 뜬다
  if (hitInMs < plan.hitAtMs) {
    const skip = plan.hitAtMs - Math.max(0, hitInMs);
    return { ...plan, durationMs: plan.durationMs - skip, hitAtMs: plan.hitAtMs - skip, leadMs: (plan.leadMs ?? 0) - skip };
  }
  const lead = hitInMs - plan.hitAtMs;
  return { ...plan, durationMs: plan.durationMs + lead, hitAtMs: hitInMs, leadMs: (plan.leadMs ?? 0) + lead };
}

/**
 * 몸통박치기 키프레임. dir = +1(오른쪽으로 돌진) / -1(왼쪽), reach = 돌진 거리(px).
 * 살짝 물러남(예비) → 튀어나가 부딪힘 → 잠깐 머묾 → 제자리 복귀.
 */
export function lungePlan(level: AttackFxLevel, dir: 1 | -1, reach: number): LungePlan {
  const total = level.backMs + level.lungeMs + level.holdMs + level.returnMs;
  const o1 = level.backMs / total;
  const o2 = (level.backMs + level.lungeMs) / total;
  const o3 = (level.backMs + level.lungeMs + level.holdMs) / total;
  const tilt = level.tiltDeg;
  const back = level.backPx;
  const at = (x: number, scale: number, deg: number): string => `translateX(${(x * dir).toFixed(1)}px) rotate(${(deg * dir).toFixed(1)}deg) scale(${scale})`;
  const keyframes: Keyframe[] = [
    { offset: 0, transform: at(0, 1, 0), easing: 'ease-out' },
    { offset: o1, transform: at(-back, 1, -tilt), easing: 'cubic-bezier(.55,0,1,.45)' },
    { offset: o2, transform: at(reach, level.scale, tilt), easing: 'linear' },
    { offset: o3, transform: at(reach, level.scale, tilt), easing: 'ease-out' },
    { offset: 1, transform: at(0, 1, 0) },
  ];
  return { keyframes, durationMs: total, hitAtMs: level.backMs + level.lungeMs, ghosts: Math.min(2, Math.max(0, level.ghosts)) };
}

/** 돌진 거리: 두 그림 사이 간격(px)의 일부. 간격이 없으면 0 */
export function reachOf(gapPx: number): number {
  return Math.max(0, gapPx) * REACH_RATIO;
}

/** el 의 offsetLeft 를 other 와 같이 쓰는 가장 가까운 offsetParent 까지 더한 값 (변형(transform) 영향 없는 레이아웃 좌표) */
export function leftInCommon(el: HTMLElement, other: HTMLElement): number {
  const chain = new Set<Element>();
  for (let e: Element | null = other.offsetParent; e; e = (e as HTMLElement).offsetParent) chain.add(e);
  let x = 0;
  for (let e: HTMLElement | null = el; e; e = e.offsetParent as HTMLElement | null) {
    x += e.offsetLeft;
    if (e.offsetParent && chain.has(e.offsetParent)) break;
  }
  return x;
}

export interface HitPlan {
  /** 뒤로 튕김 (transform) */
  keyframes: Keyframe[];
  /** 흰 실루엣 깜빡임 (filter) */
  blink: Keyframe[];
  durationMs: number;
}

/**
 * 기본 피격 연출 (GDD 26-4c, v5.19 — hit 애니가 없는 쪽): **흰색 실루엣 깜빡임 2번 + 뒤로 한 번 튕김**.
 * 깜빡임(blink)은 필터, 튕김(keyframes)은 transform 이라 따로 재생한다(깜빡임은 뚝뚝 끊기고 튕김은 부드럽게).
 * 막으면 약하게(깜빡임 1번, 튕김 40%), flash 모드(모션 줄이기·흔들림 끔)는 튕김 없이 깜빡임만.
 */
export function hitPlan(level: AttackFxLevel, dir: 1 | -1, mode: FxMode, guarded: boolean): HitPlan {
  const k = guarded ? GUARDED_HIT_RATIO : 1;
  const push = mode === 'full' ? level.knockPx * k : 0;
  const at = (x: number): string => `translateX(${(x * dir).toFixed(1)}px)`;
  const NEUTRAL = 'brightness(1) invert(0)';
  const WHITE = 'brightness(0) invert(1)';
  const STEP = 'steps(1, end)';
  const blink: Keyframe[] = guarded
    ? [
      { offset: 0, filter: WHITE, easing: STEP },
      { offset: 0.3, filter: NEUTRAL },
      { offset: 1, filter: NEUTRAL },
    ]
    : [
      { offset: 0, filter: WHITE, easing: STEP },
      { offset: 0.2, filter: NEUTRAL, easing: STEP },
      { offset: 0.35, filter: WHITE, easing: STEP },
      { offset: 0.55, filter: NEUTRAL },
      { offset: 1, filter: NEUTRAL },
    ];
  return {
    durationMs: Math.max(level.hitMs, HIT_FLASH_MIN_MS),
    keyframes: [
      { offset: 0, transform: at(0), easing: 'ease-out' },
      { offset: 0.25, transform: at(push), easing: 'ease-in-out' },
      { offset: 1, transform: at(0) },
    ],
    blink,
  };
}

/** 잔상 i(0부터)의 투명도 */
export const ghostOpacity = (i: number): number => GHOST_OPACITY[Math.min(i, GHOST_OPACITY.length - 1)] ?? 0.2;

// ───────────────────────── DOM 구동 ─────────────────────────

export interface AttackActor {
  /** 돌진하는 쪽 바깥 요소 */
  root: HTMLElement;
  /** 피격 연출을 받는 안쪽 요소 (잔상의 원본이기도 하다) */
  body: HTMLElement;
  /** 돌진 방향: 상대가 오른쪽이면 +1 */
  dir: 1 | -1;
  /** 프레임 애니 재생기 (GDD 26장). 있는 동작만 애니로 돌고, 없는 동작은 아래 기존 연출(몸통박치기·흔들림)을 쓴다 */
  anim?: AnimPlayer | null;
}

/** 맞았을 때 '맞음' 동작을 재생해도 되는 지금 동작: 정지·대기·이동·맞음 중일 때만 (GDD 117장 2 — 공격·특수 모션은 끊지 않는다) */
export function canPlayHitAnim(playing: AnimAction | null): boolean {
  return playing === null || playing === 'idle' || playing === 'move' || playing === 'hit';
}

/** 이 연출에 쓸 프레임 동작: 필살·콤보·계열 공격·강공격은 skill, 그 밖은 attack. 그 동작이 없으면 null(= 기존 연출. 다른 동작으로 대신하지 않는다) */
export function animActionOf(cue: Pick<AttackCue, 'ult' | 'fx' | 'tier'>, has: (a: 'attack' | 'skill') => boolean): 'attack' | 'skill' | null {
  const a = cue.ult || cue.fx || cue.tier === 'special' ? 'skill' : 'attack';
  return has(a) ? a : null;
}

export interface AttackFxDriver {
  /** 사건을 연출로 바꿔 큐에 넣는다. 연출이 필요 없는 사건이면 false */
  react(e: CombatEvent, extra?: Pick<AttackCue, 'windup' | 'onLand' | 'hitInMs' | 'bodyWindup'>): boolean;
  /** 배속(1~4) 바꾸기: 재생 중인 연출도 따라간다 */
  setSpeed(speed: number): void;
  /** 일시정지/재개: 재생 중인 연출을 멈췄다 이어간다 */
  setPaused(on: boolean): void;
  /** 방식 바꾸기(설정·모션 줄이기) */
  setMode(mode: FxMode): void;
  /** 재생 중인 연출을 모두 지우고 큐를 비운다 */
  destroy(): void;
}

export interface AttackFxOptions {
  player: AttackActor;
  enemy: AttackActor;
  top: number;
  mode: FxMode;
  /** 길이 단위 배율 (화면 배율). 기본 1 */
  unit?: () => number;
  /** 돌진 거리 상한(px, 레이아웃 기준). 없으면 간격 × REACH_RATIO 그대로 (적에게 붙는다) */
  maxReach?: () => number;
  /** 계열 효과(자국·투사체·광선)와 기술 이름을 그리는 레이어 (장면 위, 조작을 막지 않는다). 없으면 효과 없이 움직임만 */
  layer?: HTMLElement;
  /** 계열 id → 연출 종류 (종족 설정 families[].fx) */
  familyFx?: (familyId: string, stage: number) => FamilyFxSpec | null | undefined;
  /** 적 강공격 도트 연출 (강적 = 빨간 세로, GDD 227장). 없으면 옛 돌진 */
  heavyPixel?: PixelFxStage | null;
  /** 사건 → 크게 띄울 기술 이름 (없으면 null) */
  nameOf?: (e: CombatEvent) => { name: string; ult?: boolean } | null;
  /** 이름 → 이미 받아 둔 도트 시트 (pixelFx.ts readyPixelFx). 없으면 그 이펙트는 건너뛴다 */
  pixelSheet?: (name: string) => PixelFxSheet | null;
  /** 치는 쪽 몸동작 칸: 종이인형 남·여 / 프레임 그림 (블록 연결 동작을 고른다) */
  bodySlot?: () => PixelBodySlot;
  /** 3단계 계열 공격의 화면 흔들림 (설정에서 흔들림을 끄면 호출하는 쪽이 무시한다) */
  shake?: () => void;
  /** 맞는 쪽 반응이 실제로 일어난 순간(타격 프레임) 알림 — 테스트 모드 실측용(GDD 224장, C.367). 평소 없음 */
  onHitFrame?: (side: Side, guarded: boolean, tier: string) => void;
  /** 치는 쪽 동작이 타격 프레임에 닿은 순간 알림 — 테스트 모드 실측용(GDD 224장, C.367). 평소 없음 */
  onSwingFrame?: (side: Side, tier: string) => void;
}

const SVG_OPEN = '<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">';
/** 효과 모양 (그림 파일 없이 SVG, 색은 currentColor = 계열 색) */
const MARK_SVG: Record<AttackFxKind, string> = {
  claw: `${SVG_OPEN}<g fill="none" stroke-linecap="round"><g stroke="currentColor" stroke-width="9"><path d="M22 8 L58 92"/><path d="M40 4 L76 88"/><path d="M58 8 L90 80"/></g><g class="afx-core-s" stroke-width="2.5"><path d="M22 8 L58 92"/><path d="M40 4 L76 88"/><path d="M58 8 L90 80"/></g></g></svg>`,
  bite: '',
  shot: `${SVG_OPEN}<circle cx="50" cy="50" r="30" fill="none" stroke="currentColor" stroke-width="10"/><circle cx="50" cy="50" r="14" class="afx-core"/></svg>`,
  slash: `${SVG_OPEN}<path d="M6 80 Q40 -6 96 26 Q46 12 6 80 Z" fill="currentColor"/><path d="M14 72 Q44 6 90 28" fill="none" class="afx-core-s" stroke-width="2.5" stroke-linecap="round"/></svg>`,
  impact: `${SVG_OPEN}<circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" stroke-width="9"/><g class="afx-core-s" stroke-width="4" stroke-linecap="round"><path d="M50 2 L50 18"/><path d="M50 82 L50 98"/><path d="M2 50 L18 50"/><path d="M82 50 L98 50"/><path d="M16 16 L27 27"/><path d="M73 73 L84 84"/><path d="M84 16 L73 27"/><path d="M27 73 L16 84"/></g></svg>`,
  beam: `${SVG_OPEN}<circle cx="50" cy="50" r="42" fill="currentColor" opacity=".45"/><circle cx="50" cy="50" r="24" class="afx-core"/></svg>`,
};
const JAW_SVG = `${SVG_OPEN}<path d="M2 0 H98 V34 L88 34 L82 70 L74 34 L64 34 L58 78 L50 34 L42 34 L36 78 L28 34 L18 34 L12 70 L6 34 L2 34 Z" fill="currentColor"/></svg>`;
const ORB_SVG = `${SVG_OPEN}<circle cx="50" cy="50" r="46" fill="currentColor" opacity=".55"/><circle cx="50" cy="50" r="26" class="afx-core"/></svg>`;

/** Web Animations 를 지원하지 않는 환경(구형 브라우저·테스트)에서는 아무것도 하지 않는다 */
const canAnimate = (n: HTMLElement): boolean => typeof n.animate === 'function';

/** 요소의 레이아웃 위치(offsetLeft/Top 을 offsetParent 끝까지 더한 값)와 그 끝(root). 변환(회전·배율·연출 이동)은 들어가지 않는다 */
export function offsetOrigin(n: HTMLElement): { x: number; y: number; root: Element | null } | null {
  if (typeof n.offsetLeft !== 'number') return null;
  let x = 0;
  let y = 0;
  let cur: HTMLElement | null = n;
  let root: Element | null = n;
  while (cur) {
    x += cur.offsetLeft;
    y += cur.offsetTop;
    root = cur;
    cur = cur.offsetParent as HTMLElement | null;
  }
  return { x, y, root };
}

export function attackFx(opts: AttackFxOptions): AttackFxDriver {
  const live = new Set<Animation>();
  let naming = 0;
  let rate = 1;
  let paused = false;
  let mode = opts.mode;
  const unit = () => opts.unit?.() ?? 1;

  const track = (a: Animation): Animation => {
    live.add(a);
    a.playbackRate = rate;
    if (paused) a.pause();
    // 시작 시각 = 이 프레임 시각 (GDD 224장 3, C.367): 그냥 두면 다음 프레임부터 흘러(대기 시작) 타격·맞음 반응이 엔진 착탄(같은 프레임 시계)보다 1~2 프레임 늦다
    else if (typeof document !== 'undefined' && document.timeline?.currentTime != null) a.startTime = document.timeline.currentTime;
    const drop = () => live.delete(a);
    a.addEventListener('finish', drop);
    a.addEventListener('cancel', drop);
    return a;
  };

  /** 서로 사이 간격(px, 레이아웃 기준 = 화면 배율의 영향을 받지 않는 좌표).
   *  나·적이 서로 다른 틀(유닛 칸) 안에 있어도 맞게, 둘의 공통 offsetParent 까지 offsetLeft 를 더해 잰다 (C.162 — v2 화면에서 간격이 0 으로 재져 돌진이 사라졌다) */
  const gapOf = (from: AttackActor, to: AttackActor): number => {
    const a = from.root;
    const b = to.root;
    const dx = Math.abs((leftInCommon(b, a) + b.offsetWidth / 2) - (leftInCommon(a, b) + a.offsetWidth / 2));
    return Math.max(0, dx - (a.offsetWidth + b.offsetWidth) / 2 + Math.min(a.offsetWidth, b.offsetWidth) * 0.5);
  };

  const hit = (target: AttackActor, level: AttackFxLevel, guarded: boolean, delayMs: number): void => {
    // 맞는 순간의 동작을 보고 정한다(그 사이 공격을 시작했을 수 있다)
    if (delayMs > 0) return void after(target.body, delayMs, () => hit(target, level, guarded, 0));
    if (opts.onHitFrame) opts.onHitFrame(target === opts.player ? 'player' : 'enemy', guarded, (Object.keys(ATTACK_FX) as AttackTier[]).find((k) => ATTACK_FX[k] === level) ?? '?');
    // 맞음 애니가 있고 대기·이동 중이면 흔들림 대신 그 애니 (막았을 땐 기존 막기 표시).
    // 공격·특수 모션 중이면 끊지 않고 깜빡임·작은 흔들림만 (GDD 117장 2). 맞음 애니가 없으면 아래 기존 흔들림
    const hitAnim = target.anim;
    const midSwing = !!hitAnim && !canPlayHitAnim(hitAnim.playing);
    if (!guarded && hitAnim?.has('hit') && !midSwing) {
      hitAnim.play('hit');
      return;
    }
    const plan = hitPlan(scaled(level, unit()), (target.dir * -1) as 1 | -1, mode, guarded || midSwing);
    // composite add: 맞는 쪽 원래 filter(적 윤곽 빛 drop-shadow)를 지우지 않고 흰 깜빡임을 덧붙인다 (지우면 검은 실루엣이 배경에 묻힌다)
    const opt: KeyframeAnimationOptions = { duration: plan.durationMs, easing: 'linear', fill: 'none', composite: 'add' };
    track(target.body.animate(plan.blink, opt));
    if (plan.keyframes.some((f) => f.transform !== plan.keyframes[0]!.transform)) track(target.body.animate(plan.keyframes, opt));
  };

  /** ms(1배 기준) 뒤에 fn: 연출과 같이 배속·일시정지를 따른다 (빈 애니메이션의 끝을 기다린다) */
  const after = (host: HTMLElement, ms: number, fn: () => void): void => {
    if (!canAnimate(host)) return void window.setTimeout(fn, ms);
    const a = track(host.animate([{}, {}], { duration: Math.max(1, ms) }));
    let fired = false;
    const go = () => {
      if (fired) return;
      fired = true;
      fn();
    };
    a.addEventListener('finish', go);
    a.addEventListener('cancel', go);
  };

  /** 레이어 안 좌표의 요소 중심·크기 (화면 배율·회전과 무관한 레이아웃 좌표).
   *  C.63(GDD 28장 11번): 화면 좌표(getBoundingClientRect)는 세로 회전 출력(16-6, 기기 90° 회전)에서 "적 쪽"이 화면 아래가 되어
   *  빔·투사체가 아래로 나갔다 → offset 체인(레이아웃 좌표, 변환 없음)으로 잰다. offset 이 없는 요소(SVG 등)만 예전 방식 */
  const boxIn = (layer: HTMLElement, n: HTMLElement): { x: number; y: number; w: number; h: number } => {
    const a = offsetOrigin(n);
    const l = offsetOrigin(layer);
    if (a && l && a.root === l.root) return { x: a.x - l.x + n.offsetWidth / 2, y: a.y - l.y + n.offsetHeight / 2, w: n.offsetWidth, h: n.offsetHeight };
    const L = layer.getBoundingClientRect();
    const r = n.getBoundingClientRect();
    const k = layer.offsetWidth > 0 && L.width > 0 ? layer.offsetWidth / L.width : 1;
    return { x: (r.left - L.left + r.width / 2) * k, y: (r.top - L.top + r.height / 2) * k, w: r.width * k, h: r.height * k };
  };

  /** 지금 놓는 효과의 공격 쪽 (계열 자국·투사체를 놓기 직전에 정한다) */
  let spawnSide: Side = 'player';
  /** 지금 놓는 효과의 단계 고유 모양 (C.63) */
  let spawnLook: string | null = null;

  /** 효과 하나를 레이어에 놓는다: kind 모양, (x,y) 중심, size 한 변. 끝나면 지운다 */
  const spawn = (layer: HTMLElement, cls: string, html: string, x: number, y: number, w: number, h: number, frames: Keyframe[], ms: number, delay: number, color?: string): HTMLElement => {
    const n = document.createElement('div');
    n.className = `bha-afx ${cls}${spawnLook ? ` bha-afx--look-${spawnLook}` : ''}`;
    n.setAttribute('aria-hidden', 'true');
    if (color) n.dataset.fam = color;
    n.dataset.side = spawnSide; // 공격 이펙트 색 꾸밈은 내 쪽(player)만 (GDD 25-9)
    n.innerHTML = html;
    // 시작 전(delay)에는 보이지 않게 기본 투명, 애니메이션이 시작돼야 나타난다
    n.style.cssText = `left:${(x - w / 2).toFixed(1)}px;top:${(y - h / 2).toFixed(1)}px;width:${w.toFixed(1)}px;height:${h.toFixed(1)}px;opacity:0`;
    layer.append(n);
    const a = track(n.animate(frames, { duration: ms, delay, easing: 'linear', fill: 'forwards' }));
    const rm = () => n.remove();
    a.addEventListener('finish', rm);
    a.addEventListener('cancel', rm);
    window.setTimeout(rm, (ms + delay) / rate + FX_SAFETY_MS * 2);
    return n;
  };

  /** 계열 타격 자국 하나 (종류별 모양·움직임). dir = 공격 방향 */
  const mark = (layer: HTMLElement, kind: AttackFxKind, fam: string | undefined, at: { x: number; y: number; h: number }, scale: number, delay: number, dir: 1 | -1, ms: number, i: number): void => {
    const size = at.h * 0.62 * scale;
    const flip = dir < 0 ? -1 : 1;
    if (kind === 'bite') {
      // 위아래 턱이 닫힌다
      const w = size * 1.1;
      const h = size * 0.5;
      const close = (from: number): Keyframe[] => [
        { offset: 0, opacity: 0, transform: `translateY(${from}%) scaleY(${from < 0 ? 1 : -1})` },
        { offset: 0.15, opacity: 1, transform: `translateY(${from}%) scaleY(${from < 0 ? 1 : -1})`, easing: 'cubic-bezier(.6,0,1,.6)' },
        { offset: 0.45, opacity: 1, transform: `translateY(${from < 0 ? -48 : 48}%) scaleY(${from < 0 ? 1 : -1})` },
        { offset: 1, opacity: 0, transform: `translateY(${from < 0 ? -48 : 48}%) scaleY(${from < 0 ? 1 : -1})` },
      ];
      spawn(layer, 'bha-afx--jaw', JAW_SVG, at.x, at.y, w, h, close(-150), ms, delay, fam);
      spawn(layer, 'bha-afx--jaw', JAW_SVG, at.x, at.y, w, h, close(150), ms, delay, fam);
      return;
    }
    const rot = kind === 'claw' ? (i % 2 ? -14 : 8) * flip : kind === 'slash' ? (i % 2 ? 160 : 0) : 0;
    const frames: Keyframe[] =
      kind === 'claw' ? [
        { offset: 0, opacity: 0, transform: `scaleX(${flip}) rotate(${rot}deg) scale(.4)`, clipPath: 'inset(0 0 100% 0)' },
        { offset: 0.35, opacity: 1, transform: `scaleX(${flip}) rotate(${rot}deg) scale(1)`, clipPath: 'inset(0 0 0% 0)' },
        { offset: 1, opacity: 0, transform: `scaleX(${flip}) rotate(${rot}deg) scale(1.05)`, clipPath: 'inset(0 0 0% 0)' },
      ]
      : kind === 'slash' ? [
        { offset: 0, opacity: 0, transform: `scaleX(${flip}) rotate(${rot - 70}deg) scale(.8)` },
        { offset: 0.3, opacity: 1, transform: `scaleX(${flip}) rotate(${rot}deg) scale(1)` },
        { offset: 1, opacity: 0, transform: `scaleX(${flip}) rotate(${rot + 20}deg) scale(1.08)` },
      ]
      : kind === 'impact' ? [
        { offset: 0, opacity: 1, transform: 'scale(.2)' },
        { offset: 0.5, opacity: 0.9, transform: 'scale(1)' },
        { offset: 1, opacity: 0, transform: 'scale(1.45)' },
      ]
      : [ // shot·beam 착탄: 터지는 빛
        { offset: 0, opacity: 1, transform: 'scale(.3)' },
        { offset: 0.4, opacity: 1, transform: 'scale(1)' },
        { offset: 1, opacity: 0, transform: 'scale(1.35)' },
      ];
    spawn(layer, `bha-afx--${kind}`, MARK_SVG[kind], at.x, at.y, size, size, frames, ms, delay, fam);
  };

  /** 투사체(탄)·광선(귀): 쏘는 쪽에서 맞는 쪽까지 */
  const missile = (layer: HTMLElement, kind: AttackFxKind, fam: string | undefined, from: { x: number; y: number; h: number }, to: { x: number; y: number; h: number }, delay: number, travel: number, scale: number): void => {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    if (kind === 'beam') {
      // 빛 구체를 모았다가 광선이 뻗는다
      const orb = from.h * 0.32 * scale;
      spawn(layer, 'bha-afx--orb', ORB_SVG, from.x, from.y, orb, orb, [
        { offset: 0, opacity: 0, transform: 'scale(.2)' },
        { offset: 0.6, opacity: 1, transform: 'scale(1)' },
        { offset: 1, opacity: 0, transform: 'scale(.6)' },
      ], travel + 120, delay, fam);
      const len = Math.hypot(dx, dy);
      const thick = Math.max(6, from.h * 0.1 * scale);
      // 왼쪽으로 쏠 때(dx < 0)는 오른쪽 끝(쏘는 쪽)을 기준점으로, 뒤집힌 방향의 각도만큼만 돌린다 (C.216 — 180° 돌리면 광선이 반대쪽으로 뻗었다)
      const ang = (Math.atan2(dx >= 0 ? dy : -dy, dx >= 0 ? dx : -dx) * 180) / Math.PI;
      const b = spawn(layer, 'bha-afx--ray', '', from.x + dx / 2, from.y + dy / 2, len, thick, [
        { offset: 0, opacity: 0, transform: `rotate(${ang}deg) scaleX(0)` },
        { offset: 0.25, opacity: 1, transform: `rotate(${ang}deg) scaleX(1)` },
        { offset: 0.7, opacity: 1, transform: `rotate(${ang}deg) scaleX(1) scaleY(.6)` },
        { offset: 1, opacity: 0, transform: `rotate(${ang}deg) scaleX(1) scaleY(.2)` },
      ], travel + 260, delay + travel * 0.5, fam);
      b.style.transformOrigin = dx >= 0 ? '0% 50%' : '100% 50%';
      return;
    }
    // 탄: 구체가 날아간다
    const orb = from.h * 0.26 * scale;
    spawn(layer, 'bha-afx--orb', ORB_SVG, from.x, from.y, orb, orb, [
      { offset: 0, opacity: 0, transform: 'translate(0,0) scale(.4)' },
      { offset: 0.12, opacity: 1, transform: 'translate(0,0) scale(1)' },
      { offset: 1, opacity: 1, transform: `translate(${dx.toFixed(1)}px,${dy.toFixed(1)}px) scale(1.1)` },
    ], travel, delay, fam);
  };

  /** 기술 이름을 장면 위쪽 가운데에 크게 (flash 모드면 움직임 없이 나타났다 사라짐) */
  const showName = (layer: HTMLElement, cue: AttackCue): void => {
    const n = document.createElement('div');
    n.className = `bha-afx-name${cue.ult ? ' is-ult' : ''}${(cue.stage ?? 1) >= 3 ? ' is-big' : ''}`;
    n.setAttribute('aria-hidden', 'true');
    n.textContent = cue.name ?? '';
    n.dataset.side = cue.side;
    layer.append(n);
    const frames: Keyframe[] = mode === 'flash'
      ? [{ offset: 0, opacity: 0 }, { offset: 0.1, opacity: 1 }, { offset: 0.8, opacity: 1 }, { offset: 1, opacity: 0 }]
      : [
        { offset: 0, opacity: 0, transform: 'translate(-50%, -50%) scale(1.6)' },
        { offset: 0.12, opacity: 1, transform: 'translate(-50%, -50%) scale(1)', easing: 'ease-out' },
        { offset: 0.8, opacity: 1, transform: 'translate(-50%, -50%) scale(1)' },
        { offset: 1, opacity: 0, transform: 'translate(-50%, calc(-50% - 8px)) scale(.96)' },
      ];
    // 이름이 뜬 동안 장면 가운데 사건 로그(같은 내용)는 감춘다
    const host = layer.parentElement;
    naming++;
    host?.classList.add('has-afx-name');
    const a = track(n.animate(frames, { duration: SKILL_NAME_MS, easing: 'linear', fill: 'both' }));
    let gone = false;
    const rm = () => {
      if (gone) return;
      gone = true;
      n.remove();
      if (--naming <= 0) host?.classList.remove('has-afx-name');
    };
    a.addEventListener('finish', rm);
    a.addEventListener('cancel', rm);
    window.setTimeout(rm, SKILL_NAME_MS / rate + FX_SAFETY_MS * 2);
  };

  /** 도트 이펙트 한 조각 (GDD 이펙트 장): 바깥 상자가 자리·뒤집기·각도(날아가면 길을 따라), 안쪽이 시트 장면. 도구와 같은 식. 끝나는 시각(ms) */
  const pixelInst = (layer: HTMLElement, element: string, inst: PixelInst, from: AttackActor, to: AttackActor, base: number): number => {
    const L = inst.L;
    const s = opts.pixelSheet?.(fxSheetName(L.fx, L.color === 'element' ? element : null));
    if (!s) return 0;
    const sc = L.scale > 0 ? L.scale : 1;
    const w = s.frame[0] * sc;
    const h = s.frame[1] * sc;
    const wrap = document.createElement('div');
    wrap.className = 'bha-pxfx-wrap';
    wrap.setAttribute('aria-hidden', 'true');
    wrap.dataset.side = spawnSide;
    wrap.dataset.fx = s.name;
    wrap.style.cssText = `position:absolute;left:0;top:0;width:${w}px;height:${h}px;pointer-events:none;z-index:${(L.z ?? 3) * 10 + inst.layer}${L.opacity !== undefined && L.opacity < 1 ? `;opacity:${L.opacity}` : ''}`;
    const el = mountPixelFx(wrap, s, { cx: w / 2, cy: h / 2, scale: sc });
    layer.append(wrap);
    const sheetMs = sheetDurationMs(s) / inst.rate;
    const delay = base + inst.start;
    const flipY = L.altFlip && inst.hit % 2 === 1;
    const tgt = boxIn(layer, to.body);
    const src = boxIn(layer, from.body);
    let total = sheetMs;
    if (inst.flightMs === null) {
      const a = L.anchor === 'attacker' ? src : tgt;
      wrap.style.transform = `translate(${(a.x + L.dx - w / 2).toFixed(1)}px, ${(a.y + L.dy - h / 2).toFixed(1)}px) ${pixelFxTransform(from.dir < 0, flipY, L.angle)}`;
      track(el.animate(pixelFxKeyframes(s, sc), { duration: sheetMs, delay, fill: 'forwards' }));
    } else {
      // 날아감: 치는 쪽(+dx,dy) → 도착(맞는 쪽 +tx,ty, 곡선 arc) → 사라지는 곳(도착 +ex,ey), 나는 동안 시트 반복
      const A = { x: src.x + L.dx, y: src.y + L.dy };
      const B = { x: tgt.x + L.tx, y: tgt.y + L.ty };
      const E = { x: B.x + L.ex, y: B.y + L.ey };
      const ms1 = inst.flightMs;
      const v = Math.hypot(B.x - A.x, B.y - A.y) / ms1 || 1;
      const ms2 = Math.hypot(E.x - B.x, E.y - B.y) / v;
      total = ms1 + ms2;
      const N = 16;
      const frames: Keyframe[] = [];
      for (let k = 0; k <= N; k++) {
        const q = flyPoint(A, B, E, L.arc, (total * k) / N, ms1, ms2);
        const left = q.vx < 0;
        const rot = (L.face ? (left ? 180 - q.dir : q.dir) : 0) + L.angle;
        frames.push({ offset: k / N, transform: `translate(${(q.x - w / 2).toFixed(1)}px, ${(q.y - h / 2).toFixed(1)}px) ${pixelFxTransform(left, flipY, rot)}` });
      }
      wrap.style.transform = String(frames[0]!.transform);
      track(wrap.animate(frames, { duration: total, delay, fill: 'forwards', easing: 'linear' }));
      track(el.animate(pixelFxKeyframes(s, sc), { duration: sheetMs, delay, iterations: Math.max(1, Math.ceil(total / sheetMs)), fill: 'forwards' }));
    }
    const life = track(wrap.animate([{}, {}], { duration: Math.max(1, delay + total) }));
    const rm = () => wrap.remove();
    life.addEventListener('finish', rm);
    life.addEventListener('cancel', rm);
    window.setTimeout(rm, (delay + total) / rate + FX_SAFETY_MS * 2);
    return delay + total;
  };

  /** 연결 동작: 차례로, 동작마다 빠르기(× 시전 속도 × 지금 배속), 끝나면 다음 동작. 종이인형은 동작 id(rigMotion), 프레임 그림은 그 동작 이름 */
  /** onFinalHit: 마지막 동작의 타격 프레임(재생기가 실제로 그 자세를 올린 순간)에 한 번 — 마무리 체인 착탄(GDD 224장 2) */
  const playChain = (anim: AnimPlayer, body: NonNullable<PixelPlan['body']>, swingProbe?: { side: Side; tier: string }, fromStart = false, onFinalHit?: () => void, onFirstHit?: () => void): void => {
    const isRig = 'pose' in anim;
    let i = 0;
    const next = (): void => {
      if (i >= body.chain.length) {
        anim.setRate(rate);
        return;
      }
      const st = body.chain[i]!;
      const first = i === 0;
      const last = i === body.chain.length - 1;
      i++;
      anim.setRate(rate * (st.rate > 0 ? st.rate : 1) * body.speed);
      const onHit = swingProbe || (last && onFinalHit) || (first && onFirstHit)
        ? () => {
          if (swingProbe) opts.onSwingFrame?.(swingProbe.side, swingProbe.tier);
          if (first) onFirstHit?.();
          if (last) onFinalHit?.();
        }
        : undefined;
      const o = { fromHit: first && body.bodyFromHit && !fromStart, onEnd: next, onHit };
      const r = isRig ? anim.play('skill', { ...o, rigMotion: st.id }) : anim.play(st.id as AnimAction, o);
      if (!r) {
        if (first) onFirstHit?.();
        if (last) onFinalHit?.();
        next();
      }
    };
    next();
  };

  const run = (cue: AttackCue, done: () => void): void => {
    const from = cue.side === 'player' ? opts.player : opts.enemy;
    const to = cue.side === 'player' ? opts.enemy : opts.player;
    const level = ATTACK_FX[cue.tier];
    // 닿는 순간 알림 (GDD 146장): 한 번만, 연출과 같이 배속·일시정지를 따른다 (안전장치 setTimeout 도 같이)
    let landed = !cue.onLand;
    const land = () => {
      if (landed) return;
      landed = true;
      cue.onLand!();
    };
    const landAt = (ms: number) => {
      if (landed) return;
      after(from.root, ms, land);
      window.setTimeout(land, ms / rate + FX_SAFETY_MS);
    };
    if (!canAnimate(from.root) || !canAnimate(to.body)) {
      done();
      land();
      return;
    }
    const layer = opts.layer && canAnimate(opts.layer) ? opts.layer : null;
    if (layer && cue.name) showName(layer, cue);
    // 프레임 애니(GDD 26장): 공격/특수 공격 동작이 있으면 그 애니를 재생하고 몸통박치기 돌진은 하지 않는다(위치 연출은 애니 안에 있다).
    // 타격 순간은 애니의 hit 프레임. 동작이 없으면 아래 기존 연출 그대로
    // 즉발(블록 공격, GDD 117장 3): 애니는 타격 순간부터(휘두른 끝 → 되돌아옴), 맞음 반응은 0ms
    const act = from.anim ? animActionOf(cue, (a) => from.anim!.has(a)) : null;
    // 블록 도트 연출 (이펙트 배치 도구 확정 값): 있으면 이펙트·맞음 반응·연결 동작을 그 계획대로 (모션 줄이기 = 번쩍임만이면 옛 방식)
    const slot = opts.bodySlot?.() ?? 'male';
    const px = cue.pixel && layer && mode !== 'flash' && hasPixelStage(cue.pixel.stage, slot) ? cue.pixel : null;
    const pplan = px ? pixelPlan(px.stage, slot) : null;
    const chainBody = pplan?.body && from.anim ? pplan.body : null;
    // 연결 동작을 처음부터 (GDD 224장 2): 첫 동작 휘두르기 길이만큼 이펙트·맞음 반응을 뒤로 — 몸의 타격 프레임 = 첫 맞음 반응
    const bodySwing = chainBody && (cue.bodyWindup || cue.windup) ? bodySwingMs(chainBody, from.anim ?? null) : 0;
    const bodyLead = chainBody ? Math.max(0, bodySwing - chainBody.at) : 0;
    // 엔진 착탄에 맞추기 (GDD 214장, C.357): 첫 맞음 반응이 cue.hitInMs 에 오게. 도트 연출은 그 계획의 첫 반응(reactAt[0])만큼 앞에서 시작한다.
    // 큐에서 기다리다 늦게 시작해 착탄이 이미 지났으면(0) 옛 즉발처럼 타격부터 보인다(피해 숫자는 엔진 사건이 이미 띄웠다)
    const want = cue.hitInMs;
    const quick = want === undefined && !!cue.instant && !cue.windup; // 옛 즉발(엔진 지연 정보가 없을 때만): 타격 순간부터 / 각본 마무리 체인: 동작 처음부터
    const firstReact = pplan ? pplan.reactAt[0] ?? 0 : 0;
    const clipHitIn = want !== undefined ? Math.max(bodyLead, want - firstReact) : quick ? 0 : chainBody ? bodyLead : undefined;
    const clipPlay = act && !chainBody ? from.anim!.play(act, { hitInMs: clipHitIn, motion: cue.motion, rigMotion: cue.rigMotion, ...(opts.onSwingFrame ? { onHit: () => opts.onSwingFrame?.(cue.side, cue.tier) } : {}) }) : null;
    if (mode === 'flash') {
      // 돌진 없이 맞는 쪽만 번쩍인다 (애니가 있으면 타격 프레임에 맞춰, 아니면 엔진 착탄에)
      const at = clipPlay?.hitAtMs ?? clipHitIn ?? 0;
      hit(to, level, cue.guarded, at);
      landAt(at);
      const ms = Math.max(at + Math.max(level.hitMs, HIT_FLASH_MIN_MS), clipPlay?.durationMs ?? 0);
      after(from.root, ms, done);
      window.setTimeout(done, ms / rate + FX_SAFETY_MS); // 안전장치
      return;
    }
    const lv = scaled(level, unit());
    const motion = cue.fx ? familyMotion(cue.fx) : null;
    const plan: LungePlan = chainBody
      ? { keyframes: [], durationMs: 1, hitAtMs: clipHitIn ?? 0, ghosts: 0 }
      : clipPlay
      ? { keyframes: [], durationMs: clipPlay.durationMs, hitAtMs: clipPlay.hitAtMs, ghosts: 0 }
      : alignPlan(
        motion?.move === 'cast'
          ? castPlan(lv, from.dir, motion.travelMs)
          : lungePlan(lv, from.dir, Math.min(reachOf(gapOf(from, to)), opts.maxReach?.() ?? Infinity) * (motion?.reach ?? 1)),
        clipHitIn,
      );
    const lead = plan.leadMs ?? 0;
    const timing: KeyframeAnimationOptions = { duration: Math.max(1, plan.durationMs - lead), delay: lead, easing: 'linear', fill: 'none' };
    from.root.style.zIndex = '4';
    const main = track(from.root.animate(clipPlay || chainBody ? [{}, {}] : plan.keyframes, timing)); // 애니는 길이만 재는 빈 애니메이션(배속·일시정지를 따른다)
    // 잔상: 몸을 복제해 투명도를 낮추고 조금씩 늦게 같은 길을 따라가게 한다
    for (let i = 0; i < plan.ghosts; i++) {
      const g = from.body.cloneNode(true) as HTMLElement;
      g.removeAttribute('id');
      g.setAttribute('aria-hidden', 'true');
      g.classList.add('bha-ghost');
      g.style.cssText = `position:absolute;left:${from.body.offsetLeft}px;top:${from.body.offsetTop}px;width:${from.body.offsetWidth}px;height:${from.body.offsetHeight}px;margin:0;opacity:0;pointer-events:none`;
      (from.body.parentElement ?? from.root).insertBefore(g, from.body);
      const ga = track(g.animate(
        plan.keyframes.map((k) => ({ ...k, opacity: ghostOpacity(i) })),
        { ...timing, delay: lead + GHOST_LAG_MS * (i + 1), fill: 'backwards' },
      ));
      const rm = () => g.remove();
      ga.addEventListener('finish', rm);
      ga.addEventListener('cancel', rm);
    }
    let endAt = plan.durationMs;
    const hitAt = quick && !clipPlay ? 0 : plan.hitAtMs; // 옛 즉발 + 동작 없음: 타격을 먼저 보이고 몸통박치기는 뒤따른다
    if (pplan && px && layer) {
      // 블록 도트 연출: 이펙트 조각들, 맞는 쪽 반응(투사체면 도착 순간), 마지막 반응에 3단계 흔들림, 연결 동작
      const stage = cue.stage ?? 1;
      spawnSide = cue.side;
      let fxEnd = 0;
      for (const inst of pplan.insts) fxEnd = Math.max(fxEnd, pixelInst(layer, px.element, inst, from, to, hitAt));
      // 연결 동작을 처음부터 보이면(GDD 224장 2) 첫 맞음 반응은 몸의 첫 타격 자세가 실제로 올라온 순간(재생기 onHit) — 타이머와 재생기 시계가 1~2 프레임 어긋난다(C.367 실측)
      const firstFromBody = !!chainBody && bodySwing > 0;
      for (const [i, ms] of pplan.reactAt.entries()) if (!(firstFromBody && i === 0)) hit(to, level, cue.guarded, hitAt + ms);
      const lastReact = hitAt + Math.max(...pplan.reactAt);
      let landAtFinal = lastReact;
      if (chainBody && from.anim) {
        const anim = from.anim;
        const probe = opts.onSwingFrame ? { side: cue.side, tier: cue.tier } : undefined;
        const startAt = Math.max(0, hitAt + chainBody.at - bodySwing);
        // 마무리 체인 (GDD 146장·224장 2): 피해는 마지막 타격 — 몸의 마지막 동작 타격이 이펙트 마지막 반응보다 늦으면 그때 (맞음 반응도 그때 한 번 더)
        // 착탄은 마지막 동작이 실제로 타격 자세를 올린 순간(재생기 onHit) — 예상 시각 + 여유는 안전장치
        let onFinal: (() => void) | undefined;
        if (cue.windup) {
          const last = bodyLastHitMs(chainBody, anim, bodySwing > 0);
          const bodyLast = last === null ? null : (startAt < 1 ? 0 : startAt) + last;
          if (bodyLast !== null && bodyLast > lastReact + 1) {
            landAtFinal = -1;
            onFinal = () => {
              hit(to, level, cue.guarded, 0);
              land();
              if (familyShakes(stage) && opts.shake) opts.shake();
            };
            window.setTimeout(land, (bodyLast + FINAL_HIT_SAFETY_MS) / rate + FX_SAFETY_MS);
            endAt = Math.max(endAt, bodyLast + level.hitMs);
          }
        }
        const go = () => playChain(anim, chainBody, probe, bodySwing > 0, onFinal, firstFromBody ? () => hit(to, level, cue.guarded, 0) : undefined);
        // 지금 시작이면 바로 (빈 애니메이션 끝을 기다리면 1~2 프레임 늦어 타격 프레임이 맞음 반응보다 뒤로 밀린다, GDD 224장 3)
        if (startAt < 1) go(); // 1ms 미만(부동소수 찌꺼기 포함)은 지금
        else after(from.root, startAt, go);
      }
      if (landAtFinal >= 0) {
        landAt(landAtFinal);
        if (familyShakes(stage) && opts.shake) after(from.root, landAtFinal, opts.shake);
      }
      endAt = Math.max(endAt, fxEnd, lastReact + level.hitMs);
    } else if (cue.fx && motion) {
      // 계열 공격 (GDD 19-2): 단계만큼 타격 + 종류별 자국, 3단계는 크게 + 흔들림
      const stage = cue.stage ?? 1;
      const hits = familyHits(stage, hitAt);
      const famId = cue.fam;
      spawnSide = cue.side;
      spawnLook = cue.look ?? null;
      if (layer) {
        const tgt = boxIn(layer, to.body);
        const src = boxIn(layer, from.body);
        if (motion.move === 'cast') {
          const castScale = hits[hits.length - 1]!.scale;
          for (const [i, h] of hits.entries()) missile(layer, cue.fx, famId, src, tgt, Math.max(0, h.atMs - motion.travelMs), motion.travelMs, i === hits.length - 1 ? castScale : 1);
        }
        for (const [i, h] of hits.entries()) mark(layer, cue.fx, famId, tgt, h.scale, h.atMs, from.dir, motion.markMs, i);
      }
      spawnLook = null;
      for (const h of hits) hit(to, level, cue.guarded, h.atMs);
      landAt(landAtMs(hitAt, stage));
      if (familyShakes(stage) && opts.shake) after(from.root, hits[hits.length - 1]!.atMs, opts.shake);
      endAt = Math.max(endAt, hits[hits.length - 1]!.atMs + motion.markMs * 0.6);
    } else {
      hit(to, level, cue.guarded, hitAt);
      landAt(landAtMs(hitAt, null));
    }
    let ended = false;
    const end = () => {
      if (ended) return;
      ended = true;
      from.root.style.zIndex = '';
      done();
    };
    if (endAt > plan.durationMs) after(from.root, endAt, end);
    else {
      main.addEventListener('finish', end);
      main.addEventListener('cancel', end);
    }
    // 안전장치: 어떤 이유로든 finish 가 안 오면 큐가 멈추지 않게 한다
    window.setTimeout(end, (endAt + GHOST_LAG_MS * 3) / rate + FX_SAFETY_MS);
  };

  const queues: Record<Side, AttackQueue> = { player: new AttackQueue(run), enemy: new AttackQueue(run) };

  return {
    react(e, extra) {
      const cue = attackCueOf(e, opts.top, opts.familyFx, opts.heavyPixel);
      if (!cue) {
        extra?.onLand?.(); // 연출이 없는 사건이면 바로 닿은 것으로
        return false;
      }
      if (extra) Object.assign(cue, extra);
      const nm = opts.nameOf?.(e);
      if (nm) {
        cue.name = nm.name;
        if (nm.ult) cue.ult = true;
      }
      queues[cue.side].push(cue);
      return true;
    },
    setSpeed(speed) {
      rate = fxRate(speed);
      for (const a of live) a.playbackRate = rate;
      opts.player.anim?.setRate(rate);
      opts.enemy.anim?.setRate(rate);
    },
    setPaused(on) {
      paused = on;
      opts.player.anim?.setPaused(on);
      opts.enemy.anim?.setPaused(on);
      for (const a of live) {
        if (on) a.pause();
        else a.play();
      }
    },
    setMode(m) {
      mode = m;
    },
    destroy() {
      queues.player.clear();
      queues.enemy.clear();
      for (const a of [...live]) a.cancel();
      live.clear();
    },
  };
}

/** 길이 값(px)에 화면 배율을 곱한 단계 값 */
export function scaled(level: AttackFxLevel, unit: number): AttackFxLevel {
  return unit === 1 ? level : { ...level, backPx: level.backPx * unit, knockPx: level.knockPx * unit };
}
