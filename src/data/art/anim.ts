// 프레임 애니메이션 그림 (GDD 26장, C.55): 동작 키 표, 프레임 파일 찾기, 재생 계산. 순수 함수만 둔다(재생기는 src/ui/bha/animPlayer.ts).
//
// 파일 규칙: `public/art/<그림 키>/<동작>-<번호>.png|webp` (번호 1부터, 끊기지 않게). 예 `art/char-hollow-1/idle-1.png`.
// 동작마다 따로 있다/없다 — 있는 동작만 애니로 돌리고 없는 동작은 기존 연출을 그대로 쓴다(다른 동작 애니로 대신하지 않는다).
import { ART_EXTS } from './files';

export type AnimAction = 'idle' | 'move' | 'attack' | 'skill' | 'hit' | 'win' | 'lose' | 'eat' | 'sleep' | 'release';

/** loop 반복 / once 한 번 재생 후 대기 동작으로 / hold 한 번 재생 후 마지막 장 유지 */
export type AnimPlayMode = 'loop' | 'once' | 'hold';

export interface AnimActionDef {
  key: AnimAction;
  /** 사람이 읽는 이름 */
  label: string;
  mode: AnimPlayMode;
  /** 기본 프레임당 시간(ms, GDD 26-4b) */
  ms: number;
  /** 첫·마지막 프레임만 다른 기본 시간(ms). idle 은 양 끝 450 */
  endMs?: number;
  /** 쓰이는 곳 */
  where: string;
  /** 이 동작이 없으면 */
  fallback: string;
}

/** 동작 키 10종 (GDD 26-3, 속도는 26-4b 의 프레임당 ms). 새 동작은 이 표에 한 줄 */
export const ANIM_ACTIONS: readonly AnimActionDef[] = [
  { key: 'idle', label: '대기', mode: 'loop', ms: 300, endMs: 450, where: '방, 전투 대기, 걷기 멈춤', fallback: '정지 그림' },
  { key: 'move', label: '이동', mode: 'loop', ms: 130, where: '원정 걷기', fallback: '걷기 흔들림' },
  { key: 'attack', label: '공격', mode: 'once', ms: 150, where: '평타·블록 공격', fallback: '몸통박치기' },
  { key: 'skill', label: '특수 공격', mode: 'once', ms: 150, where: '필살기·계열 특수 공격', fallback: '지금 계열 연출' },
  { key: 'hit', label: '맞음', mode: 'once', ms: 140, where: '피격', fallback: '흰 실루엣 깜빡임 2번 + 뒤로 튕김' },
  { key: 'win', label: '기뻐하기', mode: 'hold', ms: 180, where: '전투 승리, 교감', fallback: '지금 연출' },
  { key: 'lose', label: '패배', mode: 'hold', ms: 180, where: '전투 패배(적은 쓰러짐)', fallback: '지금 연출' },
  { key: 'eat', label: '먹기', mode: 'once', ms: 180, where: '먹이 주기', fallback: '지금 연출' },
  { key: 'sleep', label: '잠', mode: 'loop', ms: 450, where: '재우기', fallback: '지금 연출' },
  { key: 'release', label: '해방 변신', mode: 'once', ms: 150, where: '해방 버튼', fallback: '공통 컷인' },
];

export const ANIM_ACTION_KEYS: readonly AnimAction[] = ANIM_ACTIONS.map((a) => a.key);

export function animDef(action: AnimAction): AnimActionDef {
  return ANIM_ACTIONS.find((a) => a.key === action)!;
}

/** 폴더의 선택 파일 anim.json (GDD 26-4b): 동작별 `ms` = 프레임당 시간(숫자 하나 = 모든 프레임 같음, 배열 = 프레임별), 옛 `fps`(초당 장수, ms 가 있으면 ms 우선), `hit` = 피해 숫자가 뜨는 프레임 번호(1부터) */
export type AnimOverrides = Partial<Record<AnimAction, { ms?: number | number[]; fps?: number; hit?: number }>>;

export interface AnimClip {
  action: AnimAction;
  /** 프레임 이미지 주소(배포 경로 포함), 재생 순서 */
  frames: string[];
  /** 프레임마다 보이는 시간(ms) — frames 와 같은 길이 */
  frameMs: number[];
  mode: AnimPlayMode;
  /** 피해 숫자 타이밍 프레임(0부터). 기본 = 가운데 프레임 */
  hitFrame: number;
}

export type AnimSet = Partial<Record<AnimAction, AnimClip>>;

/** 그림 키 → 폴더 이름 (파일 이름 기본형과 같은 규칙: 마침표 → 하이픈) */
export function animDir(key: string): string {
  return key.replace(/\./g, '-');
}

/** 한 동작의 프레임 파일 이름들(`폴더/동작-번호.확장자`). 1번부터 끊기는 곳 앞까지, 프레임마다 webp 가 png 보다 먼저 */
export function frameFiles(key: string, action: AnimAction, files: readonly string[]): string[] {
  const dir = animDir(key);
  const out: string[] = [];
  for (let n = 1; ; n++) {
    const hit = ART_EXTS.map((ext) => `${dir}/${action}-${n}.${ext}`).find((f) => files.includes(f));
    if (!hit) break;
    out.push(hit);
  }
  return out;
}

/** 폴더 하나의 동작별 프레임 수 (`npm run art:list`) */
export function animCounts(key: string, files: readonly string[]): Record<AnimAction, number> {
  const r = {} as Record<AnimAction, number>;
  for (const a of ANIM_ACTION_KEYS) r[a] = frameFiles(key, a, files).length;
  return r;
}

/** 프레임 수 한 줄 표시 (예 `idle 3 · move 5 · attack 없음`). 쓰는 동작이 하나도 없으면 null */
export function animCountsLine(key: string, files: readonly string[], actions: readonly AnimAction[] = ['idle', 'move', 'attack']): string | null {
  const c = animCounts(key, files);
  if (ANIM_ACTION_KEYS.every((a) => c[a] === 0)) return null;
  const shown = new Set<AnimAction>([...actions, ...ANIM_ACTION_KEYS.filter((a) => c[a] > 0)]);
  return ANIM_ACTION_KEYS.filter((a) => shown.has(a)).map((a) => `${a} ${c[a] > 0 ? c[a] : '없음'}`).join(' · ');
}

const joinBase = (base: string, p: string) => `${base.replace(/\/$/, '')}/${p.replace(/^\//, '')}`;

/** 선택 anim.json 값 정리: 숫자가 아니거나 0 이하면 무시 */
function pos(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined;
}

const MS_MIN = 16;
const MS_MAX = 5000;
const clampMs = (v: number): number => Math.min(MS_MAX, Math.max(MS_MIN, v));

/** 프레임별 시간(ms): 기본 = 표(idle 은 양 끝만 endMs), anim.json `ms` 숫자는 전부 같게, 배열은 프레임별(모자라는 칸은 기본값, 넘치면 버림), 옛 `fps` 는 ms 가 없을 때만 */
export function frameMsFor(def: AnimActionDef, count: number, o?: { ms?: unknown; fps?: unknown }): number[] {
  const base = (i: number): number => (def.endMs !== undefined && (i === 0 || i === count - 1) ? def.endMs : def.ms);
  const out: number[] = [];
  const arr = Array.isArray(o?.ms) ? (o!.ms as unknown[]) : null;
  const one = pos(o?.ms) ?? (arr ? undefined : pos(o?.fps) ? 1000 / pos(o?.fps)! : undefined);
  for (let i = 0; i < count; i++) out.push(clampMs(one ?? pos(arr?.[i]) ?? base(i)));
  return out;
}

/**
 * 그림 키들(우선순위 순서)에서 동작마다 프레임을 찾는다. 동작마다 따로 첫 번째로 프레임이 있는 키를 쓴다
 * (예: 단계별 폴더에 idle 만 있으면 move 는 종족 공통 폴더에서). 어디에도 없는 동작은 결과에 없다.
 */
export function resolveAnims(keys: readonly string[], base: string, files: readonly string[], overrides: Readonly<Record<string, AnimOverrides>>): AnimSet {
  const set: AnimSet = {};
  for (const def of ANIM_ACTIONS) {
    for (const key of keys) {
      const names = frameFiles(key, def.key, files);
      if (names.length === 0) continue;
      const o = overrides[animDir(key)]?.[def.key];
      const hit = pos(o?.hit);
      set[def.key] = {
        action: def.key,
        frames: names.map((n) => joinBase(base, `art/${n}`)),
        frameMs: frameMsFor(def, names.length, o),
        mode: def.mode,
        hitFrame: Math.min(names.length - 1, Math.max(0, hit ? Math.floor(hit) - 1 : Math.ceil(names.length / 2) - 1)),
      };
      break;
    }
  }
  return set;
}

export const hasAnims = (s: AnimSet | undefined | null): s is AnimSet => !!s && Object.keys(s).length > 0;

/** 한 번 재생하는 데 걸리는 시간(ms, 1배속) */
export function clipDurationMs(c: AnimClip): number {
  return c.frameMs.reduce((a, b) => a + b, 0);
}

/** 타격 순간(ms, 1배속): 타격 프레임이 화면에 올라오는 시각 */
export function clipHitMs(c: AnimClip): number {
  return c.frameMs.slice(0, c.hitFrame).reduce((a, b) => a + b, 0);
}

/** 경과 시간 → 보일 프레임. 반복이면 계속 돌고, 아니면 마지막 장에서 done */
export function frameAt(c: AnimClip, elapsedMs: number): { index: number; done: boolean } {
  const total = clipDurationMs(c);
  let t = Math.max(0, elapsedMs);
  if (c.mode === 'loop') t %= total;
  else if (t >= total) return { index: c.frames.length - 1, done: true };
  for (let i = 0; i < c.frameMs.length; i++) {
    if (t < c.frameMs[i]!) return { index: i, done: false };
    t -= c.frameMs[i]!;
  }
  return { index: c.frames.length - 1, done: c.mode !== 'loop' };
}
