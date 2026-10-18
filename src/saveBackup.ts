// 세이브 백업: 내보내기·불러오기의 순수 로직 (Q-1, C.29). 세이브 구조는 건드리지 않고 기존 SaveData 를 그대로 직렬화한다.
// 입력 설정(bha-input-settings)은 기기마다 다른 값이라 담지 않는다 (dev-log C.29).
import { FACTIONS } from './data/factions';
import { migrateSave, SAVE_FORMAT_VERSION, type SaveData, type StorageLike } from './game';
import { slotBackupKey, slotKey } from './saveSlots';

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

/** 내보낼 문자열: 저장되는 것과 같은 JSON (SAVE_FORMAT_VERSION 은 meta.format 에 들어 있다) */
export function serializeSave(save: SaveData): string {
  return JSON.stringify(save);
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
    isObj(s.evolution) && isObj(s.evolution.lineageScores) && isArr(s.evolution.formHistory) && typeof s.evolution.tierIndex === 'number' &&
    isArr(s.formDex) && isObj(s.tiles) && isObj(s.tiles.collection) && isArr(s.tiles.deck) &&
    isObj(s.runLog) && isArr(s.runLog.battles) && isArr(s.runLog.runs) && isArr(s.runLog.absorbs) &&
    isArr(s.titles) && isObj(s.help)
  );
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
  if (!isObj(raw) || typeof raw.factionId !== 'string' || !isObj(raw.runLog) || !isObj(raw.meta) || typeof raw.meta.format !== 'number') {
    return { ok: false, reason: 'not-save' };
  }
  const fromFormat = raw.meta.format;
  if (fromFormat > SAVE_FORMAT_VERSION) return { ok: false, reason: 'newer' };
  if (!Number.isInteger(fromFormat) || fromFormat < 1) return { ok: false, reason: 'corrupt' };
  let save: SaveData | null;
  try {
    save = migrateSave(raw);
  } catch {
    return { ok: false, reason: 'corrupt' };
  }
  if (!save || !looksComplete(save)) return { ok: false, reason: 'corrupt' };
  if (!FACTIONS.some((f) => f.id === save.factionId)) return { ok: false, reason: 'faction' };
  return { ok: true, save, fromFormat, migrated: fromFormat < SAVE_FORMAT_VERSION };
}

export interface ApplyStorage extends StorageLike {
  removeItem?(key: string): void;
}

/** 가져오기 적용: 그 슬롯의 현재 세이브를 백업 키에 한 번 보관한 뒤 덮어쓴다. 쓰기가 막히면 false (현재 세이브는 그대로) */
export function applyImport(storage: ApplyStorage, save: SaveData, slot = 1): boolean {
  try {
    const current = storage.getItem(slotKey(slot));
    if (current !== null) storage.setItem(slotBackupKey(slot), current);
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
    if (current !== null) storage.setItem(slotBackupKey(slot), current);
    return true;
  } catch {
    return false;
  }
}
