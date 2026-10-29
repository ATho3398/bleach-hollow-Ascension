// 원정 중간 저장 (GDD 14-1): 원정 상태를 세이브의 별도 영역(SaveData.activeExpedition)에 직렬화/복원한다.
// 전투 중 상태는 저장하지 않는다: 전투가 시작되는 순간(phase 'battle', pending 에 시드가 있다)에 한 번 저장해 두면
// 전투 도중 새로고침해도 그 전투를 처음부터 다시 치른다. 상태가 평범한 객체(rng 포함)라 JSON 왕복으로 결정성이 유지된다.

import { BALANCE, BALANCE_VERSION } from '../../config/balance';
import { getTile } from '../../data/tiles';
import { getTrait } from '../../data/traits';
import { getFaction } from '../../data/factions';
import { FOOD_IDS } from '../faction';
import { isGroundId } from '../../data/grounds';
import { isMutationId } from '../../data/tiles';
import { TILE_EVENTS } from '../../data/schema';
import { finishRest, type ExpeditionState } from './expedition';
import { getEpisode } from '../../data/story';
import { isBossId } from '../../data/bosses';
import { MAX_DIFFICULTY } from '../difficulty';

/** 저장 형식을 바꾸면 올린다 (다르면 이어하기를 숨기고 무시한다) */
/** C.47: 2 (진화 상태·전투 재료 구조가 바뀜 — 옛 원정 중간 저장은 이어하지 않는다) */
/** C.52: 3 (먹이 전리품·전리품 난수 추가) */
/** C.53: 4 (사냥터 groundId 추가) */
/** C.57: 5 (타일 변수 GDD 25-5: 변이·드래프트·이벤트 진행·골드·제단·보호막·함정·2연전·기록) */
/** C.58: 6 (스토리 화 진행 story, 보스전 pending.boss) */
/** C.75: 7 (원정 난이도 difficulty, GDD 32-1) */
/** C.86: 8 (자유 원정 보스 등장 freeBoss, GDD 37장 — 7 은 freeBoss 없음(null)으로 이어한다) */
export const EXPEDITION_SNAPSHOT_VERSION = 8;

export interface ExpeditionSnapshot {
  version: number;
  /** 밸런스가 다르면 같은 시드가 같은 결과를 내지 않으므로 이어하지 않는다 */
  balanceVersion: number;
  savedAtMs: number;
  /** 원정 화면 배속 (1/2/4) */
  speed: number;
  exp: ExpeditionState;
}

export type RestoreResult =
  | { ok: true; exp: ExpeditionState; speed: number; savedAtMs: number }
  | { ok: false; reason: 'corrupt' | 'version' };

/** 지금 원정 상태를 저장용으로 복제한다 (원본과 분리된 사본). 끝난 원정은 저장하지 않는다(null) */
export function serializeExpedition(exp: ExpeditionState, speed: number, nowMs: number = Date.now()): ExpeditionSnapshot | null {
  if (exp.phase === 'ended') return null;
  return {
    version: EXPEDITION_SNAPSHOT_VERSION,
    balanceVersion: BALANCE_VERSION,
    savedAtMs: nowMs,
    speed,
    exp: JSON.parse(JSON.stringify(exp)) as ExpeditionState,
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isInt = (v: unknown, min = 0): v is number => isNum(v) && Number.isInteger(v) && v >= min;
const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

function knows(fn: (id: string) => unknown, id: unknown): boolean {
  if (typeof id !== 'string') return false;
  try {
    fn(id);
    return true;
  } catch {
    return false;
  }
}

const PHASES = ['moving', 'battle', 'absorb', 'rest', 'nest-choice', 'event'];

/** 타일 변수 영역 (원정 형식 5) 검사 */
function validVariants(e: Record<string, unknown>): boolean {
  const L = BALANCE.expedition.loopTiles;
  if (typeof e.tileVariants !== 'boolean') return false;
  if (!isObj(e.varRng) || !isInt(e.varRng.state)) return false;
  if (e.mutation !== null && !isMutationId(e.mutation)) return false;
  if (!isInt(e.goldBank) || !Array.isArray(e.goldLoot) || !e.goldLoot.every((g) => isObj(g) && isNum(g.amount) && isInt(g.lap, 1))) return false;
  if (!isObj(e.traitBoosts) || !Object.entries(e.traitBoosts).every(([id, v]) => knows(getTrait, id) && isNum(v))) return false;
  if (!isNum(e.nextShield) || typeof e.trapArmed !== 'boolean' || !isNum(e.restMult) || !isInt(e.bonusSoul)) return false;
  // 이어 오는 체력 (GDD 107장, 세이브 형식 50): 0~1
  if (!isNum(e.hpFraction) || (e.hpFraction as number) < 0 || (e.hpFraction as number) > 1) return false;
  const q = e.queuedBattle;
  if (q !== null && !(isObj(q) && isInt(q.cell, 1) && (q.cell as number) < L && (q.synergy === null || typeof q.synergy === 'string'))) return false;
  const d = e.draft;
  if (d !== null) {
    if (e.phase !== 'nest-choice' || !isObj(d) || !isInt(d.lap, 1) || !isStrArr(d.options) || !d.options.every((id) => knows(getTile, id))) return false;
    if (d.picked !== null && !(isInt(d.picked) && (d.picked as number) < d.options.length)) return false;
  }
  const v = e.variantLog;
  if (!isObj(v) || !Array.isArray(v.synergies) || !Array.isArray(v.mutations) || !Array.isArray(v.events) || !Array.isArray(v.drafts)) return false;
  // 이벤트 중이면 밟은 이벤트 내용이 있어야 한다
  if (e.phase === 'event') {
    const p = e.eventPending;
    if (!isObj(p) || !knows(getTile, p.tileId) || !isInt(p.cell, 1) || (p.cell as number) >= L || !(TILE_EVENTS as readonly unknown[]).includes(p.event)) return false;
  } else if (e.eventPending !== null) return false;
  return true;
}

/** 스토리 화 영역 (원정 형식 6): 자유 원정은 null, 스토리면 있는 장·화와 진행도. 보스전 대기면 있는 보스 */
function validStory(e: Record<string, unknown>): boolean {
  const p = e.pending;
  if (isObj(p) && p.boss != null && !isBossId(p.boss)) return false;
  const st = e.story;
  if (st === null) return true;
  if (!isObj(st) || typeof st.chapterId !== 'string' || typeof st.episodeId !== 'string' || !knows(() => getEpisode(e.factionId as string, st.chapterId as string, st.episodeId as string), 'x')) return false;
  if (!isInt(st.progress) || !isInt(st.kills) || typeof st.cleared !== 'boolean' || typeof st.midShown !== 'boolean' || (st.cue !== null && st.cue !== 'mid')) return false;
  return st.bossResult === null || isObj(st.bossResult);
}

/** 자유 원정 보스 영역 (원정 형식 8): 스토리면 null, 자유 원정이면 이긴 보스 목록·등장·결과 */
function validFreeBoss(e: Record<string, unknown>): boolean {
  const fb = e.freeBoss;
  if (fb === null) return true;
  if (!isObj(fb) || !isStrArr(fb.beaten) || e.story !== null) return false;
  const a = fb.appear;
  if (a !== null && !(isObj(a) && isBossId(a.bossId) && isInt(a.lap, 1) && isInt(a.cell, 1) && (a.cell as number) < BALANCE.expedition.loopTiles)) return false;
  return fb.result === null || isObj(fb.result);
}

/** 손상·형식 불일치 검사. 통과하면 원정 상태로 쓸 수 있다고 본다 (깊은 내용까지는 보지 않고 엔진이 쓰는 뼈대만 본다) */
function validShape(e: unknown): e is ExpeditionState {
  if (!isObj(e)) return false;
  const L = BALANCE.expedition.loopTiles;
  if (!knows(getFaction, e.factionId)) return false;
  if (!isGroundId(e.groundId)) return false;
  if (!isInt(e.difficulty, 1) || (e.difficulty as number) > MAX_DIFFICULTY) return false;
  if (!isInt(e.streak) || (e.streak as number) > BALANCE.provisional.difficulty.streak.maxClears) return false;
  if (!isInt(e.seed) || !isInt(e.runId) || !isInt(e.maxLaps, 1) || !isInt(e.lap, 1) || !isInt(e.pos) || (e.pos as number) >= L) return false;
  if (!isObj(e.rng) || !isInt(e.rng.state)) return false;
  if (!isObj(e.lootRng) || !isInt(e.lootRng.state)) return false;
  if (!Array.isArray(e.foodLoot) || !e.foodLoot.every((a) => isObj(a) && typeof a.food === 'string' && (FOOD_IDS as readonly string[]).includes(a.food) && isInt(a.lap, 1))) return false;
  if (typeof e.phase !== 'string' || !PHASES.includes(e.phase)) return false;
  for (const k of ['hunger', 'condition', 'risk', 'riskPeak', 'stability', 'elapsedSeconds'] as const) if (!isNum(e[k])) return false;
  for (const k of ['elitesThisLap', 'victoriesThisLap', 'tilesThisLap', 'lapsCompleted'] as const) if (!isInt(e[k])) return false;
  if (!isStrArr(e.deck) || !isStrArr(e.hand) || !e.deck.every((id) => knows(getTile, id)) || !e.hand.every((id) => knows(getTile, id))) return false;
  if (!Array.isArray(e.slots) || e.slots.length !== L || !e.slots.every((s) => s === null || knows(getTile, s))) return false;
  // 임시 타일 (GDD 121장 4 ②): 손의 부분 집합·놓인 칸 (없으면 임시 타일 없음)
  if (e.tempHand !== undefined && !(isStrArr(e.tempHand) && e.tempHand.every((id) => knows(getTile, id)))) return false;
  if (e.tempCells !== undefined && !(Array.isArray(e.tempCells) && e.tempCells.every((c) => isInt(c, 1) && (c as number) < L))) return false;
  if (!Array.isArray(e.wildCells) || !e.wildCells.every((c) => isInt(c, 1) && (c as number) < L)) return false;
  if (!Array.isArray(e.battlesByLap) || e.battlesByLap.length < (e.lap as number) || !e.battlesByLap.every((n) => isInt(n))) return false;
  if (!Array.isArray(e.acquired) || !e.acquired.every((a) => isObj(a) && knows(getTile, a.tileId) && isInt(a.lap, 1))) return false;
  if (!Array.isArray(e.acquiredTraits) || !e.acquiredTraits.every((a) => isObj(a) && knows(getTrait, a.traitId) && isInt(a.lap, 1))) return false;
  if (!Array.isArray(e.battles) || !Array.isArray(e.absorbRecords) || !Array.isArray(e.events)) return false;
  const b = e.build;
  if (!isObj(b) || !isStrArr(b.owned) || !b.owned.every((id) => knows(getTrait, id))) return false;
  if (!Array.isArray(b.slots) || !b.slots.every((s) => s === null || knows(getTrait, s))) return false;
  if (!Array.isArray(e.lapStartSlots) || !e.lapStartSlots.every((s) => s === null || typeof s === 'string')) return false;
  const evo = e.evolution;
  if (!isObj(evo) || !isInt(evo.tierIndex) || !isInt(evo.steps) || !isObj(evo.elementAbsorbs) || !isObj(evo.ev)) return false;
  if (e.breakthrough !== null && !(isObj(e.breakthrough) && isInt(e.breakthrough.lap) && isInt(e.breakthrough.cell))) return false;
  // 전투 중이면 전투 재료(시드 포함)가, 흡수 중이면 제안이 있어야 한다
  if (e.phase === 'battle') {
    const p = e.pending;
    if (!isObj(p) || !isInt(p.seed) || !isObj(p.enemy) || typeof p.enemy.id !== 'string' || !isObj(p.params) || !isInt(p.cell) || !isInt(p.lap, 1)) return false;
  } else if (e.pending !== null) return false;
  if (e.phase === 'absorb') {
    const o = e.absorbOffer;
    if (!isObj(o) || typeof o.enemyId !== 'string' || !isStrArr(o.candidates)) return false;
  } else if (e.absorbOffer !== null) return false;
  if (e.outcome !== null || e.endReason !== null) return false;
  if (e.statBonus !== undefined && !(isNum(e.statBonus) && e.statBonus >= 0)) return false;
  if (!validStory(e) || !validFreeBoss(e)) return false;
  return validVariants(e);
}

/** 저장된 값을 원정 상태로 되살린다. 손상되거나 형식·밸런스 버전이 다르면 ok:false (앱이 죽지 않게 예외는 던지지 않는다) */
export function restoreExpedition(raw: unknown): RestoreResult {
  try {
    if (!isObj(raw)) return { ok: false, reason: 'corrupt' };
    if ((raw.version !== EXPEDITION_SNAPSHOT_VERSION && raw.version !== 7) || raw.balanceVersion !== BALANCE_VERSION) return { ok: false, reason: 'version' };
    // 형식 7 → 8: 자유 원정 보스 영역이 없으면 null (그 원정에는 보스가 나오지 않는다)
    if (raw.version === 7 && isObj(raw.exp) && raw.exp.freeBoss === undefined) raw.exp.freeBoss = null;
    if (!validShape(raw.exp)) return { ok: false, reason: 'corrupt' };
    const exp = JSON.parse(JSON.stringify(raw.exp)) as ExpeditionState;
    // 휴식 중에는 저장하지 않지만, 혹시 그 상태가 들어오면 휴식을 마친 상태로 되살린다
    if (exp.phase === 'rest') finishRest(exp);
    const speed = raw.speed === 2 || raw.speed === 4 ? raw.speed : 1;
    return { ok: true, exp, speed, savedAtMs: isNum(raw.savedAtMs) ? raw.savedAtMs : 0 };
  } catch {
    return { ok: false, reason: 'corrupt' };
  }
}
