// C.97 함께 넣은 GDD 45장 1번(치명 상한 50%, 물 속성 특성만 그 값만큼 돌파)·5번(허 방무 삭제)
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { getElement } from '../src/data/elements';
import { FORM_TABLE } from '../src/data/evolution';
import { buildCombatParams, newBuild } from '../src/engine/absorb';
import type { CombatParams } from '../src/engine/combat';
import { applyEvolutionToParams, newEvolution } from '../src/engine/evolution';
import { critPercentText } from '../src/ui/lcdScreens';

const CX = BALANCE.provisional.combat;
const WATER = BALANCE.provisional.abilities.element.water!.critChance!;
/** 그 단계(0부터)·속성 목록의 진화체 (kind 무관 첫 번째) */
const formOf = (tier: number, elements: string[]) =>
  FORM_TABLE.find((f) => f.tier === tier && f.label.elements.length === elements.length && elements.every((e) => f.label.elements.includes(e)));
const evoOf = (formId: string, tier: number) => ({ ...newEvolution(), tierIndex: tier, formId, ability: 'atk' as const });
const paramsFor = (formId: string, tier: number): Partial<CombatParams> => {
  const p = buildCombatParams(newBuild(), 'hollow');
  applyEvolutionToParams(p, evoOf(formId, tier), 'hollow');
  return p;
};

describe('치명 상한 (GDD 45장 1번)', () => {
  it('물 4단계 몸은 상한 50% + 물 특성 8%p = 58%, 다른 속성 4단계는 50%', () => {
    const water = formOf(4, ['water'])!;
    const fire = formOf(4, ['fire'])!;
    expect(paramsFor(water.id, 3).critChanceMax).toBeCloseTo(CX.critChanceMax + WATER);
    expect(paramsFor(water.id, 3).critChanceMax).toBeCloseTo(0.58);
    expect(paramsFor(fire.id, 3).critChanceMax ?? CX.critChanceMax).toBeCloseTo(CX.critChanceMax);
  });

  it('상태 화면 치명 표시도 같은 상한: 물 4단계 몸이 확률을 넘치게 가져도 58%', () => {
    const water = formOf(4, ['water'])!;
    const build = { ...newBuild(), slots: [] as (string | null)[] };
    expect(critPercentText(build, evoOf(water.id, 3))).toBe(`${Math.round((CX.critChance + WATER) * 100)}%`);
    // 특성 치명 확률이 넘치는 몸: 표시 상한 = 50% + 물 값
    const many = { ...newBuild(), slots: Array(20).fill('t-thunder-part') as (string | null)[] };
    const shown = Number(critPercentText(many, evoOf(water.id, 3)).replace('%', ''));
    expect(shown).toBeLessThanOrEqual(58);
    const fire = formOf(4, ['fire'])!;
    expect(Number(critPercentText(many, evoOf(fire.id, 3)).replace('%', ''))).toBeLessThanOrEqual(50);
  });
});

describe('허 방무 삭제 (GDD 45장 5번)', () => {
  it('허 속성에는 공격 효과(방어 무시)가 없다', () => {
    expect(getElement('kyo').effect).toBeUndefined();
    expect('pierceIgnore' in BALANCE.provisional.elements).toBe(false);
    expect('pierceRisk' in BALANCE.provisional.elements).toBe(false);
  });
});
