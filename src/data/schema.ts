// 데이터 파일(src/data/**) 구조. 내용은 아직 비어 있다. 임시 데이터에는 provisional: true 를 붙인다 (GDD 12장).

import type { TileRole } from '../engine/faction';

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
  /** 약점 색(역할) 1개 (GDD 2-2) */
  weakness: TileRole;
  rare?: boolean;
  provisional?: boolean;
}

export interface TraitDef {
  id: string;
  /** 계통 id (GDD 4장, 11-3 미정이라 임시 계통만 가능) */
  lineageId: string;
  kind: 'skill' | 'passive' | 'part';
  name: PerFaction<string>;
  description: PerFaction<string>;
  provisional?: boolean;
}

export interface TerrainTileDef {
  id: string;
  kind: 'prey-nest' | 'elite-den' | 'environment' | 'rest' | 'combo';
  name: PerFaction<string>;
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
