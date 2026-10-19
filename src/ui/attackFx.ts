// 공격 연출(몸통박치기) 로직 (GDD 17-4, R-4, C.35).
// 위쪽은 DOM 이 없는 순수 함수(사건 → 강도 단계, 연출 큐, 애니메이션 계획)라 단위 테스트한다 (tests/attackfx.test.ts).
// 아래쪽 attackFx() 가 Web Animations 로 그림 한 장을 움직인다. 엔진 틱·결과는 건드리지 않고, 사건이 났을 때 연출만 얹는다.
import type { CombatEvent } from '../engine/combat';
import type { AttackFxKind } from '../engine/faction';
import type { Locomotion } from '../engine/locomotion';
import type { AnimPlayer } from './bha/animPlayer';
import { LOCO_LIFT } from './bha/loco';
import {
  ATTACK_FX, ATTACK_TIER_ORDER, FAMILY_MOTION, FAMILY_STAGE_FX, FX_RATE_MAX, FX_RATE_MIN, FX_SAFETY_MS, GHOST_LAG_MS, GHOST_OPACITY, HIT_FLASH_MIN_MS,
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
}

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
export function attackCueOf(e: CombatEvent, top: number, familyFx?: (familyId: string) => AttackFxKind | null | undefined): AttackCue | null {
  switch (e.kind) {
    case 'player-attack':
      return e.damage > 0 ? { side: 'player', tier: 'basic', guarded: false } : null;
    case 'block': {
      if (e.damage <= 0 || e.block === 'void') return null;
      if (e.block === 'special' || e.block === 'combo') return { side: 'player', tier: 'special', guarded: false, ult: true };
      const cue: AttackCue = { side: 'player', tier: e.matchup === 'strong' ? 'weak' : chainTier(e.chain, top), guarded: false };
      const fx = e.family && e.role === 'attack' ? familyFx?.(e.family) : null;
      if (fx) {
        cue.fx = fx;
        cue.stage = familyStage(e.chain);
        cue.fam = e.family!;
      }
      return cue;
    }
    case 'stored-use':
      return e.damage > 0 ? { side: 'player', tier: 'special', guarded: false } : null;
    case 'enemy-attack':
      return e.damage > 0 || e.guarded ? { side: 'enemy', tier: 'basic', guarded: e.guarded } : null;
    case 'counter':
      return { side: 'enemy', tier: 'chain1', guarded: e.guarded };
    case 'heavy-hit':
      return { side: 'enemy', tier: 'special', guarded: e.guarded };
    default:
      return null;
  }
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
    if (!this.running) {
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

  private start(cue: AttackCue): void {
    this.running = cue;
    let finished = false;
    this.run(cue, () => {
      if (finished) return;
      finished = true;
      this.running = null;
      const next = this.waiting;
      this.waiting = null;
      if (next) this.start(next);
    });
  }
}

// ───────────────────────── 애니메이션 계획 (순수) ─────────────────────────

export interface LungePlan {
  keyframes: Keyframe[];
  /** 기본 속도(1배)에서의 전체 길이(ms) */
  durationMs: number;
  /** 부딪히는 시각(ms, 1배 기준) */
  hitAtMs: number;
  ghosts: number;
}

/**
 * 몸통박치기 키프레임. dir = +1(오른쪽으로 돌진) / -1(왼쪽), reach = 돌진 거리(px).
 * 살짝 물러남(예비) → 튀어나가 부딪힘 → 잠깐 머묾 → 제자리 복귀.
 */
export function lungePlan(level: AttackFxLevel, dir: 1 | -1, reach: number, loco: Locomotion = 'walk', liftPx = 0): LungePlan {
  const total = level.backMs + level.lungeMs + level.holdMs + level.returnMs;
  const o1 = level.backMs / total;
  const o2 = (level.backMs + level.lungeMs) / total;
  const o3 = (level.backMs + level.lungeMs + level.holdMs) / total;
  // 이동 방식 (GDD 18-11): 부유 = 기울임·뒤로 젖힘 없이 미끄러지듯 돌진 / 날기 = 위로 솟았다가 떠 있던 높이만큼 내리꽂는 호 / 걷기 = 그대로
  const slide = loco === 'float';
  const dive = loco === 'fly' ? liftPx : 0;
  const tilt = slide ? 0 : level.tiltDeg * (loco === 'fly' ? 1.8 : 1);
  const back = slide ? level.backPx * 0.5 : level.backPx;
  const at = (x: number, scale: number, deg: number, y = 0): string => `translateX(${(x * dir).toFixed(1)}px)${y === 0 ? '' : ` translateY(${y.toFixed(1)}px)`} rotate(${(deg * dir).toFixed(1)}deg) scale(${scale})`;
  const keyframes: Keyframe[] = [
    { offset: 0, transform: at(0, 1, 0), easing: 'ease-out' },
    { offset: o1, transform: at(-back, 1, -tilt * (loco === 'fly' ? 0.5 : 1), -dive * 0.7), easing: 'cubic-bezier(.55,0,1,.45)' },
    { offset: o2, transform: at(reach, level.scale, tilt, dive), easing: 'linear' },
    { offset: o3, transform: at(reach, level.scale, tilt, dive), easing: 'ease-out' },
    { offset: 1, transform: at(0, 1, 0) },
  ];
  return { keyframes, durationMs: total, hitAtMs: level.backMs + level.lungeMs, ghosts: Math.min(2, Math.max(0, level.ghosts)) };
}

/** 돌진 거리: 두 그림 사이 간격(px)의 일부. 간격이 없으면 0 */
export function reachOf(gapPx: number): number {
  return Math.max(0, gapPx) * REACH_RATIO;
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
  /** 이동 방식 (GDD 18-11): 돌진 모양만 바뀐다. 없으면 걷기 */
  loco?: Locomotion;
  /** 프레임 애니 재생기 (GDD 26장). 있는 동작만 애니로 돌고, 없는 동작은 아래 기존 연출(몸통박치기·흔들림)을 쓴다 */
  anim?: AnimPlayer | null;
}

/** 이 연출에 쓸 프레임 동작: 필살·콤보·계열 공격·강공격은 skill, 그 밖은 attack. 그 동작이 없으면 null(= 기존 연출. 다른 동작으로 대신하지 않는다) */
export function animActionOf(cue: Pick<AttackCue, 'ult' | 'fx' | 'tier'>, has: (a: 'attack' | 'skill') => boolean): 'attack' | 'skill' | null {
  const a = cue.ult || cue.fx || cue.tier === 'special' ? 'skill' : 'attack';
  return has(a) ? a : null;
}

export interface AttackFxDriver {
  /** 사건을 연출로 바꿔 큐에 넣는다. 연출이 필요 없는 사건이면 false */
  react(e: CombatEvent): boolean;
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
  /** 계열 효과(자국·투사체·광선)와 기술 이름을 그리는 레이어 (장면 위, 조작을 막지 않는다). 없으면 효과 없이 움직임만 */
  layer?: HTMLElement;
  /** 계열 id → 연출 종류 (종족 설정 families[].fx) */
  familyFx?: (familyId: string) => AttackFxKind | null | undefined;
  /** 사건 → 크게 띄울 기술 이름 (없으면 null) */
  nameOf?: (e: CombatEvent) => { name: string; ult?: boolean } | null;
  /** 3단계 계열 공격의 화면 흔들림 (설정에서 흔들림을 끄면 호출하는 쪽이 무시한다) */
  shake?: () => void;
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
    const drop = () => live.delete(a);
    a.addEventListener('finish', drop);
    a.addEventListener('cancel', drop);
    return a;
  };

  /** 서로 사이 간격(px, 레이아웃 기준 = 화면 배율의 영향을 받지 않는 좌표) */
  const gapOf = (from: AttackActor, to: AttackActor): number => {
    const a = from.root;
    const b = to.root;
    const dx = Math.abs((b.offsetLeft + b.offsetWidth / 2) - (a.offsetLeft + a.offsetWidth / 2));
    return Math.max(0, dx - (a.offsetWidth + b.offsetWidth) / 2 + Math.min(a.offsetWidth, b.offsetWidth) * 0.5);
  };

  const hit = (target: AttackActor, level: AttackFxLevel, guarded: boolean, delayMs: number): void => {
    // 맞음 애니가 있으면 흔들림 대신 그 애니 (막았을 땐 기존 막기 표시). 없으면 아래 기존 흔들림
    const hitAnim = target.anim;
    if (!guarded && hitAnim?.has('hit')) {
      if (delayMs <= 0) hitAnim.play('hit');
      else after(target.body, delayMs, () => hitAnim.play('hit'));
      return;
    }
    const plan = hitPlan(scaled(level, unit()), (target.dir * -1) as 1 | -1, mode, guarded);
    // composite add: 맞는 쪽 원래 filter(적 윤곽 빛 drop-shadow)를 지우지 않고 흰 깜빡임을 덧붙인다 (지우면 검은 실루엣이 배경에 묻힌다)
    const opt: KeyframeAnimationOptions = { duration: plan.durationMs, delay: delayMs, easing: 'linear', fill: 'none', composite: 'add' };
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

  /** 레이어 안 좌표의 요소 중심·크기 (화면 배율과 무관한 레이아웃 좌표) */
  const boxIn = (layer: HTMLElement, n: HTMLElement): { x: number; y: number; w: number; h: number } => {
    const L = layer.getBoundingClientRect();
    const r = n.getBoundingClientRect();
    const k = layer.offsetWidth > 0 && L.width > 0 ? layer.offsetWidth / L.width : 1;
    return { x: (r.left - L.left + r.width / 2) * k, y: (r.top - L.top + r.height / 2) * k, w: r.width * k, h: r.height * k };
  };

  /** 효과 하나를 레이어에 놓는다: kind 모양, (x,y) 중심, size 한 변. 끝나면 지운다 */
  const spawn = (layer: HTMLElement, cls: string, html: string, x: number, y: number, w: number, h: number, frames: Keyframe[], ms: number, delay: number, color?: string): HTMLElement => {
    const n = document.createElement('div');
    n.className = `bha-afx ${cls}`;
    n.setAttribute('aria-hidden', 'true');
    if (color) n.dataset.fam = color;
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
      const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
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

  const run = (cue: AttackCue, done: () => void): void => {
    const from = cue.side === 'player' ? opts.player : opts.enemy;
    const to = cue.side === 'player' ? opts.enemy : opts.player;
    const level = ATTACK_FX[cue.tier];
    if (!canAnimate(from.root) || !canAnimate(to.body)) {
      done();
      return;
    }
    const layer = opts.layer && canAnimate(opts.layer) ? opts.layer : null;
    if (layer && cue.name) showName(layer, cue);
    // 프레임 애니(GDD 26장): 공격/특수 공격 동작이 있으면 그 애니를 재생하고 몸통박치기 돌진은 하지 않는다(위치 연출은 애니 안에 있다).
    // 타격 순간은 애니의 hit 프레임. 동작이 없으면 아래 기존 연출 그대로
    const act = from.anim ? animActionOf(cue, (a) => from.anim!.has(a)) : null;
    const clipPlay = act ? from.anim!.play(act) : null;
    if (mode === 'flash') {
      // 돌진 없이 맞는 쪽만 번쩍인다 (애니가 있으면 타격 프레임에 맞춰)
      hit(to, level, cue.guarded, clipPlay?.hitAtMs ?? 0);
      const a = [...live].pop();
      if (a) {
        a.addEventListener('finish', done);
        a.addEventListener('cancel', done);
        window.setTimeout(done, ((clipPlay?.hitAtMs ?? 0) + Math.max(level.hitMs, HIT_FLASH_MIN_MS)) / rate + FX_SAFETY_MS);
      } else if (clipPlay) window.setTimeout(done, clipPlay.durationMs / rate + FX_SAFETY_MS / 4);
      else done();
      return;
    }
    const lv = scaled(level, unit());
    const motion = cue.fx ? familyMotion(cue.fx) : null;
    const plan: LungePlan = clipPlay
      ? { keyframes: [], durationMs: clipPlay.durationMs, hitAtMs: clipPlay.hitAtMs, ghosts: 0 }
      : motion?.move === 'cast'
        ? castPlan(lv, from.dir, motion.travelMs)
        : lungePlan(lv, from.dir, reachOf(gapOf(from, to)) * (motion?.reach ?? 1), from.loco, from.root.offsetHeight * LOCO_LIFT[from.loco ?? 'walk']);
    const timing: KeyframeAnimationOptions = { duration: plan.durationMs, easing: 'linear', fill: 'none' };
    from.root.style.zIndex = '4';
    const main = track(from.root.animate(clipPlay ? [{}, {}] : plan.keyframes, timing)); // 애니는 길이만 재는 빈 애니메이션(배속·일시정지를 따른다)
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
        { ...timing, delay: GHOST_LAG_MS * (i + 1), fill: 'backwards' },
      ));
      const rm = () => g.remove();
      ga.addEventListener('finish', rm);
      ga.addEventListener('cancel', rm);
    }
    let endAt = plan.durationMs;
    if (cue.fx && motion) {
      // 계열 공격 (GDD 19-2): 단계만큼 타격 + 종류별 자국, 3단계는 크게 + 흔들림
      const stage = cue.stage ?? 1;
      const hits = familyHits(stage, plan.hitAtMs);
      const famId = cue.fam;
      if (layer) {
        const tgt = boxIn(layer, to.body);
        const src = boxIn(layer, from.body);
        if (motion.move === 'cast') {
          const castScale = hits[hits.length - 1]!.scale;
          for (const [i, h] of hits.entries()) missile(layer, cue.fx, famId, src, tgt, Math.max(0, h.atMs - motion.travelMs), motion.travelMs, i === hits.length - 1 ? castScale : 1);
        }
        for (const [i, h] of hits.entries()) mark(layer, cue.fx, famId, tgt, h.scale, h.atMs, from.dir, motion.markMs, i);
      }
      for (const h of hits) hit(to, level, cue.guarded, h.atMs);
      if (familyShakes(stage) && opts.shake) after(from.root, hits[hits.length - 1]!.atMs, opts.shake);
      endAt = Math.max(endAt, hits[hits.length - 1]!.atMs + motion.markMs * 0.6);
    } else {
      hit(to, level, cue.guarded, plan.hitAtMs);
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
    react(e) {
      const cue = attackCueOf(e, opts.top, opts.familyFx);
      if (!cue) return false;
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
