// Firebase 웹 앱 설정 (GDD 196장, C.323): 공개 값이다 — 보안은 Firestore 규칙(firestore.rules, 자기 uid 문서만)이 맡는다.
// 사용자가 Firebase 콘솔에서 만든 프로젝트 `bleach-74864`(공개 이름 '블리치 할로우 어센션', Firestore 서울, Google 로그인, 승인 도메인 atho3398.github.io).
// 게임 실행 중 AI API 호출 없음은 그대로(11-1) — 여기 값은 로그인·세이브 저장에만 쓴다.

export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyA5pLD9944s-mZF--LXBRbEWKJotB9Bsu4',
  authDomain: 'bleach-74864.firebaseapp.com',
  projectId: 'bleach-74864',
  storageBucket: 'bleach-74864.firebasestorage.app',
  messagingSenderId: '1032292783962',
  appId: '1:1032292783962:web:6aa17cf12dac238378c563',
} as const;

/** 세이브 문서 모음 이름: `users/{uid}` 문서 하나 = 그 계정의 세이브 (GDD 196장 1) */
export const CLOUD_COLLECTION = 'users';
