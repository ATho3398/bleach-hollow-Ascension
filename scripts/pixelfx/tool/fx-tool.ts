// 이펙트 배치 도구 v2 (GDD 180장): pixelfx 244개를 브라우저에서 바로 그려(코드 그대로, 그림 파일 없음) 실제 전투 1배 화면 위에 올린다.
// 공격 계열 6개(사신 참·권·귀, 호로 교·조·탄) × 1·2·3블록마다: 연타 수·간격 + 이펙트 최대 3개(기준 = 맞는 쪽/치는 쪽, 나오는 때, 자리·크기·각도·늦춤·속도·색).
// 값은 아티팩트 db `fx/editor`(편집 중)·`fx/fixed`(확정). 사용자가 "ㅇㅋ" 하면 Claude 가 `fx/fixed` 를 게임 데이터·시트로 옮긴다 (README.md).
import { effects, categories } from '../../../vendor/pixelfx/src/fx/index.js';
import { clearFrame, composite, createFrame, createFx } from '../../../vendor/pixelfx/src/core/index.js';
import { pixelFxTransform } from '../../../src/ui/bha/pixelFx';

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
  face: boolean;
  /** 시작 기준: hit = 타격 때, arrive = 이 블록 첫 투사체가 도착할 때(같은 타격) */
  sync: 'hit' | 'arrive';
}
/** 옛 저장·새 이펙트에 없는 칸 채우기 */
const LAYER_DEFAULTS = { move: 'stay', travel: 300, arc: 0, tx: 0, ty: 0, face: true, sync: 'hit' } as const;
/** 한 블록 공격: 타격 수 · 타격 사이 간격(타격마다 따로) · 시전 속도(공격 전체 빠르기, 이펙트 재생도 같이) · 이펙트 */
interface StageFx { hits: number; gaps: number[]; speed: number; layers: FxLayer[] }
type FamilyFx = StageFx[];
interface Entry { key: string; label: string; faction: string; bg: string; dir: 1 | -1 }
interface ToolData {
  stage: { w: number; h: number };
  view: { x: number; y: number; w: number; h: number };
  target: { x: number; y: number };
  attacker: { x: number; y: number };
  elements: { id: string; name: string; color: string; palette: string[] }[];
  entries: Entry[];
  defaults: Record<string, FamilyFx>;
  catNames: Record<string, string>;
  stamp: string;
  built: string;
}
declare const FX_DATA: ToolData;
type DocRef = { get(): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>; set(d: Record<string, unknown>): Promise<void> };
declare const claude: { use(name: 'db'): Promise<{ doc(path: string): DocRef } | null> } | undefined;

type Mod = { meta: { name?: string; size: [number, number]; origin: [number, number]; fps?: number; duration?: number; loop?: boolean; options?: Record<string, unknown> } };
const EFFECTS = effects as Record<string, Mod>;
const D = FX_DATA;
const LS = 'bha-fx-tool-v3';
const MAX_LAYERS = 3;
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
const st = (): StageFx => data[entry.key]![stageIx]!;
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
function framesOf(id: string, palette: string[] | null): Frames | null {
  const key = `${id}|${palette?.join(',') ?? ''}`;
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
const dot2 = $('dot2');
let k = 1;
const fit = (): void => {
  k = stageBox.clientWidth / D.view.w;
  world.style.transform = `translate(${-D.view.x * k}px, ${-D.view.y * k}px) scale(${k})`;
  stageBox.style.height = `${D.view.h * k}px`;
};
new ResizeObserver(fit).observe(stageBox);

/** 재생 조각 하나 = 어떤 층이 어떤 타격에서 언제 시작하는지 */
interface Inst { L: FxLayer; rate: number; start: number; hi: number; fly: { from: { x: number; y: number }; to: { x: number; y: number }; ms: number } | null; f: Frames; cv: HTMLCanvasElement; ctx: CanvasRenderingContext2D; shown: number }
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
    const f = framesOf(L.fx, paletteOf(L));
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
      const fly = L.move === 'fly'
        ? { from: { x: D.attacker.x + L.dx, y: D.attacker.y + L.dy }, to: { x: D.target.x + L.tx, y: D.target.y + L.ty }, ms: Math.max(1, L.travel / s.speed) }
        : null;
      if (!fly) {
        const a = anchorOf(L);
        place(cv, a.x + L.dx, a.y + L.dy, w, hh, pixelFxTransform(entry.dir < 0, L.altFlip && hi % 2 === 1, L.angle));
      }
      if (li === layerIx) cv.classList.add('is-sel');
      world.insertBefore(cv, $('mark-t'));
      const rate = L.rate * s.speed;
      insts.push({ L, rate, start, hi, fly, f, cv, ctx: cv.getContext('2d')!, shown: -1 });
      from = Math.min(from, start);
      to = Math.max(to, start + (fly ? fly.ms : ((f.images.length / f.fps) * 1000) / rate));
    }
  });
  span = { from, to };
  if (t < from || t > to + 400) t = from;
  const L = layer();
  dot.hidden = !L;
  dot2.hidden = !L || L.move !== 'fly';
  if (L) {
    const a = L.move === 'fly' ? D.attacker : anchorOf(L);
    dot.style.left = `${a.x + L.dx}px`;
    dot.style.top = `${a.y + L.dy}px`;
    dot2.style.left = `${D.target.x + L.tx}px`;
    dot2.style.top = `${D.target.y + L.ty}px`;
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
      if (el < 0 || el > i.fly.ms) {
        i.cv.style.visibility = 'hidden';
        continue;
      }
      fi %= n;
      const p = el / i.fly.ms;
      const { from: A, to: B } = i.fly;
      const x = A.x + (B.x - A.x) * p;
      const y = A.y + (B.y - A.y) * p - i.L.arc * 4 * p * (1 - p);
      const vx = B.x - A.x;
      const vy = B.y - A.y - i.L.arc * 4 * (1 - 2 * p);
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
    t += dt;
    if (t > span.to + 400) {
      if (repeat) t = span.from;
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
  $('play').textContent = on ? '멈춤' : '재생';
}

// 무대 끌기 = 고른 이펙트 자리 옮기기
let drag: { x: number; y: number; dx: number; dy: number } | null = null;
stageBox.addEventListener('pointerdown', (ev) => {
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
    row.append(lab, r, out);
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
      row.append(lab, r, h('output', 'val'));
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
const syncLayer = gauges<FxLayer, 'dx' | 'dy' | 'scale' | 'angle' | 'delay' | 'rate'>($('layerbox'), [
  { key: 'dx', label: '가로', step: 1, min: -400, max: 400, unit: 'px', signed: true },
  { key: 'dy', label: '세로', step: 1, min: -200, max: 200, unit: 'px', signed: true },
  { key: 'scale', label: '크기', step: 0.25, min: 0.25, max: 6, unit: '배' },
  { key: 'angle', label: '각도', step: 1, min: -180, max: 180, unit: '°', signed: true },
  { key: 'delay', label: '늦춤', step: 10, min: -400, max: 800, unit: 'ms', signed: true },
  { key: 'rate', label: '재생 속도', step: 0.05, min: 0.25, max: 3, unit: '배' },
], layer);
const syncFly = gauges<FxLayer, 'travel' | 'arc' | 'tx' | 'ty'>($('flybox'), [
  { key: 'travel', label: '비행 시간', step: 10, min: 50, max: 1500, unit: 'ms' },
  { key: 'arc', label: '곡선 높이', step: 2, min: -150, max: 200, unit: 'px', signed: true },
  { key: 'tx', label: '도착 가로', step: 1, min: -200, max: 200, unit: 'px', signed: true },
  { key: 'ty', label: '도착 세로', step: 1, min: -150, max: 150, unit: 'px', signed: true },
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
const ids = Object.keys(EFFECTS).sort();
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
    const out = { hits: s.hits, gaps: s.gaps, speed: s.speed, layers: clone(src.layers) };
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
  const ls = s.layers.map((L, i) => `${i + 1}) ${L.fx} · ${L.move === 'fly' ? `날아감 ${L.travel}ms 곡선 ${L.arc} 도착 ${L.tx},${L.ty}${L.face ? ' 방향 돌림' : ''}` : `${L.anchor === 'target' ? '맞는 쪽' : '치는 쪽'}${L.sync === 'arrive' ? ' · 도착 때' : ''}`} · ${L.on.length ? L.on.map((x) => `${x + 1}타`).join('·') : '나오는 타격 없음'} · ${L.color === 'element' ? '속성 색' : '원래 색'} · 자리 ${L.dx},${L.dy} · 크기 ${L.scale} · ${L.angle}° · 늦춤 ${L.delay}ms · 재생 속도 ${L.rate}${L.altFlip ? ' · 연타 뒤집기' : ''}`);
  return `${entry.label} ${stageIx + 1}블록 · 타격 ${s.hits}번 · 간격 ${s.gaps.join('/') || '-'}ms · 시전 속도 ${s.speed}${ls.length ? `\n${ls.join('\n')}` : ''}`;
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
        for (const L of s.layers as (FxLayer & { when?: string })[]) {
          if (!Array.isArray(L.on)) L.on = L.when === 'first' ? [0] : L.when === 'last' ? [s.hits - 1] : Array.from({ length: s.hits }, (_, i) => i);
          delete L.when;
          Object.assign(L, { ...LAYER_DEFAULTS, ...L });
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
