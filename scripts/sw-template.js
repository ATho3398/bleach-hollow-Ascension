// 서비스 워커 (GDD 60장): 빌드 때 vite.config.ts 의 pwaPlugin 이 버전·미리 캐시 목록 자리를 채워 dist/sw.js 로 쓴다.
// 게임 파일 전체를 미리 캐시해 오프라인에서도 열린다.
// C.116b: 새 워커는 설치 즉시 적용한다(skipWaiting). 새 캐시는 파일 전체를 담은 뒤에야 활성화되고,
// 코드 분할 조각이 없어(스크립트·CSS 한 벌) 실행 중인 화면이 요청할 옛 주소는 없다. C.130: 화면 열기 네트워크 먼저 + 옛 화면 다시 열기(아래).
const VERSION = '__VERSION__';
const CACHE = 'bha-' + VERSION;
const PRECACHE = __PRECACHE__;
// C.284 렉 (GDD 186장 1): 그림·이펙트(art·fx·icons)는 버전마다 새로 받지 않는다 — 버전과 상관없는 그림 캐시(MEDIA_CACHE)에
// 파일 내용 해시와 함께 두고, 해시가 바뀐 파일만 다시 받는다. 예전엔 배포마다 약 19MB 를 통째로 다시 받아 새 캐시에 써서 켤 때 폰이 버벅였다.
// 값 = [내용 해시, 나중 여부]. 나중(1) = 이펙트 시트(fx, 약 11MB): 설치 때 받지 않고 게임이 켜져 한가할 때(화면이 'bha-warm' 을 보냄) 몇 개씩 천천히
const MEDIA = /*__MEDIA__*/ {};
const MEDIA_CACHE = 'bha-media';
const HASH_HEADER = 'x-bha-hash';
/** 한 번에 받는 그림 수 (한꺼번에 수백 개를 받아 폰 네트워크·저장을 막지 않게) */
const MEDIA_PARALLEL = 3;

const abs = (p) => new URL(p, self.registration.scope).href;

/** 그림 캐시 채우기: 해시가 같은 파일은 건너뛰고, 없거나 바뀐 파일만 MEDIA_PARALLEL 개씩 받는다. strict = 하나라도 실패하면 실패(설치용) */
function ensureMedia(later, strict) {
  const list = Object.keys(MEDIA).filter((p) => !!MEDIA[p][1] === later);
  return caches.open(MEDIA_CACHE).then((cache) => {
    let i = 0;
    const one = () => {
      if (i >= list.length) return Promise.resolve();
      const p = list[i++];
      const url = abs(p);
      const hash = MEDIA[p][0];
      return cache
        .match(url)
        .then((hit) => {
          if (hit && hit.headers.get(HASH_HEADER) === hash) return;
          return fetch(url).then((res) => {
            if (!res.ok) throw new Error('media ' + res.status + ' ' + p);
            return res.blob().then((body) => {
              const headers = new Headers(res.headers);
              headers.set(HASH_HEADER, hash);
              return cache.put(url, new Response(body, { status: 200, headers }));
            });
          });
        })
        .catch((e) => {
          if (strict) throw e;
        })
        .then(one);
    };
    const runners = [];
    for (let k = 0; k < MEDIA_PARALLEL; k++) runners.push(one());
    return Promise.all(runners);
  });
}

/** 목록에 없는 옛 그림은 그림 캐시에서 지운다 */
function pruneMedia() {
  const keep = new Set(Object.keys(MEDIA).map(abs));
  return caches.open(MEDIA_CACHE).then((cache) =>
    cache.keys().then((reqs) => Promise.all(reqs.filter((r) => !keep.has(r.url.split('?')[0])).map((r) => cache.delete(r)))),
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE.map(abs)))
      .then(() => ensureMedia(false, true))
      .then(() => self.skipWaiting()),
  );
});

// 화면이 켜지고 한가해지면 보내는 신호 (src/swWarm.ts): 나중 그림(이펙트)을 천천히 받는다. 같은 해시면 아무것도 안 받는다
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'bha-warm') event.waitUntil(ensureMedia(true, false).then(pruneMedia).catch(() => undefined));
});

// 캐시 조회: 주소 뒤 ?… 와 Vary 헤더는 무시한다(그림·스크립트가 쿼리나 다른 요청 머리로 불려도 오프라인에서 찾는다)
const LOOKUP = { ignoreSearch: true, ignoreVary: true };
// 게임 화면을 네트워크에서 기다리는 최대 시간 (느린 망에서도 오프라인처럼 캐시로 바로 연다)
const NAV_TIMEOUT_MS = 3000;

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('bha-') && k !== CACHE && k !== MEDIA_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then((list) => Promise.all(list.map(refreshIfOld))),
  );
});

// C.130: 새 워커가 일을 시작하면 열려 있는 화면에 알린다. C.130 이후 화면은 답하고 "새 버전 — 다시 시작" 띠를 띄운다(pwa.ts).
// 답이 없는 화면 = 띠 코드가 없는 옛 버전(C.129 이전) → 한 번 다시 연다(원정 중이면 마지막 중간 저장에서 이어하기). 옛 버전이 계속 도는 걸 막는다
const ACK_MS = 1500;
function refreshIfOld(client) {
  return new Promise((resolve) => {
    let acked = false;
    const ch = new MessageChannel();
    ch.port1.onmessage = () => (acked = true);
    try {
      client.postMessage({ type: 'bha-sw-updated', version: VERSION }, [ch.port2]);
    } catch (e) {
      /* 알릴 수 없으면 옛 화면으로 본다 */
    }
    setTimeout(() => {
      resolve();
      // 이동을 기다리지 않는다: 활성화(waitUntil)가 끝나야 이 워커가 그 화면 요청을 받으므로, 기다리면 서로 막힌다
      if (!acked && client.navigate) client.navigate(client.url).catch(() => undefined);
    }, ACK_MS);
  });
}

// C.139: 화면(HTML)이 부르는 자기 자산(./assets/…, 상대 경로) 목록
function shellAssets(html) {
  const out = [];
  const re = /(?:src|href)=["'](\.\/assets\/[^"']+)["']/g;
  let m;
  while ((m = re.exec(html))) out.push(m[1]);
  return out;
}
// 그 자산이 이 버전 캐시에 모두 있으면 셸로 넣고 true, 하나라도 없으면 셸을 건드리지 않고 false
function promoteShell(shell, res) {
  return res.text().then((html) =>
    caches.open(CACHE).then((cache) =>
      Promise.all(shellAssets(html).map((a) => cache.match(new URL(a, self.registration.scope).href, LOOKUP))).then((hits) => {
        if (hits.some((h) => !h)) return false;
        return cache.put(shell, new Response(html, { headers: res.headers })).then(() => true);
      }),
    ),
  );
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // C.196: 음악(긴 mp3)은 브라우저가 조각(Range)으로 나눠 받는다. 캐시의 통째 응답(200)을 중간 조각 요청에 돌려주면
  // 재생기가 오류로 멈춰 곡 중간에 끊겼다 — 조각 요청·플레이리스트 파일은 워커가 손대지 않고 브라우저가 직접 받는다
  if ((req.headers && req.headers.has('range')) || url.pathname.includes('/audio/playlist/')) return;
  // C.283 (GDD 184장): 버전 파일은 늘 네트워크에서(캐시에 넣지도 꺼내지도 않는다) — 켜자마자 새 배포를 알아본다
  if (url.pathname.endsWith('/version.json')) return;
  if (req.mode === 'navigate') {
    // C.130: 게임 화면(index.html)은 네트워크 먼저 — 캐시 먼저면 배포 뒤 첫 실행이 늘 옛 index·옛 스크립트로 떠서 새 규칙이 한 번 늦게 적용됐다.
    // 받은 화면은 캐시에 넣어 두고, 오프라인이거나 NAV_TIMEOUT_MS 안에 답이 없으면 캐시(주소 뒤 ?… 가 붙어도 같은 게임 화면)
    const shell = new URL('./', self.registration.scope).href;
    const cached = () => caches.match(shell, LOOKUP).then((hit) => hit || fetch(req));
    const network = fetch(req).then((res) => {
      if (!res.ok) throw new Error('nav ' + res.status);
      // C.139: 받은 화면은 그 화면이 부르는 자산이 이 캐시에 다 있을 때만 셸로 승격한다(새 배포 HTML 이 옛 캐시 셸을 먼저 덮어써
      // 오프라인에서 없는 스크립트를 부르던 문제, GDD 88장 2). 새 버전 셸은 새 워커 설치(addAll)가 자산과 한 벌로 넣는다
      event.waitUntil(promoteShell(shell, res.clone()).catch(() => undefined));
      return res;
    });
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('nav timeout')), NAV_TIMEOUT_MS));
    event.respondWith(Promise.race([network, timeout]).catch(cached));
    return;
  }
  event.respondWith(
    caches.match(req, LOOKUP).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            // C.139: 캐시 쓰기 수명은 waitUntil 로 보장(응답을 돌려준 뒤 워커가 멈춰도 쓰기가 끝난다)
            event.waitUntil(caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => undefined));
          }
          return res;
        }),
    ),
  );
});
