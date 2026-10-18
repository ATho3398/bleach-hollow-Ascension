// 첫 플레이 튜토리얼 오버레이 (GDD 14-2, C.19 / U-2 새 디자인): 전투 화면의 해당 요소를 컷아웃(구멍)으로 하이라이트하고 설명 카드를 보여 준다.
// 장면 순서·상태는 engine/tutorial 의 순수 상태 머신이 정하고, 텍스트는 src/data/help 에서 종족 설정으로 치환해 읽는다.
// 실제로 손을 써 보는 단계는 넣지 않았다: 전투 시간이 멈춘 상태에서 블록을 쓰게 하려면 엔진 입력 경로를 열어야 해서 결정성 규칙(멈춤은 결과에 영향 없음)과 부딪힌다.
import { helpVars, renderHelpText, TUTORIAL_SCENES } from '../data/help';
import type { FactionConfig } from '../engine/faction';
import { isTutorialActive, startTutorial, tutorialNext, tutorialPrev, tutorialSkip, type TutorialState, type TutorialStatus } from '../engine/tutorial';
import { button, dots, el, icon } from './bha/dom';
import { requestTitle } from './bha/hold';
import { getOverlayHost, registerLayer } from './bha/overlayHost';
import { elementLocalRect } from './bha/viewport';
import { placeCard, placeCardBox, unionRect, type Rect } from './helpLayout';

export interface TutorialHandle {
  close(): void;
  /** 끝낸 것으로 치지 않고 조용히 치운다 (화면을 떠날 때, Q-3). onFinish 는 부르지 않는다 */
  dismiss(): void;
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

/** 대상 영역을 오버레이 자리(host: LCD 창 또는 화면 전체) 기준 좌표로 돌려준다 */
function targetRect(ids: string[], host: HTMLElement): Rect | null {
  const rects: Rect[] = [];
  // 화면 좌표는 기기를 돌려 놓으면 같이 돌아가므로 기기 안 좌표로 바꿔 쓴다 (GDD 16-6)
  const o = host === document.body ? { left: 0, top: 0 } : elementLocalRect(host);
  for (const id of ids) {
    document.querySelectorAll<HTMLElement>(`[data-help="${id}"]`).forEach((n) => {
      const r = elementLocalRect(n);
      if (r.width > 0 && r.height > 0) rects.push({ top: r.top - o.top, left: r.left - o.left, width: r.width, height: r.height });
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
  layer.setAttribute('aria-label', '튜토리얼');
  layer.dataset.tutorial = 'true';
  const pauseTag = el('span', 'bha-chip bha-battle__pausetag');
  pauseTag.append(icon('i-pause'), '튜토리얼 중 — 전투 멈춤');
  const hole = el('div', 'bha-tut__hole');
  const card = el('div', 'bha-tut__card');
  layer.append(pauseTag, hole, card);
  const host = getOverlayHost();
  host.append(layer);
  const unregister = registerLayer(layer, requestTitle); // 취소 = 처음 화면으로 돌아갈지 확인 (Q-3)

  const teardown = () => {
    window.removeEventListener('resize', layout);
    unregister();
    layer.remove();
  };
  const finish = (status: Exclude<TutorialStatus, 'active'>) => {
    teardown();
    opts.onFinish(status);
  };

  /** 블록 바와 저장 필살기 버튼: 설명 카드가 가리지 않게 보호할 영역 */
  const protectedRects = () => ['battle.tray', 'battle.stored'].map((id) => targetRect([id], host)).filter((r): r is Rect => r !== null);

  /** 가로 화면(LCD)에서 카드가 후보로 삼는 너비: 넓게(위·아래에 걸쳐) / 좁게(옆·모서리) */
  const WIDE_W = 456;
  const NARROW_W = 280;

  function layout(): void {
    const scene = TUTORIAL_SCENES[state.index]!;
    const vp = host === document.body ? { width: window.innerWidth, height: window.innerHeight } : { width: host.clientWidth, height: host.clientHeight };
    const rect = targetRect(scene.targets, host);
    const landscape = vp.width > vp.height;
    let belowCard = false;
    let aside = false;
    let cardLeft = (vp.width - card.offsetWidth) / 2;
    if (landscape) {
      // 가로: 너비 두 가지를 시험해 대상·블록 바를 가장 적게 가리는 자리를 고른다 (T-2)
      const prot = protectedRects();
      let best: { w: number; h: number; p: ReturnType<typeof placeCardBox> } | null = null;
      for (const w of [Math.min(WIDE_W, vp.width - 16), Math.min(NARROW_W, vp.width - 16)]) {
        card.style.width = `${w}px`;
        const h = card.offsetHeight;
        const p = placeCardBox(rect, { width: w, height: h }, vp, prot);
        if (!best || p.cost < best.p.cost) best = { w, h, p };
      }
      card.style.width = `${best!.w}px`;
      card.style.left = `${best!.p.left}px`;
      card.style.top = `${best!.p.top}px`;
      cardLeft = best!.p.left;
      belowCard = !!rect && best!.p.top >= rect.top + rect.height / 2;
      aside = !rect || best!.p.side === 'right' || best!.p.side === 'left' || best!.p.side === 'corner' || best!.p.side === 'center';
    } else {
      card.style.width = '';
      card.style.left = '';
      const place = placeCard(rect, card.offsetHeight, vp, protectedRects());
      card.style.top = `${place.top}px`;
      belowCard = !!rect && place.top >= rect.top + rect.height / 2;
      cardLeft = place.left;
    }
    card.style.bottom = 'auto';
    card.classList.toggle('is-placed', landscape);
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
    // 카드가 대상 아래(is-below)면 위쪽 꼬리, 위(is-above)면 아래쪽 꼬리. 옆·모서리·대상 없음이면 꼬리 없음
    const tail = !!rect && !aside;
    card.classList.toggle('is-below', tail && belowCard);
    card.classList.toggle('is-above', tail && !belowCard);
    if (tail && rect) {
      const cw = card.offsetWidth;
      card.style.setProperty('--tail', `${Math.max(24, Math.min(cw - 24, rect.left + rect.width / 2 - cardLeft))}px`);
    }
  }

  function render(): void {
    const scene = TUTORIAL_SCENES[state.index]!;
    const last = state.index === state.count - 1;
    const skip = button({ label: '건너뛰기', variant: 'ghost', size: 'small', onClick: () => {
      state = tutorialSkip(state);
      finish('skipped');
    } });
    const prev = button({ label: '이전', icon: 'i-chevron-left', size: 'small', onClick: () => {
      state = tutorialPrev(state);
      render();
    } });
    prev.disabled = state.index === 0;
    const next = button({ label: last ? '전투 시작' : '다음', variant: 'primary', size: 'small', onClick: () => {
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
    // 가로 LCD 는 낮아서 단계 표시와 버튼을 한 줄에 둔다 (T-2)
    const top = el('div', 'bha-tut__top');
    const steps = el('div', 'bha-tut__steps');
    steps.append(el('span', 'bha-tut__step', `${state.index + 1} / ${state.count}`), dots(state.count, state.index));
    top.append(steps, actions);
    card.replaceChildren(top, title, el('p', 'bha-tut__body', t(scene.body)));
    card.style.visibility = 'hidden';
    layout();
    card.style.visibility = 'visible';
    next.focus({ preventScroll: true });
  }

  window.addEventListener('resize', layout);
  render();
  return { close: () => finish('skipped'), dismiss: teardown };
}
