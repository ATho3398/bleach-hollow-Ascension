// 원정 자동 플레이어: 밸런스 점검·테스트용. 손에 든 타일을 앞쪽 빈 슬롯에 놓고, 정해진 바퀴에서 귀환한다.
import { getTrait } from '../../data/traits';
import { lineageCounts, type BuildState } from '../absorb';
import { playGreedy } from '../battle';
import {
  advance, chooseAbsorb, chooseContinue, chooseRelease, chooseReturn, finishBattle, finishRest, placeTile, startBattle,
  type ExpeditionState,
} from './expedition';

export interface AutoOptions {
  /** 이 바퀴를 마치면 귀환 */
  returnAfterLap: number;
  /** 전투 대신 플레이: 기본은 탐욕 봇 */
  playBattle?: (s: ReturnType<typeof startBattle>) => void;
  /** 손에 든 타일을 놓는가 (기본 true) */
  place?: boolean;
  /** 흡수 화면에서: 'release' = 항상 놓아줌(기본, P2 가드 유지), 'absorb' = 흡수하고 계통을 모으는 쪽으로 장착 */
  absorb?: 'release' | 'absorb';
}

const KIND_SCORE = { skill: 3, passive: 2, part: 1 } as const;

/** 봇의 특성 점수: 슬롯에 같은 계통이 많을수록(계통 보너스), skill > passive > part, 희귀 가산 */
function traitScore(b: BuildState, id: string): number {
  const t = getTrait(id);
  return (lineageCounts(b)[t.lineageId] ?? 0) * 10 + KIND_SCORE[t.kind] + (t.rare ? 2 : 0);
}

/** 후보 중 가장 좋은 특성과, 가득 찼을 때 교체할 슬롯(교체가 이득이 아니면 null = 포기) */
export function botPickTrait(exp: ExpeditionState): { traitId: string | null; replaceSlot: number | null } {
  const offer = exp.absorbOffer;
  if (!offer || offer.candidates.length === 0) return { traitId: null, replaceSlot: null };
  const best = [...offer.candidates].sort((a, b) => traitScore(exp.build, b) - traitScore(exp.build, a))[0]!;
  if (exp.build.slots.includes(null)) return { traitId: best, replaceSlot: null };
  // 가득 참: 가장 점수 낮은 슬롯을 비교 (새 특성의 계통 개수는 교체될 슬롯이 빠진 뒤로 계산)
  let worst = 0;
  let worstScore = Infinity;
  exp.build.slots.forEach((id, i) => {
    const t = getTrait(id!);
    const sc = (lineageCounts(exp.build)[t.lineageId] ?? 0) * 10 + KIND_SCORE[t.kind];
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

export function playExpedition(exp: ExpeditionState, opt: AutoOptions): ExpeditionState {
  for (let guard = 0; exp.phase !== 'ended' && guard < 10000; guard++) {
    if (exp.phase === 'moving') {
      if (opt.place !== false) placeAll(exp);
      advance(exp);
    } else if (exp.phase === 'battle') {
      const b = startBattle(exp);
      (opt.playBattle ?? playGreedy)(b);
      finishBattle(exp, b);
    } else if (exp.phase === 'absorb') {
      if (opt.absorb === 'absorb') {
        const pick = botPickTrait(exp);
        chooseAbsorb(exp, pick.traitId, pick.replaceSlot);
      } else chooseRelease(exp);
    } else if (exp.phase === 'rest') finishRest(exp);
    else if (exp.phase === 'nest-choice') {
      if (opt.place !== false) placeAll(exp);
      if (exp.lap >= opt.returnAfterLap) chooseReturn(exp);
      else chooseContinue(exp);
    }
  }
  return exp;
}
