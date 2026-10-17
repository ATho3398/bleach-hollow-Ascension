// 원정 자동 플레이어: 밸런스 점검·테스트용. 손에 든 타일을 앞쪽 빈 슬롯에 놓고, 정해진 바퀴에서 귀환한다.
import { playGreedy } from '../battle';
import {
  advance, chooseContinue, chooseReturn, finishBattle, finishRest, placeTile, startBattle, type ExpeditionState,
} from './expedition';

export interface AutoOptions {
  /** 이 바퀴를 마치면 귀환 */
  returnAfterLap: number;
  /** 전투 대신 플레이: 기본은 탐욕 봇 */
  playBattle?: (s: ReturnType<typeof startBattle>) => void;
  /** 손에 든 타일을 놓는가 (기본 true) */
  place?: boolean;
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
    } else if (exp.phase === 'rest') finishRest(exp);
    else if (exp.phase === 'nest-choice') {
      if (opt.place !== false) placeAll(exp);
      if (exp.lap >= opt.returnAfterLap) chooseReturn(exp);
      else chooseContinue(exp);
    }
  }
  return exp;
}
