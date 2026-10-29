// C.184 (GDD 111장 1~3): 노멀 = 기본 블록 하나 — 노멀 skill 특성(노멀 조·탄·교·희귀)은 늘 '가진 블록', 슬롯·보유에 들지 않는다
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TRAITS } from '../src/data/traits';
import { NORMAL_ELEMENT } from '../src/data/elements';
import { addEnhance, basicAttackMultiplier, buildCombatParams, dropBasicBlockTraits, enhanceLevel, gainTrait, isBasicBlockTrait, newBuild, ownsTraitBlock } from '../src/engine/absorb';
import { BALANCE } from '../src/config/balance';
import { advance, chooseAbsorb, createExpedition, finishBattle, startBattle, type ExpeditionState } from '../src/engine/expedition';
import { dominantElement, evolutionCandidates, judgeElementCounts, vastoNormalElement } from '../src/engine/evolution/judge';
import { newEvolution } from '../src/engine/evolution';
import { fillDefaultTraits, newTestSave, setTraitSlots } from '../src/engine/testMode';
import { MIN_LOADABLE_SAVE_FORMAT, SAVE_FORMAT_VERSION, migrateSave, newSaveData } from '../src/game';

const read = (p: string) => readFileSync(p, 'utf8');
const NORMAL_SKILLS = TRAITS.filter((t) => t.kind === 'skill' && t.element === NORMAL_ELEMENT).map((t) => t.id);

function toAbsorb(exp: ExpeditionState, element: string): void {
  exp.wildCells = [exp.pos + 1];
  advance(exp);
  Object.assign(exp.pending!.enemy, { element, rare: false });
  const b = startBattle(exp);
  b.enemy.hp = 0;
  b.status = 'won';
  b.finisher = { kind: 'basic-attack', traitId: null, element: null };
  finishBattle(exp, b);
}

describe('111장 1: 노멀 skill 특성 = 기본 블록', () => {
  it('노멀 조·탄·교·희귀는 늘 가진 블록, 노멀 패시브·부위와 다른 속성은 아니다', () => {
    expect(NORMAL_SKILLS.sort()).toEqual(['t-normal-a', 't-normal-b', 't-normal-c', 't-normal-rare']);
    const b = newBuild();
    for (const id of NORMAL_SKILLS) {
      expect(isBasicBlockTrait(id)).toBe(true);
      expect(ownsTraitBlock(b, id)).toBe(true);
      expect(gainTrait(b, id).ok).toBe(false);
    }
    expect(isBasicBlockTrait('t-normal-passive')).toBe(false);
    expect(isBasicBlockTrait('t-water-a')).toBe(false);
    expect(isBasicBlockTrait('없는-특성')).toBe(false);
    expect(ownsTraitBlock(b, 't-water-a')).toBe(false);
    expect(b.owned).toEqual([]);
    expect(b.slots.every((x) => x === null)).toBe(true);
  });

  it('노멀 후보를 고르면 보유·슬롯 그대로 + 노멀 강화 +1 만 (슬롯이 가득이어도 교체 없음)', () => {
    for (const full of [false, true]) {
      const s = newSaveData('hollow', 1);
      const exp = createExpedition({ factionId: 'hollow', seed: 5, hunger: 30, condition: 80, deck: [], build: s.build, evolution: s.evolution });
      if (full) for (const id of ['t-water-a', 't-fire-a', 't-earth-a']) gainTrait(exp.build, id);
      toAbsorb(exp, NORMAL_ELEMENT);
      expect(exp.phase).toBe('absorb');
      exp.absorbOffer!.candidates = ['t-normal-b'];
      const owned = [...exp.build.owned];
      const slots = [...exp.build.slots];
      const lv = enhanceLevel(exp.build, NORMAL_ELEMENT);
      expect(chooseAbsorb(exp, 't-normal-b', undefined, 'both').ok).toBe(true);
      expect(exp.build.owned).toEqual(owned);
      expect(exp.build.slots).toEqual(slots);
      expect(enhanceLevel(exp.build, NORMAL_ELEMENT)).toBe(lv + 1);
      expect(exp.acquiredTraits).toEqual([]);
    }
  });

  it("포식 화면: 후보 카드·교체 판단이 같은 헬퍼 — 노멀 후보는 'n강 → n+1강'", () => {
    const src = read('src/ui/absorbView.ts');
    expect(src).toContain('const have = ownsTraitBlock(exp.build, id);');
    expect(src).toContain("chip(have ? step : '새 블록')");
    expect(src).toContain('if (isFull(exp.build) && !ownsTraitBlock(exp.build, id))');
    expect(src).not.toContain('exp.build.owned.includes(id)');
    expect(read('src/engine/expedition/expedition.ts')).toContain('if (!ownsTraitBlock(exp.build, traitId)) {');
  });

  it('테스트 모드: 노멀 몸 기본 특성 채우기는 비워 두고, 특성 고르기에서 노멀 skill 특성은 빈칸', () => {
    const save = newTestSave('hollow', 1);
    expect(save.build.slots.every((x) => x === null)).toBe(true);
    expect(fillDefaultTraits(save)).toBe(0);
    expect(setTraitSlots(save, ['t-normal-a', 't-water-a', 't-normal-rare'])).toEqual([null, 't-water-a', null]);
    expect(save.build.owned.some(isBasicBlockTrait)).toBe(false);
    expect(read('src/ui/testModePanel.ts')).toContain('TRAITS.filter((t) => !isBasicBlockTrait(t.id))');
  });

  it('진화 판정: 노멀만 흡수해 슬롯이 비어도(노멀 강화 1↑) 실패형 강제가 아니다', () => {
    const e = newEvolution(1);
    e.tierIndex = 2;
    const b = newBuild();
    expect(evolutionCandidates(e, { factionId: 'hollow', build: b, hunger: 20, condition: 80 }).forced).not.toBeNull();
    b.enhance = { [NORMAL_ELEMENT]: 1 };
    expect(evolutionCandidates(e, { factionId: 'hollow', build: b, hunger: 20, condition: 80 }).forced).toBeNull();
  });
});

describe('111장 3: 빈 칸 몫', () => {
  it('노멀 강화 1↑이면 빈 본체 칸마다 기본 공격 블록 +basicPerEmptySlot (노멀 강화 0 이면 없음)', () => {
    const EH = BALANCE.provisional.absorb.enhance;
    const b = newBuild();
    expect(buildCombatParams(b, 'hollow').basicAttackEnhance).toBe(1);
    addEnhance(b, NORMAL_ELEMENT);
    expect(basicAttackMultiplier(b)).toBeCloseTo((1 + EH.earlyPerLevel) * (1 + EH.basicPerEmptySlot * 3));
    gainTrait(b, 't-water-a');
    expect(buildCombatParams(b, 'hollow').basicAttackEnhance).toBeCloseTo((1 + EH.earlyPerLevel) * (1 + EH.basicPerEmptySlot * 2));
    expect(read('src/ui/absorbView.ts')).toContain('basicAttackMultiplier({ enhance: { [elId]: n }, slots: exp.build.slots })');
  });
});

describe('111장 후속 결정 ②: 바스트로데 속성 — 노멀 강화 1↑이면 빈 본체 칸 하나 = 노멀 1개', () => {
  it('빈 칸은 노멀 강화가 있을 때만 노멀로 세고, 동률이면 장착한 특성이 이긴다', () => {
    const b = newBuild();
    gainTrait(b, 't-fire-a');
    expect(judgeElementCounts(b)).toEqual({ fire: 1 });
    expect(dominantElement(b)).toBe('fire');
    addEnhance(b, NORMAL_ELEMENT);
    expect(judgeElementCounts(b)).toEqual({ fire: 1, normal: 2 });
    expect(dominantElement(b)).toBe('normal');
    expect(vastoNormalElement(b)).toBe('normal');
    gainTrait(b, 't-water-a');
    expect(judgeElementCounts(b)).toEqual({ fire: 1, water: 1, normal: 1 });
    expect(dominantElement(b)).toBe('water'); // 동률: 가장 최근 장착
    gainTrait(b, 't-water-b');
    expect(dominantElement(b)).toBe('water');
    expect(b.slots.includes(null)).toBe(false);
  });
  it('노멀 강화 + 칸 1개만 장착한 몸은 바스트로데_노멀 (칸을 일부러 비우지 않아도)', () => {
    const e = newEvolution(1);
    e.tierIndex = 2;
    const b = newBuild();
    b.enhance = { [NORMAL_ELEMENT]: 2 };
    gainTrait(b, 't-earth-a');
    expect(evolutionCandidates(e, { factionId: 'hollow', build: b, hunger: 20, condition: 80 }).normal.id).toBe('t4:normal');
  });
});

describe('111장 2: 옛 노멀 특성 정리 (마이그레이션 없음)', () => {
  it('형식·문턱 51 같이 올림', () => {
    expect([SAVE_FORMAT_VERSION, MIN_LOADABLE_SAVE_FORMAT]).toEqual([54, 54]); // C.195 // C.188
  });
  it('불러올 때 보유·슬롯·장착 순서의 노멀 skill 특성을 지운다(다른 특성·노멀 패시브·강화는 그대로)', () => {
    const s = newSaveData('hollow');
    s.build.owned = ['t-normal-a', 't-water-a', 't-normal-passive', 't-normal-rare'];
    s.build.slots = ['t-normal-a', 't-water-a', 't-normal-rare'];
    s.build.equipOrder = ['t-normal-a', 't-water-a', 't-normal-rare'];
    s.build.enhance = { normal: 4 };
    const m = migrateSave(JSON.parse(JSON.stringify(s)))!;
    expect(m.build.owned).toEqual(['t-water-a', 't-normal-passive']);
    expect(m.build.slots).toEqual([null, 't-water-a', null]);
    expect(m.build.equipOrder).toEqual(['t-water-a']);
    expect(m.build.enhance).toEqual({ normal: 4 });
  });
  it('dropBasicBlockTraits: 알 수 없는 id 는 건드리지 않는다(검증이 따로 거른다)', () => {
    const b = newBuild();
    b.owned = ['nope', 't-normal-c'];
    b.slots = ['nope', 't-normal-c', null];
    dropBasicBlockTraits(b);
    expect(b.owned).toEqual(['nope']);
    expect(b.slots).toEqual(['nope', null, null]);
  });
});
