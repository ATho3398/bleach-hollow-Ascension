// 둥지·진화·도감 화면의 순수 계산 (DOM 에 의존하지 않아 단위 테스트한다: tests/nest-ui.test.ts)
import type { BuildState } from '../../engine/absorb';
import type { FormDef, TitleDef } from '../../data/schema';

/** 슬롯에 장착되지 않은 보유 특성 id 목록 (보유 특성 패널) */
export function unequippedOwned(build: Pick<BuildState, 'owned' | 'slots'>): string[] {
  return build.owned.filter((id) => !build.slots.includes(id));
}

/** 진화체 도감 카드 상태 */
export interface FormCardModel {
  state: 'found' | 'unknown';
  /** 히든 진화체 (GDD 20-5) */
  hidden: boolean;
  current: boolean;
  /** 카드 색 기준 속성(첫 속성). 속성을 잇는 진화체는 없음 */
  element: string | undefined;
}

export function formCardModel(form: FormDef, unlocked: ReadonlySet<string>, currentFormId: string | null): FormCardModel {
  const found = unlocked.has(form.id);
  return {
    state: found ? 'found' : 'unknown',
    hidden: form.hidden === true,
    current: found && currentFormId === form.id,
    element: form.label.elements[0] ?? form.elements?.[0],
  };
}

/** 도감 정렬: 히든은 목록 맨 뒤 (안정 정렬) */
export function sortFormsForDex(forms: readonly FormDef[]): FormDef[] {
  return [...forms].sort((a, b) => Number(!!a.hidden) - Number(!!b.hidden));
}

/** 칭호 행 종류: 해금 / 이름이 공개된 미해금 / 숨김(?) */
export type TitleRowKind = 'unlocked' | 'locked' | 'hidden';
export function titleRowKind(def: Pick<TitleDef, 'hidden'>, unlockedAt: number | null): TitleRowKind {
  if (unlockedAt !== null) return 'unlocked';
  return def.hidden ? 'hidden' : 'locked';
}

/** 더보기 메뉴 "n / 전체" 표기 */
export const countText = (got: number, total: number): string => `${got} / ${total}`;

/** 방향 조사 "로/으로": 받침이 없거나 ㄹ 받침이면 "로" (둥지로, 대원실로), 그 밖의 받침은 "으로" */
export function toward(word: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  if (code < 0 || code > 11171) return `${word}(으)로`;
  const jong = code % 28;
  return jong === 0 || jong === 8 ? `${word}로` : `${word}으로`;
}
