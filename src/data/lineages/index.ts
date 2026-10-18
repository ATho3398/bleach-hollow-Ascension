// 흡수 계통 테이블 (GDD 4장). 11-3 이 미정이라 임시 계통 5개("계통A~E" 자리 표시)만 있다 (GDD 4-2).
import { PASSIVE_STATS, pickFaction, type LineageDef } from '../schema';
import raw from './lineages.json';

export function parseLineage(r: unknown): LineageDef {
  const l = (r ?? {}) as Record<string, unknown>;
  if (typeof l.id !== 'string' || !l.id || typeof l.name !== 'object' || l.name === null) {
    throw new Error(`계통 데이터 오류 (${String(l.id ?? '?')}): id, name`);
  }
  if (l.tendency !== undefined) {
    const t = l.tendency as Record<string, unknown>;
    if (!(PASSIVE_STATS as readonly unknown[]).includes(t.stat) || typeof t.multiplier !== 'number' || t.multiplier <= 0) {
      throw new Error(`계통 데이터 오류 (${l.id}): tendency { stat, multiplier: 양수 }`);
    }
  }
  return r as LineageDef;
}

export const LINEAGES: readonly LineageDef[] = (raw as unknown[]).map(parseLineage);

export function getLineage(id: string): LineageDef {
  const l = LINEAGES.find((x) => x.id === id);
  if (!l) throw new Error(`알 수 없는 계통: ${id}`);
  return l;
}

export function lineageName(id: string, factionId: string): string {
  return pickFaction(getLineage(id).name, factionId);
}

/** 조합 키 표시용 짧은 이름 ("A") */
export function lineageShortName(id: string, factionId: string): string {
  const l = getLineage(id);
  return pickFaction(l.shortName ?? l.name, factionId);
}

/** 이 계통을 약점으로 가진 적에게 ×1.5 를 받는 계열 (GDD 17-3). 없으면 null */
export function lineageFamily(id: string): string | null {
  return getLineage(id).family ?? null;
}
