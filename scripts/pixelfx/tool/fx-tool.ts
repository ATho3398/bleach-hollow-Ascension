// 이펙트 배치 도구 (GDD 180장, 사용자 2026-11-04 "툴에다 먼저 구현하면 내가 위치랑 크기, 각도 조정해서 ㅇㅋ하면 그때 적용해라")
// 실제 전투 화면(1배 844×390 캡처) 위에서 계열 공격의 도트 자국을 게임과 같은 식(pixelFx.ts)으로 재생하고,
// 자리(dx·dy)·크기·각도·3단계 마지막 크기·연타 뒤집기를 맞춘다. 값은 아티팩트 db `fx/editor`(편집 중)·`fx/fixed`(확정)에 남고
// Claude 가 `fx/fixed` 를 읽어 종족 설정 families[].pixelFx 에 넣는다 (scripts/pixelfx/tool/README.md).
import { frameAt, framePos, pixelFxTransform, sheetDurationMs, type PixelFxSheet } from '../../../src/ui/bha/pixelFx';
import { familyHits } from '../../../src/ui/attackFx';
import type { FamilyPixelFx } from '../../../src/engine/faction';

interface Entry { key: string; label: string; dir: 1 | -1; place: FamilyPixelFx }
interface ToolData {
  bg: string;
  stage: { w: number; h: number };
  /** 무대에 보여 줄 부분(전투 장면 칸) — 폰에서 크게 보이게 */
  view: { x: number; y: number; w: number; h: number };
  target: { x: number; y: number };
  elements: { id: string; name: string; color: string }[];
  entries: Entry[];
  sheets: Record<string, PixelFxSheet & { url: string }>;
  stamp: string;
  built: string;
}
declare const FX_DATA: ToolData;
type DocRef = { get(): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>; set(d: Record<string, unknown>): Promise<void> };
declare const claude: { use(name: 'db'): Promise<{ doc(path: string): DocRef } | null> } | undefined;

const D = FX_DATA;
const LS = 'bha-fx-tool-v1';
type Places = Record<string, FamilyPixelFx>;
const gamePlaces = (): Places => Object.fromEntries(D.entries.map((e) => [e.key, { ...e.place }]));
let places: Places = gamePlaces();
let entry = D.entries[0]!;
let element = D.elements[0]!.id;
let stage = 1;
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
const cur = (): FamilyPixelFx => places[entry.key]!;
const sheetOf = (): (PixelFxSheet & { url: string }) | null => D.sheets[`${cur().sheet}-${element}`] ?? null;

// ── 무대 ──
const world = $('world');
const stageBox = $('stage');
(world.querySelector('img') as HTMLImageElement).src = D.bg;
world.style.width = `${D.stage.w}px`;
world.style.height = `${D.stage.h}px`;
const cross = $('cross');
cross.style.left = `${D.target.x}px`;
cross.style.top = `${D.target.y}px`;
const dot = $('dot');
let k = 1;
const fit = (): void => {
  k = stageBox.clientWidth / D.view.w;
  world.style.transform = `translate(${-D.view.x * k}px, ${-D.view.y * k}px) scale(${k})`;
  stageBox.style.height = `${D.view.h * k}px`;
};
new ResizeObserver(fit).observe(stageBox);

let hitEls: HTMLElement[] = [];
const hitsNow = () => familyHits(stage, 0);
const totalMs = (): number => {
  const s = sheetOf();
  const hs = hitsNow();
  return (s ? sheetDurationMs(s) : 800) + hs[hs.length - 1]!.atMs;
};

/** 자국 상자를 다시 만든다 (값·속성·단계가 바뀔 때). 위치·크기·뒤집기·각도 = 게임 pixelMark 와 같은 식 */
function layout(): void {
  for (const e of hitEls) e.remove();
  hitEls = [];
  const s = sheetOf();
  const p = cur();
  dot.style.left = `${D.target.x + p.dx}px`;
  dot.style.top = `${D.target.y + p.dy}px`;
  if (!s) return;
  const hs = hitsNow();
  hs.forEach((_, i) => {
    const big = stage >= 3 && i === hs.length - 1;
    const sc = big ? p.bigScale : p.scale;
    const w = s.frame[0] * sc;
    const hh = s.frame[1] * sc;
    const n = h('div', 'pxfx');
    const rows = Math.ceil(s.frames / s.columns);
    n.style.cssText = `left:${D.target.x + p.dx - w / 2}px;top:${D.target.y + p.dy - hh / 2}px;width:${w}px;height:${hh}px;` +
      `background-image:url("${s.url}");background-size:${s.columns * s.frame[0] * sc}px ${rows * s.frame[1] * sc}px;` +
      `transform:${pixelFxTransform(entry.dir < 0, p.altFlip && i % 2 === 1, p.angle)};visibility:hidden`;
    n.dataset.sc = String(sc);
    world.insertBefore(n, cross);
    hitEls.push(n);
  });
  draw();
}

/** 지금 시각 t 의 프레임 */
function draw(): void {
  const s = sheetOf();
  if (!s) return;
  const hs = hitsNow();
  hitEls.forEach((n, i) => {
    const f = frameAt(s.durations, t - hs[i]!.atMs, false);
    if (t < hs[i]!.atMs || f < 0) {
      n.style.visibility = 'hidden';
      return;
    }
    const sc = Number(n.dataset.sc);
    const [fx, fy] = framePos(s, f);
    n.style.backgroundPosition = `${-fx * sc}px ${-fy * sc}px`;
    n.style.visibility = 'visible';
  });
  const tot = totalMs();
  const scrub = $<HTMLInputElement>('scrub');
  scrub.max = String(tot);
  scrub.value = String(Math.min(t, tot));
  $('time').textContent = `${Math.round(Math.min(t, tot))} / ${tot}ms`;
}

let last = performance.now();
const tick = (now: number): void => {
  const dt = now - last;
  last = now;
  if (playing) {
    t += dt;
    const tot = totalMs();
    if (t > tot + 500) {
      if (repeat) t = 0;
      else {
        t = tot;
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
  $('play').setAttribute('aria-pressed', String(on));
}

// 무대 끌기 = 자리 옮기기
let drag: { x: number; y: number; dx: number; dy: number } | null = null;
stageBox.addEventListener('pointerdown', (ev) => {
  drag = { x: ev.clientX, y: ev.clientY, dx: cur().dx, dy: cur().dy };
  stageBox.setPointerCapture(ev.pointerId);
});
stageBox.addEventListener('pointermove', (ev) => {
  if (!drag) return;
  cur().dx = Math.round(drag.dx + (ev.clientX - drag.x) / k);
  cur().dy = Math.round(drag.dy + (ev.clientY - drag.y) / k);
  changed();
});
const endDrag = () => (drag = null);
stageBox.addEventListener('pointerup', endDrag);
stageBox.addEventListener('pointercancel', endDrag);

// ── 조절 칸 ──
interface Field { key: 'dx' | 'dy' | 'scale' | 'angle' | 'bigScale'; label: string; step: number; min: number; max: number; unit: string }
const FIELDS: Field[] = [
  { key: 'dx', label: '가로', step: 1, min: -300, max: 300, unit: 'px' },
  { key: 'dy', label: '세로', step: 1, min: -150, max: 150, unit: 'px' },
  { key: 'scale', label: '크기', step: 0.25, min: 0.25, max: 6, unit: '배' },
  { key: 'angle', label: '각도', step: 1, min: -180, max: 180, unit: '°' },
  { key: 'bigScale', label: '3단계 마지막', step: 0.25, min: 0.25, max: 8, unit: '배' },
];
/** 게이지(슬라이더) 한 줄: 이름 · 게이지 · 값 */
const inputs = new Map<Field['key'], { range: HTMLInputElement; out: HTMLOutputElement; f: Field }>();
for (const f of FIELDS) {
  const row = h('div', 'field');
  const lab = h('label', '', f.label);
  lab.htmlFor = `f-${f.key}`;
  const range = h('input');
  range.id = `f-${f.key}`;
  range.type = 'range';
  range.min = String(f.min);
  range.max = String(f.max);
  range.step = String(f.step);
  const out = h('output', 'val');
  out.htmlFor.add(range.id);
  range.oninput = () => {
    cur()[f.key] = Number(range.value);
    changed();
  };
  row.append(lab, range, out);
  $('fields').append(row);
  inputs.set(f.key, { range, out, f });
}
const flipBox = $<HTMLInputElement>('altflip');
flipBox.onchange = () => {
  cur().altFlip = flipBox.checked;
  changed();
};

// 속성·단계·계열 고르기
for (const el of D.elements) {
  const b = h('button', 'chip', el.name);
  b.type = 'button';
  b.style.setProperty('--c', el.color);
  b.dataset.el = el.id;
  b.onclick = () => {
    element = el.id;
    t = 0;
    refresh();
  };
  $('elements').append(b);
}
for (const n of [1, 2, 3]) {
  const b = h('button', 'chip', n === 1 ? '1단계 · 한 번' : n === 2 ? '2단계 · 3연타' : '3단계 · 마지막 크게');
  b.type = 'button';
  b.dataset.stage = String(n);
  b.onclick = () => {
    stage = n;
    t = 0;
    refresh();
  };
  $('stages').append(b);
}
const sel = $<HTMLSelectElement>('entry');
for (const e of D.entries) sel.append(new Option(e.label, e.key));
sel.onchange = () => {
  entry = D.entries.find((e) => e.key === sel.value) ?? entry;
  t = 0;
  refresh();
};
$('play').onclick = () => setPlaying(!playing);
$<HTMLInputElement>('repeat').onchange = (ev) => (repeat = (ev.target as HTMLInputElement).checked);
$<HTMLInputElement>('scrub').oninput = (ev) => {
  setPlaying(false);
  t = Number((ev.target as HTMLInputElement).value);
  draw();
};
$('reset').onclick = () => {
  places[entry.key] = { ...gamePlaces()[entry.key]! };
  changed();
  status('게임 값으로 되돌렸다');
};

function refresh(): void {
  for (const b of $('elements').querySelectorAll<HTMLElement>('.chip')) b.setAttribute('aria-pressed', String(b.dataset.el === element));
  for (const b of $('stages').querySelectorAll<HTMLElement>('.chip')) b.setAttribute('aria-pressed', String(Number(b.dataset.stage) === stage));
  const p = cur();
  for (const { range, out, f } of inputs.values()) {
    range.value = String(p[f.key]);
    out.textContent = `${f.key === 'dx' || f.key === 'dy' ? sign(p[f.key]) : p[f.key]}${f.unit}`;
  }
  flipBox.checked = p.altFlip;
  $('summary').textContent = summary(p);
  layout();
}
const sign = (v: number) => (v > 0 ? `+${v}` : String(v));
const summary = (p: FamilyPixelFx) =>
  `${entry.label} · 가로 ${sign(p.dx)} · 세로 ${sign(p.dy)} · 크기 ${p.scale} · 각도 ${p.angle}° · 3단계 마지막 ${p.bigScale} · 연타 뒤집기 ${p.altFlip ? '켬' : '끔'}`;

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
async function saveDraft(): Promise<void> {
  const body = { stamp: D.stamp, places, at: Date.now() };
  try {
    localStorage.setItem(LS, JSON.stringify(body));
  } catch {
    /* 저장소 없음 */
  }
  if (!db) return;
  try {
    await db.doc('fx/editor').set({ json: JSON.stringify(body) });
    status('편집 값 저장됨 (확정 전)');
  } catch {
    status('서버 저장 실패 — 이 기기에만 남았다');
  }
}
$('fix').onclick = async () => {
  const body = { stamp: D.stamp, places, at: Date.now() };
  if (!db) {
    status('서버에 연결되지 않아 확정을 못 남겼다. 아래 값을 채팅에 붙여 보내 줘');
    return;
  }
  try {
    await db.doc('fx/fixed').set({ json: JSON.stringify(body) });
    await db.doc('fx/editor').set({ json: JSON.stringify(body) });
    const when = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    status(`확정됨 ${when} — 채팅에 "ㅇㅋ" 라고 하면 게임에 넣는다`);
  } catch {
    status('확정 저장 실패 — 다시 눌러 줘');
  }
};
$('copy').onclick = async () => {
  const text = JSON.stringify(places[entry.key]);
  try {
    await navigator.clipboard.writeText(text);
    status('값을 복사했다');
  } catch {
    status(text);
  }
};

function load(saved: unknown): boolean {
  try {
    const b = (typeof saved === 'string' ? JSON.parse(saved) : saved) as { stamp?: string; places?: Places };
    if (!b || b.stamp !== D.stamp || !b.places) return false; // 게임 값이 바뀐 뒤의 옛 저장은 버린다
    for (const e of D.entries) if (b.places[e.key]) places[e.key] = { ...e.place, ...b.places[e.key] };
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
$('built').textContent = D.built;
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
    } else status('게임 값에서 시작');
  } catch {
    status('서버를 못 읽었다 — 게임 값에서 시작');
  }
})();
