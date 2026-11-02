// 종이인형을 게임 캐릭터 그림으로 (GDD 96장 30): 프레임 애니 재생기(animPlayer)와 같은 모양(AnimPlayer)으로 동작을 받아
// 뼈대 동작(motions.json)을 돌리고, 매 순간 캔버스에 그려 그 <img> 의 src 로 넣는다 — 좌우 반전·크기·윤곽 같은 기존 CSS 가 그대로 따라온다.
// 게임 동작 → 종이인형 동작: 대기 idle, 이동 move, 공격 attack·attack2 무작위, 특수 skill·skill2 무작위(같은 것 두 번 연속까지, GDD 117장 4), 맞음 hit,
// 홈 대기 homeIdle, 빈사 자세 dying, 온천 bath, 패배 = 쓰러짐 down(끝 자세 유지) (GDD 170장). 그 밖(승리·먹기·잠·해방)은 없음 = 기존 연출.
// 계열 블록은 계열 몸동작(PlayOptions.motion, 종족 설정 families[].motion) 묶음에서 고른다(GDD 118장 2).
// 코어(createRigPlayer)는 DOM 없이 돌아 테스트한다.
import type { AnimAction } from '../../data/art/anim';
import type { FamilyMotionKind } from '../../engine/faction';
import { boneMatrices, fxAt, layerMatrix, lookLayers, orderLayers, resolveMotions, samplePose, type Motion, type MotionSets, type Pose, type Rig } from '../../data/art/rig/pose';
import { drawFxCanvas } from './rigFx';
import type { AnimPlayer, PlayOptions } from './animPlayer';

/** 게임 동작 → 종이인형 동작(여럿이면 무작위, pickVariant) */
export const RIG_ACTIONS: Partial<Record<AnimAction, readonly string[]>> = {
  idle: ['idle'],
  move: ['move'],
  attack: ['attack', 'attack2'],
  skill: ['skill', 'skill2'],
  hit: ['hit'],
  // GDD 170장 (사용자 2026-11-01·11-03): 방 평소 = 홈 대기, 빈사·상태 이상 = 빈사 자세, 온천 = 온천 자세, 전투 패배·사망 = 쓰러짐
  homeIdle: ['homeIdle'],
  dying: ['dying'],
  bath: ['bath'],
  lose: ['down'],
};

/** 계열 몸동작 → 종이인형 동작 (GDD 118장 2 → 170장, 사용자 2026-11-01 "권 블록=스트레이트, 귀 블록=특수1,2, 참 블록=공격1,2 모션"): 맨손 타격(권) = 스트레이트, 칼(참) = 공격1·2, 귀도(귀) = 특수1·2. 묶음에 있는 동작이 하나도 없으면 게임 동작(RIG_ACTIONS) 그대로 */
export const FAMILY_RIG_MOTIONS: Readonly<Record<FamilyMotionKind, readonly string[]>> = {
  strike: ['straight'],
  slash: ['attack', 'attack2'],
  cast: ['skill', 'skill2'],
};

/** 같은 변형을 연속으로 몇 번까지 허용하나 (GDD 117장 4: 두 번까지, 세 번째는 다른 것) */
export const VARIANT_REPEAT_MAX = 2;

/**
 * 변형 고르기 (순수, GDD 117장 4): n 개 중 무작위. 최근 recent(오래된 → 최근)의 끝이 같은 것 VARIANT_REPEAT_MAX 번이면 그것은 뺀다.
 * rng = 0 이상 1 미만 난수 (테스트에서 주입)
 */
export function pickVariant(n: number, recent: readonly number[], rng: () => number): number {
  if (n <= 1) return 0;
  const tail = recent.slice(-VARIANT_REPEAT_MAX);
  const banned = tail.length === VARIANT_REPEAT_MAX && tail.every((v) => v === tail[0]) ? tail[0]! : -1;
  const pool = Array.from({ length: n }, (_, i) => i).filter((i) => i !== banned);
  return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))]!;
}

export interface RigPlayer extends AnimPlayer {
  /** 지금 그릴 자세와 동작(뒤집기 슬롯용) */
  pose(): { pose: Pose; motion: Motion | undefined; t: number };
}

export function createRigPlayer(rig: Rig, motions: Record<string, Motion>, wake: () => void = () => {}, rng: () => number = Math.random): RigPlayer {
  const ids = (a: AnimAction) => (RIG_ACTIONS[a] ?? []).filter((id) => motions[id]);
  const byMotion = (m: FamilyMotionKind | undefined) => (m ? FAMILY_RIG_MOTIONS[m].filter((id) => motions[id]) : []);
  const recent: Record<string, number[]> = {};
  let loopAction: AnimAction | null = null;
  let once: { action: AnimAction; id: string; opts: PlayOptions; hitFired: boolean } | null = null;
  let t = 0;
  let rate = 1;
  let paused = false;
  /** 승리·패배(쓰러짐)를 틀면 다음 stop 까지 다른 동작을 무시한다 — 프레임 애니 재생기와 같게. 마지막 타격의 늦은 '맞음'이 쓰러짐을 덮지 않게 (GDD 170장, C.249) */
  let locked = false;
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
      const fam = byMotion(o.motion);
      const list = fam.length ? fam : ids(a);
      if (!list.length) return null;
      if (locked && a !== 'win' && a !== 'lose') {
        const m0 = motions[list[0]!]!;
        return { durationMs: m0.duration, hitAtMs: m0.hit ?? m0.duration / 2 };
      }
      locked = a === 'win' || a === 'lose';
      const hist = (recent[fam.length ? `m:${o.motion}` : a] ??= []);
      const k = pickVariant(list.length, hist, rng);
      hist.push(k);
      if (hist.length > VARIANT_REPEAT_MAX) hist.shift();
      const id = list[k]!;
      const m = motions[id]!;
      const hitAt = m.hit ?? m.duration / 2;
      // 타격부터 (GDD 117장 3, 블록 즉발): 휘두른 끝 자세에서 시작해 되돌아온다. 타격 콜백은 바로
      const skip = !!o.fromHit && m.hit !== undefined;
      once = { action: a, id, opts: o, hitFired: m.hit === undefined || skip };
      t = skip ? hitAt : 0;
      if (skip) o.onHit?.();
      wake();
      return skip ? { durationMs: m.duration - hitAt, hitAtMs: 0 } : { durationMs: m.duration, hitAtMs: hitAt };
    },
    stop() {
      locked = false;
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
        if (m.hold) {
          // 마지막 자세로 멈춤(쓰러짐) — 다음 play 가 올 때까지
          t = m.duration;
          once.opts = {};
          end?.();
          return;
        }
        once = null;
        t = 0;
        end?.();
      }
    },
    pose() {
      const id = curId();
      const m = id ? motions[id] : undefined;
      return { pose: m ? samplePose(rig, m, t) : {}, motion: m, t };
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
/** sets = 동작 묶음(몸이 묶음을 쓰면 그 몸 동작으로 덮는다, GDD 96장 40) */
export function bindRigAnim(img: HTMLImageElement, rig: Rig, baseMotions: Record<string, Motion>, lookId: string, partBase: string, sets?: MotionSets): RigPlayer {
  const [vx, vy, vw, vh] = rig.view?.rect ?? [0, 0, rig.canvas[0], rig.canvas[1]];
  const clipH = rig.view?.clipY !== undefined ? Math.min(vh, rig.view.clipY - vy) : vh; // 바닥 밑(clipY 아래)은 땅에 가려진 것처럼 안 그린다
  const canvas = document.createElement('canvas');
  canvas.width = vw * K;
  canvas.height = vh * K;
  const ctx = canvas.getContext('2d');
  const body = rig.looks[lookId]?.body;
  const motions = resolveMotions(rig, baseMotions, sets, body);
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
    const { pose, motion, t } = player.pose();
    const mats = boneMatrices(rig, pose, body);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, canvas.width, clipH * K);
    ctx.clip();
    ctx.imageSmoothingEnabled = false;
    for (const { layer, im } of orderLayers(layers.map((l) => ({ ...l, slot: l.layer.slot })), motion)) {
      const m = layerMatrix(rig, mats, layer, motion);
      ctx.setTransform(m[0] * K, m[1] * K, m[2] * K, m[3] * K, (m[4] - vx) * K, (m[5] - vy) * K);
      ctx.drawImage(im, 0, 0);
    }
    // 이펙트(GDD 115-A 48): 그림 층 위(바닥 밑은 같이 잘림)
    drawFxCanvas(ctx, fxAt(motion, t, mats), (p) => [(p[0] - vx) * K, (p[1] - vy) * K], K);
    ctx.restore();
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
