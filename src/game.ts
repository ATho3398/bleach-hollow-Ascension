// 게임 상태와 세이브. 런 로그(GDD 9장)는 처음부터 저장 구조에 들어 있다 (CLAUDE.md 규칙 4)

import { BALANCE_VERSION } from './config/balance';
import { emptyRunLog, type BattleRecord, type RunLog } from './engine/runLog';
import { PATCH_LABEL } from './version';

/** 세이브 구조를 바꾸면 올리고 마이그레이션을 추가한다 */
export const SAVE_FORMAT_VERSION = 2;

export interface SaveMeta {
  format: number;
  balanceVersion: number;
  /** 세이브를 시작한 패치 (docs/dev-log.md 소절) */
  startPatch: string;
}

export function newSaveMeta(): SaveMeta {
  return { format: SAVE_FORMAT_VERSION, balanceVersion: BALANCE_VERSION, startPatch: PATCH_LABEL };
}

export interface SaveData {
  meta: SaveMeta;
  /** 선택한 종족 id (src/data/factions). 게임 시작 때 고른다 (GDD 12장) */
  factionId: string;
  /** 히든 조건용 영구 기록 */
  runLog: RunLog;
}

export function newSaveData(factionId: string): SaveData {
  return { meta: newSaveMeta(), factionId, runLog: emptyRunLog() };
}

/** 세이브에 전투 기록을 더한다 */
export function recordBattle(save: SaveData, record: BattleRecord): void {
  save.runLog.battles.push(record);
}

// ── 저장·불러오기 (localStorage) ──
export const SAVE_KEY = 'bleach-hollow-ascension.save';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** 이전 형식 세이브를 현재 형식으로 올린다. 알 수 없는 데이터는 null */
export function migrateSave(raw: unknown): SaveData | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as { meta?: { format?: number }; factionId?: unknown; runLog?: RunLog };
  if (typeof r.factionId !== 'string' || !r.runLog || typeof r.meta?.format !== 'number') return null;
  const save = r as SaveData;
  if (save.meta.format > SAVE_FORMAT_VERSION) return null;
  if (save.meta.format < 2) {
    // 형식 1 → 2: BattleRecord 에 enemyId, factionId, seed, riskGained, absorbGained, lossReason 추가
    save.runLog.battles = save.runLog.battles.map((b) => ({
      ...b,
      enemyId: b.enemyId ?? 'unknown',
      factionId: b.factionId ?? save.factionId,
      seed: b.seed ?? 0,
      riskGained: b.riskGained ?? 0,
      absorbGained: b.absorbGained ?? 0,
      lossReason: b.lossReason ?? null,
    }));
    save.meta.format = 2;
  }
  return save;
}

export function loadSave(storage: StorageLike): SaveData | null {
  try {
    const text = storage.getItem(SAVE_KEY);
    return text ? migrateSave(JSON.parse(text)) : null;
  } catch {
    return null;
  }
}

export function writeSave(storage: StorageLike, save: SaveData): void {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // 저장 공간이 막힌 환경(시크릿 모드 등)에서는 이번 판만 기록이 남지 않는다
  }
}
