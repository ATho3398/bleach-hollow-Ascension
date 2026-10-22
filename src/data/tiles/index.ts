// 지형 타일 테이블 (GDD 6장). 효과 종류는 엔진, 이름만 종족 스킨. 모두 임시(provisional).
// C.57 (GDD 25-5): 이벤트 타일(kind 'event'), 상위 타일("+", 바탕 타일마다 자동으로 하나), 인접 시너지 표·바퀴 변이 표.
import { TILE_EVENTS, type EnvironmentPreset, type PerFaction, type TerrainTileDef, type TileEvent } from '../schema';
import raw from './tiles.json';
import synergyRaw from './synergies.json';
import mutationRaw from './mutations.json';

const KINDS = ['prey-nest', 'elite-den', 'environment', 'rest', 'combo', 'event', 'special'];
const PRESETS: EnvironmentPreset[] = ['reshuffle', 'power', 'shield', 'void', 'training'];
/** 상위 타일을 만들 수 있는 종류 (GDD 25-5 ⑤: 이벤트 타일은 합성 불가) */
export const UPGRADABLE_KINDS: readonly TerrainTileDef['kind'][] = ['prey-nest', 'elite-den', 'environment', 'rest'];
/** 상위 타일 id = 바탕 id + 이 꼬리, 이름 = 바탕 이름 + "+" */
export const UPGRADE_SUFFIX = '-plus';

export function parseTile(r: unknown): TerrainTileDef {
  const t = (r ?? {}) as Record<string, unknown>;
  const e = (t.effect ?? {}) as Record<string, unknown>;
  const errors: string[] = [];
  if (typeof t.id !== 'string' || !t.id) errors.push('id');
  if (!KINDS.includes(t.kind as string)) errors.push('kind');
  if (typeof t.name !== 'object' || t.name === null || Object.keys(t.name).length === 0) errors.push('name');
  if (e.type === 'spawn') {
    if (e.enemyClass !== 'normal' && e.enemyClass !== 'elite') errors.push('effect.enemyClass');
  } else if (e.type === 'environment') {
    if (!PRESETS.includes(e.preset as EnvironmentPreset)) errors.push('effect.preset');
  } else if (e.type === 'event') {
    if (!(TILE_EVENTS as readonly string[]).includes(e.event as string)) errors.push('effect.event');
    if (t.kind !== 'event') errors.push('kind(event)');
  } else if (e.type === 'echo') {
    if (t.kind !== 'special') errors.push('kind(special)');
  } else if (e.type !== 'rest') errors.push('effect.type');
  if (errors.length > 0) throw new Error(`지형 타일 데이터 오류 (${String(t.id ?? '?')}): ${errors.join(', ')}`);
  return r as TerrainTileDef;
}

/** 바탕 타일 하나의 상위 타일 정의 (이름 뒤 "+", 효과 종류는 그대로) */
export function upgradedDef(t: TerrainTileDef): TerrainTileDef {
  const name: PerFaction<string> = {};
  for (const [k, v] of Object.entries(t.name)) name[k] = `${v}+`;
  return { ...t, id: `${t.id}${UPGRADE_SUFFIX}`, name, upgradeOf: t.id };
}

const BASE_TILES: TerrainTileDef[] = (raw as unknown[]).map(parseTile);
export const TERRAIN_TILES: readonly TerrainTileDef[] = [...BASE_TILES, ...BASE_TILES.filter((t) => UPGRADABLE_KINDS.includes(t.kind)).map(upgradedDef)];

export function getTile(id: string): TerrainTileDef {
  const t = TERRAIN_TILES.find((x) => x.id === id);
  if (!t) throw new Error(`알 수 없는 지형 타일: ${id}`);
  return t;
}

export function nameMap(map: PerFaction<string>, factionId: string): string | undefined {
  return map[factionId] ?? map['*'];
}

/** 이 종족이 쓰는 타일인가 (스킨 이름이 있는 타일) */
export function tileAvailable(t: TerrainTileDef, factionId: string): boolean {
  return nameMap(t.name, factionId) !== undefined;
}

export function tilesFor(factionId: string): TerrainTileDef[] {
  return TERRAIN_TILES.filter((t) => tileAvailable(t, factionId));
}

/** 덱에 넣을 수 있는 타일 (이벤트 타일은 드래프트로만, GDD 25-5 ③). 바탕 타일 먼저, 상위 타일은 뒤 */
export function deckTilesFor(factionId: string): TerrainTileDef[] {
  return tilesFor(factionId).filter((t) => t.kind !== 'event');
}

/** 바탕 타일(상위·이벤트 아님): 드래프트 '덱 밖 타일' 후보 */
export function baseTilesFor(factionId: string): TerrainTileDef[] {
  return tilesFor(factionId).filter((t) => t.kind !== 'event' && !t.upgradeOf);
}

export function eventTilesFor(factionId: string): TerrainTileDef[] {
  return tilesFor(factionId).filter((t) => t.kind === 'event');
}

/** 상위 타일 id (합성할 수 없는 타일이면 null) */
export function upgradeIdOf(id: string): string | null {
  const t = getTile(id);
  if (t.upgradeOf || !UPGRADABLE_KINDS.includes(t.kind)) return null;
  return `${id}${UPGRADE_SUFFIX}`;
}

/** 이벤트 타일의 이벤트 (아니면 null) */
export function tileEventOf(id: string): TileEvent | null {
  const e = getTile(id).effect;
  return e.type === 'event' ? e.event : null;
}

export function tileName(id: string, factionId: string): string {
  return nameMap(getTile(id).name, factionId) ?? id;
}

// ── 인접 시너지 표 (GDD 25-5 ②) ──
export interface TileMatcher {
  kind: TerrainTileDef['kind'];
  preset?: EnvironmentPreset;
}

export interface SynergyDef {
  id: string;
  a: TileMatcher;
  b: TileMatcher;
  name: PerFaction<string>;
}

function parseMatcher(m: unknown, where: string): TileMatcher {
  const o = (m ?? {}) as Record<string, unknown>;
  if (!KINDS.includes(o.kind as string) || o.kind === 'event' || o.kind === 'special') throw new Error(`시너지 표 오류 (${where}): kind`);
  if (o.preset !== undefined && !PRESETS.includes(o.preset as EnvironmentPreset)) throw new Error(`시너지 표 오류 (${where}): preset`);
  return o as unknown as TileMatcher;
}

export const SYNERGIES: readonly SynergyDef[] = (synergyRaw.synergies as unknown[]).map((r) => {
  const o = r as Record<string, unknown>;
  if (typeof o.id !== 'string' || typeof o.name !== 'object' || o.name === null) throw new Error('시너지 표 오류: id·name');
  return { id: o.id, a: parseMatcher(o.a, `${o.id}.a`), b: parseMatcher(o.b, `${o.id}.b`), name: o.name as PerFaction<string> };
});

export function getSynergy(id: string): SynergyDef {
  const s = SYNERGIES.find((x) => x.id === id);
  if (!s) throw new Error(`알 수 없는 시너지: ${id}`);
  return s;
}

export function synergyName(id: string, factionId: string): string {
  return nameMap(getSynergy(id).name, factionId) ?? id;
}

/** 타일이 짝 조건에 맞는가 (상위 타일은 바탕 종류·프리셋 그대로) */
export function matchesTile(m: TileMatcher, t: TerrainTileDef): boolean {
  if (t.kind !== m.kind) return false;
  if (m.preset === undefined) return true;
  return t.effect.type === 'environment' && t.effect.preset === m.preset;
}

// ── 바퀴 변이 표 (GDD 25-5 ④) ──
export interface MutationDef {
  id: string;
  name: PerFaction<string>;
}

export const MUTATIONS: readonly MutationDef[] = (mutationRaw.mutations as unknown[]).map((r) => {
  const o = r as Record<string, unknown>;
  if (typeof o.id !== 'string' || typeof o.name !== 'object' || o.name === null) throw new Error('바퀴 변이 표 오류: id·name');
  return { id: o.id, name: o.name as PerFaction<string> };
});

export function isMutationId(id: unknown): id is string {
  return typeof id === 'string' && MUTATIONS.some((m) => m.id === id);
}

export function mutationName(id: string, factionId: string): string {
  const m = MUTATIONS.find((x) => x.id === id);
  return (m && nameMap(m.name, factionId)) ?? id;
}
