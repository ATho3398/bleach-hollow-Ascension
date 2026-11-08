// Firebase 층 (GDD 196장, C.323 · 199장, C.325): Authentication(Google 팝업·이메일·익명) + Cloud Firestore(users/{uid} 세이브 · devices/{uid} 활성 기기).
// 이 파일과 firebase 패키지는 app.ts 가 동적 import 로만 부른다 — 로그인 창이 보이거나(미리 받기) 버튼을 누르거나 이미 로그인된 기기에서만 받는다
// (첫 로딩·오프라인·서비스 워커 미리 캐시 목록에 영향 없음, vite.config.ts 'firebase' 덩어리). 세이브 논리는 cloudSave.ts(CloudSync) — 여기는 SDK 호출을 CloudBackend 모양으로 감싸기만 한다.
//
// 모바일 로그인 실패 원인 (GDD 199장 1, C.325):
//  ① signInWithRedirect — authDomain(bleach-74864.firebaseapp.com)이 게임 주소(atho3398.github.io)와 달라, 서드파티 저장소를 분리하는 브라우저(크롬 115+·사파리·파이어폭스)에서는
//     Google 에서 돌아와도 getRedirectResult 가 빈손이다(Firebase 공식 '리다이렉트 모범 사례' 문서의 바로 그 경우). 홈 화면 앱은 늘 리다이렉트였고, 탭도 팝업이 막히면 리다이렉트로 넘어갔다 → 안 됨.
//  ② 팝업은 사용자 누름(transient activation, 크롬 약 5초) 안에 열려야 하는데, 옛 흐름은 누른 뒤에야 SDK(940kB)를 받고 인증 iframe 을 띄운 다음 window.open 을 했다 → 폰 망에서는 늦어
//     auth/popup-blocked → ① 로 넘어가 실패. 수리 = 팝업만 쓰고(리다이렉트 폐기), SDK 는 로그인 창이 보일 때 미리 받는다(CloudSync.warm — 모바일에서는 getAuth 가 인증 iframe 도 미리 띄운다).
//     그래도 막히면 '팝업이 막혔다. 한 번 더 누른다' — 두 번째 누름은 SDK 가 있어 바로 열린다.
import type { ActiveDevice, CloudBackend, CloudDoc, CloudUser, LinkResult } from './cloudSave';
import { sanitizeActive, sanitizeCloudDoc } from './cloudSave';
import { CLOUD_COLLECTION, DEVICE_COLLECTION, FIREBASE_CONFIG } from './config/firebase';

/** 연동하려는 계정이 이미 있을 때(credential-already-in-use·email-already-in-use) — 임시 앱으로 그 계정에 로그인해 세이브 유무만 본다 */
export const PROBE_APP_NAME = 'bha-link-probe';

export async function loadFirebaseBackend(config: Record<string, string> = FIREBASE_CONFIG): Promise<CloudBackend> {
  const [appMod, authMod, fsMod] = await Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/firestore')]);
  const app = appMod.getApps().find((a) => a.name === '[DEFAULT]') ?? appMod.initializeApp(config);
  const auth = authMod.getAuth(app);
  // 한 번 로그인하면 그 기기에서 계속 (GDD 196장 2) — 웹 기본값도 local 이지만 분명히 둔다
  try {
    await authMod.setPersistence(auth, authMod.browserLocalPersistence);
  } catch {
    /* 저장소가 막힌 브라우저면 세션 동안만 */
  }
  const db = fsMod.getFirestore(app);
  const provider = new authMod.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' }); // 연동·다른 계정 로그인 때 계정을 고를 수 있게
  const ref = (uid: string) => fsMod.doc(db, CLOUD_COLLECTION, uid);
  const devRef = (uid: string) => fsMod.doc(db, DEVICE_COLLECTION, uid);
  type U = { uid: string; displayName: string | null; email: string | null; isAnonymous: boolean };
  const toUser = (u: U | null): CloudUser | null => (u ? { uid: u.uid, name: u.displayName, email: u.email, anonymous: u.isAnonymous } : null);
  // 옛 빌드(C.323)가 리다이렉트로 떠났다 돌아온 경우만 결과를 받아 둔다 (지금은 팝업만 — 실패·결과 없음은 무시, 최종 상태는 onAuthStateChanged)
  try {
    await authMod.getRedirectResult(auth);
  } catch {
    /* 돌아온 것이 아니거나 취소 */
  }

  /** 그 계정에 세이브가 있는가: 임시 앱(메모리 persistence)에 그 자격으로 로그인해 users/{uid} 를 읽고 바로 로그아웃·정리 */
  async function probeHasSave(cred: import('firebase/auth').AuthCredential): Promise<boolean> {
    const old = appMod.getApps().find((a) => a.name === PROBE_APP_NAME);
    if (old) await appMod.deleteApp(old).catch(() => {});
    const app2 = appMod.initializeApp(config, PROBE_APP_NAME);
    try {
      const auth2 = authMod.initializeAuth(app2, { persistence: authMod.inMemoryPersistence });
      const uc = await authMod.signInWithCredential(auth2, cred);
      const snap = await fsMod.getDoc(fsMod.doc(fsMod.getFirestore(app2), CLOUD_COLLECTION, uc.user.uid));
      const has = snap.exists() && sanitizeCloudDoc(snap.data()) !== null;
      await authMod.signOut(auth2).catch(() => {});
      return has;
    } finally {
      await appMod.deleteApp(app2).catch(() => {});
    }
  }
  const inUse = async (cred: import('firebase/auth').AuthCredential): Promise<LinkResult> => ({
    kind: 'in-use',
    hasSave: await probeHasSave(cred),
    switchTo: async () => void (await authMod.signInWithCredential(auth, cred)),
  });

  return {
    watchAuth: (cb) => authMod.onAuthStateChanged(auth, (u) => cb(toUser(u))),
    // Google — 팝업만 (GDD 199장 1). 막히면(auth/popup-blocked) 그대로 던진다: 문구 '한 번 더 누른다' (리다이렉트로 넘기지 않는다 — 위 ①)
    signIn: async () => void (await authMod.signInWithPopup(auth, provider)),
    // 게스트 = 익명 (GDD 199장 3). 콘솔 > Authentication > 로그인 방법에서 '익명'을 켜야 한다(꺼져 있으면 auth/admin-restricted-operation)
    signInGuest: async () => void (await authMod.signInAnonymously(auth)),
    // 이메일/비밀번호 (GDD 196장 결정 7)
    signInEmail: async (email, password) => void (await authMod.signInWithEmailAndPassword(auth, email, password)),
    signUpEmail: async (email, password) => void (await authMod.createUserWithEmailAndPassword(auth, email, password)),
    resetPassword: (email) => authMod.sendPasswordResetEmail(auth, email),
    // 계정 연동 (GDD 199장 3): 같은 uid 에 붙인다(게스트 세이브 그대로). 그 계정이 이미 있으면 세이브 유무를 본 뒤 CloudSync 가 정한다
    async link(kind, email = '', password = '') {
      const user = auth.currentUser;
      if (!user) throw Object.assign(new Error('no user'), { code: 'auth/user-token-expired' });
      if (kind === 'google') {
        try {
          const uc = await authMod.linkWithPopup(user, provider);
          return { kind: 'linked', user: toUser(uc.user)! };
        } catch (e) {
          const code = (e as { code?: unknown } | null)?.code;
          const cred = code === 'auth/credential-already-in-use' ? authMod.GoogleAuthProvider.credentialFromError(e as import('firebase/app').FirebaseError) : null;
          if (!cred) throw e;
          return inUse(cred);
        }
      }
      const cred = authMod.EmailAuthProvider.credential(email, password);
      try {
        const uc = await authMod.linkWithCredential(user, cred);
        return { kind: 'linked', user: toUser(uc.user)! };
      } catch (e) {
        const code = (e as { code?: unknown } | null)?.code;
        if (code !== 'auth/email-already-in-use' && code !== 'auth/credential-already-in-use') throw e;
        return inUse(cred); // 비밀번호가 틀리면 probe 의 로그인이 auth/invalid-credential 을 던진다 → 그 문구
      }
    },
    signOut: () => authMod.signOut(auth),
    async read(uid) {
      const snap = await fsMod.getDoc(ref(uid));
      return snap.exists() ? sanitizeCloudDoc(snap.data()) : null;
    },
    write: (uid, doc: CloudDoc) => fsMod.setDoc(ref(uid), doc),
    watchDoc: (uid, cb) =>
      fsMod.onSnapshot(ref(uid), (snap) => {
        if (snap.metadata.hasPendingWrites) return; // 내 쓰기의 되돌림은 건너뛴다
        cb(snap.exists() ? sanitizeCloudDoc(snap.data()) : null);
      }, () => { /* 구독 오류는 다음 연결 때 다시 읽는다 */ }),
    // 활성 기기 (GDD 199장 4)
    async readActive(uid) {
      const snap = await fsMod.getDoc(devRef(uid));
      return snap.exists() ? sanitizeActive(snap.data()) : null;
    },
    writeActive: (uid, d: ActiveDevice) => fsMod.setDoc(devRef(uid), d),
    watchActive: (uid, cb) =>
      fsMod.onSnapshot(devRef(uid), (snap) => {
        if (snap.metadata.hasPendingWrites || snap.metadata.fromCache) return; // 서버에서 확정된 상태만 — 내 쓰기 전 상태·오프라인 캐시로 판정하지 않는다
        cb(snap.exists() ? sanitizeActive(snap.data()) : null);
      }, () => { /* 규칙 미게시·끊김: 다음 연결 때 readActive 로 판정 */ }),
  };
}
