// 칭호 데이터 (GDD 8장, 14-7). 조건은 전부 임시(provisional)이며 대부분 null(해금 불가)이다.
import { pickFaction, type TitleCondition, type TitleDef } from '../schema';
import { isElement } from '../elements';
import { tryGetForm } from '../evolution';
import raw from './titles.json';

/** 조건 트리의 오류 목록 (속성·진화체 id 가 실제로 있는지, min 이 양수인지) */
export function validateCondition(c: TitleCondition): string[] {
  switch (c.type) {
    case 'and':
      return c.all.length === 0 ? ['and 가 비었다'] : c.all.flatMap(validateCondition);
    case 'or':
      return c.any.length === 0 ? ['or 가 비었다'] : c.any.flatMap(validateCondition);
    case 'passedForm':
      return tryGetForm(c.formId) ? [] : [`알 수 없는 진화체 ${c.formId}`];
    case 'absorbCount': {
      const e = c.min > 0 ? [] : ['min 은 1 이상'];
      return c.element && !isElement(c.element) ? [...e, `알 수 없는 속성 ${c.element}`] : e;
    }
    default:
      return 'min' in c && !(c.min > 0) ? [`${c.type}: min 은 1 이상`] : [];
  }
}

export function parseTitle(r: unknown): TitleDef {
  const t = (r ?? {}) as Partial<TitleDef>;
  if (typeof t.id !== 'string' || !t.id || typeof t.name !== 'object' || t.name === null) throw new Error(`칭호 데이터 오류 (${String(t.id ?? '?')}): id, name`);
  if (t.condition) {
    if (t.provisional !== true) throw new Error(`칭호 데이터 오류 (${t.id}): 조건이 있으면 provisional: true (11-7 미정)`);
    const errors = validateCondition(t.condition);
    if (errors.length > 0) throw new Error(`칭호 데이터 오류 (${t.id}): ${errors.join(', ')}`);
  }
  return { ...(t as TitleDef), condition: t.condition ?? null };
}

export const TITLES: readonly TitleDef[] = (raw as unknown[]).map(parseTitle);

export function titleName(t: TitleDef, factionId: string): string {
  return pickFaction(t.name, factionId);
}
