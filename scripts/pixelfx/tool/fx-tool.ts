// 이펙트 배치 도구 v2 (GDD 180장): pixelfx 244개를 브라우저에서 바로 그려(코드 그대로, 그림 파일 없음) 실제 전투 1배 화면 위에 올린다.
// 공격 계열 6개(사신 참·권·귀, 호로 교·조·탄) × 1·2·3블록마다: 연타 수·간격 + 이펙트 최대 3개(기준 = 맞는 쪽/치는 쪽, 나오는 때, 자리·크기·각도·늦춤·속도·색).
// 값은 아티팩트 db `fx/editor`(편집 중)·`fx/fixed`(확정). 사용자가 "ㅇㅋ" 하면 Claude 가 `fx/fixed` 를 게임 데이터·시트로 옮긴다 (README.md).
// pixelfx 는 npm run fx:fetch 로 받는 JS(형 정보 없음, CI 에는 없음) — 형 검사에서 뺀다
// @ts-ignore
import { effects, categories } from '../../../vendor/pixelfx/src/fx/index.js';
// @ts-ignore
import { clearFrame, composite, createFrame, createFx } from '../../../vendor/pixelfx/src/core/index.js';
import { pixelFxTransform } from '../../../src/ui/bha/pixelFx';
import { bindAnim, type AnimPlayer } from '../../../src/ui/bha/animPlayer';
import { charArt, type ArtUrls } from '../../../src/data/art/manifest';
import type { FamilyMotionKind } from '../../../src/engine/faction';
import { CHARACTERS, HERO_BOX, type ToolChar } from './characters';
import { MOTIONS } from '../../../src/data/art/rig/pose';

interface FxLayer {
  fx: string;
  color: 'element' | 'original';
  anchor: 'target' | 'attacker';
  /** 나오는 타격 (0부터, 사용자 2026-11-04 "3타만 다른거로 바꾸고싶은데") */
  on: number[];
  delay: number;
  dx: number;
  dy: number;
  scale: number;
  angle: number;
  rate: number;
  altFlip: boolean;
  /** 투사체 (사용자 2026-11-04 "투사체 날라가는 스킬은 이 툴에서 어떻게 구현할까?"): fly = 치는 쪽(+dx,dy) → 맞는 쪽(+tx,ty) 으로 travel ms 동안 날아감,
   *  arc = 곡선 높이(px, + = 위로), face = 날아가는 방향으로 돌리기. 나는 동안은 프레임을 반복한다 */
  move: 'stay' | 'fly';
  travel: number;
  arc: number;
  tx: number;
  ty: number;
  /** 사라지는 곳 = 도착점에서 (ex, ey) — 0,0 이면 도착하자마자 사라진다. 아니면 같은 빠르기로 그곳까지 지나가서 사라진다 (사용자 2026-11-04 "사라지는 위치도 조정할 수 있게") */
  ex: number;
  ey: number;
  face: boolean;
  /** 레이어 1~5: 클수록 앞에 그린다 (사용자 2026-11-04 "이펙트별 레이어도 설정할 수 있게"). 같으면 이펙트 번호 순 */
  z: number;
  /** 시작 기준: hit = 타격 때, arrive = 이 블록 첫 투사체가 도착할 때(같은 타격) */
  sync: 'hit' | 'arrive';
}
/** 옛 저장·새 이펙트에 없는 칸 채우기 */
const LAYER_DEFAULTS = { move: 'stay', travel: 300, arc: 0, tx: 0, ty: 0, ex: 0, ey: 0, face: true, sync: 'hit', z: 3 } as const;
/** 한 블록 공격: 타격 수 · 타격 사이 간격(타격마다 따로) · 시전 속도(공격 전체 빠르기, 이펙트 재생도 같이) · 이펙트
 *  body = 치는 쪽 몸동작 (사용자 2026-11-04 "각 블록당 종이인형 모션도 설정할 수 있게 … 원하는 모션 원하는 타이밍에 발현할 수 잇게"):
 *  '' = 게임 기본(계열 몸동작, 첫 타격에 타격 프레임부터), 아니면 종이인형 동작 id(motions.json) / 프레임 그림 동작 이름. bodyAt = 시작 시각(첫 타격 = 0ms 기준), bodyFromHit = 타격 프레임부터 */
interface StageFx { hits: number; gaps: number[]; speed: number; layers: FxLayer[]; body: string; bodyAt: number; bodyFromHit: boolean }
const STAGE_BODY_DEFAULTS = { body: '', bodyAt: 0, bodyFromHit: true };
type FamilyFx = StageFx[];
interface Entry { key: string; label: string; faction: string; bg: string; dir: 1 | -1; motion?: FamilyMotionKind }
interface ToolData {
  stage: { w: number; h: number };
  view: { x: number; y: number; w: number; h: number };
  target: { x: number; y: number };
  attacker: { x: number; y: number };
  /** edge = 이 속성 색일 때 이펙트별 테두리 색 (예 노멀 → 세로·세로 오스큐라스 어두운 검정) */
  elements: { id: string; name: string; color: string; palette: string[]; edge?: Record<string, string> }[];
  entries: Entry[];
  defaults: Record<string, FamilyFx>;
  catNames: Record<string, string>;
  stamp: string;
  built: string;
  /** 캐릭터 그림 (상대 주소 → data URI) */
  art: Record<string, string>;
}
declare const FX_DATA: ToolData;
type DocRef = { get(): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>; set(d: Record<string, unknown>): Promise<void> };
declare const claude: { use(name: 'db'): Promise<{ doc(path: string): DocRef } | null> } | undefined;

type Mod = { meta: { name?: string; size: [number, number]; origin: [number, number]; fps?: number; duration?: number; loop?: boolean; options?: Record<string, unknown> } };
const EFFECTS = effects as Record<string, Mod>;
const D = FX_DATA;
// 게임 코드가 그림을 상대 주소(./art/…)로 부르면 실어 둔 data URI 로 바꿔 끼운다 (아티팩트는 저장소 파일을 못 읽는다)
{
  const desc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src')!;
  Object.defineProperty(HTMLImageElement.prototype, 'src', {
    configurable: true,
    get() {
      return desc.get!.call(this);
    },
    set(v: string) {
      const k = String(v).replace(/^\.?\//, '');
      desc.set!.call(this, D.art[k] ?? v);
    },
  });
}
const LS = 'bha-fx-tool-v3';
const MAX_LAYERS = 5; // 사용자 2026-11-04 "블록당 이펙트 5개로 늘리자"
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

const data: Record<string, FamilyFx> = clone(D.defaults);
let entry = D.entries[0]!;
let stageIx = 0;
let layerIx = 0;
let element = D.elements[0]!.id;
let playing = true;
let repeat = true;
let t = 0;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text) n.textContent = text;
  return n;
};
const st = (): StageFx => Object.assign(data[entry.key]![stageIx]!, { ...STAGE_BODY_DEFAULTS, ...data[entry.key]![stageIx]! });
const layer = (): FxLayer | null => st().layers[layerIx] ?? null;
const newLayer = (): FxLayer => ({ fx: 'impacts/hit-spark', color: 'original', anchor: 'target', on: Array.from({ length: st().hits }, (_, i) => i), delay: 0, dx: 0, dy: 0, scale: 1, angle: 0, rate: 1, altFlip: false, ...LAYER_DEFAULTS });
/** 간격 칸 수를 타격 수에 맞춘다 (늘면 마지막 간격을 잇는다), 없는 타격은 나오는 타격에서 뺀다 */
function fitStage(s: StageFx): void {
  const want = Math.max(0, s.hits - 1);
  while (s.gaps.length < want) s.gaps.push(s.gaps[s.gaps.length - 1] ?? 100);
  s.gaps.length = want;
  for (const L of s.layers) L.on = L.on.filter((i) => i < s.hits);
}

// ── pixelfx 렌더 (pixelfx tools/lib/fxlib.mjs renderFrames 와 같은 방식: 원점에 놓고 fps 마다 한 장, 가장자리 빛 줄이기) ──
interface Frames { w: number; h: number; fps: number; images: ImageData[] }
const cache = new Map<string, Frames>();
function edgeFade(L: Uint32Array, w: number, hh: number, E = 8): void {
  for (let y = 0; y < hh; y++) {
    const ey = Math.min(y, hh - 1 - y);
    for (let x = 0; x < w; x++) {
      const e = Math.min(ey, x, w - 1 - x);
      if (e >= E) {
        x = w - 1 - E;
        continue;
      }
      const i = y * w + x;
      const l = L[i]!;
      if (!(l & 0xffffff)) continue;
      const u = (e + 0.5) / E;
      const k = u * u * (3 - 2 * u);
      L[i] = (l & 0xff000000) | Math.round((l & 255) * k) | (Math.round(((l >>> 8) & 255) * k) << 8) | (Math.round(((l >>> 16) & 255) * k) << 16);
    }
  }
}
function framesOf(id: string, palette: string[] | null, edge: string | null = null): Frames | null {
  const key = `${id}|${palette?.join(',') ?? ''}|${edge ?? ''}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const mod = EFFECTS[id];
  if (!mod) return null;
  const meta = { fps: 30, loop: false, duration: 1, options: {}, ...mod.meta };
  const [W, H] = meta.size;
  const n = Math.max(1, Math.round(meta.duration * meta.fps) + (meta.loop ? 0 : 1));
  const frame = createFrame(W, H, 0, 0);
  const opts: Record<string, unknown> = { x: meta.origin[0], y: meta.origin[1] };
  if (palette && 'palette' in (meta.options ?? {})) opts.palette = palette;
  if (edge && 'edge' in (meta.options ?? {})) opts.edge = edge;
  const inst = createFx({ ...mod, meta }, opts);
  const screen = W >= 320 && Math.abs(W / H - 16 / 9) < 0.05;
  const images: ImageData[] = [];
  for (let i = 0; i < n; i++) {
    if (i > 0) inst.update(1 / meta.fps);
    clearFrame(frame);
    inst.draw(frame);
    if (!screen) edgeFade(frame.light, W, H);
    images.push(new ImageData(composite(frame, new Uint8ClampedArray(W * H * 4), null), W, H));
  }
  const out = { w: W, h: H, fps: meta.fps, images };
  cache.set(key, out);
  return out;
}
const paletteOf = (L: FxLayer): string[] | null => (L.color === 'element' ? D.elements.find((e) => e.id === element)!.palette : null);
const edgeOf = (L: FxLayer): string | null => (L.color === 'element' ? D.elements.find((e) => e.id === element)!.edge?.[L.fx] ?? null : null);

// ── 무대 ──
const world = $('world');
const stageBox = $('stage');
const bgImg = world.querySelector('img') as HTMLImageElement;
world.style.width = `${D.stage.w}px`;
world.style.height = `${D.stage.h}px`;
for (const [id, p] of [['mark-t', D.target], ['mark-a', D.attacker]] as const) {
  $(id).style.left = `${p.x}px`;
  $(id).style.top = `${p.y}px`;
}
const dot = $('dot');
// ── 치는 쪽 캐릭터 (게임 재생기 그대로: 종이인형 bindRigAnim / 프레임 애니) ──
const RIG_ART = (look: string): ArtUrls => ({ src: `./art/rig/humanoid/still/${look}.png`, frames: null, scale: 1.78, fieldScale: 1.33, offsetY: 0, rig: { look, partBase: './art/rig/humanoid/' } });
const artOfChar = (c: ToolChar): ArtUrls => (c.rig ? RIG_ART(c.rig) : charArt(c.faction!, c.tier ?? 0, c.fallback ?? '', './', undefined, undefined, null, undefined, 'male'));
const heroHost = $('hero');
let hero: { c: ToolChar; img: HTMLImageElement; player: AnimPlayer | null } | null = null;
let charId = 'shinigami-m';
function mountHero(): void {
  const c = CHARACTERS.find((x) => x.id === charId) ?? CHARACTERS[0]!;
  if (hero?.c === c) return;
  heroHost.replaceChildren();
  const art = artOfChar(c);
  const s = art.fieldScale ?? art.scale;
  const img = document.createElement('img');
  img.alt = c.label;
  img.draggable = false;
  img.src = art.src ?? '';
  const size = HERO_BOX.size * s;
  img.style.cssText = `position:absolute;left:${HERO_BOX.originX - size / 2}px;top:${HERO_BOX.originY + (HERO_BOX.y - HERO_BOX.originY) * s}px;width:${size}px;height:${size}px;image-rendering:pixelated;pointer-events:none`;
  heroHost.append(img);
  hero = { c, img, player: bindAnim(heroHost, img, art) };
}
// 몸동작 목록: 종이인형 = 게임 motions.json 의 동작 전부(새 동작이 게임 데이터에 들어오면 도구를 다시 만들 때 저절로 늘어난다), 프레임 그림 = 그 그림에 있는 동작
const MOTION_NAMES: Record<string, string> = {
  idle: '대기', homeIdle: '홈 대기', move: '걷기', attack: '공격1', attack2: '공격2', skill: '특수1', skill2: '특수2', hit: '맞음',
  punch: '주먹', kick: '발차기', ultimate: '필살기', straight: '스트레이트', down: '쓰러짐', dying: '빈사', bath: '온천', headbutt: '박치기',
  lose: '패배', win: '승리',
};
interface BodyOpt { id: string; label: string; durationMs: number; hitMs: number | null }
function bodyOptions(): BodyOpt[] {
  const c = hero?.c;
  if (c?.rig) {
    return Object.entries(MOTIONS).map(([id, m]) => ({ id, label: `${MOTION_NAMES[id] ?? '새 동작'} (${id})`, durationMs: m.duration, hitMs: m.hit ?? null }));
  }
  const anims = c ? artOfChar(c).anims ?? {} : {};
  return Object.entries(anims).map(([id, clip]) => {
    const ms = (clip as { frameMs: number[] }).frameMs.reduce((a, b) => a + b, 0);
    return { id, label: `${MOTION_NAMES[id] ?? id} (${id})`, durationMs: ms, hitMs: null };
  });
}
const bodyOf = (s: StageFx): BodyOpt | null => (s.body ? bodyOptions().find((b) => b.id === s.body) ?? null : null);
/** 몸동작 틀기: 고른 동작이 없으면 게임 기본(블록 공격 = 특수 동작·계열 몸동작 묶음, 타격 프레임부터, 특수 동작이 없는 그림이면 공격) */
function swing(): void {
  const p = hero?.player;
  if (!p) return;
  const s = st();
  const b = bodyOf(s);
  if (!b) {
    const o = { fromHit: true, motion: entry.motion };
    if (!p.play('skill', o)) p.play('attack', o);
    return;
  }
  if (hero?.c.rig) p.play('skill', { motionId: b.id, fromHit: s.bodyFromHit });
  else p.play(b.id as never, { fromHit: s.bodyFromHit });
}
/** 몸동작을 트는 시각 (첫 타격 = 0ms, 시전 속도 반영) */
const bodyAt = (): number => (bodyOf(st()) ? st().bodyAt / st().speed : 0);
const dot2 = $('dot2');
const dot3 = $('dot3');
let k = 1;
const fit = (): void => {
  k = stageBox.clientWidth / D.view.w;
  world.style.transform = `translate(${-D.view.x * k}px, ${-D.view.y * k}px) scale(${k})`;
  stageBox.style.height = `${D.view.h * k}px`;
};
new ResizeObserver(fit).observe(stageBox);

/** 재생 조각 하나 = 어떤 층이 어떤 타격에서 언제 시작하는지 */
interface Inst { L: FxLayer; rate: number; start: number; hi: number; fly: { from: { x: number; y: number }; to: { x: number; y: number }; ms: number; end: { x: number; y: number }; ms2: number } | null; f: Frames; cv: HTMLCanvasElement; ctx: CanvasRenderingContext2D; shown: number }
let insts: Inst[] = [];
let span = { from: 0, to: 800 };
/** 타격 시각(ms) = 간격 합 ÷ 시전 속도 */
const hitTimes = (s: StageFx): number[] => {
  const out = [0];
  for (let i = 1; i < s.hits; i++) out.push(out[i - 1]! + (s.gaps[i - 1] ?? 0) / s.speed);
  return out;
};

function layout(): void {
  for (const i of insts) i.cv.remove();
  insts = [];
  const s = st();
  const hits = hitTimes(s);
  const anchorOf = (L: FxLayer) => (L.anchor === 'attacker' ? D.attacker : D.target);
  // 이 블록 첫 투사체: 타격마다 도착 시각 (arrive 로 맞춘 이펙트가 쓴다)
  const flyer = s.layers.find((L) => L.move === 'fly');
  const arriveAt = (hi: number): number =>
    flyer && flyer.on.includes(hi) ? hits[hi]! + flyer.delay / s.speed + flyer.travel / s.speed : hits[hi]!;
  let from = 0;
  let to = hits[hits.length - 1]! + 300;
  s.layers.forEach((L, li) => {
    const f = framesOf(L.fx, paletteOf(L), edgeOf(L));
    if (!f) return;
    for (const hi of L.on.filter((i) => i < hits.length)) {
      const base = L.move === 'stay' && L.sync === 'arrive' ? arriveAt(hi) : hits[hi]!;
      const start = base + L.delay / s.speed;
      const cv = h('canvas', 'pxfx');
      cv.width = f.w;
      cv.height = f.h;
      const w = f.w * L.scale;
      const hh = f.h * L.scale;
      cv.style.width = `${w}px`;
      cv.style.height = `${hh}px`;
      cv.style.visibility = 'hidden';
      let fly: Inst['fly'] = null;
      if (L.move === 'fly') {
        const A = { x: D.attacker.x + L.dx, y: D.attacker.y + L.dy };
        const B = { x: D.target.x + L.tx, y: D.target.y + L.ty };
        const E = { x: B.x + (L.ex ?? 0), y: B.y + (L.ey ?? 0) };
        const ms = Math.max(1, L.travel / s.speed);
        // 도착 뒤 사라지는 곳까지: 첫 구간과 같은 빠르기
        const v = Math.hypot(B.x - A.x, B.y - A.y) / ms || 1;
        fly = { from: A, to: B, ms, end: E, ms2: Math.hypot(E.x - B.x, E.y - B.y) / v };
      }
      if (!fly) {
        const a = anchorOf(L);
        place(cv, a.x + L.dx, a.y + L.dy, w, hh, pixelFxTransform(entry.dir < 0, L.altFlip && hi % 2 === 1, L.angle));
      }
      cv.style.zIndex = String((L.z ?? 3) * 10 + li);
      if (li === layerIx) cv.classList.add('is-sel');
      world.insertBefore(cv, $('mark-t'));
      const rate = L.rate * s.speed;
      insts.push({ L, rate, start, hi, fly, f, cv, ctx: cv.getContext('2d')!, shown: -1 });
      from = Math.min(from, start);
      to = Math.max(to, start + (fly ? fly.ms + fly.ms2 : ((f.images.length / f.fps) * 1000) / rate));
    }
  });
  const ba = bodyAt();
  const bo = bodyOf(s);
  from = Math.min(from, ba);
  if (bo) to = Math.max(to, ba + bo.durationMs);
  span = { from, to };
  if (t < from || t > to + 400) t = from;
  const L = layer();
  dot.hidden = !L;
  dot2.hidden = !L || L.move !== 'fly';
  dot3.hidden = !L || L.move !== 'fly' || (!L.ex && !L.ey);
  if (L) {
    const a = L.move === 'fly' ? D.attacker : anchorOf(L);
    dot.style.left = `${a.x + L.dx}px`;
    dot.style.top = `${a.y + L.dy}px`;
    dot2.style.left = `${D.target.x + L.tx}px`;
    dot2.style.top = `${D.target.y + L.ty}px`;
    dot3.style.left = `${D.target.x + L.tx + (L.ex ?? 0)}px`;
    dot3.style.top = `${D.target.y + L.ty + (L.ey ?? 0)}px`;
  }
  draw();
}
const place = (cv: HTMLElement, x: number, y: number, w: number, hh: number, transform: string): void => {
  cv.style.left = `${x - w / 2}px`;
  cv.style.top = `${y - hh / 2}px`;
  cv.style.transform = transform;
};

function draw(): void {
  for (const i of insts) {
    const el = t - i.start;
    const n = i.f.images.length;
    let fi = Math.floor((el * i.rate * i.f.fps) / 1000);
    if (i.fly) {
      // 나는 동안: 곧은 길 + 곡선(포물선), 프레임은 반복, 도착하면 사라진다
      if (el < 0 || el > i.fly.ms + i.fly.ms2) {
        i.cv.style.visibility = 'hidden';
        continue;
      }
      fi %= n;
      const { from: A, to: B, end: E } = i.fly;
      let x: number;
      let y: number;
      let vx: number;
      let vy: number;
      if (el <= i.fly.ms) {
        const p = el / i.fly.ms;
        x = A.x + (B.x - A.x) * p;
        y = A.y + (B.y - A.y) * p - i.L.arc * 4 * p * (1 - p);
        vx = B.x - A.x;
        vy = B.y - A.y - i.L.arc * 4 * (1 - 2 * p);
      } else {
        // 도착점을 지나 사라지는 곳까지 곧게
        const p = (el - i.fly.ms) / (i.fly.ms2 || 1);
        x = B.x + (E.x - B.x) * p;
        y = B.y + (E.y - B.y) * p;
        vx = E.x - B.x;
        vy = E.y - B.y;
      }
      const dir = (Math.atan2(vy, vx) * 180) / Math.PI;
      // 시트는 오른쪽을 본다. 왼쪽으로 날면 좌우 뒤집고(배가 위로 안 가게) 그만큼 각도를 되돌린다
      const left = vx < 0;
      const rot = (i.L.face ? (left ? 180 - dir : dir) : 0) + i.L.angle;
      place(i.cv, x, y, i.f.w * i.L.scale, i.f.h * i.L.scale, pixelFxTransform(left, i.L.altFlip && i.hi % 2 === 1, rot));
    } else if (el < 0 || fi >= n) {
      i.cv.style.visibility = 'hidden';
      continue;
    }
    if (fi !== i.shown) {
      i.ctx.putImageData(i.f.images[fi]!, 0, 0);
      i.shown = fi;
    }
    i.cv.style.visibility = 'visible';
  }
  const scrub = $<HTMLInputElement>('scrub');
  scrub.min = String(Math.floor(span.from));
  scrub.max = String(Math.ceil(span.to));
  scrub.value = String(t);
  $('time').textContent = `${Math.round(t)}ms`;
}

let last = performance.now();
const tick = (now: number): void => {
  const dt = Math.min(100, now - last);
  last = now;
  if (playing) {
    const prev = t;
    t += dt;
    const at = bodyAt();
    if (prev < at && t >= at) swing();
    if (t > span.to + 400) {
      if (repeat) {
        t = span.from;
        if (t >= at) swing();
      }
      else {
        t = span.to;
        setPlaying(false);
      }
    }
    draw();
  }
  requestAnimationFrame(tick);
};
requestAnimationFrame(tick);
function setPlaying(on: boolean): void {
  playing = on;
  hero?.player?.setPaused(!on);
  $('play').textContent = on ? '멈춤' : '재생';
}

// 무대 끌기 = 고른 이펙트 자리 옮기기
let drag: { x: number; y: number; dx: number; dy: number } | null = null;
// 무대 그림이 끌려오지 않게 (사용자 2026-11-04 "드래그할 때 배경 이미지가 끌려오거든?"): 그림 끌기·길게 눌러 메뉴·글자 고르기 막기
bgImg.draggable = false;
for (const e of ['dragstart', 'contextmenu', 'selectstart']) stageBox.addEventListener(e, (ev) => ev.preventDefault());
stageBox.addEventListener('pointerdown', (ev) => {
  ev.preventDefault();
  const L = layer();
  if (!L) return;
  drag = { x: ev.clientX, y: ev.clientY, dx: L.dx, dy: L.dy };
  stageBox.setPointerCapture(ev.pointerId);
});
stageBox.addEventListener('pointermove', (ev) => {
  const L = layer();
  if (!drag || !L) return;
  L.dx = Math.round(drag.dx + (ev.clientX - drag.x) / k);
  L.dy = Math.round(drag.dy + (ev.clientY - drag.y) / k);
  changed();
});
const endDrag = () => (drag = null);
stageBox.addEventListener('pointerup', endDrag);
stageBox.addEventListener('pointercancel', endDrag);

// ── 게이지 ──
/** 게이지 양옆 ◀ ▶ (사용자 2026-11-04 "게이지 좌우로 화살표 추가해서 1px씩 움직일 수 있게"): 한 번 누르면 한 칸(px 게이지 = 1px), 누르고 있으면 계속 */
function arrowRow(row: HTMLElement, lab: HTMLElement, r: HTMLInputElement, out: HTMLElement): void {
  const btn = (dir: -1 | 1) => {
    const b = h('button', 'nudge', dir < 0 ? '◀' : '▶');
    b.type = 'button';
    b.setAttribute('aria-label', `${lab.textContent} ${dir < 0 ? '줄이기' : '늘리기'}`);
    const step = () => {
      if (r.disabled) return;
      if (dir < 0) r.stepDown();
      else r.stepUp();
      r.dispatchEvent(new Event('input'));
    };
    let hold = 0;
    let rep = 0;
    const stop = () => {
      window.clearTimeout(hold);
      window.clearInterval(rep);
    };
    b.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      step();
      hold = window.setTimeout(() => (rep = window.setInterval(step, 60)), 350);
    });
    for (const e of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(e, stop);
    b.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        step();
      }
    });
    return b;
  };
  row.append(lab, btn(-1), r, btn(1), out);
}
interface Gauge<K extends string> { key: K; label: string; step: number; min: number; max: number; unit: string; signed?: boolean }
function gauges<T, K extends keyof T & string>(host: HTMLElement, list: Gauge<K>[], get: () => T | null): () => void {
  const rows = list.map((g) => {
    const row = h('div', 'field');
    const lab = h('label', '', g.label);
    lab.htmlFor = `g-${host.id}-${g.key}`;
    const r = h('input');
    r.id = lab.htmlFor;
    r.type = 'range';
    r.min = String(g.min);
    r.max = String(g.max);
    r.step = String(g.step);
    const out = h('output', 'val');
    r.oninput = () => {
      const o = get();
      if (!o) return;
      (o as Record<string, unknown>)[g.key] = Number(r.value);
      if (g.key === 'hits') fitStage(st());
      changed();
    };
    arrowRow(row, lab, r, out);
    host.append(row);
    return { g, r, out };
  });
  return () => {
    const o = get();
    for (const { g, r, out } of rows) {
      const v = o ? Number((o as Record<string, unknown>)[g.key]) : 0;
      r.value = String(v);
      r.disabled = !o;
      out.textContent = o ? `${g.signed && v > 0 ? '+' : ''}${v}${g.unit}` : '-';
    }
  };
}
const syncHits = gauges<StageFx, 'hits' | 'speed'>($('hitbox'), [
  { key: 'hits', label: '타격 수', step: 1, min: 1, max: 6, unit: '번' },
  { key: 'speed', label: '시전 속도', step: 0.05, min: 0.25, max: 3, unit: '배' },
], st);
const syncBody = gauges<StageFx, 'bodyAt'>($('bodybox'), [
  { key: 'bodyAt', label: '동작 시작', step: 10, min: -1500, max: 1500, unit: 'ms', signed: true },
], st);
const bodySel = $<HTMLSelectElement>('bodysel');
bodySel.onchange = () => {
  st().body = bodySel.value;
  changed();
};
const bodyHit = $<HTMLInputElement>('bodyfromhit');
bodyHit.onchange = () => {
  st().bodyFromHit = bodyHit.checked;
  changed();
};
$('bodyalign').onclick = () => {
  const b = bodyOf(st());
  if (!b || b.hitMs === null) return status('타격 프레임이 있는 종이인형 동작을 먼저 골라 줘');
  // 동작을 처음부터 틀되 그 동작의 타격 프레임이 첫 타격(0ms)에 오게
  st().bodyAt = -b.hitMs;
  st().bodyFromHit = false;
  changed();
  status(`${b.label}: 타격 프레임(${b.hitMs}ms)이 첫 타격에 오도록 ${-b.hitMs}ms 에 시작`);
};
function syncBodySel(): void {
  const s = st();
  const opts = bodyOptions();
  bodySel.replaceChildren(new Option('게임 기본 (계열 몸동작)', ''), ...opts.map((b) => new Option(`${b.label} · ${(b.durationMs / 1000).toFixed(2)}초${b.hitMs !== null ? ` · 타격 ${b.hitMs}ms` : ''}`, b.id)));
  bodySel.value = opts.some((b) => b.id === s.body) ? s.body : '';
  const custom = !!bodyOf(s);
  bodyHit.checked = s.bodyFromHit;
  bodyHit.disabled = !custom;
  ($('bodyalign') as HTMLButtonElement).disabled = !custom;
  $('bodybox').toggleAttribute('data-off', !custom);
  for (const i of $('bodybox').querySelectorAll<HTMLInputElement | HTMLButtonElement>('input, button')) i.disabled = !custom;
  $('bodyinfo').textContent = custom ? '' : '게임 기본: 첫 타격 순간 계열 몸동작을 타격 프레임부터';
}
/** 타격 사이 간격: 타격 수만큼 줄이 바뀐다 */
function syncGaps(): void {
  const box = $('gapbox');
  const s = st();
  if (box.childElementCount !== s.gaps.length) {
    box.replaceChildren();
    s.gaps.forEach((_, i) => {
      const row = h('div', 'field');
      const lab = h('label', '', `${i + 1}→${i + 2}타`);
      lab.htmlFor = `gap-${i}`;
      const r = h('input');
      r.id = lab.htmlFor;
      r.type = 'range';
      r.min = '0';
      r.max = '800';
      r.step = '10';
      r.oninput = () => {
        st().gaps[i] = Number(r.value);
        changed();
      };
      arrowRow(row, lab, r, h('output', 'val'));
      box.append(row);
    });
  }
  [...box.children].forEach((row, i) => {
    (row.querySelector('input') as HTMLInputElement).value = String(s.gaps[i]);
    row.querySelector('output')!.textContent = `${s.gaps[i]}ms`;
  });
}
/** 고른 이펙트가 나오는 타격 (여러 개 고르기) */
function syncOn(): void {
  const box = $('onseg');
  const L = layer();
  box.replaceChildren();
  for (let i = 0; i < st().hits; i++) {
    const b = h('button', 'chip', `${i + 1}타`);
    b.type = 'button';
    b.disabled = !L;
    b.setAttribute('aria-pressed', String(!!L && L.on.includes(i)));
    b.onclick = () => {
      if (!L) return;
      L.on = L.on.includes(i) ? L.on.filter((x) => x !== i) : [...L.on, i].sort((a, c) => a - c);
      changed();
    };
    box.append(b);
  }
}
const syncLayer = gauges<FxLayer, 'z' | 'dx' | 'dy' | 'scale' | 'angle' | 'delay' | 'rate'>($('layerbox'), [
  { key: 'z', label: '레이어', step: 1, min: 1, max: 5, unit: '층' },
  { key: 'dx', label: '가로', step: 1, min: -400, max: 400, unit: 'px', signed: true },
  { key: 'dy', label: '세로', step: 1, min: -200, max: 200, unit: 'px', signed: true },
  { key: 'scale', label: '크기', step: 0.25, min: 0.25, max: 6, unit: '배' },
  { key: 'angle', label: '각도', step: 1, min: -180, max: 180, unit: '°', signed: true },
  { key: 'delay', label: '늦춤', step: 10, min: -400, max: 800, unit: 'ms', signed: true },
  { key: 'rate', label: '재생 속도', step: 0.05, min: 0.25, max: 3, unit: '배' },
], layer);
const syncFly = gauges<FxLayer, 'travel' | 'arc' | 'tx' | 'ty' | 'ex' | 'ey'>($('flybox'), [
  { key: 'travel', label: '비행 시간', step: 10, min: 50, max: 1500, unit: 'ms' },
  { key: 'arc', label: '곡선 높이', step: 2, min: -150, max: 200, unit: 'px', signed: true },
  { key: 'tx', label: '도착 가로', step: 1, min: -200, max: 200, unit: 'px', signed: true },
  { key: 'ty', label: '도착 세로', step: 1, min: -150, max: 150, unit: 'px', signed: true },
  { key: 'ex', label: '사라지는 곳 가로', step: 1, min: -400, max: 400, unit: 'px', signed: true },
  { key: 'ey', label: '사라지는 곳 세로', step: 1, min: -200, max: 200, unit: 'px', signed: true },
], layer);

// ── 고르기 ──
const famSel = $<HTMLSelectElement>('entry');
for (const e of D.entries) famSel.append(new Option(e.label, e.key));
famSel.onchange = () => {
  entry = D.entries.find((e) => e.key === famSel.value) ?? entry;
  layerIx = 0;
  t = 0;
  refresh();
};
for (const c of CHARACTERS) {
  const b = h('button', 'chip', c.label);
  b.type = 'button';
  b.dataset.char = c.id;
  b.onclick = () => {
    charId = c.id;
    t = span.from;
    refresh();
    swing();
  };
  $('chars').append(b);
}
for (let i = 0; i < 3; i++) {
  const b = h('button', 'chip', `${i + 1}블록`);
  b.type = 'button';
  b.dataset.stage = String(i);
  b.onclick = () => {
    stageIx = i;
    layerIx = 0;
    t = 0;
    refresh();
  };
  $('stages').append(b);
}
for (const el of D.elements) {
  const b = h('button', 'chip', el.name);
  b.type = 'button';
  b.style.setProperty('--c', el.color);
  b.dataset.el = el.id;
  b.onclick = () => {
    element = el.id;
    refresh();
  };
  $('elements').append(b);
}
// 이펙트 목록 (분류 · 이름), 검색
const fxSel = $<HTMLSelectElement>('fx');
const fxSearch = $<HTMLInputElement>('fxsearch');
// 직접 만든 이펙트(custom/…) 맨 위 (사용자 2026-11-04 "커스텀은 맨위로 올리고")
const isCustom = (id: string) => id.startsWith('custom/');
const ids = Object.keys(EFFECTS).sort((a, b) => Number(isCustom(b)) - Number(isCustom(a)) || a.localeCompare(b));
/** 옮긴 이펙트 id (옛 저장 값을 새 id 로) */
const RENAMED: Record<string, string> = { 'arcane/cero-oscuras': 'custom/cero-oscuras' };
function fillFx(q: string): void {
  const cur = layer()?.fx;
  fxSel.replaceChildren();
  const ql = q.trim().toLowerCase();
  const cats = new Map<string, HTMLOptGroupElement>();
  for (const id of ids) {
    const name = EFFECTS[id]!.meta.name ?? id;
    const cat = id.split('/')[0]!;
    const catName = D.catNames[cat] ?? cat;
    if (ql && !`${id} ${name} ${catName}`.toLowerCase().includes(ql) && id !== cur) continue;
    let g = cats.get(cat);
    if (!g) {
      g = document.createElement('optgroup');
      g.label = catName;
      cats.set(cat, g);
      fxSel.append(g);
    }
    g.append(new Option(`${name} (${id})`, id));
  }
  if (cur) fxSel.value = cur;
}
fxSearch.oninput = () => fillFx(fxSearch.value);
fxSel.onchange = () => {
  const L = layer();
  if (!L) return;
  L.fx = fxSel.value;
  changed();
};
function seg(host: string, items: [string, string][], key: 'color' | 'anchor' | 'move' | 'sync'): () => void {
  const bs = items.map(([v, label]) => {
    const b = h('button', 'chip', label);
    b.type = 'button';
    b.onclick = () => {
      const L = layer();
      if (!L) return;
      (L as unknown as Record<string, string>)[key] = v;
      changed();
    };
    $(host).append(b);
    return { v, b };
  });
  return () => {
    const L = layer();
    for (const { v, b } of bs) {
      b.setAttribute('aria-pressed', String(!!L && (L as unknown as Record<string, string>)[key] === v));
      b.disabled = !L;
    }
  };
}
const syncColor = seg('colorseg', [['element', '속성 색'], ['original', '원래 색']], 'color');
const syncAnchor = seg('anchorseg', [['target', '맞는 쪽'], ['attacker', '치는 쪽']], 'anchor');
const syncMove = seg('moveseg', [['stay', '제자리'], ['fly', '날아감 (투사체)']], 'move');
const syncSync = seg('syncseg', [['hit', '타격 때 시작'], ['arrive', '투사체 도착 때 시작']], 'sync');
const face = $<HTMLInputElement>('face');
face.onchange = () => {
  const L = layer();
  if (L) L.face = face.checked;
  changed();
};
const flip = $<HTMLInputElement>('altflip');
flip.onchange = () => {
  const L = layer();
  if (L) L.altFlip = flip.checked;
  changed();
};
$('addlayer').onclick = () => {
  if (st().layers.length >= MAX_LAYERS) return;
  st().layers.push(newLayer());
  layerIx = st().layers.length - 1;
  changed();
};
$('dellayer').onclick = () => {
  if (!layer()) return;
  st().layers.splice(layerIx, 1);
  layerIx = Math.max(0, layerIx - 1);
  changed();
};
$('copystage').onclick = () => {
  const src = clone(st());
  const fam = data[entry.key]!;
  data[entry.key] = fam.map((s, i) => {
    if (i === stageIx) return src;
    const out = { ...s, layers: clone(src.layers) };
    fitStage(out);
    return out;
  });
  changed();
  status(`${stageIx + 1}블록 이펙트를 1·2·3블록에 복사했다 (타격 수·간격·시전 속도는 그대로)`);
};
$('play').onclick = () => setPlaying(!playing);
$<HTMLInputElement>('repeat').onchange = (ev) => (repeat = (ev.target as HTMLInputElement).checked);
$<HTMLInputElement>('scrub').oninput = (ev) => {
  setPlaying(false);
  t = Number((ev.target as HTMLInputElement).value);
  draw();
};
$('reset').onclick = () => {
  data[entry.key] = clone(D.defaults[entry.key]!);
  layerIx = 0;
  changed();
  status(`${entry.label} 을(를) 처음 값으로 되돌렸다`);
};

function refresh(): void {
  if (bgImg.getAttribute('src') !== entry.bg) bgImg.src = entry.bg;
  mountHero();
  for (const b of $('chars').querySelectorAll<HTMLElement>('.chip')) b.setAttribute('aria-pressed', String(b.dataset.char === charId));
  for (const b of $('stages').querySelectorAll<HTMLElement>('.chip')) b.setAttribute('aria-pressed', String(Number(b.dataset.stage) === stageIx));
  for (const b of $('elements').querySelectorAll<HTMLElement>('.chip')) b.setAttribute('aria-pressed', String(b.dataset.el === element));
  const tabs = $('layertabs');
  tabs.replaceChildren();
  st().layers.forEach((L, i) => {
    const b = h('button', 'chip', `${i + 1} · ${EFFECTS[L.fx]?.meta.name ?? L.fx}`);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(i === layerIx));
    b.onclick = () => {
      layerIx = i;
      refresh();
    };
    tabs.append(b);
  });
  if (!st().layers.length) tabs.append(h('span', 'dim', '이펙트 없음 — [이펙트 추가]'));
  ($('addlayer') as HTMLButtonElement).disabled = st().layers.length >= MAX_LAYERS;
  const L = layer();
  ($('dellayer') as HTMLButtonElement).disabled = !L;
  fxSel.disabled = !L;
  fxSearch.disabled = !L;
  fillFx(fxSearch.value);
  flip.checked = !!L?.altFlip;
  flip.disabled = !L;
  syncHits();
  syncBodySel();
  syncBody();
  syncGaps();
  syncOn();
  syncLayer();
  syncColor();
  syncAnchor();
  syncMove();
  syncSync();
  syncFly();
  const isFly = L?.move === 'fly';
  $('flyedit').hidden = !isFly;
  $('anchorseg').hidden = isFly;
  $('syncseg').hidden = isFly || !st().layers.some((x) => x.move === 'fly');
  face.checked = !!L?.face;
  $('summary').textContent = summary();
  layout();
}
const summary = (): string => {
  const s = st();
  const ls = s.layers.map((L, i) => `${i + 1}) ${L.fx} · ${L.move === 'fly' ? `날아감 ${L.travel}ms 곡선 ${L.arc} 도착 ${L.tx},${L.ty}${L.ex || L.ey ? ` 사라짐 도착+${L.ex},${L.ey}` : ''}${L.face ? ' 방향 돌림' : ''}` : `${L.anchor === 'target' ? '맞는 쪽' : '치는 쪽'}${L.sync === 'arrive' ? ' · 도착 때' : ''}`} · ${L.on.length ? L.on.map((x) => `${x + 1}타`).join('·') : '나오는 타격 없음'} · ${L.color === 'element' ? '속성 색' : '원래 색'} · 자리 ${L.dx},${L.dy} · 크기 ${L.scale} · ${L.angle}° · 늦춤 ${L.delay}ms · 재생 속도 ${L.rate} · 레이어 ${L.z ?? 3}${L.altFlip ? ' · 연타 뒤집기' : ''}`);
  const b = bodyOf(s);
  const body = b ? ` · 몸동작 ${b.label} ${s.bodyAt}ms${s.bodyFromHit ? ' 타격부터' : ''}` : ' · 몸동작 게임 기본';
  return `${entry.label} ${stageIx + 1}블록 · 타격 ${s.hits}번 · 간격 ${s.gaps.join('/') || '-'}ms · 시전 속도 ${s.speed}${body}${ls.length ? `\n${ls.join('\n')}` : ''}`;
};

// ── 저장 ──
type Db = { doc(path: string): DocRef } | null;
let db: Db = null;
let saveTimer = 0;
function status(text: string): void {
  $('status').textContent = text;
}
function changed(): void {
  refresh();
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(saveDraft, 700);
}
const body = () => ({ stamp: D.stamp, families: data, at: Date.now() });
async function saveDraft(): Promise<void> {
  try {
    localStorage.setItem(LS, JSON.stringify(body()));
  } catch {
    /* 저장소 없음 */
  }
  if (!db) return;
  try {
    await db.doc('fx/editor').set({ json: JSON.stringify(body()) });
    status('편집 값 저장됨 (확정 전)');
  } catch {
    status('서버 저장 실패 — 이 기기에만 남았다');
  }
}
$('fix').onclick = async () => {
  if (!db) return status('서버에 연결되지 않아 확정을 못 남겼다. [값 복사] 를 채팅에 붙여 보내 줘');
  try {
    const b = JSON.stringify(body());
    await db.doc('fx/fixed').set({ json: b });
    await db.doc('fx/editor').set({ json: b });
    const when = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    status(`확정됨 ${when} — 채팅에 "ㅇㅋ" 라고 하면 게임에 넣는다`);
  } catch {
    status('확정 저장 실패 — 다시 눌러 줘');
  }
};
$('copy').onclick = async () => {
  const text = JSON.stringify({ [entry.key]: data[entry.key] });
  try {
    await navigator.clipboard.writeText(text);
    status('이 계열 값을 복사했다');
  } catch {
    status(text);
  }
};
function load(saved: unknown): boolean {
  try {
    const b = (typeof saved === 'string' ? JSON.parse(saved) : saved) as { stamp?: string; families?: Record<string, FamilyFx> };
    if (!b || !b.families || (b.stamp !== D.stamp && b.stamp !== 'v2')) return false;
    for (const e of D.entries) {
      const fam = b.families[e.key];
      if (!Array.isArray(fam) || fam.length !== 3) continue;
      // v2 → v3: gapMs 하나 → 타격마다 간격, when(타격마다/첫/마지막) → 나오는 타격 목록, 시전 속도 1
      for (const s of fam as (StageFx & { gapMs?: number })[]) {
        if (!Array.isArray(s.gaps)) s.gaps = Array.from({ length: Math.max(0, s.hits - 1) }, () => s.gapMs ?? 100);
        delete s.gapMs;
        if (typeof s.speed !== 'number') s.speed = 1;
        Object.assign(s, { ...STAGE_BODY_DEFAULTS, ...s });
        for (const L of s.layers as (FxLayer & { when?: string })[]) {
          if (!Array.isArray(L.on)) L.on = L.when === 'first' ? [0] : L.when === 'last' ? [s.hits - 1] : Array.from({ length: s.hits }, (_, i) => i);
          delete L.when;
          Object.assign(L, { ...LAYER_DEFAULTS, ...L });
          L.fx = RENAMED[L.fx] ?? L.fx;
        }
        fitStage(s);
      }
      data[e.key] = fam;
    }
    return true;
  } catch {
    return false;
  }
}
try {
  load(localStorage.getItem(LS));
} catch {
  /* 저장소 없음 */
}
$('built').textContent = `${D.built} · pixelfx ${ids.length}개 · 분류 ${Object.keys(categories as object).length}개`;
refresh();
fit();
void (async () => {
  if (typeof claude === 'undefined') return status('이 기기에만 저장된다 (서버 없음)');
  db = (await claude.use('db').catch(() => null)) as Db;
  if (!db) return status('이 기기에만 저장된다 (서버 없음)');
  try {
    const d = await db.doc('fx/editor').get();
    if (d.exists && load(d.data()?.json)) {
      refresh();
      status('서버에 저장된 편집 값을 불러왔다');
    } else status('처음 값에서 시작');
  } catch {
    status('서버를 못 읽었다 — 처음 값에서 시작');
  }
})();
