import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { TITLES, parseTitle } from '../src/data/titles';
import type { TitleCondition, TitleDef } from '../src/data/schema';
import { gainTrait } from '../src/engine/absorb';
import { createExpedition } from '../src/engine/expedition';
import { emptyRunLog, type AbsorbRecord, type BattleRecord, type RunLog, type RunRecord } from '../src/engine/runLog';
import { checkCondition, evaluateTitles, unlockTitles } from '../src/engine/titles';
import { checkTitles, loadSave, migrateSave, newSaveData, performEvolution, recordExpedition, SAVE_FORMAT_VERSION, SAVE_KEY, writeSave } from '../src/game';
import { formatUnlockTime, titleCellView } from '../src/ui/titleDexView';
import { useLegacyMigrations } from './helpers/legacyGate';

useLegacyMigrations(); // 옛 형식 마이그레이션 시험 (C.120, GDD 61장)

const battle = (o: Partial<BattleRecord> = {}): BattleRecord => ({
  runId: 1, lap: 1, turns: 0, matchesByRole: { damage: 0, spirit: 0, shield: 0, absorb: 0, risk: 0 }, won: true, skillsUsed: [],
  enemyClass: 'normal', tierIndex: 0, enemyId: 'e', factionId: 'hollow', seed: 1, riskGained: 0, absorbGained: 0, lossReason: null,
  durationSeconds: 30, blocksByTrait: {}, blocksByChain: [0, 0, 0], chain3Count: 0, guardSuccesses: 0, voidUsed: 0, specialUsed: false,
  finisherKind: null, finisherTraitId: null, finisherElement: null, absorbable: false, storedUsed: 0, storedWasted: 0,
  chainsByFamily: {}, combosTriggered: 0, comboBlocksUsed: 0, liberationUsed: false, liberationAt: null, ...o,
});
const run = (o: Partial<RunRecord> = {}): RunRecord => ({
  runId: 1, laps: 1, outcome: 'returned', gained: [], lost: [], endReason: 'returned', seed: 1, factionId: 'hollow',
  gainedTraits: [], lostTraits: [], riskPeak: 0, breakthrough: false, ...o,
});
const absorb = (o: Partial<AbsorbRecord> = {}): AbsorbRecord => ({
  runId: 1, enemyId: 'e', element: 'fire', rare: false, absorbed: true, traitId: null, lap: 1, ...o,
});
const logWith = (o: Partial<RunLog>): RunLog => ({ ...emptyRunLog(), ...o });
const times = <T,>(n: number, f: () => T): T[] => Array.from({ length: n }, f);
const def = (id: string, condition: TitleCondition | null): TitleDef => ({ id, kind: 'tag', hidden: true, name: { '*': id }, condition, provisional: true });

describe('조건 어휘', () => {
  it('absorbCount: 전체/속성별/희귀만, 놓아준 것은 세지 않는다', () => {
    const log = logWith({ absorbs: [absorb(), absorb({ element: 'water', rare: true }), absorb({ absorbed: false })] });
    expect(checkCondition({ type: 'absorbCount', min: 2 }, log)).toBe(true);
    expect(checkCondition({ type: 'absorbCount', min: 3 }, log)).toBe(false);
    expect(checkCondition({ type: 'absorbCount', min: 1, element: 'water' }, log)).toBe(true);
    expect(checkCondition({ type: 'absorbCount', min: 2, element: 'fire' }, log)).toBe(false);
    expect(checkCondition({ type: 'absorbCount', min: 1, rareOnly: true }, log)).toBe(true);
    expect(checkCondition({ type: 'absorbCount', min: 2, rareOnly: true }, log)).toBe(false);
  });
  it('passedForm: 진화한 진화체와 진화 전 진화체(경로) 모두 센다', () => {
    const log = emptyRunLog();
    log.tiers.evolutions.push({ fromTier: 1, toTier: 2, fromFormId: 'f1', toFormId: 'f2', accumulation: { scores: {}, absorbs: 0, need: 0, rare: 0 } as never, at: 1, formId: 'f2' });
    for (const id of ['f1', 'f2']) expect(checkCondition({ type: 'passedForm', formId: id }, log)).toBe(true);
    expect(checkCondition({ type: 'passedForm', formId: 'f3' }, log)).toBe(false);
  });
  it('breakthroughs / survivedBreakthroughs', () => {
    const log = emptyRunLog();
    log.risk.breakthroughs = 2;
    log.risk.survivedBreakthroughs = 1;
    expect(checkCondition({ type: 'breakthroughs', min: 2 }, log)).toBe(true);
    expect(checkCondition({ type: 'breakthroughs', min: 3 }, log)).toBe(false);
    expect(checkCondition({ type: 'survivedBreakthroughs', min: 1 }, log)).toBe(true);
    expect(checkCondition({ type: 'survivedBreakthroughs', min: 2 }, log)).toBe(false);
  });
  it('chain3Total / guardTotal 은 전투 누계', () => {
    const log = logWith({ battles: [battle({ chain3Count: 2, guardSuccesses: 1 }), battle({ chain3Count: 3, guardSuccesses: 4 })] });
    expect(checkCondition({ type: 'chain3Total', min: 5 }, log)).toBe(true);
    expect(checkCondition({ type: 'chain3Total', min: 6 }, log)).toBe(false);
    expect(checkCondition({ type: 'guardTotal', min: 5 }, log)).toBe(true);
    expect(checkCondition({ type: 'guardTotal', min: 6 }, log)).toBe(false);
  });
  it('elitesDefeated: 이긴 강적만', () => {
    const log = logWith({ battles: [battle({ enemyClass: 'elite' }), battle({ enemyClass: 'elite', won: false }), battle()] });
    expect(checkCondition({ type: 'elitesDefeated', min: 1 }, log)).toBe(true);
    expect(checkCondition({ type: 'elitesDefeated', min: 2 }, log)).toBe(false);
  });
  it('runsReturned / runsDefeated / maxLap', () => {
    const log = logWith({ runs: [run({ laps: 2 }), run({ outcome: 'defeated', laps: 5, endReason: 'battle-lost' })] });
    expect(checkCondition({ type: 'runsReturned', min: 1 }, log)).toBe(true);
    expect(checkCondition({ type: 'runsReturned', min: 2 }, log)).toBe(false);
    expect(checkCondition({ type: 'runsDefeated', min: 1 }, log)).toBe(true);
    expect(checkCondition({ type: 'runsDefeated', min: 2 }, log)).toBe(false);
    expect(checkCondition({ type: 'maxLap', min: 5 }, log)).toBe(true);
    expect(checkCondition({ type: 'maxLap', min: 6 }, log)).toBe(false);
  });
  it('defeatedAtTier: 단계·적 등급별', () => {
    const log = logWith({ battles: [battle({ tierIndex: 1, enemyClass: 'elite' }), battle({ tierIndex: 1 }), battle({ tierIndex: 0, enemyClass: 'elite' })] });
    expect(checkCondition({ type: 'defeatedAtTier', tier: 1, min: 2 }, log)).toBe(true);
    expect(checkCondition({ type: 'defeatedAtTier', tier: 1, min: 2, enemyClass: 'elite' }, log)).toBe(false);
    expect(checkCondition({ type: 'defeatedAtTier', tier: 1, min: 1, enemyClass: 'elite' }, log)).toBe(true);
    expect(checkCondition({ type: 'defeatedAtTier', tier: 2, min: 1 }, log)).toBe(false);
  });
  it('AND / OR 조합 (중첩 포함)', () => {
    const log = logWith({ runs: [run()] });
    const yes: TitleCondition = { type: 'runsReturned', min: 1 };
    const no: TitleCondition = { type: 'runsDefeated', min: 1 };
    expect(checkCondition({ type: 'and', all: [yes, yes] }, log)).toBe(true);
    expect(checkCondition({ type: 'and', all: [yes, no] }, log)).toBe(false);
    expect(checkCondition({ type: 'or', any: [no, yes] }, log)).toBe(true);
    expect(checkCondition({ type: 'or', any: [no, no] }, log)).toBe(false);
    expect(checkCondition({ type: 'and', all: [yes, { type: 'or', any: [no, yes] }] }, log)).toBe(true);
  });
});

describe('평가기', () => {
  const defs = [def('a', { type: 'runsReturned', min: 1 }), def('b', { type: 'runsDefeated', min: 1 }), def('c', null)];
  it('순수: 새로 충족된 칭호만 돌려주고 상태를 바꾸지 않으며, 조건 없는 칭호는 해금되지 않는다', () => {
    const save = newSaveData('hollow', 0);
    save.runLog.runs.push(run());
    expect(evaluateTitles(save.runLog, save, defs).map((d) => d.id)).toEqual(['a']);
    expect(save.titles).toEqual([]);
  });
  it('해금은 영구: 한 번 해금되면 다시 나오지 않고, 기록은 해금 시각·시점·스냅샷을 가진다', () => {
    const save = newSaveData('shinigami', 0);
    save.runLog.runs.push(run({ laps: 3 }));
    expect(unlockTitles(save.runLog, save, defs, 'expedition', 777).map((d) => d.id)).toEqual(['a']);
    expect(save.titles).toHaveLength(1);
    expect(save.titles[0]).toMatchObject({ titleId: 'a', at: 777, trigger: 'expedition', seen: false, snapshot: { runs: 1, returned: 1, maxLap: 3, factionId: 'shinigami' } });
    save.runLog.runs = []; // 기록이 줄어도 해금은 유지
    expect(unlockTitles(save.runLog, save, defs, 'load', 999)).toEqual([]);
    expect(save.titles).toHaveLength(1);
    expect(save.titles[0]!.at).toBe(777);
  });
});

describe('평가 시점 훅', () => {
  it('원정 종료(recordExpedition)에서 평가된다', () => {
    const save = newSaveData('shinigami', 0);
    const exp = createExpedition({ factionId: 'shinigami', seed: 1, runId: 1, hunger: 100, condition: 100, deck: [], risk: 0, stability: 50, build: save.build, evolution: save.evolution });
    exp.phase = 'ended';
    exp.outcome = 'returned';
    exp.endReason = 'returned';
    exp.battles.push(battle({ chain3Count: 30 })); // tag-1-shinigami(은밀기동대장, C.106 사신 전용) = 체인3 누계 30 (C.49: 등급 칭호는 등급전으로만 해금)
    recordExpedition(save, exp, 1234);
    const u = save.titles.find((t) => t.titleId === 'tag-1-shinigami');
    expect(u).toMatchObject({ at: 1234, trigger: 'expedition' });
  });
  it('진화(performEvolution)에서 평가된다', () => {
    const save = newSaveData('hollow', 0);
    save.runLog.absorbs.push(...times(10, () => absorb()));
    // 3단계(아쥬커스)에서 걸음을 채우고 불 특성을 장착한 채 진화 → 불 바스트로데 (hidden-rank-3 = 흡수 10 + t4:fire 경로)
    // C.220: 2단계(길리안)에서 불 특성 장착 → 3단계 불 (hidden-rank-3 = 흡수 10 + t3:fire 경로)
    Object.assign(save.evolution, { tierIndex: 1, formId: 't2:base', formHistory: ['t2:base'], steps: BALANCE.provisional.evolution.stepsNeeded[1]! });
    gainTrait(save.build, 't-fire-a');
    expect(save.titles).toEqual([]);
    expect(performEvolution(save, 4000).ok).toBe(true);
    expect(save.titles.find((t) => t.titleId === 'hidden-rank-3')).toMatchObject({ at: 4000, trigger: 'evolution' });
  });
  it('세이브 로드(loadSave)에서 평가되고, 저장된 해금은 유지된다', () => {
    const save = newSaveData('shinigami', 0);
    save.runLog.risk.survivedBreakthroughs = 1;
    const mem: Record<string, string> = {};
    const storage = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => void (mem[k] = v) };
    writeSave(storage, save);
    const loaded = loadSave(storage)!;
    expect(loaded.titles.map((t) => t.titleId)).toEqual(['tag-1-shinigami']);
    expect(loaded.titles[0]!.trigger).toBe('load');
    writeSave(storage, loaded);
    expect(loadSave(storage)!.titles).toHaveLength(1);
    expect(mem[SAVE_KEY]).toBeDefined();
  });
});

describe('임시 조건 칭호의 해금 흐름 (런 로그 합성)', () => {
  const unlockedIds = (log: RunLog, factionId = 'hollow') => {
    const save = newSaveData(factionId, 0);
    save.runLog = log;
    return checkTitles(save, 'load', 1).map((d) => d.id).sort();
  };
  it('데이터: 임시 조건 칭호는 최소 4개(일반 등급 2 + 히든 등급/태그 2)이고 전부 provisional 이며, 조건 없는 칭호가 남아 있다', () => {
    const withCond = TITLES.filter((t) => t.condition);
    expect(withCond.filter((t) => t.kind === 'rank').length).toBeGreaterThanOrEqual(2);
    expect(withCond.filter((t) => t.kind !== 'rank').length).toBeGreaterThanOrEqual(1);
    expect(withCond.every((t) => t.provisional === true)).toBe(true);
    expect(TITLES.some((t) => !t.condition)).toBe(true);
  });
  it('각 칭호가 자기 조건을 채울 때만 해금된다', () => {
    expect(unlockedIds(emptyRunLog())).toEqual([]);
    // 등급 칭호 (C.49, GDD 21장): 등급전으로 그 번호 이상에 오른 적이 있으면. 원정·강적 처치만으로는 열리지 않는다
    expect(unlockedIds(logWith({ runs: [run({ laps: 2 })], battles: times(3, () => battle({ enemyClass: 'elite' })) }))).toEqual([]);
    const rb = (won: boolean, rankAfter: number | null) => ({ at: 0, runsCompleted: 0, opponentId: 'x', won, rankBefore: null, rankAfter, firstRanked: false, seed: 0, durationSeconds: 1, tierIndex: 4, formId: null });
    expect(unlockedIds(logWith({ rankBattles: [rb(false, null)] }))).toEqual([]);
    expect(unlockedIds(logWith({ rankBattles: [rb(true, 10)] }))).toEqual(['rank-1']);
    expect(unlockedIds(logWith({ rankBattles: [rb(true, 7)] }))).toEqual(['rank-1', 'rank-2', 'rank-no8', 'rank-no9']);
    expect(unlockedIds(logWith({ rankBattles: [rb(true, 1)] }))).toEqual(['rank-1', 'rank-2', 'rank-3', 'rank-4', 'rank-no2', 'rank-no3', 'rank-no5', 'rank-no6', 'rank-no8', 'rank-no9']);
    const risk = emptyRunLog();
    risk.risk.survivedBreakthroughs = 1;
    // C.106: 은밀기동대장은 사신 전용(옛 조건 그대로), 호로 트랙에서는 이 기록으로 아무것도 안 열린다
    expect(unlockedIds(risk)).toEqual([]);
    expect(unlockedIds(risk, 'shinigami')).toEqual(['tag-1-shinigami']);
    expect(unlockedIds(logWith({ battles: [battle({ chain3Count: 30 })] }), 'shinigami')).toEqual(['tag-1-shinigami']);
  });
  it('조건 없는 칭호는 어떤 기록으로도 해금되지 않는다', () => {
    const big = logWith({ runs: times(5, () => run({ laps: 9 })), battles: times(20, () => battle({ enemyClass: 'elite', chain3Count: 9 })), absorbs: times(30, () => absorb()) });
    big.risk = { peak: 100, breakthroughs: 3, survivedBreakthroughs: 3 };
    const ids = unlockedIds(big);
    for (const id of ids) expect(TITLES.find((t) => t.id === id)!.condition).not.toBeNull();
  });
  it('조건이 있는데 provisional 이 아니거나 모르는 id 를 쓰면 데이터 오류', () => {
    expect(() => parseTitle({ id: 'x', kind: 'tag', hidden: true, name: { '*': 'x' }, condition: { type: 'runsReturned', min: 1 } })).toThrow(/provisional/);
    expect(() => parseTitle({ id: 'x', kind: 'tag', hidden: true, name: { '*': 'x' }, provisional: true, condition: { type: 'passedForm', formId: 'nope' } })).toThrow(/진화체/);
    expect(() => parseTitle({ id: 'x', kind: 'tag', hidden: true, name: { '*': 'x' }, provisional: true, condition: { type: 'absorbCount', min: 1, element: 'nope' } })).toThrow(/속성/);
  });
});

describe('도감 표시', () => {
  const hidden = TITLES.find((t) => t.id === 'hidden-rank-1')!;
  const normal = TITLES.find((t) => t.id === 'rank-3')!;
  it('미해금 히든은 "?" 이고 이름·조건을 드러내지 않는다', () => {
    const v = titleCellView(hidden, 'hollow', null);
    expect(v).toEqual({ locked: true, text: '?', sub: null });
  });
  it('미해금 일반 등급은 종족별 이름 목록으로 보인다', () => {
    expect(titleCellView(normal, 'hollow', null).text).toBe('에스파다 No.4');
    expect(titleCellView(normal, 'shinigami', null).text).toBe('4석');
  });
  it('해금한 칭호는 종족별 이름과 해금 시각', () => {
    const v = titleCellView(hidden, 'shinigami', Date.UTC(2026, 9, 18, 2, 5));
    expect(v.locked).toBe(false);
    expect(v.text).toBe('총대장');
    expect(v.sub).toContain(formatUnlockTime(Date.UTC(2026, 9, 18, 2, 5)));
    expect(formatUnlockTime(Date.UTC(2026, 9, 18, 2, 5))).toBe('2026-10-18 11:05');
  });
});

describe('세이브 마이그레이션', () => {
  it('형식 7 세이브가 열리고 titles 가 생긴다', () => {
    const old = JSON.parse(JSON.stringify(newSaveData('hollow', 0)));
    delete old.titles;
    old.meta.format = 7;
    const s = migrateSave(old)!;
    expect(s.meta.format).toBe(SAVE_FORMAT_VERSION);
    expect(s.titles).toEqual([]);
  });
  it('형식 7 세이브 로드 때 이미 충족된 임시 조건이 해금된다', () => {
    const old = JSON.parse(JSON.stringify(newSaveData('shinigami', 0)));
    delete old.titles;
    old.meta.format = 7;
    old.runLog.risk.survivedBreakthroughs = 1;
    const mem: Record<string, string> = { [SAVE_KEY]: JSON.stringify(old) };
    const s = loadSave({ getItem: (k) => mem[k] ?? null, setItem: () => {} })!;
    expect(s.titles.map((t) => t.titleId)).toEqual(['tag-1-shinigami']);
  });
});
