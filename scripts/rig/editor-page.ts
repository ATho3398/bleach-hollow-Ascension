// 종이인형 관절 편집기 (시험용 페이지) — 게임 코드의 pose.ts 를 그대로 쓴다
import { HUMANOID, MOTIONS, boneMatrices, insideFrame, lookLayers, partMatrix, samplePose, type PartArt, type Pose, type Rig } from '../../src/data/art/rig/pose';

declare const ART_MAP: Record<string, string>;
const K = 6;
const NAMES: Record<string, string> = { root: '전체', torso: '몸통', head: '머리', arm_L: '왼팔', arm_R: '오른팔', leg_L: '왼다리', leg_R: '오른다리', hair: '일반머리', hair_back: '뒷머리', outer_torso: '겉옷(몸)', outer_arm_L: '겉옷(왼팔)', outer_arm_R: '겉옷(오른팔)', foot_L: '왼발', foot_R: '오른발', weapon: '칼' };
// 저장 칸 이름은 바꾸지 않는다(바꾸면 사용자가 맞춘 값이 사라진다). 옛 이름(v1~v3)에 남은 값도 읽어 온다
const STORE = 'bha-rig-editor';
const LEGACY = ['bha-rig-editor-v3', 'bha-rig-editor-v2', 'bha-rig-editor-v1'];
/** 저장할 때의 기본 자리(데이터 값). 새 시트로 기본 자리가 바뀌면 '사용자가 옮긴 만큼'만 옮겨 적용한다 */
type Saved = Partial<Rig> & { baseAt?: Record<string, Record<string, [number, number]>>; slotsEdited?: boolean };
/** 사용자가 앞뒤 순서를 직접 바꿨는가(바꾼 적 없으면 데이터 순서를 따른다 — 새 부위·순서 고침이 들어오게) */
let slotsEdited = false;
/** 옛 저장(baseAt 없음)이 기준으로 삼던 기본 자리 — C.151 앞부분의 값 */
const LEGACY_BASE: Record<string, Record<string, [number, number]>> = {
  arrancar: { torso: [8, 27], arm_L: [0, 36], arm_R: [17, 29], leg_L: [4, 51], leg_R: [13, 49], head: [8, 11], hair: [0, 0] },
  shinigami: { torso: [0, 26], arm_L: [0, 34], arm_R: [19, 34], leg_L: [3, 52], leg_R: [18, 52], head: [8, 11], hair: [0, 1] },
};

const rig: Rig = JSON.parse(JSON.stringify(HUMANOID));
const baseAt = (): Record<string, Record<string, [number, number]>> => {
  const o: Record<string, Record<string, [number, number]>> = {};
  for (const [b, parts] of Object.entries(HUMANOID.bodies)) {
    o[b] = Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, [v.at[0], v.at[1]]]));
    const look = Object.values(HUMANOID.looks).find((l) => l.body === b);
    const hair = look?.hair;
    if (typeof hair === 'object') o[b]!.hair = [hair.at[0], hair.at[1]];
    const hb = look?.hair_back;
    if (typeof hb === 'object') o[b]!.hair_back = [hb.at[0], hb.at[1]];
  }
  return o;
};
function merge(s: Saved) {
  const prevBase = s.baseAt ?? LEGACY_BASE;
  // 관절: 저장된 뼈는 저장값, 새로 생긴 뼈(발목·칼 등)는 데이터 기본값
  if (s.bones) for (const b of rig.bones) {
    const v = s.bones.find((x) => x.id === b.id);
    if (v) b.pivot = v.pivot; // 쉬는 각도(restRot)는 편집기에서 안 바꾸므로 데이터 값을 쓴다
  }
  // 앞뒤 순서: 저장 순서 + 새 슬롯은 데이터에서의 바로 앞 슬롯 뒤에
  if (s.slots && s.slotsEdited) {
    slotsEdited = true;
    const order = s.slots.map((x) => x.id).filter((id) => rig.slots.some((y) => y.id === id));
    rig.slots.forEach((sl, i) => {
      if (order.includes(sl.id)) return;
      const prev = rig.slots[i - 1]?.id;
      const at = prev ? order.indexOf(prev) + 1 : 0;
      order.splice(at, 0, sl.id);
    });
    rig.slots = order.map((id) => rig.slots.find((y) => y.id === id)!);
  }
  // 부위 자리: 사용자가 기본 자리에서 옮긴 만큼(저장값 - 그때 기본값)을 지금 기본값에 더한다
  const shift = (body: string, part: string, savedAt: [number, number] | undefined, cur: PartArt) => {
    const pb = prevBase[body]?.[part];
    if (!savedAt || !pb) return;
    cur.at = [cur.at[0] + savedAt[0] - pb[0], cur.at[1] + savedAt[1] - pb[1]];
  };
  if (s.bodies) for (const [b, parts] of Object.entries(rig.bodies)) {
    for (const [k, cur] of Object.entries(parts)) shift(b, k, s.bodies[b]?.[k]?.at as [number, number] | undefined, cur);
  }
  if (s.looks) for (const [lid, lk] of Object.entries(rig.looks)) {
    for (const k of ['hair', 'hair_back'] as const) {
      const sv = s.looks[lid]?.[k];
      const cur = lk[k];
      if (typeof cur === 'object' && typeof sv === 'object') shift(lk.body, k, sv.at as [number, number], cur);
    }
  }
}
try {
  const raw = [STORE, ...LEGACY].map((k) => localStorage.getItem(k)).find((v) => v);
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

function save() {
  try { localStorage.setItem(STORE, JSON.stringify({ bones: rig.bones, slots: rig.slots, bodies: rig.bodies, looks: rig.looks, baseAt: baseAt(), slotsEdited })); } catch { /* 무시 */ }
  const body = rig.looks[look]!.body;
  out.value = JSON.stringify({
    bones: rig.bones.map((b) => ({ id: b.id, parent: b.parent, pivot: b.pivot })),
    slots: rig.slots.map((s) => s.id),
    body,
    parts: Object.fromEntries(Object.entries(rig.bodies[body]!).map(([k, v]) => [k, v.at])),
    look,
    hair: (rig.looks[look]!.hair as PartArt | undefined)?.at,
    hair_back: (rig.looks[look]!.hair_back as PartArt | undefined)?.at,
  });
}

function bone(id: string) { return rig.bones.find((b) => b.id === id)!; }
function boneOfSel() { return rig.slots.find((s) => s.id === sel)?.bone ?? sel; }

function draw() {
  stage.querySelectorAll('img, .dot').forEach((n) => n.remove());
  let pose: Pose = {};
  if (motion) pose = samplePose(rig, MOTIONS[motion]!, mt);
  else if (testRot) pose = { [boneOfSel()]: { rot: testRot, x: 0, y: 0 } };
  const mats = boneMatrices(rig, pose);
  for (const l of lookLayers(rig, look)) {
    const img = document.createElement('img');
    img.src = ART_MAP[`art/rig/humanoid/${l.art}.png`] ?? '';
    img.className = 'part' + (l.slot === sel ? ' sel' : '');
    img.style.width = `${l.size[0] * K}px`;
    img.style.height = `${l.size[1] * K}px`;
    const m = partMatrix(mats[l.bone]!, l.at);
    img.style.transform = `matrix(${m[0]},${m[1]},${m[2]},${m[3]},${m[4] * K},${m[5] * K})`;
    stage.append(img);
  }
  if ((sel === 'hair' || sel === 'hair_back') && !motion) {
    const [fx, fy, fw, fh] = rig.hairFrame.rect;
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
    for (const b of rig.bones) {
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
  $('info').textContent = `${NAMES[sel] ?? sel} · 관절 (${b.pivot[0]}, ${b.pivot[1]})` + (part ? ` · 부위 자리 (${part.at[0]}, ${part.at[1]})` : '') + ` · 앞뒤 ${rig.slots.findIndex((s) => s.id === sel) + 1}/${rig.slots.length}`;
}

function buildChips() {
  const box = $('parts');
  box.innerHTML = '';
  const ids = ['root', ...rig.slots.map((s) => s.id).filter((id) => lookLayers(rig, look).some((l) => l.slot === id))];
  for (const id of ids) {
    const b = document.createElement('button');
    b.textContent = NAMES[id] ?? id;
    b.className = id === sel ? 'on' : '';
    b.onclick = () => { sel = id; testRot = 0; ($('rot') as HTMLInputElement).value = '0'; buildChips(); draw(); };
    box.append(b);
  }
}

function nudge(dx: number, dy: number) {
  motion = null;
  if (mode === 'pivot') {
    const b = bone(boneOfSel());
    b.pivot = [b.pivot[0] + dx, b.pivot[1] + dy];
  } else {
    const body = rig.bodies[rig.looks[look]!.body]!;
    const lk = rig.looks[look]!;
    const p = body[sel] ?? (typeof lk[sel] === 'object' ? (lk[sel] as PartArt) : undefined);
    if (!p) return;
    const next: PartArt = { ...p, at: [p.at[0] + dx, p.at[1] + dy] };
    if ((sel === 'hair' || sel === 'hair_back') && !insideFrame(rig, next)) return; // 머리카락은 틀 밖으로 못 나간다
    p.at = next.at;
  }
  save(); draw();
}

document.querySelectorAll<HTMLButtonElement>('[data-look]').forEach((b) => b.onclick = () => {
  look = b.dataset.look!;
  document.querySelectorAll('[data-look]').forEach((x) => x.classList.toggle('on', x === b));
  buildChips(); save(); draw();
});
document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((b) => b.onclick = () => {
  mode = b.dataset.mode as 'pivot' | 'part';
  document.querySelectorAll('[data-mode]').forEach((x) => x.classList.toggle('on', x === b));
});
document.querySelectorAll<HTMLButtonElement>('[data-d]').forEach((b) => b.onclick = () => {
  const [dx, dy] = b.dataset.d!.split(',').map(Number);
  nudge(dx!, dy!);
});
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
  const fresh: Rig = JSON.parse(JSON.stringify(HUMANOID));
  rig.bones = fresh.bones; rig.slots = fresh.slots; rig.bodies = fresh.bodies; rig.looks = fresh.looks; slotsEdited = false;
  try { for (const k of [STORE, ...LEGACY]) localStorage.removeItem(k); } catch { /* 무시 */ }
  save(); buildChips(); draw();
};
$('copy').onclick = async () => {
  try { await navigator.clipboard.writeText(out.value); $('copy').textContent = '복사됨'; }
  catch { out.select(); $('copy').textContent = '선택됨 — 길게 눌러 복사'; }
  setTimeout(() => { $('copy').textContent = '값 복사'; }, 1800);
};
// 관절 모드에서 무대를 누르면 그 칸이 선택한 관절이 된다(움직임 멈춘 원래 자세 기준)
stage.addEventListener('click', (e) => {
  if (mode !== 'pivot' || motion || testRot) return;
  const r = stage.getBoundingClientRect();
  const x = Math.floor((e.clientX - r.left) / (r.width / W));
  const y = Math.floor((e.clientY - r.top) / (r.height / H));
  bone(boneOfSel()).pivot = [x, y];
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
buildChips(); save(); draw(); requestAnimationFrame(tick);
