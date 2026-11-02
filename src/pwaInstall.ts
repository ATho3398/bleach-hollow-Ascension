// 앱 설치 안내 (GDD 68장, C.121): 브라우저의 작은 설치 띠(beforeinstallprompt)를 막고 잡아 둔 뒤, 게임이 큰 안내창에서 [설치]로 그 설치 창을 연다.
// 여기에는 DOM 이 없는 판단(플랫폼·모드·몇 번 보였나)과 이벤트 잡기만 둔다. 안내창 화면은 ui/installView.ts.

export type Platform = 'ios' | 'samsung' | 'android' | 'other';
/** prompt = 잡아 둔 설치 창을 바로 열 수 있다 · wait = 안드로이드인데 이벤트가 아직 없다(잠시 기다렸다 그림 안내로) · guide-android / guide-ios = 그림 안내만 · none = 안내할 것 없음 */
export type InstallMode = 'prompt' | 'wait' | 'guide-android' | 'guide-ios' | 'none';

/** 기준 기기 = 갤럭시(안드로이드 크롬·삼성 인터넷). 아이폰은 부가 */
export function detectPlatform(ua: string): Platform {
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/SamsungBrowser/i.test(ua)) return 'samsung';
  if (/Android/i.test(ua)) return 'android';
  return 'other';
}

/** 지금 어떤 안내를 할 수 있나. 이벤트가 있으면 어느 기기든 prompt */
export function installMode(platform: Platform, hasEvent: boolean): InstallMode {
  if (hasEvent) return 'prompt';
  if (platform === 'ios') return 'guide-ios';
  if (platform === 'samsung' || platform === 'android') return 'wait';
  return 'none';
}

/** 설치 이벤트를 기다리는 시간. 이 안에 안 오면(삼성 인터넷 등) 그림 안내로 바꾼다 */
export const INSTALL_WAIT_MS = 3000;
/** [나중에] 를 이만큼 누르면 더는 저절로 안 띄운다(설정의 [앱 설치]만) — 처음 열 때 + 다음 실행 한 번 더 */
export const MAX_LATER = 2;

export interface InstallPrefs {
  /** [나중에] 를 누른 횟수 */
  later: number;
  /** 설치했다(appinstalled 또는 설치 창에서 수락) */
  installed: boolean;
}

export const INSTALL_KEY = 'bha-install';

export function loadInstallPrefs(storage: Pick<Storage, 'getItem'> | null): InstallPrefs {
  try {
    const raw = JSON.parse(storage?.getItem(INSTALL_KEY) ?? 'null') as Partial<InstallPrefs> | null;
    const later = typeof raw?.later === 'number' && Number.isFinite(raw.later) ? Math.max(0, Math.floor(raw.later)) : 0;
    return { later, installed: raw?.installed === true };
  } catch {
    return { later: 0, installed: false };
  }
}

export function saveInstallPrefs(storage: Pick<Storage, 'setItem'> | null, p: InstallPrefs): void {
  try {
    storage?.setItem(INSTALL_KEY, JSON.stringify(p));
  } catch {
    /* 저장소가 막혀 있으면 이번 실행만 */
  }
}

/** 열 때 저절로 안내창을 띄울까: 이미 앱(standalone)이거나 설치했거나 [나중에] 를 다 썼거나 안내할 것이 없으면 아니오 */
export function shouldAutoShow(prefs: InstallPrefs, standalone: boolean, mode: InstallMode): boolean {
  if (standalone || prefs.installed || prefs.later >= MAX_LATER) return false;
  return mode !== 'none';
}

/** 홈 화면 앱으로 열렸는가 (안드로이드·데스크톱 display-mode fullscreen/standalone — GDD 156장 1 manifest fullscreen, 아이폰 navigator.standalone) */
export function isStandalone(win: Pick<Window, 'matchMedia'> & { navigator: Navigator & { standalone?: boolean } } = window): boolean {
  try {
    return win.matchMedia('(display-mode: fullscreen)').matches || win.matchMedia('(display-mode: standalone)').matches || win.navigator.standalone === true;
  } catch {
    return false;
  }
}

/** 잡아 둔 설치 요청 (Chrome 의 BeforeInstallPromptEvent) */
export interface DeferredInstall {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: DeferredInstall | null = null;
const waiters: Array<() => void> = [];

export const installPrompt = (): DeferredInstall | null => deferred;
export const clearInstallPrompt = (): void => {
  deferred = null;
};

/** 설치 요청이 (다시) 잡히면 부른다. 한 번만 */
export function onInstallPrompt(cb: () => void): void {
  waiters.push(cb);
}

/** 앱 시작 때 한 번: 브라우저의 작은 설치 띠를 막고(preventDefault) 요청을 잡아 둔다. 설치되면 기록한다 */
export function captureInstallPrompt(win: Window = window, storage: Storage | null = safeStorage()): void {
  win.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as unknown as DeferredInstall;
    for (const w of waiters.splice(0)) w();
  });
  win.addEventListener('appinstalled', () => {
    deferred = null;
    saveInstallPrefs(storage, { ...loadInstallPrefs(storage), installed: true });
  });
}

export function safeStorage(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}
