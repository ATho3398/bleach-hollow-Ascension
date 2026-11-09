// 종이인형 뼈대 (GDD 96장): 부위 그림을 관절마다 돌리고 옮겨 움직인다(크루세이더 퀘스트식).
// 여기는 DOM 없는 계산만 — 동작 키를 시간으로 뽑고(samplePose), 뼈마다 화면 변환 행렬을 만든다(boneMatrices).
// 그리기(<img> 겹치기 + CSS transform)는 src/ui/bha/paperdoll.ts. 종족을 모른다: 어느 몸·머리카락을 쓸지는 looks 데이터.
import rigRaw from './humanoid.json';
import motionsRaw from './motions.json';
import serpentRaw from './serpent.json';
import serpentMotionsRaw from './serpent-motions.json';

export type Vec2 = [number, number];
/** CSS matrix(a, b, c, d, e, f) 순서: x' = a·x + c·y + e, y' = b·x + d·y + f */
export type Mat = [number, number, number, number, number, number];

export interface Bone {
  id: string;
  parent: string | null;
  pivot: Vec2;
  /** 쉬는 자세 각도(도). 무기처럼 그림은 곧게 그리고 들고 있는 각도만 주고 싶을 때. 동작 각도에 더해진다 */
  restRot?: number;
  /** 보정 이동(도트, 부모 좌표 — 동작 x·y 처럼 더함). 몸별 관절(bodyJoints.shift)에서만 온다: 편집기에서 관절을 옮겨도 쉬는 자세 그림이 제자리에 있게(GDD 115-A 61) */
  shift?: Vec2;
}
export interface Slot {
  id: string;
  bone: string;
}
export interface Rig {
  id: string;
  canvas: Vec2;
  ground: number;
  bones: Bone[];
  slots: Slot[];
  /** 몸 id → 슬롯 id → 부위 그림 */
  bodies: Record<string, Record<string, PartArt>>;
  /** 외형 id → 몸 + 얹는 층(hair 일반머리·hair_back 뒷머리 — 아란칼 가면은 hair 에 붙어 있다, outer_* 겉옷, weapon 무기) */
  looks: Record<string, Look>;
  /** 머리카락 틀: 머리카락 그림은 rect(x, y, 가로, 세로) 안에만. keepOut = 가리지 않기를 권장하는 얼굴 칸 */
  hairFrame: { rect: [number, number, number, number]; backRect?: [number, number, number, number]; keepOut: [number, number, number, number] };
  /** 칼 그림 안 손잡이 가운데 → 칼끝(그림 좌표). 칼을 비스듬히 그려도 칼날 방향을 알 수 있게 */
  swordAxis?: { grip: Vec2; tip: Vec2 };
  /** 몸마다 따로 맞춘 관절: pivots = 관절 자리, rot = 기본 각도(도, 쉬는 각도에 더함). 없는 값은 bones 그대로 */
  bodyJoints?: Record<string, BodyJoints | string>;
  /** 게임 화면에 그릴 그림 칸(x, y, 가로, 세로, 캔버스 좌표) — 칼을 휘둘러도 안 잘리게 넉넉히 */
  /** 게임 그림 칸 (C.190: 옛 한 장 그림 규격 — 정사각·발 가운데·발 아래 8% 위). clipY = 이 캔버스 y 아래는 안 그린다 */
  view?: { rect: [number, number, number, number]; clipY?: number };
  /** 몸 id → 동작 묶음 이름(motions.json 의 sets). 역관절 다리처럼 몸에 따라 일부 뼈 동작만 바꿔 끼운다(GDD 96장 40) */
  bodyMotions?: Record<string, string>;
  /** 몸 id → 그 몸만의 그림 앞뒤 순서(슬롯 id, 뒤 → 앞). 없으면 slots 순서. 편집기 '기본 자세(이 몸)'의 앞·뒤로 보내기 (GDD 115-A 74) */
  bodySlots?: Record<string, string[]>;
  /** 관절 편집기 전용(게임은 안 씀): 부위 이름, 부위 버튼 묶음, 부위를 옮기면 같이 옮겨 갈 부위(GDD 96장 42) */
  edit?: RigEdit;
  /** 늘어진 마디(뒷머리·망토를 나눈 아래 마디, GDD 115-A 88): 뼈 id → 따라가기. 동작 키 없이 부모가 움직인 대로 늦게 따라오고(lag·swing) 아래로 늘어진다(hang) */
  sway?: Record<string, Sway>;
}

/** 늘어진 마디 (GDD 115-A 88): 자기 각 += swing × (부모 화면 각(t − lag) − 부모 화면 각(t)) − hang × 부모 화면 각(t).
 *  부모 화면 각 = 부모까지 동작 각 합(쉬는 각·몸 전체 root 회전 제외, 위 마디의 따라가기 포함). 쉬는 자세(동작 각 0)에서는 0 — 정지 그림은 그대로 */
export interface Sway {
  /** 늦게 따라오는 시간(ms) */
  lag: number;
  /** 늦음을 얼마나 키울지(1 = 부모가 lag 전에 있던 각을 그대로 따라감) */
  swing: number;
  /** 부모가 기운 만큼 거꾸로 돌려 아래로 늘어지게(0~1, 0.3 = 기운 각의 30% 만큼 되돌림) */
  hang: number;
  /** 늘 하늘하늘(GDD 115-A 92): [각 진폭(도), 한 번 흔들리는 시간(ms), 늦음(ms)] — 가만히 있어도 흔들림. 아래 마디일수록 늦음을 크게 주면 물결이 아래로 흐른다.
   *  되풀이 동작은 길이에 맞춰 흔들림 시간을 맞춘다(이음매 없게) */
  wave?: [number, number, number];
}

export interface RigEdit {
  names?: Record<string, string>;
  groups?: [string, string[]][];
  /** 슬롯 → 같이 옮겨 가는 슬롯(뒤에 오는 슬롯을 옮기면 그것만). 따라가는 슬롯의 뼈가 다르면 그 뼈 관절도 같이 옮긴다 */
  follow?: Record<string, string[]>;
}

export interface BodyJoints {
  pivots?: Record<string, Vec2>;
  rot?: Record<string, number>;
  /** 뼈 id → 보정 이동(도트). 관절을 옮기면 편집기가 넣는다(jointMoveShift, GDD 115-A 61) */
  shift?: Record<string, Vec2>;
}

/** 부위 그림 하나: `public/art/rig/<rig id>/<art>.png`(꼭 맞게 자른 그림), at = 캔버스에서 왼쪽 위 자리, size = 그림 크기 */
export interface PartArt {
  art: string;
  at: Vec2;
  size: Vec2;
}
/** 외형: 몸 + 외형 층(머리카락 등). artFolder = 몸 부위 그림을 이 폴더의 같은 이름 그림으로(색만 바꾼 그림 — 몸·관절·동작은 그 몸 그대로, GDD 115-A 85).
 *  color = 같은 몸 색 외형 고르기에 보이는 색 이름(편집기·시험 페이지) */
export type Look = { body: string; artFolder?: string; color?: string; [slot: string]: PartArt | string | undefined };
/** 외형의 몸 부위 그림 경로 (artFolder 가 있으면 그 폴더의 같은 이름 그림) */
export function lookArt(look: Look, art: string): string {
  return typeof look.artFolder === 'string' ? `${look.artFolder}/${art.slice(art.lastIndexOf('/') + 1)}` : art;
}
export interface Layer extends PartArt {
  slot: string;
  bone: string;
}

/** 키 하나: [시각 ms, 각도(도, +=시계), x(도트), y(도트)] */
export type Key = [number, number, number, number];
export interface Motion {
  duration: number;
  loop: boolean;
  /** 타격 순간(ms) — 피해 숫자 타이밍 */
  hit?: number;
  /** 이 동작 동안 그림을 뒤집어 그릴 슬롯(칼 = 칼날 축 기준으로 날·등이 바뀜, 그 밖 = 그림 세로 가운데 기준) */
  flip?: string[];
  /** 이 동작 동안 맨 앞으로 올려 그릴 슬롯(차례대로) — 필살기에서 칼을 몸 위로 (GDD 115-A 48) */
  front?: string[];
  /** 이 동작 동안 숨길 슬롯 — 칼 든 손으로 치는 스트레이트에서 칼을 잠시 감춤 (GDD 115-A 52) */
  hide?: string[];
  /** 이 동작에서만 쓰는 그림 앞뒤 순서(슬롯 id, 뒤 → 앞). 없으면 뼈대의 slots 순서. 편집기 '이 동작에만'에서 앞·뒤로 보내기 (GDD 115-A 62) */
  order?: string[];
  /** 끝나도 마지막 자세로 멈춰 있는다(쓰러짐 — 다음 동작이 올 때까지) (GDD 115-A 53) */
  hold?: boolean;
  /** 이펙트 키(베기 궤적·폭발·바닥 고리·기둥) — 그림 층 위에 그린다 (GDD 115-A 48) */
  fx?: FxKey[];
  /** 이 시각부터 외형을 해방 외형(look.release)으로 바꿔 그린다 — 해방 1안 (GDD 115-A 49) */
  swapAt?: number;
  tracks: Record<string, Key[]>;
}

/** 이펙트 하나. pts = 캔버스 좌표(bone 이 있으면 그 뼈를 따라 움직인다). 색은 그림 데이터(UI 토큰 아님) */
export interface FxKey {
  t: number;
  dur: number;
  kind: 'slash' | 'burst' | 'ring' | 'pillar';
  pts: Vec2[];
  bone?: string;
  /** 굵기(도트) */
  w?: number;
  /** 반지름(burst·ring, 도트) */
  r?: number;
  color: string;
  /** 가운데 밝은 색 */
  core?: string;
}
/** 지금 그릴 이펙트: 좌표는 화면(캔버스) 좌표로 옮긴 것, u = 0~1 진행 */
export interface FxDraw extends Omit<FxKey, 't' | 'dur' | 'bone'> {
  u: number;
}
export interface BonePose {
  rot: number;
  x: number;
  y: number;
}
export type Pose = Record<string, BonePose>;

/** 동작 묶음: 묶음 이름 → 동작 id → 바꿔 끼울 뼈 키(그 밖 뼈와 길이·타격 시각은 기본 동작 그대로) */
/** 몸별 동작 덮기. off = 이 몸에는 이 동작이 없다(게임·편집기에서 빠짐 — 덩치 특수2·필살기, GDD 115-A 75) */
export type MotionOverride = Partial<Omit<Motion, 'tracks'>> & { tracks?: Record<string, Key[]>; off?: boolean };
export type MotionSets = Record<string, Record<string, MotionOverride>>;

/** motions.json 모양(note·sets 를 뺀 나머지가 동작) → 기본 동작 + 동작 묶음 */
export function readMotions(raw: unknown): { motions: Record<string, Motion>; sets: MotionSets } {
  const o = raw as Record<string, unknown>;
  const motions = Object.fromEntries(Object.entries(o).filter(([k]) => k !== 'note' && k !== 'sets')) as Record<string, Motion>;
  const sets = Object.fromEntries(
    Object.entries((o.sets ?? {}) as Record<string, Record<string, unknown>>).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).filter(([kk]) => kk !== 'note'))]),
  ) as MotionSets;
  return { motions, sets };
}

/** 이 몸이 쓸 동작: 기본 동작에 그 몸의 동작 묶음을 뼈 단위로 덮는다. 묶음이 없으면 기본 그대로 */
export function resolveMotions(rig: Rig, motions: Record<string, Motion>, sets: MotionSets | undefined, body?: string): Record<string, Motion> {
  const name = body ? rig.bodyMotions?.[body] : undefined;
  const set = name ? sets?.[name] : undefined;
  if (!set) return motions;
  const out: Record<string, Motion> = { ...motions };
  for (const [id, ov] of Object.entries(set)) {
    if (ov.off) {
      delete out[id];
      continue;
    }
    const base = motions[id];
    const { off: _off, ...rest } = ov;
    out[id] = base ? { ...base, ...rest, tracks: { ...base.tracks, ...(ov.tracks ?? {}) } } : ({ duration: 1000, loop: false, ...rest, tracks: ov.tracks ?? {} } as Motion);
  }
  return out;
}

export const HUMANOID: Rig = rigRaw as unknown as Rig;
const humanoidMotions = readMotions(motionsRaw);
export const MOTIONS: Record<string, Motion> = humanoidMotions.motions;
export const MOTION_SETS: MotionSets = humanoidMotions.sets;

/** 게임이 쓰는 뼈대 하나 (GDD 115-A 100): id = 그림 폴더 이름(public/art/rig/<id>/), 뼈대·동작·동작 묶음 */
export interface RigPack {
  id: string;
  rig: Rig;
  motions: Record<string, Motion>;
  sets: MotionSets;
}
const serpentMotions = readMotions(serpentMotionsRaw);
/** 게임 뼈대 목록: 사람형(사신·아란칼·덩치·길리안 …) + 뱀형. 외형 id 는 뼈대끼리 겹치지 않는다(테스트가 막음) */
export const RIG_PACKS: readonly RigPack[] = [
  { id: 'humanoid', rig: HUMANOID, motions: MOTIONS, sets: MOTION_SETS },
  { id: 'serpent', rig: serpentRaw as unknown as Rig, motions: serpentMotions.motions, sets: serpentMotions.sets },
];
/** 외형 id → 그 외형이 있는 뼈대. 없으면 undefined */
export function rigPackOfLook(look: string): RigPack | undefined {
  return RIG_PACKS.find((p) => p.rig.looks[look]);
}
/** 뼈대 id → 뼈대 (없거나 모르는 id 면 사람형) */
export function rigPack(id?: string): RigPack {
  return RIG_PACKS.find((p) => p.id === id) ?? RIG_PACKS[0]!;
}

/** 키 사이를 부드럽게(처음·끝 느리게) 잇는다 */
function ease(t: number): number {
  return t * t * (3 - 2 * t);
}

function sampleTrack(keys: Key[], t: number): BonePose {
  const first = keys[0];
  if (!first) return { rot: 0, x: 0, y: 0 };
  if (t <= first[0]) return { rot: first[1], x: first[2], y: first[3] };
  for (let i = 1; i < keys.length; i++) {
    const b = keys[i]!;
    if (t <= b[0]) {
      const a = keys[i - 1]!;
      const u = ease((t - a[0]) / Math.max(1, b[0] - a[0]));
      return { rot: a[1] + (b[1] - a[1]) * u, x: a[2] + (b[2] - a[2]) * u, y: a[3] + (b[3] - a[3]) * u };
    }
  }
  const last = keys[keys.length - 1]!;
  return { rot: last[1], x: last[2], y: last[3] };
}

/** 동작의 t(ms) 순간 자세. 반복 동작은 길이로 감고, 한 번 동작은 끝에서 멈춘다. 키 없는 뼈는 0 */
export function samplePose(rig: Rig, motion: Motion, tMs: number): Pose {
  return swayPose(rig, motion, tMs, 0);
}

/** 늘어진 마디 따라가기(GDD 115-A 88)까지 넣은 자세. depth = 늦은 시각을 다시 계산한 횟수(마디 수만큼만 — 끝없이 거슬러 가지 않게) */
function swayPose(rig: Rig, motion: Motion, tMs: number, depth: number): Pose {
  const t = motion.loop ? ((tMs % motion.duration) + motion.duration) % motion.duration : Math.min(Math.max(0, tMs), motion.duration);
  const pose: Pose = {};
  for (const b of rig.bones) {
    const keys = motion.tracks[b.id];
    pose[b.id] = keys ? sampleTrack(keys, t) : { rot: 0, x: 0, y: 0 };
  }
  const sway = rig.sway;
  if (!sway || depth > 3) return pose;
  const parent = new Map(rig.bones.map((b) => [b.id, b.parent] as const));
  // 몸 전체 회전(root — 쓰러짐 등)은 빼고 잰다: 통째로 넘어질 때 마디마다 거꾸로 늘어지며 조각나지 않게(115-A 92)
  const worldRot = (p: Pose, id: string | null | undefined): number => {
    let r = 0;
    for (let b = id; b && parent.get(b); b = parent.get(b)) r += p[b]?.rot ?? 0;
    return r;
  };
  const late = new Map<number, Pose>();
  for (const b of rig.bones) {
    const sw = sway[b.id];
    if (!sw || !b.parent) continue;
    let before = late.get(sw.lag);
    if (!before) late.set(sw.lag, (before = swayPose(rig, motion, tMs - sw.lag, depth + 1)));
    const now = worldRot(pose, b.parent);
    let wave = 0;
    if (sw.wave) {
      const [amp, period, phase] = sw.wave;
      const per = motion.loop ? motion.duration / Math.max(1, Math.round(motion.duration / period)) : period;
      wave = amp * Math.sin((2 * Math.PI * (t - phase)) / per);
    }
    pose[b.id] = { ...pose[b.id]!, rot: pose[b.id]!.rot + sw.swing * (worldRot(before, b.parent) - now) - sw.hang * now + wave };
  }
  return pose;
}

export function mul(m: Mat, n: Mat): Mat {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

export function apply(m: Mat, p: Vec2): Vec2 {
  return [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];
}

/** 뼈 하나의 자기 변환: 관절(pivot) 둘레로 돌리고 x·y 만큼 옮긴다 */
function local(b: Bone, p: BonePose): Mat {
  const r = ((p.rot + (b.restRot ?? 0)) * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const [px, py] = b.pivot;
  const [sx, sy] = b.shift ?? [0, 0];
  // T(x,y) · T(shift) · T(pivot) · R · T(-pivot)
  return [c, s, -s, c, px - c * px + s * py + p.x + sx, py - s * px - c * py + p.y + sy];
}

/** 관절을 d 만큼 옮길 때 더할 보정 이동(GDD 115-A 61, 사용자 2026-11-01 "왜 자꾸 관절 옮기면 부위가 같이 이동함? 이거 고쳐").
 *  관절 둘레로 돌아간 뼈(쉬는 각도 θ)는 관절만 옮기면 그림이 (I − R(θ))·d 만큼 밀린다 → 그만큼 거꾸로. 쉬는 자세에서 이 뼈·아래 뼈 그림이 그대로 */
export function jointMoveShift(restRotDeg: number, d: Vec2): Vec2 {
  const r = (restRotDeg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [-(d[0] - (c * d[0] - s * d[1])), -(d[1] - (s * d[0] + c * d[1]))];
}

/** 이 몸의 관절(따로 맞춘 자리·기본 각도를 얹은 뼈 목록). body 가 없거나 따로 맞춘 게 없으면 bones 그대로 */
export function bodyBones(rig: Rig, body?: string): Bone[] {
  const j = body ? rig.bodyJoints?.[body] : undefined;
  if (!j || typeof j !== 'object') return rig.bones;
  return rig.bones.map((b) => {
    const sh = j.shift?.[b.id];
    return { ...b, pivot: j.pivots?.[b.id] ?? b.pivot, restRot: (b.restRot ?? 0) + (j.rot?.[b.id] ?? 0), ...(sh ? { shift: sh } : {}) };
  });
}

/** 뼈마다 '원래 그림 좌표 → 지금 화면 좌표' 행렬(도트 단위). 부모 뼈를 따라 움직인다. body = 그 몸에 따로 맞춘 관절을 쓴다 */
export function boneMatrices(rig: Rig, pose: Pose, body?: string): Record<string, Mat> {
  const out: Record<string, Mat> = {};
  const byId = new Map(bodyBones(rig, body).map((b) => [b.id, b]));
  const get = (id: string): Mat => {
    const done = out[id];
    if (done) return done;
    const b = byId.get(id);
    if (!b) throw new Error(`뼈 없음: ${id}`);
    const m = local(b, pose[id] ?? { rot: 0, x: 0, y: 0 });
    const w = b.parent ? mul(get(b.parent), m) : m;
    out[id] = w;
    return w;
  };
  for (const b of byId.values()) get(b.id);
  return out;
}

/** 몸의 그림 앞뒤 순서: bodySlots 가 있으면 그 순서(목록 밖 슬롯은 원래 자리 순으로 뒤에), 없으면 slots (GDD 115-A 74) */
export function slotsOf(rig: Rig, body: string): Slot[] {
  const order = rig.bodySlots?.[body];
  if (!order?.length) return rig.slots;
  return rig.slots
    .map((s, i) => ({ s, k: order.indexOf(s.id) < 0 ? order.length + i : order.indexOf(s.id) }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.s);
}

/** 외형 → 슬롯별 부위 그림(앞뒤 순서대로). 그림 없는 슬롯은 빠진다 */
export function lookLayers(rig: Rig, lookId: string): Layer[] {
  const look = rig.looks[lookId];
  if (!look) throw new Error(`외형 없음: ${lookId}`);
  const body = rig.bodies[look.body];
  if (!body) throw new Error(`몸 없음: ${look.body}`);
  const layers: Layer[] = [];
  for (const s of slotsOf(rig, look.body)) {
    const extra = look[s.id];
    const own = body[s.id];
    const part = own ? { ...own, art: lookArt(look, own.art) } : typeof extra === 'object' ? extra : undefined;
    if (part) layers.push({ slot: s.id, bone: s.bone, ...part });
  }
  return layers;
}

/** 부위 그림 행렬 = 뼈 행렬 · (그림을 at 자리로 옮기기). 그림 왼쪽 위(0,0)가 at 에 온다 */
export function partMatrix(bone: Mat, at: Vec2): Mat {
  return mul(bone, [1, 0, 0, 1, at[0], at[1]]);
}

/** 슬롯 그림 뒤집기 행렬(그림 좌표). 칼은 손잡이 → 칼끝 축으로 뒤집어 칼날 자리는 그대로 두고 날·등만 바꾼다 */
export function flipMatrix(rig: Rig, layer: PartArt & { slot: string }): Mat {
  const axis = layer.slot === 'weapon' && rig.swordAxis ? rig.swordAxis : { grip: [layer.size[0] / 2, 0] as Vec2, tip: [layer.size[0] / 2, 1] as Vec2 };
  const [gx, gy] = [axis.grip[0] + 0.5, axis.grip[1] + 0.5];
  let [dx, dy] = [axis.tip[0] - axis.grip[0], axis.tip[1] - axis.grip[1]];
  const n = Math.hypot(dx, dy) || 1;
  [dx, dy] = [dx / n, dy / n];
  const [a, b, d] = [2 * dx * dx - 1, 2 * dx * dy, 2 * dy * dy - 1];
  return [a, b, b, d, gx - a * gx - b * gy, gy - b * gx - d * gy];
}

/** 그리는 차례: 이 동작의 hide 슬롯은 빼고, front 슬롯을 맨 앞으로(나머지는 슬롯 차례 그대로) */
export function orderLayers<T extends { slot: string }>(layers: T[], motion?: Motion): T[] {
  const hide = motion?.hide;
  const order = motion?.order;
  // 이 동작의 앞뒤 순서(목록에 없는 층은 원래 순서대로 맨 뒤 쪽 차례를 지킴 — 목록 밖 = 원래 자리 순)
  const sorted = order?.length
    ? layers.map((l, i) => ({ l, k: order.indexOf(l.slot) < 0 ? order.length + i : order.indexOf(l.slot) })).sort((a, b) => a.k - b.k).map((x) => x.l)
    : layers;
  const shown = hide?.length ? sorted.filter((l) => !hide.includes(l.slot)) : sorted;
  const front = motion?.front;
  if (!front?.length) return shown;
  return [...shown.filter((l) => !front.includes(l.slot)), ...front.flatMap((f) => shown.filter((l) => l.slot === f))];
}

/** 이 순간 그릴 외형: 해방 동작(swapAt)이 그 시각을 지났고 외형에 해방 외형(release)이 있으면 그것 */
export function motionLook(rig: Rig, lookId: string, motion: Motion | undefined, t: number): string {
  const rel = rig.looks[lookId]?.release;
  return motion?.swapAt !== undefined && t >= motion.swapAt && typeof rel === 'string' && rig.looks[rel] ? rel : lookId;
}

/** t 순간의 이펙트(진행 중인 것만), 뼈를 따라가는 것은 뼈 행렬로 옮겨서 */
export function fxAt(motion: Motion | undefined, t: number, mats: Record<string, Mat>): FxDraw[] {
  const out: FxDraw[] = [];
  for (const f of motion?.fx ?? []) {
    if (t < f.t || t > f.t + f.dur) continue;
    const m = f.bone ? mats[f.bone] : undefined;
    const { t: _t, dur, bone: _b, ...rest } = f;
    out.push({ ...rest, pts: f.pts.map((p) => (m ? apply(m, p) : p)), u: (t - f.t) / Math.max(1, dur) });
  }
  return out;
}

/** 층 하나의 화면 행렬: 뼈 · 자리 · (이 동작에서 뒤집는 슬롯이면 뒤집기) */
export function layerMatrix(rig: Rig, mats: Record<string, Mat>, layer: Layer, motion?: Motion): Mat {
  const m = partMatrix(mats[layer.bone]!, layer.at);
  return motion?.flip?.includes(layer.slot) ? mul(m, flipMatrix(rig, layer)) : m;
}

/** 머리카락 층(앞머리·일반머리 = hair, 몸 뒤로 늘어지는 뒷머리 = hair_back) — 둘 다 머리카락 틀 안 */
export const HAIR_SLOTS = ['hair', 'hair_back'] as const;
/** 겉옷 층: 부위 바로 위에 얹혀 그 뼈를 따라 움직인다(그림이 있는 외형만) */
export const OUTER_SLOTS = ['outer_torso', 'outer_arm_L', 'outer_arm_R'] as const;

/** 머리카락 틀(일반머리 rect, 뒷머리는 길게 backRect) */
export function hairRect(rig: Rig, slot = 'hair'): [number, number, number, number] {
  return slot === 'hair_back' ? rig.hairFrame.backRect ?? rig.hairFrame.rect : rig.hairFrame.rect;
}

/** 머리카락 그림 상자가 머리카락 틀 안에 있는가 */
export function insideFrame(rig: Rig, p: PartArt, slot = 'hair'): boolean {
  const [fx, fy, fw, fh] = hairRect(rig, slot);
  return p.at[0] >= fx && p.at[1] >= fy && p.at[0] + p.size[0] <= fx + fw && p.at[1] + p.size[1] <= fy + fh;
}

/** 데이터 점검: 부모·슬롯 뼈가 있는지, 동작 키가 시간순이고 길이 안인지. 문제 목록(빈 배열 = 정상) */
export function validateRig(rig: Rig, motions: Record<string, Motion>, sets: MotionSets = {}): string[] {
  const errs: string[] = [];
  const ids = new Set(rig.bones.map((b) => b.id));
  for (const b of rig.bones) if (b.parent && !ids.has(b.parent)) errs.push(`${b.id}: 부모 ${b.parent} 없음`);
  for (const s of rig.slots) if (!ids.has(s.bone)) errs.push(`슬롯 ${s.id}: 뼈 ${s.bone} 없음`);
  for (const [id, sw] of Object.entries(rig.sway ?? {})) {
    const b = rig.bones.find((x) => x.id === id);
    if (!b?.parent) errs.push(`늘어진 마디 ${id}: 부모 있는 뼈가 아님`);
    if (!(sw.lag >= 0) || !(sw.swing >= 0) || !(sw.hang >= 0 && sw.hang <= 1)) errs.push(`늘어진 마디 ${id}: lag·swing ≥ 0, hang 0~1`);
    if (sw.wave && !(sw.wave.length === 3 && sw.wave[1] > 0)) errs.push(`늘어진 마디 ${id}: wave = [진폭, 시간(>0), 늦음]`);
  }
  for (const [b, order] of Object.entries(rig.bodySlots ?? {})) {
    if (!rig.bodies[b]) errs.push(`몸별 앞뒤 순서 ${b}: 몸 없음`);
    for (const id of order) if (!rig.slots.some((s) => s.id === id)) errs.push(`몸별 앞뒤 순서 ${b}: 슬롯 ${id} 없음`);
  }
  for (const [bid, j] of Object.entries(rig.bodyJoints ?? {})) {
    if (typeof j !== 'object') continue;
    if (!rig.bodies[bid]) errs.push(`몸별 관절 ${bid}: 몸 없음`);
    for (const k of [...Object.keys(j.pivots ?? {}), ...Object.keys(j.rot ?? {}), ...Object.keys(j.shift ?? {})]) if (!ids.has(k)) errs.push(`몸별 관절 ${bid}: 뼈 ${k} 없음`);
  }
  for (const [lid, look] of Object.entries(rig.looks)) {
    if (!rig.bodies[look.body]) errs.push(`외형 ${lid}: 몸 ${look.body} 없음`);
    if (typeof look.release === 'string' && !rig.looks[look.release]) errs.push(`외형 ${lid}: 해방 외형 ${look.release} 없음`);
    for (const k of ['artFolder', 'color'] as const) if (look[k] !== undefined && (typeof look[k] !== 'string' || !look[k])) errs.push(`외형 ${lid}: ${k} 는 글자`);
    for (const k of HAIR_SLOTS) {
      const hair = look[k];
      if (typeof hair === 'object' && !insideFrame(rig, hair, k)) errs.push(`외형 ${lid}: ${k} 가 머리카락 틀 밖`);
    }
  }
  for (const [bid, name] of Object.entries(rig.bodyMotions ?? {})) {
    if (!rig.bodies[bid]) errs.push(`몸 동작 묶음 ${bid}: 몸 없음`);
    if (!sets[name]) errs.push(`몸 동작 묶음 ${bid}: 묶음 ${name} 없음`);
  }
  for (const [lead, fs] of Object.entries(rig.edit?.follow ?? {})) {
    for (const f of [lead, ...fs]) if (!rig.slots.some((s) => s.id === f)) errs.push(`같이 옮기기 ${lead}: 슬롯 ${f} 없음`);
  }
  // 동작 묶음은 덮은 결과를 같은 기준으로 본다
  const all: [string, Motion][] = [
    ...Object.entries(motions),
    ...Object.entries(sets).flatMap(([name, set]) => Object.keys(set).filter((id) => !set[id]!.off).map((id) => [`${name}:${id}`, resolveMotions({ ...rig, bodyMotions: { _: name } }, motions, sets, '_')[id]!] as [string, Motion])),
  ];
  for (const [mid, m] of all) {
    if (!(m.duration > 0)) errs.push(`${mid}: 길이 0`);
    if (m.hit !== undefined && (m.hit < 0 || m.hit > m.duration)) errs.push(`${mid}: 타격 시각이 길이 밖`);
    for (const f of m.flip ?? []) if (!rig.slots.some((s) => s.id === f)) errs.push(`${mid}: 뒤집을 슬롯 ${f} 없음`);
    for (const f of m.front ?? []) if (!rig.slots.some((s) => s.id === f)) errs.push(`${mid}: 앞으로 올릴 슬롯 ${f} 없음`);
    for (const f of m.hide ?? []) if (!rig.slots.some((s) => s.id === f)) errs.push(`${mid}: 숨길 슬롯 ${f} 없음`);
    for (const f of m.fx ?? []) {
      if (f.bone && !ids.has(f.bone)) errs.push(`${mid}: 이펙트 뼈 ${f.bone} 없음`);
      if (f.t < 0 || f.t > m.duration) errs.push(`${mid}: 이펙트 시각이 길이 밖`);
    }
    if (m.swapAt !== undefined && (m.swapAt < 0 || m.swapAt > m.duration)) errs.push(`${mid}: 해방 바꿔치기 시각이 길이 밖`);
    for (const [bid, keys] of Object.entries(m.tracks)) {
      if (!ids.has(bid)) errs.push(`${mid}: 뼈 ${bid} 없음`);
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i]!;
        if (k.length !== 4) errs.push(`${mid}.${bid}[${i}]: 키는 [t, 각도, x, y]`);
        if (k[0] < 0 || k[0] > m.duration) errs.push(`${mid}.${bid}[${i}]: 시각이 길이 밖`);
        if (i > 0 && k[0] < keys[i - 1]![0]) errs.push(`${mid}.${bid}[${i}]: 시각 순서`);
      }
    }
  }
  return errs;
}
