// 세이브 슬롯 (Q-3, C.31): 슬롯 3개, 슬롯별 localStorage 키. 슬롯 1 = 기존 키 그대로라 옛 세이브는 마이그레이션 없이 슬롯 1이 된다.
// 슬롯 밖 정보(마지막 플레이 시각)는 별도 키 하나에 둔다 → SaveData 구조와 SAVE_FORMAT_VERSION 은 그대로.
// 입력 설정(bha-input-settings)·전투 효과 설정(bha-fx-settings)은 기기별이라 슬롯과 무관하다.
import { migrateSave, saveFormatGate, SAVE_FORMAT_VERSION, SAVE_KEY, saveFormatStatus, writeSave, type SaveData, type StorageLike } from './game';
import { collectChunks, parseSaveText } from './saveCodec';

export const SLOT_COUNT = 3;
/** 슬롯별 마지막 플레이 시각 */
export const SLOTS_META_KEY = `${SAVE_KEY}.slots`;

/** 슬롯 번호(1~SLOT_COUNT)의 세이브 키. 슬롯 1 은 예전 단일 세이브 키 */
export const slotKey = (slot: number): string => (slot === 1 ? SAVE_KEY : `${SAVE_KEY}.slot${slot}`);
/** 슬롯의 백업(덮어쓰기 직전 한 번 보관) 키. 슬롯 1 은 C.29 의 백업 키와 같다 */
export const slotBackupKey = (slot: number): string => `${slotKey(slot)}.backup`;

export const slotNumbers = (): number[] => Array.from({ length: SLOT_COUNT }, (_, i) => i + 1);

export type SlotSummary =
  | { slot: number; state: 'empty' }
  /** recoverable: 본 세이브는 손상됐지만 슬롯 백업이 읽힌다 → 열면 백업으로 복구한다 (C.70) */
  | { slot: number; state: 'broken'; recoverable: boolean }
  /** 세이브 형식이 이 버전에서 열리지 않는다 (GDD 61장): old = 이전 버전 세이브, newer = 더 새로운 버전 세이브. 원문은 그대로 두고 내보내기·새로 시작만 된다 */
  | { slot: number; state: 'incompatible'; reason: 'old' | 'newer'; format: number }
  | {
      slot: number;
      state: 'ok';
      factionId: string;
      tierIndex: number;
      expeditions: number;
      /** 마지막 플레이 시각(ms). 슬롯 기록이 없던 옛 세이브는 null */
      playedAt: number | null;
      /** 원정 중간 저장이 있는가 */
      inExpedition: boolean;
    };

interface SlotsMeta {
  played: Record<string, number>;
}

function readMeta(storage: StorageLike): SlotsMeta {
  try {
    const raw: unknown = JSON.parse(storage.getItem(SLOTS_META_KEY) ?? 'null');
    const played = (raw as SlotsMeta | null)?.played;
    if (played && typeof played === 'object') {
      const clean: Record<string, number> = {};
      for (const [k, v] of Object.entries(played)) if (typeof v === 'number' && Number.isFinite(v)) clean[k] = v;
      return { played: clean };
    }
  } catch {
    // 손상된 메타는 없는 것으로 본다
  }
  return { played: {} };
}

/** 슬롯을 플레이했다고 기록한다 (저장할 때마다). 저장소가 막혀 있으면 조용히 넘어간다 */
export function touchSlot(storage: StorageLike, slot: number, nowMs: number = Date.now()): void {
  try {
    const meta = readMeta(storage);
    meta.played[String(slot)] = nowMs;
    storage.setItem(SLOTS_META_KEY, JSON.stringify(meta));
  } catch {
    // 시각 기록만 못 남긴다
  }
}

/** 세이브 원문의 형식 번호 (JSON 맨 위 meta.format 만 본다 — 압축 덩어리는 풀지 않는다). 읽을 수 없으면 null */
export function rawSaveFormat(text: string | null): number | null {
  if (!text) return null;
  try {
    const f = (JSON.parse(text) as { meta?: { format?: unknown } })?.meta?.format;
    return typeof f === 'number' ? f : null;
  } catch {
    return null;
  }
}

/** 슬롯 하나의 요약. 비어 있음 / 손상 / 열 수 없는 형식 / 정상. 로드 부작용(칭호 평가)은 일으키지 않는다. min·current 는 테스트용(기본 = 지금 문턱·형식) */
export function slotSummary(storage: StorageLike, slot: number, min: number = saveFormatGate.min, current: number = SAVE_FORMAT_VERSION): SlotSummary {
  let text: string | null;
  try {
    text = storage.getItem(slotKey(slot));
  } catch {
    return { slot, state: 'empty' };
  }
  if (!text) return { slot, state: 'empty' };
  const format = rawSaveFormat(text);
  const status = saveFormatStatus(format, min, current);
  if ((status === 'old' || status === 'newer') && format !== null) return { slot, state: 'incompatible', reason: status, format };
  let save: SaveData | null = null;
  try {
    save = migrateSave(parseSaveText(text, true), min); // 요약만: 압축 덩어리는 풀지 않고 개수만 (C.72)
  } catch {
    save = null;
  }
  if (!save || !save.evolution || !save.runLog || !Array.isArray(save.runLog.runs)) return { slot, state: 'broken', recoverable: backupReadable(storage, slot) };
  return {
    slot,
    state: 'ok',
    factionId: save.factionId,
    tierIndex: save.evolution.tierIndex,
    expeditions: save.runLog.runs.length,
    playedAt: readMeta(storage).played[String(slot)] ?? null,
    inExpedition: save.activeExpedition != null,
  };
}

function backupReadable(storage: StorageLike, slot: number): boolean {
  try {
    const text = storage.getItem(slotBackupKey(slot));
    return !!text && migrateSave(parseSaveText(text, true)) !== null;
  } catch {
    return false;
  }
}

export const allSlotSummaries = (storage: StorageLike): SlotSummary[] => slotNumbers().map((n) => slotSummary(storage, n));

/** 이어하기가 열 슬롯: 정상 세이브 중 마지막 플레이가 가장 최근인 것(시각이 같거나 없으면 번호가 작은 쪽). 없으면 null */
export function lastPlayedSlot(summaries: readonly SlotSummary[]): number | null {
  let best: { slot: number; at: number } | null = null;
  for (const s of summaries) {
    if (s.state !== 'ok') continue;
    const at = s.playedAt ?? 0;
    if (!best || at > best.at) best = { slot: s.slot, at };
  }
  return best ? best.slot : null;
}

/** 슬롯 지우기 (GDD 93장): 지우기 전 내용을 슬롯 백업에 한 번 보관하고(stashSlot) 세이브 키와 마지막 플레이 시각을 지운다. 세이브 구조는 건드리지 않는다. 지웠으면 true, 저장소가 막혔으면 false */
export function deleteSlot(storage: StorageLike, slot: number): boolean {
  if (!storage.removeItem) return false;
  if (!stashSlot(storage, slot, 'delete')) return false;
  try {
    storage.removeItem(slotKey(slot));
    const meta = readMeta(storage);
    delete meta.played[String(slot)];
    storage.setItem(SLOTS_META_KEY, JSON.stringify(meta));
    return true;
  } catch {
    return false;
  }
}

/** 백업을 남긴 까닭 (GDD 24-5): 되돌리기 화면에 "○○ 직전" 으로 보인다 */
export type BackupReason = 'overwrite' | 'import' | 'rank' | 'migration' | 'rebirth' | 'fusion' | 'revert' | 'delete';
export const BACKUP_REASONS: readonly BackupReason[] = ['overwrite', 'import', 'rank', 'migration', 'rebirth', 'fusion', 'revert', 'delete'];
/** 슬롯 백업의 까닭·시각 기록 키 (세이브 밖 — SaveData 구조와 무관) */
export const slotBackupMetaKey = (slot: number): string => `${slotBackupKey(slot)}.meta`;

export interface BackupMeta {
  reason: BackupReason;
  at: number;
}

/** 백업 까닭·시각 기록을 읽는다 (없거나 깨졌으면 null) */
export function readBackupMeta(storage: StorageLike | null, slot: number): BackupMeta | null {
  try {
    const raw = JSON.parse(storage?.getItem(slotBackupMetaKey(slot)) ?? 'null') as Partial<BackupMeta> | null;
    if (raw && BACKUP_REASONS.includes(raw.reason as BackupReason) && typeof raw.at === 'number') return { reason: raw.reason as BackupReason, at: raw.at };
  } catch {
    // 깨진 기록은 없는 것으로
  }
  return null;
}

export function writeBackupMeta(storage: StorageLike, slot: number, reason: BackupReason, nowMs: number = Date.now()): void {
  try {
    storage.setItem(slotBackupMetaKey(slot), JSON.stringify({ reason, at: nowMs }));
  } catch {
    // 까닭 기록만 못 남긴다
  }
}

/** 슬롯을 덮어쓰기 전(또는 되돌릴 수 없는 일 직전, GDD 24-5)에 지금 내용을 그 슬롯의 백업 키에 보관한다(최근 1개). 비어 있으면 아무것도 하지 않는다. 저장소가 막히면 false */
export function stashSlot(storage: StorageLike, slot: number, reason: BackupReason = 'overwrite', nowMs: number = Date.now()): boolean {
  try {
    const cur = storage.getItem(slotKey(slot));
    if (cur !== null) {
      storage.setItem(slotBackupKey(slot), cur);
      writeBackupMeta(storage, slot, reason, nowMs);
    }
    return true;
  } catch {
    return false;
  }
}

export type SlotWrite = 'ok' | 'freed' | 'failed';

/** 슬롯 저장 (C.70). 저장 공간이 가득 차 쓰기가 막히면 백업부터 지우고 다시 쓴다 — 이 슬롯 백업 → 다른 슬롯 백업 순.
 *  런 로그는 줄이지 않는다(CLAUDE.md 규칙 4). 지워서 썼으면 'freed', 그래도 막히면 'failed'(지금 세이브 원문은 그대로 남는다) */
export function writeSlotSave(storage: StorageLike, save: SaveData, slot: number): SlotWrite {
  if (writeSave(storage, save, slotKey(slot))) return 'ok';
  if (!storage.removeItem) return 'failed';
  // 먼저 아무 세이브도 가리키지 않는 압축 덩어리를 치운다 (C.72) — 백업은 그대로
  if (collectSlotChunks(storage) > 0 && writeSave(storage, save, slotKey(slot))) return 'ok';
  for (const n of [slot, ...slotNumbers().filter((x) => x !== slot)]) {
    try {
      if (storage.getItem(slotBackupKey(n)) === null) continue;
      storage.removeItem(slotBackupKey(n));
      storage.removeItem(slotBackupMetaKey(n));
    } catch {
      continue;
    }
    collectSlotChunks(storage); // 백업만 쓰던 덩어리도 같이 비운다
    if (writeSave(storage, save, slotKey(slot))) return 'freed';
  }
  return 'failed';
}

/** 슬롯·백업 어느 것도 가리키지 않는 압축 덩어리 키를 지운다 (C.72). 저장소가 막혔거나 키를 셀 수 없으면 0 */
export function collectSlotChunks(storage: StorageLike): number {
  try {
    const texts = slotNumbers().flatMap((n) => [storage.getItem(slotKey(n)), storage.getItem(slotBackupKey(n))]);
    return collectChunks(storage, texts);
  } catch {
    return 0;
  }
}

/** "10/18 23:10" 꼴 (기기 시간대) */
export function formatPlayedAt(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
