// 클라우드 세이브 (GDD 196장, C.323): 로그인한 계정의 문서 하나(users/{uid}) = 마지막으로 플레이한 슬롯의 세이브.
// - 로그인은 선택. 안 하면 지금처럼 기기(localStorage)에만 저장된다. 한 번 로그인하면 그 기기에서 자동 유지(Firebase 영구 세션 + CLOUD_PREF_KEY 기억).
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
}

/** Firebase 를 감싼 얇은 층 (cloudFirebase.ts). 테스트는 가짜로 끼운다 */
export interface CloudBackend {
  /** 로그인 상태 구독 (구독 직후 지금 상태 한 번 포함). 해제 함수를 돌려준다 */
  watchAuth(cb: (user: CloudUser | null) => void): () => void;
  /** Google 로그인. redirect = 팝업 대신 페이지 이동(홈 화면 앱 등) — 이동하면 돌아오지 않는다 */
  signIn(redirect: boolean): Promise<void>;
  /** 이메일/비밀번호 (GDD 196장 결정 7): 로그인 · 가입 · 비밀번호 재설정 메일. 실패는 code 가 든 오류를 던진다(authErrorText) */
  signInEmail(email: string, password: string): Promise<void>;
  signUpEmail(email: string, password: string): Promise<void>;
  resetPassword(email: string): Promise<void>;
  signOut(): Promise<void>;
  read(uid: string): Promise<CloudDoc | null>;
  write(uid: string, doc: CloudDoc): Promise<void>;
  /** 문서 변경 구독(자기 쓰기의 되돌림 포함 — device 로 거른다). 해제 함수 */
  watchDoc(uid: string, cb: (doc: CloudDoc | null) => void): () => void;
}

/** 로그인 기억(uid·이름·이메일): 있으면 켤 때 SDK 를 바로 불러 자동 로그인을 확인한다. 없으면 SDK 를 받지 않는다(첫 로딩·오프라인 그대로) */
export const CLOUD_PREF_KEY = 'bha-cloud';
/** 이 기기 id (처음 한 번 만든다) */
export const CLOUD_DEVICE_KEY = 'bha-cloud-device';
/** 리다이렉트 로그인으로 페이지를 떠났다는 표시 — 돌아오면 SDK 를 불러 결과를 받는다 */
export const CLOUD_REDIRECT_KEY = 'bha-cloud-redirect';
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
  | 'too-big';

export interface CloudState {
  status: CloudStatus;
  user: CloudUser | null;
  /** 마지막으로 클라우드에 올린(또는 받은) 시각 */
  savedAt: number | null;
}

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
  /** 홈 화면 앱(standalone)인가 — 팝업이 막히는 환경이면 리다이렉트 로그인 */
  standalone(): boolean;
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
  return p && typeof p.uid === 'string' ? { uid: p.uid, name: typeof p.name === 'string' ? p.name : null, email: typeof p.email === 'string' ? p.email : null } : null;
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
  'auth/operation-not-allowed': '이메일 로그인이 꺼져 있다.',
  'auth/missing-password': '비밀번호를 적는다.',
};
export const AUTH_ERROR_DEFAULT = '로그인하지 못했다. 잠시 뒤 다시 한다.';

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
  private readonly listeners = new Set<() => void>();
  /** 마지막으로 본 클라우드 판(savedAt) — 같은 알림을 두 번 처리하지 않는다 */
  private seenRemote: number | null = null;

  constructor(private readonly host: CloudHost) {
    this.device = deviceIdOf(host.storage);
  }

  private now(): number {
    return this.host.now ? this.host.now() : Date.now();
  }

  /** 켤 때: 로그인 기억이 있거나 리다이렉트 로그인에서 돌아왔으면 SDK 를 불러 로그인을 확인한다. 아니면 아무것도 받지 않는다 */
  start(): void {
    let redirect = false;
    try {
      redirect = this.host.storage.getItem(CLOUD_REDIRECT_KEY) !== null;
    } catch {
      redirect = false;
    }
    const pref = readCloudPref(this.host.storage);
    if (pref) this.user = pref; // SDK 확인 전까지 기억한 계정으로 보여 준다
    if (pref || redirect) void this.loadOrRetry();
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
    return { status: this.status(), user: this.user, savedAt };
  }

  private status(): CloudStatus {
    if (this.signingIn) return 'loading';
    if (!this.user) return 'signed-out';
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

  /** [Google 로그인] (GDD 196장 2): 홈 화면 앱이면 리다이렉트, 아니면 팝업(막히면 백엔드가 리다이렉트로 넘긴다) */
  async signIn(): Promise<void> {
    if (this.signingIn) return;
    this.signingIn = true;
    this.emit();
    try {
      const b = await this.ensureBackend();
      writeJson(this.host.storage, CLOUD_REDIRECT_KEY, { at: this.now() });
      await b.signIn(this.host.standalone());
    } catch (e) {
      const code = (e as { code?: unknown } | null)?.code;
      if (typeof code === 'string' && AUTH_CANCEL_CODES.has(code)) this.notify('로그인을 그만뒀다');
      else this.notify('로그인하지 못했다', '연결을 확인하고 다시 시도한다.');
      writeJson(this.host.storage, CLOUD_REDIRECT_KEY, null);
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

  async signOut(): Promise<void> {
    try {
      await this.backend?.signOut();
    } catch {
      /* 로그아웃 실패해도 이 기기 기억은 지운다 */
    }
    this.onAuth(null);
  }

  private onAuth(u: CloudUser | null): void {
    this.authKnown = true;
    writeJson(this.host.storage, CLOUD_REDIRECT_KEY, null);
    const changed = (u?.uid ?? null) !== (this.user?.uid ?? null);
    this.user = u;
    writeJson(this.host.storage, CLOUD_PREF_KEY, u);
    this.unwatchDoc?.();
    this.unwatchDoc = null;
    this.blocked = false;
    this.tooBig = false;
    this.failed = null;
    this.seenRemote = null;
    if (!u) {
      this.dirty = false;
      this.clearTimers();
      this.emit();
      return;
    }
    if (changed) this.notify('로그인했다', u.name ?? u.email ?? undefined);
    this.emit();
    void this.reconcileFromServer();
  }

  /** 서버 문서를 읽어 맞추고, 그 뒤 변경을 구독한다 */
  private async reconcileFromServer(): Promise<void> {
    const b = this.backend;
    const u = this.user;
    if (!b || !u) return;
    let doc: CloudDoc | null;
    try {
      doc = await b.read(u.uid);
    } catch {
      this.failed = this.host.online() ? 'error' : 'offline';
      this.emit();
      this.armRetry(() => void this.reconcileFromServer());
      return;
    }
    if (this.user?.uid !== u.uid) return;
    this.failed = null;
    this.seenRemote = doc?.savedAt ?? null;
    this.reconcile(doc);
    this.unwatchDoc?.();
    this.unwatchDoc = b.watchDoc(u.uid, (d) => {
      if (this.user?.uid !== u.uid || !d || d.device === this.device || d.savedAt === this.seenRemote) return;
      this.seenRemote = d.savedAt;
      this.reconcile(d);
    });
  }

  /** 기기·클라우드 맞추기 (decideReconcile) */
  private reconcile(doc: CloudDoc | null): void {
    const u = this.user;
    if (!u || this.conflictOpen) return;
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
    if (!this.dirty || this.inflight || !this.user || this.blocked) return;
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
      await b.write(u.uid, doc);
      if (this.user?.uid === u.uid) {
        this.writeSynced({ uid: u.uid, slot: target, savedAt: doc.savedAt, localAt: doc.savedAt, uploadedAt: doc.savedAt });
        this.seenRemote = doc.savedAt;
        this.failed = null;
        this.retries = 0;
      }
    } catch {
      this.dirty = true; // 다음에 다시 올린다
      this.failed = this.host.online() ? 'error' : 'offline';
      this.armRetry(() => void this.flush());
    } finally {
      this.inflight = false;
      this.emit();
      if (this.dirty && !this.failed) this.schedule(); // 올리는 동안 또 저장했다
    }
  }

  /** 연결이 돌아왔다: 밀린 것을 올리고, 없으면 서버와 다시 맞춘다 */
  onOnline(): void {
    if (!this.user) return;
    this.clearRetry();
    this.retries = 0;
    this.failed = null;
    if (!this.backend) this.loadOrRetry();
    else if (this.dirty) void this.flush();
    else void this.reconcileFromServer();
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
}
