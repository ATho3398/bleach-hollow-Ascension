// 오프라인 플레이 (GDD 60장): 서비스 워커 등록. 새 워커는 설치만 하고 앱을 다시 열 때 적용한다(게임 중 새로고침 없음).
// C.130: 폰에서 앱을 백그라운드에서 다시 꺼내면 페이지를 새로 열지 않아 업데이트 확인도 안 했다(옛 규칙이 며칠씩 남음) —
// 화면으로 돌아올 때·UPDATE_CHECK_MS 마다 새 버전을 확인하고, 받으면 어느 화면에서든 "새 버전 — 다시 시작" 띠를 띄운다(main.ts → updateBanner)

let updateReady = false;
/** 켜 둔 채로 새 버전을 확인하는 간격 · 연달아 확인하지 않는 최소 간격 */
export const UPDATE_CHECK_MS = 10 * 60 * 1000;
const UPDATE_CHECK_MIN_GAP_MS = 30 * 1000;
const listeners: Array<() => void> = [];

/** 새 버전을 받아 두었는가 ("다시 열면 적용" 안내용) */
export function isUpdateReady(): boolean {
  return updateReady;
}

/** 새 버전을 받았을 때 알린다 (이미 받았다면 바로 호출) */
export function onUpdateReady(cb: () => void): void {
  if (updateReady) cb();
  else listeners.push(cb);
}

function markReady(): void {
  updateReady = true;
  while (listeners.length) listeners.shift()?.();
}

/** 배포 빌드에서만 등록한다(dev 서버·테스트에서는 하지 않는다). 등록 주소는 문서 기준이라 하위 경로 배포에서도 맞는다 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  // C.130: 새 워커가 활성화되면 알려 온다(sw.js refreshIfOld) — 답하지 않으면 옛 화면으로 보고 워커가 다시 연다. 처음 설치(원래 제어하던 워커 없음)는 안내 없음
  const hadController = navigator.serviceWorker.controller !== null;
  navigator.serviceWorker.addEventListener('message', (e: MessageEvent) => {
    if ((e.data as { type?: string } | null)?.type !== 'bha-sw-updated') return;
    e.ports[0]?.postMessage('ack');
    if (hadController) markReady();
  });
  const register = () => {
    navigator.serviceWorker
      .register(new URL('sw.js', document.baseURI).href, { updateViaCache: 'none' })
      .then((reg) => {
        // 앱을 다시 꺼냈을 때(visible)·오래 켜 둘 때 새 배포를 확인한다 (updateViaCache none 이라 sw.js 는 늘 네트워크에서)
        let last = Date.now();
        const check = () => {
          if (updateReady || Date.now() - last < UPDATE_CHECK_MIN_GAP_MS) return;
          last = Date.now();
          reg.update().catch(() => undefined);
        };
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') check();
        });
        setInterval(check, UPDATE_CHECK_MS);
        reg.addEventListener('updatefound', () => {
          const w = reg.installing;
          if (!w) return;
          w.addEventListener('statechange', () => {
            // 이미 워커가 일하는 중(= 업데이트)일 때만 안내한다. 첫 설치는 안내 없음
            if (w.state === 'installed' && navigator.serviceWorker.controller) markReady();
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
