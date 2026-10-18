import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { getEnemy } from '../src/data/enemies';
import type { EnemyDef } from '../src/data/schema';
import { getFaction } from '../src/data/factions';
import { LINEAGES } from '../src/data/lineages';
import { TRAITS, getTrait, traitDescription } from '../src/data/traits';
import {
  absorbReasons, absorbRisk, buildCombatParams, buildOffer, canAbsorb, changeRisk, completedLineages, equippedSkills, gainTrait, lateLapRisk, newBuild,
  passiveMultipliers, setSlot, settleRiskToNest, type BuildState,
} from '../src/engine/absorb';
import { BASIC_SKILL_ID, applyInput, blockSources, createCombat, type Block, type CombatState } from '../src/engine/combat';
import { createRng } from '../src/engine/rng';
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

/** 다음 전투를 이긴 것으로 치고 끝낸다. absorbable: 흡수 조건을 채움(체인3 횟수), risk: 공허 블록 리스크 값 */
function winWith(exp: ExpeditionState, opt: { absorbable?: boolean; risk?: number; firstAbsorb?: boolean } = {}): void {
  const b = startBattle(exp);
  b.enemy.hp = 0;
  b.status = 'won';
  b.finisher = { kind: 'basic-attack', traitId: null, lineageId: null };
  b.weakChain3Count = opt.absorbable ? AX.weakChain3ForAbsorb : 0;
  // 첫 흡수 보장(장착 skill 없음)을 피하려고 기본은 skill 이 장착된 전투로 친다
  if (!opt.firstAbsorb) b.params = { ...b.params, skills: [{ id: 'trait-a1', lineageId: 'lineage-a', role: 'attack', powerInAttacks: 1, chainBonus: { kind: 'stagger', value: 1 }, powerMultiplier: 1 }] };
  b.riskGained = opt.risk ?? 0;
  finishBattle(exp, b);
}
/** 흡수 조건 판정용 전투 결과 */
const result = (o: { won?: boolean; chain3?: number; weakChain3?: number; skills?: number; finisher?: CombatState['finisher']; weak?: string }) => ({
  status: (o.won ?? true) ? ('won' as const) : ('lost' as const),
  chain3Count: o.chain3 ?? 0,
  weakChain3Count: o.weakChain3 ?? 0,
  params: { skills: Array.from({ length: o.skills ?? 1 }) as unknown[] },
  finisher: o.finisher ?? null,
  enemy: { def: { weaknessLineageId: o.weak ?? 'lineage-b' } },
});
const NO = result({});
function fightNext(exp: ExpeditionState): void {
  exp.wildCells = [exp.pos + 1];
  advance(exp);
}
/** 다음 전투를 이기고 흡수 화면까지 간다 */
function toAbsorb(exp: ExpeditionState, enemy?: Partial<EnemyDef>): void {
  fightNext(exp);
  if (enemy) Object.assign(exp.pending!.enemy, enemy);
  winWith(exp, { absorbable: true });
  expect(exp.phase).toBe('absorb');
}

describe('임시 데이터', () => {
  it('계통 5개(C.9에서 D·E 추가), 계통마다 특성 3개 이상(skill/passive/part 골고루), 전부 provisional', () => {
    expect(LINEAGES).toHaveLength(5);
    expect(LINEAGES.map((l) => l.name['*'])).toEqual(['계통A', '계통B', '계통C', '계통D', '계통E']);
    for (const l of LINEAGES) {
      const ts = TRAITS.filter((t) => t.lineageId === l.id);
      expect(ts.length).toBeGreaterThanOrEqual(3);
      expect(new Set(ts.map((t) => t.kind))).toEqual(new Set(['skill', 'passive', 'part']));
      expect(ts.some((t) => t.rare)).toBe(true);
    }
    expect(TRAITS.every((t) => t.provisional === true)).toBe(true);
    expect(LINEAGES.every((l) => l.provisional === true)).toBe(true);
    expect(TRAITS.every((t) => /^임시 특성 [A-E]\d$/.test(t.name['*']!))).toBe(true);
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
  it('마무리 일격이 약점 계통 스킬이거나, 체인3 을 2회(임시) 이상 발동했을 때만 가능하다 (GDD 3-5)', () => {
    const weakSkill = { kind: 'skill' as const, traitId: 'trait-b1', lineageId: 'lineage-b' };
    expect(canAbsorb(NO)).toBe(false);
    expect(absorbReasons(result({ finisher: weakSkill }))).toEqual(['weakness-finisher']);
    // 약점이 아닌 계통 스킬, 기본 블록(계통 없음), 기본 공격·필살·공허로 마무리하면 조건이 아니다
    expect(canAbsorb(result({ finisher: { kind: 'skill', traitId: 'trait-a1', lineageId: 'lineage-a' } }))).toBe(false);
    expect(canAbsorb(result({ finisher: { kind: 'skill', traitId: BASIC_SKILL_ID, lineageId: null } }))).toBe(false);
    for (const kind of ['basic-attack', 'special', 'void', 'reflect'] as const) {
      expect(canAbsorb(result({ finisher: { kind, traitId: null, lineageId: null } }))).toBe(false);
    }
    // 약점 계통이 아닌 체인3 은 몇 번이든 불충분 (C.7: 옛 "체인3 2회 이상, 계통 무관" 폐기)
    expect(canAbsorb(result({ chain3: 9 }))).toBe(false);
    // 약점 계통 스킬 블록의 체인3 1회 이상
    expect(canAbsorb(result({ weakChain3: AX.weakChain3ForAbsorb - 1 }))).toBe(false);
    expect(absorbReasons(result({ weakChain3: AX.weakChain3ForAbsorb }))).toEqual(['weakness-chain3']);
    expect(absorbReasons(result({ weakChain3: 5, finisher: weakSkill }))).toEqual(['weakness-finisher', 'weakness-chain3']);
    expect(canAbsorb(result({ won: false, weakChain3: 5, finisher: weakSkill }))).toBe(false);
  });

  it('첫 흡수 보장: 장착한 skill 특성이 하나도 없으면 조건 없이 가능, 하나라도 있으면 보장 없음 (GDD 3-5 v0.7)', () => {
    expect(absorbReasons(result({ skills: 0 }))).toEqual(['first-absorb']);
    expect(canAbsorb(result({ skills: 0, chain3: 0 }))).toBe(true);
    expect(canAbsorb(result({ skills: 1 }))).toBe(false);
    expect(absorbReasons(result({ skills: 0, finisher: { kind: 'skill', traitId: 'trait-b1', lineageId: 'lineage-b' } }))).toEqual(['weakness-finisher', 'first-absorb']);
    // 졌으면 보장도 없다
    expect(canAbsorb(result({ won: false, skills: 0 }))).toBe(false);
  });

  it('실제 전투: 약점 계통 스킬 블록 체인3 을 쓰면 weakChain3Count 가 오르고, 다른 계통·기본 블록 체인3 은 오르지 않는다', () => {
    const b = newBuild();
    gainTrait(b, 'trait-b1'); // test-a 의 약점 계통 B
    gainTrait(b, 'trait-a1');
    const s = createCombat(1, { enemy: getEnemy('test-a'), params: buildCombatParams(b) });
    s.enemy.hp = s.enemy.maxHp * 100;
    const three = (traitId: string, uid: number): Block[] => [0, 1, 2].map((k) => ({ uid: uid + k, kind: 'skill', traitId }));
    s.tray = [...three('trait-a1', 90), ...three('trait-b1', 91)];
    applyInput(s, { type: 'use', cell: 0 });
    expect([s.chain3Count, s.weakChain3Count]).toEqual([1, 0]);
    applyInput(s, { type: 'use', cell: 0 });
    expect([s.chain3Count, s.weakChain3Count]).toEqual([2, 1]);
    expect(absorbReasons({ ...s, status: 'won' })).toEqual(['weakness-chain3']);
  });

  it('실제 전투: 약점 계통 스킬 블록으로 마무리하면 흡수 조건이 된다', () => {
    const b = newBuild();
    gainTrait(b, 'trait-b1'); // test-a 의 약점 계통 B 스킬
    const s = createCombat(1, { enemy: getEnemy('test-a'), params: buildCombatParams(b) });
    s.tray = [{ uid: 99, kind: 'skill', traitId: 'trait-b1' }];
    s.enemy.hp = 1;
    expect(applyInput(s, { type: 'use', cell: 0 })).toBe(true);
    expect(s.status).toBe('won');
    expect(s.finisher).toEqual({ kind: 'skill', traitId: 'trait-b1', lineageId: 'lineage-b', family: null, weak: true });
    expect(absorbReasons(s)).toEqual(['weakness-finisher']);
  });

  it('원정 전투 승리 후 조건 미달이면 흡수 화면 없이 이동, 채우면 흡수 화면', () => {
    const a = mk({ seed: 3 });
    fightNext(a);
    winWith(a, { absorbable: false });
    expect(a.phase).toBe('moving');
    expect(a.absorbOffer).toBeNull();
    const b = mk({ seed: 3 });
    fightNext(b);
    winWith(b, { absorbable: true });
    expect(b.phase).toBe('absorb');
    expect(b.absorbOffer!.reasons).toEqual(['weakness-chain3']);
    expect(b.absorbOffer).not.toBeNull();
    expect(advance(b)).toBeNull(); // 흡수를 고르기 전에는 이동하지 않는다
  });

  it('패배한 전투는 흡수할 수 없다', () => {
    const exp = mk({ seed: 4 });
    fightNext(exp);
    const b = startBattle(exp);
    b.status = 'lost';
    b.lossReason = 'hp';
    b.chain3Count = 9;
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

  it('슬롯 안 같은 계통 3개면 그 계통 스킬 블록 위력이 +50%', () => {
    const two = build(A.slice(0, 2));
    expect(completedLineages(two)).toEqual([]);
    const three = build(A.slice(0, 3));
    expect(completedLineages(three)).toEqual(['lineage-a']);
    const skillId = A.find((id) => getTrait(id).kind === 'skill')!;
    const one = equippedSkills(two).find((s) => s.id === skillId)!;
    expect(one.powerInAttacks).toBe(getTrait(skillId).powerInAttacks);
    expect(one.powerMultiplier).toBe(1);
    expect(equippedSkills(three).find((s) => s.id === skillId)!.powerMultiplier).toBeCloseTo(1 + AX.lineageSkillBonus);
  });

  it('다른 계통이 섞이면 보너스가 없다', () => {
    const mix = build([A[0]!, A[1]!, B[0]!]);
    expect(completedLineages(mix)).toEqual([]);
  });

  it('passive 는 기본 공격 위력·속도·받는 피해 자동 배율, part 는 전투에 영향이 없다', () => {
    const passiveId = A.find((id) => getTrait(id).kind === 'passive')!;
    const partId = A.find((id) => getTrait(id).kind === 'part')!;
    const only = build([passiveId, partId]);
    expect(getTrait(passiveId).passive!.stat).toBe('attackPower');
    expect(passiveMultipliers(only).attackPower).toBeCloseTo(getTrait(passiveId).passive!.multiplier);
    expect(passiveMultipliers(build([partId]))).toEqual({ attackPower: 1, attackSpeed: 1, damageTaken: 1 });
    expect(equippedSkills(only)).toEqual([]);
    const p = buildCombatParams(only);
    expect(p.attackPowerMultiplier).toBeGreaterThan(1);
    expect(buildCombatParams(build(['trait-b2'])).damageTakenMultiplier).toBeLessThan(1);
    expect(buildCombatParams(build(['trait-c2'])).attackSpeedMultiplier).toBeGreaterThan(1);
  });
});

describe('skill 특성이 스킬 블록이 된다 (GDD 3-5)', () => {
  const enemy = getEnemy('test-a'); // 약점 계통 B
  /** 트레이 0번 칸에 블록을 놓고 써서 피해를 잰다 */
  const fire = (params: Parameters<typeof createCombat>[1]['params'], traitId: string, chain = 1): { s: CombatState; damage: number } => {
    const s = createCombat(1, { enemy, params });
    s.tray = Array.from({ length: chain }, (_, k) => ({ uid: 99 + k, kind: 'skill' as const, traitId }));
    const before = s.enemy.hp;
    applyInput(s, { type: 'use', cell: 0 });
    return { s, damage: before - s.enemy.hp };
  };

  it('장착한 skill 이 없으면 기본 블록 하나가 생성원이다', () => {
    const src = blockSources(createCombat(1, { enemy }).params);
    expect(src.map((x) => x.id)).toEqual([BASIC_SKILL_ID]);
    const { s, damage } = fire({}, BASIC_SKILL_ID);
    expect(s.skillsUsed).toEqual([BASIC_SKILL_ID]);
    expect(damage).toBeCloseTo(s.params.basicBlockPowerInAttacks * s.params.playerAttackDamage);
  });

  it('장착한 skill 특성마다 역할·위력·추가 효과를 가진 블록 생성원이 되고, skillsUsed 는 실제 특성 id', () => {
    const skills = A.filter((id) => getTrait(id).kind === 'skill');
    expect(skills.length).toBeGreaterThanOrEqual(2);
    const b = newBuild();
    for (const id of skills) gainTrait(b, id);
    const params = buildCombatParams(b);
    expect(params.skills!.map((x) => x.id)).toEqual(skills.filter((id) => b.slots.includes(id)));
    expect(params.skills!.every((x) => ['attack', 'guard', 'heal'].includes(x.role) && x.chainBonus.value > 0)).toBe(true);
    const { s, damage } = fire(params, skills[0]!);
    expect(s.skillsUsed).toEqual([skills[0]]);
    // 같은 계통 3개라 계통 보너스(위력 배율)가 곱해진다
    expect(damage).toBeCloseTo(getTrait(skills[0]!).powerInAttacks! * params.skills![0]!.powerMultiplier * s.params.playerAttackDamage);
  });

  it('계통 보너스가 켜지면 블록 위력이 1.5배', () => {
    const skillId = A.find((id) => getTrait(id).kind === 'skill')!;
    const one = newBuild();
    gainTrait(one, skillId);
    const full = newBuild();
    for (const id of A.slice(0, 3)) gainTrait(full, id);
    const d1 = fire({ ...buildCombatParams(one), attackPowerMultiplier: 1 }, skillId).damage;
    const d3 = fire({ ...buildCombatParams(full), attackPowerMultiplier: 1 }, skillId).damage;
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
        const offer = buildOffer(createRng(seed), { ...getEnemy('test-a'), lineageId, rare: true }, newBuild(), NO);
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
      const offer = buildOffer(createRng(seed), { ...getEnemy('test-a'), lineageId: 'lineage-a', rare: false }, build, NO);
      expect(offer.rare).toBe(false);
      expect(offer.candidates.length).toBeGreaterThanOrEqual(1);
      expect(offer.candidates.length).toBeLessThanOrEqual(2);
      expect(offer.candidates.every((id) => !getTrait(id).rare && id !== A[0])).toBe(true);
    }
    expect(buildOffer(createRng(1), { ...getEnemy('test-elite'), rare: false }, newBuild(), NO).candidates).toHaveLength(AX.candidatesElite);
  });

  it('조우한 적의 희귀 여부는 시드로 정해지고 흡수 제안에 그대로 실린다', () => {
    const rares = new Set<boolean>();
    for (let seed = 1; seed <= 80; seed++) {
      const exp = mk({ seed });
      fightNext(exp);
      const rare = exp.pending!.enemy.rare === true;
      rares.add(rare);
      winWith(exp, { absorbable: true });
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
      winWith(exp, { absorbable: true });
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
  it('공허 블록 사용이 게이지를 올린다 (전투의 riskGained = 사용 횟수 × perVoidBlock, 그대로 반영)', () => {
    const s = createCombat(1, { enemy: getEnemy('test-a') });
    s.tray = [{ uid: 98, kind: 'void', traitId: null }, { uid: 99, kind: 'void', traitId: null }];
    applyInput(s, { type: 'use', cell: 0 });
    applyInput(s, { type: 'use', cell: 0 });
    expect(s.voidUsed).toBe(2);
    expect(s.riskGained).toBeCloseTo(2 * RX.perVoidBlock);
    const exp = mk({ seed: 11 });
    fightNext(exp);
    winWith(exp, { risk: s.riskGained });
    expect(exp.risk).toBeCloseTo(2 * RX.perVoidBlock);
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
    changeRisk(exp, 10, 'void-block');
    expect(exp.risk).toBe(RX.limit);
    expect(exp.breakthrough).not.toBeNull();
    changeRisk(exp, 10, 'void-block');
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

  it('임시 페널티: 돌파 뒤 남은 원정 동안 공허 블록 생성 확률 가산', () => {
    const bonus = (risk: number) => {
      const e = mk({ seed: 22, risk, condition: 100 });
      e.wildCells = [1];
      changeRisk(e, 0, 'void-block');
      advance(e);
      return startBattle(e).params.voidChanceBonus;
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
    const a = buildOffer(createRng(9), enemy, newBuild(), NO);
    expect(buildOffer(createRng(9), enemy, newBuild(), NO)).toEqual(a);
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
  it('새 세이브에는 빌드·리스크·안정 수치가 있다', () => {
    const s = newSaveData('hollow', 0);
    expect(SAVE_FORMAT_VERSION).toBeGreaterThanOrEqual(4);
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
    expect(s.meta.format).toBe(SAVE_FORMAT_VERSION);
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

describe('C.7 흡수 문구와 기준 빌드 봇', () => {
  it('흡수 조건 안내·이유 문구가 새 조건(약점 계통 마무리 / 약점 계통 체인3 / 첫 흡수 보장)을 말한다', async () => {
    const { absorbConditionText, reasonText } = await import('../src/ui/absorbView');
    const hollow = getFaction('hollow');
    const cond = absorbConditionText(hollow, 'lineage-b');
    expect(cond).toContain('마무리 일격이 약점 계통');
    expect(cond).toContain(`${hollow.chainName}3 을 ${AX.weakChain3ForAbsorb}회 이상`);
    expect(cond).toContain('특성이 없으면 조건 없이 가능');
    const offer = (reasons: string[]) =>
      ({ reasons, finisherLineageId: 'lineage-b', chain3Count: 3, weakChain3Count: 1 }) as unknown as Parameters<typeof reasonText>[1];
    expect(reasonText(hollow, offer(['weakness-finisher']))).toContain('약점 계통');
    expect(reasonText(hollow, offer(['weakness-chain3']))).toContain(`${hollow.chainName}3 1회`);
    expect(reasonText(hollow, offer(['first-absorb']))).toContain(`첫 ${hollow.absorbActionName} 보장`);
  });

  it('기준 빌드(skill 1개 공격)를 쓴 봇: 일반 적은 90%↑, 강적은 승률이 0/100% 로 쏠리지 않는다 (사람형 봇, 참고 점검 40~97%. 완벽형 봇은 저장 필살기로 100% 허용 — C.17)', async () => {
    const { playCombatHuman } = await import('../src/engine/combat');
    const b = newBuild();
    gainTrait(b, 'trait-c5');
    const params = buildCombatParams(b);
    const rate = (id: string) => {
      let w = 0;
      for (let seed = 1; seed <= 60; seed++) if (playCombatHuman(createCombat(seed, { enemy: getEnemy(id), params })).status === 'won') w++;
      return w / 60;
    };
    expect(rate('test-a')).toBeGreaterThanOrEqual(0.9);
    expect(rate('test-b')).toBeGreaterThanOrEqual(0.9);
    const elite = rate('test-elite');
    expect(elite).toBeGreaterThan(0.4);
    expect(elite).toBeLessThan(0.97);
  });
});
