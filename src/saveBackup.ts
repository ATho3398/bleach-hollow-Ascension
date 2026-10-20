// 세이브 백업: 내보내기·불러오기의 순수 로직 (Q-1, C.29). 세이브 구조는 건드리지 않고 기존 SaveData 를 그대로 직렬화한다.
// 입력 설정(bha-input-settings)은 기기마다 다른 값이라 담지 않는다 (dev-log C.29).
import { FACTIONS } from './data/factions';
import { migrateSave, SAVE_FORMAT_VERSION, type SaveData, type StorageLike } from './game';
import { slotBackupKey, slotKey, writeBackupMeta, type BackupReason } from './saveSlots';
import { encodeSave, expandSave, parseSaveText } from './saveCodec';

/** 가져오기 직전 현재 세이브를 한 번 보관하는 키 (슬롯 1). 슬롯별 키는 saveSlots 의 slotBackupKey */
export const BACKUP_KEY = slotBackupKey(1);

export type ImportFailure = 'empty' | 'not-json' | 'not-save' | 'newer' | 'corrupt' | 'faction';

export const IMPORT_FAILURE_TEXT: Record<ImportFailure, string> = {
  empty: '붙여넣은 내용이 비어 있다.',
  'not-json': '세이브 파일이 아니다 (JSON 형식이 아님).',
  'not-save': '세이브 파일이 아니다 (필요한 항목이 없음).',
  newer: '더 새로운 버전의 세이브라 이 버전에서는 열 수 없다.',
  corrupt: '세이브가 손상되어 열 수 없다.',
  faction: '알 수 없는 종족의 세이브라 열 수 없다.',
};

export type ImportResult =
  | { ok: true; save: SaveData; fromFormat: number; migrated: boolean }
  | { ok: false; reason: ImportFailure };

/** 내보낼 문자열: 저장되는 것과 같은 JSON (SAVE_FORMAT_VERSION 은 meta.format 에 들어 있다). 긴 런 로그는 압축 덩어리($z)로 (C.72) */
export function serializeSave(save: SaveData): string {
  return encodeSave(save);
}

/** 내려받을 파일 이름. 예: bha-save-f11-20261018-2245.json */
export function backupFileName(save: Pick<SaveData, 'meta'>, now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `bha-save-f${save.meta.format}-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}.json`;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isArr = (v: unknown) => Array.isArray(v);

/** 마이그레이션이 채워 주는 영역까지 포함해, 화면이 바로 읽는 핵심 구조가 갖춰졌는지 */
function looksComplete(s: SaveData): boolean {
  return (
    isObj(s.nest) && isObj(s.build) && isArr(s.build.owned) && isArr(s.build.slots) &&
    isObj(s.evolution) && isObj(s.evolution.elementAbsorbs) && isObj(s.evolution.ev) && isArr(s.evolution.formHistory) && typeof s.evolution.tierIndex === 'number' &&
    isArr(s.formDex) && isObj(s.tiles) && isObj(s.tiles.collection) && isArr(s.tiles.deck) &&
    isObj(s.runLog) && isArr(s.runLog.battles) && isArr(s.runLog.runs) && isArr(s.runLog.absorbs) &&
    isArr(s.titles) && isObj(s.help)
  );
}

/** 가져오기는 고른 파일이라 엄격하게 (C.70): 있는데 모양이 틀린 핵심 영역은 손상으로 본다. 빠진 영역은 기기 세이브처럼 migrateSave 가 채운다 */
function wrongTyped(raw: Record<string, unknown>): boolean {
  const log = raw.runLog as Record<string, unknown>;
  return ['nest', 'build', 'tiles', 'evolution'].some((k) => k in raw && !isObj(raw[k]))
    || ['battles', 'runs', 'absorbs'].some((k) => k in log && !isArr(log[k]));
}

/** 문자열을 세이브로 읽는다: 형식 확인 → 이전 버전은 기존 마이그레이션 → 핵심 구조 확인. 새 버전·손상은 거부 */
export function parseImport(text: string): ImportResult {
  const t = text.replace(/^﻿/, '').trim();
  if (!t) return { ok: false, reason: 'empty' };
  let raw: unknown;
  try {
    raw = JSON.parse(t);
  } catch {
    return { ok: false, reason: 'not-json' };
  }
  // 압축·비압축 둘 다 받는다 (C.72). 압축 덩어리가 깨졌으면 손상
  try {
    raw = expandSave(raw);
  } catch {
    return { ok: false, reason: 'corrupt' };
  }
  if (!isObj(raw) || typeof raw.factionId !== 'string' || !isObj(raw.runLog) || !isObj(raw.meta) || typeof raw.meta.format !== 'number') {
    return { ok: false, reason: 'not-save' };
  }
  const fromFormat = raw.meta.format;
  if (fromFormat > SAVE_FORMAT_VERSION) return { ok: false, reason: 'newer' };
  if (!Number.isInteger(fromFormat) || fromFormat < 1) return { ok: false, reason: 'corrupt' };
  if (!FACTIONS.some((f) => f.id === raw.factionId)) return { ok: false, reason: 'faction' };
  if (wrongTyped(raw)) return { ok: false, reason: 'corrupt' };
  let save: SaveData | null;
  try {
    save = migrateSave(raw);
  } catch {
    return { ok: false, reason: 'corrupt' };
  }
  if (!save || !looksComplete(save)) return { ok: false, reason: 'corrupt' };
  return { ok: true, save, fromFormat, migrated: fromFormat < SAVE_FORMAT_VERSION };
}

export interface ApplyStorage extends StorageLike {
  removeItem?(key: string): void;
}

/** 가져오기 적용: 그 슬롯의 현재 세이브를 백업 키에 한 번 보관한 뒤 덮어쓴다. 쓰기가 막히면 false (현재 세이브는 그대로) */
export function applyImport(storage: ApplyStorage, save: SaveData, slot = 1): boolean {
  try {
    const current = storage.getItem(slotKey(slot));
    if (current !== null) {
      storage.setItem(slotBackupKey(slot), current);
      writeBackupMeta(storage, slot, 'import');
    }
    storage.setItem(slotKey(slot), serializeSave(save));
    return true;
  } catch {
    return false;
  }
}

export function hasBackup(storage: StorageLike | null, slot = 1): boolean {
  try {
    return !!storage?.getItem(slotBackupKey(slot));
  } catch {
    return false;
  }
}

/** 백업과 현재 세이브를 맞바꾼다 (다시 누르면 원래대로). 백업이 없거나 쓰기가 막히면 false */
export function swapWithBackup(storage: StorageLike, slot = 1): boolean {
  try {
    const backup = storage.getItem(slotBackupKey(slot));
    if (!backup) return false;
    const current = storage.getItem(slotKey(slot));
    storage.setItem(slotKey(slot), backup);
    if (current !== null) {
      storage.setItem(slotBackupKey(slot), current);
      writeBackupMeta(storage, slot, 'revert');
    }
    return true;
  } catch {
    return false;
  }
}

/** 세이브가 손상돼 열 수 없을 때 (C.70): 백업이 읽히면 백업과 맞바꾼다 — 손상본은 백업 자리에 남아 [되돌리기]로 다시 볼 수 있다.
 *  백업도 못 읽거나 쓰기가 막히면 false (아무것도 바꾸지 않는다) */
export function recoverFromBackup(storage: StorageLike, slot = 1): boolean {
  try {
    const backup = storage.getItem(slotBackupKey(slot));
    if (!backup || !migrateSave(parseSaveText(backup, false, storage))) return false;
  } catch {
    return false;
  }
  return swapWithBackup(storage, slot);
}

/** 백업 까닭 표시 (GDD 24-5) */
export const BACKUP_REASON_TEXT: Record<BackupReason, string> = {
  overwrite: '새로 시작해 덮어쓰기 직전',
  import: '불러오기로 덮어쓰기 직전',
  rank: '등급전 도전 직전',
  migration: '새 버전으로 세이브를 올리기 직전',
  rebirth: '환생 직전',
  fusion: '합체 직전',
  revert: '되돌리기 직전',
};

/** 세이브 원문이 지금 형식보다 옛 형식인가 (마이그레이션 직전 자동 백업 판단, GDD 24-5). 읽을 수 없으면 false */
export function needsMigration(text: string | null): boolean {
  if (!text) return false;
  try {
    const f = (JSON.parse(text) as { meta?: { format?: unknown } })?.meta?.format;
    return typeof f === 'number' && f < SAVE_FORMAT_VERSION;
  } catch {
    return false;
  }
}
