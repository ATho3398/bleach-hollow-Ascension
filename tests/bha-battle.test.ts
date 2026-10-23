import { describe, expect, it } from 'vitest';
import { FACTIONS } from '../src/data/factions';
import { TRAIT_ABBR_MAX_LENGTH, TRAITS, parseTrait, traitAbbr, traitName } from '../src/data/traits';
import {
  blockVisual, chainLevelAt, fitAbbr, floatSpot, FLOAT_SPOTS, gaugeFill, gaugeSlots, hasPips, pickAbbr, runSpecs, secondsText, trackTotal,
} from '../src/ui/bha/battle';
import { blockAbbr, blockName } from '../src/ui/battleView';
import { getEnemy } from '../src/data/enemies';
import { buildCombatParams, gainTrait, newBuild } from '../src/engine/absorb';
import { BASIC_SKILL_ID, blockDamage, blockEffect, createCombat, tierEffect, sameChainKind, step, type Block } from '../src/engine/combat';
import { battleLabels } from '../src/ui/labels';

describe('블록 약어 선택 (GDD 15-2 결정 2)', () => {
  it('데이터 abbr 가 있으면 그것을, 공백뿐이거나 없으면 이름에서 만든다', () => {
    expect(pickAbbr('A1', '임시 특성 A1')).toBe('A1');
    expect(pickAbbr('  ', '찢는 발톱')).toBe('찢는 발톱');
    expect(pickAbbr(undefined, '찢는 발톱')).toBe('찢는 발톱');
  });
  it('이름이 짧으면 그대로, 길면 앞 4글자', () => {
    expect(fitAbbr('세로')).toBe('세로');
    expect(fitAbbr('공허 블록')).toBe('공허 블록');
    expect(fitAbbr('임시 특성 A1')).toBe('임시 특');
    expect(fitAbbr('아주긴이름의특성')).toBe('아주긴이');
    expect(fitAbbr('   ')).toBe('');
  });
  it('모든 임시 특성에 abbr 가 있고 길이 제한을 지킨다 (둘 다 종족에서 읽힌다)', () => {
    for (const t of TRAITS) {
      expect(t.abbr, t.id).toBeDefined();
      for (const f of FACTIONS) {
        const a = traitAbbr(t.id, f.id);
        expect(a, `${t.id}/${f.id}`).toBeTruthy();
        expect(Array.from(a!).length).toBeLessThanOrEqual(TRAIT_ABBR_MAX_LENGTH);
      }
    }
  });
  it('abbr 데이터 검증: 문자열이 아니거나 너무 길면 거부, 없어도 통과(이름으로 대체)', () => {
    const base = { id: 'x', element: 'fire', kind: 'part', name: { '*': '이름' }, description: { '*': '설명' } };
    expect(() => parseTrait(base)).not.toThrow();
    expect(() => parseTrait({ ...base, abbr: { '*': 'A1' } })).not.toThrow();
    expect(() => parseTrait({ ...base, abbr: { '*': '' } })).toThrow(/abbr/);
    expect(() => parseTrait({ ...base, abbr: { '*': '가'.repeat(TRAIT_ABBR_MAX_LENGTH + 1) } })).toThrow(/abbr/);
    expect(() => parseTrait({ ...base, abbr: 'A1' })).toThrow(/abbr/);
  });
  it('블록 이름 = 속성_계열 (GDD 20장 v5.4): 옛 종족 블록 이름(본체 능력·포효 등)은 쓰지 않는다', () => {
    const enemy = getEnemy('test-a');
    for (const f of FACTIONS) {
      const labels = battleLabels(f);
      const [a, b, c] = f.families.map((x) => x.abbr);
      const b0 = newBuild();
      for (const id of ['t-fire-a', 't-kyo-b', 't-fire-guard']) gainTrait(b0, id);
      const p0 = createCombat(1, { enemy, params: buildCombatParams(b0, f.id) }).params;
      const b1 = newBuild();
      gainTrait(b1, 't-normal-heal');
      // 생성원 두 묶음을 합친 전투 값 (이름만 본다)
      const p = { ...p0, skills: [...p0.skills, ...createCombat(1, { enemy, params: buildCombatParams(b1, f.id) }).params.skills] };
      const name = (blk: Block) => blockName(blk, labels, f.id, p);
      expect(name({ uid: 2, kind: 'void', traitId: null })).toBe('공허');
      expect(name({ uid: 3, kind: 'skill', traitId: 't-fire-a', family: 'family-a' })).toBe(`불_${a}`);
      expect(name({ uid: 4, kind: 'skill', traitId: 't-kyo-b', family: 'family-b' })).toBe(`허_${b}`);
      expect(name({ uid: 5, kind: 'skill', traitId: 't-fire-guard', family: null })).toBe('불_막기');
      expect(name({ uid: 6, kind: 'skill', traitId: 't-normal-heal', family: null })).toBe('노멀_회복');
      // 4자를 넘으면 _ 뒤에서 두 줄로
      expect(blockAbbr({ uid: 6, kind: 'skill', traitId: 't-normal-heal', family: null }, labels, f.id, p)).toBe('노멀_ 회복');
      expect(blockAbbr({ uid: 3, kind: 'skill', traitId: 't-fire-a', family: 'family-a' }, labels, f.id, p)).toBe(`불_${a}`);
      // 기본 블록: 내 캐릭터 속성 + 블록 계열
      const pb = createCombat(1, { enemy, params: { ...buildCombatParams(newBuild(), f.id), playerElements: ['water'] } }).params;
      expect(blockName({ uid: 7, kind: 'skill', traitId: BASIC_SKILL_ID, family: 'family-c' }, labels, f.id, pb)).toBe(`물_${c}`);
      const old = [f.basicSkillName, f.voidBlockName];
      for (const blk of [{ uid: 8, kind: 'skill' as const, traitId: BASIC_SKILL_ID, family: 'family-a' }, { uid: 9, kind: 'void' as const, traitId: null }]) {
        expect(old).not.toContain(blockName(blk, labels, f.id, pb));
      }
      expect('storedSkill' in labels).toBe(false); // 저장 필살은 C.134 에 삭제 (GDD 83장)
    }
  });

  it('기본 공격 블록은 종족 계열 3종이 고르게 섞여 나오고, 같은 계열끼리 체인된다 (위력은 기본 블록 값)', () => {
    const f = FACTIONS[0]!;
    const seen: Record<string, number> = {};
    for (let seed = 1; seed <= 40; seed++) {
      const c = createCombat(seed, { enemy: getEnemy('test-a'), params: buildCombatParams(newBuild(), f.id) });
      for (let i = 0; i < 5000 && c.status === 'playing' && c.tray.filter((b) => b.kind === 'skill').length < 5; i++) step(c);
      for (const b of c.tray) if (b.kind === 'skill' && b.traitId === BASIC_SKILL_ID) seen[b.family ?? 'null'] = (seen[b.family ?? 'null'] ?? 0) + 1;
    }
    expect(Object.keys(seen).sort()).toEqual(f.families.map((x) => x.id).sort());
    const total = Object.values(seen).reduce((x, y) => x + y, 0);
    expect(total).toBeGreaterThan(60);
    for (const n of Object.values(seen)) expect(n / total).toBeGreaterThan(0.2);
    // 같은 계열 + 같은 속성 = 체인, 다른 계열 = 끊김, 같은 계열이라도 속성이 다르면 끊김 (C.118, GDD 66장)
    expect(sameChainKind({ uid: 1, kind: 'skill', traitId: BASIC_SKILL_ID, family: 'family-a' }, { uid: 2, kind: 'skill', traitId: BASIC_SKILL_ID, family: 'family-a' })).toBe(true);
    expect(sameChainKind({ uid: 1, kind: 'skill', traitId: BASIC_SKILL_ID, family: 'family-a' }, { uid: 2, kind: 'skill', traitId: BASIC_SKILL_ID, family: 'family-b' })).toBe(false);
    expect(sameChainKind({ uid: 1, kind: 'skill', traitId: BASIC_SKILL_ID, family: 'family-a', element: 'normal' }, { uid: 2, kind: 'skill', traitId: BASIC_SKILL_ID, family: 'family-a', element: 'fire' })).toBe(false);
    // 위력: 계열이 달라도 기본 블록 값 그대로
    const s = createCombat(1, { enemy: getEnemy('test-a'), params: buildCombatParams(newBuild(), f.id) });
    const dmg = f.families.map((x) => blockDamage(s, { uid: 1, kind: 'skill', traitId: BASIC_SKILL_ID, family: x.id }, 2));
    expect(new Set(dmg.map((d) => d.toFixed(6))).size).toBe(1);
    expect(dmg[0]).toBeCloseTo(blockDamage(s, { uid: 1, kind: 'skill', traitId: BASIC_SKILL_ID, family: null }, 2));
    // 2·3체인은 그 계열 단계 기술(특공): 블록 계열이 생성원 계열로 쓰인다
    for (const x of f.families) {
      const eff = blockEffect(s, { uid: 1, kind: 'skill', traitId: BASIC_SKILL_ID, family: x.id }, 3)!;
      expect(eff.skill.family).toBe(x.id);
      expect(tierEffect(s.params, eff.skill, 3).bonus).toEqual(x.tiers[2]!.bonus ?? null);
    }
  });
});

describe('블록 외형', () => {
  it('콤보·공허·기본·스킬 역할', () => {
    expect(blockVisual('combo', false, null)).toBe('special');
    expect(blockVisual('void', false, null)).toBe('void');
    expect(blockVisual('skill', true, 'attack')).toBe('basic');
    expect(blockVisual('skill', false, 'heal')).toBe('heal');
    expect(blockVisual('skill', false, null)).toBe('attack');
  });
  it('체인 단계 표시는 공격·막기·회복만', () => {
    expect(['attack', 'guard', 'heal'].every((v) => hasPips(v as 'attack'))).toBe(true);
    expect(['basic', 'special', 'void'].some((v) => hasPips(v as 'basic'))).toBe(false);
  });
});

describe('체인 묶음 --start/--len', () => {
  const skills = (n: number) => (i: number) => i < n;
  it('길이 2 이상의 스킬 묶음만, 시작은 1부터', () => {
    const runs = [{ start: 0, length: 1 }, { start: 1, length: 2 }, { start: 3, length: 1 }, { start: 4, length: 3 }];
    const specs = runSpecs(runs, skills(8), 3);
    expect(specs).toEqual([
      { start: 2, len: 2, level: 2, max: false, over: false },
      { start: 5, len: 3, level: 3, max: true, over: false },
    ]);
  });
  it('최대 체인보다 길면 단계는 최대, over 표시', () => {
    const specs = runSpecs([{ start: 0, length: 4 }], skills(8), 3);
    expect(specs).toEqual([{ start: 1, len: 4, level: 3, max: true, over: true }]);
  });
  it('스킬이 아닌 블록의 묶음은 만들지 않는다', () => {
    expect(runSpecs([{ start: 2, length: 2 }], (i) => i < 2, 3)).toEqual([]);
  });
  it('칸 번호 → 체인 단계 (묶음 밖은 1)', () => {
    const specs = runSpecs([{ start: 1, length: 2 }, { start: 4, length: 3 }], skills(8), 3);
    expect([0, 1, 2, 3, 4, 5, 6].map((i) => chainLevelAt(specs, i))).toEqual([1, 2, 2, 1, 3, 3, 3]);
  });
});

describe('그 밖의 표시 규칙', () => {
  it('남은 시간 글자', () => {
    expect(secondsText(1.25)).toBe('1.3초');
    expect(secondsText(-1)).toBe('0.0초');
  });
  it('플로팅 숫자 자리는 돌려 쓴다 (음수도 안전)', () => {
    expect(floatSpot(0)).toEqual(FLOAT_SPOTS[0]);
    expect(floatSpot(FLOAT_SPOTS.length)).toEqual(FLOAT_SPOTS[0]);
    expect(floatSpot(-1)).toEqual(FLOAT_SPOTS[FLOAT_SPOTS.length - 1]);
  });
});

describe('머리 위 게이지 순수 함수 (GDD 18-6)', () => {
  it('trackTotal: 가장 큰 남은 값을 처음 길이로 삼고, 끝나면 0 으로 되돌린다', () => {
    expect(trackTotal(0, 3)).toBe(3);
    expect(trackTotal(3, 2)).toBe(3);
    expect(trackTotal(3, 4)).toBe(4); // 도중에 연장되면 더 긴 쪽이 기준
    expect(trackTotal(3, 0)).toBe(0);
    expect(trackTotal(3, -1)).toBe(0);
  });

  it('gaugeFill: 남은/전체 비율을 0~1 로 자른다 (전체가 없으면 0)', () => {
    expect(gaugeFill(1.5, 3)).toBe(0.5);
    expect(gaugeFill(3, 3)).toBe(1);
    expect(gaugeFill(5, 3)).toBe(1);
    expect(gaugeFill(-1, 3)).toBe(0);
    expect(gaugeFill(1, 0)).toBe(0);
  });

  it('gaugeSlots: 켜진 게이지만 머리 위 첫 줄(0)부터 차례로 쌓고 꺼진 것은 -1', () => {
    expect(gaugeSlots([true, true])).toEqual([0, 1]);
    expect(gaugeSlots([false, true])).toEqual([-1, 0]);
    expect(gaugeSlots([true, false])).toEqual([0, -1]);
    expect(gaugeSlots([false, false])).toEqual([-1, -1]);
  });
});
