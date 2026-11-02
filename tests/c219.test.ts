// C.219 (GDD 141장): 평타 = 공격력(힘) ÷ 적 방어, 블록 공격 전부 = 특공(지능) ÷ 적 정신력 · 설명 되살림
import { describe, expect, it } from 'vitest';
import { getEnemy } from '../src/data/enemies';
import { getFaction } from '../src/data/factions';
import { BASIC_SKILL_ID, blockDamage, createCombat, PLAYER_BASIC_CATEGORY, PLAYER_BLOCK_CATEGORY, uniformStats } from '../src/engine/combat';
import { buildCombatParams, newBuild } from '../src/engine/absorb';
import { GLOSSARY, helpVars } from '../src/data/help';
import { statUseLines } from '../src/data/help/statText';
import { abilityDescription } from '../src/data/evolution';

const combatWith = (factionId: string, atk: number, int: number) => {
  const params = buildCombatParams(newBuild(), factionId);
  params.playerStats = { ...uniformStats(50), atk, int };
  return createCombat(1, { enemy: getEnemy('test-a'), params });
};

describe('피해 공식 (GDD 141장 1)', () => {
  it('평타 = 물리(공격력), 블록 = 특수(특공)', () => {
    expect(PLAYER_BASIC_CATEGORY).toBe('physical');
    expect(PLAYER_BLOCK_CATEGORY).toBe('special');
  });
  for (const fid of ['hollow', 'shinigami']) {
    it(`${fid}: 어느 계열 블록이든 피해는 지능만 따르고 힘은 상관없다`, () => {
      const f = getFaction(fid);
      const base = combatWith(fid, 50, 50);
      const moreAtk = combatWith(fid, 100, 50);
      const moreInt = combatWith(fid, 50, 100);
      for (const fam of f.families) {
        const b = { uid: 1, kind: 'skill' as const, traitId: BASIC_SKILL_ID, family: fam.id };
        expect(blockDamage(moreAtk, b, 2)).toBeCloseTo(blockDamage(base, b, 2), 6);
        expect(blockDamage(moreInt, b, 2)).toBeCloseTo(blockDamage(base, b, 2) * 2, 6);
      }
      const v = { uid: 2, kind: 'void' as const, traitId: null };
      expect(blockDamage(moreAtk, v)).toBeCloseTo(blockDamage(base, v), 6);
      expect(blockDamage(moreInt, v)).toBeCloseTo(blockDamage(base, v) * 2, 6);
    });
  }
});

describe('설명 되살림 (GDD 141장 2)', () => {
  it('도움말 능력치: 힘 = 평타, 지능 = 블록 공격, 블록 타입 낱말 없음', () => {
    const t = GLOSSARY.find((x) => x.id === 'stats')!.body;
    expect(t).toContain('**{stat.atk}**: 일반 공격 피해 관련'); // C.241: 165장 2 문구
    expect(t).toContain('**{stat.int}**: 블록 공격 피해 관련');
    expect(t).not.toMatch(/물리|특수|혼합|반씩/);
    expect(helpVars(getFaction('hollow')).skillBlockName).toBeTruthy();
  });
  it('성향 괴력 = 평타 피해 ↑', () => {
    expect(abilityDescription('atk', 'hollow')).toContain('평타');
    expect(abilityDescription('def', 'shinigami')).toContain('적의');
  });
  it('상태 화면 능력치 ⓘ: 6줄, 힘 = 평타·지능 = 블록 공격', () => {
    const lines = statUseLines(getFaction('hollow'));
    expect(lines).toHaveLength(6);
    expect(lines.find((l) => l.startsWith('힘'))).toContain('일반 공격'); // C.241: 165장 2 문구
    expect(lines.find((l) => l.startsWith('지능'))).toContain('블록 공격');
    expect(lines.join(' ')).not.toMatch(/\(가\)|\(와\)|물리|특수|혼합/);
    // C.241 (165장 2): 머리 줄('평타는 힘, 블록 공격은 지능을 따라간다') 삭제
  });
});
