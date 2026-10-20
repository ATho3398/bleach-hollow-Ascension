// 배부름 표시 (C.63, GDD 28장 10번): 엔진의 허기 값(0 = 배부름, 클수록 배고픔)은 그대로 두고 화면에서만 뒤집는다.
// 배부름 = 최대 − 허기 (100 = 가득, 시간·원정으로 줄고 0 = 매우 배고픔). 이름은 종족 설정 fullnessName.

/** 허기 → 배부름 (0 ~ max) */
export function fullnessOf(hunger: number, max = 100): number {
  return Math.max(0, Math.min(max, max - hunger));
}

/** 허기 변화량 → 배부름 변화량 (먹이 허기 −35 = 배부름 +35) */
export function fullnessDelta(hungerDelta: number): number {
  return -hungerDelta;
}

/** 변화량 글자: "배부름 +35" / "배부름 −10" (0 이면 빈 글자) */
export function fullnessDeltaText(name: string, hungerDelta: number): string {
  const d = Math.round(fullnessDelta(hungerDelta));
  return d === 0 ? '' : `${name} ${d > 0 ? '+' : '−'}${Math.abs(d)}`;
}
