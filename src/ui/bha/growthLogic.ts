// 성장 안내의 순수 계산 (Q-1, C.29 → C.47): 원정 결과 성장 요약. 엔진·수치는 읽기만 한다.
// 진화 타이밍은 숨긴다(GDD 20-5 v4.1): 남은 걸음·후보는 보이지 않고, 귀환해서 진화했을 때만 그 사실을 알린다.

export interface GrowthInput {
  newTraits: number;
  /** 귀환하며 진화했으면 새 진화체 이름, 아니면 null */
  evolvedTo: string | null;
  /** 이번 원정에서 새로 해금된 칭호 이름 */
  newTitles: string[];
}

/** 원정 결과 맨 위 성장 요약: 사실만 짧게. 귀환·패배 구분 없이 같은 항목 */
export function growthLines(g: GrowthInput): string[] {
  const parts = [g.newTraits > 0 ? `새 특성 ${g.newTraits}개` : '새 특성 없음'];
  if (g.evolvedTo) parts.push(`진화! ${g.evolvedTo}`);
  const lines = [parts.join(' · ')];
  if (g.newTitles.length > 0) lines.push(`새 칭호 ${g.newTitles.map((n) => `「${n}」`).join(' ')}`);
  return lines;
}
