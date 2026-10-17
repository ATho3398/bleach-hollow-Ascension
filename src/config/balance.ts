// 밸런스 설정 (CLAUDE.md, docs/GDD.md 2장)
// 모든 수치는 이 파일에 둔다. 이 파일만 고치면 게임에 반영된다.
// 세이브 필드 구조를 바꾸는 변경은 src/game.ts 의 SAVE_FORMAT_VERSION 을 올린다.

/** 수치를 바꾸면 올린다. 새 게임 시작 시 세이브에 기록된다. */
export const BALANCE_VERSION = 6;

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
  /** 흡수 슬롯: 초기 3칸 (GDD 4장 확정. 진화마다 +1 은 진화 시스템 이후) */
  absorb: { slotCount: 3 },

  // ── 임시값(provisional): 기획서 미정 항목을 프로토타입용으로 채우는 구역 (GDD 12장) ──
  // 여기 값은 확정이 아니다. 확정되면 기획서에 반영하고 이 구역에서 옮긴다.
  provisional: {
    // ── 흡수·리스크(P3) 임시값. 기획서 4-1: 11-3(계통·특성 풀), 11-4(리스크 수치)가 미정 ──
    absorb: {
      /** 흡수 가능 임계값: 전투 중 흡수 타일 매칭 N회분 이상이면 승리 후 흡수할 수 있다 (실제 봇 시뮬로 정함, npm run balance) */
      threshold: 4,
      /** 특성 후보 수: 일반 적은 1~2개 중 무작위, 강적은 항상 2개 (GDD 4장 "후보 1~2개") */
      candidatesElite: 2,
      candidatesNormalMax: 2,
      /** 슬롯 안 같은 계통 N개 → 계통 보너스 */
      lineageBonusCount: 3,
      /** 계통 보너스: 그 계통 skill 특성 위력에 가산하는 비율 (GDD 4-1 +50%) */
      lineageSkillBonus: 0.5,
      /** 흡수하면 허기가 이 값으로 리셋 (GDD 4장 "허기 리셋") */
      hungerAfterAbsorb: 0,
      /** 흡수 시 보상 타일 (GDD 2-1 "흡수 시 1"). 바퀴 합계는 tilesPerLap.max 안, 바퀴 완주 보상 1장은 남겨 둔다 */
      bonusTiles: 1,
    },
    risk: {
      /** 한계값: 이상이 되면 돌파 (GDD 4-1) */
      limit: 100,
      /** 전투의 공허 매칭 리스크 값(riskGained)에 곱하는 환산 계수. 1 = 그대로 */
      voidMatchFactor: 0.25,
      /** 강한 적 흡수 시 리스크 상승 = 적 hpInMatches(바퀴 강화 포함) × 이 값. 강적(11회분)이 일반(6회분)의 약 2배 */
      absorbPerHpMatch: 0.55,
      /** 놓아주면 하락 */
      releaseRelief: 8,
      /** 휴식 타일에서 하락 */
      restRelief: 15,
      /** 5바퀴째부터 칸을 지날 때마다 상승: (바퀴 − 5 + 1) × 이 값 (GDD 5장 "5바퀴 이후") */
      lateLapPerTile: 0.5,
      /** 돌파 임시 페널티: 그 원정 남은 동안 공허 생성률 가산, 둥지 복귀 시 안정 수치 하락 */
      breakthroughSpawnBonus: 0.2,
      breakthroughStabilityLoss: 25,
      /** 돌파한 원정에서 귀환하면 게이지가 이 값으로 가라앉는다(바로 또 돌파하지 않게) */
      riskAfterBreakthrough: 60,
      /** 안정 수치(호로 자아 / 사신 영압 안정도): 시작값·상한, 놓아줄 때 상승 */
      stabilityStart: 50,
      stabilityMax: 100,
      releaseStability: 6,
      /** 둥지 행동의 리스크 하락·안정 수치 상승 (GDD 5장 "둥지 쓰다듬기" 등) */
      nestActions: {
        feed: { risk: -5, stability: 2 },
        sleep: { risk: -10, stability: 3 },
        pet: { risk: -10, stability: 8 },
      },
    },
    // ── 원정 루프(P2) 임시값. 기획서 2-1·6·7장에 수치가 없는 것 ──
    expedition: {
      /** 허기 100이면 탈진 → 패배 처리(마지막 바퀴 획득물 상실). 강제 귀환 유도 (GDD 2-1) */
      hungerMax: 100,
      hungerPerTile: 0.4,
      hungerPerBattle: 1,
      /** 이 바퀴부터 허기가 급상승 (GDD 2-1 "6바퀴째부터") */
      hungerSpikeLap: 6,
      hungerPerTileSpike: 4,
      conditionMax: 100,
      conditionPerBattle: 2,
      /** 바퀴가 돌 때마다 길이 강해진다: 적 hpInMatches·attackInMatches 에 곱하는 (바퀴-1)당 가산 배율 */
      lapHpScale: 0.12,
      lapAttackScale: 0.08,
      /** 5바퀴째부터 공허 생성률 가산 (GDD 2-1 "공허 타일 생성률 ↑"): (바퀴-4)당 */
      lateLapStart: 5,
      lateLapRiskBonusPerLap: 0.04,
      /** 컨디션 0 일 때 공허 생성률 가산(컨디션 비율만큼 선형 감소). 기존 생성률에 더한다 (GDD 3-2) */
      conditionRiskBonusMax: 0.15,
      /** 강적 소굴·조합으로 나온 강적을 이기면 추가 타일 1장 (바퀴 합계는 tilesPerLap.max 까지) */
      eliteBonusTiles: 1,
      /** 휴식 타일: 허기 감소, 컨디션 회복, 시간 소모(칸 수 환산) */
      restHunger: 25,
      restCondition: 20,
      restTimeTiles: 2,
      /** 원정에 가져가는 덱 크기와 새 세이브의 타일 보유량 (시작 덱 임시 구성) */
      deckSize: 8,
      startingCollection: {
        'prey-nest-a': 4, 'prey-nest-b': 3, 'elite-den-a': 2, 'elite-den-b': 2,
        'env-fog': 2, 'env-wasteland': 2, 'env-barrier': 2, 'env-ruin': 2, 'rest-a': 2,
      } as Record<string, number>,
    },
    /** 환경 타일 프리셋: 전투 조건 변경. 이름은 종족 스킨, 효과 종류는 엔진 (GDD 6장) */
    tiles: {
      reshuffle: { reshuffleEachTurn: true },
      power: { damageEffectMultiplier: 1.3 },
      shield: { shieldEffectMultiplier: 1.5 },
      void: { riskSpawnBonus: 0.1 },
    },
    /** 둥지 최소 버전(P2): 허기·컨디션 두 수치만 (GDD 7장) */
    nest: {
      startHunger: 20,
      startCondition: 80,
      /** 방치 시 시간당 허기 상승. 죽지 않으므로 상한이 있다 */
      idleHungerPerHour: 6,
      idleHungerCap: 90,
      feedHunger: 35,
      sleepCondition: 30,
      petCondition: 8,
      /** 패배(가면이 깨져 쇠약 / 영력 고갈) 후 컨디션과 허기 가산 */
      defeatCondition: 15,
      defeatHunger: 10,
    },
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
