import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { ENEMIES, enemyPatternKind, getEnemy } from '../src/data/enemies';
import type { EnemyDef } from '../src/data/schema';
import { getFaction } from '../src/data/factions';
import { ELEMENTS, NORMAL_ELEMENT } from '../src/data/elements';
import { TRAITS, getTrait, traitDescription } from '../src/data/traits';
import {
  absorbReasons, absorbRisk, attackFamilyOf, buildCombatParams, buildOffer, canAbsorb, changeRisk, equippedAttackFamilies, equippedSkills, gainTrait, lateLapRisk, newBuild,
  passiveMultipliers, setSlot, settleRiskToNest, type BuildState,
} from '../src/engine/absorb';
import { BASIC_GUARD_ID, BASIC_HEAL_ID, BASIC_SKILL_ID, isBasicBlockId, applyInput, blockSources, createCombat, type Block, type CombatState } from '../src/engine/combat';
import { createRng } from '../src/engine/rng';
import {
  advance, chooseAbsorb, chooseContinue, chooseRelease, chooseReturn, createExpedition, drainEvents, finishBattle, finishRest, placeTile,
  playExpedition, startBattle, summarize, type ExpeditionState,
} from '../src/engine/expedition';
import { doNestAction, newNest } from '../src/engine/nest';
import { loadSave, migrateSave, newSaveData, nextRunId, recordExpedition, SAVE_FORMAT_VERSION, writeSave } from '../src/game';
import { useLegacyMigrations } from './helpers/legacyGate';

useLegacyMigrations(); // 옛 형식 마이그레이션 시험 (C.120, GDD 61장)

const AX = BALANCE.provisional.absorb;
const RX = BALANCE.provisional.risk;
const DECK = ['prey-nest-a', 'prey-nest-a', 'elite-den-a', 'env-fog', 'rest-a', 'prey-nest-b', 'env-ruin', 'elite-den-b'];
const mk = (over: Partial<Parameters<typeof createExpedition>[0]> = {}) =>
  createExpedition({ factionId: 'hollow', seed: 1, hunger: 10, condition: 100, deck: DECK, ...over });

const ofEl = (id: string) => TRAITS.filter((t) => t.element === id).map((t) => t.id);
// test-a = 불 속성 (약점 물). A = 불 특성, B = 물 특성 (C.47: 계통 → 속성)
const A = ofEl('fire');
const B = ofEl('water');

/** 다음 전투를 이긴 것으로 치고 끝낸다. absorbable: 우위 체인3 3회(C.125 부터 흡수 조건은 없다 — 런 로그 값만), risk: 공허 블록 리스크 값 */
function winWith(exp: ExpeditionState, opt: { absorbable?: boolean; risk?: number; firstAbsorb?: boolean } = {}): void {
  const b = startBattle(exp);
  b.enemy.hp = 0;
  b.status = 'won';
  b.finisher = { kind: 'basic-attack', traitId: null, element: null };
  b.weakChain3Count = opt.absorbable ? 3 : 0;
  // 첫 흡수 보장(장착 skill 없음)을 피하려고 기본은 skill 이 장착된 전투로 친다
  if (!opt.firstAbsorb) b.params = { ...b.params, skills: [{ id: 't-fire-a', element: 'fire', category: 'physical', role: 'attack', powerInAttacks: 1, chainBonus: { kind: 'stagger', value: 1 }, powerMultiplier: 1 }] };
  b.riskGained = opt.risk ?? 0;
  finishBattle(exp, b);
}
/** 흡수 조건 판정용 전투 결과 */
const result = (o: { won?: boolean; chain3?: number; weakChain3?: number; skills?: number; finisher?: CombatState['finisher'] }) => ({
  status: (o.won ?? true) ? ('won' as const) : ('lost' as const),
  chain3Count: o.chain3 ?? 0,
  weakChain3Count: o.weakChain3 ?? 0,
  params: { skills: Array.from({ length: o.skills ?? 1 }) as unknown[] },
  finisher: o.finisher ?? null,
});
const NO = result({});
/** 우위 체인3 세기 확인용 횟수 (흡수 조건은 C.125 에 삭제, 런 로그·히든용 카운트만 남음) */
const AX_WEAK3 = 3;
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
  it('속성 8종, 속성마다 특성 6개(공격 3계열·패시브·파츠·희귀 — C.136 막기·회복 속성 특성 삭제, GDD 84장 7번), 전부 provisional (C.47)', () => {
    expect(ELEMENTS).toHaveLength(8);
    expect(ELEMENTS.map((e) => e.name['*'])).toEqual(['노멀', '물', '불', '흙', '뇌', '혈', '독', '허(虛)']);
    for (const e of ELEMENTS) {
      const ts = TRAITS.filter((t) => t.element === e.id && !t.boss); // 보스 특성(C.58)은 따로
      expect(ts, e.id).toHaveLength(5); // C.213 (GDD 136장 1): 희귀 특성 삭제 6 → 5
      expect(new Set(ts.map((t) => t.kind))).toEqual(new Set(['skill', 'passive', 'part']));
      expect(new Set(ts.filter((t) => t.role === 'attack').map((t) => t.family))).toEqual(new Set(['family-a', 'family-b', 'family-c']));
      expect(ts.some((t) => t.role === 'guard' || t.role === 'heal')).toBe(false);
    }
    expect(TRAITS.every((t) => t.provisional === true)).toBe(true);
  });

  it('테스트 적에 속성·공격 분류·노력치가 있다 (희귀 확률은 C.213 에 삭제)', () => {
    for (const id of ['test-a', 'test-b', 'test-elite']) {
      const e = getEnemy(id);
      expect(ELEMENTS.some((x) => x.id === e.element)).toBe(true);
      expect(['physical', 'special', 'mixed']).toContain(e.category);
      expect(Object.values(e.ev).reduce((x, y) => x + (y ?? 0), 0)).toBeGreaterThan(0);
      expect('rareChance' in e).toBe(false);
    }
    expect(getEnemy('test-a').element).toBe('fire');
  });

  it('특성 설명은 종족별 텍스트로 분리되어 있다', () => {
    const skill = A.find((id) => getTrait(id).kind === 'skill')!;
    expect(traitDescription(skill, 'hollow')).not.toBe(traitDescription(skill, 'shinigami'));
  });
});

describe('흡수 가능 조건', () => {
  it('C.125 (GDD 71장): 이기기만 하면 마무리·체인3·장착과 상관없이 언제나 흡수 가능, 지면 불가', () => {
    const weakSkill = { kind: 'skill' as const, traitId: 't-water-b', element: 'water', weak: true };
    expect(canAbsorb(NO)).toBe(true);
    expect(absorbReasons(NO)).toEqual(['victory']);
    for (const kind of ['basic-attack', 'special', 'void', 'reflect', 'dot'] as const) {
      expect(canAbsorb(result({ finisher: { kind, traitId: null, element: null } }))).toBe(true);
    }
    expect(canAbsorb(result({ finisher: { kind: 'skill', traitId: 't-fire-a', element: 'fire', weak: false } }))).toBe(true);
    expect(canAbsorb(result({ skills: 0 }))).toBe(true);
    expect(canAbsorb(result({ won: false, weakChain3: 5, finisher: weakSkill }))).toBe(false);
    expect(absorbReasons(result({ won: false }))).toEqual([]);
  });

  it('실제 전투: 상성 우위 블록 체인3 을 쓰면 weakChain3Count 가 오르고, 같은 속성(보통) 체인3 은 오르지 않는다', () => {
    const b = newBuild();
    gainTrait(b, 't-water-b'); // test-a(불) 를 이기는 물
    gainTrait(b, 't-fire-a');
    const s = createCombat(1, { enemy: getEnemy('test-a'), params: buildCombatParams(b) });
    s.enemy.hp = s.enemy.maxHp * 100;
    const three = (traitId: string, uid: number): Block[] => [0, 1, 2].map((k) => ({ uid: uid + k, kind: 'skill', traitId }));
    s.tray = [...three('t-fire-a', 90), ...Array.from({ length: AX_WEAK3 }, (_, k) => three('t-water-b', 100 + k * 10)).flat()];
    applyInput(s, { type: 'use', cell: 0 });
    expect([s.chain3Count, s.weakChain3Count]).toEqual([1, 0]);
    applyInput(s, { type: 'use', cell: 0 });
    expect([s.chain3Count, s.weakChain3Count]).toEqual([2, 1]);
    for (let k = 1; k < AX_WEAK3; k++) applyInput(s, { type: 'use', cell: 0 });
    expect(s.weakChain3Count).toBe(AX_WEAK3);
  });

  it('실제 전투: 상성 우위 블록으로 마무리하면 흡수 조건이 되고, 같은 속성 블록 마무리는 아니다', () => {
    const b = newBuild();
    gainTrait(b, 't-water-b'); // test-a(불) 의 약점 = 물
    gainTrait(b, 't-fire-a');
    const finish = (traitId: string) => {
      const s = createCombat(1, { enemy: getEnemy('test-a'), params: buildCombatParams(b) });
      s.tray = [{ uid: 99, kind: 'skill', traitId }];
      s.enemy.hp = 1;
      expect(applyInput(s, { type: 'use', cell: 0 })).toBe(true);
      expect(s.status).toBe('won');
      return s;
    };
    const w = finish('t-water-b');
    expect(w.finisher).toEqual({ kind: 'skill', traitId: 't-water-b', element: 'water', family: 'family-b', weak: true, matchup: 'strong' });
    expect(absorbReasons(w)).toEqual(['victory']);
    const f = finish('t-fire-a');
    expect(f.finisher).toMatchObject({ element: 'fire', weak: false, matchup: 'neutral' });
    expect(absorbReasons(f)).toEqual(['victory']); // C.125: 상성 아닌 마무리도 흡수 가능
  });

  it('약점 속성이 없는 적(노멀·특수)은 아무 스킬 블록 마무리나 우위로 친다 (기본 블록은 아님)', () => {
    const b = newBuild();
    gainTrait(b, 't-fire-a');
    const s = createCombat(1, { enemy: { ...getEnemy('test-a'), element: 'normal' }, params: buildCombatParams(b) });
    s.tray = [{ uid: 99, kind: 'skill', traitId: 't-fire-a' }];
    s.enemy.hp = 1;
    applyInput(s, { type: 'use', cell: 0 });
    expect(s.finisher).toMatchObject({ weak: true, matchup: 'neutral' });
    const basic = createCombat(1, { enemy: { ...getEnemy('test-a'), element: 'normal' } });
    basic.tray = [{ uid: 99, kind: 'skill', traitId: BASIC_SKILL_ID }];
    basic.enemy.hp = 1;
    applyInput(basic, { type: 'use', cell: 0 });
    expect(basic.finisher).toMatchObject({ weak: false });
  });

  it('C.125 (GDD 71장): 원정 전투에 이기면 우위 마무리·체인3 없이도 언제나 흡수 화면', () => {
    const a = mk({ seed: 3 });
    fightNext(a);
    winWith(a, { absorbable: false });
    expect(a.phase).toBe('absorb');
    expect(a.absorbOffer!.reasons).toEqual(['victory']);
    const b = mk({ seed: 3 });
    fightNext(b);
    winWith(b, { absorbable: true });
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
    toAbsorb(exp, { element: 'water' });
    const offer = exp.absorbOffer!;
    expect(offer.element).toBe('water');
    expect(offer.candidates.length).toBeGreaterThanOrEqual(1);
    // 첫 후보는 그 적의 속성 (장착 계열이 이미 3가지라 계열 섞기가 끼어들지 않는다)
    expect(getTrait(offer.candidates[0]!).element).toBe('water');
    const cand = offer.candidates[0]!;
    const fail = chooseAbsorb(exp, cand);
    expect(fail.ok).toBe(false);
    expect(exp.phase).toBe('absorb'); // 실패하면 아무것도 바뀌지 않는다
    expect(chooseAbsorb(exp, 't-fire-a').ok).toBe(false);
    expect(chooseAbsorb(exp, cand, 0).ok).toBe(true);
    expect(exp.build.slots[0]).toBe(cand);
    expect(exp.phase).toBe('moving');
  });

  it('가득 찼을 때 포기하면 특성 없이 흡수 효과만 얻는다', () => {
    const exp = mk({ seed: 6, hunger: 50 });
    exp.build.owned.push(...A.slice(0, 3));
    exp.build.slots = A.slice(0, 3);
    toAbsorb(exp, { element: 'water' });
    expect(chooseAbsorb(exp, null).ok).toBe(true);
    expect(exp.build.slots).toEqual(A.slice(0, 3));
    expect(exp.acquiredTraits).toHaveLength(0);
    expect(exp.absorbRecords[0]).toMatchObject({ absorbed: true, traitId: null });
    expect(exp.hunger).toBe(AX.hungerAfterAbsorb);
  });
});

describe('속성 보너스와 특성 효과', () => {
  const build = (ids: string[]): BuildState => {
    const b = newBuild();
    for (const id of ids) gainTrait(b, id);
    return b;
  };

  it('같은 속성 3개 보너스는 없다 (C.150, GDD 94장 B 후속): 셋 장착해도 블록 위력은 강화 배율뿐', () => {
    const three = build(A.slice(0, 3));
    const skillId = A.find((id) => getTrait(id).kind === 'skill')!;
    const s = equippedSkills(three).find((x) => x.id === skillId)!;
    expect(s.powerInAttacks).toBe(getTrait(skillId).powerInAttacks);
    expect(s.powerMultiplier).toBe(1);
    expect('elementBonusCount' in AX).toBe(false);
  });

  it('블록 생성원은 특성의 속성과, 종족 설정 계열의 공격 분류를 가진다 (종족을 모르면 혼합)', () => {
    const b = build(['t-fire-a', 't-fire-c', 't-fire-b']);
    expect(equippedSkills(b, 'hollow').map((x) => [x.element, x.category])).toEqual([['fire', 'physical'], ['fire', 'special'], ['fire', 'mixed']]);
    expect(equippedSkills(b).every((x) => x.category === 'mixed')).toBe(true);
  });

  it('passive 는 기본 공격 위력·속도·받는 피해 자동 배율, part 는 전투에 영향이 없다', () => {
    const passiveId = A.find((id) => getTrait(id).kind === 'passive')!;
    const partId = A.find((id) => getTrait(id).kind === 'part')!;
    const only = build([passiveId, partId]);
    expect(getTrait(passiveId).passive!.stat).toBe('attackPower');
    expect(passiveMultipliers(only).attackPower).toBeCloseTo(getTrait(passiveId).passive!.multiplier);
    expect(passiveMultipliers(build([partId]))).toEqual({ attackPower: 1, attackSpeed: 1, damageTaken: 1, blockSpawn: 1 });
    expect(buildCombatParams(build(['t-poison-passive'])).blockSpawnMultiplier).toBeGreaterThan(1);
    expect(equippedSkills(only)).toEqual([]);
    const p = buildCombatParams(only);
    expect(p.attackPowerMultiplier).toBeGreaterThan(1);
    expect(buildCombatParams(build(['t-earth-passive'])).damageTakenMultiplier).toBeLessThan(1);
    expect(buildCombatParams(build(['t-thunder-passive'])).attackSpeedMultiplier).toBeGreaterThan(1);
  });
});

describe('skill 특성이 스킬 블록이 된다 (GDD 3-5)', () => {
  const enemy = getEnemy('test-a'); // 불 속성 (A = 불 특성이라 상성 보통)
  /** 트레이 0번 칸에 블록을 놓고 써서 피해를 잰다 */
  const fire = (params: Parameters<typeof createCombat>[1]['params'], traitId: string, chain = 1): { s: CombatState; damage: number } => {
    const s = createCombat(1, { enemy, params: { blockPlayDamage: 1, blockPlayCrit: 0, ...params } }); // C.136 블록 플레이 보정 끔 (옛 피해 공식만 본다)
    s.tray = Array.from({ length: chain }, (_, k) => ({ uid: 99 + k, kind: 'skill' as const, traitId }));
    const before = s.enemy.hp;
    applyInput(s, { type: 'use', cell: 0 });
    return { s, damage: before - s.enemy.hp };
  };

  it('장착한 skill 이 없으면 기본 블록 5종(공격·막기·회복 생성원)만 생성원이다 (GDD 44장)', () => {
    const src = blockSources(createCombat(1, { enemy }).params);
    expect(src.map((x) => x.id)).toEqual([BASIC_SKILL_ID, BASIC_GUARD_ID, BASIC_HEAL_ID]);
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
    // 위력 배율 = 속성 강화뿐 (같은 속성 3개 보너스는 C.150 에 삭제)
    expect(damage).toBeCloseTo(getTrait(skills[0]!).powerInAttacks! * params.skills![0]!.powerMultiplier * s.params.playerAttackDamage);
  });

  it('같은 속성 3개를 껴도 블록 위력은 하나 낄 때와 같다 (C.150, 속성 보너스 삭제)', () => {
    const skillId = A.find((id) => getTrait(id).kind === 'skill')!;
    const one = newBuild();
    gainTrait(one, skillId);
    const full = newBuild();
    for (const id of A.slice(0, 3)) gainTrait(full, id);
    const d1 = fire({ ...buildCombatParams(one), attackPowerMultiplier: 1 }, skillId).damage;
    const d3 = fire({ ...buildCombatParams(full), attackPowerMultiplier: 1 }, skillId).damage;
    expect(d3).toBeCloseTo(d1);
  });

  it('원정 전투는 장착한 특성을 전투 파라미터로 받는다', () => {
    const exp = mk({ seed: 7 });
    const skillId = A.find((id) => getTrait(id).kind === 'skill')!;
    gainTrait(exp.build, skillId);
    fightNext(exp);
    expect(startBattle(exp).params.skills.map((s) => s.id)).toEqual([skillId]);
  });
});

describe('흡수 후보 (희귀 개체·희귀 특성은 C.213 에 삭제 — GDD 136장 1)', () => {
  it('후보는 그 속성 일반 특성 (C.176 GDD 106장 1: 가진 속성·특성도 후보 — 고르면 강화만)', () => {
    const build = newBuild();
    gainTrait(build, A[0]!);
    for (let seed = 1; seed <= 30; seed++) {
      const fire = buildOffer(createRng(seed), { ...getEnemy('test-a'), element: 'fire' }, build, NO).candidates;
      expect(fire.length).toBeGreaterThanOrEqual(1);
      expect(fire.every((id) => !getTrait(id).boss && getTrait(id).element === 'fire')).toBe(true);
      const offer = buildOffer(createRng(seed), { ...getEnemy('test-a'), element: 'water' }, build, NO);
      expect(offer.candidates.length).toBeGreaterThanOrEqual(1);
      expect(offer.candidates.length).toBeLessThanOrEqual(2);
      expect(offer.candidates.every((id) => !getTrait(id).boss)).toBe(true);
    }
    expect(buildOffer(createRng(1), getEnemy('test-elite'), newBuild(), NO).candidates).toHaveLength(AX.candidatesElite);
  });

  it('희귀 개체·희귀 특성은 없다 (C.213, GDD 136장 1): 조우 적·흡수 제안에 희귀 표시가 없고 후보에 t-*-rare 가 나오지 않는다', () => {
    expect(TRAITS.some((t) => /-rare$/.test(t.id))).toBe(false);
    for (let seed = 1; seed <= 40; seed++) {
      const exp = mk({ seed });
      fightNext(exp);
      expect('rare' in exp.pending!.enemy).toBe(false);
      winWith(exp, { absorbable: true });
      expect('rare' in exp.absorbOffer!).toBe(false);
      expect(exp.absorbOffer!.candidates.some((id) => /-rare$/.test(id))).toBe(false);
    }
  });
});

describe('흡수의 효과', () => {
  it('흡수하면 노력치가 적 데이터만큼 오르고 단계 속성 기록이 쌓인다 (GDD 20-4)', () => {
    const exp = mk({ seed: 8, hunger: 60, risk: 0 });
    toAbsorb(exp);
    const offer = exp.absorbOffer!;
    expect(offer.ev).toEqual(getEnemy(offer.enemyId).ev);
    chooseAbsorb(exp, null);
    expect(exp.evolution.absorbs).toBe(1);
    expect(exp.evolution.elementAbsorbs).toEqual({ [offer.element]: 1 });
    for (const [k, v] of Object.entries(offer.ev)) expect(exp.evolution.ev[k as keyof typeof exp.evolution.ev]).toBe(v);
    expect(exp.absorbRecords[0]).toMatchObject({ element: offer.element, absorbed: true });
  });

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
    // 놓아준 수는 진화(절제 히든) 기록에 쌓이고 노력치는 오르지 않는다
    expect(exp.evolution.releases).toBe(1);
    expect(Object.values(exp.evolution.ev).every((v) => v === 0)).toBe(true);
  });
});

describe('리스크 게이지', () => {
  it('공허 블록 사용이 게이지를 올린다 (전투의 riskGained = 사용 횟수 × perVoidBlock, 그대로 반영)', () => {
    const s = createCombat(1, { enemy: getEnemy('test-a') });
    s.tray = [{ uid: 98, kind: 'void', traitId: null }, { uid: 99, kind: 'void', traitId: null }];
    applyInput(s, { type: 'use', cell: 0 });
    s.stunTicks = 0; // 공허 경직 중에는 블록을 못 쓴다 (GDD 105장 1번) — 사용 횟수만 보려고 경직을 푼다
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
    winWith(exp, { risk: 40 }); // C.125: 이기면 바로 흡수 화면
    chooseRelease(exp);
    const expected = exp.risk;
    const stab = exp.stability;
    while (exp.phase !== 'nest-choice' && exp.phase !== 'ended') {
      if (exp.phase === 'moving') advance(exp);
      else if (exp.phase === 'battle') winWith(exp);
      else if (exp.phase === 'rest') finishRest(exp);
      else if (exp.phase === 'absorb') chooseRelease(exp); // C.125: 이기면 늘 흡수 화면 — 옛 '조건 미달 → 이동' 대신 놓아줌
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
      else if (exp.phase === 'absorb') chooseRelease(exp); // C.125: 이기면 늘 흡수 화면 — 옛 '조건 미달 → 이동' 대신 놓아줌
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
    toAbsorb(exp, { element: 'fire' });
    chooseAbsorb(exp, exp.absorbOffer!.candidates[0]!);
    const first = exp.build.owned[0]!;
    while (exp.phase !== 'nest-choice') {
      if (exp.phase === 'moving') advance(exp);
      else if (exp.phase === 'battle') winWith(exp);
      else if (exp.phase === 'rest') finishRest(exp);
      else if (exp.phase === 'absorb') chooseRelease(exp); // C.125: 이기면 늘 흡수 화면 — 옛 '조건 미달 → 이동' 대신 놓아줌
    }
    chooseContinue(exp);
    toAbsorb(exp, { element: 'water' }); // C.147 (94장 B): fire 는 이미 가져 강화만 — 처음 먹는 속성
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
        else if (exp.phase === 'absorb') chooseRelease(exp);
      else if (exp.phase === 'absorb') chooseRelease(exp); // C.125: 이기면 늘 흡수 화면 — 옛 '조건 미달 → 이동' 대신 놓아줌
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

  it('같은 속성 셋을 낀 채 귀환해도 속성 보너스 완성 기록(lineages)은 더 쌓이지 않는다 (C.150)', () => {
    const save = newSaveData('hollow', 0);
    for (const id of A.slice(0, 3)) gainTrait(save.build, id);
    const exp = mk({ seed: 32, runId: nextRunId(save), build: save.build });
    while (exp.phase !== 'nest-choice') {
      if (exp.phase === 'moving') advance(exp);
      else if (exp.phase === 'battle') winWith(exp);
      else if (exp.phase === 'rest') finishRest(exp);
      else if (exp.phase === 'absorb') chooseRelease(exp);
    }
    chooseReturn(exp);
    recordExpedition(save, exp, 5);
    expect(save.runLog.lineages).toEqual([]);
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
    const enemy = { ...getEnemy('test-b') };
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
    // 기본 블록 5종은 늘 풀에 있다 (GDD 44장): 장착 특성 id 아니면 기본 블록 id
    expect(used).toContain(skillId);
    expect(used.every((id) => id === skillId || isBasicBlockId(id))).toBe(true);
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
    expect(s.runLog.absorbs[0]).toMatchObject({ traitId: null, lap: 0, element: null, lineageId: 'lineage-a' });
    expect(s.runLog.runs[0]).toMatchObject({ gainedTraits: [], lostTraits: [], riskPeak: 0, breakthrough: false });
    expect(migrateSave({ ...old, meta: { format: 99 } })).toBeNull();
  });
});

describe('종족 설정만 바꿔도 표기가 바뀐다', () => {
  it('안정 수치·슬롯·계통 보너스·특성 종류 이름은 종족 설정에서 나온다', () => {
    const h = getFaction('hollow');
    const s = getFaction('shinigami');
    expect([h.stabilityName, s.stabilityName]).toEqual(['영압 안정도', '영압 안정도']);
    expect([h.lineageBonusName, s.lineageBonusName]).toEqual(['계열 기술 강화', '참백도 속성 확정']);
    expect([h.slotLocation, s.slotLocation]).toEqual(['body', 'zanpakuto']);
    expect(h.appearanceChange).toBe(true);
    expect(s.appearanceChange).toBe(false);
    expect([h.riskGaugeName, s.riskGaugeName]).toEqual(['광기', '호로화']);
    expect(h.traitKindNames.part).not.toBe(s.traitKindNames.part);
  });
});

describe('C.7 흡수 문구와 기준 빌드 봇', () => {
  it('흡수 안내 문구 (C.125): 조건 없이 이기면 언제나, 후보는 그 적 속성 특성에서만', async () => {
    const { absorbRuleText, weaknessText } = await import('../src/ui/absorbView');
    const hollow = getFaction('hollow');
    const rule = absorbRuleText(hollow, { element: 'poison' });
    expect(rule).toContain(`이기면 언제나 ${hollow.absorbActionName}할 수 있다`);
    expect(rule).toContain('이미 가진 블록'); // C.176 (106장 1): 가진 속성도 후보 — 가진 블록은 강화만
    expect(rule).toContain('강화만');
    expect(rule).not.toContain('조건');
    expect(weaknessText({ element: 'thunder' }, 'hollow')).toBe('흙');
    expect(weaknessText({ element: 'normal' }, 'hollow')).toBeNull();
  });

  it('기준 빌드(skill 1개 공격)를 쓴 봇: 일반 적은 90%↑, 강적은 승률이 0/100% 로 쏠리지 않는다 (사람형 봇, 참고 점검 40~97%. 완벽형 봇은 저장 필살기로 100% 허용 — C.17)', async () => {
    const { playCombatHuman } = await import('../src/engine/combat');
    const b = newBuild();
    gainTrait(b, 't-thunder-c');
    const params = buildCombatParams(b);
    const rate = (id: string) => {
      let w = 0;
      for (let seed = 1; seed <= 60; seed++) if (playCombatHuman(createCombat(seed, { enemy: getEnemy(id), params })).status === 'won') w++;
      return w / 60;
    };
    expect(rate('test-a')).toBeGreaterThanOrEqual(0.9);
    expect(rate('test-b')).toBeGreaterThanOrEqual(0.9);
    expect(rate('test-elite')).toBeGreaterThan(0.4);
    // C.97 (GDD 44-1): 기본 막기·회복 블록이 늘 나와 강공격형 시험 강적은 거의 이긴다(59승) → C.98(44-2, 기본 몫 60%)부터 60판 전승.
    // 0/100% 쏠림은 적 풀의 강적(패턴 종류마다 1종 × 20판)으로 본다. 적 풀 전체 강적 승률 60~85% 는 balance:check 가 가드
    const kinds = new Map<string, EnemyDef>();
    for (const e of ENEMIES) if (e.class === 'elite' && !e.testOnly && !kinds.has(enemyPatternKind(e))) kinds.set(enemyPatternKind(e), e);
    let games = 0, wins = 0;
    for (const enemy of kinds.values()) for (let seed = 1; seed <= 20; seed++) {
      games++;
      if (playCombatHuman(createCombat(seed, { enemy, params })).status === 'won') wins++;
    }
    expect(kinds.size).toBeGreaterThanOrEqual(2);
    expect(wins / games).toBeGreaterThan(0.4);
    // C.132 (GDD 80장): 1칸 기본 몫 60 → 75% 로 막기·회복 기본 블록이 늘어 이 3종 × 20판은 60판 전승(전 55/60). 100% 쏠림은 balance:check 의 적 풀 강적 60~85% 가드가 본다
  });
});

describe('공격 계열 섞임 (GDD 18-8 ③, C.41)', () => {
  const normal = (element: string): EnemyDef => ({ ...getEnemy('test-a'), element });
  const fams = (ids: string[]) => ids.map(attackFamilyOf).filter((f): f is string => f !== null);

  it('모든 속성이 서로 다른 계열의 일반 공격 특성을 2개 이상 가진다', () => {
    for (const l of ELEMENTS) {
      const set = new Set(fams(TRAITS.filter((t) => t.element === l.id && !t.boss).map((t) => t.id)));
      expect(set.size, l.id).toBeGreaterThanOrEqual(2);
    }
  });

  it('첫 흡수(장착 없음)는 어느 속성이든 서로 다른 계열의 공격 후보 2개를 낸다 (노멀은 기본 블록을 가진 것으로 봐 후보 없음, C.147)', () => {
    for (const l of ELEMENTS.filter((e) => e.id !== NORMAL_ELEMENT)) {
      for (let seed = 1; seed <= 30; seed++) {
        // C.125 (70장): 후보는 그 적 속성 안에서만 — 특수 속성(혈·독·허)은 숨김이 열렸을 때로 본다
        const offer = buildOffer(createRng(seed), normal(l.id), newBuild(), NO, 0, null);
        const f = fams(offer.candidates);
        expect(f.length, `${l.id}/${seed}`).toBeGreaterThanOrEqual(2);
        expect(new Set(f).size, `${l.id}/${seed}`).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('이미 장착한 계열만 있으면 다른 계열 공격 후보를 끼워 넣는다 (장착 계열이 보장 수에 차면 손대지 않는다)', () => {
    const b: BuildState = newBuild();
    gainTrait(b, 't-fire-a'); // 계열 a 장착
    for (const l of ELEMENTS.filter((e) => e.id !== NORMAL_ELEMENT && e.id !== 'fire')) {
      for (let seed = 1; seed <= 30; seed++) {
        const offer = buildOffer(createRng(seed), normal(l.id), b, NO, 0, null);
        expect(fams(offer.candidates).some((f) => !equippedAttackFamilies(b).has(f)), `${l.id}/${seed}`).toBe(true);
      }
    }
    const full: BuildState = newBuild();
    gainTrait(full, 't-fire-a');
    gainTrait(full, 't-water-b'); // 계열 b
    gainTrait(full, 't-thunder-c'); // 계열 c = 보장 수(3)
    expect(equippedAttackFamilies(full).size).toBeGreaterThanOrEqual(AX.attackFamilyGuarantee);
    const offer = buildOffer(createRng(3), normal('earth'), full, NO);
    expect(offer.candidates.length).toBeGreaterThan(0);
  });

  it('후보는 모두 그 적 속성의 특성 (C.125 GDD 70장 — C.47 의 둘째 후보 다른 속성은 폐기), 이미 가진 특성은 나오지 않는다', () => {
    const b: BuildState = newBuild();
    gainTrait(b, 't-fire-a');
    gainTrait(b, 't-fire-c'); // 장착 계열 2가지 = 계열 섞기 보장 수 → 섞기가 후보를 바꾸지 않는다
    let seenSecond = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const offer = buildOffer(createRng(seed), normal('earth'), b, NO);
      expect(offer.element).toBe('earth');
      expect(getTrait(offer.candidates[0]!).element).toBe('earth');
      if (offer.candidates[1]) {
        seenSecond++;
        expect(getTrait(offer.candidates[1]).element).toBe('earth');
      }
      for (const id of offer.candidates) expect(b.owned).not.toContain(id);
      expect(new Set(offer.candidates).size).toBe(offer.candidates.length);
    }
    expect(seenSecond).toBeGreaterThan(0);
  });
});
