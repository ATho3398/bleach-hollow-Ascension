// 디자인 시스템 헬퍼의 순수 함수 (DOM 에 의존하지 않아 단위 테스트한다: tests/bha-util.test.ts)

/** 0~1 로 자른 비율. max 가 0 이하이거나 숫자가 아니면 0 */
export function ratio(value: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0;
  return Math.min(1, Math.max(0, value / max));
}

/** CSS 변수(--fill 등)에 넣는 0~1 문자열 (소수 3자리) */
export function cssRatio(value: number, max: number): string {
  return ratio(value, max).toFixed(3);
}

/** 슬라이더 채움 --pct = (값 - 최소) / (최대 - 최소) */
export function sliderPct(value: number, min: number, max: number): string {
  return cssRatio(value - min, max - min);
}
