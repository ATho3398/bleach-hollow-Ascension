// 종이인형 관절 편집기 (시험용 페이지) — 게임 코드의 pose.ts 를 그대로 쓴다
import { HUMANOID, MOTIONS, bodyBones, boneMatrices, hairRect, insideFrame, layerMatrix, lookLayers, samplePose, type BodyJoints, type PartArt, type Pose, type Rig } from '../../src/data/art/rig/pose';

declare const ART_MAP: Record<string, string>;
/** claude.ai 아티팩트 런타임(있을 때만). db = 편집기 값을 서버에 저장 — 다른 기기·Claude 가 읽는다 */
type DocRef = { get(): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>; set(d: Record<string, unknown>): Promise<void> };
type Comments = {
  canSendToClaude(): Promise<string>;
  anchorFor(el: Element): Promise<unknown>;
  sendToClaude(t: { anchor: unknown; text: string }): Promise<{ threadId: string }>;
};
declare const claude: {
  use(name: 'db'): Promise<{ doc(path: string): DocRef } | null>;
  use(name: 'comments'): Promise<Comments | null>;
} | undefined;
/** '고정' 누르면 여기에 그때 값을 남기고 Claude 에게 알린다 → Claude 가 게임 데이터에 넣는다 */
const FIX_DOC = 'rig/fixed';
const DB_DOC = 'rig/editor';
const K = 6;
const NAMES: Record<string, string> = { root: '전체', torso: '몸통', head: '머리', arm_L: '왼팔', arm_R: '오른 위팔', leg_L: '왼다리', leg_R: '오른다리', hair: '일반머리', hair_back: '뒷머리', outer_torso: '겉옷(몸)', outer_arm_L: '겉옷(왼팔)', outer_arm_R: '겉옷(오른팔)', foot_L: '왼발', foot_R: '오른발', weapon: '칼', scabbard: '칼집', thumb_L: '엄지', forearm_R: '오른 아래팔' };
// 저장 칸 이름은 바꾸지 않는다(바꾸면 사용자가 맞춘 값이 사라진다). 옛 이름(v1~v3)에 남은 값도 읽어 온다
const STORE = 'bha-rig-editor';
const LEGACY = ['bha-rig-editor-v3', 'bha-rig-editor-v2', 'bha-rig-editor-v1'];
/** 저장 = 절대값(관절·부위 자리·외형 층 자리·앞뒤 순서) + 그때의 게임 데이터 표시(dataStamp).
 * 게임 데이터가 바뀌었으면(Claude 가 사용자 값을 넣었거나 새 시트) 이 기기에 남은 옛 저장은 버리고 데이터 값을 쓴다 —
 * 서버 저장은 Claude 가 데이터를 바꿀 때마다 같이 맞춘다 */
type Saved = Partial<Rig> & { dataStamp?: string; slotsEdited?: boolean };
let slotsEdited = false;
const DATA_STAMP = (() => {
  let h = 2166136261;
  const t = JSON.stringify(HUMANOID);
  for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
})();
const LOOK_PARTS = ['hair', 'hair_back', 'weapon', 'scabbard'] as const;

const rig: Rig = JSON.parse(JSON.stringify(HUMANOID));
function merge(s: Saved): boolean {
  if (s.dataStamp !== DATA_STAMP) return false;
  if (s.bones) for (const b of rig.bones) {
    const v = s.bones.find((x) => x.id === b.id);
    if (v) b.pivot = v.pivot; // 쉬는 각도(restRot)는 편집기에서 안 바꾸므로 데이터 값
  }
  // 몸별 관절(자리·기본 각도): 있는 몸·뼈만
  if (s.bodyJoints) for (const [bid, j] of Object.entries(s.bodyJoints)) {
    if (!rig.bodies[bid] || typeof j !== 'object') continue;
    const ok = (k: string) => rig.bones.some((b) => b.id === k);
    rig.bodyJoints ??= {};
    rig.bodyJoints[bid] = {
      pivots: Object.fromEntries(Object.entries(j.pivots ?? {}).filter(([k]) => ok(k))),
      rot: Object.fromEntries(Object.entries(j.rot ?? {}).filter(([k]) => ok(k))),
    };
  }
  if (s.slots && s.slotsEdited) {
    slotsEdited = true;
    const order = s.slots.map((x) => x.id).filter((id) => rig.slots.some((y) => y.id === id));
    rig.slots = [...order.map((id) => rig.slots.find((y) => y.id === id)!), ...rig.slots.filter((y) => !order.includes(y.id))];
  }
  if (s.bodies) for (const [b, parts] of Object.entries(rig.bodies)) {
    for (const [k, cur] of Object.entries(parts)) { const v = s.bodies[b]?.[k]; if (v) cur.at = [v.at[0], v.at[1]]; }
  }
  if (s.looks) for (const [lid, lk] of Object.entries(rig.looks)) {
    for (const k of LOOK_PARTS) {
      const v = s.looks[lid]?.[k];
      const cur = lk[k];
      if (typeof cur === 'object' && typeof v === 'object') cur.at = [v.at[0], v.at[1]];
    }
  }
  return true;
}
function resetRig() {
  const fresh: Rig = JSON.parse(JSON.stringify(HUMANOID));
  rig.bones = fresh.bones; rig.slots = fresh.slots; rig.bodies = fresh.bodies; rig.looks = fresh.looks; rig.bodyJoints = fresh.bodyJoints; slotsEdited = false;
}
try {
  const raw = localStorage.getItem(STORE);
  if (raw) merge(JSON.parse(raw) as Saved);
} catch { /* 저장 못 쓰는 환경 */ }

let look = 'arrancar-base';
let sel = 'arm_L';
let mode: 'pivot' | 'part' = 'pivot';
let testRot = 0;
let motion: string | null = null;
let mt = 0;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const stage = $('stage');
const out = $<HTMLTextAreaElement>('out');
const [W, H] = rig.canvas;
stage.style.width = `${W * K}px`;
stage.style.height = `${H * K}px`;

let dbRef: DocRef | null = null;
let dbTimer = 0;
const state = () => JSON.stringify({ bones: rig.bones, slots: rig.slots, bodies: rig.bodies, looks: rig.looks, bodyJoints: rig.bodyJoints, dataStamp: DATA_STAMP, slotsEdited });
function save(user = true) {
  const st = state();
  try { localStorage.setItem(STORE, st); } catch { /* 무시 */ }
  // 사용자가 바꾼 것만 서버에 (잠깐 모아서 한 번)
  if (user && dbRef) {
    clearTimeout(dbTimer);
    const ref = dbRef;
    dbTimer = window.setTimeout(() => { ref.set({ json: st, savedAt: Date.now() }).then(() => setSync('서버 저장됨'), () => setSync('서버 저장 실패 — 이 기기에만 저장')); }, 600);
  }
  const body = rig.looks[look]!.body;
  out.value = JSON.stringify({
    bones: rig.bones.map((b) => ({ id: b.id, parent: b.parent, pivot: b.pivot })),
    slots: rig.slots.map((s) => s.id),
    body,
    parts: Object.fromEntries(Object.entries(rig.bodies[body]!).map(([k, v]) => [k, v.at])),
    look,
    hair: (rig.looks[look]!.hair as PartArt | undefined)?.at,
    hair_back: (rig.looks[look]!.hair_back as PartArt | undefined)?.at,
    weapon: (rig.looks[look]!.weapon as PartArt | undefined)?.at,
    scabbard: (rig.looks[look]!.scabbard as PartArt | undefined)?.at,
    joints: rig.bodyJoints?.[body],
  });
}

/** 지금 외형의 몸 */
const curBody = () => rig.looks[look]!.body;
/** 이 몸의 관절(따로 맞춘 칸) — 관절을 옮기거나 기본 각도를 바꾸면 이 몸에만 들어간다(사용자 2026-10-29, 남녀 관절이 따로) */
function joints(): BodyJoints {
  rig.bodyJoints ??= {};
  const j = rig.bodyJoints[curBody()];
  if (typeof j === 'object') return j;
  const n: BodyJoints = { pivots: {}, rot: {} };
  rig.bodyJoints[curBody()] = n;
  return n;
}
/** 이 몸에서의 뼈(관절 자리·쉬는 각도) */
function bone(id: string) { return bodyBones(rig, curBody()).find((b) => b.id === id)!; }
function setPivot(id: string, p: [number, number]) { (joints().pivots ??= {})[id] = p; }
function baseRot(id: string) { return (rig.bodyJoints?.[curBody()] as BodyJoints | undefined)?.rot?.[id] ?? 0; }
function boneOfSel() { return rig.slots.find((s) => s.id === sel)?.bone ?? sel; }

/** 지금 그려진 층(앞뒤 순서대로) — 미리보기를 눌러 부위 고르기용 */
let drawn: { slot: string; m: number[]; img: HTMLImageElement; size: [number, number] }[] = [];
const alphaCache = new Map<string, ImageData>();
/** 캔버스 좌표 (x, y) 에서 가장 앞에 보이는 부위(투명 칸은 지나침) */
function slotAt(x: number, y: number): string | null {
  for (let i = drawn.length - 1; i >= 0; i--) {
    const { slot, m, img, size } = drawn[i]!;
    const det = m[0]! * m[3]! - m[1]! * m[2]!;
    if (!det) continue;
    const dx = x - m[4]!, dy = y - m[5]!;
    const u = (m[3]! * dx - m[2]! * dy) / det;
    const v = (-m[1]! * dx + m[0]! * dy) / det;
    if (u < 0 || v < 0 || u >= size[0] || v >= size[1]) continue;
    let data = alphaCache.get(img.src);
    if (!data && img.complete && img.naturalWidth) {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const ctx = c.getContext('2d');
      if (ctx) { ctx.drawImage(img, 0, 0); data = ctx.getImageData(0, 0, c.width, c.height); alphaCache.set(img.src, data); }
    }
    if (!data || data.data[(Math.floor(v) * data.width + Math.floor(u)) * 4 + 3]! > 0) return slot;
  }
  return null;
}

function draw() {
  stage.querySelectorAll('img, .dot').forEach((n) => n.remove());
  let pose: Pose = {};
  if (motion) pose = samplePose(rig, MOTIONS[motion]!, mt);
  else if (testRot) pose = { [boneOfSel()]: { rot: testRot, x: 0, y: 0 } };
  const mats = boneMatrices(rig, pose, curBody());
  drawn = [];
  for (const l of lookLayers(rig, look)) {
    const img = document.createElement('img');
    img.src = ART_MAP[`art/rig/humanoid/${l.art}.png`] ?? '';
    img.className = 'part' + (l.slot === sel ? ' sel' : '');
    img.style.width = `${l.size[0] * K}px`;
    img.style.height = `${l.size[1] * K}px`;
    const m = layerMatrix(rig, mats, l, motion ? MOTIONS[motion] : undefined);
    img.style.transform = `matrix(${m[0]},${m[1]},${m[2]},${m[3]},${m[4] * K},${m[5] * K})`;
    stage.append(img);
    drawn.push({ slot: l.slot, m, img, size: l.size });
  }
  if ((sel === 'hair' || sel === 'hair_back') && !motion) {
    const [fx, fy, fw, fh] = hairRect(rig, sel);
    const [kx, ky, kw, kh] = rig.hairFrame.keepOut;
    const m = mats.head!;
    for (const [x, y, w, h, cls] of [[fx, fy, fw, fh, 'frame'], [kx, ky, kw, kh, 'keep']] as const) {
      const f = document.createElement('div');
      f.className = `dot ${cls}`;
      f.style.width = `${w * K}px`;
      f.style.height = `${h * K}px`;
      f.style.transform = `matrix(${m[0]},${m[1]},${m[2]},${m[3]},${(m[0] * x + m[2] * y + m[4]) * K},${(m[1] * x + m[3] * y + m[5]) * K})`;
      stage.append(f);
    }
  }
  if (!motion) {
    for (const b of bodyBones(rig, curBody())) {
      const d = document.createElement('div');
      const m = mats[b.parent ?? b.id] ?? mats[b.id]!;
      const px = m[0] * b.pivot[0] + m[2] * b.pivot[1] + m[4];
      const py = m[1] * b.pivot[0] + m[3] * b.pivot[1] + m[5];
      d.className = 'dot' + (b.id === boneOfSel() ? ' on' : '');
      d.style.left = `${(px + 0.5) * K}px`;
      d.style.top = `${(py + 0.5) * K}px`;
      d.title = NAMES[b.id] ?? b.id;
      stage.append(d);
    }
  }
  const b = bone(boneOfSel());
  const body = rig.bodies[rig.looks[look]!.body]!;
  const lk = rig.looks[look]!;
  const part = body[sel] ?? (typeof lk[sel] === 'object' ? (lk[sel] as PartArt) : undefined);
  $('info').textContent = `${NAMES[sel] ?? sel} · 관절 (${b.pivot[0]}, ${b.pivot[1]})` + (part ? ` · 부위 자리 (${part.at[0]}, ${part.at[1]})` : '') + ` · 앞뒤 ${rig.slots.findIndex((s) => s.id === sel) + 1}/${rig.slots.length}` + ` · 기본 각도 ${baseRot(b.id)}°`;
  const br = document.getElementById('brot') as HTMLInputElement | null;
  if (br && document.activeElement !== br) br.value = String(baseRot(b.id));
  const bv = document.getElementById('brotv');
  if (bv) bv.textContent = `${baseRot(b.id)}°`;
}

/** 부위 버튼 묶음(사용자 2026-10-29 "머리부터 왼팔 오른팔 순서대로") — 이 외형에 있는 것만 */
const CHIP_GROUPS: [string, string[]][] = [
  ['전체', ['root']],
  ['머리', ['head', 'hair', 'hair_back']],
  ['몸통', ['torso', 'outer_torso']],
  ['왼팔(칼)', ['arm_L', 'outer_arm_L', 'thumb_L']],
  ['오른팔', ['arm_R', 'outer_arm_R', 'forearm_R']],
  ['다리', ['leg_L', 'foot_L', 'leg_R', 'foot_R']],
  ['칼', ['weapon', 'scabbard']],
];
function pick(id: string) { sel = id; testRot = 0; ($('rot') as HTMLInputElement).value = '0'; buildChips(); draw(); }
function buildChips() {
  const box = $('parts');
  box.innerHTML = '';
  const has = new Set(['root', ...lookLayers(rig, look).map((l) => l.slot)]);
  const listed = new Set(CHIP_GROUPS.flatMap(([, ids]) => ids));
  const groups = [...CHIP_GROUPS, ['그 밖', [...has].filter((id) => !listed.has(id))] as [string, string[]]];
  for (const [label, ids] of groups) {
    const present = ids.filter((id) => has.has(id));
    if (!present.length) continue;
    const g = document.createElement('div');
    g.className = 'chipgroup';
    const t = document.createElement('span');
    t.className = 'chiplabel';
    t.textContent = label;
    g.append(t);
    for (const id of present) {
      const b = document.createElement('button');
      b.textContent = NAMES[id] ?? id;
      b.className = id === sel ? 'on' : '';
      b.onclick = () => pick(id);
      g.append(b);
    }
    box.append(g);
  }
}

function nudge(dx: number, dy: number) {
  motion = null;
  if (mode === 'pivot') {
    const b = bone(boneOfSel());
    setPivot(b.id, [b.pivot[0] + dx, b.pivot[1] + dy]);
  } else {
    const body = rig.bodies[rig.looks[look]!.body]!;
    const lk = rig.looks[look]!;
    const p = body[sel] ?? (typeof lk[sel] === 'object' ? (lk[sel] as PartArt) : undefined);
    if (!p) return;
    const next: PartArt = { ...p, at: [p.at[0] + dx, p.at[1] + dy] };
    if ((sel === 'hair' || sel === 'hair_back') && !insideFrame(rig, next, sel)) return; // 머리카락은 틀 밖으로 못 나간다
    p.at = next.at;
  }
  save(); draw();
}

document.querySelectorAll<HTMLButtonElement>('[data-look]').forEach((b) => b.onclick = () => {
  look = b.dataset.look!;
  document.querySelectorAll('[data-look]').forEach((x) => x.classList.toggle('on', x === b));
  buildChips(); save(false); draw();
});
document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((b) => b.onclick = () => {
  mode = b.dataset.mode as 'pivot' | 'part';
  document.querySelectorAll('[data-mode]').forEach((x) => x.classList.toggle('on', x === b));
});
document.querySelectorAll<HTMLButtonElement>('[data-d]').forEach((b) => b.onclick = () => {
  const [dx, dy] = b.dataset.d!.split(',').map(Number);
  nudge(dx!, dy!);
});
// 기본 각도(이 몸에서 쉬는 자세의 관절 각도) — 저장된다. 시험 회전은 저장 안 됨
const brot = document.getElementById('brot') as HTMLInputElement | null;
if (brot) brot.oninput = () => {
  motion = null;
  const id = boneOfSel();
  const v = Number(brot.value);
  const r = (joints().rot ??= {});
  if (v) r[id] = v; else delete r[id];
  save(); draw();
};
const brotStep = (d: number) => { if (!brot) return; brot.value = String(Number(brot.value) + d); brot.oninput?.(new Event('input')); };
document.getElementById('brot-m')?.addEventListener('click', () => brotStep(-1));
document.getElementById('brot-p')?.addEventListener('click', () => brotStep(1));
$<HTMLInputElement>('rot').oninput = (e) => { motion = null; testRot = Number((e.target as HTMLInputElement).value); $('rotv').textContent = `${testRot}°`; draw(); };
document.querySelectorAll<HTMLButtonElement>('[data-m]').forEach((b) => b.onclick = () => {
  const m = b.dataset.m!;
  motion = m === 'stop' ? null : m;
  mt = 0;
  document.querySelectorAll('[data-m]').forEach((x) => x.classList.toggle('on', x === b && m !== 'stop'));
  draw();
});
$('front').onclick = () => { slotsEdited = true; const i = rig.slots.findIndex((s) => s.id === sel); if (i >= 0 && i < rig.slots.length - 1) { const [s] = rig.slots.splice(i, 1); rig.slots.splice(i + 1, 0, s!); save(); draw(); } };
$('back').onclick = () => { slotsEdited = true; const i = rig.slots.findIndex((s) => s.id === sel); if (i > 0) { const [s] = rig.slots.splice(i, 1); rig.slots.splice(i - 1, 0, s!); save(); draw(); } };
$('reset').onclick = () => {
  resetRig();
  try { for (const k of [STORE, ...LEGACY]) localStorage.removeItem(k); } catch { /* 무시 */ }
  save(); buildChips(); draw();
};
$('copy').onclick = async () => {
  try { await navigator.clipboard.writeText(out.value); $('copy').textContent = '복사됨'; }
  catch { out.select(); $('copy').textContent = '선택됨 — 길게 눌러 복사'; }
  setTimeout(() => { $('copy').textContent = '값 복사'; }, 1800);
};
// 관절 모드에서 무대를 누르면 그 칸이 선택한 관절이 된다(움직임 멈춘 원래 자세 기준)
// 미리보기를 누르면 그 부위를 고른다(사용자 2026-10-29). 관절 모드에서 이미 고른 부위(또는 빈 곳)를 누르면 그 칸이 관절이 된다
stage.addEventListener('click', (e) => {
  const r = stage.getBoundingClientRect();
  const fx = (e.clientX - r.left) / (r.width / W);
  const fy = (e.clientY - r.top) / (r.height / H);
  const hit = slotAt(fx, fy);
  if (hit && hit !== sel) { pick(hit); return; }
  if (mode !== 'pivot' || motion || testRot) return;
  setPivot(boneOfSel(), [Math.floor(fx), Math.floor(fy)]);
  save(); draw();
});

let last = 0;
function tick(now: number) {
  if (motion) {
    if (last) mt += Math.min(100, now - last);
    const m = MOTIONS[motion]!;
    if (!m.loop && mt > m.duration + 400) mt = 0;
    draw();
  }
  last = now;
  requestAnimationFrame(tick);
}
$('fix').onclick = async () => {
  const btn = $<HTMLButtonElement>('fix');
  if (!dbRef) return setSync('서버에 연결이 안 돼 고정 못 함 — 값 복사로 보내 주세요');
  btn.disabled = true;
  try {
    const db = await claude!.use('db');
    const st = state();
    await db!.doc(FIX_DOC).set({ json: st, savedAt: Date.now() });
    await dbRef.set({ json: st, savedAt: Date.now() });
    const c = await claude!.use('comments').catch(() => null);
    const can = c ? await c.canSendToClaude().catch(() => 'off') : 'off';
    if (c && can === 'available') {
      await c.sendToClaude({ anchor: await c.anchorFor(btn), text: '고정: 편집기 값(서버 rig/fixed)을 게임 데이터에 넣어 주세요.' });
      setSync('고정 저장 + Claude 에게 보냄 — 반영되면 댓글로 답이 와요');
    } else {
      setSync('고정 저장됨 — Claude 에게 "고정해"라고 말해 주세요(지금은 바로 못 보냄)');
    }
  } catch { setSync('고정 실패 — 다시 눌러 주세요'); }
  btn.disabled = false;
};
function setSync(t: string) { const e = document.getElementById('sync'); if (e) e.textContent = t; }
buildChips(); save(false); draw(); requestAnimationFrame(tick);
// 서버 값이 있으면 그걸 쓴다(어느 기기에서 열어도 같은 값). 없으면 이 기기 값을 한 번 올린다
void (async () => {
  if (typeof claude === 'undefined') return setSync('이 기기에만 저장');
  const db = await claude.use('db').catch(() => null);
  if (!db) return setSync('이 기기에만 저장(서버 연결 안 됨)');
  const ref = db.doc(DB_DOC);
  try {
    const snap = await ref.get();
    const json = snap.exists ? snap.data()?.json : undefined;
    resetRig();
    if (typeof json === 'string' && merge(JSON.parse(json) as Saved)) {
      dbRef = ref;
      buildChips(); save(false); draw();
      setSync('서버 값 불러옴');
    } else {
      buildChips(); save(false); draw();
      dbRef = ref;
      await ref.set({ json: state(), savedAt: Date.now() });
      setSync('게임 데이터 값으로 시작(서버에 올림)');
    }
  } catch { setSync('서버 읽기 실패 — 이 기기에만 저장'); }
})();
