// 적 테이블 (양쪽 종족 공유, GDD 6장). 검증을 거쳐 EnemyDef 로 내보낸다.
import type { EnemyDef } from '../schema';
import { LINEAGES } from '../lineages';
import raw from './enemies.json';

export function parseEnemy(r: unknown): EnemyDef {
  const e = (r ?? {}) as Record<string, unknown>;
  const errors: string[] = [];
  if (typeof e.id !== 'string' || !e.id) errors.push('id');
  if (typeof e.name !== 'object' || e.name === null) errors.push('name');
  if (e.class !== 'normal' && e.class !== 'elite') errors.push('class: normal | elite');
  if (typeof e.hpInAttacks !== 'number' || e.hpInAttacks <= 0) errors.push('hpInAttacks: 양수');
  if (typeof e.attackInAttacks !== 'number' || e.attackInAttacks < 0) errors.push('attackInAttacks: 0 이상');
  if (typeof e.lineageId !== 'string' || !e.lineageId) errors.push('lineageId');
  if (typeof e.rareChance !== 'number' || e.rareChance < 0 || e.rareChance > 1) errors.push('rareChance: 0~1');
  // 약점은 계통 1개 (GDD 3-5). 계통 테이블에 있는 id 만
  if (typeof e.weaknessLineageId !== 'string' || !LINEAGES.some((l) => l.id === e.weaknessLineageId)) errors.push('weaknessLineageId: 있는 계통 id');
  if (e.pattern !== undefined) {
    const p = (e.pattern ?? {}) as Record<string, unknown>;
    const pos = (k: string) => typeof p[k] === 'number' && (p[k] as number) > 0;
    if (!['everySeconds', 'castSeconds', 'heavyInAttacks', 'sealSeconds'].every(pos)) errors.push('pattern: everySeconds·castSeconds·heavyInAttacks·sealSeconds 양수');
    if (!Array.isArray(p.sequence) || p.sequence.length === 0 || !p.sequence.every((a) => a === 'heavy' || a === 'seal')) errors.push('pattern.sequence: heavy | seal 목록');
  }
  if (errors.length > 0) throw new Error(`적 데이터 오류 (${String(e.id ?? '?')}): ${errors.join(', ')}`);
  return r as EnemyDef;
}

export const ENEMIES: readonly EnemyDef[] = (raw as unknown[]).map(parseEnemy);

export function getEnemy(id: string): EnemyDef {
  const e = ENEMIES.find((x) => x.id === id);
  if (!e) throw new Error(`알 수 없는 적: ${id}`);
  return e;
}
