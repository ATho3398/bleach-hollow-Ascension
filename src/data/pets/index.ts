// 펫 (GDD 90장, C.144 가칭·provisional): 하나 데리고 다니는 작은 보조. 종류 4종(효과 하나씩).
// 이름은 종족 설정(faction json petNames), 효과 수치는 balance.ts provisional.pets, 그림 키(art)는 여기 — 그림 파일이 없으면 화면은 임시 아이콘 원.
import petsRaw from './pets.json';
import placeRaw from './place.json';

/** 'none' = 효과 미정(기획 [미정], GDD 9-4 v6.112) — 따라다니고 같이 공격만 한다 */
export const PET_EFFECTS = ['gold', 'belly', 'guard', 'seek', 'none'] as const;
export type PetEffect = (typeof PET_EFFECTS)[number];

export interface PetDef {
  id: string;
  effect: PetEffect;
  /** 그림 키 (artUrls 키). 파일이 없으면 임시 아이콘 */
  art: string;
  /** 얻는 길(바퀴 끝 굴림·펫 알·첫 선물)에 들어가나. false = 아직 얻는 법 없음(테스트 모드에서만) — 효과가 정해질 때까지 (C.482) */
  pool: boolean;
}

function parsePet(r: unknown): PetDef {
  const p = (r ?? {}) as Record<string, unknown>;
  const errors: string[] = [];
  if (typeof p.id !== 'string' || !p.id.startsWith('pet-')) errors.push('id: pet-…');
  if (!(PET_EFFECTS as readonly unknown[]).includes(p.effect)) errors.push(`effect: ${PET_EFFECTS.join(' | ')}`);
  if (typeof p.art !== 'string' || !p.art) errors.push('art');
  if (p.pool !== undefined && typeof p.pool !== 'boolean') errors.push('pool: true | false');
  if (errors.length) throw new Error(`펫 데이터 오류 (${String(p.id ?? '?')}): ${errors.join(', ')}`);
  return { id: p.id as string, effect: p.effect as PetEffect, art: p.art as string, pool: p.pool !== false };
}

export const PETS_PROVISIONAL: boolean = petsRaw.provisional;
export const PETS: readonly PetDef[] = petsRaw.pets.map(parsePet);
export const PET_IDS: readonly string[] = PETS.map((p) => p.id);
/** 얻는 길에 들어가는 펫 (바퀴 끝 굴림·펫 알·첫 선물) */
export const PET_POOL_IDS: readonly string[] = PETS.filter((p) => p.pool).map((p) => p.id);

export function getPet(id: string): PetDef | undefined {
  return PETS.find((p) => p.id === id);
}

export function isPetId(id: unknown): id is string {
  return typeof id === 'string' && PET_IDS.includes(id);
}

/** 그림 펫 자리 (C.485): 그림 키 → 기본 자리에서 옮긴 칸(CSS px, dx 오른쪽 +, dy 아래 +). 없으면 0,0 */
/** 그림 펫 기본 표시 배율 (GDD 9-4 v6.114): 그림 1칸 = 화면 1.7px */
export const PET_ART_SCALE = 1.7;
export interface PetPlace { dx: number; dy: number; /** 표시 배율 (없으면 PET_ART_SCALE) */ scale?: number; /** 좌우 반전 */ flip?: boolean }
function parsePlaces(raw: unknown): Record<string, PetPlace> {
  const out: Record<string, PetPlace> = {};
  for (const [k, v] of Object.entries((raw ?? {}) as Record<string, unknown>)) {
    const p = (v ?? {}) as Record<string, unknown>;
    if (typeof p.dx !== 'number' || typeof p.dy !== 'number' || !Number.isFinite(p.dx) || !Number.isFinite(p.dy)) throw new Error(`펫 자리 오류 (${k}): { dx, dy } 숫자`);
    if (p.scale !== undefined && (typeof p.scale !== 'number' || !(p.scale >= 0.3 && p.scale <= 5))) throw new Error(`펫 자리 오류 (${k}): scale 0.3~5`);
    if (p.flip !== undefined && typeof p.flip !== 'boolean') throw new Error(`펫 자리 오류 (${k}): flip true | false`);
    out[k] = { dx: p.dx, dy: p.dy, ...(p.scale !== undefined ? { scale: p.scale as number } : {}), ...(p.flip ? { flip: true } : {}) };
  }
  return out;
}
export const PET_PLACES: Readonly<Record<string, PetPlace>> = parsePlaces(placeRaw.places);
export function petPlace(artKey: string): PetPlace {
  return PET_PLACES[artKey] ?? { dx: 0, dy: 0 };
}
