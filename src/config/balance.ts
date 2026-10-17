// 밸런스 설정 (CLAUDE.md, docs/GDD.md 2장)
// 모든 수치는 이 파일에 둔다. 이 파일만 고치면 게임에 반영된다.
// 세이브 필드 구조를 바꾸는 변경은 src/game.ts 의 SAVE_FORMAT_VERSION 을 올린다.

/** 수치를 바꾸면 올린다. 새 게임 시작 시 세이브에 기록된다. */
export const BALANCE_VERSION = 2;

export const BALANCE = {
  // ── 확정 수치: 기획서 2장 템포 ──
  expedition: {
    /** 루프 길이 (둥지 칸 1 포함) */
    loopTiles: 12,
    /** 전투 없는 칸 이동 시간(초) */
    secondsPerTile: 5,
    defaultLaps: 4,
    maxLaps: 6,
    /** 바퀴별 전투 횟수: 1바퀴 2회, 2바퀴 3회, 3바퀴 이후 4회 (플레이어 타일 배치에 따라 변동) */
    battlesPerLap: { first: 2, second: 3, later: 4 },
    /** 바퀴당 타일 획득 2~3장 */
    tilesPerLap: { min: 2, max: 3 },
  },
  battle: {
    boardSize: 6,
    tileColors: 5,
    /** 영력 타일 매칭 3회 → 기술 1회 발동 */
    spiritMatchesPerSkill: 3,
    /** 4매치 → 줄 폭발, 5매치 → 해당 색 전체 제거 */
    specialMatch: { lineBlast: 4, colorClear: 5 },
    /** 약점 색 매칭 배율 */
    weaknessMultiplier: 1.5,
    /** 적 체력은 "플레이어 매칭 N회 분량" (CLAUDE.md 규칙 3) */
    enemyHpInMatches: { normal: 6, elite: { min: 10, max: 12 } },
    /** 강적은 바퀴당 최대 1마리 */
    maxElitesPerLap: 1,
  },

  // ── 임시값(provisional): 기획서 미정 항목을 프로토타입용으로 채우는 구역 (GDD 12장) ──
  // 여기 값은 확정이 아니다. 확정되면 기획서에 반영하고 이 구역에서 옮긴다.
  provisional: {
    // 리스크 게이지 상승·하락량·한계값(11-4): 프로토타입 시작 때 채운다
  },
} as const;
