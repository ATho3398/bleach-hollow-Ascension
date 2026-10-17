// 전투 화면 텍스트: 전부 종족 설정(FactionConfig)에서 읽는다. 종족 id 로 분기하지 않는다.
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
