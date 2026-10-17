// 밸런스 설정 (CLAUDE.md, docs/GDD.md 2장)
// 모든 수치는 이 파일에 둔다. 이 파일만 고치면 게임에 반영된다.
// 세이브 필드 구조를 바꾸는 변경은 src/game.ts 의 SAVE_FORMAT_VERSION 을 올린다.

/** 수치를 바꾸면 올린다. 새 게임 시작 시 세이브에 기록된다. */
export const BALANCE_VERSION = 4;

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
    /** 매치3: 같은 색 3개 이상이 한 줄. 이 개수가 "매칭 1회 분량"의 타일 수 */
    minMatch: 3,
    tileColors: 5,
    /** 영력 타일 매칭 3회 → 기술 1회 발동 */
    spiritMatchesPerSkill: 3,
    /** 4매치 → 줄 폭발, 5매치 → 해당 색 전체 제거 */
    specialMatch: { lineBlast: 4, colorClear: 5 },
    /** 약점 색(데미지·영력·실드) 매칭 효과 배율 (GDD 3-4) */
    weaknessMultiplier: 1.5,
    /** 영력 게이지 상한 = 기술 2회분 (GDD 3-4) */
    spiritGaugeCapInSkills: 2,
    /** 적 체력은 "플레이어 매칭 N회 분량" (CLAUDE.md 규칙 3) */
    enemyHpInMatches: { normal: 6, elite: { min: 10, max: 12 } },
    /** 강적은 바퀴당 최대 1마리 */
    maxElitesPerLap: 1,
  },

  // ── 임시값(provisional): 기획서 미정 항목을 프로토타입용으로 채우는 구역 (GDD 12장) ──
  // 여기 값은 확정이 아니다. 확정되면 기획서에 반영하고 이 구역에서 옮긴다.
  provisional: {
    // 리스크 게이지 상승·하락량·한계값(11-4): P3 에서 채운다
    // ── 전투 코어(P1) 임시값. 기획서에 없는 수치. 모든 "양"은 매칭 1회(3타일) = 1 단위 기준 ──
    battle: {
      /** 플레이어 매칭 1회 데미지. 적 체력은 이 값 × hpInMatches 로 환산되므로 기준 단위일 뿐이다 */
      playerMatchDamage: 10,
      /** "매칭 N회 분량" 보정: 플레이어는 한 턴에 연쇄·특수 매치로 데미지 매칭 여러 번을 얻으므로, 적 체력 1회분 = 매칭 1회 데미지 × 이 값.
       *  탐욕 봇 시뮬(npm run balance)로 일반 5~7턴, 강적 8~10턴 근처가 되게 맞췄다 (C.3: 기술이 턴을 쓰고 적 공격이 2턴 주기가 된 뒤 3.2→2.1). 사람은 봇보다 느리다 */
      hpMatchScale: 2.1,
      /** 육성이 올리는 값: 매칭 1회당 데미지 배율 (GDD 3-2). 육성 없음 = 1 */
      playerDamageMultiplier: 1,
      /** 플레이어 체력: 실드 매칭 10회 분량 (적 평균 공격 1회 ≈ 0.5~0.9 실드 매칭 → 일반 적은 맞아도 버틴다) */
      playerMaxHp: 100,
      /** 실드 매칭 1회가 막는 피해. 적 공격력(attackInMatches)의 기준 단위 */
      shieldPerMatch: 10,
      /** 기본 기술 위력: 데미지 매칭 N회 분량. 영력 3회로 1회 쓰므로 데미지 매칭 3~4회 가치 */
      skillPowerInMatches: 4,
      /** 공허 타일 자연 생성률 (GDD 3-1 "보드에 자연 생성"). 5색 균등이면 20%이므로 그보다 낮게 */
      riskSpawnRate: 0.1,
      /** 공허 매칭 데미지 배율: "데미지 大" = 데미지 타일의 2배 */
      riskDamageMultiplier: 2,
      /** 공허 매칭 1회당 리스크 값 상승. 기록만 하고 게이지 효과는 P3 */
      riskPerMatch: 5,
      /** 무한 대치 방지: 이 턴수를 넘기면 패배 (GDD 2-2 평균 6~8턴의 약 3배) */
      maxTurns: 25,
      /** 적 공격 주기: 플레이어 N턴마다 1회 (GDD 3-4 임시) */
      enemyAttackEveryTurns: 2,
    },
  },
} as const;
