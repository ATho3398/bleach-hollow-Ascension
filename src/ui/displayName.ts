// 화면 이름 표시와 개발용 문구 (GDD 100장, C.171): 이름을 새로 짓지 않고 표시만 정리한다.
// - shownName: 내부 이름의 밑줄 '_' → 공백, '(가칭)' 은 테스트 모드에서만. 데이터 id·이름은 그대로.
// - devText: '○ 임시' 칩·"기획 11-x 미정" 같은 개발용 문구는 테스트 모드(?test=1)에서만 보인다.
// 이 파일은 아무것도 import 하지 않는다 (dom.ts·data 쪽 어디서 불러도 순환 없음).

let dev = false;

/** 테스트 모드 시작 때 한 번 (testMode.ts initTestMode) */
export function setDevText(on: boolean): void {
  dev = on;
}

/** 개발용 문구(임시 칩·가칭·기획 장 번호)를 보여 줄까 — 테스트 모드에서만 true */
export const devText = (): boolean => dev;

/** 데이터 설명 앞의 "[임시]" 표시는 테스트 모드에서만 (94장 A-2 → GDD 100장: 포식 후보 카드·보관함 특성 상세 공통) */
export function plainText(text: string): string {
  return dev ? text : text.replace(/^\[임시\]\s*/, '');
}

/** 화면에 보이는 이름: 진화체·적·탑·스킨 등 모든 이름이 이 함수 하나를 거친다 */
export function shownName(raw: string): string {
  const s = dev ? raw : raw.replace(/\s*\(가칭\)/g, '');
  return s.replace(/_+/g, ' ').trim();
}
