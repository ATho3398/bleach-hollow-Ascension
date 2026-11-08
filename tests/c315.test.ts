// C.315 (GDD 195장): 앱 켜면 새 버전 알림이 바로 안 뜸 — 재현으로 확인한 세 원인의 수리.
// ① [나중에] 뒤에도 확인은 계속: 다시 꺼내면(resumed) 같은 빌드도 다시 알리고, 켜 둔 동안은 더 새 빌드만
// ② 확인 중 들어온 재확인은 끝난 뒤 한 번 더 · 실패 재시도 여러 번 ③ 켜자마자 답이 오면 게임 쪽이 붙기를 기다린다
// 워커: 다시 시작 화면(bha-v)은 네트워크를 더 기다림 · 숨은 화면은 옛 버전으로 오해해 다시 열지 않음
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HOST_WAIT_MS, MAX_RETRIES, RESTART_PARAM, RESTART_RETRY_MS, RESTART_WATCHDOG_MS, decideUpdate, dismissUpdate, dismissedBuildForTest, isUpdateReady, markUpdateReadyForTest, onUpdateReady, runUpdateCheck, type UpdateCheckDeps } from '../src/pwa';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

function deps(latest: string | null, o: { preGame?: boolean; dismissed?: string | null; resumed?: boolean } = {}) {
  const log: string[] = [];
  const m = new Map<string, string>();
  const d: UpdateCheckDeps = {
    current: 'old',
    fetchLatest: async () => latest,
    preGame: () => o.preGame ?? false,
    storage: { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) },
    banner: () => log.push('banner'),
    autoRestart: (t) => log.push(`auto:${t}`),
    dismissed: () => o.dismissed ?? null,
    resumed: o.resumed ?? false,
  };
  return { d, log };
}

describe('C.315 ① [나중에] 뒤에도 확인은 계속 (GDD 195장)', () => {
  it('판정: 닫은 같은 빌드는 켜 둔 동안 없음 · 다시 꺼내면 띠 · 더 새 빌드면 띠 · 닫은 적 없으면 예전과 같음', () => {
    const base = { current: 'a', latest: 'b', preGame: false, lastTried: null };
    expect(decideUpdate({ ...base, dismissed: 'b' })).toBe('none');
    expect(decideUpdate({ ...base, dismissed: 'b', resumed: true })).toBe('banner');
    expect(decideUpdate({ ...base, latest: 'c', dismissed: 'b' })).toBe('banner');
    expect(decideUpdate({ ...base, dismissed: null })).toBe('banner');
    expect(decideUpdate(base)).toBe('banner'); // 옛 호출(필드 없음) 그대로
    // 처음 화면에서 다시 꺼냈으면 자동(고리 방지 그대로)
    expect(decideUpdate({ ...base, preGame: true, dismissed: 'b', resumed: true })).toBe('auto');
    expect(decideUpdate({ ...base, preGame: true, lastTried: 'b', dismissed: 'b', resumed: true })).toBe('banner');
  });

  it('확인 흐름: 닫은 빌드 = 1분 확인엔 없음, 복귀 확인엔 띠', async () => {
    const a = deps('b', { dismissed: 'b' });
    expect(await runUpdateCheck(a.d)).toBe('none');
    expect(a.log).toEqual([]);
    const b = deps('b', { dismissed: 'b', resumed: true });
    expect(await runUpdateCheck(b.d)).toBe('banner');
    expect(b.log).toEqual(['banner']);
    const c = deps('c', { dismissed: 'b' });
    expect(await runUpdateCheck(c.d)).toBe('banner');
  });

  it('dismissUpdate: 준비 상태를 풀어 다음 확인이 다시 알릴 수 있고, 구독은 한 번 알린 뒤에도 남는다', () => {
    let n = 0;
    onUpdateReady(() => n++);
    markUpdateReadyForTest();
    expect(isUpdateReady()).toBe(true);
    expect(n).toBe(1);
    dismissUpdate();
    expect(isUpdateReady()).toBe(false);
    expect(dismissedBuildForTest()).toBeNull(); // 테스트에선 최신 빌드를 받은 적 없음
    markUpdateReadyForTest(); // 다시 꺼내서 또 알림
    expect(n).toBe(2);
    dismissUpdate();
  });

  it('[나중에] 버튼이 dismissUpdate 를 부른다 · 창 코드·튜토리얼 덮개(194장) 그대로', () => {
    const banner = read('src/ui/updateBanner.ts');
    expect(banner).toContain('dismissUpdate()');
    expect(banner).toContain('coverTutorials(layer)');
    expect(banner.indexOf('layer.remove();')).toBeLessThan(banner.indexOf('dismissUpdate();'));
  });
});

describe('C.315 ② 확인 유실·재시도 · ③ 게임 쪽 기다림', () => {
  it('확인 중 들어온 재확인은 끝난 뒤 한 번 더(pending), 실패는 MAX_RETRIES 번까지, 복귀·online 은 횟수 처음부터', () => {
    const pwa = read('src/pwa.ts');
    expect(MAX_RETRIES).toBeGreaterThanOrEqual(3);
    expect(pwa).toContain('pending = pending || force;');
    expect(pwa).toContain('if (!got && retries < MAX_RETRIES)');
    expect(pwa).toMatch(/const resume = \(\) => \{\s*retries = 0;\s*check\(true, true\);/);
    expect(pwa).toContain("if (document.visibilityState === 'visible') resume();");
    expect(pwa).toContain('if ((e as PageTransitionEvent).persisted) resume();');
    // 워커 알림·설치 완료 때의 확인은 resumed 아님(더 새 빌드일 때만 다시 알림)
    expect(pwa).toContain("e.ports[0]?.postMessage('ack');\n    check(true);");
  });

  it('다시 시작 이동이 RESTART_WATCHDOG_MS 안에 끝나지 않으면 한 번 더 연다 (옛 워커 교체 순간 요청이 버려지는 크롬 현상) — 워커 대기 15초보다 길게', () => {
    const pwa = read('src/pwa.ts');
    expect(RESTART_WATCHDOG_MS).toBeGreaterThan(15000);
    expect(pwa).toMatch(/location\.replace\(restartUrl\(location\.href, target\)\);\s*setTimeout\(go, waiting \? RESTART_RETRY_MS : RESTART_WATCHDOG_MS\);/);
    // 새 워커가 받는 중이면 설치가 끝날 때까지 기다렸다가 연다 · 대기(waiting) 워커가 있으면 첫 이동이 버려지므로 짧게 뒤 한 번 더
    expect(pwa).toContain('whenInstalled(go);');
    expect(pwa).toContain("if (w.state !== 'installing') fin();");
    expect(pwa).toContain('setTimeout(fin, RESTART_INSTALL_WAIT_MS);');
    expect(pwa).toContain('swReg = reg;');
    expect(pwa).toContain('setTimeout(go, waiting ? RESTART_RETRY_MS : RESTART_WATCHDOG_MS);');
    expect(RESTART_RETRY_MS).toBeLessThan(RESTART_WATCHDOG_MS);
  });

  it('켜자마자 답이 오면 게임 쪽(setUpdateHost)이 붙을 때까지 HOST_WAIT_MS 안에서 기다린다', () => {
    const pwa = read('src/pwa.ts');
    expect(HOST_WAIT_MS).toBeGreaterThanOrEqual(500);
    expect(pwa).toContain('await Promise.race([hostReady, new Promise((r) => setTimeout(r, HOST_WAIT_MS))]);');
    expect(pwa).toMatch(/export function setUpdateHost\(h: UpdateHost\): void \{\s*host = h;\s*hostResolve\(\);/);
  });
});

/** sw-template.js 를 가짜 워커에서 돌린다 — 네트워크는 끝나지 않고, setTimeout 은 걸린 시간을 기록만 한다 */
function navTimeout(url: string): number[] {
  const handlers: Record<string, (e: unknown) => void> = {};
  const waits: number[] = [];
  const self = { addEventListener: (k: string, h: (e: unknown) => void) => (handlers[k] = h), registration: { scope: 'https://x/app/' }, location: { origin: 'https://x' } };
  const caches = { match: async () => undefined, open: async () => ({ put: async () => undefined }) };
  const src = read('scripts/sw-template.js').replace('__VERSION__', 't').replace('__PRECACHE__', '[]');
  new Function('self', 'caches', 'fetch', 'setTimeout', src)(self, caches, () => new Promise(() => undefined), (_f: () => void, ms: number) => waits.push(ms));
  handlers.fetch!({ request: { method: 'GET', url, mode: 'navigate', headers: { has: () => false } }, respondWith: () => undefined, waitUntil: () => undefined });
  return waits;
}

describe('C.315 서비스 워커', () => {
  it('다시 시작 화면(bha-v)은 새 index 를 15초까지 기다리고, 보통 화면은 3초 (둘 다 그 뒤엔 캐시)', () => {
    expect(navTimeout('https://x/app/')).toEqual([3000]);
    expect(navTimeout(`https://x/app/?${RESTART_PARAM}=abc.1`)).toEqual([15000]);
    const sw = read('scripts/sw-template.js');
    expect(sw).toContain(`const RESTART_PARAM = '${RESTART_PARAM}';`); // pwa.ts 와 같은 이름
    expect(sw).toContain('Promise.race([network, timeout]).catch(cached)');
  });

  it('새 워커 활성화: 숨은(백그라운드) 화면은 답을 못 해도 다시 열지 않는다 — 보이는 옛 화면만', async () => {
    const handlers: Record<string, (e: unknown) => void> = {};
    const navigated: string[] = [];
    const client = (id: string, acks: boolean, vis: string) => ({
      url: `https://x/app/#${id}`,
      visibilityState: vis,
      postMessage: (_m: unknown, ports: MessagePort[]) => acks && ports[0]!.postMessage('ack'),
      navigate: (u: string) => (navigated.push(u), new Promise(() => undefined)),
    });
    const list = [client('old-visible', false, 'visible'), client('old-hidden', false, 'hidden'), client('new-hidden', true, 'hidden'), client('new-visible', true, 'visible')];
    const self = { addEventListener: (k: string, h: (e: unknown) => void) => (handlers[k] = h), registration: { scope: 'https://x/app/' }, location: { origin: 'https://x' }, clients: { claim: async () => undefined, matchAll: async () => list } };
    const caches = { keys: async () => [], delete: async () => true };
    const src = read('scripts/sw-template.js').replace('__VERSION__', 't').replace('__PRECACHE__', '[]');
    new Function('self', 'caches', 'fetch', 'setTimeout', src)(self, caches, () => Promise.reject(new Error('x')), (f: () => void, ms: number) => setTimeout(f, Math.min(ms, 50)));
    let done: Promise<unknown> | null = null;
    handlers.activate!({ waitUntil: (p: Promise<unknown>) => (done = p) });
    await done;
    expect(navigated).toEqual(['https://x/app/#old-visible']);
  });

  it('점검 스크립트가 남아 있다 (옛·새 빌드 바꿔 끼우기 · 백그라운드→복귀 · 완전 종료→재실행)', () => {
    const s = read('scripts/c315/repro.cjs');
    for (const k of ['S1', 'S3', 'S4', 'S5', 'S6', 'S7', 'hasTouch: dev.touch', "'visibilitychange'"]) expect(s).toContain(k);
  });
});
