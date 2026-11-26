// [블록 생성 위치 반전] 설정 (GDD 7절 '블록 바 표시' v6.205, C.540): 기기 공통 localStorage(키 bha-tray-flip), 세이브 무관, 기본 끔.
// 끔 = 칸 1(가장 먼저 생긴 블록)이 맨 오른쪽, 새 블록은 왼쪽에 붙는다(C.216 rtl). 켬 = 좌우만 뒤집어 칸 1 이 맨 왼쪽, 새 블록은 오른쪽.
// 엔진 순서·숫자키 N = 칸 N·시작 커서 = 칸 1 은 그대로 — 표시(칸 배치)와 화면 좌표 → 칸 번호 변환만 바뀐다. 순수 로직 + 저장만 둔다(화면은 battleView).
import type { SettingsStorage } from './fxSettings';

export const TRAY_FLIP_KEY = 'bha-tray-flip';
export const TRAY_FLIP_EVENT = 'bha-tray-flip-change';
/** 켰을 때 블록 바 격자에 붙는 클래스 (bha.css: direction ltr) */
export const TRAY_FLIP_CLASS = 'is-fill-left';

export function loadTrayFlip(storage?: SettingsStorage | null): boolean {
  try {
    return storage?.getItem(TRAY_FLIP_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveTrayFlip(storage: SettingsStorage | null | undefined, on: boolean): boolean {
  try {
    storage?.setItem(TRAY_FLIP_KEY, on ? '1' : '0');
  } catch {
    /* 저장소를 못 쓰면 이번 실행에서만 적용 */
  }
  return on;
}

/** 화면에서 왼쪽부터 센 자리(0 = 맨 왼쪽) → 칸 번호(0 = 칸 1). 끔 = 칸 1 이 맨 오른쪽, 켬 = 맨 왼쪽 */
export function trayIndexAtScreen(screenSlot: number, capacity: number, flip: boolean): number {
  return flip ? screenSlot : capacity - 1 - screenSlot;
}

/** 칸들을 화면 왼쪽 → 오른쪽 순서로 (기기 ▲▼ 커서가 DOM 순서를 따르므로 DOM 도 이 순서로 둔다) */
export function cellsInScreenOrder<T>(cells: readonly T[], flip: boolean): T[] {
  return flip ? [...cells] : [...cells].reverse();
}
