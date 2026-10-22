// C.127 (GDD 75장): 특수 속성(혈·독·허) 숨김을 '특성 후보'에서 '적 등장'으로 옮김
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { getEnemy } from '../src/data/enemies';
import { SPECIAL_ELEMENT_IDS } from '../src/data/elements';
import { getTrait } from '../src/data/traits';
import { buildOffer, newBuild, rerollCandidates } from '../src/engine/absorb';
import { enemyPool, gateSpecialEnemies, specialEnemyGate } from '../src/engine/enemyPool';
import { advance, chooseAbsorb, createExpedition, finishBattle, startBattle, type ExpeditionState } from '../src/engine/expedition';
import { mutationMods } from '../src/engine/expedition/variants';
import { createRng } from '../src/engine/rng';

const S = BALANCE.provisional.specialEnemies;
const WON = { status: 'won' as const, finisher: null, chain3Count: 0, weakChain3Count: 0 };
const special = (el: string) => SPECIAL_ELEMENT_IDS.includes(el);

/** 길 다음 칸에 적을 세워 한 번 만난다 (tile 없으면 야생 일반 적) */
function meet(seed: number, difficulty: number, opt: { mutation?: string; tile?: string; groundId?: string } = {}): ExpeditionState {
  const exp = createExpedition({ factionId: 'hollow', seed, hunger: 10, condition: 100, deck: [], difficulty, groundId: opt.groundId ?? 'forest' });
  exp.mutation = opt.mutation ?? null;
  const cell = exp.pos + 1;
  exp.wildCells = opt.tile ? [] : [cell];
  exp.slots = exp.slots.map(() => null);
  if (opt.tile) exp.slots[cell] = opt.tile;
  advance(exp);
  expect(exp.phase).toBe('battle');
  return exp;
}

function specialCount(difficulty: number, opt: Parameters<typeof meet>[2] = {}, n = 150): number {
  let c = 0;
  for (let seed = 1; seed <= n; seed++) if (special(meet(seed, difficulty, opt).pending!.enemy.element)) c++;
  return c;
}

describe('C.127 75장: 혈·독·허 적 등장 숨김', () => {
  it('출현 배율: 강적 / 공허의 밤 / ★3 이상만, 여럿이면 최대 (provisional)', () => {
    expect(specialEnemyGate({ elite: false, difficulty: 1 })).toEqual({ chance: 0, gates: [] });
    expect(specialEnemyGate({ elite: false, difficulty: S.minDifficulty - 1 }).chance).toBe(0);
    expect(specialEnemyGate({ elite: true, difficulty: 1 })).toEqual({ chance: S.elite, gates: ['elite'] });
    expect(specialEnemyGate({ elite: false, difficulty: S.minDifficulty })).toEqual({ chance: S.difficulty, gates: ['difficulty'] });
    expect(specialEnemyGate({ elite: false, boss: true, difficulty: 1 }).chance).toBe(1);
    const night = mutationMods('void-night').specialEnemyChance!;
    expect(night).toBeGreaterThan(0);
    expect(specialEnemyGate({ elite: false, difficulty: 1, mutationChance: night })).toEqual({ chance: night, gates: ['mutation'] });
    expect(mutationMods('calm').specialEnemyChance).toBeUndefined();
    expect(BALANCE.provisional.absorb).not.toHaveProperty('specialTraits');
  });

  it('풀 가중치: 0 이면 혈·독·허 적이 빠지고(다른 속성만), 사이 값이면 가중치 × 배율, 피의 달 속성은 그대로', () => {
    const pool = enemyPool('normal', 1);
    expect(pool.some((e) => special(e.enemy.element))).toBe(true);
    const closed = gateSpecialEnemies(pool, 0);
    expect(closed.some((e) => special(e.enemy.element))).toBe(false);
    expect(closed.length).toBe(pool.filter((e) => !special(e.enemy.element)).length);
    const half = gateSpecialEnemies(pool, 0.5);
    for (let i = 0; i < pool.length; i++) expect(half[i]!.weight).toBe(pool[i]!.weight * (special(pool[i]!.enemy.element) ? 0.5 : 1));
    const bloodMoon = gateSpecialEnemies(pool, 0, 'blood');
    expect(bloodMoon.some((e) => e.enemy.element === 'blood')).toBe(true);
    expect(bloodMoon.some((e) => e.enemy.element === 'poison' || e.enemy.element === 'kyo')).toBe(false);
  });

  it('★1~2 일반 길(야생 일반 적·먹잇감 둥지)에는 혈·독·허 적이 0 — 혈·허가 주 속성인 숲에서도', () => {
    for (const d of [1, 2]) {
      expect(specialCount(d)).toBe(0);
      expect(specialCount(d, { tile: 'prey-nest-a' })).toBe(0);
      expect(specialCount(d, { tile: 'prey-nest-b', groundId: 'canyon' })).toBe(0);
    }
  });

  it('강적·★3 이상·공허의 밤에서는 나온다', () => {
    expect(specialCount(1, { tile: 'elite-den-a' })).toBeGreaterThan(10);
    expect(specialCount(3)).toBeGreaterThan(10);
    expect(specialCount(1, { mutation: 'void-night' })).toBeGreaterThan(10);
  });

  it('독 적을 포식하면 독 특성 후보가 늘 1개 이상 (특성 숨김 없음, 다시 뽑기도)', () => {
    for (let seed = 1; seed <= 60; seed++) {
      for (const id of ['poison-basic', 'blood-basic', 'kyo-basic']) {
        const enemy = getEnemy(id);
        const o = buildOffer(createRng(seed), enemy, newBuild(), WON);
        expect(o.candidates.length, `${id} ${seed}`).toBeGreaterThanOrEqual(1);
        for (const t of o.candidates) expect(getTrait(t).element).toBe(enemy.element);
        for (const t of rerollCandidates(createRng(seed + 7), o, newBuild())) expect(getTrait(t).element).toBe(enemy.element);
      }
    }
  });

  it('원정에서 만난 혈·독·허 적을 이기면 포식 후보가 그 속성이고, 나온 까닭이 런 로그 흡수 기록에 남는다', () => {
    let checked = 0;
    for (let seed = 1; seed <= 80 && checked < 5; seed++) {
      const exp = meet(seed, 3);
      if (!special(exp.pending!.enemy.element)) continue;
      const b = startBattle(exp);
      b.enemy.hp = 0;
      b.status = 'won';
      finishBattle(exp, b);
      expect(exp.phase).toBe('absorb');
      const o = exp.absorbOffer!;
      expect(o.candidates.length).toBeGreaterThanOrEqual(1);
      for (const t of o.candidates) expect(getTrait(t).element).toBe(o.element);
      expect(o.specialGates).toEqual(['difficulty']);
      const pick = o.candidates[0]!;
      expect(chooseAbsorb(exp, pick, 0).ok).toBe(true);
      expect(exp.absorbRecords.at(-1)).toMatchObject({ element: o.element, absorbed: true, traitId: pick, specialGates: ['difficulty'], hiddenTrait: true });
      checked++;
    }
    expect(checked).toBe(5);
  });
});
