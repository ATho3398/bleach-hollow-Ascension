// 원정 걷기 화면 (GDD 17-1): 내 캐릭터가 항상 왼쪽을 향해 걷고 배경이 오른쪽으로 흘러간다. 12칸 길·칸 번호·바퀴는 보이지 않는다.
// 걷기 모양은 임시 아트(CSS 애니메이션): 종족 설정의 walkAnim 이름이 bha-walker--<이름> 클래스로 붙고, 어떤 이름이 어떤 모양인지는 CSS 만 안다.
import type { ExpeditionPhase } from '../../engine/expedition';
import type { ArtUrls } from '../../data/art/manifest';
import type { Locomotion } from '../../engine/locomotion';
import { bindAnim, type AnimPlayer } from './animPlayer';
import { el, icon } from './dom';
import { setLoco } from './loco';
import { sceneBgEl } from './sceneBg';
import type { SceneBg } from '../../data/art/backgrounds';

export const DEFAULT_WALK_ANIM = 'plain';

/** 종족 설정의 걷기 애니메이션 이름 → 클래스 (순수). 비었거나 영문 소문자·숫자·하이픈이 아니면 기본 */
export function walkAnimClass(name: string | undefined): string {
  return `bha-walker--${name && /^[a-z0-9-]+$/.test(name) ? name : DEFAULT_WALK_ANIM}`;
}

/** 걷는 중인가: 이동 단계이고 멈추지 않았을 때만 (순수) */
export function isWalking(phase: ExpeditionPhase, paused: boolean): boolean {
  return phase === 'moving' && !paused;
}

/** 배속 → 한 걸음 주기 배율 (순수): 배속이 클수록 빨리 걷는다 */
export function walkSpeedVar(speed: number): string {
  return String(Math.max(1, speed));
}

export interface WalkScene {
  el: HTMLElement;
  /** 걷는 캐릭터 상자: 머리 위 말풍선 같은 것을 여기에 붙인다 (캐릭터를 따라다닌다) */
  walker: HTMLElement;
  /** 걷는 중/멈춤, 배속을 반영한다 */
  update(o: { walking: boolean; speed: number }): void;
}

/** 걷는 화면 장면: 먼 배경 · 가까운 배경 · 바닥 줄이 오른쪽으로 흐르고, 캐릭터(반측면, 왼쪽 향함)가 제자리에서 걷는다 */
export function walkScene(walkAnim: string | undefined, label: string, art: ArtUrls | null = null, loco: Locomotion = 'walk', bg: SceneBg | null = null): WalkScene {
  const scene = el('div', 'bha-walk');
  scene.setAttribute('role', 'img');
  scene.setAttribute('aria-label', `${label}을(를) 걷는 중`);
  const far = el('span', 'bha-walk__layer bha-walk__layer--far');
  const near = el('span', 'bha-walk__layer bha-walk__layer--near');
  const ground = el('span', 'bha-walk__layer bha-walk__layer--ground');
  const walker = el('span', `bha-walker ${walkAnimClass(walkAnim)}`);
  setLoco(walker, loco);
  const body = el('span', 'bha-walker__body');
  let anim: AnimPlayer | null = null;
  if (art?.src) {
    // 그림 한 장(왼쪽을 보는 그림 그대로 = 왼쪽으로 걷는다). 걸음 흔들림은 몸통 상자가 맡는다
    walker.classList.add('has-art');
    const img = el('img', 'bha-walker__img') as HTMLImageElement;
    img.src = art.src;
    img.alt = '';
    img.draggable = false;
    img.style.setProperty('--art-scale', String(art.fieldScale ?? art.scale)); // 필드 배율 (C.176, GDD 106장 3)
    img.style.setProperty('--art-dy', `${art.offsetY}%`);
    body.append(img);
    anim = bindAnim(walker, img, art);
    anim?.setLoop('idle');
  } else body.append(el('span', 'bha-walker__eye'), el('span', 'bha-walker__foot bha-walker__foot--back'), el('span', 'bha-walker__foot bha-walker__foot--front'));
  // 발밑·잔상 꾸밈 자리 (GDD 25-9): 입었을 때만 cosmetics.css 가 보인다
  walker.append(el('span', 'bha-walker__trail'), body, el('span', 'bha-walker__shadow'));
  // 사냥터 배경 그림이 있으면 그 층들이 임시 줄무늬 층을 대신한다 (GDD 34-1)
  if (bg) scene.classList.add('has-bg');
  scene.append(...(bg ? [sceneBgEl(bg, true)] : []), far, near, ground, walker);
  return {
    el: scene,
    walker,
    update: ({ walking, speed }) => {
      scene.classList.toggle('is-walking', walking);
      // 이동 애니가 있으면 걷는 동안 move, 아니면 idle(없으면 정지 그림 + 기존 걷기 연출). 배속만큼 빨리 돈다
      if (anim) {
        anim.setLoop(walking && anim.has('move') ? 'move' : 'idle');
        anim.setRate(Math.max(1, speed));
      }
      scene.style.setProperty('--walk-speed', walkSpeedVar(speed));
    },
  };
}

/** 걷는 화면 위 작은 상태 줄 라벨 (순수): 멈춤·전투·휴식·도착 */
export function walkState(phase: ExpeditionPhase, paused: boolean): { label: string; icon: string } {
  if (phase === 'battle') return { label: '전투 대기', icon: 'i-practice' };
  if (phase === 'rest') return { label: '휴식 중', icon: 'i-tile-rest' };
  if (phase === 'nest-choice' || phase === 'ended') return { label: '도착', icon: 'i-nest' };
  if (paused) return { label: '일시정지', icon: 'i-pause' };
  return { label: '걷는 중', icon: 'i-play' };
}

export function walkStateTag(phase: ExpeditionPhase, paused: boolean): HTMLElement {
  const st = walkState(phase, paused);
  const t = el('span', 'bha-walk__state');
  t.append(icon(st.icon), st.label);
  return t;
}
