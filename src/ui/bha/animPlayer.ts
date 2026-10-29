// 프레임 애니 재생기 (GDD 26장, C.55): 그림 한 장(<img>)의 src 를 프레임 이미지로 바꿔 가며 보여 준다.
// 동작마다 있는 것만 돈다 — 없는 동작은 play()가 null 을 돌려주니 호출하는 쪽이 기존 연출(몸통박치기·흔들림·이동 방식)을 쓴다.
// 좌우 반전·윤곽·색조는 <img> 의 CSS 가 하므로 그대로 따라온다(src 만 바꾼다). 코어(createAnimPlayer)는 DOM 없이 돌아 테스트한다.
import { clipDurationMs, clipHitMs, frameAt, hasAnims, type AnimAction, type AnimClip, type AnimSet } from '../../data/art/anim';
import type { ArtUrls } from '../../data/art/manifest';
import { HUMANOID, MOTION_SETS, MOTIONS } from '../../data/art/rig/pose';
import { bindRigAnim, RIG_ACTIONS } from './rigAnim';

export interface AnimHost {
  /** 보일 프레임 주소를 넘긴다 (같은 주소를 또 넘겨도 된다) */
  show(url: string): void;
}

export interface PlayOptions {
  /** 타격 프레임이 올라온 순간 (피해 숫자 타이밍) */
  onHit?: () => void;
  /** 끝났을 때 (hold 동작은 마지막 장을 보인 채로) */
  onEnd?: () => void;
  /** 타격 순간부터 재생 (GDD 117장 3, 블록 즉발): 휘두른 끝에서 시작해 되돌아온다. onHit 은 바로. 돌려주는 길이는 남은 길이, 타격 시각 0 */
  fromHit?: boolean;
}

export interface AnimPlayer {
  has(action: AnimAction): boolean;
  clip(action: AnimAction): AnimClip | undefined;
  /** 쉬는 동안 돌릴 동작(보통 idle, 걷는 중엔 move). 그 동작이 없으면 정지 그림 */
  setLoop(action: AnimAction | null): void;
  /** 한 번 재생(sleep 같은 반복 동작은 stop 할 때까지). 없는 동작이면 null — 호출하는 쪽이 기존 연출을 쓴다. 1배속 기준 길이·타격 시각(ms)을 돌려준다 */
  play(action: AnimAction, o?: PlayOptions): { durationMs: number; hitAtMs: number } | null;
  /** 재생 중인 동작을 끝내고 쉬는 동작으로 돌아간다 */
  stop(): void;
  setRate(rate: number): void;
  setPaused(on: boolean): void;
  /** 시간을 dtMs 만큼 흘린다 (rAF 루프가 부른다, 테스트도 직접 부른다) */
  advance(dtMs: number): void;
  /** 지금 보이는 동작 (정지 그림이면 null) */
  readonly playing: AnimAction | null;
  /** 시간을 흘려야 하는 중인가 (반복·재생 중). 멈춰 있으면 루프가 쉰다 */
  readonly active: boolean;
}

export function createAnimPlayer(anims: AnimSet, still: string | null, host: AnimHost, wake: () => void = () => {}): AnimPlayer {
  let loopAction: AnimAction | null = null;
  let cur: AnimClip | null = null;
  /** rest = 쉬는 동작(반복 또는 정지) / once = play() 로 재생 중 / held = hold 동작이 마지막 장에 머무는 중 */
  let phase: 'rest' | 'once' | 'held' = 'rest';
  let curOpts: PlayOptions = {};
  let elapsed = 0;
  let hitFired = true;
  /** 이긴/진 뒤에는 늦게 도착한 맞음·공격 애니가 마지막 장면을 덮지 않는다 (stop() 으로 풀린다) */
  let locked = false;
  let rate = 1;
  let paused = false;
  let shown = '';

  const show = (url: string | null | undefined) => {
    if (url && url !== shown) {
      shown = url;
      host.show(url);
    }
  };
  /** 쉬는 동작으로: 반복 동작이 있으면 그걸, 없으면 정지 그림 */
  const settle = () => {
    cur = loopAction ? anims[loopAction] ?? null : null;
    phase = 'rest';
    curOpts = {};
    elapsed = 0;
    hitFired = true;
    show(cur ? cur.frames[0] : still);
  };

  const self: AnimPlayer = {
    has: (a) => !!anims[a],
    clip: (a) => anims[a],
    setLoop(action) {
      loopAction = action && anims[action] ? action : null;
      if (phase === 'rest') {
        settle();
        wake();
      }
    },
    play(action, o = {}) {
      const c = anims[action];
      if (!c) return null;
      if (locked && action !== 'win' && action !== 'lose') return { durationMs: clipDurationMs(c), hitAtMs: clipHitMs(c) };
      locked = action === 'win' || action === 'lose';
      cur = c;
      phase = 'once';
      curOpts = o;
      const hitAt = clipHitMs(c);
      elapsed = o.fromHit ? hitAt : 0;
      hitFired = !!o.fromHit;
      show(c.frames[o.fromHit ? frameAt(c, elapsed).index : 0]);
      if (o.fromHit) o.onHit?.();
      wake();
      return o.fromHit ? { durationMs: clipDurationMs(c) - hitAt, hitAtMs: 0 } : { durationMs: clipDurationMs(c), hitAtMs: hitAt };
    },
    stop() {
      locked = false;
      settle();
      wake();
    },
    setRate(r) {
      rate = r > 0 ? r : 1;
    },
    setPaused(on) {
      paused = on;
      if (!on) wake();
    },
    advance(dtMs) {
      if (paused || !cur || phase === 'held') return;
      elapsed += dtMs * rate;
      const f = frameAt(cur, elapsed);
      show(cur.frames[f.index]);
      if (!hitFired && f.index >= cur.hitFrame) {
        hitFired = true;
        curOpts.onHit?.();
      }
      if (f.done) {
        const end = curOpts.onEnd;
        if (cur.mode === 'hold') {
          phase = 'held'; // 마지막 장 유지 (승리·패배) — stop() 으로 풀린다
          curOpts = {};
        } else settle();
        end?.();
      }
    },
    get playing() {
      return cur ? cur.action : null;
    },
    get active() {
      return !paused && !!cur && phase !== 'held';
    },
  };
  settle();
  return self;
}

// ───────────────────────── DOM 연결 ─────────────────────────

const registry = new WeakMap<Element, AnimPlayer>();

/** 요소에 붙은 재생기 (없으면 null) */
export function animOf(node: Element | null | undefined): AnimPlayer | null {
  return (node && registry.get(node)) ?? null;
}

/** 참조를 쥐어 둬 브라우저 캐시에서 빠지지 않게 한다. C.139 (GDD 88장 5): 주소마다 한 장만 — 같은 애니를 여러 번 바인딩해도 늘지 않는다 */
const preloaded = new Map<string, HTMLImageElement>();
/** 미리 불러 둔 프레임 그림 수 (테스트용) */
export const preloadedCount = (): number => preloaded.size;

/** 프레임 그림을 미리 불러와 처음 재생할 때 깜빡이지 않게 한다 */
export function preloadFrames(anims: AnimSet): void {
  if (typeof Image === 'undefined') return;
  for (const c of Object.values(anims)) {
    for (const url of c.frames) {
      if (preloaded.has(url)) continue;
      const img = new Image();
      img.src = url;
      void img.decode?.().catch(() => {});
      preloaded.set(url, img);
    }
  }
}

/**
 * <img> 에 재생기를 붙이고 owner 요소(캐릭터 버튼·내 그림·적 상자…)에 등록한다. 프레임 애니가 하나도 없으면 아무것도 하지 않고 null.
 * owner 에는 `has-anim` 과 동작별 `has-anim-<동작>` 클래스가 붙어 CSS 가 겹치는 가짜 움직임(부유 출렁임·걸음 흔들림)을 끈다.
 */
export function bindAnim(owner: HTMLElement, img: HTMLImageElement, art: ArtUrls | null): AnimPlayer | null {
  // 종이인형 그림(GDD 96장 30): 뼈대 동작으로 움직인다
  if (art?.rig && typeof document !== 'undefined') {
    const player = bindRigAnim(img, HUMANOID, MOTIONS, art.rig.look, art.rig.partBase, MOTION_SETS);
    registry.set(owner, player);
    owner.classList.add('has-anim');
    for (const a of Object.keys(RIG_ACTIONS)) owner.classList.add(`has-anim-${a}`);
    return player;
  }
  if (!art?.anims || !hasAnims(art.anims) || !art.src) return null;
  preloadFrames(art.anims);
  let raf = 0;
  let last = 0;
  const tick = (now: number) => {
    raf = 0;
    if (!img.isConnected) return; // 화면에서 빠졌으면 멈춘다
    const dt = last ? Math.min(100, now - last) : 0;
    last = now;
    player.advance(dt);
    if (player.active) raf = requestAnimationFrame(tick);
  };
  const wake = () => {
    if (raf || typeof requestAnimationFrame === 'undefined') return;
    last = 0;
    raf = requestAnimationFrame(tick);
  };
  const player = createAnimPlayer(art.anims, art.src, { show: (u) => { img.src = u; } }, wake);
  registry.set(owner, player);
  owner.classList.add('has-anim');
  for (const a of Object.keys(art.anims)) owner.classList.add(`has-anim-${a}`);
  return player;
}
