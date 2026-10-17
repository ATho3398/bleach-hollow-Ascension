// 게임 상태와 세이브. 런 로그(GDD 9장)는 처음부터 저장 구조에 들어 있다 (CLAUDE.md 규칙 4)

import { BALANCE_VERSION } from './config/balance';
import { emptyRunLog, type RunLog } from './engine/runLog';
import { PATCH_LABEL } from './version';

/** 세이브 구조를 바꾸면 올리고 마이그레이션을 추가한다 */
export const SAVE_FORMAT_VERSION = 1;

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
