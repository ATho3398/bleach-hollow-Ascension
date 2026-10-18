// [단축키 표시] 설정 (GDD 18-5): 버튼 구석의 키 글자 배지를 켜고 끈다. 기기별 localStorage 저장(키 bha-key-hints), 세이브 무관, 기본 켬.
import type { SettingsStorage } from './fxSettings';

export const KEY_HINTS_KEY = 'bha-key-hints';
export const KEY_HINTS_EVENT = 'bha-key-hints-change';

export function loadKeyHints(storage?: SettingsStorage | null): boolean {
  try {
    return storage?.getItem(KEY_HINTS_KEY) !== '0';
  } catch {
    return true;
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
