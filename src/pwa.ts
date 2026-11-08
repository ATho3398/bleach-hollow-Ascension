// 오프라인 플레이 (GDD 60장): 서비스 워커 등록. 새 워커는 설치만 하고 앱을 다시 열 때 적용한다(게임 중 새로고침 없음).
// C.130: 폰에서 앱을 백그라운드에서 다시 꺼내면 페이지를 새로 열지 않아 업데이트 확인도 안 했다(옛 규칙이 며칠씩 남음) —
// 화면으로 돌아올 때·UPDATE_CHECK_MS 마다 새 버전을 확인하고, 받으면 어느 화면에서든 "새 버전 — 다시 시작" 띠를 띄운다(main.ts → updateBanner)
// C.283 (GDD 184장): 예전엔 새 워커가 파일 전부(약 35~45MB)를 받은 뒤(installed)에야 띠를 띄워 폰에서 수십 초~1~2분 걸렸다.
// 이제 켤 때·다시 꺼낼 때 작은 버전 파일(version.json, 캐시 없이)을 바로 보고, 지금 도는 빌드와 다르면 즉시 띠.
// [다시 시작]은 다 받기를 기다리지 않고 새 index·JS 를 네트워크에서 연다(그림·소리는 뒤에서). 처음 화면(게임 시작 전)이면 자동 다시 시작.
// C.315 (GDD 195장): 재현으로 확인한 '켜도 바로 안 뜸' 세 원인 — ① [나중에] 뒤엔 그 탭이 사는 동안(폰은 며칠) 확인을 멈춤 → 닫아도 확인은 계속,
// 다시 꺼내면 같은 빌드라도 다시 알리고 켜 둔 동안은 더 새 빌드일 때만 ② 확인(버전 파일 요청)이 진행 중일 때 들어온 재확인(워커 알림·복귀)은 버려졌고
// 실패 뒤 재시도도 한 번뿐이라 망이 늦게 붙으면 다음 확인이 1분 뒤 → 진행 중이면 끝난 뒤 한 번 더, 실패는 몇 번 더 ③ 켜자마자 답이 오면 게임 쪽
// 판단(처음 화면인가)이 아직 안 붙어 자동 다시 시작 대신 창 → 게임 쪽이 붙을 때까지 잠깐 기다린다

declare const __BUILD_ID__: string | undefined;
/** 이 빌드의 고유 id (vite.config.ts 가 빌드마다 새로 정하고 dist/version.json 에도 같은 값을 쓴다). dev·테스트 = 'dev' */
export const BUILD_ID: string = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev';
/** 작은 버전 파일 (서비스 워커가 손대지 않는다 — sw-template.js) */
export const VERSION_FILE = 'version.json';
/** 다시 연 주소에 붙이는 표시(HTTP 캐시를 피해 새 index 를 받는다). 켜진 뒤 주소에서 지운다. sw-template.js 도 같은 이름을 본다(다시 시작 화면은 네트워크를 더 기다린다, C.315) */
export const RESTART_PARAM = 'bha-v';
/** 고리 방지: 마지막으로 자동 다시 시작한 대상 빌드 (이 탭 동안) */
export const RESTART_KEY = 'bha-update-restart';

let updateReady = false;
/** [나중에]로 닫은 대상 빌드 (C.315) — 닫은 뒤에도 확인은 계속한다 */
let dismissedBuild: string | null = null;
/** 켜 둔 채로 새 버전을 확인하는 간격 · 연달아 확인하지 않는 최소 간격.
 * C.295 (GDD 188장): 10분 → 1분 — 배포(빌드·올리기 약 4~5분)가 끝나기 전에 켜면 다음 확인이 10분 뒤였다. 버전 파일은 약 30바이트 */
export const UPDATE_CHECK_MS = 60 * 1000;
/** 버전 파일 요청 최대 대기 (폰이 백그라운드에서 돌아올 때 요청이 멈춰 확인이 영영 끝나지 않던 것 방지) · 실패 뒤 다시 확인 */
export const VERSION_TIMEOUT_MS = 5000;
export const RETRY_MS = 3000;
/** 실패(못 받음) 뒤 다시 확인하는 최대 횟수 — 켤 때·다시 꺼낼 때마다 처음부터 (C.315: 예전엔 한 번뿐이라 망이 늦게 붙으면 1분 뒤에야 알았다) */
export const MAX_RETRIES = 6;
const UPDATE_CHECK_MIN_GAP_MS = 5 * 1000;
/** 처음 화면에서 자동 다시 시작 전 안내를 보여 주는 시간 */
export const AUTO_RESTART_DELAY_MS = 900;
/** 켜자마자 버전 답이 왔을 때 게임 쪽(처음 화면 판단)이 붙기를 기다리는 최대 시간 (C.315 ③) */
export const HOST_WAIT_MS = 1500;
const listeners: Array<() => void> = [];
const autoListeners: Array<() => void> = [];
let latestBuild: string | null = null;

/** 새 버전이 있는가 (띠 안내용) */
export function isUpdateReady(): boolean {
  return updateReady;
}

/** 새 버전이 있을 때 알린다 (이미 알았다면 바로 호출). C.315: 한 번 알린 뒤에도 구독은 남아 다시 알릴 수 있다([나중에] 뒤 다시 꺼냈을 때) */
export function onUpdateReady(cb: () => void): void {
  listeners.push(cb);
  if (updateReady) cb();
}

/** 처음 화면에서 자동 다시 시작하기 직전에 알린다 (처음 화면 한 줄 안내) */
export function onAutoRestart(cb: () => void): void {
  autoListeners.push(cb);
}

function markReady(): void {
  updateReady = true;
  for (const cb of [...listeners]) cb();
}
/** 점검 스크립트용 (C.314, GDD 194장 5): 새 버전을 받은 것처럼 알림 창을 띄운다 — 서비스 워커 없이 */
export const markUpdateReadyForTest = (): void => markReady();
/** 점검 스크립트용 (C.316): 처음 화면 자동 다시 시작 안내 줄만 띄운다 — 실제로 다시 시작하지는 않는다 */
export const showAutoRestartNoticeForTest = (): void => {
  for (const cb of autoListeners) cb();
};

/** [나중에] (C.315, GDD 195장): 창을 닫되 확인은 계속한다. 같은 빌드는 다시 꺼낼 때(resumed) 다시 알리고, 켜 둔 동안은 더 새 빌드가 나오면 알린다 */
export function dismissUpdate(): void {
  updateReady = false;
  dismissedBuild = latestBuild;
}
/** 테스트용 */
export const dismissedBuildForTest = (): string | null => dismissedBuild;

/** 게임 쪽이 알려 주는 것: 지금 처음 화면(게임 시작 전)인가 · 다시 시작 직전 저장 */
export interface UpdateHost {
  isPreGame: () => boolean;
  saveNow: () => void;
}
let host: UpdateHost = { isPreGame: () => false, saveNow: () => undefined };
let hostResolve: () => void = () => undefined;
/** 게임 쪽이 붙으면 끝나는 약속 (켜자마자 확인이 끝났을 때 처음 화면 판단을 기다린다, C.315 ③) */
const hostReady = new Promise<void>((r) => (hostResolve = r));
export function setUpdateHost(h: UpdateHost): void {
  host = h;
  hostResolve();
}

export type UpdateAction = 'none' | 'banner' | 'auto';

/** 확인 결과로 할 일. 버전을 못 받았거나(오프라인) 같으면 없음, [나중에]로 닫은 같은 빌드는 다시 꺼낸 때(resumed)가 아니면 없음(C.315),
 * 처음 화면이면 자동(같은 대상으로 이미 한 번 자동으로 열었으면 띠만 — 무한 새로고침 방지), 아니면 띠 */
export function decideUpdate(o: { current: string; latest: string | null; preGame: boolean; lastTried: string | null; dismissed?: string | null; resumed?: boolean }): UpdateAction {
  if (!o.latest || o.latest === o.current) return 'none';
  if (o.dismissed && o.dismissed === o.latest && !o.resumed) return 'none';
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
    const ctl = typeof AbortController === 'undefined' ? null : new AbortController();
    const timer = ctl ? setTimeout(() => ctl.abort(), VERSION_TIMEOUT_MS) : null;
    const res = await fetchFn(bustUrl(new URL(VERSION_FILE, base).href, now), ctl ? { cache: 'no-store', signal: ctl.signal } : { cache: 'no-store' }).finally(() => {
      if (timer) clearTimeout(timer);
    });
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
  /** [나중에]로 닫은 빌드 (C.315) */
  dismissed?: () => string | null;
  /** 이 확인이 다시 꺼낸(백그라운드 → 화면) 때문인가 (C.315: 닫은 같은 빌드도 다시 알린다) */
  resumed?: boolean;
}
export async function runUpdateCheck(d: UpdateCheckDeps): Promise<UpdateAction> {
  const latest = await d.fetchLatest();
  let lastTried: string | null = null;
  try {
    lastTried = d.storage?.getItem(RESTART_KEY) ?? null;
  } catch {
    /* 못 읽으면 처음으로 본다 */
  }
  const act = decideUpdate({ current: d.current, latest, preGame: d.preGame(), lastTried, dismissed: d.dismissed?.() ?? null, resumed: d.resumed ?? false });
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

/** 다시 시작 이동이 이 시간 안에 끝나지 않으면 한 번 더 연다 (C.315). 워커의 다시 시작 화면 대기(15초)보다 길게 */
export const RESTART_WATCHDOG_MS = 20000;
/** 대기(waiting) 워커가 있을 때의 다시 시작: 첫 이동은 버려지므로(아래) 이 시간 뒤 바로 한 번 더 — 그때는 새 워커가 활성화돼 캐시에서 바로 연다 (C.315) */
export const RESTART_RETRY_MS = 3000;
/** 새 워커가 받는 중(installing)이면 다시 시작 전에 설치가 끝나길 기다리는 최대 시간 (C.315) */
export const RESTART_INSTALL_WAIT_MS = 25000;
/** 등록된 워커 (설치 중·대기 중인 새 워커를 본다) */
let swReg: ServiceWorkerRegistration | null = null;

/** 새 워커가 파일을 받는 중(installing)이면 설치가 끝날 때까지 기다렸다가 cb (받는 중에 열면 옛 index·옛 캐시로 떨어지기 쉽다) */
function whenInstalled(cb: () => void): void {
  const w = swReg?.installing ?? null;
  if (!w) {
    cb();
    return;
  }
  let done = false;
  const fin = (): void => {
    if (done) return;
    done = true;
    cb();
  };
  w.addEventListener('statechange', () => {
    if (w.state !== 'installing') fin();
  });
  setTimeout(fin, RESTART_INSTALL_WAIT_MS);
}

/** 새 버전으로 다시 시작: 저장(게임 쪽이 판단) → 새 index 를 네트워크에서 연다 */
export function restartToLatest(target: string | null = latestBuild): void {
  try {
    host.saveNow();
  } catch {
    /* 저장 실패여도 다시 연다(평소 저장은 이미 돼 있다) */
  }
  if (!target) {
    location.reload();
    return;
  }
  const go = (): void => {
    // C.315 (GDD 195장, 재현 scripts/c315 · dbg9): 설치를 마친 새 워커가 대기(waiting) 중일 때 화면을 열면 크롬이 요청을 옛 워커에 보냈다가
    // 1초 뒤 새 워커로 자리를 바꾸며 그 요청을 버려 이동이 영영 끝나지 않는다(옛 화면이 그대로 남음 — [다시 시작]을 눌러도, 처음 화면 자동 다시 시작도 안 됨).
    // 그래서 대기 워커가 있으면 짧게(RESTART_RETRY_MS) 기다렸다가 한 번 더 연다(그때는 새 워커가 활성화돼 캐시에서 바로). 평소엔 RESTART_WATCHDOG_MS.
    // 이동이 끝나면 이 문서가 사라져 타이머도 사라진다
    const waiting = !!swReg?.waiting;
    location.replace(restartUrl(location.href, target));
    setTimeout(go, waiting ? RESTART_RETRY_MS : RESTART_WATCHDOG_MS);
  };
  whenInstalled(go);
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
  /** 확인 중에 들어온 재확인 요청 — 끝난 뒤 한 번 더 (C.315 ②: 예전엔 버려져 워커 알림·복귀 확인이 사라졌다) */
  let pending = false;
  let pendingResumed = false;
  let retries = 0;
  let got = false;
  const check = (force = false, resumed = false) => {
    if (!hadController || updateReady || document.visibilityState !== 'visible') return;
    if (navigator.onLine === false) return;
    if (checking) {
      pending = pending || force;
      pendingResumed = pendingResumed || resumed;
      return;
    }
    if (!force && Date.now() - last < UPDATE_CHECK_MIN_GAP_MS) return;
    last = Date.now();
    checking = true;
    void runUpdateCheck({
      current: BUILD_ID,
      fetchLatest: async () => {
        const b = await fetchLatestBuild(fetch, document.baseURI);
        // 게임 쪽(처음 화면 판단·저장)이 붙을 때까지 잠깐 기다린다 — 켜자마자 답이 오면 아직 화면이 없을 수 있다 (C.315 ③: 예전엔 한 틱뿐이라 처음 화면인데 창이 떴다)
        await Promise.race([hostReady, new Promise((r) => setTimeout(r, HOST_WAIT_MS))]);
        got = b !== null;
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
      dismissed: () => dismissedBuild,
      resumed,
    })
      .then(() => {
        // C.295·C.315: 못 받았으면(돌아온 직후 망이 아직 안 붙음·시간 초과) 잠깐 뒤 다시 — 몇 번 더
        if (!got && retries < MAX_RETRIES) {
          retries++;
          setTimeout(() => check(true, resumed), RETRY_MS);
        }
      })
      .finally(() => {
        checking = false;
        if (pending) {
          pending = false;
          const r = pendingResumed;
          pendingResumed = false;
          check(true, r);
        }
      });
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
  /** 다시 꺼냄(백그라운드 → 화면): 재시도 횟수 처음부터, [나중에]로 닫은 같은 빌드도 다시 알린다 (C.315 ①) */
  const resume = () => {
    retries = 0;
    check(true, true);
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') resume();
  });
  // C.295: 폰(특히 홈 화면 앱)이 멈춰 둔 화면을 되살릴 때(pageshow persisted)·창에 돌아올 때(focus) 도 확인 — visibilitychange 가 안 오는 경우 대비
  window.addEventListener('pageshow', (e) => {
    if ((e as PageTransitionEvent).persisted) resume();
  });
  window.addEventListener('focus', () => check());
  window.addEventListener('online', () => {
    retries = 0;
    check(true);
  });
  setInterval(() => check(), UPDATE_CHECK_MS);
  const register = () => {
    navigator.serviceWorker
      .register(new URL('sw.js', document.baseURI).href, { updateViaCache: 'none' })
      .then((reg) => {
        swReg = reg;
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
