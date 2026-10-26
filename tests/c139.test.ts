// C.139 (GDD 88장): 외부 분석 보고서 안정성 묶음 — 탭 잠금·SW 셸 승격·세이브 값 검증·구독 해제·프리로드 중복·단조 시계·모달 초점·수련 수치·hidden·종족 자동 수집
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { acquirePlayLock, PLAY_LOCK_ASK_MS } from '../src/tabLock';
import { forgetConfirmedChunks, isChunkStorageKey, CHUNK_PREFIX } from '../src/saveCodec';
import { loadSave, migrateSave, newSaveData, writeSave, SAVE_KEY } from '../src/game';
import { recoverFromBackup } from '../src/saveBackup';
import { slotBackupKey } from '../src/saveSlots';
import { TRAITS } from '../src/data/traits';
import { BALANCE } from '../src/config/balance';
import { createExpClock } from '../src/ui/bha/expClock';
import { preloadFrames, preloadedCount } from '../src/ui/bha/animPlayer';
import { nextFocusIndex } from '../src/ui/bha/modalFocus';
import { collectFactions, FACTIONS } from '../src/data/factions';
import { createChain } from '../src/engine/training';

const read = (p: string) => readFileSync(p, 'utf8');

function memStore(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), key: (i: number) => [...m.keys()][i] ?? null, get length() { return m.size; } };
}

describe('1 한 번에 한 창만 플레이', () => {
  /** navigator.locks 흉내: 이름별로 한 명만 쥔다 */
  function fakeLocks() {
    const held = new Set<string>();
    return {
      held,
      request: async (name: string, opts: { ifAvailable: boolean }, cb: (lock: unknown) => unknown) => {
        if (held.has(name)) return cb(null);
        held.add(name);
        return cb({ name });
      },
    };
  }
  it('locks: 첫 창은 쥐고, 두 번째 창은 못 쥔다(안내 화면)', async () => {
    const locks = fakeLocks();
    expect(await acquirePlayLock({ locks })).toBe(true);
    expect(await acquirePlayLock({ locks })).toBe(false);
  });
  it('BroadcastChannel: 먼저 연 창이 답하면 두 번째 창은 false, 아무도 없으면 true', async () => {
    const chans: { onmessage: ((e: { data: unknown }) => void) | null; postMessage: (m: unknown) => void; close: () => void; closed: boolean }[] = [];
    const channel = () => {
      const c = {
        onmessage: null as ((e: { data: unknown }) => void) | null,
        closed: false,
        postMessage: (m: unknown) => chans.filter((o) => o !== c && !o.closed).forEach((o) => o.onmessage?.({ data: m })),
        close: () => void (c.closed = true),
      };
      chans.push(c);
      return c;
    };
    const waits: number[] = [];
    const wait = async (ms: number) => void waits.push(ms);
    expect(await acquirePlayLock({ locks: null, channel, wait })).toBe(true);
    expect(await acquirePlayLock({ locks: null, channel, wait })).toBe(false);
    expect(waits).toEqual([PLAY_LOCK_ASK_MS, PLAY_LOCK_ASK_MS]);
  });
  it('잠금 수단이 없는 환경은 막지 않는다', async () => {
    expect(await acquirePlayLock({ locks: null, channel: null })).toBe(true);
  });
  it('main 은 잠금을 쥔 창에서만 앱을 시작하고, 못 쥐면 안내 화면', () => {
    const main = read('src/main.ts');
    expect(main).toContain('acquirePlayLock().then((ok) => (ok ? startApp(app) : tabBlockedView(app');
    expect(read('src/ui/tabBlockedView.ts')).toContain("title: '다른 창에서 실행 중'");
  });
  it('다른 창이 덩어리를 바꾸면(storage 이벤트) 확인해 둔 해시를 잊고 다음 저장이 덩어리를 다시 쓴다', () => {
    expect(isChunkStorageKey(`${CHUNK_PREFIX}abc`)).toBe(true);
    expect(isChunkStorageKey(null)).toBe(true);
    expect(isChunkStorageKey(SAVE_KEY)).toBe(false);
    // 긴 기록 세이브를 저장 → 덩어리 하나를 지운다(다른 창의 수거 흉내) → 잊은 뒤 다시 저장하면 덩어리가 되살아나 다시 열린다
    const st = memStore();
    const s = newSaveData('hollow', 1_000);
    for (let i = 0; i < 120; i++) s.runLog.battles.push({ ...(s.runLog.battles[0] ?? {}), enemyId: `e${i}`, at: i } as never);
    expect(writeSave(st, s)).toBe(true);
    const chunk = [...st.m.keys()].find((k) => k.startsWith(CHUNK_PREFIX));
    expect(chunk).toBeDefined();
    st.m.delete(chunk!);
    forgetConfirmedChunks(st);
    expect(writeSave(st, s)).toBe(true);
    expect(st.m.has(chunk!)).toBe(true);
    expect(loadSave(st)).not.toBeNull();
    expect(read('src/ui/app.ts')).toContain("window.addEventListener('storage'");
  });
});

/** sw-template.js 를 가짜 워커에서 돌린다: html = 네트워크가 주는 새 화면, cached = 캐시에 이미 있는 주소 */
function runSw(html: string, cached: string[]) {
  const store = new Map<string, string>([['https://x/app/', 'old-index'], ...cached.map((u) => [u, 'x'] as [string, string])]);
  const handlers: Record<string, (e: unknown) => void> = {};
  const order: string[] = [];
  const self = { addEventListener: (k: string, h: (e: unknown) => void) => (handlers[k] = h), registration: { scope: 'https://x/app/' }, location: { origin: 'https://x' } };
  const res = (body: string) => ({ ok: true, body, headers: undefined, clone: () => res(body), text: async () => body });
  const cache = {
    match: async (u: string) => (order.push(`match ${u}`), store.has(u) ? res(store.get(u)!) : undefined),
    put: async (u: string, r: { text: () => Promise<string> }) => (order.push(`put ${u}`), void store.set(u, await r.text())),
  };
  const caches = { match: async (u: string) => (store.has(u) ? res(store.get(u)!) : undefined), open: async () => cache };
  const src = read('scripts/sw-template.js').replace('__VERSION__', 't').replace('__PRECACHE__', '[]');
  new Function('self', 'caches', 'fetch', 'setTimeout', src)(self, caches, () => Promise.resolve(res(html)), () => undefined);
  const life: Promise<unknown>[] = [];
  let reply: Promise<{ body: string }> | null = null;
  handlers.fetch!({ request: { method: 'GET', url: 'https://x/app/', mode: 'navigate' }, respondWith: (p: Promise<{ body: string }>) => (reply = p), waitUntil: (p: Promise<unknown>) => life.push(p) });
  return { reply: reply!, store, life, order };
}

describe('2 서비스 워커: 새 HTML 은 그 자산이 캐시에 다 있을 때만 셸로', () => {
  const html = '<script type="module" src="./assets/index-B.js"></script><link rel="stylesheet" href="./assets/index-B.css">';
  it('새 버전 자산이 아직 없으면: 화면은 새것으로 열리지만 오프라인 셸은 옛것 그대로', async () => {
    const r = runSw(html, ['https://x/app/assets/index-B.css']);
    expect((await r.reply).body).toBe(html); // 네트워크 먼저(C.130) 그대로
    await Promise.all(r.life); // 셸 승격 판단은 waitUntil 로 수명 보장
    expect(r.life.length).toBe(1);
    expect(r.store.get('https://x/app/')).toBe('old-index');
    expect(r.order.some((o) => o.startsWith('put'))).toBe(false);
  });
  it('자산이 다 캐시돼 있으면 셸로 승격 — 자산 확인이 put 보다 먼저', async () => {
    const r = runSw(html, ['https://x/app/assets/index-B.js', 'https://x/app/assets/index-B.css']);
    await r.reply;
    await Promise.all(r.life);
    expect(r.store.get('https://x/app/')).toBe(html);
    const put = r.order.indexOf('put https://x/app/');
    expect(put).toBeGreaterThan(r.order.indexOf('match https://x/app/assets/index-B.js'));
    expect(put).toBeGreaterThan(r.order.indexOf('match https://x/app/assets/index-B.css'));
  });
  it('일반 자산 캐시 쓰기도 waitUntil 로', () => {
    const sw = read('scripts/sw-template.js');
    expect(sw).toContain('event.waitUntil(caches.open(CACHE).then((c) => c.put(req, copy))');
    expect(sw).not.toContain('caches.open(CACHE).then((c) => c.put(shell, copy))');
  });
});

describe('3 세이브 내부 값 최소 검증 → 실패면 백업 복구', () => {
  const good = () => JSON.parse(JSON.stringify(newSaveData('hollow', 1_000)));
  it('정상 세이브는 그대로 열린다', () => {
    expect(migrateSave(good())).not.toBeNull();
  });
  it('능력치 키 누락·NaN·문자열이면 거부', () => {
    for (const bad of [{}, { hp: 0, atk: 0, int: 0, def: 0, spr: 0, spd: 'x' }]) {
      const s = good();
      s.evolution.ev = bad;
      expect(migrateSave(s)).toBeNull();
    }
  });
  it('단계가 정수가 아니거나 범위 밖이면 거부', () => {
    for (const t of [1.5, -1, 5, 99]) {
      const s = good();
      s.evolution.tierIndex = t;
      expect(migrateSave(s)).toBeNull();
    }
  });
  it('없는 특성 id 를 가졌거나 장착했으면 거부, 슬롯 길이가 틀려도 거부', () => {
    const a = good();
    a.build.owned = ['없는-특성'];
    expect(migrateSave(a)).toBeNull();
    const b = good();
    b.build.slots = ['없는-특성', null, null];
    expect(migrateSave(b)).toBeNull();
    const c = good();
    c.build.slots = [null];
    expect(migrateSave(c)).toBeNull();
    const d = good();
    d.build.owned = [TRAITS[0]!.id];
    d.build.slots = Array.from({ length: BALANCE.absorb.slotCount }, (_, i) => (i === 0 ? TRAITS[0]!.id : null));
    expect(migrateSave(d)).not.toBeNull();
  });
  it('쉬는 트랙도 같은 검사(틀린 트랙은 버린다)', () => {
    const s = good();
    const other = JSON.parse(JSON.stringify(newSaveData('shinigami', 1_000)));
    other.evolution.ev = {};
    s.otherTracks = [other];
    expect(migrateSave(s)!.otherTracks).toHaveLength(0);
  });
  it('본 세이브가 값 검사에 걸리면 기존 백업 복구 경로로 열린다', () => {
    const bad = good();
    bad.evolution.ev = {};
    const st = memStore({ [SAVE_KEY]: JSON.stringify(bad), [slotBackupKey(1)]: JSON.stringify(good()) });
    expect(loadSave(st)).toBeNull();
    expect(recoverFromBackup(st, 1)).toBe(true);
    expect(loadSave(st)).not.toBeNull();
  });
});

describe('4·6 화면 종료 때 구독 해제', () => {
  it('전투·원정: 끝나는 모든 길이 hold 구독을 푸는 한 함수로', () => {
    const b = read('src/ui/battleView.ts');
    expect(b).toContain('const stop = (): void => {');
    expect(b).not.toContain('stopped = true;\n      if (s.status');
    expect(b.match(/stopped = true;/g)).toHaveLength(1); // stop() 안의 한 곳뿐
    const e = read('src/ui/expeditionView.ts');
    expect(e).toContain('function dispose(): void {');
    expect(e.match(/dead = true;/g)).toHaveLength(1); // dispose() 안의 한 곳뿐
    expect(e).toContain('unhold();');
  });
  it('설정: window 리스너 3종은 화면 신호(AbortSignal)로, 다음 화면이 그려지면 풀린다. 전체 화면 미지원이면 구독도 없다', () => {
    const s = read('src/ui/settingsView.ts');
    expect(s).toContain('window.addEventListener(type, paint, { signal })');
    expect(s).toContain('if (fsPanels.length > 0) listen(FULLSCREEN_EVENT, paintFs);');
    expect(s).not.toContain('window.removeEventListener');
    expect(read('src/ui/bha/dom.ts')).toContain('endScreen(root);');
  });
});

describe('5 프레임 프리로드 중복 방지', () => {
  it('같은 애니를 여러 번 바인딩해도 늘지 않는다', () => {
    class FakeImage { src = ''; decode = () => Promise.resolve(); }
    const g = globalThis as unknown as { Image?: unknown };
    const prev = g.Image;
    g.Image = FakeImage;
    try {
      const anims = { idle: { frames: ['a/1.webp', 'a/2.webp'], fps: 8, loop: true } } as never;
      const before = preloadedCount();
      preloadFrames(anims);
      preloadFrames(anims);
      preloadFrames(anims);
      expect(preloadedCount() - before).toBe(2);
      preloadFrames({ walk: { frames: ['a/2.webp', 'a/3.webp'], fps: 8, loop: true } } as never);
      expect(preloadedCount() - before).toBe(3);
    } finally {
      g.Image = prev;
    }
  });
});

describe('8 원정 시계: 시각이 뒤로 점프해도 남은 시간이 늘지 않는다', () => {
  it('rearm 사이 now 가 1시간 뒤로 가도 예약은 남은 시간 이하', () => {
    let t = 10_000;
    const timers: { ms: number }[] = [];
    const clock = createExpClock({ speed: () => 1, blocked: () => false, now: () => t, setTimer: (_f, ms) => (timers.push({ ms }), timers.length), clearTimer: () => undefined });
    clock.set('step', 1_000, () => undefined);
    t = -3_590_000; // 벽시계를 한 시간 되돌림
    clock.rearm();
    expect(timers.at(-1)!.ms).toBeLessThanOrEqual(1_000);
    t += 400;
    clock.rearm();
    expect(timers.at(-1)!.ms).toBe(600);
  });
  it('기본 시계는 단조 시계(performance.now), 원정 감시·놀던 시간도', () => {
    expect(read('src/ui/bha/expClock.ts')).toContain('const now = d.now ?? monoNow;');
    expect(read('src/ui/expeditionView.ts')).not.toContain('Date.now()');
    expect(read('src/ui/app.ts')).toContain('let playTick = monoNow();');
  });
});

describe('9 공용 모달 초점', () => {
  it('Tab 순환: 끝 → 처음, Shift 처음 → 끝, 밖에서 들어오면 처음', () => {
    expect(nextFocusIndex(1, 2, false)).toBe(0);
    expect(nextFocusIndex(0, 2, false)).toBe(1);
    expect(nextFocusIndex(0, 2, true)).toBe(1);
    expect(nextFocusIndex(-1, 2, false)).toBe(0);
    expect(nextFocusIndex(-1, 0, false)).toBe(-1);
  });
  it('확인창: 붙인 뒤 초점 가둠, 닫을 때 풀기(배경 inert 해제·초점 복귀) — 기기 등록은 그대로', () => {
    const c = read('src/ui/confirmDialog.ts');
    expect(c.indexOf('untrap = trapModalFocus(layer)')).toBeLessThan(c.indexOf('unregister = registerLayer(layer, no)'));
    expect(c).toContain('untrap();');
    const m = read('src/ui/bha/modalFocus.ts');
    expect(m).toContain("setAttribute('inert', '')");
    expect(m).toContain('prev.focus(');
  });
});

describe('11 수련 미니게임 수치는 balance.ts 로 (값 그대로)', () => {
  it('엔진에 옮긴 숫자가 남지 않고, 설정값은 옛 값', () => {
    const g = read('src/engine/training/games.ts');
    for (const lit of ['0.35', '* 0.55', '0.8 + nextFloat', 'nextSpawnAt: 0.5']) expect(g).not.toContain(lit);
    const TX = BALANCE.provisional.training;
    expect([TX.duel.doubleGapSeconds, TX.duel.fakeAtShare, TX.dodge.spawnJitter, TX.chain.firstSpawnSeconds, TX.chain.spawnJitter]).toEqual([0.35, 0.55, { base: 0.8, range: 0.4 }, 0.5, { base: 0.8, range: 0.4 }]);
  });
  it('먹이사슬 첫 등장은 0.5초', () => {
    expect(createChain(4, 7).nextSpawnAt).toBe(0.5);
  });
});

describe('12 전투 HUD hidden 은 바뀔 때만', () => {
  it('프레임 갱신의 칩 hidden 대입이 setHidden 으로', () => {
    const b = read('src/ui/battleView.ts');
    for (const n of ['minionChip', 'voidChip.root', 'chain3Chip.root', 'libChipRoot.root']) expect(b).toContain(`setHidden(${n}, `);
    expect(read('src/ui/bha/battle.ts')).toContain('if (node.hidden !== hidden) node.hidden = hidden;');
  });
});

describe('14 종족 설정 자동 수집', () => {
  it('폴더의 json 을 파일 이름 순으로 모은다 (지금 = 호로·사신), 테마 CSS 도 종족마다 있다', () => {
    expect(FACTIONS.map((f) => f.id)).toEqual(['hollow', 'shinigami']);
    for (const f of FACTIONS) expect(existsSync(`src/ui/bha/design-system/theme-${f.theme}.css`)).toBe(true);
    expect(read('src/main.ts')).toContain("import './ui/bha/design-system/themes';");
    expect(read('src/main.ts')).not.toContain('theme-hollow.css');
  });
  it('세 번째 종족 = json 하나 추가로 목록에 들어간다', () => {
    const hollow = JSON.parse(read('src/data/factions/hollow.json'));
    const list = collectFactions({ './a.json': { default: hollow }, './z.json': { default: { ...hollow, id: 'third' } } });
    expect(list.map((f) => f.id)).toEqual(['hollow', 'third']);
  });
  it('필수 필드 누락·id 중복이면 어느 파일인지 알려 주며 멈춘다', () => {
    const hollow = JSON.parse(read('src/data/factions/hollow.json'));
    const { theme: _t, ...noTheme } = hollow;
    expect(() => collectFactions({ './x.json': { default: noTheme } })).toThrow(/x\.json/);
    expect(() => collectFactions({ './a.json': { default: hollow }, './b.json': { default: hollow } })).toThrow(/중복/);
  });
});
