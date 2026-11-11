// C.323 로그인 · 클라우드 세이브 (GDD 196장): Firebase 를 가짜 백엔드로 바꿔 끼워 동기화·충돌 고르기·오프라인 재시도를 검사한다
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyCloudToSlot, AUTH_ERROR_TEXT, authErrorText, CLOUD_DEBOUNCE_MS, CLOUD_PREF_KEY, CLOUD_RETRY_MS, CLOUD_SYNC_KEY, CLOUD_TEXT_MAX_BYTES, CloudSync, decideReconcile, makeCloudDoc, sanitizeCloudDoc, summaryOf,
  type CloudBackend, type CloudConflict, type CloudDoc, type CloudUser,
} from '../src/cloudSave';
import { loadSave, newSaveData, SAVE_FORMAT_VERSION, type SaveData } from '../src/game';
import { parseImport, serializeSave } from '../src/saveBackup';
import { readBackupMeta, slotBackupKey, slotKey, touchSlot, writeSlotSave } from '../src/saveSlots';

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

/** 가짜 Firebase: 문서 하나, 로그인 상태, 끊기(offline) 스위치, 다른 기기 쓰기 흉내(remote) */
function fakeBackend(init: { user?: CloudUser | null; doc?: CloudDoc | null; offline?: boolean } = {}) {
  let user: CloudUser | null = init.user ?? null;
  let doc: CloudDoc | null = init.doc ?? null;
  const authSubs = new Set<(u: CloudUser | null) => void>();
  const docSubs = new Set<(d: CloudDoc | null) => void>();
  const writes: CloudDoc[] = [];
  const state = { offline: init.offline ?? false, loads: 0, signIns: 0, resets: [] as string[] };
  const setUser = (u: CloudUser | null): void => {
    user = u;
    for (const cb of authSubs) cb(u);
  };
  const backend: CloudBackend = {
    watchAuth: (cb) => {
      authSubs.add(cb);
      cb(user);
      return () => authSubs.delete(cb);
    },
    signIn: async () => {
      state.signIns++;
      setUser({ uid: 'u1', name: '테스터', email: 't@example.com', anonymous: false });
    },
    signInGuest: async () => setUser({ uid: 'g1', name: null, email: null, anonymous: true }),
    signInEmail: async (email, password) => {
      if (password === 'wrongpw') throw Object.assign(new Error('x'), { code: 'auth/invalid-credential' });
      setUser({ uid: `e-${email}`, name: null, email, anonymous: false });
    },
    signUpEmail: async (email) => {
      if (email.startsWith('taken@')) throw Object.assign(new Error('x'), { code: 'auth/email-already-in-use' });
      setUser({ uid: `e-${email}`, name: null, email, anonymous: false });
    },
    link: async () => { throw Object.assign(new Error('x'), { code: 'auth/provider-already-linked' }); },
    readActive: async () => null,
    writeActive: async () => {},
    watchActive: () => () => {},
    resetPassword: async (email) => {
      state.resets.push(email);
    },
    signOut: async () => setUser(null),
    read: async () => {
      if (state.offline) throw new Error('offline');
      return doc;
    },
    write: async (_uid, d) => {
      if (state.offline) throw new Error('offline');
      doc = d;
      writes.push(d);
    },
    watchDoc: (_uid, cb) => {
      docSubs.add(cb);
      return () => docSubs.delete(cb);
    },
  };
  return {
    state,
    get offline() { return state.offline; },
    set offline(v: boolean) { state.offline = v; },
    get loads() { return state.loads; },
    set loads(v: number) { state.loads = v; },
    get signIns() { return state.signIns; },
    get doc() { return doc; },
    get writes() { return writes; },
    setUser,
    /** 다른 기기가 올린 것처럼 */
    remote(d: CloudDoc): void {
      doc = d;
      for (const cb of docSubs) cb(d);
    },
    backend,
  };
}

function harness(store: Store, fb: ReturnType<typeof fakeBackend>, o: { slot?: number; save?: SaveData | null; online?: () => boolean } = {}) {
  const conflicts: CloudConflict[] = [];
  const applied: number[] = [];
  const toasts: string[] = [];
  const cur = { slot: o.slot ?? 0, save: o.save ?? null };
  const sync = new CloudSync({
    storage: store,
    loadBackend: async () => {
      fb.loads++;
      return fb.backend;
    },
    build: 'test-build',
    current: () => cur,
    onConflict: (c) => conflicts.push(c),
    onApplied: (n) => applied.push(n),
    notify: (t) => toasts.push(t),
    deviceName: 'test-device',
    onBlocked: () => {},
    onUnblocked: () => {},
    online: o.online ?? (() => !fb.offline),
    now: () => Date.now(),
  });
  return { sync, conflicts, applied, toasts, cur };
}

const flushAsync = async (n = 6) => {
  for (let i = 0; i < n; i++) await Promise.resolve();
};

const U1: CloudUser = { uid: 'u1', name: '테스터', email: 't@example.com', anonymous: false };

function docFrom(save: SaveData, o: Partial<CloudDoc> = {}): CloudDoc {
  return { ...makeCloudDoc(save, { slot: o.slot ?? 1, device: o.device ?? 'other-device', build: 'b', base: o.base ?? null, nowMs: o.savedAt ?? 5000 }), ...o };
}

describe('C.323 기기·클라우드 맞추기 규칙 (decideReconcile)', () => {
  const synced = (over: Partial<{ slot: number; savedAt: number; localAt: number; uploadedAt: number | null }> = {}) =>
    ({ uid: 'u1', slot: 1, savedAt: 100, localAt: 100, uploadedAt: null, ...over });
  const local = (exists: boolean, playedAt: number | null = null) => ({ slot: 1, exists, playedAt });
  const cloud = (over: Partial<CloudDoc> = {}): CloudDoc => ({ format: SAVE_FORMAT_VERSION, savedAt: 100, slot: 1, device: 'B', build: 'b', base: null, summary: { factionId: 'hollow', tierIndex: 0, expeditions: 0 }, text: '{}', ...over });

  it('클라우드가 비었으면 기기 세이브를 올리고, 둘 다 없으면 아무것도 안 한다', () => {
    expect(decideReconcile(null, local(true, 10), null, 'A', false)).toEqual({ kind: 'upload', slot: 1 });
    expect(decideReconcile(null, local(false), null, 'A', false)).toEqual({ kind: 'none' });
  });
  it('기기 슬롯이 비었으면 내려받는다 · 클라우드가 더 새 형식이면 막는다', () => {
    expect(decideReconcile(cloud(), local(false), null, 'A', false)).toEqual({ kind: 'download', slot: 1 });
    expect(decideReconcile(cloud({ format: SAVE_FORMAT_VERSION + 1 }), local(true, 10), null, 'A', false)).toEqual({ kind: 'blocked' });
  });
  it('내가 올린 판(또는 이미 맞춘 판)이면: 그 뒤 플레이했을 때만 올린다', () => {
    expect(decideReconcile(cloud({ device: 'A' }), local(true, 150), synced(), 'A', false)).toEqual({ kind: 'upload', slot: 1 });
    expect(decideReconcile(cloud({ device: 'A' }), local(true, 90), synced(), 'A', false)).toEqual({ kind: 'none' });
    expect(decideReconcile(cloud({ device: 'B', savedAt: 100 }), local(true, 90), synced(), 'A', false)).toEqual({ kind: 'none' });
    expect(decideReconcile(cloud({ device: 'B', savedAt: 100 }), local(true, 120), synced(), 'A', false)).toEqual({ kind: 'upload', slot: 1 });
  });
  it('다른 기기의 새 판: 이 기기가 맞춘 뒤 플레이 안 했으면 조용히 내려받고, 했으면 고르기(기본 = 더 최근)', () => {
    expect(decideReconcile(cloud({ savedAt: 200 }), local(true, 100), synced(), 'A', false)).toEqual({ kind: 'download', slot: 1 });
    expect(decideReconcile(cloud({ savedAt: 200 }), local(true, 150), synced(), 'A', false)).toEqual({ kind: 'conflict', slot: 1, suggested: 'cloud' });
    expect(decideReconcile(cloud({ savedAt: 200 }), local(true, 300), synced(), 'A', false)).toEqual({ kind: 'conflict', slot: 1, suggested: 'device' });
    // 맞춘 기록이 없고(처음 로그인) 기기에 플레이한 세이브가 있으면 고르기
    expect(decideReconcile(cloud({ savedAt: 200 }), local(true, 300), null, 'A', false)).toEqual({ kind: 'conflict', slot: 1, suggested: 'device' });
  });
  it('플레이 중인 슬롯에, 다른 기기가 내 판을 받아 켜며 저장한 것(base = 내가 올린 판)이 오면 그대로 둔다', () => {
    const s = synced({ savedAt: 100, uploadedAt: 100, localAt: 100 });
    expect(decideReconcile(cloud({ savedAt: 200, base: 100 }), local(true, 150), s, 'A', true)).toEqual({ kind: 'none' });
    // 플레이 중이 아니면(처음 화면) 그냥 내려받거나 고른다
    expect(decideReconcile(cloud({ savedAt: 200, base: 100 }), local(true, 150), s, 'A', false)).toEqual({ kind: 'conflict', slot: 1, suggested: 'cloud' });
    // base 가 다른 판이면 플레이 중이라도 고르기
    expect(decideReconcile(cloud({ savedAt: 200, base: 50 }), local(true, 150), s, 'A', true)).toEqual({ kind: 'conflict', slot: 1, suggested: 'cloud' });
  });
});

describe('C.323 문서 꼴', () => {
  it('문서 = 세이브 형식 그대로(serializeSave) + 저장 시각·진행 요약·슬롯·기기', () => {
    const save = newSaveData('shinigami', 1000);
    const d = makeCloudDoc(save, { slot: 2, device: 'A', build: 'b1', base: null, nowMs: 777 });
    expect(d).toMatchObject({ format: SAVE_FORMAT_VERSION, savedAt: 777, slot: 2, device: 'A', build: 'b1', base: null, summary: { factionId: 'shinigami', tierIndex: 0, expeditions: 0 } });
    const r = parseImport(d.text);
    expect(r.ok && r.save.factionId).toBe('shinigami');
    expect(JSON.parse(d.text).meta.format).toBe(SAVE_FORMAT_VERSION);
    expect(summaryOf(save)).toEqual({ factionId: 'shinigami', tierIndex: 0, expeditions: 0 });
  });
  it('서버에서 읽은 값은 모양을 검사한다 (틀리면 없는 것으로)', () => {
    expect(sanitizeCloudDoc(null)).toBeNull();
    expect(sanitizeCloudDoc({ format: 1 })).toBeNull();
    const ok = sanitizeCloudDoc({ format: 62, savedAt: 1, slot: 1, text: '{}', summary: { factionId: 'hollow', tierIndex: 0, expeditions: 3 }, extra: 1 });
    expect(ok).toEqual({ format: 62, savedAt: 1, slot: 1, device: '', build: '', base: null, summary: { factionId: 'hollow', tierIndex: 0, expeditions: 3 }, text: '{}' });
  });
  it('클라우드 세이브를 슬롯에 쓰면 지금 세이브는 그 슬롯 백업(cloud)에, 플레이 시각 = 클라우드 저장 시각, 옛 형식은 기존 마이그레이션으로', () => {
    const store = memStore();
    writeSlotSave(store, newSaveData('hollow', 1), 1);
    const incoming = newSaveData('shinigami', 2);
    const d = docFrom(incoming, { savedAt: 9000 });
    // 옛 형식(한 단계 아래)을 흉내: 기존 마이그레이션이 올린다
    const old = JSON.parse(d.text);
    old.meta.format = SAVE_FORMAT_VERSION - 1;
    expect(applyCloudToSlot(store, { ...d, text: JSON.stringify(old), format: SAVE_FORMAT_VERSION - 1 }, 1)).toBe('ok');
    const now = loadSave(store, slotKey(1));
    expect(now?.factionId).toBe('shinigami');
    expect(now?.meta.format).toBe(SAVE_FORMAT_VERSION);
    expect(loadSave(store, slotBackupKey(1))?.factionId).toBe('hollow');
    expect(readBackupMeta(store, 1)?.reason).toBe('cloud');
    expect(JSON.parse(store.getItem('bleach-hollow-ascension.save.slots')!).played['1']).toBe(9000);
    // 더 새 형식은 열지 않는다
    const newer = JSON.parse(d.text);
    newer.meta.format = SAVE_FORMAT_VERSION + 1;
    expect(applyCloudToSlot(store, { ...d, text: JSON.stringify(newer), format: SAVE_FORMAT_VERSION + 1 }, 1)).toBe('newer');
    expect(applyCloudToSlot(store, { ...d, text: '{nope' }, 1)).toBe('corrupt');
  });
});

describe('C.323 CloudSync (가짜 Firebase)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('로그인 기억이 없으면 SDK 를 받지 않는다 · 로그인 버튼이 SDK 를 받는다 (팝업만 — 리다이렉트 없음, C.325)', async () => {
    const store = memStore();
    const fb = fakeBackend();
    const h = harness(store, fb);
    h.sync.start();
    await flushAsync();
    expect(fb.loads).toBe(0);
    expect(h.sync.state().status).toBe('signed-out');
    await h.sync.signIn();
    await flushAsync();
    expect(fb.loads).toBe(1);
    expect(fb.signIns).toBe(1);
    expect(h.sync.state().user?.uid).toBe('u1');
    expect(JSON.parse(store.getItem(CLOUD_PREF_KEY)!).uid).toBe('u1');
  });

  it('로그인 기억이 있으면 켤 때 SDK 를 받아 자동 로그인하고, 클라우드가 비었으면 기기 세이브를 올린다', async () => {
    const store = memStore();
    const save = newSaveData('hollow', 1);
    writeSlotSave(store, save, 1);
    touchSlot(store, 1, 1000);
    store.setItem(CLOUD_PREF_KEY, JSON.stringify(U1));
    const fb = fakeBackend({ user: U1 });
    const h = harness(store, fb);
    h.sync.start();
    expect(h.sync.state().status).toBe('loading');
    await flushAsync(10);
    expect(fb.loads).toBe(1);
    expect(fb.writes.length).toBe(1);
    expect(fb.writes[0]!.slot).toBe(1);
    expect(fb.writes[0]!.summary.factionId).toBe('hollow');
    expect(h.sync.state().status).toBe('synced');
    expect(JSON.parse(store.getItem(CLOUD_SYNC_KEY)!)).toMatchObject({ uid: 'u1', slot: 1, uploadedAt: fb.writes[0]!.savedAt });
  });

  it('저장할 때마다 묶어서 한 번 올린다 (CLOUD_DEBOUNCE_MS)', async () => {
    const store = memStore();
    const save = newSaveData('hollow', 1);
    writeSlotSave(store, save, 1);
    const fb = fakeBackend({ user: U1, doc: docFrom(save, { device: 'me-later' }) });
    const h = harness(store, fb, { slot: 1, save });
    store.setItem(CLOUD_PREF_KEY, JSON.stringify(U1));
    h.sync.start();
    await flushAsync(10);
    const before = fb.writes.length;
    for (let i = 0; i < 5; i++) {
      touchSlot(store, 1, Date.now() + i);
      h.sync.schedule();
      await vi.advanceTimersByTimeAsync(500);
    }
    expect(h.sync.state().status).toBe('pending');
    expect(fb.writes.length).toBe(before);
    await vi.advanceTimersByTimeAsync(CLOUD_DEBOUNCE_MS + 100);
    expect(fb.writes.length).toBe(before + 1);
    expect(h.sync.state().status).toBe('synced');
  });

  it('오프라인이면 기기에만 저장되고, 연결되면(onOnline) 올린다 · 실패는 간격을 두고 다시', async () => {
    const store = memStore();
    const save = newSaveData('hollow', 1);
    writeSlotSave(store, save, 1);
    const fb = fakeBackend({ user: U1, doc: null });
    const h = harness(store, fb, { slot: 1, save });
    store.setItem(CLOUD_PREF_KEY, JSON.stringify(U1));
    h.sync.start();
    await flushAsync(10);
    expect(fb.writes.length).toBe(1);
    fb.offline = true;
    touchSlot(store, 1, Date.now() + 1);
    h.sync.schedule();
    await vi.advanceTimersByTimeAsync(CLOUD_DEBOUNCE_MS + 100);
    expect(fb.writes.length).toBe(1);
    expect(h.sync.pending).toBe(true);
    expect(h.sync.state().status).toBe('offline');
    // 끊긴 채로는 재시도도 실패
    await vi.advanceTimersByTimeAsync(CLOUD_RETRY_MS[0]! + 100);
    expect(fb.writes.length).toBe(1);
    fb.offline = false;
    h.sync.onOnline();
    await flushAsync(10);
    expect(fb.writes.length).toBe(2);
    expect(h.sync.pending).toBe(false);
    expect(h.sync.state().status).toBe('synced');
  });

  it('새 기기(빈 슬롯)에서 로그인하면 클라우드 세이브를 가져오고 슬롯을 다시 연다', async () => {
    const store = memStore();
    const incoming = newSaveData('shinigami', 3);
    const fb = fakeBackend({ user: null, doc: docFrom(incoming, { slot: 2, savedAt: 4242 }) });
    const h = harness(store, fb);
    await h.sync.signIn();
    await flushAsync(10);
    expect(h.conflicts.length).toBe(0);
    expect(h.applied).toEqual([2]);
    expect(loadSave(store, slotKey(2))?.factionId).toBe('shinigami');
    expect(fb.writes.length).toBe(0);
    expect(h.sync.state()).toMatchObject({ status: 'synced', savedAt: 4242 });
  });

  it('기기와 클라우드가 다르면 고르기 창 — [클라우드]: 슬롯을 바꾸고 기기 것은 백업 / [이 기기]: 클라우드 것은 백업, 기기 것을 올린다', async () => {
    const mk = async () => {
      const store = memStore();
      const mine = newSaveData('hollow', 1);
      writeSlotSave(store, mine, 1);
      touchSlot(store, 1, 10_000);
      const theirs = newSaveData('shinigami', 2);
      const fb = fakeBackend({ user: null, doc: docFrom(theirs, { slot: 1, savedAt: 20_000 }) });
      const h = harness(store, fb);
      await h.sync.signIn();
      await flushAsync(10);
      expect(h.conflicts.length).toBe(1);
      const c = h.conflicts[0]!;
      expect(c.slot).toBe(1);
      expect(c.suggested).toBe('cloud'); // 클라우드가 더 최근
      expect(c.device.summary.factionId).toBe('hollow');
      expect(c.cloud.summary.factionId).toBe('shinigami');
      expect(c.cloud.savedAt).toBe(20_000);
      return { store, fb, h, c };
    };
    const a = await mk();
    a.c.choose('cloud');
    await flushAsync(10);
    expect(loadSave(a.store, slotKey(1))?.factionId).toBe('shinigami');
    expect(loadSave(a.store, slotBackupKey(1))?.factionId).toBe('hollow');
    expect(readBackupMeta(a.store, 1)?.reason).toBe('cloud');
    expect(a.h.applied).toEqual([1]);
    expect(a.fb.writes.length).toBe(0);

    const b = await mk();
    b.c.choose('device');
    await flushAsync(10);
    expect(loadSave(b.store, slotKey(1))?.factionId).toBe('hollow');
    expect(loadSave(b.store, slotBackupKey(1))?.factionId).toBe('shinigami');
    expect(readBackupMeta(b.store, 1)?.reason).toBe('cloud');
    expect(b.fb.writes.length).toBe(1);
    expect(b.fb.writes[0]!.summary.factionId).toBe('hollow');
    expect(b.h.applied).toEqual([]);
  });

  it('클라우드 세이브가 더 새 버전이면 받지도 올리지도 않는다 (blocked)', async () => {
    const store = memStore();
    const mine = newSaveData('hollow', 1);
    writeSlotSave(store, mine, 1);
    touchSlot(store, 1, 10_000);
    const d = docFrom(newSaveData('hollow', 2), { format: SAVE_FORMAT_VERSION + 1, savedAt: 20_000 });
    const fb = fakeBackend({ user: null, doc: d });
    const h = harness(store, fb, { slot: 1, save: mine });
    await h.sync.signIn();
    await flushAsync(10);
    expect(h.sync.state().status).toBe('blocked');
    expect(h.conflicts.length).toBe(0);
    h.sync.schedule();
    await vi.advanceTimersByTimeAsync(CLOUD_DEBOUNCE_MS + 100);
    expect(fb.writes.length).toBe(0);
    expect(loadSave(store, slotKey(1))?.factionId).toBe('hollow');
  });

  it('다른 기기의 새 판이 오면: 플레이 안 한 슬롯은 조용히 받고, 내 판을 받아 켠 것(base)은 플레이 중이면 무시', async () => {
    const store = memStore();
    const mine = newSaveData('hollow', 1);
    writeSlotSave(store, mine, 1);
    touchSlot(store, 1, 1000);
    const fb = fakeBackend({ user: U1, doc: null });
    const h = harness(store, fb, { slot: 1, save: mine });
    store.setItem(CLOUD_PREF_KEY, JSON.stringify(U1));
    h.sync.start();
    await flushAsync(10);
    expect(fb.writes.length).toBe(1);
    const myUpload = fb.writes[0]!;
    // 다른 기기가 내 판을 내려받고 켜며 저장 → base = 내 판. 나는 플레이 중 → 무시
    fb.remote(docFrom(newSaveData('hollow', 5), { device: 'B', savedAt: myUpload.savedAt + 1000, base: myUpload.savedAt }));
    await flushAsync(10);
    expect(h.conflicts.length).toBe(0);
    expect(h.applied).toEqual([]);
    // 다른 기기에서 진짜 진행(base 다름) — 나는 그 뒤 플레이함 → 고르기
    fb.remote(docFrom(newSaveData('shinigami', 6), { device: 'B', savedAt: myUpload.savedAt + 5000, base: 1 }));
    touchSlot(store, 1, myUpload.savedAt + 1);
    await flushAsync(10);
    expect(h.conflicts.length).toBe(0); // 플레이 시각이 맞춘 뒤가 아니면 조용히 받는다
    expect(h.applied).toEqual([1]);
    expect(loadSave(store, slotKey(1))?.factionId).toBe('shinigami');
  });

  it('이메일 로그인·가입·비밀번호 잊음 (196장 결정 7): 같은 동기화 흐름, 실패는 ~다 문구', async () => {
    const store = memStore();
    writeSlotSave(store, newSaveData('hollow', 1), 1);
    const fb = fakeBackend({ user: null, doc: null });
    const h = harness(store, fb);
    expect(await h.sync.emailAction('login', 'nope', 'secret1')).toBe('이메일 주소가 올바르지 않다.');
    expect(await h.sync.emailAction('login', 'a@b.co', '123')).toBe('비밀번호는 6자 이상이어야 한다.');
    expect(fb.loads).toBe(0); // 입력 검사에서 걸리면 SDK 도 안 받는다
    expect(await h.sync.emailAction('login', 'a@b.co', 'wrongpw')).toBe('이메일이나 비밀번호가 맞지 않다.');
    expect(h.sync.state().user).toBeNull();
    expect(await h.sync.emailAction('signup', 'taken@b.co', 'secret1')).toBe('이미 가입된 이메일이다. [로그인]을 누른다.');
    expect(await h.sync.emailAction('reset', 'a@b.co', '')).toBeNull();
    expect(fb.state.resets).toEqual(['a@b.co']);
    expect(await h.sync.emailAction('login', ' a@b.co ', 'secret1')).toBeNull();
    await flushAsync(10);
    expect(h.sync.state().user?.email).toBe('a@b.co');
    expect(fb.writes.length).toBe(1); // 클라우드가 비어 기기 세이브를 올렸다 — Google 과 같은 흐름
    expect(authErrorText({ code: 'auth/too-many-requests' })).toBe('시도가 너무 많다. 잠시 뒤 다시 한다.');
    expect(authErrorText(new Error('?'))).toBe('로그인하지 못했다. 잠시 뒤 다시 한다.');
    for (const t of Object.values(AUTH_ERROR_TEXT)) expect(t).toMatch(/다\.$/);
  });

  it('너무 큰 세이브는 올리지 않고 알린다 · 로그아웃하면 기억·구독을 지우고 기기 세이브는 그대로', async () => {
    const store = memStore();
    const save = newSaveData('hollow', 1);
    writeSlotSave(store, save, 1);
    const fb = fakeBackend({ user: U1, doc: null });
    const h = harness(store, fb, { slot: 1, save });
    store.setItem(CLOUD_PREF_KEY, JSON.stringify(U1));
    h.sync.start();
    await flushAsync(10);
    expect(fb.writes.length).toBe(1);
    const big = { ...save, help: { ...save.help, note: 'x'.repeat(CLOUD_TEXT_MAX_BYTES + 10) } } as unknown as SaveData;
    h.cur.save = big;
    h.sync.schedule();
    await vi.advanceTimersByTimeAsync(CLOUD_DEBOUNCE_MS + 100);
    expect(fb.writes.length).toBe(1);
    expect(h.sync.state().status).toBe('too-big');
    expect(h.toasts.some((t) => t.includes('너무 커'))).toBe(true);
    await h.sync.signOut();
    expect(h.sync.state().status).toBe('signed-out');
    expect(store.getItem(CLOUD_PREF_KEY)).toBeNull();
    expect(loadSave(store, slotKey(1))?.factionId).toBe('hollow');
  });
});

describe('C.323 구조·문구·배포', () => {
  const src = (p: string) => read(p);
  it('Firebase 는 cloudFirebase.ts 안에서 동적 import 로만 — 정적 import 없음, app.ts 도 cloudFirebase 를 동적 import', () => {
    const files = ['src/cloudSave.ts', 'src/ui/cloudView.ts', 'src/ui/app.ts', 'src/ui/settingsView.ts', 'src/main.ts', 'src/cloudFirebase.ts'];
    for (const f of files) expect(src(f)).not.toMatch(/^import .* from 'firebase/m);
    expect(src('src/cloudFirebase.ts')).toContain("import('firebase/app')");
    expect(src('src/ui/app.ts')).toContain("import('../cloudFirebase')");
    expect(src('src/cloudSave.ts')).not.toContain('firebase/');
  });
  it('vite: Firebase 덩어리는 따로(assets/firebase-*.js) · 미리 캐시 목록에서 뺀다', () => {
    const cfg = src('vite.config.ts');
    expect(cfg).toContain("? 'firebase' : undefined");
    expect(cfg).toMatch(/isFirebaseChunk = \(f: string\) => \/\^assets\\\/firebase-/);
    expect(cfg).toContain('!isFirebaseChunk(f)');
  });
  it('보안 규칙: 자기 uid 문서만 읽기·쓰기, 세이브 원문 크기 제한', () => {
    const rules = src('firestore.rules');
    expect(rules).toContain("rules_version = '2'");
    expect(rules).toContain('match /users/{uid}');
    expect(rules).toContain('request.auth != null && request.auth.uid == uid');
    expect(rules).toContain('request.resource.data.text.size() < 900000');
    expect(rules).toContain('allow read, write: if false');
    expect(CLOUD_TEXT_MAX_BYTES).toBe(900_000);
  });
  it('설정 기타 탭에 로그인 줄 하나 — 버튼 하나(로그인 전 Google 로그인 / 뒤 로그아웃) + 설명은 ~다 체', () => {
    const view = src('src/ui/cloudView.ts');
    expect(view).toContain("s.user.anonymous ? '계정 연동' : '로그아웃') : 'Google 로그인'"); // C.325: 게스트는 [계정 연동]
    const texts = [...view.matchAll(/'([^']*다\.)'/g)].map((m) => m[1]!);
    expect(texts.length).toBeGreaterThan(5);
    for (const t of texts) expect(t).not.toMatch(/요\.|습니다|하세요/);
    const settings = src('src/ui/settingsView.ts');
    expect(settings).toContain("panel('로그인', cloudNodes.button, cloudNodes.emailButton, cloudNodes.retryButton, cloudNodes.hint)");
    expect(view).toContain("'이메일 로그인'"); // C.325: 둘째 버튼 이름은 cloudSecondLabel (게스트면 [로그아웃])
    expect(view).toContain("button({ label: '취소', variant: 'ghost', onClick: m.close })");
    expect(view).toContain("label: '가입'");
    expect(view).toContain("label: '비밀번호 잊음'");
    expect(src('src/ui/app.ts')).toContain('cloud: cloudUi');
    expect(src('src/ui/app.ts')).toContain('cloud?.schedule()');
  });
  it('종족 분기 하드코딩 없음 · 세이브 형식 그대로', () => {
    for (const f of ['src/cloudSave.ts', 'src/cloudFirebase.ts', 'src/ui/cloudView.ts']) expect(src(f)).not.toMatch(/=== 'hollow'|=== 'shinigami'/);
    expect(SAVE_FORMAT_VERSION).toBe(75); // C.403 기능 해금 // C.363 도감 정렬 // C.361 노력치 상한 밖 몫 // C.354 수련권 기록 // C.330 적 도감 // C.326
  });
});
