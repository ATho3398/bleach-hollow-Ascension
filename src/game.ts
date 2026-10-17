// 게임 상태와 세이브 (1단계에서 채운다)

import { BALANCE_VERSION } from './config/balance';
import { PATCH_LABEL } from './version';

/** 세이브 구조를 바꾸면 올리고 마이그레이션을 추가한다 */
export const SAVE_FORMAT_VERSION = 1;

export interface SaveMeta {
  format: number;
  balanceVersion: number;
  /** 세이브를 시작한 패치 (부록 C 소절) */
  startPatch: string;
}

export function newSaveMeta(): SaveMeta {
  return { format: SAVE_FORMAT_VERSION, balanceVersion: BALANCE_VERSION, startPatch: PATCH_LABEL };
}
