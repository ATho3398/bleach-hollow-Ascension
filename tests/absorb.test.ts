import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { getEnemy } from '../src/data/enemies';
import type { EnemyDef } from '../src/data/schema';
import { getFaction } from '../src/data/factions';
import { LINEAGES } from '../src/data/lineages';
import { TRAITS, getTrait, traitDescription } from '../src/data/traits';
import {
  absorbRisk, buildBattleParams, buildOffer, canAbsorb, changeRisk, completedLineages, equippedSkills, gainTrait, lateLapRisk, newBuild,
  passiveMultipliers, setSlot, settleRiskToNest, type BuildState,
} from '../src/engine/absorb';
import { BASIC_SKILL_ID, createBattle, useSkill, type BattleState } from '../src/engine/battle';
import { createRng } from '../src/engine/battle/rng';
import {
  advance, chooseAbsorb, chooseContinue, chooseRelease, chooseReturn, createExpedition, drainEvents, finishBattle, finishRest, placeTile,
  playExpedition, startBattle, summarize, type ExpeditionState,
} from '../src/engine/expedition';
import { doNestAction, newNest } from '../src/engine/nest';
import { loadSave, migrateSave, newSaveData, nextRunId, recordExpedition, SAVE_FORMAT_VERSION, writeSave } from '../src/game';

const AX = BALANCE.provisional.absorb;
const RX = BALANCE.provisional.risk;
const DECK = ['prey-nest-a', 'prey-nest-a', 'elite-den-a', 'env-fog', 'rest-a', 'prey-nest-b', 'env-ruin', 'elite-den-b'];
const mk = (over: Partial<Parameters<typeof createExpedition>[0]> = {}) =>
  createExpedition({ factionId: 'hollow', seed: 1, hunger: 10, condition: 100, deck: DECK, ...over });

const lin = (id: string) => TRAITS.filter((t) => t.lineageId === id).map((t) => t.id);
const A = lin('lineage-a');
const B = lin('lineage-b');

/** 다음 전투를 이긴 것으로 치고 끝낸다. absorb: 그 전투의 흡수 게이지, risk: 공허 리스크 값 */
function winWith(exp: ExpeditionState, opt: { absorb?: number; risk?: number } = {}): void {
  const b = startBattle(exp);
  b.enemy.hp = 0;
  b.status = 'won';
  b.absorbGained = opt.absorb ?? 0;
  b.riskGained = opt.risk ?? 0;
  finishBattle(exp, b);
}
function fightNext(exp: ExpeditionState): void {
  exp.wildCells = [exp.pos + 1];
  advance(exp);
}
/** 다음 전투를 이기고 흡수 화면까지 간다 */
function toAbsorb(exp: ExpeditionState, enemy?: Partial<EnemyDef>): void {
  fightNext(exp);
  if (enemy) Object.assign(exp.pending!.enemy, enemy);
  winWith(exp, { absorb: AX.threshold });
  expect(exp.phase).toBe('absorb');
}

describe('임시 데이터', () => {
  it('계통 3개, 계통마다 특성 3개 이상(skill/passive/part 골고루), 전부 provisional', () => {
    expect(LINEAGES).toHaveLength(3);
    expect(LINEAGES.map((l) => l.name['*'])).toEqual(['계통A', '계통B', '계통C']);
    for (const l of LINEAGES) {
      const ts = TRAITS.filter((t) => t.lineageId === l.id);
      expect(ts.length).toBeGreaterThanOrEqual(3);
      expect(new Set(ts.map((t) => t.kind))).toEqual(new Set(['skill', 'passive', 'part']));
      expect(ts.some((t) => t.rare)).toBe(true);
    }
    expect(TRAITS.every((t) => t.provisional === true)).toBe(true);
    expect(LINEAGES.every((l) => l.provisional === true)).toBe(true);
    expect(TRAITS.every((t) => /^임시 특성 [ABC]\d$/.test(t.name['*']!))).toBe(true);
  });

  it('기존 테스트 적 3종에 계통과 희귀 확률이 있다', () => {
    for (const id of ['test-a', 'test-b', 'test-elite']) {
      const e = getEnemy(id);
      expect(e.lineageId).toMatch(/^lineage-/);
      expect(e.rareChance).toBeGreaterThan(0);
    }
  });

  it('특성 설명은 종족별 텍스트로 분리되어 있다', () => {
    const skill = A.find((id) => getTrait(id).kind === 'skill')!;
    expect(traitDescription(skill, 'hollow')).not.toBe(traitDescription(skill, 'shinigami'));
  });
});

describe('흡수 가능 조건', () => {
  it('흡수 게이지가 임계값 이상일 때만 가능하다', () => {
    expect(canAbsorb(AX.threshold - 0.01)).toBe(false);
    expect(canAbsorb(AX.threshold)).toBe(true);
  });

  it('원정 전투 승리 후 임계값 미달이면 흡수 화면 없이 이동, 이상이면 흡수 화면', () => {
    const a = mk({ seed: 3 });
    fightNext(a);
    winWith(a, { absorb: AX.threshold - 1 });
    expect(a.phase).toBe('moving');
    expect(a.absorbOffer).toBeNull();
    const b = mk({ seed: 3 });
    fightNext(b);
    winWith(b, { absorb: AX.threshold });
    expect(b.phase).toBe('absorb');
    expect(b.absorbOffer).not.toBeNull();
    expect(advance(b)).toBeNull(); // 흡수를 고르기 전에는 이동하지 않는다
  });

  it('패배한 전투는 흡수할 수 없다', () => {
    const exp = mk({ seed: 4 });
    fightNext(exp);
    const b = startBattle(exp);
    b.status = 'lost';
    b.lossReason = 'hp';
    b.absorbGained = 99;
    finishBattle(exp, b);
    expect(exp.phase).toBe('ended');
    expect(exp.absorbOffer).toBeNull();
  });
});

describe('슬롯 장착·교체·가득 참', () => {
  it('빈 슬롯에 순서대로 장착하고, 같은 특성은 두 번 얻지 못한다', () => {
    const b = newBuild();
    expect(b.slots).toHaveLength(BALANCE.absorb.slotCount);
    expect(gainTrait(b, A[0]!).ok).toBe(true);
    expect(gainTrait(b, A[1]!).ok).toBe(true);
    expect(b.slots).toEqual([A[0], A[1], null]);
    expect(gainTrait(b, A[0]!).ok).toBe(false);
  });

  it('가득 차면 교체 슬롯 없이는 실패, 교체하면 옛 특성은 보유에 남는다', () => {
    const b = newBuild();
    for (const id of A.slice(0, 3)) gainTrait(b, id);
    expect(gainTrait(b, B[0]!).ok).toBe(false);
    expect(b.owned).not.toContain(B[0]);
    expect(gainTrait(b, B[0]!, 1).ok).toBe(true);
    expect(b.slots).toEqual([A[0], B[0], A[2]]);
    expect(b.owned).toContain(A[1]);
  });

  it('둥지 슬롯 정리: 보유 특성만 장착, 이미 장착한 것은 옮겨진다', () => {
    const b = newBuild();
    for (const id of A.slice(0, 3)) gainTrait(b, id);
    gainTrait(b, B[0]!, 0);
    expect(setSlot(b, 0, 'trait-zzz').ok).toBe(false);
    expect(setSlot(b, 0, A[0]!).ok).toBe(true);
    expect(setSlot(b, 2, A[0]!).ok).toBe(true);
    expect(b.slots).toEqual([null, A[1], A[0]]);
    expect(setSlot(b, 9, null).ok).toBe(false);
    expect(setSlot(b, 1, null).ok).toBe(true);
  });

  it('원정 흡수: 후보를 고르면 장착되고, 가득 차면 교체/포기 선택', () => {
    const exp = mk({ seed: 5 });
    exp.build.owned.push(...A.slice(0, 3));
    exp.build.slots = A.slice(0, 3);
    toAbsorb(exp, { lineageId: 'lineage-b', rare: false });
    const offer = exp.absorbOffer!;
    expect(offer.candidates.length).toBeGreaterThanOrEqual(1);
    expect(offer.candidates.every((id) => getTrait(id).lineageId === 'lineage-b')).toBe(true);
    const cand = offer.candidates[0]!;
    const fail = chooseAbsorb(exp, cand);
    expect(fail.ok).toBe(false);
    expect(exp.phase).toBe('absorb'); // 실패하면 아무것도 바뀌지 않는다
    expect(chooseAbsorb(exp, 'trait-a1').ok).toBe(false);
    expect(chooseAbsorb(exp, cand, 0).ok).toBe(true);
    expect(exp.build.slots[0]).toBe(cand);
    expect(exp.phase).toBe('moving');
  });

  it('가득 찼을 때 포기하면 특성 없이 흡수 효과만 얻는다', () => {
    const exp = mk({ seed: 6, hunger: 50 });
    exp.build.owned.push(...A.slice(0, 3));
    exp.build.slots = A.slice(0, 3);
    toAbsorb(exp, { lineageId: 'lineage-b', rare: false });
    expect(chooseAbsorb(exp, null).ok).toBe(true);
    expect(exp.build.slots).toEqual(A.slice(0, 3));
    expect(exp.acquiredTraits).toHaveLength(0);
    expect(exp.absorbRecords[0]).toMatchObject({ absorbed: true, traitId: null });
    expect(exp.hunger).toBe(AX.hungerAfterAbsorb);
  });
});

describe('계통 보너스와 특성 효과', () => {
  const build = (ids: string[]): BuildState => {
    const b = newBuild();
    for (const id of ids) gainTrait(b, id);
    return b;
  };

  it('슬롯 안 같은 계통 3개면 그 계통 기술 위력이 +50%', () => {
    const two = build(A.slice(0, 2));
    expect(completedLineages(two)).toEqual([]);
    const three = build(A.slice(0, 3));
    expect(completedLineages(three)).toEqual(['lineage-a']);
    const skillId = A.find((id) => getTrait(id).kind === 'skill')!;
    const base = getTrait(skillId).skillPowerInMatches!;
    expect(equippedSkills(two).find((s) => s.id === skillId)!.powerInMatches).toBe(base);
    expect(equippedSkills(three).find((s) => s.id === skillId)!.powerInMatches).toBeCloseTo(base * 1.5);
  });

  it('다른 계통이 섞이면 보너스가 없다', () => {
    const mix = build([A[0]!, A[1]!, B[0]!]);
    expect(completedLineages(mix)).toEqual([]);
  });

  it('passive 는 매칭 효과 배율, part 는 전투에 영향이 없다', () => {
    const passiveId = A.find((id) => getTrait(id).kind === 'passive')!;
    const partId = A.find((id) => getTrait(id).kind === 'part')!;
    const only = build([passiveId, partId]);
    expect(passiveMultipliers(only).damage).toBeCloseTo(getTrait(passiveId).passive!.multiplier);
    expect(passiveMultipliers(build([partId]))).toEqual({ damage: 1, spirit: 1, shield: 1 });
    expect(equippedSkills(only)).toEqual([]);
    const p = buildBattleParams(only);
    expect(p.damageEffectMultiplier).toBeGreaterThan(1);
  });
});

describe('skill 특성이 전투 기술에 반영된다', () => {
  const enemy = getEnemy('test-a');
  const cast = (params = {}): { s: BattleState; damage: number } => {
    const s = createBattle({ seed: 1, enemy, params });
    s.spiritMatches = s.params.spiritMatchesPerSkill;
    const r = useSkill(s);
    return { s, damage: r.phases[0]!.damageDealt };
  };

  it('장착한 skill 이 없으면 기본 기술', () => {
    const { s, damage } = cast();
    expect(s.skillsUsed).toEqual([BASIC_SKILL_ID]);
    expect(damage).toBe(s.params.skillPowerInMatches * s.params.playerMatchDamage);
  });

  it('장착한 skill 특성의 위력과 id 로 발동하고, 여럿이면 돌아가며 쓴다 (skillsUsed 는 실제 특성 id)', () => {
    const skills = A.filter((id) => getTrait(id).kind === 'skill');
    expect(skills.length).toBeGreaterThanOrEqual(2);
    const b = newBuild();
    for (const id of skills) gainTrait(b, id);
    const params = buildBattleParams(b);
    const { s, damage } = cast(params);
    expect(s.skillsUsed).toEqual([skills[0]]);
    expect(damage).toBe(getTrait(skills[0]!).skillPowerInMatches! * s.params.playerMatchDamage);
    s.spiritMatches = s.params.spiritMatchesPerSkill;
    useSkill(s);
    expect(s.skillsUsed).toEqual([skills[0], skills[1]]);
  });

  it('계통 보너스가 켜지면 기술 피해가 1.5배', () => {
    const skillId = A.find((id) => getTrait(id).kind === 'skill')!;
    const one = newBuild();
    gainTrait(one, skillId);
    const full = newBuild();
    for (const id of A.slice(0, 3)) gainTrait(full, id);
    const d1 = cast({ ...buildBattleParams(one), damageEffectMultiplier: 1 }).damage;
    const d3 = cast({ ...buildBattleParams(full), damageEffectMultiplier: 1 }).damage;
    expect(d3).toBeCloseTo(d1 * 1.5);
  });

  it('원정 전투는 장착한 특성을 전투 파라미터로 받는다', () => {
    const exp = mk({ seed: 7 });
    const skillId = A.find((id) => getTrait(id).kind === 'skill')!;
    gainTrait(exp.build, skillId);
    fightNext(exp);
    expect(startBattle(exp).params.skills.map((s) => s.id)).toEqual([skillId]);
  });
});

describe('희귀 개체', () => {
  it('희귀 개체는 계통의 희귀 특성이 확정 후보로 나온다 (여러 시드)', () => {
    for (const lineageId of ['lineage-a', 'lineage-b', 'lineage-c']) {
      for (let seed = 1; seed <= 30; seed++) {
        const offer = buildOffer(createRng(seed), { ...getEnemy('test-a'), lineageId, rare: true }, newBuild(), 5);
        expect(offer.rare).toBe(true);
        expect(getTrait(offer.candidates[0]!).rare).toBe(true);
        expect(getTrait(offer.candidates[0]!).lineageId).toBe(lineageId);
      }
    }
  });

  it('일반 개체는 희귀 특성이 나오지 않고, 이미 가진 특성은 후보에서 빠진다', () => {
    const build = newBuild();
    gainTrait(build, A[0]!);
    for (let seed = 1; seed <= 30; seed++) {
      const offer = buildOffer(createRng(seed), { ...getEnemy('test-a'), lineageId: 'lineage-a', rare: false }, build, 5);
      expect(offer.rare).toBe(false);
      expect(offer.candidates.length).toBeGreaterThanOrEqual(1);
      expect(offer.candidates.length).toBeLessThanOrEqual(2);
      expect(offer.candidates.every((id) => !getTrait(id).rare && id !== A[0])).toBe(true);
    }
    expect(buildOffer(createRng(1), { ...getEnemy('test-elite'), rare: false }, newBuild(), 5).candidates).toHaveLength(AX.candidatesElite);
  });

  it('조우한 적의 희귀 여부는 시드로 정해지고 흡수 제안에 그대로 실린다', () => {
    const rares = new Set<boolean>();
    for (let seed = 1; seed <= 80; seed++) {
      const exp = mk({ seed });
      fightNext(exp);
      const rare = exp.pending!.enemy.rare === true;
      rares.add(rare);
      winWith(exp, { absorb: AX.threshold });
      expect(exp.absorbOffer!.rare).toBe(rare);
    }
    expect(rares).toEqual(new Set([true, false]));
  });
});

describe('흡수의 효과', () => {
  it('흡수하면 허기 리셋 + 리스크 상승(강할수록 많이) + 타일 +1(상한 안) + 런 로그', () => {
    const weak = mk({ seed: 8, hunger: 60, risk: 0 });
    toAbsorb(weak);
    const strength = weak.absorbOffer!.strength;
    const tilesBefore = weak.acquired.length;
    const riskBefore = weak.risk;
    expect(chooseAbsorb(weak, weak.absorbOffer!.candidates[0] ?? null).ok).toBe(true);
    expect(weak.hunger).toBe(AX.hungerAfterAbsorb);
    expect(weak.risk - riskBefore).toBeCloseTo(absorbRisk(strength));
    expect(weak.acquired.length).toBeGreaterThanOrEqual(tilesBefore);
    expect(weak.tilesThisLap).toBeLessThanOrEqual(BALANCE.expedition.tilesPerLap.max);
    expect(weak.absorbRecords).toHaveLength(1);
    expect(weak.absorbRecords[0]).toMatchObject({ absorbed: true, enemyId: weak.absorbRecords[0]!.enemyId, runId: 0, lap: 1 });
    expect(absorbRisk(11)).toBeGreaterThan(absorbRisk(6) * 1.5);
  });

  it('흡수 보상 타일은 바퀴 완주 보상 1장을 밀어내지 않는다 (바퀴 합계 상한 3장)', () => {
    const exp = mk({ seed: 9, deck: ['prey-nest-a'] });
    // 한 바퀴 안에 여러 번 이기고 흡수해도 완주 보상 자리가 남는다
    for (let i = 0; i < 3; i++) {
      fightNext(exp);
      winWith(exp, { absorb: AX.threshold });
      chooseAbsorb(exp, null);
    }
    expect(exp.tilesThisLap).toBeLessThanOrEqual(BALANCE.expedition.tilesPerLap.max - 1);
    while (exp.phase === 'moving') advance(exp);
    if (exp.phase === 'battle') return; // 남은 야생 전투는 이 시험의 범위가 아님
    expect(exp.tilesThisLap).toBeLessThanOrEqual(BALANCE.expedition.tilesPerLap.max);
  });

  it('놓아주면 리스크 하락 + 안정 수치 상승, 특성·허기는 그대로', () => {
    const exp = mk({ seed: 10, hunger: 40, risk: 30, stability: 20 });
    toAbsorb(exp);
    const hunger = exp.hunger;
    expect(chooseRelease(exp).ok).toBe(true);
    expect(exp.risk).toBeCloseTo(30 - RX.releaseRelief);
    expect(exp.stability).toBe(20 + RX.releaseStability);
    expect(exp.hunger).toBe(hunger);
    expect(exp.build.owned).toEqual([]);
    expect(exp.absorbRecords[0]).toMatchObject({ absorbed: false, traitId: null });
    expect(exp.phase).toBe('moving');
  });
});

describe('리스크 게이지', () => {
  it('공허 매칭이 게이지를 올린다 (전투의 riskGained × 환산 계수)', () => {
    const exp = mk({ seed: 11 });
    fightNext(exp);
    winWith(exp, { risk: 20 });
    expect(exp.risk).toBeCloseTo(20 * RX.voidMatchFactor);
  });

  it('5바퀴째부터 칸을 지날 때마다 오르고, 4바퀴까지는 오르지 않는다', () => {
    const at = (lap: number) => {
      const e = mk({ seed: 12, hunger: 0 });
      e.lap = lap;
      advance(e);
      return e.risk;
    };
    expect(at(4)).toBe(0);
    expect(at(5)).toBeCloseTo(lateLapRisk(5, BALANCE.provisional.expedition.lateLapStart));
    expect(at(5)).toBeGreaterThan(0);
    expect(at(6)).toBeGreaterThan(at(5));
  });

  it('휴식 타일에서 내려간다', () => {
    const exp = mk({ seed: 13, risk: 50 });
    exp.hand = ['rest-a'];
    placeTile(exp, 'rest-a', 1);
    advance(exp);
    finishRest(exp);
    expect(exp.risk).toBeCloseTo(50 - RX.restRelief);
  });

  it('둥지 행동으로 내려가고 안정 수치가 오른다', () => {
    const n = newNest(0);
    n.risk = 50;
    const stab = n.stability;
    doNestAction(n, 'pet');
    expect(n.risk).toBe(50 + RX.nestActions.pet.risk);
    expect(n.stability).toBe(stab + RX.nestActions.pet.stability);
    n.risk = 3;
    doNestAction(n, 'sleep');
    expect(n.risk).toBe(0);
  });

  it('원정은 둥지의 저장값으로 시작하고, 귀환하면 둥지 값으로 합쳐진다', () => {
    const save = newSaveData('hollow', 0);
    save.nest.risk = 25;
    save.nest.stability = 40;
    const exp = mk({ seed: 14, runId: nextRunId(save), risk: save.nest.risk, stability: save.nest.stability });
    expect(exp.risk).toBe(25);
    fightNext(exp);
    winWith(exp, { risk: 40 });
    toAbsorb(exp);
    chooseRelease(exp);
    const expected = exp.risk;
    const stab = exp.stability;
    while (exp.phase !== 'nest-choice' && exp.phase !== 'ended') {
      if (exp.phase === 'moving') advance(exp);
      else if (exp.phase === 'battle') winWith(exp);
      else if (exp.phase === 'rest') finishRest(exp);
    }
    chooseReturn(exp);
    recordExpedition(save, exp, 10);
    expect(save.nest.risk).toBeCloseTo(exp.risk);
    expect(save.nest.stability).toBe(exp.stability);
    expect(save.nest.stability).toBeGreaterThanOrEqual(stab);
    expect(expected).toBeGreaterThan(0);
  });
});

describe('한계 돌파', () => {
  it('한계값 이상이 되면 breakthrough 이벤트가 한 번만 나오고 값은 한계에서 멈춘다', () => {
    const exp = mk({ seed: 20, risk: RX.limit - 5 });
    changeRisk(exp, 10, 'void-match');
    expect(exp.risk).toBe(RX.limit);
    expect(exp.breakthrough).not.toBeNull();
    changeRisk(exp, 10, 'void-match');
    const ev = drainEvents(exp);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ kind: 'breakthrough', lap: 1 });
    expect(drainEvents(exp)).toEqual([]);
  });

  it('전투·흡수로 넘어도 이벤트가 나오고 런 로그 RiskRecord 에 기록된다', () => {
    const save = newSaveData('hollow', 0);
    const exp = mk({ seed: 21, runId: nextRunId(save), risk: RX.limit - 1 });
    fightNext(exp);
    winWith(exp, { risk: 100 });
    expect(drainEvents(exp).map((e) => e.kind)).toEqual(['breakthrough']);
    while (exp.phase !== 'nest-choice' && exp.phase !== 'ended') {
      if (exp.phase === 'moving') advance(exp);
      else if (exp.phase === 'battle') winWith(exp);
      else if (exp.phase === 'rest') finishRest(exp);
    }
    chooseReturn(exp);
    recordExpedition(save, exp, 5);
    expect(save.runLog.risk).toEqual({ peak: RX.limit, breakthroughs: 1, survivedBreakthroughs: 1 });
    expect(save.runLog.runs[0]).toMatchObject({ breakthrough: true, riskPeak: RX.limit });
  });

  it('임시 페널티: 돌파 뒤 남은 원정 동안 공허 생성률 가산', () => {
    const bonus = (risk: number) => {
      const e = mk({ seed: 22, risk, condition: 100 });
      e.wildCells = [1];
      changeRisk(e, 0, 'void-match');
      advance(e);
      return startBattle(e).params.riskSpawnBonus;
    };
    const normal = bonus(10);
    const broken = bonus(RX.limit);
    expect(broken - normal).toBeCloseTo(RX.breakthroughSpawnBonus);
    expect(RX.breakthroughSpawnBonus).toBeGreaterThanOrEqual(0.15);
  });

  it('임시 페널티: 둥지 복귀 시 안정 수치 하락, 게이지는 가라앉는다', () => {
    const n = { risk: 0, stability: 0 };
    const s = mk({ seed: 23, risk: 10, stability: 70 });
    changeRisk(s, 200, 'absorb');
    settleRiskToNest(n, s);
    expect(n.stability).toBe(70 - RX.breakthroughStabilityLoss);
    expect(n.risk).toBe(RX.riskAfterBreakthrough);
    const calm = mk({ seed: 23, risk: 10, stability: 70 });
    settleRiskToNest(n, calm);
    expect(n.stability).toBe(70);
    expect(n.risk).toBe(10);
  });

  it('돌파하고 패배하면 생존 횟수는 오르지 않는다', () => {
    const save = newSaveData('hollow', 0);
    const exp = mk({ seed: 24, runId: nextRunId(save), risk: RX.limit - 1 });
    fightNext(exp);
    const b = startBattle(exp);
    b.status = 'lost';
    b.lossReason = 'hp';
    b.riskGained = 100;
    finishBattle(exp, b);
    recordExpedition(save, exp, 5);
    expect(save.runLog.risk).toMatchObject({ breakthroughs: 1, survivedBreakthroughs: 0 });
  });
});

describe('패배: 마지막 바퀴에서 얻은 것만 잃는다', () => {
  /** 1바퀴에서 A1, 2바퀴에서 A2 를 흡수하고 2바퀴에서 진다 */
  function twoLapRun(endWith: 'return' | 'lose') {
    const save = newSaveData('hollow', 0);
    const exp = mk({ seed: 30, runId: nextRunId(save), hunger: 0 });
    toAbsorb(exp, { lineageId: 'lineage-a', rare: false });
    chooseAbsorb(exp, exp.absorbOffer!.candidates[0]!);
    const first = exp.build.owned[0]!;
    while (exp.phase !== 'nest-choice') {
      if (exp.phase === 'moving') advance(exp);
      else if (exp.phase === 'battle') winWith(exp);
      else if (exp.phase === 'rest') finishRest(exp);
    }
    chooseContinue(exp);
    toAbsorb(exp, { lineageId: 'lineage-a', rare: false });
    chooseAbsorb(exp, exp.absorbOffer!.candidates[0]!);
    const second = exp.build.owned.find((id) => id !== first)!;
    expect(exp.build.slots.filter(Boolean)).toHaveLength(2);
    if (endWith === 'lose') {
      fightNext(exp);
      const b = startBattle(exp);
      b.status = 'lost';
      b.lossReason = 'hp';
      finishBattle(exp, b);
    } else {
      while (exp.phase !== 'nest-choice') {
        if (exp.phase === 'moving') advance(exp);
        else if (exp.phase === 'battle') winWith(exp);
        else if (exp.phase === 'rest') finishRest(exp);
      }
      chooseReturn(exp);
    }
    recordExpedition(save, exp, 100);
    return { save, exp, first, second };
  }

  it('패배하면 이번 바퀴에서 얻은 특성은 사라지고 이전 바퀴 것은 남는다', () => {
    const { save, exp, first, second } = twoLapRun('lose');
    expect(exp.outcome).toBe('defeated');
    expect(save.build.owned).toEqual([first]);
    expect(save.build.slots).toEqual([first, null, null]);
    expect(summarize(exp).lostTraits).toEqual([second]);
    expect(summarize(exp).keptTraits).toEqual([first]);
    expect(save.runLog.runs[0]).toMatchObject({ gainedTraits: [first], lostTraits: [second] });
    // 흡수 이력(런 로그)은 사건 기록이라 둘 다 남는다
    expect(save.runLog.absorbs).toHaveLength(2);
  });

  it('귀환하면 얻은 특성이 모두 보존되어 세이브 빌드가 된다', () => {
    const { save, first, second } = twoLapRun('return');
    expect(save.build.owned).toEqual([first, second]);
    expect(save.build.slots.filter(Boolean)).toEqual([first, second]);
    expect(save.runLog.runs[0]!.lostTraits).toEqual([]);
  });

  it('패배로 잃은 계통 진행도는 계통 완성 기록에 남지 않는다', () => {
    const save = newSaveData('hollow', 0);
    save.build = newBuild();
    for (const id of A.slice(0, 2)) gainTrait(save.build, id);
    const exp = mk({ seed: 31, runId: nextRunId(save), build: save.build });
    toAbsorb(exp, { lineageId: 'lineage-a', rare: false });
    const third = exp.absorbOffer!.candidates[0]!;
    chooseAbsorb(exp, third);
    expect(completedLineages(exp.build)).toEqual(['lineage-a']);
    fightNext(exp);
    const b = startBattle(exp);
    b.status = 'lost';
    b.lossReason = 'hp';
    finishBattle(exp, b);
    recordExpedition(save, exp, 100);
    expect(completedLineages(save.build)).toEqual([]);
    expect(save.runLog.lineages).toEqual([]);
  });

  it('계통을 완성한 채 귀환하면 LineageRecord 가 남는다', () => {
    const save = newSaveData('hollow', 0);
    for (const id of A.slice(0, 2)) gainTrait(save.build, id);
    const exp = mk({ seed: 32, runId: nextRunId(save), build: save.build });
    toAbsorb(exp, { lineageId: 'lineage-a', rare: false });
    chooseAbsorb(exp, exp.absorbOffer!.candidates[0]!);
    while (exp.phase !== 'nest-choice') {
      if (exp.phase === 'moving') advance(exp);
      else if (exp.phase === 'battle') winWith(exp);
      else if (exp.phase === 'rest') finishRest(exp);
    }
    chooseReturn(exp);
    recordExpedition(save, exp, 5);
    expect(save.runLog.lineages).toEqual([{ lineageId: 'lineage-a', completed: true, conflictingTried: false, firstCompletedRunId: exp.runId }]);
  });
});

describe('시드 결정성', () => {
  it('같은 시드 = 같은 흡수 원정 (자동 플레이 결과가 완전히 같다)', () => {
    const a = playExpedition(mk({ seed: 55 }), { returnAfterLap: 3, absorb: 'absorb' });
    const b = playExpedition(mk({ seed: 55 }), { returnAfterLap: 3, absorb: 'absorb' });
    expect(b).toEqual(a);
    expect(a.absorbRecords.length).toBeGreaterThan(0);
    const c = playExpedition(mk({ seed: 56 }), { returnAfterLap: 3, absorb: 'absorb' });
    expect(c.absorbRecords).not.toEqual(a.absorbRecords);
  });

  it('흡수 제안(후보)은 시드로 결정된다', () => {
    const enemy = { ...getEnemy('test-b'), rare: false };
    const a = buildOffer(createRng(9), enemy, newBuild(), 5);
    expect(buildOffer(createRng(9), enemy, newBuild(), 5)).toEqual(a);
  });

  it('전투 기록의 skillsUsed 는 장착한 특성 id', () => {
    const save = newSaveData('hollow', 0);
    const skillId = A.find((id) => getTrait(id).kind === 'skill')!;
    gainTrait(save.build, skillId);
    const e = playExpedition(mk({ seed: 57, build: save.build }), { returnAfterLap: 2 });
    const used = e.battles.flatMap((b) => b.skillsUsed);
    expect(used.length).toBeGreaterThan(0);
    expect(used.every((id) => id === skillId)).toBe(true);
  });
});

describe('저장 구조', () => {
  it('새 세이브에는 빌드·리스크·안정 수치가 있고 형식 4 이다', () => {
    const s = newSaveData('hollow', 0);
    expect(SAVE_FORMAT_VERSION).toBe(4);
    expect(s.build).toEqual(newBuild());
    expect(s.nest.risk).toBe(0);
    expect(s.nest.stability).toBe(RX.stabilityStart);
  });

  it('형식 3 세이브가 열리고 새 필드가 채워진다', () => {
    const old = newSaveData('shinigami', 0) as unknown as Record<string, any>;
    delete old.build;
    delete old.nest.risk;
    delete old.nest.stability;
    old.meta.format = 3;
    old.runLog.absorbs = [{ runId: 1, enemyId: 'test-a', lineageId: 'lineage-a', rare: false, absorbed: true }];
    old.runLog.runs = [{ runId: 1, laps: 2, outcome: 'returned', gained: ['x'], lost: [], endReason: 'returned', seed: 1, factionId: 'shinigami' }];
    const store: Record<string, string> = {};
    const storage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => void (store[k] = v) };
    writeSave(storage, old as never);
    const s = loadSave(storage)!;
    expect(s.meta.format).toBe(4);
    expect(s.build).toEqual(newBuild());
    expect(s.nest.risk).toBe(0);
    expect(s.nest.stability).toBe(RX.stabilityStart);
    expect(s.runLog.absorbs[0]).toMatchObject({ traitId: null, lap: 0 });
    expect(s.runLog.runs[0]).toMatchObject({ gainedTraits: [], lostTraits: [], riskPeak: 0, breakthrough: false });
    expect(migrateSave({ ...old, meta: { format: 99 } })).toBeNull();
  });
});

describe('종족 설정만 바꿔도 표기가 바뀐다', () => {
  it('안정 수치·슬롯·계통 보너스·특성 종류 이름은 종족 설정에서 나온다', () => {
    const h = getFaction('hollow');
    const s = getFaction('shinigami');
    expect([h.stabilityName, s.stabilityName]).toEqual(['자아', '영압 안정도']);
    expect([h.lineageBonusName, s.lineageBonusName]).toEqual(['계열 기술 강화', '참백도 속성 확정']);
    expect([h.slotLocation, s.slotLocation]).toEqual(['body', 'zanpakuto']);
    expect(h.appearanceChange).toBe(true);
    expect(s.appearanceChange).toBe(false);
    expect([h.riskGaugeName, s.riskGaugeName]).toEqual(['광기', '호로화']);
    expect(h.traitKindNames.part).not.toBe(s.traitKindNames.part);
  });
});
