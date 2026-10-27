// [단축키 표시] 설정 (GDD 18-5): 버튼 구석의 키 글자 배지를 켜고 끈다. 기기별 localStorage 저장(키 bha-key-hints), 세이브 무관, 기본 끔(C.170, GDD 100장 #88 — 배지가 버튼 모서리를 덮지 않게, 켜면 보인다).
import type { SettingsStorage } from './fxSettings';
import { activeSlotSettings } from './settingsScope';

export const KEY_HINTS_KEY = 'bha-key-hints';
export const KEY_HINTS_EVENT = 'bha-key-hints-change';

/** 실제 값: 지금 슬롯 설정이 있으면 그것 (GDD 103장 5) */
export function loadKeyHints(storage?: SettingsStorage | null): boolean {
  return activeSlotSettings().keyHints ?? loadCommonKeyHints(storage);
}

/** 공통 값 (기기 전체) */
export function loadCommonKeyHints(storage?: SettingsStorage | null): boolean {
  try {
    return storage?.getItem(KEY_HINTS_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveKeyHints(storage: SettingsStorage | null | undefined, on: boolean): boolean {
  try {
    storage?.setItem(KEY_HINTS_KEY, on ? '1' : '0');
  } catch {
    /* 저장소를 못 쓰면 이번 실행에서만 적용 */
  }
  return on;
}
