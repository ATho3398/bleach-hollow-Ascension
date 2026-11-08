// C.325 로그인 보강 (GDD 199장 1~5): 팝업만·SDK 미리 받기 · 처음 로그인 창 기억 · 게스트(익명) · 계정 연동(연결/옮김/거절) · 한 기기만(차지·막힘·되찾기·복귀·연결 판정) · 규칙 파일
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AUTH_ERROR_TEXT, CLOUD_GATE_KEY, CLOUD_PREF_KEY, CLOUD_RECLAIM_MIN_MS, CloudSync, deviceLabel, LINK_TAKEN_TEXT, makeCloudDoc, markLoginGateDone, needsLoginGate, sanitizeActive,
  type ActiveDevice, type CloudBackend, type CloudDoc, type CloudUser, type LinkResult,
} from '../src/cloudSave';
import { newSaveData, type SaveData } from '../src/game';
import { touchSlot, writeSlotSave } from '../src/saveSlots';

const read = (p: string) => readFileSync(p, 'utf8');

function memStore(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
    m,
  };
}
type Store = ReturnType<typeof memStore>;

const GOOGLE: CloudUser = { uid: 'u1', name: '테스터', email: 't@example.com', anonymous: false };
const GUEST: CloudUser = { uid: 'g1', name: null, email: null, anonymous: true };

/** 가짜 Firebase: 로그인 상태 · 세이브 문서 · 활성 기기 문서 · 연동 각본(taken = 그 계정에 세이브 있음, exists = 계정만 있음) · 끊기 */
function fakeBackend(init: { user?: CloudUser | null; doc?: CloudDoc | null; active?: ActiveDevice | null; offline?: boolean; popupBlocked?: boolean; link?: 'linked' | 'taken' | 'exists' | 'error' } = {}) {
  let user: CloudUser | null = init.user ?? null;
  let doc: CloudDoc | null = init.doc ?? null;
  let active: ActiveDevice | null = init.active ?? null;
  const authSubs = new Set<(u: CloudUser | null) => void>();
  const docSubs = new Set<(d: CloudDoc | null) => void>();
  const activeSubs = new Set<(d: ActiveDevice | null) => void>();
  const writes: CloudDoc[] = [];
  const activeWrites: ActiveDevice[] = [];
  const state = { offline: init.offline ?? false, loads: 0, popupBlocked: init.popupBlocked ?? false, link: init.link ?? 'linked', switched: 0, guestSignIns: 0 };
  const setUser = (u: CloudUser | null): void => {
    user = u;
    for (const cb of authSubs) cb(u);
  };
  const net = () => {
    if (state.offline) throw Object.assign(new Error('offline'), { code: 'unavailable' });
  };
  const backend: CloudBackend = {
    watchAuth: (cb) => {
      authSubs.add(cb);
      cb(user);
      return () => authSubs.delete(cb);
    },
    signIn: async () => {
      if (state.popupBlocked) throw Object.assign(new Error('x'), { code: 'auth/popup-blocked' });
      setUser(GOOGLE);
    },
    signInGuest: async () => {
      state.guestSignIns++;
      setUser(GUEST);
    },
    signInEmail: async (email) => setUser({ uid: `e-${email}`, name: null, email, anonymous: false }),
    signUpEmail: async (email) => setUser({ uid: `e-${email}`, name: null, email, anonymous: false }),
    resetPassword: async () => {},
    link: async (kind, email): Promise<LinkResult> => {
      if (state.link === 'error') throw Object.assign(new Error('x'), { code: 'auth/popup-blocked' });
      const target: CloudUser = kind === 'google' ? GOOGLE : { uid: `e-${email}`, name: null, email: email ?? null, anonymous: false };
      if (state.link === 'linked') {
        const linked = { ...target, uid: user!.uid };
        user = linked; // 같은 uid — onAuthStateChanged 는 안 울린다(Firebase 와 같게)
        return { kind: 'linked', user: linked };
      }
      return {
        kind: 'in-use',
        hasSave: state.link === 'taken',
        switchTo: async () => {
          state.switched++;
          setUser(target);
        },
      };
    },
    signOut: async () => setUser(null),
    read: async () => {
      net();
      return doc;
    },
    write: async (_uid, d) => {
      net();
      doc = d;
      writes.push(d);
    },
    watchDoc: (_uid, cb) => {
      docSubs.add(cb);
      return () => docSubs.delete(cb);
    },
    readActive: async () => {
      net();
      return active;
    },
    writeActive: async (_uid, d) => {
      net();
      active = d;
      activeWrites.push(d);
    },
    watchActive: (_uid, cb) => {
      activeSubs.add(cb);
      return () => activeSubs.delete(cb);
    },
  };
  return {
    backend, writes, activeWrites, state,
    get offline() { return state.offline; },
    set offline(v: boolean) { state.offline = v; },
    get loads() { return state.loads; },
    set loads(v: number) { state.loads = v; },
    get user() { return user; },
    get active() { return active; },
    /** 다른 기기가 차지했다(서버 확정 스냅샷) */
    otherClaims(d: Partial<ActiveDevice> = {}) {
      active = { device: 'other-device', at: 99_000, name: 'Android Chrome', build: 'other', ...d };
      for (const cb of activeSubs) cb(active);
    },
    /** 내 쓰기가 서버에서 확정됐다는 스냅샷 */
    echoActive() {
      for (const cb of activeSubs) cb(active);
    },
  };
}

function harness(store: Store, fb: ReturnType<typeof fakeBackend>, o: { slot?: number; save?: SaveData | null; online?: () => boolean } = {}) {
  const blocked: ActiveDevice[] = [];
  const toasts: string[] = [];
  const applied: number[] = [];
  const conflicts: number[] = [];
  let unblocked = 0;
  const cur = { slot: o.slot ?? 0, save: o.save ?? null };
  const sync = new CloudSync({
    storage: store,
    loadBackend: async () => {
      fb.loads++;
      return fb.backend;
    },
    build: 'test-build',
    current: () => cur,
    onConflict: (c) => conflicts.push(c.slot),
    onApplied: (n) => applied.push(n),
    notify: (t) => toasts.push(t),
    deviceName: 'Windows Chrome',
    onBlocked: (by) => blocked.push(by),
    onUnblocked: () => unblocked++,
    online: o.online ?? (() => !fb.offline),
    now: () => Date.now(),
  });
  return { sync, blocked, toasts, applied, conflicts, cur, get unblocked() { return unblocked; } };
}

const flushAsync = async (n = 8) => {
  for (let i = 0; i < n; i++) await Promise.resolve();
};

describe('C.325 로그인 — 팝업만 · SDK 미리 받기 (GDD 199장 1)', () => {
  it('signIn 은 팝업 한 가지(리다이렉트 인자 없음) · popup-blocked 는 "한 번 더 누른다" 문구, quiet 면 토스트 없이', async () => {
    const fb = fakeBackend({ popupBlocked: true });
    const h = harness(memStore(), fb);
    expect(await h.sync.signIn({ quiet: true })).toBe(AUTH_ERROR_TEXT['auth/popup-blocked']);
    expect(h.toasts).toEqual([]);
    expect(await h.sync.signIn()).toBe(AUTH_ERROR_TEXT['auth/popup-blocked']);
    expect(h.toasts).toEqual(['로그인하지 못했다']);
    fb.state.popupBlocked = false;
    expect(await h.sync.signIn()).toBeNull();
    expect(h.sync.state().user?.uid).toBe('u1');
  });
  it('warm 은 로그인 없이 SDK 만 받는다(온라인일 때, 한 번) · 오프라인이면 받지 않는다', async () => {
    const fb = fakeBackend();
    const h = harness(memStore(), fb);
    h.sync.warm();
    h.sync.warm();
    await flushAsync();
    expect(fb.loads).toBe(1);
    expect(h.sync.state().status).toBe('signed-out');
    const fb2 = fakeBackend({ offline: true });
    const h2 = harness(memStore(), fb2);
    h2.sync.warm();
    await flushAsync();
    expect(fb2.loads).toBe(0);
  });
  it('Firebase 층: 리다이렉트 로그인을 쓰지 않고(getRedirectResult 는 옛 빌드 복귀용 한 번만) 팝업·익명·연동·devices 를 쓴다', () => {
    const fbSrc = read('src/cloudFirebase.ts');
    expect(fbSrc).not.toContain('signInWithRedirect(');
    expect(fbSrc).toContain('signInWithPopup(');
    expect(fbSrc).toContain('signInAnonymously(');
    expect(fbSrc).toContain('linkWithPopup(');
    expect(fbSrc).toContain('linkWithCredential(');
    expect(fbSrc).toContain('inMemoryPersistence');
    expect(fbSrc).toContain('DEVICE_COLLECTION');
    expect(fbSrc).toContain('snap.metadata.fromCache');
    expect(read('src/config/firebase.ts')).toContain("DEVICE_COLLECTION = 'devices'");
    // SDK 는 여전히 동적 import 만 (cloudSave·app·cloudView 에 정적 import 없음)
    for (const f of ['src/cloudSave.ts', 'src/ui/app.ts', 'src/ui/cloudView.ts']) expect(read(f)).not.toMatch(/^import .* from 'firebase\//m);
  });
});

describe('C.325 처음 로그인 창 기억 (GDD 199장 2)', () => {
  it('로그인 기억 없음 + 고른 적 없음 + 온라인 → 띄운다. 오프라인·기억 있음·한 번 고름 → 안 띄운다', () => {
    const s = memStore();
    expect(needsLoginGate(s, true)).toBe(true);
    expect(needsLoginGate(s, false)).toBe(false);
    markLoginGateDone(s, 123);
    expect(needsLoginGate(s, true)).toBe(false);
    expect(JSON.parse(s.getItem(CLOUD_GATE_KEY)!)).toEqual({ at: 123 });
    const s2 = memStore({ [CLOUD_PREF_KEY]: JSON.stringify(GOOGLE) });
    expect(needsLoginGate(s2, true)).toBe(false);
  });
  it('로그아웃하면 고른 기억을 지운다 — 다음에 켤 때 다시 고른다', async () => {
    const store = memStore();
    markLoginGateDone(store);
    const fb = fakeBackend({ user: GOOGLE });
    store.setItem(CLOUD_PREF_KEY, JSON.stringify(GOOGLE));
    const h = harness(store, fb);
    h.sync.start();
    await flushAsync();
    await h.sync.signOut();
    expect(store.getItem(CLOUD_GATE_KEY)).toBeNull();
    expect(store.getItem(CLOUD_PREF_KEY)).toBeNull();
    expect(needsLoginGate(store, true)).toBe(true);
  });
});

describe('C.325 게스트 · 계정 연동 (GDD 199장 3)', () => {
  it('게스트 = 익명 로그인: 기억에 anonymous, 상태는 로그인과 같고 기기 세이브를 클라우드에 올린다', async () => {
    const store = memStore();
    const save = newSaveData('hollow', 1);
    writeSlotSave(store, save, 1);
    touchSlot(store, 1, 1000);
    const fb = fakeBackend();
    const h = harness(store, fb);
    expect(await h.sync.signInGuest()).toBeNull();
    await flushAsync(12);
    expect(fb.state.guestSignIns).toBe(1);
    expect(h.sync.state().user).toEqual(GUEST);
    expect(JSON.parse(store.getItem(CLOUD_PREF_KEY)!).anonymous).toBe(true);
    expect(fb.writes.length).toBe(1);
    expect(fb.activeWrites.length).toBe(1); // 차지도 한다 (199장 4 — 게스트도 같은 규칙)
    expect(h.toasts[0]).toBe('게스트로 시작했다');
    expect(h.sync.state().status).toBe('synced');
  });
  it('연동 성공: 같은 uid 에 붙어 사용자만 바뀐다(세이브 그대로) · 게스트가 아니면 거절', async () => {
    const store = memStore();
    const fb = fakeBackend({ link: 'linked' });
    const h = harness(store, fb);
    expect((await h.sync.linkAccount('google')).ok).toBe(false); // 로그인 전
    await h.sync.signInGuest();
    await flushAsync(10);
    const r = await h.sync.linkAccount('google');
    expect(r).toEqual({ ok: true, moved: false });
    expect(h.sync.state().user).toEqual({ ...GOOGLE, uid: 'g1' });
    expect(JSON.parse(store.getItem(CLOUD_PREF_KEY)!)).toMatchObject({ uid: 'g1', anonymous: false });
    expect(h.toasts).toContain('계정을 연동했다');
    expect((await h.sync.linkAccount('google')).ok).toBe(false); // 이미 연동됨 = 게스트 아님
  });
  it('연동 대상 계정이 이미 있지만 세이브가 없으면 그 계정으로 바꿔 로그인하고, 기기 세이브(게스트 것)를 그 계정에 올린다', async () => {
    const store = memStore();
    const save = newSaveData('shinigami', 1);
    writeSlotSave(store, save, 1);
    touchSlot(store, 1, 1000);
    const fb = fakeBackend({ link: 'exists' });
    const h = harness(store, fb, { slot: 1, save });
    await h.sync.signInGuest();
    await flushAsync(12);
    expect(fb.writes.length).toBe(1);
    const r = await h.sync.linkAccount('email', 'new@example.com', 'secret1');
    expect(r).toEqual({ ok: true, moved: true });
    expect(fb.state.switched).toBe(1);
    await flushAsync(12);
    expect(h.sync.state().user?.uid).toBe('e-new@example.com');
    expect(fb.writes.length).toBe(2); // 바뀐 계정(문서 없음)에 기기 세이브를 올렸다
    expect(fb.writes[1]!.summary.factionId).toBe('shinigami');
    expect(h.toasts).toContain('그 계정으로 옮겼다');
  });
  it('연동 대상 계정에 세이브가 있으면 거절 + 안내 문구 + 그래도 그 계정으로 로그인하는 길(switchTo)만 준다', async () => {
    const fb = fakeBackend({ link: 'taken' });
    const h = harness(memStore(), fb);
    await h.sync.signInGuest();
    await flushAsync(10);
    const r = await h.sync.linkAccount('google');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.text).toBe(LINK_TAKEN_TEXT);
    expect(typeof r.switchTo).toBe('function');
    expect(fb.state.switched).toBe(0);
    expect(h.sync.state().user).toEqual(GUEST); // 게스트 그대로
    await r.switchTo!();
    await flushAsync(10);
    expect(h.sync.state().user?.uid).toBe('u1');
  });
  it('연동 입력 검사·오류 문구: 이메일 모양·6자 미만·팝업 막힘', async () => {
    const fb = fakeBackend({ link: 'error' });
    const h = harness(memStore(), fb);
    await h.sync.signInGuest();
    await flushAsync(10);
    expect(await h.sync.linkAccount('email', 'nope', 'secret1')).toEqual({ ok: false, text: AUTH_ERROR_TEXT['auth/invalid-email'] });
    expect(await h.sync.linkAccount('email', 'a@b.co', '123')).toEqual({ ok: false, text: AUTH_ERROR_TEXT['auth/weak-password'] });
    expect(await h.sync.linkAccount('google')).toEqual({ ok: false, text: AUTH_ERROR_TEXT['auth/popup-blocked'] });
  });
});

describe('C.325 한 기기만 (GDD 199장 4)', () => {
  afterEach(() => vi.useRealTimers());
  const mk = async (o: { active?: ActiveDevice | null; save?: boolean } = {}) => {
    const store = memStore();
    const save = newSaveData('hollow', 1);
    if (o.save !== false) {
      writeSlotSave(store, save, 1);
      touchSlot(store, 1, 1000);
    }
    const fb = fakeBackend({ user: GOOGLE, active: o.active ?? null });
    store.setItem(CLOUD_PREF_KEY, JSON.stringify(GOOGLE));
    const h = harness(store, fb, { slot: 1, save });
    h.sync.start();
    await flushAsync(12);
    return { store, save, fb, h };
  };

  it('로그인(켜짐)하면 devices/{uid} 에 이 기기를 쓴다(이름·빌드 포함) — 그 뒤 세이브를 맞춘다', async () => {
    const { fb, h } = await mk();
    expect(fb.activeWrites.length).toBe(1);
    expect(fb.activeWrites[0]).toMatchObject({ device: h.sync.device, name: 'Windows Chrome', build: 'test-build' });
    expect(fb.writes.length).toBe(1);
    expect(h.sync.hasClaimed).toBe(true);
    expect(h.sync.state().blockedBy).toBeNull();
  });
  it('다른 기기가 차지하면: 막힘(status other-device) · onBlocked 한 번 · 저장해도 올리지 않는다 · 서버 세이브 변경도 무시', async () => {
    vi.useFakeTimers();
    const { store, fb, h } = await mk();
    fb.otherClaims();
    expect(h.blocked.length).toBe(1);
    expect(h.blocked[0]!.name).toBe('Android Chrome');
    expect(h.sync.state().status).toBe('other-device');
    expect(h.sync.state().blockedBy?.device).toBe('other-device');
    fb.otherClaims(); // 같은 상태 스냅샷은 다시 알리지 않는다
    expect(h.blocked.length).toBe(1);
    const before = fb.writes.length;
    touchSlot(store, 1, Date.now() + 1);
    h.sync.schedule();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(fb.writes.length).toBe(before);
    expect(h.sync.pending).toBe(true);
    await h.sync.flush();
    expect(fb.writes.length).toBe(before);
    // 저쪽이 다시 차지(시각만 바뀜) → 창 갱신용으로 한 번 더 알린다
    fb.otherClaims({ at: 100_000 });
    expect(h.blocked.length).toBe(2);
  });
  it('[다시 이 기기에서 하기](reclaim): 다시 쓰고 막힘이 풀린다(onUnblocked) · 밀린 저장을 맞춘다 · 차지 쓰기 중 들어온 옛 스냅샷은 무시', async () => {
    const { store, fb, h } = await mk();
    fb.otherClaims();
    touchSlot(store, 1, Date.now() + 5);
    h.sync.schedule();
    expect(h.sync.state().status).toBe('other-device');
    const p = h.sync.reclaim();
    fb.otherClaims(); // 쓰는 동안 들어온(내 쓰기 전) 스냅샷
    expect(await p).toBeNull();
    expect(fb.activeWrites.length).toBe(2);
    expect(fb.active?.device).toBe(h.sync.device);
    expect(h.unblocked).toBe(1);
    expect(h.sync.state().blockedBy).toBeNull();
    expect(h.sync.state().status).not.toBe('other-device');
    fb.echoActive(); // 내 쓰기 확정 스냅샷 — 변화 없음
    expect(h.unblocked).toBe(1);
    await flushAsync(12);
    expect(fb.writes.length).toBeGreaterThanOrEqual(2); // 막힌 동안 저장한 것을 되찾은 뒤 올렸다
  });
  it('오프라인에서 되찾기는 실패 문구 · 연결되면(onOnline) 문서를 읽어 판정: 다른 기기면 막히고, 내 것이면 풀린다', async () => {
    const { fb, h } = await mk();
    fb.offline = true;
    fb.otherClaims();
    expect(await h.sync.reclaim()).toBe(AUTH_ERROR_TEXT['auth/network-request-failed']);
    expect(h.sync.state().status).toBe('other-device');
    fb.offline = false;
    h.sync.onOnline();
    await flushAsync(12);
    expect(h.sync.state().status).toBe('other-device'); // 서버 문서는 여전히 다른 기기
    // 서버에서 내 기기로 돌아왔다(예: 저쪽에서 [다시 이 기기에서 하기]를 거꾸로 — 또는 문서 지움) → 연결 판정에서 풀림
    fb.otherClaims({ device: h.sync.device });
    expect(h.sync.state().blockedBy).toBeNull();
    expect(h.unblocked).toBe(1);
  });
  it('막힌 채 다시 켰으면(start blocked) 차지하지 않고 막힌 채 시작 · 스냅샷이 내 기기면 풀린다', async () => {
    const store = memStore();
    const other: ActiveDevice = { device: 'other-device', at: 5, name: 'Android Chrome', build: 'o' };
    const fb = fakeBackend({ user: GOOGLE, active: other });
    store.setItem(CLOUD_PREF_KEY, JSON.stringify(GOOGLE));
    const h = harness(store, fb);
    h.sync.start({ blocked: other });
    await flushAsync(12);
    expect(fb.activeWrites.length).toBe(0);
    expect(fb.writes.length).toBe(0);
    expect(h.sync.state().status).toBe('other-device');
    fb.otherClaims({ device: h.sync.device });
    expect(h.sync.state().blockedBy).toBeNull();
    expect(h.unblocked).toBe(1);
  });
  it('복귀(onVisible) = 켜짐: 막히지 않았고 마지막 차지에서 30초 넘었으면 다시 차지 · 막혀 있으면 절대 스스로 차지하지 않는다(핑퐁 방지)', async () => {
    vi.useFakeTimers();
    const { fb, h } = await mk();
    expect(fb.activeWrites.length).toBe(1);
    h.sync.onVisible();
    await flushAsync(8);
    expect(fb.activeWrites.length).toBe(1); // 방금 차지했다
    await vi.advanceTimersByTimeAsync(CLOUD_RECLAIM_MIN_MS + 10);
    h.sync.onVisible();
    await flushAsync(8);
    expect(fb.activeWrites.length).toBe(2);
    fb.otherClaims();
    await vi.advanceTimersByTimeAsync(CLOUD_RECLAIM_MIN_MS + 10);
    h.sync.onVisible();
    h.sync.onOnline();
    await flushAsync(8);
    expect(fb.activeWrites.length).toBe(2);
    expect(h.sync.state().status).toBe('other-device');
  });
  it('로그아웃하면 막힘도 풀린다(창 닫기) · 활성 기기 문서 값 검사 · 기기 이름', async () => {
    const { fb, h } = await mk();
    fb.otherClaims();
    await h.sync.signOut();
    expect(h.sync.state()).toMatchObject({ status: 'signed-out', blockedBy: null });
    expect(h.unblocked).toBe(1);
    expect(sanitizeActive({ device: 'a', at: 1 })).toEqual({ device: 'a', at: 1, name: '', build: '' });
    expect(sanitizeActive({ device: '', at: 1 })).toBeNull();
    expect(sanitizeActive(null)).toBeNull();
    expect(deviceLabel('Mozilla/5.0 (Linux; Android 14; SM-S911N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36')).toBe('Android Chrome');
    expect(deviceLabel('Mozilla/5.0 (Linux; Android 14; SM-S911N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0.0.0 Mobile Safari/537.36', true)).toBe('Android 삼성 인터넷 · 앱');
    expect(deviceLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36')).toBe('Windows Chrome');
    expect(deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1')).toBe('iPhone Safari');
  });
  it('보안 규칙: devices/{uid} 본인만, 칸 4개(device·at·name·build) · users 규칙 그대로 · 그 밖은 막힘', () => {
    const rules = read('firestore.rules');
    expect(rules).toContain('match /devices/{uid}');
    expect(rules).toContain("hasOnly(['device', 'at', 'name', 'build'])");
    expect(rules).toContain("hasOnly(['format', 'savedAt', 'slot', 'device', 'build', 'base', 'summary', 'text'])");
    expect(rules).toContain('allow read, write: if false;');
    expect((rules.match(/request\.auth\.uid == uid/g) ?? []).length).toBe(4);
  });
  it('문서 꼴: 세이브 문서는 그대로(makeCloudDoc) — 활성 기기와 섞이지 않는다', () => {
    const d = makeCloudDoc(newSaveData('hollow', 1), { slot: 1, device: 'A', build: 'b', base: null, nowMs: 1 });
    expect(Object.keys(d).sort()).toEqual(['base', 'build', 'device', 'format', 'savedAt', 'slot', 'summary', 'text']);
  });
});

describe('C.325 화면 문구·구조', () => {
  it('처음 로그인 창·막기 창·연동 창 문구는 ~다 체, 버튼 이름은 기획서 그대로 · app.ts 는 처음 화면 뒤 창을 띄우고 막히면 저장 먼저', () => {
    const view = read('src/ui/cloudView.ts');
    for (const t of ['Google 로그인', '이메일 로그인', '게스트로 시작', '계정 연동', '다시 이 기기에서 하기', '다른 기기에서 로그인했다', '이 계정에는 이미 세이브가 있다']) expect(view).toContain(t);
    const texts = [...view.matchAll(/'([^']*다\.)'/g)].map((m) => m[1]!);
    for (const t of texts) expect(t).not.toMatch(/요\.|습니다|하세요/);
    const app = read('src/ui/app.ts');
    expect(app).toContain('needsLoginGate(store');
    expect(app).toContain('markLoginGateDone(store)');
    expect(app).toContain('markExpeditionLeft(save.activeExpedition');
    expect(app.indexOf('persist();\n      }\n      window.location.reload();')).toBeGreaterThan(0);
    expect(app).toContain("cloud.start({ blocked: readBlockedFlag() })");
    expect(read('src/ui/settingsView.ts')).toContain('cloudPanelNodes(o.cloud)');
  });
});
