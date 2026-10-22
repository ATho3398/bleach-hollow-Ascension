// 서비스 워커 (GDD 60장): 빌드 때 vite.config.ts 의 pwaPlugin 이 버전·미리 캐시 목록 자리를 채워 dist/sw.js 로 쓴다.
// 게임 파일 전체를 미리 캐시해 오프라인에서도 열린다.
// C.116b: 이미 C.116 워커가 깔린 폰이 새 워커를 바로 쓰게 이번 한 번 설치 즉시 적용한다(skipWaiting). 새 캐시는 파일 전체를 담은 뒤에야 활성화되고,
// 코드 분할 조각이 없어(스크립트·CSS 한 벌) 실행 중인 화면이 요청할 옛 주소는 없다. 다음 패치부터 "다시 열면 적용"으로 되돌릴지는 마스터와 정한다.
const VERSION = '__VERSION__';
const CACHE = 'bha-' + VERSION;
const PRECACHE = __PRECACHE__;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE.map((p) => new URL(p, self.registration.scope).href)))
      .then(() => self.skipWaiting()),
  );
});

// 캐시 조회: 주소 뒤 ?… 와 Vary 헤더는 무시한다(그림·스크립트가 쿼리나 다른 요청 머리로 불려도 오프라인에서 찾는다)
const LOOKUP = { ignoreSearch: true, ignoreVary: true };

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('bha-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    // 주소 뒤 ?… 가 붙어도 같은 게임 화면을 연다
    event.respondWith(
      caches
        .match(new URL('./', self.registration.scope).href, LOOKUP)
        .then((hit) => hit || fetch(req)),
    );
    return;
  }
  event.respondWith(
    caches.match(req, LOOKUP).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
