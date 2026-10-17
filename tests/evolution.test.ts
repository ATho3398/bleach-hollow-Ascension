import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { BASE_COMBO, allComboKeys, comboLabel, formName, formsFor, getForm } from '../src/data/evolution';
import { getFaction, FACTIONS } from '../src/data/factions';
import { LINEAGES } from '../src/data/lineages';
import { newBuild } from '../src/engine/absorb';
import {
  absorbsNeeded, absorbsRemaining, applyEvolutionToParams, canEvolve, chooseVariant, cloneEvolution, comboKeyOf, evolutionMultipliers, evolve,
  newEvolution, previewForm, rankLineages, recordEvolutionAbsorb, type EvolutionState,
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
/** 1→2단계 진화에 필요한 횟수(BALANCE 값)만큼, x 2 : y 1 비율로 흡수 (옛 A,A,B / C,C,D) */
const need0 = () => EV.absorbsNeeded[0]!;
const mix = (x: string, y: string) => [...times(x, need0() - Math.floor(need0() / 3)), ...times(y, Math.floor(need0() / 3))];

describe('조합 키', () => {
  it('누적 1·2위 계통의 2조합이고 순서와 상관없이 같은 키다', () => {
    expect(comboKeyOf(absorbed(A, A, B))).toBe('lineage-a+lineage-b');
    expect(comboKeyOf(absorbed(B, A, A))).toBe('lineage-a+lineage-b');
    expect(comboKeyOf(absorbed(B, B, A))).toBe('lineage-a+lineage-b');
    // 1·2위만: 3위가 70% 미만
    expect(comboKeyOf(absorbed(...times(C, 5), ...times(A, 5), ...times(B, 3)))).toBe('lineage-a+lineage-c');
  });

  it('3위 누적이 2위의 70% 이상이면 3조합 (경계 포함)', () => {
    expect(comboKeyOf(absorbed(...times(A, 10), ...times(B, 10), ...times(C, 7)))).toBe('lineage-a+lineage-b+lineage-c');
    expect(comboKeyOf(absorbed(...times(A, 10), ...times(B, 10), ...times(C, 6)))).toBe('lineage-a+lineage-b');
    // 4위 이하는 조합에 들어가지 않는다
    expect(comboKeyOf(absorbed(...times(A, 10), ...times(B, 10), ...times(C, 10), ...times(D, 10)))).not.toContain('lineage-a+lineage-b+lineage-c+');
    expect(comboKeyOf(absorbed(...times(A, 10), ...times(B, 10), ...times(C, 10), ...times(D, 10))).split('+')).toHaveLength(3);
  });

  it('동률이면 가장 최근에 흡수한 계통이 앞선다', () => {
    // A·B·C 모두 1회: 가장 최근 C, 그다음 B 가 1·2위. 3위 A 는 2위의 100% 라서 3조합이 된다
    expect(rankLineages(absorbed(A, B, C))).toEqual([C, B, A]);
    // 2위 동률: B·C 1회씩, A 2회. 최근 C 가 2위, 3위 B 는 2위의 100% → 3조합
    expect(rankLineages(absorbed(A, B, A, C))).toEqual([A, C, B]);
    // 최근이 B 면 B 가 2위
    expect(rankLineages(absorbed(C, A, A, B))).toEqual([A, B, C]);
    // 2·3위 경계에 걸친 동률: A 10회, B·C·D 3회씩 → 가장 최근에 흡수한 D·C 가 들어오고 B 는 빠진다
    const edge = absorbed(...times(A, 10), ...times(B, 3), ...times(C, 3), ...times(D, 3));
    expect(rankLineages(edge)).toEqual([A, D, C, B]);
    expect(comboKeyOf(edge)).toBe('lineage-a+lineage-c+lineage-d');
    // 1위 동률: A·B 같이 5회면 둘 다 들어간다
    expect(comboKeyOf(absorbed(...times(A, 5), ...times(B, 5), C))).toBe('lineage-a+lineage-b');
  });

  it('흡수가 0이면 기본 조합, 계통이 1개뿐이면 그 계통 하나', () => {
    expect(comboKeyOf(newEvolution())).toBe(BASE_COMBO);
    expect(comboKeyOf(absorbed(A, A, A))).toBe(A);
  });

  it('희귀 개체 흡수는 가중 ×2 로 누적되지만 흡수 횟수는 1회다', () => {
    const e = newEvolution();
    recordEvolutionAbsorb(e, A, true);
    recordEvolutionAbsorb(e, B, false);
    recordEvolutionAbsorb(e, B, false);
    expect(e.lineageScores[A]).toBe(EV.rareWeight);
    expect(e.absorbs).toBe(3);
    // A 2(희귀) = B 2 → 동률이라 최근(B)이 1위
    expect(rankLineages(e)).toEqual([B, A]);
    recordEvolutionAbsorb(e, A, true);
    expect(rankLineages(e)[0]).toBe(A);
  });

  it('계통 수가 3개·5개일 때 가능한 조합 키가 일반적으로 만들어지고 전부 형태 테이블이 있다', () => {
    const three = allComboKeys([A, B, C]);
    const five = allComboKeys(LINEAGES.map((l) => l.id));
    expect(three).toHaveLength(1 + 3 + 3 + 1);
    expect(five).toHaveLength(1 + 5 + 10 + 10);
    for (const key of five) for (let tier = 1; tier <= 4; tier++) {
      const forms = formsFor(key, tier);
      expect(forms.length).toBeGreaterThanOrEqual(2);
      expect(forms.length).toBeLessThanOrEqual(3);
      for (const f of forms) expect(getForm(f.id)).toEqual(f);
    }
    // 어떤 흡수 이력이든 키가 allComboKeys 안에 있다
    const keys = new Set(five);
    for (const hist of [[A], [E, D], [A, B, C, D, E], [C, C, B, A, A, E]]) expect(keys.has(comboKeyOf(absorbed(...hist)))).toBe(true);
    // 3개 계통만 흡수하는 게임에서도 동작
    const e3 = absorbed(A, B, C, A, B, C);
    expect(new Set(three).has(comboKeyOf(e3))).toBe(true);
  });
});

describe('진화 조건과 결과', () => {
  const fill = (e: EvolutionState, n: number) => {
    for (let i = 0; i < n; i++) recordEvolutionAbsorb(e, i % 2 === 0 ? A : B, false);
  };

  it('단계별 필요 흡수 횟수는 BALANCE 값, 모자라면 진화할 수 없다', () => {
    expect([0, 1, 2, 3].map((t) => absorbsNeeded({ ...newEvolution(), tierIndex: t }))).toEqual([...EV.absorbsNeeded]);
    const e = newEvolution();
    fill(e, EV.absorbsNeeded[0]! - 1);
    expect(absorbsRemaining(e)).toBe(1);
    expect(canEvolve(e)).toBe(false);
    const r = evolve(e, newBuild(), 50, 0);
    expect(r.ok).toBe(false);
    expect(e.tierIndex).toBe(0);
    fill(e, 1);
    expect(canEvolve(e)).toBe(true);
  });

  it('안정 수치로 정통형/변이형을 고르고, 돌파했으면 세 번째 후보', () => {
    expect(chooseVariant(EV.stabilityThreshold, false)).toBe('orthodox');
    expect(chooseVariant(EV.stabilityThreshold - 1, false)).toBe('mutant');
    expect(chooseVariant(100, true)).toBe('breakthrough');
    const run = (stability: number, bt: boolean) => {
      const e = absorbed(...mix(A, B));
      e.breakthroughThisTier = bt;
      const r = evolve(e, newBuild(), stability, 7);
      return r.ok ? r.form : null;
    };
    expect(run(80, false)!.variant).toBe('orthodox');
    expect(run(20, false)!.variant).toBe('mutant');
    expect(run(80, true)!.variant).toBe('breakthrough');
    // 돌파 형태의 효과는 변이형과 같은 임시값
    const m = run(20, false)!;
    const b = run(80, true)!;
    expect([b.hpMultiplier, b.attackMultiplier]).toEqual([m.hpMultiplier, m.attackMultiplier]);
    expect(b.id).not.toBe(m.id);
  });

  it('진화하면 단계 +1, 슬롯 +1, 누적 리셋, 형태 기록. 안정 수치는 건드리지 않는다', () => {
    const e = absorbed(...mix(A, B));
    e.breakthroughThisTier = true;
    const build = newBuild();
    const before = build.slots.length;
    const r = evolve(e, build, 77, 1234);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(e.tierIndex).toBe(1);
    expect(build.slots).toHaveLength(before + 1);
    expect(build.slots.at(-1)).toBeNull();
    expect(e).toMatchObject({ absorbs: 0, lineageScores: {}, lastAbsorbSeq: {}, seq: 0, breakthroughThisTier: false, formId: r.form.id, formHistory: [r.form.id] });
    expect(r.record).toEqual({ fromTier: 0, toTier: 1, comboKey: 'lineage-a+lineage-b', formId: r.form.id, stability: 77, at: 1234 });
    expect(r.form.toTier).toBe(1);
  });

  it('5단계까지 한 단계씩 올라가고, 끝 이후에는 진화할 수 없다 (퇴화·스킵 없음)', () => {
    const e = newEvolution();
    const build = newBuild();
    const tiers = [0];
    for (let t = 0; t < 4; t++) {
      for (let i = 0; i < EV.absorbsNeeded[t]!; i++) recordEvolutionAbsorb(e, [A, B, C, D, E][i % 5]!, i % 3 === 0);
      const r = evolve(e, build, 60, t);
      expect(r.ok).toBe(true);
      tiers.push(e.tierIndex);
    }
    expect(tiers).toEqual([0, 1, 2, 3, 4]);
    expect(build.slots).toHaveLength(BALANCE.absorb.slotCount + 4);
    expect(e.formHistory).toHaveLength(4);
    for (let i = 0; i < 12; i++) recordEvolutionAbsorb(e, A, false);
    expect(absorbsNeeded(e)).toBeNull();
    expect(canEvolve(e)).toBe(false);
    expect(evolve(e, build, 60, 99).ok).toBe(false);
    expect(e.tierIndex).toBe(4);
    expect(previewForm(e, 60)).toBeNull();
  });

  it('형태 효과: 진화마다 체력·공격 배율이 곱해지고 전투 파라미터에 반영된다', () => {
    const e = absorbed(...mix(A, B));
    expect(evolutionMultipliers(e)).toMatchObject({ hp: 1, attack: 1 });
    const p0: { playerMaxHp?: number } = {};
    applyEvolutionToParams(p0, e);
    expect(p0.playerMaxHp).toBeUndefined();
    const r = evolve(e, newBuild(), 90, 0);
    if (!r.ok) throw new Error('진화 실패');
    const m = evolutionMultipliers(e);
    expect(m.hp).toBeCloseTo(EV.formEffects.orthodox.hp);
    // 패시브: A(공격 위력 ↑), B(받는 피해 ↓)가 섞였다
    expect(r.form.passive.attackPower).toBeGreaterThan(1);
    expect(r.form.passive.damageTaken).toBeLessThan(1);
    const params: { playerMaxHp?: number; attackPowerMultiplier?: number; damageTakenMultiplier?: number } = { attackPowerMultiplier: 1.15 };
    applyEvolutionToParams(params, e);
    expect(params.playerMaxHp).toBeCloseTo(BALANCE.provisional.combat.playerMaxHp * EV.formEffects.orthodox.hp);
    expect(params.attackPowerMultiplier).toBeCloseTo(1.15 * EV.formEffects.orthodox.attack * r.form.passive.attackPower!);
    expect(params.damageTakenMultiplier).toBeCloseTo(r.form.passive.damageTaken!);
  });

  it('미리보기는 같은 조건에서 실제 진화 결과와 같다', () => {
    const e = absorbed(...mix(C, D));
    const peek = previewForm(e, 30)!;
    const r = evolve(cloneEvolution(e), newBuild(), 30, 0);
    expect(r.ok && r.form.id).toBe(peek.id);
  });
});

describe('세이브·런 로그 연결', () => {
  it('performEvolution: 진화 기록이 RunLog.tiers.evolutions 에 쌓이고 안정 수치·리스크는 그대로', () => {
    const save = newSaveData('hollow', 0);
    save.nest.stability = 72;
    save.nest.risk = 33;
    for (const id of mix(A, B)) recordEvolutionAbsorb(save.evolution, id, false);
    const r = performEvolution(save, 5000);
    expect(r.ok).toBe(true);
    expect(save.runLog.tiers.evolutions).toEqual([{ fromTier: 0, toTier: 1, comboKey: 'lineage-a+lineage-b', formId: save.evolution.formId, stability: 72, at: 5000 }]);
    expect(save.nest.stability).toBe(72);
    expect(save.nest.risk).toBe(33);
    expect(save.build.slots).toHaveLength(BALANCE.absorb.slotCount + 1);
    expect(save.runLog.tiers.defeatedWhileAtTier).toEqual({});
    expect(performEvolution(save, 6000).ok).toBe(false);
    expect(save.runLog.tiers.evolutions).toHaveLength(1);
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
    expect(save.evolution.breakthroughThisTier).toBe(true);
    expect(save.evolution.tierIndex).toBe(0);
  });

  it('형식 5 세이브가 열리고 기존 흡수 기록이 1단계 누적이 된다', () => {
    const old = newSaveData('hollow', 0) as unknown as Record<string, unknown>;
    delete old.evolution;
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
    expect(SAVE_FORMAT_VERSION).toBeGreaterThanOrEqual(6);
    expect(m.evolution.tierIndex).toBe(0);
    expect(m.evolution.absorbs).toBe(2);
    expect(m.evolution.lineageScores).toEqual({ [A]: 1, [B]: EV.rareWeight });
    expect(m.runLog.tiers.evolutions).toEqual([]);
    expect(m.runLog.tiers.skipped).toBe(false);
  });

  it('형식 1 세이브도 끝까지 마이그레이션되어 진화 상태를 가진다', () => {
    const old = { meta: { format: 1, balanceVersion: 1, startPatch: 'C.1' }, factionId: 'hollow', runLog: { ...emptyRunLog(), battles: [], tiers: { skipped: false, defeatedWhileAtTier: {} } } };
    const m = migrateSave(old)!;
    expect(m.evolution).toEqual(newEvolution());
    expect(m.runLog.tiers.evolutions).toEqual([]);
  });
});

describe('종족 설정만 바꿔 표기가 바뀐다 (코드 분기 없음)', () => {
  it('단계 이름·형태 이름 표기는 종족 설정/데이터에서 나오고 엔진 상태는 종족과 무관하다', () => {
    const h = getFaction('hollow');
    const s = getFaction('shinigami');
    expect(h.tierNames[1]).toBe('길리안');
    expect(s.tierNames[1]).not.toBe(h.tierNames[1]);
    // 같은 흡수 이력이면 두 종족의 엔진 결과가 같다
    const run = () => {
      const e = absorbed(...mix(A, B));
      const r = evolve(e, newBuild(), 80, 0);
      return r.ok ? r.form : null;
    };
    expect(run()).toEqual(run());
    const form = run()!;
    expect(formName(form, 'hollow')).toBe('A+B형 (정통)');
    expect(comboLabel(BASE_COMBO, 'shinigami')).toBe('기본');
    // 모든 종족 설정에 5단계 이름이 있다 (3번째 종족도 설정 파일만으로 단계 이름을 낸다)
    for (const f of FACTIONS) expect(f.tierNames).toHaveLength(5);
  });

  it('엔진·데이터 코드에 종족 id 분기가 없다', async () => {
    const { readFileSync } = await import('node:fs');
    for (const file of ['src/engine/evolution/evolution.ts', 'src/data/evolution/index.ts']) {
      const src = readFileSync(file, 'utf8');
      expect(src).not.toMatch(/===?\s*['"](hollow|shinigami)['"]/);
    }
  });
});
