// 종족 설정(faction config) 타입과 검증. 종족 차이는 전부 이 설정에서 읽는다 (CLAUDE.md 규칙 2).
// 3번째 종족은 src/data/factions/<id>.json 하나로 추가된다.

/** 스킬 블록 역할 (GDD 3-5). 이름(표시)은 종족 설정이, 효과(로직)는 엔진이 정한다 */
export const BLOCK_ROLES = ['attack', 'guard', 'heal'] as const;
export type BlockRole = (typeof BLOCK_ROLES)[number];

/** 둥지 행동 종류. 이름은 종족 설정이, 효과는 엔진(nest.ts)이 정한다 */
export const NEST_ACTIONS = ['feed', 'sleep', 'pet'] as const;
export type NestAction = (typeof NEST_ACTIONS)[number];

/** 슬롯 위치: 호로=본체(body), 사신=참백도(zanpakuto) (GDD 4장) */
export type SlotLocation = 'body' | 'zanpakuto';
/** 등급 방식: 호로=도전(challenge), 사신=승진(promotion) (GDD 8-2) */
export type RankMode = 'challenge' | 'promotion';

/** 메인 방 화면의 물건 (GDD 16-1 4번). 이름은 종족 설정이 정한다 */
export const ROOM_PROPS = ['door', 'altar', 'book', 'chest', 'window', 'care'] as const;
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
  props: { door: '문', altar: '제단', book: '책', chest: '상자', window: '창문', care: '돌보기' },
  layout: {
    window: { x: 22, y: 26 }, book: { x: 40, y: 22 }, altar: { x: 62, y: 24 }, door: { x: 86, y: 40 },
    chest: { x: 14, y: 68 }, care: { x: 80, y: 78 },
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
  /** 육성 5단계 이름 (GDD 8-1) */
  tierNames: [string, string, string, string, string];
  /** 등급 4단계 이름 (GDD 8-2) */
  rankNames: [string, string, string, string];
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
  rankMode: RankMode;
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
  /** 둥지 / 대원실 (GDD 7장) */
  nestName: string;
  /** 둥지 행동 이름 (GDD 7장): 먹이 / 재우기 / 쓰다듬기(참백도 손질) */
  nestActions: Record<NestAction, string>;
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
  for (const k of ['id', 'name', 'theme', 'riskGaugeName', 'absorbActionName', 'defeatStateName', 'huntingGroundName', 'basicSkillName', 'nestName', 'stabilityName', 'slotName', 'lineageBonusName', 'breakthroughText', 'skillBlockName', 'specialBlockName', 'storedSkillName', 'voidBlockName', 'chainName', 'spName']) {
    if (!isString(r[k])) errors.push(`${k}: 비어 있지 않은 문자열이어야 한다`);
  }
  if (!isStringTuple(r.tierNames, 5)) errors.push('tierNames: 문자열 5개여야 한다');
  if (!isStringTuple(r.rankNames, 4)) errors.push('rankNames: 문자열 4개여야 한다');
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
  if (r.room !== undefined) {
    const rm = r.room as Record<string, unknown>;
    for (const k of ['shape', 'sceneArt', 'characterArt']) if (rm[k] !== undefined && !isString(rm[k])) errors.push(`room.${k}: 비어 있지 않은 문자열이어야 한다`);
    for (const k of Object.keys((rm.props ?? {}) as object)) if (!(ROOM_PROPS as readonly string[]).includes(k) || !isString((rm.props as Record<string, unknown>)[k])) errors.push(`room.props.${k}: 알 수 없는 물건이거나 문자열이 아니다`);
    for (const [k, v] of Object.entries((rm.talk ?? {}) as Record<string, unknown>)) if (!(ROOM_TALK as readonly string[]).includes(k) || !Array.isArray(v) || v.length === 0 || !v.every(isString)) errors.push(`room.talk.${k}: 비어 있지 않은 문자열 목록이어야 한다`);
  }
  if (r.slotLocation !== 'body' && r.slotLocation !== 'zanpakuto') errors.push('slotLocation: body | zanpakuto');
  if (typeof r.appearanceChange !== 'boolean') errors.push('appearanceChange: boolean');
  if (r.rankMode !== 'challenge' && r.rankMode !== 'promotion') errors.push('rankMode: challenge | promotion');
  if (errors.length > 0) throw new Error(`종족 설정 오류 (${String(r.id ?? '?')}):\n- ${errors.join('\n- ')}`);
  return raw as FactionConfig;
}
