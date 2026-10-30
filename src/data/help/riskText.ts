// 광기·영압 안정도 설명 (GDD 84장 9번, C.141 → C.185 서식 통일 GDD 111장 4): 수치가 어떻게 오르내리고 어떤 손해가 있는지를 balance.ts 값에서 읽어 숫자로 적는다.
// 이름은 종족 설정(riskGaugeName·stabilityName 등), 수치는 BALANCE — 숫자 하드코딩 없음. 도움말 변수(helpVars)와 상태 ⓘ 창이 같이 쓴다.
// 서식은 textFormat.ts(수치 줄 "조건: 효과 · 효과", −는 빼기 기호).
import { BALANCE } from '../../config/balance';
import { fixParticles } from '../../engine/josa';
import type { FactionConfig } from '../../engine/faction';
import { MINUS, multPct, num, numLine, pct, signed, zoneLine, type Zone } from './textFormat';

const RX = BALANCE.provisional.risk;
const LIB = BALANCE.provisional.liberation;
const LAP = BALANCE.provisional.expedition.lateLapStart;
const CP = BALANCE.provisional.nest.care;

type Names = Pick<FactionConfig, 'riskGaugeName' | 'stabilityName' | 'nestName' | 'absorbActionName' | 'fullnessName' | 'frenzyName' | 'nestActions'>;

export interface RiskText {
  /** 폭주 한 줄 (수치 줄) */
  riskTip: string;
  /** 폭주 칩 ⓘ: 한 줄 요약 · 효과 줄('하는 일') */
  frenzyLead: string;
  frenzyLines: string[];
  /** 한 줄 요약 ('~다') */
  riskLead: string;
  stabilityLead: string;
  /** 하는 일 */
  riskDoes: string[];
  stabilityDoes: string[];
  /** 오르내림: 광기는 오르는 줄(+) 다음 내리는 줄(−) */
  riskUp: string[];
  riskDown: string[];
  stabilityMove: string[];
}

/** 폭주 효과: 그 원정 동안 / 귀환하면 (구간 줄·폭주 칩 ⓘ 같이) */
function frenzyFight(): string[] {
  return [
    `주는 피해 ${multPct(RX.frenzyDamageDealt)}`,
    `받는 피해 ${multPct(RX.frenzyDamageTaken)}`,
    `적 공격 ${pct(RX.frenzyEvadeChance)} 회피`,
    '회복약 사용 불가',
    `공허 블록 확률 +${pct(RX.breakthroughSpawnBonus)}p`,
  ];
}
function frenzyReturn(f: Names): string[] {
  return [`컨디션 ${MINUS}${RX.frenzyConditionLoss}`, `${f.stabilityName} ${MINUS}${RX.breakthroughStabilityLoss}`, fixParticles(`${f.riskGaugeName} ${RX.riskAfterBreakthrough}(으)로`)];
}
const frenzyEffects = (f: Names): string[] => [...frenzyFight(), `귀환하면 ${frenzyReturn(f).join(' · ')}`];

export function riskText(f: Names): RiskText {
  const g = f.riskGaugeName;
  const s = f.stabilityName;
  const m = BALANCE.provisional.absorb.modes;
  const nest = RX.nestActions;
  const a = f.nestActions;
  return {
    riskTip: numLine(`${g} ${RX.limit}`, `${f.frenzyName}(원정당 1번)`, ...frenzyEffects(f)),
    frenzyLead: fixParticles(`${g} ${RX.limit}이(가) 되면 원정당 1번 걸린다`),
    frenzyLines: [numLine('그 원정 끝까지', ...frenzyFight()), numLine('귀환하면', ...frenzyReturn(f))],
    riskLead: fixParticles(`원정에서 힘을 쓸수록 쌓이고, ${RX.limit}이(가) 되면 ${f.frenzyName} 상태가 된다`),
    stabilityLead: `낮을수록 전투 시작 때 해방 게이지가 적게 찬다`,
    riskDoes: [
      `${RX.limit} 미만은 직접 손해가 없고 게이지만 쌓인다`,
      fixParticles(`${RX.limit}이(가) 되면 그 원정 끝까지 ${f.frenzyName} 상태다(원정당 1번)`),
    ],
    stabilityDoes: [
      `전투 시작 해방 게이지 = ${s} ÷ ${RX.stabilityMax} × ${LIB.startGaugeMax}`,
      '그 밖의 직접 손해는 없다',
    ],
    riskUp: [
      numLine('공허 블록 1개 사용', signed(RX.perVoidBlock)),
      numLine(`강한 적 ${f.absorbActionName}`, `+(적 체력[기본 공격 횟수] × ${RX.absorbPerHpAttack})`, `특성·속성만 ×${m.trait.risk}`, `능력치만 ×${m.stat.risk}`),
      numLine(`${LAP}바퀴째부터 칸을 지날 때`, `+(바퀴 ${MINUS} ${LAP - 1}) × ${RX.lateLapPerTile}`),
      numLine('해방이 끝날 때', signed(LIB.riskOnEnd)),
      numLine('제단 타일', signed(BALANCE.provisional.tileVariants.events.altar.risk)),
      numLine('수련 결투', signed(BALANCE.provisional.training.games.duel?.risk ?? 0)),
    ],
    riskDown: [
      numLine('적 놓아주기', signed(-RX.releaseRelief)),
      numLine('휴식 타일', signed(-RX.restRelief)),
      numLine(`${f.nestName} 돌봄 요청 응답`, `${a.feed} ${signed(nest.feed.risk)}`, `${a.sleep} ${signed(nest.sleep.risk)}`, `${a.pet} ${signed(nest.pet.risk)}`),
    ],
    stabilityMove: [
      numLine('시작', num(RX.stabilityStart)),
      numLine('상한', num(RX.stabilityMax)),
      numLine('적 놓아주기', signed(RX.releaseStability)),
      numLine(`${f.nestName} 돌봄 요청 응답`, `${a.feed} ${signed(nest.feed.stability)}`, `${a.sleep} ${signed(nest.sleep.stability)}`, `${a.pet} ${signed(nest.pet.stability)}`),
      numLine(`${f.frenzyName} 후 귀환`, signed(-RX.breakthroughStabilityLoss)),
      numLine('꺼 둔 동안', `시간당 ${signed(-CP.stabilityPerHour)}`, `${f.fullnessName} 또는 컨디션 ${CP.stabilityDoubleBelow} 이하면 ×2`),
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
    { from: RX.limit, to: RX.limit, text: [`${f.frenzyName}(원정당 1번)`, ...frenzyEffects(f)].join(' · ') },
  ];
}

/** 영압 안정도 구간별 손해 (109장 2): 전투 시작 해방 게이지 = 값 ÷ 상한 × 시작 최대(선형) — 4구간으로 끊어 그 구간의 시작 게이지를 숫자로 */
export function stabilityZones(_f: Names): RiskZone[] {
  const max = RX.stabilityMax;
  const gauge = (v: number) => num((v / max) * LIB.startGaugeMax);
  const cuts = [0, max * 0.25, max * 0.5, max * 0.75, max + 1].map(Math.round);
  return cuts.slice(0, -1).map((from, i) => {
    const to = cuts[i + 1]! - 1;
    return { from, to, text: `전투 시작 해방 게이지 ${gauge(from)}~${gauge(to)}/${LIB.gaugeMax}` };
  });
}

/** 구간 → 줄 ("0~24: …") */
export const zoneLines = (zones: RiskZone[]): string[] => zones.map(zoneLine);
