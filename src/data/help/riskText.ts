// 광기·영압 안정도 설명 (GDD 84장 9번, C.141): 수치가 어떻게 오르내리고 어떤 손해가 있는지를 balance.ts 값에서 읽어 숫자로 적는다.
// 이름은 종족 설정(riskGaugeName·stabilityName 등), 수치는 BALANCE — 숫자 하드코딩 없음. 도움말 변수(helpVars)와 상태 화면이 같이 쓴다.
import { BALANCE } from '../../config/balance';
import type { FactionConfig } from '../../engine/faction';

const RX = BALANCE.provisional.risk;
const LIB = BALANCE.provisional.liberation;
const LAP = BALANCE.provisional.expedition.lateLapStart;
const CP = BALANCE.provisional.nest.care;

/** 소수 첫째 자리까지, 뒤 0 은 뺀다 */
const num = (x: number): string => String(Math.round(x * 10) / 10);
const pct = (x: number): string => `${Math.round(x * 100)}%`;
/** ×1.3 → "+30%" */
const plus = (m: number): string => `+${Math.round((m - 1) * 100)}%`;

type Names = Pick<FactionConfig, 'riskGaugeName' | 'stabilityName' | 'nestName' | 'absorbActionName' | 'fullnessName' | 'frenzyName'>;

export interface RiskText {
  /** 한 줄 요약 (툴팁) */
  riskTip: string;
  stabilityTip: string;
  /** 광기: 오르는 길 / 내리는 길 / 손해 */
  riskUp: string[];
  riskDown: string[];
  riskLoss: string[];
  /** 자아: 효과(손해) / 오르내림 */
  stabilityLoss: string[];
  stabilityMove: string[];
}

export function riskText(f: Names): RiskText {
  const g = f.riskGaugeName;
  const s = f.stabilityName;
  const m = BALANCE.provisional.absorb.modes;
  const nest = RX.nestActions;
  return {
    riskTip: `${g} ${RX.limit}이 되면 ${f.frenzyName}(원정당 1번): 주는 피해 ${plus(RX.frenzyDamageDealt)}·받는 피해 ${plus(RX.frenzyDamageTaken)}·회피 ${Math.round(RX.frenzyEvadeChance * 100)}%·회복 블록 없음, 돌아오면 컨디션 −${RX.frenzyConditionLoss}·${s} −${RX.breakthroughStabilityLoss}`,
    stabilityTip: `${s}이(가) 낮을수록 전투 시작 때 해방 게이지가 적게 찬 채로 시작한다 (최대 ${LIB.startGaugeMax}/${LIB.gaugeMax})`,
    riskUp: [
      `공허 블록 1개 쓸 때마다 +${num(RX.perVoidBlock)}`,
      `강한 적을 ${f.absorbActionName}할 때 +(적 체력[기본 공격 횟수]×${RX.absorbPerHpAttack}) — 특성·속성만이면 ×${m.trait.risk}, 능력치만이면 ×${m.stat.risk}`,
      `${LAP}바퀴째부터 칸을 지날 때마다 +(바퀴−${LAP - 1})×${RX.lateLapPerTile}`,
      `해방이 끝날 때 +${num(LIB.riskOnEnd)}`,
      `제단 타일 +${BALANCE.provisional.tileVariants.events.altar.risk} · 수련 결투 +${BALANCE.provisional.training.games.duel?.risk ?? 0}`,
    ],
    riskDown: [
      `적을 놓아주면 −${RX.releaseRelief}`,
      `휴식 타일 −${RX.restRelief}`,
      `${f.nestName}에서 먹이 −${-nest.feed.risk} · 재우기 −${-nest.sleep.risk} · 쓰다듬기 −${-nest.pet.risk} (돌봄 요청에 응답할 때)`,
    ],
    riskLoss: [
      `${g} 0~${RX.limit - 1}: 직접적인 손해는 없다. 게이지만 쌓인다.`,
      `${g} ${RX.limit} = ${f.frenzyName}(원정당 1번): 그 원정 남은 동안 내가 주는 피해 ${plus(RX.frenzyDamageDealt)}, 받는 피해 ${plus(RX.frenzyDamageTaken)}, 대신 적 공격 ${Math.round(RX.frenzyEvadeChance * 100)}%를 통째로 회피, 회복 블록이 나오지 않음, 블록이 공허 블록으로 바뀔 확률 +${pct(RX.breakthroughSpawnBonus)}p`,
      `${f.frenzyName}한 원정에서 ${f.nestName}에 돌아오면 컨디션 −${RX.frenzyConditionLoss} · ${s} −${RX.breakthroughStabilityLoss}, ${g}은(는) ${RX.riskAfterBreakthrough}으로 가라앉는다`,
    ],
    stabilityLoss: [
      `전투 시작 때 해방 게이지 = ${s} ÷ ${RX.stabilityMax} × ${LIB.startGaugeMax} (${s} ${RX.stabilityMax}이면 ${LIB.startGaugeMax}, ${RX.stabilityStart}이면 ${LIB.startGaugeMax * RX.stabilityStart / RX.stabilityMax}, 0이면 0) — 낮을수록 해방이 늦다`,
      `그 밖의 직접 손해는 없다`,
    ],
    stabilityMove: [
      `시작 ${RX.stabilityStart} · 상한 ${RX.stabilityMax}`,
      `놓아주기 +${RX.releaseStability} · 먹이 +${nest.feed.stability} · 재우기 +${nest.sleep.stability} · 쓰다듬기 +${nest.pet.stability}`,
      `${f.frenzyName} 후 귀환 −${RX.breakthroughStabilityLoss}`,
      `꺼 둔 동안 시간당 −${CP.stabilityPerHour} (${f.fullnessName} 또는 컨디션 ${CP.stabilityDoubleBelow} 이하면 ×2)`,
    ],
  };
}
