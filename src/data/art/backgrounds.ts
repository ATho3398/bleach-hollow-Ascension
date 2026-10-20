// 사냥터 배경 그림 (GDD 34-1): 장면 id(desert·forest·…) → 층 목록. 층 파일은 `public/art/bg-<장면>-<층>.webp|png`.
// 어느 사냥터·무대가 어느 장면을 쓰는지는 종족 설정(huntingGrounds.<id>.bg, arenaBg)이 정한다 — 여기는 종족을 모른다.
// 파일이 하나도 없는 장면은 null → 화면은 지금의 임시 배경 그대로.
import { ART_FILES, findArtFile } from './files';
import raw from './backgrounds.json';

export interface BgLayerDef {
  /** 층 id: 파일 이름 bg-<장면>-<층> 의 <층> (sky = 먼 하늘·벽, ground = 땅·가까운 풍경) */
  id: string;
  /** 그림 원본 크기(px): 가로 반복 한 칸의 비율을 정한다 */
  w: number;
  h: number;
  /** 장면 높이 대비 층 높이 (%), 아래에 붙는다. 100 = 화면 가득 */
  height: number;
  /** 걷기 화면 흐르는 빠르기 배율 (1 = 땅). 작을수록 멀리 보인다 */
  speed: number;
}

export interface SceneBgLayer {
  url: string;
  /** 가로/세로 비율 (한 칸 너비 = 층 높이 × ratio) */
  ratio: number;
  height: number;
  speed: number;
}

export interface SceneBg {
  id: string;
  /** 확대 배율 (1 = 그대로) */
  zoom: number;
  layers: SceneBgLayer[];
}

const isPos = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

export function parseBackgrounds(r: unknown): { credit: string; scenes: Record<string, BgLayerDef[]> } {
  const o = (r ?? {}) as Record<string, unknown>;
  const errors: string[] = [];
  if (typeof o.credit !== 'string' || !o.credit) errors.push('credit: 출처 문구');
  const scenes: Record<string, BgLayerDef[]> = {};
  const sc = (o.scenes ?? {}) as Record<string, unknown>;
  for (const [id, v] of Object.entries(sc)) {
    if (!/^[a-z0-9-]+$/.test(id)) errors.push(`scenes.${id}: 영문 소문자·숫자·하이픈`);
    const layers = ((v ?? {}) as Record<string, unknown>).layers;
    if (!Array.isArray(layers) || layers.length === 0) {
      errors.push(`scenes.${id}.layers: 1개 이상`);
      continue;
    }
    scenes[id] = layers.map((l: unknown, i: number) => {
      const x = (l ?? {}) as Record<string, unknown>;
      if (typeof x.id !== 'string' || !/^[a-z0-9]+$/.test(x.id)) errors.push(`scenes.${id}.layers[${i}].id`);
      if (!isPos(x.w) || !isPos(x.h)) errors.push(`scenes.${id}.layers[${i}]: w·h 양수`);
      if (!isPos(x.height) || (x.height as number) > 100) errors.push(`scenes.${id}.layers[${i}].height: 0~100`);
      if (!isPos(x.speed)) errors.push(`scenes.${id}.layers[${i}].speed: 양수`);
      return { id: x.id as string, w: x.w as number, h: x.h as number, height: x.height as number, speed: x.speed as number };
    });
  }
  if (errors.length > 0) throw new Error(`배경 데이터 오류: ${errors.join(', ')}`);
  return { credit: o.credit as string, scenes };
}

const DATA = parseBackgrounds(raw);
/** 출처 표기 한 줄 (설정 > 정보) */
export const BG_CREDIT: string = DATA.credit;
export const BG_SCENES: Readonly<Record<string, readonly BgLayerDef[]>> = DATA.scenes;

/** 층 그림 키: bg.<장면>.<층> → 파일 bg-<장면>-<층> */
export function bgArtKey(sceneId: string, layerId: string): string {
  return `bg.${sceneId}.${layerId}`;
}

/** 땅 띠가 장면 높이에서 차지할 목표(%, 약 45~55 의 가운데)와 최대 확대 배율 (GDD 34-6·34-7) */
export const BG_GROUND_TARGET = 50;
export const BG_ZOOM_MAX = 2.2;

/** 장면 확대 배율: 땅 층이 목표보다 낮으면 그만큼, 이미 넘으면 1 (줄이지 않는다 — 하늘이 장면을 덮어야 한다) */
export function bgZoom(groundHeight: number): number {
  return Math.min(BG_ZOOM_MAX, Math.max(1, BG_GROUND_TARGET / groundHeight));
}

/** 장면 id → 들어 있는 층만 (없거나 모르는 장면이면 null) */
export function sceneBg(sceneId: string | undefined | null, base = '/', files: readonly string[] = ART_FILES, scenes: Readonly<Record<string, readonly BgLayerDef[]>> = BG_SCENES): SceneBg | null {
  if (!sceneId) return null;
  const defs = scenes[sceneId];
  if (!defs) return null;
  const layers: SceneBgLayer[] = [];
  for (const d of defs) {
    const f = findArtFile(bgArtKey(sceneId, d.id), files);
    if (f) layers.push({ url: `${base.replace(/\/$/, '')}/${f}`, ratio: d.w / d.h, height: d.height, speed: d.speed });
  }
  if (layers.length === 0) return null;
  // 모든 층을 같은 배율로 키운다(하늘:땅 비율 그대로, 아래 기준, 넘치는 위쪽은 잘림)
  const ground = defs.find((d) => d.id === 'ground');
  const zoom = ground ? bgZoom(ground.height) : 1;
  return { id: sceneId, zoom, layers: layers.map((l) => ({ ...l, height: l.height * zoom })) };
}
