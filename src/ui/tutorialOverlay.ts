// 첫 플레이 튜토리얼 오버레이 (GDD 14-2, C.19 / U-2 새 디자인): 전투 화면의 해당 요소를 컷아웃(구멍)으로 하이라이트하고 설명 카드를 보여 준다.
// 장면 순서·상태는 engine/tutorial 의 순수 상태 머신이 정하고, 텍스트는 src/data/help 에서 종족 설정으로 치환해 읽는다.
// 실제로 손을 써 보는 단계는 넣지 않았다: 전투 시간이 멈춘 상태에서 블록을 쓰게 하려면 엔진 입력 경로를 열어야 해서 결정성 규칙(멈춤은 결과에 영향 없음)과 부딪힌다.
import { helpVars, renderHelpText, TUTORIAL_SCENES, type TutorialScene, type TutorialStage } from '../data/help';
import { actionBusy, sceneMoving } from './bha/actionFx';
import type { FactionConfig } from '../engine/faction';
import { isTutorialActive, startTutorial, tutorialNext, tutorialPrev, tutorialSkip, type TutorialState, type TutorialStatus } from '../engine/tutorial';
import { button, dots, el, icon } from './bha/dom';
import { linesBody } from './bha/lines';
import { getOverlayHost, registerLayer } from './bha/overlayHost';
import { elementLocalRect } from './bha/viewport';
import { placeCard, placeCardBox, unionRect, type Rect } from './helpLayout';

export interface TutorialHandle {
  close(): void;
  /** 끝낸 것으로 치지 않고 조용히 치운다 (화면을 떠날 때, Q-3). onFinish 는 부르지 않는다 */
  dismiss(): void;
  /** 전투 화면이 "플레이어가 블록을 썼다"를 알린다 (직접 해 보기 장면의 통과 조건) */
  blockUsed(): void;
  /** 전투 화면이 블록 바의 블록 수를 알린다 (직접 해 보기 장면의 minBlocks 조건) */
  trayCount(n: number): void;
}

export interface TutorialOverlayOptions {
  /** 끝(마지막 장면 다음)이나 건너뛰기로 닫히면 한 번 불린다 */
  onFinish: (status: Exclude<TutorialStatus, 'active'>) => void;
  /** 직접 해 보기 장면에 들어가면 true(전투가 다시 흐른다), 나가면 false(다시 멈춘다) */
  onPractice?: (on: boolean) => void;
  /** 장면 목록 (없으면 첫 전투 튜토리얼). 첫 원정·타일 안내(GDD 64·67장, C.120)가 같은 틀을 쓴다 */
  scenes?: readonly TutorialScene[];
  /** 위쪽 띠 문구 (없으면 "튜토리얼 중 — 전투 멈춤", null 이면 띠 없음) */
  pauseLabel?: string | null;
  /** 마지막 장면 버튼 (없으면 "전투 시작") */
  finishLabel?: string;
  /** 본문 자리표시자에 더할 값 (예: 조합 예시 이름) */
  vars?: Record<string, string>;
  /** 오버레이 이름 (data-tutorial 값, 없으면 'true') */
  name?: string;
  /** 각본 전투 카드 (GDD 123장 5, C.199): 건너뛰기·이전 없이 단계 글자(step)만. waitFor 가 있으면 [다음] 없이 전투를 만지게 두고(직접 해 보기와 같음),
   *  기기 ▲▼ 는 그 선택자에 맞는 전투 대상만 고른다 (GDD 122장) */
  script?: { step: string; waitFor?: string; act?: TutorialAct };
  /** 기기 뒤로 (없으면 아무것도 안 함 — 튜토리얼은 [다음]·[건너뛰기]로만 닫는다) */
  onBack?: () => void;
  /** 도움말에서 직접 연 다시 보기 (GDD 129-1): 이때만 뒤 화면을 회색으로 덮는다. 없으면(저절로 뜨는 안내·각본 카드) 카드·강조 테두리만 */
  replay?: boolean;
}

/**
 * 실제 조작 카드 (GDD 129-2 2, C.206): 카드는 눌러야 할 버튼을 가리키기만 하고(강조 테두리), 사용자가 원래 게임 조작으로 그 버튼을 눌러야 진행한다.
 * 하기 전에는 [다음]이 흐린 잠김, done() 이 참이 되면 [다음]이 켜지고 기기 초점이 [다음]으로 간다. 그동안 기기 ▲▼ 는 뒤 화면의 selector 대상만 고른다.
 * 화면이 바뀌어도(가방 열기·월드맵·시장) 강조 테두리는 장면 targets 중 지금 보이는 것을 따라간다
 */
export interface TutorialAct {
  /** 기기 ▲▼ 가 고를 뒤 화면 대상 (CSS 선택자, 여러 화면에 걸치면 쉼표로) */
  selector: string;
  /** 해야 할 것을 했는가 */
  done: () => boolean;
  /** 했으면 [다음] 없이 바로 닫는다 (첫 모험 강제처럼 화면이 다른 흐름으로 넘어갈 때, GDD 131장 2) */
  autoFinish?: boolean;
}

/** 실제 조작 카드가 대상 위치·완료를 다시 보는 간격 */
const ACT_POLL_MS = 250;

/** 구멍을 대상보다 이만큼(px) 넓게 판다 (HANDOFF 5-4) */
export const TUTORIAL_HOLE_PAD = 6;

/** 장면 제목 앞 아이콘 (장면 id → 스프라이트). 모르는 장면은 info */
const SCENE_ICON: Record<string, string> = {
  auto: 'i-play', tray: 'i-attack', try: 'i-practice', chain: 'i-chain-2', heavy: 'i-cast', void: 'i-void', liberation: 'i-special', after: 'i-evolve',
  // 첫 원정·타일 안내 (C.120)
  walk: 'i-loop', encounter: 'i-practice', absorb: 'i-absorb', modes: 'i-absorb', practice: 'i-evolve', next: 'i-nest', tiles: 'i-deck', deck: 'i-deck', place: 'i-tile-prey', combo: 'i-tile-combo', draw: 'i-rare', special: 'i-tile-combo',
};

/** 대상 영역을 오버레이 자리(host: LCD 창 또는 화면 전체) 기준 좌표로 돌려준다 */
function targetRect(ids: string[], host: HTMLElement): Rect | null {
  const rects: Rect[] = [];
  // 화면 좌표는 기기를 돌려 놓으면 같이 돌아가므로 기기 안 좌표로 바꿔 쓴다 (GDD 16-6)
  const o = host === document.body ? { left: 0, top: 0 } : elementLocalRect(host);
  for (const id of ids) {
    // '@' 로 시작하면 CSS 선택자 (전투 밖 회복 안내 카드, C.199)
    document.querySelectorAll<HTMLElement>(id.startsWith('@') ? id.slice(1) : `[data-help="${id}"]`).forEach((n) => {
      const r = elementLocalRect(n);
      if (r.width > 0 && r.height > 0) rects.push({ top: r.top - o.top, left: r.left - o.left, width: r.width, height: r.height });
    });
  }
  return unionRect(rects);
}

/** 선택자 목록 ('@' 떼고 쉼표로 이은 것) */
const selectorOf = (targets: readonly string[]) => targets.map((t) => (t.startsWith('@') ? t.slice(1) : `[data-help="${t}"]`)).join(', ');

/** 지금 누를 단계 (GDD 132장 1): 대상이 화면에 보이는 마지막 단계. 아무것도 안 보이면 첫 단계 */
export function currentStage(stages: readonly TutorialStage[], host: HTMLElement): number {
  return lastShownStage(stages.map((st) => targetRect(st.targets, host) !== null));
}
/** 보이는 단계 표시(단계마다 대상이 보이나)에서 지금 단계: 보이는 마지막 단계, 없으면 0 */
export function lastShownStage(shown: readonly boolean[]): number {
  for (let i = shown.length - 1; i > 0; i--) if (shown[i]) return i;
  return 0;
}

/** 사방으로 pad 만큼 넓힌 영역 */
const padRect = (r: Rect, pad: number): Rect => ({ top: r.top - pad, left: r.left - pad, width: r.width + pad * 2, height: r.height + pad * 2 });

/** 두 영역이 겹친다 */
export function rectsOverlap(a: Rect, b: Rect): boolean {
  return Math.min(a.left + a.width, b.left + b.width) > Math.max(a.left, b.left) && Math.min(a.top + a.height, b.top + b.height) > Math.max(a.top, b.top);
}

/** 대상 자리가 크게 바뀌었다 (나타남·사라짐·MOVE 허용치 넘게 옮김) */
function movedFar(a: Rect | null, b: Rect | null, tol = 24): boolean {
  if (!a || !b) return a !== b;
  return Math.abs(a.left - b.left) > tol || Math.abs(a.top - b.top) > tol || Math.abs(a.width - b.width) > tol || Math.abs(a.height - b.height) > tol;
}

/** 카드가 가리면 안 되는 열린 창 (GDD 132장 1): 단계에 적힌 것 + 늘 지키는 창(아이템 상세 창·독 펼친 줄) */
const OPEN_WINDOWS = ['@.bha-itemdialog .bha-itemmodal', '@.bha-actfx', '@.bha-homedock__tray--food', '@.bha-homedock__tray--more'];

/** 카드가 되도록 피하는 주인공 (GDD 162장 1): 방 캐릭터·온천 캐릭터 — 먹는 모습·온천에 몸 담근 모습이 안내 창에 가리지 않게 */
const SUBJECTS = ['@.bha-char', '@.bha-spa__actor'];

export function tutorialOverlay(faction: FactionConfig, opts: TutorialOverlayOptions): TutorialHandle {
  const vars = { ...helpVars(faction), ...(opts.vars ?? {}) };
  const t = (s: string) => renderHelpText(s, vars);
  // 단계 대상 선택자의 자리표시자({foodId} 등)는 값만 바꿔 넣는다 (조사 고치기 없이)
  const sub = (x: string) => x.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '');
  const SCENES = (opts.scenes ?? TUTORIAL_SCENES).map((sc) => (sc.stages ? { ...sc, stages: sc.stages.map((st) => ({ ...st, targets: st.targets.map(sub), avoid: st.avoid?.map(sub) })) } : sc));
  let state: TutorialState = startTutorial(SCENES.length);

  const layer = el('div', 'bha-tut');
  layer.setAttribute('role', 'dialog');
  layer.setAttribute('aria-modal', 'true');
  layer.setAttribute('aria-label', '튜토리얼');
  layer.dataset.tutorial = opts.name ?? 'true';
  // 각본 전투·회복 안내 카드 (GDD 129장 3)·저절로 뜨는 안내 (129-1): 화면을 회색으로 덮지 않는다 — 카드·강조 테두리만
  if (opts.script) layer.classList.add('is-script');
  if (opts.replay && !opts.script) layer.dataset.replay = '';
  else layer.classList.add('is-nodim');
  const hole = el('div', 'bha-tut__hole');
  const card = el('div', 'bha-tut__card');
  if (opts.pauseLabel !== null) {
    const pauseTag = el('span', 'bha-chip bha-battle__pausetag');
    pauseTag.append(icon('i-pause'), opts.pauseLabel ?? '튜토리얼 중 — 전투 멈춤');
    layer.append(pauseTag);
  }
  layer.append(hole, card);
  const host = getOverlayHost();
  host.append(layer);
  const unregister = registerLayer(layer, opts.onBack ?? (() => {})); // 뒤로 = 아무것도 안 함(또는 부르는 쪽 안내) — 튜토리얼은 [다음]·[건너뛰기]로만 닫는다 (C.176, GDD 104장 7)

  /** 지금 단계 (stages 가 있는 장면만) */
  let stageIdx = 0;
  const stageOf = (scene: TutorialScene): TutorialStage | null => scene.stages?.[stageIdx] ?? null;
  let practiceOn = false;
  let practiced = false;
  let blocks = 0;
  /** 직접 해 보기를 아직 못 넘는가: 블록을 하나 쓰고, minBlocks 만큼 모일 때까지 */
  const mustWait = (scene: TutorialScene) => !!scene.practice && (!practiced || blocks < (scene.minBlocks ?? 0));
  let nextBtn: HTMLButtonElement | null = null;
  /** 실제 조작 카드: 해야 할 것을 했다 */
  let actDone = false;
  let actTimer = 0;
  /** 장면 이동 연출(온천 들고 나기·월드맵 걷기 → 페이드) 중에는 창을 숨기고, 끝나면 그 자리에 한 번 놓고 고정한다 (GDD 143장 1) */
  let moveTimer = 0;
  /** 카드가 대상을 덮게 됐는지 보는 타이머 (모든 장면) */
  let coverTimer = 0;
  /** 요소 자리를 오버레이 자리(host) 기준으로 */
  const hostRect = (n: HTMLElement): Rect => {
    const o = host === document.body ? { left: 0, top: 0 } : elementLocalRect(host);
    const r = elementLocalRect(n);
    return { top: r.top - o.top, left: r.left - o.left, width: r.width, height: r.height };
  };
  let hiddenForMove = false;
  /** 마지막으로 놓은 대상 자리 — 대상이 크게 옮겨 갈 때만 다시 놓는다(제자리에서 흔들리는 대상을 따라 창이 움직이지 않게) */
  let placedFor: Rect | null = null;
  const MOVE_POLL_MS = 100;
  const showCard = (on: boolean) => {
    card.style.visibility = on ? 'visible' : 'hidden';
    hole.style.visibility = on ? '' : 'hidden';
  };
  /** 연출 중이면 숨기고 끝날 때까지 기다렸다 놓는다. 숨겼으면 true */
  const holdWhileMoving = (): boolean => {
    if (!sceneMoving()) return false;
    showCard(false);
    if (!hiddenForMove) {
      hiddenForMove = true;
      moveTimer = window.setInterval(() => {
        if (!layer.isConnected) return window.clearInterval(moveTimer);
        if (sceneMoving()) return;
        window.clearInterval(moveTimer);
        hiddenForMove = false;
        const sc = SCENES[state.index]!;
        if (sc.stages && !actDone) {
          stageIdx = currentStage(sc.stages, host); // 연출 사이에 바뀐 화면의 단계로
          layer.dataset.stage = String(stageIdx);
        }
        render();
      }, MOVE_POLL_MS);
    }
    return true;
  };
  const setPractice = (on: boolean) => {
    if (on === practiceOn) return;
    practiceOn = on;
    layer.classList.toggle('is-practice', on);
    layer.toggleAttribute('data-dev-pass', on); // 기기 ▲▼·✓ 가 전투 블록·버튼도 고른다 (C.197, GDD 122장)
    opts.onPractice?.(on);
  };
  const teardown = () => {
    window.clearInterval(actTimer);
    window.clearInterval(moveTimer);
    window.clearInterval(coverTimer);
    setPractice(false);
    window.removeEventListener('resize', layout);
    unregister();
    layer.remove();
  };
  const finish = (status: Exclude<TutorialStatus, 'active'>) => {
    teardown();
    opts.onFinish(status);
  };

  /** 블록 바와 저장 필살기 버튼: 설명 카드가 가리지 않게 보호할 영역 */
  const protectedRects = () => {
    const sc = SCENES[state.index]!;
    const st = stageOf(sc);
    // 각본 카드(첫 전투)는 해방을 쓰지 않는다 — 해방 대상(내 캐릭터 전체)을 피하느라 적 예고 게이지를 덮던 것 (C.235, GDD 157장 2)
    return ['battle.tray', ...(opts.script ? [] : ['battle.liberation']), ...OPEN_WINDOWS, ...SUBJECTS, ...(st?.avoid ?? sc.avoid ?? [])].map((id) => targetRect([id], host)).filter((r): r is Rect => r !== null);
  };

  /** 가로 화면(LCD)에서 카드가 후보로 삼는 너비: 넓게(위·아래에 걸쳐) / 좁게(옆·모서리) */
  const WIDE_W = 456;
  const NARROW_W = 280;
  /** 모서리에 좁게 서는 너비 (GDD 162장 1): 방처럼 위 칩·가운데 캐릭터·아래 독이 다 찬 화면에서 모서리 빈 곳에 들어가게 */
  const SLIM_W = 240;
  /** 대상 옆 빈 곳에 맞춘 너비의 하한 (이보다 좁으면 글이 너무 접힌다) */
  const MIN_SIDE_W = 200;

  function layout(): void {
    const scene = SCENES[state.index]!;
    const vp = host === document.body ? { width: window.innerWidth, height: window.innerHeight } : { width: host.clientWidth, height: host.clientHeight };
    const rect = targetRect(stageOf(scene)?.targets ?? scene.targets, host);
    placedFor = rect;
    // 자리 고르기는 강조 테두리(구멍)까지 넓힌 대상으로 잰다 — 카드가 테두리에 걸쳐 대상을 덮지 않게 (GDD 162장 1)
    const keep = rect ? padRect(rect, TUTORIAL_HOLE_PAD) : null;
    const landscape = vp.width > vp.height;
    let belowCard = false;
    let aside = false;
    let cardLeft = (vp.width - card.offsetWidth) / 2;
    if (landscape) {
      // 가로: 너비 두 가지를 시험해 대상·블록 바를 가장 적게 가리는 자리를 고른다 (T-2)
      const prot = protectedRects();
      let best: { w: number; h: number; p: ReturnType<typeof placeCardBox> } | null = null;
      // + 대상 왼쪽·오른쪽 빈 곳에 꼭 맞는 너비 (GDD 162장 1): 위·아래가 막혔을 때(위 끝 칩·아래 독 사이) 대상 옆에 좁게 서서 대상을 가리지 않는다
      const sideW = keep ? [keep.left - 16, vp.width - keep.left - keep.width - 16].filter((w) => w >= MIN_SIDE_W && w < NARROW_W) : [];
      for (const w of [Math.min(WIDE_W, vp.width - 16), Math.min(NARROW_W, vp.width - 16), Math.min(SLIM_W, vp.width - 16), ...sideW]) {
        card.style.width = `${w}px`;
        const h = card.offsetHeight;
        const p = placeCardBox(keep, { width: w, height: h }, vp, prot);
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
      const place = placeCard(keep, card.offsetHeight, vp, protectedRects());
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
    const scene = SCENES[state.index]!;
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
    const mustTry = mustWait(scene);
    const sc = opts.script;
    const next = button({ label: last ? opts.finishLabel ?? '전투 시작' : '다음', variant: 'primary', size: 'small', onClick: () => {
      state = tutorialNext(state);
      if (isTutorialActive(state)) render();
      else finish('completed');
    } });
    next.append(icon(last ? 'i-play' : 'i-chevron-right'));
    next.disabled = mustTry; // 직접 해 보기는 블록을 하나 써야 넘어간다 (건너뛰기는 언제나 가능)
    const acting = !!sc?.act && !actDone;
    if (acting) next.disabled = true; // 실제 조작 카드: 하기 전에는 [다음] 잠김 (GDD 129-2 2)
    nextBtn = next;
    setPractice(!!scene.practice || !!sc?.waitFor || acting);
    const stage = stageOf(scene);
    if (sc?.waitFor) layer.dataset.devOnly = sc.waitFor;
    else if (acting) layer.dataset.devOnly = stage ? selectorOf(stage.targets) : sc!.act!.selector; // 기기 초점도 지금 누를 것을 따라간다 (GDD 132장 1)
    else delete layer.dataset.devOnly;
    const actions = el('div', 'bha-tut__actions');
    // 각본 카드: 강제 진행 — 건너뛰기·이전 없음, 기다리는 카드는 [다음]도 없음 (막기·블록을 눌러야 진행)
    if (!sc) actions.append(skip, prev, next);
    else if (!sc.waitFor) actions.append(next);

    const title = el('h2', 'bha-tut__title');
    title.id = 'tutorial-title';
    title.append(icon(SCENE_ICON[scene.id] ?? 'i-info'), t(scene.title));
    layer.setAttribute('aria-labelledby', title.id);
    // 가로 LCD 는 낮아서 단계 표시와 버튼을 한 줄에 둔다 (T-2)
    const top = el('div', 'bha-tut__top');
    const steps = el('div', 'bha-tut__steps');
    if (sc) steps.append(el('span', 'bha-tut__step', sc.step));
    else steps.append(el('span', 'bha-tut__step', `${state.index + 1} / ${state.count}`), dots(state.count, state.index));
    top.append(steps, actions);
    const body = linesBody(t(scene.practice && practiced && scene.done ? scene.done : sc?.act && actDone && scene.done ? scene.done : (acting ? stage?.body : undefined) ?? scene.body), 'bha-tut__body');
    card.replaceChildren(top, title, body);
    if (scene.sample?.length) card.append(sampleRow(scene.sample));
    card.style.visibility = 'hidden';
    if (holdWhileMoving()) return; // 연출이 끝나면 다시 그린다
    layout();
    showCard(true);
    if (!sc?.waitFor && !acting) next.focus({ preventScroll: true });
  }

  /** 샘플 블록: 블록 바에 생기는 블록의 역할 표시(아이콘 + 색 + 이름)를 카드 안에서 미리 보여 준다 */
  const sampleRow = (roles: string[]): HTMLElement => {
    const row = el('div', 'bha-tut__sample');
    row.setAttribute('aria-label', '샘플 블록');
    for (const r of roles) {
      const it = el('span', `bha-legend__item bha-legend__item--${r} bha-tut__sampleblock`);
      it.append(icon(`i-${r}`), el('span', '', vars[`roleNames.${r}`] ?? r));
      row.append(it);
    }
    return row;
  };

  window.addEventListener('resize', layout);
  // 모든 장면 공통 (GDD 162장 1): 화면이 바뀌어 대상이 크게 옮겨 갔거나, 조금 옮겨 간 대상을 카드가 덮게 됐으면 다시 놓는다.
  // 그 밖에는 뜬 창을 제자리에 둔다(제자리에서 흔들리는 대상을 따라 움직이지 않게 — GDD 143장 1)
  coverTimer = window.setInterval(() => {
    if (!layer.isConnected) return window.clearInterval(coverTimer);
    if (hiddenForMove || card.style.visibility === 'hidden') return;
    const sc = SCENES[state.index]!;
    const r = targetRect(stageOf(sc)?.targets ?? sc.targets, host);
    if (movedFar(r, placedFor)) return layout();
    if (r && movedFar(r, placedFor, 2) && rectsOverlap(hostRect(card), padRect(r, TUTORIAL_HOLE_PAD))) layout();
  }, ACT_POLL_MS);
  if (SCENES[state.index]!.stages) {
    stageIdx = currentStage(SCENES[state.index]!.stages!, host);
    layer.dataset.stage = String(stageIdx);
  }
  render();
  const act = opts.script?.act;
  if (act) {
    const poll = () => {
      if (!layer.isConnected) return window.clearInterval(actTimer);
      if (hiddenForMove || holdWhileMoving()) return; // 장면 이동 연출 중: 창 없음 (GDD 143장 1)
      const scene = SCENES[state.index]!;
      if (scene.stages && !actDone) {
        // 누를 때마다 다음 대상으로 (GDD 132장 1): 강조 테두리·문구·카드 자리·기기 초점을 지금 단계로
        const i = currentStage(scene.stages, host);
        if (i !== stageIdx) {
          stageIdx = i;
          layer.dataset.stage = String(i);
          render();
        }
      }
      if (actDone || !act.done()) return;
      // 행동 연출(막대 차오름·먹는 모습)이 끝나야 [다음]이 풀린다 (GDD 132장 3). 그동안은 창을 숨긴다 — 이미 한 행동을 시키는 문구가 연출을 덮지 않게 (GDD 162장 2)
      if (actionBusy()) return showCard(false);
      actDone = true;
      if (act.autoFinish) return finish('completed');
      render(); // [다음] 켜짐 · 뒤 화면 통과 끝 · 초점 = [다음]
    };
    actTimer = window.setInterval(poll, ACT_POLL_MS);
    poll();
  }
  return {
    close: () => finish('skipped'),
    dismiss: teardown,
    blockUsed: () => {
      if (practiceOn && !practiced) {
        practiced = true;
        render();
      }
    },
    trayCount: (n) => {
      if (n === blocks) return;
      blocks = n;
      if (practiceOn && nextBtn) nextBtn.disabled = mustWait(SCENES[state.index]!);
    },
  };
}
