// 밸런스 설정 (CLAUDE.md, docs/GDD.md 2장)
// 모든 수치는 이 파일에 둔다. 이 파일만 고치면 게임에 반영된다.
// 세이브 필드 구조를 바꾸는 변경은 src/game.ts 의 SAVE_FORMAT_VERSION 을 올린다.

/** 수치를 바꾸면 올린다. 새 게임 시작 시 세이브에 기록된다. */
export const BALANCE_VERSION = 28;

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
  /** 흡수 슬롯: 초기 3칸, 진화마다 +1 (GDD 4장 확정. 진화는 provisional.evolution) */
  absorb: { slotCount: 3 },
  /** 속성 상성 (GDD 20-2·v3.5 확정): 강 ×1.2 / 약 ×0.85, 자기 속성(내 속성과 같은 속성 블록) ×1.1. 노멀·특수 속성은 상성 없음(×1) */
  elements: { strong: 1.2, weak: 0.85, stab: 1.1 },
  /** 등급전 (GDD 21장 v4.3·v4.4 확정): 아란칼(5단계, tierIndex 4) 도달 후 해금. 번호 10개, 바로 위 1칸 도전, 진 상대 재도전은 다음 원정 1회 후 */
  rank: { unlockTierIndex: 4, rematchAfterRuns: 1 },

  // ── 임시값(provisional): 기획서 미정 항목을 프로토타입용으로 채우는 구역 (GDD 12장) ──
  // 여기 값은 확정이 아니다. 확정되면 기획서에 반영하고 이 구역에서 옮긴다.
  provisional: {
    // ── 흡수·리스크(P3) 임시값. 기획서 4-1: 11-3(계통·특성 풀), 11-4(리스크 수치)가 미정 ──
    absorb: {
      /** 흡수 가능 조건 (GDD 3-5 v0.7 → 20-2 C.47): 마무리 일격이 상성 우위(효과가 굉장한) 스킬 블록이거나, 그 전투에서 상성 우위 체인3 을 이 횟수 이상 발동.
       *  약점이 없는 적(노멀·특수 속성)은 아무 스킬 블록이나 우위로 친다. 장착 skill 특성이 없으면 조건 없이 가능(첫 흡수 보장) */
      weakChain3ForAbsorb: 3,
      /** 특성 후보 수: 일반 적은 1~2개 중 무작위, 강적은 항상 2개 (GDD 4장 "후보 1~2개") */
      candidatesElite: 2,
      candidatesNormalMax: 2,
      /** 공격 계열 섞임 (GDD 18-8 ③, C.41, 임시): 장착한 공격 특성이 이 수보다 적은 계열이면, 흡수 후보에 아직 없는 계열의 공격 특성을 1개 끼워 넣는다(그 계통에 있을 때). 첫 흡수(장착 skill 없음)는 서로 다른 계열 공격 후보 2개 */
      attackFamilyGuarantee: 2,
      /** 슬롯 안 같은 속성 N개 → 속성 보너스 (GDD 4-1 계통 보너스를 속성으로, C.47) */
      elementBonusCount: 3,
      /** 속성 보너스: 그 속성 skill 특성 블록의 위력(피해·막기 지속·회복량)에 가산하는 비율 (GDD 4-1 +50%) */
      elementSkillBonus: 0.5,
      /** 흡수 후보 섞기 (C.47): 후보가 2개면 하나는 적의 속성, 하나는 다른 속성에서 나온다 (원소 상성 순환에서 처음 원소를 얻는 길) */
      otherElementCandidate: true,
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
      /* C.7: 0.12→0.22 (첫 흡수 보장·새 조건으로 흡수 횟수가 줄어 6바퀴 돌파 가드 유지) */
      absorbPerHpAttack: 0.2, // C.47: 약점 없는 적(노멀·특수)은 아무 기술로 마무리해도 흡수돼 흡수가 잦아진 만큼(4바퀴 5.3→6.7회) 0.3→0.25→0.2 (조정 2회)
      /** 놓아주면 하락. C.52: 8 → 6 (GDD 23-2 목표 — 흡수·놓아주기 섞은 4바퀴 원정 끝 40~60, 조정 1회) */
      releaseRelief: 6,
      /** 휴식 타일에서 하락 */
      restRelief: 15,
      /** 5바퀴째부터 칸을 지날 때마다 상승: (바퀴 − 5 + 1) × 이 값 (GDD 5장 "5바퀴 이후") */
      lateLapPerTile: 0.5,
      /** 돌파 페널티: 그 원정 남은 동안 공허 생성률 가산, 둥지 복귀 시 안정 수치 하락 */
      breakthroughSpawnBonus: 0.2,
      breakthroughStabilityLoss: 25,
      /** 한계 돌파 = 폭주 (GDD 23-2): 그 원정 남은 동안 주는 피해·받는 피해 배율, 둥지로 돌아오면 컨디션 하락 */
      frenzyDamageDealt: 1.3,
      frenzyDamageTaken: 1.3,
      frenzyConditionLoss: 30,
      /** 돌파한 원정에서 귀환하면 게이지가 이 값으로 가라앉는다(바로 또 돌파하지 않게) */
      riskAfterBreakthrough: 60,
      /** 안정 수치(호로 자아 / 사신 영압 안정도): 시작값·상한, 놓아줄 때 상승 */
      stabilityStart: 50,
      stabilityMax: 100,
      releaseStability: 6,
      /** 둥지 행동의 리스크 하락·안정 수치 상승 (GDD 5장 "둥지 쓰다듬기" 등). C.52: 재우기·쓰다듬기 −10 → −20 (GDD 23-2 "한 번에 크게") */
      nestActions: {
        feed: { risk: -5, stability: 2 },
        sleep: { risk: -20, stability: 3 },
        pet: { risk: -20, stability: 8 },
      },
    },
    // ── 영혼 결정 (GDD 22-3, 수치 provisional): 슬롯 공유 재화. 붕옥 탭이 열리기 전에도 쌓인다 (환생 +10 은 환생 구현 때) ──
    soulCrystals: { perElite: 1, perRankWin: 3 },
    // ── 먹이 = 전리품 (GDD 23-1, 수치 provisional): 먹이 5종 개수제, 슬롯 공유 자원 ──
    food: {
      /** 종류별 보관 상한 */
      cap: 9,
      /** 새 게임 시작 지급 (기존 세이브 마이그레이션도 이 값) */
      start: { snack: 5, basic: 3 } as Record<string, number>,
      /** 일반 적을 이기면 이 확률로 1개 (종류 가중치) */
      normalDropChance: 0.5,
      normalTable: { snack: 50, basic: 35, hearty: 15 } as Record<string, number>,
      /** 강적을 이기면 확정 1개 + 이 확률로 1개 더 */
      eliteExtraChance: 0.3,
      eliteTable: { hearty: 40, tonic: 40, feast: 20 } as Record<string, number>,
      /** 휴식 타일을 지나면 간식 +이 값 */
      restSnack: 1,
      /** 막힘 방지: 원정에서 돌아왔을 때 먹이가 하나도 없으면 간식 이만큼 */
      fallbackSnack: 2,
    },
    // ── 속성 특수 효과 (GDD 20-2, 수치 provisional) ──
    elements: {
      /** 혈: 준 피해의 이 비율만큼 체력 회복 (내 블록·기본 공격, 적의 공격 모두) */
      drainFraction: 0.05,
      /** 독: 맞힌 피해의 이 비율을 poisonSeconds 동안 나눠 더 준다 (겹치면 남은 양에 더하고 시간은 새로) */
      poisonFraction: 0.2,
      poisonSeconds: 4,
      /** 허: 상대 방어·정신력을 이 비율만큼 무시. 내가 허 블록을 쓰면 블록 1개당 리스크 게이지 + pierceRisk */
      pierceIgnore: 0.15,
      pierceRisk: 0.6,
    },
    // ── 능력치·성장 (GDD 20-3·20-4, 수치 provisional) ──
    stats: {
      /** 단계별 종족값 합계 (index 0 = 1단계). 기준 능력치 = 합계 ÷ 6 — 적 능력치·체력 환산("기본 공격 N회분")의 기준 */
      tierTotals: [300, 330, 360, 390, 420],
      /** 노력치 단계 상한: 합계(index = 단계)와 능력치 하나의 상한(합계 상한 × 비율). 진화해도 유지되고 상한만 오른다 */
      evCapTotal: [8, 16, 24, 32, 40],
      evCapPerStatRatio: 0.5,
    },
    /** 진화체 고유 특성 6종 (GDD 20-3·v4.0): 진화 순간 노력치가 가장 높은 능력치 방향. 이름은 src/data/evolution/abilities.json */
    abilities: {
      hp: { maxHp: 1.12 },
      atk: { physicalPower: 1.12 },
      int: { blockSpawn: 1.2 },
      def: { physicalTaken: 0.85 },
      spr: { specialTaken: 0.85 },
      spd: { attackSpeed: 1.18 },
    },
    // ── 진화 (GDD 20-5 v3.7~v4.2): 트리·타이밍·히든. 수치 provisional ──
    evolution: {
      /** 진화 타이밍 = 그 단계에서 원정으로 이동한 칸 수 (숨김, v4.1): index 0 = 1→2 … index 3 = 4→5 */
      stepsNeeded: [50, 80, 110, 150],
      /** 임박 알림: 남은 걸음이 기준의 이 비율 이하가 되는 순간 한 번씩 */
      alertsAt: [0.2, 0.1],
      /** 진화마다 슬롯 +1 (GDD 4장) */
      slotsPerEvolution: 1,
      /** 히든 조건 (20-5): 비율은 그 단계 흡수의 속성 분포, 횟수는 그 단계 기록 */
      hidden: {
        /** 원소 융합: 두 속성 각각 이 비율 이상 */
        fusionShare: 0.4,
        /** 완전체: 원소 4종 각각 이 비율 이상 */
        completeShare: 0.15,
        /** 특수 히든: 특수 속성 하나 이 비율 이상 + 다른 속성 하나도 이 비율 이상 */
        specialShare: 0.4,
        /** 노멀 순수형: 장착 최다 속성이 노멀 + 노멀 흡수 이 비율 이상 + 컨디션 pureCondition 이상·허기 pureHungerMax 이하 */
        pureShare: 0.4,
        pureCondition: 50,
        pureHungerMax: 60,
        /** 노멀 실패형(강제): 장착 특성 없음, 또는 허기 failHunger 이상 / 컨디션 failCondition 이하 */
        failHunger: 85,
        failCondition: 25,
        /** 아란칼 행동 히든: 그 단계 한계 돌파 횟수 / 강적 처치 수. 절제 = 놓아준 수 > 흡수 수 */
        breakthroughs: 3,
        elites: 16, // C.47 봇 점검: 4→5 단계(약 4원정)에 강적을 보통 10~12 처치해 10 이면 60% 가 히든이 됨 → 16
        /** 그 단계에 흡수가 이만큼은 있어야 속성 분포 히든을 본다 (흡수 1~2회로 40% 가 되는 것을 막는다) */
        minAbsorbs: 5,
      },
      /** 후보 가중 랜덤 (v4.2): 일반 1, 히든 = 1 + (max − 1) × min(1, 초과량 ÷ fullExcess). 초과량 = 조건 값 ÷ 기준 − 1 */
      weight: { normal: 1, max: 9, fullExcess: 0.5 },
      /** 진화체 데이터 자동 생성 (src/data/evolution/generate.ts): 종족값 분배 = 기준 능력치 × (1 + 성향). 성향 합은 0(합계 유지) */
      template: {
        base: { 2: { hp: 0.1, atk: 0.05, def: 0, spr: -0.05, int: 0, spd: -0.1 }, 3: { hp: 0, atk: 0, def: -0.05, spr: 0, int: 0.05, spd: 0 } } as Record<number, Record<string, number>>,
        element: {
          normal: {},
          water: { spr: 0.15, hp: 0.1, atk: -0.1, spd: -0.15 },
          fire: { atk: 0.15, spd: 0.1, def: -0.1, spr: -0.15 },
          earth: { def: 0.2, hp: 0.1, spd: -0.2, int: -0.1 },
          thunder: { spd: 0.2, int: 0.1, hp: -0.15, def: -0.15 },
          blood: { hp: 0.15, atk: 0.1, spr: -0.1, int: -0.15 },
          poison: { int: 0.15, spr: 0.1, atk: -0.1, hp: -0.15 },
          kyo: { int: 0.15, atk: 0.1, def: -0.1, spr: -0.15 },
        } as Record<string, Record<string, number>>,
        category: { physical: { atk: 0.2, int: -0.2 }, special: { int: 0.2, atk: -0.2 }, mixed: {} } as Record<string, Record<string, number>>,
        hidden: {
          complete: {},
          pure: {},
          fail: {},
          limit: { atk: 0.2, int: 0.2, def: -0.2, spr: -0.2 },
          restraint: { def: 0.2, spr: 0.2, hp: 0.1, atk: -0.25, int: -0.25 },
          hunter: { hp: 0.15, atk: 0.1, spd: 0.1, def: -0.1, spr: -0.1, int: -0.15 },
        } as Record<string, Record<string, number>>,
        /** 융합은 두 속성 성향을 더한 것 × 이 값, 특수 히든은 그 속성 성향 × 이 값 */
        fusionScale: 0.75,
        specialScale: 1.5,
        /** 종족값 합계 배율: 완전체 높게, 실패형 낮게 (나머지는 단계 합계 그대로) */
        totalScale: { complete: 1.08, fail: 0.8 } as Record<string, number>,
        /** 노멀 순수형 자기 속성 보정 */
        pureStab: 1.3,
      },
      /** 점검 도구(analysis.ts, npm run balance)의 무작위 분포 샘플 */
      analysis: { samples: 4000, seed: 20261020 },
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
      /** 먹이 5종 (GDD 18-2, 임시 provisional): 허기 감소·컨디션 변화. basic 은 예전 단일 먹이(feedHunger)와 같다. 가진 개수·비용 없음(먹이 자원은 미정) */
      foods: {
        snack: { hunger: 15, condition: 4 },
        basic: { hunger: 35, condition: 0 },
        hearty: { hunger: 55, condition: 0 },
        tonic: { hunger: 20, condition: 10 },
        feast: { hunger: 80, condition: -5 },
      },
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
       *  블록·필살이 시간을 줄이므로, 봇(빈 슬롯 = 기본 블록만) 기준 일반 약 45초·강적 약 90초가 되게 맞춘다 (npm run balance, C.6 조정 1.5→2.8, C.8 일자 8칸 바에서 봇이 더 잘 붙여 일반 36초로 짧아져 2.8→3.4) */
      hpAttackScale: 3.4,
      /** 적 데이터 hpInAttacks 기준값 (GDD 3-5 임시: 일반 약 30회, 강적 약 70회 분량). 밸런스 점검이 데이터가 이 근처인지 본다 */
      enemyHpInAttacks: { normal: 30, elite: 70 },
      /** 패턴 종류별 hpInAttacks 기준값 (C.15, GDD 14-5 임시): 속공은 약간 적게, 단단은 많게. 밸런스 점검이 데이터가 ±15% 안인지 본다 */
      enemyHpByKind: { basic: 30, swift: 28, sturdy: 40, 'heavy-seal': 80, 'heavy-chain': 80, stance: 70 },
      /** 육성이 올리는 값: 공격 배율 (GDD 3-2). 적 체력도 같이 올라 비율 유지. 육성 없음 = 1 */
      growthMultiplier: 1,
      /** 플레이어 체력 (= 기본 공격 15회 분량). 한 조우마다 새로 시작. 강적(약 90초)을 기본 블록만으로도 버틸 여지가 있게 100→150 (C.6 봇 점검) */
      playerMaxHp: 150,
      /** 조우당 시간 제한(초). 넘기면 패배 (GDD 3-5) */
      timeLimitSeconds: 150,
      /** 적 공격 피해 흔들림 ±비율 (같은 시드면 같다). 봇 승률이 0/100% 로만 갈리지 않게 */
      enemyDamageVariance: 0.25,
      /** 블록 바 일자 8칸 (GDD 3-5 v0.8, 크퀘식). 6칸 트레이(C.6) → 8칸: 한 줄에 같은 블록을 붙여 놓을 여유를 준다 */
      trayCapacity: 8,
      /** 슬롯 skill 특성(없으면 기본 블록) 하나당 블록 생성 간격(초). 바가 가득 차거나 봉인 중이면 멈춘다 */
      blockSpawnSeconds: 4,
      /** 같은 계열 공격 특성이 슬롯에 둘 이상이면 서로 체인이 쉬워지므로(GDD 17-3), 그 계열 블록의 생성 간격을 (같은 계열 특성 수 − 1)당 이 비율만큼 늘린다 (C.34). 계열이 하나뿐이면 영향 없음 */
      familySpawnSlowdown: 1,
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
      /** 저장형 필살기 (C.17, GDD 14-6, 모두 임시): 블록 1개 사용당 게이지 +12, 체인 2·3 이면 사용 한 번에 보너스 +4 / +10.
       *  게이지 100 = 충전 1개 (최대 3개, 가득 차면 넘친 게이지는 낭비로 기록). 전투 간 이월 없음 */
      storedGaugePerBlock: 12,
      storedChainBonus: [0, 4, 10],
      storedGaugeMax: 100,
      storedChargesMax: 3,
      /** 사용 피해: 기본 공격 N회 분량 (약점·체인·방어 자세 무시), 사용 직후 막기 상태 지속(초) */
      storedPowerInAttacks: 25,
      storedGuardSeconds: 2,
      /** 시작 게이지 = 안정 수치(0~stabilityMax) 비례로 0~이 값 (둥지 애착 반영) */
      storedStartGaugeMax: 50,
    },
  },
} as const;
