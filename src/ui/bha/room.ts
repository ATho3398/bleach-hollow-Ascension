// 메인 방 화면의 장면 부품 (GDD 16장, T-1): 방 배경·물건·캐릭터. 그림은 src/data/art 매니페스트의 키로 참조하고,
// 파일이 없으면 코드로 만든 자리표시 도형(CSS)이 나온다. 나중에 매니페스트에 파일만 적으면 같은 자리에 그림이 들어간다.
import { artUrls } from '../../data/art/manifest';
import type { RoomConfig, RoomProp } from '../../engine/faction';
import { el, icon } from './dom';

const BASE = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';

/** 물건 → 자리표시 아이콘(스프라이트). 그림이 들어오면 쓰이지 않는다 */
export const PROP_ICON: Record<RoomProp, string> = {
  door: 'i-loop', altar: 'i-evolve', book: 'i-dex', chest: 'i-deck', window: 'i-title', care: 'i-care-feed',
};

/** 방 장면 틀. 배경 그림이 있으면 --room-art 로 깔린다 */
export function sceneBox(room: RoomConfig): HTMLElement {
  const box = el('div', `bha-room__scene bha-room--${room.shape}`);
  const { src } = artUrls(room.sceneArt, BASE);
  if (src) {
    box.classList.add('has-art');
    box.style.setProperty('--room-art', `url("${src}")`);
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
  art: boolean;
  /** 수치·상태 표시 (덱 비어 있음 등) */
  alert?: boolean;
}

/** 방 안 물건 = 선택 항목(button). 이름표는 항상 보인다 */
export function propButton(o: PropOpts): HTMLButtonElement {
  const b = el('button', `bha-prop bha-prop--${o.prop}${o.alert ? ' is-alert' : ''}`);
  b.type = 'button';
  b.dataset.prop = o.prop;
  b.style.left = `${o.x}%`;
  b.style.top = `${o.y}%`;
  b.setAttribute('aria-label', o.name);
  const shape = el('span', 'bha-prop__shape');
  const { src } = artUrls(`prop.${o.prop}`, BASE);
  if (src) {
    const img = el('img', 'bha-prop__img') as HTMLImageElement;
    img.src = src;
    img.alt = '';
    shape.append(img);
  } else shape.append(icon(PROP_ICON[o.prop]));
  b.append(shape, el('span', 'bha-prop__tag', o.name));
  return b;
}

/** 캐릭터: 제자리 2프레임 숨쉬기. 그림이 없으면 둥근 몸 + 눈 두 개 도형 */
export function characterButton(room: RoomConfig, label: string): HTMLButtonElement {
  const b = el('button', 'bha-char');
  b.type = 'button';
  b.setAttribute('aria-label', label);
  const body = el('span', 'bha-char__body');
  const { frames } = artUrls(room.characterArt, BASE);
  if (frames) {
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
  b.append(body, el('span', 'bha-char__shadow'));
  return b;
}
