// 진화체 해방 이름 (GDD 198장): releases.json 의 종족별 { name, command?, final? } 을 4단계 진화체에 release 로 붙인다.
// 이름 데이터는 releases.json 한 곳 — 로더(index.ts)와 생성기(build.ts)가 같은 함수로 붙여 forms.json 과 생성기 결과가 같다.
import type { AttackCategory, FormDef, FormRelease, PerFaction } from '../schema';
import raw from './releases.json';
import rawCategories from './factionCategories.json';

export const FORM_RELEASES = (raw as { forms: Record<string, PerFaction<FormRelease>> }).forms;

/** 종족마다 공격 타입이 다른 진화체 (GDD 8-8, C.497 — factionCategories.json): 진화체 id → 종족 id → 타입 */
export const FORM_FACTION_CATEGORIES = (rawCategories as { forms: Record<string, PerFaction<AttackCategory>> }).forms;

/** 해방 이름(releases.json)과 종족별 공격 타입(factionCategories.json)을 진화체에 붙인다 — 로더·생성기 공용 */
export function withReleases(table: FormDef[]): FormDef[] {
  return table.map((f) => {
    const release = FORM_RELEASES[f.id];
    const cats = FORM_FACTION_CATEGORIES[f.id];
    return release || cats ? { ...f, ...(release ? { release } : {}), ...(cats ? { categoryByFaction: cats } : {}) } : f;
  });
}
