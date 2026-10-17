// 블록 바 (GDD 3-5 v0.8): 길이 최대 8의 일자 배열. 빈 칸 없이 왼쪽부터 채우고, 새 블록은 맨 오른쪽에 붙는다. 종족 무관 순수 로직.

/** 바의 블록 하나. skill = 슬롯 특성 블록(기본 블록 포함), special = 필살 블록, void = 공허 블록 */
export interface Block {
  /** 블록마다 고유한 번호 (화면 연출·드래그 추적용) */
  uid: number;
  kind: 'skill' | 'special' | 'void';
  /** skill 블록의 특성 id (기본 블록은 BASIC_SKILL_ID). special·void 는 null */
  traitId: string | null;
}

/** 블록 바. 길이 = 지금 놓인 블록 수 (최대 BALANCE trayCapacity), 빈 칸이 없다 */
export type Tray = Block[];

export function inTray(t: Tray, i: number): boolean {
  return Number.isInteger(i) && i >= 0 && i < t.length;
}

/** 서로 체인으로 묶일 수 있는 블록인가: 같은 특성의 skill 블록만. 공허·필살은 단독 */
export function sameChainKind(a: Block | undefined, b: Block | undefined): boolean {
  return !!a && !!b && a.kind === 'skill' && b.kind === 'skill' && a.traitId === b.traitId;
}

/** index 블록이 속한, 바에서 연속으로 붙은 같은 특성 블록 덩어리 [시작, 끝] (포함). 단독 블록은 [i, i] */
export function runAt(t: Tray, i: number): [number, number] {
  if (!inTray(t, i)) return [i, i];
  let lo = i;
  let hi = i;
  while (lo > 0 && sameChainKind(t[lo - 1], t[i])) lo--;
  while (hi < t.length - 1 && sameChainKind(t[hi + 1], t[i])) hi++;
  return [lo, hi];
}

/**
 * 클릭한 블록과 함께 발동할 칸 번호들 (오름차순). 덩어리가 maxChain 이하면 덩어리 전부,
 * 더 길면 클릭한 블록을 포함한 maxChain 개: 클릭 위치에서 오른쪽을 먼저 최대한 채우고, 모자라면 왼쪽으로 확장한다.
 */
export function chainGroup(t: Tray, i: number, maxChain: number): number[] {
  if (!inTray(t, i)) return [];
  const [lo, hi] = runAt(t, i);
  const right = Math.min(hi - i, maxChain - 1);
  const left = Math.min(i - lo, maxChain - 1 - right);
  const out: number[] = [];
  for (let k = i - left; k <= i + right; k++) out.push(k);
  return out;
}

/** 바 전체를 같은 특성으로 붙은 덩어리로 나눈다 (화면의 묶음 표시용). 단독 블록도 길이 1 덩어리로 나온다 */
export function runsOf(t: Tray): { start: number; length: number }[] {
  const out: { start: number; length: number }[] = [];
  for (let i = 0; i < t.length; ) {
    const [, hi] = runAt(t, i);
    out.push({ start: i, length: hi - i + 1 });
    i = hi + 1;
  }
  return out;
}

/** 드래그 이동 규칙: from 의 블록을 빼서 to 위치에 끼워 넣는다 (나머지는 밀린다). 같은 칸이거나 범위 밖이면 불가 */
export function canMove(t: Tray, from: number, to: number): boolean {
  return inTray(t, from) && inTray(t, to) && from !== to;
}

/** 끼워넣기 결과 바 (원본은 건드리지 않는다) */
export function movedTray(t: Tray, from: number, to: number): Tray {
  if (!canMove(t, from, to)) return t.slice();
  const out = t.slice();
  const [b] = out.splice(from, 1);
  out.splice(to, 0, b!);
  return out;
}
