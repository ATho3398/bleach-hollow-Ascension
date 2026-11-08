// Firebase 층 (GDD 196장, C.323): Authentication(Google) + Cloud Firestore(users/{uid}). 이 파일과 firebase 패키지는 app.ts 가 동적 import 로만 부른다 —
// 로그인 버튼을 누르거나 이미 로그인된 기기에서만 받는다(첫 로딩·오프라인·서비스 워커 미리 캐시 목록에 영향 없음, vite.config.ts 'firebase' 덩어리).
// 세이브 논리는 cloudSave.ts(CloudSync) — 여기는 SDK 호출을 CloudBackend 모양으로 감싸기만 한다.
import type { CloudBackend, CloudDoc, CloudUser } from './cloudSave';
import { sanitizeCloudDoc } from './cloudSave';
import { CLOUD_COLLECTION, FIREBASE_CONFIG } from './config/firebase';

/** 팝업이 안 되는 환경(막힘·홈 화면 앱 등)이면 리다이렉트 로그인으로 넘기는 오류 코드 */
export const POPUP_FALLBACK_CODES: ReadonlySet<string> = new Set([
  'auth/popup-blocked',
  'auth/operation-not-supported-in-this-environment',
  'auth/web-storage-unsupported',
]);

export async function loadFirebaseBackend(config: Record<string, string> = FIREBASE_CONFIG): Promise<CloudBackend> {
  const [appMod, authMod, fsMod] = await Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/firestore')]);
  const app = appMod.getApps()[0] ?? appMod.initializeApp(config);
  const auth = authMod.getAuth(app);
  // 한 번 로그인하면 그 기기에서 계속 (GDD 196장 2) — 웹 기본값도 local 이지만 분명히 둔다
  try {
    await authMod.setPersistence(auth, authMod.browserLocalPersistence);
  } catch {
    /* 저장소가 막힌 브라우저면 세션 동안만 */
  }
  const db = fsMod.getFirestore(app);
  const provider = new authMod.GoogleAuthProvider();
  const ref = (uid: string) => fsMod.doc(db, CLOUD_COLLECTION, uid);
  const toUser = (u: { uid: string; displayName: string | null; email: string | null } | null): CloudUser | null =>
    u ? { uid: u.uid, name: u.displayName, email: u.email } : null;
  // 리다이렉트 로그인에서 돌아왔으면 결과를 받아 둔다 (실패·결과 없음은 무시 — 최종 상태는 onAuthStateChanged)
  try {
    await authMod.getRedirectResult(auth);
  } catch {
    /* 돌아온 것이 아니거나 취소 */
  }
  return {
    watchAuth: (cb) => authMod.onAuthStateChanged(auth, (u) => cb(toUser(u))),
    async signIn(redirect) {
      if (redirect) return void (await authMod.signInWithRedirect(auth, provider));
      try {
        await authMod.signInWithPopup(auth, provider);
      } catch (e) {
        const code = (e as { code?: unknown } | null)?.code;
        if (typeof code === 'string' && POPUP_FALLBACK_CODES.has(code)) return void (await authMod.signInWithRedirect(auth, provider));
        throw e;
      }
    },
    // 이메일/비밀번호 (GDD 196장 결정 7)
    signInEmail: async (email, password) => void (await authMod.signInWithEmailAndPassword(auth, email, password)),
    signUpEmail: async (email, password) => void (await authMod.createUserWithEmailAndPassword(auth, email, password)),
    resetPassword: (email) => authMod.sendPasswordResetEmail(auth, email),
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
  };
}
