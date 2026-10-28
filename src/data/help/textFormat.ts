// 설명 문구 서식 헬퍼 (C.185, GDD 111장 4 · docs/text-style.md): 설명 창·도움말·카드 설명이 같은 모양으로 숫자와 줄을 적는다.
// 말투 = 평서 '~다' 체 · 수치 줄 = "조건: 효과 · 효과" · 숫자 = +n% / −n%(빼기 기호 −) / n초 / n회 / n/100 / ×n · 범위 0~24.

/** 빼기 기호 (하이픈이 아니라 U+2212) */
export const MINUS = '−';

/** 상태 ⓘ 창 소제목 — 같은 종류 창끼리 이름·순서 같게 (수치 상태: 하는 일 → 구간별 손해 → 오르내림 / 상태 이상: 손해 → 풀리는 법) */
export const SECTION = {
  does: '하는 일',
  zones: '구간별 손해',
  move: '오르내림',
  loss: '손해',
  cure: '풀리는 법',
} as const;

/** 소수 첫째 자리까지, 뒤 0 은 뺀다 */
export const num = (x: number): string => String(Math.round(x * 10) / 10);

/** 부호 붙은 수: 3 → "+3", −3 → "−3" (단위 뒤에 붙임) */
export function signed(x: number, unit = ''): string {
  const v = num(Math.abs(x));
  return `${x < 0 ? MINUS : '+'}${v}${unit}`;
}

/** 비율 → 백분율: 0.2 → "20%" */
export const pct = (x: number): string => `${Math.round(x * 100)}%`;

/** 비율 변화량 → 부호 백분율: 0.15 → "+15%", −0.2 → "−20%" */
export const pctDelta = (x: number): string => signed(Math.round(x * 100), '%');

/** 배율 → 부호 백분율: ×1.3 → "+30%", ×0.85 → "−15%" */
export const multPct = (m: number): string => pctDelta(m - 1);

/** 배율: 1.15 → "×1.15" */
export const times = (m: number): string => `×${m}`;

/** 범위: 같으면 한 숫자, 다르면 "a~b" */
export const range = (a: number, b: number): string => (a === b ? num(a) : `${num(a)}~${num(b)}`);

/** 수치 줄: "조건: 효과 · 효과" */
export const numLine = (cond: string, ...effects: string[]): string => `${cond}: ${effects.filter((e) => e !== '').join(' · ')}`;

/** 구간 하나: from~to 일 때 정확히 무엇을 잃는가 (GDD 109장 2) */
export interface Zone {
  from: number;
  to: number;
  text: string;
}

/** 정수 from~to 를 걸으며 같은 문구가 이어지는 구간끼리 묶는다 — 문턱을 손으로 적지 않고 BALANCE 값에서 구간을 만든다 */
export function zonesBy(from: number, to: number, textAt: (v: number) => string): Zone[] {
  const out: Zone[] = [];
  for (let v = from; v <= to; v++) {
    const t = textAt(v);
    const last = out[out.length - 1];
    if (last && last.text === t) last.to = v;
    else out.push({ from: v, to: v, text: t });
  }
  return out;
}

/** 구간 → 수치 줄 */
export const zoneLine = (z: Zone): string => numLine(range(z.from, z.to), z.text);
