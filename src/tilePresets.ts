// 타일 배치 프리셋 (GDD 85장 11번, C.140): 덱 개념을 없앴다 — 보관함은 가진 타일 보기, 원정 출발 때 가진 타일 전부에서 길(최대 8칸 + 상점 배치 칸)에 놓는다.
// 자주 쓰는 배치를 프리셋으로 저장·불러오기(모험 배치 화면·보관함 둘 다에서 쓰는 API). 종족 무관 — 타일 목록은 데이터(deckTilesFor), 칸 수·저장 수는 balance.ts.
// 프리셋은 세이브 tiles.presets(슬롯 공유)에 종족 id 와 함께 둔다(타일은 종족마다 스킨·사용 가능 목록이 달라서).
import { BALANCE } from './config/balance';
import { deckTilesFor } from './data/tiles';
import { placeTile, unplaceTile, type ExpeditionState } from './engine/expedition';
import type { SaveData, TileStock } from './game';

const PX = BALANCE.provisional.tilePresets;
const LOOP = BALANCE.expedition.loopTiles;

/** 배치 프리셋 하나: cells[c] = c번 칸(1~11)에 놓을 타일 id. 0번(둥지 칸)은 늘 null */
export interface TilePreset {
  name: string;
  factionId: string;
  cells: (string | null)[];
}

export type PresetResult = { ok: true; index: number } | { ok: false; reason: string };

/** 원정 길에 놓을 수 있는 칸 수 (GDD 85장 11번 '8칸'): 기본 8 + 상점에서 산 배치 칸(옛 '덱 칸', 최대 +2, 슬롯 공유) */
export function placementLimitOf(save: Pick<SaveData, 'shared'>): number {
  return BALANCE.provisional.expedition.deckSize + (save.shared.deckSlots ?? 0);
}

/** 이 종족이 쓸 수 있는 가진 타일 전부 (장수만큼 반복, 데이터 순서) = 원정 출발 때 손에 쥐는 타일 */
export function ownedTileList(stock: Pick<TileStock, 'collection'>, factionId: string): string[] {
  const out: string[] = [];
  for (const t of deckTilesFor(factionId)) for (let i = 0; i < Math.max(0, Math.floor(stock.collection[t.id] ?? 0)); i++) out.push(t.id);
  return out;
}

/** 이 종족의 프리셋 (저장 순서) — 인덱스는 tiles.presets 안의 위치 */
export function tilePresetsFor(stock: Pick<TileStock, 'presets'>, factionId: string): { index: number; preset: TilePreset }[] {
  return stock.presets.map((preset, index) => ({ index, preset })).filter((x) => x.preset.factionId === factionId);
}

/** 프리셋 칸 정리: 길이 LOOP, 0번 null, 이 종족이 쓰는 타일만 */
function normCells(cells: readonly (string | null | undefined)[], factionId: string): (string | null)[] {
  const ok = new Set(deckTilesFor(factionId).map((t) => t.id));
  return Array.from({ length: LOOP }, (_, c) => {
    const id = cells[c];
    return c >= 1 && typeof id === 'string' && ok.has(id) ? id : null;
  });
}

/** 배치를 프리셋으로 저장한다. index 를 주면 그 프리셋을 덮어쓴다(같은 종족 것만). 칸 수가 배치 칸 수를 넘거나, 가진 장수보다 많이 쓰면 거절 */
export function saveTilePreset(save: Pick<SaveData, 'tiles' | 'shared' | 'factionId'>, name: string, cells: readonly (string | null)[], index?: number): PresetResult {
  const fid = save.factionId;
  const norm = normCells(cells, fid);
  const ids = norm.filter((x): x is string => x !== null);
  if (ids.length === 0) return { ok: false, reason: '놓은 타일이 없다' };
  const limit = placementLimitOf(save);
  if (ids.length > limit) return { ok: false, reason: `배치는 최대 ${limit}칸이다` };
  const need: Record<string, number> = {};
  for (const id of ids) need[id] = (need[id] ?? 0) + 1;
  for (const [id, n] of Object.entries(need)) if ((save.tiles.collection[id] ?? 0) < n) return { ok: false, reason: '가진 장수보다 많다' };
  const label = (name.trim() || `프리셋 ${tilePresetsFor(save.tiles, fid).length + 1}`).slice(0, PX.nameMax);
  const preset: TilePreset = { name: label, factionId: fid, cells: norm };
  if (index !== undefined) {
    if (save.tiles.presets[index]?.factionId !== fid) return { ok: false, reason: '없는 프리셋이다' };
    save.tiles.presets[index] = preset;
    return { ok: true, index };
  }
  if (tilePresetsFor(save.tiles, fid).length >= PX.max) return { ok: false, reason: `프리셋은 ${PX.max}개까지` };
  save.tiles.presets.push(preset);
  return { ok: true, index: save.tiles.presets.length - 1 };
}

/** 프리셋 지우기 (이 종족 것만). 지웠으면 true */
export function deleteTilePreset(save: Pick<SaveData, 'tiles' | 'factionId'>, index: number): boolean {
  if (save.tiles.presets[index]?.factionId !== save.factionId) return false;
  save.tiles.presets.splice(index, 1);
  return true;
}

/** 프리셋 이름 바꾸기 */
export function renameTilePreset(save: Pick<SaveData, 'tiles' | 'factionId'>, index: number, name: string): boolean {
  const p = save.tiles.presets[index];
  if (p?.factionId !== save.factionId || !name.trim()) return false;
  p.name = name.trim().slice(0, PX.nameMax);
  return true;
}

/** 지금 배치 단계의 길을 프리셋 칸으로 (저장용) */
export function cellsOfPlan(exp: Pick<ExpeditionState, 'slots'>): (string | null)[] {
  return Array.from({ length: LOOP }, (_, c) => (c >= 1 ? exp.slots[c] ?? null : null));
}

/** 배치 단계에서 프리셋 불러오기: 지금 놓은 타일을 모두 손으로 되돌린 뒤 프리셋 칸대로 놓는다. 손에 없는 타일(장수 부족·합성으로 사라짐)·배치 칸 초과는 건너뛰고 돌려준다 */
export function applyTilePreset(exp: ExpeditionState, preset: Pick<TilePreset, 'cells'>): { placed: number; missing: string[] } {
  for (let c = 1; c < LOOP; c++) if (exp.slots[c] != null) unplaceTile(exp, c);
  let placed = 0;
  const missing: string[] = [];
  for (let c = 1; c < LOOP; c++) {
    const id = preset.cells[c];
    if (typeof id !== 'string') continue;
    if (placeTile(exp, id, c).ok) placed++;
    else missing.push(id);
  }
  return { placed, missing };
}

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** 저장된 프리셋 정리: 모양이 틀린 것·모르는 타일은 버린다(알려진 종족의 타일만 남김). 종족마다 max 개까지 */
export function sanitizeTilePresets(raw: unknown, knownFactions: readonly string[]): TilePreset[] {
  if (!Array.isArray(raw)) return [];
  const per: Record<string, number> = {};
  const out: TilePreset[] = [];
  for (const p of raw) {
    if (!isRec(p) || typeof p.factionId !== 'string' || !knownFactions.includes(p.factionId) || !Array.isArray(p.cells)) continue;
    const cells = normCells(p.cells as unknown[] as (string | null)[], p.factionId);
    if (!cells.some((x) => x !== null) || (per[p.factionId] ?? 0) >= PX.max) continue;
    per[p.factionId] = (per[p.factionId] ?? 0) + 1;
    out.push({ name: typeof p.name === 'string' && p.name.trim() ? p.name.trim().slice(0, PX.nameMax) : '프리셋', factionId: p.factionId, cells });
  }
  return out;
}

