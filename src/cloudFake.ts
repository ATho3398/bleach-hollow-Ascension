// 점검용 가짜 클라우드 (C.323, dev 서버에서 `?cloudfake` 일 때만 — 배포 빌드에는 들어가지 않는다, app.ts import.meta.env.DEV 분기).
// 실제 Google 로그인은 자동 점검(Playwright)에서 할 수 없어, 로그인 전·후 설정 줄과 [이 기기 / 클라우드] 고르기 창을 찍을 때 쓴다.
// 상태는 localStorage `bha-cloud-fake` = { user, doc } — 미리 넣어 두면 '다른 기기의 세이브'가 된다. 다른 창의 쓰기는 storage 이벤트로 받는다.
import type { CloudBackend, CloudDoc, CloudUser } from './cloudSave';
import { sanitizeCloudDoc } from './cloudSave';

export const CLOUD_FAKE_KEY = 'bha-cloud-fake';

interface FakeState {
  user: CloudUser | null;
  doc: CloudDoc | null;
}

function readState(): FakeState {
  try {
    const raw = JSON.parse(localStorage.getItem(CLOUD_FAKE_KEY) ?? 'null') as Partial<FakeState> | null;
    const u = raw?.user;
    return { user: u && typeof u.uid === 'string' ? { uid: u.uid, name: u.name ?? null, email: u.email ?? null } : null, doc: sanitizeCloudDoc(raw?.doc) };
  } catch {
    return { user: null, doc: null };
  }
}
function writeState(s: FakeState): void {
  localStorage.setItem(CLOUD_FAKE_KEY, JSON.stringify(s));
}

export async function loadFakeBackend(): Promise<CloudBackend> {
  const authSubs = new Set<(u: CloudUser | null) => void>();
  const docSubs = new Set<(d: CloudDoc | null) => void>();
  window.addEventListener('storage', (e) => {
    if (e.key !== CLOUD_FAKE_KEY) return;
    const d = readState().doc;
    for (const cb of docSubs) cb(d);
  });
  const delay = () => new Promise((r) => setTimeout(r, 120));
  return {
    watchAuth: (cb) => {
      authSubs.add(cb);
      cb(readState().user);
      return () => authSubs.delete(cb);
    },
    async signIn() {
      await delay();
      const s = readState();
      s.user = { uid: 'fake-uid', name: '테스트 사용자', email: 'tester@example.com' };
      writeState(s);
      for (const cb of authSubs) cb(s.user);
    },
    // 이메일: 비밀번호 'wrong…' 이면 틀림, 'taken@' 로 시작하는 이메일 가입은 이미 가입 — 오류 문구 확인용
    async signInEmail(email, password) {
      await delay();
      if (password.startsWith('wrong')) throw Object.assign(new Error('fake'), { code: 'auth/invalid-credential' });
      const s = readState();
      s.user = { uid: `fake-${email}`, name: null, email };
      writeState(s);
      for (const cb of authSubs) cb(s.user);
    },
    async signUpEmail(email, password) {
      await delay();
      if (email.startsWith('taken@')) throw Object.assign(new Error('fake'), { code: 'auth/email-already-in-use' });
      const s = readState();
      s.user = { uid: `fake-${email}`, name: null, email };
      writeState(s);
      for (const cb of authSubs) cb(s.user);
      void password;
    },
    async resetPassword() {
      await delay();
    },
    async signOut() {
      const s = readState();
      s.user = null;
      writeState(s);
      for (const cb of authSubs) cb(null);
    },
    async read() {
      await delay();
      return readState().doc;
    },
    async write(_uid, doc) {
      await delay();
      const s = readState();
      s.doc = doc;
      writeState(s);
    },
    watchDoc: (_uid, cb) => {
      docSubs.add(cb);
      return () => docSubs.delete(cb);
    },
  };
}
