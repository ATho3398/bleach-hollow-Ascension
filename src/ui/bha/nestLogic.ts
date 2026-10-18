// 둥지·진화·도감 화면의 순수 계산 (DOM 에 의존하지 않아 단위 테스트한다: tests/nest-ui.test.ts)
import type { BuildState } from '../../engine/absorb';
import type { FormDef, TitleDef } from '../../data/schema';

/** 슬롯에 장착되지 않은 보유 특성 id 목록 (보유 특성 패널) */
export function unequippedOwned(build: Pick<BuildState, 'owned' | 'slots'>): string[] {
  return build.owned.filter((id) => !build.slots.includes(id));
}

export interface LinbarSeg {
  id: string;
  n: number;
}

export interface LinbarModel {
  /** 횟수 > 0 인 계통만, 입력 순서대로 */
  segs: LinbarSeg[];
  /** 아직 안 찬 칸 (need - 합계, 0 이상). 막대 뒤 빈 자리 */
  empty: number;
  /** 1위 계통 id. 모두 0 이면 null. 동점이면 먼저 나온 계통 */
  lead: string | null;
  total: number;
}

/** 계통 누적 막대 모델: 조각 폭은 --n(횟수), 빈 자리는 need 에서 모자란 만큼 */
export function linbarModel(scores: Record<string, number | undefined>, lineageIds: readonly string[], need: number): LinbarModel {
  const all = lineageIds.map((id) => ({ id, n: Math.max(0, scores[id] ?? 0) }));
  const total = all.reduce((s, x) => s + x.n, 0);
  let lead: string | null = null;
  let best = 0;
  for (const x of all) if (x.n > best) { best = x.n; lead = x.id; }
  return { segs: all.filter((x) => x.n > 0), empty: Math.max(0, need - total), lead, total };
}

/** 진화체 도감 카드 상태 */
export interface FormCardModel {
  state: 'found' | 'unknown';
  base: boolean;
  current: boolean;
  /** 카드 색 기준 계통(첫 요구 계통). 기본형·특수형은 없음 */
  lineage: string | undefined;
}

export function formCardModel(form: FormDef, unlocked: ReadonlySet<string>, currentFormId: string | null): FormCardModel {
  const found = unlocked.has(form.id);
  return {
    state: found ? 'found' : 'unknown',
    base: !!form.fallback,
    current: found && currentFormId === form.id,
    lineage: form.label.lineages[0],
  };
}

/** 도감 정렬: 기본형은 목록 맨 뒤 (안정 정렬) */
export function sortFormsForDex(forms: readonly FormDef[]): FormDef[] {
  return [...forms].sort((a, b) => Number(!!a.fallback) - Number(!!b.fallback));
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
