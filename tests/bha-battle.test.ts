import { describe, expect, it } from 'vitest';
import { FACTIONS } from '../src/data/factions';
import { LINEAGES } from '../src/data/lineages';
import { TRAIT_ABBR_MAX_LENGTH, TRAITS, parseTrait, traitAbbr, traitName } from '../src/data/traits';
import {
  blockVisual, chainLevelAt, fitAbbr, floatSpot, FLOAT_SPOTS, hasPips, pickAbbr, runSpecs, secondsText,
} from '../src/ui/bha/battle';
import { lineageKey } from '../src/ui/bha/lineage';
import { blockAbbr } from '../src/ui/battleView';
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
    const base = { id: 'x', lineageId: 'lineage-a', kind: 'part', name: { '*': '이름' }, description: { '*': '설명' } };
    expect(() => parseTrait(base)).not.toThrow();
    expect(() => parseTrait({ ...base, abbr: { '*': 'A1' } })).not.toThrow();
    expect(() => parseTrait({ ...base, abbr: { '*': '' } })).toThrow(/abbr/);
    expect(() => parseTrait({ ...base, abbr: { '*': '가'.repeat(TRAIT_ABBR_MAX_LENGTH + 1) } })).toThrow(/abbr/);
    expect(() => parseTrait({ ...base, abbr: 'A1' })).toThrow(/abbr/);
  });
  it('블록 약어: 필살·공허·기본은 종족 설정 이름에서, 스킬은 특성 약어에서 (종족 id 분기 없음)', () => {
    for (const f of FACTIONS) {
      const labels = battleLabels(f);
      expect(blockAbbr({ uid: 1, kind: 'special', traitId: null }, labels, f.id)).toBe(fitAbbr(f.specialBlockName));
      expect(blockAbbr({ uid: 2, kind: 'void', traitId: null }, labels, f.id)).toBe(fitAbbr(f.voidBlockName));
      expect(blockAbbr({ uid: 3, kind: 'skill', traitId: 'basic-skill' }, labels, f.id)).toBe(fitAbbr(f.basicSkillName));
      const skill = TRAITS.find((t) => t.kind === 'skill')!;
      expect(blockAbbr({ uid: 4, kind: 'skill', traitId: skill.id }, labels, f.id)).toBe(traitAbbr(skill.id, f.id));
      expect(traitName(skill.id, f.id).length).toBeGreaterThan(0);
    }
  });
});

describe('계통 마크 매핑', () => {
  it('계통 A~E → a~e, 모르는 계통은 undefined', () => {
    LINEAGES.slice(0, 5).forEach((l, i) => expect(lineageKey(l.id)).toBe(['a', 'b', 'c', 'd', 'e'][i]));
    expect(lineageKey('lineage-zzz')).toBeUndefined();
  });
});

describe('블록 외형', () => {
  it('필살·공허·기본·스킬 역할', () => {
    expect(blockVisual('special', false, null)).toBe('special');
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
