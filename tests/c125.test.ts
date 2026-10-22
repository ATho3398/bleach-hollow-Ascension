// C.125 (GDD 70·71·72장): 포식 후보는 그 적 속성 안에서만 · 포식 조건 삭제 · 원정 한 칸 시간 1/2
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { getEnemy } from '../src/data/enemies';
import { getTrait } from '../src/data/traits';
import { getBoss } from '../src/data/bosses';
import { buildOffer, canAbsorb, gainTrait, newBuild, rerollCandidates } from '../src/engine/absorb';
import { createRng } from '../src/engine/rng';
import { advance, createExpedition, finishBattle, offerElementsOf, rerollAbsorb, startBattle } from '../src/engine/expedition';

const WON = { status: 'won' as const, finisher: null, chain3Count: 0, weakChain3Count: 0 };
const elementsOf = (ids: string[]) => new Set(ids.map((id) => getTrait(id).element));

describe('C.125 70장: 포식 특성 후보 = 그 적의 속성 안에서만', () => {
  it('독 일반·독 강적 → 후보는 독 특성만, 여러 시드·후보 +n 에서도', () => {
    for (let seed = 1; seed <= 60; seed++) {
      for (const id of ['poison-basic', 'poison-heavy-chain', 'water-basic', 'thunder-stance', 'normal-basic']) {
        const enemy = getEnemy(id);
        const o = buildOffer(createRng(seed), enemy, newBuild(), WON, seed % 3, null);
        expect(o.candidates.length).toBeGreaterThan(0);
        expect([...elementsOf(o.candidates)]).toEqual([enemy.element]);
      }
    }
  });

  it('첫 흡수(장착 없음)의 공격 계열 섞임도 다른 속성 공격 특성을 끼워 넣지 않는다', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const o = buildOffer(createRng(seed), getEnemy('fire-basic'), newBuild(), WON);
      expect([...elementsOf(o.candidates)]).toEqual(['fire']);
    }
  });

  it('다시 뽑기도 그 적 속성 안에서만 (확정 희귀 후보는 그대로)', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const enemy = { ...getEnemy('poison-heavy-seal'), rare: true };
      const o = buildOffer(createRng(seed), enemy, newBuild(), WON, 1, null);
      const again = rerollCandidates(createRng(seed + 1000), o, newBuild());
      expect([...elementsOf(again)]).toEqual(['poison']);
      expect(again[0]).toBe(o.candidates[0]); // 희귀 특성 확정 후보
      expect(getTrait(again[0]!).rare).toBe(true);
    }
  });

  it('그 속성 특성이 모자라면 후보 수를 줄이고 다른 속성으로 채우지 않는다', () => {
    const build = newBuild();
    const water = ['t-water-a', 't-water-b', 't-water-c', 't-water-guard', 't-water-heal'].filter((id) => {
      try { return getTrait(id).element === 'water'; } catch { return false; }
    });
    for (const id of water) gainTrait(build, id);
    const left = (seed: number) => buildOffer(createRng(seed), getEnemy('water-heavy-seal'), build, WON, 5);
    for (let seed = 1; seed <= 20; seed++) {
      const o = left(seed);
      expect(o.candidates.every((id) => getTrait(id).element === 'water' && !build.owned.includes(id))).toBe(true);
      expect(o.candidates.length).toBeLessThan(BALANCE.provisional.absorb.candidatesElite + 5);
    }
  });

  it('C.127 (75장): 특성 숨김이 없어져 독 일반도 늘 독 특성 후보가 있다 (옛: 숨김이 닫히면 0개)', () => {
    const o = buildOffer(createRng(1), getEnemy('poison-basic'), newBuild(), WON);
    expect(o.candidates.length).toBeGreaterThan(0);
    expect([...elementsOf(o.candidates)]).toEqual(['poison']);
  });

  it('속성이 바뀌는 보스(숲의 군주)는 그 속성들 안에서, 보스 특성은 확정 후보', () => {
    const els = offerElementsOf('forest-lord', getBoss('forest-lord').enemy.element);
    expect(els.sort()).toEqual(['kyo', 'thunder', 'water']);
    for (let seed = 1; seed <= 20; seed++) {
      const o = buildOffer(createRng(seed), getBoss('forest-lord').enemy, newBuild(), WON, 0, getBoss('forest-lord').trait, 1, els);
      expect(o.candidates[0]).toBe(getBoss('forest-lord').trait);
      for (const id of o.candidates) expect(els).toContain(getTrait(id).element);
    }
    // 그 속성이 아닌 보스 특성은 확정 후보로도 넣지 않는다
    const o = buildOffer(createRng(1), getEnemy('water-basic'), newBuild(), WON, 0, getBoss('canyon-king').trait);
    expect(o.candidates).not.toContain(getBoss('canyon-king').trait);
  });
});

describe('C.125 71장: 포식 조건 삭제', () => {
  it('상성 아닌 공격(기본 공격)으로 마무리하고 skill 을 장착했어도 이기면 포식 화면', () => {
    const exp = createExpedition({ factionId: 'hollow', seed: 3, hunger: 10, condition: 100, deck: ['prey-nest-a'] });
    exp.wildCells = [exp.pos + 1];
    advance(exp);
    const b = startBattle(exp);
    b.enemy.hp = 0;
    b.status = 'won';
    b.finisher = { kind: 'basic-attack', traitId: null, element: null };
    b.weakChain3Count = 0;
    b.params = { ...b.params, skills: [{ id: 't-fire-a', element: 'fire', category: 'physical', role: 'attack', powerInAttacks: 1, chainBonus: { kind: 'stagger', value: 1 }, powerMultiplier: 1 }] };
    const rec = finishBattle(exp, b);
    expect(rec.absorbable).toBe(true);
    expect(exp.phase).toBe('absorb');
    expect(exp.absorbOffer!.reasons).toEqual(['victory']);
    // 다시 뽑기도 적 속성 안에서
    expect(rerollAbsorb(exp)).toEqual({ ok: true });
    for (const id of exp.absorbOffer!.candidates) expect(getTrait(id).element).toBe(exp.absorbOffer!.element);
  });

  it('진 전투는 포식 불가', () => {
    expect(canAbsorb({ status: 'lost' })).toBe(false);
    expect(canAbsorb({ status: 'won' })).toBe(true);
  });
});

describe('C.125 72장: 원정 한 칸 이동 시간 1/2', () => {
  it('칸 시간 5초 → 2.5초, 휴식 시간(2칸 × 5초 = 10초)은 그대로', () => {
    expect(BALANCE.expedition.secondsPerTile).toBe(2.5);
    expect(BALANCE.provisional.expedition.restTimeTiles * BALANCE.expedition.restSecondsPerTile).toBe(10);
    const exp = createExpedition({ factionId: 'hollow', seed: 1, hunger: 10, condition: 100, deck: [] });
    exp.wildCells = [];
    exp.slots = exp.slots.map(() => null);
    advance(exp);
    expect(exp.elapsedSeconds).toBe(2.5);
  });
});
