// 체인 계열 개편 (GDD 17-3, R-3 C.34): 데이터 모델
import { describe, expect, it } from 'vitest';
import { FACTIONS } from '../src/data/factions';
import { LINEAGES } from '../src/data/lineages';
import { TRAITS, parseTrait } from '../src/data/traits';
import { FAMILY_TIERS, parseFactionConfig } from '../src/engine/faction';
import { BALANCE } from '../src/config/balance';
import { equippedSkills, gainTrait, newBuild } from '../src/engine/absorb';

describe('계열 데이터 (GDD 17-3)', () => {
  it('모든 종족 설정에 계열 목록이 있고 단계 기술은 체인 단계 수와 같다', () => {
    expect(FAMILY_TIERS).toBe(BALANCE.provisional.combat.chainMultipliers.length);
    for (const f of FACTIONS) {
      expect(f.families.length).toBeGreaterThanOrEqual(3);
      for (const fam of f.families) {
        expect(fam.tiers).toHaveLength(FAMILY_TIERS);
        expect(Array.from(fam.abbr)).toHaveLength(1);
        // 기존 체인 배율을 이어받는다
        expect(fam.tiers.map((t) => t.multiplier)).toEqual([...BALANCE.provisional.combat.chainMultipliers]);
      }
    }
  });

  it('호로는 조·교·탄, 사신은 참·권·귀 계열이다 (종족 설정에서 읽음)', () => {
    const abbrs = (id: string) => FACTIONS.find((f) => f.id === id)!.families.map((x) => x.abbr).join('');
    expect(abbrs('hollow')).toBe('조교탄');
    expect(abbrs('shinigami')).toBe('참권귀');
  });

  it('공격 특성은 계열이 있고(종족 설정에 존재), 막기·회복·패시브·파츠는 계열이 없다', () => {
    for (const t of TRAITS) {
      if (t.kind === 'skill' && t.role === 'attack') {
        expect(t.family, t.id).toBeTruthy();
        for (const f of FACTIONS) expect(f.families.some((x) => x.id === t.family), `${f.id}/${t.id}`).toBe(true);
        expect(t.chainBonus, t.id).toBeUndefined();
      } else {
        expect(t.family, t.id).toBeUndefined();
      }
    }
  });

  it('계통마다 약점 계열이 있고 그 계통 공격 특성의 계열과 같다', () => {
    for (const l of LINEAGES) {
      expect(l.family, l.id).toBeTruthy();
      for (const t of TRAITS.filter((x) => x.lineageId === l.id && x.kind === 'skill' && x.role === 'attack')) expect(t.family, t.id).toBe(l.family);
    }
    // 모든 계열에 일반(희귀 아닌) 공격 특성이 하나 이상 있다
    const famIds = FACTIONS[0]!.families.map((f) => f.id);
    for (const id of famIds) expect(TRAITS.some((t) => t.family === id && !t.rare), id).toBe(true);
  });

  it('잘못된 계열 데이터는 거절한다', () => {
    const hollow = FACTIONS.find((f) => f.id === 'hollow')!;
    expect(() => parseFactionConfig({ ...hollow, families: [] })).toThrow(/families/);
    expect(() => parseFactionConfig({ ...hollow, families: [{ ...hollow.families[0], tiers: [] }] })).toThrow(/tiers/);
    expect(() => parseFactionConfig({ ...hollow, families: [{ ...hollow.families[0], abbr: '조교' }] })).toThrow(/abbr/);
    const bad = { ...TRAITS.find((t) => t.role === 'attack')!, family: undefined };
    expect(() => parseTrait(bad)).toThrow(/family/);
    const guard = { ...TRAITS.find((t) => t.role === 'guard')!, family: 'family-a' };
    expect(() => parseTrait(guard)).toThrow(/family/);
  });

  it('기존 세이브(특성 id 목록)는 그대로 열리고 장착 특성이 계열을 얻는다', () => {
    const b = newBuild();
    gainTrait(b, 'trait-c5'); // 옛 세이브에 있던 특성 id
    gainTrait(b, 'trait-a5');
    const skills = equippedSkills(b);
    expect(skills.find((s) => s.id === 'trait-c5')!.family).toBe('family-c');
    expect(skills.find((s) => s.id === 'trait-a5')!.family).toBeNull();
  });
});
