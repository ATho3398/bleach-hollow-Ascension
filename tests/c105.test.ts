// C.105 물공 블록 보장 생성원 + 49-9 목표(흙 버티기·혈 속도) (GDD 49-11): 물공 블록은 기본 블록 몫(44-3)에서 빠져 자기 타이머(provisional.physBlocks.spawnSeconds) 하나로 나온다.
// 기본 타이머는 막기·회복만 내되 그 속도는 그대로. 수치는 BALANCE.provisional.physBlocks (provisional)
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { getEnemy } from '../src/data/enemies';
import { getForm } from '../src/data/evolution';
import { buildCombatParams, gainTrait, newBuild } from '../src/engine/absorb';
import {
  BASIC_GUARD_ID, BASIC_HEAL_ID, BASIC_SKILL_ID, applyInput, basicPowerOf, basicSpawnSecondsOf, basicTimerPoolOf, blockPoolOf, createCombat, drainCombatEvents, elapsedSeconds,
  physSpawnSecondsOf, playCombatHuman, spawnRatesOf, step, ticksOf, type Block, type CombatEvent, type CombatParams, type CombatState, type PhysBlock,
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
  for (const id of ['t-normal-a', 't-water-a', 't-earth-a', 't-normal-guard', 't-water-guard', 't-normal-heal']) gainTrait(b, id);
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
  s.voidTimer = 1e9;
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

  it('물공 몸은 타이머가 하나 더: [흡수 6칸…, 기본, 물공], 간격 = physBlocks.spawnSeconds ÷ 블록 가속', () => {
    const a = earthBody();
    const b = plainBody();
    expect(a.spawnTimers).toHaveLength(a.params.skills.length + 2);
    expect(b.spawnTimers).toHaveLength(b.params.skills.length + 1);
    expect(physSpawnSecondsOf(a.params)).toBe(PB.spawnSeconds);
    expect(physSpawnSecondsOf(b.params)).toBeNull();
    expect(physSpawnSecondsOf({ ...a.params, blockSpawnMultiplier: 2 })).toBeCloseTo(PB.spawnSeconds / 2);
    expect(spawnRatesOf(a.params).phys).toBeCloseTo(1 / PB.spawnSeconds);
    expect(spawnRatesOf(b.params).phys).toBe(0);
  });

  it('기본 타이머 풀: 물공 몸은 막기·회복만(합 1), 보통 몸은 blockPoolOf 그대로 (충전용 전체 풀에는 공격이 남는다)', () => {
    const a = earthBody();
    const pool = basicTimerPoolOf(a.params);
    expect(pool.map((e) => e.source.id).sort()).toEqual([BASIC_GUARD_ID, BASIC_HEAL_ID]);
    expect(pool.reduce((s, e) => s + e.chance, 0)).toBeCloseTo(1);
    expect(blockPoolOf(a.params).filter((e) => e.source.id === BASIC_SKILL_ID)).toHaveLength(3);
    const b = plainBody();
    expect(basicTimerPoolOf(b.params)).toEqual(blockPoolOf(b.params));
  });

  it('기본 타이머 간격: 물공 몸은 (1 ÷ 막기·회복 가중 몫)만큼 늘어 막기·회복 속도는 그대로, 흡수 타이머(44-3)는 그대로', () => {
    const a = earthBody();
    const b = plainBody();
    const W = BALANCE.provisional.blockPool.basicWeights;
    const restShare = (W.guard + W.heal) / (W.attack * 3 + W.guard + W.heal);
    expect(basicSpawnSecondsOf(a.params)).toBeCloseTo(basicSpawnSecondsOf(b.params) / restShare);
    expect(spawnRatesOf(a.params).absorbed).toBeCloseTo(spawnRatesOf(b.params).absorbed);
    expect(a.spawnTimers.slice(0, a.params.skills.length).length).toBe(b.spawnTimers.slice(0, b.params.skills.length).length);
  });

  it('판마다 일정 개수: 60초에 물공 블록 ≈ 60 ÷ spawnSeconds 개 (±1), 기본 타이머에서는 공격이 안 나오고 막기·회복 수는 보통 몸과 비슷', () => {
    const SEC = 600;
    const a = earthBody();
    const outA = spawnedIn(a, SEC);
    const physA = outA.filter((x) => x.traitId === BASIC_SKILL_ID);
    const expected = SEC / PB.spawnSeconds;
    expect(physA.length).toBeGreaterThanOrEqual(expected - 2);
    expect(physA.length).toBeLessThanOrEqual(expected + 1);
    expect(a.physSpawned).toBe(physA.length);
    // 계열은 종족 계열 표 3종에서 고르게
    expect(new Set(physA.map((x) => x.family))).toEqual(new Set(['family-a', 'family-b', 'family-c']));
    // 60초 창마다 개수가 거의 같다
    const b = earthBody();
    const per60 = [1, 2, 3].map(() => spawnedIn(b, 60).filter((x) => x.traitId === BASIC_SKILL_ID).length);
    for (const n of per60) expect(Math.abs(n - 60 / PB.spawnSeconds)).toBeLessThanOrEqual(1);
    // 막기·회복: 보통 몸의 기본 타이머가 내는 막기·회복 기대치(가중 14/44)와 ±10% (긴 창으로 추첨 흔들림을 누른다)
    const LONG = 6000;
    const outA2 = spawnedIn(earthBody(), LONG);
    const outP = spawnedIn(plainBody(), LONG);
    const rest = (out: typeof outA) => out.filter((x) => x.traitId === BASIC_GUARD_ID || x.traitId === BASIC_HEAL_ID).length;
    const W = BALANCE.provisional.blockPool.basicWeights;
    const restExpected = (LONG / basicSpawnSecondsOf(plainBody().params)) * ((W.guard + W.heal) / (W.attack * 3 + W.guard + W.heal));
    expect(rest(outA2)).toBeGreaterThan(restExpected * 0.9);
    expect(rest(outA2)).toBeLessThan(restExpected * 1.1);
    expect(rest(outP)).toBeGreaterThan(restExpected * 0.9);
    expect(rest(outP)).toBeLessThan(restExpected * 1.1);
    expect(outA2.some((x) => x.traitId === BASIC_SKILL_ID)).toBe(true);
    // 흡수 특성 블록 수는 같다 (타이머 그대로)
    const absorbed = (out: typeof outA) => out.filter((x) => x.traitId && !x.traitId.startsWith('basic-')).length;
    expect(absorbed(outA2)).toBe(absorbed(outP));
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
    // 사람형 봇 1판: 물공 켠 혈이 뗀 혈보다 빠르다
    const onEnd = playCombatHuman(blood());
    const offEnd = playCombatHuman(mk({ ...build6(), playerElements: ['blood'] }, 11));
    expect(onEnd.status).toBe('won');
    expect(offEnd.status).toBe('won');
    expect(elapsedSeconds(onEnd)).toBeLessThan(elapsedSeconds(offEnd) * 0.9);
  });

  it('수치는 49-2 3판 표에서 출발해 49-9 목표로 조정한 값 (provisional)', () => {
    expect(PB.spawnSeconds).toBe(6);
    expect(PB.spawnSecondsByElement).toEqual({ blood: 3 });
    expect(PB.stoneStance).toEqual({ seconds: 12, takenReduction: 0.55, perHit: 0.1, max: 0.5 });
    expect(PB.hardFist).toEqual({ hits: 3, bonus: 0.4 });
    expect(PB.knockback).toEqual({ hits: 40, bonus: 1.5, seconds: 0.5 });
    expect(PB.flash).toEqual({ hits: 4, each: 0.6 });
    expect(PB.current).toEqual({ per: 0.03, max: 0.3 });
  });
});
