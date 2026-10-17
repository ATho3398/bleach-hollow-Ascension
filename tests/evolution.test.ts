import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { BALANCE } from '../src/config/balance';
import { FORM_TABLE, getForm, tierFallback } from '../src/data/evolution';
import { FACTIONS, getFaction } from '../src/data/factions';
import { newBuild } from '../src/engine/absorb';
import {
  absorbsNeeded, absorbsRemaining, accumulationOf, applyEvolutionToParams, canEvolve, cloneEvolution, currentCandidates, evolutionMultipliers, evolve,
  newEvolution, previewForm, recordEvolutionAbsorb, type EvolutionState,
} from '../src/engine/evolution';
import { advance, chooseAbsorb, chooseRelease, createExpedition, finishBattle, startBattle } from '../src/engine/expedition';
import { emptyRunLog } from '../src/engine/runLog';
import { migrateSave, newSaveData, performEvolution, recordExpedition, SAVE_FORMAT_VERSION } from '../src/game';

const EV = BALANCE.provisional.evolution;
const A = 'lineage-a';
const B = 'lineage-b';
const C = 'lineage-c';
const D = 'lineage-d';
const E = 'lineage-e';

/** 계통 id 목록을 순서대로 흡수한 상태 */
function absorbed(...ids: string[]): EvolutionState {
  const e = newEvolution();
  for (const id of ids) recordEvolutionAbsorb(e, id, false);
  return e;
}
const times = (id: string, n: number) => Array.from({ length: n }, () => id);
/** 1→2단계 진화에 필요한 횟수(BALANCE 값)만큼, x 2 : y 1 비율로 흡수 */
const need0 = () => EV.absorbsNeeded[0]!;
const mix = (x: string, y: string) => [...times(x, need0() - Math.floor(need0() / 3)), ...times(y, Math.floor(need0() / 3))];

describe('흡수 누적', () => {
  it('흡수가 없으면 누적이 비고, 누적 스냅샷은 모든 계통을 0 포함해 적는다', () => {
    const acc = accumulationOf(newEvolution());
    expect(Object.keys(acc.scores).sort()).toEqual([A, B, C, D, E]);
    expect(Object.values(acc.scores).every((v) => v === 0)).toBe(true);
    expect(acc.need).toBe(EV.absorbsNeeded[0]);
    expect(acc.rare).toBe(0);
  });

  it('희귀 개체 흡수는 가중 ×2 로 누적되고 희귀 수도 센다. 흡수 횟수는 1회다', () => {
    const e = newEvolution();
    recordEvolutionAbsorb(e, A, false);
    recordEvolutionAbsorb(e, A, true);
    recordEvolutionAbsorb(e, B, true);
    expect(e.lineageScores).toEqual({ [A]: 1 + EV.rareWeight, [B]: EV.rareWeight });
    expect(e.absorbs).toBe(3);
    expect(e.rareAbsorbs).toBe(2);
    expect(accumulationOf(e)).toMatchObject({ rare: 2, scores: { [A]: 3, [B]: 2, [C]: 0 }, lastSeq: { [A]: 2, [B]: 3, [C]: 0 } });
  });

  it('계통 수가 3개·5개여도 누적 스냅샷이 일반적으로 만들어진다', () => {
    const e = absorbed(A, B);
    expect(Object.keys(accumulationOf(e, [A, B, C]).scores)).toEqual([A, B, C]);
    expect(Object.keys(accumulationOf(e, [A, B, C, D, E]).scores)).toHaveLength(5);
  });
});

describe('진화 조건과 결과', () => {
  it('단계별 필요 흡수 횟수는 BALANCE 값 (27/30/34/38), 모자라면 진화할 수 없다', () => {
    expect([...EV.absorbsNeeded]).toEqual([27, 30, 34, 38]);
    const e = absorbed(...mix(A, B).slice(0, need0() - 1));
    expect(absorbsNeeded(e)).toBe(need0());
    expect(absorbsRemaining(e)).toBe(1);
    expect(canEvolve(e)).toBe(false);
    const r = evolve(e, newBuild(), 0);
    expect(r.ok).toBe(false);
    expect(e.tierIndex).toBe(0);
    recordEvolutionAbsorb(e, A, false);
    expect(canEvolve(e)).toBe(true);
  });

  it('흡수 분포가 진화체를 정한다 (테이블 선택 규칙). 안정 수치·돌파는 쓰지 않는다', () => {
    const e = absorbed(...mix(B, C));
    const r = evolve(e, newBuild(), 0);
    expect(r.ok && r.form.id).toBe('t2:dominant@lineage-b');
    // 1→2단계는 항상 1위 계통의 우세형이다
    for (const id of [A, B, C, D, E]) {
      const x = evolve(absorbed(...times(id, need0())), newBuild(), 0);
      expect(x.ok && x.form.id).toBe(`t2:dominant@${id}`);
    }
  });

  it('진화하면 단계 +1, 슬롯 +1, 누적 리셋, 현재 진화체 기록. 런 로그 레코드에 이전·새 진화체와 누적 스냅샷', () => {
    const e = absorbed(...mix(A, B));
    const snapshot = accumulationOf(e);
    const build = newBuild();
    const before = build.slots.length;
    const r = evolve(e, build, 1234);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(e.tierIndex).toBe(1);
    expect(build.slots).toHaveLength(before + 1);
    expect(build.slots.at(-1)).toBeNull();
    expect(e).toMatchObject({ absorbs: 0, lineageScores: {}, lastAbsorbSeq: {}, seq: 0, rareAbsorbs: 0, formId: r.form.id, formHistory: [r.form.id] });
    expect(r.record).toEqual({ fromTier: 0, toTier: 1, fromFormId: null, toFormId: r.form.id, formId: r.form.id, accumulation: snapshot, at: 1234 });
    expect(r.slotsAdded).toBe(EV.slotsPerEvolution);
    expect(r.form.tier).toBe(2);
  });

  it('5단계까지 한 단계씩 올라가고, 끝 이후에는 진화할 수 없다 (퇴화·스킵 없음). 진화마다 이전 진화체가 다음 진화체의 경로가 된다', () => {
    const e = newEvolution();
    const build = newBuild();
    const tiers = [0];
    const froms: (string | null)[] = [];
    for (let t = 0; t < 4; t++) {
      for (let i = 0; i < EV.absorbsNeeded[t]!; i++) recordEvolutionAbsorb(e, [A, B, C, D, E][i % 5]!, i % 3 === 0);
      const r = evolve(e, build, t);
      expect(r.ok).toBe(true);
      if (r.ok) froms.push(r.record.fromFormId);
      tiers.push(e.tierIndex);
    }
    expect(tiers).toEqual([0, 1, 2, 3, 4]);
    expect(froms[0]).toBeNull();
    expect(froms.slice(1)).toEqual(e.formHistory.slice(0, 3));
    expect(build.slots).toHaveLength(BALANCE.absorb.slotCount + 4);
    expect(e.formHistory).toHaveLength(4);
    expect(e.formHistory.map((id, i) => getForm(id).tier === i + 2)).toEqual([true, true, true, true]);
    for (let i = 0; i < 12; i++) recordEvolutionAbsorb(e, A, false);
    expect(absorbsNeeded(e)).toBeNull();
    expect(canEvolve(e)).toBe(false);
    expect(evolve(e, build, 99).ok).toBe(false);
    expect(e.tierIndex).toBe(4);
    expect(previewForm(e)).toBeNull();
    expect(currentCandidates(e)).toEqual([]);
  });

  it('진화체 효과: 진화마다 체력·공격 배율이 곱해지고 전투 파라미터에 반영된다. 기본형은 효과가 낮다', () => {
    const e = absorbed(...mix(A, B));
    expect(evolutionMultipliers(e)).toMatchObject({ hp: 1, attack: 1 });
    const p0: { playerMaxHp?: number } = {};
    applyEvolutionToParams(p0, e);
    expect(p0.playerMaxHp).toBeUndefined();
    const r = evolve(e, newBuild(), 0);
    if (!r.ok) throw new Error('진화 실패');
    const m = evolutionMultipliers(e);
    expect(m.hp).toBeCloseTo(r.form.effects.hpMultiplier);
    // 패시브: A 우세형 = A 의 성향(공격 위력 ↑)
    expect(r.form.effects.passive.attackPower).toBeGreaterThan(1);
    const params: { playerMaxHp?: number; attackPowerMultiplier?: number } = { attackPowerMultiplier: 1.15 };
    applyEvolutionToParams(params, e);
    expect(params.playerMaxHp).toBeCloseTo(BALANCE.provisional.combat.playerMaxHp * r.form.effects.hpMultiplier);
    expect(params.attackPowerMultiplier).toBeCloseTo(1.15 * r.form.effects.attackMultiplier * r.form.effects.passive.attackPower!);
    expect(tierFallback(2).effects.hpMultiplier).toBeLessThan(r.form.effects.hpMultiplier);
  });

  it('미리보기와 후보 수: 실제 진화 결과와 같고, 후보는 기본형을 세지 않는다', () => {
    const e = absorbed(...mix(C, D));
    const peek = previewForm(e)!;
    expect(currentCandidates(e).map((f) => f.id)).toEqual([peek.id]);
    const r = evolve(cloneEvolution(e), newBuild(), 0);
    expect(r.ok && r.form.id).toBe(peek.id);
    expect(currentCandidates(newEvolution())).toEqual([]); // 흡수 0: 후보 없음 → 진화하면 기본형
    expect(previewForm(newEvolution())!.fallback).toBe(true);
    // 4단계 후보: 3단계 진화체 경로와 지금 분포에 따라 달라진다 (3단계 2조합은 경로 제한 없음, v1.1)
    const e2 = absorbed(...times(C, 17), ...times(D, 17));
    e2.tierIndex = 2;
    e2.formId = 't3:pair@lineage-c+lineage-e';
    expect(currentCandidates(e2).map((f) => f.id)).toContain('t4:deep-pair@lineage-c+lineage-d');
    e2.formId = 't3:pair@lineage-a+lineage-b';
    expect(currentCandidates(e2).map((f) => f.id)).not.toContain('t4:deep-pair@lineage-c+lineage-d');
  });
});

describe('세이브·런 로그 연결', () => {
  it('performEvolution: 기록이 RunLog.tiers.evolutions 에 쌓이고 도감이 해금되며 안정 수치·리스크는 그대로', () => {
    const save = newSaveData('hollow', 0);
    save.nest.stability = 72;
    save.nest.risk = 33;
    expect(save.formDex).toEqual([]);
    for (const id of mix(A, B)) recordEvolutionAbsorb(save.evolution, id, false);
    const snapshot = accumulationOf(save.evolution);
    const r = performEvolution(save, 5000);
    expect(r.ok).toBe(true);
    expect(save.runLog.tiers.evolutions).toEqual([
      { fromTier: 0, toTier: 1, fromFormId: null, toFormId: 't2:dominant@lineage-a', formId: 't2:dominant@lineage-a', accumulation: snapshot, at: 5000 },
    ]);
    expect(save.formDex).toEqual(['t2:dominant@lineage-a']);
    expect(save.evolution.formId).toBe('t2:dominant@lineage-a');
    expect(save.nest.stability).toBe(72);
    expect(save.nest.risk).toBe(33);
    expect(save.build.slots).toHaveLength(BALANCE.absorb.slotCount + 1);
    expect(save.runLog.tiers.defeatedWhileAtTier).toEqual({});
    expect(performEvolution(save, 6000).ok).toBe(false);
    expect(save.runLog.tiers.evolutions).toHaveLength(1);
    // 같은 진화체로 다시 진화해도 도감에 중복 해금되지 않는다
    for (let i = 0; i < EV.absorbsNeeded[1]!; i++) recordEvolutionAbsorb(save.evolution, A, false);
    expect(performEvolution(save, 7000).ok).toBe(true);
    expect(save.formDex).toHaveLength(2);
    expect(new Set(save.formDex).size).toBe(2);
    expect(save.runLog.tiers.evolutions[1]!.fromFormId).toBe('t2:dominant@lineage-a');
  });

  it('원정: 흡수를 확정하면 그 계통의 누적이 오르고, 놓아주면 오르지 않는다. 귀환하면 세이브에 합쳐진다', () => {
    const save = newSaveData('hollow', 0);
    const exp = createExpedition({ factionId: 'hollow', seed: 3, runId: 1, hunger: 0, condition: 100, deck: ['prey-nest-a'], evolution: save.evolution, build: save.build });
    expect(exp.evolution).toEqual(save.evolution);
    expect(exp.evolution).not.toBe(save.evolution);
    for (const rare of [false, true]) {
      exp.wildCells = [exp.pos + 1];
      advance(exp);
      const b = startBattle(exp);
      b.enemy.hp = 0;
      b.status = 'won';
      b.params = { ...b.params, skills: [] };
      exp.pending!.enemy.rare = rare;
      finishBattle(exp, b);
      expect(exp.phase).toBe('absorb');
      expect(chooseAbsorb(exp, null).ok).toBe(true);
    }
    const expected: Record<string, number> = {};
    for (const r of exp.absorbRecords) expected[r.lineageId] = (expected[r.lineageId] ?? 0) + (r.rare ? EV.rareWeight : 1);
    expect(exp.absorbRecords.map((r) => r.rare)).toEqual([false, true]);
    expect(exp.evolution.absorbs).toBe(2);
    expect(exp.evolution.lineageScores).toEqual(expected);
    expect(save.evolution.absorbs).toBe(0);
    // 놓아주면 누적이 오르지 않는다
    exp.wildCells = [exp.pos + 1];
    advance(exp);
    const rb = startBattle(exp);
    rb.enemy.hp = 0;
    rb.status = 'won';
    rb.params = { ...rb.params, skills: [] };
    finishBattle(exp, rb);
    expect(chooseRelease(exp).ok).toBe(true);
    expect(exp.evolution.absorbs).toBe(2);
    exp.phase = 'ended';
    exp.outcome = 'returned';
    exp.endReason = 'returned';
    exp.breakthrough = { lap: 1, cell: 1 };
    recordExpedition(save, exp, 10);
    expect(save.evolution.absorbs).toBe(2);
    expect(save.evolution).not.toHaveProperty('breakthroughThisTier'); // 돌파는 진화체 선택에 쓰지 않는다 (C.11)
    expect(save.evolution.tierIndex).toBe(0);
  });

  it('형식 5 세이브가 열리고 기존 흡수 기록이 1단계 누적이 된다 (희귀 수 포함)', () => {
    const old = newSaveData('hollow', 0) as unknown as Record<string, unknown>;
    delete old.evolution;
    delete old.formDex;
    const log = emptyRunLog() as unknown as { tiers: Record<string, unknown>; absorbs: unknown[] };
    delete log.tiers.evolutions;
    log.absorbs = [
      { runId: 1, enemyId: 'test-a', lineageId: A, rare: false, absorbed: true, traitId: null, lap: 1 },
      { runId: 1, enemyId: 'test-b', lineageId: B, rare: true, absorbed: true, traitId: null, lap: 1 },
      { runId: 1, enemyId: 'test-a', lineageId: C, rare: false, absorbed: false, traitId: null, lap: 2 },
    ];
    old.runLog = log;
    old.meta = { format: 5, balanceVersion: 8, startPatch: 'C.7' };
    const m = migrateSave(old)!;
    expect(m.meta.format).toBe(SAVE_FORMAT_VERSION);
    expect(SAVE_FORMAT_VERSION).toBeGreaterThanOrEqual(7);
    expect(m.evolution.tierIndex).toBe(0);
    expect(m.evolution.formId).toBeNull();
    expect(m.evolution.absorbs).toBe(2);
    expect(m.evolution.rareAbsorbs).toBe(1);
    expect(m.evolution.lineageScores).toEqual({ [A]: 1, [B]: EV.rareWeight });
    expect(m.formDex).toEqual([]);
    expect(m.runLog.tiers.evolutions).toEqual([]);
    expect(m.runLog.tiers.skipped).toBe(false);
  });

  it('형식 6 세이브(C.9 조합 진화)가 열린다: 현재 단계 유지, 현재 진화체는 그 단계 기본형, 도감은 기록에서 가능한 만큼', () => {
    const old = newSaveData('hollow', 0) as unknown as Record<string, any>;
    old.meta = { format: 6, balanceVersion: 11, startPatch: 'C.10' };
    delete old.formDex;
    old.evolution = {
      tierIndex: 3, formId: 'lineage-b+lineage-c@3:mutant', formHistory: ['lineage-a@1:orthodox', 'lineage-a+lineage-b@2:mutant', 'lineage-b+lineage-c@3:mutant'],
      absorbs: 12, lineageScores: { [C]: 7, [D]: 8 }, lastAbsorbSeq: { [C]: 5, [D]: 12 }, seq: 12, breakthroughThisTier: true,
    };
    old.runLog.tiers.evolutions = [
      { fromTier: 0, toTier: 1, comboKey: 'lineage-a', formId: 'lineage-a@1:orthodox', stability: 60, at: 1 },
      { fromTier: 1, toTier: 2, comboKey: 'lineage-a+lineage-b', formId: 'lineage-a+lineage-b@2:mutant', stability: 40, at: 2 },
      { fromTier: 2, toTier: 3, comboKey: 'lineage-c+lineage-b', formId: 'lineage-b+lineage-c@3:mutant', stability: 40, at: 3 },
    ];
    const m = migrateSave(old)!;
    expect(m.meta.format).toBe(SAVE_FORMAT_VERSION);
    expect(m.evolution).toEqual({
      tierIndex: 3, formId: 't4:base', formHistory: ['t2:dominant@lineage-a', 't3:pair@lineage-a+lineage-b', 't4:base'],
      absorbs: 12, lineageScores: { [C]: 7, [D]: 8 }, lastAbsorbSeq: { [C]: 5, [D]: 12 }, seq: 12, rareAbsorbs: 0,
    });
    expect(m.evolution).not.toHaveProperty('breakthroughThisTier');
    expect(new Set(m.formDex)).toEqual(new Set(['t2:dominant@lineage-a', 't3:pair@lineage-a+lineage-b', 't4:base'])); // 4단계 2조합 기록은 맞는 진화체를 알 수 없다
    // 옛 기록은 호환용 필드를 그대로 가진다 (빼지 않는다)
    expect(m.runLog.tiers.evolutions[0]).toMatchObject({ comboKey: 'lineage-a', stability: 60 });
    // 진화 형태 id 는 모두 새 테이블에 있다 (효과 계산이 던지지 않는다)
    expect(() => evolutionMultipliers(m.evolution)).not.toThrow();
    // 이어서 진화가 된다
    for (let i = 0; i < 26; i++) recordEvolutionAbsorb(m.evolution, D, false);
    const r = performEvolution(m, 9);
    expect(r.ok).toBe(true);
    expect(m.evolution.tierIndex).toBe(4);
  });

  it('형식 6 세이브: 맞는 진화체를 알 수 없으면(5단계 3조합·기록 없음) 기본형만 해금한다', () => {
    const old = newSaveData('hollow', 0) as unknown as Record<string, any>;
    old.meta = { format: 6, balanceVersion: 11, startPatch: 'C.10' };
    delete old.formDex;
    old.evolution = { tierIndex: 1, formId: 'base@1:orthodox', formHistory: ['base@1:orthodox'], absorbs: 3, lineageScores: { [A]: 3 }, lastAbsorbSeq: { [A]: 3 }, seq: 3, breakthroughThisTier: false };
    const m = migrateSave(old)!;
    expect(m.evolution.formId).toBe('t2:base');
    expect(m.evolution.formHistory).toEqual(['t2:base']);
    expect(m.formDex).toEqual(['t2:base']);
  });

  it('형식 1 세이브도 끝까지 마이그레이션되어 진화 상태와 도감을 가진다', () => {
    const old = { meta: { format: 1, balanceVersion: 1, startPatch: 'C.1' }, factionId: 'hollow', runLog: { ...emptyRunLog(), battles: [], tiers: { skipped: false, defeatedWhileAtTier: {} } } };
    const m = migrateSave(old)!;
    expect(m.evolution).toEqual(newEvolution());
    expect(m.formDex).toEqual([]);
    expect(m.runLog.tiers.evolutions).toEqual([]);
  });

  it('현재 형식 세이브는 그대로 열린다', () => {
    const save = newSaveData('shinigami', 0);
    save.formDex = ['t2:base'];
    const m = migrateSave(JSON.parse(JSON.stringify(save)))!;
    expect(m).toEqual(save);
  });
});

describe('종족 설정만 바꿔 표기가 바뀐다 (코드 분기 없음)', () => {
  it('단계 이름은 종족 설정에서 나오고 엔진 결과는 종족과 무관하다', () => {
    const h = getFaction('hollow');
    const s = getFaction('shinigami');
    expect(h.tierNames[1]).toBe('길리안');
    expect(s.tierNames[1]).not.toBe(h.tierNames[1]);
    // 같은 흡수 이력이면 두 종족의 엔진 결과가 같다 (진화체 id 는 종족과 무관)
    const run = () => {
      const r = evolve(absorbed(...mix(A, B)), newBuild(), 0);
      return r.ok ? r.form : null;
    };
    expect(run()).toEqual(run());
    expect(run()!.id).toBe('t2:dominant@lineage-a');
    // 모든 종족 설정에 5단계 이름이 있다 (3번째 종족도 설정 파일만으로 단계 이름을 낸다)
    for (const f of FACTIONS) expect(f.tierNames).toHaveLength(5);
    expect(FORM_TABLE.length).toBeGreaterThan(0);
  });

  it('엔진·데이터 코드에 종족 id 분기가 없다', () => {
    for (const file of [
      'src/engine/evolution/evolution.ts', 'src/engine/evolution/select.ts', 'src/engine/evolution/analysis.ts',
      'src/data/evolution/index.ts', 'src/data/evolution/generate.ts', 'src/data/evolution/build.ts', 'src/ui/dexView.ts', 'src/ui/evolutionPanel.ts',
    ]) {
      const src = readFileSync(file, 'utf8');
      expect(src, file).not.toMatch(/===?\s*['"](hollow|shinigami)['"]/);
      expect(src, file).not.toMatch(/factionId\s*===?/);
    }
  });
});
