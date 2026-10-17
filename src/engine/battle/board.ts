// 6×6 보드: 교환·매치 판정·특수 매치·낙하·리필·연쇄 (GDD 2-2). 종족 무관 순수 로직.

import { BALANCE } from '../../config/balance';
import { TILE_ROLES, type TileRole } from '../faction';
import { nextFloat, nextInt, type Rng } from './rng';

export type Board = TileRole[][];
export interface Cell {
  r: number;
  c: number;
}
/** 한 줄로 이어진 같은 색 3개 이상 */
export interface Run {
  role: TileRole;
  cells: Cell[];
  dir: 'h' | 'v';
}

/** 공허: 보드에 자연 생성되는 리스크 타일 (GDD 3-1). 나머지 4색은 균등 */
export const RISK_ROLE: TileRole = 'risk';
const BASE_ROLES: TileRole[] = TILE_ROLES.filter((r) => r !== RISK_ROLE);
const { minMatch, specialMatch } = BALANCE.battle;

export function emptyRoleCount(): Record<TileRole, number> {
  return { damage: 0, spirit: 0, shield: 0, absorb: 0, risk: 0 };
}

export function randomTile(rng: Rng, riskRate: number, exclude: TileRole[] = []): TileRole {
  if (!exclude.includes(RISK_ROLE) && nextFloat(rng) < riskRate) return RISK_ROLE;
  const pool = BASE_ROLES.filter((r) => !exclude.includes(r));
  return pool[nextInt(rng, pool.length)]!;
}

export function copyBoard(b: Board): Board {
  return b.map((row) => row.slice());
}

/** 같은 색 minMatch 개 이상 가로·세로 줄 */
export function findRuns(b: Board): Run[] {
  const n = b.length;
  const runs: Run[] = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; ) {
      let j = c;
      while (j < n && b[r]![j] === b[r]![c]) j++;
      if (j - c >= minMatch) {
        runs.push({ role: b[r]![c]!, dir: 'h', cells: Array.from({ length: j - c }, (_, k) => ({ r, c: c + k })) });
      }
      c = j;
    }
  }
  for (let c = 0; c < n; c++) {
    for (let r = 0; r < n; ) {
      let j = r;
      while (j < n && b[j]![c] === b[r]![c]) j++;
      if (j - r >= minMatch) {
        runs.push({ role: b[r]![c]!, dir: 'v', cells: Array.from({ length: j - r }, (_, k) => ({ r: r + k, c })) });
      }
      r = j;
    }
  }
  return runs;
}

export function isAdjacent(a: Cell, b: Cell): boolean {
  return Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;
}

export function inBounds(b: Board, p: Cell): boolean {
  return p.r >= 0 && p.c >= 0 && p.r < b.length && p.c < b.length;
}

export function swapCells(b: Board, a: Cell, c: Cell): void {
  const t = b[a.r]![a.c]!;
  b[a.r]![a.c] = b[c.r]![c.c]!;
  b[c.r]![c.c] = t;
}

/** 교환하면 매치가 생기는 인접 쌍 전부 */
export function findMoves(b: Board): [Cell, Cell][] {
  const n = b.length;
  const moves: [Cell, Cell][] = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      for (const d of [{ r: 0, c: 1 }, { r: 1, c: 0 }]) {
        const a = { r, c };
        const o = { r: r + d.r, c: c + d.c };
        if (!inBounds(b, o)) continue;
        swapCells(b, a, o);
        const ok = findRuns(b).length > 0;
        swapCells(b, a, o);
        if (ok) moves.push([a, o]);
      }
    }
  }
  return moves;
}

/** 처음부터 매치가 없고 움직일 수 있는 보드 */
export function createBoard(rng: Rng, riskRate: number, size: number = BALANCE.battle.boardSize): Board {
  for (;;) {
    const b: Board = [];
    for (let r = 0; r < size; r++) {
      const row: TileRole[] = [];
      for (let c = 0; c < size; c++) {
        const ex: TileRole[] = [];
        if (c >= 2 && row[c - 1] === row[c - 2]) ex.push(row[c - 1]!);
        if (r >= 2 && b[r - 1]![c] === b[r - 2]![c]) ex.push(b[r - 1]![c]!);
        row.push(randomTile(rng, riskRate, ex));
      }
      b.push(row);
    }
    if (findMoves(b).length > 0) return b;
  }
}

/** 한 번의 제거 단위(연쇄 1단계) */
export interface ResolveStep {
  /** 제거 직전 보드 */
  before: Board;
  /** 낙하·리필 후 보드 */
  after: Board;
  runs: Run[];
  cleared: Cell[];
  /** 매치(줄) 횟수: 4매치도 1회 */
  matchesByRole: Record<TileRole, number>;
  /** 실제로 제거된 타일 수 (줄 폭발·색 전체 제거로 딸려 나간 것 포함) */
  clearedByRole: Record<TileRole, number>;
  /** 이 단계에서 터진 특수 매치 */
  specials: { kind: 'lineBlast' | 'colorClear'; role: TileRole }[];
  /** 1 = 첫 제거, 2 이상 = 연쇄 */
  chain: number;
}

const MAX_CHAIN = 50;

/** 매치가 없을 때까지 제거 → 낙하 → 리필을 반복한다. board 를 직접 바꾼다 */
export function resolveBoard(board: Board, rng: Rng, riskRate: number): ResolveStep[] {
  const n = board.length;
  const steps: ResolveStep[] = [];
  for (let chain = 1; chain <= MAX_CHAIN; chain++) {
    const runs = findRuns(board);
    if (runs.length === 0) break;
    const before = copyBoard(board);
    const marked = new Set<number>();
    const mark = (r: number, c: number) => marked.add(r * n + c);
    const matchesByRole = emptyRoleCount();
    const specials: ResolveStep['specials'] = [];
    for (const run of runs) {
      matchesByRole[run.role]++;
      for (const p of run.cells) mark(p.r, p.c);
      if (run.cells.length >= specialMatch.colorClear) {
        specials.push({ kind: 'colorClear', role: run.role });
        for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (board[r]![c] === run.role) mark(r, c);
      } else if (run.cells.length >= specialMatch.lineBlast) {
        specials.push({ kind: 'lineBlast', role: run.role });
        const first = run.cells[0]!;
        for (let k = 0; k < n; k++) {
          if (run.dir === 'h') mark(first.r, k);
          else mark(k, first.c);
        }
      }
    }
    const clearedByRole = emptyRoleCount();
    const cleared: Cell[] = [];
    for (const key of marked) {
      const p = { r: Math.floor(key / n), c: key % n };
      cleared.push(p);
      clearedByRole[board[p.r]![p.c]!]++;
    }
    for (let c = 0; c < n; c++) {
      const kept: TileRole[] = [];
      for (let r = n - 1; r >= 0; r--) if (!marked.has(r * n + c)) kept.push(board[r]![c]!);
      for (let r = n - 1; r >= 0; r--) {
        const idx = n - 1 - r;
        board[r]![c] = idx < kept.length ? kept[idx]! : randomTile(rng, riskRate);
      }
    }
    steps.push({ before, after: copyBoard(board), runs, cleared, matchesByRole, clearedByRole, specials, chain });
  }
  return steps;
}
