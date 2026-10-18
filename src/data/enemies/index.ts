// 적 테이블 (양쪽 종족 공유, GDD 6장·14-5). 검증을 거쳐 EnemyDef 로 내보낸다.
import { ENEMY_PATTERN_KINDS, type EnemyDef, type EnemyPattern, type EnemyPatternKind } from '../schema';
import { LINEAGES } from '../lineages';
import raw from './enemies.json';
import poolRaw from './pools.json';

const num = (o: Record<string, unknown>, k: string) => typeof o[k] === 'number' && (o[k] as number) > 0;

/** 패턴 필드 검증: 종류마다 필요한 양수 필드가 다르다 */
function patternErrors(p: Record<string, unknown>): string[] {
  const need = (keys: string[]) => (keys.every((k) => num(p, k)) ? [] : [`pattern(${String(p.kind)}): ${keys.join('·')} 양수`]);
  switch (p.kind) {
    case 'basic':
      return [];
    case 'swift':
    case 'sturdy':
      return need(['attackSeconds']);
    case 'heavy-seal': {
      const errs = need(['everySeconds', 'castSeconds', 'heavyInAttacks', 'sealSeconds']);
      if (!Array.isArray(p.sequence) || p.sequence.length === 0 || !p.sequence.every((a) => a === 'heavy' || a === 'seal')) errs.push('pattern.sequence: heavy | seal 목록');
      return errs;
    }
    case 'heavy-chain': {
      const errs = need(['everySeconds', 'castSeconds', 'heavyInAttacks', 'hits', 'followCastSeconds']);
      if (num(p, 'hits') && !Number.isInteger(p.hits)) errs.push('pattern.hits: 정수');
      return errs;
    }
    case 'stance': {
      const errs = need(['everySeconds', 'stanceSeconds', 'blockDamageMultiplier', 'counterInAttacks']);
      if (num(p, 'blockDamageMultiplier') && (p.blockDamageMultiplier as number) >= 1) errs.push('pattern.blockDamageMultiplier: 1 미만');
      if (num(p, 'everySeconds') && num(p, 'stanceSeconds') && (p.everySeconds as number) <= (p.stanceSeconds as number)) errs.push('pattern.everySeconds: stanceSeconds 보다 커야 한다');
      return errs;
    }
    default:
      return [`pattern.kind: ${ENEMY_PATTERN_KINDS.join(' | ')}`];
  }
}

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
  if (e.pattern !== undefined) errors.push(...patternErrors((e.pattern ?? {}) as Record<string, unknown>));
  if (errors.length > 0) throw new Error(`적 데이터 오류 (${String(e.id ?? '?')}): ${errors.join(', ')}`);
  return r as EnemyDef;
}

export const ENEMIES: readonly EnemyDef[] = (raw as unknown[]).map(parseEnemy);

export function getEnemy(id: string): EnemyDef {
  const e = ENEMIES.find((x) => x.id === id);
  if (!e) throw new Error(`알 수 없는 적: ${id}`);
  return e;
}

/** 이 적의 패턴 종류. 패턴이 없으면 기본형 */
export function enemyPatternKind(def: EnemyDef): EnemyPatternKind {
  return def.pattern?.kind ?? 'basic';
}

/** 특수 행동(강공격·봉인·방어 자세)이 있는 패턴인가 = everySeconds 로 돌아가는 패턴 */
export function hasSpecialActions(p: EnemyPattern | undefined): p is Extract<EnemyPattern, { everySeconds: number }> {
  return p !== undefined && 'everySeconds' in p;
}

/** 바퀴 강화를 적용한 사본: 체력·기본 공격은 hp·attack 배율, 패턴의 큰 한 방(강공격·반격)은 attack 배율 */
export function scaleEnemy(base: EnemyDef, k: { hp: number; attack: number }): EnemyDef {
  const out: EnemyDef = { ...base, hpInAttacks: base.hpInAttacks * k.hp, attackInAttacks: base.attackInAttacks * k.attack };
  const p = base.pattern;
  if (p && (p.kind === 'heavy-seal' || p.kind === 'heavy-chain')) out.pattern = { ...p, heavyInAttacks: p.heavyInAttacks * k.attack };
  else if (p && p.kind === 'stance') out.pattern = { ...p, counterInAttacks: p.counterInAttacks * k.attack };
  return out;
}

// ── 출현 풀 규칙 (GDD 14-5, 임시): 패턴 종류마다 처음 나오는 바퀴와 가중치 ──
export interface PoolRule {
  minLap: number;
  weight: number;
}
export interface PoolConfig {
  kinds: Record<EnemyPatternKind, PoolRule>;
  /** 출처(야생 'wild' / 타일 종류 / 'combo')마다 minLap 을 이만큼 앞당긴다 (환경·조합 = 한 바퀴 일찍 센 적) */
  sourceLapBonus: Record<string, number>;
  provisional?: boolean;
}

export function parsePoolConfig(r: unknown): PoolConfig {
  const c = (r ?? {}) as { kinds?: Record<string, PoolRule>; sourceLapBonus?: Record<string, number> };
  for (const k of ENEMY_PATTERN_KINDS) {
    const rule = c.kinds?.[k];
    if (!rule || !Number.isInteger(rule.minLap) || rule.minLap < 1 || typeof rule.weight !== 'number' || rule.weight <= 0) throw new Error(`적 풀 규칙 오류: ${k} { minLap: 1 이상 정수, weight: 양수 }`);
  }
  return r as PoolConfig;
}

export const POOL_CONFIG: PoolConfig = parsePoolConfig(poolRaw);
