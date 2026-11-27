// 적 그림 속성 색 바꾸기 (GDD 15-5 v6.215, C.546): 그림 목록(enemyArt)이 붙인 tint = {바꿀 도트 색, 속성 색 토큰} 대로
// 종이인형 부위 그림·정지 그림의 그 색 픽셀만 속성 색으로 바꿔 그린다(길리안 몸 적의 눈동자). 색 값은 디자인 토큰(elements.json color)을 화면에서 읽는다 — 새 색 없음.
// 순수 함수(replaceColors·parseCssColor)는 DOM 없이 테스트한다.
import type { ArtTint } from '../../data/art/manifest';

export type Rgb = readonly [number, number, number];

/** '#rgb' · '#rrggbb' · 'rgb(r, g, b)' → [r, g, b] */
export function parseCssColor(v: string): Rgb | null {
  const s = v.trim();
  const m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(s);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  const h = s.replace(/^#/, '');
  const full = h.length === 3 ? h.split('').map((x) => x + x).join('') : h;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  return [0, 2, 4].map((o) => parseInt(full.slice(o, o + 2), 16)) as unknown as Rgb;
}

/** RGBA 바이트 배열에서 from 색(불투명 픽셀)을 to 색으로 바꾼다. 바꾼 픽셀 수 */
export function replaceColors(data: Uint8ClampedArray | number[], from: readonly Rgb[], to: Rgb): number {
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (!data[i + 3]) continue;
    if (from.some((c) => data[i] === c[0] && data[i + 1] === c[1] && data[i + 2] === c[2])) {
      data[i] = to[0];
      data[i + 1] = to[1];
      data[i + 2] = to[2];
      n++;
    }
  }
  return n;
}

/** 토큰 색 (그 요소 또는 게임 루트에서 읽는다). 못 읽으면 null */
export function tintColor(tint: ArtTint, at?: Element | null): Rgb | null {
  if (typeof getComputedStyle === 'undefined' || typeof document === 'undefined') return null;
  for (const el of [at, document.querySelector('.bha-root'), document.documentElement]) {
    if (!el || (el instanceof Element && !el.isConnected)) continue;
    const c = parseCssColor(getComputedStyle(el).getPropertyValue(tint.token));
    if (c) return c;
  }
  return null;
}

/** 다 불러온 그림 → 색을 바꾼 캔버스. 바꿀 색이 없으면 null(원래 그림을 그대로 쓴다) */
export function tintedCanvas(im: HTMLImageElement, tint: ArtTint, to: Rgb): HTMLCanvasElement | null {
  if (!im.naturalWidth) return null;
  const c = document.createElement('canvas');
  c.width = im.naturalWidth;
  c.height = im.naturalHeight;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(im, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height);
  const from = tint.from.map(parseCssColor).filter((x): x is Rgb => x !== null);
  if (replaceColors(d.data, from, to) === 0) return null;
  ctx.putImageData(d, 0, 0);
  return c;
}

/** 정지 그림 <img> 한 장의 색을 한 번 바꾼다(불러온 뒤 data 주소로 바꿔 끼움). 종이인형으로 바뀌는 자리는 rigAnim 이 부위마다 따로 바꾼다 */
export function tintStillImg(img: HTMLImageElement, tint: ArtTint | undefined): void {
  if (!tint || typeof document === 'undefined') return;
  const run = (): void => {
    if (img.dataset.tinted) return;
    const to = tintColor(tint, img);
    const c = to ? tintedCanvas(img, tint, to) : null;
    img.dataset.tinted = '1';
    if (c) img.src = c.toDataURL();
  };
  if (img.complete && img.naturalWidth) run();
  else img.addEventListener('load', run, { once: true });
}
