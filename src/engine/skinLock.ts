// 초월자 전투 방식 = 스킨 잠금 (GDD 12-4 v6.093, C.465 — 사용자 2026-11-17 "혼란방지용임"):
// 전투 기반이 '초월자'(그 초월자 고유 전투 방식)이면 캐릭터 스킨은 같은 초월자의 같은 전투 방식에 딸린 모델끼리만.
// 모델 묶음 = 데이터 kit.modes[].skins('base' = 기본 모델, 그 밖 = humanSkins id). 모드가 없거나 묶음이 없으면 기본 모델 + 인간형 스킨 전부.
// 초월자·모드 id 로 나누지 않는다 — 전부 데이터에서. 순수(DOM 없음).
import { tryGetTranscendent, type TranscendentDef } from '../data/transcendents';
import { transcendentLookId, transcendentLooks, transcendentSkinLookId } from '../data/skins';
import { TRANSCENDENT_BASIS, type EvolutionState } from './evolution/evolution';

/** 묶음 안 '기본 모델' 표시 */
export const BASE_MODEL = 'base';

export interface SkinLockSave {
  transcendentId?: string | null;
  skin: string | null;
  evolution: Pick<EvolutionState, 'basis' | 'kit'>;
}

export interface SkinLock {
  transcendent: TranscendentDef;
  /** 지금 전투 모드 이름 (모드가 없는 초월자는 없음) */
  modeName?: string;
  /** 입을 수 있는 외형 id (null = 기본 모델 — 트랙 기본 그림). 첫 칸 = 자동으로 입히는 모델 */
  looks: (string | null)[];
}

/** 이 초월자·전투 모드의 모델 묶음 ('base' 와 인간형 스킨 id) */
export function modeModelIds(t: TranscendentDef, modeId?: string | null): string[] {
  const modes = t.kit?.modes ?? [];
  const mode = modes.find((m) => m.id === modeId) ?? modes[0];
  return mode?.skins ? [...mode.skins] : [BASE_MODEL, ...(t.humanSkins ?? []).map((x) => x.id)];
}

/** 모델 id → 입는 외형 id 들 (기본 모델 = null + 초월자 외형 id(그림·조각 모델이 있으면)) */
function looksOf(t: TranscendentDef, id: string): (string | null)[] {
  if (id === BASE_MODEL) return [null, ...(transcendentLooks().some((x) => x.id === t.id) ? [transcendentLookId(t.id)] : [])];
  return [transcendentSkinLookId(t.id, id)];
}

/** 지금 스킨 잠금 (초월자 트랙 + 전투 기반 '초월자'일 때만, 아니면 null = 모든 스킨) */
export function skinLockOf(s: Omit<SkinLockSave, 'skin'>): SkinLock | null {
  if (!s.transcendentId) return null;
  if ((s.evolution.basis?.current ?? TRANSCENDENT_BASIS) !== TRANSCENDENT_BASIS) return null;
  const t = tryGetTranscendent(s.transcendentId);
  if (!t) return null;
  const modes = t.kit?.modes ?? [];
  const mode = modes.find((m) => m.id === s.evolution.kit?.mode) ?? modes[0];
  return { transcendent: t, ...(mode ? { modeName: mode.name } : {}), looks: modeModelIds(t, mode?.id).flatMap((id) => looksOf(t, id)) };
}

/** 이 외형을 지금 입을 수 있나 (잠금이 없으면 늘 참 — 보유·종족 확인은 equipSkin 몫) */
export function skinAllowedNow(s: Omit<SkinLockSave, 'skin'>, lookId: string | null): boolean {
  const lock = skinLockOf(s);
  return !lock || lock.looks.includes(lookId);
}

/** 잠금 묶음 밖 스킨이면 묶음 첫 모델로 바꾼다 (기반을 초월자로 바꿀 때·옛 세이브). force = 묶음 안이어도 첫 모델로(전투 모드를 바꿀 때). 바뀌면 true */
export function fitSkinToLock(s: SkinLockSave, force = false): boolean {
  const lock = skinLockOf(s);
  if (!lock) return false;
  const first = lock.looks[0] ?? null;
  if (!force && lock.looks.includes(s.skin)) return false;
  if (s.skin === first) return false;
  s.skin = first;
  return true;
}

/** 잠긴 칸 안내 글 (짧게) */
export function skinLockReason(lock: SkinLock): string {
  return `초월자 전투 중엔 ${lock.transcendent.name}${lock.modeName ? `(${lock.modeName})` : ''} 모델만`;
}
