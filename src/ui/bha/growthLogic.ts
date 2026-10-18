// 성장 안내의 순수 계산 (Q-1, C.29): 진화 예고 한 줄, 원정 결과 성장 요약. 엔진·수치는 읽기만 한다.
import { absorbsRemaining, accumulationOf, currentCandidates, isMaxTier, rankLineages, type EvolutionState } from '../../engine/evolution';

export interface EvolutionHint {
  /** 지금 흐름의 상위 계통 id (0~2개, 많은 순) */
  leads: string[];
  /** 진화까지 남은 포식 수 (0 이면 진화 가능) */
  remaining: number;
}

/**
 * 진화 예고: 누적 상위 1~2개 계통과 남은 포식 수. 확정 진화체·후보 목록은 담지 않는다 (도감 발견 규칙).
 * 마지막 단계는 null. 후보가 없거나(기본형이 될 위험) 누적이 없으면 leads 를 비워 "방향이 뚜렷하지 않다"로 보인다.
 * 두 번째 계통은 첫 번째의 절반 이상일 때만 넣는다.
 */
export function evolutionHint(evo: EvolutionState): EvolutionHint | null {
  if (isMaxTier(evo)) return null;
  const remaining = absorbsRemaining(evo)!;
  const acc = accumulationOf(evo);
  const ranked = rankLineages(acc);
  if (ranked.length === 0 || currentCandidates(evo).length === 0) return { leads: [], remaining };
  const [first, second] = ranked;
  const leads = [first!];
  if (second !== undefined && acc.scores[second]! * 2 >= acc.scores[first!]!) leads.push(second);
  return { leads, remaining };
}

/** 예고 문구. 계통 이름은 호출하는 쪽이 종족별 표기로 바꿔 넘긴다 */
export function hintText(h: EvolutionHint, nameOf: (lineageId: string) => string): string {
  const way = h.leads.length === 0 ? '아직 방향이 뚜렷하지 않다' : `지금 흐름이면 ${h.leads.map(nameOf).join('·')} 쪽`;
  return h.remaining > 0 ? `${way} · 진화까지 ${h.remaining}회` : way;
}

export interface GrowthInput {
  newTraits: number;
  /** 진화까지 남은 포식 수. 마지막 단계면 null */
  remaining: number | null;
  /** 이번 원정에서 새로 해금된 칭호 이름 */
  newTitles: string[];
}

/** 원정 결과 맨 위 성장 요약: 사실만 짧게. 귀환·패배 구분 없이 같은 항목 */
export function growthLines(g: GrowthInput): string[] {
  const parts = [g.newTraits > 0 ? `새 특성 ${g.newTraits}개` : '새 특성 없음'];
  if (g.remaining !== null) parts.push(g.remaining > 0 ? `진화까지 ${g.remaining}회` : '진화 가능');
  const lines = [parts.join(' · ')];
  if (g.newTitles.length > 0) lines.push(`새 칭호 ${g.newTitles.map((n) => `「${n}」`).join(' ')}`);
  return lines;
}
