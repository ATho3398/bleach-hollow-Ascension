// 메인 방 화면의 장면 부품 (GDD 16장, T-1): 방 배경·물건·캐릭터. 그림은 src/data/art 매니페스트의 키로 참조하고,
// 파일이 없으면 코드로 만든 자리표시 도형(CSS)이 나온다. 나중에 매니페스트에 파일만 적으면 같은 자리에 그림이 들어간다.
import { artUrls, charArt, type ArtUrls } from '../../data/art/manifest';
import type { RoomConfig, RoomFloorConfig, RoomProp } from '../../engine/faction';
import { bindAnim } from './animPlayer';
import { el, icon } from './dom';
import { footOnFloor, REF_LIFT, REF_SCENE } from './roomFloor';

const BASE = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';

/** 물건 → 자리표시 아이콘(스프라이트). 그림이 들어오면 쓰이지 않는다 */
export const PROP_ICON: Record<RoomProp, string> = {
  door: 'i-loop', altar: 'i-practice', book: 'i-shelf', chest: 'i-deck', shop: 'i-rare', spa: 'i-tile-rest',
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
  /** 크기 배율 (기본 1) */
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
  // 발 기준점 (x, y = 장면 %): 첫 그림용 값. 실제 위치는 layoutOnFloor 가 바닥 안으로 끌어 다시 놓는다
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

const CHAR_BODY_H = 140; // room.css 의 .bha-char__body.has-art 높이와 맞출 것
const FOOT_GAP = 0.07; // 발바닥 = 그림 아래에서 약 8% 위(art-guide 2장). 그림은 몸 상자(130×140) 안에 정사각으로 맞춰져 높이 130 기준 7.4% → 상자 대비 약 7%

/** 캐릭터: 새 규칙의 그림 한 장(왼쪽을 보는 그림, 가만히) 또는 기존 제자리 2프레임 숨쉬기. 그림이 없으면 둥근 몸 + 눈 두 개 도형 */
export function characterButton(art: ArtUrls, label: string): HTMLButtonElement {
  const b = el('button', 'bha-art bha-char');
  b.type = 'button';
  b.setAttribute('aria-label', label);
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
  // 몸은 lift 상자 안(그림자보다 위 층). 이동 방식은 걷기 하나라 몸은 늘 땅에 붙고 발 = 그림자 (GDD 125장)
  const lift = el('span', 'bha-char__lift');
  lift.append(body);
  const shadow = el('span', 'bha-char__shadow');
  // 그림 캐릭터의 발바닥은 몸 상자 아래에서 8% 위(art-guide 규격, offsetY 만큼 더 위/아래) — 그림자 중심을 그 높이에 둔다(발이 떠 보이지 않게)
  if (body.classList.contains('has-art')) shadow.style.marginTop = `${-(CHAR_BODY_H * (FOOT_GAP - art.offsetY / 100) + 3.5)}px`;
  // 누운 모습(빈사·사망) 자리: 몸 길이(발 → 머리)·두께 절반 (C.200). room.css .is-collapsed 가 읽는다
  if (src) void fitLying(b, src, art);
  b.append(lift, shadow);
  return b;
}

/** 그림의 불투명 픽셀 범위 (원본 px, right·bottom 은 포함 끝 + 1) */
export interface OpaqueBox { left: number; top: number; right: number; bottom: number }

/** 누운 모습 자리(px, C.200): 몸 상자(130×140)를 발(92.6%)을 축으로 시계 방향 90° 눕힐 때,
 *  dx = 몸 가운데를 그림자(발) 위로 옮길 가로 이동, up = 몸 아래 끝을 바닥(발 높이)에 올릴 위 이동.
 *  그림 = 상자 안 contain·아래 맞춤, 확대 기준점 (50%, 92%), offsetY = 상자 높이 % (room.css .bha-char__frame--solo 와 맞출 것) */
export function lieBox(box: OpaqueBox, natW: number, natH: number, art: Pick<ArtUrls, 'scale' | 'offsetY'>): { dx: number; up: number } {
  const W = 130, H = CHAR_BODY_H;
  const k = Math.min(W / natW, H / natH);
  const ox = (W - natW * k) / 2, oy = H - natH * k;
  const px = W / 2, py = H * 0.92, dy = (art.offsetY / 100) * H;
  const toX = (x: number) => px + (ox + x * k - px) * art.scale;
  const toY = (y: number) => py + (oy + y * k - py) * art.scale + dy;
  const rx = W / 2, ry = H * 0.926; // 눕히는 축 = 발
  // 시계 방향 90°: (x, y) → 축 기준 (−(y − ry), x − rx)
  const below = toX(box.right) - rx; // 눕힌 뒤 발 줄 아래로 내려가는 몸 두께
  const mid = -((toY(box.top) + toY(box.bottom)) / 2 - ry); // 눕힌 뒤 몸 가로 가운데 (축 기준)
  return { dx: Math.round(-mid), up: Math.round(Math.max(0, below) + 2) }; // +2 = 발밑 그림자와 살짝 띄움
}

/** 그림을 읽어 불투명 범위를 재고 누운 모습 자리를 캐릭터 버튼에 붙인다 (못 읽으면 기존 회전 그대로) */
async function fitLying(owner: HTMLElement, src: string, art: ArtUrls): Promise<void> {
  try {
    const im = new Image();
    im.src = src;
    await im.decode();
    const c = document.createElement('canvas');
    c.width = im.naturalWidth;
    c.height = im.naturalHeight;
    const g = c.getContext('2d', { willReadFrequently: true });
    if (!g || !c.width || !c.height) return;
    g.drawImage(im, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const box: OpaqueBox = { left: c.width, top: c.height, right: 0, bottom: 0 };
    for (let y = 0; y < c.height; y++)
      for (let x = 0; x < c.width; x++)
        if (d[(y * c.width + x) * 4 + 3]! > 40) {
          box.left = Math.min(box.left, x); box.right = Math.max(box.right, x + 1);
          box.top = Math.min(box.top, y); box.bottom = Math.max(box.bottom, y + 1);
        }
    if (box.right <= box.left) return;
    const lie = lieBox(box, c.width, c.height, art);
    owner.style.setProperty('--lie-dx', `${lie.dx}px`);
    owner.style.setProperty('--lie-up', `${lie.up}px`);
  } catch {
    /* 테스트 환경·읽기 실패: 누운 자리 보정 없음 */
  }
}

/** 방 발-그림자 차이(px, 양수 = 발이 그림자보다 아래) — 그림의 발 높이(footGap = 그림 아래 끝에서 발바닥까지, 그림 높이 대비)·배율·offsetY 로 (C.194, GDD 120장 3 점검용).
 *  그림 = 몸 상자(130×140) 아래쪽에 정사각 130, 확대 기준점 = 상자 92% 높이. 그림자 중심 = 상자 아래에서 CHAR_BODY_H × (FOOT_GAP − offsetY) 위. room.css 와 맞출 것 */
export function roomFootShadowPx(footGap: number, scale: number, offsetY = 0): number {
  const drawn = 130;
  const pivotUp = CHAR_BODY_H * (1 - 0.92); // 상자 아래에서 확대 기준점까지
  const footUp = pivotUp + (drawn * footGap - pivotUp) * scale - (offsetY / 100) * CHAR_BODY_H;
  const shadowUp = CHAR_BODY_H * (FOOT_GAP - offsetY / 100);
  return shadowUp - footUp;
}

/** 말풍선 자리 (C.194, GDD 120장 2): 머리 위(top = 아래 끝, translate −100%)에서 윗변이 방 위 끝(0)을 넘으면 옆 — 캐릭터가 오른쪽 절반이면 왼쪽, 아니면 오른쪽 */
export type BubbleSpot = 'above' | 'right' | 'left';
export function bubbleSpot(bottomY: number, bubbleH: number, charCenterX: number, sceneW: number): BubbleSpot {
  if (bottomY - bubbleH >= 0) return 'above';
  return charCenterX > sceneW / 2 ? 'left' : 'right';
}

/** 방 캐릭터 그림의 윗변 높이: 캐릭터 상자 중심에서 위로 몇 px 인지(음수). 머리 위 상태 칩이 이 위에 놓인다. room.css 의 .bha-char 치수와 맞출 것 */
export function charTopOffset(art: ArtUrls): number {
  const PAD = 8, SHADOW = 10; // .bha-char 안쪽 여백, 그림자 줄(높이 6 + 위 여백 4)
  const hasArt = !!(art.src || art.frames);
  const bodyH = hasArt ? CHAR_BODY_H : 75;
  const boxTop = -(PAD * 2 + bodyH + SHADOW) / 2 + PAD; // 몸 상자 윗변
  if (!art.src) return boxTop;
  const drawn = 130; // 정사각 그림이 몸 상자(130×140) 안 아래쪽에 맞춰진 크기
  const pivot = bodyH * 0.92; // transform-origin 세로
  const top = pivot + (bodyH - drawn + drawn * (art.headTop ?? 0) - pivot) * art.scale + (art.offsetY / 100) * bodyH;
  // 종이인형(headTop)은 머리 위가 비어 있어 머리에 맞추면 칩이 캐릭터 버튼 상자 안으로 내려와 겹친다 — 상자 윗변보다 아래로는 안 내린다 (C.190)
  return boxTop + Math.min(top, art.headTop ? 0 : bodyH);
}

export interface FloorEntry {
  el: HTMLElement;
  /** 발 기준점 (장면 %) */
  foot: { x: number; y: number };
  kind: 'prop' | 'char';
}

/** 방 안 모든 것을 바닥 안에 놓는다 (GDD 95장 A1): 발 기준점 → 바닥 다각형 안으로 끌어 놓고, 그림 높이·이름표를 잰 만큼 위치를 맞춘다.
 *  새 물건·캐릭터는 이 함수에 항목만 더하면 늘 바닥 안에 놓인다. 장면 크기가 바뀌면 다시 놓는다 */
export function layoutOnFloor(scene: HTMLElement, floor: RoomFloorConfig, entries: readonly FloorEntry[]): void {
  const sw = scene.clientWidth;
  const sh = scene.clientHeight;
  const size = sw > 0 && sh > 0 ? { w: sw, h: sh } : REF_SCENE;
  // C.182 UI 검수: 위에 알림 띠(빈사·쇠약 등)가 붙어 장면이 기준보다 낮아지면 물건 그림도 같은 비율로 줄인다 — 발 높이만 줄고 그림 크기는 그대로라 책장·상점이 겹쳤다
  scene.style.setProperty('--room-fit', String(Math.min(1, Math.max(0.6, size.h / REF_SCENE.h))));
  for (const e of entries) {
    const measured = e.el.offsetHeight > 0;
    if (e.kind === 'prop') {
      const shape = e.el.querySelector<HTMLElement>('.bha-prop__shape');
      const lift = measured && shape ? e.el.offsetHeight - (shape.offsetTop + shape.offsetHeight) : REF_LIFT; // 그림 아래 → 이름표 아래 끝
      const p = footOnFloor(e.foot, floor, size, { below: lift, padX: measured ? e.el.offsetWidth / 2 : 0 });
      e.el.style.left = `${p.x}%`;
      e.el.style.top = `${(p.y / 100) * size.h + lift}px`;
    } else {
      const shadow = e.el.querySelector<HTMLElement>('.bha-char__shadow');
      const fromCenter = measured && shadow ? shadow.offsetTop + shadow.offsetHeight / 2 - e.el.offsetHeight / 2 : 62; // 상자 가운데 → 발
      const p = footOnFloor(e.foot, floor, size, { below: e.el.offsetHeight / 2 - fromCenter, padX: measured ? e.el.offsetWidth / 2 : 0 });
      const top = (p.y / 100) * size.h - fromCenter;
      e.el.style.left = `${p.x}%`;
      e.el.style.top = `${top}px`;
      scene.style.setProperty('--char-y', `${top}px`);
      scene.style.setProperty('--foot-y', `${top + fromCenter}px`); // 발 = 그림자 가운데 (발밑 체력 막대, GDD 123장 3)
      scene.style.setProperty('--char-x', `${p.x}%`);
    }
  }
}
