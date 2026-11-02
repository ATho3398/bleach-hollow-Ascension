// 걷는 앞쪽에 서 있는 것 (GDD 128장 2·3, C.202): 조우한 적·휴식 칸 장소가 진행 방향(왼쪽)에서 다가와 캐릭터 앞에 선다.
// 적 = 그림이 있으면 그림, 없으면 실루엣(강적·보스 포함). 장소 = 그림 키 place.<타일 id>.<종족 id>(없으면 임시 그림).
// 움직임은 CSS(encounter.css)가 맡고, 여기서는 상자만 만든다. 도착 = 다가오기 애니메이션 끝(멈춤 중에는 같이 멈춘다).
import { artUrls, type ArtUrls } from '../../data/art/manifest';
import { el, icon } from './dom';
import { foeArtOf, foeEl } from './battle';
import { elementColor } from './element';

const ART_BASE = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';

/** 다가오는 데 걸리는 시간 (1배 기준 ms, 배속만큼 짧아진다). 조우 → 전투 진입(ENCOUNTER_DELAY_MS)은 이보다 조금 길다 */
export const AHEAD_APPROACH_MS = 1300;
/** 휴식이 끝나고 장소가 뒤로 흘러가 사라지는 시간 (ms) */
export const AHEAD_LEAVE_MS = 1400;

export type AheadKind = 'foe' | 'elite' | 'boss' | 'rest';

/** 조우 종류 (순수): 보스 > 강적 > 일반 */
export function foeAheadKind(p: { boss?: string | null; elite: boolean }): AheadKind {
  return p.boss ? 'boss' : p.elite ? 'elite' : 'foe';
}

/** 휴식 칸 장소 그림 키 (순수): 종족 키를 먼저, 없으면 타일 공통 키 */
export function placeArtKeys(tileId: string, factionId: string): string[] {
  return [`place.${tileId}.${factionId}`, `place.${tileId}`];
}

/** 장소 그림 (파일이 있을 때만) */
export function placeArtOf(tileId: string, factionId: string): ArtUrls | null {
  for (const k of placeArtKeys(tileId, factionId)) {
    const a = artUrls(k, ART_BASE);
    if (a.src) return a;
  }
  return null;
}

export interface WalkAhead {
  /** 장면에 붙일 길(장면 전체 크기, 클릭 안 받음) */
  el: HTMLElement;
  /** 다가오는 적을 세운다. 도착하면 onArrive */
  foe(o: { enemyId: string; element: string; kind: AheadKind; label: string }, speed: number, onArrive?: () => void): void;
  /** 다가오는 휴식 장소를 세운다. 도착하면 onArrive */
  place(o: { tileId: string; factionId: string; label: string; spring?: boolean }, speed: number, onArrive?: () => void): void;
  /** 서 있는 것을 뒤로 흘려보낸다(휴식 끝) */
  leave(): void;
  /** 바로 지운다 */
  clear(): void;
  /** 지금 서 있는 것 (없으면 null) */
  readonly kind: AheadKind | null;
}

const reduced = (): boolean => {
  try {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  } catch {
    return false;
  }
};

export function walkAhead(): WalkAhead {
  const lane = el('div', 'bha-walk__ahead');
  lane.setAttribute('aria-hidden', 'true');
  let cur: HTMLElement | null = null;
  let kind: AheadKind | null = null;

  function mount(item: HTMLElement, k: AheadKind, speed: number, onArrive?: () => void): void {
    lane.replaceChildren(item);
    cur = item;
    kind = k;
    item.style.setProperty('--ahead-ms', `${Math.round(AHEAD_APPROACH_MS / Math.max(1, speed))}ms`);
    let done = false;
    const arrive = () => {
      if (done || cur !== item) return;
      done = true;
      item.classList.add('is-arrived');
      onArrive?.();
    };
    item.addEventListener('animationend', (e) => {
      if (e.target === item && e.animationName === 'bha-ahead-come') arrive();
    });
    if (reduced()) arrive();
  }

  return {
    el: lane,
    get kind() {
      return kind;
    },
    foe(o, speed, onArrive) {
      const item = el('div', `bha-ahead bha-ahead--${o.kind}`);
      item.dataset.ahead = o.kind;
      const art = foeArtOf(o.enemyId);
      const fig = foeEl(o.kind === 'foe' ? 'foe-a' : 'foe-b', elementColor(o.element), art);
      fig.classList.add('bha-ahead__fig');
      item.append(fig);
      if (o.kind !== 'foe') item.append(el('span', 'bha-ahead__tag', o.label));
      mount(item, o.kind, speed, onArrive);
    },
    place(o, speed, onArrive) {
      const item = el('div', `bha-ahead bha-ahead--rest${o.spring ? ' is-spring' : ''}`);
      item.dataset.ahead = 'rest';
      const art = placeArtOf(o.tileId, o.factionId);
      const fig = el('div', 'bha-ahead__place');
      if (art?.src) {
        const img = el('img', 'bha-ahead__img') as HTMLImageElement;
        img.src = art.src;
        img.alt = '';
        img.draggable = false;
        fig.append(img);
        fig.classList.add('has-art');
      } else {
        // 임시 그림: 빛나는 웅덩이 + 휴식 아이콘 (사용자 그림이 오면 그림 키로 바뀐다)
        const pool = el('span', 'bha-ahead__pool');
        const mark = el('span', 'bha-ahead__mark');
        mark.append(icon('i-tile-rest'));
        fig.append(el('span', 'bha-ahead__glow'), pool, mark);
      }
      item.append(fig, el('span', 'bha-ahead__tag', o.label));
      mount(item, 'rest', speed, onArrive);
    },
    leave() {
      const item = cur;
      if (!item) return;
      cur = null;
      kind = null;
      if (reduced()) return item.remove();
      item.classList.add('is-leaving');
      item.addEventListener('animationend', (e) => {
        if (e.animationName === 'bha-ahead-go') item.remove();
      });
      window.setTimeout(() => item.remove(), AHEAD_LEAVE_MS + 600);
    },
    clear() {
      lane.replaceChildren();
      cur = null;
      kind = null;
    },
  };
}
