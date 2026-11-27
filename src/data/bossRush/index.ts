// 보스전 보스 6명 (GDD 6-16 v6.246, C.565 — 사용자 2026-11-27 "보스던전 맵 이름 이상한 썬더우드 이딴거 빼고. 블리치에 있는 캐릭으로"): 두 종족 공유, 이름 = 데이터(두 종족 같은 이름).
// 스토리 보스 테이블(data/bosses)과 따로 — 스토리·탑·보스 특성·첫 처치 보상과 섞이지 않는다. 엔진은 페이즈·기믹 종류만 읽고 보스 id 로 분기하지 않는다.
// 체력·공격 = 권장 단계 플레이어 기본 공격 N회분(규칙 3), 실제 세기 = 고른 ★ 배율 × scale(유하바하 1.3). 전부 provisional
import { parseEnemy } from '../enemies';
import { isElement } from '../elements';
import { BOSS_GIMMICKS, bossName, type BossGimmick, type BossPhase } from '../bosses';
import { pickFaction, type EnemyDef, type PerFaction } from '../schema';
import raw from './bossRush.json';

export interface BossRushDef {
  id: string;
  name: PerFaction<string>;
  /** 권장 ★ (고를 수 있는 ★ = 1 ~ 이 값) */
  star: number;
  /** 추가 세기 배율 (유하바하 1.3) */
  scale: number;
  /** 전투 엔진에 넘길 적 정의 (class elite) */
  enemy: EnemyDef;
  phases: BossPhase[];
  gimmick: BossGimmick;
  elementShifts?: string[];
}

function parseBossRush(r: unknown): BossRushDef {
  const b = (r ?? {}) as Record<string, unknown>;
  const errors: string[] = [];
  if (typeof b.id !== 'string' || !b.id.startsWith('br-')) errors.push('id: br-…');
  if (!Number.isInteger(b.star) || (b.star as number) < 1) errors.push('star: 1 이상 정수');
  if (typeof b.scale !== 'number' || b.scale <= 0) errors.push('scale: 양수');
  if (!(BOSS_GIMMICKS as readonly unknown[]).includes(b.gimmick)) errors.push(`gimmick: ${BOSS_GIMMICKS.join(' | ')}`);
  const phases = Array.isArray(b.phases) ? (b.phases as BossPhase[]) : [];
  if (phases.length < 1 || phases.length > 2) errors.push('phases: 1~2개');
  const shifts = b.elementShifts;
  if (b.gimmick === 'element' && !(Array.isArray(shifts) && shifts.length === phases.length && shifts.every((x) => isElement(x)))) errors.push('elementShifts: element 기믹은 페이즈 수만큼 속성 id');
  if (b.gimmick !== 'element' && shifts !== undefined) errors.push('elementShifts: element 기믹에서만');
  if (errors.length > 0) throw new Error(`보스전 보스 데이터 오류 (${String(b.id ?? '?')}): ${errors.join(', ')}`);
  return {
    id: b.id as string, name: b.name as PerFaction<string>, star: b.star as number, scale: b.scale as number,
    enemy: parseEnemy({ ...b, class: 'elite' }), phases: phases.map((p) => ({ ...p })), gimmick: b.gimmick as BossGimmick,
    ...(b.gimmick === 'element' ? { elementShifts: [...(shifts as string[])] } : {}),
  };
}

/** 보스전 순서 = 데이터 순서 (앞 보스를 이기면 다음이 열린다) */
export const BOSS_RUSH: readonly BossRushDef[] = (raw as { bosses: unknown[] }).bosses.map(parseBossRush);

export function getBossRush(id: string): BossRushDef | undefined {
  return BOSS_RUSH.find((b) => b.id === id);
}

export function bossRushDisplayName(id: string, factionId: string): string {
  const b = getBossRush(id);
  return b ? pickFaction(b.name, factionId) : id;
}

/** 보스 이름 — 보스전 보스(br-…)든 스토리 보스든 (C.566 토벌전 걷기 화면·전투 띠) */
export function anyBossName(id: string, factionId: string): string {
  return getBossRush(id) ? bossRushDisplayName(id, factionId) : bossName(id, factionId);
}
