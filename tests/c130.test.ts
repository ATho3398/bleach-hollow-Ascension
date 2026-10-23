// C.130: '강적 아닌 독 일반'이 C.129 배포 뒤에도 폰에서 보이던 일 — 엔진은 75장대로였고(아래 전수 가드),
// 서비스 워커가 게임 화면을 캐시 먼저 줘서 배포 뒤 첫 실행이 늘 옛 index·옛 스크립트(C.127 이전 = 숨김 없음)로 떴고,
// 백그라운드에서 다시 꺼낸 앱은 업데이트 확인도 안 했다.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SPECIAL_ELEMENT_IDS } from '../src/data/elements';
import { tilesFor } from '../src/data/tiles';
import { STORY_CONTENT } from '../src/data/story';
import { advance, chooseContinue, chooseRelease, chooseReturn, createExpedition, finishBattle, finishRest, startBattle, type ExpeditionState } from '../src/engine/expedition';
import { botDraft, botEvent } from '../src/engine/expedition/bot';
import { createRng, nextFloat } from '../src/engine/rng';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

/** 원정을 끝까지 돌며(전투는 바로 이김) 75장 규칙 밖 혈·독·허 조우를 모은다 */
function leaksOf(exp: ExpeditionState, laps: number, tiles: string[] | null, seed: number): string[] {
  const rng = createRng(seed);
  const out: string[] = [];
  for (let g = 0; exp.phase !== 'ended' && g < 5000; g++) {
    if (exp.phase === 'moving') {
      if (tiles) for (let c = 1; c < exp.slots.length; c++) if (!exp.slots[c] && nextFloat(rng) < 0.5) exp.slots[c] = tiles[Math.floor(nextFloat(rng) * tiles.length)]!;
      advance(exp);
    } else if (exp.phase === 'battle') {
      const p = exp.pending!;
      const open = p.elite || !!p.boss || exp.difficulty >= 3 || exp.mutation === 'void-night' || (exp.mutation === 'blood-moon' && p.enemy.element === 'blood');
      if (SPECIAL_ELEMENT_IDS.includes(p.enemy.element) && !open) out.push(`${p.enemy.id} tile=${p.tileId} mut=${exp.mutation} ★${exp.difficulty}`);
      const b = startBattle(exp);
      b.enemy.hp = 0;
      b.status = 'won';
      finishBattle(exp, b);
    } else if (exp.phase === 'absorb') chooseRelease(exp);
    else if (exp.phase === 'rest') finishRest(exp);
    else if (exp.phase === 'event') botEvent(exp);
    else if (exp.phase === 'nest-choice') {
      if (exp.lap < laps) {
        botDraft(exp);
        chooseContinue(exp);
      } else chooseReturn(exp);
    }
  }
  return out;
}

describe('C.130 엔진 전수: ★1~2 일반 칸에 혈·독·허 0 (75장)', () => {
  it('첫 원정 튜토리얼 · 자유 ★1·★2(사냥터 전부·타일 변수·아무 타일 조합·메아리·조합·변이) · 스토리 화 전부', () => {
    const leaks: string[] = [];
    let stories = 0;
    for (const f of ['hollow', 'shinigami']) {
      const tiles = tilesFor(f).map((t) => t.id);
      for (let s = 1; s <= 40; s++) leaks.push(...leaksOf(createExpedition({ factionId: f, seed: s, hunger: 0, condition: 100, deck: [], tutorial: true }), 1, null, s));
      for (const d of [1, 2]) for (const groundId of ['outskirts', 'canyon', 'forest']) for (const tilesLocked of [false, true]) for (let s = 1; s <= 12; s++) {
        const exp = createExpedition({ factionId: f, seed: s * 31 + d, hunger: 0, condition: 100, deck: tiles.slice(0, 6), difficulty: d, groundId, tileVariants: true, tilesLocked, maxLaps: 6 });
        leaks.push(...leaksOf(exp, 5, tiles, s));
      }
      for (const ch of STORY_CONTENT.filter((c) => c.factionId === f)) for (const ep of ch.episodes) for (let s = 1; s <= 3; s++) {
        const exp = createExpedition({ factionId: f, seed: s, hunger: 0, condition: 100, deck: tiles.slice(0, 6), tileVariants: true, story: { chapterId: ch.chapterId, episodeId: ep.id } });
        leaks.push(...leaksOf(exp, 9, null, s));
        stories++;
      }
    }
    expect(stories).toBeGreaterThan(10);
    expect(leaks).toEqual([]);
  });
});

/** sw-template.js 를 가짜 서비스 워커 환경에서 실행해 화면 열기(navigate) 응답을 본다 */
function runSw(network: 'new' | 'offline' | 'slow') {
  const store = new Map<string, string>([['https://x/app/', 'old-index']]);
  const handlers: Record<string, (e: unknown) => void> = {};
  const self = { addEventListener: (k: string, h: (e: unknown) => void) => (handlers[k] = h), registration: { scope: 'https://x/app/' }, location: { origin: 'https://x' }, skipWaiting: () => undefined, clients: { claim: () => undefined } };
  const res = (body: string) => ({ ok: true, body, clone: () => res(body) });
  const caches = {
    match: async (u: string) => (store.has(u) ? res(store.get(u)!) : undefined),
    open: async () => ({ put: async (u: string, r: { body: string }) => void store.set(u, r.body), addAll: async () => undefined }),
    keys: async () => [],
  };
  const fetchFn = (): Promise<unknown> =>
    network === 'new' ? Promise.resolve(res('new-index')) : network === 'offline' ? Promise.reject(new Error('offline')) : new Promise(() => undefined);
  const src = read('scripts/sw-template.js').replace('__VERSION__', 't').replace('__PRECACHE__', '[]');
  new Function('self', 'caches', 'fetch', 'setTimeout', src)(self, caches, fetchFn, (f: () => void) => f());
  let reply: Promise<{ body: string }> | null = null;
  handlers.fetch!({ request: { method: 'GET', url: 'https://x/app/?a=1', mode: 'navigate' }, respondWith: (p: Promise<{ body: string }>) => (reply = p) });
  return { reply: reply!, store };
}

describe('C.130 서비스 워커: 새 배포가 바로 열린다', () => {
  it('온라인이면 게임 화면은 네트워크의 새 index (옛 캐시가 있어도) — 그리고 캐시를 새것으로 바꾼다', async () => {
    const { reply, store } = runSw('new');
    expect((await reply).body).toBe('new-index');
    await new Promise((r) => setTimeout(r, 0));
    expect(store.get('https://x/app/')).toBe('new-index');
  });

  it('오프라인·응답 없음이면 캐시의 게임 화면 (오프라인 플레이 60장 그대로)', async () => {
    expect((await runSw('offline').reply).body).toBe('old-index');
    expect((await runSw('slow').reply).body).toBe('old-index');
  });

  it('새 워커 활성화: 답하는 화면(C.130 이후)은 그대로 두고 답 없는 옛 화면만 다시 연다 — 이동을 기다리지 않아 활성화와 서로 막히지 않는다', async () => {
    const handlers: Record<string, (e: unknown) => void> = {};
    const navigated: string[] = [];
    const client = (id: string, acks: boolean) => ({
      url: `https://x/app/#${id}`,
      postMessage: (_m: unknown, ports: MessagePort[]) => acks && ports[0]!.postMessage('ack'),
      navigate: (u: string) => (navigated.push(u), new Promise(() => undefined)), // 이동은 활성화가 끝나야 끝난다(끝나지 않는 약속으로 흉내)
    });
    const list = [client('old', false), client('new', true)];
    const self = { addEventListener: (k: string, h: (e: unknown) => void) => (handlers[k] = h), registration: { scope: 'https://x/app/' }, location: { origin: 'https://x' }, clients: { claim: async () => undefined, matchAll: async () => list } };
    const caches = { keys: async () => [], delete: async () => true };
    const src = read('scripts/sw-template.js').replace('__VERSION__', 't').replace('__PRECACHE__', '[]');
    new Function('self', 'caches', 'fetch', 'setTimeout', src)(self, caches, () => Promise.reject(new Error('x')), (f: () => void, ms: number) => setTimeout(f, Math.min(ms, 50)));
    let done: Promise<unknown> | null = null;
    handlers.activate!({ waitUntil: (p: Promise<unknown>) => (done = p) });
    await done; // 이동이 끝나지 않아도 활성화는 끝난다
    expect(navigated).toEqual(['https://x/app/#old']);
  });

  it('앱을 다시 꺼낼 때·켜 둔 동안 업데이트를 확인하고, 받으면 어느 화면에서든 [다시 시작] 띠', () => {
    const pwa = read('src/pwa.ts');
    expect(pwa).toContain("'visibilitychange'");
    expect(pwa).toContain('reg.update()');
    expect(pwa).toContain('setInterval(check, UPDATE_CHECK_MS)');
    expect(read('src/main.ts')).toContain('mountUpdateBanner();');
    const banner = read('src/ui/updateBanner.ts');
    expect(banner).toContain("label: '다시 시작'");
    expect(banner).toContain('onUpdateReady(');
    expect(pwa).toContain("'bha-sw-updated'");
    expect(pwa).toContain("e.ports[0]?.postMessage('ack')");
  });
});
