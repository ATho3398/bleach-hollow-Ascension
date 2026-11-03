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
  when: 'each' | 'first' | 'last';
  delay: number;
  dx: number;
  dy: number;
  scale: number;
  angle: number;
  rate: number;
  altFlip: boolean;
}
interface StageFx { hits: number; gapMs: number; layers: FxLayer[] }
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
const LS = 'bha-fx-tool-v2';
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
const newLayer = (): FxLayer => ({ fx: 'impacts/hit-spark', color: 'original', anchor: 'target', when: 'each', delay: 0, dx: 0, dy: 0, scale: 1, angle: 0, rate: 1, altFlip: false });

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
let k = 1;
const fit = (): void => {
  k = stageBox.clientWidth / D.view.w;
  world.style.transform = `translate(${-D.view.x * k}px, ${-D.view.y * k}px) scale(${k})`;
  stageBox.style.height = `${D.view.h * k}px`;
};
new ResizeObserver(fit).observe(stageBox);

/** 재생 조각 하나 = 어떤 층이 어떤 타격에서 언제 시작하는지 */
interface Inst { L: FxLayer; start: number; f: Frames; cv: HTMLCanvasElement; ctx: CanvasRenderingContext2D; shown: number }
let insts: Inst[] = [];
let span = { from: 0, to: 800 };
const hitTimes = (s: StageFx): number[] => Array.from({ length: s.hits }, (_, i) => i * s.gapMs);

function layout(): void {
  for (const i of insts) i.cv.remove();
  insts = [];
  const s = st();
  const hits = hitTimes(s);
  const anchorOf = (L: FxLayer) => (L.anchor === 'attacker' ? D.attacker : D.target);
  let from = 0;
  let to = hits[hits.length - 1]! + 300;
  s.layers.forEach((L, li) => {
    const f = framesOf(L.fx, paletteOf(L));
    if (!f) return;
    const which = L.when === 'first' ? [0] : L.when === 'last' ? [hits.length - 1] : hits.map((_, i) => i);
    for (const hi of which) {
      const start = hits[hi]! + L.delay;
      const cv = h('canvas', 'pxfx');
      cv.width = f.w;
      cv.height = f.h;
      const a = anchorOf(L);
      const w = f.w * L.scale;
      const hh = f.h * L.scale;
      cv.style.cssText = `left:${a.x + L.dx - w / 2}px;top:${a.y + L.dy - hh / 2}px;width:${w}px;height:${hh}px;` +
        `transform:${pixelFxTransform(entry.dir < 0, L.altFlip && hi % 2 === 1, L.angle)};visibility:hidden`;
      if (li === layerIx) cv.classList.add('is-sel');
      world.insertBefore(cv, $('mark-t'));
      insts.push({ L, start, f, cv, ctx: cv.getContext('2d')!, shown: -1 });
      from = Math.min(from, start);
      to = Math.max(to, start + ((f.images.length / f.fps) * 1000) / L.rate);
    }
  });
  span = { from, to };
  if (t < from || t > to + 400) t = from;
  const L = layer();
  dot.hidden = !L;
  if (L) {
    const a = anchorOf(L);
    dot.style.left = `${a.x + L.dx}px`;
    dot.style.top = `${a.y + L.dy}px`;
  }
  draw();
}

function draw(): void {
  for (const i of insts) {
    const fi = Math.floor(((t - i.start) * i.L.rate * i.f.fps) / 1000);
    if (t < i.start || fi >= i.f.images.length) {
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
const syncHits = gauges<StageFx, 'hits' | 'gapMs'>($('hitbox'), [
  { key: 'hits', label: '타격 수', step: 1, min: 1, max: 6, unit: '번' },
  { key: 'gapMs', label: '연타 간격', step: 10, min: 0, max: 500, unit: 'ms' },
], st);
const syncLayer = gauges<FxLayer, 'dx' | 'dy' | 'scale' | 'angle' | 'delay' | 'rate'>($('layerbox'), [
  { key: 'dx', label: '가로', step: 1, min: -400, max: 400, unit: 'px', signed: true },
  { key: 'dy', label: '세로', step: 1, min: -200, max: 200, unit: 'px', signed: true },
  { key: 'scale', label: '크기', step: 0.25, min: 0.25, max: 6, unit: '배' },
  { key: 'angle', label: '각도', step: 1, min: -180, max: 180, unit: '°', signed: true },
  { key: 'delay', label: '늦춤', step: 10, min: -400, max: 800, unit: 'ms', signed: true },
  { key: 'rate', label: '속도', step: 0.05, min: 0.25, max: 3, unit: '배' },
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
function seg(host: string, items: [string, string][], key: 'color' | 'anchor' | 'when'): () => void {
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
const syncWhen = seg('whenseg', [['each', '타격마다'], ['first', '첫 타격'], ['last', '마지막 타격']], 'when');
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
  data[entry.key] = fam.map((s, i) => (i === stageIx ? src : { hits: s.hits, gapMs: s.gapMs, layers: clone(src.layers) }));
  changed();
  status(`${stageIx + 1}블록 이펙트를 1·2·3블록에 복사했다 (타격 수·간격은 그대로)`);
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
  syncLayer();
  syncColor();
  syncAnchor();
  syncWhen();
  $('summary').textContent = summary();
  layout();
}
const summary = (): string => {
  const s = st();
  const ls = s.layers.map((L, i) => `${i + 1}) ${L.fx} · ${L.anchor === 'target' ? '맞는 쪽' : '치는 쪽'} · ${{ each: '타격마다', first: '첫 타격', last: '마지막 타격' }[L.when]} · ${L.color === 'element' ? '속성 색' : '원래 색'} · 자리 ${L.dx},${L.dy} · 크기 ${L.scale} · ${L.angle}° · 늦춤 ${L.delay}ms · 속도 ${L.rate}${L.altFlip ? ' · 연타 뒤집기' : ''}`);
  return `${entry.label} ${stageIx + 1}블록 · 타격 ${s.hits}번 · 간격 ${s.gapMs}ms${ls.length ? `\n${ls.join('\n')}` : ''}`;
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
    if (!b || b.stamp !== D.stamp || !b.families) return false;
    for (const e of D.entries) if (Array.isArray(b.families[e.key]) && b.families[e.key]!.length === 3) data[e.key] = b.families[e.key]!;
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
