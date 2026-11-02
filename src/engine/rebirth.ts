// 환생 (GDD 22-1·22-7). 종족 무관 순수 로직: 환생 횟수·누적 계승 노력치·★ 표시·가지고 갈 블록 후보.
// 세이브 전체를 바꾸는 일(초기화·남김·보상·런 로그)은 game.ts performRebirth 가 이 모듈을 써서 한다. 문구는 종족 설정 rebirth.
import { BALANCE } from '../config/balance';
import { STAT_IDS, type Stats } from '../data/schema';
import type { BuildState } from './absorb/build';
import { zeroStats, type EvolutionState } from './evolution';

const RB = BALANCE.provisional.rebirth;

/** 저장 구조(SaveData.rebirth, 형식 20) */
export interface RebirthState {
  /** 지금까지 환생한 횟수 */
  count: number;
  /** 누적 계승 노력치 (소수 그대로 쌓는다). 새 생은 이 값의 정수 부분을 받는다 */
  carry: Stats;
}

export function newRebirthState(): RebirthState {
  return { count: 0, carry: zeroStats() };
}

const nonNeg = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);

/** 저장된 값 정리 (모르는 값·음수 보정) */
export function sanitizeRebirth(raw: unknown): RebirthState {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<Record<keyof RebirthState, unknown>>;
  const c = (typeof r.carry === 'object' && r.carry !== null ? r.carry : {}) as Partial<Record<string, unknown>>;
  const carry = zeroStats();
  for (const s of STAT_IDS) carry[s] = nonNeg(c[s]);
  return { count: Math.floor(nonNeg(r.count)), carry };
}

/** 환생할 수 있는 단계인가 (5단계 이상) */
export function canRebirth(e: Pick<EvolutionState, 'tierIndex'>): boolean {
  return e.tierIndex >= RB.minTierIndex;
}

/** 환생 직전 노력치(이번 생 노력치 + 이번 생 계승분)의 evCarryRate 를 누적에 더한 값. 누적 상한 없음 */
export function nextCarry(state: RebirthState, e: Pick<EvolutionState, 'ev' | 'carry'>): Stats {
  const out = zeroStats();
  for (const s of STAT_IDS) out[s] = state.carry[s] + (e.ev[s] + (e.carry?.[s] ?? 0)) * RB.evCarryRate;
  return out;
}

/** 새 생이 받는 계승 노력치 (정수 부분) */
export function startingCarry(carry: Stats): Stats {
  const out = zeroStats();
  for (const s of STAT_IDS) out[s] = Math.floor(carry[s] + 1e-9);
  return out;
}

/** 이름 옆 환생 표시: 0회 '', 1~4회 ★ 를 횟수만큼, 5회부터 ★ + 숫자 (예 ★7) */
export function rebirthStars(count: number): string {
  if (count <= 0) return '';
  return count < RB.starsUpTo ? '★'.repeat(count) : `★${count}`;
}

/** 계승할 수 있는 특성 = 지금 장착한 특성 (슬롯 순서, 중복 없음) */
export function inheritableTraits(build: Pick<BuildState, 'slots'>): string[] {
  return [...new Set(build.slots.filter((id): id is string => id !== null))];
}
