// 우라하라 남은 시간 칩 (GDD 5-5, C.549): 우라하라가 시장에 와 있는 동안 화면 머리 줄 오른쪽에 얼굴 아이콘 + 남은 시간 'mm:ss'.
// 방·월드맵·시장·모험 준비 화면에서는 누르면 시장 우라하라 창으로, 모험 걷기·전투 화면은 표시만(누르기 없음). 붙이기·갱신은 app.ts 의 1초 시계가 한다.
import { artUrls } from '../../data/art/manifest';
import { WANDERER_TEXT } from '../../data/shop';
import { wandererClock } from '../../engine/wanderer';
import { el } from './dom';

const ART_BASE = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';

export interface WandererChip {
  el: HTMLElement;
  /** 남은 시간 글을 고친다 */
  set(remainingMs: number): void;
}

/** 칩을 만든다. onClick 이 없으면 표시만(span) */
export function wandererChip(name: string, remainingMs: number, onClick?: () => void): WandererChip {
  const root = onClick ? el('button', 'bha-chip bha-wchip') : el('span', 'bha-chip bha-wchip is-static');
  if (root instanceof HTMLButtonElement) {
    root.type = 'button';
    root.onclick = onClick!;
  }
  root.dataset.wandererChip = '';
  const face = artUrls('icon.wanderer.face', ART_BASE).src;
  if (face) {
    const img = el('img', 'bha-wchip__face');
    img.src = face;
    img.alt = '';
    img.setAttribute('aria-hidden', 'true');
    root.append(img);
  }
  const time = el('span', 'bha-wchip__time');
  root.append(time);
  const set = (ms: number): void => {
    const t = wandererClock(ms);
    if (time.textContent !== t) time.textContent = t;
    const label = WANDERER_TEXT.chipLabel.replace('{name}', name).replace('{time}', t);
    if (root.getAttribute('aria-label') !== label) {
      root.setAttribute('aria-label', label);
      root.title = label;
    }
  };
  set(remainingMs);
  return { el: root, set };
}
