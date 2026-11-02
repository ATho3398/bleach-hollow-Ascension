// C.142 (GDD 84장 3번 · v5.180): 블록형 몸(블록 다 쓰는)이 평타형 몸(물공)보다 조금 세고 치명 살짝 높게.
// 블록 보정(blockPlayDamage·blockPlayCrit)은 물공 몸에 안 붙고, 물공 몸은 평타형 대가(physBlocks.damage, 속성별)로 주는 피해가 줄어든다
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { getEnemy } from '../src/data/enemies';
import { PHYS_ELEMENT_IDS, getForm } from '../src/data/evolution';
import { BASIC_SKILL_ID, applyInput, createCombat, drainCombatEvents, step, type Block, type CombatParams, type CombatState } from '../src/engine/combat';
import { formAbilitiesOf, physBlockOf, zeroStats } from '../src/engine/evolution';

const PB = BALANCE.provisional.physBlocks;
const CX = BALANCE.provisional.combat;
const normal = getEnemy('test-a');
const STILL: Partial<CombatParams> = { critChance: 0, enemyCritChance: 0, enemyDamageVariance: 0, blockPlayCrit: 0 };
const quiet = (s: CombatState) => {
  s.spawnTimer = 1e9;
  s.enemy.attackTimer = s.enemy.actionTimer = 1e9;
  s.enemy.hp = s.enemy.maxHp = 1e9;
  return s;
};
const mk = (params: Partial<CombatParams>) => quiet(createCombat(1, { enemy: normal, params: { ...STILL, ...params } }));
const blk = (): Block => ({ uid: 1, kind: 'skill', traitId: BASIC_SKILL_ID, family: 'family-a' });
/** 블록 한 번 피해 */
const blockHit = (params: Partial<CombatParams>) => {
  const s = mk(params);
  s.player.attackTimer = 1e9;
  s.tray = [blk()];
  const before = s.enemy.hp;
  applyInput(s, { type: 'use', cell: 0 });
  return before - s.enemy.hp;
};
/** 첫 평타 피해 */
const basicHit = (params: Partial<CombatParams>) => {
  const s = mk(params);
  for (let i = 0; i < 2000 && s.enemy.hp === s.enemy.maxHp; i++) { step(s); drainCombatEvents(s); }
  return s.enemy.maxHp - s.enemy.hp;
};

describe('84장 3번 블록형 > 평타형 (C.142)', () => {
  it('평타형 대가: 수치는 1 미만, 속성별 값이 없으면 공통 값', () => {
    expect(PB.damage).toBeGreaterThan(0.5);
    expect(PB.damage).toBeLessThan(1);
    for (const el of PHYS_ELEMENT_IDS) {
      const d = PB.damageByElement[el] ?? PB.damage;
      expect(d).toBeGreaterThan(0.5);
      expect(d).toBeLessThan(1);
      expect(physBlockOf(formAbilitiesOf(getForm(`t4:${el}:physical`), zeroStats(), 'atk'))?.damage).toBe(d);
    }
    // 특수·혼합(블록형) 몸은 물공 칸이 없다
    expect(physBlockOf(formAbilitiesOf(getForm('t4:fire:special'), zeroStats(), 'atk'))).toBeNull();
  });

  it('물공 몸은 평타·블록 피해가 × damage, 블록 보정은 없다', () => {
    const phys = { element: 'normal', power: 1, effect: 'shout' as const };
    const withCost = { physBlock: { ...phys, damage: 0.8 } };
    const noCost = { physBlock: phys };
    expect(basicHit(withCost)).toBeCloseTo(basicHit(noCost) * 0.8);
    expect(blockHit(withCost)).toBeCloseTo(blockHit(noCost) * 0.8);
    // 블록 보정은 물공 몸에 안 붙는다 (blockPlayDamage 를 바꿔도 같은 피해)
    expect(blockHit({ ...withCost, blockPlayDamage: 2 })).toBeCloseTo(blockHit({ ...withCost, blockPlayDamage: 1 }));
  });

  it('블록형 몸은 블록 피해 보정·치명 가산이 있고 평타형 대가는 없다', () => {
    expect(CX.blockPlayDamage).toBeGreaterThan(1);
    expect(CX.blockPlayCrit).toBeGreaterThan(0);
    expect(basicHit({ physBlock: null })).toBeCloseTo(basicHit({ physBlock: null, blockPlayDamage: 1 }));
    expect(blockHit({ physBlock: null })).toBeCloseTo(blockHit({ physBlock: null, blockPlayDamage: 1 }) * CX.blockPlayDamage);
  });
});
