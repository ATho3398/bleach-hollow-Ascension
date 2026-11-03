// 성장 안내의 순수 계산 (Q-1, C.29 → C.47): 원정 결과 성장 요약. 엔진·수치는 읽기만 한다.
// 진화 타이밍은 숨긴다(GDD 20-5 v4.1): 남은 걸음·후보는 보이지 않고, 귀환해서 진화했을 때만 그 사실을 알린다.

export interface GrowthInput {
  newTraits: number;
  /** 귀환하며 진화했으면 새 진화체 이름, 아니면 null */
  evolvedTo: string | null;
  /** 이번 원정에서 새로 해금된 칭호 이름 */
  newTitles: string[];
}

/** 결과 화면 진화 안내 (GDD 176장 6): 진화체 이름은 둥지 진화 연출에서 처음 보이고, 결과에선 변화만 알린다 */
export const EVOLVE_HINT = '몸에 변화가 일어난다…';

/** 원정 결과 맨 위 성장 요약: 사실만 짧게. 귀환·패배 구분 없이 같은 항목.
 *  진화는 여기 넣지 않는다 (GDD 176장 6: 맨 위 줄은 노란 알림 띠에 가려지고 이름이 연출 전에 먼저 보였다) — 결과 왼쪽 열 EVOLVE_HINT */
export function growthLines(g: GrowthInput): string[] {
  const lines = [g.newTraits > 0 ? `새 특성 ${g.newTraits}개` : '새 특성 없음'];
  if (g.newTitles.length > 0) lines.push(`새 칭호 ${g.newTitles.map((n) => `「${n}」`).join(' ')}`);
  return lines;
}
