// 첫 플레이 튜토리얼 오버레이 (GDD 14-2, C.19 / U-2 새 디자인): 전투 화면의 해당 요소를 컷아웃(구멍)으로 하이라이트하고 설명 카드를 보여 준다.
// 장면 순서·상태는 engine/tutorial 의 순수 상태 머신이 정하고, 텍스트는 src/data/help 에서 종족 설정으로 치환해 읽는다.
// 실제로 손을 써 보는 단계는 넣지 않았다: 전투 시간이 멈춘 상태에서 블록을 쓰게 하려면 엔진 입력 경로를 열어야 해서 결정성 규칙(멈춤은 결과에 영향 없음)과 부딪힌다.
import { helpVars, renderHelpText, TUTORIAL_SCENES, type TutorialScene, type TutorialStage } from '../data/help';
import { actionBusy, sceneMoving } from './bha/actionFx';
import type { FactionConfig } from '../engine/faction';
import { isTutorialActive, startTutorial, tutorialNext, tutorialPrev, tutorialSkip, type TutorialState, type TutorialStatus } from '../engine/tutorial';
import { button, dots, el, icon } from './bha/dom';
import { linesBody } from './bha/lines';
import { DEVICE_BUTTON_SELECTOR, getOverlayHost, onTutorialCover, registerLayer, tutorialsCovered } from './bha/overlayHost';
import { elementLocalRect } from './bha/viewport';
import { placeCard, placeCardFit, unionRect, type BoxSide, type Rect } from './helpLayout';

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
  walk: 'i-loop', encounter: 'i-practice', absorb: 'i-absorb', modes: 'i-absorb', practice: 'i-evolve', next: 'i-nest', tiles: 'i-deck', tabs: 'i-deck', deck: 'i-deck', place: 'i-tile-prey', combo: 'i-tile-combo', preset: 'i-stored', draw: 'i-rare', special: 'i-tile-combo',
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

/** 대상 옆 네 자리 */
const NEAR_SIDES: readonly BoxSide[] = ['below', 'above', 'right', 'left'];
/** 지금 화면 (창 자리 기억을 같은 화면 안에서만 잇는다) */
const screenKey = () => [...document.querySelectorAll('.bha-app')].map((e) => [...e.classList].filter((c) => !c.startsWith('is-')).join(' ')).join('|');
/** 앞 단계 창 자리 (GDD 169장 3·4): 안내마다 오버레이를 새로 띄워도(홈 안내·회복 안내는 카드 한 장씩) 같은 화면이면 같은 쪽을 먼저 쓴다 */
let lastPlaced: { screen: string; side: BoxSide | null; rect: Rect } | null = null;

/**
 * 튜토리얼 입력 막기 (GDD 180장 1, C.276): 안내가 떠 있는 동안 지시한 버튼(구멍 대상)·안내 창 버튼만 눌린다.
 * 화면 터치(진짜 누름 = isTrusted)는 문서 맨 앞(capture)에서 거른다 — 실제 조작 카드는 레이어가 누름을 통과시키므로(is-practice) 여기서 막아야 뒤 화면 다른 버튼이 안 눌린다.
 * 기기 버튼(▲▼✓◀) 누름은 지나가고, 기기 쪽(device.ts)이 data-tut-guard 레이어를 보고 초점·✓·◀ 를 대상으로 좁힌다. 프로그램이 부르는 click(기기 ✓ 등)은 막지 않는다
 */
export interface TutorialGuard {
  /** 안내 레이어 (data-tut-guard) */
  layer: HTMLElement;
  /** 안내 창 (창 안 버튼은 언제나 눌린다) */
  card: HTMLElement;
  /** 지금 눌러도 되는 뒤 화면 대상 (CSS 선택자, 없으면 창 버튼만) */
  allow: () => string | null;
  /** 다른 곳을 눌렀다: 대상을 잠깐 깜빡인다 */
  nudge: () => void;
  /** 가드를 푼다 (pushGuard 가 채운다) */
  release: () => void;
}
const guards: TutorialGuard[] = [];
/** 게임이 아니라 기기 보기만 바꾸는 조작 (다마고치 모드 뒤집기·확대·줌아웃 화면 탭, GDD 27장) */
const VIEW_CONTROL_SELECTOR = '.bha-tama__shield, [data-tama="flip"], [data-tama="zoom-in"]';
const GUARDED_EVENTS = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'click', 'dblclick', 'contextmenu'] as const;
/** 눌러도 되는 곳인가 (지금 맨 위 안내 기준) */
export function tutorialAllows(g: TutorialGuard, t: EventTarget | null): boolean {
  if (!(t instanceof Element)) return true;
  if (t.closest(DEVICE_BUTTON_SELECTOR)) return true; // 기기 버튼은 device.ts 가 대상으로 좁힌다
  if (t.closest(VIEW_CONTROL_SELECTOR)) return true; // 기기 보기 조작(다마고치 뒤집기·확대)은 게임을 진행시키지 않는다
  if (g.card.contains(t)) return true;
  const sel = g.allow();
  return !!sel && !!t.closest(sel);
}
/**
 * 허용된 곳에서 시작한 누름 (GDD 182장 2): 그 누름이 끝날 때까지(놓기 + 이어지는 mouseup·touchend·click) 같은 누름의 사건은 대상이 바뀌어도 지나간다.
 * 블록 바는 누르는 순간 포인터를 붙잡아(setPointerCapture) 놓기(pointerup) 대상이 블록 칸이 아니라 바 전체가 된다 — 이걸 막아 튜토리얼 블록 안내에서 블록을 눌러도 안 써졌다.
 * 끌어 놓기·다른 칸에서 놓기도 같은 누름이다
 */
export interface PressTrack {
  /** 지금 누름이 허용된 곳에서 시작했다 */
  open: boolean;
  /** 놓은 뒤 이어지는 사건을 받는 마감 (아직 안 놓았으면 Infinity) */
  until: number;
}
/** 놓은 뒤 이어지는 호환 사건(mouseup·touchend·click)을 받아 주는 시간 */
export const PRESS_FOLLOW_MS = 600;
const PRESS_START = new Set(['pointerdown', 'mousedown', 'touchstart']);
const PRESS_END = new Set(['pointerup', 'pointercancel', 'touchend']);
/** 이 사건을 지나가게 하나: allowed = 사건 대상이 지금 허용 대상인가. 누름 상태(p)를 갱신한다 */
export function pressPasses(p: PressTrack, type: string, now: number, allowed: boolean): boolean {
  if (PRESS_START.has(type)) {
    if (type === 'pointerdown' || !p.open || now > p.until) {
      p.open = allowed;
      p.until = Infinity;
    }
    return allowed || p.open;
  }
  if (allowed) return true;
  if (!p.open || now > p.until) {
    p.open = false;
    return false;
  }
  if (PRESS_END.has(type) && p.until === Infinity) p.until = now + PRESS_FOLLOW_MS;
  return true;
}
const press: PressTrack = { open: false, until: 0 };
const onGuardedEvent = (e: Event): void => {
  // 다른 길로 치워진 안내(레이어가 문서에서 빠짐)는 가드도 푼다 — 남은 가드가 화면을 막지 않게
  for (const dead of guards.filter((x) => !x.layer.isConnected)) dead.release();
  const g = guards[guards.length - 1];
  if (!g || !e.isTrusted) return;
  if (tutorialsCovered()) return; // 일시정지·설정 같은 창이 안내를 덮고 있으면 그 창 버튼이 눌려야 한다 (GDD 194장 2)
  if (pressPasses(press, e.type, performance.now(), tutorialAllows(g, e.target))) return;
  if (e.cancelable) e.preventDefault();
  e.stopImmediatePropagation();
  if (e.type === 'pointerdown') g.nudge();
};
function pushGuard(g: Omit<TutorialGuard, 'release'>): () => void {
  if (guards.length === 0) for (const type of GUARDED_EVENTS) window.addEventListener(type, onGuardedEvent, { capture: true, passive: false });
  const entry: TutorialGuard = { ...g, release: () => {} };
  guards.push(entry);
  g.layer.dataset.tutGuard = '';
  return (entry.release = () => {
    const g = entry;
    const i = guards.indexOf(g);
    if (i >= 0) guards.splice(i, 1);
    delete g.layer.dataset.tutGuard;
    if (guards.length === 0) for (const type of GUARDED_EVENTS) window.removeEventListener(type, onGuardedEvent, { capture: true });
  });
}
/** 깜빡임 길이 (토큰 --bha-dur-5 와 같은 값 — 끝나면 클래스를 뗀다) */
const NUDGE_MS = 900;
/** 대상을 잠깐 깜빡인다 (GDD 180장 1): 대상 자신의 밝기만 — 네모 상자 빛 없음 (178장 3) */
export function nudgeTargets(els: readonly Element[]): void {
  for (const n of els) {
    n.classList.remove('bha-tut-nudge');
    void (n as HTMLElement).offsetWidth; // 연달아 눌러도 처음부터 다시
    n.classList.add('bha-tut-nudge');
    window.setTimeout(() => n.classList.remove('bha-tut-nudge'), NUDGE_MS);
  }
}

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
  // 뒤로(◀·Esc) = 대상 깜빡임만 (GDD 180장 1 — 새 알림·문구 없음). 튜토리얼은 [다음]·[건너뛰기]로만 닫는다 (C.176, GDD 104장 7)
  // 덮는 창(일시정지 등)이 열려 있는 동안은 기기에서도 빠진다 — 기기 ▲▼✓◀ 가 그 창 버튼을 고르게 (GDD 194장 1)
  let unregister = (): void => undefined;
  const enroll = (): void => {
    unregister();
    const off = registerLayer(layer, () => nudge());
    unregister = () => {
      unregister = () => undefined;
      off();
    };
  };

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
  /** 지금 눌러도 되는 뒤 화면 대상 (실제 조작·직접 해 보기·각본 대기 중일 때만 — 기기 초점과 같은 선택자) */
  const allowSel = (): string | null => {
    if (!practiceOn) return null;
    // 단계가 있는 실제 조작 카드: 누르는 순간의 단계로 다시 잰다 — 화면이 막 바뀐 틈(단계 갱신 0.25초 전)에 다음 대상이 막히지 않게 (GDD 132장 1)
    const sc = SCENES[state.index];
    if (sc?.stages && opts.script?.act && !actDone) return selectorOf(sc.stages[currentStage(sc.stages, host)]!.targets);
    return layer.dataset.devOnly ?? null;
  };
  /** '여기': 누를 대상(뒤 화면 대상, 없으면 창의 [다음])을 깜빡인다 */
  const nudge = (): void => {
    const sel = allowSel();
    const shown = (n: Element) => n instanceof HTMLElement && n.getClientRects().length > 0;
    const els = sel ? [...document.querySelectorAll(sel)].filter(shown) : nextBtn && !nextBtn.disabled && nextBtn.isConnected ? [nextBtn] : [];
    nudgeTargets(els);
  };
  const unguard = pushGuard({ layer, card, allow: allowSel, nudge });
  /**
   * 덮임 (GDD 194장 1~3, C.314): 일시정지·설정·새 버전 알림 같은 창이 열려 있으면 카드·강조 틀·띠를 통째로 숨기고, 입력 막기·기기 등록도 쉰다.
   * 창이 닫히면 같은 단계(state·stageIdx·직접 해 보기 상태 그대로) 카드를 다시 그린다. 앱 이탈(C.193 자리 비움) 때 전투 일시정지가 이 길로 온다
   */
  let covered = false;
  const applyCover = (on: boolean): void => {
    if (on === covered || !layer.isConnected) return;
    covered = on;
    layer.style.display = on ? 'none' : '';
    if (on) {
      delete layer.dataset.tutGuard; // 기기 쪽(device.ts)이 이 안내로 초점을 좁히지 않게
      unregister();
      return;
    }
    layer.dataset.tutGuard = '';
    enroll();
    render();
  };
  const offCover = onTutorialCover(applyCover);
  if (tutorialsCovered()) applyCover(true);
  else enroll();
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
    offCover();
    unregister();
    unguard();
    layer.remove();
  };
  const finish = (status: Exclude<TutorialStatus, 'active'>) => {
    teardown();
    opts.onFinish(status);
  };

  /** 가리면 안 되는 것 (GDD 162장 1·169장 2): 블록 바·저장 필살기 버튼(눌러야 할 버튼)·열린 창 */
  const protectedRects = () =>
    // 각본 카드(첫 전투)는 해방을 쓰지 않는다 — 해방 대상(내 캐릭터 전체)을 피하느라 적 예고 게이지를 덮던 것 (C.235, GDD 157장 2)
    ['battle.tray', ...(opts.script ? [] : ['battle.liberation']), ...OPEN_WINDOWS].map((id) => targetRect([id], host)).filter((r): r is Rect => r !== null);
  /** 되도록 피하는 것 (GDD 169장 2): 캐릭터·단계에 적힌 것(상태 칩·체력 막대·말풍선 등). 단계에 적힌 것은 3배 무게 */
  const softRects = () => {
    const sc = SCENES[state.index]!;
    const st = stageOf(sc);
    const rs = (ids: readonly string[]) => ids.map((id) => targetRect([id], host)).filter((r): r is Rect => r !== null);
    const avoid = rs(st?.avoid ?? sc.avoid ?? []);
    return [...rs(SUBJECTS), ...avoid, ...avoid, ...avoid];
  };

  /** 가로 화면(LCD)에서 카드가 후보로 삼는 너비: 넓게(위·아래에 걸쳐) / 좁게(옆·모서리) */
  const WIDE_W = 456;
  const NARROW_W = 280;
  /** 모서리에 좁게 서는 너비 (GDD 162장 1): 방처럼 위 칩·가운데 캐릭터·아래 독이 다 찬 화면에서 모서리 빈 곳에 들어가게 */
  const SLIM_W = 240;
  /** 대상 옆 빈 곳에 맞춘 너비의 하한 (이보다 좁으면 글이 너무 접힌다) */
  const MIN_SIDE_W = 200;

  function layout(): void {
    if (covered) return; // 숨은 동안은 잴 수 없다 — 다시 보일 때 render 가 놓는다
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
    let side: BoxSide = 'center';
    const prev = lastPlaced && lastPlaced.screen === screenKey() ? lastPlaced : null;
    if (landscape) {
      // 가로: 너비 후보마다 높이를 재고, 대상 옆에 붙는 자리·크기를 함께 고른다 (GDD 169장)
      // + 대상 왼쪽·오른쪽 빈 곳에 꼭 맞는 너비 (GDD 162장 1): 위·아래가 막혔을 때 대상 옆에 좁게 선다
      const sideW = keep ? [keep.left - 16, vp.width - keep.left - keep.width - 16].filter((w) => w >= MIN_SIDE_W && w < NARROW_W) : [];
      const sizes = [Math.min(WIDE_W, vp.width - 16), Math.min(NARROW_W, vp.width - 16), Math.min(SLIM_W, vp.width - 16), ...sideW].map((w) => {
        card.style.width = `${w}px`;
        return { width: w, height: card.offsetHeight };
      });
      const p = placeCardFit(keep, sizes, vp, protectedRects(), { soft: softRects(), prefer: keep ? prev?.side : null, prev: prev?.rect ?? null });
      card.style.width = `${p.width}px`;
      card.style.left = `${p.left}px`;
      card.style.top = `${p.top}px`;
      cardLeft = p.left;
      side = p.side;
      belowCard = !!rect && p.top >= rect.top + rect.height / 2;
      aside = !rect || p.side === 'right' || p.side === 'left' || p.side === 'corner' || p.side === 'center';
    } else {
      card.style.width = '';
      card.style.left = '';
      const place = placeCard(keep, card.offsetHeight, vp, [...protectedRects(), ...softRects()], 12, 10, 456, prev?.side === 'above' ? 'above' : 'below');
      card.style.top = `${place.top}px`;
      belowCard = !!rect && place.top >= rect.top + rect.height / 2;
      cardLeft = place.left;
      side = place.side === 'center' ? 'center' : place.side;
    }
    // 다음 단계가 같은 쪽을 먼저 쓰도록 (GDD 169장 3) — 대상 없는 카드는 자리만 남기고 쪽은 앞 것을 이어 둔다
    lastPlaced = { screen: screenKey(), side: rect && NEAR_SIDES.includes(side) ? side : prev?.side ?? null, rect: { top: parseFloat(card.style.top) || 0, left: cardLeft, width: card.offsetWidth, height: card.offsetHeight } };
    card.dataset.side = side;
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
    if (covered) return; // 덮는 창이 닫히면 applyCover 가 다시 그린다 (GDD 194장 1)
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
    else if (scene.practice && (stage?.targets ?? scene.targets).length > 0) layer.dataset.devOnly = selectorOf(stage?.targets ?? scene.targets); // 직접 해 보기도 구멍 대상만 (GDD 180장 1)
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

  // 말풍선 누름 = [다음] (GDD 180장 1): 창 안 빈 곳을 눌러도 다음 단계로. 버튼 위 누름은 그 버튼이 처리한다
  card.addEventListener('click', (e) => {
    if (e.target instanceof Element && e.target.closest('button')) return;
    if (nextBtn && nextBtn.isConnected && !nextBtn.disabled) nextBtn.click();
  });
  window.addEventListener('resize', layout);
  // 모든 장면 공통 (GDD 162장 1): 화면이 바뀌어 대상이 크게 옮겨 갔거나, 조금 옮겨 간 대상을 카드가 덮게 됐으면 다시 놓는다.
  // 그 밖에는 뜬 창을 제자리에 둔다(제자리에서 흔들리는 대상을 따라 움직이지 않게 — GDD 143장 1)
  coverTimer = window.setInterval(() => {
    if (!layer.isConnected) return window.clearInterval(coverTimer);
    // 덮던 창이 닫기 알림 없이 문서에서 빠졌으면(화면 이동 등) 여기서 다시 띄운다
    if (covered) return void (tutorialsCovered() || applyCover(false));
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
      if (covered) return; // 일시정지 등 덮는 창 아래: 단계·완료를 보지 않는다 (닫히면 다시 그림, GDD 194장 1)
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
