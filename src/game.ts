// 게임 상태와 세이브. 런 로그(GDD 9장)는 처음부터 저장 구조에 들어 있다 (CLAUDE.md 규칙 4)

import { BALANCE_VERSION } from './config/balance';
import { BALANCE } from './config/balance';
import { completedLineages, newBuild, type BuildState } from './engine/absorb';
import { applyExpeditionEnd, newNest, type NestState } from './engine/nest';
import { buildRunRecord, summarize, type ExpeditionState } from './engine/expedition';
import {
  cloneEvolution, evolve, newEvolution, noteEvolutionBreakthrough, recordEvolutionAbsorb, type EvolutionState, type EvolveResult,
} from './engine/evolution';
import { emptyLegacyMatches, emptyRunLog, type BattleRecord, type RunLog } from './engine/runLog';
import { tilesFor } from './data/tiles';
import { PATCH_LABEL } from './version';

/** 세이브 구조를 바꾸면 올리고 마이그레이션을 추가한다 */
export const SAVE_FORMAT_VERSION = 6;

export interface SaveMeta {
  format: number;
  balanceVersion: number;
  /** 세이브를 시작한 패치 (docs/dev-log.md 소절) */
  startPatch: string;
}

export function newSaveMeta(): SaveMeta {
  return { format: SAVE_FORMAT_VERSION, balanceVersion: BALANCE_VERSION, startPatch: PATCH_LABEL };
}

export interface SaveData {
  meta: SaveMeta;
  /** 선택한 종족 id (src/data/factions). 게임 시작 때 고른다 (GDD 12장) */
  factionId: string;
  /** 둥지 상태: 허기·컨디션 (GDD 7장) */
  nest: NestState;
  /** 흡수 빌드: 가진 특성과 슬롯 (GDD 4장). 계통·특성은 임시 데이터 */
  build: BuildState;
  /** 진화 상태: 현재 단계(0~4), 현재 단계 계통별 흡수 누적, 지금까지의 형태 (GDD 4-2). 수치·데이터는 임시 */
  evolution: EvolutionState;
  /** 보유 타일 수량과 원정에 가져갈 덱 (GDD 6장). 시작 구성은 임시 */
  tiles: TileStock;
  /** 히든 조건용 영구 기록 */
  runLog: RunLog;
}

export interface TileStock {
  collection: Record<string, number>;
  /** 가져갈 덱: 타일 id 목록(중복 가능, 보유 수량 이내) */
  deck: string[];
}

export function newTileStock(): TileStock {
  return { collection: { ...BALANCE.provisional.expedition.startingCollection }, deck: [] };
}

export function newSaveData(factionId: string, nowMs: number = Date.now()): SaveData {
  return { meta: newSaveMeta(), factionId, nest: newNest(nowMs), build: newBuild(), evolution: newEvolution(), tiles: newTileStock(), runLog: emptyRunLog() };
}

/** 끝난 원정을 세이브에 반영: 전투 기록·런 기록, 보존된 타일을 보유에 더함, 둥지 상태 갱신 */
export function recordExpedition(save: SaveData, exp: ExpeditionState, nowMs: number = Date.now()): void {
  const log = save.runLog;
  log.battles.push(...exp.battles);
  log.runs.push(buildRunRecord(exp));
  log.absorbs.push(...exp.absorbRecords);
  // 리스크 기록: 최고치, 한계 돌파 횟수, 돌파 후 생존(= 돌파하고도 귀환) 횟수 (GDD 9장)
  log.risk.peak = Math.max(log.risk.peak, exp.riskPeak);
  if (exp.breakthrough) {
    log.risk.breakthroughs++;
    if (exp.outcome === 'returned') log.risk.survivedBreakthroughs++;
  }
  // 이 원정이 끝난 뒤의 슬롯으로 계통 완성 기록 (패배로 잃은 진행도는 세지 않는다)
  for (const lineageId of completedLineages(exp.build)) {
    let rec = log.lineages.find((l) => l.lineageId === lineageId);
    if (!rec) log.lineages.push((rec = { lineageId, completed: false, conflictingTried: false }));
    if (!rec.completed) {
      rec.completed = true;
      rec.firstCompletedRunId = exp.runId;
    }
  }
  save.build = cloneBuildOf(exp.build);
  // 진화 상태: 원정 중 쌓인 흡수 누적을 합치고, 이 원정에서 한계 돌파를 했으면 이 단계의 세 번째 후보가 열린다 (GDD 4-2)
  save.evolution = cloneEvolution(exp.evolution);
  if (exp.breakthrough) noteEvolutionBreakthrough(save.evolution);
  for (const id of summarize(exp).kept) save.tiles.collection[id] = (save.tiles.collection[id] ?? 0) + 1;
  applyExpeditionEnd(save.nest, exp, nowMs);
}

function cloneBuildOf(b: BuildState): BuildState {
  return { owned: [...b.owned], slots: [...b.slots] };
}

/** 둥지에서 진화를 확정한다 (원정 중에는 부르지 않는다). 슬롯 +1, 누적 리셋, 런 로그에 기록. 안정 수치·리스크는 그대로 */
export function performEvolution(save: SaveData, nowMs: number = Date.now()): EvolveResult {
  const r = evolve(save.evolution, save.build, save.nest.stability, nowMs);
  if (r.ok) save.runLog.tiers.evolutions.push(r.record);
  return r;
}

/** 새 원정의 runId = 지금까지 기록된 원정 수 + 1 */
export function nextRunId(save: SaveData): number {
  return save.runLog.runs.length + 1;
}

/** 세이브에 전투 기록을 더한다 */
export function recordBattle(save: SaveData, record: BattleRecord): void {
  save.runLog.battles.push(record);
}

// ── 저장·불러오기 (localStorage) ──
export const SAVE_KEY = 'bleach-hollow-ascension.save';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** 이전 형식 세이브를 현재 형식으로 올린다. 알 수 없는 데이터는 null */
export function migrateSave(raw: unknown): SaveData | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as { meta?: { format?: number }; factionId?: unknown; runLog?: RunLog };
  if (typeof r.factionId !== 'string' || !r.runLog || typeof r.meta?.format !== 'number') return null;
  const save = r as SaveData;
  if (save.meta.format > SAVE_FORMAT_VERSION) return null;
  if (save.meta.format < 2) {
    // 형식 1 → 2: BattleRecord 에 enemyId, factionId, seed, riskGained, absorbGained, lossReason 추가
    save.runLog.battles = save.runLog.battles.map((b) => ({
      ...b,
      enemyId: b.enemyId ?? 'unknown',
      factionId: b.factionId ?? save.factionId,
      seed: b.seed ?? 0,
      riskGained: b.riskGained ?? 0,
      absorbGained: b.absorbGained ?? 0,
      lossReason: b.lossReason ?? null,
    }));
    save.meta.format = 2;
  }
  if (save.meta.format < 3) {
    // 형식 2 → 3: 둥지 상태·타일 보유 추가, RunRecord 에 endReason/seed/factionId 추가
    save.nest = newNest(Date.now());
    save.tiles = newTileStock();
    save.runLog.runs = (save.runLog.runs ?? []).map((r) => ({
      ...r,
      endReason: r.endReason ?? (r.outcome === 'returned' ? 'returned' : 'battle-lost'),
      seed: r.seed ?? 0,
      factionId: r.factionId ?? save.factionId,
    }));
    save.meta.format = 3;
  }
  if (save.meta.format < 4) {
    // 형식 3 → 4 (P3): 둥지에 리스크 게이지·안정 수치, 흡수 빌드 추가, AbsorbRecord·RunRecord 필드 추가
    save.nest = { ...save.nest, risk: save.nest.risk ?? 0, stability: save.nest.stability ?? BALANCE.provisional.risk.stabilityStart };
    save.build = save.build ?? newBuild();
    save.runLog.absorbs = (save.runLog.absorbs ?? []).map((a) => ({ ...a, traitId: a.traitId ?? null, lap: a.lap ?? 0 }));
    save.runLog.runs = save.runLog.runs.map((r) => ({
      ...r,
      gainedTraits: r.gainedTraits ?? [],
      lostTraits: r.lostTraits ?? [],
      riskPeak: r.riskPeak ?? 0,
      breakthrough: r.breakthrough ?? false,
    }));
    save.meta.format = 4;
  }
  if (save.meta.format < 5) {
    // 형식 4 → 5 (C.6 전투 v2): BattleRecord 에 전투 시간·블록 사용·체인3·막기·공허·필살·마무리 일격·흡수 조건 필드 추가.
    // 매치3 시절 기록은 그 값이 없으므로 0/빈 값으로 채운다 (기존 필드는 그대로)
    save.runLog.battles = save.runLog.battles.map((b) => ({
      ...b,
      matchesByRole: { ...emptyLegacyMatches(), ...(b.matchesByRole ?? {}) },
      durationSeconds: b.durationSeconds ?? 0,
      blocksByTrait: b.blocksByTrait ?? {},
      blocksByChain: b.blocksByChain ?? [0, 0, 0],
      chain3Count: b.chain3Count ?? 0,
      guardSuccesses: b.guardSuccesses ?? 0,
      voidUsed: b.voidUsed ?? 0,
      specialUsed: b.specialUsed ?? false,
      finisherKind: b.finisherKind ?? null,
      finisherTraitId: b.finisherTraitId ?? null,
      finisherLineageId: b.finisherLineageId ?? null,
      absorbable: b.absorbable ?? false,
    }));
    save.meta.format = 5;
  }
  if (save.meta.format < 6) {
    // 형식 5 → 6 (C.9 조합 진화): 진화 상태 추가(1단계), RunLog.tiers.evolutions 추가.
    // 지금까지 흡수한 기록(runLog.absorbs)을 1단계 계통별 누적으로 옮겨 기존 세이브도 진화 진행이 시작된다
    save.evolution = newEvolution();
    for (const a of save.runLog.absorbs ?? []) if (a.absorbed) recordEvolutionAbsorb(save.evolution, a.lineageId, a.rare);
    save.runLog.tiers = { ...save.runLog.tiers, evolutions: save.runLog.tiers?.evolutions ?? [] };
    save.meta.format = 6;
  }
  return save;
}

export function loadSave(storage: StorageLike): SaveData | null {
  try {
    const text = storage.getItem(SAVE_KEY);
    return text ? migrateSave(JSON.parse(text)) : null;
  } catch {
    return null;
  }
}

export function writeSave(storage: StorageLike, save: SaveData): void {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // 저장 공간이 막힌 환경(시크릿 모드 등)에서는 이번 판만 기록이 남지 않는다
  }
}

/** 가져갈 덱을 정리한다: 이 종족이 쓰는 타일만, 보유 수량 이내로. 비면 보유량이 많은 순으로 채운다 */
export function sanitizeDeck(stock: TileStock, factionId: string, size: number = BALANCE.provisional.expedition.deckSize): string[] {
  const options = tilesFor(factionId).map((t) => t.id);
  const used: Record<string, number> = {};
  const deck: string[] = [];
  for (const id of stock.deck) {
    if (deck.length >= size || !options.includes(id)) continue;
    if ((used[id] ?? 0) >= (stock.collection[id] ?? 0)) continue;
    used[id] = (used[id] ?? 0) + 1;
    deck.push(id);
  }
  if (deck.length === 0) {
    for (let round = 0; deck.length < size; round++) {
      let added = false;
      for (const id of options) {
        if (deck.length < size && (stock.collection[id] ?? 0) > round) {
          deck.push(id);
          added = true;
        }
      }
      if (!added) break;
    }
  }
  return deck;
}
