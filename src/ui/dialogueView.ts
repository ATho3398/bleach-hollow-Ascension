// 스토리 대화창 (GDD 25-4·25-7): LCD 아래쪽에 이름표 + 글. 탭(아무 데나)·스페이스·엔터로 다음 줄, [건너뛰기]로 끝까지 넘긴다. 그림 없이 이름표만.
// 열려 있는 동안 배경 음악은 story, 닫히면 부르는 쪽이 다음 화면의 음악을 고른다.
import type { StoryLine } from '../data/story';
import { button, el } from './bha/dom';
import { getOverlayHost, registerLayer } from './bha/overlayHost';
import { setBgm } from './bgm';

export interface DialogueOptions {
  /** 대화 위에 작게 보일 장면 이름 (예 "1장 · 1화 첫 사냥 — 시작") */
  caption?: string;
  /** 다 넘기거나 건너뛰면 한 번 불린다 */
  onDone: () => void;
  /** 붙일 곳 (기본: 기기 LCD 오버레이) */
  host?: HTMLElement;
}

/** 대화를 연다. 줄이 없으면 바로 onDone. 돌려주는 함수로 강제로 닫을 수 있다(onDone 은 불리지 않는다) */
export function playDialogue(lines: readonly StoryLine[], opts: DialogueOptions): () => void {
  if (lines.length === 0) {
    opts.onDone();
    return () => {};
  }
  setBgm('story');
  let i = 0;
  let closed = false;
  const layer = el('div', 'bha-dialogue');
  layer.setAttribute('role', 'dialog');
  layer.setAttribute('aria-modal', 'true');
  layer.setAttribute('aria-label', '대화');
  const box = el('div', 'bha-dialogue__box');
  const name = el('span', 'bha-dialogue__name');
  const text = el('p', 'bha-dialogue__text');
  text.setAttribute('aria-live', 'polite');
  const foot = el('div', 'bha-dialogue__foot');
  const count = el('span', 'bha-dialogue__count');
  const skip = button({ label: '건너뛰기', icon: 'i-chevron-right', variant: 'ghost', size: 'small', onClick: () => finish() });
  skip.dataset.skip = '';
  foot.append(count, el('span', 'bha-dialogue__hint', '눌러서 넘기기'), skip);
  box.append(name, text, foot);
  if (opts.caption) layer.append(el('span', 'bha-dialogue__caption', opts.caption));
  layer.append(box);

  const show = () => {
    const l = lines[i]!;
    name.textContent = l.speaker;
    text.textContent = l.text;
    count.textContent = `${i + 1}/${lines.length}`;
    layer.dataset.line = String(i);
  };
  const close = () => {
    if (closed) return;
    closed = true;
    window.removeEventListener('keydown', onKey, true);
    unregister();
    layer.remove();
  };
  const finish = () => {
    if (closed) return;
    close();
    opts.onDone();
  };
  const next = () => {
    if (closed) return;
    if (++i >= lines.length) finish();
    else show();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      next();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      finish();
    }
  };
  layer.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('[data-skip]')) return;
    next();
  });
  window.addEventListener('keydown', onKey, true);
  (opts.host ?? getOverlayHost()).append(layer);
  const unregister = registerLayer(layer, finish);
  show();
  return close;
}
