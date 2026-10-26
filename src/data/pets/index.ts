// 펫 (GDD 90장, C.144 가칭·provisional): 하나 데리고 다니는 작은 보조. 종류 4종(효과 하나씩).
// 이름은 종족 설정(faction json petNames), 효과 수치는 balance.ts provisional.pets, 그림 키(art)는 여기 — 그림 파일이 없으면 화면은 임시 아이콘 원.
import petsRaw from './pets.json';

export const PET_EFFECTS = ['gold', 'belly', 'guard', 'seek'] as const;
export type PetEffect = (typeof PET_EFFECTS)[number];

export interface PetDef {
  id: string;
  effect: PetEffect;
  /** 그림 키 (artUrls 키). 파일이 없으면 임시 아이콘 */
  art: string;
}

function parsePet(r: unknown): PetDef {
  const p = (r ?? {}) as Record<string, unknown>;
  const errors: string[] = [];
  if (typeof p.id !== 'string' || !p.id.startsWith('pet-')) errors.push('id: pet-…');
  if (!(PET_EFFECTS as readonly unknown[]).includes(p.effect)) errors.push(`effect: ${PET_EFFECTS.join(' | ')}`);
  if (typeof p.art !== 'string' || !p.art) errors.push('art');
  if (errors.length) throw new Error(`펫 데이터 오류 (${String(p.id ?? '?')}): ${errors.join(', ')}`);
  return { id: p.id as string, effect: p.effect as PetEffect, art: p.art as string };
}

export const PETS_PROVISIONAL: boolean = petsRaw.provisional;
export const PETS: readonly PetDef[] = petsRaw.pets.map(parsePet);
export const PET_IDS: readonly string[] = PETS.map((p) => p.id);

export function getPet(id: string): PetDef | undefined {
  return PETS.find((p) => p.id === id);
}

export function isPetId(id: unknown): id is string {
  return typeof id === 'string' && PET_IDS.includes(id);
}
