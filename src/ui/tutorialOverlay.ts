// 첫 플레이 튜토리얼 오버레이 (GDD 14-2, C.19 / U-2 새 디자인): 전투 화면의 해당 요소를 컷아웃(구멍)으로 하이라이트하고 설명 카드를 보여 준다.
// 장면 순서·상태는 engine/tutorial 의 순수 상태 머신이 정하고, 텍스트는 src/data/help 에서 종족 설정으로 치환해 읽는다.
// 실제로 손을 써 보는 단계는 넣지 않았다: 전투 시간이 멈춘 상태에서 블록을 쓰게 하려면 엔진 입력 경로를 열어야 해서 결정성 규칙(멈춤은 결과에 영향 없음)과 부딪힌다.
import { helpVars, renderHelpText, TUTORIAL_SCENES } from '../data/help';
import type { FactionConfig } from '../engine/faction';
import { isTutorialActive, startTutorial, tutorialNext, tutorialPrev, tutorialSkip, type TutorialState, type TutorialStatus } from '../engine/tutorial';
import { button, dots, el, icon } from './bha/dom';
import { placeCard, unionRect, type Rect } from './helpLayout';

export interface TutorialHandle {
  close(): void;
}

export interface TutorialOverlayOptions {
  /** 끝(마지막 장면 다음)이나 건너뛰기로 닫히면 한 번 불린다 */
  onFinish: (status: Exclude<TutorialStatus, 'active'>) => void;
}

/** 구멍을 대상보다 이만큼(px) 넓게 판다 (HANDOFF 5-4) */
export const TUTORIAL_HOLE_PAD = 6;

/** 장면 제목 앞 아이콘 (장면 id → 스프라이트). 모르는 장면은 info */
const SCENE_ICON: Record<string, string> = {
  auto: 'i-play', tray: 'i-attack', chain: 'i-chain-2', heavy: 'i-cast', void: 'i-void', sp: 'i-sp', stored: 'i-stored', after: 'i-evolve',
};

function targetRect(ids: string[]): Rect | null {
  const rects: Rect[] = [];
  for (const id of ids) {
    document.querySelectorAll<HTMLElement>(`[data-help="${id}"]`).forEach((n) => {
      const r = n.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) rects.push({ top: r.top, left: r.left, width: r.width, height: r.height });
    });
  }
  return unionRect(rects);
}

export function tutorialOverlay(faction: FactionConfig, opts: TutorialOverlayOptions): TutorialHandle {
  const vars = helpVars(faction);
  const t = (s: string) => renderHelpText(s, vars);
  let state: TutorialState = startTutorial(TUTORIAL_SCENES.length);

  const layer = el('div', 'bha-tut');
  layer.setAttribute('role', 'dialog');
  layer.setAttribute('aria-modal', 'true');
  layer.dataset.tutorial = 'true';
  const pauseTag = el('span', 'bha-chip bha-battle__pausetag');
  pauseTag.append(icon('i-pause'), '튜토리얼 중 — 전투 멈춤');
  const hole = el('div', 'bha-tut__hole');
  const card = el('div', 'bha-tut__card');
  layer.append(pauseTag, hole, card);
  document.body.append(layer);

  const finish = (status: Exclude<TutorialStatus, 'active'>) => {
    window.removeEventListener('resize', layout);
    layer.remove();
    opts.onFinish(status);
  };

  /** 블록 바와 저장 필살기 버튼: 설명 카드가 가리지 않게 보호할 영역 */
  const protectedRects = () => ['battle.tray', 'battle.stored'].map((id) => targetRect([id])).filter((r): r is Rect => r !== null);

  function layout(): void {
    const scene = TUTORIAL_SCENES[state.index]!;
    const vp = { width: window.innerWidth, height: window.innerHeight };
    const rect = targetRect(scene.targets);
    const place = placeCard(rect, card.offsetHeight, vp, protectedRects());
    card.style.top = `${place.top}px`;
    card.style.bottom = 'auto';
    const pad = TUTORIAL_HOLE_PAD;
    hole.classList.toggle('is-none', !rect);
    if (rect) {
      hole.style.left = `${rect.left - pad}px`;
      hole.style.top = `${rect.top - pad}px`;
      hole.style.width = `${rect.width + pad * 2}px`;
      hole.style.height = `${rect.height + pad * 2}px`;
    } else {
      // 대상이 없는 장면(처음·마지막 안내): 크기 0 구멍이 화면 전체를 어둡게 덮는다
      hole.style.left = `${vp.width / 2}px`;
      hole.style.top = `${vp.height / 2}px`;
      hole.style.width = '0px';
      hole.style.height = '0px';
    }
    // 카드가 대상 아래(is-below)면 위쪽 꼬리, 위(is-above)면 아래쪽 꼬리. 대상이 없으면 꼬리 없음
    const below = !!rect && place.top >= rect.top + rect.height / 2;
    card.classList.toggle('is-below', !!rect && below);
    card.classList.toggle('is-above', !!rect && !below);
    if (rect) {
      const cw = card.offsetWidth;
      const cl = (vp.width - cw) / 2;
      card.style.setProperty('--tail', `${Math.max(24, Math.min(cw - 24, rect.left + rect.width / 2 - cl))}px`);
    }
  }

  function render(): void {
    const scene = TUTORIAL_SCENES[state.index]!;
    const last = state.index === state.count - 1;
    const skip = button({ label: '건너뛰기', variant: 'ghost', onClick: () => {
      state = tutorialSkip(state);
      finish('skipped');
    } });
    const prev = button({ label: '이전', icon: 'i-chevron-left', onClick: () => {
      state = tutorialPrev(state);
      render();
    } });
    prev.disabled = state.index === 0;
    const next = button({ label: last ? '전투 시작' : '다음', variant: 'primary', onClick: () => {
      state = tutorialNext(state);
      if (isTutorialActive(state)) render();
      else finish('completed');
    } });
    next.append(icon(last ? 'i-play' : 'i-chevron-right'));
    const actions = el('div', 'bha-tut__actions');
    actions.append(skip, prev, next);

    const title = el('h2', 'bha-tut__title');
    title.id = 'tutorial-title';
    title.append(icon(SCENE_ICON[scene.id] ?? 'i-info'), t(scene.title));
    layer.setAttribute('aria-labelledby', title.id);
    const top = el('div', 'bha-tut__top');
    top.append(el('span', 'bha-tut__step', `${state.index + 1} / ${state.count}`), dots(state.count, state.index));
    card.replaceChildren(top, title, el('p', 'bha-tut__body', t(scene.body)), actions);
    card.style.visibility = 'hidden';
    layout();
    card.style.visibility = 'visible';
    next.focus({ preventScroll: true });
  }

  window.addEventListener('resize', layout);
  render();
  return { close: () => finish('skipped') };
}
