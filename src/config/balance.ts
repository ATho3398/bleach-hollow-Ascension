// 밸런스 설정 (CLAUDE.md, docs/GDD.md 2장)
// 모든 수치는 이 파일에 둔다. 이 파일만 고치면 게임에 반영된다.
// 세이브 필드 구조를 바꾸는 변경은 src/game.ts 의 SAVE_FORMAT_VERSION 을 올린다.

/** 수치를 바꾸면 올린다. 새 게임 시작 시 세이브에 기록된다. */
export const BALANCE_VERSION = 7;

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
    /** 강적은 바퀴당 최대 1마리 (GDD 2-1) */
    maxElitesPerLap: 1,
  },
  /** 흡수 슬롯: 초기 3칸 (GDD 4장 확정. 진화마다 +1 은 진화 시스템 이후) */
  absorb: { slotCount: 3 },

  // ── 임시값(provisional): 기획서 미정 항목을 프로토타입용으로 채우는 구역 (GDD 12장) ──
  // 여기 값은 확정이 아니다. 확정되면 기획서에 반영하고 이 구역에서 옮긴다.
  provisional: {
    // ── 흡수·리스크(P3) 임시값. 기획서 4-1: 11-3(계통·특성 풀), 11-4(리스크 수치)가 미정 ──
    absorb: {
      /** 흡수 가능 조건 (GDD 3-5): 마무리 일격이 약점 계통 스킬이거나, 그 전투에서 체인3 을 이 횟수 이상 발동 (C.6, 옛 흡수 게이지 임계값 폐기) */
      chain3ForAbsorb: 2,
      /** 특성 후보 수: 일반 적은 1~2개 중 무작위, 강적은 항상 2개 (GDD 4장 "후보 1~2개") */
      candidatesElite: 2,
      candidatesNormalMax: 2,
      /** 슬롯 안 같은 계통 N개 → 계통 보너스 */
      lineageBonusCount: 3,
      /** 계통 보너스: 그 계통 skill 특성 블록의 위력(피해·막기 지속·회복량)에 가산하는 비율 (GDD 4-1 +50%, C.6 새 전투) */
      lineageSkillBonus: 0.5,
      /** 흡수하면 허기가 이 값으로 리셋 (GDD 4장 "허기 리셋") */
      hungerAfterAbsorb: 0,
      /** 흡수 시 보상 타일 (GDD 2-1 "흡수 시 1"). 바퀴 합계는 tilesPerLap.max 안, 바퀴 완주 보상 1장은 남겨 둔다 */
      bonusTiles: 1,
    },
    risk: {
      /** 한계값: 이상이 되면 돌파 (GDD 4-1) */
      limit: 100,
      /** 공허 블록 1개 사용 → 리스크 게이지 상승량 (GDD 3-5). 옛 "공허 매칭 1회 5 × 0.25 = 1.25" 보다 크게: 블록은 매칭보다 드물고 피해가 크다 */
      perVoidBlock: 2.5,
      /** 강한 적 흡수 시 리스크 상승 = 적 hpInAttacks(바퀴 강화 포함) × 이 값. 옛 0.55/매칭 회분 × (6회분 → 30회분 환산) ≈ 0.11. 강적(70)이 일반(30)의 약 2.3배 */
      absorbPerHpAttack: 0.12,
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
      /** 안개(호로 스킨): 트레이 블록이 이 간격(초)마다 섞인다 */
      reshuffle: { trayShuffleSeconds: 6 },
      /** 황무지: 내 공격 위력(기본 공격·블록·필살·공허) ×1.3 */
      power: { playerPowerMultiplier: 1.3 },
      /** 결계(사신 스킨): 받는 피해 ×0.8 (GDD 6장 "실드↑" 를 새 전투에서 받는 피해 경감으로) */
      shield: { damageTakenMultiplier: 0.8 },
      /** 폐가: 공허 블록 생성 확률 +0.1 */
      void: { voidChanceBonus: 0.1 },
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
    // ── 전투 v2(P4, C.6) 임시값: 실시간 자동 전투 + 스킬 블록 체인 (GDD 3-5). 시간은 초, 엔진은 틱으로 환산한다 ──
    // 모든 "양"은 플레이어 기본 공격 1회 피해(playerAttackDamage) = 1 단위 기준 (CLAUDE.md 규칙 3)
    combat: {
      /** 고정 틱 길이(초). 같은 시드 + 같은 입력 = 같은 결과 (GDD 3-5 임시 0.1초) */
      tickSeconds: 0.1,
      /** 자동 기본 공격 간격(초): 내 캐릭터 1.0, 적 1.5 (GDD 3-5) */
      playerAttackSeconds: 1.0,
      enemyAttackSeconds: 1.5,
      /** 플레이어 기본 공격 1회 피해. 적 체력·공격력은 이 값의 N회 분량이라 기준 단위일 뿐이다 */
      playerAttackDamage: 10,
      /** "기본 공격 N회 분량" 보정: 적 체력 = hpInAttacks × 이 값 × 기본 공격 피해.
       *  블록·필살이 시간을 줄이므로, 봇(빈 슬롯 = 기본 블록만) 기준 일반 약 45초·강적 약 90초가 되게 맞춘다 (npm run balance) */
      hpAttackScale: 2.8,
      /** 적 데이터 hpInAttacks 기준값 (GDD 3-5 임시: 일반 약 30회, 강적 약 70회 분량). 밸런스 점검이 데이터가 이 근처인지 본다 */
      enemyHpInAttacks: { normal: 30, elite: 70 },
      /** 육성이 올리는 값: 공격 배율 (GDD 3-2). 적 체력도 같이 올라 비율 유지. 육성 없음 = 1 */
      growthMultiplier: 1,
      /** 플레이어 체력 (= 기본 공격 15회 분량). 한 조우마다 새로 시작. 강적(약 90초)을 기본 블록만으로도 버틸 여지가 있게 100→150 (C.6 봇 점검) */
      playerMaxHp: 150,
      /** 조우당 시간 제한(초). 넘기면 패배 (GDD 3-5) */
      timeLimitSeconds: 150,
      /** 적 공격 피해 흔들림 ±비율 (같은 시드면 같다). 봇 승률이 0/100% 로만 갈리지 않게 */
      enemyDamageVariance: 0.25,
      /** 블록 트레이 3열×2행 (GDD 3-5) */
      trayCols: 3,
      trayRows: 2,
      /** 슬롯 skill 특성(없으면 기본 블록) 하나당 블록 생성 간격(초). 트레이가 가득 차거나 봉인 중이면 멈춘다 */
      blockSpawnSeconds: 4,
      /** 체인 배율: 체인1 ×1.0, 체인2 ×2.2, 체인3 ×3.6 (GDD 3-5) */
      chainMultipliers: [1, 2.2, 3.6],
      /** 특성별 추가 효과가 붙는 최소 체인 (GDD 3-5 "체인3 … + 추가 효과") */
      chainBonusFromChain: 3,
      /** 블록 하나 사용 → SP +20, SP 100 → 필살 블록 (GDD 3-5) */
      spPerBlock: 20,
      spMax: 100,
      /** 필살 블록 피해: 기본 공격 N회 분량 ("큰 피해") */
      specialPowerInAttacks: 15,
      /** 슬롯에 skill 특성이 없을 때의 기본 블록 ("기본 공격 강화"): 공격, 기본 공격 N회 분량 */
      basicBlockPowerInAttacks: 3,
      basicBlockChainBonus: { kind: 'stagger', value: 1.5 },
      /** 약점 계통 스킬 블록 위력 배율 (GDD 3-5 ×1.5) */
      weaknessMultiplier: 1.5,
      /** guard 블록: 막기 상태 지속(초, 위력 배율만큼 늘어남), 그동안 기본 공격 피해 경감, 강공격 경감(= 막기 성공) */
      guardSeconds: 3,
      guardReduction: 0.5,
      heavyGuardReduction: 0.8,
      /** heal 블록: 최대 체력 × 이 비율 × 위력 배율 회복 */
      healFraction: 0.12,
      /** 공허 블록: 이 간격(초)마다 확률로 트레이에 생성 (컨디션·환경·5바퀴 이후·한계 돌파가 확률을 더한다), 사용 피해 = 기본 공격 N회 분량 */
      voidCheckSeconds: 5,
      voidChance: 0.15,
      voidChanceMax: 0.8,
      voidPowerInAttacks: 8,
    },
  },
} as const;
