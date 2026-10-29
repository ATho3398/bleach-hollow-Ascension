// 밸런스 설정 (CLAUDE.md, docs/GDD.md 2장)
// 모든 수치는 이 파일에 둔다. 이 파일만 고치면 게임에 반영된다.
// 세이브 필드 구조를 바꾸는 변경은 src/game.ts 의 SAVE_FORMAT_VERSION 을 올린다.

/** 수치를 바꾸면 올린다. 새 게임 시작 시 세이브에 기록된다. */
export const BALANCE_VERSION = 90; // C.199 129장 3: 각본 전투 보여 주는 시간 hurtHold·stackHold 1초·블록 뒤 1.2 → 2초·처치 슬로우 1.6초(provisional). C.199 B: 튜토리얼 회복 안내 provisional.tutorialRecover 추가(다른 수치 그대로). C.198 (GDD 123장 1·4): 원정 ★1 적 공격 0.35 → 0.425·★1 기본 공격 묶음 hitPacing ×4(한 대 약 3) — 1단계 새 몸 ★1 끝까지 4바퀴 패배 19% → 40%. 홈 체력 homeHp(대기 +2%/분·온천 +10%/분·배부름 −10/분·먹이 +2~8%)·상인 체력 포션 w-hp-potion 320골드(영웅). C.195 추가 이전 ↓ — C.195 추가: 원정 보스는 원정 적 공격 배율(hpCarry.enemyAttackMult) 제외 — 자유 원정 sand-maw ★1 보스에게 짐 46/210 → 140/210(C.193 이전 148/216), canyon-king 32/94·forest-lord 37/95 (가드 +8%p 이하). C.195 (GDD 121장 4~8·11): 이어하기 배율 continueScale(보상 +25%/바퀴·적 +12%/바퀴, 옛 lapHpScale 0.12·lapAttackScale 0.08 대체)·사냥 힐 winHealByLap 10·6·3·0%·영구 타일 permTile 40%(+4%/바퀴, 최대 60%)·원정 적 공격 ★4 0.55·★5 0.65·탑 ★2 강적 층 1.02 → 1.2 (첫 강공격 막기 게이지 뒤). C.193: 원정 체력 이어 가기 회복값 기획값으로(승리 +40% → +10%·웅덩이 +50% → +35%, GDD 107장 3·119장 1) + 원정 적 공격 배율 hpCarry.enemyAttackMult ★1 0.35·그 밖 0.5(원정 안 보스 포함·튜토리얼 제외, 새 몸 ★1 패배 0%·권장 ★2~5 18·30·17·8%·타일 변수 +4.2%p). C.184: 노멀 skill 특성 = 기본 블록(칸에 안 듦) → 노멀 강화 1↑이면 빈 본체 칸마다 기본 공격 블록 +25%(absorb.enhance.basicPerEmptySlot, 노멀 몸 일반 처치 30.2 → 23.7초) (GDD 111장 3). C.177: 막기 = 게이지 8초·0.5초 강공격 완전 막기(옛 체인 경감·충전 3칸·회복 삭제)·[소모품] 회복약 25%/전투 각성제 5초 ×2·[장비] 쿨다운 20초(시작 절반)·발동 장비 방패 −40%/폭발 5회분·강공격 ×3 → ×1.33(약 20%)·연속 ×2.25 → ×1·attackGrowth 0.5 → 0.8·원정 체력 이어 가기 승리 +35%·휴식 +50%·eliteEase ★1 0.78 → 0.7·★2 1 → 0.9·탑 강적 ×1.4 → ×1.55(★2 1.02·★3 1·★4 1.08)·perVoidBlock 3.5 → 3.8·보스 공격 ×1.2(sand-maw 0.38·canyon-king 0.56·forest-lord 0.66)·방어 자세 반격 0.42 → 0.3 (GDD 105장 수정 v5.233·106장 4·107장). C.181: 먹이 배부름 약 0.09배(고기 35 → 3·사냥감 55 → 5, 다른 먹이 같은 비율)·10분에 3개(넘으면 뱉음)·배부름 시간당 −7.5 → −5 (GDD 109장 6). C.176: 휴식 칸 시간 10 → 약 3.3초(restSecondsPerTile 5 → 5/3, 회복량 그대로)·같은 속성 포식 후보 다시 뜸(가진 블록 = 강화만)·탑 ★3 보스 층 ×0.65 → 0.72 (GDD 106장 1·2). C.175: 돌봄 패널티 provisional.nest.care·bond·medicinePrices, 꺼 둔 허기 +60 상한 삭제 (GDD 102장). C.174: 강공격 ×2.5 → ×3(최대 체력 약 45%)·연속 강공격 한 타 ×1.4 → ×2.25·사람형 봇 강공격 다 막음 → 적 공격 배율 0.55 → 0.45·공허 몫 3 → 2% (GDD 101장 추가 결정 3). C.173: 공허 블록 = 출현표 안 몫 10%(상한 50%, 별도 시계 삭제)·피해 8 → 1(히든 진화체 8)·폭주 받는 피해 1.3 → 1.6 + 회피 20% (GDD 101장). C.168: 해방 순간 블록 2 → 1·지속 4 → 6초 (GDD 95장 B2 후속, 마스터 결정). C.167: C.167: 해방 칸 폐지(slotsByTier 삭제)·고유 능력치 ×1.05 → ×1.1·수련 ×1.1 → ×1.2 (GDD 98장 B). C.166: 해방 순간 블록 2개·생성 ×1.3 → ×1.8·지속 8 → 4초·게이지 블록 8 → 2·준 피해 40 → 15·받은 피해 70 → 90·고유 능력치 ×1.1 → ×1.05(수련 ×1.2 → ×1.1) (GDD 95장 B2 후속). C.154: C.154: 해방 게이지 블록당 12 → 8 + 준 피해 40·받은 피해 70(적·내 최대 체력 1개분당) (GDD 95장 B2). C.150: 장비 provisional.gear·같은 속성 3개 보너스 삭제 (GDD 91장·94장 B 후속). C.147: 속성 강화 앞 10단계 +4%·노멀 강화 = 기본 공격 블록 (GDD 94장 B). C.199 (87): C.199: 첫 원정 첫 전투 각본 수치 provisional.tutorialScript 추가(GDD 123장 5, 다른 수치 그대로). C.195 추가: 원정 보스는 원정 적 공격 배율(hpCarry.enemyAttackMult) 제외 — 자유 원정 sand-maw ★1 보스에게 짐 46/210 → 140/210(C.193 이전 148/216), canyon-king 32/94·forest-lord 37/95 (가드 +8%p 이하). C.195 (GDD 121장 4~8·11): 이어하기 배율 continueScale(보상 +25%/바퀴·적 +12%/바퀴, 옛 lapHpScale 0.12·lapAttackScale 0.08 대체)·사냥 힐 winHealByLap 10·6·3·0%·영구 타일 permTile 40%(+4%/바퀴, 최대 60%)·원정 적 공격 ★4 0.55·★5 0.65·탑 ★2 강적 층 1.02 → 1.2 (첫 강공격 막기 게이지 뒤). C.193: 원정 체력 이어 가기 회복값 기획값으로(승리 +40% → +10%·웅덩이 +50% → +35%, GDD 107장 3·119장 1) + 원정 적 공격 배율 hpCarry.enemyAttackMult ★1 0.35·그 밖 0.5(원정 안 보스 포함·튜토리얼 제외, 새 몸 ★1 패배 0%·권장 ★2~5 18·30·17·8%·타일 변수 +4.2%p). C.184: 노멀 skill 특성 = 기본 블록(칸에 안 듦) → 노멀 강화 1↑이면 빈 본체 칸마다 기본 공격 블록 +25%(absorb.enhance.basicPerEmptySlot, 노멀 몸 일반 처치 30.2 → 23.7초) (GDD 111장 3). C.177: 막기 = 게이지 8초·0.5초 강공격 완전 막기(옛 체인 경감·충전 3칸·회복 삭제)·[소모품] 회복약 25%/전투 각성제 5초 ×2·[장비] 쿨다운 20초(시작 절반)·발동 장비 방패 −40%/폭발 5회분·강공격 ×3 → ×1.33(약 20%)·연속 ×2.25 → ×1·attackGrowth 0.5 → 0.8·원정 체력 이어 가기 승리 +35%·휴식 +50%·eliteEase ★1 0.78 → 0.7·★2 1 → 0.9·탑 강적 ×1.4 → ×1.55(★2 1.02·★3 1·★4 1.08)·perVoidBlock 3.5 → 3.8·보스 공격 ×1.2(sand-maw 0.38·canyon-king 0.56·forest-lord 0.66)·방어 자세 반격 0.42 → 0.3 (GDD 105장 수정 v5.233·106장 4·107장). C.181: 먹이 배부름 약 0.09배(고기 35 → 3·사냥감 55 → 5, 다른 먹이 같은 비율)·10분에 3개(넘으면 뱉음)·배부름 시간당 −7.5 → −5 (GDD 109장 6). C.176: 휴식 칸 시간 10 → 약 3.3초(restSecondsPerTile 5 → 5/3, 회복량 그대로)·같은 속성 포식 후보 다시 뜸(가진 블록 = 강화만)·탑 ★3 보스 층 ×0.65 → 0.72 (GDD 106장 1·2). C.175: 돌봄 패널티 provisional.nest.care·bond·medicinePrices, 꺼 둔 허기 +60 상한 삭제 (GDD 102장). C.174: 강공격 ×2.5 → ×3(최대 체력 약 45%)·연속 강공격 한 타 ×1.4 → ×2.25·사람형 봇 강공격 다 막음 → 적 공격 배율 0.55 → 0.45·공허 몫 3 → 2% (GDD 101장 추가 결정 3). C.173: 공허 블록 = 출현표 안 몫 10%(상한 50%, 별도 시계 삭제)·피해 8 → 1(히든 진화체 8)·폭주 받는 피해 1.3 → 1.6 + 회피 20% (GDD 101장). C.168: 해방 순간 블록 2 → 1·지속 4 → 6초 (GDD 95장 B2 후속, 마스터 결정). C.167: C.167: 해방 칸 폐지(slotsByTier 삭제)·고유 능력치 ×1.05 → ×1.1·수련 ×1.1 → ×1.2 (GDD 98장 B). C.166: 해방 순간 블록 2개·생성 ×1.3 → ×1.8·지속 8 → 4초·게이지 블록 8 → 2·준 피해 40 → 15·받은 피해 70 → 90·고유 능력치 ×1.1 → ×1.05(수련 ×1.2 → ×1.1) (GDD 95장 B2 후속). C.154: C.154: 해방 게이지 블록당 12 → 8 + 준 피해 40·받은 피해 70(적·내 최대 체력 1개분당) (GDD 95장 B2). C.150: 장비 provisional.gear·같은 속성 3개 보너스 삭제 (GDD 91장·94장 B 후속). C.147: 속성 강화 앞 10단계 +4%·노멀 강화 = 기본 공격 블록 (GDD 94장 B).

export const BALANCE = {
  // ── 확정 수치: 기획서 2장 템포 ──
  expedition: {
    /** 루프 길이 (둥지 칸 1 포함) */
    loopTiles: 12,
    /** 전투 없는 칸 이동 시간(초). C.125 (GDD 72장 "한 칸 넘어갈 때 시간 1/2"): 5 → 2.5. C.136 (GDD 84장 1번 "던전 한 칸 돌 때 드는 시간 1/2"): 2.5 → 1.25. 걸음 수·조우 판정·전투 시간과 무관 */
    secondsPerTile: 1.25,
    /** 휴식 타일 시간 단위(초): 휴식 = restTimeTiles × 이 값. C.176 (GDD 106장 2): 10초 → 1/3(약 3.3초), 회복량은 그대로 */
    restSecondsPerTile: 5 / 3,
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
  /** 상점 (GDD 25-9, S-16 C.60 → v5.70 사용자 확정 2026-10-20 "상점 가격도 일단 확정", C.84 에서 값 그대로 확정 구역으로): 가격·상한·효과량. 품목 목록(id·분류·이름·효과 종류)은 src/data/shop. 골드 = 소모품·편의, 영옥 = 꾸밈 */
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

  // ── 임시값(provisional): 기획서 미정 항목을 프로토타입용으로 채우는 구역 (GDD 12장) ──
  // 여기 값은 확정이 아니다. 확정되면 기획서에 반영하고 이 구역에서 옮긴다.
  provisional: {
    // ── 흡수·리스크(P3) 임시값. 기획서 4-1: 11-3(계통·특성 풀), 11-4(리스크 수치)가 미정 ──
    absorb: {
      /* 흡수 가능 조건(weakChain3ForAbsorb 우위 체인3 횟수·우위 마무리·첫 흡수 보장)은 C.125 에 삭제 (GDD 71장: 이기면 언제나 흡수) */
      /** 특성 후보 수: 일반 적은 1~2개 중 무작위, 강적은 항상 2개 (GDD 4장 "후보 1~2개") */
      candidatesElite: 2,
      candidatesNormalMax: 2,
      /** 공격 계열 섞임 (GDD 18-8 ③, C.41, 임시): 장착한 공격 특성이 이 수보다 적은 계열이면, 흡수 후보에 아직 없는 계열의 공격 특성을 1개 끼워 넣는다(그 계통에 있을 때). 첫 흡수(장착 skill 없음)는 서로 다른 계열 공격 후보 2개 */
      attackFamilyGuarantee: 2,
      /* 슬롯 안 같은 속성 3개 → 속성 보너스(elementBonusCount·elementSkillBonus, C.47)는 C.150 에 삭제 (GDD 94장 B 후속 v5.194: 가진 속성은 강화만이라 닿을 수 없다 — 강화 곡선이 대신함) */
      /* 흡수 후보 섞기(otherElementCandidate, C.47)는 C.125 에 삭제 (GDD 70장: 후보는 그 적 속성 특성에서만) */
      /** 흡수하면 허기가 이 값으로 리셋 (GDD 4장 "허기 리셋") */
      hungerAfterAbsorb: 0,
      /** 흡수 시 보상 타일 (GDD 2-1 "흡수 시 1"). 바퀴 합계는 tilesPerLap.max 안, 바퀴 완주 보상 1장은 남겨 둔다 */
      bonusTiles: 1,
      /** 흡수 갈래 (GDD 52, C.108, provisional): 둘 다 = 특성·속성 카운트 + 노력치 ×1 · 속성만 = 특성·속성 카운트만, 리스크 ×0.7 · 스탯만 = 노력치 ×2, 리스크 ×0.5 (특성·속성 카운트 없음).
       *  흡수 안 함 = 놓아주기(releaseEffect) 그대로. 세 갈래 모두 허기 리셋·보상 타일 */
      modes: {
        both: { ev: 1, risk: 1 },
        trait: { ev: 0, risk: 0.7 },
        stat: { ev: 2, risk: 0.5 },
      },
      /** 속성 강화 (GDD 84장 8번, C.136 provisional — 사용자 "이미 흙-교를 먹어도 흙 잡으면 계속 먹을 수 있게 … 각 속성별로 100번까지 강화"): 특성·속성 카운트가 있는 갈래(둘 다·속성만)로 흡수할 때마다
       *  그 적 속성의 강화 횟수 +1 (빌드에 저장, 상한 없이 센다). 효과 단계 = min(횟수, max). 그 속성 공격 특성 블록 위력 + attackPerLevel × 단계 (100 = +40%).
       *  막기·회복은 속성이 없어(84장 7번) 기본 막기·회복 블록 위력 + guardHealPerLevel × (모든 속성 단계 합), 최대 +guardHealMax (코드 판단: 막기·회복을 세지게 할 '강화'의 출처) */
      /*  C.147 (GDD 94장 B — 가진 속성 흡수 = 강화만, 노멀 = 기본 블록): 같은 속성 특성 3개(속성 보너스 +50%)를 더는 모을 수 없어 강화가 주된 성장 →
       *  앞 earlyLevels 단계는 earlyPerLevel(단계당 +5%, 10단계 +50% = 옛 속성 보너스만큼), 그 뒤는 attackPerLevel(+0.4%) — 100 = +86%. 노멀 강화는 기본 공격 블록에 (물공 블록 제외) */
      enhance: { max: 100, earlyLevels: 10, earlyPerLevel: 0.05, attackPerLevel: 0.004, guardHealPerLevel: 0.0005, guardHealMax: 0.3,
        /** C.184 (GDD 111장 3): 노멀 skill 특성(노멀 조·탄·교)은 기본 블록이 그 역할이라 칸에 들지 않는다 — 노멀 강화 1↑이면 빈 본체 칸마다 기본 공격 블록 위력 +이 값(옛 '빈 칸에 노멀 블록'을 대신) */
        basicPerEmptySlot: 0.25 },
    },
    /** 특수 속성(혈·독·허) 적 등장 숨김 (GDD 75장, C.127, provisional — 옛 49-7 ① 특성 숨김 absorb.specialTraits 를 옮김): 원정 출현 풀에서 혈·독·허 적의 가중치 × 이 값(여럿이면 가장 큰 값).
     *  강적 elite / 바퀴 변이 효과 specialEnemyChance(공허의 밤) / 원정 난이도 ★minDifficulty 이상 difficulty. 그 밖(★1~2 일반 적 칸·먹잇감 둥지 등)은 0 = 안 나오고 다른 속성 적으로.
     *  보스는 보스 데이터의 고정 적이라 늘 그대로(옛 boss 1). 나온 혈·독·허 적을 잡으면 그 속성 특성이 늘 후보(70장) */
    specialEnemies: { elite: 0.5, minDifficulty: 3, difficulty: 0.3 },
    risk: {
      /** 한계값: 이상이 되면 돌파 (GDD 4-1) */
      limit: 100,
      /** 공허 블록 1개 사용 → 리스크 게이지 상승량 (GDD 3-5). 옛 "공허 매칭 1회 5 × 0.25 = 1.25" 보다 크게: 블록은 매칭보다 드물고 피해가 크다 */
      perVoidBlock: 3.8, // C.177 (GDD 105장 수정·107장: 4바퀴 섞음 끝 리스크 37 — 가드 하한 40, 4.2 면 타일 변수 폭주가 늘어 패배 +%p 가드 넘음): 3.5 → 3.8. C.174: 2.5 → 3.5 (GDD 105장 경직 중 블록 사용 금지로 공허 사용이 줄어 4바퀴 섞음 끝 리스크 34 — 가드 하한 40)
      /** 강한 적 흡수 시 리스크 상승 = 적 hpInAttacks(바퀴 강화 포함) × 이 값. 옛 0.55/매칭 회분 × (6회분 → 30회분 환산) ≈ 0.11. 강적(70)이 일반(30)의 약 2.3배 */
      /* C.7: 0.12→0.22 (첫 흡수 보장·새 조건으로 흡수 횟수가 줄어 6바퀴 돌파 가드 유지) */
      absorbPerHpAttack: 0.095, // C.136: 0.12 → 0.095 (광기 감소를 줄여(84장 10번) 4바퀴 흡수 봇 돌파가 34~39/60 > 50% — 오르는 쪽을 조금 낮춤, 6바퀴 흡수 돌파 ≥50% 는 유지). C.125: 흡수 조건 삭제(GDD 71장)로 흡수가 약 1.8배(4바퀴 섞음 4.2→7.4회, 흡수 봇 8.3→14.7회) → 0.26→0.16→0.14→0.12 (조정 3회, 놓아주기 5→2 와 함께: 섞음 끝 43.8·돌파 0/60, 흡수 봇 돌파 26/60). C.98: 기본 블록 몫 재조정으로 4바퀴 흡수 봇 흡수 3.9→6.0회·돌파 31/60(>50%) → 0.28→0.26 (돌파 27/60, 섞음 끝 리스크 47.5). C.97: 기본 블록이 섞여 흡수 조건(우위 마무리·체인3)이 덜 채워져 4바퀴 섞음 흡수 5회대→3.9회, 허 리스크 삭제(45장 5번)까지 겹쳐 끝 리스크 34 → 0.2→0.28 (약 44). C.47: 약점 없는 적(노멀·특수)은 아무 기술로 마무리해도 흡수돼 흡수가 잦아진 만큼(4바퀴 5.3→6.7회) 0.3→0.25→0.2 (조정 2회)
      /** 놓아주면 하락. C.52: 8 → 6 (GDD 23-2 목표 — 흡수·놓아주기 섞은 4바퀴 원정 끝 40~60, 조정 1회). C.69(B-1): 4바퀴 섞음 300판 끝 39.4 로 목표 바로 아래 → 6 → 5 (41.3, 조정 1회) */
      releaseRelief: 1, // C.136 (GDD 84장 10번 "광기 수치 너무 잘 줄어드는듯"): 2 → 1. C.125: 놓아주기도 약 1.9배(4바퀴 섞음 3.6→6.8회)라 5 → 3 → 2 (섞음 끝 리스크가 40 밑으로 빠지지 않게, absorbPerHpAttack 과 같이 조정)
      /** 휴식 타일에서 하락. C.136 (GDD 84장 10번): 15 → 10 (8 은 4바퀴 섞음 끝 광기가 가드 60 을 넘음) */
      restRelief: 10,
      /** 5바퀴째부터 칸을 지날 때마다 상승: (바퀴 − 5 + 1) × 이 값 (GDD 5장 "5바퀴 이후") */
      lateLapPerTile: 0.5,
      /** 돌파 페널티: 그 원정 남은 동안 공허 생성률 가산, 둥지 복귀 시 안정 수치 하락 */
      breakthroughSpawnBonus: 0.2,
      breakthroughStabilityLoss: 25,
      /** 한계 돌파 = 폭주 (GDD 23-2): 그 원정 남은 동안 주는 피해·받는 피해 배율, 둥지로 돌아오면 컨디션 하락 */
      frenzyDamageDealt: 1.3,
      frenzyDamageTaken: 1.6, // C.173 (GDD 101장 4번): 1.3 → 1.6, 대신 회피 frenzyEvadeChance
      /** 폭주 중 회피 확률 (GDD 101장 4번, C.173 provisional): 적 공격 한 번(평타·강공격·반격·졸개)을 통째로 피한다 */
      frenzyEvadeChance: 0.1, // 101장 추가 결정 1번: 20% → 10%
      frenzyConditionLoss: 30,
      /** 돌파한 원정에서 귀환하면 게이지가 이 값으로 가라앉는다(바로 또 돌파하지 않게) */
      riskAfterBreakthrough: 60,
      /** 안정 수치(호로 자아 / 사신 영압 안정도): 시작값·상한, 놓아줄 때 상승 */
      stabilityStart: 50,
      stabilityMax: 100,
      releaseStability: 6,
      /** 둥지 행동의 리스크 하락·안정 수치 상승 (GDD 5장 "둥지 쓰다듬기" 등). C.52: 재우기·쓰다듬기 −10 → −20 (GDD 23-2 "한 번에 크게") */
      /*  C.136 (GDD 84장 10번 "광기 수치 너무 잘 줄어드는듯"): 먹이 −5 → −3 · 재우기·쓰다듬기 −20 → −10 */
      nestActions: {
        feed: { risk: -3, stability: 2 },
        sleep: { risk: -10, stability: 3 },
        pet: { risk: -10, stability: 8 },
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
      /** C.134(GDD 83장): 저장형 필살기(14-6)를 없애고 그 게이지를 해방 게이지로. 5단계 전 = 영력 해방, 이 단계(tierIndex, 4 = 5단계 아란칼/수석 대원)부터 = 레스렉시온/만해(고유 효과).
       *  수련 진입 단계(GDD 22-4)도 이 값. 22-2 의 해금 조건(수련 완료·등급 이력)은 폐기 — 1단계부터 쓸 수 있다 */
      minTierIndex: 4,
      /** 게이지: 블록 1개 사용당 +gaugePerBlock(C.154: 12 → 8, C.166: 8 → 2 — 게이지는 주로 받은 피해로: 블록을 안 써도 해방하고 블록 플레이가 해방을 너무 자주 쓰지 않게), 체인 2·3 이면 사용 한 번에 보너스 +4 / +10, 정화 +40(블록 데이터). 100 이면 [해방]. 해방 중에는 차지 않는다 */
      gaugeMax: 100,
      gaugePerBlock: 2,
      chainBonus: [0, 4, 10],
      /** C.154 (GDD 95장 B2): 피해로도 찬다 — 적 최대 체력만큼 주면 +gaugePerDealt, 내 최대 체력만큼 받으면 +gaugePerTaken (평타·블록·반격 모두). 블록을 안 쓰는 평타형·자동전투도 강적전에 해방할 수 있게 */
      gaugePerDealt: 15,
      gaugePerTaken: 90,
      /** 전투 시작 게이지 = 안정 수치(0~stabilityMax) 비례로 0~이 값 (둥지 애착 반영, 옛 저장 필살 시작 게이지) */
      startGaugeMax: 50,
      /** 지속(초, 기획 "약 10초"). 끝나면 게이지 0 부터 다시 — 한 전투에 여러 번. C.134 조정: 10 → 8 (해방 한 번이 1칸 몸 강적 승률 +8%p 안팎이라 — 회귀 가드, 흡수 타이머 4.6 과 같이). C.166: 8 → 4 (순간 2개·생성 ×1.8 로 해방 한 번이 세져 — 1~4단계 강적·보스·탑 가드). C.168: 4 → 6 (마스터 "4초는 너무 짧다" — 순간 블록 2 → 1 로 맞춤) */
      seconds: 6,
      /** 해방 중 블록 생성 속도 배율: 생성 타이머(흡수·기본·물공)가 이 배로 빨리 돌고, 나오는 블록은 전부 장착 블록(장착이 없으면 기본 블록, 98장 B — 해방 칸은 C.167 에 폐지).
       *  C.134 조정: 처음엔 고정 간격 0.9초(타이머 멈춤) → 1칸 몸 강적 98%(목표 ≤85) → 1.5·1.8·2.0초로 늦춰도 90% → 빌드에 비례하게 배율 방식 ×1.3 (+ 흡수 타이머 4.0 → 4.6초). C.166(95장 B2 후속, 마스터 결정 "체감되게"): ×1.3 → ×1.8 (1초에 약 1개) */
      spawnSpeed: 1.8,
      /** C.166 (GDD 95장 B2 후속, 마스터 결정): 해방 순간 해방 블록을 이만큼 바로 지급 (바가 차 있으면 오른쪽 끝 옛 블록 — 기본 막기·회복부터 — 을 밀어냄) */
      instantBlocks: 1,
      /** 옛 해방 블록(22-5, kind 'liberation') 위력 = 일반 블록 × 이 배수. C.134 부터 해방 중에는 장착 블록(C.167 전에는 해방 슬롯 블록)이 나와 이 블록은 생기지 않는다(옛 상태 호환) */
      blockPowerMultiplier: 3,
      /** 레스렉시온/만해 고유 효과 (minTierIndex 부터): 공격 속도 ×, 해방 블록 생성(체인 속도) ×, 전 능력치 × (수련 완료면 trainedStatMultiplier — 22-4 수련은 고유 효과 강화로 남김) */
      uniqueAttackSpeed: 1.3,
      uniqueChainSpeed: 1.3,
      uniqueStatMultiplier: 1.1,
      trainedStatMultiplier: 1.2,
      /** 해방이 끝날 때마다(전투가 먼저 끝나도) 리스크 게이지 상승 — 소폭. C.134 조정: 5 → 1 → 0.5 → 0.3 → 0.2 → 0.1 (전투마다 1번 안팎 쓰여 원정 4바퀴에 +5 → 4바퀴 섞음 끝 리스크 77.6(목표 40~60)·흡수 플레이 돌파 가드 — 옛 22-5 는 전투당 1회 +15) */
      riskOnEnd: 0.1,
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
        duel: { points: 5, ev: { spr: 4 }, condition: -10, hunger: 0, risk: 5 },
        dodge: { points: 3, ev: { spd: 5 }, condition: -15, hunger: 0, risk: 0 },
        clash: { points: 4, ev: { atk: 5 }, condition: -5, hunger: 15, risk: 0 },
        chain: { points: 3, ev: { hp: 5 }, condition: 0, hunger: 0, risk: 10, winHunger: -20 },
      } as Record<string, { points: number; ev: Record<string, number>; condition: number; hunger: number; risk: number; winHunger?: number }>,
      /** 본능 대결: 상대 게이지 hits 번 깎으면 승, misses 번 놓치면 패. 예고 간격(초), 받아치는 창(초, 단계별), 3단계부터 페이크 확률, 4단계 연속 공격 확률 */
      duel: { hits: 8, misses: 4, gapSeconds: [0.8, 2.0], windowSeconds: [1.0, 0.85, 0.72, 0.6], telegraphSeconds: [0.9, 0.75, 0.6, 0.5], fakeChance: [0, 0, 0.3, 0.35], doubleChance: [0, 0, 0, 0.35],
        /** 연속 공격 두 번째 예고까지 간격(초), 페이크가 바뀌는 시점(예고 시간 대비 비율) — C.139 엔진에서 옮김(값 그대로) */
        doubleGapSeconds: 0.35, fakeAtShare: 0.55 },
      /** 탄막 피하기: 버틸 시간(초), 맞으면 패배하는 횟수, 탄 간격(초, 단계별), 탄이 화면을 건너는 시간(초, 단계별) */
      dodge: { seconds: 30, hitsToLose: 3, spawnSeconds: [1.1, 0.95, 0.8, 0.65], travelSeconds: [2.2, 1.9, 1.6, 1.35],
        /** 탄 간격 흔들림: 간격 × (base + 난수 × range) — C.139 엔진에서 옮김(값 그대로) */
        spawnJitter: { base: 0.8, range: 0.4 } },
      /** 칼날 맞대기: 판 수, 이길 성공 수, 표시 왕복 시간(초, 단계별 범위 — 매번 다름), 가운데 성공 구간 폭(막대 비율) */
      clash: { rounds: 5, toWin: 4, sweepSeconds: [[1.4, 2.0], [1.1, 1.7], [0.9, 1.4], [0.7, 1.2]], zoneWidth: [0.24, 0.2, 0.17, 0.14] },
      /** 먹이사슬: 제한 시간(초), 목표 점수, 칸 수, 먹잇감 +1 / 포식자 −3, 나타나 있는 시간(초, 단계별), 새로 나타나는 간격(초, 단계별), 포식자 비율 */
      chain: { seconds: 30, target: 12, cells: 9, preyScore: 1, predatorScore: -3, showSeconds: [1.3, 1.1, 0.95, 0.8], spawnSeconds: [1.0, 0.9, 0.8, 0.7], predatorShare: [0.3, 0.33, 0.36, 0.4],
        /** 첫 등장 시각(초), 등장 간격 흔들림 간격 × (base + 난수 × range) — C.139 엔진에서 옮김(값 그대로) */
        firstSpawnSeconds: 0.5, spawnJitter: { base: 0.8, range: 0.4 } },
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
      /** 보관 한도를 넘친 먹이 1개 = 상점 골드 가격 × 이 비율 (GDD 42장 4번, 원정 전리품·화 보상 공통) */
      overflowGoldRate: 0.2,
    },
    /** 테스트 모드 전체 해금 때 장착 특성이 비어 있으면 채우는 역할 순서 (GDD 42장 2번). 그 몸 속성(없으면 노멀)의 희귀 아닌 skill 특성. 칸이 더 있으면 공격으로 채운다 */
    testMode: {
      defaultTraitRoles: ['attack'] as string[], // C.136 (GDD 84장 7번): 막기·회복 속성 특성 삭제 — 공격만 (막기·회복은 기본 블록)
      fallbackElement: 'normal',
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
    },
    // ── 능력치·성장 (GDD 20-3·20-4, 수치 provisional) ──
    stats: {
      /** 단계별 종족값 합계 (index 0 = 1단계). 기준 능력치 = 합계 ÷ 6.
       *  C.75 (GDD 32-1): 내 능력치는 절대값(세계 기준 = 1단계 기준 능력치 = tierTotals[0] ÷ 6 하나로 환산)이고, 적은 원정 난이도 ★n 의 기준 능력치(= n단계 기준)로 만든다.
       *  단계 간격을 +10% 에서 +25% 로 벌려 한 단계 위·아래가 체감되게 (옛 300/330/360/390/420; C.75 1차 +20% 300/360/430/520/620 은 한 단계 위 일반 처치 시간이 권장의 0.77배라 0.70배가 되는 +25% 로) */
      tierTotals: [300, 375, 470, 585, 730],
      /** 노력치 단계 상한: 합계(index = 단계)와 능력치 하나의 상한(합계 상한 × 비율). 진화해도 유지되고 상한만 오른다 */
      evCapTotal: [24, 32, 70, 88, 110], // C.108 (GDD 52): 단계 종족값 합계의 약 15% (옛 8/16/24/32/40 = 3~5% 는 체감이 없었다) → C.115 (GDD 59, A안 10% 를 3회 조정): 1·2단계만 약 8%(45·56 → 24·32, 2단계 보스전 83% → 68%), 3단계부터 15% 유지. 10%(30·37)는 76%, 20·28 은 63% 지만 ★4 보스·탑 30층이 크게 흔들렸다 (dev-log C.115)
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
      attackGrowth: 0.8, // C.177 (GDD 105장 수정 5: 1 쪽으로 되돌림, 강공격 약 20%·막기 게이지): 0.5 → 0.8. C.174 2차(GDD 105장 막기·회복 버튼): 0.45 → 0.5. C.174 (101장 추가 결정 3: 강공격 약 45%·연속 강공격 합 같은 비율): 0.55 → 0.45 (0.55·공허 3% canyon 패배 49~52%, 0.7 은 탑 25층 35%). C.173 (GDD 101장 공허 경직·막기 짧아짐·폭주 회복 없음으로 ★2~ 원정 패배 3단계 canyon 20 → 56%): 적 공격 배율 1 → 0.55 (조정: 0.85 54% · 0.7 48% · 0.55 42%)
      /** 보상 배율 (GDD 32-1 5·11번, 재화별): 먹이 굴림·흡수 노력치 = 1 + (★−1) × rewardPerStar + 연속 × streak.foodPerClear,
       *  골드 = 1 + (★−1) × goldPerStar + min(연속 × streak.goldPerClear, streak.goldMaxBonus). 영옥은 배율 없음. 목표: ★5·10연속 골드 수입 ≤ ★1 의 2배 */
      rewardPerStar: 0.25,
      /** 기획 +15% → C.75 측정 ★5·10연속 골드 187 = ★1(새 몸) 86 의 2.18배 > 목표 2배 → +10% (조정 1회) */
      goldPerStar: 0.1,
      /** ★1 입문 보정 (C.76, GDD 32-3): 새 몸(특성 없음)이 ★1 에서 강적 소굴 2칸을 놓고 4바퀴 돌면 패배 37~46% 라(패배는 전부 강적) ★1 강적만 체력·공격을 이 배율로. ★2 부터는 1 */
      /** C.123: ★2 도 강적 입문 보정 ×0.9 — C.118(전투 절반) 뒤 2단계 몸 ★2 4바퀴 원정 패배 17~21%(전 10%, 패배는 강적)를 되돌림. 조정 3회: 0.9 → 8% · 공격만 0.85 → 14% · 0.93 → 3%(표본 잡음) → 0.9 확정
       *  C.127: ★1~2 길에서 혈·독·허 적이 빠져(GDD 75장) 2단계 몸 ★2 원정 패배 8 → 2% → ×0.95 6% · ×1 9% (조정 2회) → 1(★2 보정 사실상 끔). 탑 ★2 강적 층 상쇄도 1 */
      // C.177 (GDD 107장 원정 체력 이어 가기): ★1 0.78 → 0.7 · ★2 1 → 0.9 — 원정 패배는 대부분 강적, 이어 온 체력으로 타일 변수(전투 수 ↑) 패배 +10%p(가드 +5%p)·★2 권장 원정 패배 53%
      eliteEase: { 1: { hp: 0.7, attack: 0.7 }, 2: { hp: 0.9, attack: 0.9 } } as Record<number, { hp: number; attack: number }>,
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
      /** 구간별 층당 +% (C.94, GDD 41장 2번): 그 ★ 구간만 다른 값(없으면 perFloorInBand). ★2 구간(11~20층)은 2단계 몸이 ★2 적을 상대하는 구간이라 여유가 없다 —
       *  +4%: 15층 강적 45%(목표 약 70%) → +2%: 70% (조정 1회). 다른 구간은 +4% 그대로(25층 81%·35층 90%·45층 75%) */
      perFloorByBand: { 2: 0.02 } as Record<number, number>,
      /** 구간별 보스 층 배율 (C.94): 그 ★ 구간의 10의 배수 층 체력·공격에 더 곱한다(없으면 1). 20층 canyon-king(★4 설계 보스, 졸개 기믹)은 2단계 몸에 층 배율 ×1.0 으로도 20%
       *  (C.85·C.84 기록 미달 16~17%) → 스윕 ×0.75 41% · ×0.73 48% · ×0.72 54% · ×0.7 63%(다른 시드 세트) → balance:check 시드로 ×0.73 41% · ×0.72 42% (조정 3회, 목표 40~60%). 20층 최종 배율 = 1.18 × 0.72 ≈ ×0.85 */
      bossScaleByBand: { 2: 0.72, 3: 0.72 } as Record<number, number>, // C.176: ★3 0.65 → 0.72 (같은 속성 포식 후보가 다시 떠 봇 몸이 강해짐, 30층 forest-lord 90% → 65%). C.136: ★3 0.65 (막기·회복 속성 특성이 없어진 몸이 30층 forest-lord(연속 강공격) 0~2% → 0.55 89~95% · 0.7 19% · 0.65 43%)
      /** 기획 +20% → C.85 측정: 키운 5단계 몸 50층 승률 87%(목표 30~50%) → +60% 72% → +120% 15% → 조정 3회 +90% (지금은 sand-maw 임시 연결 기준) */
      finalFloorBonus: 0.9,
      /** 강적 층(5의 배수, 보스 층 제외)만 체력·공격에 더 곱한다 (C.85 추가): 체력 가득으로 시작해 권장 단계 진화 몸의 강적 승률이 84~100%(목표 약 70%) — 조정 2회 ×1.4 */
      eliteScale: 1.55, // C.177 (GDD 105장 수정: 강공격 20%·막기 0.5초로 탑 강적 층 98~100%): 1.4 → 1.55 (1.8 은 15층 30%)
      /** 구간별 강적 층 배율 (C.123): eliteScale 에 더 곱한다(없으면 1). 탑 강적은 원정의 ★2 강적 입문 보정(difficulty.eliteEase[2] 0.9)을 같이 받으므로 ★2 구간은 1 ÷ 0.9 로 상쇄 —
       *  안 하면 15층 강적 85 → 97~98%(가드 40~97%) */
      eliteScaleByBand: { 2: 1.2, 3: 1, 4: 1.08, 5: 0.9 } as Record<number, number>, // C.195 (GDD 121장 11 첫 강공격 = 막기 게이지 첫 가득 뒤): ★2 1.02 → 1.2 (15층 강적 100% → 79%, 1.12 는 93%). C.177: ★2 0.92 → 1.02 (원정 ★2 강적 입문 보정 eliteEase[2] 0.9 를 상쇄)·★3 0.9 → 1·★4 1.08 (25·35층 98%). C.174 (GDD 105장): ★3 0.9 추가 — 막기 버튼은 한 번에 칸 전부를 써서 연속 강공격 세 타 중 한 타만 막아 25층 강적 29~37%.  C.136 A안: 원정 강적 공격 ×1.42 를 탑 ★2·★5 강적 층에서 조금 덜어냄(15층 44 → 50%대·45층 29% → 40%대, 가드 40~97). C.127: ★2 강적 입문 보정이 1 이 되어 상쇄도 1
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
      // ── C.89 (GDD 39장): 속성 특성 8종 (4단계 = 1배). 세기(scale)는 main 값에만 곱한다 — 효과 종류는 abilities.json ──
      element: {
        normal: { blockPower: 0.06 },
        water: { critChance: 0.08 },
        fire: { ignoreDefense: 0.08 }, // C.97 (GDD 45장 3번): 화상 → '작열' 방어·정신력 8% 무시 (블록·평타)
        earth: { thornsReturn: 0.6, thornsThreshold: 0.2 },
        thunder: { doubleHitChance: 0.12 },
        blood: { bloodlustMax: 0.2, bloodlustFullAt: 0.3 },
        poison: { corrodePer: 0.02, corrodeEverySeconds: 10, corrodeMax: 0.1 },
        kyo: { chainHastePerChain: 0.15 },
      } as Record<string, Record<string, number>>,
      /** 전용 특성 5종 (39장 4번, 세기 배율 없음) */
      unique: {
        complete: {},
        limit: { desperateBelow: 0.5, desperateBonus: 0.25 },
        restraint: { rampPer: 0.05, rampEverySeconds: 10, rampMax: 0.3 },
        hunter: { eliteBonus: 0.2 },
        reborn: { lastStandHp: 0.3 },
      } as Record<string, Record<string, number>>,
      /** 세기: 단계별(4단계 1, 5단계 ×1.5), 융합 = 두 속성 각 60%, 특수·순수 = ×1.5 (39장 2·3번) */
      scale: { tier: { 4: 1, 5: 1.5 } as Record<number, number>, fusion: 0.5, boosted: 1.5 },
    },
    // ── C.103 (GDD 49장·49-1): 5단계 물리(조·권) 단일 속성 진화체의 물공 특수 블록(기본 공격 블록 3계열 전부) + 특성 1칸. 효과 종류·이름은 src/data/evolution/physBlocks.json, 수치는 여기(provisional) ──
    // C.105 (GDD 49-11): 물공 블록은 기본 블록 몫(44-3)에서 빠져 자기 타이머 하나(spawnSeconds)로 나오는 보장된 생성원. 발동형 수치는 49-2 '3판 표'로 되돌린 뒤 49-9 목표(흙 버티기·혈 속도)에 맞춰 조정
    physBlocks: {
      /** 물공 블록 생성원 타이머 간격(초): 흡수 칸처럼 타이머 하나, 바가 가득 차거나 봉인 중이면 멈춘다. 블록 가속 배율은 나눈다. 기본 블록 타이머는 막기·회복만 내고 그 몫은 그대로(간격을 공격 가중만큼 늘림) */
      spawnSeconds: 3.5, // C.118: 6 ÷ 1.7 (blockPool.basicSpawnSeconds 주석)
      /** 속성별 생성원 간격(초, 없는 속성은 spawnSeconds) — C.105b: 혈만 짧게(49-9 "혈은 속도") — 첫 블록 시점도 이 간격을 따른다 */
      spawnSecondsByElement: { blood: 1.8 } as Record<string, number>, // C.118: 3 ÷ 1.7
      /** 블록 피해 배율 (일반 기본 공격 블록 ×1 대비) — 표: 흙·혈·불·물 0.7, 뇌 0.6, 노멀 0.8 */
      power: { earth: 0.7, blood: 0.7, fire: 0.7, water: 0.7, thunder: 0.6, normal: 0.8 } as Record<string, number>,
      /** 평타형 대가 (GDD 84장 3번, C.142 provisional — 사용자 "블록 캐는 평타캐보다(블록 다 쓴다고 할 시), 좀 더 쎄고 클률 살짝 더 높게"): 물공 몸이 주는 피해(평타·블록) 배율. 속성별 값이 없으면 damage.
       *  블록 보정(combat.blockPlayDamage·blockPlayCrit = 치명 +4%p)은 물공 몸에 안 붙는다(C.136). 물리 분류 몸 자체가 빨라(물공 블록을 떼도 블록형보다 빠름) 보정만으로는 못 맞춰 물공 몸 피해를 깎는다 */
      damage: 0.76, // C.147: 0.78 → 0.76 (94장 B 로 블록형이 속성 보너스를 잃어 84장 3번 가드 ×0.98 — 블록형이 조금 빠르게)
      damageByElement: { fire: 0.65, earth: 0.85, blood: 0.85 } as Record<string, number>,
      /** 흙 블록 '바위 자세': 사용 후 seconds 동안 받는 피해 −takenReduction, 그동안 맞을 때마다 다음 평타 피해 +perHit(최대 +max, 평타 한 번에 다 씀) */
      stoneStance: { seconds: 12, takenReduction: 0.55, perHit: 0.1, max: 0.5 },
      /** 흙 특성 '굳은 주먹': 되갚기(39장)가 터지면 다음 평타 hits 회 피해 +bonus */
      hardFist: { hits: 3, bonus: 0.4 },
      /** 혈 블록 '피 튀기기': 사용 후 다음 평타 hits 회 피해 +bonus + 넉백(적이 seconds 동안 공격·행동 못 함) */
      knockback: { hits: 40, bonus: 1.5, seconds: 0.5 },
      /** 혈 특성 '피 냄새': 넉백 중인 적에게 평타 흡혈 ×drainMultiplier */
      bloodScent: { drainMultiplier: 2 },
      /** 불 특성 '불씨 모으기': 블록 바에 쌓인 불 공격 블록 1개당 평타 최종 피해 +per (최대 +max = 8개) */
      emberStack: { per: 0.35, max: 2.8 },
      /** 물 블록 '물결 가르기': 사용 후 seconds 동안 평타 간격 −haste */
      wave: { seconds: 9, haste: 0.4 },
      /** 물 특성 '물살': 평타가 연속으로 맞을 때마다 평타 피해 +per (최대 +max), 내가 맞으면 0 */
      current: { per: 0.03, max: 0.3 },
      /** 뇌 블록 '전광 발톱': 사용 후 다음 평타 hits 회는 두 번 때림(각 each) */
      flash: { hits: 4, each: 0.6 },
      /** 뇌 특성 '충전': 평타 every 회마다 블록 1개가 바로 생긴다 (기본 풀 추첨) */
      charge: { every: 10 },
      /** 노멀 특성 '단련': 블록(스킬 블록) 1개를 쓸 때마다 이번 전투 평타 피해 +per (최대 +max) */
      tempering: { per: 0.08, max: 0.8 },
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
        totalScale: { complete: 1.08, reborn: 1.05 } as Record<string, number>,
        /** 노멀 순수형 자기 속성 보정 */
        pureStab: 1.3,
      },
      /** 실패형 줄기 (GDD 49-8 1번, C.106, provisional): 실패형(label.kind fail)으로 간 뒤의 모든 단계.
       *  gainRatio = 진화 때 종족값 합계 오름분을 일반 단계 오름분(tierTotals 차이)의 이 비율로 (옛 totalScale.fail 0.8 대체),
       *  blockDamage = 블록 관련 피해(블록·체인·필살·저장·콤보·해방) 배율 */
      failLine: { gainRatio: 0.3, blockDamage: 0.5 },
      /** 점검 도구(analysis.ts, npm run balance)의 무작위 분포 샘플 */
      analysis: { samples: 6000, seed: 20261020 }, // C.136: 4000 → 6000 (막기·회복 속성 특성 삭제로 무작위 장착 표본이 바뀌어 드문 h4:fusion:fire+thunder 가 4000 표본에 안 뽑힘 — 점검 도구 표본 수)
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
      /** 컨디션 감소 하한 (GDD 42장 3번, provisional): 원정 한 번에 출발 컨디션에서 바퀴당 최대 이만큼만 깎인다(전투·폭주 합). 패배 급락(nest.defeatCondition)은 따로 */
      conditionLossPerLapMax: 25,
      /** 이어하기 배율 (GDD 121장 5, C.195 provisional): 바퀴 n 마다 보상(골드·노력치·먹이·장비 드롭률) × (1 + reward × (n − 1)), 적 체력·공격 × (1 + enemy × (n − 1)).
       *  옛 바퀴 강화(lapHpScale 0.12·lapAttackScale 0.08)를 이 식 하나로 합쳤다(이중 적용 없음) */
      continueScale: { reward: 0.25, enemy: 0.12 },
      /** 5바퀴째부터 공허 생성률 가산 (GDD 2-1 "공허 타일 생성률 ↑"): (바퀴-4)당 */
      lateLapStart: 5,
      lateLapRiskBonusPerLap: 0.04,
      /** 컨디션 0 일 때 공허 생성률 가산(컨디션 비율만큼 선형 감소). 기존 생성률에 더한다 (GDD 3-2) */
      conditionRiskBonusMax: 0.15,
      /** 강적 소굴·조합으로 나온 강적을 이기면 추가 타일 1장 (바퀴 합계는 tilesPerLap.max 까지) */
      eliteBonusTiles: 1,
      /** 원정 체력 이어 가기 (GDD 107장·119장 1): 이기면 최대 체력 × winHeal(10%), 휴식 칸(웅덩이) = × restHeal(35%) (휴식 회복 배율·샘은 컨디션 배율을 따른다) — 회복값은 기획값 고정.
       *  enemyAttackMult = 원정 적 공격 배율(★별, 없으면 default — provisional, C.193): 회복값을 C.177 의 +35%·+50% 에서 기획값으로 되돌린 만큼 원정 안 적 공격만 낮춘다(원정 안 보스는 C.195 부터 제외, 탑·등급전·연습·첫 원정 튜토리얼은 그대로).
       *  ★1 은 새 몸(타일 0장 = 웅덩이 없음, 4바퀴 빈 길 전투만)이 승리 회복 10% 로만 버텨야 해 더 낮다. 조정: 일률 0.6 → 새 몸 ★1 패배 52%·권장 ★2~5 31·44·34·16% / ★1 0.4·그 밖 0.55 → 0%·28·39·21·11%(타일 변수 패배 +8.6%p > 8%p) / 그 밖 0.5(권장 ★2~5 18·30·17·8%, 타일 변수 그대로 — ★1 봇 기준) / ★1 0.45 → 타일 변수 +14.1%p / ★1 0.35 → +4.2%p·새 몸 ★1 0% / 보스 자유 원정 +8.3%p > 8%p → 원정 안 보스에도 같은 배율(+0.8%p) */
      hpCarry: { winHeal: 0.1, restHeal: 0.35, enemyAttackMult: { default: 0.5, 1: 0.425, 4: 0.55, 5: 0.65 } as Record<string, number>, hitPacing: { 1: 4 } as Record<string, number> }, // C.198 (GDD 123장 1): ★1 0.35 → 0.425 + 기본 공격 묶음 hitPacing ×4(간격 1.5 → 6초·한 대 약 0.8 → 3, 초당 피해 같음) — 1단계 새 몸 ★1 끝까지 4바퀴 패배 19% → 40%(약 60% 버팀) // C.195 (GDD 121장 8): ★4 0.5 → 0.55·★5 0.5 → 0.65 — 사냥 힐 바퀴별 축소·이어하기 적 +12%/바퀴에서 '한 단계 아래 ★ 강적 승률 ≤ 권장 − 10%p' 가드(3단계 ★4 84%·4단계 ★5 90% 로 걸림)
      /** 사냥 힐 (GDD 121장 6, C.195 provisional — 119장 1 의 승리 10% 고정을 대체): 승리 회복 = 바퀴 n 의 값(index n − 1), 표 끝을 넘으면 마지막 값(0) */
      winHealByLap: [0.1, 0.06, 0.03, 0],
      /** 영구 타일 (GDD 121장 4 ①, C.195 provisional): 원정을 귀환으로 끝낼 때(마친 바퀴 1 이상) chance + perExtraLap × (마친 바퀴 − 1) 확률(상한 max)로 1장 — 원정 2~3번에 1장 꼴.
       *  바퀴 중 얻는 타일(승리·강적·흡수·바퀴 완주·드래프트)은 임시 타일(이번 원정만, 가방에 안 들어감) */
      permTile: { chance: 0.4, perExtraLap: 0.04, max: 0.6 },
      /** 휴식 타일: 허기 감소, 컨디션 회복, 시간 소모(칸 수 환산) */
      restHunger: 25,
      restCondition: 20,
      restTimeTiles: 2,
      /** 원정에 가져가는 덱 크기와 새 세이브의 타일 보유량. C.120 (GDD 64장 v5.141): 새 세이브는 0장 — 첫 진화 때 starterTiles 3장, 그 뒤는 상점 타일 뽑기 */
      deckSize: 8,
      startingCollection: {} as Record<string, number>,
      /** 첫 진화(1→2단계) 때 주는 타일 (GDD 64장 1번, 덱에 자동): 먹잇감 둥지 A · 강적 소굴 A · 휴식 */
      starterTiles: ['prey-nest-a', 'elite-den-a', 'rest-a'] as string[],
      /** 점검 도구(scripts/balance.ts)·고정 덱 시험이 쓰는 기준 보유량 = C.119 까지의 시작 21장. 게임 세이브에는 쓰지 않는다 */
      referenceCollection: {
        'prey-nest-a': 4, 'prey-nest-b': 3, 'elite-den-a': 2, 'elite-den-b': 2,
        'env-fog': 2, 'env-wasteland': 2, 'env-barrier': 2, 'env-ruin': 2, 'rest-a': 2,
      } as Record<string, number>,
    },
    /** 상점 타일 뽑기 (GDD 64장 2번, C.120 — 사용자 "숫자 관련은 너가 맞추고", provisional). 1회 = 타일 1장 → 보관함(중복 = 장수 +1).
     *  묶음 확률(%): 기본 3종(둥지 A·소굴 A·휴식) · 환경(그 종족 스킨이 있는 것) · B형 2종(둥지 B·소굴 B). 그 종족이 못 쓰는 묶음은 빼고 나머지 비율로. 첫 뽑기는 firstGroup 확정 */
    tileDraw: {
      price: 300, // C.120 측정: 4바퀴 원정 전투 골드 2단계 133·3단계 136·4단계 155·5단계 166 → 뽑기 1회 = 원정 2.3·2.2·1.9·1.8회 (먹이 넘침 골드 빼고, dev-log C.120). 마스터 추천 '약 30' 은 원정 0.2회분이라 목표(2~3회)에 못 맞춤
      // C.124 (GDD 65장): 영혼 샘 묶음 spring 6 · 드문 묶음 rare(포식자 둥지·메아리) 8 을 더하고 나머지를 줄임. 뼈 표식/수련 말뚝은 환경 묶음에 들어간다
      weights: { basic: 44, env: 30, b: 12, spring: 6, rare: 8 } as Record<string, number>,
      groups: { basic: ['prey-nest-a', 'elite-den-a', 'rest-a'], b: ['prey-nest-b', 'elite-den-b'], spring: ['rest-spring'], rare: ['hunter-den', 'echo'] } as Record<string, string[]>,
      firstGroup: 'env',
    },
    /** 첫 원정 튜토리얼 (GDD 67장, C.120, provisional): 고정 길 cell 번 칸에서 약한 적 1마리(체력·공격 배율), 첫 흡수 대신 모든 능력치 노력치 +statEv (1단계 상한 합 24·능력치당 12 안) */
    tutorialRun: { cell: 3, enemyHpMult: 0.6, enemyAttackMult: 0.5, statEv: 3 },
    /** 첫 원정 첫 전투 각본 (GDD 123장 5, C.199, provisional): 자동 공격 autoHits 대 → 강공격(막기) → autoHits2 대 → 못 막는 강공격(체력 leaveHpFraction 남김) → hurtHoldSeconds 동안 맞은 모습을 보여 준 뒤 설명 → 블록 1개 → afterSkillSeconds(누름·공격·적 피해 흐름) 뒤 같은 블록 chainLength 개(spawnGapSeconds 간격) → 쌓인 모습 stackHoldSeconds 뒤 → 체인으로 처치 → killSlowSeconds 슬로우·적 사라짐 뒤 흡수 화면(GDD 129장 3). 강공격 예고 castSeconds 초 */
    tutorialScript: { autoHits: 3, autoHits2: 2, castSeconds: 1.5, leaveHpFraction: 0.12, afterSkillSeconds: 2, spawnGapSeconds: 0.35, chainLength: 3, hurtHoldSeconds: 1, stackHoldSeconds: 1, killSlowSeconds: 1.6 },
    /** 튜토리얼 원정 뒤 회복 안내 (GDD 123장 5 수정 v5.280, C.199, provisional): 빈사로 복귀 → 치료제 → 체력 포션은 potionTo 까지 → 온천에서 spaTo 까지(그만큼 온천 시간을 바로 흘림, 배부름 줄어듦) → 먹이 food 1개 = 배부름·체력 가득 */
    tutorialRecover: { potionTo: 0.5, spaTo: 0.8, food: 'basic' as const },
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
      /** 뼈 표식 / 수련 말뚝 (C.124, GDD 65장): 이 칸 전투에 이기면 노력치 +ev — 능력치는 그 적의 노력치(ev, 52장 스탯 가중치)가 가장 큰 것 하나, 단계 상한 안(넘으면 0). 상위 타일은 × envMult 반올림 */
      training: { ev: 1 },
      /** 포식자 둥지 / 사냥꾼 출몰지 (C.124, GDD 65장): 강적 풀의 적 × 체력·공격 배율. 강적이라 바퀴 상한(maxElitesPerLap)을 같이 쓴다(넘치면 일반 적 = 사냥꾼 아님). 이기면 흡수 후보 수 × absorbCandidateMult.
       *  기획서 '약 ×1.3' → 체력 1.3·공격 1.15: 둘 다 1.3 이면 덱에 한 장 넣은 봇의 4바퀴 원정 패배가 호로 7.3→18.3%·사신 3.0→15.7%, 공격 1.15 면 14.3%·12.3% (dev-log C.124) */
      hunter: { hpMult: 1.3, attackMult: 1.15, absorbCandidateMult: 2 },
      /** 영혼 샘 / 정화의 샘 (C.124, GDD 65장): 휴식(rest-a) 대비 배율 — 배부름·컨디션 회복 0, 리스크 감소 ×2. 간식 +1 은 휴식과 같다 */
      spring: { hungerMult: 0, conditionMult: 0, riskReliefMult: 2 },
    },
    /** 원정 전투 승리 골드 (GDD 25-5 의 골드 보상 배율이 기대는 바탕값, C.57 정한 것 — 23-4 얻는 곳 중 '원정' 자리). 강적 = 소굴·조합으로 나온 강적 */
    gold: { normal: 6, elite: 20 },
    /** 보스전 (GDD 25-3·25-7, S-14 C.58): 보스 데이터(src/data/bosses)의 페이즈·기믹은 종류만 고르고 수치는 여기. 시간 제한(초)·기믹 seal(간격·봉인 시간·칸 수)·
     *  보상(골드·희귀 먹이·첫 처치 영옥). 보스 체력·공격은 보스 데이터의 hpInAttacks·attackInAttacks (CLAUDE.md 규칙 3) */
    boss: {
      timeLimitSeconds: 180,
      seal: { everySeconds: 10, seconds: 4, cells: 1 },
      /** 기믹 summon (GDD 35장, C.84): everySeconds 마다 졸개 1마리(한 번에 1마리). 졸개 체력 = 기본 공격 hpInAttacks 회분(내 피해를 먼저 받는 방패), attackSeconds 마다 기본 공격 attackInAttacks 회분 */
      summon: { everySeconds: 20, hpInAttacks: 6, attackSeconds: 3, attackInAttacks: 0.1 },
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
      /** 장 첫 완료에 더 주는 영옥 (GDD 35장, C.84): 3장 = 25-4 "마지막 장에 스킨" 자리 — 그림이 오면 스킨으로 바꾼다 */
      chapterBonusJade: { ch3: 10 } as Record<string, number>,
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
        'void-night': { voidMult: 2, rewardMult: 1.25, specialEnemyChance: 0.5 }, // specialEnemyChance: GDD 75장 특수 속성(혈·독·허) 적 출현 가중치 배율 (C.127, provisional — 옛 49-7 ① specialTraitChance)
        famine: { hungerMult: 2, foodMult: 1.8 }, // C.125: 2 → 1.8 — 흡수 화면이 늘 열려 원정 난수 흐름이 바뀌며 타일 변수 먹이 가드(+25%)가 +25.5% 로 넘어 (전·후 모두 다른 시드 구간에선 26% 안팎의 경계값) 되돌림 → +24.8%
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
      /** 시간 흐름 허기 (GDD 24-1 → 102-1, provisional): 시간당 상승(켜 있든 꺼 있든), 복귀 말풍선을 띄우는 최소 상승량.
       *  원정 중간 저장이 있으면 멈춘다. C.175: 한 번 비운 사이 +60 상한(idleHungerMaxGain) 삭제 — 약 13시간이면 배부름 0 */
      /*  C.181 (GDD 109장 6): 7.5 → 5 — 먹이가 약 0.09배(고기 +3·사냥감 +5)라 한 번 와서 3개(+9~15) = 약 1.8~3시간, 하루 약 −120.
       *  100 → 쇠약(20 이하) 16시간, 밤 8시간 비우면 −40 이라 배부름 61 이상이면 아침에 쇠약 없음(7.5 면 −60 → 81 이상 필요) */
      idleHungerPerHour: 5,
      idleHungerNotice: 5,
      /** 돌봄 패널티 (GDD 102장, C.175 마스터 결정 provisional). 배부름 = 100 − 허기.
       *  conditionPerHour: 배부름 conditionBelowFullness 이하일 때만 컨디션 시간당 감소, 배부름 0 이면 ×2 (켜 있든 꺼 있든).
       *  stabilityPerHour: 꺼 둔 동안만 영압 안정도 시간당 감소, 배부름 또는 컨디션이 doubleBelow 이하면 ×2.
       *  weakFullness / tiredCondition: 그 값 이하가 되는 순간 쇠약 / 피곤 — 수치를 넘긴 뒤 원정을 한 번 끝내거나 약으로만 풀린다.
       *  weakMaxHpCut: 쇠약 원정 전투 최대 체력 −20% (대기 보상 ×idle.weakenedRate). tiredSpawnSlow: 피곤 블록 생성 간격 +15%.
       *  collapseHours: 이만큼 미접속이면 빈사(옛 쓰러짐). 빈사가 된 순간부터 실제 시간 dyingBaseHours + 교감 × dyingHoursPerBond(교감 100 = 24시간) 안에 치료제를 안 먹이면 사망 (GDD 102장 수정 v5.228).
       *  dying: 빈사 모험 — 최대 체력 × hpFraction(그 위로 회복 안 됨), 공격 속도·블록 생성 속도 × speedMult, 보상(골드·먹이·노력치) × rewardMult, 빈사에서 지면 사망.
       *  reviveEvLoss: 부활 노력치 손실 비율 — 교감 문턱별(높은 것부터) 줄어듦 */
      care: {
        conditionBelowFullness: 30,
        conditionPerHour: 4,
        stabilityPerHour: 2,
        stabilityDoubleBelow: 30,
        weakFullness: 20,
        tiredCondition: 30,
        weakMaxHpCut: 0.2,
        tiredSpawnSlow: 0.15,
        collapseHours: 48,
        dyingBaseHours: 6,
        dyingHoursPerBond: 0.18,
        dying: { hpFraction: 0.1, speedMult: 0.5, rewardMult: 0.5 },
        reviveEvLoss: [[80, 0.3], [50, 0.4], [0, 0.5]] as [number, number][],
      },
      /** 교감 (GDD 102-6, C.175 마스터 추천안 provisional): 0~max, 새로 시작 0. 약으로는 안 오른다.
       *  gain: 먹이 / 재우기·쓰다듬기(돌봄 요청에 응답했을 때만), 하루(기기 0시 기준) 최대 dailyMax. 꺼 둔 동안 decayHours 마다 −1,
       *  쓰러지면 −collapseLoss, 사망·부활이면 절반. 대기 보상 +교감 × idleBonusPerPoint (최대 idleBonusMax). 방 대사 단계 문턱 stages(친함·단짝) */
      bond: {
        max: 100,
        gain: { feed: 1, sleep: 1, pet: 2 },
        dailyMax: 6,
        decayHours: 12,
        collapseLoss: 5,
        idleBonusPerPoint: 0.002,
        idleBonusMax: 0.2,
        stages: [30, 70] as [number, number],
      },
      /** 약 3종 값 (GDD 102-4, provisional): 보통 먹이(shop.goldPrices food-basic 35) 기준 치료제 약 6배, 링거·에너지 드링크 약 3배 */
      medicinePrices: { 'med-cure': 210, 'med-iv': 105, 'med-energy': 105 } as Record<string, number>,
      feedHunger: 3,
      /** 먹이 5종 (GDD 18-2, 임시 provisional): 허기 감소·컨디션 변화. basic 은 예전 단일 먹이(feedHunger)와 같다.
       *  C.181 (GDD 109장 6, 사용자 "고기 3, 사냥감 5"): 고기(basic) 35 → 3·사냥감(hearty) 55 → 5, 나머지도 같은 비율(약 ×0.09, 반올림·최소 1). 컨디션 변화는 그대로 */
      foods: {
        snack: { hunger: 1, condition: 4 },
        basic: { hunger: 3, condition: 0 },
        hearty: { hunger: 5, condition: 0 },
        tonic: { hunger: 2, condition: 10 },
        feast: { hunger: 7, condition: -5 },
      },
      /** 한 번에 많이 먹이면 뱉는다 (GDD 109장 6, provisional): 마지막으로 먹인 뒤 windowMinutes 안에 max 개까지. 그다음은 뱉음(먹이는 없어지고 효과·교감 없음).
       *  마지막으로 먹인 뒤 windowMinutes 가 지나면 다시 max 개. 약은 세지 않는다 */
      feedLimit: { max: 3, windowMinutes: 10 },
      /** 홈 체력 회복 (GDD 123장 4, C.198 마스터 결정 provisional). 체력은 최대 체력 대비 비율.
       *  idlePerMinute: 방(원정 밖)에 있는 동안 1분에 +2% — 앱을 꺼도 시간 따라, 빈사 중엔 없음.
       *  spa: 온천에 있는 동안 1분에 체력 +hpPerMinute·배부름 −fullnessPerMinute (대기 회복 대신), 체력 상한 또는 배부름 0 이면 저절로 방으로.
       *  foodHeal: 먹이마다 체력 회복(든든할수록 조금 더). 체력 포션(상인 w-hp-potion) = 가득. 빈사 중엔 모두 care.dying.hpFraction 상한 */
      homeHp: {
        idlePerMinute: 0.02,
        spa: { hpPerMinute: 0.1, fullnessPerMinute: 10 },
        foodHeal: { snack: 0.02, basic: 0.03, hearty: 0.05, tonic: 0.04, feast: 0.08 } as Record<string, number>,
      },
      sleepCondition: 30,
      petCondition: 8,
      /** 돌봄 요청제 (GDD 82장, C.133 provisional): 쓰다듬기·재우기는 캐릭터가 청했을 때만 효과. 요청 간격(분, 실제 시간 무작위 범위)·유지 시간(분)·첫 요청까지(분, 새 시작)·
       *  재우기를 청할 확률(쇠약이거나 컨디션이 sleepBelowCondition 미만이면 늘 재우기 — 방 기분 '피곤' 기준 40 과 같음) */
      careRequest: { intervalMinutes: [20, 40], holdMinutes: 10, firstDelayMinutes: 3, sleepWeight: 0.4, sleepBelowCondition: 40 },
      /** 패배(C.175 부터 쓰러짐, GDD 102-3) 후 컨디션과 허기 가산 */
      defeatCondition: 15,
      defeatHunger: 10,
    },
    // ── 블록 풀 (GDD 44장 → 44-1 B안 → 44-2 재조정 C.98, provisional): 흡수 특성 블록은 특성마다 타이머(combat.blockSpawnSeconds), 기본 블록 5종은 별도 타이머 하나에서 가중 추첨 ──
    // 기본 블록 몫(초당 생성 기대치 비율) = basicShareBySlots[장착 칸]: 0칸 100% · 1칸 45% · 2칸 25% · 3칸 15% (GDD 80장 v5.166, C.133 — 옛 44-2 표 60·45·35% × 0.75^칸)
    blockPool: {
      /** 기본 블록 타이머 간격(초, 흡수 0칸). 블록 가속 배율은 나눈다. 바가 가득 차거나 봉인 중이면 멈춘다 (C.98 2.8 → 3.2: 빈 몸 강적 88% 를 낮춰 2칸 빌드와 차를 줄임) */
      /*  C.118 (GDD 62장): 전투가 절반으로 짧아져 블록 타이머를 모두 ÷1.7 (3.2 → 1.9, 흡수 6.5 → 3.8, 물공 6 → 3.5·혈 3 → 1.8) — 체력만 반으로 줄이면 짧은 판에 블록·체인이 적어 강적 승률이 60~70% → 15~30% 로 무너진다 (dev-log 표) */
      basicSpawnSeconds: 3.24, // C.136: 2.7 → 3.24 (막기·회복이 고정 몫 16.6% 로 기본 공격 위에 따로 붙어(84장 7번) 빈 몸 블록 총량을 0.37/초 그대로 — 2.7 ÷ (1 − 0.166)). C.134: 2.1 → 2.7 (흡수 타이머 4.0 → 4.7 로 1칸 몸 총량이 0.39/초가 되어 C.97 을 지키려고 빈 몸은 0.37/초로). C.133: 1.9 → 2.1 (GDD 80장 v5.166 로 1칸 몸 블록 총량이 0.45/초가 되어 빈 몸 0.53/초보다 적어 "특성을 끼우면 일반 적을 더 빨리 잡는다"(C.97, humanbot 시험)가 깨짐 → 빈 몸만 0.48/초로)
      /** 장착 칸 수별 기본 블록 몫 (GDD 80장 v5.166, 사용자 "슬롯 하나 채울 때 마다 … 25%씩 줄여. 총 60%겠지?", C.133): 옛 몫 60·45·35% × 0.75^칸 = 45·25·15%.
       *  C.132 의 0.75^칸(75·56·42%)은 옛 몫보다 올라 "줄여"와 반대였다. 칸이 표보다 많으면 마지막 값. 기본 타이머 간격 = 흡수 블록 총 간격 × (1 − 몫) / 몫 (C.98 공식 그대로)
       *  나중에 추가할 거리(80장): 남은 기본 몫을 아이템·육성으로 더 줄이기 */
      basicShareBySlots: [1, 0.45, 0.25, 0.15],
      /** 장착 흡수 칸이 2칸부터 1칸 늘 때마다 흡수 특성 타이머 간격 +비율: 간격 = combat.blockSpawnSeconds × (1 + 이 값 × (칸 − 1)). 칸이 많은 몸의 블록 총량을 누르는 지렛대 (C.98: 0.4 는 2~4칸 몸의 블록을 반으로 줄여 탑 30층 보스 2%·★1 원정 패배 20% 로 무너짐 → 0.1) */
      absorbedSlowdownPerSlot: 0.12, // C.174 (GDD 105장): 0.1 → 0.12 (막기 블록 몫이 공격 블록으로 돌아와 다른 계열 2칸 강적 86~88%).  C.136: 0 → 0.1 (막기·회복 속성 특성이 없어져 칸이 모두 공격 특성이 된 2칸 몸이 강해짐 — 2칸부터 흡수 몫 조금 느리게). C.132: 0.1 → 0 → C.133: 0 그대로 (기본 몫이 45·25·15% 로 줄어 흡수 블록 몫이 커짐 — blockSpawnSeconds 4.0 으로만 조정, dev-log C.133 표)
      /** 기본 블록 가중: 공격은 종족 계열 표의 계열 각각(3종), 막기 1, 회복 1 (합 36) */
      /*  C.118 (GDD 66장 3번): 막기·회복 7 → 3 — 방어+회복 몫 14/44 = 32% → 6/36 = 17%(약 절반), 그만큼 공격 쪽으로 */
      basicWeights: { attack: 10, guard: 3, heal: 3 },
      /** 막기·회복을 블록에서 뺀 몫 (GDD 105장 2번, C.174 provisional): 옛 출현표의 막기·회복 고정 몫(C.136 막기 0.08 + 회복 0.06)을 공격 블록에 돌려준다 — 공격 블록 생성 속도 × 1 / (1 − 이 값).
       *  옛 roleShare(C.173 막기 0.45)는 폐기 */
      freedRoleShare: 0.07, // 0.14(옛 몫 그대로)면 다른 계열 2칸 강적 88%·같은 계열 2칸과 차 30%p
      /** 막기·회복 기본 블록 세기 = 같은 역할 흡수 특성 블록 기본값(basicRoleBlocks) × 이 비율 (피해·막기 지속·회복량 모두) */
      basicGuardRatio: 0.7,
      basicHealRatio: 0.7,
      /** 막기·회복 블록 기본값 (옛 traits.json 의 *-guard·*-heal 값. C.136 GDD 84장 7번: 속성 막기·회복 특성은 삭제 — 막기·회복은 이 기본 블록뿐, 세기는 absorb.enhance 로) */
      basicRoleBlocks: {
        guard: { powerInAttacks: 1.5, chainBonus: { kind: 'reflect', value: 1 } },
        heal: { powerInAttacks: 1, chainBonus: { kind: 'cleanse', value: 40 } }, // cleanse value = 저장 게이지 (C.118: 옛 SP +40 → 저장 게이지 +40, 100 = 충전 1개라 비율 같음)
      },
      /** 성향 특성(GDD 39장 ①) 보정: 기본 블록 가중 배율 (attack = 기본 공격 3종), absorbedSpawn = 흡수 특성 타이머 속도 배율(속도 성향 — 44장 '흡수 몫 +10%p' 의 B안 판). 종족 무관 엔진 수치 */
      temperament: {
        atk: { attack: 1.4 },
        int: { attack: 1.4 },
        def: { guard: 1.8 },
        hp: { heal: 1.8 },
        spr: { guard: 1.4, heal: 1.4 },
        spd: { absorbedSpawn: 1.1 },
      } as Record<string, { attack?: number; guard?: number; heal?: number; absorbedSpawn?: number }>,
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
      /** 전투 시간 배율 (GDD 62장, C.118 — 사용자 "한 전투 시간 자체를 반정도로 줄이고 속도는 고정"): 적·내·졸개 최대 체력에 곱한다. 0.5 = 처치 시간 약 절반.
       *  내 공격·적 공격·지속 피해·회복(최대 체력 비율)·보호막(최대 체력 비율)이 모두 체력 대비 2배가 되는 것과 같아 승률 구조는 유지된다. 화면 틱 속도(1배)는 그대로 */
      hpScale: 0.5,
      /** 내 최대 체력 배율 (C.118): 적과 같은 0.5 로 하면 강공격 한 방이 체력 대비 2배가 되어(피해 기대치는 같아도 한 방 변동이 커져) 강적·원정 패배가 2~4배로 뛴다(dev-log 표 A·B).
       *  0.7 이면 권장 ★ 강적 승률·원정 패배가 C.115 와 ±5%p(3단계 패배 +7%p), 새 몸 ★1 패배 11%, 보스전 ★2 76%(목표 50~70 보다 +6, D 0.6 은 48%·★1 패배 24% 로 가드 실패) */
      playerHpScale: 0.7,
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
      /** 흡수 skill 특성 하나당 블록 생성 간격(초, 특성마다 타이머 — GDD 44-1 B안, 2칸부터 blockPool.absorbedSlowdownPerSlot 만큼 늘어남). 기본 블록은 blockPool 의 별도 타이머. 바가 가득 차거나 봉인 중이면 멈춘다 (C.98 4 → 6.5: 기본 블록이 같이 나오게) */
      blockSpawnSeconds: 4.6, // C.134: 4.0 → 4.6 (GDD 83장 해방이 해방 슬롯 특성 블록을 몰아서 주므로 평소 흡수 블록을 조금 덜 — 1칸 몸 강적 가드 ≤85%, familySpawnSlowdown 과 같이). C.118: 6.5 ÷ 1.7 = 3.8 → C.132: 5.4 → C.133: 4.0 (GDD 80장 v5.166 기본 몫 45·25·15% — 흡수 블록이 몫의 대부분이 되고 기본 블록보다 세서, 총량(초당)은 C.132 보다 적게: 1칸 0.45 · 2칸 0.67 · 3칸 0.88. 조정 4회(3회 + balance:check 관문): 2.4·칸당 0.27 → 1칸 강적 98% · 3.2·0.12 → 93% · 3.8·0.03 → 87% · 4.0·0)
      /** 같은 계열 공격 특성이 슬롯에 둘 이상이면 서로 체인이 쉬워지므로(GDD 17-3), 그 계열 블록의 생성 간격을 (같은 계열 특성 수 − 1)당 이 비율만큼 늘린다 (C.34). 계열이 하나뿐이면 영향 없음 */
      familySpawnSlowdown: 0.15, // C.174 (GDD 105장): 0.5 → 0.15 (다른 계열 2칸과 같은 계열 2칸 강적 승률 차가 26~30%p 라 가드 60~85 안에 둘 다 못 들어감).  C.136 A안: 0.7 → 0.5 (강적 공격 ×1.42 로 같은 계열 2칸 강적이 65% 근처 — 가드 하한 60 여유). C.136: 0.2 → 0.7 (GDD 84장 6번 확률표: 같은 블록이 연달아 나와 같은 계열 2칸 몸 강적이 77 → 94% — 이 몫을 줄임). C.134: 1 → 0.2 (저장 필살기가 빠지고 해방 슬롯 1칸이 한 특성만 내서 같은 계열 2칸 몸 강적이 48% 로 — 가드 60~85%)
      /** 체인 배율: 체인1 ×1.0, 체인2 ×2.2, 체인3 ×3.6 (GDD 3-5) */
      chainMultipliers: [1, 2.2, 3.6],
      /** 특성별 추가 효과가 붙는 최소 체인 (GDD 3-5 "체인3 … + 추가 효과") */
      chainBonusFromChain: 3,
      // SP 게이지·필살 블록(spPerBlock·spMax·specialPowerInAttacks)은 C.118 에 삭제 (GDD 66장: 필살기는 저장형 필살기만)
      /** 기본 공격 블록 (GDD 44장: 기본 블록 5종 중 공격 3종 — 종족 계열 표의 계열마다 하나): 기본 공격 N회 분량 */
      basicBlockPowerInAttacks: 3,
      basicBlockChainBonus: { kind: 'stagger', value: 1.5 },
      /** 막기 (GDD 105장 수정 v5.233, C.177 provisional — 옛 체인별 지속·경감·충전 3칸 대체): 게이지가 guardGaugeSeconds 에 걸쳐 0 → 100% (성향 def·강화 = 속도),
       *  다 차야 누르고, 누르면 guardSeconds 동안 강공격 완전 막기(일반 공격 경감 없음, 막기 동안 공격 멈춤) */
      guardGaugeSeconds: 8, // C.177: 105장 추천 약 6초 → 8 (강공격 간격 8~11초 + 예고 2초 — 6·14초 모두 강적 승률 차이 1~2%p 라 추천에 가깝게)
      guardSeconds: 0.5,
      /** 전투 [장비] 발동 (GDD 105장 수정 4): 쿨다운(초), 전투 시작 때 쿨다운 × gearStartCooldown */
      gearCooldownSeconds: 20,
      gearStartCooldown: 0.5,
      /** 강공격 배율 (101장 추가 결정 5번): 적 데이터 heavyInAttacks(기본 공격 N회 분량) × 이 값. 3 = heavy-seal(1.6회분) 한 방이 권장 단계 몸 최대 체력의 약 45% (C.173 측정: ×1 에서 약 15%, 5.7 이면 약 85%) */
      heavyHitMultiplier: 1.33, // C.177 (GDD 105장 수정 5: 권장 단계 최대 체력 약 20%): 3 → 1.33 (×1 ≈ 15%). C.174 (101장 추가 결정 3: 약 45%, 밸런스 봇은 막기 블록 있으면 강공격 다 막음). C.173 A안(마스터 ×3 약 45%) → 탑·사냥터 가드로 2.5(약 37%)
      /** 연속 강공격(heavy-chain) 한 타 배율: 예고 한 번 = 강공격 한 방이라 여러 타의 합이 heavy-seal 한 방과 비슷하게 (× 1.6 ÷ (0.7 × 3) ≈ × 0.755) */
      heavyChainHitMultiplier: 1, // C.177: 1.33 × 0.755 ≈ 1 (세 타 합 = 한 방 약 20%). C.174: 3 × 0.755 ≈ 2.25. C.173: 2.5 × 0.755 ≈ 1.9 → 1.4
      /** 블록 플레이 보정 (GDD 84장 3번, C.136 provisional — 사용자 "블록 캐는 평타캐보다(블록 다 쓴다고 할 시), 좀 더 쎄고 클률 살짝 더 높게"): 블록 공격 피해 배율·치명 확률 가산
       *  C.136 A안(마스터): ×1.1·+3%p → ×1.15·+4%p (상한). 올린 만큼 강적 attackInAttacks ×1.42 로 상쇄 (dev-log C.136) */
      blockPlayDamage: 1.2, // C.174 (GDD 105장): 1.15 → 1.2 (막기 블록 피해가 없어져 불 블록형 일반 처치가 평타형(물공)보다 빠르지 않음 ×1.01 — 84장 3번 가드)
      blockPlayCrit: 0.04,
      /** 공허 블록 (GDD 101장, C.173 provisional): 따로 도는 공허 타이머 없음 — 블록이 하나 생길 때마다(기본·특성 블록 모두) 그 자리가 이 확률로 공허 블록으로 바뀐다.
       *  확률 = voidChance(기본 몫) + 컨디션·환경·5바퀴 이후·한계 돌파 가산(voidChanceBonus), 상한 voidChanceMax. 사용 피해 = 기본 공격 N회 분량,
       *  히든 진화체(진화체 데이터 hidden) 몸이면 voidPowerHiddenInAttacks */
      voidChance: 0.02, // C.174: 3% → 2% (강공격 45%·연속 ×2.25 에서 canyon·탑 25층 가드; 공허 0% 면 canyon 31%로 가장 큰 몫). C.173: 옛 0.15/3초 별도 시계 → 출현표 안 몫 (101장 1번 기본 10% → balance 가드로 3%: 끝 광기·강적 승률·canyon 패배)
      voidChanceMax: 0.5, // C.173: 0.8 → 0.5 (101장 1번 상한)
      voidPowerInAttacks: 1, // C.173: 8 → 1 (101장 2번, 진짜 패널티)
      voidPowerHiddenInAttacks: 8, // C.173: 히든 진화체는 옛 값 그대로 (101장 3번)
      /** 공허 블록 경직 (101장 추가 결정 2번): 쓰면 이 시간(초) 동안 기본 공격·블록 생성 멈춤(막기 상태와 같은 멈춤). 히든 진화체는 0 */
      voidStunSeconds: 2,
      /** 치명타 (C.63, GDD 28장 5번, 마스터 추천 provisional): 물리·마법 합친 하나. 내 기본 확률 5%, 치명 피해 ×1.5,
       *  기본 공격·스킬 블록·체인·필살·콤보·해방·저장형 필살 모두 대상(공허 블록·반사·독 지속 피해 제외). 적도 같은 규칙(기본 확률 3%).
       *  특성 critChance 가 확률을 더하고(합), 상한 critChanceMax */
      critChance: 0.05,
      critMultiplier: 1.5,
      enemyCritChance: 0.03,
      critChanceMax: 0.5,
    },
    /** 떠돌이 상인 (GDD 85장 5번, C.140 provisional — 사용자 "1바퀴 돌 떄마다 떠돌이 상인 뜰 확률 가중 … 한 3~50바퀴 돌아야 뜨게", 수치는 코드 판단).
     *  원정 바퀴를 마칠 때마다 '지난 방문 뒤 바퀴 수 k' 가 1 오르고 그 바퀴에 올 확률 = min(1, perLap × k) (선형 가중 — 앞 바퀴는 거의 0).
     *  perLap 0.001 → 평균 39.3바퀴(30바퀴 안 37%·50바퀴 안 73%, tests/c140). 오면 원정에서 돌아온 방에 머물고 다음 원정 귀환 때 떠난다.
     *  티어(화면에 안 보임) = tierWeights 로 뽑고, 품목 stockSize 개를 그 티어의 등급표(gradeWeights)로 뽑는다(같은 품목 중복 없음) */
    wanderer: {
      perLap: 0.001,
      stockSize: 4,
      tierWeights: [55, 30, 12, 3] as number[],
      /** 티어(1~4)별 품목 등급 확률(%): normal · rare · epic · legendary */
      gradeWeights: [
        { normal: 70, rare: 30, epic: 0, legendary: 0 },
        { normal: 40, rare: 45, epic: 15, legendary: 0 },
        { normal: 15, rare: 40, epic: 37, legendary: 8 },
        { normal: 0, rare: 25, epic: 45, legendary: 30 },
      ] as Record<string, number>[],
      /** 특별 품목 (상인 전용, 목록·이름·등급은 src/data/shop/wanderer.json): 골드 가격 · 효과량 */
      items: {
        'w-snack-crate': { price: 90, amount: 3 },
        'w-reroll-pair': { price: 200, amount: 2 },
        'w-calm-deep': { price: 140, amount: 60 },
        'w-wake-deep': { price: 110, amount: 60 },
        'w-training-pair': { price: 160, amount: 2 },
        'w-rare-tile': { price: 260, amount: 1 },
        'w-feast-crate': { price: 380, amount: 2 },
        'w-soul-elixir': { price: 700, amount: 100 },
        'w-pet-egg': { price: 600, amount: 1 },
        // 장비 (GDD 91장 2번, C.150): 품목 등급 = 장비 등급, 안 가진 종류 우선 없이 종류 무작위 1개 → 보관함 장비 탭
        // 체력 포션 (GDD 123장 4, C.198): 영웅 등급 = 드물게. 홈에서 먹으면 체력 가득 (전투 회복약과 별개)
        'w-hp-potion': { price: 320, amount: 1 },
        'w-gear-rare': { price: 300, amount: 1 },
        'w-gear-epic': { price: 700, amount: 1 },
        'w-gear-legend': { price: 1500, amount: 1 },
      } as Record<string, { price: number; amount: number }>,
    },
    /** 대기 모드 = 방치 자동 모험 (GDD 85장 6번, C.140 provisional — 사용자 "24시간 내내 모험 돌릴 때 뜨는 템과 xp 스텟 등등의 n%만큼만", n·기준량은 코드 판단).
     *  접속하지 않은 실제 시간(저장된 마지막 접속 시각 기준, 최대 maxHours)을 '자동 모험'으로 셈. 지급 = fullHour(1시간 내내 직접 원정했을 때의 기준량) × 시간 × share.
     *  fullHour 근거: 바퀴 약 90초(걷기 15초 + 전투) → 40바퀴/시, 걸음 12/바퀴, 골드 ≈ 22/바퀴(4바퀴 원정 골드 133~166, C.120 측정),
     *  노력치 ≈ 흡수 0.4회/바퀴 × 1, 타일 ≈ 0.04장/바퀴, 먹이 ≈ 0.05개/바퀴. share 0.1 → 24시간 = 직접 2.4시간분.
     *  82장: 꺼 둔 동안 허기가 오르는 그 시간에만 돈다(허기가 100 에 닿으면 멈춤), 쇠약이면 weakenedRate 배. minMinutes 보다 짧으면 셈하지 않는다 */
    idle: {
      maxHours: 24,
      minMinutes: 10,
      share: 0.1,
      weakenedRate: 0.5,
      /** gear (C.193, GDD 119장 5): 1시간 직접 원정 장비 수 ≈ 40바퀴 × (일반 약 2.8판 × 3% + 강적 약 0.6판 × 25%) ≈ 9개. 대기 지급 = 정수 부분 + 남은 확률 굴림, 등급 = gear.dropGrades.normal, ★ = 지금 단계 권장 */
      fullHour: { laps: 40, steps: 480, gold: 880, ev: 16, tiles: 1.6, food: 2, gear: 9 },
      /** 먹이 지급 종류 (보관 상한까지) */
      foodId: 'basic',
    },
    /** 타일 배치 프리셋 (GDD 85장 11번, C.140 provisional): 종족마다 저장 칸 수. 배치 칸 수 = expedition.deckSize(8) + 상점 배치 칸(shared.deckSlots) */
    tilePresets: { max: 5, nameMax: 12 },
    /** 펫 (GDD 90장, C.144 마스터 초안 provisional — 이름·수치 모두 가칭). 1마리만 데리고 다닌다.
     *  효과 = 1단계 값 × (1 + affinityStep × (친밀도 − 1)) → 5단계 2배. 친밀도 = 데리고 다닌 원정 바퀴(대기 모드 바퀴 포함) 누계가 affinityLaps 에 닿을 때마다 +1.
     *  gold = 원정 전투·보스 골드 +8% · belly = 원정 허기 오름 −15% · guard = 전투 시작 보호막(최대 체력 4%) · seekWanderer = 떠돌이 상인 바퀴 확률 +25% · seekTile = 바퀴 끝 타일 보상 +1장 확률 10%.
     *  얻기: 원정 바퀴 끝 lapDropChance(2%, 이미 가진 펫이면 dupGold 골드) · 떠돌이 상인 전설 품목(w-pet-egg) · 첫 진화 때 무작위 1마리 선물 */
    pets: {
      effects: { gold: 0.08, belly: 0.15, guard: 0.04, seekWanderer: 0.25, seekTile: 0.1 },
      affinityLaps: [10, 30, 60, 100] as number[],
      affinityStep: 0.25,
      lapDropChance: 0.02,
      dupGold: 40,
    },
    /** 장비 (GDD 91장 v5.187 확정, C.150 provisional — 이름·수치 모두 가칭, 마스터 위임으로 코드가 정함). 칸 5개(무기·방어구·신발·장신구 1·2).
     *  능력치 한 줄 값 = round(★ 기준 능력치(refStatOf(★−1)) × lineFrac[등급] × kinds[종류].weight) — 얻은 원정 ★ 가 높을수록 세다. 치명 줄은 critLine[등급](확률 절대값).
     *  무기 = 힘·지능 중 1줄 · 방어구 = 체력·방어 2줄 · 신발 = 속도 1줄 · 장신구 = pool 에서 1~2줄 무작위(서로 다름). 영웅·전설은 특수 효과 1줄(special[효과][0 영웅, 1 전설]).
     *  강화 +1~+maxPlus(골드, 실패 없음): 능력치 줄 × (1 + plusStep × 단계), 정수 능력치는 단계마다 최소 +1 — 특수 효과는 그대로. 비용 = enhanceCost[등급] × (지금 단계 + 1).
     *  드롭: 이긴 전투마다 dropChance(일반·강적·보스) → 등급 dropGrades(%). 기본 상점 = 노말 shopPrice(★ = 지금 단계 권장). 보관 상한 cap — 넘치면 sellGold 로 바로 판다.
     *  balance:check 기준 봇은 장비 없음(가드 그대로). 참고 줄 '그 단계 평균 장비' = refLoadout(등급·강화, 5칸, 무기 힘·장신구 정신력+치명) */
    gear: {
      lineFrac: { normal: 0.06, rare: 0.09, epic: 0.12, legendary: 0.16 } as Record<string, number>,
      kinds: {
        weapon: { weight: 1, pool: ['atk', 'int'], lines: [1, 1] },
        armor: { weight: 0.8, pool: ['hp', 'def'], lines: [2, 2] },
        shoes: { weight: 0.8, pool: ['spd'], lines: [1, 1] },
        accessory: { weight: 0.6, pool: ['crit', 'spr', 'hp', 'atk', 'int', 'def'], lines: [1, 2] },
      } as Record<string, { weight: number; pool: string[]; lines: [number, number] }>,
      critLine: { normal: 0.01, rare: 0.015, epic: 0.02, legendary: 0.03 } as Record<string, number>,
      special: { family: [0.1, 0.15], elite: [0.08, 0.12], critDamage: [0.15, 0.25], shield: [0.03, 0.05], activeShield: [0.4, 0.5], activeBurst: [5, 7] } as Record<string, [number, number]>,
      /** 발동 효과 (GDD 105장 수정 4, C.177): 방패 부적 = 이 시간(초) 동안 받는 피해 −special 값 · 영압 폭발석 = 기본 공격 special 값 회분 피해 */
      activeShieldSeconds: 3,
      maxPlus: 5,
      plusStep: 0.1,
      enhanceCost: { normal: 30, rare: 60, epic: 120, legendary: 240 } as Record<string, number>,
      dropChance: { normal: 0.03, elite: 0.25, boss: 0.6 },
      dropGrades: {
        normal: { normal: 80, rare: 17, epic: 3, legendary: 0 },
        elite: { normal: 55, rare: 32, epic: 11, legendary: 2 },
        boss: { normal: 25, rare: 40, epic: 27, legendary: 8 },
      } as Record<string, Record<string, number>>,
      shopPrice: 120,
      sellGold: { normal: 15, rare: 40, epic: 100, legendary: 250 } as Record<string, number>,
      cap: 40,
      refLoadout: { grade: 'rare', plus: 2 },
    },
    /** 전투용 소모품 (GDD 105장 수정 3·108장 3번, C.177 provisional): 장비 화면 소모품 칸에 넣으면 전투 [소모품]이 전투당 1번 쓴다. 값 = 골드 */
    battleItems: {
      'battle-potion': { effect: 'heal', fraction: 0.25, price: 50 },
      'battle-haste': { effect: 'haste', seconds: 5, spawnMult: 2, price: 70 },
    } as Record<string, { effect: 'heal'; fraction: number; price: number } | { effect: 'haste'; seconds: number; spawnMult: number; price: number }>,
    /** 보관함 (GDD 86장 4번, C.140 provisional): 소모품(정화제·각성제·상인 소모품) 종류별 보관 상한 — 먹이 상한과 같은 9 */
    inventory: { consumableCap: 9 },
  },
} as const;
