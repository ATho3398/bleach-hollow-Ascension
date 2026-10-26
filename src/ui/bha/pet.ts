// 펫 표시 (GDD 90장, C.144 임시): 방·원정에서 캐릭터 옆에 작게. 그림 키(펫 데이터 art)에 파일이 있으면 그림, 없으면 효과 아이콘이 든 원.
import { artUrls } from '../../data/art/manifest';
import { getPet, type PetEffect } from '../../data/pets';
import { el, icon } from './dom';

const BASE = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
/** 그림이 없을 때 원 안 아이콘 (효과 종류별) */
const PET_ICON: Record<PetEffect, string> = { gold: 'i-rare', belly: 'i-hunger', guard: 'i-guard', seek: 'i-target' };

/** 펫 그림 주소 (파일이 없으면 null) */
export function petArtSrc(petId: string): string | null {
  const def = getPet(petId);
  return def ? artUrls(def.art, BASE).src : null;
}

/** 그림이 없을 때 쓰는 아이콘 id */
export function petIconId(petId: string): string {
  const def = getPet(petId);
  return def ? PET_ICON[def.effect] : 'i-unknown';
}

/** 펫 그림 (그림이 없으면 아이콘 원) */
export function petArt(petId: string, cls = 'bha-pet'): HTMLElement {
  const box = el('span', cls);
  box.dataset.pet = petId;
  const src = petArtSrc(petId);
  if (src) {
    const img = el('img', 'bha-pet__img') as HTMLImageElement;
    img.src = src;
    img.alt = '';
    img.draggable = false;
    box.append(img);
    box.classList.add('has-art');
  } else box.append(icon(petIconId(petId)));
  return box;
}

/** 캐릭터 옆에 붙는 펫 (없으면 null). label = 펫 이름 */
export function petBuddy(petId: string | null, label: string): HTMLElement | null {
  if (!petId) return null;
  const b = petArt(petId, 'bha-pet bha-pet--buddy');
  b.setAttribute('aria-label', `펫: ${label}`);
  b.title = label;
  return b;
}
