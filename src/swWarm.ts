// 나중 그림 받기 신호 (GDD 186장 1, C.284): 서비스 워커는 설치 때 이펙트 시트(fx, 약 11MB)를 받지 않는다(켤 때 렉).
// 게임이 켜지고 한참 뒤 한가할 때 워커에 'bha-warm' 을 보내 바뀐 것만 몇 개씩 천천히 받게 한다 (scripts/sw-template.js).
// 오프라인 첫 실행 직후엔 이펙트 그림이 없을 수 있다(이펙트만 빠지고 게임은 그대로) — 한 번 온라인으로 켜 두면 채워진다.

/** 켠 뒤 신호까지 기다리는 시간 (처음 화면·방 그림을 먼저 받게) */
export const SW_WARM_DELAY_MS = 20_000;

export function scheduleSwWarm(): void {
  if (!import.meta.env.PROD || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  const send = () => {
    void navigator.serviceWorker.ready
      .then((reg) => reg.active?.postMessage({ type: 'bha-warm' }))
      .catch(() => undefined);
  };
  window.setTimeout(() => {
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    if (idle) idle(send, { timeout: 10_000 });
    else send();
  }, SW_WARM_DELAY_MS);
}
