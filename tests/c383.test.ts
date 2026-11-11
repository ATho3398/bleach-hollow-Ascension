// C.383 클라우드 저장 실패 원인 보이기 (GDD 232장 1~4): 오류 코드 보관·쉬운 말 문구 · [다시 올리기] · 콘솔 한 줄(uid·이메일 없음) · 가짜 백엔드로 코드별 확인
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CLOUD_PREF_KEY, CloudSync, cloudErrorCode, cloudErrorText, scrubCloudMessage,
  type ActiveDevice, type CloudBackend, type CloudDoc, type CloudState, type CloudUser,
} from '../src/cloudSave';
import { newSaveData } from '../src/game';
import { touchSlot, writeSlotSave } from '../src/saveSlots';
import { CLOUD_STATUS_TEXT, cloudErrorLine, cloudHintText, cloudRetryShown } from '../src/ui/cloudView';

const read = (p: string) => readFileSync(p, 'utf8');

function memStore() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  };
}

const USER: CloudUser = { uid: 'uid-secret-123', name: '테스터', email: 'me@example.com', anonymous: false };

/** 가짜 Firestore: fail 에 코드를 넣으면 read·write·writeActive 가 그 코드로 실패한다 */
function fake(o: { fail?: string | null } = {}) {
  const st = { fail: o.fail ?? null as string | null, writes: [] as CloudDoc[], doc: null as CloudDoc | null };
  const boom = () => {
    if (st.fail) throw Object.assign(new Error(`Missing or insufficient permissions. (users/${USER.uid}, ${USER.email})`), { code: st.fail, name: 'FirebaseError' });
  };
  const backend: CloudBackend = {
    watchAuth: (cb) => { cb(USER); return () => {}; },
    signIn: async () => {}, signInGuest: async () => {}, signInEmail: async () => {}, signUpEmail: async () => {}, resetPassword: async () => {},
    link: async () => { throw new Error('x'); },
    signOut: async () => {},
    read: async () => { boom(); return st.doc; },
    write: async (_u, d) => { boom(); st.doc = d; st.writes.push(d); },
    watchDoc: () => () => {},
    readActive: async () => null,
    writeActive: async (_u, _d: ActiveDevice) => { boom(); },
    watchActive: () => () => {},
  };
  return { backend, st };
}

function setup(o: { fail?: string | null; sdkFail?: boolean } = {}) {
  const store = memStore();
  const save = newSaveData('hollow', 1);
  writeSlotSave(store, save, 1);
  touchSlot(store, 1, 1000);
  store.setItem(CLOUD_PREF_KEY, JSON.stringify(USER));
  const f = fake(o);
  let sdkFail = o.sdkFail ?? false;
  const sync = new CloudSync({
    storage: store,
    loadBackend: async () => {
      if (sdkFail) throw new TypeError('Failed to fetch dynamically imported module');
      return f.backend;
    },
    build: 'b', current: () => ({ slot: 1, save }), onConflict: () => {}, onApplied: () => {}, notify: () => {},
    deviceName: 'Windows Chrome', onBlocked: () => {}, onUnblocked: () => {}, online: () => true, now: () => 5000,
  });
  return { sync, f, setSdk: (v: boolean) => { sdkFail = v; } };
}

const tick = async (n = 16) => {
  for (let i = 0; i < n; i++) await Promise.resolve();
};

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.useFakeTimers();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  warn.mockRestore();
  vi.useRealTimers();
});

describe('C.383 오류 코드 → 쉬운 말 (GDD 232장 1)', () => {
  it('코드 뽑기: Firebase code(firestore/ 머리 뗌) → 없으면 name → unknown', () => {
    expect(cloudErrorCode({ code: 'permission-denied' })).toBe('permission-denied');
    expect(cloudErrorCode({ code: 'firestore/unavailable' })).toBe('unavailable');
    expect(cloudErrorCode(new TypeError('x'))).toBe('TypeError');
    expect(cloudErrorCode(null)).toBe('unknown');
  });
  it('코드별 문구', () => {
    expect(cloudErrorText({ code: 'permission-denied', stage: 'write' })).toBe('권한 없음(규칙 확인) · permission-denied');
    expect(cloudErrorText({ code: 'not-found', stage: 'read' })).toBe('데이터베이스 없음 · not-found');
    expect(cloudErrorText({ code: 'failed-precondition', stage: 'write' })).toBe('데이터베이스 없음 · failed-precondition');
    expect(cloudErrorText({ code: 'unavailable', stage: 'read' })).toBe('연결 불안정 · unavailable');
    expect(cloudErrorText({ code: 'deadline-exceeded', stage: 'write' })).toBe('연결 불안정 · deadline-exceeded');
    expect(cloudErrorText({ code: 'TypeError', stage: 'sdk' })).toBe('불러오기 실패(앱 다시 열기) · TypeError');
    expect(cloudErrorText({ code: 'internal', stage: 'write' })).toBe('알 수 없음(internal)');
  });
  it('콘솔 메시지 정리: uid·이메일·문서 경로 uid 를 지운다', () => {
    const m = scrubCloudMessage(`denied users/${USER.uid} by ${USER.email} devices/abc`, USER.uid);
    expect(m).not.toContain(USER.uid);
    expect(m).not.toContain('me@example.com');
    expect(m).toContain('users/<uid>');
    expect(m).toContain('devices/<uid>');
  });
});

describe('C.383 가짜 백엔드로 실패 상태 (GDD 232장 1·3·4)', () => {
  for (const [code, words] of [
    ['permission-denied', '권한 없음(규칙 확인) · permission-denied'],
    ['unavailable', '연결 불안정 · unavailable'],
    ['failed-precondition', '데이터베이스 없음 · failed-precondition'],
    ['internal', '알 수 없음(internal)'],
  ] as const) {
    it(`${code}: 상태 error + 코드 보관 + 로그인 줄 문구 + [다시 올리기] 보임`, async () => {
      const { sync } = setup({ fail: code });
      sync.start();
      await tick();
      const s = sync.state();
      expect(s.status).toBe('error');
      expect(s.lastError?.code).toBe(code);
      expect(cloudHintText(s)).toBe(`테스터 계정으로 로그인했다. 클라우드 저장에 실패했다: ${words}. 잠시 뒤 다시 올린다.`);
      expect(cloudRetryShown(s)).toBe(true);
    });
  }

  it('SDK 준비 실패: "불러오기 실패(앱 다시 열기)" + 이름(TypeError)', async () => {
    const { sync } = setup({ sdkFail: true });
    sync.start();
    await tick();
    const s = sync.state();
    expect(s.status).toBe('error');
    expect(s.lastError).toEqual({ code: 'TypeError', stage: 'sdk' });
    expect(cloudHintText(s)).toContain('클라우드 저장에 실패했다: 불러오기 실패(앱 다시 열기) · TypeError.');
  });

  it('콘솔 한 줄: 코드·메시지 — uid·이메일 없음', async () => {
    const { sync } = setup({ fail: 'permission-denied' });
    sync.start();
    await tick();
    expect(warn).toHaveBeenCalled();
    const lines = warn.mock.calls.map((c) => String(c[0]));
    expect(lines.some((l) => l.includes('permission-denied'))).toBe(true);
    for (const l of lines) {
      expect(l).not.toContain(USER.uid);
      expect(l).not.toContain(USER.email!);
      expect(l.split('\n').length).toBe(1);
    }
  });
});

describe('C.383 [다시 올리기] (GDD 232장 2)', () => {
  it('재시도 대기(5초)를 기다리지 않고 바로 한 번: 원인이 풀렸으면 올리고 오류를 지운다 · 버튼 숨김', async () => {
    const { sync, f } = setup({ fail: 'permission-denied' });
    sync.start();
    await tick();
    expect(sync.state().status).toBe('error');
    expect(f.st.writes.length).toBe(0);
    f.st.fail = null; // 규칙을 게시했다
    const p = sync.retryNow();
    expect(sync.state().retrying).toBe(true); // 진행 중 — 버튼 흐림
    await p;
    await tick();
    expect(f.st.writes.length).toBe(1);
    const s = sync.state();
    expect(s.status).toBe('synced');
    expect(s.lastError).toBeNull();
    expect(s.retrying).toBe(false);
    expect(cloudRetryShown(s)).toBe(false);
  });

  it('여전히 실패면 error 그대로 · 진행 중 두 번 눌러도 한 번만', async () => {
    const { sync, f } = setup({ fail: 'unavailable' });
    sync.start();
    await tick();
    const writes = vi.spyOn(f.backend, 'write');
    const a = sync.retryNow();
    const b = sync.retryNow();
    await Promise.all([a, b]);
    await tick();
    expect(writes.mock.calls.length).toBeLessThanOrEqual(1);
    expect(sync.state().status).toBe('error');
    expect(sync.state().lastError?.code).toBe('unavailable');
  });

  it('SDK 준비 실패 뒤 [다시 올리기]: 다시 받고 로그인 확인이 이어서 올린다', async () => {
    const h = setup({ sdkFail: true });
    h.sync.start();
    await tick();
    expect(h.sync.state().lastError?.stage).toBe('sdk');
    h.setSdk(false);
    await h.sync.retryNow();
    await tick(30);
    expect(h.f.st.writes.length).toBe(1);
    expect(h.sync.state().status).toBe('synced');
    expect(h.sync.state().lastError).toBeNull();
  });

  it('문구 기본값: 코드가 없으면 옛 문구, 로그아웃 상태엔 버튼 없음', () => {
    const s: CloudState = { status: 'error', user: USER, savedAt: null, blockedBy: null, lastError: null, retrying: false };
    expect(cloudErrorLine(s)).toBe(CLOUD_STATUS_TEXT.error);
    expect(cloudRetryShown({ ...s, user: null })).toBe(false);
    expect(cloudRetryShown({ ...s, status: 'synced' })).toBe(false);
    expect(cloudRetryShown({ ...s, status: 'saving', retrying: true })).toBe(true);
  });

  it('화면 구조: 설정 로그인 줄에 [다시 올리기](data-set cloud-retry) · 앱이 retryNow 로 잇는다 · 숨김 CSS · 가짜 클라우드 실패 각본', () => {
    expect(read('src/ui/cloudView.ts')).toContain("rb.dataset.set = 'cloud-retry'");
    expect(read('src/ui/settingsView.ts')).toContain('cloudNodes.retryButton');
    expect(read('src/ui/app.ts')).toContain('retry: () => cloud.retryNow()');
    expect(read('src/ui/bha/screens-lcd.css')).toContain('.bha-setrow--cloud .bha-settings__cloud-btn[hidden]');
    const fk = read('src/cloudFake.ts');
    expect(fk).toContain('sdkfail');
    expect(fk).toContain('failIfSet');
  });
});
