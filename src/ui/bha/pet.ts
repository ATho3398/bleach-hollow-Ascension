// 펫 표시 (GDD 90장, C.144 임시): 방·원정에서 캐릭터 옆에 작게. 그림 키(펫 데이터 art)에 파일이 있으면 그림, 없으면 효과 아이콘이 든 원.
import { artUrls } from '../../data/art/manifest';
import { getPet, petPlace, PET_ART_SCALE, type PetEffect } from '../../data/pets';
import type { FactionConfig } from '../../engine/faction';

/** 종족 설정에서 펫 그림 키만 읽는다 (GDD 9-4, C.477) */
export type PetArtFaction = Pick<FactionConfig, 'petArt'>;
import { el, icon } from './dom';
import { currentFit } from './viewport';
import { rigRestSnapshot } from './rigAnim';

const BASE = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
/** 그림이 없을 때 원 안 아이콘 (효과 종류별) */
const PET_ICON: Record<PetEffect, string> = { gold: 'i-rare', seek: 'i-target', none: 'i-care-pet' };

/** 펫 그림 주소 (파일이 없으면 null). 종족 설정 petArt 에 그 펫의 그림 키가 있으면 그쪽이 먼저 */
export function petArtSrc(petId: string, faction?: PetArtFaction): string | null {
  const def = getPet(petId);
  return def ? artUrls(faction?.petArt?.[petId] ?? def.art, BASE).src : null;
}

/** 그림이 없을 때 쓰는 아이콘 id */
export function petIconId(petId: string): string {
  const def = getPet(petId);
  return def ? PET_ICON[def.effect] : 'i-unknown';
}

/** 펫 그림 (그림이 없으면 아이콘 원) */
export function petArt(petId: string, cls = 'bha-pet', faction?: PetArtFaction): HTMLElement {
  const box = el('span', cls);
  box.dataset.pet = petId;
  const src = petArtSrc(petId, faction);
  if (src) {
    const img = el('img', 'bha-pet__img') as HTMLImageElement;
    img.src = src;
    img.alt = '';
    img.draggable = false;
    // 상자 = 그림 크기 × 배율 (C.486): 그림마다 칸 수가 달라도(돌아다니는 나비 128×88) 1칸 = 같은 굵기. 그림이 뜨기 전에는 CSS 기본(48칸 × 1.7)
    const key = faction?.petArt?.[petId] ?? getPet(petId)?.art ?? '';
    const scale = petPlace(key).scale ?? PET_ART_SCALE;
    if (petPlace(key).flip) img.style.transform = 'scaleX(-1)'; // 좌우 반전 (C.486)
    const size = () => { if (img.naturalWidth > 0) { box.style.width = `${img.naturalWidth * scale}px`; box.style.height = `${img.naturalHeight * scale}px`; } };
    img.addEventListener('load', size);
    size();
    box.append(img);
    box.classList.add('has-art');
  } else box.append(icon(petIconId(petId)));
  return box;
}

/** 캐릭터 옆에 붙는 펫 (없으면 null). label = 펫 이름 */
export function petBuddy(petId: string | null, label: string, faction?: PetArtFaction): HTMLElement | null {
  if (!petId) return null;
  const b = petArt(petId, 'bha-pet bha-pet--buddy', faction);
  // 그림 펫 자리 (C.485): 그림 키마다 맞춘 값만큼 옮긴다 (transform 과 따로 도는 translate — 전투의 튀는 동작과 안 겹침)
  const def = getPet(petId);
  const pl = def && b.classList.contains('has-art') ? petPlace(faction?.petArt?.[petId] ?? def.art) : null;
  if (pl) {
    b.dataset.dx = String(pl.dx);
    b.dataset.dy = String(pl.dy);
    if (pl.dx || pl.dy) b.style.translate = `${pl.dx}px ${pl.dy}px`;
    // 몸 너비에 맞춰 옆으로 (C.487): 붙인 뒤 그림이 뜨는 대로 몇 번 맞춘다
    const img = b.querySelector('img');
    const again = () => fitPetToBody(b);
    img?.addEventListener('load', again);
    if (typeof window !== 'undefined') for (const ms of [0, 150, 500, 1200, 2500, 5000]) window.setTimeout(again, ms);
  }
  b.setAttribute('aria-label', `펫: ${label}`);
  b.title = label;
  return b;
}


/** 그림 펫과 몸 사이 틈 (CSS px): 펫 상자의 왼쪽 끝 = 몸 그림의 오른쪽 끝 + 이 값 */
export const PET_BODY_GAP = 4;

/** 몸 그림(종이인형 캔버스 또는 그림)의 불투명 칸이 가로로 어디서 어디까지인가 (0~1). 못 읽으면 null */
export function opaqueSpanX(art: HTMLCanvasElement | HTMLImageElement): { left: number; right: number } | null {
  try {
    const sw = art instanceof HTMLCanvasElement ? art.width : art.naturalWidth;
    const sh = art instanceof HTMLCanvasElement ? art.height : art.naturalHeight;
    if (!sw || !sh) return null;
    const w = Math.min(96, sw), h = Math.max(1, Math.round((sh / sw) * w));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(art, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h).data;
    let lo = w, hi = -1;
    // 발치 쪽 60%만 본다 — 위로 치켜든 칼·뿔 끝이 아니라 몸통·팔 너비
    for (let y = Math.floor(h * 0.4); y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3]! > 60) { if (x < lo) lo = x; if (x > hi) hi = x; }
    return hi < 0 ? null : { left: lo / w, right: (hi + 1) / w };
  } catch {
    return null; // 캔버스를 못 쓰는 환경(테스트 등)
  }
}

/**
 * 화면 사각형(getBoundingClientRect) → host 안 가로 좌표(CSS px) 계산기 (C.556). 기기 배율(C.554 한 배율 맞춤)·PC 2배(zoom)·세로 폰 90° 회전·
 * 다마고치 줌이 걸려도 펫 이동(translate)은 host 안 px 이라, 화면 px 차이를 그대로 넣으면 배율만큼 어긋나고 돌린 화면에서는 세로 차이가 들어갔다.
 * rotated = 기기를 돌려 놓았나(기기 가로 = 화면 세로), k = host 안 px ÷ 화면 px
 */
export function hostAxisX(host: { offsetWidth: number }, hostRect: { width: number; height: number }, rotated: boolean): { k: number; lo: (r: { left: number; top: number }) => number; len: (r: { width: number; height: number }) => number } {
  const screenLen = rotated ? hostRect.height : hostRect.width;
  const k = host.offsetWidth > 0 && screenLen > 0 ? host.offsetWidth / screenLen : 1;
  return { k, lo: (r) => (rotated ? r.top : r.left), len: (r) => (rotated ? r.height : r.width) };
}

/** 그림 펫을 지금 몸 그림 너비에 맞춰 옆으로 옮긴다 (C.487, 사용자 "스킨 모델에 따라서 거리 자동으로 … 호로처럼 크면 좀 더 옆으로, 인간형같으면 좀 붙어있는 식으로"):
 *  펫 상자 왼쪽 끝 = 몸 그림의 불투명한 오른쪽 끝 + PET_BODY_GAP, 거기에 자리 값(dx·dy)을 더한다. 몸 그림을 못 읽으면 CSS 기본 자리 그대로 */
/**
 * 한 번 맞춘 펫 → 그때 잰 몸(종이인형이면 그 기본 정지 모습 스냅숏 함수, 아니면 그림 요소)과 몸 상자 크기 (C.563).
 * 같은 몸이면 다시 재지 않는다 — 대기·걷기·공격 동작 중 다시 불려도 펫 자리는 그대로. 몸이 바뀌면(진화·외형·스킨) 새로 잰다
 */
const fittedTo = new WeakMap<HTMLElement, { key: object; w: number }>();

export function fitPetToBody(buddy: HTMLElement): boolean {
  const host = buddy.parentElement;
  if (!host || !buddy.isConnected) return false;
  const dx = Number(buddy.dataset.dx ?? 0), dy = Number(buddy.dataset.dy ?? 0);
  const ax = hostAxisX(host, host.getBoundingClientRect(), currentFit().rotated);
  // 2번째 칸 펫 (C.506 추성): 1번째 펫 바로 오른쪽
  const lead = buddy.classList.contains('bha-pet--second') ? host.querySelector<HTMLElement>('.bha-pet:not(.bha-pet--second)') : null;
  if (lead) {
    const lf = fittedTo.get(lead);
    if (!lf) return false; // 1번째 펫이 자리를 잡은 뒤에 (그 자리 기준)
    const done = fittedTo.get(buddy);
    if (done && done.key === lf.key && done.w === lf.w) return true;
    buddy.style.translate = 'none';
    const lr = lead.getBoundingClientRect();
    const shift = (ax.lo(lr) + ax.len(lr) - ax.lo(buddy.getBoundingClientRect())) * ax.k + PET_BODY_GAP;
    buddy.style.translate = `${Math.round(shift)}px ${dy}px`;
    fittedTo.set(buddy, lf);
    return true;
  }
  const art = [...host.querySelectorAll<HTMLCanvasElement | HTMLImageElement>('canvas.bha-rigcanvas, img')].find((e) => !e.closest('.bha-pet'));
  if (!art) return false;
  // 종이인형은 지금 그려진 동작 프레임이 아니라 기본 정지 모습(대기 첫 자세)으로 잰다 (C.563, GDD 9-4) — 부위 그림이 오기 전이면 나중에
  const restFn = rigRestSnapshot(art);
  if (restFn && art.tagName === 'IMG') return false; // 종이인형 정지 그림 img 는 곧 캔버스로 바뀐다 — 상자 크기가 달라 캔버스가 붙은 뒤에 잰다
  const key: object = restFn ?? art;
  const done = fittedTo.get(buddy);
  if (done && done.key === key && done.w === art.offsetWidth) return true;
  const still = restFn ? restFn() : art;
  const span = still ? opaqueSpanX(still) : null;
  if (!span) return false;
  const ar = art.getBoundingClientRect();
  if (!ax.len(ar)) return false;
  const mirrored = new DOMMatrixReadOnly(getComputedStyle(art).transform).a < 0;
  const bodyRight = mirrored ? ax.lo(ar) + ax.len(ar) - span.left * ax.len(ar) : ax.lo(ar) + span.right * ax.len(ar);
  buddy.style.translate = 'none';
  const shift = (bodyRight - ax.lo(buddy.getBoundingClientRect())) * ax.k + PET_BODY_GAP;
  buddy.style.translate = `${Math.round(shift + dx)}px ${dy}px`;
  fittedTo.set(buddy, { key, w: art.offsetWidth });
  return true;
}
