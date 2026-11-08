// 클라우드 세이브 (GDD 196장, C.323 · 199장, C.325): 로그인한 계정의 문서 하나(users/{uid}) = 마지막으로 플레이한 슬롯의 세이브.
// - 처음 켤 때 로그인 창(199장 2): [Google 로그인]·[이메일 로그인]·[게스트로 시작]. 한 번 고르면(CLOUD_GATE_KEY) 다시 안 뜬다. 오프라인이면 기기 저장으로 바로.
// - 게스트 = Firebase 익명 로그인(클라우드에도 저장). 설정 > 기타 [계정 연동](Google/이메일) — 그 계정에 세이브가 없으면 게스트 세이브가 그 계정으로, 있으면 거절(199장 3).
// - 한 기기만(199장 4): devices/{uid} = 마지막으로 켠(로그인·앱 시작·복귀) 기기. 다른 기기가 차지하면 이 기기는 '다른 기기에서 로그인했다' 창 + 플레이 막기(저장은 먼저),
//   [다시 이 기기에서 하기]로 되찾는다. 막힌 동안은 올리지도 받지도 않는다. 막힌 기기는 스스로 다시 차지하지 않는다(핑퐁 방지).
// - 로그인은 Google 팝업만(199장 1): signInWithRedirect 는 authDomain(firebaseapp.com)이 게임 주소와 달라 저장소 분리(크롬 115+·사파리)에서 늘 실패한다. 팝업은 사용자
//   누름 안에 열려야 해서 SDK 를 로그인 창이 보일 때 미리 받는다(warm) — 누른 뒤 940kB 를 받으면 폰에서 팝업 차단(popup-blocked)으로 끝났다.
// - 저장할 때마다(persist) 올리되 묶어서(CLOUD_DEBOUNCE_MS), 오프라인이면 연결되면(onOnline) 올린다. 세이브 형식은 SAVE 그대로(serializeSave) + 저장 시각·진행 요약.
// - 다른 기기에서 로그인했는데 기기·클라우드가 다르면 [이 기기 / 클라우드] 고르는 창(기본 = 더 최근). 고르지 않은 쪽은 그 슬롯 백업에 한 벌(BackupReason 'cloud').
// - Firebase SDK 는 여기서 직접 import 하지 않는다 — CloudBackend 인터페이스 뒤에 두고(host.loadBackend, 동적 import), 테스트는 가짜 백엔드를 끼운다.
//   엔진·세이브 구조는 건드리지 않는다(SAVE_FORMAT_VERSION 그대로). 종족 분기 없음.
import { migrateSave, SAVE_FORMAT_VERSION, type SaveData, type StorageLike } from './game';
import { parseSaveText } from './saveCodec';
import { parseImport, serializeSave } from './saveBackup';
import { allSlotSummaries, lastPlayedSlot, slotBackupKey, slotKey, slotSummary, stashSlot, touchSlot, writeBackupMeta } from './saveSlots';

/** 진행 요약 (고르기 창·목록용) */
export interface CloudSummary {
  factionId: string;
  tierIndex: number;
  expeditions: number;
}

/** Firestore 문서 한 벌. 세이브 원문(text)은 serializeSave 결과 그대로(압축 덩어리는 글로 품는다) */
export interface CloudDoc {
  /** 세이브 형식 (meta.format 과 같다 — 옛 형식이면 기존 마이그레이션으로 연다, 더 새 형식이면 열지 않는다) */
  format: number;
  /** 올린 시각(ms, 올린 기기 시계) */
  savedAt: number;
  /** 어느 슬롯의 세이브인가 */
  slot: number;
  /** 올린 기기 id (CLOUD_DEVICE_KEY) */
  device: string;
  /** 올린 빌드 */
  build: string;
  /** 이 문서가 바탕으로 삼은 클라우드 판(savedAt). 같은 내용을 내려받고 켤 때 저장한 것(시각만 바뀐 것)을 다른 기기가 충돌로 보지 않게 (C.323) */
  base: number | null;
  summary: CloudSummary;
  text: string;
}

export interface CloudUser {
  uid: string;
  name: string | null;
  email: string | null;
  /** 게스트(익명 로그인, GDD 199장 3) — 계정을 연동하면 false 가 된다 */
  anonymous: boolean;
}

/** devices/{uid} 문서: 이 계정을 마지막으로 켠 기기 (GDD 199장 4) */
export interface ActiveDevice {
  /** 기기 id (CLOUD_DEVICE_KEY) */
  device: string;
  /** 차지한 시각(ms, 그 기기 시계 — 표시용. 판정은 '문서의 device 가 나인가'로만 한다) */
  at: number;
  /** 기기 이름 (deviceLabel — 다른 기기의 창에 보인다) */
  name: string;
  build: string;
}

export type LinkKind = 'google' | 'email';

/** 계정 연동 결과 (백엔드) */
export type LinkResult =
  /** 같은 uid 에 로그인 방법이 붙었다 — 게스트 세이브가 그대로 그 계정 것이 된다 */
  | { kind: 'linked'; user: CloudUser }
  /** 그 계정이 이미 있다. hasSave = 그 계정에 세이브가 있는가(임시 로그인으로 본다). switchTo = 그 계정으로 바꿔 로그인(게스트는 버린다) */
  | { kind: 'in-use'; hasSave: boolean; switchTo(): Promise<void> };

/** Firebase 를 감싼 얇은 층 (cloudFirebase.ts). 테스트는 가짜로 끼운다 */
export interface CloudBackend {
  /** 로그인 상태 구독 (구독 직후 지금 상태 한 번 포함). 해제 함수를 돌려준다 */
  watchAuth(cb: (user: CloudUser | null) => void): () => void;
  /** Google 로그인 — 팝업만 (GDD 199장 1). 실패는 code 가 든 오류(auth/popup-blocked 등) */
  signIn(): Promise<void>;
  /** 게스트 = 익명 로그인 (GDD 199장 3) */
  signInGuest(): Promise<void>;
  /** 이메일/비밀번호 (GDD 196장 결정 7): 로그인 · 가입 · 비밀번호 재설정 메일. 실패는 code 가 든 오류를 던진다(authErrorText) */
  signInEmail(email: string, password: string): Promise<void>;
  signUpEmail(email: string, password: string): Promise<void>;
  resetPassword(email: string): Promise<void>;
  /** 게스트에 계정 연동 (GDD 199장 3). email 종류면 email·password 를 쓴다. 실패는 code 가 든 오류 */
  link(kind: LinkKind, email?: string, password?: string): Promise<LinkResult>;
  signOut(): Promise<void>;
  read(uid: string): Promise<CloudDoc | null>;
  write(uid: string, doc: CloudDoc): Promise<void>;
  /** 문서 변경 구독(자기 쓰기의 되돌림 포함 — device 로 거른다). 해제 함수 */
  watchDoc(uid: string, cb: (doc: CloudDoc | null) => void): () => void;
  /** 활성 기기 문서 devices/{uid} (GDD 199장 4) */
  readActive(uid: string): Promise<ActiveDevice | null>;
  writeActive(uid: string, d: ActiveDevice): Promise<void>;
  /** 활성 기기 변경 구독 — 서버에서 확정된 상태만(내 쓰기 대기 중·캐시 스냅샷은 건너뛴다). 해제 함수 */
  watchActive(uid: string, cb: (d: ActiveDevice | null) => void): () => void;
}

/** 로그인 기억(uid·이름·이메일): 있으면 켤 때 SDK 를 바로 불러 자동 로그인을 확인한다. 없으면 SDK 를 받지 않는다(첫 로딩·오프라인 그대로) */
export const CLOUD_PREF_KEY = 'bha-cloud';
/** 이 기기 id (처음 한 번 만든다) */
export const CLOUD_DEVICE_KEY = 'bha-cloud-device';
/** 옛 빌드(C.323)의 리다이렉트 로그인 표시 — 지금은 팝업만 쓴다(GDD 199장 1). 남아 있으면 켤 때 SDK 를 불러 결과를 받고 지운다 */
export const CLOUD_REDIRECT_KEY = 'bha-cloud-redirect';
/** 처음 로그인 창(GDD 199장 2)에서 한 번 골랐다는 기억 — 있으면 다시 띄우지 않는다. 로그아웃하면 지운다(다음에 켤 때 다시 고른다) */
export const CLOUD_GATE_KEY = 'bha-cloud-gate';
/** 복귀(앱 다시 보임) 때 다시 차지하는 최소 간격 — 같은 기기가 잠깐 전환했다 돌아올 때마다 쓰지 않게 */
export const CLOUD_RECLAIM_MIN_MS = 30_000;
/** 마지막으로 맞춘 클라우드 판 기록: 어느 계정·슬롯·클라우드 savedAt 과 맞췄고, 그때 기기 세이브의 플레이 시각(localAt)이 얼마였나. 올린 뒤에는 uploadedAt = savedAt */
export const CLOUD_SYNC_KEY = 'bha-cloud-sync';
/** 저장을 묶는 시간 · 묶여도 이 시간 안에는 한 번 올린다 */
export const CLOUD_DEBOUNCE_MS = 3000;
export const CLOUD_MAX_WAIT_MS = 15000;
/** 올리기 실패 뒤 다시 시도 간격(순서대로, 마지막 값 반복) */
export const CLOUD_RETRY_MS: readonly number[] = [5000, 15000, 30000, 60000, 120000];
/** 세이브 원문 최대 바이트 — Firestore 문서 1MiB 한도 아래 (firestore.rules 의 text.size() 한도와 같은 뜻) */
export const CLOUD_TEXT_MAX_BYTES = 900_000;

export type CloudStatus =
  /** 로그인 안 함 */
  | 'signed-out'
  /** SDK 받는 중·로그인 확인 중·로그인 진행 중 */
  | 'loading'
  /** 클라우드와 맞음 */
  | 'synced'
  /** 바뀐 것이 있어 잠시 뒤 올린다 */
  | 'pending'
  | 'saving'
  /** 오프라인 — 연결되면 올린다 */
  | 'offline'
  /** 올리기 실패 — 다시 시도한다 */
  | 'error'
  /** 클라우드 세이브가 더 새 버전이라 올리지도 받지도 않는다 */
  | 'blocked'
  /** 세이브가 너무 커 올리지 못한다 */
  | 'too-big'
  /** 다른 기기가 이 계정을 차지해 이 기기는 막혔다 (GDD 199장 4) — 올리지도 받지도 않는다 */
  | 'other-device';

export interface CloudState {
  status: CloudStatus;
  user: CloudUser | null;
  /** 마지막으로 클라우드에 올린(또는 받은) 시각 */
  savedAt: number | null;
  /** 이 기기를 막은 다른 기기 (status 'other-device' 일 때) */
  blockedBy: ActiveDevice | null;
}

/** 계정 연동 결과 (CloudSync.linkAccount) */
export type LinkOutcome =
  /** moved = 그 계정이 이미 있었지만 세이브가 없어 그 계정으로 바꿔 로그인했다(게스트 세이브는 기기 세이브로서 그 계정에 올라간다) */
  | { ok: true; moved: boolean }
  /** 거절·실패 문구. switchTo 가 있으면 '이 계정에는 이미 세이브가 있다' — 그래도 그 계정으로 로그인하는 길(기기 세이브는 고르기 창으로) */
  | { ok: false; text: string; switchTo?: () => Promise<void> };

export type CloudPick = 'device' | 'cloud';

/** 기기·클라우드 세이브가 달라 골라야 한다 (GDD 196장 4). 화면이 창을 띄우고 choose 로 답한다 */
export interface CloudConflict {
  slot: number;
  device: { summary: CloudSummary; playedAt: number | null };
  cloud: { summary: CloudSummary; savedAt: number };
  /** 기본 선택 = 더 최근 쪽 */
  suggested: CloudPick;
  choose(pick: CloudPick): void;
}

export interface CloudHost {
  storage: StorageLike & { removeItem?(key: string): void };
  /** Firebase 층을 (동적 import 로) 불러온다 — 로그인 버튼을 누르거나 이미 로그인된 기기에서만 불린다 */
  loadBackend(): Promise<CloudBackend>;
  build: string;
  /** 지금 플레이 중인 슬롯(0 = 처음 화면)과 그 세이브(올릴 때 최신 값을 읽는다) */
  current(): { slot: number; save: SaveData | null };
  onConflict(c: CloudConflict): void;
  /** 클라우드 세이브를 기기 슬롯에 적용했다 (지금 플레이 중인 슬롯이면 다시 연다) */
  onApplied(slot: number): void;
  /** 짧은 알림 (토스트) */
  notify(title: string, meta?: string): void;
  /** 이 기기 이름 (deviceLabel) — 다른 기기의 '다른 기기에서 로그인했다' 창에 보인다 */
  deviceName: string;
  /** 다른 기기가 이 계정을 차지했다 (GDD 199장 4): 화면은 진행을 저장하고 플레이를 막는 창을 띄운다 */
  onBlocked(by: ActiveDevice): void;
  /** 이 기기가 다시 차지했다(또는 로그아웃) — 막는 창을 닫는다 */
  onUnblocked(): void;
  online(): boolean;
  now?(): number;
}

interface SyncRecord {
  uid: string;
  slot: number;
  savedAt: number;
  /** 맞춘 그때 기기 세이브의 플레이 시각(슬롯 meta) 기준 — 이보다 뒤에 플레이했으면 '바뀐 것 있음' */
  localAt: number;
  /** 마지막으로 이 기기가 올린 판 (내려받기로 맞췄으면 null) */
  uploadedAt: number | null;
}

export type Reconcile =
  | { kind: 'none' }
  | { kind: 'upload'; slot: number }
  | { kind: 'download'; slot: number }
  | { kind: 'conflict'; slot: number; suggested: CloudPick }
  | { kind: 'blocked' };

export interface LocalInfo {
  slot: number;
  /** 세이브가 있는가(열 수 있는가) */
  exists: boolean;
  playedAt: number | null;
}

/** 기기와 클라우드를 어떻게 맞출지 (순수 함수 — 테스트). open = 그 슬롯을 지금 이 기기에서 열어 플레이 중인가 */
export function decideReconcile(
  cloud: CloudDoc | null, local: LocalInfo, synced: SyncRecord | null, device: string, open: boolean, format: number = SAVE_FORMAT_VERSION,
): Reconcile {
  if (!cloud) return local.exists ? { kind: 'upload', slot: local.slot } : { kind: 'none' };
  if (cloud.format > format) return { kind: 'blocked' };
  if (!local.exists) return { kind: 'download', slot: cloud.slot };
  const touched = (local.playedAt ?? 0) > (synced?.localAt ?? -1);
  // 이 기기가 올린 판이거나 이미 맞춘 판: 그 뒤 플레이했으면 올리고, 아니면 그대로
  if (cloud.device === device || (synced && synced.slot === cloud.slot && synced.savedAt === cloud.savedAt)) return touched ? { kind: 'upload', slot: cloud.slot } : { kind: 'none' };
  // 다른 기기가 내 판을 내려받고 켤 때 저장한 것(base = 내가 올린 판)을 플레이 중에 받으면 — 내 쪽이 더 앞서 있다, 그대로 둔다(다음 저장이 덮는다)
  if (open && synced?.uploadedAt != null && cloud.base === synced.uploadedAt) return { kind: 'none' };
  if (!touched) return { kind: 'download', slot: cloud.slot };
  return { kind: 'conflict', slot: cloud.slot, suggested: (local.playedAt ?? 0) > cloud.savedAt ? 'device' : 'cloud' };
}

export function summaryOf(save: Pick<SaveData, 'factionId' | 'evolution' | 'runLog'>): CloudSummary {
  return { factionId: save.factionId, tierIndex: save.evolution.tierIndex, expeditions: save.runLog.runs.length };
}

/** 문서 만들기 (올리기). base = 마지막으로 맞춘 클라우드 판 */
export function makeCloudDoc(save: SaveData, o: { slot: number; device: string; build: string; base: number | null; nowMs: number }): CloudDoc {
  return { format: SAVE_FORMAT_VERSION, savedAt: o.nowMs, slot: o.slot, device: o.device, build: o.build, base: o.base, summary: summaryOf(save), text: serializeSave(save) };
}

/** 글의 UTF-8 바이트 수 */
export function utf8Bytes(text: string): number {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text).length;
  return Buffer.byteLength(text, 'utf8');
}

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Firestore 에서 읽은 값 → 문서. 모양이 틀리면 null(없는 것으로) */
export function sanitizeCloudDoc(raw: unknown): CloudDoc | null {
  if (!isRec(raw)) return null;
  const s = raw.summary;
  if (!num(raw.format) || !num(raw.savedAt) || !num(raw.slot) || typeof raw.text !== 'string' || !isRec(s)) return null;
  if (typeof s.factionId !== 'string' || !num(s.tierIndex) || !num(s.expeditions)) return null;
  return {
    format: raw.format,
    savedAt: raw.savedAt,
    slot: raw.slot,
    device: typeof raw.device === 'string' ? raw.device : '',
    build: typeof raw.build === 'string' ? raw.build : '',
    base: num(raw.base) ? raw.base : null,
    summary: { factionId: s.factionId, tierIndex: s.tierIndex, expeditions: s.expeditions },
    text: raw.text,
  };
}

function readJson<T>(storage: StorageLike, key: string): T | null {
  try {
    return JSON.parse(storage.getItem(key) ?? 'null') as T | null;
  } catch {
    return null;
  }
}
function writeJson(storage: StorageLike, key: string, value: unknown): void {
  try {
    if (value === null) storage.removeItem?.(key);
    else storage.setItem(key, JSON.stringify(value));
  } catch {
    /* 저장소가 막혀 있으면 기억만 못 한다 */
  }
}

/** 기억해 둔 로그인 (uid 가 있어야 한다) */
export function readCloudPref(storage: StorageLike): CloudUser | null {
  const p = readJson<Partial<CloudUser>>(storage, CLOUD_PREF_KEY);
  return p && typeof p.uid === 'string'
    ? { uid: p.uid, name: typeof p.name === 'string' ? p.name : null, email: typeof p.email === 'string' ? p.email : null, anonymous: p.anonymous === true }
    : null;
}

/** 처음 로그인 창을 띄울까 (GDD 199장 2): 로그인 기억이 없고, 아직 고른 적이 없고, 온라인일 때. 오프라인이면 기기 저장으로 바로 들어간다(기억하지 않아 다음에 다시 묻는다) */
export function needsLoginGate(storage: StorageLike, online: boolean): boolean {
  if (!online || readCloudPref(storage)) return false;
  try {
    return storage.getItem(CLOUD_GATE_KEY) === null;
  } catch {
    return false;
  }
}

export function markLoginGateDone(storage: StorageLike, nowMs: number = Date.now()): void {
  writeJson(storage, CLOUD_GATE_KEY, { at: nowMs });
}

/** Firestore 에서 읽은 값 → 활성 기기. 모양이 틀리면 null */
export function sanitizeActive(raw: unknown): ActiveDevice | null {
  if (!isRec(raw) || typeof raw.device !== 'string' || !raw.device || !num(raw.at)) return null;
  return { device: raw.device, at: raw.at, name: typeof raw.name === 'string' ? raw.name : '', build: typeof raw.build === 'string' ? raw.build : '' };
}

/** 기기 이름 한 줄 (표시용, 다른 기기의 막기 창): "Android Chrome" · "Windows Chrome" · "iPhone Safari" · 홈 화면 앱이면 "· 앱" */
export function deviceLabel(ua: string, standalone = false): string {
  const os = /iPhone|iPod/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS X|Macintosh/.test(ua) ? 'Mac' : /CrOS/.test(ua) ? 'Chromebook' : /Linux/.test(ua) ? 'Linux' : '기기';
  const browser = /SamsungBrowser/.test(ua) ? '삼성 인터넷' : /Edg\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\/|CriOS\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '브라우저';
  return `${os} ${browser}${standalone ? ' · 앱' : ''}`;
}

export function deviceIdOf(storage: StorageLike, rand: () => number = Math.random): string {
  try {
    const cur = storage.getItem(CLOUD_DEVICE_KEY);
    if (cur) return cur;
  } catch {
    /* 아래에서 새로 만든다 */
  }
  const id = `${Date.now().toString(36)}-${Math.floor(rand() * 2 ** 40).toString(36)}`;
  try {
    storage.setItem(CLOUD_DEVICE_KEY, id);
  } catch {
    /* 못 적으면 이 실행 동안만 쓴다 */
  }
  return id;
}

/** 슬롯의 기기 세이브 정보 (열 수 있는 세이브만 exists) */
export function localInfoOf(storage: StorageLike, slot: number): LocalInfo {
  const s = slotSummary(storage, slot);
  return { slot, exists: s.state === 'ok', playedAt: s.state === 'ok' ? s.playedAt : null };
}

/** 슬롯의 기기 세이브를 올릴 꼴로 읽는다 (칭호 판정 같은 부작용 없이 마이그레이션만). 못 읽으면 null */
export function loadSlotForCloud(storage: StorageLike, slot: number): SaveData | null {
  try {
    const text = storage.getItem(slotKey(slot));
    return text ? migrateSave(parseSaveText(text, false, storage)) : null;
  } catch {
    return null;
  }
}

export type ApplyCloudResult = 'ok' | 'newer' | 'corrupt' | 'failed';

/** 클라우드 세이브를 기기 슬롯에 쓴다: 지금 세이브는 그 슬롯 백업에 한 벌('cloud'), 옛 형식이면 기존 마이그레이션으로 올린다. 플레이 시각 = 클라우드 저장 시각 */
export function applyCloudToSlot(storage: StorageLike, doc: CloudDoc, slot: number): ApplyCloudResult {
  const r = parseImport(doc.text);
  if (!r.ok) return r.reason === 'newer' ? 'newer' : 'corrupt';
  try {
    if (!stashSlot(storage, slot, 'cloud')) return 'failed';
    storage.setItem(slotKey(slot), serializeSave(r.save));
    touchSlot(storage, slot, doc.savedAt);
    return 'ok';
  } catch {
    return 'failed';
  }
}

/** [이 기기]를 골랐을 때: 클라우드에 있던 세이브를 그 슬롯 백업에 한 벌 남긴다(되돌리기로 볼 수 있다) */
export function stashCloudCopy(storage: StorageLike, doc: CloudDoc, slot: number, nowMs: number = Date.now()): boolean {
  try {
    storage.setItem(slotBackupKey(slot), doc.text);
    writeBackupMeta(storage, slot, 'cloud', nowMs);
    return true;
  } catch {
    return false;
  }
}

const AUTH_CANCEL_CODES = new Set(['auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/user-cancelled']);

export type EmailAction = 'login' | 'signup' | 'reset';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Firebase 인증 오류 코드 → 화면 문구 (text-style '~다') */
export const AUTH_ERROR_TEXT: Readonly<Record<string, string>> = {
  'auth/invalid-email': '이메일 주소가 올바르지 않다.',
  'auth/user-not-found': '이메일이나 비밀번호가 맞지 않다.',
  'auth/wrong-password': '이메일이나 비밀번호가 맞지 않다.',
  'auth/invalid-credential': '이메일이나 비밀번호가 맞지 않다.',
  'auth/invalid-login-credentials': '이메일이나 비밀번호가 맞지 않다.',
  'auth/email-already-in-use': '이미 가입된 이메일이다. [로그인]을 누른다.',
  'auth/weak-password': '비밀번호는 6자 이상이어야 한다.',
  'auth/too-many-requests': '시도가 너무 많다. 잠시 뒤 다시 한다.',
  'auth/network-request-failed': '연결을 확인한다.',
  'auth/user-disabled': '쓸 수 없는 계정이다.',
  'auth/operation-not-allowed': '이 로그인 방법이 꺼져 있다.',
  'auth/admin-restricted-operation': '게스트 로그인이 꺼져 있다.',
  'auth/missing-password': '비밀번호를 적는다.',
  // 팝업 (GDD 199장 1): 누른 뒤 SDK 를 받느라 늦게 열리면 브라우저가 막는다 — 이제 SDK 가 받아져 있어 한 번 더 누르면 바로 열린다
  'auth/popup-blocked': '팝업이 막혔다. 한 번 더 누른다.',
  'auth/popup-closed-by-user': '로그인을 그만뒀다.',
  'auth/cancelled-popup-request': '로그인을 그만뒀다.',
  'auth/user-cancelled': '로그인을 그만뒀다.',
  'auth/unauthorized-domain': '이 주소에서는 로그인할 수 없다.',
  // 계정 연동 (GDD 199장 3)
  'auth/provider-already-linked': '이미 연동한 로그인 방법이다.',
  'auth/credential-already-in-use': '이미 쓰는 계정이다.',
  'auth/requires-recent-login': '다시 로그인한 뒤 연동한다.',
};
export const AUTH_ERROR_DEFAULT = '로그인하지 못했다. 잠시 뒤 다시 한다.';
/** 연동 거절 (GDD 199장 3): 그 계정에 세이브가 이미 있다 */
export const LINK_TAKEN_TEXT = '이 계정에는 이미 세이브가 있다.';

export function authErrorText(err: unknown): string {
  const code = (err as { code?: unknown } | null)?.code;
  return (typeof code === 'string' && AUTH_ERROR_TEXT[code]) || AUTH_ERROR_DEFAULT;
}

/** 로그인·올리기·내려받기·충돌 처리의 상태 기계. 화면(app.ts)은 persist 때 schedule(), 연결되면 onOnline(), 설정 화면은 state()·signIn()·signOut()·onChange() 만 쓴다 */
export class CloudSync {
  readonly device: string;
  private backend: CloudBackend | null = null;
  private loading: Promise<CloudBackend> | null = null;
  private user: CloudUser | null = null;
  private authKnown = false;
  private signingIn = false;
  private dirty = false;
  private firstDirtyAt = 0;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retries = 0;
  private inflight = false;
  private failed: 'offline' | 'error' | null = null;
  private blocked = false;
  private tooBig = false;
  private conflictOpen = false;
  private unwatchAuth: (() => void) | null = null;
  private unwatchDoc: (() => void) | null = null;
  private unwatchActive: (() => void) | null = null;
  private readonly listeners = new Set<() => void>();
  /** 마지막으로 본 클라우드 판(savedAt) — 같은 알림을 두 번 처리하지 않는다 */
  private seenRemote: number | null = null;
  // 한 기기만 (GDD 199장 4)
  /** 이 기기를 막은 다른 기기 */
  private blockedBy: ActiveDevice | null = null;
  /** 차지 쓰기 진행 중 — 그동안 들어오는 스냅샷(내 쓰기 전 상태)은 무시한다 */
  private claiming = false;
  /** 이 기기가 차지 쓰기에 성공한 적이 있는가(이번 로그인) — 없으면 연결될 때 다시 시도 */
  private claimed = false;
  private lastClaimAt = 0;

  constructor(private readonly host: CloudHost) {
    this.device = deviceIdOf(host.storage);
  }

  private now(): number {
    return this.host.now ? this.host.now() : Date.now();
  }

  /**
   * 켤 때: 로그인 기억이 있으면(또는 옛 빌드의 리다이렉트 표시가 남았으면) SDK 를 불러 로그인을 확인한다. 아니면 아무것도 받지 않는다.
   * blocked = 다른 기기가 차지해 막힌 채 다시 켰다(잠긴 화면에서 막히면 화면이 표시를 남기고 다시 켠다) — 이때는 차지하지 않고 막힌 채 시작한다
   */
  start(o: { blocked?: ActiveDevice | null } = {}): void {
    let redirect = false;
    try {
      redirect = this.host.storage.getItem(CLOUD_REDIRECT_KEY) !== null;
    } catch {
      redirect = false;
    }
    if (o.blocked) this.blockedBy = o.blocked;
    const pref = readCloudPref(this.host.storage);
    if (pref) this.user = pref; // SDK 확인 전까지 기억한 계정으로 보여 준다
    if (pref || redirect) void this.loadOrRetry();
  }

  /** 로그인 창이 보이면 SDK 를 미리 받는다 (GDD 199장 1): 팝업은 누름 안에 열려야 해서, 누른 뒤에 받으면 폰에서 차단된다. 실패(오프라인)는 조용히 */
  warm(): void {
    if (this.backend || this.loading || !this.host.online()) return;
    this.ensureBackend().catch(() => { /* 누를 때 다시 받는다 */ });
  }

  /** SDK 받기 — 못 받으면(오프라인·캐시 없음) 상태만 바꾸고 잠시 뒤·연결되면 다시 */
  private loadOrRetry(): void {
    void this.ensureBackend().then(() => {
      this.failed = null;
      this.emit();
    }, () => {
      this.failed = this.host.online() ? 'error' : 'offline';
      this.emit();
      this.armRetry(() => this.loadOrRetry());
    });
  }

  state(): CloudState {
    const synced = this.readSynced();
    const savedAt = synced && this.user && synced.uid === this.user.uid ? synced.savedAt : null;
    return { status: this.status(), user: this.user, savedAt, blockedBy: this.user ? this.blockedBy : null };
  }

  private status(): CloudStatus {
    if (this.signingIn) return 'loading';
    if (!this.user) return 'signed-out';
    if (this.blockedBy) return 'other-device';
    if (!this.backend) return this.failed ?? 'loading';
    if (!this.authKnown) return 'loading';
    if (this.blocked) return 'blocked';
    if (this.tooBig) return 'too-big';
    if (this.inflight) return 'saving';
    if (this.dirty) return this.host.online() ? (this.failed === 'error' ? 'error' : 'pending') : 'offline';
    if (this.failed) return this.failed;
    return 'synced';
  }

  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => void this.listeners.delete(cb);
  }

  private emit(): void {
    for (const cb of [...this.listeners]) cb();
  }

  private notify(title: string, meta?: string): void {
    this.host.notify(title, meta);
  }

  private ensureBackend(): Promise<CloudBackend> {
    if (this.backend) return Promise.resolve(this.backend);
    if (!this.loading) {
      this.emit();
      this.loading = this.host.loadBackend().then((b) => {
        this.backend = b;
        this.unwatchAuth?.();
        this.unwatchAuth = b.watchAuth((u) => this.onAuth(u));
        this.emit();
        return b;
      }, (e: unknown) => {
        this.loading = null;
        this.emit();
        throw e;
      });
    }
    return this.loading;
  }

  /**
   * [Google 로그인] (GDD 196장 2 · 199장 1): 팝업만. 돌려주는 값 = 실패 문구(없으면 null). quiet 면 토스트 없이 문구만(처음 로그인 창이 창 안에 보여 준다).
   * 리다이렉트는 쓰지 않는다 — authDomain 이 게임 주소와 달라 저장소 분리 브라우저(크롬 115+·사파리)에서 돌아와도 로그인이 안 된다
   */
  async signIn(o: { quiet?: boolean } = {}): Promise<string | null> {
    return this.runAuth(o, async (b) => b.signIn());
  }

  /** [게스트로 시작] = 익명 로그인 (GDD 199장 3). 클라우드에도 저장되고, 설정에서 계정을 연동할 수 있다 */
  async signInGuest(o: { quiet?: boolean } = {}): Promise<string | null> {
    return this.runAuth(o, async (b) => b.signInGuest());
  }

  private async runAuth(o: { quiet?: boolean }, fn: (b: CloudBackend) => Promise<void>): Promise<string | null> {
    if (this.signingIn) return '로그인을 확인하는 중이다. 잠시 뒤 다시 한다.';
    this.signingIn = true;
    this.emit();
    try {
      const b = await this.ensureBackend();
      await fn(b);
      return null;
    } catch (e) {
      const code = (e as { code?: unknown } | null)?.code;
      const text = typeof code === 'string' && AUTH_ERROR_TEXT[code] ? AUTH_ERROR_TEXT[code] : this.host.online() ? AUTH_ERROR_DEFAULT : AUTH_ERROR_TEXT['auth/network-request-failed']!;
      if (!o.quiet) this.notify(typeof code === 'string' && AUTH_CANCEL_CODES.has(code) ? '로그인을 그만뒀다' : '로그인하지 못했다', text);
      return text;
    } finally {
      this.signingIn = false;
      this.emit();
    }
  }

  /**
   * 게스트에 계정 연동 (GDD 199장 3). 같은 uid 에 붙으면 게스트 세이브가 그대로 그 계정 것. 그 계정이 이미 있으면 — 세이브가 없을 때만 그 계정으로 바꿔 로그인(기기 세이브가 올라간다),
   * 세이브가 있으면 거절 + 안내(switchTo 로 그래도 그 계정에 로그인하는 길은 열어 둔다 — 기기 세이브는 [이 기기 / 클라우드] 고르기로)
   */
  async linkAccount(kind: LinkKind, email = '', password = ''): Promise<LinkOutcome> {
    if (!this.user?.anonymous) return { ok: false, text: '게스트 계정일 때만 연동한다.' };
    const e = email.trim();
    if (kind === 'email') {
      if (!EMAIL_RE.test(e)) return { ok: false, text: AUTH_ERROR_TEXT['auth/invalid-email']! };
      if (password.length < 6) return { ok: false, text: AUTH_ERROR_TEXT['auth/weak-password']! };
    }
    if (this.signingIn) return { ok: false, text: '로그인을 확인하는 중이다. 잠시 뒤 다시 한다.' };
    this.signingIn = true;
    this.emit();
    try {
      const b = await this.ensureBackend();
      const r = await b.link(kind, e, password);
      if (r.kind === 'linked') {
        this.user = r.user;
        writeJson(this.host.storage, CLOUD_PREF_KEY, r.user);
        this.notify('계정을 연동했다', r.user.name ?? r.user.email ?? undefined);
        return { ok: true, moved: false };
      }
      if (r.hasSave) return { ok: false, text: LINK_TAKEN_TEXT, switchTo: () => r.switchTo() };
      await r.switchTo(); // 그 계정으로 — onAuth 가 이어서 차지·맞추기(클라우드 비어 있음 → 기기 세이브를 올린다)
      this.notify('그 계정으로 옮겼다', '이 세이브가 그 계정에 저장된다.');
      return { ok: true, moved: true };
    } catch (err) {
      return { ok: false, text: authErrorText(err) };
    } finally {
      this.signingIn = false;
      this.emit();
    }
  }

  /** 이메일 로그인·가입·비밀번호 재설정 (GDD 196장 결정 7). 돌려주는 값 = 실패 문구(없으면 null). 로그인·가입이 되면 watchAuth 가 Google 과 같은 흐름으로 이어 간다 */
  async emailAction(kind: EmailAction, email: string, password: string): Promise<string | null> {
    const e = email.trim();
    if (!EMAIL_RE.test(e)) return AUTH_ERROR_TEXT['auth/invalid-email']!;
    if (kind !== 'reset' && password.length < 6) return AUTH_ERROR_TEXT['auth/weak-password']!;
    if (this.signingIn) return '로그인을 확인하는 중이다. 잠시 뒤 다시 한다.';
    this.signingIn = true;
    this.emit();
    try {
      const b = await this.ensureBackend();
      if (kind === 'login') await b.signInEmail(e, password);
      else if (kind === 'signup') await b.signUpEmail(e, password);
      else await b.resetPassword(e);
      return null;
    } catch (err) {
      return authErrorText(err);
    } finally {
      this.signingIn = false;
      this.emit();
    }
  }

  /** 로그아웃: 이 기기 기억·처음 로그인 창 기억을 지운다(다음에 켤 때 다시 고른다, GDD 199장 2). 막혀 있었으면 창도 닫는다 */
  async signOut(): Promise<void> {
    try {
      await this.backend?.signOut();
    } catch {
      /* 로그아웃 실패해도 이 기기 기억은 지운다 */
    }
    writeJson(this.host.storage, CLOUD_GATE_KEY, null);
    this.onAuth(null);
  }

  private onAuth(u: CloudUser | null): void {
    this.authKnown = true;
    writeJson(this.host.storage, CLOUD_REDIRECT_KEY, null);
    const changed = (u?.uid ?? null) !== (this.user?.uid ?? null);
    const wasBlocked = this.blockedBy !== null;
    this.user = u;
    writeJson(this.host.storage, CLOUD_PREF_KEY, u);
    this.unwatchDoc?.();
    this.unwatchDoc = null;
    this.unwatchActive?.();
    this.unwatchActive = null;
    this.blocked = false;
    this.tooBig = false;
    this.failed = null;
    this.seenRemote = null;
    this.claimed = false;
    this.claiming = false;
    if (changed) this.blockedBy = null; // 다른 계정으로 바뀌었으면 막힘도 그 계정 것이었다
    if (!u) {
      this.dirty = false;
      this.blockedBy = null;
      this.clearTimers();
      this.emit();
      if (wasBlocked) this.host.onUnblocked();
      return;
    }
    if (changed) this.notify(u.anonymous ? '게스트로 시작했다' : '로그인했다', u.anonymous ? '설정 > 기타에서 계정을 연동할 수 있다.' : (u.name ?? u.email ?? undefined));
    this.emit();
    void this.afterAuth(u);
  }

  /** 로그인 직후: 이 기기가 차지(막힌 채 켰으면 건너뜀) → 서버 세이브와 맞추기 → 활성 기기 감시 */
  private async afterAuth(u: CloudUser): Promise<void> {
    if (!this.blockedBy) await this.claim();
    if (this.user?.uid !== u.uid) return;
    this.watchActiveStart();
    if (!this.blockedBy) await this.reconcileFromServer();
  }

  // ── 한 기기만 (GDD 199장 4) ──

  /**
   * 이 기기가 계정을 차지한다(devices/{uid} 에 내 기기 id). 로그인·앱 시작·복귀·[다시 이 기기에서 하기] 때. 쓰기 성공 = 막힘 해제.
   * 실패(오프라인·규칙 미게시)는 막지 않고 넘어간다 — 연결되면 다시 시도. 돌려주는 값 = 성공했는가
   */
  async claim(): Promise<boolean> {
    const u = this.user;
    if (!u || this.claiming) return false;
    let b: CloudBackend;
    try {
      b = await this.ensureBackend();
    } catch {
      return false;
    }
    if (this.user?.uid !== u.uid) return false;
    this.claiming = true;
    this.emit();
    try {
      await b.writeActive(u.uid, { device: this.device, at: this.now(), name: this.host.deviceName, build: this.host.build });
      if (this.user?.uid !== u.uid) return false;
      this.claimed = true;
      this.lastClaimAt = this.now();
      this.setBlocked(null);
      return true;
    } catch {
      return false;
    } finally {
      this.claiming = false;
      this.emit();
    }
  }

  /** [다시 이 기기에서 하기]: 차지한 뒤 밀린 것을 맞춘다(기기 세이브와 클라우드가 둘 다 바뀌었으면 고르기 창). 돌려주는 값 = 실패 문구(없으면 null) */
  async reclaim(): Promise<string | null> {
    if (!this.user) return '로그인이 풀렸다.';
    const ok = await this.claim();
    if (!ok) return this.host.online() ? '다시 차지하지 못했다. 잠시 뒤 다시 한다.' : '연결을 확인한다.';
    void this.reconcileFromServer();
    return null;
  }

  private watchActiveStart(): void {
    const b = this.backend;
    const u = this.user;
    if (!b || !u) return;
    this.unwatchActive?.();
    this.unwatchActive = b.watchActive(u.uid, (d) => {
      if (this.user?.uid !== u.uid || this.claiming) return;
      if (!d) {
        // 문서가 없다(처음·지워짐): 막혀 있었으면 풀리고, 아직 차지 못했으면 차지한다
        if (this.blockedBy) this.setBlocked(null);
        if (!this.claimed) void this.claim();
        return;
      }
      if (d.device === this.device) {
        this.claimed = true;
        if (this.blockedBy) this.setBlocked(null);
        return;
      }
      if (!this.blockedBy || this.blockedBy.device !== d.device || this.blockedBy.at !== d.at) this.setBlocked(d);
    });
  }

  /** 막힘 상태 바꾸기: 막히면 올리기를 멈추고(타이머 해제, dirty 는 남겨 되찾은 뒤 맞춘다) 화면에 알린다 */
  private setBlocked(by: ActiveDevice | null): void {
    const was = this.blockedBy;
    this.blockedBy = by;
    if (by) {
      if (this.flushTimer) clearTimeout(this.flushTimer);
      this.flushTimer = null;
      this.clearRetry();
      this.conflictOpen = false;
      this.emit();
      this.host.onBlocked(by);
      return;
    }
    this.emit();
    if (was) this.host.onUnblocked();
  }

  /** 앱이 다시 보일 때(복귀 = 켜짐으로 친다, GDD 199장 4): 막히지 않았고 최근에 차지한 지 오래면 다시 차지한다 */
  onVisible(): void {
    if (!this.user || !this.backend || this.blockedBy || !this.host.online()) return;
    if (this.now() - this.lastClaimAt < CLOUD_RECLAIM_MIN_MS) return;
    void this.claim();
  }

  /** 연결이 돌아왔을 때의 기기 판정: 막혀 있으면 문서를 읽어 내 것이면 풀고, 안 막혔는데 다른 기기면 막는다. 아직 차지 못했으면 차지 */
  private async judgeActiveOnline(): Promise<void> {
    const b = this.backend;
    const u = this.user;
    if (!b || !u) return;
    if (!this.claimed && !this.blockedBy) {
      await this.claim();
      return;
    }
    try {
      const d = await b.readActive(u.uid);
      if (this.user?.uid !== u.uid || this.claiming) return;
      if (!d || d.device === this.device) {
        if (this.blockedBy) this.setBlocked(null);
      } else if (!this.blockedBy || this.blockedBy.device !== d.device || this.blockedBy.at !== d.at) this.setBlocked(d);
    } catch {
      /* 다음 연결 때 */
    }
  }

  /** 서버 문서를 읽어 맞추고, 그 뒤 변경을 구독한다 */
  private async reconcileFromServer(): Promise<void> {
    const b = this.backend;
    const u = this.user;
    if (!b || !u || this.blockedBy) return;
    let doc: CloudDoc | null;
    try {
      doc = await b.read(u.uid);
    } catch {
      this.failed = this.host.online() ? 'error' : 'offline';
      this.emit();
      this.armRetry(() => void this.reconcileFromServer());
      return;
    }
    if (this.user?.uid !== u.uid || this.blockedBy) return;
    this.failed = null;
    this.seenRemote = doc?.savedAt ?? null;
    this.reconcile(doc);
    this.unwatchDoc?.();
    this.unwatchDoc = b.watchDoc(u.uid, (d) => {
      if (this.user?.uid !== u.uid || this.blockedBy || !d || d.device === this.device || d.savedAt === this.seenRemote) return;
      this.seenRemote = d.savedAt;
      this.reconcile(d);
    });
  }

  /** 기기·클라우드 맞추기 (decideReconcile) */
  private reconcile(doc: CloudDoc | null): void {
    const u = this.user;
    if (!u || this.conflictOpen || this.blockedBy) return;
    const st = this.host.storage;
    const cur = this.host.current();
    const slot = doc ? doc.slot : cur.slot !== 0 ? cur.slot : lastPlayedSlot(allSlotSummaries(st)) ?? 0;
    const local: LocalInfo = slot === 0 ? { slot: 0, exists: false, playedAt: null } : localInfoOf(st, slot);
    const synced = this.readSynced();
    const r = decideReconcile(doc, local, synced && synced.uid === u.uid ? synced : null, this.device, cur.slot !== 0 && cur.slot === slot);
    this.blocked = r.kind === 'blocked';
    if (r.kind === 'blocked') {
      this.notify('더 새 버전의 세이브다', '앱을 새 버전으로 올린 뒤 이어 한다.');
      this.emit();
      return;
    }
    if (r.kind === 'upload') {
      this.dirty = true;
      void this.flush(r.slot);
      return;
    }
    if (r.kind === 'download' && doc) {
      this.applyCloud(doc, r.slot, false);
      return;
    }
    if (r.kind === 'conflict' && doc) {
      const d = loadSlotForCloud(st, r.slot);
      if (!d) return;
      this.conflictOpen = true;
      this.emit();
      this.host.onConflict({
        slot: r.slot,
        device: { summary: summaryOf(d), playedAt: local.playedAt },
        cloud: { summary: doc.summary, savedAt: doc.savedAt },
        suggested: r.suggested,
        choose: (pick) => {
          this.conflictOpen = false;
          if (pick === 'cloud') this.applyCloud(doc, r.slot, true);
          else {
            stashCloudCopy(st, doc, r.slot, this.now());
            this.dirty = true;
            void this.flush(r.slot);
          }
        },
      });
      return;
    }
    this.emit();
  }

  private applyCloud(doc: CloudDoc, slot: number, chosen: boolean): void {
    const u = this.user;
    if (!u) return;
    const res = applyCloudToSlot(this.host.storage, doc, slot);
    if (res === 'ok') {
      this.writeSynced({ uid: u.uid, slot, savedAt: doc.savedAt, localAt: doc.savedAt, uploadedAt: null });
      this.notify(chosen ? '고른 세이브로 바꿨다' : '세이브를 가져왔다', `슬롯 ${slot} · 이 기기에 있던 세이브는 슬롯 백업에 남았다.`);
      this.emit();
      this.host.onApplied(slot);
      return;
    }
    if (res === 'newer') {
      this.blocked = true;
      this.notify('더 새 버전의 세이브다', '앱을 새 버전으로 올린 뒤 이어 한다.');
    } else if (res === 'corrupt') {
      this.notify('세이브를 읽을 수 없다', '이 기기 세이브를 그대로 쓴다.');
      if (localInfoOf(this.host.storage, slot).exists) {
        this.dirty = true;
        void this.flush(slot);
      }
    } else this.notify('세이브를 저장하지 못했다', '저장 공간을 확인한다.');
    this.emit();
  }

  /** 저장할 때마다 (app.ts persist): 로그인 중이면 묶어서 올린다 */
  schedule(): void {
    if (!this.user || this.blocked) return;
    if (this.blockedBy) {
      this.dirty = true; // 막힌 동안 저장한 것은 되찾은 뒤 맞춘다(올리지 않는다)
      return;
    }
    const now = this.now();
    if (!this.dirty) this.firstDirtyAt = now;
    this.dirty = true;
    this.tooBig = false;
    if (this.flushTimer) clearTimeout(this.flushTimer);
    const wait = Math.max(0, Math.min(CLOUD_DEBOUNCE_MS, this.firstDirtyAt + CLOUD_MAX_WAIT_MS - now));
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, wait);
    this.emit();
  }

  /** 지금 올린다 (앱이 숨겨질 때·연결될 때). slot 을 주면 그 슬롯(기기 저장소)에서, 아니면 지금 플레이 중인 세이브 */
  async flush(slot?: number): Promise<void> {
    if (!this.dirty || this.inflight || !this.user || this.blocked || this.blockedBy) return;
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    const u = this.user;
    const cur = this.host.current();
    const target = slot ?? cur.slot;
    if (target === 0) {
      this.dirty = false;
      this.emit();
      return;
    }
    const save = cur.slot === target && cur.save ? cur.save : loadSlotForCloud(this.host.storage, target);
    if (!save) {
      this.dirty = false;
      this.emit();
      return;
    }
    const synced = this.readSynced();
    const doc = makeCloudDoc(save, { slot: target, device: this.device, build: this.host.build, base: synced && synced.uid === u.uid ? synced.savedAt : null, nowMs: this.now() });
    if (utf8Bytes(doc.text) > CLOUD_TEXT_MAX_BYTES) {
      this.dirty = false;
      if (!this.tooBig) this.notify('세이브가 너무 커 올리지 못했다', '이 기기에는 저장됐다.');
      this.tooBig = true;
      this.emit();
      return;
    }
    let b: CloudBackend;
    try {
      b = await this.ensureBackend();
    } catch {
      this.failed = this.host.online() ? 'error' : 'offline';
      this.emit();
      this.armRetry(() => void this.flush());
      return;
    }
    this.inflight = true;
    this.dirty = false;
    this.emit();
    try {
      if (this.blockedBy) throw new Error('blocked'); // 올리기 직전에 막혔다 — dirty 로 남긴다
      await b.write(u.uid, doc);
      if (this.user?.uid === u.uid) {
        this.writeSynced({ uid: u.uid, slot: target, savedAt: doc.savedAt, localAt: doc.savedAt, uploadedAt: doc.savedAt });
        this.seenRemote = doc.savedAt;
        this.failed = null;
        this.retries = 0;
      }
    } catch {
      this.dirty = true; // 다음에 다시 올린다
      if (this.blockedBy) return;
      this.failed = this.host.online() ? 'error' : 'offline';
      this.armRetry(() => void this.flush());
    } finally {
      this.inflight = false;
      this.emit();
      if (this.dirty && !this.failed && !this.blockedBy) this.schedule(); // 올리는 동안 또 저장했다
    }
  }

  /** 연결이 돌아왔다: 기기 판정(GDD 199장 4) → 밀린 것을 올리고, 없으면 서버와 다시 맞춘다 */
  onOnline(): void {
    if (!this.user) return;
    this.clearRetry();
    this.retries = 0;
    this.failed = null;
    if (!this.backend) {
      this.loadOrRetry();
      this.emit();
      return;
    }
    void this.judgeActiveOnline().then(() => {
      if (!this.user || this.blockedBy) return;
      if (this.dirty) void this.flush();
      else void this.reconcileFromServer();
    });
    this.emit();
  }

  private armRetry(fn: () => void): void {
    this.clearRetry();
    const ms = CLOUD_RETRY_MS[Math.min(this.retries, CLOUD_RETRY_MS.length - 1)]!;
    this.retries++;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      fn();
    }, ms);
  }

  private clearRetry(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  private clearTimers(): void {
    this.clearRetry();
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = null;
  }

  private readSynced(): SyncRecord | null {
    const s = readJson<Partial<SyncRecord>>(this.host.storage, CLOUD_SYNC_KEY);
    if (!s || typeof s.uid !== 'string' || !num(s.slot) || !num(s.savedAt) || !num(s.localAt)) return null;
    return { uid: s.uid, slot: s.slot, savedAt: s.savedAt, localAt: s.localAt, uploadedAt: num(s.uploadedAt) ? s.uploadedAt : null };
  }

  private writeSynced(r: SyncRecord): void {
    writeJson(this.host.storage, CLOUD_SYNC_KEY, r);
  }

  /** 테스트용: 밀린 올리기가 있는가 */
  get pending(): boolean {
    return this.dirty;
  }

  /** 테스트용: 차지 쓰기가 끝났는가 */
  get hasClaimed(): boolean {
    return this.claimed;
  }
}
