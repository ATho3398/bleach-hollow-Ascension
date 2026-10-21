// 지금 속성·BALANCE 템플릿으로 진화체 트리를 새로 만든다 (forms.json 갱신·점검·테스트용). forms.json 에 의존하지 않는다
import { BALANCE } from '../../config/balance';
import { ELEMENTAL_IDS, NORMAL_ELEMENT, SPECIAL_ELEMENT_IDS, beats } from '../elements';
import { ATTACK_CATEGORIES, type FormDef } from '../schema';
import { generateForms, type FormTemplate } from './generate';

/** 원소 순환에서 마주 보는 쌍 = 서로 상성 관계가 아닌 쌍 (GDD 20-5 v3.9: 물+흙, 불+뇌) */
export function fusionPairs(elemental: readonly string[] = ELEMENTAL_IDS): [string, string][] {
  const out: [string, string][] = [];
  elemental.forEach((a, i) => elemental.slice(i + 1).forEach((b) => {
    if (!beats(a, b) && !beats(b, a)) out.push([a, b]);
  }));
  return out;
}

export function generateFormTable(): FormDef[] {
  return generateForms({
    tierTotals: BALANCE.provisional.stats.tierTotals,
    normal: NORMAL_ELEMENT,
    elemental: ELEMENTAL_IDS,
    special: SPECIAL_ELEMENT_IDS,
    categories: ATTACK_CATEGORIES,
    fusionPairs: fusionPairs(),
    template: BALANCE.provisional.evolution.template as unknown as FormTemplate,
    failGainRatio: BALANCE.provisional.evolution.failLine.gainRatio,
  });
}
