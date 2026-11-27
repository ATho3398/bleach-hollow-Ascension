// C.533 혈·독 블록 = 계열 없는 1종 (GDD 8-2 v6.161, 사용자 2026-11-23 "혈, 독, 허 기본 블록(이건 참권귀로 안나누고 블록 특성은 1개만)" · "혈독허는 흡수해야만 나오는거라고" — C.531 허무 블록과 같은 처리, 마스터AT 2026-11-24)
// ① 데이터: t-blood·t-poison 하나씩, 옛 조·탄·교 id 는 지금 블록으로 읽힌다 ② 흡수: 그 속성 적 = 그 블록 후보 1개, 가진 뒤엔 강화만 · 진화 조건이 세는 흡수 수
// ③ 전투: 같은 블록끼리 체인(공용 체인 배율)·흡혈·독 지속 피해 그대로 ④ 진화: 타입 판정에 안 섞임 · 혈·독 진화체 능력 데이터 그대로 ⑤ 세이브 형식 98 (97 → 98)
import { describe, expect, it } from 'vitest';
import { useImmediateHits } from './helpers/hitDelay';
import { BALANCE } from '../src/config/balance';
import { ELEMENTS } from '../src/data/elements';
import { getEnemy } from '../src/data/enemies';
import { validateEvoUniques } from '../src/data/evolution/uniques';
import { getFaction } from '../src/data/factions';
import { TRAITS, getTrait, mergedTraitId, traitName, traitNameWithElement } from '../src/data/traits';
import { buildCombatParams, buildOffer, gainTrait, newBuild } from '../src/engine/absorb';
import { applyInput, chainGroup, createCombat, drainCombatEvents, scriptSpawnBlock, type CombatEvent, type CombatParams, type CombatState } from '../src/engine/combat';
import { dominantCategory, tier4Normal } from '../src/engine/evolution/judge';
import { newEvolution } from '../src/engine/evolution';
import { chooseAbsorb, createExpedition, serializeExpedition } from '../src/engine/expedition';
import { createRng } from '../src/engine/rng';
import { migrateMergedBlocks, migrateSave, newSaveData, sanitizeDeck, SAVE_FORMAT_VERSION, SAVE_MIGRATIONS, MIN_LOADABLE_SAVE_FORMAT } from '../src/game';
import { traitBlockName } from '../src/ui/buildPanel';
useImmediateHits();

const CX = BALANCE.provisional.combat;
const EL = BALANCE.provisional.elements;
const WON = { status: 'won', finisher: null, chain3Count: 0, weakChain3Count: 0 } as const;
const STILL: Partial<CombatParams> = { critChance: 0, blockCritChance: 0, enemyCritChance: 0, enemyDamageVariance: 0, voidChance: 0 };
const SPECIAL = [['blood', '혈'], ['poison', '독']] as const;
const foe = (element: string) => ({ ...getEnemy('test-e'), element });
const skillsOf = (...ids: string[]) => {
  const b = newBuild();
  for (const id of ids) gainTrait(b, id);
  return buildCombatParams(b);
};
const quiet = (s: CombatState): CombatState => {
  s.spawnTimer = 1e9;
  s.player.attackTimer = 1e9;
  s.enemy.attackTimer = 1e9;
  s.enemy.actionTimer = 1e9;
  return s;
};

describe('① 데이터: 혈 블록·독 블록 = 계열 없는 1종', () => {
  it('t-blood·t-poison 하나씩 — 계열 없음·공격·위력은 다른 블록과 같다, 옛 조·탄·교 id 는 없고 지금 블록으로 읽힌다', () => {
    for (const [el, name] of SPECIAL) {
      expect(TRAITS.filter((t) => t.element === el && t.kind === 'skill' && !t.boss).map((t) => t.id)).toEqual([`t-${el}`]);
      const t = getTrait(`t-${el}`);
      expect([t.role, t.family, t.foeHpBands, t.provisional]).toEqual(['attack', undefined, undefined, true]);
      expect(t.powerInAttacks).toBe(getTrait('t-fire-a').powerInAttacks);
      for (const old of ['a', 'b', 'c'].map((x) => `t-${el}-${x}`)) {
        expect(TRAITS.some((x) => x.id === old)).toBe(false);
        expect(mergedTraitId(old)).toBe(`t-${el}`);
        expect(getTrait(old).id).toBe(`t-${el}`);
      }
      expect(mergedTraitId(`t-${el}-passive`)).toBeNull();
      expect(traitName(`t-${el}`, 'hollow')).toBe(`${name} 블록`);
      expect(traitNameWithElement(`t-${el}`, 'shinigami')).toBe(`${name} 블록`);
      expect(traitBlockName(getFaction('hollow'), `t-${el}`, 2)).toBe(`${name} 블록`);
    }
  });
  it('특수 속성 3종(혈·독·허무)만 계열 없는 1종 — 노멀·원소는 세 계열 그대로', () => {
    for (const e of ELEMENTS) {
      const attacks = TRAITS.filter((t) => t.element === e.id && t.kind === 'skill' && t.role === 'attack' && !t.boss);
      if (e.kind === 'special') expect(attacks.map((t) => t.family), e.id).toEqual([undefined]);
      else expect(new Set(attacks.map((t) => t.family)), e.id).toEqual(new Set(['family-a', 'family-b', 'family-c']));
    }
  });
});

describe('② 흡수: 그 속성 적을 잡으면 그 블록 1개가 후보 · 가진 뒤에는 강화만', () => {
  it('혈·독 적 후보 = 그 속성 블록 하나, 여러 번 흡수해도 블록은 하나·강화와 그 단계 흡수 수(진화 조건)가 오른다', () => {
    for (const [el] of SPECIAL) {
      const id = `t-${el}`;
      for (let seed = 1; seed <= 10; seed++) expect(buildOffer(createRng(seed), foe(el), newBuild(), WON).candidates, `${el}/${seed}`).toEqual([id]);
      const s = newSaveData('hollow', 1000);
      const exp = createExpedition({ factionId: 'hollow', seed: 5, hunger: 60, condition: 80, deck: sanitizeDeck(s.tiles, 'hollow'), build: s.build, evolution: s.evolution });
      for (let i = 1; i <= 3; i++) {
        exp.absorbOffer = buildOffer(createRng(i), foe(el), exp.build, WON);
        exp.phase = 'absorb';
        expect(exp.absorbOffer.candidates).toEqual([id]);
        expect(chooseAbsorb(exp, id, undefined, i === 2 ? 'trait' : 'both').ok).toBe(true);
      }
      exp.absorbOffer = buildOffer(createRng(9), foe(el), exp.build, WON);
      exp.phase = 'absorb';
      expect(chooseAbsorb(exp, null, undefined, 'stat').ok).toBe(true); // 능력치만 = 블록 흡수로 안 셈
      expect(exp.build.owned.filter((x) => x === id)).toHaveLength(1);
      expect(exp.build.enhance?.[el]).toBe(3);
      expect(exp.evolution.elementAbsorbs[el]).toBe(3);
    }
  });
});

describe('③ 전투: 같은 블록끼리 체인 · 속성 효과 그대로', () => {
  const blockEvent = (s: CombatState) => drainCombatEvents(s).find((e): e is Extract<CombatEvent, { kind: 'block' }> => e.kind === 'block')!;
  /** 그 블록 1개만 썼을 때 피해 (체인 배율 비교 기준) */
  const single = (id: string): number => {
    const s = quiet(createCombat(3, { enemy: getEnemy('test-e'), params: { ...STILL, ...skillsOf(id) } }));
    expect(scriptSpawnBlock(s, id, null)).toBe(true);
    applyInput(s, { type: 'use', cell: 0 });
    return blockEvent(s).damage;
  };
  it('혈 블록 3개 = 3체인(공용 체인 배율), 다른 블록과는 안 묶인다 · 흡혈', () => {
    const s = quiet(createCombat(3, { enemy: getEnemy('test-e'), params: { ...STILL, ...skillsOf('t-blood', 't-fire-a') } }));
    s.player.hp = 1;
    for (let i = 0; i < 3; i++) expect(scriptSpawnBlock(s, 't-blood', null)).toBe(true);
    expect(scriptSpawnBlock(s, 't-fire-a', 'family-a')).toBe(true);
    expect(s.tray.map((b) => [b.traitId, b.element, b.family ?? null])).toEqual([['t-blood', 'blood', null], ['t-blood', 'blood', null], ['t-blood', 'blood', null], ['t-fire-a', 'fire', 'family-a']]);
    expect(chainGroup(s.tray, 1, 3)).toEqual([0, 1, 2]);
    expect(chainGroup(s.tray, 3, 3)).toEqual([3]);
    expect(applyInput(s, { type: 'use', cell: 0 })).toBe(true);
    const ev = blockEvent(s);
    expect([ev.traitId, ev.element, ev.chain, ev.family]).toEqual(['t-blood', 'blood', 3, null]);
    expect(s.params.chainMultipliers).toEqual(CX.chainMultipliers);
    expect(ev.damage).toBeCloseTo(single('t-blood') * CX.chainMultipliers[2]!); // 단계 배율 = 공용 체인 배율 (계열 단계 기술 없음)
    expect(s.player.hp).toBeGreaterThan(1); // 혈 = 준 피해 일부 흡혈
    expect(s.tray.map((b) => b.traitId)).toEqual(['t-fire-a']);
  });
  it('독 블록 2개 = 2체인 · 독 지속 피해가 걸린다(진화 조건이 세는 독 속성 표시 포함)', () => {
    const s = quiet(createCombat(3, { enemy: getEnemy('test-e'), params: { ...STILL, ...skillsOf('t-poison') } }));
    for (let i = 0; i < 2; i++) expect(scriptSpawnBlock(s, 't-poison', null)).toBe(true);
    const before = s.enemy.hp;
    expect(applyInput(s, { type: 'use', cell: 1 })).toBe(true);
    const ev = blockEvent(s);
    expect([ev.traitId, ev.element, ev.chain]).toEqual(['t-poison', 'poison', 2]);
    const dealt = before - s.enemy.hp;
    expect(dealt).toBeCloseTo(single('t-poison') * CX.chainMultipliers[1]!);
    expect(s.enemy.dot?.element).toBe('poison');
    expect(s.enemy.dot!.ticks * s.enemy.dot!.perTick).toBeCloseTo(dealt * EL.poisonFraction);
  });
});

describe('④ 진화: 타입 판정에 안 섞임 · 혈·독 진화체 쪽은 그대로', () => {
  it('혈·독 블록은 계열이 없어 장착 최다 타입에 안 들어간다 — 4단계 타입은 다른 블록의 계열로', () => {
    const b = newBuild();
    for (let i = 0; i < 4; i++) b.slots.push(null);
    for (const id of ['t-blood', 't-poison', 't-fire-c']) gainTrait(b, id);
    expect(dominantCategory(b, 'hollow')).toBe('special');
    const e = { ...newEvolution(5), tierIndex: 2, formId: 't3:fire', formHistory: ['t2:base', 't3:fire'] };
    expect(tier4Normal(e, { factionId: 'hollow', build: b, hunger: 10, condition: 90 }).id).toBe('t4:fire:special');
    // 혈 블록 10개 흡수 + 빈사로 귀환 (C.532) — 1종 블록 기준 그대로
    expect(tier4Normal({ ...e, elementAbsorbs: { blood: 10 }, collapsedReturns: 1 }, { factionId: 'hollow', build: b, hunger: 10, condition: 90 }).id).toBe('t4:blood:physical');
  });
  it('진화체 고유 능력 데이터는 손대지 않았다 (혈·독 진화체의 고정 혈 블록·독 예고 등 — 속성으로 블록을 본다)', () => {
    expect(validateEvoUniques()).toEqual([]);
  });
});

describe('⑤ 세이브 형식 98 (97 → 98) — 옛 세이브를 이어 쓴다', () => {
  it('형식 98 · 97 → 98 변환 있음 · 문턱 87 그대로', () => {
    expect(SAVE_FORMAT_VERSION).toBe(99);
    expect(typeof SAVE_MIGRATIONS[97]).toBe('function');
    expect(MIN_LOADABLE_SAVE_FORMAT).toBe(87);
  });
  it('형식 97 세이브: 옛 혈·독 조·탄·교 → 혈 블록·독 블록 하나씩(앞 칸에 남김, 뒤 칸은 비움), 강화 횟수·다른 블록 그대로', () => {
    const s = newSaveData('hollow', 1000);
    s.build.owned = ['t-blood-a', 't-fire-a', 't-blood-c', 't-poison-b', 't-poison-a'];
    s.build.slots = ['t-blood-c', 't-fire-a', 't-blood-a', 't-poison-b'];
    s.build.equipOrder = ['t-blood-c', 't-fire-a', 't-blood-a', 't-poison-b'];
    s.build.enhance = { blood: 6, poison: 2, fire: 1 };
    s.meta.format = 97;
    const m = migrateSave(JSON.parse(JSON.stringify(s)))!;
    expect(m).not.toBeNull();
    expect(m.meta.format).toBe(99);
    expect(m.build.owned).toEqual(['t-blood', 't-fire-a', 't-poison']);
    expect(m.build.slots.slice(0, 4)).toEqual(['t-blood', 't-fire-a', null, 't-poison']);
    expect(m.build.equipOrder).toEqual(['t-fire-a', 't-blood', 't-poison']);
    expect(m.build.enhance).toEqual({ blood: 6, poison: 2, fire: 1 });
    // 이어서 같은 블록을 또 얻지 않는다 — 흡수하면 강화만
    expect(buildOffer(createRng(1), foe('blood'), m.build, WON).candidates).toEqual(['t-blood']);
  });
  it('형식 96 세이브도 두 단계를 거쳐 이어 쓴다 (96 → 97 빈사 귀환 수 · 97 → 98 블록 합침)', () => {
    const s = newSaveData('hollow', 1000);
    s.build.owned = ['t-poison-c'];
    s.build.slots = ['t-poison-c', null, null];
    s.build.equipOrder = ['t-poison-c'];
    s.meta.format = 96;
    const m = migrateSave(JSON.parse(JSON.stringify(s)))!;
    expect(m.meta.format).toBe(99);
    expect(m.build.owned).toEqual(['t-poison']);
    expect(m.build.slots[0]).toBe('t-poison');
  });
  it('원정 중간 저장: 빌드·얻은 블록·흡수 후보의 옛 id 도 지금 블록으로', () => {
    const s = newSaveData('hollow', 1000);
    const e = createExpedition({ factionId: 'hollow', seed: 3, hunger: 60, condition: 80, deck: sanitizeDeck(s.tiles, 'hollow'), build: s.build, evolution: s.evolution });
    e.absorbOffer = buildOffer(createRng(1), foe('blood'), e.build, WON);
    e.phase = 'absorb';
    s.activeExpedition = JSON.parse(JSON.stringify(serializeExpedition(e, 1, 1000)));
    const raw = JSON.parse(JSON.stringify(s));
    raw.activeExpedition.exp.absorbOffer.candidates = ['t-blood-a', 't-blood-c'];
    raw.activeExpedition.exp.build.owned = ['t-poison-a'];
    raw.activeExpedition.exp.build.slots = ['t-poison-a'];
    raw.activeExpedition.exp.acquiredTraits = [{ traitId: 't-poison-a', lap: 1 }];
    migrateMergedBlocks(raw);
    expect(raw.activeExpedition.exp.absorbOffer.candidates).toEqual(['t-blood']);
    expect(raw.activeExpedition.exp.build.owned).toEqual(['t-poison']);
    expect(raw.activeExpedition.exp.build.slots[0]).toBe('t-poison');
    expect(raw.activeExpedition.exp.acquiredTraits).toEqual([{ traitId: 't-poison', lap: 1 }]);
  });
});
