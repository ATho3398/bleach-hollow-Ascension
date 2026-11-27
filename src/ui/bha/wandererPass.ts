// 우라하라 마주침 연출 (GDD 5-5 v6.239 '마주침 연출', C.558 — 사용자 2026-11-27 "우라하라 알림창 없애고, 그냥 우라하라는 배경쪽에 서있다가 우리가 지나가면 인사하는 모션 취한다음 …"):
// 마주친 칸에서 걷기 화면 배경 쪽(캐릭터 뒤 먼 줄, 바닥선 맞춤·조금 작게)에 우라하라 도트(prop.wanderer)가 왼쪽(진행 방향) 밖에서 나타나
// 배경과 함께 오른쪽으로 흘러가고, 캐릭터 바로 앞을 지날 때 인사(몸 살짝 숙였다 펴기 2번 + 머리 위 말풍선 '어이~')를 한 뒤 뒤로 흘러가 사라진다.
// 걷기는 멈추지 않는다. 움직임은 CSS(encounter.css .bha-passer)가 맡고 걷기가 멈추면 같이 멈춘다 — 여기서는 상자와 시간표(px·ms)만 만든다.
// 인사 동작은 도트가 한 장뿐이라 임시(provisional) — 사용자가 인사 동작 그림을 주면 바꾼다.
import { artUrls } from '../../data/art/manifest';
import { WANDERER_TEXT } from '../../data/shop';
import { el } from './dom';

const ART_BASE = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';

/** 연출 값 (임시·provisional — 화면 연출이라 balance 밖, GDD 5-5 '마주침 연출'): 키 = 캐릭터 칸 키(--bha-fig-h)의 몇 배, 흐르는 빠르기 = 땅(장면 높이 50%/초)의 몇 배(먼 줄이라 조금 느리게),
 *  인사 = 숙였다 펴기 2번 길이, 말풍선 보이는 시간, 인사 자리 = 캐릭터 앞(왼쪽)으로 캐릭터 반 폭 + 우라하라 폭의 몇 배 */
export const PASS = {
  heightOfFig: 0.8,
  speedOfGround: 0.8,
  groundPerSecond: 0.5,
  bowMs: 600,
  sayMs: 1100,
  greetGapOfWidth: 0.5,
  /** 그림 비율 (prop-wanderer.png 168×342) */
  ratio: 168 / 342,
} as const;

export interface PassGeom {
  /** 장면 폭·높이 (px, 화면 배율 전 레이아웃 값) */
  sceneW: number;
  sceneH: number;
  /** 캐릭터 가운데 x · 반 폭 (장면 왼쪽 기준 px) */
  walkerX: number;
  walkerHalf: number;
  /** 캐릭터 칸 키 (장면 높이 비율, --bha-fig-h / 100) */
  figH: number;
  /** 걷기 배속 */
  speed: number;
}

export interface PassTiming {
  /** 우라하라 상자 폭·키 (px) */
  w: number;
  h: number;
  /** 왼쪽 끝 위치: 시작(장면 왼쪽 밖) → 끝(장면 오른쪽 밖) */
  fromX: number;
  toX: number;
  /** 지나가는 데 걸리는 시간 (ms) */
  passMs: number;
  /** 인사(숙이기) 시작 · 말풍선 시작 (지나가기 시작부터 ms) */
  bowAt: number;
  sayAt: number;
}

/** 지나가기 시간표 (순수): 땅보다 조금 느리게 일정한 빠르기로 흐르고, 캐릭터 바로 앞(왼쪽)에 왔을 때 인사가 한가운데에 온다 */
export function passTiming(g: PassGeom): PassTiming {
  const h = g.sceneH * g.figH * PASS.heightOfFig;
  const w = h * PASS.ratio;
  const v = g.sceneH * PASS.groundPerSecond * PASS.speedOfGround * Math.max(1, g.speed); // px/초
  const fromX = -w;
  const toX = g.sceneW;
  const passMs = ((toX - fromX) / v) * 1000;
  // 인사 한가운데 = 우라하라 오른쪽 끝이 캐릭터 왼쪽 끝에서 우라하라 폭 × greetGap 만큼 앞에 있을 때
  const greetLeft = g.walkerX - g.walkerHalf - w * PASS.greetGapOfWidth - w;
  const greetMid = Math.max(0, ((greetLeft - fromX) / v) * 1000);
  const bowAt = Math.max(0, greetMid - PASS.bowMs / 2);
  const sayAt = Math.max(0, greetMid - PASS.sayMs / 2);
  return { w, h, fromX, toX, passMs, bowAt, sayAt };
}

/** 움직임 줄이기: 숙이기 없이 말풍선만 (그 자리에 서 있다가 말풍선이 지면 사라진다) */
export const reducedMotion = (): boolean => {
  try {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  } catch {
    return false;
  }
};

/** 걷기 장면에 우라하라를 지나가게 한다. scene = 걷기 장면(.bha-walk), walker = 캐릭터 상자. 그림이 없으면 아무것도 안 한다. 돌려주는 값 = 붙인 상자 */
export function passWanderer(scene: HTMLElement, walker: HTMLElement, speed: number): HTMLElement | null {
  const src = artUrls('prop.wanderer', ART_BASE).src;
  if (!src) return null;
  scene.querySelector('.bha-passer')?.remove();
  const sw = scene.offsetWidth || scene.clientWidth;
  const sh = scene.offsetHeight || scene.clientHeight;
  // 캐릭터 자리 = 화면 배율(기기 틀 확대·축소)과 상관없게 장면 폭 비율로 잰다
  const sr = scene.getBoundingClientRect();
  const wr = walker.getBoundingClientRect();
  const k = sr.width > 0 ? sw / sr.width : 1;
  const figH = (parseFloat(getComputedStyle(scene).getPropertyValue('--bha-fig-h')) || 53) / 100;
  const t = passTiming({ sceneW: sw, sceneH: sh, walkerX: (wr.left + wr.width / 2 - sr.left) * k, walkerHalf: (wr.width / 2) * k, figH, speed });
  const reduced = reducedMotion();

  const item = el('div', `bha-passer${reduced ? ' is-still' : ''}`);
  item.setAttribute('aria-hidden', 'true');
  item.dataset.passer = 'wanderer';
  const fig = el('img', 'bha-passer__fig');
  fig.src = src;
  fig.alt = '';
  fig.draggable = false;
  // 머리 위 말풍선 = 걷기 화면 말풍선과 같은 부품(.bha-exp__msg)
  const say = el('p', 'bha-exp__msg bha-passer__say', WANDERER_TEXT.greet);
  item.append(fig, say);
  const set = (name: string, v: string) => item.style.setProperty(name, v);
  set('--passer-w', `${t.w.toFixed(1)}px`);
  set('--passer-h', `${t.h.toFixed(1)}px`);
  set('--passer-say-ms', `${PASS.sayMs}ms`);
  if (reduced) {
    // 움직임 없이: 인사 자리에 서서 말풍선만, 말풍선이 지면 사라진다
    const x = t.fromX + ((t.toX - t.fromX) * (t.sayAt + PASS.sayMs / 2)) / t.passMs;
    set('--passer-x', `${x.toFixed(1)}px`);
    set('--passer-say-at', '0ms');
    window.setTimeout(() => item.remove(), PASS.sayMs + 300);
  } else {
    set('--passer-from', `${t.fromX.toFixed(1)}px`);
    set('--passer-to', `${t.toX.toFixed(1)}px`);
    set('--passer-ms', `${Math.round(t.passMs)}ms`);
    set('--passer-bow-at', `${Math.round(t.bowAt)}ms`);
    set('--passer-bow-ms', `${PASS.bowMs}ms`);
    set('--passer-say-at', `${Math.round(t.sayAt)}ms`);
    item.addEventListener('animationend', (e) => {
      if (e.target === item && e.animationName === 'bha-passer-go') item.remove();
    });
  }
  // 캐릭터 뒤(먼 줄): 캐릭터 상자보다 먼저 = 아래 층
  scene.insertBefore(item, walker);
  return item;
}
