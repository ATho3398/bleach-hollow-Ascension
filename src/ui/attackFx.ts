// 공격 연출(몸통박치기) 로직 (GDD 17-4, R-4, C.35).
// 위쪽은 DOM 이 없는 순수 함수(사건 → 강도 단계, 연출 큐, 애니메이션 계획)라 단위 테스트한다 (tests/attackfx.test.ts).
// 아래쪽 attackFx() 가 Web Animations 로 그림 한 장을 움직인다. 엔진 틱·결과는 건드리지 않고, 사건이 났을 때 연출만 얹는다.
import type { CombatEvent } from '../engine/combat';
import {
  ATTACK_FX, ATTACK_TIER_ORDER, FX_RATE_MAX, FX_RATE_MIN, FX_SAFETY_MS, GHOST_LAG_MS, GHOST_OPACITY, GUARDED_HIT_RATIO, REACH_RATIO,
  type AttackFxLevel, type AttackTier,
} from './attackFxConfig';

export type Side = 'player' | 'enemy';

export interface AttackCue {
  side: Side;
  tier: AttackTier;
  /** 상대가 막았다 (피격 연출을 줄인다) */
  guarded: boolean;
}

/** 단계의 세기 순위 (클수록 세다) */
export const tierRank = (t: AttackTier): number => ATTACK_TIER_ORDER.indexOf(t);

/** 체인 단계(1~) → 연출 단계. top = 체인 최대 단계 */
export function chainTier(chain: number, top: number): AttackTier {
  const c = Math.max(1, Math.min(chain, top, 3));
  return c >= 3 ? 'chain3' : c === 2 ? 'chain2' : 'chain1';
}

/** 전투 사건 하나 → 연출. 연출이 필요 없는 사건(막기·회복·공허·상태 변화 …)은 null */
export function attackCueOf(e: CombatEvent, top: number): AttackCue | null {
  switch (e.kind) {
    case 'player-attack':
      return e.damage > 0 ? { side: 'player', tier: 'basic', guarded: false } : null;
    case 'block':
      if (e.damage <= 0 || e.block === 'void') return null;
      if (e.block === 'special' || e.block === 'combo') return { side: 'player', tier: 'special', guarded: false };
      return { side: 'player', tier: e.weak ? 'weak' : chainTier(e.chain, top), guarded: false };
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
export function lungePlan(level: AttackFxLevel, dir: 1 | -1, reach: number): LungePlan {
  const total = level.backMs + level.lungeMs + level.holdMs + level.returnMs;
  const o1 = level.backMs / total;
  const o2 = (level.backMs + level.lungeMs) / total;
  const o3 = (level.backMs + level.lungeMs + level.holdMs) / total;
  const at = (x: number, scale: number, deg: number): string => `translateX(${(x * dir).toFixed(1)}px) rotate(${(deg * dir).toFixed(1)}deg) scale(${scale})`;
  const keyframes: Keyframe[] = [
    { offset: 0, transform: at(0, 1, 0), easing: 'ease-out' },
    { offset: o1, transform: at(-level.backPx, 1, -level.tiltDeg), easing: 'cubic-bezier(.55,0,1,.45)' },
    { offset: o2, transform: at(reach, level.scale, level.tiltDeg), easing: 'linear' },
    { offset: o3, transform: at(reach, level.scale, level.tiltDeg), easing: 'ease-out' },
    { offset: 1, transform: at(0, 1, 0) },
  ];
  return { keyframes, durationMs: total, hitAtMs: level.backMs + level.lungeMs, ghosts: Math.min(2, Math.max(0, level.ghosts)) };
}

/** 돌진 거리: 두 그림 사이 간격(px)의 일부. 간격이 없으면 0 */
export function reachOf(gapPx: number): number {
  return Math.max(0, gapPx) * REACH_RATIO;
}

export interface HitPlan {
  keyframes: Keyframe[];
  durationMs: number;
}

/** 피격: 짧게 밀리며 번쩍임. flash 모드는 밀림 없이 번쩍임만. guarded 면 약하게 */
export function hitPlan(level: AttackFxLevel, dir: 1 | -1, mode: FxMode, guarded: boolean): HitPlan {
  const k = guarded ? GUARDED_HIT_RATIO : 1;
  const push = mode === 'full' ? level.knockPx * k : 0;
  const bright = 1 + (level.hitBright - 1) * k;
  const at = (x: number): string => `translateX(${(x * dir).toFixed(1)}px)`;
  return {
    durationMs: level.hitMs,
    keyframes: [
      { offset: 0, transform: at(0), filter: `brightness(${bright.toFixed(2)})`, easing: 'ease-out' },
      { offset: 0.3, transform: at(push), filter: `brightness(${(1 + (bright - 1) * 0.5).toFixed(2)})`, easing: 'ease-in-out' },
      { offset: 0.6, transform: at(-push * 0.35), filter: 'brightness(1)', easing: 'ease-out' },
      { offset: 1, transform: at(0), filter: 'brightness(1)' },
    ],
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
}

/** Web Animations 를 지원하지 않는 환경(구형 브라우저·테스트)에서는 아무것도 하지 않는다 */
const canAnimate = (n: HTMLElement): boolean => typeof n.animate === 'function';

export function attackFx(opts: AttackFxOptions): AttackFxDriver {
  const live = new Set<Animation>();
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
    const plan = hitPlan(scaled(level, unit()), (target.dir * -1) as 1 | -1, mode, guarded);
    track(target.body.animate(plan.keyframes, { duration: plan.durationMs, delay: delayMs, easing: 'linear', fill: 'none' }));
  };

  const run = (cue: AttackCue, done: () => void): void => {
    const from = cue.side === 'player' ? opts.player : opts.enemy;
    const to = cue.side === 'player' ? opts.enemy : opts.player;
    const level = ATTACK_FX[cue.tier];
    if (!canAnimate(from.root) || !canAnimate(to.body)) {
      done();
      return;
    }
    if (mode === 'flash') {
      // 돌진 없이 맞는 쪽만 번쩍인다
      hit(to, level, cue.guarded, 0);
      const a = [...live].pop();
      if (a) {
        a.addEventListener('finish', done);
        a.addEventListener('cancel', done);
        window.setTimeout(done, level.hitMs / rate + FX_SAFETY_MS);
      } else done();
      return;
    }
    const lv = scaled(level, unit());
    const plan = lungePlan(lv, from.dir, reachOf(gapOf(from, to)));
    const timing: KeyframeAnimationOptions = { duration: plan.durationMs, easing: 'linear', fill: 'none' };
    from.root.style.zIndex = '4';
    const main = track(from.root.animate(plan.keyframes, timing));
    // 잔상: 몸을 복제해 투명도를 낮추고 조금씩 늦게 같은 길을 따라가게 한다
    for (let i = 0; i < plan.ghosts; i++) {
      const g = from.body.cloneNode(true) as HTMLElement;
      g.removeAttribute('id');
      g.setAttribute('aria-hidden', 'true');
      g.classList.add('bha-ghost');
      g.style.cssText = `position:absolute;left:${from.body.offsetLeft}px;top:${from.body.offsetTop}px;width:${from.body.offsetWidth}px;height:${from.body.offsetHeight}px;margin:0;opacity:0;pointer-events:none`;
      from.root.insertBefore(g, from.body);
      const ga = track(g.animate(
        plan.keyframes.map((k) => ({ ...k, opacity: ghostOpacity(i) })),
        { ...timing, delay: GHOST_LAG_MS * (i + 1), fill: 'backwards' },
      ));
      const rm = () => g.remove();
      ga.addEventListener('finish', rm);
      ga.addEventListener('cancel', rm);
    }
    hit(to, level, cue.guarded, plan.hitAtMs);
    const end = () => {
      from.root.style.zIndex = '';
      done();
    };
    main.addEventListener('finish', end);
    main.addEventListener('cancel', end);
    // 안전장치: 어떤 이유로든 finish 가 안 오면 큐가 멈추지 않게 한다
    window.setTimeout(end, (plan.durationMs + GHOST_LAG_MS * 3) / rate + FX_SAFETY_MS);
  };

  const queues: Record<Side, AttackQueue> = { player: new AttackQueue(run), enemy: new AttackQueue(run) };

  return {
    react(e) {
      const cue = attackCueOf(e, opts.top);
      if (!cue) return false;
      queues[cue.side].push(cue);
      return true;
    },
    setSpeed(speed) {
      rate = fxRate(speed);
      for (const a of live) a.playbackRate = rate;
    },
    setPaused(on) {
      paused = on;
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
