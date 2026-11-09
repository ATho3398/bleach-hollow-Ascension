// 점검용 가짜 클라우드 (C.323 · C.325, dev 서버에서 `?cloudfake` 일 때만 — 배포 빌드에는 들어가지 않는다, app.ts import.meta.env.DEV 분기).
// 실제 Google·익명 로그인은 자동 점검(Playwright)에서 할 수 없어, 처음 로그인 창·게스트 설정 줄·계정 연동 거절·'다른 기기에서 로그인했다' 창·[이 기기 / 클라우드] 고르기 창을 찍을 때 쓴다.
// 상태는 localStorage `bha-cloud-fake` = { user, doc, active, googleTaken } — 미리 넣어 두면 '다른 기기의 세이브'·'다른 기기가 차지함'이 된다. 다른 창(탭)의 쓰기는 storage 이벤트로 받는다
// (같은 창의 쓰기는 이벤트가 없다 — 점검 스크립트는 두 번째 탭에서 쓴다). 연동: 이메일 `taken@…`·googleTaken 이면 '그 계정에 세이브 있음'(거절), 아니면 같은 uid 로 연동.
import type { ActiveDevice, CloudBackend, CloudDoc, CloudUser } from './cloudSave';
import { sanitizeActive, sanitizeCloudDoc } from './cloudSave';

export const CLOUD_FAKE_KEY = 'bha-cloud-fake';

interface FakeState {
  user: CloudUser | null;
  doc: CloudDoc | null;
  active: ActiveDevice | null;
  /** [계정 연동] Google 이 '이미 세이브가 있는 계정'으로 나오게 */
  googleTaken: boolean;
}

export const FAKE_GOOGLE_USER: CloudUser = { uid: 'fake-uid', name: '테스트 사용자', email: 'tester@example.com', anonymous: false };
export const FAKE_GUEST_USER: CloudUser = { uid: 'fake-guest', name: null, email: null, anonymous: true };

function readState(): FakeState {
  try {
    const raw = JSON.parse(localStorage.getItem(CLOUD_FAKE_KEY) ?? 'null') as Partial<FakeState> | null;
    const u = raw?.user;
    return {
      user: u && typeof u.uid === 'string' ? { uid: u.uid, name: u.name ?? null, email: u.email ?? null, anonymous: u.anonymous === true } : null,
      doc: sanitizeCloudDoc(raw?.doc),
      active: sanitizeActive(raw?.active),
      googleTaken: raw?.googleTaken === true,
    };
  } catch {
    return { user: null, doc: null, active: null, googleTaken: false };
  }
}
function writeState(s: FakeState): void {
  localStorage.setItem(CLOUD_FAKE_KEY, JSON.stringify(s));
}

export async function loadFakeBackend(): Promise<CloudBackend> {
  const authSubs = new Set<(u: CloudUser | null) => void>();
  const docSubs = new Set<(d: CloudDoc | null) => void>();
  const activeSubs = new Set<(d: ActiveDevice | null) => void>();
  window.addEventListener('storage', (e) => {
    if (e.key !== CLOUD_FAKE_KEY) return;
    const s = readState();
    for (const cb of docSubs) cb(s.doc);
    for (const cb of activeSubs) cb(s.active);
  });
  const delay = () => new Promise((r) => setTimeout(r, 120));
  const setUser = (u: CloudUser | null) => {
    const s = readState();
    s.user = u;
    writeState(s);
    for (const cb of authSubs) cb(u);
  };
  const fail = (code: string) => Object.assign(new Error('fake'), { code });
  return {
    watchAuth: (cb) => {
      authSubs.add(cb);
      cb(readState().user);
      return () => authSubs.delete(cb);
    },
    async signIn() {
      await delay();
      setUser(FAKE_GOOGLE_USER);
    },
    async signInGuest() {
      await delay();
      // `?cloudfake=noguest`: 익명 로그인이 꺼진 서버 응답 (GDD 222장 2 게스트 실패 안내 확인용)
      if (typeof location !== 'undefined' && new URLSearchParams(location.search).get('cloudfake') === 'noguest') throw fail('auth/admin-restricted-operation');
      setUser(FAKE_GUEST_USER);
    },
    // 이메일: 비밀번호 'wrong…' 이면 틀림, 'taken@' 로 시작하는 이메일 가입은 이미 가입 — 오류 문구 확인용
    async signInEmail(email, password) {
      await delay();
      if (password.startsWith('wrong')) throw fail('auth/invalid-credential');
      setUser({ uid: `fake-${email}`, name: null, email, anonymous: false });
    },
    async signUpEmail(email, password) {
      await delay();
      if (email.startsWith('taken@')) throw fail('auth/email-already-in-use');
      setUser({ uid: `fake-${email}`, name: null, email, anonymous: false });
      void password;
    },
    async resetPassword() {
      await delay();
    },
    // 계정 연동 (GDD 199장 3): taken@ 이메일·googleTaken 이면 그 계정에 세이브가 있다(거절) · 'empty@' 이메일이면 계정은 있지만 세이브 없음(그 계정으로 옮김) · 아니면 같은 uid 로 연동
    async link(kind, email = '', password = '') {
      await delay();
      const s = readState();
      if (!s.user?.anonymous) throw fail('auth/provider-already-linked');
      const target: CloudUser = kind === 'google' ? FAKE_GOOGLE_USER : { uid: `fake-${email}`, name: null, email, anonymous: false };
      const taken = kind === 'google' ? s.googleTaken : email.startsWith('taken@');
      const exists = taken || email.startsWith('empty@');
      if (kind === 'email' && password.startsWith('wrong')) throw fail('auth/invalid-credential');
      if (exists) return { kind: 'in-use', hasSave: taken, switchTo: async () => setUser(target) };
      const linked: CloudUser = { ...target, uid: s.user.uid };
      setUser(linked);
      return { kind: 'linked', user: linked };
    },
    async signOut() {
      setUser(null);
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
    async readActive() {
      await delay();
      return readState().active;
    },
    async writeActive(_uid, d) {
      await delay();
      const s = readState();
      s.active = d;
      writeState(s);
    },
    watchActive: (_uid, cb) => {
      activeSubs.add(cb);
      return () => activeSubs.delete(cb);
    },
  };
}
