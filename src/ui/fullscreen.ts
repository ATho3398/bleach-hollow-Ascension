// 전체 화면 (GDD 46장): 모바일 주소창 가림 대책. Fullscreen API(webkit 접두 포함)로 게임 전체를 전체 화면에 넣고 뺀다.
// 지원하지 않는 브라우저(아이폰 사파리 등)에서는 설정 줄을 숨긴다. "시작할 때 전체 화면" 값은 기기 localStorage(키 bha-fullscreen-start), 세이브 무관, 기본 켬.
// 홈 화면 앱으로 켜면(앱 모드, GDD 156장) manifest display fullscreen 이 이미 꽉 채우므로 API 를 절대 부르지 않는다 — 부르면 크롬 '전체 화면 종료' 안내가 뜬다.
import type { SettingsStorage } from './fxSettings';
import { isAppMode, lockLandscape } from './bha/orientation';

export { isAppMode };

export const FULLSCREEN_START_KEY = 'bha-fullscreen-start';
export const FULLSCREEN_EVENT = 'bha-fullscreen-change';

interface FsDoc {
  fullscreenEnabled?: boolean;
  webkitFullscreenEnabled?: boolean;
  fullscreenElement?: Element | null;
  webkitFullscreenElement?: Element | null;
  exitFullscreen?: () => Promise<void>;
  webkitExitFullscreen?: () => Promise<void> | void;
}
interface FsElement {
  requestFullscreen?: (opts?: FullscreenOptions) => Promise<void>;
  webkitRequestFullscreen?: () => Promise<void> | void;
}

const docOf = (): FsDoc => document as unknown as FsDoc;

/** 이 브라우저가 전체 화면을 지원하는가 (거짓이면 버튼·설정 줄을 숨긴다) */
export function fullscreenSupported(): boolean {
  if (typeof document === 'undefined') return false;
  const d = docOf();
  const el = document.documentElement as unknown as FsElement;
  const enabled = d.fullscreenEnabled ?? d.webkitFullscreenEnabled ?? false;
  return !!enabled && (typeof el.requestFullscreen === 'function' || typeof el.webkitRequestFullscreen === 'function');
}

export function isFullscreen(): boolean {
  const d = docOf();
  return !!(d.fullscreenElement ?? d.webkitFullscreenElement);
}

/** 전체 화면 진입. 사용자 터치 안에서 불러야 한다. 거부·미지원이면 조용히 false */
export async function enterFullscreen(): Promise<boolean> {
  if (isAppMode() || !fullscreenSupported()) return false;
  if (isFullscreen()) return true;
  const el = document.documentElement as unknown as FsElement;
  try {
    if (el.requestFullscreen) await el.requestFullscreen();
    else await el.webkitRequestFullscreen?.();
    return true;
  } catch {
    return false;
  }
}

export async function exitFullscreen(): Promise<void> {
  if (!isFullscreen()) return;
  const d = docOf();
  try {
    if (d.exitFullscreen) await d.exitFullscreen();
    else await d.webkitExitFullscreen?.();
  } catch {
    /* 이미 풀렸으면 무시 */
  }
}

export async function toggleFullscreen(): Promise<boolean> {
  if (isFullscreen()) {
    await exitFullscreen();
    return false;
  }
  return enterFullscreen();
}

export function loadFullscreenStart(storage?: SettingsStorage | null): boolean {
  try {
    return storage?.getItem(FULLSCREEN_START_KEY) !== '0';
  } catch {
    return true;
  }
}

export function saveFullscreenStart(storage: SettingsStorage | null | undefined, on: boolean): boolean {
  try {
    storage?.setItem(FULLSCREEN_START_KEY, on ? '1' : '0');
  } catch {
    /* 저장소를 못 쓰면 이번 실행에서만 적용 */
  }
  return on;
}

/** 손가락 기기를 세로로 들고 있는가 */
function portraitTouch(): boolean {
  const mq = (q: string) => (typeof matchMedia === 'function' ? matchMedia(q).matches : false);
  const portrait = typeof screen !== 'undefined' && screen.orientation ? screen.orientation.type.startsWith('portrait') : mq('(orientation: portrait)');
  return portrait && mq('(pointer: coarse)');
}

/**
 * 시작 화면 버튼을 누를 때 부른다(손가락 누름 안 = 브라우저 허락 조건).
 * "시작할 때 전체 화면"이 켜져 있으면 전체 화면 + 가로 고정, 꺼져 있어도 세로로 든 폰이면 가로 고정만 시도 (GDD 117장 1, C.190 — 안드로이드 크롬).
 * 가로 고정은 전체 화면·설치 앱에서만 되고, 전체 화면을 나가면 브라우저가 풀어 폰 원래 방향으로 돌아간다. 안 되는 환경(아이폰)은 지금 그대로(CSS 90° 돌려 그리기)
 * 앱 모드면 아무것도 안 한다 — 전체 화면·가로는 manifest(display fullscreen·orientation landscape)가 맡는다 (GDD 156장 2)
 */
export function enterFullscreenOnStart(storage?: SettingsStorage | null, deps: { lock?: () => Promise<unknown>; portrait?: () => boolean } = {}): void {
  const lock = deps.lock ?? (() => lockLandscape());
  const portrait = deps.portrait ?? portraitTouch;
  if (isAppMode()) return;
  if (fullscreenSupported() && loadFullscreenStart(storage)) {
    void enterFullscreen().then((ok) => { if (ok) return lock(); }).catch(() => {});
    return;
  }
  if (portrait()) void lock().catch(() => {});
}

/** fullscreenchange(접두 포함)를 듣는다. 들어가고 나올 때 기기 틀·세로 회전 출력·다마고치 모드가 화면 크기를 다시 계산하도록 resize 도 알린다. 해제 함수 반환 */
export function watchFullscreen(): () => void {
  const onChange = () => {
    window.dispatchEvent(new CustomEvent(FULLSCREEN_EVENT));
    // 전체 화면 전환 직후엔 브라우저가 옛 크기를 잠깐 돌려줄 수 있어 한 번 더 알린다
    window.dispatchEvent(new Event('resize'));
    window.setTimeout(() => window.dispatchEvent(new Event('resize')), 300);
  };
  document.addEventListener('fullscreenchange', onChange);
  document.addEventListener('webkitfullscreenchange', onChange);
  return () => {
    document.removeEventListener('fullscreenchange', onChange);
    document.removeEventListener('webkitfullscreenchange', onChange);
  };
}
