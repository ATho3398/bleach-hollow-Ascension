// PC 단축키 매핑 (GDD 18-5): 화면 맥락 → 물리 키(e.code) → 액션. DOM 에 의존하지 않는 순수 데이터·함수라 단위 테스트한다 (tests/shortcut-map.test.ts).
// 왼손 영역(숫자 1~8, Q W E R, A S D F, Z X C V, T, G, H, Space)에 몰고, +/-(화면 배율 17-5)·Esc·Enter·방향키는 예약한다.
// 종족 무관 엔진 UI 규칙이라 종족 설정에서 읽을 것이 없다.

export type ShortcutCtx = 'menu' | 'battle' | 'room' | 'plan';

/** 기기(항목 선택)가 직접 처리하는 액션: 이전/다음 항목, 확정, 취소 */
export type NavAction = 'prev' | 'next' | 'confirm' | 'cancel';

/** 액션 이름. `pick.N` = 화면의 번호 목록(data-sc-list) N번째, `block.N` = 전투 블록 N번 칸, 나머지는 `[data-sc="이름"]` 요소를 누른다 */
export type ShortcutAction = string;

/** 다른 기능이 쓰는 키: 단축키로 배정하면 안 된다 (배율 +/-, 취소/확정/이동의 기본 키) */
export const RESERVED_CODES: readonly string[] = ['Escape', 'Enter', 'NumpadEnter', 'Equal', 'Minus', 'NumpadAdd', 'NumpadSubtract', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'Backspace'];

/** 어떤 맥락에서도 같은 이동·확정·취소 (기존 방향키/Enter/Esc는 기기가 따로 처리) */
const NAV: Record<string, ShortcutAction> = {
  KeyW: 'prev',
  KeyA: 'prev',
  KeyS: 'next',
  KeyD: 'next',
  KeyF: 'confirm',
  Space: 'confirm',
  KeyQ: 'cancel',
};

const digits = (n: number, f: (i: number) => ShortcutAction): Record<string, ShortcutAction> => {
  const out: Record<string, ShortcutAction> = {};
  for (let i = 1; i <= n; i++) out[`Digit${i}`] = f(i);
  return out;
};

export const SHORTCUTS: Record<ShortcutCtx, Record<string, ShortcutAction>> = {
  // 메뉴·목록·시작 화면·결과/흡수/진화/일시정지 오버레이·열린 레이어: 이동 W/S/A/D, 확정 F/Space, 취소 Q, 숫자 = 번호 목록 N번째.
  // 그 화면에 이름 붙은 버튼이 있을 때만: 설정 E·도움말 H(종족 고르기 위 구석), 백업 파일 가져오기 R(불러오기 창) (C.46)
  menu: { ...NAV, ...digits(9, (i) => `pick.${i}`), KeyE: 'corner.settings', KeyH: 'corner.help', KeyR: 'slots.import' },
  // 전투(진행 중): 블록 1~8, 저장 필살기 Q, 일시정지 Space(또는 F), 배속 E, 도움말 H
  battle: { ...digits(8, (i) => `block.${i}`), KeyQ: 'stored', Space: 'pause', KeyF: 'confirm', KeyE: 'speed', KeyH: 'help' },
  // 홈: 돌보기 Z X C, 더보기 V(펼친 격자는 숫자), 훈련 인형 T, 상태 칩 G, 펼친 먹이/더보기 줄은 숫자
  room: { ...NAV, KeyZ: 'care.feed', KeyX: 'care.sleep', KeyC: 'care.pet', KeyV: 'dock.more', KeyT: 'dummy', KeyG: 'status', ...digits(9, (i) => `pick.${i}`) },
  // 원정 배치판: 이동 W/S/A/D, 그 칸 누르기 F, 선택 취소 Q·Esc, 출발 Space, 숫자 = 손에 든 타일 N번째 (되돌리기 R 키는 18-8 에서 삭제 — 놓은 타일을 선택한 뒤 같은 칸을 다시 누른다)
  plan: { ...NAV, Space: 'go', ...digits(9, (i) => `pick.${i}`) },
};

/** 숫자패드 숫자는 윗줄 숫자와 같은 키로 본다. 나머지는 그대로 */
export function normalizeCode(code: string): string {
  return /^Numpad[0-9]$/.test(code) ? `Digit${code.slice(6)}` : code;
}

export function actionFor(ctx: ShortcutCtx, code: string): ShortcutAction | null {
  return SHORTCUTS[ctx][normalizeCode(code)] ?? null;
}

export function isNavAction(a: ShortcutAction | null): a is NavAction {
  return a === 'prev' || a === 'next' || a === 'confirm' || a === 'cancel';
}

/** 키 글자 배지에 쓰는 짧은 이름 (Space 는 작은 아이콘 버튼 폭에 맞춰 Spc) */
export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code === 'Space') return 'Spc';
  return code;
}

/** 어떤 액션에 배정된 키들 (배지 표시용: 이동·확정 같은 공통 키보다 전용 키를 먼저) */
export function keysOf(ctx: ShortcutCtx, action: ShortcutAction): string[] {
  return Object.entries(SHORTCUTS[ctx]).filter(([, a]) => a === action).map(([c]) => c);
}

/** 같은 키가 한 맥락에서 두 액션에 걸렸는지 / 예약 키를 썼는지 검사한다. 문제가 없으면 빈 배열 */
export function findProblems(map: Record<ShortcutCtx, Record<string, ShortcutAction>> = SHORTCUTS): string[] {
  const out: string[] = [];
  for (const [ctx, m] of Object.entries(map)) {
    for (const code of Object.keys(m)) {
      if (RESERVED_CODES.includes(code)) out.push(`${ctx}: 예약된 키 ${code} 를 배정했다`);
      if (normalizeCode(code) !== code) out.push(`${ctx}: ${code} 는 윗줄 숫자로 정규화되므로 직접 배정하면 안 된다`);
    }
  }
  return out;
}

/** 도움말 '단축키' 표용 행: 맥락 제목 + [키, 하는 일] */
export interface ShortcutHelpRow {
  keys: string;
  does: string;
}
export const SHORTCUT_HELP: { title: string; rows: ShortcutHelpRow[] }[] = [
  {
    title: '전투',
    rows: [
      { keys: '1 ~ 8', does: '블록 1~8번 칸 사용 (그 칸을 누른 것과 같다)' },
      { keys: 'Q', does: '저장 필살기' },
      { keys: 'Space', does: '일시정지 / 계속' },
      { keys: 'E', does: '배속 1x ↔ 2x' },
      { keys: 'H', does: '도움말' },
    ],
  },
  {
    title: '홈',
    rows: [
      { keys: 'Z / X / C', does: '먹이 / 재우기 / 쓰다듬기 (먹이는 펼친 줄에서 1~5로 고른다)' },
      { keys: 'V', does: '더보기 열기/닫기 (등급전·설정·도움말·튜토리얼·종족 바꾸기·백업·처음 화면)' },
      { keys: 'T', does: '훈련 인형(전투 연습)' },
      { keys: 'G', does: '캐릭터 머리 위 상태 칩(상태 화면)' },
      { keys: '1 ~ 9', does: '펼친 먹이 줄·더보기 격자의 N번째' },
    ],
  },
  {
    title: '원정 배치판',
    rows: [
      { keys: 'W A S D', does: '선택 이동' },
      { keys: 'F', does: '그 칸 누르기 (놓기·선택·교체·이동, 놓은 타일을 선택한 채 같은 칸을 다시 누르면 손으로 돌아온다)' },
      { keys: 'Q, Esc', does: '선택 취소' },
      { keys: 'Space', does: '출발' },
      { keys: '1 ~ 9', does: '손에 든 타일 N번째' },
    ],
  },
  {
    title: '메뉴·목록·시작 화면·결과 창',
    rows: [
      { keys: 'W S / A D', does: '이전 / 다음 항목' },
      { keys: 'F, Space', does: '확정' },
      { keys: 'Q, Esc', does: '취소 / 뒤로' },
      { keys: '1 ~ 9', does: '번호가 붙은 목록의 N번째 (시작 화면·슬롯 등)' },
    ],
  },
  {
    title: '시작 화면·불러오기·종족 고르기',
    rows: [
      { keys: '1 / 2 / 3', does: '시작 화면: 이어하기 / 새로 시작 / 불러오기' },
      { keys: '1 ~ 3', does: '새로 시작·불러오기 창: 슬롯 N' },
      { keys: 'R', does: '불러오기 창: 백업 파일 가져오기' },
      { keys: '1 ~ 9', does: '종족 고르기: 왼쪽부터 N번째 종족 (확인창에서 F·Space = 예, Q·Esc = 아니오)' },
      { keys: 'E / H', does: '종족 고르기: 설정 / 도움말·튜토리얼' },
    ],
  },
  {
    title: '어디서나',
    rows: [
      { keys: '+ / −', does: '화면 1배 ↔ 2배' },
      { keys: '방향키, Enter, Esc', does: '이동 / 확정 / 취소 (예전과 같다)' },
    ],
  },
];
