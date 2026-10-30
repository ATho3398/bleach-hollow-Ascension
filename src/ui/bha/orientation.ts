// 가로 고정 시도 (GDD 109장 8·9번, C.180): 글자 입력칸을 누르면 기기 화면을 가로로 돌려 키보드도 가로로 열리게 한다.
// 세로로 든 폰은 기기를 CSS 로 90도 돌려 그리므로(GDD 16-6) 화면은 가로처럼 보여도 키보드는 실제 방향(세로)으로 열린다.
// screen.orientation.lock 은 설치한 앱(manifest orientation landscape)이나 전체 화면에서만 된다 — 안 되면 전체 화면을 켜고 한 번 더.
// 안 되는 환경(iOS 사파리·설치 앱 포함: lock 자체가 없음)은 그대로 둔다. 자체 키보드는 만들지 않는다.
// 홈 화면 앱(앱 모드)에서는 전체 화면 우회를 하지 않는다 — 크롬 '전체 화면 종료' 안내가 뜨므로 (GDD 156장 2)

/**
 * 홈 화면 앱으로 켜졌는가 (display-mode fullscreen/standalone, GDD 156장 2). 참이면 Fullscreen API 를 부르지 않는다.
 * 브라우저 탭에서 API 로 전체 화면에 들어가도 display-mode fullscreen 이 맞을 수 있어, 그때(전체 화면 요소가 있음)는 탭으로 본다 — 앱 모드에선 API 를 안 부르니 요소가 생기지 않는다
 */
export function isAppMode(): boolean {
  try {
    if (typeof matchMedia !== 'function') return false;
    const d = typeof document !== 'undefined' ? (document as Document & { webkitFullscreenElement?: Element | null }) : undefined;
    if (d && (d.fullscreenElement ?? d.webkitFullscreenElement)) return false;
    return matchMedia('(display-mode: fullscreen)').matches || matchMedia('(display-mode: standalone)').matches;
  } catch {
    return false;
  }
}

type LockableOrientation = ScreenOrientation & { lock?: (o: 'landscape') => Promise<void> };

/** 이 입력칸에서 가로 고정을 시도할지: 글자를 치는 칸이고, 손가락 기기이며 지금 화면이 세로일 때만 */
export function wantsLandscapeLock(target: EventTarget | null, env: { coarse: boolean; portrait: boolean }): boolean {
  if (!env.coarse || !env.portrait) return false;
  if (typeof HTMLTextAreaElement !== 'undefined' && target instanceof HTMLTextAreaElement) return !target.readOnly;
  if (typeof HTMLInputElement === 'undefined' || !(target instanceof HTMLInputElement)) return false;
  return !target.readOnly && ['text', 'search', ''].includes(target.type);
}

/** 가로 고정 시도. 결과는 'locked' | 'fullscreen' (전체 화면 켠 뒤 고정) | 'unsupported' | 'failed' */
export async function lockLandscape(doc: Document = document): Promise<'locked' | 'fullscreen' | 'unsupported' | 'failed'> {
  const o = (typeof screen !== 'undefined' ? screen.orientation : undefined) as LockableOrientation | undefined;
  if (!o?.lock) return 'unsupported';
  try {
    await o.lock('landscape');
    return 'locked';
  } catch {
    const root = doc.documentElement;
    if (isAppMode() || doc.fullscreenElement || !root.requestFullscreen) return 'failed';
    try {
      await root.requestFullscreen({ navigationUI: 'hide' });
      await o.lock('landscape');
      return 'fullscreen';
    } catch {
      return 'failed';
    }
  }
}

/** 문서 전체에 한 번: 글자 입력칸에 초점이 가면(손가락으로 누른 직후라 전체 화면 요청이 허락된다) 가로 고정을 시도한다 */
export function installLandscapeKeyboard(doc: Document = document): void {
  const mq = (q: string) => (typeof matchMedia === 'function' ? matchMedia(q).matches : false);
  doc.addEventListener('focusin', (e) => {
    const portrait = typeof screen !== 'undefined' && screen.orientation ? screen.orientation.type.startsWith('portrait') : mq('(orientation: portrait)');
    if (!wantsLandscapeLock(e.target, { coarse: mq('(pointer: coarse)'), portrait })) return;
    void lockLandscape(doc);
  });
}
