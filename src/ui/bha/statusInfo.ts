// 상태 ⓘ 설명 문구 (C.176, GDD 104장 2 → C.185 말투·서식 통일 GDD 111장 4): 방 상태 칩·상태 화면이 같이 읽는다.
// 이름은 종족 설정, 수치는 BALANCE(riskText 와 같은 규칙) — 숫자 하드코딩 없음.
// 창 구조: 한 줄 요약('~다') → 소제목. 수치 상태(배부름·컨디션·영압 안정도·광기·교감) = 하는 일 → 구간별 손해 → 오르내림,
// 상태 이상(쇠약·피곤·빈사·사망) = 손해 → 풀리는 법. 줄 서식은 data/help/textFormat.ts.
import { BALANCE } from '../../config/balance';
import { GOLD_ITEMS } from '../../data/shop';
import { riskText, riskZones, stabilityZones, zoneLines } from '../../data/help/riskText';
import { MINUS, num, numLine, pct, pctDelta, range, SECTION, signed, zonesBy, type Zone } from '../../data/help/textFormat';
import { bondIdleBonus, bondStage, CARE_STATUS_NAMES as CARE_NAMES, deathHoursOf, reviveEvLossOf } from '../../engine/nest';
import { fixParticles } from '../../engine/josa';
import { DEFAULT_WORLDMAP, type FactionConfig } from '../../engine/faction';
import type { InfoBody, InfoDoc, InfoGroup } from './infoTip';
import { BOND_STAGE_NAMES, type StatusChip } from './roomLogic';

const CP = BALANCE.provisional.nest.care;
const NX = BALANCE.provisional.nest;
const BD = NX.bond;
const RX = BALANCE.provisional.risk;
const PX = BALANCE.provisional.expedition;

type Names = Pick<FactionConfig, 'riskGaugeName' | 'stabilityName' | 'nestName' | 'absorbActionName' | 'fullnessName' | 'frenzyName' | 'nestActions'> & Partial<Pick<FactionConfig, 'room' | 'market' | 'worldmap'>>;

export type StatusInfoKind = StatusChip['kind'] | 'stab' | 'dead';

/** 그 상태를 푸는 약 이름 (상점 데이터) */
const medicineName = (cures: string): string => GOLD_ITEMS.find((g) => g.kind === 'medicine' && g.cures === cures)?.name ?? '';

/** 구간 묶음: "0~79: …" 줄들 + 지금 값이 든 줄 강조 (GDD 109장 2) */
function zoneGroup(zones: Zone[], value: number | undefined): InfoGroup {
  const v = value === undefined ? undefined : Math.round(value);
  const at = v === undefined ? -1 : zones.findIndex((z) => v >= z.from && v <= z.to);
  return { title: SECTION.zones, lines: zoneLines(zones), ...(at >= 0 ? { mark: at } : {}) };
}

/** 수치 상태 창: 요약 → 하는 일 → 구간별 손해 → 오르내림 */
const gaugeDoc = (lead: string, does: string[], zones: Zone[], value: number | undefined, move: string[]): InfoDoc => ({
  lead,
  groups: [{ title: SECTION.does, lines: does }, zoneGroup(zones, value), { title: SECTION.move, lines: move }],
});

/** 상태 이상 창: 요약 → 손해 → 풀리는 법 */
const ailmentDoc = (lead: string, loss: string[], cure: string[]): InfoDoc => ({
  lead,
  groups: [...(loss.length > 0 ? [{ title: SECTION.loss, lines: loss }] : []), { title: SECTION.cure, lines: cure }],
});

/** 상태 하나의 설명. value = 지금 수치(주면 그 구간을 강조) */
export function statusInfo(kind: StatusInfoKind, f: Names, value?: number): InfoDoc {
  const d = statusDoc(kind, f, value);
  const fix = (t: string) => fixParticles(t);
  return { lead: fix(d.lead), groups: d.groups.map((g) => ({ ...g, title: fix(g.title), lines: g.lines.map(fix) })) };
}

function statusDoc(kind: StatusInfoKind, f: Names, value?: number): InfoDoc {
  const a = f.nestActions;
  switch (kind) {
    case 'hunger': {
      // 배부름 = 100 − 허기. 문턱(쇠약·컨디션 감소·안정도 ×2)은 BALANCE 에서 — 같은 손해가 이어지는 값끼리 한 구간
      const zones = zonesBy(0, 100, (v) => {
        const fx: string[] = [];
        if (v <= CP.weakFullness) fx.push(CARE_NAMES.weak);
        if (v <= CP.conditionBelowFullness) fx.push(`컨디션 시간당 ${MINUS}${num(CP.conditionPerHour * (v <= 0 ? 2 : 1))}`);
        if (v <= CP.stabilityDoubleBelow) fx.push(`꺼 둔 동안 ${f.stabilityName} 감소 ×2`);
        return fx.length > 0 ? fx.join(' · ') : '손해가 없다';
      });
      return gaugeDoc(
        `${a.feed}(으)로 채우고, 시간이 흐르면 준다`,
        [`낮으면 컨디션이 줄고 ${CARE_NAMES.weak}에 걸린다`],
        zones, value,
        [numLine(a.feed, '먹이마다 정해진 만큼 +'), numLine('시간 흐름', `시간당 ${MINUS}${num(NX.idleHungerPerHour)}`)],
      );
    }
    case 'cond': {
      // 공허 블록 가산 = 최대 × (1 − 컨디션 ÷ 상한): 네 구간 + 피곤·안정도 ×2 문턱으로 끊는다
      const max = PX.conditionMax;
      const voidAt = (v: number) => Math.round(PX.conditionRiskBonusMax * (1 - v / max) * 100);
      const cuts = [...new Set([0, max * 0.25, max * 0.5, max * 0.75, CP.tiredCondition + 1, CP.stabilityDoubleBelow + 1, max + 1].map(Math.round))].sort((x, y) => x - y);
      const zones: Zone[] = cuts.slice(0, -1).map((from, i) => {
        const to = cuts[i + 1]! - 1;
        const fx = [`공허 블록 확률 +${range(voidAt(to), voidAt(from))}%p`];
        if (to <= CP.tiredCondition) fx.push(CARE_NAMES.tired);
        if (to <= CP.stabilityDoubleBelow) fx.push(`꺼 둔 동안 ${f.stabilityName} 감소 ×2`);
        return { from, to, text: fx.join(' · ') };
      });
      return gaugeDoc(
        `${a.sleep}(으)로 오르고, 낮을수록 전투에 공허 블록이 자주 나온다`,
        [`모험 전투의 공허 블록 확률을 정한다(최대 +${pct(PX.conditionRiskBonusMax)}p)`],
        zones, value,
        [
          numLine(a.sleep, signed(NX.sleepCondition)),
          numLine(a.pet, signed(NX.petCondition)),
          numLine(`${f.fullnessName} ${CP.conditionBelowFullness} 이하`, `시간당 ${MINUS}${num(CP.conditionPerHour)}`, `${f.fullnessName} 0이면 ×2`),
          // 온천 회복 (GDD 135장 3 — 배부름 홈 대기 회복은 수정 v5.315 에서 폐기)
          numLine(f.worldmap?.spaName ?? DEFAULT_WORLDMAP.spaName, // 온천 이름 = 월드맵 장소 이름 (GDD 153장 1)
             `1초에 ${signed(Math.round(NX.homeHp.spa.conditionPerSecond * 10) / 10)}`), // 평소 온천 약 20초에 가득 (GDD 164장 1)
          numLine('모험 패배', `${NX.defeatCondition}까지 떨어진다`),
          numLine(`${f.frenzyName} 후 귀환`, signed(-RX.frenzyConditionLoss)),
        ],
      );
    }
    case 'bond': {
      // 교감 손해 = 빈사 버티는 시간·부활 노력치 손실·대기 보상 — 단계·손실 문턱이 바뀌는 곳에서 끊는다
      const cuts = [...new Set([0, ...BD.stages, ...CP.reviveEvLoss.map(([b]) => b), BD.max + 1])].sort((x, y) => x - y);
      const zones: Zone[] = cuts.slice(0, -1).map((from, i) => {
        const to = cuts[i + 1]! - 1;
        return {
          from, to,
          text: [
            `${BOND_STAGE_NAMES[bondStage(from)]}`,
            `빈사 버티기 ${range(deathHoursOf(from), deathHoursOf(to))}시간`,
            `부활 노력치 손실 ${pct(reviveEvLossOf(from))}`,
            `대기 보상 +${range(Math.round(bondIdleBonus(from) * 100), Math.round(bondIdleBonus(to) * 100))}%`,
          ].join(' · '),
        };
      });
      return gaugeDoc(
        `${a.feed}·${a.sleep}·${a.pet}(으)로만 오르고, 약으로는 오르지 않는다`,
        ['높을수록 빈사에서 오래 버티고, 부활 손실이 줄고, 대기 보상이 는다', `단계: ${BOND_STAGE_NAMES.join(' → ')}`],
        zones, value,
        [
          numLine(a.feed, signed(BD.gain.feed)),
          numLine(`${a.sleep}·${a.pet}(돌봄 요청 응답)`, `${a.sleep} ${signed(BD.gain.sleep)}`, `${a.pet} ${signed(BD.gain.pet)}`),
          numLine('하루 최대', signed(BD.dailyMax)),
          numLine('꺼 둔 동안', `${BD.decayHours}시간마다 ${MINUS}1`),
          numLine(CARE_NAMES.collapsed, signed(-BD.collapseLoss)),
          numLine('사망·부활', '절반'),
        ],
      );
    }
    case 'risk': {
      const rt = riskText(f);
      return gaugeDoc(rt.riskLead, rt.riskDoes, riskZones(f), value, [...rt.riskUp, ...rt.riskDown]);
    }
    case 'stab': {
      const rt = riskText(f);
      return gaugeDoc(rt.stabilityLead, rt.stabilityDoes, stabilityZones(f), value, rt.stabilityMove);
    }
    case 'weak':
      return ailmentDoc(
        `${f.fullnessName}이(가) ${CP.weakFullness} 이하가 되는 순간 걸린다`,
        [numLine('모험 전투', `최대 체력 ${pctDelta(-CP.weakMaxHpCut)}`), numLine('대기 보상', `×${BALANCE.provisional.idle.weakenedRate}`)],
        [`${f.fullnessName}을(를) ${CP.weakFullness} 넘게 채우고 모험을 한 번 다녀오면 풀린다`, `${medicineName('weak')}을(를) 먹이면 바로 풀린다`],
      );
    case 'tired':
      return ailmentDoc(
        `컨디션이 ${CP.tiredCondition} 이하가 되는 순간 걸린다`,
        [numLine('전투', `블록 생성 간격 ${pctDelta(CP.tiredSpawnSlow)}`)],
        [`컨디션을 ${CP.tiredCondition} 넘게 올리고 모험을 한 번 다녀오면 풀린다`, `${medicineName('tired')}을(를) 먹이면 바로 풀린다`],
      );
    case 'collapsed':
      return ailmentDoc(
        `${CP.collapseHours}시간 넘게 비우면 걸린다`,
        [
          numLine('모험', `최대 체력 ${pct(CP.dying.hpFraction)}`, `공격·블록 속도 ×${CP.dying.speedMult}`, `보상 ×${CP.dying.rewardMult}`),
          numLine('버티는 시간', `${CP.dyingBaseHours}시간 + 교감 × ${CP.dyingHoursPerBond}시간`),
          '버티는 시간이 다 되거나 모험에서 지면 사망한다',
        ],
        [`상점 약 칸의 ${medicineName('collapsed')}을(를) 쓰면 풀린다`],
      );
    case 'dead':
      return ailmentDoc('오래 돌보지 않아 숨이 끊어졌다', [], ['방에서 [부활]을 하면 다시 시작한다']);
  }
}

/** 방 상태 칩 ⓘ: 칩에 보이는 것 전부를 한 창에 — 수치 상태 = 구간별 손해 줄(지금 구간 강조), 상태 이상 = 손해·풀리는 법 한 줄씩 */
export function roomStatusInfo(chips: readonly StatusChip[], f: Names): InfoBody {
  return {
    // 상태마다 지금 구간 한 줄만 (GDD 159장 21: 모든 구간 줄이 빽빽해 아래가 잘렸다). 자세한 구간표는 상태별 ⓘ
    lead: '상태마다 지금 구간 한 줄 — 자세한 구간은 상태 화면의 ⓘ에서 본다',
    groups: chips.map((c) => {
      const title = c.value === null ? c.label : `${c.label} ${c.value}`;
      const kind: StatusInfoKind = c.kind === 'collapsed' && c.label === CARE_NAMES.dead ? 'dead' : c.kind;
      const doc = statusInfo(kind, f, c.value ?? undefined);
      const zones = doc.groups.find((g) => g.title === SECTION.zones);
      if (zones) return { title, lines: zones.mark !== undefined ? [zones.lines[zones.mark]!] : zones.lines.slice(0, 1) };
      return { title, lines: doc.groups[0]?.lines.slice(0, 1) ?? [] };
    }),
  };
}
