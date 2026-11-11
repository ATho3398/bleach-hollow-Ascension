// R213 (GDD 190장 1, 코딩213): 사용자 상태(호로·1단계·노력치 체력·지능·방어·정신력·속도 +3 · 힘 +7 = 합 22)에서
// 흡수 화면 [능력치 포식] 흐림(evCapped)이 실제 지급과 같은 계산인지 — 빈사·★1~4·허우적·연속 클리어·1~3바퀴 전부.
// 흐림 = 실제로 오르는 노력치가 0 일 때만, 그리고 합계·능력치 하나 상한에 여유가 있으면 흐리지 않는다
import { describe, expect, it } from 'vitest';
import { STAT_IDS } from '../src/data/schema';
import { addEv, evCaps, evTotal } from '../src/engine/evolution';
import { advance, chooseAbsorb, createExpedition, finishBattle, startBattle, type ExpeditionState } from '../src/engine/expedition';
import { evCapped } from '../src/ui/absorbView';
import { newSaveData } from '../src/game';

const DECK = ['prey-nest-a', 'prey-nest-a', 'elite-den-a', 'env-fog', 'rest-a', 'prey-nest-b', 'env-ruin', 'elite-den-b'];

function userSave() {
  const s = newSaveData('hollow', 1);
  addEv(s.evolution, Object.fromEntries(STAT_IDS.map((k) => [k, 3]))); // 튜토리얼 +3 × 6
  addEv(s.evolution, { atk: 4 }); // 능력치 포식 1번 (힘 2 × 2)
  return s;
}

/** 이 상태에서 그 갈래를 실제로 실행하면 오르는 노력치 합 */
function realGain(exp: ExpeditionState, m: 'stat' | 'both'): number {
  const c = structuredClone(exp);
  const before = evTotal(c.evolution.ev);
  chooseAbsorb(c, null, undefined, m);
  return evTotal(c.evolution.ev) - before;
}

describe('R213 노력치 흐림 = 실제 지급 (사용자 상태)', () => {
  it('사용자 상태 = 합 22 · 힘 7 · 1단계 상한 96/67', () => {
    const s = userSave();
    expect(evTotal(s.evolution.ev)).toBe(22);
    expect(s.evolution.ev.atk).toBe(7);
    expect(evCaps(s.evolution.tierIndex)).toEqual({ total: 96, perStat: 67 }); // GDD 207장 (202장 56/33 · 옛 36/18)
  });

  it('빈사·★·허우적·연속 클리어·바퀴 어디서도 흐림과 실제 지급이 같고, 여유가 있으면 흐리지 않는다', () => {
    let checks = 0;
    for (const dying of [false, true]) for (const star of [1, 2, 3, 4]) for (const fail of [false, true]) for (const streak of [0, 3]) for (const seed of [1, 2, 3]) {
      const s = userSave();
      if (fail) s.evolution.abilities = { ...s.evolution.abilities!, equipped: ['uniq:fail'] };
      const exp = createExpedition({ factionId: 'hollow', seed: seed * 77 + star, hunger: 10, condition: 100, care: { weak: false, tired: false, dying }, hpFraction: 1, deck: DECK, risk: 0, build: s.build, evolution: s.evolution, difficulty: star, streak, tilesLocked: true });
      let n = 0;
      for (let i = 0; i < 600 && exp.phase !== 'ended' && exp.lap <= 3; i++) {
        if (exp.phase === 'battle') {
          const b = startBattle(exp);
          b.enemy.hp = 0;
          b.status = 'won';
          finishBattle(exp, b);
          continue;
        }
        if (exp.phase === 'absorb') {
          for (const m of ['stat', 'both'] as const) {
            checks++;
            const cap = evCaps(exp.evolution.tierIndex);
            const roomy = evTotal(exp.evolution.ev) < cap.total && STAT_IDS.some((k) => (exp.absorbOffer!.ev[k] ?? 0) > 0 && exp.evolution.ev[k] < cap.perStat);
            expect(evCapped(exp, m)).toBe(realGain(exp, m) <= 0);
            if (roomy) expect(evCapped(exp, m)).toBe(false);
          }
          chooseAbsorb(exp, null, undefined, n++ % 2 ? 'stat' : 'both');
          continue;
        }
        if (exp.phase === 'rest') exp.phase = 'moving';
        advance(exp);
      }
    }
    expect(checks).toBeGreaterThan(100);
  });
});
