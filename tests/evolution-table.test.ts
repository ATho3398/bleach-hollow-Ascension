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

describe('트리 규모 (GDD 126장, C.220 4단계)', () => {
  it('2단계 1종 · 3단계 노멀+원소 5 + 히든 2(망한 진화체·통로) · 4단계 일반 18(노멀·원소 × 타입 3 + 혈 물리·독 특수·허 혼합) + 히든 10', () => {
    const n = (tier: number, hidden: boolean) => formsOfTier(tier).filter((f) => !!f.hidden === hidden).length;
    expect([n(2, false), n(3, false), n(4, false), n(5, false)]).toEqual([1, ELEMENT_IDS.length - SPECIAL_ELEMENT_IDS.length, (ELEMENT_IDS.length - SPECIAL_ELEMENT_IDS.length) * ATTACK_CATEGORIES.length + SPECIAL_ELEMENT_IDS.length, 0]);
    expect([n(2, true), n(3, true), n(4, true)]).toEqual([0, 2, 10]);
    for (const el of ELEMENT_IDS) {
      expect(formsOfTier(3).some((f) => f.id === `t3:${el}`)).toBe(!SPECIAL_ELEMENT_IDS.includes(el));
      const typed = ATTACK_CATEGORIES.filter((c) => formsOfTier(4).some((f) => f.id === `t4:${el}:${c}`));
      expect(typed.length, el).toBe(SPECIAL_ELEMENT_IDS.includes(el) ? 1 : 3);
    }
    expect(['t4:blood:physical', 't4:poison:special', 't4:kyo:mixed'].every((id) => FORM_TABLE.some((f) => f.id === id))).toBe(true);
  });
  it('히든 12종 = 3단계 망한 진화체·통로 + 4단계 융합 2 · 4속성형 · 실패형 · 각성형 · 폭주형 · 절제형 · 안정형 · 사냥꾼 · 허무형 (타입 고정)', () => {
    const hidden = FORM_TABLE.filter((f) => f.hidden).map((f) => `${f.tier}:${f.label.kind}`).sort();
    expect(hidden).toEqual(['3:fail', '3:passage', '4:awakened', '4:complete', '4:fail', '4:frenzy', '4:fusion', '4:fusion', '4:hunter', '4:restraint', '4:stable', '4:void'].sort());
    const cat = (id: string) => FORM_TABLE.find((f) => f.id === id)!.label.category;
    expect([cat('h4:fusion:water+earth'), cat('h4:complete'), cat('h4:fail'), cat('h4:awakened'), cat('h4:frenzy'), cat('h4:restraint'), cat('h4:stable'), cat('h4:hunter'), cat('h4:void')])
      .toEqual(['mixed', 'mixed', 'physical', 'mixed', 'physical', 'special', 'special', 'physical', 'mixed']);
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
  it('같은 단계는 합계가 같다 (4속성형·각성형은 높게, 실패형은 낮게)', () => {
    for (const f of FORM_TABLE) {
      const scale = BALANCE.provisional.evolution.template.totalScale[f.label.kind] ?? 1;
      // 실패형 (C.106, 49-8): 그 전 단계 합계 + 그 단계 오름분 × gainRatio
      const want = f.label.kind === 'fail' ? Math.round(SX.tierTotals[f.tier - 2]! + (SX.tierTotals[f.tier - 1]! - SX.tierTotals[f.tier - 2]!) * BALANCE.provisional.evolution.failLine.gainRatio) : Math.round(SX.tierTotals[f.tier - 1]! * scale);
      expect(sum(f), f.id).toBe(want);
    }
    const complete = FORM_TABLE.find((f) => f.id === 'h4:complete')!;
    const fail = FORM_TABLE.find((f) => f.id === 'h4:fail')!;
    expect(sum(complete)).toBeGreaterThan(sum(fail));
    for (const f of FACTIONS) expect(STAT_IDS.reduce((a, k) => a + f.baseStats[k], 0)).toBe(SX.tierTotals[0]);
  });
  it('4단계 타입은 종족값 쏠림을 정한다: 물리 = 힘 > 지능, 특수 = 지능 > 힘', () => {
    for (const el of ELEMENT_IDS.filter((x) => !SPECIAL_ELEMENT_IDS.includes(x))) {
      const p = FORM_TABLE.find((f) => f.id === `t4:${el}:physical`)!;
      const s = FORM_TABLE.find((f) => f.id === `t4:${el}:special`)!;
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
  it('안정형만 자기 속성 보정을 따로 가진다 (옛 순수형 값, provisional)', () => {
    expect(FORM_TABLE.filter((f) => f.stab !== undefined).map((f) => f.id)).toEqual(['h4:stable']);
  });
});

describe('속성·이동 방식·체인 상한', () => {
  it('4단계 행동 히든(폭주형·절제형·사냥꾼·각성형·안정형)만 속성을 잇고(elements 없음), 나머지는 1~2개의 속성을 가진다', () => {
    for (const f of FORM_TABLE) {
      if (['frenzy', 'restraint', 'hunter', 'awakened', 'stable'].includes(f.label.kind)) expect(f.elements, f.id).toBeUndefined();
      else expect(f.elements!.length, f.id).toBeGreaterThanOrEqual(1);
    }
  });
  it('체인 묶음 상한은 모두 3 (이동 방식 값은 없다 = 모두 걷기, GDD 125장)', () => {
    for (const f of FORM_TABLE) expect(f.maxChain).toBe(3);
  });
});

describe('도달 가능성 (점검 도구)', () => {
  it('무작위 상태에서 모든 진화체가 한 번 이상 뽑힌다', () => {
    const r = analyzeTree(FORM_TABLE, 'hollow', BALANCE.provisional.evolution.analysis.samples, BALANCE.provisional.evolution.analysis.seed);
    expect(r.unreachable).toEqual([]);
    for (const [tier, x] of Object.entries(r.hiddenRate)) if (Number(tier) <= 2) expect(x.hidden).toBe(0);
  });
});

describe('검증기', () => {
  const base = FORM_TABLE.find((f) => f.id === 't3:fire')!;
  it('잘못된 단계·속성·종족값·잇기 진화체를 잡는다', () => {
    expect(validateFormTable([...FORM_TABLE, { ...base }])).toContain('진화체 id 중복: t3:fire');
    expect(validateFormTable([{ ...base, id: 'x', tier: 6 }]).join()).toMatch(/단계 6/);
    expect(validateFormTable([{ ...base, id: 'x', elements: ['zzz'] }]).join()).toMatch(/알 수 없는 속성 zzz/);
    expect(validateFormTable([{ ...base, id: 'x', stats: { ...base.stats, hp: 0 } }]).join()).toMatch(/stats.hp/);
    expect(validateFormTable([{ ...base, id: 'x', elements: undefined }]).join()).toMatch(/마지막 단계만/);
  });
});

describe('이름 자리 표시 (종족 설정 단계 이름, 원작 이름 없음)', () => {
  it('종족마다 단계 이름이 바뀌고 속성·분류 이름이 붙는다', () => {
    for (const fac of FACTIONS) {
      const t3 = FORM_TABLE.find((f) => f.id === 't3:fire')!;
      expect(placeholderName(t3, fac.id)).toContain(fac.tierNames[2]);
      expect(formName(t3, fac.id)).toContain('불');
      const t4 = FORM_TABLE.find((f) => f.id === 't4:water:special')!;
      const specialAbbr = fac.families.find((x) => x.category === 'special')!.abbr;
      expect(formName(t4, fac.id)).toBe(`${fac.tierNames[3]}_물_${specialAbbr}`);
      for (const f of FORM_TABLE) {
        expect(formName(f, fac.id).length).toBeGreaterThan(0);
        expect(formHint(f, fac.id).length).toBeGreaterThan(0);
      }
    }
    expect(formName(FORM_TABLE.find((f) => f.id === 'h4:fusion:water+earth')!, 'hollow')).toContain('융합');
  });
  it('형식 `단계_속성_분류` (GDD 20장 v5.3): 2단계는 단계 이름만, 히든은 `단계_히든 이름`, 행동 히든은 이은 속성을 뒤에', () => {
    const name = (id: string, fac = 'hollow', inh: string[] = []) => formName(FORM_TABLE.find((f) => f.id === id)!, fac, inh);
    expect(name('t2:base')).toBe('길리안');
    expect(name('t3:normal')).toBe('아쥬커스_노멀');
    expect(name('t3:fire')).toBe('아쥬커스_불');
    expect(name('t4:fire:special')).toBe('바스트로데_불_탄');
    expect(name('t4:fire:physical')).toBe('바스트로데_불_조');
    expect(name('t4:fire:mixed')).toBe('바스트로데_불_교');
    expect(name('t4:fire:special', 'shinigami')).toBe('수석 대원_불_귀');
    expect(name('t3:fire', 'shinigami')).toBe('평대원_불');
    expect(name('h3:passage')).toBe('아쥬커스_히든');
    expect(name('h3:fail')).toBe('호로'); // C.106 (49-8 2번): 망한 진화체·실패형은 1단계 이름 그대로
    expect(name('h4:fusion:water+earth')).toBe('바스트로데_융합_물흙');
    expect(name('h4:complete')).toBe('바스트로데_4속성형');
    expect(name('h4:fail')).toBe('호로');
    expect(name('h4:fail', 'shinigami')).toBe('혼백');
    expect(name('h4:frenzy', 'hollow', ['fire'])).toBe('바스트로데_폭주형_불');
    expect(name('h4:frenzy', 'shinigami', ['fire'])).toBe('수석 대원_호로화형_불');
    expect(name('h4:restraint', 'hollow', ['water', 'earth'])).toBe('바스트로데_절제형_물흙');
    expect(name('h4:hunter')).toBe('바스트로데_사냥꾼'); // 도감처럼 상태가 없으면 속성 생략
    expect(name('h4:void')).toBe('바스트로데_허무형');
  });
});
