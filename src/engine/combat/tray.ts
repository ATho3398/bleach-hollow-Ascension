// 블록 트레이 (GDD 3-5): 3열×2행 칸. 칸 번호 i = 행 × 열수 + 열. 종족 무관 순수 로직.

/** 트레이의 블록 하나. skill = 슬롯 특성 블록(기본 블록 포함), special = 필살 블록, void = 공허 블록 */
export interface Block {
  /** 블록마다 고유한 번호 (화면 연출용) */
  uid: number;
  kind: 'skill' | 'special' | 'void';
  /** skill 블록의 특성 id (기본 블록은 BASIC_SKILL_ID). special·void 는 null */
  traitId: string | null;
  /** 체인 단계 1~3 */
  chain: number;
}

export type Tray = (Block | null)[];

export function cellRC(i: number, cols: number): { r: number; c: number } {
  return { r: Math.floor(i / cols), c: i % cols };
}

/** 상하좌우 이웃인가 */
export function isNeighbor(a: number, b: number, cols: number): boolean {
  const p = cellRC(a, cols);
  const q = cellRC(b, cols);
  return Math.abs(p.r - q.r) + Math.abs(p.c - q.c) === 1;
}

export function neighbors(i: number, size: number, cols: number): number[] {
  const out: number[] = [];
  for (let j = 0; j < size; j++) if (isNeighbor(i, j, cols)) out.push(j);
  return out;
}

export function emptyCells(t: Tray): number[] {
  const out: number[] = [];
  t.forEach((b, i) => {
    if (b === null) out.push(i);
  });
  return out;
}

export function inTray(t: Tray, i: number): boolean {
  return Number.isInteger(i) && i >= 0 && i < t.length;
}

/** 합치기: 같은 특성의 skill 블록끼리, 상하좌우 이웃, 받는 쪽 체인이 최대 미만 (GDD 3-5). 필살·공허는 합칠 수 없다 */
export function canMerge(t: Tray, from: number, to: number, cols: number, maxChain: number): boolean {
  if (!inTray(t, from) || !inTray(t, to) || from === to) return false;
  const a = t[from];
  const b = t[to];
  if (!a || !b || a.kind !== 'skill' || b.kind !== 'skill' || a.traitId !== b.traitId) return false;
  return isNeighbor(from, to, cols) && b.chain < maxChain;
}

/** 이동: 빈 칸으로는 어디든 옮기고, 블록이 있는 칸과는 이웃일 때만 맞바꾼다 */
export function canMove(t: Tray, from: number, to: number, cols: number): boolean {
  if (!inTray(t, from) || !inTray(t, to) || from === to || !t[from]) return false;
  return t[to] === null || isNeighbor(from, to, cols);
}

/** 지금 합칠 수 있는 칸 쌍 전부 (화면 하이라이트·봇용) */
export function mergePairs(t: Tray, cols: number, maxChain: number): [number, number][] {
  const out: [number, number][] = [];
  for (let a = 0; a < t.length; a++) for (let b = 0; b < t.length; b++) if (canMerge(t, a, b, cols, maxChain)) out.push([a, b]);
  return out;
}
