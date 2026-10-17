// 지금 계통·BALANCE 템플릿으로 진화체 테이블을 새로 만든다 (forms.json 갱신·점검·테스트용). forms.json 에 의존하지 않는다
import { BALANCE } from '../../config/balance';
import { LINEAGES, getLineage } from '../lineages';
import type { FormDef } from '../schema';
import { generateForms, type FormTemplate } from './generate';

export function generateFormTable(lineageIds: readonly string[] = LINEAGES.map((l) => l.id)): FormDef[] {
  return generateForms(lineageIds, BALANCE.provisional.evolution.template as unknown as FormTemplate, (id) => getLineage(id).tendency);
}
