// 펫 (GDD 90장, C.144 가칭·provisional): 하나 데리고 다니는 작은 보조. 종류 4종(효과 하나씩).
// 이름은 종족 설정(faction json petNames), 효과 수치는 balance.ts provisional.pets, 그림 키(art)는 여기 — 그림 파일이 없으면 화면은 임시 아이콘 원.
import petsRaw from './pets.json';

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
