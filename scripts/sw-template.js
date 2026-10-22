// 서비스 워커 (GDD 60장): 빌드 때 vite.config.ts 의 pwaPlugin 이 버전·미리 캐시 목록 자리를 채워 dist/sw.js 로 쓴다.
// 게임 파일 전체를 미리 캐시해 오프라인에서도 열린다. 새 버전은 설치만 해 두고(skipWaiting 안 함) 앱을 다시 열 때 적용한다.
const VERSION = '__VERSION__';
const CACHE = 'bha-' + VERSION;
const PRECACHE = __PRECACHE__;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE.map((p) => new URL(p, self.registration.scope).href))),
  );
});

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
        .match(new URL('./', self.registration.scope).href, { ignoreSearch: true })
        .then((hit) => hit || fetch(req)),
    );
    return;
  }
  event.respondWith(
    caches.match(req).then(
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
