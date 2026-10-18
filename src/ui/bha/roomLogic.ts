// 메인 방 화면의 순수 계산 (tests/room-ui.test.ts)
import type { RoomConfig } from '../../engine/faction';

export type Mood = 'idle' | 'tired' | 'risk' | 'weak';

/** 캐릭터 기분: 기존 경고 기준(컨디션 40 미만, 리스크 한계의 60/한계 이상)과 쇠약 상태를 그대로 쓴다. 새 규칙 없음 */
export function moodOf(s: { weakened: boolean; condition: number; risk: number; riskLimit: number }, condWarn = 40, riskWarn = 60): Mood {
  if (s.weakened) return 'weak';
  if (s.risk >= riskWarn && s.riskLimit > 0) return 'risk';
  if (s.condition < condWarn) return 'tired';
  return 'idle';
}

/** 말풍선 문구 고르기. rand 는 0~1 미만(테스트에서 고정) */
export function pickLine(talk: RoomConfig['talk'], key: keyof RoomConfig['talk'], rand: () => number = Math.random): string {
  const list = talk[key];
  return list[Math.min(list.length - 1, Math.floor(rand() * list.length))] ?? '…';
}

export interface StatusChip {
  kind: 'hunger' | 'cond' | 'risk' | 'weak';
  /** 표시 이름(종족 설정에서 온 것은 호출한 쪽이 넘긴다) */
  label: string;
  icon: string;
  /** 칩에 보이는 값. 쇠약 칩은 값 없음 */
  value: number | null;
  danger: boolean;
}

/** 방 캐릭터 머리 위 상태 칩 (GDD 18-8): 허기·컨디션·리스크 게이지(+쇠약이면 그 이름). 위험 구간은 기존 경고 기준(허기 80↑, 컨디션 40↓, 리스크 60↑)과 같다 */
export function statusChips(
  s: { hunger: number; condition: number; risk: number; weakened: boolean },
  names: { riskGaugeName: string; defeatStateName: string },
  warn = { hunger: 80, condition: 40, risk: 60 },
): StatusChip[] {
  const chips: StatusChip[] = [
    { kind: 'hunger', label: '허기', icon: 'i-hunger', value: Math.round(s.hunger), danger: s.hunger >= warn.hunger },
    { kind: 'cond', label: '컨디션', icon: 'i-cond', value: Math.round(s.condition), danger: s.condition < warn.condition },
    { kind: 'risk', label: names.riskGaugeName, icon: 'i-risk', value: Math.round(s.risk), danger: s.risk >= warn.risk },
  ];
  if (s.weakened) chips.push({ kind: 'weak', label: names.defeatStateName, icon: 'i-broken', value: null, danger: true });
  return chips;
}
