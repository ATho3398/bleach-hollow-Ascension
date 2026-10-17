// 데이터 파일(src/data/**) 구조. 내용은 아직 비어 있다. 임시 데이터에는 provisional: true 를 붙인다 (GDD 12장).

import type { WeaknessRole } from '../engine/faction';

/** 종족별로 달라지는 표시 텍스트: 종족 id → 문자열. 엔진 로직은 id 만 쓰고 텍스트는 여기서 읽는다 */
/** 키 '*' 는 모든 종족 공통 값(해당 종족 키가 없을 때 쓴다) */
export type PerFaction<T> = Record<string, T>;

export function pickFaction<T>(map: PerFaction<T>, factionId: string): T {
  const v = map[factionId] ?? map['*'];
  if (v === undefined) throw new Error(`종족 ${factionId} 의 표시 텍스트가 없다`);
  return v;
}

export interface EnemyDef {
  id: string;
  name: PerFaction<string>;
  class: 'normal' | 'elite';
  /** 체력: 절대값이 아니라 "플레이어 매칭 N회 분량" (CLAUDE.md 규칙 3) */
  hpInMatches: number;
  /** 공격력: 한 번 공격할 때 "플레이어 실드 매칭 N회 분량" 피해 (절대값 금지, CLAUDE.md 규칙 3) */
  attackInMatches: number;
  /** 약점 색(역할) 1개: 데미지·영력·실드 중 (GDD 3-4) */
  weakness: WeaknessRole;
  /** 흡수 계통 id (src/data/lineages). 임시 계통만 있다 (GDD 4-1) */
  lineageId: string;
  /** 조우할 때 희귀 개체일 확률 (임시, GDD 4장). 조우가 정해지면 rare 가 채워진다 */
  rareChance: number;
  /** 이 개체가 희귀 개체인가: 흡수 화면에 미리 표시되고 계통의 희귀 특성이 확정 후보로 나온다 */
  rare?: boolean;
  provisional?: boolean;
}

export interface LineageDef {
  id: string;
  name: PerFaction<string>;
  provisional?: boolean;
}

export const TRAIT_KINDS = ['skill', 'passive', 'part'] as const;
export type TraitKind = (typeof TRAIT_KINDS)[number];

export interface TraitDef {
  id: string;
  /** 계통 id (GDD 4장, 11-3 미정이라 임시 계통만 가능) */
  lineageId: string;
  kind: TraitKind;
  name: PerFaction<string>;
  /** 설명: 종족별 텍스트(키 '*' 는 공통) */
  description: PerFaction<string>;
  /** 희귀 개체에서만 나오는 특성 (확정 등장) */
  rare?: boolean;
  /** skill: 기술 위력 = 데미지 매칭 N회 분량 */
  skillPowerInMatches?: number;
  /** passive: 해당 역할 매칭 효과 배율 */
  passive?: { role: 'damage' | 'spirit' | 'shield'; multiplier: number };
  provisional?: boolean;
}

/** 환경 타일이 바꾸는 전투 조건 종류 (효과 수치는 BALANCE.provisional.tiles). 이름만 종족 스킨 (GDD 6장) */
export type EnvironmentPreset = 'reshuffle' | 'power' | 'shield' | 'void';

export type TileEffect =
  | { type: 'spawn'; enemyClass: 'normal' | 'elite' }
  | { type: 'environment'; preset: EnvironmentPreset }
  | { type: 'rest' };

export interface TerrainTileDef {
  id: string;
  kind: 'prey-nest' | 'elite-den' | 'environment' | 'rest' | 'combo';
  /** 종족별 스킨 이름. 해당 종족 키(또는 '*')가 없으면 그 종족은 이 타일을 쓰지 않는다 */
  name: PerFaction<string>;
  effect: TileEffect;
  /** 같은 값이 인접 3칸이면 조합 효과(임시: 강적 1마리 확정). GDD 6장 "둥지 3개" */
  comboGroup?: string;
  provisional?: boolean;
}

export type TitleKind = 'rank' | 'hidden-rank' | 'tag';

export interface TitleDef {
  id: string;
  kind: TitleKind;
  /** 숨김 항목은 달성 전까지 도감에 물음표로 보인다 (GDD 8-3, 8-4) */
  hidden: boolean;
  name: PerFaction<string>;
  /** 획득 조건. 11-6, 11-7 미정이므로 null (구조만 있음). 런 로그(runLog.ts)를 읽게 될 것 */
  condition: null;
}
