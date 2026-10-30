// 보스 테이블 (GDD 25-3·25-7, 적 테이블처럼 두 종족 공유, 이름만 종족별). 엔진은 페이즈(체력 구간)·기믹 종류만 읽고 보스 id 로 분기하지 않는다.
// 수치(시간 제한·기믹 간격·보상)는 BALANCE.provisional.boss, 체력·공격은 여기의 "기본 공격 N회 분량"(CLAUDE.md 규칙 3)
import { ENEMIES, parseEnemy } from '../enemies';
import { getTrait } from '../traits';
import { pickFaction, type EnemyDef, type PerFaction } from '../schema';
import { isElement } from '../elements';
import raw from './bosses.json';

/** 보스 기믹 종류 (GDD 25-3·35장): seal = 일정 간격 블록 칸 봉인, summon = 졸개 소환(C.84), element = 페이즈마다 속성 바꾸기(C.84) — 구현. reflect = 체인 반사(종류 자리만) */
export const BOSS_GIMMICKS = ['seal', 'summon', 'element', 'reflect'] as const;
export type BossGimmick = (typeof BOSS_GIMMICKS)[number];

/** 페이즈 하나: 적 체력이 최대 체력 × belowHpFraction 이하가 되면 들어간다. attackSecondsMult = 기본 공격 간격 배율(0.75 = −25%) */
export interface BossPhase {
  belowHpFraction: number;
  attackSecondsMult: number;
}

export interface BossDef {
  id: string;
  name: PerFaction<string>;
  /** 전투 엔진에 넘길 적 정의 (class elite) */
  enemy: EnemyDef;
  /** 2페이즈부터 (1페이즈 = 처음 상태). 체력 구간이 높은 것부터 */
  phases: BossPhase[];
  gimmick: BossGimmick;
  /** element 기믹: 2페이즈부터 페이즈마다의 새 속성 (phases 와 같은 길이). 다른 기믹은 없음 */
  elementShifts?: string[];
  /** 처치 보상 보스 특성 (흡수 화면 확정 후보) */
  trait: string;
  /** 이 보스의 난이도 ★ (GDD 32-1 7번, C.75): 보스가 나오는 스토리 화의 ★ 와 같아야 한다(테스트가 본다). 자유 원정 등장은 미정 */
  difficulty: number;
  provisional?: boolean;
}

export function parseBoss(r: unknown): BossDef {
  const b = (r ?? {}) as Record<string, unknown>;
  const errors: string[] = [];
  if (typeof b.id !== 'string' || !b.id) errors.push('id');
  if (typeof b.name !== 'object' || b.name === null) errors.push('name');
  if (!(BOSS_GIMMICKS as readonly unknown[]).includes(b.gimmick)) errors.push(`gimmick: ${BOSS_GIMMICKS.join(' | ')}`);
  const phases = Array.isArray(b.phases) ? (b.phases as Record<string, unknown>[]) : [];
  if (phases.length < 1 || phases.length > 2) errors.push('phases: 1~2개 (보스 페이즈 2~3개)');
  let last = 1;
  for (const p of phases) {
    const f = p.belowHpFraction;
    const m = p.attackSecondsMult;
    if (typeof f !== 'number' || f <= 0 || f >= last) errors.push('phases.belowHpFraction: 0~1, 내려가는 순서');
    else last = f;
    if (typeof m !== 'number' || m <= 0) errors.push('phases.attackSecondsMult: 양수');
  }
  const shifts = b.elementShifts;
  if (b.gimmick === 'element') {
    if (!Array.isArray(shifts) || shifts.length !== phases.length || !shifts.every((x) => isElement(x))) errors.push('elementShifts: element 기믹은 페이즈 수만큼 속성 id');
  } else if (shifts !== undefined) errors.push('elementShifts: element 기믹에서만');
  if (!Number.isInteger(b.difficulty) || (b.difficulty as number) < 1) errors.push('difficulty: 1 이상 정수');
  if (typeof b.trait !== 'string') errors.push('trait');
  else {
    try {
      if (getTrait(b.trait).boss !== true) errors.push(`trait: ${b.trait} 는 보스 특성(boss: true)이 아니다`);
    } catch {
      errors.push(`trait: 없는 특성 ${b.trait}`);
    }
  }
  if (errors.length > 0) throw new Error(`보스 데이터 오류 (${String(b.id ?? '?')}): ${errors.join(', ')}`);
  const enemy = parseEnemy({ ...b, class: 'elite' });
  const { id, name, gimmick, trait, provisional, difficulty } = b as unknown as BossDef;
  return { id, name, enemy, phases: phases as unknown as BossPhase[], gimmick, ...(gimmick === 'element' ? { elementShifts: [...(shifts as string[])] } : {}), trait, difficulty, provisional };
}

export const BOSSES: readonly BossDef[] = ((raw as { bosses: unknown[] }).bosses).map(parseBoss);

export function getBoss(id: string): BossDef {
  const b = BOSSES.find((x) => x.id === id);
  if (!b) throw new Error(`알 수 없는 보스: ${id}`);
  return b;
}

export function isBossId(id: unknown): id is string {
  return typeof id === 'string' && BOSSES.some((b) => b.id === id);
}

export function bossName(id: string, factionId: string): string {
  return pickFaction(getBoss(id).name, factionId);
}

/** 적 id 로 정의 찾기: 적 테이블, 없으면 보스 (흡수 화면 등 offer.enemyId 를 읽는 곳) */
export function findEnemyDef(id: string): EnemyDef {
  return ENEMIES.find((x) => x.id === id) ?? getBoss(id).enemy;
}
