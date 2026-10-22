// 블록 바 (GDD 3-5 v0.8): 길이 최대 8의 일자 배열. 빈 칸 없이 왼쪽부터 채우고, 새 블록은 맨 오른쪽에 붙는다. 종족 무관 순수 로직.

/** 바의 블록 하나. skill = 슬롯 특성 블록(기본 블록 포함), void = 공허 블록, combo = 콤보 블록(GDD 17-3, traitId 에 콤보 id), liberation = 해방 블록(GDD 22-5, 해방하는 순간 들어온다). SP 필살 블록(special)은 C.118 에 삭제(GDD 66장) */
export interface Block {
  /** 블록마다 고유한 번호 (화면 연출 추적용) */
  uid: number;
  kind: 'skill' | 'void' | 'combo' | 'liberation';
  /** skill 블록의 특성 id (기본 블록은 BASIC_SKILL_ID). combo 는 콤보 id. void 는 null */
  traitId: string | null;
  /** skill 공격 블록의 계열 id (GDD 17-3): 같은 계열이면 특성이 달라도 체인이 된다. 막기·회복·기본 블록·special·void 는 null (옛 데이터는 없음 = null) */
  family?: string | null;
  /** skill 블록의 속성 (C.118, GDD 66장): 체인은 같은 계열 + 같은 속성끼리만 묶인다. 속성 없는 블록·옛 데이터는 null/없음 */
  element?: string | null;
  /** 보스 기믹 칸 봉인 (GDD 25-3 seal, C.58): 남은 틱. 0 보다 크면 누를 수 없고 옆 블록과 체인으로 묶이지 않는다 (없음 = 봉인 안 됨) */
  sealTicks?: number;
}

/** 블록 바. 길이 = 지금 놓인 블록 수 (최대 BALANCE trayCapacity), 빈 칸이 없다 */
export type Tray = Block[];

export function inTray(t: Tray, i: number): boolean {
  return Number.isInteger(i) && i >= 0 && i < t.length;
}

/** 서로 체인으로 묶일 수 있는 블록인가 (GDD 66장, C.118): **완전히 같은 블록끼리만** — 같은 특성(기본 블록은 기본 블록끼리) + 같은 계열 + 같은 속성.
 *  조 + 불 조(계열 같고 속성 다름)도, 흡수 특성 조 + 기본 조(특성 다름)도 안 묶인다. 막기·회복도 같은 특성끼리만. 공허·콤보·해방은 단독.
 *  (옛 규칙 17-3 "같은 계열이면 특성이 달라도 묶인다"는 폐기) */
export function sameChainKind(a: Block | undefined, b: Block | undefined): boolean {
  if (!a || !b || a.kind !== 'skill' || b.kind !== 'skill') return false;
  if ((a.sealTicks ?? 0) > 0 || (b.sealTicks ?? 0) > 0) return false;
  return a.traitId === b.traitId && (a.family ?? null) === (b.family ?? null) && (a.element ?? null) === (b.element ?? null);
}

/** index 블록이 속한, 바에서 연속으로 붙은 같은 블록(같은 계열·속성, 또는 같은 특성) 덩어리 [시작, 끝] (포함). 단독 블록은 [i, i] */
export function runAt(t: Tray, i: number): [number, number] {
  if (!inTray(t, i)) return [i, i];
  let lo = i;
  let hi = i;
  while (lo > 0 && sameChainKind(t[lo - 1], t[i])) lo--;
  while (hi < t.length - 1 && sameChainKind(t[hi + 1], t[i])) hi++;
  return [lo, hi];
}

/**
 * 클릭한 블록과 함께 발동할 칸 번호들 (오름차순, GDD 19-2 체인 묶음 상한).
 * 같은 계열로 붙은 덩어리를 **앞(왼쪽)에서부터 maxChain 개씩** 묶고 남은 것은 새 묶음이다 (3 상한: 4 = 3+1, 5 = 3+2, 7 = 3+3+1).
 * 누른 블록이 속한 묶음만 발동한다.
 */
export function chainGroup(t: Tray, i: number, maxChain: number): number[] {
  if (!inTray(t, i)) return [];
  const [lo, hi] = runAt(t, i);
  const size = Math.max(1, Math.floor(maxChain));
  const start = lo + Math.floor((i - lo) / size) * size;
  const end = Math.min(hi, start + size - 1);
  const out: number[] = [];
  for (let k = start; k <= end; k++) out.push(k);
  return out;
}

/** 바 전체를 발동 묶음으로 나눈다 (GDD 19-2): 같은 계열 덩어리를 앞에서부터 maxChain 개씩. 화면의 묶음 경계 표시용 */
export function chainGroupsOf(t: Tray, maxChain: number): { start: number; length: number }[] {
  const size = Math.max(1, Math.floor(maxChain));
  const out: { start: number; length: number }[] = [];
  for (const r of runsOf(t)) {
    for (let k = 0; k < r.length; k += size) out.push({ start: r.start + k, length: Math.min(size, r.length - k) });
  }
  return out;
}

/** 바 전체를 같은 계열로 붙은 덩어리로 나눈다 (화면의 묶음 표시용). 단독 블록도 길이 1 덩어리로 나온다 */
export function runsOf(t: Tray): { start: number; length: number }[] {
  const out: { start: number; length: number }[] = [];
  for (let i = 0; i < t.length; ) {
    const [, hi] = runAt(t, i);
    out.push({ start: i, length: hi - i + 1 });
    i = hi + 1;
  }
  return out;
}
