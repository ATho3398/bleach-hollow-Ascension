// 종이인형 그리기 (GDD 96장): 부위 그림(<img>)을 같은 캔버스에 겹쳐 두고, 뼈 행렬(pose.ts)을 CSS transform 으로 건다.
// 매 순간 실시간으로 움직인다(크루세이더 퀘스트식). 도트는 image-rendering: pixelated 로 흐림 없이 확대·회전된다.
// 코어(createDollClock)는 DOM 없이 시간·동작 전환만 다뤄 테스트한다.
import { boneMatrices, fxAt, layerMatrix, lookLayers, motionLook, orderLayers, resolveMotions, samplePose, type Mat, type Motion, type MotionSets, type Rig } from '../../data/art/rig/pose';
import { fxSvg } from './rigFx';
import { el } from '../dom';

export interface DollPlayOptions {
  onHit?: () => void;
  onEnd?: () => void;
}

/** 시간 흐름 + 반복 동작/한 번 동작 전환 (DOM 없음) */
export function createDollClock(motions: Record<string, Motion>) {
  let loopId: string | null = 'idle';
  let onceId: string | null = null;
  let t = 0;
  let opts: DollPlayOptions = {};
  let hitFired = true;
  return {
    get current(): { id: string; t: number } | null {
      const id = onceId ?? loopId;
      return id && motions[id] ? { id, t } : null;
    },
    setLoop(id: string | null) {
      if (loopId === id) return;
      loopId = id;
      if (!onceId) t = 0;
    },
    play(id: string, o: DollPlayOptions = {}): boolean {
      const m = motions[id];
      if (!m) return false;
      onceId = id;
      t = 0;
      opts = o;
      hitFired = m.hit === undefined;
      return true;
    },
    advance(dt: number) {
      t += dt;
      const id = onceId;
      if (!id) return;
      const m = motions[id]!;
      if (!hitFired && m.hit !== undefined && t >= m.hit) {
        hitFired = true;
        opts.onHit?.();
      }
      if (!m.loop && t >= m.duration) {
        const end = opts.onEnd;
        onceId = null;
        t = 0;
        opts = {};
        end?.();
      }
    },
  };
}

export interface Paperdoll {
  readonly el: HTMLElement;
  setLoop(id: string | null): void;
  play(id: string, o?: DollPlayOptions): boolean;
  /** 시간을 흘리고 다시 그린다 (rAF 루프나 테스트가 부른다) */
  advance(dtMs: number): void;
  destroy(): void;
}

export interface PaperdollOptions {
  rig: Rig;
  motions: Record<string, Motion>;
  /** 동작 묶음(몸이 묶음을 쓰면 그 몸 동작으로 덮는다, GDD 96장 40) */
  motionSets?: MotionSets;
  look: string;
  /** 1도트 = 몇 px */
  scale: number;
  /** public 기준 주소 앞부분(import.meta.env.BASE_URL) */
  base: string;
  /** 스스로 rAF 로 돌지 (기본 true). false 면 advance 를 밖에서 부른다 */
  autoplay?: boolean;
}

const css = (m: Mat, k: number) => `matrix(${m[0]},${m[1]},${m[2]},${m[3]},${m[4] * k},${m[5] * k})`;

export function createPaperdoll(o: PaperdollOptions): Paperdoll {
  const { rig, scale: k } = o;
  const body = rig.looks[o.look]?.body;
  const motions = resolveMotions(rig, o.motions, o.motionSets, body);
  const [w, h] = rig.canvas;
  const root = el('div', 'bha-doll');
  root.style.width = `${w * k}px`;
  root.style.height = `${h * k}px`;
  // 외형 + (있으면) 해방 외형(GDD 115-A 49): 두 벌을 같이 두고 그 순간 외형만 보인다
  const release = rig.looks[o.look]?.release;
  const lookIds = [o.look, ...(typeof release === 'string' && rig.looks[release] ? [release] : [])];
  const sets = new Map(lookIds.map((lid) => [lid, lookLayers(rig, lid).map((l) => {
    const img = el('img', 'bha-doll__part');
    img.src = `${o.base}art/rig/${rig.id}/${l.art}.png`;
    img.alt = '';
    img.draggable = false;
    img.style.width = `${l.size[0] * k}px`;
    img.style.height = `${l.size[1] * k}px`;
    img.dataset.slot = l.slot;
    root.append(img);
    return { img, layer: l, slot: l.slot };
  })]));
  // 이펙트 층(GDD 115-A 48): 그림 위, 캔버스 밖으로 넘쳐도 보이게
  const fx = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  fx.setAttribute('class', 'bha-doll__fx');
  fx.setAttribute('width', String(w * k));
  fx.setAttribute('height', String(h * k));
  fx.style.cssText = 'position:absolute;left:0;top:0;overflow:visible;pointer-events:none';
  root.append(fx);
  const clock = createDollClock(motions);
  const draw = () => {
    const cur = clock.current;
    const m = cur ? motions[cur.id] : undefined;
    const t = cur?.t ?? 0;
    const pose = m && cur ? samplePose(rig, m, t) : {};
    const mats = boneMatrices(rig, pose, body);
    const showing = motionLook(rig, o.look, m, t);
    for (const [lid, parts] of sets) {
      const shown = lid === showing ? orderLayers(parts, m) : [];
      for (const p of parts) p.img.style.display = shown.includes(p) ? '' : 'none';
      shown.forEach((p, i) => {
        p.img.style.zIndex = String(i + 1);
        p.img.style.transform = css(layerMatrix(rig, mats, p.layer, m), k);
      });
    }
    fx.style.zIndex = '999';
    fx.innerHTML = fxSvg(fxAt(m, t, mats), k);
  };
  draw();
  let raf = 0;
  let last = 0;
  const tick = (now: number) => {
    if (last) clock.advance(Math.min(100, now - last));
    last = now;
    draw();
    raf = requestAnimationFrame(tick);
  };
  if (o.autoplay !== false && typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(tick);
  return {
    el: root,
    setLoop: (id) => clock.setLoop(id),
    play: (id, opt) => clock.play(id, opt),
    advance(dt) {
      clock.advance(dt);
      draw();
    },
    destroy() {
      if (raf) cancelAnimationFrame(raf);
      root.remove();
    },
  };
}
