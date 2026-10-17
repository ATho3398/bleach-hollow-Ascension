// 밸런스 설정 (docs/game-design.md 부록 A)
// 모든 수치는 이 파일에 둔다. 이 파일만 고치면 게임에 반영된다.
// 세이브 필드 구조를 바꾸는 변경은 src/game.ts 의 SAVE_FORMAT_VERSION 을 올린다.

/** 수치를 바꾸면 올린다. 새 게임 시작 시 세이브에 기록된다. */
export const BALANCE_VERSION = 1;

export const BALANCE = {
  // 0단계 자리 표시. 1단계 명세가 나오면 채운다.
} as const;
