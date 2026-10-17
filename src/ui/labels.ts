// 전투 화면 텍스트: 전부 종족 설정(FactionConfig)에서 읽는다. 종족 id 로 분기하지 않는다.
import type { TerrainTileDef } from '../data/schema';
import type { EndReason } from '../engine/expedition';
import { TILE_ROLES, type FactionConfig, type TileRole } from '../engine/faction';

export interface BattleLabels {
  tile: Record<TileRole, string>;
  /** 타일에 쓰는 한 글자 */
  tileShort: Record<TileRole, string>;
  skillGauge: string;
  absorbGauge: string;
  riskGauge: string;
  skillButton: string;
  defeatState: string;
  huntingGround: string;
  factionName: string;
}

export function battleLabels(f: FactionConfig): BattleLabels {
  const short = {} as Record<TileRole, string>;
  for (const r of TILE_ROLES) short[r] = [...f.tileNames[r]][0] ?? '?';
  return {
    tile: { ...f.tileNames },
    tileShort: short,
    skillGauge: `${f.tileNames.spirit} 게이지`,
    absorbGauge: `${f.tileNames.absorb} 게이지`,
    riskGauge: f.riskGaugeName,
    skillButton: f.basicSkillName,
    defeatState: f.defeatStateName,
    huntingGround: f.huntingGroundName,
    factionName: f.name,
  };
}

/** 지형 타일 효과 설명: 효과 종류는 엔진, 문구는 종족 무관 */
export function tileHint(t: TerrainTileDef): string {
  const e = t.effect;
  if (e.type === 'spawn') return e.enemyClass === 'elite' ? '강적 출현 + 좋은 보상' : '약한 적 출현';
  if (e.type === 'rest') return '허기·컨디션 회복 (시간 소모)';
  return {
    reshuffle: '전투 중 매 턴 보드가 섞인다',
    power: '전투 화력 ↑',
    shield: '전투 실드 ↑',
    void: '전투 공허 타일 ↑',
  }[e.preset];
}

/** 원정이 끝난 이유 문구 */
export function endReasonText(reason: EndReason, f: FactionConfig): string {
  return {
    returned: '둥지 칸에서 귀환했다. 얻은 것은 모두 지킨다.',
    'forced-max-laps': '최대 바퀴를 채워 귀환했다. 얻은 것은 모두 지킨다.',
    'battle-lost': `전투에서 졌다. ${f.defeatStateName} 상태로 ${f.nestName}에 돌아왔다. 마지막 바퀴에서 얻은 것을 잃었다.`,
    exhausted: `허기로 쓰러졌다. ${f.defeatStateName} 상태로 ${f.nestName}에 돌아왔다. 마지막 바퀴에서 얻은 것을 잃었다.`,
  }[reason];
}
