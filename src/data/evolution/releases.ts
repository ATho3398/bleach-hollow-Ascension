// 진화체 해방 이름 (GDD 198장): releases.json 의 종족별 { name, command?, final? } 을 4단계 진화체에 release 로 붙인다.
// 이름 데이터는 releases.json 한 곳 — 로더(index.ts)와 생성기(build.ts)가 같은 함수로 붙여 forms.json 과 생성기 결과가 같다.
import type { FormDef, FormRelease, PerFaction } from '../schema';
import raw from './releases.json';

export const FORM_RELEASES = (raw as { forms: Record<string, PerFaction<FormRelease>> }).forms;

export function withReleases(table: FormDef[]): FormDef[] {
  return table.map((f) => (FORM_RELEASES[f.id] ? { ...f, release: FORM_RELEASES[f.id] } : f));
}
