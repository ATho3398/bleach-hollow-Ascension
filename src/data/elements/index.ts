// 속성 8종·능력치 6종·공격 분류 3종 (GDD 20장). 종족 무관 데이터 — 이름은 종족별 텍스트(키 '*' 공통)로 읽는다.
// 상성 규칙(순환·배율)은 엔진 공통이고, 어떤 속성이 무엇을 이기는지는 elements.json 의 beats 가 정한다.
import { ATTACK_CATEGORIES, STAT_IDS, pickFaction, type AttackCategory, type ElementDef, type PerFaction, type StatId } from '../schema';
import raw from './elements.json';
import namesRaw from './stats.json';

export function parseElements(r: unknown): ElementDef[] {
  if (!Array.isArray(r) || r.length === 0) throw new Error('속성 데이터 오류: elements.json 은 비어 있지 않은 배열');
  const list = r as ElementDef[];
  const ids = new Set(list.map((e) => e.id));
  const errors: string[] = [];
  for (const e of list) {
    if (!e.id) errors.push('id 없음');
    if (!['normal', 'elemental', 'special'].includes(e.kind)) errors.push(`${e.id}: kind normal | elemental | special`);
    if (e.kind === 'elemental' && (!e.beats || !ids.has(e.beats))) errors.push(`${e.id}: 원소는 beats(있는 속성 id)가 필요`);
    if (e.kind !== 'elemental' && e.beats !== undefined) errors.push(`${e.id}: 원소가 아니면 beats 가 없다 (상성 없음)`);
    if (e.effect !== undefined && !['drain', 'poison'].includes(e.effect)) errors.push(`${e.id}: effect 는 drain | poison (없으면 효과 없음)`);
    if (typeof e.color !== 'string' || !e.color.startsWith('--bha-')) errors.push(`${e.id}: color 는 디자인 토큰 이름(--bha-…)`);
    if (typeof e.name !== 'object' || typeof e.abbr !== 'object') errors.push(`${e.id}: name·abbr`);
    if (e.enemyOnly !== undefined && (e.enemyOnly !== true || e.kind !== 'special')) errors.push(`${e.id}: enemyOnly 는 특수 속성에만 true`);
  }
  if (!list.some((e) => e.kind === 'normal')) errors.push('노멀 속성(kind normal)이 하나 있어야 한다 (1단계 기본 속성)');
  if (errors.length > 0) throw new Error(`속성 데이터 오류:\n- ${errors.join('\n- ')}`);
  return list;
}

export const ELEMENTS: readonly ElementDef[] = parseElements(raw);
export const ELEMENT_IDS: readonly string[] = ELEMENTS.map((e) => e.id);
/** 1단계(진화 전) 캐릭터 속성 = 노멀 (GDD 20-2 v3.5) */
export const NORMAL_ELEMENT: string = ELEMENTS.find((e) => e.kind === 'normal')!.id;
export const ELEMENTAL_IDS: readonly string[] = ELEMENTS.filter((e) => e.kind === 'elemental').map((e) => e.id);
export const SPECIAL_ELEMENT_IDS: readonly string[] = ELEMENTS.filter((e) => e.kind === 'special').map((e) => e.id);
/** 적 전용 속성 (GDD 8-2 v6.154 허무): 플레이어 블록·흡수 블록·일반 진화체가 없다 */
export const ENEMY_ONLY_ELEMENT_IDS: readonly string[] = ELEMENTS.filter((e) => e.enemyOnly === true).map((e) => e.id);
/** 플레이어가 블록으로 가질 수 있는 속성 (적 전용 뺀 나머지) */
export const PLAYER_ELEMENT_IDS: readonly string[] = ELEMENT_IDS.filter((id) => !ENEMY_ONLY_ELEMENT_IDS.includes(id));

/** 적 전용 속성인가 (GDD 8-2 v6.154): 그 속성 블록은 플레이어가 얻지 못한다 */
export function isEnemyOnlyElement(id: string): boolean {
  return ENEMY_ONLY_ELEMENT_IDS.includes(id);
}

export function getElement(id: string): ElementDef {
  const e = ELEMENTS.find((x) => x.id === id);
  if (!e) throw new Error(`알 수 없는 속성: ${id}`);
  return e;
}

export function isElement(id: unknown): id is string {
  return typeof id === 'string' && ELEMENT_IDS.includes(id);
}

export function elementName(id: string, factionId: string): string {
  return pickFaction(getElement(id).name, factionId);
}

export function elementAbbr(id: string, factionId: string): string {
  return pickFaction(getElement(id).abbr, factionId);
}

/** a 가 b 를 강하게 치는가 (원소 순환만) */
export function beats(a: string, b: string): boolean {
  return getElement(a).beats === b;
}

/** 이 속성(들)을 강하게 치는 속성 = 약점 (원소만, 없으면 빈 목록). 융합(2개)은 두 약점을 모두 갖는다 (GDD 20-5 v3.9) */
export function weaknessesOf(elements: readonly string[]): string[] {
  return ELEMENTS.filter((e) => e.beats && elements.includes(e.beats)).map((e) => e.id);
}

export type Matchup = 'strong' | 'weak' | 'neutral';

/**
 * 상성 (GDD 20-2): 공격 속성(들) → 방어 속성(들).
 * - 공격 속성 중 하나라도 방어 속성 중 하나를 이기면 strong (융합 공격은 두 상대 모두에 강하다).
 * - 공격·방어가 모두 한 속성이고 방어가 공격을 이기면 weak. 융합(2개)은 저항이 없고, 융합 공격은 약해지지 않는다 ("큰 힘 큰 책임", 배율 곱셈 없음).
 * - 노멀·특수 속성은 상성이 없다 (beats 가 없으므로 자연히 neutral).
 */
export function matchup(attack: readonly string[], defend: readonly string[]): Matchup {
  if (attack.some((a) => defend.some((d) => beats(a, d)))) return 'strong';
  if (attack.length === 1 && defend.length === 1 && beats(defend[0]!, attack[0]!)) return 'weak';
  return 'neutral';
}

const NAMES = namesRaw as { stats: Record<StatId, PerFaction<string>>; categories: Record<AttackCategory, PerFaction<string>> };
for (const s of STAT_IDS) if (!NAMES.stats[s]) throw new Error(`능력치 이름 없음: ${s}`);
for (const c of ATTACK_CATEGORIES) if (!NAMES.categories[c]) throw new Error(`공격 분류 이름 없음: ${c}`);

export function statName(id: StatId, factionId: string): string {
  return pickFaction(NAMES.stats[id], factionId);
}

export function categoryName(id: AttackCategory, factionId: string): string {
  return pickFaction(NAMES.categories[id], factionId);
}
