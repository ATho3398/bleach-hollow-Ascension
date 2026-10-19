import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { FACTIONS } from '../src/data/factions';
import { FORM_TABLE } from '../src/data/evolution';
import { chainGroup, chainGroupsOf, maxChain, type Block, type CombatParams } from '../src/engine/combat';
import { buildCombatParams, newBuild } from '../src/engine/absorb/build';
import { applyEvolutionToParams, newEvolution } from '../src/engine/evolution/evolution';
import { ATTACK_FX_KINDS, DEFAULT_MAX_CHAIN, parseFactionConfig, resolveMaxChain } from '../src/engine/faction';

let uid = 0;
const blk = (family: string | null, traitId = 'trait-x'): Block => ({ uid: ++uid, kind: 'skill', traitId, family });
const run = (n: number, fam = 'family-a') => Array.from({ length: n }, () => blk(fam));

describe('체인 묶음 상한 (GDD 19-2)', () => {
  it('같은 계열 연속 N개는 앞에서부터 3개씩 묶는다: 4=3+1, 5=3+2, 6=3+3, 7=3+3+1', () => {
    const sizes = (n: number) => chainGroupsOf(run(n), 3).map((g) => g.length);
    expect(sizes(1)).toEqual([1]);
    expect(sizes(3)).toEqual([3]);
    expect(sizes(4)).toEqual([3, 1]);
    expect(sizes(5)).toEqual([3, 2]);
    expect(sizes(6)).toEqual([3, 3]);
    expect(sizes(7)).toEqual([3, 3, 1]);
  });

  it('누른 블록이 속한 묶음만 발동한다', () => {
    const t = run(7);
    expect(chainGroup(t, 0, 3)).toEqual([0, 1, 2]);
    expect(chainGroup(t, 2, 3)).toEqual([0, 1, 2]);
    expect(chainGroup(t, 3, 3)).toEqual([3, 4, 5]);
    expect(chainGroup(t, 5, 3)).toEqual([3, 4, 5]);
    expect(chainGroup(t, 6, 3)).toEqual([6]);
  });

  it('묶음은 덩어리(같은 계열 연속)마다 따로 센다: 다른 계열·공허가 끼면 끊긴다', () => {
    const t = [...run(4, 'family-a'), blk('family-b'), blk('family-b'), { uid: ++uid, kind: 'void', traitId: null } as Block, ...run(2, 'family-a')];
    expect(chainGroupsOf(t, 3)).toEqual([
      { start: 0, length: 3 }, { start: 3, length: 1 }, { start: 4, length: 2 }, { start: 6, length: 1 }, { start: 7, length: 2 },
    ]);
    expect(chainGroup(t, 4, 3)).toEqual([4, 5]);
  });

  it('상한 값이 바뀌면 그 개수로 묶인다 (4·5체인 캐릭터 대비)', () => {
    expect(chainGroupsOf(run(7), 4).map((g) => g.length)).toEqual([4, 3]);
    expect(chainGroupsOf(run(7), 5).map((g) => g.length)).toEqual([5, 2]);
    expect(chainGroup(run(5), 4, 2)).toEqual([4]);
  });

  it('전투 상한 maxChain = 파라미터 값(단계 기술 수 이내), 없으면 단계 기술 수(3)', () => {
    const base = { chainMultipliers: BALANCE.provisional.combat.chainMultipliers } as unknown as CombatParams;
    expect(maxChain(base)).toBe(3);
    expect(maxChain({ ...base, maxChain: 2 })).toBe(2);
    expect(maxChain({ ...base, maxChain: 5 })).toBe(3); // 4·5단계 기술·배율이 생기기 전까지는 3에서 멈춘다
  });

  it('상한은 진화체 값 > 종족 설정 > 기본 3 순으로 정해지고, 지금은 전원 3', () => {
    expect(DEFAULT_MAX_CHAIN).toBe(3);
    expect(resolveMaxChain({})).toBe(3);
    expect(resolveMaxChain({ maxChain: 4 })).toBe(4);
    expect(resolveMaxChain({ maxChain: 4 }, 5)).toBe(5);
    for (const f of FACTIONS) expect(resolveMaxChain(f)).toBe(3);
    for (const f of FORM_TABLE) expect(f.maxChain).toBe(3);
    const p = buildCombatParams(newBuild(), FACTIONS[0]!.id);
    expect(p.maxChain).toBe(3);
    const e = { ...newEvolution(), tierIndex: 1, formId: FORM_TABLE[0]!.id, formHistory: [FORM_TABLE[0]!.id] };
    applyEvolutionToParams(p, e);
    expect(p.maxChain).toBe(3);
  });
});

describe('계열 공격 연출 종류 (GDD 19-2, 종족 설정)', () => {
  it('모든 종족의 모든 계열이 연출 종류 id 를 가지고, 한 종족 안에서는 서로 다르다', () => {
    for (const f of FACTIONS) {
      const kinds = f.families.map((x) => x.fx);
      for (const k of kinds) expect(ATTACK_FX_KINDS).toContain(k);
      expect(new Set(kinds).size).toBe(kinds.length);
    }
  });

  it('연출 종류가 없거나 모르는 값이면 종족 설정 검사에서 막힌다', () => {
    const f = structuredClone(FACTIONS[0]!) as unknown as { families: { fx?: string }[] };
    f.families[0]!.fx = 'laser-sword';
    expect(() => parseFactionConfig(f)).toThrow(/fx/);
    delete f.families[0]!.fx;
    expect(() => parseFactionConfig(f)).toThrow(/fx/);
  });
});
