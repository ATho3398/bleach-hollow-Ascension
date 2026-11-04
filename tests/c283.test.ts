// C.283 (GDD 184장): 새 버전 알림 = 앱 켜자마자. 작은 버전 파일(version.json)을 no-store 로 보고 지금 빌드와 다르면 즉시 띠,
// 처음 화면(게임 시작 전)이면 자동 다시 시작, 같은 대상으로 두 번 연속 자동 다시 시작하지 않는다(무한 새로고침 방지).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BUILD_ID, RESTART_KEY, decideUpdate, fetchLatestBuild, restartUrl, runUpdateCheck, type UpdateCheckDeps } from '../src/pwa';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

function mem(): { getItem(k: string): string | null; setItem(k: string, v: string): void; m: Map<string, string> } {
  const m = new Map<string, string>();
  return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
}
function deps(latest: string | null, preGame: boolean, storage = mem()) {
  const log: string[] = [];
  const d: UpdateCheckDeps = {
    current: 'old',
    fetchLatest: async () => latest,
    preGame: () => preGame,
    storage,
    banner: () => log.push('banner'),
    autoRestart: (t) => log.push(`auto:${t}`),
  };
  return { d, log, storage };
}

describe('C.283 새 버전 알림 = 켜자마자 (GDD 184장)', () => {
  it('판정: 같거나 못 받으면 없음 · 게임 중 다르면 띠 · 처음 화면이면 자동 · 같은 대상 두 번째는 띠만', () => {
    expect(decideUpdate({ current: 'a', latest: null, preGame: true, lastTried: null })).toBe('none');
    expect(decideUpdate({ current: 'a', latest: 'a', preGame: true, lastTried: null })).toBe('none');
    expect(decideUpdate({ current: 'a', latest: 'b', preGame: false, lastTried: null })).toBe('banner');
    expect(decideUpdate({ current: 'a', latest: 'b', preGame: true, lastTried: null })).toBe('auto');
    expect(decideUpdate({ current: 'a', latest: 'b', preGame: true, lastTried: 'b' })).toBe('banner');
    expect(decideUpdate({ current: 'a', latest: 'c', preGame: true, lastTried: 'b' })).toBe('auto');
  });

  it('버전이 다르면 게임 중엔 즉시 띠(다시 시작 안 함)', async () => {
    const { d, log } = deps('new', false);
    expect(await runUpdateCheck(d)).toBe('banner');
    expect(log).toEqual(['banner']);
  });

  it('처음 화면이면 자동 다시 시작하고 대상을 적어 둔다 → 다시 열었는데 여전히 옛 빌드면 또 자동으로 열지 않는다(고리 방지)', async () => {
    const storage = mem();
    const a = deps('new', true, storage);
    expect(await runUpdateCheck(a.d)).toBe('auto');
    expect(a.log).toEqual(['auto:new']);
    expect(storage.m.get(RESTART_KEY)).toBe('new');
    const b = deps('new', true, storage); // 같은 탭(sessionStorage), 여전히 옛 빌드로 뜸
    expect(await runUpdateCheck(b.d)).toBe('banner');
    expect(b.log).toEqual(['banner']);
  });

  it('같은 버전·오프라인이면 아무것도 안 함', async () => {
    for (const latest of ['old', null]) {
      const { d, log } = deps(latest, true);
      expect(await runUpdateCheck(d)).toBe('none');
      expect(log).toEqual([]);
    }
  });

  it('저장소를 못 쓰면 자동 대신 띠(고리 방지를 못 하므로)', async () => {
    const storage = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
    const log: string[] = [];
    const act = await runUpdateCheck({ current: 'old', fetchLatest: async () => 'new', preGame: () => true, storage, banner: () => log.push('banner'), autoRestart: () => log.push('auto') });
    expect(act).toBe('banner');
    expect(log).toEqual(['banner']);
  });

  it('버전 파일은 no-store 로 문서 기준 주소에서 받고, 실패·깨진 내용은 null', async () => {
    const calls: Array<[string, RequestInit | undefined]> = [];
    const ok = async (u: string, i?: RequestInit) => (calls.push([u, i]), { ok: true, json: async () => ({ build: 'abc-1' }) });
    expect(await fetchLatestBuild(ok, 'https://x/app/index.html', 36)).toBe('abc-1');
    // C.295 (GDD 188장): 매번 다른 꼬리(?t=)로 CDN·브라우저 캐시를 모두 건너뛴다
    expect(calls[0]).toEqual(['https://x/app/version.json?t=10', { cache: 'no-store' }]);
    expect(await fetchLatestBuild(async () => { throw new Error('offline'); }, 'https://x/app/')).toBeNull();
    expect(await fetchLatestBuild(async () => ({ ok: false, json: async () => ({}) }), 'https://x/app/')).toBeNull();
    expect(await fetchLatestBuild(async () => ({ ok: true, json: async () => ({ build: 3 }) }), 'https://x/app/')).toBeNull();
  });

  it('다시 열 주소 = 지금 주소 + bha-v (HTTP 캐시의 옛 index 를 피한다, 다른 쿼리·해시 유지)', () => {
    expect(restartUrl('https://x/app/?a=1#h', 'n1', 36)).toBe('https://x/app/?a=1&bha-v=n1.10#h');
    expect(restartUrl('https://x/app/', 'n1', 1)).not.toBe(restartUrl('https://x/app/', 'n1', 2)); // 매번 다른 주소(C.295)
  });

  it('dev·테스트는 dev 빌드(등록은 배포 빌드에서만), 빌드 id·version.json 은 vite.config 가 같은 값으로', () => {
    expect(typeof BUILD_ID).toBe('string');
    const cfg = read('vite.config.ts');
    expect(cfg).toContain('__BUILD_ID__: JSON.stringify(BUILD_ID)');
    expect(cfg).toContain('`${dir}/version.json`');
    const pwa = read('src/pwa.ts');
    expect(pwa).toContain('import.meta.env.PROD');
    expect(pwa).toContain('if (!hadController'); // 첫 설치는 안 함
  });

  it('서비스 워커는 version.json 을 캐시에서 꺼내지도 넣지도 않는다', async () => {
    const handlers: Record<string, (e: unknown) => void> = {};
    const self = { addEventListener: (k: string, h: (e: unknown) => void) => (handlers[k] = h), registration: { scope: 'https://x/app/' }, location: { origin: 'https://x' } };
    const src = read('scripts/sw-template.js').replace('__VERSION__', 't').replace('__PRECACHE__', '[]');
    new Function('self', 'caches', 'fetch', src)(self, { match: async () => undefined, open: async () => ({ put: async () => undefined }) }, async () => ({ ok: true, clone: () => ({}) }));
    let responded = false;
    handlers.fetch!({ request: { method: 'GET', url: 'https://x/app/version.json', mode: 'cors', headers: new Headers() }, respondWith: () => (responded = true) });
    expect(responded).toBe(false);
    let answer: Promise<unknown> | null = null;
    handlers.fetch!({ request: { method: 'GET', url: 'https://x/app/assets/a.js', mode: 'cors', headers: new Headers() }, respondWith: (p: Promise<unknown>) => { responded = true; answer = p; }, waitUntil: (p: Promise<unknown>) => p.catch(() => undefined) });
    expect(responded).toBe(true);
    await answer; // 처리 안 된 거부가 남지 않게 끝까지 기다린다
  });

  it('처음 화면 = 슬롯·종족 고르기, 다시 시작 직전 저장은 잠긴 흐름 밖에서만 · 띠 [다시 시작] = restartToLatest', () => {
    const app = read('src/ui/app.ts');
    expect(app).toContain("isPreGame: () => nav.top?.id === 'title' || nav.top?.id === 'species'");
    expect(app).toContain('saveNow: () => { if (nav.top && !nav.top.locked) persist(); }');
    expect(read('src/ui/updateBanner.ts')).toContain('restartToLatest()');
  });
});

// C.295 (GDD 188장): GitHub Pages 는 index·version.json 을 max-age=600 으로 내보낸다 — 워커의 게임 화면 요청이 기본 캐시 모드면
// 배포 뒤 최대 10분 브라우저 HTTP 캐시의 옛 index 가 떠서 '켜자마자 새 버전'이 안 됐다
describe('C.295 서비스 워커: 게임 화면은 HTTP 캐시를 건너뛴다', () => {
  function navFetch(reply: 'ok' | 'redirect' | 'offline') {
    const handlers: Record<string, (e: unknown) => void> = {};
    const self = { addEventListener: (k: string, h: (e: unknown) => void) => (handlers[k] = h), registration: { scope: 'https://x/app/' }, location: { origin: 'https://x' } };
    const res = (body: string, type = 'basic'): unknown => ({ ok: type === 'basic', type, body, headers: undefined, clone: () => res(body, type), text: async () => body });
    const calls: Array<[unknown, RequestInit | undefined]> = [];
    const fetchFn = (u: unknown, i?: RequestInit) => (calls.push([u, i]), reply === 'offline' ? Promise.reject(new Error('offline')) : Promise.resolve(res('new', reply === 'redirect' ? 'opaqueredirect' : 'basic')));
    const caches = { match: async () => res('cached'), open: async () => ({ match: async () => undefined, put: async () => undefined }) };
    const src = read('scripts/sw-template.js').replace('__VERSION__', 't').replace('__PRECACHE__', '[]');
    new Function('self', 'caches', 'fetch', 'setTimeout', src)(self, caches, fetchFn, () => undefined);
    let p: Promise<{ body: string; type: string }> | null = null;
    handlers.fetch!({ request: { method: 'GET', url: 'https://x/app/?bha-v=b.1', mode: 'navigate' }, respondWith: (x: Promise<{ body: string; type: string }>) => (p = x), waitUntil: () => undefined });
    return { reply: p!, calls };
  }
  it('화면 요청 = 같은 주소 · no-store · 주소 이동은 브라우저에 그대로 · 오프라인이면 캐시', async () => {
    const a = navFetch('ok');
    expect((await a.reply).body).toBe('new');
    expect(a.calls[0]).toEqual(['https://x/app/?bha-v=b.1', { cache: 'no-store', credentials: 'same-origin', redirect: 'manual' }]);
    expect((await navFetch('redirect').reply).type).toBe('opaqueredirect');
    expect((await navFetch('offline').reply).body).toBe('cached');
  });
  it('버전 파일은 워커가 손대지 않는다(꼬리 ?t= 가 붙어도)', () => {
    expect(read('scripts/sw-template.js')).toContain("url.pathname.endsWith('/version.json')");
  });
});
