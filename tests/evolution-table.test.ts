// 진화 트리 데이터 (GDD 20-5, C.47): forms.json = 생성기 결과, 규모(일반 34+1단계 · 히든 11), 단계 합계, 융합 쌍, 도달 가능성, 검증, 이름 자리 표시
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { ELEMENT_IDS, ELEMENTAL_IDS, SPECIAL_ELEMENT_IDS, weaknessesOf } from '../src/data/elements';
import { FORM_TABLE, formHint, formName, formsOfTier, generateFormTable, placeholderName, validateFormTable } from '../src/data/evolution';
import { fusionPairs } from '../src/data/evolution/build';
import { distribute } from '../src/data/evolution/generate';
import { FACTIONS } from '../src/data/factions';
import { ATTACK_CATEGORIES, STAT_IDS, type FormDef } from '../src/data/schema';
import { analyzeTree } from '../src/engine/evolution';
import { isLocomotion } from '../src/engine/locomotion';

const SX = BALANCE.provisional.stats;
const sum = (f: FormDef) => STAT_IDS.reduce((a, k) => a + f.stats[k], 0);

describe('forms.json', () => {
  it('생성기 결과와 같다 (npm run gen:forms 로 다시 만든 그대로)', () => {
    expect(FORM_TABLE).toEqual(generateFormTable());
  });
  it('검증 오류가 없고 id 가 겹치지 않는다', () => {
    expect(validateFormTable(FORM_TABLE)).toEqual([]);
    expect(new Set(FORM_TABLE.map((f) => f.id)).size).toBe(FORM_TABLE.length);
  });
});

describe('트리 규모 (20-5)', () => {
  it('2·3단계 1종, 바스트로데 속성 8 + 히든 8, 아란칼 속성 × 분류 24 + 히든 4(환생 전용 포함)', () => {
    const n = (tier: number, hidden: boolean) => formsOfTier(tier).filter((f) => !!f.hidden === hidden).length;
    expect([n(2, false), n(3, false), n(4, false), n(5, false)]).toEqual([1, 1, ELEMENT_IDS.length, ELEMENT_IDS.length * ATTACK_CATEGORIES.length]);
    expect([n(2, true), n(3, true), n(4, true), n(5, true)]).toEqual([0, 0, 8, 4]);
    for (const el of ELEMENT_IDS) {
      expect(formsOfTier(4).some((f) => f.id === `t4:${el}`)).toBe(true);
      for (const c of ATTACK_CATEGORIES) expect(formsOfTier(5).some((f) => f.id === `t5:${el}:${c}`)).toBe(true);
    }
  });
  it('히든 12종 = 융합 2 · 완전체 · 특수 3 · 순수 · 실패 · 한계 돌파 · 절제 · 강적 사냥꾼 · 환생(C.56)', () => {
    const hidden = FORM_TABLE.filter((f) => f.hidden).map((f) => f.label.kind).sort();
    expect(hidden).toEqual(['complete', 'fail', 'fusion', 'fusion', 'hunter', 'limit', 'pure', 'reborn', 'restraint', 'special', 'special', 'special'].sort());
    expect(SPECIAL_ELEMENT_IDS.map((el) => `h4:special:${el}`).every((id) => FORM_TABLE.some((f) => f.id === id))).toBe(true);
  });
  it('융합은 순환에서 마주 보는 쌍(서로 상성이 아닌 원소)만: 물+흙, 불+뇌', () => {
    expect(fusionPairs().map((p) => p.join('+')).sort()).toEqual(['fire+thunder', 'water+earth']);
    for (const [a, b] of fusionPairs()) {
      const f = FORM_TABLE.find((x) => x.id === `h4:fusion:${a}+${b}`)!;
      expect(f.elements).toEqual([a, b]);
      // 두 속성의 약점을 모두 갖는다
      expect(weaknessesOf(f.elements!).length).toBe(2);
    }
    expect(ELEMENTAL_IDS).toHaveLength(4);
  });
});

describe('종족값 (20-4)', () => {
  it('같은 단계는 합계가 같다 (완전체는 높게, 실패형은 낮게)', () => {
    for (const f of FORM_TABLE) {
      const scale = BALANCE.provisional.evolution.template.totalScale[f.label.kind] ?? 1;
      expect(sum(f), f.id).toBe(Math.round(SX.tierTotals[f.tier - 1]! * scale));
    }
    const complete = FORM_TABLE.find((f) => f.id === 'h4:complete')!;
    const fail = FORM_TABLE.find((f) => f.id === 'h4:fail')!;
    expect(sum(complete)).toBeGreaterThan(sum(fail));
    for (const f of FACTIONS) expect(STAT_IDS.reduce((a, k) => a + f.baseStats[k], 0)).toBe(SX.tierTotals[0]);
  });
  it('아란칼 분류는 종족값 쏠림을 정한다: 물리 = 힘 > 지능, 특수 = 지능 > 힘', () => {
    for (const el of ELEMENT_IDS) {
      const p = FORM_TABLE.find((f) => f.id === `t5:${el}:physical`)!;
      const s = FORM_TABLE.find((f) => f.id === `t5:${el}:special`)!;
      expect(p.stats.atk).toBeGreaterThan(s.stats.atk);
      expect(s.stats.int).toBeGreaterThan(p.stats.int);
    }
  });
  it('분배기: 합계를 정확히 맞추고 성향 방향으로 기운다', () => {
    const st = distribute(390, { atk: 0.2, int: -0.2 });
    expect(STAT_IDS.reduce((a, k) => a + st[k], 0)).toBe(390);
    expect(st.atk).toBeGreaterThan(st.hp);
    expect(st.int).toBeLessThan(st.hp);
  });
  it('노멀 순수형만 자기 속성 보정을 따로 가진다', () => {
    expect(FORM_TABLE.filter((f) => f.stab !== undefined).map((f) => f.id)).toEqual(['h4:pure']);
  });
});

describe('속성·이동 방식·체인 상한', () => {
  it('5단계 행동 히든만 속성을 잇고(elements 없음), 나머지는 1~2개의 속성을 가진다', () => {
    for (const f of FORM_TABLE) {
      if (['limit', 'restraint', 'hunter', 'reborn'].includes(f.label.kind)) expect(f.elements, f.id).toBeUndefined();
      else expect(f.elements!.length, f.id).toBeGreaterThanOrEqual(1);
    }
  });
  it('이동 방식은 모두 유효하고 바스트로데·아란칼은 3종이 모두 나온다', () => {
    for (const f of FORM_TABLE) expect(isLocomotion(f.locomotion), f.id).toBe(true);
    for (const tier of [4, 5]) expect(new Set(formsOfTier(tier).map((f) => f.locomotion)).size).toBe(3);
    for (const f of FORM_TABLE) expect(f.maxChain).toBe(3);
  });
});

describe('도달 가능성 (점검 도구)', () => {
  it('무작위 상태에서 모든 진화체가 한 번 이상 뽑힌다', () => {
    const r = analyzeTree(FORM_TABLE, 'hollow', BALANCE.provisional.evolution.analysis.samples, BALANCE.provisional.evolution.analysis.seed);
    expect(r.unreachable).toEqual([]);
    for (const [tier, x] of Object.entries(r.hiddenRate)) {
      if (Number(tier) <= 3) expect(x.hidden).toBe(0);
      else expect(x.hidden / x.samples).toBeLessThan(0.6);
    }
  });
});

describe('검증기', () => {
  const base = FORM_TABLE.find((f) => f.id === 't4:fire')!;
  it('잘못된 단계·속성·종족값·잇기 진화체를 잡는다', () => {
    expect(validateFormTable([...FORM_TABLE, { ...base }])).toContain('진화체 id 중복: t4:fire');
    expect(validateFormTable([{ ...base, id: 'x', tier: 6 }]).join()).toMatch(/단계 6/);
    expect(validateFormTable([{ ...base, id: 'x', elements: ['zzz'] }]).join()).toMatch(/알 수 없는 속성 zzz/);
    expect(validateFormTable([{ ...base, id: 'x', stats: { ...base.stats, hp: 0 } }]).join()).toMatch(/stats.hp/);
    expect(validateFormTable([{ ...base, id: 'x', elements: undefined }]).join()).toMatch(/마지막 단계만/);
  });
});

describe('이름 자리 표시 (종족 설정 단계 이름, 원작 이름 없음)', () => {
  it('종족마다 단계 이름이 바뀌고 속성·분류 이름이 붙는다', () => {
    for (const fac of FACTIONS) {
      const t4 = FORM_TABLE.find((f) => f.id === 't4:fire')!;
      expect(placeholderName(t4, fac.id)).toContain(fac.tierNames[3]);
      expect(formName(t4, fac.id)).toContain('불');
      const t5 = FORM_TABLE.find((f) => f.id === 't5:water:special')!;
      const specialAbbr = fac.families.find((x) => x.category === 'special')!.abbr;
      expect(formName(t5, fac.id)).toBe(`${fac.tierNames[4]}_물_${specialAbbr}`);
      for (const f of FORM_TABLE) {
        expect(formName(f, fac.id).length).toBeGreaterThan(0);
        expect(formHint(f, fac.id).length).toBeGreaterThan(0);
      }
    }
    expect(formName(FORM_TABLE.find((f) => f.id === 'h4:fusion:water+earth')!, 'hollow')).toContain('융합');
  });
  it('형식 `단계_속성_분류` (GDD 20장 v5.3): 1~3단계는 단계 이름만, 히든은 `단계_히든 이름`, 아란칼 히든은 이은 속성을 뒤에', () => {
    const name = (id: string, fac = 'hollow', inh: string[] = []) => formName(FORM_TABLE.find((f) => f.id === id)!, fac, inh);
    expect(name('t2:base')).toBe('길리안');
    expect(name('t3:base')).toBe('아쥬커스');
    expect(name('t4:fire')).toBe('바스트로데_불');
    expect(name('t5:fire:special')).toBe('아란칼_불_탄');
    expect(name('t5:fire:physical')).toBe('아란칼_불_조');
    expect(name('t5:fire:mixed')).toBe('아란칼_불_교');
    expect(name('t5:fire:special', 'shinigami')).toBe('수석 대원_불_귀');
    expect(name('t4:fire', 'shinigami')).toBe('평대원_불');
    expect(name('h4:fusion:water+earth')).toBe('바스트로데_융합_물흙');
    expect(name('h4:complete')).toBe('바스트로데_완전체');
    expect(name('h4:special:blood')).toBe('바스트로데_특수_혈');
    expect(name('h4:pure')).toBe('바스트로데_순수');
    expect(name('h4:fail')).toBe('바스트로데_실패');
    expect(name('h5:limit', 'hollow', ['fire'])).toBe('아란칼_한계돌파_불');
    expect(name('h5:restraint', 'hollow', ['water', 'earth'])).toBe('아란칼_절제_물흙');
    expect(name('h5:hunter')).toBe('아란칼_강적사냥꾼'); // 도감처럼 상태가 없으면 속성 생략
  });
});
