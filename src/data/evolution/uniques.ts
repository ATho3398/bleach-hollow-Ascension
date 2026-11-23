// 4단계 진화체 고유 능력·특수 블록·해방 변형·4단계 한 줄 특성 (GDD 8-7 1차 구현, C.499 — docs/drafts/evo-impl-1119.md).
// 데이터 = uniques.json(진화체 id × 종족: 규칙·조건·효과 종류), 수치 = BALANCE.provisional.evoUniques(같은 키 — 해방 중 값은 release). 엔진(src/engine/combat/evoUnique.ts)은
// 장치(규칙·조건·효과 종류)만 알고 진화체·종족 id 로 분기하지 않는다. 3번째 종족은 forms[id] 에 그 종족 칸을 더하면 된다.
// 쓰는 법(다음 세션): docs/dev-log.md C.499 소절 '장치 목록'. 새 진화체 = forms 에 칸 하나 + balance forms 에 수치 하나.
import { BALANCE } from '../../config/balance';
import { pickFaction, type PerFaction } from '../schema';
import { ELEMENT_IDS } from '../elements';
import { FACTIONS } from '../factions';
import { FAMILY_TIERS } from '../../engine/faction';
import { FORM_TABLE } from './index';
import raw from './uniques.json';

/** 숫자 칸: 숫자 그대로 또는 balance 수치 키(해방 중이면 release 의 같은 키가 우선) */
export type EvoNum = number | string;

/** 곱하는 값의 출처 (per): chain 체인 수 · consumed 이번 규칙에서 소모한 스택 수 · amount 사건 양(막은 피해·깨진 보호막 등) · damage 이번 공격 피해 ·
 *  bar 바의 블록 수(고정 특수 블록 제외) · bar:<속성> 그 속성 블록 수 · lostHpPct 잃은 체력 %(0~100) · shieldPct 보호막 %(최대 체력 대비 0~100) ·
 *  risk 리스크(호로화) 게이지 · stack:<이름> · buff:<이름>(버프 값) · charge:<이름>(남은 횟수) · chargeValue:<이름>(이번 평타가 쓴 충전 값) ·
 *  maxHp 내 최대 체력 (C.515 — 추파카브라 저장 상한 '최대 체력 50%' = 스택 max × maxPer maxHp) ·
 *  effort 그 몸 타입의 주 노력치 투자율 0~1 · blockLv 그 진화체 속성 블록 투자율 0~1 (C.524 모양 손잡이 — grow 와 같이 써서 '값 × (1 + 기울기 × 투자율)') */
export type EvoSource = string;

/** 언제 (규칙의 on) */
export const EVO_TRIGGERS = [
  'start', // 전투 시작
  'basicPre', // 평타 피해 계산 직전 (basicMult·forceCrit·ignoreDef 는 여기서만)
  'basic', // 평타를 친 뒤 (every = 평타 n대마다)
  'blockPre', // 블록 피해 계산 직전 (blockMult·blockFlat·blockCrit 는 여기서만)
  'block', // 블록을 쓴 뒤 (crit = 그 블록이 치명)
  'spawn', // 바에 블록이 생겼다
  'every', // seconds 마다 (need 가 참인 동안만 시간이 간다 — 끊겨도 0 으로 돌아가지 않음, GDD 8-7 ②)
  'timer', // timer 동작으로 맞춘 시계가 다 됐다
  'releaseStart', // 레스렉시온/만해 시작 (기본 해방 제외)
  'releaseEnd', // 레스렉시온/만해 끝
  'shieldHit', // 보호막이 피해를 막았다 (amount = 막은 양)
  'shieldBreak', // 보호막이 깨졌다 (amount = 그 보호막이 막은 합)
  'special', // 특수 블록을 썼다 (special = 블록 id)
  'kill', // 처형했다
  'hurt', // 내 체력이 줄었다 (amount = 보호막 뒤 실제로 잃은 체력, heavy = 강공격) — C.515 추파카브라 '받은 피해 저장'
  'shieldEnd', // 시간 보호막(shield seconds)이 시간이 다 돼 사라졌다 (amount = 그때 남아 있던 양) — C.515 무랄라 '남은 방어막 비례 피해'
] as const;
export type EvoTrigger = (typeof EVO_TRIGGERS)[number];

/** 효과 종류 (규칙의 do[].act) */
export const EVO_ACTIONS = [
  'add', // 스택 +value(×per). 스택 정의의 max·overflow·seconds 를 따른다
  'mul', // 스택 ×value (절반 = 0.5)
  'clear', // 스택 0
  'consume', // 스택에서 value(×per)만큼(없으면 전부) 빼고 그 수를 consumed 로
  'buff', // 버프 seconds 동안 value(×per). refresh replace(기본)·max(큰 값)·add(더함)
  'charge', // 다음 평타 value(×per)회 충전 (max), amount(×amountPer) = 충전 값(chargeValue)
  'spawn', // 블록 value 개: block 'draw'(평소 출현표, 허 제외) · 'make'(바 끝 빈 칸에 element 속성('self' = 내 속성)·family 계열 블록 — 그 속성·계열 생성원이 없으면 안 생김) · 특수 블록 id
  'shield', // 보호막 +최대 체력 × value(×per), 합 상한 cap
  'shieldCut', // 보호막 −최대 체력 × value(×per) (피해 아님)
  'blockMult', // (blockPre) 이 블록 피해 +value(×per)
  'blockFlat', // (blockPre) 이 블록에 평타 value(×per)회분 피해를 더함
  'blockCrit', // (blockPre) 이 블록 치명 확률 +value(×per)
  'blockCritDmg', // (blockPre) 이 블록 치명 피해 +value(×per)
  'noDamage', // (blockPre) 이 블록은 피해 없음 — 효과(규칙)만, 피해 0·치명 판정·피해 글자 없음 (GDD v6.133 '강화만' 블록)
  'basicMult', // (basicPre) 이 평타 피해 +value(×per)
  'forceCrit', // (basicPre) 이 평타 치명 확정
  'ignoreDef', // (basicPre) 이 평타 방어 무시 value
  'hit', // 추가 피해 value(×per) × basis: basic 평타 1회 · block 기본 블록 1단계 · last 방금 평타 피해 · raw 숫자 그대로 · void 공허 블록 1개 (element 속성, ignoreDef)
  'basics', // 평타 value 회를 바로 (각 +bonus) — 이 평타는 평타 n대 카운터를 세지 않는다
  'heal', // 회복 value(×per) × of(damage 이번 피해 · maxHp 최대 체력)
  'echo', // (block) 쓴 블록의 잔상(같은 블록 1체인)을 바 끝에 — 잔상은 echo 규칙을 다시 부르지 않는다
  'absorb', // (spawn) 방금 생긴 블록을 바에서 지운다 (흡수 스택은 add 로 따로)
  'absorbBar', // 바에 있는 element 속성(void = 허 블록) 블록을 전부 지우고 그 수를 consumed 로 (C.506 흑귀 '바의 허 블록 전부 흡수')
  'useSpecial', // 바의 특수 블록 special 을 바로 쓴다 (없으면 아무것도 안 함)
  'timer', // 시계 timer 를 seconds 로 맞춘다 → 다 되면 on 'timer'
  'timerCut', // 시계 timer 를 seconds 만큼 당긴다 (돌고 있을 때만)
  'execute', // 지금 적을 처형 (강적·보스는 안 됨)
  'basicShot', // (basicPre) 이 평타를 특수 공격으로: 피해 ×value, element 속성, category 능력치(special = 지능 기준), fx = 화면 도트 이펙트(그 계열·단계의 이미 연결된 것 재사용) — 이름 = 규칙 proc (C.514 석양홍)
  'basicCrit', // (basicPre) 이 평타 치명 확률 +value(×per) — 상한 70% 안(critBreak 능력만 돌파, C.529) (C.515 바라쿠다 '다음 평타 n회 치명 +25%p')
  'forceNext', // 다음에 새로 생기는 블록 value 개를 element 속성 블록으로 (그 속성 생성원이 없으면 평소대로, 대기 상한 max — C.515 비보라)
] as const;
export type EvoActionKind = (typeof EVO_ACTIONS)[number];

export interface EvoAction {
  act: EvoActionKind;
  stack?: string;
  buff?: string;
  charge?: string;
  timer?: string;
  special?: string;
  block?: string;
  value?: EvoNum;
  per?: EvoSource | EvoSource[];
  seconds?: EvoNum;
  /** buff·timer: 시간(초)에 곱하는 출처 (C.503 — 루시에르나가 '불빛 1개당 화상 +3초' = secondsPer consumed 처럼) */
  secondsPer?: EvoSource | EvoSource[];
  /** buff: 시간(초)에 (1 + value × per) 를 곱한다 (C.524 모양 손잡이 — 사용자 확정 값은 그대로 두고 지속만 투자 비례) */
  secondsGrow?: { value: EvoNum; per: EvoSource | EvoSource[] };
  max?: EvoNum;
  cap?: EvoNum;
  amount?: EvoNum;
  amountPer?: EvoSource | EvoSource[];
  refresh?: 'replace' | 'max' | 'add';
  /** hit: foeMaxHp = 적 최대 체력 × value (치명·배율 없음 — C.515 토르멘타 자기장·비보라 독) */
  basis?: 'basic' | 'block' | 'last' | 'raw' | 'void' | 'foeMaxHp';
  /** hit: 지속 피해로 넣는다 (독 숫자처럼 dot 사건, 발동 글자 없음 — 발동 횟수만) */
  dot?: boolean;
  /** hit: 독 지속 피해 — 4단계 특성 '독 지속 피해 +' 를 받는다 (C.515 비보라) */
  poison?: boolean;
  element?: string;
  /** spawn make: 블록 계열 id (없으면 평소 출현표에서 고른 계열) */
  family?: string;
  /** spawn 특수 블록: 바가 가득이면 맨 오른쪽 옛 블록을 밀어내고 놓는다 (해방 순간 지급과 같은 방식, C.506 흑귀) */
  force?: boolean;
  /** 값에 (1 + grow.value × grow.per) 를 곱한다 (C.506 봉수대 '바의 불 블록 1개당 +10%') */
  grow?: { value: EvoNum; per: EvoSource | EvoSource[] };
  ignoreDef?: EvoNum;
  bonus?: EvoNum;
  /** basicShot: 평타 능력치 분류 (special = 지능 ÷ 정신력, physical = 공격력 ÷ 방어 — 없으면 평타 그대로) */
  category?: 'physical' | 'special';
  /** basicShot: 화면 도트 이펙트 = 그 종족 계열 family 의 stage 단계 이펙트(이미 연결된 것 재사용, 색 = element) */
  fx?: { family: string; stage: number };
  /** heal: damage 이번 피해 · maxHp 최대 체력 · hit 이 규칙에서 방금 넣은 추가 피해(hit) — C.515 추파카브라 '그 피해만큼 회복' */
  of?: 'damage' | 'maxHp' | 'hit';
}

/** 조건 하나 (규칙의 need[] — 모두 참이어야) */
export interface EvoNeed {
  stack?: string;
  buff?: string;
  charge?: string;
  special?: string;
  atLeast?: EvoNum;
  /** atLeast 에 곱하는 출처 (C.524 — 추파카브라 '저장 ≥ 최대 체력 30%' = atLeast 0.3 × maxHp) */
  atLeastPer?: EvoSource | EvoSource[];
  below?: EvoNum;
  /** 바가 가득 (고정 특수 블록 포함 trayCapacity) */
  barFull?: boolean;
  /** 보호막이 있다 / 없다 */
  shield?: boolean;
  /** 적이 강적·보스다 / 아니다 */
  elite?: boolean;
  /** stack·buff·charge·special 이 0 이어야 (없어야) 참 (C.515 — 강화 자기장이 없을 때만 보통 자기장) */
  none?: boolean;
  /** 전투 시작 n초 안이어야 참 (C.524 모양 손잡이 — 켜지는 상황) */
  elapsedBelow?: EvoNum;
}

/** 규칙 = 언제(on) + 거르기 + 무엇을(do) */
export interface EvoRule {
  on: EvoTrigger;
  /** release = 레스렉시온/만해 중에만, normal = 그 밖에만 */
  when?: 'release' | 'normal';
  /** basic·block·spawn: 그 횟수마다 (규칙마다 따로 센다, 끊김 없음) */
  every?: EvoNum;
  /** every 트리거 간격(초) */
  seconds?: EvoNum;
  /** block·blockPre·spawn: 블록 속성(void = 공허 블록) */
  element?: string[];
  notElement?: string[];
  /** block·blockPre·spawn: 블록 종류 (없으면 skill — 흡수·기본·물공 블록) */
  kind?: ('skill' | 'void' | 'combo' | 'liberation' | 'special')[];
  /** block·blockPre: 블록 계열 id (그 종족 계열 — '이 진화체 블록' 거르기, C.514 석양홍 귀 블록) */
  family?: string[];
  /** block·blockPre: 굳은 묶음이었다(true)/아니었다(false) — 능력 칸 harden (C.514 만리장) */
  hardened?: boolean;
  minChain?: EvoNum;
  chain?: number[];
  /** block: 그 블록이 치명이었다 */
  crit?: boolean;
  /** block: 잔상 블록이었다(true)/아니었다(false) */
  echo?: boolean;
  /** block: 이 거르기를 통과한 사용이 count 번 연달아 이어지면 (사이에 거르기를 못 넘는 블록을 쓰면 끊김, withinSeconds 가 있으면 그 시간 안에서만 — 없으면 시간 제한 없음). 그 뒤 0 부터 */
  streak?: { count: EvoNum; withinSeconds?: EvoNum };
  /** block·blockPre: 바로 앞에 쓴 블록이 이 거르기에 맞았다 (C.515 토르멘타 '2체인을 쓴 바로 다음에 3체인') */
  after?: { chain?: number[]; kind?: ('skill' | 'void' | 'combo' | 'liberation' | 'special')[]; element?: string[] };
  /** hurt·shieldHit: 강공격으로 받은 피해였다(true)/아니었다(false) (C.515 토르투가 '강공격은 반사 안 함') */
  heavy?: boolean;
  /** basicPre·basic: 이번 평타가 이 충전을 썼다 */
  charge?: string;
  special?: string;
  timer?: string;
  need?: EvoNeed[];
  do: EvoAction[];
  /** 발동 작은 글자 (런 로그 발동 횟수 키 evo:<글자>) */
  proc?: string;
}

/** 늘 붙는 효과 (passive): stat 에 value(×per, 상한 max) */
export const EVO_STATS = [
  'basicPower', // 평타 피해 +
  'blockPower', // 블록 피해 +
  'dealt', // 주는 모든 피해 +
  'attackSpeed', // 공격 속도 + (평타 간격 ÷ (1 + 값))
  'interval', // 평타 간격 −비율 (간격 × (1 − 값), 음수면 늘어남)
  'intervalCut', // 평타 간격 −초
  'crit', // 평타 치명 확률 +(상한도 같이)
  'critDmg', // 치명 피해 +
  'blockCrit', // 블록 치명 확률 +(상한도 같이)
  'petPower', // 펫 공격 피해 +
  'execLine', // 평타 처형선 + (처형 특성의 선에 더함)
  'execBlockLine', // 블록 처형선 + (처형 특수 블록용, 다른 색 선)
  'ignoreDef', // 평타 방어 무시 +
  'offenseBasic', // 평타 피해 능력치: value 1 = 공격력·지능 중 높은 쪽, 2 = 평균 (1 이상이면 켜짐)
  'offenseBlock', // 블록 피해 능력치: 같은 값
  'foeAttackSlow', // 적 일반 공격 속도 −비율 (공격 시계가 (1 − 값) 빠르기로 돈다, 상한 0.95) — C.515 토르멘타 자기장
  'foeMagicDefCut', // 적 마법방어(정신력 — 블록 피해 계산) −비율 — C.515 토르멘타 강화 자기장
  'selfSpawn', // 이 진화체 자기 블록(ability.selfBlock) 생성 확률 +비율p (다른 블록 몫에서 옮겨 옴) — C.515 브라사
] as const;
export type EvoStat = (typeof EVO_STATS)[number];

export interface EvoPassive {
  stat: EvoStat;
  value: EvoNum;
  per?: EvoSource | EvoSource[];
  max?: EvoNum;
  /** per 를 step 단위로 내림해 센다 (2 = 2스택당 한 번, C.506 공화 '2스택당 +1%') */
  step?: EvoNum;
  /** 값에 (1 + grow.value × grow.per) 를 곱한다 — 상한 max 전에 (C.524 모양 손잡이: per effort·blockLv) */
  grow?: { value: EvoNum; per: EvoSource | EvoSource[] };
  when?: 'release' | 'normal';
  need?: EvoNeed[];
}

/** 표시 네모 (GDD 7-13 스택 표시): 아이콘·이름. on 은 스택 정의의 on */
export interface EvoMark {
  icon: string;
  name: PerFaction<string> | string;
}

export interface EvoStackDef {
  max?: EvoNum;
  /** 스택마다 따로 도는 시간(초) — 없으면 영구 */
  seconds?: EvoNum;
  /** self = 내게 쌓임(내 체력 막대 위), foe = 적에게 건 것(적 체력 막대 위) */
  on?: 'self' | 'foe';
  /** cap = 가득이면 더 안 쌓임(기본), reset = 가득에서 더 쌓으면 0 */
  overflow?: 'cap' | 'reset';
  /** 원정 동안 유지 (다음 전투 시작 값으로 넘긴다) */
  carry?: boolean;
  /** max 에 곱하는 출처 (C.515 — maxHp 면 '최대 체력 × max') */
  maxPer?: EvoSource;
  mark?: EvoMark;
}
export interface EvoBuffDef {
  on?: 'self' | 'foe';
  mark?: EvoMark;
}
export interface EvoChargeDef {
  max?: EvoNum;
  mark?: EvoMark;
}

/** 특수 블록 (GDD 8-7 '특수 블록'): 바에 놓이는 진화체 전용 블록. 체인으로 묶이지 않는다 */
export interface EvoSpecialDef {
  name: PerFaction<string> | string;
  /** 블록 위 한 글자 */
  short: string;
  description?: PerFaction<string> | string;
  /** 바 맨 앞 n칸 고정 (전투 시작 때 놓임, 섞이지 않음) */
  fixed?: EvoNum;
  /** 써도 바에서 안 사라짐 */
  keep?: boolean;
  /** always(기본) · execBlock = 적 체력이 블록 처형선 아래이고 강적·보스가 아닐 때만 켜짐 */
  usable?: 'always' | 'execBlock';
  /** 꺼져 있는 이유·켜는 법 한 줄 (C.508 점검C 8 — {키} 수치 틀): 블록이 꺼진 동안 누르면 알림·설명 창, 상태 화면 특수 블록 줄 끝 */
  offNote?: PerFaction<string> | string;
  /** 바에 한 번에 최대 몇 개 (기본 제한 없음) */
  maxOnBar?: EvoNum;
  /** 블록 색(속성 각인)으로 보일 속성 (C.515 — 추파카브라 혈 블록·게파르도 낙뢰). 없으면 해방 각인 */
  element?: string;
  /** 이 조건이 다 참일 때만 켜짐 (C.515 — 추파카브라 '저장된 피해가 있을 때') */
  need?: EvoNeed[];
}

export interface EvoAbilityDef {
  name?: PerFaction<string> | string;
  /** 상태 화면 한 줄 ({키} = 수치, {키%} = 백분율) */
  description: PerFaction<string> | string;
  /** 해방(레스렉시온/만해) 때 바뀌는 것 한 줄 (같은 틀, 수치는 release 값) */
  releaseDescription?: PerFaction<string> | string;
  /** voidOnly = 허(공허) 블록 말고는 블록이 저절로 안 생김(생성 타이머·해방 순간 지급) */
  spawnRule?: 'voidOnly';
  stacks?: Record<string, EvoStackDef>;
  buffs?: Record<string, EvoBuffDef>;
  charges?: Record<string, EvoChargeDef>;
  specials?: Record<string, EvoSpecialDef>;
  rules?: EvoRule[];
  passives?: EvoPassive[];
  /** 이 진화체의 체인 배율 덮어쓰기 (1·2·3체인, 공격 블록만 — 계열 단계 배율 대신) */
  chainMultipliers?: EvoNum[];
  /** 레스렉시온/만해 지속(초) 예외 */
  releaseSeconds?: EvoNum;
  /** 레스렉시온/만해 중 체력이 이 값 아래로 안 떨어짐 */
  releaseHpFloor?: EvoNum;
  /** 체인 상한 넘기기 (C.514 현음): 이 진화체만 체인 상한 max(수치 키 — 해방 중 값 가능, 계열 단계 수 + tiers 수까지).
   *  tiers[k] = 계열 단계 수 + k + 1 체인: 피해 = 맨 위 단계 기술 × mult, 기술 이름 name (화면 큰 글자) */
  chainExtend?: { max: EvoNum; tiers: { mult: EvoNum; name: PerFaction<string> | string }[] };
  /** 굳음 (C.514 만리장): 바에서 chain 개로 모인 묶음(element 속성 블록만)이 seconds 초 그대로면 '굳음' — 규칙 거르기 hardened, stack = 굳은 묶음 수를 매 틱 적는 스택(표시 칩), name = 화면 글자 */
  harden?: { chain: number; seconds: EvoNum; element?: string[]; stack?: string; name: PerFaction<string> | string };
  /** 이 진화체 자기 블록 = element('self' = 내 속성)·family 블록 (selfSpawn 이 확률을 올린다 — C.515 브라사 '브라사 자기 블록(불·교)') */
  selfBlock?: { element: string; family: string };
  /** 저절로 안 생기는 블록 속성 (출현표에서 뺀다 — 다른 블록 몫은 그대로, C.515 추파카브라 '혈 블록은 첫 칸 1개만') */
  spawnExclude?: string[];
  /** forceNext 대기 표시 (네모) */
  forceNextMark?: EvoMark;
  /** 출처 effort 기준 (C.530, GDD 8-7 v6.186): 'attackInterval' = 노력치 투자율 대신 일반 공격 간격 기준(몸 기본 공속 간격 → 0.6초 = 1, balance evoInvest.intervalFull).
   *  없으면 노력치 투자율(C.524). 공속 몸(능력이 일반 공격 횟수·창으로 켜지는 몸)만 — 측정 investFocus = aspd 와 같은 칸(tests/c530) */
  effortBasis?: 'attackInterval';
  /** 치명 상한 돌파 (GDD 7-4 v6.184, C.529): true = 이 고유 능력의 치명 확률 +(평타·블록)만 치명 상한(70%)을 넘을 수 있다(최대 evoAbilityCaps.critBreakMax = 100%).
   *  객체 = 그 조건(need — 규칙 거르기와 같은 틀, when = 해방 중·평소)이 켜진 동안만 돌파(폭주형·사냥꾼 '상황에 따라 잠깐' 자리 — 조건 [미정], 지금 데이터 없음).
   *  없으면 능력 치명 +도 상한 안에서 더한다. 켠 진화체 = 물 속성 6종(라나·니에블라·바라쿠다 / 노도·연우·백랑파, 사용자 "일단 수속") */
  critBreak?: boolean | { need?: EvoNeed[]; when?: 'release' | 'normal' };
}

/** 4단계 한 줄 특성 효과 종류 (특성 칸 — 받으면 영구, 해방해도 그대로 GDD 8-6) */
export const EVO_TRAIT_EFFECTS = [
  'attackSpeed', // 공격 속도 +value
  'crit', // 평타 치명 확률 +value(상한도)
  'blockCrit', // 블록 치명 확률 +value(상한도)
  'chainPower', // chain 체인 블록 위력 +value
  'blockPower', // 모든 블록 위력 +value (C.514 현음 '블록 피해 +6%' — 노멀 '균형'과 같은 자리)
  'elementDamage', // element 속성 피해 +value (C.514 석양홍 '불 피해 +8%' — 속성 피해(GDD 48장) 칸에 더함)
  'offenseMax', // 피해 계산 능력치 = 공격력·지능 중 높은 쪽 (평타·블록 모두)
  'execute', // 처형: 적 체력 line 이하에서 평타 = 처형, 강적·보스는 그 아래에서 주는 피해 ×eliteMult. 이 특성을 대표로 주는 진화체가 아니면 weakLine·weakEliteMult
  'critDmg', // 치명 피해 +value (평타·블록, C.515 바라쿠다)
  'spawnCut', // 블록 생성 간격 −비율 (간격 × (1 − value), C.515 토르멘타)
  'drain', // 흡혈 +value (내 공격 피해의 value 만큼 회복 — 혈 속성 흡혈과 같은 전투 상한, C.515 추파카브라)
  'poisonDot', // 내가 거는 독 지속 피해 +value (C.515 비보라)
] as const;
export type EvoTraitEffect = (typeof EVO_TRAIT_EFFECTS)[number];
/** 특성 효과마다 balance evoUniques.traits[키] 에 꼭 있어야 하는 수치 (formAbilities 가 읽는 칸 — 없으면 효과 0 으로 조용히 꺼지므로 검사가 막는다) */
export const EVO_TRAIT_NUM_KEYS: Readonly<Record<EvoTraitEffect, readonly string[]>> = {
  attackSpeed: ['value'],
  crit: ['value'],
  blockCrit: ['value'],
  chainPower: ['value'],
  blockPower: ['value'],
  elementDamage: ['value'],
  offenseMax: [],
  execute: ['line', 'eliteMult', 'weakLine', 'weakEliteMult'],
  critDmg: ['value'],
  spawnCut: ['value'],
  drain: ['value'],
  poisonDot: ['value'],
};

export interface EvoTraitDef {
  effect: EvoTraitEffect;
  name: PerFaction<string>;
  description: PerFaction<string>;
  /** chainPower 의 체인 수 */
  chain?: number;
  /** elementDamage 의 속성 id */
  element?: string;
}

/** 진화체 하나 × 종족 하나 */
export interface EvoFormEntry {
  /** 4단계 한 줄 특성 (traits 키): 이 진화체의 4단계 대표 특성(el4:)을 대신한다 */
  trait?: string;
  ability?: EvoAbilityDef;
  /** none = 해방 없음(레스렉시온/만해·기본 해방 모두 막음, 해방 버튼·도전 숨김) */
  release?: 'none';
  /** 펫 칸 + (C.506: 칸이 있으면 2번째 펫을 데리고 가 같이 공격한다 — shared.pets.active2) */
  extraPetSlots?: EvoNum;
  /** 더 늘어난 칸 펫의 피해 배율 (C.506 추성 '2번째 펫 피해 70%', 없으면 1) */
  extraPetPower?: EvoNum;
}

export interface EvoFile {
  provisional: boolean;
  traits: Record<string, EvoTraitDef>;
  forms: Record<string, PerFaction<EvoFormEntry>>;
}

/** JSON 모양 검사 (C.509, 점검B 3): 타입 단언(as) 전에 칸의 자료형을 본다 — 틀리면 어느 칸인지 적은 오류로 로드 때 멈춘다 */
export function evoFileShapeErrors(r: unknown): string[] {
  const errors: string[] = [];
  const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
  const objOf = (v: unknown, at: string, each?: (x: Record<string, unknown>, at: string) => void): void => {
    if (v === undefined) return;
    if (!isObj(v)) return void errors.push(`${at}: 객체가 아니다`);
    for (const [k, x] of Object.entries(v)) {
      if (!isObj(x)) errors.push(`${at}.${k}: 객체가 아니다`);
      else each?.(x, `${at}.${k}`);
    }
  };
  const arr = (v: unknown, at: string, item: 'string' | 'number' | 'object' | 'num'): void => {
    if (v === undefined) return;
    if (!Array.isArray(v)) return void errors.push(`${at}: 배열이 아니다`);
    v.forEach((x, i) => {
      const ok = item === 'object' ? isObj(x) : item === 'num' ? typeof x === 'number' || typeof x === 'string' : typeof x === item;
      if (!ok) errors.push(`${at}[${i}]: ${item === 'num' ? '숫자·수치 키' : item} 가 아니다`);
    });
  };
  const str = (o: Record<string, unknown>, k: string, at: string, required = false): void => {
    if (o[k] === undefined ? required : typeof o[k] !== 'string') errors.push(`${at}.${k}: 글자가 아니다${required ? '(필수 칸)' : ''}`);
  };
  const srcs = (v: unknown, at: string): void => {
    if (v !== undefined && typeof v !== 'string') arr(v, at, 'string');
  };
  if (!isObj(r)) return ['uniques.json: 객체가 아니다'];
  if (typeof r.provisional !== 'boolean') errors.push('provisional: 참·거짓이 아니다');
  if (!isObj(r.traits)) errors.push('traits: 객체가 아니다');
  objOf(r.traits, 'traits', (t, at) => str(t, 'effect', at, true));
  if (!isObj(r.forms)) errors.push('forms: 객체가 아니다');
  objOf(r.forms, 'forms', (byFac, at) => {
    for (const [fac, e] of Object.entries(byFac)) {
      const where = `${at}.${fac}`;
      if (!isObj(e)) { errors.push(`${where}: 객체가 아니다`); continue; }
      str(e, 'trait', where);
      if (e.ability === undefined) continue;
      if (!isObj(e.ability)) { errors.push(`${where}.ability: 객체가 아니다`); continue; }
      const a = e.ability;
      for (const k of ['stacks', 'buffs', 'charges', 'specials'] as const) objOf(a[k], `${where}.${k}`);
      for (const k of ['selfBlock', 'forceNextMark'] as const) if (a[k] !== undefined && !isObj(a[k])) errors.push(`${where}.${k}: 객체가 아니다`);
      arr(a.spawnExclude, `${where}.spawnExclude`, 'string');
      if (a.critBreak !== undefined && typeof a.critBreak !== 'boolean') {
        if (!isObj(a.critBreak)) errors.push(`${where}.critBreak: true/false·조건 객체가 아니다`);
        else {
          arr(a.critBreak.need, `${where}.critBreak.need`, 'object');
          if (a.critBreak.when !== undefined && a.critBreak.when !== 'release' && a.critBreak.when !== 'normal') errors.push(`${where}.critBreak.when: release/normal 이 아니다`);
        }
      }
      for (const [n, sp] of Object.entries(isObj(a.specials) ? a.specials : {})) if (isObj(sp)) arr(sp.need, `${where}.specials.${n}.need`, 'object');
      arr(a.chainMultipliers, `${where}.chainMultipliers`, 'num');
      if (a.chainExtend !== undefined) {
        if (!isObj(a.chainExtend)) errors.push(`${where}.chainExtend: 객체가 아니다`);
        else {
          if (typeof a.chainExtend.max !== 'number' && typeof a.chainExtend.max !== 'string') errors.push(`${where}.chainExtend.max: 숫자·수치 키가 아니다`);
          arr(a.chainExtend.tiers, `${where}.chainExtend.tiers`, 'object');
          if (!Array.isArray(a.chainExtend.tiers)) errors.push(`${where}.chainExtend.tiers: 배열이 아니다`);
        }
      }
      if (a.harden !== undefined) {
        if (!isObj(a.harden)) errors.push(`${where}.harden: 객체가 아니다`);
        else {
          if (typeof a.harden.chain !== 'number') errors.push(`${where}.harden.chain: 숫자가 아니다`);
          str(a.harden, 'stack', `${where}.harden`);
          arr(a.harden.element, `${where}.harden.element`, 'string');
        }
      }
      arr(a.rules, `${where}.rules`, 'object');
      arr(a.passives, `${where}.passives`, 'object');
      for (const [i, rule] of (Array.isArray(a.rules) ? a.rules : []).entries()) {
        if (!isObj(rule)) continue;
        const rat = `${where}.rules[${i}]`;
        str(rule, 'on', rat, true);
        for (const k of ['when', 'charge', 'special', 'timer', 'proc'] as const) str(rule, k, rat);
        if (rule.hardened !== undefined && typeof rule.hardened !== 'boolean') errors.push(`${rat}.hardened: 참·거짓이 아니다`);
        arr(rule.family, `${rat}.family`, 'string');
        arr(rule.element, `${rat}.element`, 'string');
        arr(rule.notElement, `${rat}.notElement`, 'string');
        arr(rule.kind, `${rat}.kind`, 'string');
        arr(rule.chain, `${rat}.chain`, 'number');
        arr(rule.need, `${rat}.need`, 'object');
        if (rule.after !== undefined && !isObj(rule.after)) errors.push(`${rat}.after: 객체가 아니다`);
        if (rule.heavy !== undefined && typeof rule.heavy !== 'boolean') errors.push(`${rat}.heavy: 참·거짓이 아니다`);
        if (!Array.isArray(rule.do)) errors.push(`${rat}.do: 배열이 아니다`);
        else arr(rule.do, `${rat}.do`, 'object');
        for (const [j, x] of (Array.isArray(rule.do) ? rule.do : []).entries()) {
          if (!isObj(x)) continue;
          const xat = `${rat}.do[${j}]`;
          str(x, 'act', xat, true);
          for (const k of ['stack', 'buff', 'charge', 'timer', 'special', 'block', 'element', 'family', 'refresh', 'basis', 'of', 'category'] as const) str(x, k, xat);
          if (x.fx !== undefined && !(isObj(x.fx) && typeof x.fx.family === 'string' && typeof x.fx.stage === 'number')) errors.push(`${xat}.fx: { family 글자, stage 숫자 } 가 아니다`);
          for (const k of ['per', 'amountPer', 'secondsPer'] as const) srcs(x[k], `${xat}.${k}`);
          if (x.grow !== undefined && !isObj(x.grow)) errors.push(`${xat}.grow: 객체가 아니다`);
          if (x.secondsGrow !== undefined && !isObj(x.secondsGrow)) errors.push(`${xat}.secondsGrow: 객체가 아니다`);
          for (const k of ['dot', 'poison', 'force'] as const) if (x[k] !== undefined && typeof x[k] !== 'boolean') errors.push(`${xat}.${k}: 참·거짓이 아니다`);
        }
      }
      for (const [i, pv] of (Array.isArray(a.passives) ? a.passives : []).entries()) {
        if (!isObj(pv)) continue;
        str(pv, 'stat', `${where}.passives[${i}]`, true);
        str(pv, 'when', `${where}.passives[${i}]`);
        srcs(pv.per, `${where}.passives[${i}].per`);
        if (pv.grow !== undefined && !isObj(pv.grow)) errors.push(`${where}.passives[${i}].grow: 객체가 아니다`);
        arr(pv.need, `${where}.passives[${i}].need`, 'object');
      }
    }
  });
  return errors;
}

/** 모양 검사를 통과한 JSON 만 EvoFile 로 받는다 */
function parseEvoFile(r: unknown): EvoFile {
  const errors = evoFileShapeErrors(r);
  if (errors.length > 0) throw new Error(`진화체 고유 능력 데이터(uniques.json) 모양 오류:\n- ${errors.join('\n- ')}`);
  return r as EvoFile;
}

const DATA = parseEvoFile(raw);

/** 수치 표 한 칸: 키 → 값, release = 해방 중 값 */
export type EvoNums = Record<string, number> & { release?: Record<string, number> };
type EvoBalance = { traits: Record<string, Record<string, number>>; forms: Record<string, Record<string, Record<string, unknown>>> };
const EB = (): EvoBalance => (BALANCE.provisional as unknown as { evoUniques: EvoBalance }).evoUniques;

export const EVO_UNIQUES_PROVISIONAL: boolean = DATA.provisional;

/** 진화체 × 종족 데이터 (없으면 null) */
export function evoFormEntry(formId: string | null | undefined, factionId: string): EvoFormEntry | null {
  if (!formId) return null;
  return DATA.forms[formId]?.[factionId] ?? null;
}

/** 진화체 × 종족 수치 (balance) — 없으면 빈 표 */
export function evoNumsOf(formId: string, factionId: string): EvoNums {
  return (EB().forms[formId]?.[factionId] ?? {}) as EvoNums;
}

export function evoTraitDef(key: string): EvoTraitDef | null {
  return DATA.traits[key] ?? null;
}

export function evoTraitNums(key: string): Record<string, number> {
  return EB().traits[key] ?? {};
}

/** 그 진화체가 이 특성을 대표로 주는가 (종족 하나라도) — 처형 특성의 센 값(허무형) 판정 */
export function evoTraitIsHome(formId: string | null | undefined, traitKey: string): boolean {
  if (!formId) return false;
  return Object.values(DATA.forms[formId] ?? {}).some((e) => e.trait === traitKey);
}

/** 해방 없음 진화체인가 (GDD 8-7 프레네시 — 해방 버튼·아란칼화/구상화 도전 숨김) */
export function evoReleaseBlocked(formId: string | null | undefined, factionId: string): boolean {
  return evoFormEntry(formId, factionId)?.release === 'none';
}

/** 펫 칸 + (C.506 — game.ts petSlotsOf·syncPetSlots 가 쓴다) */
export function evoExtraPetSlots(formId: string | null | undefined, factionId: string): number {
  const e = evoFormEntry(formId, factionId);
  if (!e?.extraPetSlots || !formId) return 0;
  return typeof e.extraPetSlots === 'number' ? e.extraPetSlots : Number(evoNumsOf(formId, factionId)[e.extraPetSlots] ?? 0);
}

/** 더 늘어난 칸 펫의 피해 배율 (없으면 1) */
export function evoExtraPetPower(formId: string | null | undefined, factionId: string): number {
  const e = evoFormEntry(formId, factionId);
  if (e?.extraPetPower === undefined || !formId) return 1;
  return typeof e.extraPetPower === 'number' ? e.extraPetPower : Number(evoNumsOf(formId, factionId)[e.extraPetPower] ?? 1);
}

/** 데이터가 있는 진화체 id 목록 */
export function evoFormIds(): string[] {
  return Object.keys(DATA.forms);
}

/** 표시 글자 (종족별 또는 한 벌) */
export function evoText(v: PerFaction<string> | string | undefined, factionId: string): string {
  if (v === undefined) return '';
  return typeof v === 'string' ? v : pickFaction(v, factionId);
}

const pctText = (x: number) => `${Math.round(x * 1000) / 10}`;

/** 모든 진화체 설명 틀에 쓰는 공용 수치 (진화체 수치 키가 먼저): {intervalFull} = 공속 몸이 '다 키움'이 되는 일반 공격 간격(초, C.530 GDD v6.186) */
export function evoTextGlobals(): Record<string, number> {
  return { intervalFull: BALANCE.provisional.evoInvest.intervalFull };
}

/** 설명 틀 채우기: {키} = 수치, {키%} = 백분율(0.03 → 3%).
 *  {키@기울기} = 다 키웠을 때의 실제 값 = 키 × (1 + 기울기) — grow·secondsGrow 의 per(effort·blockLv 투자율 0~1)가 1일 때와 같다 (C.526, '+8000%' 배율 대신 실제 값) */
export function fillEvoText(text: string, nums: Record<string, number>): string {
  return text.replace(/\{([A-Za-z0-9_]+)(?:@([A-Za-z0-9_]+))?(%?)\}/g, (m, k: string, g: string | undefined, p: string) => {
    const base = nums[k] ?? evoTextGlobals()[k];
    const slope = g === undefined ? 0 : nums[g];
    if (base === undefined || slope === undefined) return m;
    const v = base * (1 + slope);
    return p ? `${pctText(v)}%` : String(Math.round(v * 100) / 100);
  });
}

/** 해방 중 수치 = 기본 위에 release 덮어쓰기 */
export function evoReleaseNums(n: EvoNums): Record<string, number> {
  const { release, ...base } = n;
  return { ...(base as Record<string, number>), ...(release ?? {}) };
}

// ── 데이터 검사 ──

function numKeysOfRule(r: EvoRule): EvoNum[] {
  const out: EvoNum[] = [];
  for (const k of ['every', 'seconds', 'minChain'] as const) if (r[k] !== undefined) out.push(r[k]!);
  if (r.streak) out.push(r.streak.count, ...(r.streak.withinSeconds !== undefined ? [r.streak.withinSeconds] : []));
  for (const n of r.need ?? []) for (const k of ['atLeast', 'below', 'elapsedBelow'] as const) if (n[k] !== undefined) out.push(n[k]!);
  for (const a of r.do) {
    for (const k of ['value', 'seconds', 'max', 'cap', 'amount', 'ignoreDef', 'bonus'] as const) if (a[k] !== undefined) out.push(a[k]!);
    if (a.grow) out.push(a.grow.value);
    if (a.secondsGrow) out.push(a.secondsGrow.value);
  }
  return out;
}

/** 규칙 거르기의 블록 종류 (EvoRule.kind) */
export const EVO_BLOCK_KINDS = ['skill', 'void', 'combo', 'liberation', 'special'] as const;
const EVO_WHEN = ['release', 'normal'];
/** 블록 속성 거르기에 쓸 수 있는 값: 속성 id + void(공허 블록) */
const VOID_ELEMENT = 'void';

/** 검사가 대조할 '알려진 값' (테스트는 바꿔 넣어 볼 수 있다) */
export interface EvoKnown {
  factions: readonly string[];
  forms: readonly string[];
  elements: readonly string[];
  /** 종족 → 블록 계열 id */
  families: (factionId: string) => readonly string[];
  maxChain: number;
}
export function evoKnown(): EvoKnown {
  return {
    factions: FACTIONS.map((f) => f.id),
    forms: FORM_TABLE.map((f) => f.id),
    elements: ELEMENT_IDS,
    families: (fac) => FACTIONS.find((f) => f.id === fac)?.families.map((x) => x.id) ?? [],
    maxChain: FAMILY_TIERS,
  };
}

/** 데이터 검사: 트리거·효과·능력치 종류가 엔진이 아는 것이고, 수치 키가 balance 에 있고, 참조한 스택·버프·충전·특수 블록이 정의돼 있다.
 *  C.509(점검B 3): when·kind·element·notElement·chain 값, 종족 키·진화체 id, 특성 수치, timer 짝, 버프·충전·스택 정의 안쪽도 본다 */
export function validateEvoUniques(d: EvoFile = DATA, balance: EvoBalance = EB(), known: EvoKnown = evoKnown()): string[] {
  const errors: string[] = [];
  const chainOk = (c: unknown) => Number.isInteger(c) && (c as number) >= 1 && (c as number) <= known.maxChain;
  for (const [key, t] of Object.entries(d.traits)) {
    if (!(EVO_TRAIT_EFFECTS as readonly string[]).includes(t.effect)) errors.push(`특성 ${key}: 모르는 효과 ${t.effect}`);
    if (!t.name || Object.keys(t.name).length === 0) errors.push(`특성 ${key}: 이름 없음`);
    if (t.effect === 'chainPower' && !t.chain) errors.push(`특성 ${key}: chainPower 는 chain`);
    if (t.chain !== undefined && !chainOk(t.chain)) errors.push(`특성 ${key}: chain ${String(t.chain)} 은 1~${known.maxChain}`);
    if (t.effect === 'elementDamage' && !(t.element && known.elements.includes(t.element))) errors.push(`특성 ${key}: elementDamage 는 아는 속성 element (${String(t.element)})`);
    for (const fac of Object.keys(t.name ?? {})) if (fac !== '*' && !known.factions.includes(fac)) errors.push(`특성 ${key}: 이름의 모르는 종족 ${fac}`);
    const tn = balance.traits[key];
    if (!tn) errors.push(`특성 ${key}: balance evoUniques.traits 에 수치 칸이 없다`);
    else for (const k of EVO_TRAIT_NUM_KEYS[t.effect] ?? []) if (typeof tn[k] !== 'number') errors.push(`특성 ${key}: balance 수치 ${k} 없음`);
  }
  for (const [formId, byFaction] of Object.entries(d.forms)) {
    if (!known.forms.includes(formId)) errors.push(`${formId}: FORM_TABLE 에 없는 진화체`);
    for (const [fac, e] of Object.entries(byFaction)) {
      const where = `${formId}.${fac}`;
      if (!known.factions.includes(fac)) errors.push(`${where}: 모르는 종족 ${fac}`);
      const nums = (balance.forms[formId]?.[fac] ?? {}) as EvoNums;
      const has = (v: EvoNum | undefined) => v === undefined || typeof v === 'number' || nums[v] !== undefined;
      if (e.trait && !d.traits[e.trait]) errors.push(`${where}: 모르는 특성 ${e.trait}`);
      if (e.release !== undefined && e.release !== 'none') errors.push(`${where}: release 는 'none' 만`);
      if (!has(e.extraPetSlots)) errors.push(`${where}: extraPetSlots 수치 키 없음`);
      if (!has(e.extraPetPower)) errors.push(`${where}: extraPetPower 수치 키 없음`);
      for (const k of Object.keys(nums.release ?? {})) if (nums[k] === undefined) errors.push(`${where}: release.${k} 의 기본 값이 없다`);
      const a = e.ability;
      if (!a) continue;
      if (!a.description) errors.push(`${where}: 설명 없음`);
      if (a.effortBasis !== undefined && a.effortBasis !== 'attackInterval') errors.push(`${where}: effortBasis 는 'attackInterval' 만 (${String(a.effortBasis)})`);
      // 체인 상한 넘기기 (C.514): 이 진화체 규칙의 chain 거르기는 계열 단계 수 + tiers 수까지
      const formMaxChain = known.maxChain + (a.chainExtend?.tiers?.length ?? 0);
      const formChainOk = (c: unknown) => Number.isInteger(c) && (c as number) >= 1 && (c as number) <= formMaxChain;
      if (a.chainExtend) {
        if (!has(a.chainExtend.max)) errors.push(`${where}: chainExtend.max 수치 키 없음`);
        if (!a.chainExtend.tiers || a.chainExtend.tiers.length === 0) errors.push(`${where}: chainExtend.tiers 비었음`);
        for (const [k, t] of (a.chainExtend.tiers ?? []).entries()) {
          if (!has(t.mult)) errors.push(`${where}: chainExtend.tiers[${k}].mult 수치 키 없음`);
          if (!t.name) errors.push(`${where}: chainExtend.tiers[${k}] 이름 없음`);
        }
        if (typeof a.chainExtend.max === 'number' && !(a.chainExtend.max >= 1 && a.chainExtend.max <= formMaxChain)) errors.push(`${where}: chainExtend.max 는 1~${formMaxChain}`);
      }
      for (const k of ['releaseSeconds', 'releaseHpFloor'] as const) if (!has(a[k])) errors.push(`${where}: ${k} 수치 키 없음`);
      for (const v of a.chainMultipliers ?? []) if (!has(v)) errors.push(`${where}: chainMultipliers 수치 키 없음`);
      const stacks = a.stacks ?? {};
      const buffs = a.buffs ?? {};
      const charges = a.charges ?? {};
      const specials = a.specials ?? {};
      for (const [n, sd] of Object.entries(stacks)) for (const v of [sd.max, sd.seconds]) if (!has(v)) errors.push(`${where}: 스택 ${n} 수치 키 없음`);
      for (const [n, sd] of Object.entries(stacks)) if (sd.maxPer !== undefined && sd.max === undefined) errors.push(`${where}: 스택 ${n} maxPer 는 max 와 같이`);
      const side = (on: unknown) => on === undefined || on === 'self' || on === 'foe';
      const mark = (m: EvoMark | undefined, what: string) => {
        if (m && (!m.icon || !m.name)) errors.push(`${where}: ${what} 표시(mark)에 icon·name 이 없다`);
      };
      for (const [n, sd] of Object.entries(stacks)) {
        if (!side(sd.on)) errors.push(`${where}: 스택 ${n} on 은 self·foe`);
        if (sd.overflow !== undefined && sd.overflow !== 'cap' && sd.overflow !== 'reset') errors.push(`${where}: 스택 ${n} overflow 는 cap·reset`);
        mark(sd.mark, `스택 ${n}`);
      }
      for (const [n, bd] of Object.entries(buffs)) {
        if (!side(bd.on)) errors.push(`${where}: 버프 ${n} on 은 self·foe`);
        mark(bd.mark, `버프 ${n}`);
      }
      for (const [n, cd] of Object.entries(charges)) {
        if (!has(cd.max)) errors.push(`${where}: 충전 ${n} 수치 키 없음`);
        mark(cd.mark, `충전 ${n}`);
      }
      for (const [n, sp] of Object.entries(specials)) if (sp.usable !== undefined && sp.usable !== 'always' && sp.usable !== 'execBlock') errors.push(`${where}: 특수 블록 ${n} usable 은 always·execBlock`);
      if (a.harden) {
        const h = a.harden;
        if (!chainOk(h.chain)) errors.push(`${where}: harden.chain ${String(h.chain)} 은 1~${known.maxChain}`);
        if (h.seconds === undefined || !has(h.seconds)) errors.push(`${where}: harden.seconds 수치 키 없음`);
        if (!h.name) errors.push(`${where}: harden 이름 없음`);
        if (h.stack !== undefined && !(h.stack in stacks)) errors.push(`${where}: harden.stack 스택 ${h.stack} 없음`);
        for (const x of h.element ?? []) if (!known.elements.includes(x)) errors.push(`${where}: harden 모르는 속성 ${x}`);
      }
      if (a.spawnRule !== undefined && a.spawnRule !== 'voidOnly') errors.push(`${where}: spawnRule 은 voidOnly 만`);
      const elementOk = (x: string) => x === VOID_ELEMENT || known.elements.includes(x);
      const whenOk = (w: unknown, at: string) => {
        if (w !== undefined && !EVO_WHEN.includes(w as string)) errors.push(`${at}: when 은 release·normal (${String(w)})`);
      };
      // on 'timer' 규칙은 같은 이름 시계를 맞추는(act 'timer') 효과가 있어야 돈다
      const timersSet = new Set((a.rules ?? []).flatMap((r) => (r.do ?? []).filter((x) => x.act === 'timer' && x.timer).map((x) => x.timer!)));
      for (const [n, sp] of Object.entries(specials)) {
        if (!sp.name || !sp.short) errors.push(`${where}: 특수 블록 ${n} 이름·글자 없음`);
        for (const v of [sp.fixed, sp.maxOnBar]) if (!has(v)) errors.push(`${where}: 특수 블록 ${n} 수치 키 없음`);
        if (sp.element !== undefined && !known.elements.includes(sp.element)) errors.push(`${where}: 특수 블록 ${n} 모르는 속성 ${sp.element}`);
      }
      // 자기 블록·출현 제외·다음 블록 강제 (C.515)
      if (a.selfBlock) {
        if (a.selfBlock.element !== 'self' && !known.elements.includes(a.selfBlock.element)) errors.push(`${where}: selfBlock 모르는 속성 ${a.selfBlock.element}`);
        if (!known.families(fac).includes(a.selfBlock.family)) errors.push(`${where}: selfBlock ${fac} 에 없는 블록 계열 ${a.selfBlock.family}`);
      }
      if ((a.passives ?? []).some((p) => p.stat === 'selfSpawn') && !a.selfBlock) errors.push(`${where}: selfSpawn 은 selfBlock 이 있어야`);
      for (const x of a.spawnExclude ?? []) if (!known.elements.includes(x)) errors.push(`${where}: spawnExclude 모르는 속성 ${x}`);
      mark(a.forceNextMark, 'forceNext');
      const shieldTimed = (a.rules ?? []).some((r) => (r.do ?? []).some((x) => x.act === 'shield' && x.seconds !== undefined));
      const src = (p: EvoSource | EvoSource[] | undefined) => {
        for (const x of p === undefined ? [] : Array.isArray(p) ? p : [p]) {
          const [kind, name] = x.split(':') as [string, string | undefined];
          const ok = ['chain', 'consumed', 'amount', 'damage', 'bar', 'lostHpPct', 'shieldPct', 'risk', 'one', 'maxHp', 'effort', 'blockLv'].includes(kind) && (name === undefined || kind === 'bar')
            || (kind === 'stack' && !!name && name in stacks) || (kind === 'buff' && !!name && name in buffs)
            || ((kind === 'charge' || kind === 'chargeValue') && !!name && name in charges);
          if (!ok) errors.push(`${where}: 모르는 per ${x}`);
        }
      };
      const need = (list: EvoNeed[] | undefined) => {
        for (const n of list ?? []) {
          if (n.stack && !(n.stack in stacks)) errors.push(`${where}: need 스택 ${n.stack} 없음`);
          if (n.buff && !(n.buff in buffs)) errors.push(`${where}: need 버프 ${n.buff} 없음`);
          if (n.charge && !(n.charge in charges)) errors.push(`${where}: need 충전 ${n.charge} 없음`);
          if (n.special && !(n.special in specials)) errors.push(`${where}: need 특수 블록 ${n.special} 없음`);
          src(n.atLeastPer);
        }
      };
      for (const sd of Object.values(stacks)) src(sd.maxPer);
      for (const sp of Object.values(specials)) need(sp.need);
      for (const [i, r] of (a.rules ?? []).entries()) {
        const at = `${where} 규칙 ${i}`;
        if (r.on === 'shieldEnd' && !shieldTimed) errors.push(`${at}: shieldEnd 는 시간 보호막(shield seconds)이 있어야`);
        if (r.heavy !== undefined && r.on !== 'hurt' && r.on !== 'shieldHit') errors.push(`${at}: heavy 는 hurt·shieldHit 에서만`);
        if (r.after) {
          if (r.on !== 'block' && r.on !== 'blockPre') errors.push(`${at}: after 는 block·blockPre 에서만`);
          for (const c of r.after.chain ?? []) if (!chainOk(c)) errors.push(`${at}: after chain ${String(c)} 은 1~${known.maxChain}`);
          for (const k of r.after.kind ?? []) if (!(EVO_BLOCK_KINDS as readonly string[]).includes(k)) errors.push(`${at}: after 모르는 블록 종류 ${k}`);
          for (const x of r.after.element ?? []) if (!elementOk(x)) errors.push(`${at}: after 모르는 속성 ${x}`);
        }
        if (!(EVO_TRIGGERS as readonly string[]).includes(r.on)) errors.push(`${at}: 모르는 트리거 ${r.on}`);
        if (r.on === 'every' && r.seconds === undefined) errors.push(`${at}: every 는 seconds`);
        if (r.on === 'special' && !(r.special && r.special in specials)) errors.push(`${at}: special 블록 없음`);
        if (r.on === 'timer' && !r.timer) errors.push(`${at}: timer 이름 없음`);
        if (r.on === 'timer' && r.timer && !timersSet.has(r.timer)) errors.push(`${at}: 시계 ${r.timer} 를 맞추는 act 'timer' 가 없다`);
        whenOk(r.when, at);
        for (const k of r.kind ?? []) if (!(EVO_BLOCK_KINDS as readonly string[]).includes(k)) errors.push(`${at}: 모르는 블록 종류 ${k}`);
        for (const x of [...(r.element ?? []), ...(r.notElement ?? [])]) if (!elementOk(x)) errors.push(`${at}: 모르는 속성 ${x}`);
        for (const c of r.chain ?? []) if (!formChainOk(c)) errors.push(`${at}: chain ${String(c)} 은 1~${formMaxChain}`);
        for (const f of r.family ?? []) if (!known.families(fac).includes(f)) errors.push(`${at}: ${fac} 에 없는 블록 계열 ${f}`);
        if (r.hardened !== undefined && !a.harden) errors.push(`${at}: hardened 거르기는 능력 칸 harden 이 있어야`);
        if ((r.family || r.hardened !== undefined) && !['block', 'blockPre'].includes(r.on)) errors.push(`${at}: family·hardened 거르기는 block·blockPre 에서만`);
        if (r.charge && !(r.charge in charges)) errors.push(`${at}: 충전 ${r.charge} 없음`);
        for (const v of numKeysOfRule(r)) if (!has(v)) errors.push(`${at}: 수치 키 ${String(v)} 없음`);
        need(r.need);
        if (!Array.isArray(r.do) || r.do.length === 0) errors.push(`${at}: do 비었음`);
        for (const x of r.do ?? []) {
          if (!(EVO_ACTIONS as readonly string[]).includes(x.act)) errors.push(`${at}: 모르는 효과 ${x.act}`);
          if (['add', 'mul', 'clear', 'consume'].includes(x.act) && !(x.stack && x.stack in stacks)) errors.push(`${at}: 스택 ${x.stack} 없음`);
          if (x.act === 'buff' && !(x.buff && x.buff in buffs)) errors.push(`${at}: 버프 ${x.buff} 없음`);
          if (x.act === 'buff' && x.seconds === undefined) errors.push(`${at}: 버프는 seconds`);
          if (x.act === 'charge' && !(x.charge && x.charge in charges)) errors.push(`${at}: 충전 ${x.charge} 없음`);
          if (x.act === 'spawn' && !(x.block === 'draw' || x.block === 'make' || (x.block && x.block in specials))) errors.push(`${at}: spawn block 은 draw·make 또는 특수 블록 id`);
          if (x.act === 'spawn' && x.block === 'make' && !x.element && !x.family) errors.push(`${at}: spawn make 는 element 또는 family`);
          if (x.act === 'useSpecial' && !(x.special && x.special in specials)) errors.push(`${at}: useSpecial 블록 없음`);
          if ((x.act === 'timer' || x.act === 'timerCut') && (!x.timer || x.seconds === undefined)) errors.push(`${at}: timer 는 이름·seconds`);
          if (x.act === 'shield' && x.cap === undefined) errors.push(`${at}: shield 는 cap`);
          if (x.act === 'hit' && !x.basis) errors.push(`${at}: hit 는 basis`);
          if (['blockMult', 'blockFlat', 'blockCrit', 'blockCritDmg', 'noDamage'].includes(x.act) && r.on !== 'blockPre') errors.push(`${at}: ${x.act} 는 blockPre 에서만`);
          if (['basicMult', 'forceCrit', 'ignoreDef', 'basicCrit'].includes(x.act) && r.on !== 'basicPre') errors.push(`${at}: ${x.act} 는 basicPre 에서만`);
          if (x.act === 'forceNext' && !(x.element && known.elements.includes(x.element))) errors.push(`${at}: forceNext 는 속성(element)`);
          if ((x.dot !== undefined || x.poison !== undefined) && x.act !== 'hit') errors.push(`${at}: dot·poison 은 hit 에서만`);
          if (x.act === 'absorbBar' && !x.element) errors.push(`${at}: absorbBar 는 element`);
          if (x.act === 'basicShot' && r.on !== 'basicPre') errors.push(`${at}: basicShot 는 basicPre 에서만`);
          if (x.category !== undefined && x.category !== 'physical' && x.category !== 'special') errors.push(`${at}: category 는 physical·special`);
          if (x.fx !== undefined && (!known.families(fac).includes(x.fx.family) || !chainOk(x.fx.stage))) errors.push(`${at}: fx 는 ${fac} 계열 id·단계 1~${known.maxChain}`);
          if (x.element !== undefined && x.element !== 'self' && !elementOk(x.element)) errors.push(`${at}: 모르는 속성 ${x.element}`);
          if (x.family !== undefined && !known.families(fac).includes(x.family)) errors.push(`${at}: ${fac} 에 없는 블록 계열 ${x.family}`);
          if (x.refresh !== undefined && !['replace', 'max', 'add'].includes(x.refresh)) errors.push(`${at}: refresh 는 replace·max·add`);
          if (x.basis !== undefined && !['basic', 'block', 'last', 'raw', 'void', 'foeMaxHp'].includes(x.basis)) errors.push(`${at}: 모르는 basis ${x.basis}`);
          if (x.of !== undefined && !['damage', 'maxHp', 'hit'].includes(x.of)) errors.push(`${at}: of 는 damage·maxHp·hit`);
          src(x.per);
          src(x.amountPer);
          if (x.grow) src(x.grow.per);
          if (x.secondsGrow) src(x.secondsGrow.per);
          if (x.secondsGrow && x.act !== 'buff') errors.push(`${at}: secondsGrow 는 buff 에서만`);
          src(x.secondsPer);
        }
      }
      for (const [i, p] of (a.passives ?? []).entries()) {
        if (!(EVO_STATS as readonly string[]).includes(p.stat)) errors.push(`${where} 효과 ${i}: 모르는 능력치 ${p.stat}`);
        for (const v of [p.value, p.max, p.step, p.grow?.value]) if (!has(v)) errors.push(`${where} 효과 ${i}: 수치 키 없음`);
        for (const n of p.need ?? []) if (!has(n.elapsedBelow) || !has(n.atLeast) || !has(n.below)) errors.push(`${where} 효과 ${i}: need 수치 키 없음`);
        whenOk(p.when, `${where} 효과 ${i}`);
        src(p.per);
        if (p.grow) src(p.grow.per);
        need(p.need);
      }
    }
  }
  return errors;
}
{
  const errors = validateEvoUniques();
  if (errors.length > 0) throw new Error(`진화체 고유 능력 데이터 오류:\n- ${errors.join('\n- ')}`);
}
