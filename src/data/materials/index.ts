// 재료 22종 (GDD 154장, C.229 provisional): 가방 '기타' 창에만 보인다. 두 종족 공통 — 종족 분기 없음.
// 쓰임·얻는 곳은 아직 없다(사용자가 나중에 정한다). 개수는 보관함 shared.items 에 id 그대로 담는다(세이브 형식 그대로).
import raw from './materials.json';

export interface MaterialDef {
  id: string;
  name: string;
  /** 아이콘 스프라이트 id (그림이 생기기 전 대체 아이콘) */
  icon: string;
  /** 이름 옆 짧은 구분 (호박 = 보석) */
  note?: string;
}

function parseMaterial(r: unknown): MaterialDef {
  const m = (r ?? {}) as Record<string, unknown>;
  if (typeof m.id !== 'string' || !m.id.startsWith('mat-')) throw new Error(`materials.json: id 는 mat-… (${JSON.stringify(r)})`);
  if (typeof m.name !== 'string' || !m.name) throw new Error(`materials.json ${m.id}: name`);
  if (typeof m.icon !== 'string' || !m.icon.startsWith('i-')) throw new Error(`materials.json ${m.id}: icon`);
  return { id: m.id, name: m.name, icon: m.icon, ...(typeof m.note === 'string' ? { note: m.note } : {}) };
}

export const MATERIALS: readonly MaterialDef[] = (raw.materials as unknown[]).map(parseMaterial);
export const MATERIAL_IDS: readonly string[] = MATERIALS.map((m) => m.id);
/** 설명 한 줄 (provisional — 쓰임이 정해지면 재료마다 바뀐다) */
export const MATERIAL_DESC: string = raw.desc;
/** 보유 0개일 때 '기타' 창 한 줄 */
export const MATERIALS_EMPTY = '아직 가진 재료가 없다';

export function getMaterial(id: string): MaterialDef | undefined {
  return MATERIALS.find((m) => m.id === id);
}

/** 가진 재료 (데이터 순서) */
export function ownedMaterials(items: Readonly<Record<string, number>>): { def: MaterialDef; count: number }[] {
  return MATERIALS.map((def) => ({ def, count: items[def.id] ?? 0 })).filter((x) => x.count > 0);
}
