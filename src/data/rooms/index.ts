// 방 목록 (GDD 12-4 v6.032·17-5, C.432): 방 키 → { 배경, 물건 자리 … }. 종족 방(종족 설정 room) 위에 덮어 쓰는 방 — 초월자마다 자기 방 등.
// 이 폴더의 *.json 을 모은다. 빈 칸(layout·floor·characterFoot·extras·shape)은 바탕 종족 방 값 그대로(사용자가 배치 도구로 맞출 예정).
// 배치 도구 '새 방 만들기'(17-5)가 내보내는 방도 같은 모양(id · label · sceneArt · layout …)으로 여기에 들어온다.
import type { ExtraProp, PropSpot, RoomFloorConfig, RoomProp } from '../../engine/faction';

export interface RoomDef {
  id: string;
  /** 사람이 읽는 이름 (배치 도구 장면 목록) */
  label: string;
  /** 배경 그림 키 (scene.<이름> → public/art/scene-<이름>.webp) */
  sceneArt: string;
  shape?: string;
  layout?: Partial<Record<RoomProp, PropSpot>>;
  floor?: RoomFloorConfig;
  characterFoot?: { x: number; y: number };
  extras?: ExtraProp[];
}

export function parseRoomDef(r: unknown): RoomDef {
  const t = (r ?? {}) as Partial<RoomDef>;
  const errors: string[] = [];
  if (typeof t.id !== 'string' || !t.id) errors.push('id');
  if (typeof t.label !== 'string' || !t.label) errors.push('label');
  if (typeof t.sceneArt !== 'string' || !t.sceneArt.startsWith('scene.')) errors.push('sceneArt (scene.<이름>)');
  if (t.layout !== undefined && (typeof t.layout !== 'object' || t.layout === null)) errors.push('layout');
  if (errors.length > 0) throw new Error(`방 데이터 오류 (${String(t.id ?? '?')}): ${errors.join(', ')}`);
  return t as RoomDef;
}

export function collectRooms(mods: Record<string, { default: unknown }>): RoomDef[] {
  const list = Object.keys(mods).sort().map((p) => parseRoomDef(mods[p]!.default));
  if (new Set(list.map((x) => x.id)).size !== list.length) throw new Error('방 id 가 겹친다');
  return list;
}

/** 실제 객체 (배치 도구 미리보기가 자리를 써 넣는다) */
export const ROOMS: RoomDef[] = collectRooms(import.meta.glob<{ default: unknown }>('./*.json', { eager: true }));

export function tryGetRoom(id: string | null | undefined): RoomDef | undefined {
  return id ? ROOMS.find((r) => r.id === id) : undefined;
}
