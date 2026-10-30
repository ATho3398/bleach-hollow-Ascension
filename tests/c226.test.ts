// C.226 (GDD 149장): 4단계 진화 = 3단계 특성이 사라지고 같은 칸에 4단계 특성(루트 무관) · 히든 통로 '변이의 기운' · 망한 진화체 '허우적' ·
// 망한 진화체 특성은 진화해도 남음·각성형이면 각성 특성(151장) · 특성 칸 +1 = 4단계 진화 · 그 루트 4단계 특성을 가졌으면 3·4단계 특성 안 받음 · 진화 화면 'A → B' · 세이브 형식 59 → 60 마이그레이션
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { getForm } from '../src/data/evolution';
import { FACTIONS } from '../src/data/factions';
import {
  abilityEffectsOf, abilityIdLine, addEv, equippedAbilitiesOf, evGainMultOf, gainEvolutionAbility, newAbilityLoadout, newEvolution, type AbilityLoadout,
} from '../src/engine/evolution';
import { migrateSave, MIN_LOADABLE_SAVE_FORMAT, newSaveData, SAVE_FORMAT_VERSION, SAVE_MIGRATIONS } from '../src/game';
import { abilityGainRow, gainExtra } from '../src/ui/evolutionPanel';

const f = getForm;
const loadout = (slots = 1): AbilityLoadout => ({ ...newAbilityLoadout(), slots });
const U = BALANCE.provisional.abilities.unique;

describe('4단계 진화 = 3단계 특성 → 4단계 특성 (GDD 149장 1)', () => {
  it('같은 루트: 물 3단계 특성이 사라지고 같은 칸에 물 4단계 특성(다른 이름·세기 ×1.5)', () => {
    const l = loadout(1);
    expect(gainEvolutionAbility(l, f('t3:water'))).toEqual({ kind: 'new', id: 'el:water' });
    expect(l.pending).toBe('el:water');
    expect(gainEvolutionAbility(l, f('t4:water:special'))).toEqual({ kind: 'replaced', id: 'el4:water', from: 'el:water' });
    expect(l.owned).toEqual({ 'el4:water': 1.5 });
    expect(l.equipped).toEqual(['el4:water']);
    expect(l.pending).toBeUndefined();
    const n3 = abilityIdLine('el:water', 1, 'hollow')!.name;
    const n4 = abilityIdLine('el4:water', 1.5, 'hollow')!.name;
    expect(n4).not.toBe(n3);
    expect(n4.endsWith('+')).toBe(false);
  });
  it('다른 루트도 교체 · 칸이 꽉 차도 된다 · 융합도', () => {
    const l = loadout(1);
    gainEvolutionAbility(l, f('t3:fire'));
    expect(gainEvolutionAbility(l, f('t4:blood:physical'))).toEqual({ kind: 'replaced', id: 'el4:blood', from: 'el:fire' });
    expect(Object.keys(l.owned)).toEqual(['el4:blood']);
    const l2 = loadout(1);
    gainEvolutionAbility(l2, f('t3:water'));
    expect(gainEvolutionAbility(l2, f('h4:fusion:water+earth'))).toEqual({ kind: 'replaced', id: 'el4:water+earth', from: 'el:water' });
  });
  it('얻은 순서 자리 그대로 바뀐다', () => {
    const l = loadout(3);
    l.owned = { 'el4:fire': 1.5 };
    gainEvolutionAbility(l, f('t3:water'));
    gainEvolutionAbility(l, f('t4:water:mixed'));
    expect(l.equipped).toEqual(['el4:fire', 'el4:water']);
  });
  it('진화 화면 달라진 점: "3단계 이름 → 4단계 이름" (두 종족, 이름은 데이터에서)', () => {
    for (const fac of FACTIONS) {
      const row = abilityGainRow({ kind: 'replaced', id: 'el4:water', from: 'el:water' }, 1.5, fac.id)!;
      expect(row.value).toContain(`${abilityIdLine('el:water', 1, fac.id)!.name} → ${abilityIdLine('el4:water', 1.5, fac.id)!.name}`);
    }
  });
});

describe('히든 통로·망한 진화체 특성 (GDD 149장 2·3 → 151장, provisional)', () => {
  it("히든 통로 = '변이의 기운'(주는 피해 +5% · 받는 피해 −5%) → 4단계 히든 특성으로 바뀐다", () => {
    const l = loadout(1);
    expect(gainEvolutionAbility(l, f('h3:passage'))).toEqual({ kind: 'new', id: 'uniq:passage' });
    expect(abilityIdLine('uniq:passage', 1, 'hollow')!.name).toBe('변이의 기운');
    const fx = abilityEffectsOf(equippedAbilitiesOf(null, l)).effects;
    expect(fx.mutation).toEqual({ dealt: U.passage!.dealtBonus, taken: U.passage!.takenReduction });
    expect(abilityIdLine('uniq:passage', 1, 'hollow')!.description).toBe('주는 피해 +5% · 받는 피해 −5%');
    expect(gainEvolutionAbility(l, f('h4:complete'))).toEqual({ kind: 'replaced', id: 'uniq:complete', from: 'uniq:passage' });
    expect(Object.keys(l.owned)).toEqual(['uniq:complete']);
  });
  it("망한 진화체 = '허우적'(노력치 ×1/4) — 실패형으로 가도 남고 실패형은 4단계 특성 없음 (151장 1·4)", () => {
    const e = newEvolution(1);
    const l = (e.abilities = loadout(1));
    expect(gainEvolutionAbility(l, f('h3:fail'))).toEqual({ kind: 'new', id: 'uniq:fail' });
    expect(l.pending).toBeUndefined(); // 4단계 때 바뀌지 않는다
    expect(abilityIdLine('uniq:fail', 1, 'hollow')!.name).toBe('허우적');
    expect(evGainMultOf(l)).toBe(0.25);
    expect(addEv(e, { atk: 4 })).toEqual({ atk: 1 });
    expect(gainEvolutionAbility(l, f('h4:fail'))).toEqual({ kind: 'none' });
    expect(Object.keys(l.owned)).toEqual(['uniq:fail']);
    expect(evGainMultOf(l)).toBe(0.25);
  });
  it('망한 진화체에서 다른 4단계로 가면 허우적은 남고 4단계 특성은 다른 칸(4단계 칸 +1)', () => {
    const l = loadout(1);
    gainEvolutionAbility(l, f('h3:fail'));
    expect(gainEvolutionAbility(l, f('t4:water:mixed'))).toEqual({ kind: 'new', id: 'el4:water' });
    expect(l.slots).toBe(2);
    expect(l.equipped).toEqual(['uniq:fail', 'el4:water']);
    expect(evGainMultOf(l)).toBe(0.25);
  });
  it('각성형으로 진화하면 허우적이 사라지고 그 자리에 각성 특성 (151장 3, 환생 뒤 다른 3단계여도)', () => {
    const l = loadout(1);
    gainEvolutionAbility(l, f('h3:fail'));
    expect(gainEvolutionAbility(l, f('h4:awakened'))).toEqual({ kind: 'replaced', id: 'uniq:awakened', from: 'uniq:fail' });
    expect(Object.keys(l.owned)).toEqual(['uniq:awakened']);
    expect(evGainMultOf(l)).toBe(1);
    const l2: AbilityLoadout = { owned: { 'uniq:fail': 1, 'el4:fire': 1.5 }, equipped: [], slots: 3, tier4Ever: true };
    gainEvolutionAbility(l2, f('t3:water'));
    const g = gainEvolutionAbility(l2, f('h4:awakened'));
    expect(g).toEqual({ kind: 'replaced', id: 'uniq:awakened', from: 'uniq:fail', gone: ['el:water'] });
    expect(Object.keys(l2.owned)).toEqual(['uniq:awakened', 'el4:fire']);
    expect(abilityGainRow(g, 1, 'hollow')!.value).toContain('사라짐 · 바뀜 · 허우적 → ');
  });
  it('특성 칸 +1 = 4단계 진화 때 처음 한 번 (151장 2) · 진화 결과 행', () => {
    const l = loadout(1);
    gainEvolutionAbility(l, f('t3:water'));
    gainEvolutionAbility(l, f('t4:water:mixed'));
    expect([l.slots, l.tier4Ever]).toEqual([2, true]);
    const l2 = { ...loadout(2), tier4Ever: true };
    gainEvolutionAbility(l2, f('t4:fire:mixed'));
    expect(l2.slots).toBe(2);
    const e = newEvolution(1);
    e.abilities = loadout(2);
    expect(gainExtra(e, { kind: 'none' }, 1)).toMatchObject({ abilitySlotsAdded: 1, abilitySlots: 2 }); // 진화 결과 '특성 칸 1 → 2칸'
    expect(gainExtra(e, { kind: 'none' })).not.toHaveProperty('abilitySlotsAdded');
  });
});

describe('같은 특성 두 번 없음 (GDD 149장 5)', () => {
  it('그 루트의 4단계 특성을 가졌으면 이번 생 3·4단계 특성을 안 받는다(빈 칸 그대로)', () => {
    const l = loadout(2);
    l.owned = { 'el4:water': 1.5 };
    l.equipped = ['el4:water'];
    expect(gainEvolutionAbility(l, f('t3:water'))).toEqual({ kind: 'owned', id: 'el4:water' });
    expect(gainEvolutionAbility(l, f('t4:water:physical'))).toEqual({ kind: 'owned', id: 'el4:water' });
    expect(l.equipped).toEqual(['el4:water']);
    const l2 = loadout(2);
    l2.owned = { 'uniq:fail': 1 };
    expect(gainEvolutionAbility(l2, f('h3:fail'))).toEqual({ kind: 'owned', id: 'uniq:fail' }); // 허우적은 하나만
  });
  it('다른 3단계에서 이미 가진 4단계로 가면 3단계 특성만 사라진다', () => {
    const l = loadout(2);
    l.owned = { 'el4:water': 1.5 };
    gainEvolutionAbility(l, f('t3:fire'));
    const g = gainEvolutionAbility(l, f('t4:water:mixed'));
    expect(g).toEqual({ kind: 'owned', id: 'el4:water', gone: ['el:fire'] });
    expect(Object.keys(l.owned)).toEqual(['el4:water']);
    expect(abilityGainRow(g, 1.5, 'hollow')!.value).toContain('사라짐');
  });
});

describe('세이브 형식 59 → 60 (GDD 149장 7, 123장 6)', () => {
  it('형식 60 · 문턱 54 고정 · 단계 표에 59', () => {
    expect(SAVE_FORMAT_VERSION).toBe(60);
    expect(MIN_LOADABLE_SAVE_FORMAT).toBe(54);
    expect(typeof SAVE_MIGRATIONS[59]).toBe('function');
  });
  const old59 = (history: string[], abilities: Record<string, unknown>) => {
    const s = JSON.parse(JSON.stringify(newSaveData('hollow', 1000))) as Record<string, any>;
    s.meta.format = 59;
    Object.assign(s.evolution, { tierIndex: history.length, formHistory: history, formId: history[history.length - 1] ?? null });
    s.evolution.abilities = { equipped: Object.keys(abilities.owned as object), slots: 1, ascendedEver: false, ...abilities };
    return s;
  };
  it("'+' 강화 특성 → 그 4단계 특성(el4) · enhanced 필드 없어짐", () => {
    const m = migrateSave(old59(['t2:base', 't3:water', 't4:water:physical'], { owned: { 'el:water': 1.5 }, enhanced: ['el:water'] }))!;
    expect(m.meta.format).toBe(SAVE_FORMAT_VERSION);
    expect(m.evolution.abilities!.owned).toEqual({ 'el4:water': 1.5 });
    expect(m.evolution.abilities!.equipped).toEqual(['el4:water']);
    expect('enhanced' in m.evolution.abilities!).toBe(false);
  });
  it('전생에서 강화된 특성도 el4 로 · 지금 생 3단계 몫은 pending · 쉬는 트랙도', () => {
    const old = old59(['t2:base', 't3:fire'], { owned: { 'el:water': 1.5, 'el:fire': 1 }, enhanced: ['el:water'], slots: 2 });
    old.rebirth.count = 1; // 전생 4단계 → 칸 = 1 + 4단계 1 + 환생 1
    old.otherTracks = [old59(['t2:base', 't3:fire', 't4:blood:physical'], { owned: { 'el:fire': 1, 'el:blood': 1.5 }, slots: 2 })];
    old.otherTracks[0].factionId = 'shinigami';
    const m = migrateSave(old)!;
    expect(m.evolution.abilities!.owned).toEqual({ 'el4:water': 1.5, 'el:fire': 1 });
    expect(m.evolution.abilities!.pending).toBe('el:fire');
    expect(m.otherTracks![0]!.evolution.abilities!.owned).toEqual({ 'el4:blood': 1.5 }); // 다른 루트: 불 3단계 특성 → 혈 4단계 특성
  });
  it('특성 칸: 아란칼화 +1 → 4단계 진화 +1 (151장 2) — 4단계면 바로 받고, 3단계면 아란칼화 칸이 없다', () => {
    const at4 = old59(['t2:base', 't3:water', 't4:water:mixed'], { owned: { 'el:water': 1.5 }, enhanced: ['el:water'], ascendedEver: false });
    const m4 = migrateSave(at4)!;
    expect([m4.evolution.abilities!.slots, m4.evolution.abilities!.tier4Ever]).toEqual([2, true]);
    expect('ascendedEver' in m4.evolution.abilities!).toBe(false);
    const at3 = old59(['t2:base', 't3:water'], { owned: { 'el:water': 1 }, ascendedEver: true, slots: 2 });
    expect(migrateSave(at3)!.evolution.abilities!.slots).toBe(1);
  });
  it('지금 생 히든 통로·망한 진화체 특성을 새 규칙으로 받는다', () => {
    const m = migrateSave(old59(['t2:base', 'h3:fail'], { owned: {} }))!;
    expect(m.evolution.abilities!.owned).toEqual({ 'uniq:fail': 1 });
  });
});
