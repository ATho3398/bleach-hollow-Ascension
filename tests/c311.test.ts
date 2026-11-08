// C.311 (GDD 192장 1): 이어 하지 못한 원정 = 모험 실패 정산 — 나간 뒤 30분 초과(stale)·새 패치(version)·손상(corrupt). 시한 안 + 같은 버전이면 그대로 이어 한다.
import { describe, expect, it } from 'vitest';
import { playCombatBot } from '../src/engine/combat';
import {
  advance, botPickTrait, chooseAbsorb, chooseContinue, chooseReturn, createExpedition, expeditionLeftAt, failExpedition, finishBattle, finishRest, markExpeditionBack, markExpeditionLeft,
  placeAll, restoreExpedition, serializeExpedition, startBattle, summarize, type ExpeditionState,
} from '../src/engine/expedition';
import { BALANCE, BALANCE_VERSION } from '../src/config/balance';
import { firstRunPending, migrateSave, newSaveData, readActiveExpedition, resumeWindowMs, SAVE_FORMAT_VERSION, SAVE_MIGRATIONS, type SaveData } from '../src/game';

const DECK = ['prey-nest-a', 'prey-nest-a', 'elite-den-a', 'env-fog', 'rest-a', 'prey-nest-b', 'env-ruin', 'elite-den-b'];
const MIN = 60_000;
const T0 = 1_700_000_000_000; // 저장 시각(기준)

/** 2바퀴째 전투 직전까지 원정을 몰아간다 (마지막 바퀴에 잃을 것이 생기게) */
function drive(exp: ExpeditionState, stop: (e: ExpeditionState) => boolean): ExpeditionState {
  for (let g = 0; exp.phase !== 'ended' && g < 5000; g++) {
    if (stop(exp)) return exp;
    if (exp.phase === 'moving') { placeAll(exp); advance(exp); }
    else if (exp.phase === 'battle') { const b = startBattle(exp); playCombatBot(b); finishBattle(exp, b); }
    else if (exp.phase === 'absorb') { const p = botPickTrait(exp); chooseAbsorb(exp, p.traitId, p.replaceSlot); }
    else if (exp.phase === 'rest') finishRest(exp);
    else if (exp.phase === 'nest-choice') { placeAll(exp); if (exp.lap >= 3) chooseReturn(exp); else chooseContinue(exp); }
  }
  return exp;
}
const atLap2Battle = (seed = 11) => drive(createExpedition({ factionId: 'hollow', seed, hunger: 10, condition: 100, deck: DECK }), (e) => e.lap >= 2 && e.phase === 'battle');

/** 원정 중간 저장이 든 세이브 (저장 시각 T0, 지금 밸런스 버전) */
function midSave(seed = 11): SaveData {
  const save = newSaveData('hollow', T0 - 10 * MIN);
  save.activeExpedition = serializeExpedition(atLap2Battle(seed), 1, T0)!;
  save.lastScreen = 'expedition';
  return save;
}
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

describe('192장 1: 이어 하기 시한·새 패치 → 모험 실패 정산 (C.311)', () => {
  it('시한 = provisional 30분', () => {
    expect(BALANCE.provisional.expedition.resumeWindowMinutes).toBe(30);
    expect(resumeWindowMs()).toBe(30 * MIN);
  });

  it('29분 뒤 돌아오면 그대로 이어 한다 (전투 직전 상태 그대로, 정산 없음)', () => {
    const save = midSave();
    const r = readActiveExpedition(save, T0 + 29 * MIN);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error();
    expect(r.exp.phase).toBe('battle');
    expect(r.exp.lap).toBe(2);
    expect(save.activeExpedition).not.toBeNull();
    expect(save.runLog.runs).toHaveLength(0);
    expect(save.lastScreen).toBe('expedition');
  });

  it('31분 뒤 돌아오면 이어 하지 않고 모험 실패로 정산한다 (패배 규칙 그대로)', () => {
    const save = midSave();
    const before = clone(save);
    const r = readActiveExpedition(save, T0 + 31 * MIN);
    expect(r.ok).toBe(false);
    if (r.ok || r.reason === 'none') throw new Error();
    expect(r.reason).toBe('stale');
    expect(r.settled).toBe(true);
    expect(r.exp?.phase).toBe('ended');
    expect(r.exp?.outcome).toBe('defeated');
    expect(r.exp?.endReason).toBe('abandoned');
    // 원정 영역을 비우고 방으로
    expect(save.activeExpedition).toBeNull();
    expect(save.lastScreen).toBe('room');
    // 런 로그: 실패 기록 + 이유 (9장)
    expect(save.runLog.runs).toHaveLength(1);
    const run = save.runLog.runs[0]!;
    expect(run.outcome).toBe('defeated');
    expect(run.endReason).toBe('abandoned');
    expect(run.abandoned).toBe('stale');
    expect(run.laps).toBe(2);
    // 패배 규칙: 쓰러짐(빈사) 기록
    expect(save.runLog.vitals.some((v) => v.kind === 'collapse' && v.cause === 'defeat' && v.runId === run.runId)).toBe(true);
    // 얻은 것 = 패배 때와 같은 만큼: 마지막 바퀴 획득물은 잃고(lost), 그 전 바퀴 것은 지킨다(kept → 보유)
    const sum = summarize(r.exp!);
    expect(run.gained).toEqual(sum.kept);
    expect(run.lost).toEqual(sum.lost);
    for (const id of sum.kept) expect(save.tiles.collection[id] ?? 0).toBeGreaterThanOrEqual(1);
    const firstLapTiles = r.exp!.acquired.filter((a) => a.lap < 2).map((a) => a.tileId);
    expect(sum.kept).toEqual(firstLapTiles);
    expect(sum.lost).toEqual(r.exp!.acquired.filter((a) => a.lap === 2).map((a) => a.tileId));
    // 골드: 지킨 골드만 (마지막 바퀴 번 것은 잃음)
    expect(save.shared.tradeCoins).toBe(Math.max(0, before.shared.tradeCoins + sum.keptGold));
    // 노력치·걸음·블록(빌드)은 원정 사본 그대로 (패배도 노력치는 지킨다)
    expect(save.evolution.ev).toEqual(r.exp!.evolution.ev);
    expect(save.build.owned).toEqual(r.exp!.build.owned);
    // 전투 기록·흡수 기록도 남는다
    expect(save.runLog.battles.length).toBe(r.exp!.battles.length);
    expect(save.runLog.battles.length).toBeGreaterThan(0);
  });

  it('밸런스 버전이 다르면(새 패치) 시한 안이라도 모험 실패로 정산한다', () => {
    const save = midSave();
    save.activeExpedition!.balanceVersion = BALANCE_VERSION - 1;
    const r = readActiveExpedition(save, T0 + 1 * MIN);
    expect(r.ok).toBe(false);
    if (r.ok || r.reason === 'none') throw new Error();
    expect(r.reason).toBe('version');
    expect(r.settled).toBe(true);
    expect(save.activeExpedition).toBeNull();
    expect(save.runLog.runs).toHaveLength(1);
    expect(save.runLog.runs[0]!.endReason).toBe('abandoned');
    expect(save.runLog.runs[0]!.abandoned).toBe('version');
    // 옛 동작(통째로 지움)이 아니라 기록·전투·획득이 남는다
    expect(save.runLog.battles.length).toBeGreaterThan(0);
  });

  it('restoreExpedition 은 밸런스 버전을 거르지 않고 돌려준다 (형식 버전 불일치만 version)', () => {
    const snap = midSave().activeExpedition!;
    const r = restoreExpedition({ ...clone(snap), balanceVersion: BALANCE_VERSION - 3 });
    expect(r.ok && r.balanceVersion).toBe(BALANCE_VERSION - 3);
    expect(restoreExpedition({ ...clone(snap), version: 0 })).toEqual({ ok: false, reason: 'version' });
    expect(restoreExpedition({ ...clone(snap), balanceVersion: 'x' })).toEqual({ ok: false, reason: 'corrupt' });
  });

  it('나간 시각(leftAtMs)이 있으면 그것이 기준: 저장은 오래됐어도 떠난 지 10분이면 이어 한다', () => {
    const save = midSave();
    markExpeditionLeft(save.activeExpedition!, T0 + 60 * MIN);
    expect(expeditionLeftAt(restoreExpedition(save.activeExpedition!) as { savedAtMs: number; leftAtMs: number | null })).toBe(T0 + 60 * MIN);
    expect(readActiveExpedition(save, T0 + 70 * MIN).ok).toBe(true);
    // 돌아와 이어 하면 떠난 시각을 지운다 → 다시 저장 시각 기준
    markExpeditionBack(save.activeExpedition!);
    expect(save.activeExpedition!.leftAtMs).toBeUndefined();
    const s2 = midSave();
    markExpeditionLeft(s2.activeExpedition!, T0 + 1 * MIN);
    const r = readActiveExpedition(s2, T0 + 40 * MIN);
    expect(!r.ok && r.reason).toBe('stale');
  });

  it('손상된 중간 저장: 상태는 못 살리지만 읽히는 값이 있으면 실패 기록 한 줄, 아예 못 읽으면 기록 없이 비운다', () => {
    const save = midSave();
    const snap = clone(save.activeExpedition!) as unknown as Record<string, any>;
    save.activeExpedition = { ...snap, exp: { ...snap.exp, phase: 'nope' } } as unknown as SaveData['activeExpedition'];
    const r = readActiveExpedition(save, T0 + MIN);
    if (r.ok || r.reason === 'none') throw new Error();
    expect(r.reason).toBe('corrupt');
    expect(r.settled).toBe(true);
    expect(save.activeExpedition).toBeNull();
    expect(save.runLog.runs).toHaveLength(1);
    expect(save.runLog.runs[0]).toMatchObject({ runId: snap.exp.runId, seed: snap.exp.seed, factionId: 'hollow', outcome: 'defeated', endReason: 'abandoned', abandoned: 'corrupt', laps: 2, gained: [], lost: [] });
    const s2 = midSave();
    s2.activeExpedition = 'garbage' as unknown as SaveData['activeExpedition'];
    const r2 = readActiveExpedition(s2, T0 + MIN);
    expect(!r2.ok && r2.reason === 'corrupt' && !r2.settled).toBe(true);
    expect(s2.runLog.runs).toHaveLength(0);
    expect(s2.activeExpedition).toBeNull();
  });

  it('첫 모험 튜토리얼은 정산하지 않고 비운다 (처음부터 다시, 튜토리얼 대기 유지)', () => {
    const save = midSave();
    const snap = save.activeExpedition! as unknown as Record<string, any>;
    snap.exp.tutorial = true;
    snap.exp.tutorialReward = null;
    expect(firstRunPending(save)).toBe(true);
    const r = readActiveExpedition(save, T0 + 31 * MIN);
    if (r.ok || r.reason === 'none') throw new Error();
    expect(r.reason).toBe('stale');
    expect(r.settled).toBe(false);
    expect(save.activeExpedition).toBeNull();
    expect(save.runLog.runs).toHaveLength(0);
    expect(firstRunPending(save)).toBe(true);
  });

  it('failExpedition: 어느 단계(전투 직전·흡수 대기·걷기)에서든 패배로 끝나고 이유가 남는다', () => {
    for (const stop of [(e: ExpeditionState) => e.phase === 'battle', (e: ExpeditionState) => e.phase === 'absorb', (e: ExpeditionState) => e.phase === 'moving' && e.lap >= 2]) {
      const exp = drive(createExpedition({ factionId: 'hollow', seed: 5, hunger: 10, condition: 100, deck: DECK }), stop);
      expect(exp.phase).not.toBe('ended');
      failExpedition(exp, 'version');
      expect([exp.phase, exp.outcome, exp.endReason, exp.abandoned, exp.pending, exp.absorbOffer]).toEqual(['ended', 'defeated', 'abandoned', 'version', null, null]);
      expect(() => failExpedition(exp, 'stale')).toThrow();
    }
  });

  it('세이브 형식 62 · 61 → 62 마이그레이션(구조 보정 없음) · 옛 형식 세이브의 원정은 시한·버전으로 판단한다', () => {
    expect(SAVE_FORMAT_VERSION).toBeGreaterThanOrEqual(62); // C.326 에서 63
    expect(typeof SAVE_MIGRATIONS[61]).toBe('function');
    const old = clone(midSave()) as unknown as Record<string, any>;
    old.meta.format = 61;
    const m = migrateSave(clone(old))!;
    expect(m.meta.format).toBe(SAVE_FORMAT_VERSION); // C.326 에서 63
    expect(m.activeExpedition).toEqual(old.activeExpedition);
    expect(readActiveExpedition(m, T0 + 5 * MIN).ok).toBe(true);
    const m2 = migrateSave(clone(old))!;
    const r = readActiveExpedition(m2, T0 + 45 * MIN);
    expect(!r.ok && r.reason).toBe('stale');
    expect(m2.runLog.runs[0]?.abandoned).toBe('stale');
  });
});
