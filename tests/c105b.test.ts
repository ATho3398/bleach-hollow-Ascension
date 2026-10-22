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
  for (const id of ['t-normal-a', 't-water-a', 't-earth-a', 't-normal-guard', 't-water-guard', 't-normal-heal']) gainTrait(b, id);
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
    expect(bodyOf('t5:blood:physical').physBlockSpawnSeconds).toBe(1.8);
    expect(physSpawnSecondsOf(bodyOf('t5:blood:physical'))).toBe(1.8);
    expect(bodyOf('t5:earth:physical').physBlockSpawnSeconds).toBe(PB.spawnSeconds);
    const special = bodyOf('t5:blood:special');
    expect(special.physBlock).toBeNull();
    expect(physSpawnSecondsOf(special)).toBeNull();
  });

  it('첫 물공 블록도 그 간격을 따른다: 혈의 첫 블록이 흙보다 빨리 나오고, 60초 개수는 60 ÷ 3 ± 1', () => {
    const firstAt = (formId: string): number => {
      const s = createCombat(5, { enemy: getEnemy('test-a'), params: { ...bodyOf(formId), timeLimitSeconds: 1e9 } });
      s.player.hp = s.player.maxHp = 1e12; s.enemy.hp = s.enemy.maxHp = 1e12; s.voidTimer = 1e9;
      for (let i = 1; i <= ticksOf(s.params, 60); i++) {
        step(s);
        if (s.tray.some((b) => b.traitId === BASIC_SKILL_ID)) return i * s.params.tickSeconds;
        s.tray = [];
      }
      return Infinity;
    };
    const blood = firstAt('t5:blood:physical');
    const earth = firstAt('t5:earth:physical');
    expect(blood).toBeLessThanOrEqual(1.8);
    expect(blood).toBeLessThan(earth);
    expect(earth).toBeLessThanOrEqual(PB.spawnSeconds);
    const s = createCombat(6, { enemy: getEnemy('test-a'), params: { ...bodyOf('t5:blood:physical'), timeLimitSeconds: 1e9 } });
    s.player.hp = s.player.maxHp = 1e12; s.enemy.hp = s.enemy.maxHp = 1e12; s.voidTimer = 1e9;
    for (let i = 0; i < ticksOf(s.params, 60); i++) { step(s); s.tray = []; }
    expect(Math.abs((s.physSpawned ?? 0) - 60 / 1.8)).toBeLessThanOrEqual(1);
  });
});
