// 종이인형을 게임 캐릭터 그림으로 (GDD 96장 30): 프레임 애니 재생기(animPlayer)와 같은 모양(AnimPlayer)으로 동작을 받아
// 뼈대 동작(motions.json)을 돌리고, 매 순간 캔버스에 그려 그 <img> 의 src 로 넣는다 — 좌우 반전·크기·윤곽 같은 기존 CSS 가 그대로 따라온다.
// 게임 동작 → 종이인형 동작: 대기 idle, 이동 move, 공격 attack·attack2 번갈아, 특수 skill·skill2 번갈아, 맞음 hit. 그 밖(승리·패배·먹기·잠·해방)은 없음 = 기존 연출.
// 코어(createRigPlayer)는 DOM 없이 돌아 테스트한다.
import type { AnimAction } from '../../data/art/anim';
import { boneMatrices, layerMatrix, lookLayers, samplePose, type Motion, type Pose, type Rig } from '../../data/art/rig/pose';
import type { AnimPlayer, PlayOptions } from './animPlayer';

/** 게임 동작 → 종이인형 동작(여럿이면 번갈아) */
export const RIG_ACTIONS: Partial<Record<AnimAction, readonly string[]>> = {
  idle: ['idle'],
  move: ['move'],
  attack: ['attack', 'attack2'],
  skill: ['skill', 'skill2'],
  hit: ['hit'],
};

export interface RigPlayer extends AnimPlayer {
  /** 지금 그릴 자세와 동작(뒤집기 슬롯용) */
  pose(): { pose: Pose; motion: Motion | undefined };
}

export function createRigPlayer(rig: Rig, motions: Record<string, Motion>, wake: () => void = () => {}): RigPlayer {
  const ids = (a: AnimAction) => (RIG_ACTIONS[a] ?? []).filter((id) => motions[id]);
  const turn: Partial<Record<AnimAction, number>> = {};
  let loopAction: AnimAction | null = null;
  let once: { action: AnimAction; id: string; opts: PlayOptions; hitFired: boolean } | null = null;
  let t = 0;
  let rate = 1;
  let paused = false;
  const curId = () => once?.id ?? (loopAction ? ids(loopAction)[0] : undefined);
  const self: RigPlayer = {
    has: (a) => ids(a).length > 0,
    clip: () => undefined,
    setLoop(a) {
      const next = a && ids(a).length ? a : null;
      if (next === loopAction) return;
      loopAction = next;
      if (!once) t = 0;
      wake();
    },
    play(a, o = {}) {
      const list = ids(a);
      if (!list.length) return null;
      const n = turn[a] ?? 0;
      turn[a] = n + 1;
      const id = list[n % list.length]!;
      const m = motions[id]!;
      once = { action: a, id, opts: o, hitFired: m.hit === undefined };
      t = 0;
      wake();
      return { durationMs: m.duration, hitAtMs: m.hit ?? m.duration / 2 };
    },
    stop() {
      once = null;
      t = 0;
      wake();
    },
    setRate(r) {
      rate = r > 0 ? r : 1;
    },
    setPaused(on) {
      paused = on;
      if (!on) wake();
    },
    advance(dt) {
      if (paused) return;
      t += dt * rate;
      if (!once) return;
      const m = motions[once.id]!;
      if (!once.hitFired && m.hit !== undefined && t >= m.hit) {
        once.hitFired = true;
        once.opts.onHit?.();
      }
      if (t >= m.duration) {
        const end = once.opts.onEnd;
        once = null;
        t = 0;
        end?.();
      }
    },
    pose() {
      const id = curId();
      const m = id ? motions[id] : undefined;
      return { pose: m ? samplePose(rig, m, t) : {}, motion: m };
    },
    get playing() {
      return once?.action ?? loopAction;
    },
    get active() {
      return !paused && (!!once || !!loopAction);
    },
  };
  return self;
}

/** 1도트 = 캔버스 몇 칸 (정지 그림 still/<외형>.png 와 같게) */
const K = 4;
/** 다시 그리는 최소 간격(ms) — 도트 게임은 30장/초면 충분하다 */
const MIN_FRAME_MS = 33;

/**
 * <img> 를 종이인형으로 움직인다. partBase = 부위 그림 폴더 주소(…/art/rig/<rig id>/). 등록(animOf·has-anim 클래스)은 bindAnim 이 한다.
 */
export function bindRigAnim(img: HTMLImageElement, rig: Rig, motions: Record<string, Motion>, lookId: string, partBase: string): RigPlayer {
  const [vx, vy, vw, vh] = rig.view?.rect ?? [0, 0, rig.canvas[0], rig.canvas[1]];
  const canvas = document.createElement('canvas');
  canvas.width = vw * K;
  canvas.height = vh * K;
  const ctx = canvas.getContext('2d');
  const body = rig.looks[lookId]?.body;
  const layers = lookLayers(rig, lookId).map((l) => {
    const im = new Image();
    im.src = `${partBase}${l.art}.png`;
    return { layer: l, im };
  });
  let raf = 0;
  let last = 0;
  let lastDraw = -Infinity;
  const draw = () => {
    if (!ctx || layers.some((l) => !l.im.complete || !l.im.naturalWidth)) return false;
    const { pose, motion } = player.pose();
    const mats = boneMatrices(rig, pose, body);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    for (const { layer, im } of layers) {
      const m = layerMatrix(rig, mats, layer, motion);
      ctx.setTransform(m[0] * K, m[1] * K, m[2] * K, m[3] * K, (m[4] - vx) * K, (m[5] - vy) * K);
      ctx.drawImage(im, 0, 0);
    }
    img.src = canvas.toDataURL();
    return true;
  };
  const tick = (now: number) => {
    raf = 0;
    if (!img.isConnected) return; // 화면에서 빠졌으면 멈춘다
    const dt = last ? Math.min(100, now - last) : 0;
    last = now;
    player.advance(dt);
    if (now - lastDraw >= MIN_FRAME_MS && draw()) lastDraw = now;
    if (player.active) raf = requestAnimationFrame(tick);
  };
  const wake = () => {
    if (raf || typeof requestAnimationFrame === 'undefined') return;
    last = 0;
    lastDraw = -Infinity;
    raf = requestAnimationFrame(tick);
  };
  const player = createRigPlayer(rig, motions, wake);
  // 부위 그림이 다 오면 한 번 그린다(그 전엔 정지 그림 src 그대로)
  for (const { im } of layers) im.addEventListener('load', () => { if (!raf) draw(); }, { once: true });
  return player;
}
