// C.105b 물공 생성원 간격을 속성별로 (GDD 49-11, 마스터J 지시): physBlocks.spawnSecondsByElement 에 있는 속성은 그 값, 없으면 spawnSeconds. 혈만 짧게(49-9 "혈은 속도"). 첫 블록 시점도 그 간격을 따른다
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { getEnemy } from '../src/data/enemies';
import { PHYS_ELEMENT_IDS } from '../src/data/evolution';
import { buildCombatParams, gainTrait, newBuild } from '../src/engine/absorb';
import { BASIC_SKILL_ID, createCombat, physSpawnSecondsOf, step, ticksOf, type CombatParams } from '../src/engine/combat';
import { applyEvolutionToParams, newEvolution, physSpawnSecondsFor } from '../src/engine/evolution';

const PB = BALANCE.provisional.physBlocks;
const build6 = (): Partial<CombatParams> => {
  const b = newBuild();
  for (const id of ['t-normal-a', 't-water-a', 't-earth-a', 't-normal-b', 't-water-b', 't-normal-c']) gainTrait(b, id);
  return buildCombatParams(b, 'hollow');
};
const bodyOf = (formId: string): CombatParams => {
  const p = build6();
  applyEvolutionToParams(p, { ...newEvolution(), tierIndex: 4, formId }, 'hollow');
  return createCombat(5, { enemy: getEnemy('test-a'), params: { ...p, timeLimitSeconds: 1e9 } }).params;
};

describe('C.105b 속성별 물공 생성원 간격', () => {
  it('혈만 짧고 나머지 5속성은 공통 spawnSeconds (데이터에서 읽는다, 속성 분기 없음)', () => {
    expect(PB.spawnSecondsByElement).toEqual({ blood: 1.8 }); // C.118: 3 ÷ 1.7 (모든 블록 타이머 같은 비율)
    expect(physSpawnSecondsFor('blood')).toBe(1.8);
    for (const el of PHYS_ELEMENT_IDS.filter((e) => e !== 'blood')) expect(physSpawnSecondsFor(el)).toBe(PB.spawnSeconds);
    expect(physSpawnSecondsFor(null)).toBe(PB.spawnSeconds);
    expect(PB.spawnSecondsByElement.blood!).toBeLessThan(PB.spawnSeconds);
  });

  it('applyEvolutionToParams 가 params.physBlockSpawnSeconds 를 채운다: 혈 1.8초 · 흙 3.5초(C.118) · 물공 아닌 몸은 기본값', () => {
    expect(bodyOf('t4:blood:physical').physBlockSpawnSeconds).toBe(1.8);
    expect(physSpawnSecondsOf(bodyOf('t4:blood:physical'))).toBe(1.8);
    expect(bodyOf('t4:earth:physical').physBlockSpawnSeconds).toBe(PB.spawnSeconds);
    const special = bodyOf('t4:blood:special');
    expect(special.physBlock).toBeNull();
    expect(physSpawnSecondsOf(special)).toBeNull();
  });

  it('혈 물공 블록이 흙보다 자주 나온다 (C.136: 출현표 몫 = 1 ÷ 간격), 600초 개수 ≈ 600 ÷ 1.8 (±12%)', () => {
    const countIn = (formId: string, sec: number): number => {
      const s = createCombat(5, { enemy: getEnemy('test-a'), params: { ...bodyOf(formId), timeLimitSeconds: 1e9 } });
      s.player.hp = s.player.maxHp = 1e12; s.enemy.hp = s.enemy.maxHp = 1e12; s.params.voidChance = s.params.voidChanceBonus = 0;
      for (let i = 0; i < ticksOf(s.params, sec); i++) { step(s); s.tray = []; }
      return s.physSpawned ?? 0;
    };
    const blood = countIn('t4:blood:physical', 600);
    const earth = countIn('t4:earth:physical', 600);
    expect(blood).toBeGreaterThan(earth);
    expect(Math.abs(blood - 600 / 1.8)).toBeLessThanOrEqual((600 / 1.8) * 0.12);
    expect(Math.abs(earth - 600 / PB.spawnSeconds)).toBeLessThanOrEqual((600 / PB.spawnSeconds) * 0.12);
  });
});
