// 종이인형 관절 편집기 (시험용 페이지) — 게임 코드의 pose.ts 를 그대로 쓰고, 값은 작업본(draft.ts, GDD 96장 36)
import { DRAFT_RIGS, type DraftRig } from './draft';
import { bodyBones, boneMatrices, fxAt, hairRect, insideFrame, layerMatrix, lookLayers, motionLook, orderLayers, resolveMotions, samplePose, type BodyJoints, type Key, type Motion, type PartArt, type Pose, type Rig } from '../../src/data/art/rig/pose';
import { followMove } from './follow';
import { fxSvg } from '../../src/ui/bha/rigFx';

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
const K = 6;
// 저장 칸 이름은 바꾸지 않는다(바꾸면 사용자가 맞춘 값이 사라진다). 옛 이름(v1~v3)에 남은 값도 읽어 온다
const LEGACY = ['bha-rig-editor-v3', 'bha-rig-editor-v2', 'bha-rig-editor-v1'];
/** 저장 = 절대값(관절·부위 자리·외형 층 자리·앞뒤 순서) + 그때의 게임 데이터 표시(dataStamp).
 * 게임 데이터가 바뀌었으면(Claude 가 사용자 값을 넣었거나 새 시트) 이 기기에 남은 옛 저장은 버리고 데이터 값을 쓴다 —
 * 서버 저장은 Claude 가 데이터를 바꿀 때마다 같이 맞춘다 */
type Saved = Partial<Rig> & { dataStamp?: string; slotsEdited?: boolean; motionEdits?: MotionEdits };
/** 동작 키 고친 것(사용자 2026-10-31 "이 모션에만 값 저장하기"): '<동작 묶음>/<동작 id>' → 뼈 → 키 목록(그 뼈 트랙 통째). 묶음이 없으면 '/<동작 id>' */
type MotionEdits = Record<string, Record<string, Key[]>>;
const stampOf = (r: unknown) => {
  let h = 2166136261;
  const t = JSON.stringify(r);
  for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
};
/** 뼈대마다(사람형·짐승형 — GDD 96장 41) 따로 고친 값·저장 자리. 사람형 저장 자리 이름은 예전 그대로 */
interface Ctx { id: string; src: DraftRig; rig: Rig; stamp: string; store: string; db: string; fix: string; slotsEdited: boolean; dbRef: DocRef | null; medits: MotionEdits }
const CTX: Record<string, Ctx> = Object.fromEntries(Object.entries(DRAFT_RIGS).map(([id, src]) => {
  const tail = id === 'humanoid' ? '' : `-${id}`;
  return [id, { id, src, rig: JSON.parse(JSON.stringify(src.rig)) as Rig, stamp: stampOf({ rig: src.rig, motions: src.motions, sets: src.sets }), store: `bha-rig-editor${tail}`, db: `rig/editor${tail}`, fix: `rig/fixed${tail}`, slotsEdited: false, dbRef: null, medits: {} }];
}));
let C: Ctx = CTX.humanoid!;
let rig: Rig = C.rig;
/** 외형 id → 뼈대 */
const ctxOfLook = (l: string) => Object.values(CTX).find((c) => c.rig.looks[l]) ?? C;
/** 외형 층(머리카락·칼·칼집·망토 등): 외형에 그림으로 붙은 것 전부 */
const lookParts = (lk: Rig['looks'][string]) => Object.keys(lk).filter((k) => typeof lk[k] === 'object');

function merge(c: Ctx, s: Saved): boolean {
  const rig = c.rig;
  if (s.dataStamp !== c.stamp) return false;
  c.medits = JSON.parse(JSON.stringify(s.motionEdits ?? {})) as MotionEdits;
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
    c.slotsEdited = true;
    const order = s.slots.map((x) => x.id).filter((id) => rig.slots.some((y) => y.id === id));
    rig.slots = [...order.map((id) => rig.slots.find((y) => y.id === id)!), ...rig.slots.filter((y) => !order.includes(y.id))];
  }
  if (s.bodies) for (const [b, parts] of Object.entries(rig.bodies)) {
    for (const [k, cur] of Object.entries(parts)) { const v = s.bodies[b]?.[k]; if (v) cur.at = [v.at[0], v.at[1]]; }
  }
  if (s.looks) for (const [lid, lk] of Object.entries(rig.looks)) {
    for (const k of lookParts(lk)) {
      const v = s.looks[lid]?.[k];
      const cur = lk[k];
      if (typeof cur === 'object' && typeof v === 'object') cur.at = [v.at[0], v.at[1]];
    }
  }
  return true;
}
function resetRig(c: Ctx) {
  const fresh: Rig = JSON.parse(JSON.stringify(c.src.rig));
  const r = c.rig;
  r.bones = fresh.bones; r.slots = fresh.slots; r.bodies = fresh.bodies; r.looks = fresh.looks; r.bodyJoints = fresh.bodyJoints; c.slotsEdited = false; c.medits = {};
}
for (const c of Object.values(CTX)) {
  try {
    const raw = localStorage.getItem(c.store);
    if (raw) merge(c, JSON.parse(raw) as Saved);
  } catch { /* 저장 못 쓰는 환경 */ }
}
const NAMES = () => rig.edit?.names ?? {};
/** 지금 몸이 쓰는 동작(역관절 몸은 동작 묶음을 덮은 것) */
const motionsNow = (): Record<string, Motion> => {
  const out = { ...resolveMotions(rig, C.src.motions, C.src.sets, curBody()) };
  const set = rig.bodyMotions?.[curBody()];
  // 고친 동작 키를 덮는다: 기본 동작 것 먼저, 이 몸의 동작 묶음 것 나중
  const entries = Object.entries(C.medits).sort(([a], [b]) => (a.startsWith('/') ? 0 : 1) - (b.startsWith('/') ? 0 : 1));
  for (const [key, edits] of entries) {
    const [s0, id] = key.split('/') as [string, string];
    if (s0 && s0 !== set) continue;
    const m = out[id];
    if (m) out[id] = { ...m, tracks: { ...m.tracks, ...edits } };
  }
  return out;
};
/** 지금 동작을 고칠 때 넣을 자리: 이 몸의 동작 묶음에 있는 동작이면 그 묶음, 아니면 기본 동작 */
function motionKeyOf(id: string): string {
  const set = rig.bodyMotions?.[curBody()];
  return set && C.src.sets[set]?.[id] ? `${set}/${id}` : `/${id}`;
}

let look = 'arrancar-base';
let sel = 'arm_L';
let mode: 'pivot' | 'part' = 'pivot';
let testRot = 0;
let motion: string | null = null;
let mt = 0;
/** 동작 멈춤(그 순간 자세로 각 잡기) · 저장 범위(기본 자세 = 이 몸 / 이 동작에만 = 동작 키) — 사용자 2026-10-31 */
let paused = false;
let scope: 'base' | 'motion' = 'base';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const stage = $('stage');
const out = $<HTMLTextAreaElement>('out');
let W = 0;
let H = 0;
function sizeStage() {
  [W, H] = rig.canvas;
  stage.style.width = `${W * K}px`;
  stage.style.height = `${H * K}px`;
}
sizeStage();

let dbTimer = 0;
const state = (c: Ctx = C) => JSON.stringify({ id: c.id, bones: c.rig.bones, slots: c.rig.slots, bodies: c.rig.bodies, looks: c.rig.looks, bodyJoints: c.rig.bodyJoints, dataStamp: c.stamp, slotsEdited: c.slotsEdited, motionEdits: c.medits });
function save(user = true) {
  const st = state();
  try { localStorage.setItem(C.store, st); } catch { /* 무시 */ }
  // 사용자가 바꾼 것만 서버에 (잠깐 모아서 한 번)
  if (user && C.dbRef) {
    clearTimeout(dbTimer);
    const ref = C.dbRef;
    dbTimer = window.setTimeout(() => { ref.set({ json: st, savedAt: Date.now() }).then(() => setSync('서버 저장됨'), () => setSync('서버 저장 실패 — 이 기기에만 저장')); }, 600);
  }
  const body = rig.looks[look]!.body;
  const lk = rig.looks[look]!;
  out.value = JSON.stringify({
    rig: rig.id,
    bones: rig.bones.map((b) => ({ id: b.id, parent: b.parent, pivot: b.pivot })),
    slots: rig.slots.map((s) => s.id),
    body,
    parts: Object.fromEntries(Object.entries(rig.bodies[body]!).map(([k, v]) => [k, v.at])),
    look,
    ...Object.fromEntries(lookParts(lk).map((k) => [k, (lk[k] as PartArt).at])),
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
  const MOTIONS = motionsNow();
  if (motion && !MOTIONS[motion]) motion = null;
  if (motion) pose = samplePose(rig, MOTIONS[motion]!, mt);
  else if (testRot) pose = { [boneOfSel()]: { rot: testRot, x: 0, y: 0 } };
  const mats = boneMatrices(rig, pose, curBody());
  drawn = [];
  // 해방 동작이면 그 순간 외형, 필살기면 칼을 맨 앞으로(GDD 115-A 48·49)
  const cm = motion ? MOTIONS[motion] : undefined;
  for (const l of orderLayers(lookLayers(rig, motionLook(rig, look, cm, mt)), cm)) {
    const img = document.createElement('img');
    img.src = ART_MAP[`art/rig/${rig.id}/${l.art}.png`] ?? '';
    img.className = 'part' + (l.slot === sel ? ' sel' : '');
    img.style.width = `${l.size[0] * K}px`;
    img.style.height = `${l.size[1] * K}px`;
    const m = layerMatrix(rig, mats, l, motion ? MOTIONS[motion] : undefined);
    img.style.transform = `matrix(${m[0]},${m[1]},${m[2]},${m[3]},${m[4] * K},${m[5] * K})`;
    stage.append(img);
    drawn.push({ slot: l.slot, m, img, size: l.size });
  }
  if (cm?.fx) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'dot fxlayer');
    svg.setAttribute('width', String(W * K));
    svg.setAttribute('height', String(H * K));
    svg.style.cssText = `position:absolute;left:0;top:0;margin:0;overflow:visible;pointer-events:none;opacity:1;background:none;border-radius:0;width:${W * K}px;height:${H * K}px`;
    svg.innerHTML = fxSvg(fxAt(cm, mt, mats), K);
    stage.append(svg);
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
      d.title = NAMES()[b.id] ?? b.id;
      stage.append(d);
    }
  }
  const b = bone(boneOfSel());
  const body = rig.bodies[rig.looks[look]!.body]!;
  const lk = rig.looks[look]!;
  const part = body[sel] ?? (typeof lk[sel] === 'object' ? (lk[sel] as PartArt) : undefined);
  $('info').textContent = `${NAMES()[sel] ?? sel} · 관절 (${b.pivot[0]}, ${b.pivot[1]})` + (part ? ` · 부위 자리 (${part.at[0]}, ${part.at[1]})` : '') + ` · 앞뒤 ${rig.slots.findIndex((s) => s.id === sel) + 1}/${rig.slots.length}` + ` · 기본 각도 ${baseRot(b.id)}°`;
  const editingMotion = scope === 'motion' && motion && MOTIONS[motion];
  const shownRot = editingMotion ? Math.round(samplePose(rig, MOTIONS[motion!]!, mt)[b.id]?.rot ?? 0) : baseRot(b.id);
  const br = document.getElementById('brot') as HTMLInputElement | null;
  if (br && document.activeElement !== br) br.value = String(shownRot);
  const bv = document.getElementById('brotv');
  if (bv) bv.textContent = `${shownRot}°`;
  const bs = document.getElementById('brotscope');
  if (bs) bs.textContent = editingMotion ? `(이 동작 ${motion} 의 ${Math.round(mt)}ms 키에 저장)` : '(이 몸에만 저장)';
  const cmm = motion ? MOTIONS[motion] : undefined;
  const mtv = document.getElementById('mtv');
  if (mtv) mtv.textContent = cmm ? `${motion} · ${Math.round(mt)} / ${cmm.duration}ms${paused ? ' · 멈춤' : ''}` : '—';
  const mtime = document.getElementById('mtime') as HTMLInputElement | null;
  if (mtime && cmm) { mtime.max = String(cmm.duration); if (document.activeElement !== mtime) mtime.value = String(Math.round(mt)); }
  const mplay = document.getElementById('mplay');
  if (mplay) mplay.textContent = paused || !motion ? '▶ 재생' : '❚❚ 멈춤';
}

/** 부위 버튼 묶음(사용자 2026-10-29 "머리부터 왼팔 오른팔 순서대로", 뼈대 데이터 edit.groups) — 이 외형에 있는 것만 */
const CHIP_GROUPS = (): [string, string[]][] => rig.edit?.groups ?? [];
function pick(id: string) { sel = id; testRot = 0; ($('rot') as HTMLInputElement).value = '0'; buildChips(); draw(); }
function buildChips() {
  const box = $('parts');
  box.innerHTML = '';
  const has = new Set(['root', ...lookLayers(rig, look).map((l) => l.slot)]);
  const listed = new Set(CHIP_GROUPS().flatMap(([, ids]) => ids));
  const groups = [...CHIP_GROUPS(), ['그 밖', [...has].filter((id) => !listed.has(id))] as [string, string[]]];
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
      b.textContent = NAMES()[id] ?? id;
      b.className = id === sel ? 'on' : '';
      b.onclick = () => pick(id);
      g.append(b);
    }
    box.append(g);
  }
}

/** 지금 동작의 지금 시각에 이 뼈의 키를 고친다(없으면 그 순간 값으로 새 키). 반복 동작은 처음·끝 키를 같이 */
function editKey(boneId: string, fn: (k: Key) => void) {
  if (!motion) return;
  const m = motionsNow()[motion];
  if (!m) return;
  paused = true;
  const edits = (C.medits[motionKeyOf(motion)] ??= {});
  const track: Key[] = (edits[boneId] ??= JSON.parse(JSON.stringify(m.tracks[boneId] ?? [[0, 0, 0, 0], [m.duration, 0, 0, 0]])) as Key[]);
  const t = Math.max(0, Math.min(m.duration, Math.round(mt)));
  let k = track.find((x) => Math.abs(x[0] - t) <= 15);
  if (!k) {
    const p = samplePose(rig, { ...m, tracks: { [boneId]: track } }, t)[boneId] ?? { rot: 0, x: 0, y: 0 };
    k = [t, Math.round(p.rot), Math.round(p.x), Math.round(p.y)];
    track.push(k);
    track.sort((a, b) => a[0] - b[0]);
  }
  fn(k);
  if (m.loop && track.length > 1) {
    const first = track[0]!, lastK = track[track.length - 1]!;
    if (k === first && lastK[0] === m.duration) { lastK[1] = k[1]; lastK[2] = k[2]; lastK[3] = k[3]; }
    if (k === lastK && first[0] === 0) { first[1] = k[1]; first[2] = k[2]; first[3] = k[3]; }
  }
  save(); draw();
}

function nudge(dx: number, dy: number) {
  if (scope === 'motion' && motion) {
    // 이 동작에만: 그 순간 뼈 위치 이동 키(사용자 "저 장면일 때만큼은 위치 변환")
    editKey(boneOfSel(), (k) => { k[2] += dx; k[3] += dy; });
    return;
  }
  if (motion) paused = true; // 동작 중이면 그 자세로 멈춘 채 고친다(풀리지 않게)
  if (mode === 'pivot') {
    const b = bone(boneOfSel());
    setPivot(b.id, [b.pivot[0] + dx, b.pivot[1] + dy]);
  } else {
    // 부위를 옮기면 딸린 부위(머리 → 머리카락·뒷머리, 왼팔 → 엄지, 오른 위팔 → 아래팔, 다리 → 정강이·발)와 그 관절도 같이(사용자 2026-10-29)
    const moves = followMove(rig, look, sel);
    if (!moves) return;
    for (const m of moves.parts) {
      const next: PartArt = { ...m.part, at: [m.part.at[0] + dx, m.part.at[1] + dy] };
      if ((m.slot === 'hair' || m.slot === 'hair_back') && !insideFrame(rig, next, m.slot)) { $('info').textContent = '머리카락이 틀 밖으로 나가서 못 옮김'; return; }
    }
    for (const m of moves.parts) m.part.at = [m.part.at[0] + dx, m.part.at[1] + dy];
    for (const id of moves.bones) { const b = bone(id); setPivot(id, [b.pivot[0] + dx, b.pivot[1] + dy]); }
  }
  save(); draw();
}

document.querySelectorAll<HTMLButtonElement>('[data-look]').forEach((b) => b.onclick = () => {
  look = b.dataset.look!;
  const c = ctxOfLook(look);
  if (c !== C) {
    C = c; rig = c.rig; motion = null; sizeStage();
    if (!rig.slots.some((s) => s.id === sel)) sel = rig.slots[0]!.id;
  }
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
  const id = boneOfSel();
  const v = Number(brot.value);
  if (scope === 'motion' && motion) { editKey(id, (k) => { k[1] = v; }); return; }
  if (motion) paused = true;
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
  paused = false;
  document.querySelectorAll('[data-m]').forEach((x) => x.classList.toggle('on', x === b && m !== 'stop'));
  draw();
});
$('front').onclick = () => { C.slotsEdited = true; const i = rig.slots.findIndex((s) => s.id === sel); if (i >= 0 && i < rig.slots.length - 1) { const [s] = rig.slots.splice(i, 1); rig.slots.splice(i + 1, 0, s!); save(); draw(); } };
$('back').onclick = () => { C.slotsEdited = true; const i = rig.slots.findIndex((s) => s.id === sel); if (i > 0) { const [s] = rig.slots.splice(i, 1); rig.slots.splice(i - 1, 0, s!); save(); draw(); } };
$('reset').onclick = () => {
  resetRig(C);
  try { for (const k of [C.store, ...(C.id === 'humanoid' ? LEGACY : [])]) localStorage.removeItem(k); } catch { /* 무시 */ }
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

document.getElementById('mplay')?.addEventListener('click', () => { if (!motion) return; paused = !paused; draw(); });
document.getElementById('mtime')?.addEventListener('input', (e) => { if (!motion) return; paused = true; mt = Number((e.target as HTMLInputElement).value); draw(); });
document.querySelectorAll<HTMLButtonElement>('[data-scope]').forEach((b) => b.onclick = () => {
  scope = b.dataset.scope as 'base' | 'motion';
  document.querySelectorAll('[data-scope]').forEach((x) => x.classList.toggle('on', x === b));
  draw();
});

let last = 0;
function tick(now: number) {
  if (motion) {
    if (last && !paused) mt += Math.min(100, now - last);
    const m = motionsNow()[motion];
    if (!m) motion = null;
    else if (!m.loop && mt > m.duration + 400) mt = 0;
    draw();
  }
  last = now;
  requestAnimationFrame(tick);
}
$('fix').onclick = async () => {
  const btn = $<HTMLButtonElement>('fix');
  if (!C.dbRef) return setSync('서버에 연결이 안 돼 고정 못 함 — 값 복사로 보내 주세요');
  btn.disabled = true;
  try {
    const db = await claude!.use('db');
    const st = state();
    await db!.doc(C.fix).set({ json: st, savedAt: Date.now() });
    await C.dbRef.set({ json: st, savedAt: Date.now() });
    const c = await claude!.use('comments').catch(() => null);
    const can = c ? await c.canSendToClaude().catch(() => 'off') : 'off';
    if (c && can === 'available') {
      await c.sendToClaude({ anchor: await c.anchorFor(btn), text: `고정: 편집기 값(서버 ${C.fix})을 작업본에 넣어 주세요. (게임에는 아직 넣지 않음)` });
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
  const msgs: string[] = [];
  for (const c of Object.values(CTX)) {
    const ref = db.doc(c.db);
    try {
      const snap = await ref.get();
      const json = snap.exists ? snap.data()?.json : undefined;
      resetRig(c);
      if (typeof json === 'string' && merge(c, JSON.parse(json) as Saved)) {
        c.dbRef = ref;
        if (c === C) msgs.push('서버 값 불러옴');
      } else {
        c.dbRef = ref;
        await ref.set({ json: state(c), savedAt: Date.now() });
        if (c === C) msgs.push('작업본 값으로 시작(서버에 올림)');
      }
    } catch { msgs.push(`서버 읽기 실패(${c.id}) — 이 기기에만 저장`); }
  }
  buildChips(); save(false); draw();
  setSync(msgs.join(' · '));
})();
