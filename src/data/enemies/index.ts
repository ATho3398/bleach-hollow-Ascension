// 적 테이블 (양쪽 종족 공유, GDD 6장·14-5). 검증을 거쳐 EnemyDef 로 내보낸다.
import { ATTACK_CATEGORIES, ENEMY_PATTERN_KINDS, STAT_IDS, pickFaction, type EnemyDef, type EnemyPattern, type EnemyPatternKind } from '../schema';
import { elementName, isElement } from '../elements';
import raw from './enemies.json';
import poolRaw from './pools.json';
import gradesRaw from './grades.json';
import practiceRaw from './practice.json';
import dexNamesRaw from './dexNames.json';
import bodiesRaw from './bodies.json';

/** 적 등급 표 (GDD 198장): 강적·보스 고정 등급, 도감 전용 표시 */
export const ENEMY_GRADES = gradesRaw as { order: string[]; names: Record<string, string>; menos: string[]; menosName: string };

export function isEnemyGrade(v: unknown): v is string {
  return typeof v === 'string' && ENEMY_GRADES.order.includes(v);
}

/** 등급 표시 이름 (예 '아쥬커스'). 등급이 없으면 null */
export function enemyGradeName(def: Pick<EnemyDef, 'grade'>): string | null {
  return def.grade && isEnemyGrade(def.grade) ? ENEMY_GRADES.names[def.grade] ?? null : null;
}

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
  if (!isElement(e.element)) errors.push(`element: 없는 속성 ${String(e.element)}`);
  if (!(ATTACK_CATEGORIES as readonly unknown[]).includes(e.category)) errors.push(`category: ${ATTACK_CATEGORIES.join(' | ')}`);
  if (e.attackCategory !== undefined && !(ATTACK_CATEGORIES as readonly unknown[]).includes(e.attackCategory)) errors.push(`attackCategory: ${ATTACK_CATEGORIES.join(' | ')}`);
  const hc = (e.pattern as { heavyCategories?: unknown } | undefined)?.heavyCategories;
  if (hc !== undefined && !(Array.isArray(hc) && hc.every((c) => (ATTACK_CATEGORIES as readonly unknown[]).includes(c)))) errors.push('pattern.heavyCategories: 분류 목록');
  if (e.physicalShare !== undefined && !(typeof e.physicalShare === 'number' && e.physicalShare >= 0 && e.physicalShare <= 1)) errors.push('physicalShare: 0~1');
  const statMap = (v: unknown, min: number) => typeof v === 'object' && v !== null && Object.entries(v).every(([k, x]) => (STAT_IDS as readonly string[]).includes(k) && typeof x === 'number' && x >= min);
  if (e.statBias !== undefined && !statMap(e.statBias, 0.01)) errors.push('statBias: { 능력치: 양수 배율 }');
  if (!statMap(e.ev, 0)) errors.push('ev: { 능력치: 0 이상 }');
  if (e.pattern !== undefined) errors.push(...patternErrors((e.pattern ?? {}) as Record<string, unknown>));
  if (e.grade !== undefined && !isEnemyGrade(e.grade)) errors.push(`grade: ${ENEMY_GRADES.order.join(' | ')}`);
  if (errors.length > 0) throw new Error(`적 데이터 오류 (${String(e.id ?? '?')}): ${errors.join(', ')}`);
  return r as EnemyDef;
}

/** 일반 적 몸(모델) 표 (GDD 6-7 v6.212): 몸 id → 이름 앞말(6-7 표, 빈 글자 = 앞말 없음), 일반 적 패턴 → 몸. 그림 목록(art/manifest.ts)도 이 표를 읽는다 — 이름과 그림이 한 곳에서 나온다 */
export interface EnemyBodyTable {
  names: Record<string, string>;
  /** 임시 이름인 몸 id (6-7 임시) */
  provisional?: string[];
  normal: { nameFormat: string; byPattern: Partial<Record<EnemyPatternKind, string>> };
}
export const ENEMY_BODIES = bodiesRaw as EnemyBodyTable;

/** 적 테이블(enemies.json)에 있는 id — 훈련 인형(practice.json)은 여기 없다 */
const TABLE_IDS: ReadonlySet<string> = new Set((raw as { id?: unknown }[]).map((r) => String(r.id)));

/** 몸 표를 따르는 적인가 = 적 테이블의 일반 적(테스트 적·훈련 인형 제외) */
const followsBodyTable = (def: Pick<EnemyDef, 'id' | 'class' | 'testOnly'>): boolean => def.class === 'normal' && !def.testOnly && TABLE_IDS.has(def.id);

/** 일반 적의 몸 id (패턴 → 몸). 몸 표를 따르지 않는 적(강적·보스·테스트 적·훈련 인형)은 null */
export function normalEnemyBody(def: Pick<EnemyDef, 'id' | 'class' | 'testOnly' | 'pattern'>): string | null {
  if (!followsBodyTable(def)) return null;
  return ENEMY_BODIES.normal.byPattern[def.pattern?.kind ?? 'basic'] ?? null;
}

/** 일반 적 이름 = 몸 이름 + 적 테이블 이름(호로) — '날쌘형 호로', 덩치는 앞말 없이 '호로'. 전투·결과·로그·흡수·도감 모두 이 이름 */
function withBodyName(def: EnemyDef): EnemyDef {
  if (!followsBodyTable(def)) return def;
  const body = normalEnemyBody(def);
  const bodyName = body ? ENEMY_BODIES.names[body] : undefined;
  if (bodyName === undefined) throw new Error(`적 데이터 오류 (${def.id}): 몸 표(bodies.json)에 몸 이름 없음`);
  // 몸 이름이 빈 글자(덩치 = 기본 모델, 6-7 v6.214)면 앞말 없이 적 테이블 이름 그대로
  const name = Object.fromEntries(Object.entries(def.name).map(([k, v]) => [k, bodyName ? ENEMY_BODIES.normal.nameFormat.replace('{body}', bodyName).replace('{name}', String(v)) : String(v)]));
  return { ...def, name: name as EnemyDef['name'] };
}

export const ENEMIES: readonly EnemyDef[] = (raw as unknown[]).map(parseEnemy).map(withBodyName);

/** 기본 훈련 인형 (GDD 8-9, C.471): 수련장 적 설정 창 전용 — ENEMIES·출현표·도감에 들어가지 않는다 */
export const PRACTICE_DUMMY: EnemyDef = parseEnemy(practiceRaw.dummy);

export function getEnemy(id: string): EnemyDef {
  const e = ENEMIES.find((x) => x.id === id);
  if (!e) throw new Error(`알 수 없는 적: ${id}`);
  return e;
}

/** 적 도감 표기 규칙 (GDD 6-7 v6.212): 일반 적만 '이름(속성 속성)' — 데이터 dexNames.json */
export const ENEMY_DEX_NAMES = dexNamesRaw as { normal: { format: string } };

/** 도감에 쓰는 이름 (GDD 6-7 v6.212): 일반 적 = '날쌘형 호로(물 속성)'·'호로(물 속성)' 처럼 속성을 붙이고(패턴 이름은 안 씀), 강적·보스·테스트 적·훈련 인형은 이름 그대로.
 *  도감 밖(전투·결과·로그·흡수)은 이 함수를 쓰지 않고 이름 그대로('날쌘형 호로'·'호로') — 적을 고르는 목록(수련장·테스트 모드 적 설정 창)은 도감 표기 */
export function enemyDexName(def: Pick<EnemyDef, 'id' | 'name' | 'element' | 'class' | 'testOnly'>, factionId: string): string {
  const name = pickFaction(def.name, factionId);
  if (!followsBodyTable(def)) return name;
  return ENEMY_DEX_NAMES.normal.format.replace('{name}', name).replace('{element}', elementName(def.element, factionId));
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
