// 종족 설정(faction config) 타입과 검증. 종족 차이는 전부 이 설정에서 읽는다 (CLAUDE.md 규칙 2).
// 3번째 종족은 src/data/factions/<id>.json 하나로 추가된다.

import { isLocomotion, type Locomotion } from './locomotion';
import { ATTACK_CATEGORIES, STAT_IDS, type AttackCategory, type Stats } from '../data/schema';
import { RANK_COUNT as RANK_NAME_COUNT } from '../data/ranks';

/** 스킬 블록 역할 (GDD 3-5). 이름(표시)은 종족 설정이, 효과(로직)는 엔진이 정한다 */
export const BLOCK_ROLES = ['attack', 'guard', 'heal'] as const;
export type BlockRole = (typeof BLOCK_ROLES)[number];

/** 체인 단계 수 = 계열 기술 단계 수 (GDD 17-3: 같은 계열 연속 1·2·3개). BALANCE chainMultipliers 길이와 같다 */
export const FAMILY_TIERS = 3;

/** 계열 공격 연출 종류 (GDD 19-2): 화면은 종족이 아니라 이 id 별로 효과를 그린다. 새 계열은 이 중 하나를 고르거나 종류를 추가한다 */
export const ATTACK_FX_KINDS = ['claw', 'bite', 'shot', 'slash', 'impact', 'beam'] as const;
export type AttackFxKind = (typeof ATTACK_FX_KINDS)[number];

/** 체인 묶음 상한 기본값 (GDD 19-2): 종족 설정 maxChain 이 없을 때 */
export const DEFAULT_MAX_CHAIN = 3;

/** 계열의 한 단계 기술 (GDD 17-3, 이름·수치 provisional). multiplier 는 위력 배율(기존 체인 ×1.0/×2.2/×3.6 을 이어받음), bonus 는 그 단계에 붙는 추가 효과 */
export interface FamilySkillConfig {
  name: string;
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
  /** 공격 연출 종류 (GDD 19-2): 조=claw·교=bite·탄=shot / 참=slash·권=impact·귀=beam */
  fx: AttackFxKind;
  /** 공격 분류 (GDD 20-1): 물리(조·참) / 특수(탄·귀) / 혼합(교·권). 피해 계산에 쓰는 능력치를 정한다 */
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
export const ROOM_PROPS = ['door', 'altar', 'book', 'chest', 'window', 'dummy'] as const;
export type RoomProp = (typeof ROOM_PROPS)[number];
export const ROOM_TALK = ['idle', 'tired', 'risk', 'weak', 'happy'] as const;
export type RoomTalk = (typeof ROOM_TALK)[number];

/** 메인 방 화면 설정 (GDD 16장). 모두 선택 항목이라 비워도 기본값(DEFAULT_ROOM)이 쓰인다 */
export interface RoomConfig {
  /** 방 모양: bha-room--<shape> 클래스 (CSS 가 모양을 정한다. 예 cave / room) */
  shape: string;
  /** 그림 키 (src/data/art/manifest.ts) */
  sceneArt: string;
  characterArt: string;
  /** 소품 표시 이름 */
  props: Record<RoomProp, string>;
  /** 소품 위치: 장면 가로·세로 %(중심) */
  layout: Record<RoomProp, { x: number; y: number }>;
  /** 캐릭터 반응 말풍선 문구 (상태별 여러 개 중 무작위) */
  talk: Record<RoomTalk, string[]>;
}

export const DEFAULT_ROOM: RoomConfig = {
  shape: 'room',
  sceneArt: 'scene.room',
  characterArt: 'char.hollow',
  props: { door: '문', altar: '제단', book: '책', chest: '상자', window: '창문', dummy: '훈련 인형' },
  layout: {
    window: { x: 22, y: 26 }, book: { x: 40, y: 22 }, altar: { x: 62, y: 24 }, door: { x: 86, y: 40 },
    chest: { x: 14, y: 68 }, dummy: { x: 80, y: 78 },
  },
  talk: {
    idle: ['…'], tired: ['피곤하다…'], risk: ['머리가 아프다…'], weak: ['아직 몸이 무겁다…'], happy: ['좋아!'],
  },
};

/** 종족 설정의 room 에 빠진 값을 기본값으로 채운다 */
export function roomOf(f: Pick<FactionConfig, 'room'>): RoomConfig {
  const r = f.room ?? {};
  return {
    ...DEFAULT_ROOM,
    ...r,
    props: { ...DEFAULT_ROOM.props, ...r.props },
    layout: { ...DEFAULT_ROOM.layout, ...r.layout },
    talk: { ...DEFAULT_ROOM.talk, ...r.talk },
  };
}

export interface FactionConfig {
  id: string;
  /** 화면 표시 이름 */
  name: string;
  /** UI 테마 이름: 루트 data-bha-theme 값 (src/ui/bha/design-system/theme-<이름>.css 가 정의). 종족 id 로 분기하지 않고 이 값을 쓴다 */
  theme: string;
  /** 종족 고르기 화면의 큰 아이콘 (GDD 19-4): 이모티콘 한 개. 비우면 이름 첫 글자 */
  emblem?: string;
  /** 육성 5단계 이름 (GDD 8-1) */
  tierNames: [string, string, string, string, string];
  /** 등급 번호 1~10 의 표시 이름 (GDD 21-1, [0] = 1번). 엔진은 번호만 다룬다 */
  rankNames: string[];
  /** 번호가 없는 상태의 표시 이름 (GDD 21-1 v4.4, 호로 "무번호") */
  unrankedName: string;
  /** 등급전 이름과 결과 문구 ({rank} = 얻은 번호의 표시 이름). 오르는 방식은 양쪽 동일, 차이는 문구뿐 (GDD 21-1) */
  rankBattleName: string;
  rankWinText: string;
  rankLoseText: string;
  /** 전투 v2 블록 표시 이름 (GDD 3-5, v0.6 에서 tileNames 를 대체): 스킬 블록 / 필살 블록 / 공허 블록 */
  skillBlockName: string;
  specialBlockName: string;
  /** 저장형 필살기 표시 이름 (GDD 14-6, 임시 자리 표시 이름). SP 필살 블록(specialBlockName)과 별개 */
  storedSkillName: string;
  voidBlockName: string;
  /** 체인 표기 (예: "체인") */
  chainName: string;
  /** 필살 블록을 채우는 SP 게이지 이름 */
  spName: string;
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
  /** 안정 수치 이름: 호로 자아 / 사신 영압 안정도 (GDD 4장). 컨디션·허기와 별개 */
  stabilityName: string;
  /** 흡수 특성 슬롯 이름 (슬롯 위치 slotLocation 과 짝): 본체 슬롯 / 참백도 슬롯 */
  slotName: string;
  /** 계통 보너스 표기: 호로 계열 기술 강화 / 사신 참백도 속성 확정 (GDD 4장, 효과 수치는 엔진 공통) */
  lineageBonusName: string;
  /** 특성 종류 표기 (GDD 4장): 기술·시해 능력 / 패시브 / 외형·참백도 파츠 */
  traitKindNames: Record<'skill' | 'passive' | 'part', string>;
  /** 리스크 한계 돌파 연출 문구 (정식 결과는 미정, 텍스트만) */
  breakthroughText: string;
  /** 사냥터 이름 (GDD 6장) */
  huntingGroundName: string;
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
  /** 둥지 행동 이름 (GDD 7장): 먹이 / 재우기 / 쓰다듬기(참백도 손질) */
  nestActions: Record<NestAction, string>;
  /** 먹이 종류 이름 (GDD 18-2, 임시) */
  foodNames: Record<FoodId, string>;
  /** 메인 방 화면: 방 모양·소품 이름·위치·그림 키·반응 문구 (GDD 16장). 없으면 기본값 */
  room?: Partial<Omit<RoomConfig, 'props' | 'layout' | 'talk'>> & { props?: Partial<RoomConfig['props']>; layout?: Partial<RoomConfig['layout']>; talk?: Partial<RoomConfig['talk']> };
}

function isString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

function isStringTuple(v: unknown, n: number): boolean {
  return Array.isArray(v) && v.length === n && v.every(isString);
}

/** 모르는 JSON 을 종족 설정으로 검증한다. 문제가 있으면 무엇이 틀렸는지 담아 던진다 */
export function parseFactionConfig(raw: unknown): FactionConfig {
  const errors: string[] = [];
  const r = (raw ?? {}) as Record<string, unknown>;
  for (const k of ['id', 'name', 'theme', 'riskGaugeName', 'absorbActionName', 'defeatStateName', 'huntingGroundName', 'basicSkillName', 'nestName', 'stabilityName', 'slotName', 'lineageBonusName', 'breakthroughText', 'skillBlockName', 'specialBlockName', 'storedSkillName', 'voidBlockName', 'chainName', 'spName', 'unrankedName', 'rankBattleName', 'rankWinText', 'rankLoseText']) {
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
      if (!(ATTACK_CATEGORIES as readonly unknown[]).includes(x.category)) errors.push(`families[${i}].category: ${ATTACK_CATEGORIES.join(' | ')}`);
      const tiers = x.tiers;
      if (!Array.isArray(tiers) || tiers.length !== FAMILY_TIERS) errors.push(`families[${i}].tiers: 기술 ${FAMILY_TIERS}개`);
      else {
        tiers.forEach((t: unknown, k: number) => {
          const y = (t ?? {}) as Record<string, unknown>;
          if (!isString(y.name)) errors.push(`families[${i}].tiers[${k}].name: 비어 있지 않은 문자열`);
          if (!(typeof y.multiplier === 'number' && y.multiplier > 0)) errors.push(`families[${i}].tiers[${k}].multiplier: 양수`);
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
  if (r.walkAnim !== undefined && !isString(r.walkAnim)) errors.push('walkAnim: 비어 있지 않은 문자열이어야 한다');
  if (r.room !== undefined) {
    const rm = r.room as Record<string, unknown>;
    for (const k of ['shape', 'sceneArt', 'characterArt']) if (rm[k] !== undefined && !isString(rm[k])) errors.push(`room.${k}: 비어 있지 않은 문자열이어야 한다`);
    for (const k of Object.keys((rm.props ?? {}) as object)) if (!(ROOM_PROPS as readonly string[]).includes(k) || !isString((rm.props as Record<string, unknown>)[k])) errors.push(`room.props.${k}: 알 수 없는 물건이거나 문자열이 아니다`);
    for (const [k, v] of Object.entries((rm.talk ?? {}) as Record<string, unknown>)) if (!(ROOM_TALK as readonly string[]).includes(k) || !Array.isArray(v) || v.length === 0 || !v.every(isString)) errors.push(`room.talk.${k}: 비어 있지 않은 문자열 목록이어야 한다`);
  }
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

/** 계열 설정 한 개 (없으면 undefined) */
export function familyOf(f: Pick<FactionConfig, 'families'>, familyId: string): FamilyConfig | undefined {
  return f.families.find((x) => x.id === familyId);
}
