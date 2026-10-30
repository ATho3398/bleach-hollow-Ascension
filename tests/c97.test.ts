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
  it('물 3단계 몸(C.220, 옛 4단계)은 상한 50% + 물 특성 8%p = 58%, 다른 속성은 50%', () => {
    const water = formOf(3, ['water'])!;
    const fire = formOf(3, ['fire'])!;
    expect(paramsFor(water.id, 2).critChanceMax).toBeCloseTo(CX.critChanceMax + WATER);
    expect(paramsFor(water.id, 2).critChanceMax).toBeCloseTo(0.58);
    expect(paramsFor(fire.id, 2).critChanceMax ?? CX.critChanceMax).toBeCloseTo(CX.critChanceMax);
  });

  it('상태 화면 치명 표시도 같은 상한: 물 4단계 몸이 확률을 넘치게 가져도 58%', () => {
    const water = formOf(3, ['water'])!;
    const build = { ...newBuild(), slots: [] as (string | null)[] };
    expect(critPercentText(build, evoOf(water.id, 2))).toBe(`${Math.round((CX.critChance + WATER) * 100)}%`);
    // 특성 치명 확률이 넘치는 몸: 표시 상한 = 50% + 물 값
    const many = { ...newBuild(), slots: Array(20).fill('t-thunder-part') as (string | null)[] };
    const shown = Number(critPercentText(many, evoOf(water.id, 2)).replace('%', ''));
    expect(shown).toBeLessThanOrEqual(58);
    const fire = formOf(3, ['fire'])!;
    expect(Number(critPercentText(many, evoOf(fire.id, 2)).replace('%', ''))).toBeLessThanOrEqual(50);
  });
});

describe('허 방무 삭제 (GDD 45장 5번)', () => {
  it('허 속성에는 공격 효과(방어 무시)가 없다', () => {
    expect(getElement('kyo').effect).toBeUndefined();
    expect('pierceIgnore' in BALANCE.provisional.elements).toBe(false);
    expect('pierceRisk' in BALANCE.provisional.elements).toBe(false);
  });
});

describe("불 속성 특성 '작열' = 방어·정신력 8% 무시 (GDD 45장 3번)", () => {
  const ignoreOf = (tier: number, elements: string[]) => {
    const f = formOf(tier, elements)!;
    return paramsFor(f.id, tier - 1).abilityEffects?.ignoreDefense ?? 0;
  };
  it('4단계 8%, 5단계 ×1.5 = 12%, 융합 불+뇌 50% 세기 = 4%. 다른 속성은 없음', () => {
    // C.220: 3단계 8%, 4단계 ×1.5 = 12%, 융합 불+뇌(4단계 히든) 각 50% × 4단계 1.5 = 6%
    expect(ignoreOf(3, ['fire'])).toBeCloseTo(0.08);
    expect(ignoreOf(4, ['fire'])).toBeCloseTo(0.12);
    expect(ignoreOf(4, ['fire', 'thunder'])).toBeCloseTo(0.06);
    expect(ignoreOf(3, ['water'])).toBe(0);
  });
  it('내 블록·평타 피해가 적 방어 × (1 − 8%) 로 계산된다', async () => {
    const { createCombat, statRatio, uniformStats } = await import('../src/engine/combat');
    const { getEnemy } = await import('../src/data/enemies');
    const a = uniformStats(50);
    expect(statRatio(a, a, 'physical', 0.08)).toBeCloseTo(1 / 0.92);
    const fire = formOf(3, ['fire'])!;
    const s = createCombat(1, { enemy: getEnemy('test-a'), params: paramsFor(fire.id, 2) });
    expect(s.params.abilityEffects.ignoreDefense).toBeCloseTo(0.08);
  });
});
