// 적 테이블 (양쪽 종족 공유, GDD 6장). 검증을 거쳐 EnemyDef 로 내보낸다.
import { WEAKNESS_ROLES } from '../../engine/faction';
import type { EnemyDef } from '../schema';
import raw from './enemies.json';

export function parseEnemy(r: unknown): EnemyDef {
  const e = (r ?? {}) as Record<string, unknown>;
  const errors: string[] = [];
  if (typeof e.id !== 'string' || !e.id) errors.push('id');
  if (typeof e.name !== 'object' || e.name === null) errors.push('name');
  if (e.class !== 'normal' && e.class !== 'elite') errors.push('class: normal | elite');
  if (typeof e.hpInMatches !== 'number' || e.hpInMatches <= 0) errors.push('hpInMatches: 양수');
  if (typeof e.attackInMatches !== 'number' || e.attackInMatches < 0) errors.push('attackInMatches: 0 이상');
  if (!(WEAKNESS_ROLES as readonly unknown[]).includes(e.weakness)) errors.push('weakness: damage | spirit | shield');
  if (errors.length > 0) throw new Error(`적 데이터 오류 (${String(e.id ?? '?')}): ${errors.join(', ')}`);
  return r as EnemyDef;
}

export const ENEMIES: readonly EnemyDef[] = (raw as unknown[]).map(parseEnemy);

export function getEnemy(id: string): EnemyDef {
  const e = ENEMIES.find((x) => x.id === id);
  if (!e) throw new Error(`알 수 없는 적: ${id}`);
  return e;
}
