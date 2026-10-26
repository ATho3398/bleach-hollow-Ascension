// 펫 (GDD 90장, C.144 가칭·provisional): 여러 마리 가지고 1마리만 데리고 다닌다. 종족 무관 — 이름은 종족 설정 petNames, 수치는 balance.ts provisional.pets.
// 친밀도 1~5 = 데리고 다닌 원정 바퀴(대기 모드 바퀴 포함) 누계로 오른다. 효과 = 1단계 값 × (1 + affinityStep × (친밀도 − 1)).
// 여기는 상태·판정만 — 세이브(shared.pets)·런 로그 기록은 game.ts·inventory.ts 가 한다.
import { BALANCE } from '../config/balance';
import { getPet, isPetId, PET_IDS, type PetEffect } from '../data/pets';

const PX = BALANCE.provisional.pets;
export const PET_MAX_LEVEL = PX.affinityLaps.length + 1;

/** 가진 펫 한 마리 */
export interface OwnedPet {
  /** 데리고 다닌 바퀴 누계 (친밀도의 근거) */
  laps: number;
  /** 얻은 시각 (ms) */
  gotAt: number;
}

/** 슬롯 공유 펫 상태 (세이브 shared.pets, 형식 42): 진화·환생·트랙 바꿈에도 그대로 */
export interface PetState {
  owned: Record<string, OwnedPet>;
  /** 데리고 다니는 펫 (없으면 null) */
  active: string | null;
  /** 첫 진화 선물을 받았나 */
  gifted: boolean;
}

/** 원정에 데리고 간 펫 (원정 상태에 복사해 둔다) */
export interface PetCarry {
  id: string;
  level: number;
}

export function newPetState(): PetState {
  return { owned: {}, active: null, gifted: false };
}

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const nonNeg = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);

/** 저장된 펫 상태 정리: 모르는 펫·깨진 값은 버리고, 안 가진 펫을 데리고 있으면 내려놓는다 */
export function sanitizePets(raw: unknown): PetState {
  const r = isRec(raw) ? raw : {};
  const owned: Record<string, OwnedPet> = {};
  if (isRec(r.owned)) for (const [id, v] of Object.entries(r.owned)) if (isPetId(id) && isRec(v)) owned[id] = { laps: nonNeg(v.laps), gotAt: nonNeg(v.gotAt) };
  const active = typeof r.active === 'string' && owned[r.active] ? r.active : null;
  return { owned, active, gifted: r.gifted === true };
}

/** 바퀴 누계 → 친밀도 1~5 */
export function affinityOf(laps: number): number {
  return 1 + PX.affinityLaps.filter((n) => laps >= n).length;
}

/** 다음 친밀도까지 필요한 바퀴 누계 (최대면 null) */
export function nextAffinityLaps(laps: number): number | null {
  return PX.affinityLaps.find((n) => laps < n) ?? null;
}

/** 친밀도 배율: 1 + step × (친밀도 − 1) */
export function affinityMult(level: number): number {
  return 1 + PX.affinityStep * (Math.max(1, Math.min(PET_MAX_LEVEL, level)) - 1);
}

export type PetBonusKey = keyof typeof PX.effects;
const KEYS_OF: Record<PetEffect, PetBonusKey[]> = { gold: ['gold'], belly: ['belly'], guard: ['guard'], seek: ['seekWanderer', 'seekTile'] };

/** 이 펫 종류의 효과 키 */
export function petBonusKeys(id: string): PetBonusKey[] {
  const p = getPet(id);
  return p ? KEYS_OF[p.effect] : [];
}

/** 데리고 간 펫의 그 효과 값 (그 효과가 아니거나 펫이 없으면 0) */
export function petBonus(pet: PetCarry | null | undefined, key: PetBonusKey): number {
  if (!pet || !petBonusKeys(pet.id).includes(key)) return 0;
  return PX.effects[key] * affinityMult(pet.level);
}

/** 지금 데리고 다니는 펫 (원정 출발 때 복사) */
export function carriedPet(state: PetState): PetCarry | null {
  const id = state.active;
  const o = id ? state.owned[id] : undefined;
  return id && o ? { id, level: affinityOf(o.laps) } : null;
}

/** 펫을 얻는다. 이미 있으면 false */
export function grantPet(state: PetState, id: string, at: number): boolean {
  if (!isPetId(id) || state.owned[id]) return false;
  state.owned[id] = { laps: 0, gotAt: at };
  return true;
}

/** 데리고 가기(id) / 두고 가기(null). 안 가진 펫이면 false */
export function setActivePet(state: PetState, id: string | null): boolean {
  if (id !== null && !state.owned[id]) return false;
  if (state.active === id) return false;
  state.active = id;
  return true;
}

/** 데리고 다닌 바퀴를 더한다. 친밀도가 오르면 { from, to } */
export function addPetLaps(state: PetState, id: string, laps: number): { from: number; to: number } | null {
  const o = state.owned[id];
  const n = Math.max(0, Math.floor(laps));
  if (!o || n === 0) return null;
  const from = affinityOf(o.laps);
  o.laps += n;
  const to = affinityOf(o.laps);
  return to > from ? { from, to } : null;
}

/** 아직 안 가진 펫 하나 무작위 (다 가졌으면 null) */
export function pickNewPet(state: PetState, rand: () => number): string | null {
  const pool = PET_IDS.filter((id) => !state.owned[id]);
  return pool.length > 0 ? pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))]! : null;
}

/** 4종 중 무작위 하나 (바퀴 끝 보상: 가진 펫이면 골드로 바뀐다) */
export function rollAnyPet(rand: () => number): string {
  return PET_IDS[Math.min(PET_IDS.length - 1, Math.floor(rand() * PET_IDS.length))]!;
}
