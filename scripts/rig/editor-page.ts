// 종이인형 관절 편집기 (시험용 페이지) — 게임 코드의 pose.ts 를 그대로 쓴다
import { HUMANOID, MOTIONS, boneMatrices, lookLayers, partMatrix, samplePose, type Pose, type Rig } from '../../src/data/art/rig/pose';

declare const ART_MAP: Record<string, string>;
const K = 6;
const NAMES: Record<string, string> = { root: '전체', torso: '몸통', head: '머리', arm_L: '왼팔', arm_R: '오른팔', leg_L: '왼다리', leg_R: '오른다리', hair: '머리카락', mask: '가면' };
const STORE = 'bha-rig-editor-v1';

const rig: Rig = JSON.parse(JSON.stringify(HUMANOID));
try {
  const saved = localStorage.getItem(STORE);
  if (saved) {
    const s = JSON.parse(saved) as Partial<Rig>;
    if (s.bones) rig.bones = s.bones;
    if (s.slots) rig.slots = s.slots;
    if (s.bodies) rig.bodies = s.bodies;
  }
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
  try { localStorage.setItem(STORE, JSON.stringify({ bones: rig.bones, slots: rig.slots, bodies: rig.bodies })); } catch { /* 무시 */ }
  const body = rig.looks[look]!.body;
  out.value = JSON.stringify({
    bones: rig.bones.map((b) => ({ id: b.id, parent: b.parent, pivot: b.pivot })),
    slots: rig.slots.map((s) => s.id),
    body,
    parts: Object.fromEntries(Object.entries(rig.bodies[body]!).map(([k, v]) => [k, v.at])),
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
  const part = body[sel];
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
    const p = body[sel];
    if (!p) return;
    p.at = [p.at[0] + dx, p.at[1] + dy];
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
$('front').onclick = () => { const i = rig.slots.findIndex((s) => s.id === sel); if (i >= 0 && i < rig.slots.length - 1) { const [s] = rig.slots.splice(i, 1); rig.slots.splice(i + 1, 0, s!); save(); draw(); } };
$('back').onclick = () => { const i = rig.slots.findIndex((s) => s.id === sel); if (i > 0) { const [s] = rig.slots.splice(i, 1); rig.slots.splice(i - 1, 0, s!); save(); draw(); } };
$('reset').onclick = () => {
  const fresh: Rig = JSON.parse(JSON.stringify(HUMANOID));
  rig.bones = fresh.bones; rig.slots = fresh.slots; rig.bodies = fresh.bodies;
  try { localStorage.removeItem(STORE); } catch { /* 무시 */ }
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
