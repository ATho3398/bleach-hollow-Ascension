// 밸런스 설정 (CLAUDE.md, docs/GDD.md 2장)
// 모든 수치는 이 파일에 둔다. 이 파일만 고치면 게임에 반영된다.
// 세이브 필드 구조를 바꾸는 변경은 src/game.ts 의 SAVE_FORMAT_VERSION 을 올린다.

/** 수치를 바꾸면 올린다. 새 게임 시작 시 세이브에 기록된다. */
export const BALANCE_VERSION = 45;

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
      /** 놓아주면 하락. C.52: 8 → 6 (GDD 23-2 목표 — 흡수·놓아주기 섞은 4바퀴 원정 끝 40~60, 조정 1회). C.69(B-1): 4바퀴 섞음 300판 끝 39.4 로 목표 바로 아래 → 6 → 5 (41.3, 조정 1회) */
      releaseRelief: 5,
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
    // ── 영혼 결정 (GDD 22-3, 수치 provisional): 슬롯 공유 재화. 붕옥 탭이 열리기 전에도 쌓인다 ──
    soulCrystals: { perElite: 1, perRankWin: 3, perRebirth: 10 },
    // ── 투트랙·붕옥·합체 (GDD 22-3·22-9, 수치 provisional) ──
    twoTrack: {
      /** 슬롯 하나의 캐릭터 트랙 수 */
      maxTracks: 2,
      /** 이 단계(tierIndex, 4 = 5단계 아란칼/수석 대원)에 닿으면 다른 종족 트랙이 열리고, 모든 트랙이 한 번씩 닿으면 붕옥 탭이 열린다 */
      openTierIndex: 4,
    },
    hogyoku: {
      /** 붕옥 1단계: 이만큼 영혼 결정을 먹이면 해방 */
      liberateCost: 100,
      /** 해방 패시브: 모든 트랙의 전 능력치 배율 + (영구) */
      liberatedBonus: 0.05,
      /** 붕옥 2단계: 해방 뒤 이만큼 먹이고 + 모든 트랙 등급 1위면 합체 가능. 합체하면 0 으로 */
      fusionCost: 300,
      /** 초월체 보유 1종마다 전 능력치 배율 + */
      perTranscendentBonus: 0.02,
      /** 첫 초월체 획득 영옥 (25-1 일회성 달성 보상) */
      firstTranscendentJade: 10,
    },
    // ── 환생 (GDD 22-1·22-7, 수치 provisional) ──
    rebirth: {
      /** 들어갈 수 있는 단계 (tierIndex, 4 = 5단계 아란칼/수석 대원) */
      minTierIndex: 4,
      /** 환생 직전 노력치(계승분 포함)의 이 비율을 누적 계승에 더한다. 누적 상한 없음 */
      evCarryRate: 0.1,
      /** 첫 환생에만 주는 영옥 (25-1 일회성 달성 보상) */
      firstJade: 10,
      /** 이름 옆 ★ 표시: 이 횟수 미만은 ★ 를 횟수만큼, 이상이면 ★ + 숫자 */
      starsUpTo: 5,
    },
    // ── 해방 (GDD 22-2·22-5 v5.13, 수치 provisional): 전투 중 변신. 이름은 종족 설정 liberation ──
    liberation: {
      /** 자격: 지금 단계가 이 값 이상(tierIndex, 4 = 5단계 아란칼/수석 대원) + 수련 완료 + 등급 이력 */
      minTierIndex: 4,
      /** 게이지: 내 공격(평타·블록·필살 등)이 준 피해 합이 적 최대 체력의 이 비율이면 가득(100). C.54 봇 조정 2회: 기획 40% → 30% (승률 목표 +10~15%p) */
      gaugeEnemyHpFraction: 0.3,
      gaugeMax: 100,
      /** 지속(초)과 그동안 전 능력치 배율 (체력은 최대 체력이 같이 오르고 끝나면 원래 최대 체력까지로). C.54 봇 조정 2회: 기획 ×1.3 → ×1.5.
       *  C.69(B-1): 해방 없는 승률이 84.6% → 68.2% 로 내려와(치명타·적 변화) 해방 효과가 +21.5%p(목표 +10~15%p) → ×1.4 +18.9 → ×1.3 +15.6 → 블록 2.5배 +15.4(효과 없어 3 유지). 조정 3회, ×1.3 채택(목표 +0.6%p 초과, 가드 +5~25 안) */
      /*  C.76(GDD 32-3): 사냥터 강도가 ×1 로 일원화돼 5단계 몸 ★5 강적 승률이 해방 없이 92% 라 +10%p 를 올릴 자리가 없다 → 측정 기준을 "권장 ★ · 연속 5(적 +25%)" 로 바꾸고(해방이 필요한 싸움) ×1.3 +7.6 → ×1.5 **+10.7%p**(조정 1회, ×1.7 은 +12.5 이나 연속 0 에서 99.9% 라 과함) */
      seconds: 15,
      statMultiplier: 1.5,
      /** 쓰는 순간 블록 바에 넣는 해방 블록 수와 위력 배율 (일반 블록 = basicBlockPowerInAttacks 의 이 배수) */
      blocks: 2,
      blockPowerMultiplier: 3,
      /** 해방이 끝날 때(전투가 먼저 끝나도) 리스크 게이지 상승 */
      riskOnEnd: 15,
    },
    // ── 수련 (GDD 22-4·22-5 v5.13, 수치 provisional): 둥지 제단 → 4종목 미니게임 ──
    training: {
      /** 수련 완료에 필요한 수련치 */
      pointsToComplete: 60,
      /** 패배해도 얻는 수련치 */
      lossPoints: 1,
      /** 수련권: 원정에서 돌아올 때마다(승패 무관) +1, 최대 */
      ticketsMax: 3,
      ticketsPerReturn: 1,
      /** 이 컨디션 미만이면 수련 불가, 리스크가 이 값 이상이면 경고 */
      minCondition: 30,
      riskWarn: 80,
      /** 종목별 누적 승리가 이 값 이상이면 그 단계 (index 0 = 1단계) */
      levelWins: [0, 3, 6, 10],
      /** 종목별 승리 보상·비용 (22-4 표). 비용은 이기든 지든. ev = 노력치(상한까지만) */
      games: {
        duel: { points: 5, ev: { spr: 2 }, condition: -10, hunger: 0, risk: 5 },
        dodge: { points: 3, ev: { spd: 3 }, condition: -15, hunger: 0, risk: 0 },
        clash: { points: 4, ev: { atk: 3 }, condition: -5, hunger: 15, risk: 0 },
        chain: { points: 3, ev: { hp: 3 }, condition: 0, hunger: 0, risk: 10, winHunger: -20 },
      } as Record<string, { points: number; ev: Record<string, number>; condition: number; hunger: number; risk: number; winHunger?: number }>,
      /** 본능 대결: 상대 게이지 hits 번 깎으면 승, misses 번 놓치면 패. 예고 간격(초), 받아치는 창(초, 단계별), 3단계부터 페이크 확률, 4단계 연속 공격 확률 */
      duel: { hits: 8, misses: 4, gapSeconds: [0.8, 2.0], windowSeconds: [1.0, 0.85, 0.72, 0.6], telegraphSeconds: [0.9, 0.75, 0.6, 0.5], fakeChance: [0, 0, 0.3, 0.35], doubleChance: [0, 0, 0, 0.35] },
      /** 탄막 피하기: 버틸 시간(초), 맞으면 패배하는 횟수, 탄 간격(초, 단계별), 탄이 화면을 건너는 시간(초, 단계별) */
      dodge: { seconds: 30, hitsToLose: 3, spawnSeconds: [1.1, 0.95, 0.8, 0.65], travelSeconds: [2.2, 1.9, 1.6, 1.35] },
      /** 칼날 맞대기: 판 수, 이길 성공 수, 표시 왕복 시간(초, 단계별 범위 — 매번 다름), 가운데 성공 구간 폭(막대 비율) */
      clash: { rounds: 5, toWin: 4, sweepSeconds: [[1.4, 2.0], [1.1, 1.7], [0.9, 1.4], [0.7, 1.2]], zoneWidth: [0.24, 0.2, 0.17, 0.14] },
      /** 먹이사슬: 제한 시간(초), 목표 점수, 칸 수, 먹잇감 +1 / 포식자 −3, 나타나 있는 시간(초, 단계별), 새로 나타나는 간격(초, 단계별), 포식자 비율 */
      chain: { seconds: 30, target: 12, cells: 9, preyScore: 1, predatorScore: -3, showSeconds: [1.3, 1.1, 0.95, 0.8], spawnSeconds: [1.0, 0.9, 0.8, 0.7], predatorShare: [0.3, 0.33, 0.36, 0.4] },
    },
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
      drainFraction: 0.03,
      /** 혈 흡혈 상한 (C.53 15%, C.54 GDD 22-5 v5.13 마스터 결정 8% — 혈 강적 68% 이하): 한 전투에서 흡혈로 되찾는 체력 합계 ≤ 최대 체력 × 이 값. 내 쪽·적 쪽 따로 센다 */
      drainCapFraction: 0.08,
      /** 독: 맞힌 피해의 이 비율을 poisonSeconds 동안 나눠 더 준다 (겹치면 남은 양에 더하고 시간은 새로) */
      poisonFraction: 0.2,
      poisonSeconds: 4,
      /** 허: 상대 방어·정신력을 이 비율만큼 무시. 내가 허 블록을 쓰면 블록 1개당 리스크 게이지 + pierceRisk */
      pierceIgnore: 0.15,
      pierceRisk: 0.6,
    },
    // ── 능력치·성장 (GDD 20-3·20-4, 수치 provisional) ──
    stats: {
      /** 단계별 종족값 합계 (index 0 = 1단계). 기준 능력치 = 합계 ÷ 6.
       *  C.75 (GDD 32-1): 내 능력치는 절대값(세계 기준 = 1단계 기준 능력치 = tierTotals[0] ÷ 6 하나로 환산)이고, 적은 원정 난이도 ★n 의 기준 능력치(= n단계 기준)로 만든다.
       *  단계 간격을 +10% 에서 +25% 로 벌려 한 단계 위·아래가 체감되게 (옛 300/330/360/390/420; C.75 1차 +20% 300/360/430/520/620 은 한 단계 위 일반 처치 시간이 권장의 0.77배라 0.70배가 되는 +25% 로) */
      tierTotals: [300, 375, 470, 585, 730],
      /** 노력치 단계 상한: 합계(index = 단계)와 능력치 하나의 상한(합계 상한 × 비율). 진화해도 유지되고 상한만 오른다 */
      evCapTotal: [8, 16, 24, 32, 40],
      evCapPerStatRatio: 0.5,
      /** 능력치 절대 상한 (GDD 22-1 v4.7): 종족값 + 노력치 + 환생 계승이 이 값에서 멈춘다 (6개 모두) */
      statMax: 999,
    },
    /** 원정 난이도 ★ (GDD 32-1, C.75, provisional): 적 능력치 = ★n 의 기준 능력치(tierTotals[n-1] ÷ 6) × 성향.
     *  k = ★n 기준 능력치 ÷ 세계 기준(★1). 적 체력·공격의 "기본 공격 N회분"은 그 난이도의 권장 단계 플레이어 기준이므로 ★이 오르면 체력·공격도 k 배 가까이 오른다
     *  (hpGrowth·attackGrowth = 1 이면 정확히 k 배, 1 보다 작으면 그만큼 덜). 보상은 ★당 rewardPerStar 만큼 는다. 리스크는 그대로 */
    difficulty: {
      /** ★ 개수 = 단계 수 (tierTotals.length). ★n 은 n단계에 처음 닿으면 열린다(영구) */
      /** 적 체력 배율 = 1 + (k − 1) × hpGrowth, 공격 배율 = 1 + (k − 1) × attackGrowth */
      /** C.75 측정: 블록·필살·콤보 피해는 단계와 무관하게 커지지 않아(블록 생성 속도는 단계와 무관, 20-3 v3.6) 체력을 k 배로 하면 권장 단계 전투가 길어지고 강적 승률이 무너진다
       *  (5단계 몸 ★5: 체력 ×2.43 → 강적 1%, ×1.86(0.6) → 40%, ×1.5 → 74%; 1단계 ★1 = 61%). 조정 2회: 0.6 → 0.45 — 권장 단계 일반 처치 시간·강적 승률이 ★1 과 같아지는 값 */
      hpGrowth: 0.45,
      attackGrowth: 1,
      /** 보상 배율 (GDD 32-1 5·11번, 재화별): 먹이 굴림·흡수 노력치 = 1 + (★−1) × rewardPerStar + 연속 × streak.foodPerClear,
       *  골드 = 1 + (★−1) × goldPerStar + min(연속 × streak.goldPerClear, streak.goldMaxBonus). 영옥은 배율 없음. 목표: ★5·10연속 골드 수입 ≤ ★1 의 2배 */
      rewardPerStar: 0.25,
      /** 기획 +15% → C.75 측정 ★5·10연속 골드 187 = ★1(새 몸) 86 의 2.18배 > 목표 2배 → +10% (조정 1회) */
      goldPerStar: 0.1,
      /** ★1 입문 보정 (C.76, GDD 32-3): 새 몸(특성 없음)이 ★1 에서 강적 소굴 2칸을 놓고 4바퀴 돌면 패배 37~46% 라(패배는 전부 강적) ★1 강적만 체력·공격을 이 배율로. ★2 부터는 1 */
      eliteEase: { 1: { hp: 0.78, attack: 0.78 } } as Record<number, { hp: number; attack: number }>,
      /** 연속 클리어 (GDD 32-1 10번): 같은 ★ 자유 원정을 귀환(클리어)할 때마다 다음 원정 적 체력·공격 +enemyPerClear(최대 maxClears 연속), 지거나 ★를 바꾸면 0 */
      streak: { enemyPerClear: 0.05, maxClears: 10, foodPerClear: 0.05, goldPerClear: 0.02, goldMaxBonus: 0.2 },
    },
    /** 도전의 탑 (GDD 36장, C.85): 한 층 = 전투 한 판. 층 n 의 ★ = ⌈n ÷ bandSize⌉, 같은 구간 안에서 층마다 적 체력·공격 +perFloorInBand(구간 첫 층 +0%),
     *  마지막 층은 finalFloorBonus 를 더 곱한다. 보통 층 = 일반 적, eliteEvery 배수 = 강적, bossEvery 배수 = 보스(bossFloors, 없는 보스 id 는 fallbackBoss).
     *  보상은 첫 클리어만: 골드 goldPerStar × ★, 강적 층(5의 배수) 먹이 1, 보스 층 영옥 bossJade + 칭호, 마지막 층 영옥 finalJade 추가 */
    tower: {
      floors: 50,
      bandSize: 10,
      perFloorInBand: 0.04,
      /** 기획 +20% → C.85 측정: 키운 5단계 몸 50층 승률 87%(목표 30~50%) → +60% 72% → +120% 15% → 조정 3회 +90% (지금은 sand-maw 임시 연결 기준) */
      finalFloorBonus: 0.9,
      /** 강적 층(5의 배수, 보스 층 제외)만 체력·공격에 더 곱한다 (C.85 추가): 체력 가득으로 시작해 권장 단계 진화 몸의 강적 승률이 84~100%(목표 약 70%) — 조정 2회 ×1.4 */
      eliteScale: 1.4,
      eliteEvery: 5,
      bossEvery: 10,
      bossFloors: { 10: 'sand-maw', 20: 'canyon-king', 30: 'forest-lord', 40: 'sand-maw', 50: 'forest-lord' } as Record<number, string>,
      fallbackBoss: 'sand-maw',
      reward: { goldPerStar: 10, eliteFood: 'hearty', bossJade: 3, finalJade: 10 },
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
        /** 환생 전용 히든 (GDD 22-7): 환생 횟수가 이 값 이상이면 아란칼 진화 때 후보 (초과량 = 횟수 ÷ 기준 − 1) */
        rebirths: 3,
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
          reborn: { hp: 0.05, spr: 0.05, spd: 0.05, def: -0.05, atk: -0.05, int: -0.05 },
        } as Record<string, Record<string, number>>,
        /** 융합은 두 속성 성향을 더한 것 × 이 값, 특수 히든은 그 속성 성향 × 이 값 */
        fusionScale: 0.75,
        specialScale: 1.5,
        /** 종족값 합계 배율: 완전체 높게, 실패형 낮게 (나머지는 단계 합계 그대로) */
        totalScale: { complete: 1.08, fail: 0.8, reborn: 1.05 } as Record<string, number>,
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
    /** 원정 전투 승리 골드 (GDD 25-5 의 골드 보상 배율이 기대는 바탕값, C.57 정한 것 — 23-4 얻는 곳 중 '원정' 자리). 강적 = 소굴·조합으로 나온 강적 */
    gold: { normal: 6, elite: 20 },
    /** 보스전 (GDD 25-3·25-7, S-14 C.58): 보스 데이터(src/data/bosses)의 페이즈·기믹은 종류만 고르고 수치는 여기. 시간 제한(초)·기믹 seal(간격·봉인 시간·칸 수)·
     *  보상(골드·희귀 먹이·첫 처치 영옥). 보스 체력·공격은 보스 데이터의 hpInAttacks·attackInAttacks (CLAUDE.md 규칙 3) */
    boss: {
      timeLimitSeconds: 180,
      seal: { everySeconds: 10, seconds: 4, cells: 1 },
      reward: { gold: 100, food: 'feast', firstJade: 10 },
      /** 자유 원정 등장 (GDD 37장, C.86): 그 사냥터 장 보스를 스토리에서 이긴 뒤, freeFromLap 바퀴째부터 바퀴 시작마다 freeChance (원정당 최대 1번).
       *  보상 골드 = reward.gold × 원정 골드 배율(★·연속), 먹이 = reward.food. 첫 처치 영옥·칭호 없음 */
      freeChance: 0.1,
      freeFromLap: 4,
    },
    /** 스토리 모드 (GDD 25-4·25-7): 화 클리어(매번) 골드·먹이, 첫 클리어 영옥, 장 클리어 영옥 */
    story: {
      episodeGold: 20,
      episodeFood: 'basic',
      firstClearJade: 2,
      chapterJade: 5,
    },
    /** 상점 1차 (GDD 25-9, S-16 C.60): 가격·상한·효과량. 품목 목록(id·분류·이름·효과 종류)은 src/data/shop. 골드 = 소모품·편의, 영옥 = 꾸밈 */
    shop: {
      /** 골드 품목 가격 (품목 id → 골드). 덱 칸은 deckSlotPrices */
      goldPrices: {
        'food-snack': 20, 'food-basic': 35, 'food-hearty': 60, 'food-tonic': 100, 'food-feast': 140,
        calm: 80, wake: 60, 'training-ticket': 90, 'rare-tile': 60, reroll: 120,
      } as Record<string, number>,
      /** 타일 덱 칸 +1 의 n번째 가격 (최대 +2: 덱 8 → 9 → 10, 영구·슬롯 공유) */
      deckSlotPrices: [400, 800],
      /** 정화제: 리스크 −30 (0 아래로 안 감) · 각성제: 컨디션 +30 (최대값 위로 안 감) */
      calmRisk: 30,
      wakeCondition: 30,
      /** 다시 뽑기권 보유 상한 (흡수 한 번에 1장까지) */
      rerollMax: 3,
      /** 영옥 꾸밈 가격: 스킨(앞으로 들어오는 스킨도 기본값), 분류별 (GDD 25-9 영옥 탭) */
      skinPrice: 30,
      cosmeticPrices: { aura: 8, tint: 6, trail: 5, fx: 6, bar: 5, shell: 6, plate: 3, enter: 6, evo: 8, absorb: 5, cut: 6, win: 4, talk: 4, room: 10, frame: 3, keyring: 5, device: 20 } as Record<string, number>,
      /** 튜토리얼 목표(23-3) 하나마다 더 주는 영옥 (기존 보상은 그대로, 트랙마다 1회) */
      tutorialJade: 1,
      /** balance:check 가드: 4바퀴 원정 1판 평균 골드로 살 수 있는 보통 먹이 수 */
      basicFoodPerRunGuard: [2, 5],
    },
    /** 타일 변수 5종 (GDD 25-5, S-13 C.57). 표의 이름·짝은 src/data/tiles/*.json, 여기는 수치만. 효과 키는 engine/expedition/variants.ts VariantMods */
    tileVariants: {
      /** ① 드래프트: 바퀴 끝 배치 팝업에서 cards 장 중 1장. 마지막 1장은 specialChance 로 덱 밖 타일/이벤트 타일(그중 이벤트 비율 eventShare) */
      draft: { cards: 3, specialChance: 0.3, eventShare: 0.5 },
      /** ④ 바퀴 변이: fromLap 바퀴부터 바퀴 시작마다 chance 확률로 하나 */
      mutation: { fromLap: 2, chance: 0.3 },
      /** ② 인접 시너지 효과 (rewardMult = 그 칸 전투 먹이·골드 배율, extraBattle = 오른쪽 칸 전투 한 번 더, nextShield = 왼쪽 칸에 닿을 때 다음 전투 보호막(최대 체력 비율), riskOnce = 오른쪽 칸에 닿을 때 한 번) */
      synergies: {
        ambush: { enemyFirstStrike: true, rewardMult: 1.25 },
        oasis: { restMult: 1.5, foodChanceBonus: 0.1 },
        battlefield: { enemyAttackMult: 1.05, goldMult: 1.25 },
        rift: { voidBonus: 0.1, goldMult: 1.5 },
        sanctuary: { nextShield: 0.15 },
        hideout: { riskOnce: -5 },
        pack: { extraBattle: 1 },
        predator: { absorbBonus: 1 },
      } as Record<string, Record<string, number | boolean | string>>,
      /** ④ 바퀴 변이 효과 (voidMult = 공허 블록 기본 확률 배율, foodMult = 먹이 드롭 횟수 배율, elementBias = 그 속성 적 가중치를 사냥터 주 속성처럼) */
      mutations: {
        'void-night': { voidMult: 2, rewardMult: 1.25 },
        famine: { hungerMult: 2, foodMult: 2 },
        'blood-moon': { elementBias: 'blood', absorbBonus: 1 },
        calm: { enemyHpMult: 0.85, goldMult: 0.7 },
        storm: { enemyAttackMult: 1.1, eliteSoulBonus: 1 },
      } as Record<string, Record<string, number | boolean | string>>,
      /** ⑤ 상위 타일("+") 강화: 바탕 타일 종류별 (envMult = 환경 효과 크기 배율) */
      upgrade: {
        'prey-nest': { rewardMult: 1.3 },
        'elite-den': { rewardMult: 1.5, eliteHpMult: 1.1 },
        environment: { envMult: 1.5 },
        rest: { restMult: 2 },
      } as Record<string, Record<string, number | boolean | string>>,
      /** ⑤ 합성: 같은 타일 이 수만큼 → 상위 1장 */
      synthCost: 3,
      /** ③ 이벤트 타일 */
      events: {
        /** 상인: 판매 줄 수(먹이 2 + 타일 1), 가격(골드) */
        merchant: { foodOffers: 2, prices: { snack: 15, basic: 25, hearty: 45, tonic: 70, feast: 90, tile: 30 } as Record<string, number> },
        /** 제단: 리스크 +risk 대신 장착 특성 하나 위력 +traitPower (이번 원정 동안) */
        altar: { risk: 15, traitPower: 0.1 },
        /** 보물: foodChance 로 희귀 먹이 1(표), 아니면 골드 gold[0]~gold[1] */
        treasure: { foodChance: 0.5, foodTable: { tonic: 60, feast: 40 } as Record<string, number>, gold: [20, 40] as [number, number] },
        /** 함정: 다음 전투 시작 체력 비율, 이기면 보상 배율 */
        trap: { startHpFraction: 0.8, rewardMult: 1.25 },
        /** 갈림길: 다음 전투 보호막(최대 체력 비율) / 골드 */
        crossroads: { shield: 0.3, gold: 25 },
      },
    },
    /** 둥지 최소 버전(P2): 허기·컨디션 두 수치만 (GDD 7장) */
    nest: {
      startHunger: 20,
      startCondition: 80,
      /** 꺼 둔 동안 허기 (GDD 24-1 v5.8, provisional): 시간당 상승, 한 번 비운 사이 오르는 양의 상한(+60), 복귀 말풍선을 띄우는 최소 상승량.
       *  원정 중간 저장이 있으면 오르지 않는다. 허기 자체는 100 을 넘지 않는다(죽지 않음) */
      idleHungerPerHour: 7.5,
      idleHungerMaxGain: 60,
      idleHungerNotice: 5,
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
       *  블록·필살이 시간을 줄이므로, 봇(빈 슬롯 = 기본 블록만) 기준 일반 약 45초·강적 약 90초가 되게 맞춘다 (npm run balance, C.6 조정 1.5→2.8, C.8 일자 8칸 바에서 봇이 더 잘 붙여 일반 36초로 짧아져 2.8→3.4,
       *  C.63 내 치명타 평균 피해 +2.5%(5%·×1.5)만큼 3.4→3.48 — 치명타 전후 처치 시간이 같게) */
      hpAttackScale: 3.48,
      /** 적 데이터 hpInAttacks 기준값 (GDD 3-5 임시: 일반 약 30회, 강적 약 70회 분량). 밸런스 점검이 데이터가 이 근처인지 본다 */
      enemyHpInAttacks: { normal: 30, elite: 70 },
      /** 패턴 종류별 hpInAttacks 기준값 (C.15, GDD 14-5 임시): 속공은 약간 적게, 단단은 많게. 밸런스 점검이 데이터가 ±15% 안인지 본다 */
      enemyHpByKind: { basic: 30, swift: 28, sturdy: 40, 'heavy-seal': 80, 'heavy-chain': 80, stance: 70 },
      /** 육성이 올리는 값: 공격 배율 (GDD 3-2). 적 체력도 같이 올라 비율 유지. 육성 없음 = 1 */
      growthMultiplier: 1,
      /** 플레이어 체력 (= 기본 공격 15회 분량). 한 조우마다 새로 시작. 강적(약 90초)을 기본 블록만으로도 버틸 여지가 있게 100→150 (C.6 봇 점검) */
      /*  C.63: 적 치명타(3%·×1.5)로 늘어난 패배를 치명타 전 수준으로 150→154 (밸런스 조정 4회차, 마스터 결정, dev-log C.63) */
      playerMaxHp: 154,
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
      /** 치명타 (C.63, GDD 28장 5번, 마스터 추천 provisional): 물리·마법 합친 하나. 내 기본 확률 5%, 치명 피해 ×1.5,
       *  기본 공격·스킬 블록·체인·필살·콤보·해방·저장형 필살 모두 대상(공허 블록·반사·독 지속 피해 제외). 적도 같은 규칙(기본 확률 3%).
       *  특성 critChance 가 확률을 더하고(합), 상한 critChanceMax */
      critChance: 0.05,
      critMultiplier: 1.5,
      enemyCritChance: 0.03,
      critChanceMax: 0.5,
    },
  },
} as const;
