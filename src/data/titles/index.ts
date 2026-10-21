// 칭호 데이터 (GDD 8장, 14-7). 조건은 전부 임시(provisional)이며 대부분 null(해금 불가)이다.
import { FORM_KINDS, pickFaction, type TitleCondition, type TitleDef } from '../schema';
import { isElement } from '../elements';
import { tryGetForm } from '../evolution';
import raw from './titles.json';
import { isBossId } from '../bosses';
import { STORY_CHAPTERS } from '../story';
import { BALANCE } from '../../config/balance';

const TOWER_FLOORS = BALANCE.provisional.tower.floors;

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
    case 'rankReached':
      return Number.isInteger(c.rank) && c.rank >= 1 && c.rank <= 10 ? [] : [`rankReached: rank 는 1~10`];
    case 'bossDefeated':
      return isBossId(c.bossId) ? [] : [`알 수 없는 보스 ${c.bossId}`];
    case 'towerFloorCleared':
      return Number.isInteger(c.floor) && c.floor >= 1 && c.floor <= TOWER_FLOORS ? [] : [`towerFloorCleared: floor 는 1~${TOWER_FLOORS}`];
    case 'lineageStatTotal': {
      const tiers = BALANCE.provisional.stats.tierTotals.length;
      const e: string[] = (FORM_KINDS as readonly string[]).includes(c.lineageKind) ? [] : [`알 수 없는 진화체 종류 ${c.lineageKind}`];
      if (!(Number.isInteger(c.minTier) && c.minTier >= 1 && c.minTier <= tiers)) e.push(`lineageStatTotal: minTier 는 1~${tiers}`);
      if (!(Number.isInteger(c.totalOfTier) && c.totalOfTier >= 1 && c.totalOfTier <= tiers)) e.push(`lineageStatTotal: totalOfTier 는 1~${tiers}`);
      return e;
    }
    case 'storyChapterCleared':
      return STORY_CHAPTERS.some((x) => x.id === c.chapterId) ? [] : [`알 수 없는 장 ${c.chapterId}`];
    default:
      return 'min' in c && !(c.min > 0) ? [`${c.type}: min 은 1 이상`] : [];
  }
}

export function parseTitle(r: unknown): TitleDef {
  const t = (r ?? {}) as Partial<TitleDef>;
  if (typeof t.id !== 'string' || !t.id || typeof t.name !== 'object' || t.name === null) throw new Error(`칭호 데이터 오류 (${String(t.id ?? '?')}): id, name`);
  if (t.factions !== undefined) {
    if (!Array.isArray(t.factions) || t.factions.length === 0) throw new Error(`칭호 데이터 오류 (${t.id}): factions 는 비지 않은 목록`);
    for (const f of t.factions) if (typeof (t.name as Record<string, unknown>)[f] !== 'string' && typeof (t.name as Record<string, unknown>)['*'] !== 'string') throw new Error(`칭호 데이터 오류 (${t.id}): 종족 ${f} 이름이 없다`);
  }
  if (t.condition) {
    if (t.provisional !== true) throw new Error(`칭호 데이터 오류 (${t.id}): 조건이 있으면 provisional: true (11-7 미정)`);
    const errors = validateCondition(t.condition);
    if (errors.length > 0) throw new Error(`칭호 데이터 오류 (${t.id}): ${errors.join(', ')}`);
  }
  return { ...(t as TitleDef), condition: t.condition ?? null };
}

export const TITLES: readonly TitleDef[] = (raw as unknown[]).map(parseTitle);

/** 이 종족 트랙의 칭호인가 (factions 가 없으면 모두) */
export function titleForFaction(t: Pick<TitleDef, 'factions'>, factionId: string): boolean {
  return t.factions === undefined || t.factions.includes(factionId);
}

/** 이 종족에게 보이는 칭호 목록 (도감·개수) */
export function titlesForFaction(factionId: string, defs: readonly TitleDef[] = TITLES): TitleDef[] {
  return defs.filter((d) => titleForFaction(d, factionId));
}

/** 종족별 이름. 다른 종족 전용 칭호(그 종족 트랙에서 받은 것)는 그 종족 이름으로 */
export function titleName(t: TitleDef, factionId: string): string {
  return pickFaction(t.name, titleForFaction(t, factionId) ? factionId : t.factions![0]!);
}
