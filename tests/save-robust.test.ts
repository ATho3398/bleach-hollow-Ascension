// 세이브 견고성 (H-1, C.70): 형식 1~현재 대표 세이브 마이그레이션, 깨진·빈·일부 빠진 세이브, 저장 공간 초과, 백업 복구, 원정 중간 저장 복구
import { describe, expect, it } from 'vitest';
import { playCombatBot } from '../src/engine/combat';
import {
  advance, botPickTrait, chooseAbsorb, chooseContinue, chooseReturn, createExpedition, finishBattle, finishRest, placeAll, serializeExpedition, startBattle, type ExpeditionState,
} from '../src/engine/expedition';
import { loadSave, migrateSave, newSaveData, readActiveExpedition, recordExpedition, SAVE_FORMAT_VERSION, SAVE_KEY, writeSave, type SaveData } from '../src/game';
import { parseImport, recoverFromBackup } from '../src/saveBackup';
import { slotBackupKey, slotKey, slotSummary, writeSlotSave } from '../src/saveSlots';
import { continueChoices } from '../src/ui/slotView';
import { useLegacyMigrations } from './helpers/legacyGate';

useLegacyMigrations(); // 옛 형식 마이그레이션 시험 (C.120, GDD 61장)

const DECK = ['prey-nest-a', 'prey-nest-a', 'elite-den-a', 'env-fog', 'rest-a', 'prey-nest-b', 'env-ruin', 'elite-den-b'];

/** 저장소 흉내. cap(글자 수)을 넘기는 쓰기는 QuotaExceededError 처럼 던진다 */
function memStore(init: Record<string, string> = {}, cap = Infinity) {
  const m = new Map(Object.entries(init));
  const used = () => [...m].reduce((n, [k, v]) => n + k.length + v.length, 0);
  return {
    m,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (used() - (m.has(k) ? k.length + m.get(k)!.length : 0) + k.length + v.length > cap) throw new DOMException('full', 'QuotaExceededError');
      m.set(k, v);
    },
    removeItem: (k: string) => void m.delete(k),
  };
}

function drive(exp: ExpeditionState, stopAtBattle = false): ExpeditionState {
  for (let g = 0; exp.phase !== 'ended' && g < 5000; g++) {
    if (exp.phase === 'moving') { placeAll(exp); advance(exp); }
    else if (exp.phase === 'battle') { if (stopAtBattle) return exp; const b = startBattle(exp); playCombatBot(b); finishBattle(exp, b); }
    else if (exp.phase === 'absorb') { const p = botPickTrait(exp); chooseAbsorb(exp, p.traitId, p.replaceSlot); }
    else if (exp.phase === 'rest') finishRest(exp);
    else if (exp.phase === 'nest-choice') { placeAll(exp); if (exp.lap >= 2) chooseReturn(exp); else chooseContinue(exp); }
  }
  return exp;
}

/** 원정 3번을 다녀온 지금 형식 세이브 */
function playedSave(): SaveData {
  const save = newSaveData('hollow', 1_000);
  for (let i = 0; i < 3; i++) recordExpedition(save, drive(createExpedition({ factionId: 'hollow', seed: i + 1, hunger: 10, condition: 100, deck: DECK })), 2_000 + i);
  return save;
}
const PLAYED = JSON.stringify(playedSave());

/** 형식 f 시절의 대표 세이브: 지금 세이브에서 형식 f 뒤에 생긴 영역을 걷어 낸다 (migrateSave 단계 주석의 역순) */
function legacyOf(f: number): Record<string, any> {
  const s = JSON.parse(PLAYED);
  const log = s.runLog;
  s.meta.format = f;
  if (f < 25) delete s.machine;
  if (f < 24) { delete s.wear; delete log.shopPurchases; s.shared = { ...s.shared }; delete s.shared.rerollTickets; delete s.shared.deckSlots; delete s.shared.cosmetics; }
  if (f < 23) { delete s.otherTracks; delete s.trackNotice; delete s.hogyoku; delete s.transcendentDex; delete s.slotLog; }
  if (f < 22) { delete s.story; delete s.bossDex; delete log.bossBattles; delete log.storyRuns; }
  if (f < 21) for (const r of log.runs) { delete r.synergies; delete r.mutations; delete r.events; delete r.drafts; delete r.gold; }
  if (f < 20) { delete s.rebirth; delete log.rebirths; }
  if (f < 19) delete s.skin;
  if (f < 18) { delete s.training; delete log.trainings; for (const b of log.battles) { delete b.liberationUsed; delete b.liberationAt; } }
  if (f < 17) { delete s.lastSeenAt; for (const r of log.runs) delete r.groundId; }
  if (f < 16) s.shared = { soulCrystals: 2 };
  if (f < 15) { delete s.rank; delete s.shared; delete log.rankBattles; delete log.rankChanges; }
  if (f < 14) { s.evolution = { tierIndex: 1, formHistory: [], formId: null }; for (const b of log.battles) delete b.finisherElement; for (const a of log.absorbs) delete a.element; }
  if (f < 13) delete s.lastScreen;
  if (f < 11) delete s.help;
  if (f < 9) delete s.activeExpedition;
  if (f < 8) delete s.titles;
  if (f < 7) delete s.formDex;
  if (f < 6) { delete s.evolution; delete log.tiers.evolutions; }
  if (f < 5) for (const b of log.battles) for (const k of ['durationSeconds', 'blocksByTrait', 'blocksByChain', 'chain3Count', 'guardSuccesses', 'voidUsed', 'specialUsed', 'finisherKind', 'finisherTraitId', 'absorbable', 'storedUsed', 'storedWasted', 'chainsByFamily']) delete b[k];
  if (f < 4) { delete s.build; s.nest = { hunger: 30, condition: 80, weakened: false, lastTickMs: 1 }; }
  if (f < 3) { delete s.nest; delete s.tiles; for (const r of log.runs) { delete r.endReason; delete r.seed; delete r.factionId; } }
  if (f < 2) for (const b of log.battles) { delete b.enemyId; delete b.factionId; delete b.seed; delete b.riskGained; delete b.absorbGained; delete b.lossReason; }
  return s;
}

const load = (v: unknown) => loadSave(memStore({ [SAVE_KEY]: typeof v === 'string' ? v : JSON.stringify(v) }));

describe('형식 1~현재 대표 세이브 (C.70)', () => {
  const base = JSON.parse(PLAYED);
  for (let f = 1; f <= SAVE_FORMAT_VERSION; f++) {
    it(`형식 ${f} 세이브가 열리고 런 로그가 남는다`, () => {
      const s = load(legacyOf(f));
      expect(s).not.toBeNull();
      expect(s!.meta.format).toBe(SAVE_FORMAT_VERSION);
      expect(s!.runLog.battles).toHaveLength(base.runLog.battles.length);
      expect(s!.runLog.runs).toHaveLength(base.runLog.runs.length);
      expect(s!.runLog.absorbs).toHaveLength(base.runLog.absorbs.length);
      if (f >= 14) expect(s!.evolution.tierIndex).toBe(base.evolution.tierIndex);
      const imp = parseImport(JSON.stringify(legacyOf(f)));
      expect(imp.ok).toBe(true);
      // 올린 세이브를 저장해 다시 열어도 같다
      const st = memStore();
      writeSave(st, s!);
      expect(loadSave(st)).toEqual(JSON.parse(JSON.stringify(s)));
    });
  }
});

describe('깨진·빈·일부 빠진 세이브', () => {
  it('JSON 아님·빈 값·형식 번호 이상은 멈추지 않고 null', () => {
    const good = JSON.parse(PLAYED);
    for (const v of ['', 'null', '{', '[]', '"x"', '42', '{"meta":{}}']) expect(load(v)).toBeNull();
    for (const format of [0, -3, 1.5, 'x', null]) expect(load({ ...good, meta: { ...good.meta, format } })).toBeNull();
    expect(migrateSave({ ...good, meta: { ...good.meta, format: NaN } })).toBeNull(); // 예전에는 NaN 형식이 그대로 열리고 다음 저장 때 형식이 null 로 써져 세이브를 잃었다
  });

  it('최상위 영역 하나가 빠져도 열리거나(빈 값으로 채움) 안전하게 거부된다 — 열렸으면 화면이 읽는 구조가 다 있다', () => {
    const base = JSON.parse(PLAYED);
    const mustFail = ['meta', 'factionId', 'runLog', 'evolution'];
    for (const k of Object.keys(base)) {
      const s = { ...JSON.parse(PLAYED) };
      delete s[k];
      const r = load(s);
      if (mustFail.includes(k)) { expect(r, k).toBeNull(); continue; }
      expect(r, k).not.toBeNull();
      expect(parseImport(JSON.stringify(s)).ok, k).toBe(true);
      expect(r!.runLog.battles, k).toHaveLength(base.runLog.battles.length);
    }
  });

  it('런 로그 안의 영역이 빠지거나 깨져도 열리고, 남은 기록은 그대로', () => {
    const base = JSON.parse(PLAYED);
    for (const k of Object.keys(base.runLog)) {
      for (const bad of [undefined, 'x', 7]) {
        const s = JSON.parse(PLAYED);
        if (bad === undefined) delete s.runLog[k]; else s.runLog[k] = bad;
        const r = load(s);
        expect(r, `${k}=${bad}`).not.toBeNull();
        // 가져오기는 엄격: 빠진 것은 받고, 모양이 틀린 핵심 목록은 손상으로 거부
        expect(parseImport(JSON.stringify(s)).ok, k).toBe(bad === undefined || !['battles', 'runs', 'absorbs'].includes(k));
        if (k !== 'battles') expect(r!.runLog.battles).toHaveLength(base.runLog.battles.length);
      }
    }
    const s = JSON.parse(PLAYED);
    s.runLog.battles.push(null, 3, 'x');
    expect(load(s)!.runLog.battles).toHaveLength(base.runLog.battles.length);
  });

  it('둥지·타일 안의 값이 깨져도 처음 값으로 채운다', () => {
    const s = JSON.parse(PLAYED);
    s.nest = { hunger: 'a', condition: null };
    s.tiles = { collection: 3, presets: [1, { factionId: 'hollow', cells: ['x'] }] };
    const r = load(s)!;
    expect(Number.isFinite(r.nest.hunger) && Number.isFinite(r.nest.condition) && Number.isFinite(r.nest.lastTickMs)).toBe(true);
    expect(typeof r.tiles.collection).toBe('object');
    expect(r.tiles.presets).toEqual([]);
  });
});

describe('원정 중간 저장 복구', () => {
  const midSave = () => {
    const save = playedSave();
    const exp = drive(createExpedition({ factionId: 'hollow', seed: 9, hunger: 10, condition: 100, deck: DECK }), true);
    save.activeExpedition = serializeExpedition(exp, 1, 5)!;
    save.lastScreen = 'expedition';
    return save;
  };

  it('정상 중간 저장은 저장·로드 뒤 그대로 이어한다', () => {
    const st = memStore();
    writeSave(st, midSave());
    const r = readActiveExpedition(loadSave(st)!);
    expect(r.ok).toBe(true);
  });

  it('깨진 중간 저장은 세이브를 막지 않고 원정만 비운다 (런 로그는 남는다)', () => {
    const snap = midSave().activeExpedition as unknown as Record<string, unknown>;
    const broken: unknown[] = ['x', 5, [], {}, { ...snap, version: 999 }, { ...snap, exp: null }, { ...snap, exp: { phase: 'moving' } }];
    for (const k of Object.keys(snap)) { const c = { ...snap }; delete c[k]; broken.push(c); }
    for (const b of broken) {
      const s = JSON.parse(JSON.stringify(midSave()));
      s.activeExpedition = b;
      const r = load(s);
      expect(r, JSON.stringify(b).slice(0, 40)).not.toBeNull();
      expect(() => readActiveExpedition(r!)).not.toThrow();
      const a = readActiveExpedition(r!);
      if (!a.ok) expect(r!.activeExpedition).toBeNull();
      expect(r!.runLog.runs.length).toBe(3);
    }
  });
});

describe('저장 공간 초과', () => {
  const save = playedSave();
  const size = JSON.stringify(save).length + slotKey(1).length;

  it('공간이 남으면 그대로 쓴다', () => {
    expect(writeSlotSave(memStore(), save, 1)).toBe('ok');
  });

  it('가득 차면 이 슬롯 백업 → 다른 슬롯 백업 순으로 지우고 쓴다. 슬롯 본 세이브는 건드리지 않는다', () => {
    const big = 'x'.repeat(size);
    const st = memStore({ [slotKey(1)]: 'old', [slotBackupKey(1)]: big, [slotKey(2)]: 'two', [slotBackupKey(2)]: big }, size * 2 + 50);
    save.nest.hunger = 41;
    expect(writeSlotSave(st, save, 1)).toBe('freed');
    expect(st.m.has(slotBackupKey(1))).toBe(false);
    expect(st.m.get(slotKey(2))).toBe('two');
    expect(loadSave(st)!.nest.hunger).toBe(41);
  });

  it('지울 백업이 없고 그래도 모자라면 failed — 지금 세이브 원문은 그대로', () => {
    const st = memStore({ [slotKey(1)]: 'old' }, 100);
    expect(writeSlotSave(st, save, 1)).toBe('failed');
    expect(st.m.get(slotKey(1))).toBe('old');
    expect(writeSave({ getItem: () => null, setItem: () => { throw new Error('blocked'); } }, save)).toBe(false);
  });
});

describe('백업 복구', () => {
  it('본 세이브가 손상되고 백업이 읽히면 맞바꾸고, 손상본은 백업 자리에 남는다', () => {
    const st = memStore({ [slotKey(2)]: '{broken', [slotBackupKey(2)]: PLAYED });
    const sum = slotSummary(st, 2);
    expect(sum).toMatchObject({ state: 'broken', recoverable: true });
    expect(continueChoices([sum]).openable).toEqual([2]);
    expect(recoverFromBackup(st, 2)).toBe(true);
    expect(loadSave(st, slotKey(2))!.runLog.runs).toHaveLength(3);
    expect(st.m.get(slotBackupKey(2))).toBe('{broken');
  });

  it('백업도 못 읽으면 아무것도 바꾸지 않는다', () => {
    const st = memStore({ [slotKey(1)]: '{broken', [slotBackupKey(1)]: '{"meta":1}' });
    expect(slotSummary(st, 1)).toMatchObject({ state: 'broken', recoverable: false });
    expect(recoverFromBackup(st, 1)).toBe(false);
    expect(st.m.get(slotKey(1))).toBe('{broken');
    expect(recoverFromBackup(memStore({ [slotKey(1)]: '{broken' }), 1)).toBe(false);
  });
});
