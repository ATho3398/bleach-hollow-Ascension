// 전투 화면 텍스트: 전부 종족 설정(FactionConfig)에서 읽는다. 종족 id 로 분기하지 않는다.
import type { TerrainTileDef } from '../data/schema';
import type { EndReason } from '../engine/expedition';
import type { BlockRole, FactionConfig } from '../engine/faction';

export interface BattleLabels {
  /** 블록 역할 이름 (공격/막기/회복) */
  role: Record<BlockRole, string>;
  skillBlock: string;
  specialBlock: string;
  voidBlock: string;
  /** 기본 블록 (슬롯에 skill 이 없을 때) */
  basicBlock: string;
  chain: string;
  sp: string;
  riskGauge: string;
  defeatState: string;
  huntingGround: string;
  factionName: string;
}

export function battleLabels(f: FactionConfig): BattleLabels {
  return {
    role: { ...f.roleNames },
    skillBlock: f.skillBlockName,
    specialBlock: f.specialBlockName,
    voidBlock: f.voidBlockName,
    basicBlock: f.basicSkillName,
    chain: f.chainName,
    sp: f.spName,
    riskGauge: f.riskGaugeName,
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
    reshuffle: '전투 중 블록 트레이가 주기적으로 섞인다',
    power: '전투 공격 위력 ×1.3',
    shield: '전투에서 받는 피해 ↓',
    void: '전투 공허 블록 ↑',
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
