// 오프라인 플레이 (GDD 60장): 서비스 워커 등록. 새 워커는 설치만 하고 앱을 다시 열 때 적용한다(게임 중 새로고침 없음).
// C.130: 폰에서 앱을 백그라운드에서 다시 꺼내면 페이지를 새로 열지 않아 업데이트 확인도 안 했다(옛 규칙이 며칠씩 남음) —
// 화면으로 돌아올 때·UPDATE_CHECK_MS 마다 새 버전을 확인하고, 받으면 어느 화면에서든 "새 버전 — 다시 시작" 띠를 띄운다(main.ts → updateBanner)
// C.283 (GDD 184장): 예전엔 새 워커가 파일 전부(약 35~45MB)를 받은 뒤(installed)에야 띠를 띄워 폰에서 수십 초~1~2분 걸렸다.
// 이제 켤 때·다시 꺼낼 때 작은 버전 파일(version.json, 캐시 없이)을 바로 보고, 지금 도는 빌드와 다르면 즉시 띠.
// [다시 시작]은 다 받기를 기다리지 않고 새 index·JS 를 네트워크에서 연다(그림·소리는 뒤에서). 처음 화면(게임 시작 전)이면 자동 다시 시작.

declare const __BUILD_ID__: string | undefined;
/** 이 빌드의 고유 id (vite.config.ts 가 빌드마다 새로 정하고 dist/version.json 에도 같은 값을 쓴다). dev·테스트 = 'dev' */
export const BUILD_ID: string = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev';
/** 작은 버전 파일 (서비스 워커가 손대지 않는다 — sw-template.js) */
export const VERSION_FILE = 'version.json';
/** 다시 연 주소에 붙이는 표시(HTTP 캐시를 피해 새 index 를 받는다). 켜진 뒤 주소에서 지운다 */
export const RESTART_PARAM = 'bha-v';
/** 고리 방지: 마지막으로 자동 다시 시작한 대상 빌드 (이 탭 동안) */
export const RESTART_KEY = 'bha-update-restart';

let updateReady = false;
/** 켜 둔 채로 새 버전을 확인하는 간격 · 연달아 확인하지 않는 최소 간격 */
export const UPDATE_CHECK_MS = 10 * 60 * 1000;
const UPDATE_CHECK_MIN_GAP_MS = 5 * 1000;
/** 처음 화면에서 자동 다시 시작 전 안내를 보여 주는 시간 */
export const AUTO_RESTART_DELAY_MS = 900;
const listeners: Array<() => void> = [];
const autoListeners: Array<() => void> = [];
let latestBuild: string | null = null;

/** 새 버전이 있는가 (띠 안내용) */
export function isUpdateReady(): boolean {
  return updateReady;
}

/** 새 버전이 있을 때 알린다 (이미 알았다면 바로 호출) — 띠 */
export function onUpdateReady(cb: () => void): void {
  if (updateReady) cb();
  else listeners.push(cb);
}

/** 처음 화면에서 자동 다시 시작하기 직전에 알린다 (처음 화면 한 줄 안내) */
export function onAutoRestart(cb: () => void): void {
  autoListeners.push(cb);
}

function markReady(): void {
  updateReady = true;
  while (listeners.length) listeners.shift()?.();
}

/** 게임 쪽이 알려 주는 것: 지금 처음 화면(게임 시작 전)인가 · 다시 시작 직전 저장 */
export interface UpdateHost {
  isPreGame: () => boolean;
  saveNow: () => void;
}
let host: UpdateHost = { isPreGame: () => false, saveNow: () => undefined };
export function setUpdateHost(h: UpdateHost): void {
  host = h;
}

export type UpdateAction = 'none' | 'banner' | 'auto';

/** 확인 결과로 할 일. 버전을 못 받았거나(오프라인) 같으면 없음, 처음 화면이면 자동(같은 대상으로 이미 한 번 자동으로 열었으면 띠만 — 무한 새로고침 방지), 아니면 띠 */
export function decideUpdate(o: { current: string; latest: string | null; preGame: boolean; lastTried: string | null }): UpdateAction {
  if (!o.latest || o.latest === o.current) return 'none';
  if (o.preGame && o.lastTried !== o.latest) return 'auto';
  return 'banner';
}

type FetchLike = (url: string, init?: RequestInit) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

/** 캐시 건너뛰기 꼬리 (C.295, GDD 188장): GitHub Pages 는 index·version.json·sw.js 를 max-age=600 으로 내보내 no-store 만으로는
 * 중간 CDN 이 옛 파일을 줄 수 있다 — 주소에 매번 다른 꼬리를 붙여 CDN·브라우저 캐시를 모두 건너뛴다 */
export const BUST_PARAM = 't';
export function bustUrl(href: string, now: number = Date.now()): string {
  const u = new URL(href);
  u.searchParams.set(BUST_PARAM, now.toString(36));
  return u.href;
}

/** 배포된 최신 빌드 id. 매번 다른 주소 꼬리 + 캐시 없이(no-store) 받고, 실패(오프라인·없는 파일·깨진 내용)면 null */
export async function fetchLatestBuild(fetchFn: FetchLike, base: string, now: number = Date.now()): Promise<string | null> {
  try {
    const res = await fetchFn(bustUrl(new URL(VERSION_FILE, base).href, now), { cache: 'no-store' });
    if (!res.ok) return null;
    const build = (await res.json()) as { build?: unknown } | null;
    return typeof build?.build === 'string' && build.build ? build.build : null;
  } catch {
    return null;
  }
}

/** 다시 열 주소: 지금 주소에 RESTART_PARAM=대상 빌드.매번 다른 꼬리값 (CDN·HTTP 캐시에 남은 옛 index 를 피한다, C.295) */
export function restartUrl(href: string, target: string, now: number = Date.now()): string {
  const u = new URL(href);
  u.searchParams.set(RESTART_PARAM, `${target}.${now.toString(36)}`);
  return u.href;
}

interface StorageLite {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}
function session(): StorageLite | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

/** 확인 한 번의 흐름 (테스트에서 바깥 것을 바꿔 끼운다) */
export interface UpdateCheckDeps {
  current: string;
  fetchLatest: () => Promise<string | null>;
  preGame: () => boolean;
  storage: StorageLite | null;
  banner: () => void;
  autoRestart: (target: string) => void;
}
export async function runUpdateCheck(d: UpdateCheckDeps): Promise<UpdateAction> {
  const latest = await d.fetchLatest();
  let lastTried: string | null = null;
  try {
    lastTried = d.storage?.getItem(RESTART_KEY) ?? null;
  } catch {
    /* 못 읽으면 처음으로 본다 */
  }
  const act = decideUpdate({ current: d.current, latest, preGame: d.preGame(), lastTried });
  if (act === 'auto' && latest) {
    try {
      d.storage?.setItem(RESTART_KEY, latest);
    } catch {
      /* 못 쓰면 고리 방지가 안 되므로 자동은 하지 않고 띠만 */
      d.banner();
      return 'banner';
    }
    d.autoRestart(latest);
  } else if (act === 'banner') d.banner();
  return act;
}

/** 새 버전으로 다시 시작: 저장(게임 쪽이 판단) → 새 index 를 네트워크에서 연다 */
export function restartToLatest(target: string | null = latestBuild): void {
  try {
    host.saveNow();
  } catch {
    /* 저장 실패여도 다시 연다(평소 저장은 이미 돼 있다) */
  }
  if (target) location.replace(restartUrl(location.href, target));
  else location.reload();
}

/** 배포 빌드에서만 등록한다(dev 서버·테스트에서는 하지 않는다). 등록 주소는 문서 기준이라 하위 경로 배포에서도 맞는다 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  // 다시 시작 때 붙인 표시는 주소에서 지운다(홈 화면 바로가기·새로고침 주소가 깔끔하게)
  try {
    const u = new URL(location.href);
    if (u.searchParams.has(RESTART_PARAM)) {
      u.searchParams.delete(RESTART_PARAM);
      history.replaceState(history.state, '', u.href);
    }
  } catch {
    /* 주소 정리는 부가 */
  }
  // 처음 설치(원래 제어하던 워커 없음)는 안내 없음 — 방금 네트워크에서 연 화면이 최신이다 (GDD 184장 4)
  const hadController = navigator.serviceWorker.controller !== null;
  let last = 0;
  let checking = false;
  const check = (force = false) => {
    if (!hadController || updateReady || checking || document.visibilityState !== 'visible') return;
    if (navigator.onLine === false) return;
    if (!force && Date.now() - last < UPDATE_CHECK_MIN_GAP_MS) return;
    last = Date.now();
    checking = true;
    void runUpdateCheck({
      current: BUILD_ID,
      fetchLatest: async () => {
        const b = await fetchLatestBuild(fetch, document.baseURI);
        // 처음 화면이 그려질 틈을 준다(켜자마자 답이 오면 아직 화면이 없을 수 있다)
        await new Promise((r) => setTimeout(r, 0));
        if (b) latestBuild = b;
        return b;
      },
      preGame: () => host.isPreGame(),
      storage: session(),
      banner: markReady,
      autoRestart: (target) => {
        for (const cb of autoListeners) cb();
        setTimeout(() => restartToLatest(target), AUTO_RESTART_DELAY_MS);
      },
    }).finally(() => (checking = false));
  };
  // C.130: 새 워커가 활성화되면 알려 온다(sw.js refreshIfOld) — 답하지 않으면 옛 화면으로 보고 워커가 다시 연다.
  // C.283: 받았다는 사실만으로 띠를 띄우지 않고 버전 파일로 확인한다(새 빌드로 다시 연 뒤 새 워커가 활성화돼도 띠가 또 뜨지 않게)
  navigator.serviceWorker.addEventListener('message', (e: MessageEvent) => {
    if ((e.data as { type?: string } | null)?.type !== 'bha-sw-updated') return;
    e.ports[0]?.postMessage('ack');
    check(true);
  });
  // 켜자마자 확인 (워커 등록·load 를 기다리지 않는다)
  check(true);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
  });
  setInterval(() => check(), UPDATE_CHECK_MS);
  const register = () => {
    navigator.serviceWorker
      .register(new URL('sw.js', document.baseURI).href, { updateViaCache: 'none' })
      .then((reg) => {
        // 앱을 다시 꺼냈을 때(visible)·오래 켜 둘 때 새 워커도 받아 둔다(오프라인용 미리 받기, updateViaCache none 이라 sw.js 는 늘 네트워크에서)
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') reg.update().catch(() => undefined);
        });
        reg.addEventListener('updatefound', () => {
          const w = reg.installing;
          if (!w) return;
          w.addEventListener('statechange', () => {
            if (w.state === 'installed' && navigator.serviceWorker.controller) check(true);
          });
        });
      })
      .catch(() => {
        /* 등록 실패는 게임에 영향 없음(온라인 플레이 그대로) */
      });
  };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
