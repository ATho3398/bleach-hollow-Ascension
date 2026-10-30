// 원정 자동 플레이어: 밸런스 점검·테스트용. 손에 든 타일을 앞쪽 빈 슬롯에 놓고, 정해진 바퀴에서 귀환한다.
import { getTrait } from '../../data/traits';
import { elementCounts, type BuildState } from '../absorb';
import { playCombatBot } from '../combat';
import {
  advance, chooseAbsorb, chooseContinue, chooseDraft, chooseRelease, chooseReturn, finishBattle, finishRest, goldAvailable, placeTile, resolveEvent, startBattle,
  type ExpeditionState,
} from './expedition';
import { getTile } from '../../data/tiles';
import { BALANCE } from '../../config/balance';
import { synergyPairs } from './variants';

export interface AutoOptions {
  /** 이 바퀴를 마치면 귀환 */
  returnAfterLap: number;
  /** 둥지 칸에서 이어 온 체력이 이 비율 아래면 returnAfterLap 전이라도 귀환 (GDD 121장 8 — 사냥 힐이 줄어 사람도 체력을 보고 이어 간다). 없으면 체력을 안 본다 */
  minContinueHp?: number;
  /** 전투마다 체력을 가득 채워 시작 (체력 이어 가기 끔): 리스크·흡수 같은 다른 계통만 재는 점검 봇용 — 생존은 이어하기 가드(GDD 121장 8)가 따로 본다 */
  fullHp?: boolean;
  /** 전투 대신 플레이: 기본은 블록 봇 */
  playBattle?: (s: ReturnType<typeof startBattle>) => void;
  /** 손에 든 타일을 놓는가 (기본 true) */
  place?: boolean;
  /** 흡수 화면에서: 'release' = 항상 놓아줌(기본, P2 가드 유지), 'absorb' = 흡수하고 계통을 모으는 쪽으로 장착 */
  absorb?: 'release' | 'absorb';
  /** absorb 가 'absorb' 일 때만: 이 제안(계통)을 흡수할지 정하는 정책. false 면 놓아준다 (계통을 몰거나 흩는 점검 봇용, 없으면 항상 흡수) */
  absorbWanted?: (exp: ExpeditionState) => boolean;
  /** 둥지 칸에 닿을 때마다(바퀴를 마칠 때) 부른다 — 바퀴별 완주·끝 체력을 재는 점검용 (GDD 134장 5) */
  onLapEnd?: (exp: ExpeditionState) => void;
}

const KIND_SCORE = { skill: 3, passive: 2, part: 1 } as const;

/** 봇의 특성 점수: 슬롯에 같은 속성이 많을수록(속성 보너스), skill > passive > part, 보스 특성 가산 */
function traitScore(b: BuildState, id: string): number {
  const t = getTrait(id);
  return (elementCounts(b)[t.element] ?? 0) * 10 + KIND_SCORE[t.kind] + (t.boss ? 2 : 0);
}

/** 후보 중 가장 좋은 특성과, 가득 찼을 때 교체할 슬롯(교체가 이득이 아니면 null = 포기) */
export function botPickTrait(exp: ExpeditionState): { traitId: string | null; replaceSlot: number | null } {
  const offer = exp.absorbOffer;
  if (!offer || offer.candidates.length === 0) return { traitId: null, replaceSlot: null };
  const best = [...offer.candidates].sort((a, b) => traitScore(exp.build, b) - traitScore(exp.build, a))[0]!;
  if (exp.build.slots.includes(null)) return { traitId: best, replaceSlot: null };
  // 가득 참: 가장 점수 낮은 슬롯을 비교 (새 특성의 속성 개수는 교체될 슬롯이 빠진 뒤로 계산)
  let worst = 0;
  let worstScore = Infinity;
  exp.build.slots.forEach((id, i) => {
    const t = getTrait(id!);
    const sc = (elementCounts(exp.build)[t.element] ?? 0) * 10 + KIND_SCORE[t.kind];
    if (sc < worstScore) {
      worstScore = sc;
      worst = i;
    }
  });
  const trial = { owned: exp.build.owned, slots: exp.build.slots.map((x, i) => (i === worst ? null : x)) };
  return traitScore(trial, best) > worstScore ? { traitId: best, replaceSlot: worst } : { traitId: null, replaceSlot: null };
}

export function placeAll(exp: ExpeditionState, maxTiles = 4): void {
  for (const id of [...exp.hand]) {
    if (exp.slots.filter((x) => x !== null).length >= maxTiles) return;
    for (let c = exp.pos + 1; c < exp.slots.length; c++) {
      if (exp.slots[c] === null) {
        placeTile(exp, id, c);
        break;
      }
    }
  }
}

/** 드래프트 봇 (GDD 25-5 ①): 앞쪽 첫 빈 칸에 놓았을 때 시너지가 생기는 카드 > 이벤트 타일 > 첫 카드. 고른 카드는 바로 그 칸에 놓는다(덱 놓기 상한과 별개) */
export function botDraft(exp: ExpeditionState): void {
  const d = exp.draft;
  if (!d || d.picked !== null) return;
  const cell = exp.slots.findIndex((x, c) => c > exp.pos && c >= 1 && x === null);
  const before = synergyPairs(exp.slots).length;
  const score = (id: string): number => {
    let sc = getTile(id).kind === 'event' ? 1 : 0;
    if (cell >= 1) {
      const trial = [...exp.slots];
      trial[cell] = id;
      if (synergyPairs(trial).length > before) sc += 2;
    }
    return sc;
  };
  let best = 0;
  d.options.forEach((id, i) => {
    if (score(id) > score(d.options[best]!)) best = i;
  });
  chooseDraft(exp, best);
  if (cell >= 1) placeTile(exp, d.options[best]!, cell);
}

/** 이벤트 봇 (GDD 25-5 ③): 상인 = 살 수 있는 가장 싼 먹이, 제단 = 리스크가 넉넉하면 첫 특성, 갈림길 = 골드 */
export function botEvent(exp: ExpeditionState): void {
  const ev = exp.eventPending;
  if (!ev) return;
  let choice: number | null = null;
  if (ev.event === 'merchant') {
    const i = (ev.offers ?? []).findIndex((o) => o.kind === 'food' && o.price <= goldAvailable(exp));
    choice = i >= 0 ? i : null;
  } else if (ev.event === 'altar') choice = (ev.traits ?? []).length > 0 && exp.risk + BALANCE.provisional.tileVariants.events.altar.risk < 70 ? 0 : null;
  else if (ev.event === 'crossroads') choice = 1;
  resolveEvent(exp, choice);
}

export function playExpedition(exp: ExpeditionState, opt: AutoOptions): ExpeditionState {
  for (let guard = 0; exp.phase !== 'ended' && guard < 10000; guard++) {
    if (exp.phase === 'moving') {
      if (opt.place !== false) placeAll(exp);
      advance(exp);
    } else if (exp.phase === 'battle') {
      if (opt.fullHp) exp.hpFraction = 1;
      const b = startBattle(exp);
      (opt.playBattle ?? playCombatBot)(b);
      finishBattle(exp, b);
    } else if (exp.phase === 'absorb') {
      if (opt.absorb === 'absorb' && (opt.absorbWanted?.(exp) ?? true)) {
        const pick = botPickTrait(exp);
        chooseAbsorb(exp, pick.traitId, pick.replaceSlot);
      } else chooseRelease(exp);
    } else if (exp.phase === 'rest') finishRest(exp);
    else if (exp.phase === 'event') botEvent(exp);
    else if (exp.phase === 'nest-choice') {
      opt.onLapEnd?.(exp);
      if (opt.place !== false) placeAll(exp);
      if (opt.place !== false && exp.lap < opt.returnAfterLap) botDraft(exp); // 귀환해도 임시 타일은 사라질 뿐이라 먼저 고른다
      if (exp.lap >= opt.returnAfterLap || (opt.minContinueHp !== undefined && (exp.hpFraction ?? 1) < opt.minContinueHp)) chooseReturn(exp);
      else chooseContinue(exp);
    }
  }
  return exp;
}
