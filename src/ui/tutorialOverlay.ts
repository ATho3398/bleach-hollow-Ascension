// 첫 플레이 튜토리얼 오버레이 (GDD 14-2, C.19): 전투 화면의 해당 요소를 하이라이트하고 설명 카드를 보여 준다.
// 장면 순서·상태는 engine/tutorial 의 순수 상태 머신이 정하고, 텍스트는 src/data/help 에서 종족 설정으로 치환해 읽는다.
// 실제로 손을 써 보는 단계는 넣지 않았다: 전투 시간이 멈춘 상태에서 블록을 쓰게 하려면 엔진 입력 경로를 열어야 해서 결정성 규칙(멈춤은 결과에 영향 없음)과 부딪힌다.
import { helpVars, renderHelpText, TUTORIAL_SCENES } from '../data/help';
import type { FactionConfig } from '../engine/faction';
import { isTutorialActive, startTutorial, tutorialNext, tutorialPrev, tutorialSkip, type TutorialState, type TutorialStatus } from '../engine/tutorial';
import { el } from './dom';
import { placeCard, unionRect, type Rect } from './helpLayout';

export interface TutorialHandle {
  close(): void;
}

export interface TutorialOverlayOptions {
  /** 끝(마지막 장면 다음)이나 건너뛰기로 닫히면 한 번 불린다 */
  onFinish: (status: Exclude<TutorialStatus, 'active'>) => void;
}

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

  const layer = el('div', 'tut-layer');
  const hole = el('div', 'tut-hole');
  const card = el('div', 'tut-card');
  card.setAttribute('role', 'dialog');
  layer.append(hole, card);
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
    const h = card.offsetHeight;
    const measure = () => {
      const rect = targetRect(scene.targets);
      return { rect, place: placeCard(rect, h, vp, protectedRects()) };
    };
    let cur = measure();
    if (!cur.place.clear) {
      // 화면 스크롤을 바꿔 보며 가장 덜 가리는 위치를 고른다 (화면 맨 위 / 대상이 맨 위 / 맨 아래 / 지금 위치)
      const startY = window.scrollY;
      let bestY = startY;
      for (const y of [0, startY + (cur.rect ? cur.rect.top - 8 : 0), Number.MAX_SAFE_INTEGER]) {
        window.scrollTo(0, Math.max(0, y));
        const m = measure();
        if (m.place.cost < cur.place.cost) {
          cur = m;
          bestY = window.scrollY;
        }
      }
      window.scrollTo(0, bestY);
      cur = measure();
    }
    const { rect, place } = cur;
    card.style.top = `${place.top}px`;
    card.style.left = `${place.left}px`;
    card.style.width = `${place.width}px`;
    layer.classList.toggle('tut-dim', !rect);
    hole.style.display = rect ? 'block' : 'none';
    if (rect) {
      hole.style.top = `${rect.top - 4}px`;
      hole.style.left = `${rect.left - 4}px`;
      hole.style.width = `${rect.width + 8}px`;
      hole.style.height = `${rect.height + 8}px`;
    }
  }

  function render(): void {
    const scene = TUTORIAL_SCENES[state.index]!;
    const last = state.index === state.count - 1;
    const skip = el('button', 'tut-skip', '건너뛰기');
    skip.onclick = () => {
      state = tutorialSkip(state);
      finish('skipped');
    };
    const prev = el('button', '', '이전');
    prev.disabled = state.index === 0;
    prev.onclick = () => {
      state = tutorialPrev(state);
      render();
    };
    const next = el('button', 'primary', last ? '전투 시작' : '다음');
    next.onclick = () => {
      state = tutorialNext(state);
      if (isTutorialActive(state)) render();
      else finish('completed');
    };
    const buttons = el('div', 'tut-buttons');
    buttons.append(skip, prev, next);
    card.replaceChildren(
      el('small', 'tut-step', `${state.index + 1} / ${state.count}`),
      el('b', 'tut-title', t(scene.title)),
      el('p', 'tut-body', t(scene.body)),
      buttons,
    );
    card.style.visibility = 'hidden';
    layout();
    card.style.visibility = 'visible';
  }

  window.addEventListener('resize', layout);
  render();
  return { close: () => finish('skipped') };
}
