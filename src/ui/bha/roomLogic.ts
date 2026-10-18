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
