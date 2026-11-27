// 우라하라 남은 시간 칩 (GDD 5-5, C.549): 우라하라가 시장에 와 있는 동안 화면 머리 줄 오른쪽에 얼굴 아이콘 + 남은 시간 'mm:ss'.
// 방·월드맵·시장·모험 준비 화면에서는 누르면 시장 우라하라 창으로, 모험 걷기·전투 화면은 표시만(누르기 없음). 붙이기·갱신은 app.ts 의 1초 시계가 한다.
import { artUrls } from '../../data/art/manifest';
import { WANDERER_TEXT } from '../../data/shop';
import { wandererClock } from '../../engine/wanderer';
import { fixParticles } from '../../engine/josa';
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

/** 모험 결산 한 줄 글 (순수, GDD 5-5 v6.239 '마주침 연출', C.558): 남아 있으면 '우라하라가 시장에 왔다' + 'mm:ss', 다 됐으면 '우라하라가 떠났다'(시간 없음) */
export function wandererResultText(name: string, remainingMs: number): { text: string; time: string | null } {
  if (remainingMs > 0) return { text: fixParticles(WANDERER_TEXT.resultHere.replace('{name}', name)), time: wandererClock(remainingMs) };
  return { text: fixParticles(WANDERER_TEXT.resultGone.replace('{name}', name)), time: null };
}

/** 모험 결산 화면 한 줄 (C.558): 얼굴 도트 + '우라하라가 시장에 왔다' + 남은 시간(1초마다 줄어듦). 0 이 되면 같은 자리에서 '우라하라가 떠났다'로 바뀐다(줄 높이 그대로).
 *  remainingMs = 지금 남은 시간(마주친 순간 + 15분 기준, 부른 쪽이 실제 시각으로 잰다). 화면에서 떨어지면 시계를 멈춘다 */
export function wandererResultLine(name: string, remainingMs: () => number): HTMLElement {
  const root = el('p', 'bha-wresult');
  root.dataset.wandererResult = '';
  const face = artUrls('icon.wanderer.face', ART_BASE).src;
  if (face) {
    const img = el('img', 'bha-wresult__face');
    img.src = face;
    img.alt = '';
    img.setAttribute('aria-hidden', 'true');
    root.append(img);
  }
  const text = el('span', 'bha-wresult__text');
  const time = el('span', 'bha-wresult__time bha-num');
  root.append(text, time);
  const set = (): void => {
    const r = wandererResultText(name, remainingMs());
    if (text.textContent !== r.text) text.textContent = r.text;
    time.textContent = r.time ?? '';
    time.hidden = r.time === null;
    root.classList.toggle('is-gone', r.time === null);
  };
  set();
  let seen = false;
  const timer = window.setInterval(() => {
    if (root.isConnected) seen = true;
    else if (seen) return window.clearInterval(timer);
    set();
  }, 1000);
  return root;
}
