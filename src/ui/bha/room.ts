// 메인 방 화면의 장면 부품 (GDD 16장, T-1): 방 배경·물건·캐릭터. 그림은 src/data/art 매니페스트의 키로 참조하고,
// 파일이 없으면 코드로 만든 자리표시 도형(CSS)이 나온다. 나중에 매니페스트에 파일만 적으면 같은 자리에 그림이 들어간다.
import { artUrls, charArt, type ArtUrls } from '../../data/art/manifest';
import type { RoomConfig, RoomProp } from '../../engine/faction';
import type { Locomotion } from '../../engine/locomotion';
import { bindAnim } from './animPlayer';
import { el, icon } from './dom';
import { LOCO_LIFT, setLoco } from './loco';

const BASE = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';

/** 물건 → 자리표시 아이콘(스프라이트). 그림이 들어오면 쓰이지 않는다 */
export const PROP_ICON: Record<RoomProp, string> = {
  door: 'i-loop', altar: 'i-target', book: 'i-shelf', chest: 'i-deck', dummy: 'i-practice', shop: 'i-rare',
};

/** 방 장면 틀. 배경 그림이 있으면 --room-art 로 깔린다 */
export function sceneBox(room: RoomConfig): HTMLElement {
  const box = el('div', `bha-room__scene bha-room--${room.shape}`);
  const { src } = artUrls(room.sceneArt, BASE);
  if (src) {
    box.classList.add('has-art');
    // 사용자 정의 속성 안의 url() 은 CSS 파일 기준으로 풀려(상대 경로 배포에서 assets/ 아래를 찾는다) 문서 기준 절대 주소로 바꿔 넣는다
    const abs = typeof document === 'undefined' ? src : new URL(src, document.baseURI).href;
    box.style.setProperty('--room-art', `url("${abs}")`);
  }
  // 자리표시 배경: 벽·바닥 면 (그림이 있으면 CSS 가 숨긴다)
  box.append(el('span', 'bha-room__wall'), el('span', 'bha-room__floor'));
  return box;
}

export interface PropOpts {
  prop: RoomProp;
  name: string;
  x: number;
  y: number;
  /** 뒷줄 축소 배율 (기본 1) */
  scale?: number;
  art: boolean;
  /** 수치·상태 표시 (덱 비어 있음 등) */
  alert?: boolean;
}

/** 방 안 물건 = 선택 항목(button). 이름표는 항상 보인다 */
export function propButton(o: PropOpts): HTMLButtonElement {
  const b = el('button', `bha-art bha-prop bha-prop--${o.prop}${o.alert ? ' is-alert' : ''}`);
  b.type = 'button';
  b.dataset.prop = o.prop;
  b.style.left = `${o.x}%`;
  b.style.top = `${o.y}%`;
  if (o.scale !== undefined && o.scale !== 1) b.style.setProperty('--prop-s', String(o.scale));
  b.setAttribute('aria-label', o.name);
  const shape = el('span', 'bha-prop__shape bha-art-img');
  const { src } = artUrls(`prop.${o.prop}`, BASE);
  if (src) {
    const img = el('img', 'bha-prop__img') as HTMLImageElement;
    img.src = src;
    img.alt = '';
    shape.append(img);
    shape.classList.add('has-art');
  } else shape.append(icon(PROP_ICON[o.prop]));
  b.append(shape, el('span', 'bha-prop__tag', o.name));
  return b;
}

/** 종족·단계에 맞는 캐릭터 그림 (GDD 17-6) */
export function roomCharArt(room: RoomConfig, factionId: string, tierIndex: number, skinId?: string | null): ArtUrls {
  return charArt(factionId, tierIndex, room.characterArt, BASE, undefined, undefined, skinId);
}

/** 캐릭터: 새 규칙의 그림 한 장(왼쪽을 보는 그림, 가만히) 또는 기존 제자리 2프레임 숨쉬기. 그림이 없으면 둥근 몸 + 눈 두 개 도형 */
export function characterButton(art: ArtUrls, label: string, loco: Locomotion = 'walk'): HTMLButtonElement {
  const b = el('button', 'bha-art bha-char');
  b.type = 'button';
  b.setAttribute('aria-label', label);
  setLoco(b, loco);
  const body = el('span', 'bha-char__body bha-art-img');
  const { frames, src } = art;
  if (src) {
    const img = el('img', 'bha-char__frame bha-char__frame--solo') as HTMLImageElement;
    img.src = src;
    img.alt = '';
    img.draggable = false;
    img.style.setProperty('--art-scale', String(art.scale));
    img.style.setProperty('--art-dy', `${art.offsetY}%`);
    body.append(img);
    body.classList.add('has-art');
    bindAnim(b, img, art)?.setLoop('idle'); // 프레임 애니가 있는 동작만 (GDD 26장) — idle 이 없으면 정지 그림
  } else if (frames) {
    frames.forEach((f, i) => {
      const img = el('img', `bha-char__frame bha-char__frame--${i + 1}`) as HTMLImageElement;
      img.src = f;
      img.alt = '';
      body.append(img);
    });
    body.classList.add('has-art');
  } else {
    body.append(el('span', 'bha-char__eye'), el('span', 'bha-char__eye'));
  }
  // 몸은 lift 상자 안: 부유·날기는 이 상자가 떠올라 움직이고, 그림자는 땅에 남는다
  const lift = el('span', 'bha-char__lift');
  lift.append(body);
  b.append(lift, el('span', 'bha-char__shadow'));
  return b;
}

/** 방 캐릭터 그림의 윗변 높이: 캐릭터 상자 중심에서 위로 몇 px 인지(음수). 머리 위 상태 칩이 이 위에 놓인다. room.css 의 .bha-char 치수와 맞출 것 */
export function charTopOffset(art: ArtUrls, loco: Locomotion = 'walk'): number {
  const PAD = 8, SHADOW = 10; // .bha-char 안쪽 여백, 그림자 줄(높이 6 + 위 여백 4)
  const hasArt = !!(art.src || art.frames);
  const bodyH = hasArt ? 90 : 56;
  const boxTop = -(PAD * 2 + bodyH + SHADOW) / 2 + PAD; // 몸 상자 윗변
  const lift = bodyH * LOCO_LIFT[loco]; // 떠 있는 만큼 머리가 위로 (움직임 중간 높이)
  if (!art.src) return boxTop - lift;
  const drawn = 84; // 정사각 그림이 몸 상자(84×90) 안 아래쪽에 맞춰진 크기
  const pivot = bodyH * 0.92; // transform-origin 세로
  const top = pivot + (bodyH - drawn - pivot) * art.scale + (art.offsetY / 100) * bodyH;
  return boxTop + Math.min(top, bodyH) - lift;
}
