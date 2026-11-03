// C.280 (GDD 182장 3): 튜토리얼 노력치 + 흡수 1~2번 만에 '노력치가 가득 찼다' — 1단계에서도 흡수를 여러 번 해 노력치를 쌓을 수 있어야 한다
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { STAT_IDS } from '../src/data/schema';
import { addEv, evCaps, evTotal, type EvolutionState } from '../src/engine/evolution';
import { advance, chooseAbsorb, createExpedition, finishBattle, startBattle, type ExpeditionState } from '../src/engine/expedition';
import { evCapped } from '../src/ui/absorbView';
import { newSaveData } from '../src/game';

const TUT = BALANCE.provisional.tutorialRun;
const DECK = ['prey-nest-a', 'prey-nest-a', 'elite-den-a', 'env-fog', 'rest-a', 'prey-nest-b', 'env-ruin', 'elite-den-b'];

function toAbsorb(factionId: string, evolution: EvolutionState, seed: number): ExpeditionState {
  const exp = createExpedition({ factionId, seed, hunger: 40, condition: 100, deck: DECK, evolution } as Parameters<typeof createExpedition>[0]);
  exp.wildCells = [exp.pos + 1];
  advance(exp);
  const b = startBattle(exp);
  b.enemy.hp = 0;
  b.status = 'won';
  b.finisher = { kind: 'basic-attack', traitId: null, element: null };
  b.riskGained = 0;
  finishBattle(exp, b);
  expect(exp.phase).toBe('absorb');
  return exp;
}

describe('182장 3: 튜토리얼 노력치 뒤에도 1단계 흡수로 노력치가 여러 번 쌓인다', () => {
  for (const factionId of ['hollow', 'shinigami']) {
    it(`${factionId}: 튜토리얼 보상 뒤 1단계 상한에 '둘 다' 흡수 최대치(4) 4번 이상 자리가 남는다`, () => {
      const s = newSaveData(factionId, 1);
      expect(addEv(s.evolution, Object.fromEntries(STAT_IDS.map((k) => [k, TUT.statEv])))).toEqual(Object.fromEntries(STAT_IDS.map((k) => [k, TUT.statEv])));
      const cap = evCaps(0);
      expect(cap.total - evTotal(s.evolution.ev)).toBeGreaterThanOrEqual(16);
      // 단계 상한은 진화로 줄지 않는다
      for (let i = 1; i < BALANCE.provisional.stats.evCapTotal.length; i++) expect(evCaps(i).total).toBeGreaterThanOrEqual(evCaps(i - 1).total);
    });

    it(`${factionId}: 튜토리얼 뒤 '둘 다' 흡수 4번이 전부 노력치를 받는다(가득 표시 없음)`, () => {
      const s = newSaveData(factionId, 1);
      addEv(s.evolution, Object.fromEntries(STAT_IDS.map((k) => [k, TUT.statEv])));
      let evo = s.evolution;
      for (let i = 0; i < 4; i++) {
        const exp = toAbsorb(factionId, evo, 7 + i);
        expect(evCapped(exp, 'both'), `${i + 1}번째 흡수`).toBe(false);
        const before = evTotal(exp.evolution.ev);
        expect(chooseAbsorb(exp, null, undefined, 'both').ok).toBe(true);
        expect(evTotal(exp.evolution.ev)).toBeGreaterThan(before);
        evo = exp.evolution;
      }
    });
  }
});
