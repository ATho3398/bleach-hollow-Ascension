// 그림 아이콘 (GDD 15-1, C.421): 아이콘 자리에 사용자 도트 그림(그림 키)을 쓰고, 파일이 없으면 스프라이트 아이콘으로 대신한다.
// 픽셀 그대로(image-rendering: pixelated) — 크기는 CSS 의 아이콘 칸(.bha-icon 크기)을 따른다.
import { artUrls } from '../../data/art/manifest';
import { el, icon } from './dom';

const BASE = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';

/** 그림 키의 그림이 있으면 <img class="bha-icon bha-articon">, 없으면 스프라이트 아이콘 */
export function artIcon(key: string, fallback: string): Element {
  const { src } = artUrls(key, BASE);
  if (!src) return icon(fallback);
  const img = el('img', 'bha-icon bha-articon') as HTMLImageElement;
  img.src = src;
  img.alt = '';
  img.draggable = false;
  img.dataset.art = key;
  return img;
}

/** 그림 키의 주소 (없으면 null) */
export function artSrc(key: string): string | null {
  return artUrls(key, BASE).src;
}
