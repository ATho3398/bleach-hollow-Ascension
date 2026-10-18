// 블록 바 포인터 판정 (GDD 3-5 v0.8). 화면의 실시간(performance.now) 기준 판정만 하고, 엔진에는 use/move 결과만 넘긴다.
// DOM 에 의존하지 않는 순수 함수라 단위 테스트한다 (tests/pointer.test.ts).
import { BALANCE } from '../config/balance';
import type { CombatInput } from '../engine/combat';

export type ReleaseKind = 'use' | 'drag' | 'hold';

export interface PointerRules {
  /** 누른 뒤 이 시간(초) 이내에 떼면 사용 */
  clickMaxSeconds: number;
  /** 이 거리(px) 이상 움직이면 드래그 */
  dragThresholdPx: number;
}

export const DEFAULT_POINTER_RULES: PointerRules = {
  clickMaxSeconds: BALANCE.provisional.input.clickMaxSeconds,
  dragThresholdPx: BALANCE.provisional.input.dragThresholdPx,
};
/** 기본 판정값 (설정 전). 화면은 loadPointerRules 로 읽은 값을 쓴다 */
export const POINTER_RULES: PointerRules = DEFAULT_POINTER_RULES;

export const POINTER_RANGES = {
  clickMaxSeconds: BALANCE.provisional.input.clickMaxSecondsRange,
  dragThresholdPx: BALANCE.provisional.input.dragThresholdPxRange,
};

/** 세이브 구조와 별개인 localStorage 키 (설정은 기기마다) */
export const POINTER_SETTINGS_KEY = 'bha-input-settings';

export interface SettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

const clamp = (v: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, v));

/** 범위 밖 값은 자르고, 숫자가 아니면 기본값. 클릭 시간은 0.05초 단위, 임계치는 정수로 맞춘다 */
export function clampPointerRules(r: Partial<Record<keyof PointerRules, unknown>>): PointerRules {
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  return {
    clickMaxSeconds: Math.round(clamp(num(r.clickMaxSeconds, DEFAULT_POINTER_RULES.clickMaxSeconds), POINTER_RANGES.clickMaxSeconds) * 100) / 100,
    dragThresholdPx: Math.round(clamp(num(r.dragThresholdPx, DEFAULT_POINTER_RULES.dragThresholdPx), POINTER_RANGES.dragThresholdPx)),
  };
}

/** 저장된 설정을 읽는다. 없거나 깨졌거나 저장소가 막혀 있으면 기본값 */
export function loadPointerRules(storage?: SettingsStorage | null): PointerRules {
  try {
    const text = storage?.getItem(POINTER_SETTINGS_KEY);
    return clampPointerRules(text ? (JSON.parse(text) as Record<string, unknown>) : {});
  } catch {
    return { ...DEFAULT_POINTER_RULES };
  }
}

/** 설정을 저장하고, 실제로 저장된(잘린) 값을 돌려준다 */
export function savePointerRules(storage: SettingsStorage | null | undefined, rules: Partial<PointerRules>): PointerRules {
  const clean = clampPointerRules(rules);
  try {
    storage?.setItem(POINTER_SETTINGS_KEY, JSON.stringify(clean));
  } catch {
    /* 저장소를 못 쓰면 이번 실행에서만 적용 */
  }
  return clean;
}

/** 기본값 복원: 저장된 설정을 지운다 */
export function resetPointerRules(storage?: SettingsStorage | null): PointerRules {
  try {
    storage?.removeItem ? storage.removeItem(POINTER_SETTINGS_KEY) : storage?.setItem(POINTER_SETTINGS_KEY, JSON.stringify(DEFAULT_POINTER_RULES));
  } catch {
    /* 무시 */
  }
  return { ...DEFAULT_POINTER_RULES };
}

/**
 * 손가락을 뗄 때의 판정.
 * - 누르는 동안 한 번이라도 임계치 이상 움직였으면 시간과 무관하게 드래그
 * - 아니면 제한 시간 이내에 뗐을 때만 사용(클릭), 넘기면 "들었다 놓은 것"(hold, 아무 일도 없음)
 */
export function classifyRelease(heldMs: number, maxMovedPx: number, rules: PointerRules = POINTER_RULES): ReleaseKind {
  if (maxMovedPx >= rules.dragThresholdPx) return 'drag';
  return heldMs <= rules.clickMaxSeconds * 1000 ? 'use' : 'hold';
}

/** 화면 x 좌표가 바의 몇 번째 칸 위인가 (0 ~ capacity-1 로 자른다). 칸 폭 = 바 폭 / capacity */
export function slotAt(x: number, barLeft: number, barWidth: number, capacity: number): number {
  const i = Math.floor(((x - barLeft) / barWidth) * capacity);
  return Math.min(capacity - 1, Math.max(0, i));
}

/**
 * 뗀 결과를 엔진 입력으로. from = 누른 블록의 현재 번호, dropSlot = 놓은 칸.
 * 드래그로 놓은 칸이 블록 수를 넘으면 맨 오른쪽 블록 위치로 본다 (빈 칸은 끼워넣기 대상이 아님)
 */
export function releaseInput(kind: ReleaseKind, from: number, dropSlot: number, blockCount: number): CombatInput | null {
  if (kind === 'use') return { type: 'use', cell: from };
  if (kind === 'hold') return null;
  const to = Math.min(blockCount - 1, dropSlot);
  return to >= 0 && to !== from ? { type: 'move', from, to } : null;
}
