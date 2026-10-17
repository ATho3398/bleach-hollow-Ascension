// 지형 타일 테이블 (GDD 6장). 효과 종류는 엔진, 이름만 종족 스킨. 모두 임시(provisional).
import type { EnvironmentPreset, PerFaction, TerrainTileDef } from '../schema';
import raw from './tiles.json';

const KINDS = ['prey-nest', 'elite-den', 'environment', 'rest', 'combo'];
const PRESETS: EnvironmentPreset[] = ['reshuffle', 'power', 'shield', 'void'];

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
  } else if (e.type !== 'rest') errors.push('effect.type');
  if (errors.length > 0) throw new Error(`지형 타일 데이터 오류 (${String(t.id ?? '?')}): ${errors.join(', ')}`);
  return r as TerrainTileDef;
}

export const TERRAIN_TILES: readonly TerrainTileDef[] = (raw as unknown[]).map(parseTile);

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

export function tileName(id: string, factionId: string): string {
  return nameMap(getTile(id).name, factionId) ?? id;
}
