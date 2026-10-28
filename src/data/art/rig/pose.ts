// 종이인형 뼈대 (GDD 96장): 부위 그림을 관절마다 돌리고 옮겨 움직인다(크루세이더 퀘스트식).
// 여기는 DOM 없는 계산만 — 동작 키를 시간으로 뽑고(samplePose), 뼈마다 화면 변환 행렬을 만든다(boneMatrices).
// 그리기(<img> 겹치기 + CSS transform)는 src/ui/bha/paperdoll.ts. 종족을 모른다: 어느 몸·머리카락을 쓸지는 looks 데이터.
import rigRaw from './humanoid.json';
import motionsRaw from './motions.json';

export type Vec2 = [number, number];
/** CSS matrix(a, b, c, d, e, f) 순서: x' = a·x + c·y + e, y' = b·x + d·y + f */
export type Mat = [number, number, number, number, number, number];

export interface Bone {
  id: string;
  parent: string | null;
  pivot: Vec2;
  /** 쉬는 자세 각도(도). 무기처럼 그림은 곧게 그리고 들고 있는 각도만 주고 싶을 때. 동작 각도에 더해진다 */
  restRot?: number;
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
  hairFrame: { rect: [number, number, number, number]; keepOut: [number, number, number, number] };
  /** 칼 그림 안 손잡이 가운데 → 칼끝(그림 좌표). 칼을 비스듬히 그려도 칼날 방향을 알 수 있게 */
  swordAxis?: { grip: Vec2; tip: Vec2 };
}

/** 부위 그림 하나: `public/art/rig/<rig id>/<art>.png`(꼭 맞게 자른 그림), at = 캔버스에서 왼쪽 위 자리, size = 그림 크기 */
export interface PartArt {
  art: string;
  at: Vec2;
  size: Vec2;
}
export type Look = { body: string; [slot: string]: PartArt | string };
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
  tracks: Record<string, Key[]>;
}
export interface BonePose {
  rot: number;
  x: number;
  y: number;
}
export type Pose = Record<string, BonePose>;

export const HUMANOID: Rig = rigRaw as unknown as Rig;
export const MOTIONS: Record<string, Motion> = Object.fromEntries(
  Object.entries(motionsRaw as Record<string, unknown>).filter(([k]) => k !== 'note'),
) as Record<string, Motion>;

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
  const t = motion.loop ? ((tMs % motion.duration) + motion.duration) % motion.duration : Math.min(Math.max(0, tMs), motion.duration);
  const pose: Pose = {};
  for (const b of rig.bones) {
    const keys = motion.tracks[b.id];
    pose[b.id] = keys ? sampleTrack(keys, t) : { rot: 0, x: 0, y: 0 };
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
  // T(x,y) · T(pivot) · R · T(-pivot)
  return [c, s, -s, c, px - c * px + s * py + p.x, py - s * px - c * py + p.y];
}

/** 뼈마다 '원래 그림 좌표 → 지금 화면 좌표' 행렬(도트 단위). 부모 뼈를 따라 움직인다 */
export function boneMatrices(rig: Rig, pose: Pose): Record<string, Mat> {
  const out: Record<string, Mat> = {};
  const byId = new Map(rig.bones.map((b) => [b.id, b]));
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
  for (const b of rig.bones) get(b.id);
  return out;
}

/** 외형 → 슬롯별 부위 그림(앞뒤 순서대로). 그림 없는 슬롯은 빠진다 */
export function lookLayers(rig: Rig, lookId: string): Layer[] {
  const look = rig.looks[lookId];
  if (!look) throw new Error(`외형 없음: ${lookId}`);
  const body = rig.bodies[look.body];
  if (!body) throw new Error(`몸 없음: ${look.body}`);
  const layers: Layer[] = [];
  for (const s of rig.slots) {
    const extra = look[s.id];
    const part = body[s.id] ?? (typeof extra === 'object' ? extra : undefined);
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

/** 층 하나의 화면 행렬: 뼈 · 자리 · (이 동작에서 뒤집는 슬롯이면 뒤집기) */
export function layerMatrix(rig: Rig, mats: Record<string, Mat>, layer: Layer, motion?: Motion): Mat {
  const m = partMatrix(mats[layer.bone]!, layer.at);
  return motion?.flip?.includes(layer.slot) ? mul(m, flipMatrix(rig, layer)) : m;
}

/** 머리카락 층(앞머리·일반머리 = hair, 몸 뒤로 늘어지는 뒷머리 = hair_back) — 둘 다 머리카락 틀 안 */
export const HAIR_SLOTS = ['hair', 'hair_back'] as const;
/** 겉옷 층: 부위 바로 위에 얹혀 그 뼈를 따라 움직인다(그림이 있는 외형만) */
export const OUTER_SLOTS = ['outer_torso', 'outer_arm_L', 'outer_arm_R'] as const;

/** 머리카락 그림 상자가 머리카락 틀 안에 있는가 */
export function insideFrame(rig: Rig, p: PartArt): boolean {
  const [fx, fy, fw, fh] = rig.hairFrame.rect;
  return p.at[0] >= fx && p.at[1] >= fy && p.at[0] + p.size[0] <= fx + fw && p.at[1] + p.size[1] <= fy + fh;
}

/** 데이터 점검: 부모·슬롯 뼈가 있는지, 동작 키가 시간순이고 길이 안인지. 문제 목록(빈 배열 = 정상) */
export function validateRig(rig: Rig, motions: Record<string, Motion>): string[] {
  const errs: string[] = [];
  const ids = new Set(rig.bones.map((b) => b.id));
  for (const b of rig.bones) if (b.parent && !ids.has(b.parent)) errs.push(`${b.id}: 부모 ${b.parent} 없음`);
  for (const s of rig.slots) if (!ids.has(s.bone)) errs.push(`슬롯 ${s.id}: 뼈 ${s.bone} 없음`);
  for (const [lid, look] of Object.entries(rig.looks)) {
    if (!rig.bodies[look.body]) errs.push(`외형 ${lid}: 몸 ${look.body} 없음`);
    for (const k of HAIR_SLOTS) {
      const hair = look[k];
      if (typeof hair === 'object' && !insideFrame(rig, hair)) errs.push(`외형 ${lid}: ${k} 가 머리카락 틀 밖`);
    }
  }
  for (const [mid, m] of Object.entries(motions)) {
    if (!(m.duration > 0)) errs.push(`${mid}: 길이 0`);
    if (m.hit !== undefined && (m.hit < 0 || m.hit > m.duration)) errs.push(`${mid}: 타격 시각이 길이 밖`);
    for (const f of m.flip ?? []) if (!rig.slots.some((s) => s.id === f)) errs.push(`${mid}: 뒤집을 슬롯 ${f} 없음`);
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
