// 오프라인 플레이 (GDD 60장): 서비스 워커 등록. 새 워커는 설치만 하고 앱을 다시 열 때 적용한다(게임 중 새로고침 없음).

let updateReady = false;
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
  const register = () => {
    navigator.serviceWorker
      .register(new URL('sw.js', document.baseURI).href, { updateViaCache: 'none' })
      .then((reg) => {
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
