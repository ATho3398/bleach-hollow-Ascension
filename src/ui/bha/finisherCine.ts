// 마무리 평타 연출 자막 (GDD 12-4 v6.102 최후의 월아천충 연출, C.473): 엔진 kit.cine(시작 틱)과 데이터 captions([초, 글])로
// 지금 띄울 자막을 고른다. 자막 띠는 기존 .bha-kitline(대사 띠) — 새 색·간격 없이 보이는 시간만 다음 자막(또는 연출 끝)까지로.
// DOM 없는 순수 함수라 단위 테스트한다 (tests/c473.test.ts).

export interface CineCaption {
  /** captions 안 번호 */
  index: number;
  text: string;
  /** 다음 자막(없으면 연출 끝)까지 ms — 자막 띠가 보이는 시간 */
  holdMs: number;
}

/** 연출 시작 뒤 elapsedSec 초에 보일 자막. 첫 자막 전이면 null */
export function cineCaptionAt(captions: readonly (readonly [number, string])[], seconds: number, elapsedSec: number): CineCaption | null {
  let index = -1;
  captions.forEach(([at], i) => {
    if (elapsedSec >= at) index = i;
  });
  if (index < 0) return null;
  const [at, text] = captions[index]!;
  const next = captions[index + 1]?.[0] ?? seconds;
  return { index, text, holdMs: Math.max(0, Math.round((next - at) * 1000)) };
}
