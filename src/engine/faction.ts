// 종족 설정(faction config) 타입과 검증. 종족 차이는 전부 이 설정에서 읽는다 (CLAUDE.md 규칙 2).
// 3번째 종족은 src/data/factions/<id>.json 하나로 추가된다.

import { isLocomotion, type Locomotion } from './locomotion';
import { ATTACK_CATEGORIES, STAT_IDS, type AttackCategory, type StatId, type Stats } from '../data/schema';
import { RANK_COUNT as RANK_NAME_COUNT } from '../data/ranks';
import { PET_IDS } from '../data/pets';
import { GEAR_SLOTS, type GearSlot } from '../data/gear';

/** 스킬 블록 역할 (GDD 3-5). 이름(표시)은 종족 설정이, 효과(로직)는 엔진이 정한다 */
export const BLOCK_ROLES = ['attack', 'guard', 'heal'] as const;
export type BlockRole = (typeof BLOCK_ROLES)[number];

/** 체인 단계 수 = 계열 기술 단계 수 (GDD 17-3: 같은 계열 연속 1·2·3개). BALANCE chainMultipliers 길이와 같다 */
export const FAMILY_TIERS = 3;

/** 계열 공격 연출 종류 (GDD 19-2): 화면은 종족이 아니라 이 id 별로 효과를 그린다. 새 계열은 이 중 하나를 고르거나 종류를 추가한다 */
export const ATTACK_FX_KINDS = ['claw', 'bite', 'shot', 'slash', 'impact', 'beam'] as const;
export type AttackFxKind = (typeof ATTACK_FX_KINDS)[number];

/** 계열 블록의 캐릭터 몸동작 (GDD 118장 2): strike = 맨손 타격(주먹·발차기) / slash = 칼 휘두르기 / cast = 손에서 쏘기(귀도). 없으면 특수 동작(skill) 그대로 */
export const FAMILY_MOTION_KINDS = ['strike', 'slash', 'cast'] as const;
export type FamilyMotionKind = (typeof FAMILY_MOTION_KINDS)[number];

/** 체인 묶음 상한 기본값 (GDD 19-2): 종족 설정 maxChain 이 없을 때 */
export const DEFAULT_MAX_CHAIN = 3;

/** 계열의 한 단계 기술 (GDD 17-3, 이름·수치 provisional). multiplier 는 위력 배율(기존 체인 ×1.0/×2.2/×3.6 을 이어받음), bonus 는 그 단계에 붙는 추가 효과 */
export interface FamilySkillConfig {
  name: string;
  /** 이 단계만 다른 연출 종류 (C.63, GDD 28장 13번 — 예: 호로 탄 3단계 세로 오스큐라스 = 빔). 없으면 계열 fx */
  fx?: AttackFxKind;
  /** 이 단계 고유 모양·색 (C.63): CSS 클래스 bha-afx--look-<id>, 색은 전용 토큰. 공격 이펙트 색 꾸밈을 입어도 유지 */
  fxLook?: string;
  multiplier: number;
  bonus?: { kind: 'stagger'; value: number };
}

/** 공격 계열 (GDD 17-3): 호로 조·교·탄 / 사신 참·권·귀. 특성의 family 가 이 id 를 가리킨다 */
export interface FamilyConfig {
  id: string;
  /** 계열 이름 (예 "조") */
  name: string;
  /** 블록 위에 쓰는 한 글자 */
  abbr: string;
  /** 공격 연출 종류 (GDD 19-2): 조=claw·교=bite·탄=shot / 참=slash·권=impact·귀=beam(단계별 tiers[].fx 로 바뀔 수 있다) */
  fx: AttackFxKind;
  /** 캐릭터 몸동작 (GDD 118장 2): 사신 권=strike·참=slash·귀=cast. 없으면 특수 동작 그대로(호로) */
  motion?: FamilyMotionKind;
  /** 공격 분류 (GDD 20-1·118장 2): 물리(조·권) / 특수(탄·귀) / 혼합(교·참). 피해 계산에 쓰는 능력치를 정한다 */
  category: AttackCategory;
  /** 1·2·3단계 기술 */
  tiers: [FamilySkillConfig, FamilySkillConfig, FamilySkillConfig];
  provisional?: boolean;
}

/** 둥지 행동 종류. 이름은 종족 설정이, 효과는 엔진(nest.ts)이 정한다 */
export const NEST_ACTIONS = ['feed', 'sleep', 'pet'] as const;
export type NestAction = (typeof NEST_ACTIONS)[number];

/** 먹이 종류 5종 (GDD 18-2). 수치는 BALANCE.provisional.nest.foods, 표시 이름은 종족 설정 foodNames */
export const FOOD_IDS = ['snack', 'basic', 'hearty', 'tonic', 'feast'] as const;
export type FoodId = (typeof FOOD_IDS)[number];

/** 슬롯 위치: 호로=본체(body), 사신=참백도(zanpakuto) (GDD 4장) */
export type SlotLocation = 'body' | 'zanpakuto';

/** 메인 방 화면의 물건 (GDD 16-1 4번, 18-3 훈련 인형). 이름은 종족 설정이 정한다 */
/** shop = 상점 (C.63, GDD 28장 9번: 더보기에서 방 물건으로 옮김, 이름은 종족 설정) */
export const ROOM_PROPS = ['door', 'altar', 'book', 'chest', 'shop', 'spa'] as const; // spa = 온천 (GDD 123장 4, C.198): 누르면 따로 된 온천 화면
export type RoomProp = (typeof ROOM_PROPS)[number];
/** hungry = 꺼 둔 동안 배고파졌을 때 다시 열면 한 번 하는 말 (GDD 24-1) */
/** 방 말풍선 키. askPet·askSleep = 돌봄 요청, refusePet·refuseSleep = 요청 없이 눌렀을 때 거절 (GDD 82장, C.133) */
/** 방 말풍선 키. collapsed = 쓰러짐, bondShy·bondClose·bondBest = 교감 단계 대사 (GDD 102-6 ④, C.175) */
export const ROOM_TALK = ['idle', 'tired', 'risk', 'weak', 'collapsed', 'happy', 'hungry', 'bondShy', 'bondClose', 'bondBest', 'askPet', 'askSleep', 'refusePet', 'refuseSleep', 'spit'] as const;
export type RoomTalk = (typeof ROOM_TALK)[number];

/** 해방 수련 종목 id (GDD 22-4, engine/training 의 TRAINING_GAMES 와 같은 순서) */
export const TRAINING_GAME_IDS = ['duel', 'dodge', 'clash', 'chain'] as const;

/** 해방 (GDD 83장): 버튼·블록·연출 문구. 5단계 전 = base*(양 종족 "영력 해방"), 5단계(BALANCE liberation.minTierIndex)부터 = 호로 "레스렉시온" / 사신 "만해" */
export interface LiberationConfig {
  /** 5단계 전 이름·컷인·풀릴 때 문구 */
  baseName: string;
  baseCutin: string;
  baseEndText: string;
  /** 5단계부터 버튼·상태 이름 */
  name: string;
  /** 해방하는 순간 짧은 컷인 한 줄 */
  cutin: string;
  /** 풀릴 때 로그 한 줄 (리스크 상승) */
  endText: string;
}

/** 환생 (GDD 22-1·22-7): 버튼·확인·연출 문구 */
export interface RebirthConfig {
  /** 버튼·화면 이름 */
  name: string;
  /** 연출 첫 줄 (몸이 풀려 처음으로 돌아간다) */
  cutin: string;
  /** 연출 끝 줄 (호로 "다시 굶주린 영혼으로", 사신 "다시 혼백으로") */
  rebornText: string;
}

/** 해방 수련 (GDD 22-4·22-5): 화면 제목·상대 이름·완료 문구·종목별 이름과 설명 (사신판 먹이사슬 = 영자 모으기·대허 피하기) */
export interface TrainingConfig {
  title: string;
  /** 본능(정령) 대결의 상대 */
  foe: string;
  completeText: string;
  games: Record<(typeof TRAINING_GAME_IDS)[number], { name: string; desc: string; shot?: string; prey?: string; predator?: string }>;
}

/** 바닥 다각형: 좌표는 배경 그림 크기 대비 0~1(왼쪽 위 = 0,0), aspect = 그림 가로÷세로 (장면은 cover 로 깔려 그림 일부가 잘린다) */
export interface RoomFloorConfig {
  aspect: number;
  poly: [number, number][];
}

/** 메인 방 화면 설정 (GDD 16장). 모두 선택 항목이라 비워도 기본값(DEFAULT_ROOM)이 쓰인다 */
export interface RoomConfig {
  /** 방 모양: bha-room--<shape> 클래스 (CSS 가 모양을 정한다. 예 cave / room) */
  shape: string;
  /** 그림 키 (src/data/art/manifest.ts) */
  sceneArt: string;
  characterArt: string;
  /** 소품 표시 이름 */
  props: Record<RoomProp, string>;
  /** 바닥(걷는 면) 범위 (GDD 95장 A1): 방 배경 그림 안의 다각형. 모든 물건·캐릭터·펫의 발 기준점은 이 안으로만 놓인다 */
  floor: RoomFloorConfig;
  /** 소품 위치 = 발 기준점(물건 그림 아래 가운데): 장면 가로 %·세로 %, scale = 크기 배율 (기본 1, GDD 34-6·95장). 이름표는 발 아래에 붙는다. 바닥 밖이면 바닥 안으로 끌어 놓는다 */
  layout: Record<RoomProp, { x: number; y: number; scale?: number }>;
  /** 캐릭터 발 기준점 (장면 %, 기본 가운데 아래) */
  characterFoot: { x: number; y: number };
  /** 캐릭터 반응 말풍선 문구 (상태별 여러 개 중 무작위) */
  talk: Record<RoomTalk, string[]>;
}

export const DEFAULT_ROOM: RoomConfig = {
  shape: 'room',
  sceneArt: 'scene.room',
  characterArt: 'char.hollow',
  props: { door: '문', altar: '수련장', book: '책장', chest: '상자', shop: '상점', spa: '온천' },
  floor: { aspect: 2, poly: [[0, 0.46], [1, 0.46], [1, 1], [0, 1]] },
  layout: {
    door: { x: 9, y: 78, scale: 1 }, book: { x: 76, y: 60, scale: 0.54 }, altar: { x: 90, y: 70, scale: 0.81 },
    chest: { x: 26, y: 90, scale: 0.81 }, shop: { x: 74, y: 90, scale: 0.54 }, spa: { x: 26, y: 61, scale: 0.54 },
  },
  characterFoot: { x: 50, y: 80 },
  talk: {
    idle: ['…'], tired: ['피곤하다…'], risk: ['머리가 아프다…'], weak: ['아직 몸이 무겁다…'], collapsed: ['…일어설 수가 없다.'], happy: ['좋아!'], bondShy: ['…'], bondClose: ['또 와 줬구나.'], bondBest: ['기다리고 있었어.'], hungry: ['배고파하고 있었다.'],
    askPet: ['교감하고 싶어.'], askSleep: ['졸려…'], refusePet: ['건드리지 마.'], refuseSleep: ['자고 싶지 않다.'],
    spit: ['더는 못 먹어…', '퉤! …더는 못 먹어.'], // 먹이 뱉음 (GDD 109장 6, C.181)
  },
};

/** 종족 설정의 room 에 빠진 값을 기본값으로 채운다. talkPack = 입은 말풍선 팩 id(GDD 25-11): 팩이 가진 키만 혼잣말 문구를 덮고, 없는 키는 기본 문구 */
export function roomOf(f: Pick<FactionConfig, 'room'> & Partial<Pick<FactionConfig, 'cosmetics'>>, talkPack?: string | null): RoomConfig {
  const r = f.room ?? {};
  const pack = talkPack ? f.cosmetics?.talkPacks?.[talkPack] : undefined;
  return {
    ...DEFAULT_ROOM,
    ...r,
    props: { ...DEFAULT_ROOM.props, ...r.props },
    floor: r.floor ?? DEFAULT_ROOM.floor,
    layout: { ...DEFAULT_ROOM.layout, ...r.layout },
    characterFoot: r.characterFoot ?? DEFAULT_ROOM.characterFoot,
    talk: { ...DEFAULT_ROOM.talk, ...r.talk, ...pack },
  };
}

/** 첫 시작 탄생 연출 단계 (GDD 74장): 공통 단계 재생기가 아는 효과 낱말. 종족은 이 낱말을 순서대로 나열할 뿐이다 */
export const BIRTH_FX_KINDS = ['orb', 'flicker', 'chain', 'burn', 'flash', 'flames', 'reveal'] as const;
export type BirthFxKind = (typeof BIRTH_FX_KINDS)[number];
/** 연출에 쓰는 색 역할 → 디자인 토큰 이름(--bha-…) */
export const BIRTH_FX_COLORS = ['orb', 'glow', 'chain', 'ember', 'flame', 'flameEdge', 'flash'] as const;
export type BirthFxColor = (typeof BIRTH_FX_COLORS)[number];
export interface BirthFxStep {
  fx: BirthFxKind;
  /** 이 단계 길이(ms) */
  ms: number;
  /** flicker = 깜빡임 횟수, chain/burn = 고리 수 (없으면 기본값) */
  count?: number;
}
export interface BirthFx {
  steps: BirthFxStep[];
  colors: Partial<Record<BirthFxColor, string>>;
}

export interface FactionConfig {
  id: string;
  /** 화면 표시 이름 */
  name: string;
  /** UI 테마 이름: 루트 data-bha-theme 값 (src/ui/bha/design-system/theme-<이름>.css 가 정의). 종족 id 로 분기하지 않고 이 값을 쓴다 */
  theme: string;
  /** 종족 고르기 화면의 큰 아이콘 (GDD 19-4): 이모티콘 한 개. 비우면 이름 첫 글자 */
  emblem?: string;
  /** 종족 로고 그림 키 (GDD 50): public/art/<키>.png|webp, 단색 투명 그림 — 알파만 쓰고 테마 글자색으로 칠한다. 없으면 로고 자리를 비운다 */
  logo?: string;
  /** 첫 시작 탄생 연출 (GDD 74장, C.126): 단계 목록 + 색 토큰. 없으면 연출 없음 */
  birthFx?: BirthFx;
  /** 새 세이브 시작 외형 후보 (GDD 51): 스킨 id 목록. 기본 외형과 함께 균등 추첨한다. 없거나 비면 기본 외형만 */
  startLooks?: string[];
  /** 단계 외형 표 (GDD 53): 단계 번호(문자열) → 진화 순간 노력치 순위로 고르는 스킨 id. stat = 1위 능력치별, pairs = 1·2위 쌍(순서 무관, 먼저 판정). 없으면 기존 단계 그림 */
  /** 진화체 외형 표 (GDD 54): 진화체 id → 스킨 id 목록(둘 이상이면 진화 때 하나를 뽑아 look 에 고정). tierLooks 보다 먼저 본다. 없으면 tierLooks → 기존 단계 그림 */
  formLooks?: Record<string, string[]>;
  /** 성별 외형이 갈리는 첫 단계 번호 (GDD 114장 2, 1부터): 이 단계부터 여성은 여성 그림(그림 키 + `.f`)을 찾는다. 그 전 단계는 남녀 같은 그림. 없으면 외형이 갈리지 않는다 */
  genderLookFromTier?: number;
  tierLooks?: Record<string, { stat: Partial<Record<StatId, string>>; pairs?: { stats: [StatId, StatId]; look: string }[] }>;
  /** 육성 5단계 이름 (GDD 8-1) */
  tierNames: [string, string, string, string, string];
  /** 등급 번호 1~10 의 표시 이름 (GDD 21-1, [0] = 1번). 엔진은 번호만 다룬다 */
  rankNames: string[];
  /** 번호가 없는 상태의 표시 이름 (GDD 21-1 v4.4, 호로 "무번호") */
  unrankedName: string;
  /** 등급 한 칸을 부르는 낱말 (호로 번호 / 사신 석차) — 도움말 등 공용 문구용 (C.74) */
  rankUnitName: string;
  /** 등급전 이름과 결과 문구 ({rank} = 얻은 번호의 표시 이름). 오르는 방식은 양쪽 동일, 차이는 문구뿐 (GDD 21-1) */
  rankBattleName: string;
  rankWinText: string;
  rankLoseText: string;
  /** 전투 v2 블록 표시 이름 (GDD 3-5, v0.6 에서 tileNames 를 대체): 스킬 블록 / 공허 블록. SP 필살 블록 이름(specialBlockName)·SP 게이지 이름(spName)은 C.118 에 삭제 (GDD 66장) */
  skillBlockName: string;
  voidBlockName: string;
  /** 체인 표기 (예: "체인") */
  chainName: string;
  /** 스킬 블록 역할 → 종족별 표시 이름 (공격 / 막기 / 회복) */
  roleNames: Record<BlockRole, string>;
  /** 리스크 게이지 이름 (GDD 5장) */
  riskGaugeName: string;
  /** 흡수 행위 이름 (GDD 4장) */
  absorbActionName: string;
  slotLocation: SlotLocation;
  /** 흡수로 본체 외형이 변하는가 (호로 true, 사신 false) */
  appearanceChange: boolean;
  /** 패배 상태 이름 (GDD 1장) */
  defeatStateName: string;
  /** 육성 1단계부터 쓰는 기본 기술 이름: 호로=본체 능력, 사신=시해 (GDD 4장). 슬롯에 skill 특성이 없을 때 나오는 기본 블록 이름 */
  basicSkillName: string;
  /** 안정 수치 이름: 두 종족 모두 영압 안정도 (GDD 102-5, 옛 호로 자아). 컨디션·허기와 별개 */
  stabilityName: string;
  /** 배부름 게이지 이름 (C.63, GDD 28장 10번): 화면은 허기를 뒤집어 "가득 → 줄어듦"으로 보인다 */
  fullnessName: string;
  /** 흡수 특성 슬롯 이름 (슬롯 위치 slotLocation 과 짝): 본체 슬롯 / 참백도 슬롯 */
  slotName: string;
  /** 계통 보너스 표기: 호로 계열 기술 강화 / 사신 참백도 속성 확정 (GDD 4장, 효과 수치는 엔진 공통) */
  lineageBonusName: string;
  /** 특성 종류 표기 (GDD 4장): 기술·시해 능력 / 패시브 / 외형·참백도 파츠 */
  traitKindNames: Record<'skill' | 'passive' | 'part', string>;
  /** 리스크 한계 돌파 연출 문구 */
  breakthroughText: string;
  /** 한계 돌파 = 폭주 상태 이름 (GDD 23-2): 호로 "폭주", 사신 "호로화" (GDD 102-5). 원정·전투 화면 상태 칩과 결과 화면에 쓴다 */
  frenzyName: string;
  /** 사냥터 이름 (GDD 6장) */
  huntingGroundName: string;
  /** 사냥터별 이름·한 줄 설명 (GDD 24-2, 자리 표시): 사냥터 id(src/data/grounds) → 표시. 없는 사냥터는 huntingGroundName + 번호 */
  huntingGrounds?: Record<string, { name: string; desc?: string; bg?: string }>;
  /** 등급전·보스전 무대 배경 장면 id (GDD 34-1, src/data/art/backgrounds.json). 없으면 그 사냥터 배경 / 임시 배경 */
  arenaBg?: string;
  /** 원정 난이도 표시 문구 (GDD 32-1 9번, C.75): 이름·★ 글자·"권장" 표시·잠김 문구({tier} = 열리는 단계 번호). 없으면 기본 문구 (difficultyLabels) */
  difficulty?: { name?: string; star?: string; recommended?: string; locked?: string };
  /** 도전의 탑 문구 (GDD 36장, C.85): 이름·층 표시({n})·꼭대기 보스 이름·잠김 문구·한 줄 설명. 없으면 기본 문구 (towerLabels) */
  tower?: Partial<TowerLabels> & { starGrounds?: Record<string, string> };
  /** 원정 걷기 애니메이션 이름 슬롯 (GDD 17-1): 화면이 bha-walker--<이름> 클래스를 붙이고 CSS 가 모양을 정한다. 비우면 'plain' */
  walkAnim?: string;
  /** 1단계(진화 전) 캐릭터의 이동 방식 기본값 (GDD 18-11). 비우면 walk. 진화체·그림 manifest 가 있으면 그쪽이 우선 */
  locomotion?: Locomotion;
  /** 공격 계열 목록과 단계별 기술 (GDD 17-3). 특성 family 가 가리키는 계열은 모두 여기 있어야 한다 */
  families: FamilyConfig[];
  /** 1단계(진화 전) 체인 묶음 상한 (GDD 19-2). 비우면 DEFAULT_MAX_CHAIN. 진화체 maxChain 이 있으면 그쪽이 우선 */
  maxChain?: number;
  /** 1단계(진화 전) 종족값 (GDD 20-4). 합계는 BALANCE.provisional.stats.tierTotals[0] */
  baseStats: Stats;
  /** 상성 표시 문구 (GDD 20-2): 강할 때 / 약할 때 */
  matchupText: { strong: string; weak: string };
  /** 진화 임박 알림 문구 (GDD 20-5 v4.1): 남은 걸음 20% / 10% 순간 한 번씩 */
  evolutionNearText: [string, string];
  /** 둥지 / 대원실 (GDD 7장) */
  nestName: string;
  /** 둥지 행동 이름 (GDD 7장): 먹이 / 재우기 / 교감(참백도 손질) */
  nestActions: Record<NestAction, string>;
  /** 홈 독 버튼에 쓰는 짧은 이름 (GDD 100장 #14, 4글자 안팎). 없는 행동은 nestActions */
  nestActionsShort?: Partial<Record<NestAction, string>>;
  /** 종족 선택 카드 아래 한 줄 소개 (GDD 100장 #6). 없으면 생략 */
  tagline?: string;
  /** 먹이 종류 이름 (GDD 18-2, 임시) */
  foodNames: Record<FoodId, string>;
  /** 펫 이름 (GDD 90장, 가칭): 펫 id → 이름 */
  petNames: Record<string, string>;
  /** 장비 칸 이름 (GDD 91장 1번, 가칭): 무기·방어구·신발·장신구 1·2 → 이름. 장비 종류 이름은 그 종류의 첫 칸 이름 */
  gearSlotNames: Record<GearSlot, string>;
  /** 장비 화면 문구 (GDD 108장 6번): 화면·방 버튼 이름(title), 소모품 칸 이름(battleSlot). 없으면 '장비'·'소모품' */
  gearScreen?: { title?: string; battleSlot?: string };
  /** 해방 (GDD 22-5): 이름·컷인·풀릴 때 문구 */
  liberation: LiberationConfig;
  /** 해방 수련 (GDD 22-5): 제단 화면·4종목 문구 */
  training: TrainingConfig;
  /** 환생 (GDD 22-7): 버튼 이름·연출 문구 */
  rebirth: RebirthConfig;
  /** 상점 꾸밈의 종족 표시 이름·말풍선 팩 문구 (GDD 25-11): names = 품목 id → 표시 이름(방 테마·말풍선 팩·키링), talkPacks = 팩 id → 방 혼잣말 키별 문구(없는 키는 기본 문구),
   *  keyringShapes = 키링 품목 id → 그림 모양 키(GDD 27장, 없으면 품목의 look) */
  cosmetics?: { names?: Record<string, string>; talkPacks?: Record<string, Partial<Record<RoomTalk, string[]>>>; keyringShapes?: Record<string, string> };
  /** 메인 방 화면: 방 모양·소품 이름·위치·그림 키·반응 문구 (GDD 16장). 없으면 기본값 */
  room?: Partial<Omit<RoomConfig, 'props' | 'layout' | 'talk'>> & { props?: Partial<RoomConfig['props']>; layout?: Partial<RoomConfig['layout']>; talk?: Partial<RoomConfig['talk']> };
}

function isString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

function isRec(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isStringTuple(v: unknown, n: number): boolean {
  return Array.isArray(v) && v.length === n && v.every(isString);
}

/** 모르는 JSON 을 종족 설정으로 검증한다. 문제가 있으면 무엇이 틀렸는지 담아 던진다 */
export function parseFactionConfig(raw: unknown): FactionConfig {
  const errors: string[] = [];
  const r = (raw ?? {}) as Record<string, unknown>;
  for (const k of ['id', 'name', 'theme', 'riskGaugeName', 'absorbActionName', 'defeatStateName', 'huntingGroundName', 'basicSkillName', 'nestName', 'stabilityName', 'fullnessName', 'slotName', 'lineageBonusName', 'breakthroughText', 'frenzyName', 'skillBlockName', 'voidBlockName', 'chainName', 'unrankedName', 'rankUnitName', 'rankBattleName', 'rankWinText', 'rankLoseText']) {
    if (!isString(r[k])) errors.push(`${k}: 비어 있지 않은 문자열이어야 한다`);
  }
  if (!isStringTuple(r.tierNames, 5)) errors.push('tierNames: 문자열 5개여야 한다');
  if (!isStringTuple(r.rankNames, RANK_NAME_COUNT)) errors.push(`rankNames: 문자열 ${RANK_NAME_COUNT}개여야 한다 (번호 1~${RANK_NAME_COUNT})`);
  const rn = (r.roleNames ?? {}) as Record<string, unknown>;
  for (const role of BLOCK_ROLES) {
    if (!isString(rn[role])) errors.push(`roleNames.${role}: 비어 있지 않은 문자열이어야 한다`);
  }
  const tk = (r.traitKindNames ?? {}) as Record<string, unknown>;
  for (const k of ['skill', 'passive', 'part']) {
    if (!isString(tk[k])) errors.push(`traitKindNames.${k}: 비어 있지 않은 문자열이어야 한다`);
  }
  const na = (r.nestActions ?? {}) as Record<string, unknown>;
  for (const a of NEST_ACTIONS) {
    if (!isString(na[a])) errors.push(`nestActions.${a}: 비어 있지 않은 문자열이어야 한다`);
  }
  const fn = (r.foodNames ?? {}) as Record<string, unknown>;
  for (const f of FOOD_IDS) {
    if (!isString(fn[f])) errors.push(`foodNames.${f}: 비어 있지 않은 문자열이어야 한다`);
  }
  const gn = (r.gearSlotNames ?? {}) as Record<string, unknown>;
  for (const id of GEAR_SLOTS) {
    if (!isString(gn[id])) errors.push(`gearSlotNames.${id}: 비어 있지 않은 문자열이어야 한다`);
  }
  if (r.gearScreen !== undefined) {
    const gs = r.gearScreen as Record<string, unknown>;
    if (typeof gs !== 'object' || gs === null || Array.isArray(gs)) errors.push('gearScreen: { title?, battleSlot? }');
    else for (const k of ['title', 'battleSlot']) if (gs[k] !== undefined && !isString(gs[k])) errors.push(`gearScreen.${k}: 비어 있지 않은 문자열`);
  }
  const pn = (r.petNames ?? {}) as Record<string, unknown>;
  for (const id of PET_IDS) {
    if (!isString(pn[id])) errors.push(`petNames.${id}: 비어 있지 않은 문자열이어야 한다`);
  }
  if (r.difficulty !== undefined) {
    const d = r.difficulty as Record<string, unknown>;
    if (typeof d !== 'object' || d === null || Array.isArray(d)) errors.push('difficulty: { name?, star?, recommended?, locked? }');
    else for (const k of ['name', 'star', 'recommended', 'locked']) if (d[k] !== undefined && !isString(d[k])) errors.push(`difficulty.${k}: 비어 있지 않은 문자열`);
  }
  if (r.tower !== undefined) {
    const t = r.tower as Record<string, unknown>;
    if (typeof t !== 'object' || t === null || Array.isArray(t)) errors.push('tower: { name?, floor?, finalBossName?, locked?, desc? }');
    else {
      for (const k of TOWER_LABEL_KEYS) if (t[k] !== undefined && !isString(t[k])) errors.push(`tower.${k}: 비어 있지 않은 문자열`);
      const sg = t.starGrounds as Record<string, unknown> | undefined;
      if (sg !== undefined && (typeof sg !== 'object' || sg === null || Array.isArray(sg) || Object.values(sg).some((v) => !isString(v)))) errors.push('tower.starGrounds: { ★: 사냥터 id }');
    }
  }
  if (r.huntingGrounds !== undefined) {
    const hg = r.huntingGrounds as Record<string, unknown>;
    if (typeof hg !== 'object' || hg === null || Array.isArray(hg)) errors.push('huntingGrounds: { 사냥터 id: { name, desc? } }');
    else for (const [k, v] of Object.entries(hg)) {
      const x = (v ?? {}) as Record<string, unknown>;
      if (!isString(x.name) || (x.desc !== undefined && typeof x.desc !== 'string') || (x.bg !== undefined && !isString(x.bg))) errors.push(`huntingGrounds.${k}: { name: 문자열, desc?: 문자열, bg?: 배경 장면 id }`);
    }
  }
  if (r.arenaBg !== undefined && !isString(r.arenaBg)) errors.push('arenaBg: 배경 장면 id');
  const fams = r.families;
  if (!Array.isArray(fams) || fams.length === 0) errors.push('families: 계열 1개 이상');
  else {
    const seen = new Set<string>();
    fams.forEach((f: unknown, i: number) => {
      const x = (f ?? {}) as Record<string, unknown>;
      if (!isString(x.id) || seen.has(x.id)) errors.push(`families[${i}].id: 비어 있지 않고 겹치지 않는 문자열`);
      else seen.add(x.id);
      if (!isString(x.name)) errors.push(`families[${i}].name: 비어 있지 않은 문자열`);
      if (!isString(x.abbr) || Array.from(x.abbr).length !== 1) errors.push(`families[${i}].abbr: 한 글자`);
      if (!(ATTACK_FX_KINDS as readonly unknown[]).includes(x.fx)) errors.push(`families[${i}].fx: ${ATTACK_FX_KINDS.join(' | ')}`);
      if (x.motion !== undefined && !(FAMILY_MOTION_KINDS as readonly unknown[]).includes(x.motion)) errors.push(`families[${i}].motion: ${FAMILY_MOTION_KINDS.join(' | ')}`);
      if (!(ATTACK_CATEGORIES as readonly unknown[]).includes(x.category)) errors.push(`families[${i}].category: ${ATTACK_CATEGORIES.join(' | ')}`);
      const tiers = x.tiers;
      if (!Array.isArray(tiers) || tiers.length !== FAMILY_TIERS) errors.push(`families[${i}].tiers: 기술 ${FAMILY_TIERS}개`);
      else {
        tiers.forEach((t: unknown, k: number) => {
          const y = (t ?? {}) as Record<string, unknown>;
          if (!isString(y.name)) errors.push(`families[${i}].tiers[${k}].name: 비어 있지 않은 문자열`);
          if (!(typeof y.multiplier === 'number' && y.multiplier > 0)) errors.push(`families[${i}].tiers[${k}].multiplier: 양수`);
          if (y.fx !== undefined && !(ATTACK_FX_KINDS as readonly unknown[]).includes(y.fx)) errors.push(`families[${i}].tiers[${k}].fx: ${ATTACK_FX_KINDS.join(' | ')}`);
          if (y.fxLook !== undefined && !(typeof y.fxLook === 'string' && /^[a-z0-9-]+$/.test(y.fxLook))) errors.push(`families[${i}].tiers[${k}].fxLook: 소문자·숫자·하이픈 id`);
          if (y.bonus !== undefined) {
            const b = y.bonus as Record<string, unknown>;
            if (b.kind !== 'stagger' || !(typeof b.value === 'number' && b.value > 0)) errors.push(`families[${i}].tiers[${k}].bonus: { kind: stagger, value: 양수 }`);
          }
        });
      }
    });
  }
  const bs = (r.baseStats ?? {}) as Record<string, unknown>;
  for (const k of STAT_IDS) if (!(typeof bs[k] === 'number' && (bs[k] as number) > 0)) errors.push(`baseStats.${k}: 양수`);
  const mt = (r.matchupText ?? {}) as Record<string, unknown>;
  if (!isString(mt.strong) || !isString(mt.weak)) errors.push('matchupText: { strong, weak } 문자열');
  if (!isStringTuple(r.evolutionNearText, 2)) errors.push('evolutionNearText: 문자열 2개');
  if (r.maxChain !== undefined && !(Number.isInteger(r.maxChain) && (r.maxChain as number) >= 1)) errors.push('maxChain: 1 이상 정수');
  if (r.locomotion !== undefined && !isLocomotion(r.locomotion)) errors.push('locomotion: float | walk | fly');
  if (r.emblem !== undefined && !isString(r.emblem)) errors.push('emblem: 비어 있지 않은 문자열이어야 한다');
  if (r.logo !== undefined && !isString(r.logo)) errors.push('logo: 비어 있지 않은 문자열이어야 한다');
  if (r.birthFx !== undefined) {
    const b = r.birthFx;
    const steps = isRec(b) ? b.steps : null;
    if (!isRec(b) || !Array.isArray(steps) || steps.length === 0) errors.push('birthFx: { steps: [...], colors } 단계가 하나 이상');
    else {
      for (const st of steps) {
        if (!isRec(st) || !(BIRTH_FX_KINDS as readonly string[]).includes(st.fx as string) || !(typeof st.ms === 'number' && st.ms >= 100 && st.ms <= 2500)) errors.push(`birthFx.steps: fx ${BIRTH_FX_KINDS.join('|')} · ms 100~2500`);
        else if (st.count !== undefined && !(Number.isInteger(st.count) && (st.count as number) >= 1 && (st.count as number) <= 20)) errors.push('birthFx.steps: count 1~20 정수');
      }
      const total = steps.reduce((a: number, st) => a + (isRec(st) && typeof st.ms === 'number' ? st.ms : 0), 0);
      if (total > 5000) errors.push('birthFx: 전체 5000ms 이하');
      const cols = b.colors;
      if (!isRec(cols) || !Object.entries(cols).every(([k, v]) => (BIRTH_FX_COLORS as readonly string[]).includes(k) && isString(v) && /^--bha-[a-z0-9-]+$/.test(v))) errors.push('birthFx.colors: 색 역할 → --bha-… 토큰 이름');
    }
  }
  if (r.genderLookFromTier !== undefined && !(typeof r.genderLookFromTier === 'number' && Number.isInteger(r.genderLookFromTier) && r.genderLookFromTier >= 1)) errors.push('genderLookFromTier: 1 이상 정수(단계 번호)');
  if (r.startLooks !== undefined && !(Array.isArray(r.startLooks) && r.startLooks.every((x) => isString(x)))) errors.push('startLooks: 스킨 id 문자열 목록');
  if (r.formLooks !== undefined && !(isRec(r.formLooks) && Object.values(r.formLooks).every((v) => Array.isArray(v) && v.length > 0 && v.every((x) => isString(x))))) errors.push('formLooks: { 진화체 id: [스킨 id, …](비어 있지 않게) }');
  if (r.tierLooks !== undefined) {
    const tl = r.tierLooks;
    const okLook = (v: unknown) => isString(v);
    const okTier = (t: unknown) => {
      if (!isRec(t)) return false;
      const st = (t as Record<string, unknown>).stat;
      const pairs = (t as Record<string, unknown>).pairs;
      return isRec(st) && Object.entries(st).every(([k, v]) => (STAT_IDS as readonly string[]).includes(k) && okLook(v))
        && (pairs === undefined || (Array.isArray(pairs) && pairs.every((p) => isRec(p) && Array.isArray((p as Record<string, unknown>).stats) && ((p as Record<string, unknown>).stats as unknown[]).length === 2 && ((p as Record<string, unknown>).stats as unknown[]).every((s) => (STAT_IDS as readonly string[]).includes(String(s))) && okLook((p as Record<string, unknown>).look))));
    };
    if (!isRec(tl) || !Object.entries(tl).every(([k, v]) => /^[1-9]\d*$/.test(k) && okTier(v))) errors.push('tierLooks: { 단계번호: { stat: {능력치: 스킨 id}, pairs?: [{ stats: [a, b], look }] } }');
  }
  if (r.walkAnim !== undefined && !isString(r.walkAnim)) errors.push('walkAnim: 비어 있지 않은 문자열이어야 한다');
  if (r.room !== undefined) {
    const rm = r.room as Record<string, unknown>;
    for (const k of ['shape', 'sceneArt', 'characterArt']) if (rm[k] !== undefined && !isString(rm[k])) errors.push(`room.${k}: 비어 있지 않은 문자열이어야 한다`);
    for (const k of Object.keys((rm.props ?? {}) as object)) if (!(ROOM_PROPS as readonly string[]).includes(k) || !isString((rm.props as Record<string, unknown>)[k])) errors.push(`room.props.${k}: 알 수 없는 물건이거나 문자열이 아니다`);
    if (rm.floor !== undefined) {
      const fl = rm.floor as Record<string, unknown>;
      const okPt = (p: unknown) => Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === 'number' && n >= 0 && n <= 1);
      if (!isRec(fl) || typeof fl.aspect !== 'number' || !(fl.aspect > 0) || !Array.isArray(fl.poly) || fl.poly.length < 3 || !fl.poly.every(okPt)) errors.push('room.floor: { aspect: 가로÷세로, poly: [[x, y] ×3 이상, 0~1] } 이어야 한다');
    }
    const okPct = (p: unknown) => isRec(p) && typeof p.x === 'number' && typeof p.y === 'number' && p.x >= 0 && p.x <= 100 && p.y >= 0 && p.y <= 100;
    if (rm.characterFoot !== undefined && !okPct(rm.characterFoot)) errors.push('room.characterFoot: { x, y } 장면 % (0~100) 이어야 한다');
    for (const [k, v] of Object.entries((rm.talk ?? {}) as Record<string, unknown>)) if (!(ROOM_TALK as readonly string[]).includes(k) || !Array.isArray(v) || v.length === 0 || !v.every(isString)) errors.push(`room.talk.${k}: 비어 있지 않은 문자열 목록이어야 한다`);
  }
  if (r.cosmetics !== undefined) {
    const cs = (r.cosmetics ?? {}) as Record<string, unknown>;
    for (const [k, v] of Object.entries((cs.names ?? {}) as Record<string, unknown>)) if (!isString(v)) errors.push(`cosmetics.names.${k}: 비어 있지 않은 문자열이어야 한다`);
    for (const [k, v] of Object.entries((cs.keyringShapes ?? {}) as Record<string, unknown>)) if (!isString(v) || !/^[a-z]+$/.test(v)) errors.push(`cosmetics.keyringShapes.${k}: 영문 소문자 모양 키여야 한다`);
    for (const [pk, pv] of Object.entries((cs.talkPacks ?? {}) as Record<string, unknown>)) {
      for (const [k, v] of Object.entries((pv ?? {}) as Record<string, unknown>)) if (!(ROOM_TALK as readonly string[]).includes(k) || !Array.isArray(v) || v.length === 0 || !v.every(isString)) errors.push(`cosmetics.talkPacks.${pk}.${k}: 알려진 혼잣말 키의 비어 있지 않은 문자열 목록이어야 한다`);
    }
  }
  const lb = (r.liberation ?? {}) as Record<string, unknown>;
  for (const k of ['baseName', 'baseCutin', 'baseEndText', 'name', 'cutin', 'endText']) if (!isString(lb[k])) errors.push(`liberation.${k}: 비어 있지 않은 문자열이어야 한다`);
  const rb = (r.rebirth ?? {}) as Record<string, unknown>;
  for (const k of ['name', 'cutin', 'rebornText']) if (!isString(rb[k])) errors.push(`rebirth.${k}: 비어 있지 않은 문자열이어야 한다`);
  const tr = (r.training ?? {}) as Record<string, unknown>;
  for (const k of ['title', 'foe', 'completeText']) if (!isString(tr[k])) errors.push(`training.${k}: 비어 있지 않은 문자열이어야 한다`);
  const tg = (tr.games ?? {}) as Record<string, unknown>;
  for (const g of TRAINING_GAME_IDS) {
    const x = (tg[g] ?? {}) as Record<string, unknown>;
    if (!isString(x.name) || !isString(x.desc)) errors.push(`training.games.${g}: { name, desc } 문자열`);
  }
  for (const k of ['shot']) if (!isString(((tg.dodge ?? {}) as Record<string, unknown>)[k])) errors.push(`training.games.dodge.${k}: 비어 있지 않은 문자열이어야 한다`);
  for (const k of ['prey', 'predator']) if (!isString(((tg.chain ?? {}) as Record<string, unknown>)[k])) errors.push(`training.games.chain.${k}: 비어 있지 않은 문자열이어야 한다`);
  if (r.slotLocation !== 'body' && r.slotLocation !== 'zanpakuto') errors.push('slotLocation: body | zanpakuto');
  if (typeof r.appearanceChange !== 'boolean') errors.push('appearanceChange: boolean');
  if (errors.length > 0) throw new Error(`종족 설정 오류 (${String(r.id ?? '?')}):\n- ${errors.join('\n- ')}`);
  return raw as FactionConfig;
}

/** 종족 고르기 화면에 크게 띄울 아이콘: 설정의 이모티콘, 없으면 이름 첫 글자 */
export function emblemOf(f: Pick<FactionConfig, 'emblem' | 'name'>): string {
  return f.emblem ?? Array.from(f.name)[0] ?? '?';
}

/** 체인 묶음 상한 (GDD 19-2, 순수): 진화체 값 > 종족 설정 기본값 > DEFAULT_MAX_CHAIN */
export function resolveMaxChain(f: Pick<FactionConfig, 'maxChain'>, formMaxChain?: number | null): number {
  return formMaxChain ?? f.maxChain ?? DEFAULT_MAX_CHAIN;
}

/** 블록 표시 이름의 고정 낱말 (GDD 20장 v5.4: 종족 무관). 종족 설정의 옛 블록 이름(basicSkillName 등)은 블록 바·전투 로그·연습 결과·도움말에 쓰지 않는다. `special`(필살 블록)은 C.118, `stored`(저장 필살)은 C.134 에 삭제 */
export const BLOCK_WORDS = { void: '공허', combo: '콤보', guard: '막기', heal: '회복', liberation: '해방' } as const;

/** 계열 설정 한 개 (없으면 undefined) */
export function familyOf(f: Pick<FactionConfig, 'families'>, familyId: string): FamilyConfig | undefined {
  return f.families.find((x) => x.id === familyId);
}

/** 원정 난이도 문구 (GDD 32-1): 종족 설정 difficulty, 빈 곳은 기본 문구 */
export function difficultyLabels(f: Pick<FactionConfig, 'difficulty'>): { name: string; star: string; recommended: string; locked: string } {
  const d = f.difficulty ?? {};
  return { name: d.name ?? '난이도', star: d.star ?? '★', recommended: d.recommended ?? '권장', locked: d.locked ?? '{tier}단계에 열린다' };
}

export interface TowerLabels {
  /** 탑 이름 ("도전의 탑") */
  name: string;
  /** 층 표시 ({n} = 층 번호) */
  floor: string;
  /** 꼭대기 층 보스 이름 */
  finalBossName: string;
  /** 잠겼을 때 한 줄 */
  locked: string;
  /** 탑 화면 머리 한 줄 설명 */
  desc: string;
}
const TOWER_LABEL_KEYS: readonly (keyof TowerLabels)[] = ['name', 'floor', 'finalBossName', 'locked', 'desc'];

/** 도전의 탑 문구 (GDD 36장): 종족 설정 tower, 빈 곳은 기본 문구 */
export function towerLabels(f: Pick<FactionConfig, 'tower'>): TowerLabels {
  const t = f.tower ?? {};
  return {
    name: t.name ?? '도전의 탑', floor: t.floor ?? '{n}층', finalBossName: t.finalBossName ?? '탑의 주인',
    locked: t.locked ?? '스토리 1장을 깨면 열린다', desc: t.desc ?? '한 층이 한 판이다. 체력 가득으로 시작하고 져도 잃는 것이 없다.',
  };
}

/** "12층" 같은 층 표시 */
export function towerFloorText(f: Pick<FactionConfig, 'tower'>, floor: number): string {
  return towerLabels(f).floor.replace('{n}', String(floor));
}

/** "★3" 같은 난이도 표시 */
export function difficultyText(f: Pick<FactionConfig, 'difficulty'>, star: number): string {
  return `${difficultyLabels(f).star}${star}`;
}

/** 탑 층의 배경 장면 id (GDD 40장, C.92): 보스 층 = arenaBg, 보통 층 = 종족 설정 tower.starGrounds[★] 사냥터의 bg */
export function towerBgId(f: Pick<FactionConfig, 'tower' | 'huntingGrounds' | 'arenaBg'>, floor: { star: number; kind: string }): string | undefined {
  if (floor.kind === 'boss') return f.arenaBg;
  return groundBgId(f, f.tower?.starGrounds?.[String(floor.star)]);
}

/** 사냥터 배경 장면 id (GDD 34-1): 종족 설정 huntingGrounds.<id>.bg. 없으면 undefined (임시 배경) */
export function groundBgId(f: Pick<FactionConfig, 'huntingGrounds'>, groundId: string | undefined): string | undefined {
  return groundId ? f.huntingGrounds?.[groundId]?.bg : undefined;
}

/** 사냥터 표시 이름 (GDD 24-2): 종족 설정 huntingGrounds, 없으면 "사냥터 이름 n" (n = 데이터 순서) */
export function groundName(f: Pick<FactionConfig, 'huntingGroundName' | 'huntingGrounds'>, groundId: string, index = 0): string {
  return f.huntingGrounds?.[groundId]?.name ?? `${f.huntingGroundName} ${index + 1}`;
}
