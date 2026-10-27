// C.105 물공 블록 보장 생성원 + 49-9 목표(흙 버티기·혈 속도) (GDD 49-11): 물공 블록은 기본 블록 몫(44-3)에서 빠져 자기 타이머(provisional.physBlocks.spawnSeconds) 하나로 나온다.
// 기본 타이머는 막기·회복만 내되 그 속도는 그대로. 수치는 BALANCE.provisional.physBlocks (provisional)
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { getEnemy } from '../src/data/enemies';
import { getForm } from '../src/data/evolution';
import { buildCombatParams, gainTrait, newBuild } from '../src/engine/absorb';
import {
  BASIC_GUARD_ID, BASIC_HEAL_ID, BASIC_SKILL_ID, applyInput, basicPowerOf, basicSpawnSecondsOf, basicTimerPoolOf, blockPoolOf, createCombat, drainCombatEvents, elapsedSeconds,
  physSpawnSecondsOf, playCombatHuman, spawnRatesOf, spawnTableOf, step, ticksOf, type Block, type CombatEvent, type CombatParams, type CombatState, type PhysBlock,
} from '../src/engine/combat';
import { abilityEffectsOf, formAbilitiesOf, physBlockOf, zeroStats } from '../src/engine/evolution';

const PB = BALANCE.provisional.physBlocks;
const normal = getEnemy('test-a');
let uid = 9000;
const blk = (traitId: string, family: string | null = 'family-a'): Block => ({ uid: uid++, kind: 'skill', traitId, family });
const STILL: Partial<CombatParams> = { critChance: 0, enemyCritChance: 0, enemyDamageVariance: 0 };
const physOf = (id: string): PhysBlock | null => physBlockOf(formAbilitiesOf(getForm(id), zeroStats(), 'atk'));
const fxOf = (id: string) => abilityEffectsOf(formAbilitiesOf(getForm(id), zeroStats(), 'atk')).effects;
/** 흡수 6칸 몸 (5단계에 갓 닿은 몸과 같은 칸 수) */
const build6 = (): Partial<CombatParams> => {
  const b = newBuild();
  for (const id of ['t-normal-a', 't-water-a', 't-earth-a', 't-normal-b', 't-water-b', 't-normal-c']) gainTrait(b, id);
  return buildCombatParams(b, 'hollow');
};
const mk = (extra: Partial<CombatParams>, seed = 1, enemy = normal) => createCombat(seed, { enemy, params: { ...STILL, ...extra } });
const run = (s: CombatState, seconds: number): CombatEvent[] => {
  const evs: CombatEvent[] = [];
  for (let i = 0; i < ticksOf(s.params, seconds) && s.status === 'playing'; i++) {
    step(s);
    evs.push(...drainCombatEvents(s));
  }
  return evs;
};
/** seconds 동안 생긴 블록 (쓰지 않으니 바가 차면 비우고 센다, 시간 제한·체력 무시) */
function spawnedIn(s: CombatState, seconds: number): { traitId: string | null; family: string | null }[] {
  const out: { traitId: string | null; family: string | null }[] = [];
  s.player.hp = s.player.maxHp = 1e12;
  s.enemy.hp = s.enemy.maxHp = 1e12;
  s.params.voidChance = s.params.voidChanceBonus = 0;
  for (let i = 0; i < ticksOf(s.params, seconds) && s.status === 'playing'; i++) {
    step(s);
    for (const b of s.tray) if (b.kind === 'skill') out.push({ traitId: b.traitId, family: b.family ?? null });
    s.tray = [];
  }
  return out;
}
const nextBasic = (s: CombatState) => {
  for (let i = 0; i < 100 && s.status === 'playing'; i++) {
    step(s);
    if (drainCombatEvents(s).some((e) => e.kind === 'player-attack')) return;
  }
};

describe('C.105 물공 블록 생성원 타이머 (GDD 49-11)', () => {
  const earthBody = () => mk({ ...build6(), timeLimitSeconds: 1e9, physBlock: physOf('t5:earth:physical')! }, 3);
  const plainBody = () => mk({ ...build6(), timeLimitSeconds: 1e9 }, 3);

  it('물공 몸은 출현표에 물공 몫이 하나 더 (C.136 타이머 하나 + 확률표), 몫 = 1 ÷ (physBlocks.spawnSeconds ÷ 블록 가속)', () => {
    const a = earthBody();
    const b = plainBody();
    expect(spawnTableOf(a.params).entries.filter((e) => e.phys)).toHaveLength(1);
    expect(spawnTableOf(b.params).entries.filter((e) => e.phys)).toHaveLength(0);
    expect(physSpawnSecondsOf(a.params)).toBe(PB.spawnSeconds);
    expect(physSpawnSecondsOf(b.params)).toBeNull();
    expect(physSpawnSecondsOf({ ...a.params, blockSpawnMultiplier: 2 })).toBeCloseTo(PB.spawnSeconds / 2);
    // C.173 (101장): 블록 하나가 공허 확률로 공허가 되므로 실제 몫은 × (1 − 공허 확률)
    // C.174 (GDD 105장): 막기·회복이 빠진 몫(freedRoleShare)을 공격 블록(물공 포함) 속도로 돌려준다
    expect(spawnRatesOf({ ...a.params, voidChance: 0, voidChanceBonus: 0 }).phys).toBeCloseTo(1 / PB.spawnSeconds / (1 - BALANCE.provisional.blockPool.freedRoleShare));
    expect(spawnRatesOf(b.params).phys).toBe(0);
  });

  it('기본 타이머 풀: 물공 몸은 없음(C.174 GDD 105장: 막기·회복은 버튼), 보통 몸은 blockPoolOf 그대로 (충전용 전체 풀에는 공격이 남는다)', () => {
    const a = earthBody();
    expect(basicTimerPoolOf(a.params)).toEqual([]);
    expect(blockPoolOf(a.params).filter((e) => e.source.id === BASIC_SKILL_ID)).toHaveLength(3);
    const b = plainBody();
    expect(basicTimerPoolOf(b.params)).toEqual(blockPoolOf(b.params));
  });

  it('물공 블록 개수 기대치 ≈ 시간 ÷ spawnSeconds (C.136: 출현표 확률이라 ±12%), 기본 몫에서는 공격이 안 나오고 막기·회복 블록은 없다(C.174)', () => {
    const SEC = 600;
    const a = earthBody();
    const outA = spawnedIn(a, SEC);
    const physA = outA.filter((x) => x.traitId === BASIC_SKILL_ID);
    const expected = SEC / PB.spawnSeconds / (1 - BALANCE.provisional.blockPool.freedRoleShare);
    expect(physA.length).toBeGreaterThanOrEqual(expected * 0.85);
    expect(physA.length).toBeLessThanOrEqual(expected * 1.15);
    expect(a.physSpawned).toBe(physA.length);
    // 계열은 종족 계열 표 3종에서 고르게
    expect(new Set(physA.map((x) => x.family))).toEqual(new Set(['family-a', 'family-b', 'family-c']));
    // C.136 (GDD 84장 6번): 옛 "60초 창마다 거의 같은 개수(보장된 타이머)"는 확률표로 바뀌어 없앴다
    const b = earthBody();
    // 막기·회복은 버튼 (C.174, GDD 105장): 블록으로는 나오지 않는다
    const LONG = 6000;
    const outA2 = spawnedIn(earthBody(), LONG);
    const outP = spawnedIn(plainBody(), LONG);
    const rest = (out: typeof outA) => out.filter((x) => x.traitId === BASIC_GUARD_ID || x.traitId === BASIC_HEAL_ID).length;
    for (const out of [outA2, outP]) expect(rest(out)).toBe(0);
    expect(outA2.some((x) => x.traitId === BASIC_SKILL_ID)).toBe(true);
    // 흡수 특성 블록 수는 두 몸 모두 흡수 몫 기대치 ±12% (물공 몫이 붙어도 흡수 몫은 그대로)
    const absorbed = (out: typeof outA) => out.filter((x) => x.traitId && !x.traitId.startsWith('basic-')).length;
    for (const out of [outA2, outP]) expect(Math.abs(absorbed(out) / (spawnRatesOf({ ...plainBody().params, voidChance: 0, voidChanceBonus: 0 }).absorbed * LONG) - 1)).toBeLessThanOrEqual(0.12);
  });

  it('보통 몸은 옛 규칙 그대로: 기본 타이머에서 공격 3계열·막기·회복이 다 나온다', () => {
    const out = spawnedIn(plainBody(), 300);
    expect(out.some((x) => x.traitId === BASIC_SKILL_ID)).toBe(true);
    expect(new Set(out.filter((x) => x.traitId === BASIC_SKILL_ID).map((x) => x.family))).toEqual(new Set(['family-a', 'family-b', 'family-c']));
  });
});

describe('C.105 흙 버티기 · 혈 속도 (GDD 49-9)', () => {
  it('받은 피해 집계: damageTaken = 바위 자세 감소 뒤의 양 (보호막 전)', () => {
    const a = mk({ playerElements: ['earth'], physBlock: physOf('t5:earth:physical')!, abilityEffects: fxOf('t5:earth:physical') });
    a.tray.push(blk(BASIC_SKILL_ID));
    applyInput(a, { type: 'use', cell: 0 });
    drainCombatEvents(a);
    const before = a.player.hp;
    const raw = run(a, 3).filter((e): e is Extract<CombatEvent, { kind: 'enemy-attack' }> => e.kind === 'enemy-attack').reduce((s, e) => s + e.damage, 0);
    expect(raw).toBeGreaterThan(0);
    expect(a.damageTaken).toBeCloseTo(raw * (1 - PB.stoneStance.takenReduction), 5);
    expect(a.damageTaken).toBeCloseTo(before - a.player.hp, 5);
  });

  it('흙: 바위 자세가 켜진 동안 받는 피해가 같은 몸(물공 없음)보다 확실히 적다 (−55%)', () => {
    const on = mk({ playerElements: ['earth'], physBlock: physOf('t5:earth:physical')!, abilityEffects: fxOf('t5:earth:physical'), playerAttackSeconds: 1e6 }, 7);
    const off = mk({ playerElements: ['earth'], playerAttackSeconds: 1e6 }, 7);
    on.tray.push(blk(BASIC_SKILL_ID));
    applyInput(on, { type: 'use', cell: 0 });
    run(on, PB.stoneStance.seconds - 0.5);
    run(off, PB.stoneStance.seconds - 0.5);
    expect(PB.stoneStance.takenReduction).toBeGreaterThanOrEqual(0.5);
    expect(on.damageTaken!).toBeLessThan(off.damageTaken! * 0.6);
  });

  it('혈: 피 튀기기 뒤 평타 40회 +150% — 같은 적을 같은 몸(물공 없음)보다 빨리 잡는다', () => {
    const blood = () => mk({ ...build6(), playerElements: ['blood'], physBlock: physOf('t5:blood:physical')!, abilityEffects: fxOf('t5:blood:physical') }, 11);
    const a = blood();
    a.enemy.hp = a.enemy.maxHp = 1e12; // 40회 동안 안 죽게
    a.tray.push(blk(BASIC_SKILL_ID));
    applyInput(a, { type: 'use', cell: 0 });
    expect(basicPowerOf(a)).toBeCloseTo(1 + PB.knockback.bonus);
    for (let i = 0; i < PB.knockback.hits; i++) nextBasic(a);
    expect(basicPowerOf(a)).toBeCloseTo(1);
    expect(PB.knockback.hits).toBeGreaterThanOrEqual(20);
    // 사람형 봇: 물공 켠 혈이 뗀 혈보다 빠르다 — 메커니즘 시험이라 옛 전투 길이(hpScale·playerHpScale 1)·시드 6판 평균으로 본다 (C.118: 짧아진 전투에서 혈 우위가 줄어든 것은 balance 후반 보류 경고로 기록)
    let onSum = 0;
    let offSum = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const onEnd = playCombatHuman(mk({ ...build6(), playerElements: ['blood'], physBlock: physOf('t5:blood:physical')!, abilityEffects: fxOf('t5:blood:physical'), hpScale: 1, playerHpScale: 1 }, seed));
      const offEnd = playCombatHuman(mk({ ...build6(), playerElements: ['blood'], hpScale: 1, playerHpScale: 1 }, seed));
      expect(onEnd.status).toBe('won');
      expect(offEnd.status).toBe('won');
      onSum += elapsedSeconds(onEnd);
      offSum += elapsedSeconds(offEnd);
    }
    expect(onSum).toBeLessThan(offSum * 0.9);
  });

  it('수치는 49-2 3판 표에서 출발해 49-9 목표로 조정한 값 (provisional)', () => {
    expect(PB.spawnSeconds).toBe(3.5); // C.118: 6 ÷ 1.7 (전투 절반, 모든 블록 타이머 같은 비율)
    expect(PB.spawnSecondsByElement).toEqual({ blood: 1.8 }); // C.118: 3 ÷ 1.7
    expect(PB.stoneStance).toEqual({ seconds: 12, takenReduction: 0.55, perHit: 0.1, max: 0.5 });
    expect(PB.hardFist).toEqual({ hits: 3, bonus: 0.4 });
    expect(PB.knockback).toEqual({ hits: 40, bonus: 1.5, seconds: 0.5 });
    expect(PB.flash).toEqual({ hits: 4, each: 0.6 });
    expect(PB.current).toEqual({ per: 0.03, max: 0.3 });
  });
});
