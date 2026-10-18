// PC 화면 크기 고정과 2배 보기 (GDD 17-5, R-5, C.36): 순수 계산 + 선택 저장.
// PC(마우스·넓은 창)에서는 기기 틀을 기준 크기 844×390 으로 고정하고 창 가운데에 둔다. 배율은 CSS 변수(--bha-scale)로 키워 글자·터치 영역이 같이 커진다.
// 선택(1배/2배)은 localStorage 별도 키 bha-view-scale 에 저장하고 세이브와 무관하다. 터치 폰·태블릿은 이 모듈을 쓰지 않는다(기존 16-6 동작).
import type { SettingsStorage } from './fxSettings';

/** 기준 크기 (가로 폰 화면, 약 19.5:9) */
export const BASE_W = 844;
export const BASE_H = 390;
/** 선택할 수 있는 배율 */
export const VIEW_SCALES = [1, 2] as const;
export type ViewScalePref = (typeof VIEW_SCALES)[number];
export const VIEW_SCALE_KEY = 'bha-view-scale';
export const DEFAULT_VIEW_SCALE: ViewScalePref = 1;

export function parseViewScale(text: string | null | undefined): ViewScalePref {
  const n = Number(text);
  return n === 2 ? 2 : DEFAULT_VIEW_SCALE;
}

export function loadViewScale(storage?: SettingsStorage | null): ViewScalePref {
  try {
    return parseViewScale(storage?.getItem(VIEW_SCALE_KEY));
  } catch {
    return DEFAULT_VIEW_SCALE;
  }
}

export function saveViewScale(storage: SettingsStorage | null | undefined, v: ViewScalePref): ViewScalePref {
  try {
    storage?.setItem(VIEW_SCALE_KEY, String(v));
  } catch {
    /* 저장소를 못 쓰면 이번 실행에서만 적용 */
  }
  return v;
}

/** PC 모드: 마우스처럼 hover 되는 정밀 포인터 + 창이 기준 크기 이상으로 넓다. 터치 폰·태블릿은 false */
export function isPcMode(hover: boolean, finePointer: boolean, vw: number, vh: number): boolean {
  return hover && finePointer && vw >= BASE_W && vh >= BASE_H;
}

export interface ViewScale {
  /** 실제로 쓰는 배율 (1 이상, 소수 가능) */
  scale: number;
  /** 고른 배율보다 작게 표시 중인가 (창이 작아서) */
  shrunk: boolean;
}

/** 창이 담을 수 있는 최대 배율 (소수 둘째 자리까지 내림) */
export function maxFitScale(vw: number, vh: number): number {
  return Math.floor(Math.min(vw / BASE_W, vh / BASE_H) * 100) / 100;
}

/** 고른 배율을 창에 맞춘다: 못 담으면 담을 수 있는 최대 배율로 자동 축소 */
export function resolveViewScale(pref: ViewScalePref, vw: number, vh: number): ViewScale {
  const fit = maxFitScale(vw, vh);
  if (fit >= pref) return { scale: pref, shrunk: false };
  return { scale: Math.max(1, fit), shrunk: true };
}

/** 설정 화면 문구: 줄었을 때만 */
export function shrunkNote(v: ViewScale, pref: ViewScalePref): string | null {
  return v.shrunk ? `창이 작아 ${Number(v.scale.toFixed(2))}배로 표시 중 (고른 값 ${pref}배)` : null;
}

/** +/- 단축키 → 바꿀 배율 (해당 없으면 null). 입력칸에서 눌렀거나 조합키면 무시한다 */
export function shortcutScale(key: string, mods: { ctrl?: boolean; meta?: boolean; alt?: boolean }, typing: boolean): ViewScalePref | null {
  if (typing || mods.ctrl || mods.meta || mods.alt) return null;
  if (key === '+' || key === '=') return 2;
  if (key === '-' || key === '_') return 1;
  return null;
}

/** 현재 화면 상태(기기가 갱신, 설정 화면이 읽는다) */
export interface ViewState {
  pc: boolean;
  pref: ViewScalePref;
  view: ViewScale;
}
let state: ViewState = { pc: false, pref: DEFAULT_VIEW_SCALE, view: { scale: 1, shrunk: false } };
export const currentViewState = (): ViewState => state;
export const setViewState = (s: ViewState): void => {
  state = s;
};
/** 설정이 바뀌었다고 기기에 알리는 창 이벤트 이름 */
export const VIEW_SCALE_EVENT = 'bha-view-scale-change';
