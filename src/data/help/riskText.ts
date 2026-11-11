// 광기 설명 (영압 안정도는 C.391 GDD 239장 4 에서 삭제) (GDD 84장 9번, C.141 → C.185 서식 통일 GDD 111장 4): 수치가 어떻게 오르내리고 어떤 손해가 있는지를 balance.ts 값에서 읽어 숫자로 적는다.
// 이름은 종족 설정(riskGaugeName 등), 수치는 BALANCE — 숫자 하드코딩 없음. 도움말 변수(helpVars)와 상태 ⓘ 창이 같이 쓴다.
// 서식은 textFormat.ts(수치 줄 "조건: 효과 · 효과", −는 빼기 기호).
import { BALANCE } from '../../config/balance';
import { fixParticles } from '../../engine/josa';
import type { FactionConfig } from '../../engine/faction';
import { tileName } from '../tiles';
import { MINUS, multPct, num, numLine, pct, signed, zoneLine, type Zone } from './textFormat';

const RX = BALANCE.provisional.risk;
const LIB = BALANCE.provisional.liberation;
const LAP = BALANCE.provisional.expedition.lateLapStart;
const CP = BALANCE.provisional.nest.care;
const CX = BALANCE.provisional.combat;
/** 대표 값 (소수 한 자리): 적 체력[기본 공격 횟수] → 포식 상승, 바퀴 → 칸당 상승 */
const round1 = (v: number) => Math.round(v * 10) / 10;
const absorbAt = (hpInAttacks: number) => round1(hpInAttacks * RX.absorbPerHpAttack);
const lapAt = (lap: number) => round1((lap - LAP + 1) * RX.lateLapPerTile);

type Names = Pick<FactionConfig, 'id' | 'riskGaugeName' | 'nestName' | 'absorbActionName' | 'fullnessName' | 'frenzyName' | 'nestActions'>;

export interface RiskText {
  /** 폭주 한 줄 (수치 줄) */
  riskTip: string;
  /** 폭주 칩 ⓘ: 한 줄 요약 · 효과 줄('하는 일') */
  frenzyLead: string;
  frenzyLines: string[];
  /** 한 줄 요약 ('~다') */
  riskLead: string;
  /** 하는 일 */
  riskDoes: string[];
  /** 오르내림: 광기는 오르는 줄(+) 다음 내리는 줄(−) */
  riskUp: string[];
  riskDown: string[];
}

/** 폭주 효과: 그 원정 동안 / 귀환하면 (구간 줄·폭주 칩 ⓘ 같이) */
function frenzyFight(): string[] {
  return [
    `주는 피해 ${multPct(RX.frenzyDamageDealt)}`,
    `받는 피해 ${multPct(RX.frenzyDamageTaken)}`,
    `적 공격 ${pct(RX.frenzyEvadeChance)} 회피`,
    '회복 물건 사용 불가',
    `공허 블록 확률 +${pct(RX.breakthroughSpawnBonus)}p`,
  ];
}
function frenzyReturn(f: Names): string[] {
  return [`컨디션 ${MINUS}${RX.frenzyConditionLoss}`, fixParticles(`${f.riskGaugeName} ${RX.riskAfterBreakthrough}(으)로`)];
}
const frenzyEffects = (f: Names): string[] => [...frenzyFight(), `귀환하면 ${frenzyReturn(f).join(' · ')}`];

export function riskText(f: Names): RiskText {
  const g = f.riskGaugeName;
  const m = BALANCE.provisional.absorb.modes;
  const nest = RX.nestActions;
  const a = f.nestActions;
  // 돌봄 행동별 값 — 0 인 행동은 빼고 적는다 (GDD 211장: 먹이는 리스크를 안 움직인다)
  const careMoves = (k: 'risk'): string[] => (['feed', 'sleep', 'pet'] as const).filter((x) => nest[x][k] !== 0).map((x) => `${a[x]} ${signed(nest[x][k])}`);
  return {
    riskTip: numLine(`${g} ${RX.limit}`, `${f.frenzyName}(모험당 1번)`, ...frenzyEffects(f)),
    frenzyLead: fixParticles(`${g} ${RX.limit}이(가) 되면 모험당 1번 걸린다`),
    frenzyLines: [numLine('그 모험 끝까지', ...frenzyFight()), numLine('귀환하면', ...frenzyReturn(f))],
    riskLead: fixParticles(`모험에서 힘을 쓸수록 쌓이고, ${RX.limit}이(가) 되면 ${f.frenzyName} 상태가 된다`),
    riskDoes: [
      `${RX.limit} 미만은 직접 손해가 없고 게이지만 쌓인다`,
      fixParticles(`${RX.limit}이(가) 되면 그 모험 끝까지 ${f.frenzyName} 상태다(모험당 1번)`),
    ],
    riskUp: [
      numLine('공허 블록 1개 사용', signed(RX.perVoidBlock)),
      // 계산식 대신 쉬운 말 + 대표 값 (GDD 168장 3): 뜻은 absorbRisk·lateLapRisk 그대로
      numLine(`적 ${f.absorbActionName}`, '강한 적일수록 많이 오른다', `일반 적 약 ${signed(absorbAt(CX.enemyHpInAttacks.normal))}`, `강적 약 ${signed(absorbAt(CX.enemyHpInAttacks.elite))}`),
      numLine(`일부만 ${f.absorbActionName}`, `블록만 그${pct(m.trait.risk)}`, `능력치만 그 ${pct(m.stat.risk)}`),
      numLine(`${LAP}바퀴째부터 칸을 지날 때`, '바퀴가 늘수록 더 오른다', `${LAP}바퀴 ${signed(lapAt(LAP))}`, `${LAP + 1}바퀴 ${signed(lapAt(LAP + 1))}`),
      numLine('해방이 끝날 때', signed(LIB.riskOnEnd)),
      numLine('제단 타일', signed(BALANCE.provisional.tileVariants.events.altar.risk)),
      numLine('수련 결투', signed(BALANCE.provisional.training.games.duel?.risk ?? 0)),
    ],
    riskDown: [
      numLine('적 놓아주기', signed(-RX.releaseRelief)),
      // 휴식 칸은 C.355 (GDD 210장 1) 부터 리스크를 내리지 않는다 — 샘만
      numLine(tileName('rest-spring', f.id), signed(-BALANCE.provisional.tiles.spring.riskRelief)),
      numLine(`${f.nestName} 돌봄 요청 응답`, ...careMoves('risk')),
    ],
  };
}

/** 수치 구간 하나 (옛 이름 — textFormat.Zone 과 같다) */
export type RiskZone = Zone;

/** 광기 구간별 손해 (109장 2): 값은 BALANCE 에서. 한계 미만은 직접 손해가 없고(수련장 경고 구간만 따로), 한계 = 폭주 */
export function riskZones(f: Names): RiskZone[] {
  const g = f.riskGaugeName;
  const warn = BALANCE.provisional.training.riskWarn;
  return [
    { from: 0, to: warn - 1, text: '직접 손해가 없다' },
    { from: warn, to: RX.limit - 1, text: `직접 손해가 없다 · 수련장에 '${g} 높음' 경고` },
    { from: RX.limit, to: RX.limit, text: [`${f.frenzyName}(모험당 1번)`, ...frenzyEffects(f)].join(' · ') },
  ];
}

/** 구간 → 줄 ("0~24: …") */
export const zoneLines = (zones: RiskZone[]): string[] => zones.map(zoneLine);
