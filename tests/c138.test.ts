// C.138 (GDD 84장 4·5): 블록 표기 = 계열 약어(조·탄·교)·막기·회복, 아이콘 = 계열 모양(노말 포함)·크게
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { getFaction } from '../src/data/factions';
import { battleLabels, skillBlockLabel } from '../src/ui/labels';

const read = (p: string) => readFileSync(p, 'utf8');

describe('C.138', () => {
  it('4번: 공격 블록 이름 = 계열 약어만, 막기·회복 = 막기·회복 (속성 이름 없음)', () => {
    const hollow = battleLabels(getFaction('hollow'));
    expect(['family-a', 'family-b', 'family-c'].map((f) => skillBlockLabel(hollow, f, 'attack'))).toEqual(['조', '교', '탄']);
    expect(skillBlockLabel(hollow, null, 'guard')).toBe('막기');
    expect(skillBlockLabel(hollow, null, 'heal')).toBe('회복');
    const shini = battleLabels(getFaction('shinigami'));
    expect(['family-a', 'family-b', 'family-c'].map((f) => skillBlockLabel(shini, f, 'attack'))).toEqual(['참', '권', '귀']);
    expect(skillBlockLabel(hollow, null, 'attack')).toBeNull();
  });
  it('5번: 기본(노말) 블록도 계열 아이콘을 쓴다', () => {
    const src = read('src/ui/bha/battle.ts');
    expect(src).toContain("(spec.visual === 'attack' || spec.visual === 'basic') && spec.fx");
    expect(src).not.toContain("'bha-block__fam'");
  });
  it('5번: 아이콘이 카드 중심에서 크고 이름은 아래 작게', () => {
    const css = read('src/ui/bha/components/components.css');
    expect(css).toMatch(/\.bha-block__icon \.bha-icon \{ width: 34px; height: 34px/);
    expect(css).toMatch(/\.bha-block__icon \{[^}]*flex: 1 1 auto/);
  });
});
