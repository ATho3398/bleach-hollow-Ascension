// 진화 (GDD 20-5 v3.7~v4.2, C.47): 걸음 수 타이밍·임박 알림·트리 판정(속성·분류·히든·가중 랜덤·실패형)·노력치·고유 특성·세이브 연결·마이그레이션
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { BALANCE } from '../src/config/balance';
import { FORM_TABLE, getForm } from '../src/data/evolution';
import { FACTIONS, getFaction } from '../src/data/factions';
import { STAT_IDS } from '../src/data/schema';
import { gainTrait, newBuild, setSlot, type BuildState } from '../src/engine/absorb';
import {
  addEv, applyEvolutionToParams, canEvolve, cloneEvolution, currentStats, dominantCategory, dominantElement, evCaps, evolutionCandidates, evolve, evTotal,
  hiddenWeight, judgeEvolution, newEvolution, playerElementsOf, recordEvolutionAbsorb, recordEvolutionStep, refStatOf, stabOf, stepsNeeded, type EvolutionState,
} from '../src/engine/evolution';
import { advance, chooseAbsorb, chooseRelease, createExpedition, finishBattle, startBattle } from '../src/engine/expedition';
import type { CombatParams } from '../src/engine/combat';
import { emptyRunLog } from '../src/engine/runLog';
import { loadSave, migrateSave, newSaveData, performEvolution, recordExpedition, SAVE_FORMAT_VERSION } from '../src/game';
import { LEGACY_TRAIT_MAP, migrateTraitId } from '../src/saveLegacy';
import { useLegacyMigrations } from './helpers/legacyGate';

useLegacyMigrations(); // 옛 형식 마이그레이션 시험 (C.120, GDD 61장)

const EV = BALANCE.provisional.evolution;
const H = EV.hidden;
const ctxOf = (build: BuildState, o: { hunger?: number; condition?: number } = {}) => ({ factionId: 'hollow', build, hunger: o.hunger ?? 20, condition: o.condition ?? 80 });
const buildWith = (...ids: string[]): BuildState => {
  const b = newBuild();
  while (b.slots.length < ids.length) b.slots.push(null);
  for (const id of ids) expect(gainTrait(b, id).ok).toBe(true);
  return b;
};
/** 단계 tierIndex 에 머문 진화 상태 (진화 경로는 일반형) */
function atTier(tierIndex: number, vasto = 't4:fire'): EvolutionState {
  const e = newEvolution(12345);
  const path = ['t2:base', 't3:base', vasto, 't5:fire:physical'].slice(0, tierIndex);
  e.tierIndex = tierIndex;
  e.formHistory = path;
  e.formId = path[path.length - 1] ?? null;
  e.steps = EV.stepsNeeded[tierIndex] ?? 0;
  return e;
}
function absorbs(e: EvolutionState, counts: Record<string, number>): EvolutionState {
  for (const [el, n] of Object.entries(counts)) for (let i = 0; i < n; i++) recordEvolutionAbsorb(e, el);
  return e;
}

describe('진화 타이밍 = 걸음 수 (v4.1)', () => {
  it('단계별 필요 걸음은 BALANCE 값, 닿기 전에는 진화할 수 없고 마지막 단계는 없다', () => {
    const e = newEvolution();
    expect(stepsNeeded(e)).toBe(EV.stepsNeeded[0]);
    expect(canEvolve(e)).toBe(false);
    for (let i = 0; i < EV.stepsNeeded[0]! - 1; i++) recordEvolutionStep(e);
    expect(canEvolve(e)).toBe(false);
    recordEvolutionStep(e);
    expect(canEvolve(e)).toBe(true);
    const last = atTier(4);
    expect(stepsNeeded(last)).toBeNull();
    expect(recordEvolutionStep(last)).toBeNull();
    expect(canEvolve(last)).toBe(false);
  });

  it('임박 알림: 남은 걸음 20%·10% 가 되는 순간 각각 한 번 (1, 2), 그 밖에는 null', () => {
    const e = newEvolution();
    const need = EV.stepsNeeded[0]!;
    const fired: { at: number; level: number }[] = [];
    for (let i = 0; i < need + 5; i++) {
      const lv = recordEvolutionStep(e);
      if (lv !== null) fired.push({ at: e.steps, level: lv });
    }
    expect(fired.map((f) => f.level)).toEqual([1, 2]);
    expect(need - fired[0]!.at).toBe(Math.floor(need * EV.alertsAt[0]!));
    expect(need - fired[1]!.at).toBe(Math.floor(need * EV.alertsAt[1]!));
  });

  it('원정 한 칸 = 걸음 1, 알림은 엔진 이벤트(evolution-near)로 나온다', () => {
    const save = newSaveData('hollow', 0);
    save.evolution.steps = EV.stepsNeeded[0]! - Math.floor(EV.stepsNeeded[0]! * EV.alertsAt[0]!) - 1;
    const exp = createExpedition({ factionId: 'hollow', seed: 9, runId: 1, hunger: 0, condition: 100, deck: [], evolution: save.evolution });
    exp.wildCells = [];
    const before = exp.evolution.steps;
    advance(exp);
    expect(exp.evolution.steps).toBe(before + 1);
    expect(exp.events).toContainEqual({ kind: 'evolution-near', level: 1 });
    expect(save.evolution.steps).toBe(before);
  });

  it('귀환하면(패배여도) 걸음이 찼을 때 자동 진화, 안 찼으면 진화하지 않는다', () => {
    for (const outcome of ['returned', 'defeated'] as const) {
      const save = newSaveData('hollow', 0);
      gainTrait(save.build, 't-fire-a');
      const exp = createExpedition({ factionId: 'hollow', seed: 1, runId: 1, hunger: 0, condition: 100, deck: [], evolution: save.evolution, build: save.build });
      exp.evolution.steps = EV.stepsNeeded[0]!;
      exp.phase = 'ended';
      exp.outcome = outcome;
      exp.endReason = outcome === 'returned' ? 'returned' : 'battle-lost';
      const r = recordExpedition(save, exp, 5);
      expect(r?.ok).toBe(true);
      expect(save.evolution.tierIndex).toBe(1);
      expect(save.evolution.formId).toBe('t2:base');
      expect(save.formDex).toContain('t2:base');
      expect(save.runLog.tiers.evolutions).toHaveLength(1);
      expect(save.evolution.steps).toBe(0);
    }
    const save = newSaveData('hollow', 0);
    const exp = createExpedition({ factionId: 'hollow', seed: 1, runId: 1, hunger: 0, condition: 100, deck: [], evolution: save.evolution });
    exp.evolution.steps = EV.stepsNeeded[0]! - 1;
    exp.phase = 'ended';
    exp.outcome = 'returned';
    exp.endReason = 'returned';
    expect(recordExpedition(save, exp, 5)).toBeNull();
    expect(save.evolution.tierIndex).toBe(0);
  });
});

describe('트리 판정', () => {
  it('1~3단계는 분기 없이 base 하나', () => {
    for (const t of [0, 1]) {
      const e = atTier(t);
      expect(judgeEvolution(e, ctxOf(buildWith('t-water-a'))).form.id).toBe(`t${t + 2}:base`);
    }
  });

  it('바스트로데 = 진화 순간 장착 특성 중 가장 많은 속성, 동률이면 가장 최근에 장착한 특성의 속성', () => {
    const e = atTier(2);
    expect(judgeEvolution(e, ctxOf(buildWith('t-water-a', 't-water-b', 't-fire-c'))).form.id).toBe('t4:water');
    const tie = buildWith('t-water-a', 't-fire-c');
    expect(dominantElement(tie)).toBe('fire');
    setSlot(tie, 0, 't-water-a'); // 다시 장착하면 가장 최근이 된다
    expect(dominantElement(tie)).toBe('water');
    expect(judgeEvolution(e, ctxOf(tie)).form.id).toBe('t4:water');
  });

  it('실패형은 강제: 장착 특성 없음 / 허기 높음 / 컨디션 낮음. 히든 조건을 채워도 실패형이 우선', () => {
    const e = absorbs(atTier(2), { water: 5, earth: 5 });
    expect(judgeEvolution(e, ctxOf(newBuild())).form.id).toBe('h4:fail');
    expect(judgeEvolution(e, ctxOf(buildWith('t-water-a'), { hunger: H.failHunger })).form.id).toBe('h4:fail');
    expect(judgeEvolution(e, ctxOf(buildWith('t-water-a'), { condition: H.failCondition })).form.id).toBe('h4:fail');
    const snap = judgeEvolution(e, ctxOf(newBuild())).snapshot;
    expect(snap.forced).toBe(true);
    expect(snap.candidates).toHaveLength(1);
  });

  it('속성 히든 후보: 마주 보는 원소 융합·완전체·특수·순수 (흡수가 minAbsorbs 이상일 때만)', () => {
    const b = buildWith('t-water-a');
    const ids = (e: EvolutionState, build = b, o = {}) => evolutionCandidates(e, ctxOf(build, o)).hidden.map((c) => c.formId);
    expect(ids(absorbs(atTier(2), { water: 5, earth: 5 }))).toEqual(['h4:fusion:water+earth']);
    expect(ids(absorbs(atTier(2), { fire: 5, thunder: 5 }))).toEqual(['h4:fusion:fire+thunder']);
    // 상성 관계인 쌍(물+불)은 융합이 없다
    expect(ids(absorbs(atTier(2), { water: 5, fire: 5 }))).toEqual([]);
    expect(ids(absorbs(atTier(2), { water: 2, fire: 2, earth: 2, thunder: 2 }))).toEqual(['h4:complete']);
    expect(ids(absorbs(atTier(2), { blood: 5, fire: 5 }))).toEqual(['h4:special:blood']);
    // 특수끼리면 흡수 수 많은 쪽 하나
    expect(ids(absorbs(atTier(2), { poison: 6, kyo: 5 }))).toEqual(['h4:special:poison']);
    // 순수형: 장착 최다 노멀 + 노멀 흡수 40%↑ + 컨디션 양호
    const nb = buildWith(); // C.184: 노멀 skill 특성은 기본 블록(GDD 111장 1) — 빈 슬롯 + 노멀 강화 = 노멀 장착
    nb.enhance = { normal: 6 };
    expect(ids(absorbs(atTier(2), { normal: 6 }), nb)).toEqual(['h4:pure']);
    expect(ids(absorbs(atTier(2), { normal: 6 }), nb, { condition: H.pureCondition - 1 })).toEqual([]);
    expect(ids(absorbs(atTier(2), { normal: 6 }), b)).toEqual([]);
    // 흡수가 적으면 분포 히든을 보지 않는다
    expect(ids(absorbs(atTier(2), { water: 2, earth: 2 }))).toEqual([]);
  });

  it('아란칼 = 바스트로데 속성 × 장착 최다 공격 분류 (공격 특성이 없으면 혼합)', () => {
    const e = atTier(3, 't4:thunder');
    expect(judgeEvolution(e, ctxOf(buildWith('t-fire-a', 't-water-a', 't-fire-c'))).form.id).toBe('t5:thunder:physical');
    expect(judgeEvolution(e, ctxOf(buildWith('t-fire-c'))).form.id).toBe('t5:thunder:special');
    expect(judgeEvolution(e, ctxOf(buildWith('t-fire-passive'))).form.id).toBe('t5:thunder:mixed'); // C.136: 막기 속성 특성 삭제 — 공격 아닌 특성은 패시브로
    expect(dominantCategory(buildWith('t-fire-b'), 'hollow')).toBe('mixed');
  });

  it('아란칼 행동 히든: 한계 돌파·절제(놓아준 수 > 흡수 수)·강적 사냥꾼', () => {
    const b = buildWith('t-fire-a');
    const ids = (e: EvolutionState) => evolutionCandidates(e, ctxOf(b)).hidden.map((c) => c.formId).sort();
    const e = atTier(3);
    e.breakthroughs = H.breakthroughs;
    e.releases = 3;
    e.absorbs = 1;
    e.elitesDefeated = H.elites;
    expect(ids(e)).toEqual(['h5:hunter', 'h5:limit', 'h5:restraint']);
    const none = atTier(3);
    none.releases = 2;
    none.absorbs = 2;
    expect(ids(none)).toEqual([]);
  });

  it('가중 랜덤 (v4.2): 겨우 채우면 일반과 반반(가중 1), 크게 넘기면 히든 90%(가중 9). 같은 단계 시드 = 같은 결과', () => {
    expect(hiddenWeight(0)).toBe(1);
    expect(hiddenWeight(EV.weight.fullExcess)).toBe(EV.weight.max);
    expect(hiddenWeight(10)).toBe(EV.weight.max);
    const b = buildWith('t-water-a');
    const tally = (counts: Record<string, number>) => {
      let hidden = 0;
      for (let seed = 1; seed <= 400; seed++) {
        const e = absorbs(atTier(2), counts);
        e.stageSeed = seed * 2654435761;
        if (judgeEvolution(e, ctxOf(b)).form.hidden) hidden++;
      }
      return hidden / 400;
    };
    expect(tally({ water: 4, earth: 4, fire: 1, thunder: 1 })).toBeGreaterThan(0.35);
    expect(tally({ water: 4, earth: 4, fire: 1, thunder: 1 })).toBeLessThan(0.65);
    expect(tally({ water: 5, earth: 5 })).toBeGreaterThan(0.75);
    const e = absorbs(atTier(2), { water: 4, earth: 4, fire: 2 });
    expect(judgeEvolution(e, ctxOf(b)).form.id).toBe(judgeEvolution(cloneEvolution(e), ctxOf(b)).form.id);
  });
});

describe('속성·자기 속성 보정 잇기', () => {
  const evolved = (...path: string[]): EvolutionState => ({ ...newEvolution(), tierIndex: path.length, formHistory: path, formId: path[path.length - 1]! });
  it('1단계는 노멀, 바스트로데부터 그 속성. 융합은 두 속성, 융합에서 온 아란칼도 두 속성', () => {
    expect(playerElementsOf(newEvolution())).toEqual(['normal']);
    expect(playerElementsOf(evolved('t2:base', 't3:base', 't4:fire'))).toEqual(['fire']);
    expect(playerElementsOf(evolved('t2:base', 't3:base', 'h4:fusion:water+earth'))).toEqual(['water', 'earth']);
    expect(playerElementsOf(evolved('t2:base', 't3:base', 'h4:fusion:water+earth', 't5:water:special'))).toEqual(['water', 'earth']);
    // 행동 히든은 바스트로데 속성을 잇는다
    expect(playerElementsOf(evolved('t2:base', 't3:base', 'h4:special:poison', 'h5:hunter'))).toEqual(['poison']);
    expect(playerElementsOf(evolved('t2:base', 't3:base', 'h4:fusion:fire+thunder', 'h5:limit'))).toEqual(['fire', 'thunder']);
  });
  it('순수형은 자기 속성 보정이 크고, 그 아란칼(노멀)·행동 히든이 잇는다', () => {
    expect(stabOf(newEvolution())).toBe(BALANCE.elements.stab);
    expect(stabOf(evolved('t2:base', 't3:base', 'h4:pure'))).toBe(EV.template.pureStab);
    expect(stabOf(evolved('t2:base', 't3:base', 'h4:pure', 't5:normal:mixed'))).toBe(EV.template.pureStab);
    expect(stabOf(evolved('t2:base', 't3:base', 'h4:pure', 'h5:restraint'))).toBe(EV.template.pureStab);
    expect(stabOf(evolved('t2:base', 't3:base', 't4:normal', 't5:normal:mixed'))).toBe(BALANCE.elements.stab);
  });
});

describe('노력치 (GDD 20-4)', () => {
  it('흡수하면 적 데이터의 노력치가 오르고, 단계 상한(합계·능력치 하나)에서 멈춘다', () => {
    const e = newEvolution();
    const cap = evCaps(0);
    for (let i = 0; i < 50; i++) recordEvolutionAbsorb(e, 'fire', { atk: 2 });
    expect(e.ev.atk).toBe(cap.perStat);
    for (let i = 0; i < 50; i++) recordEvolutionAbsorb(e, 'fire', { def: 2, spd: 2 });
    expect(evTotal(e.ev)).toBe(cap.total);
    expect(addEv(e, { hp: 5 })).toEqual({});
    expect(e.absorbs).toBe(100);
    expect(e.elementAbsorbs.fire).toBe(100);
  });
  it('진화해도 노력치는 유지되고 상한만 오른다. 능력치 = 종족값 + 노력치', () => {
    const save = newSaveData('hollow', 0);
    gainTrait(save.build, 't-fire-a');
    recordEvolutionAbsorb(save.evolution, 'fire', { atk: 2 });
    save.evolution.steps = EV.stepsNeeded[0]!;
    expect(performEvolution(save, 1).ok).toBe(true);
    expect(save.evolution.ev.atk).toBe(2);
    expect(evCaps(1).total).toBeGreaterThan(evCaps(0).total);
    const st = currentStats(save.evolution, 'hollow');
    expect(st.atk).toBe(getForm('t2:base').stats.atk + 2);
    expect(currentStats(newEvolution(), 'shinigami')).toEqual(getFaction('shinigami').baseStats);
  });
  it('고유 특성 = 진화 순간 노력치 최고 능력치 (없으면 진화체 종족값 최고)', () => {
    const e = atTier(0);
    recordEvolutionAbsorb(e, 'fire', { int: 2, atk: 1 });
    const r = evolve(e, buildWith('t-fire-a'), { factionId: 'hollow', hunger: 20, condition: 80 }, 1);
    expect(r.ok && e.ability).toBe('int');
    const z = atTier(0);
    evolve(z, buildWith('t-fire-a'), { factionId: 'hollow', hunger: 20, condition: 80 }, 1);
    const st = getForm('t2:base').stats;
    expect(st[z.ability!]).toBe(Math.max(...STAT_IDS.map((k) => st[k])));
  });
  it('전투 파라미터: 기준 능력치·내 능력치·속성·고유 특성 효과가 실린다', () => {
    const e = atTier(1);
    e.ability = 'int';
    recordEvolutionAbsorb(e, 'fire', { atk: 2 });
    const p: Partial<CombatParams> = {};
    applyEvolutionToParams(p, e, 'hollow');
    // C.75 (GDD 32-1): 내 쪽 기준은 세계 기준(1단계)으로 고정, 적 기준(refStat)은 난이도가 정하므로 여기서 건드리지 않는다
    expect(p.playerRefStat).toBe(refStatOf(0));
    expect(p.refStat).toBeUndefined();
    expect(p.playerStats!.atk).toBe(getForm('t2:base').stats.atk + 2);
    expect(p.playerElements).toEqual(['normal']);
    expect(p.blockSpawnMultiplier).toBeCloseTo(BALANCE.provisional.abilities.int.blockSpawn);
    const q: Partial<CombatParams> = {};
    applyEvolutionToParams(q, { ...e, ability: 'def' }, 'hollow');
    expect(q.categoryTaken!.physical).toBeCloseTo(BALANCE.provisional.abilities.def.physicalTaken);
  });
});

describe('진화 확정', () => {
  it('단계 +1, 슬롯 +1, 단계 기록 리셋(노력치 유지), 새 단계 시드, 런 로그 스냅샷', () => {
    const e = absorbs(atTier(2), { water: 3, fire: 1 });
    e.releases = 2;
    const seed = e.stageSeed;
    const b = buildWith('t-water-a');
    const r = evolve(e, b, { factionId: 'hollow', hunger: 30, condition: 70 }, 77);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(e.tierIndex).toBe(3);
    expect(b.slots).toHaveLength(BALANCE.absorb.slotCount + 1);
    expect([e.steps, e.absorbs, e.releases, e.breakthroughs, e.elitesDefeated, e.alerts]).toEqual([0, 0, 0, 0, 0, 0]);
    expect(e.elementAbsorbs).toEqual({});
    expect(e.stageSeed).not.toBe(seed);
    expect(r.record).toMatchObject({ fromTier: 2, toTier: 3, fromFormId: 't3:base', toFormId: 't4:water', at: 77 });
    expect(r.record.snapshot).toMatchObject({ elementAbsorbs: { water: 3, fire: 1 }, releases: 2, hunger: 30, condition: 70, equippedElement: 'water' });
  });
  it('5단계 이후에는 진화하지 않는다', () => {
    const e = atTier(4);
    e.steps = 999;
    expect(evolve(e, newBuild(), { factionId: 'hollow', hunger: 0, condition: 100 }, 0).ok).toBe(false);
  });
  it('원정: 흡수하면 그 적의 속성·노력치, 놓아주면 놓아준 수가 쌓이고 귀환하면 세이브에 합쳐진다', () => {
    const save = newSaveData('hollow', 0);
    const exp = createExpedition({ factionId: 'hollow', seed: 3, runId: 1, hunger: 0, condition: 100, deck: ['prey-nest-a'], evolution: save.evolution, build: save.build });
    const fight = () => {
      exp.wildCells = [exp.pos + 1];
      advance(exp);
      const b = startBattle(exp);
      b.enemy.hp = 0;
      b.status = 'won';
      b.params = { ...b.params, skills: [] };
      finishBattle(exp, b);
      expect(exp.phase).toBe('absorb');
      return exp.absorbOffer!;
    };
    const o = fight();
    expect(chooseAbsorb(exp, null).ok).toBe(true);
    expect(exp.evolution.elementAbsorbs[o.element]).toBe(1);
    expect(evTotal(exp.evolution.ev)).toBeGreaterThan(0);
    fight();
    expect(chooseRelease(exp).ok).toBe(true);
    expect(exp.evolution.releases).toBe(1);
    expect(save.evolution.absorbs).toBe(0);
    exp.phase = 'ended';
    exp.outcome = 'returned';
    exp.endReason = 'returned';
    exp.breakthrough = { lap: 1, cell: 1 };
    recordExpedition(save, exp, 10);
    expect(save.evolution.absorbs).toBe(1);
    expect(save.evolution.releases).toBe(1);
    expect(save.evolution.breakthroughs).toBe(1);
    expect(save.runLog.absorbs[0]!.element).toBe(o.element);
  });
});

describe('세이브 마이그레이션 (형식 13 → 14)', () => {
  /** 형식 13 세이브 모양 (옛 계통·특성·진화체 id) */
  function oldSave13(): Record<string, any> {
    const s = newSaveData('hollow', 0) as unknown as Record<string, any>;
    s.meta = { format: 13, balanceVersion: 22, startPatch: 'C.46' };
    s.build = { owned: ['trait-a1', 'trait-b1', 'trait-c5', 'trait-zzz'], slots: ['trait-a1', 'trait-c5', 'trait-b1', null] };
    s.evolution = {
      tierIndex: 3, formId: 't4:triple@lineage-c+lineage-a+lineage-b', formHistory: ['t2:dominant@lineage-a', 't3:pair@lineage-a+lineage-b', 't4:triple@lineage-c+lineage-a+lineage-b'],
      absorbs: 20, lineageScores: { 'lineage-a': 12, 'lineage-c': 8 }, lastAbsorbSeq: {}, seq: 20, rareAbsorbs: 1,
    };
    s.formDex = ['t2:dominant@lineage-a', 't2:base'];
    s.runLog.absorbs = [{ runId: 1, enemyId: 'a-basic', lineageId: 'lineage-b', rare: false, absorbed: true, traitId: 'trait-a1', lap: 1 }];
    s.runLog.battles = [];
    s.activeExpedition = { version: 1, old: true };
    s.lastScreen = 'expedition';
    return s;
  }

  it('옛 특성 id 는 같은 종류·역할·계열의 속성 특성으로, 모르는 id 는 버린다', () => {
    const m = migrateSave(oldSave13())!;
    expect(m.meta.format).toBe(SAVE_FORMAT_VERSION);
    expect(SAVE_FORMAT_VERSION).toBeGreaterThanOrEqual(14);
    // C.136 (GDD 84장 7번): 막기·회복 속성 특성(옛 trait-b1 → t-earth-guard)은 삭제되어 버린다
    expect(m.build.owned).toEqual(['t-fire-a', 't-thunder-c']);
    expect(m.build.slots).toEqual(['t-fire-a', 't-thunder-c', null, null]);
    expect(m.build.equipOrder).toEqual(['t-fire-a', 't-thunder-c']);
    for (const id of Object.values(LEGACY_TRAIT_MAP)) expect([id, null]).toContain(migrateTraitId(id));
    expect(migrateTraitId('t-earth-guard')).toBeNull();
    expect(migrateTraitId('trait-zzz')).toBeNull();
  });

  it('진화: 단계를 유지하고 새 트리의 대응 형태로 (4단계 = 옛 4단계 첫 계통의 속성), 계통 누적은 버리고 걸음 0부터', () => {
    const m = migrateSave(oldSave13())!;
    // 옛 4단계 진화체의 첫 계통 lineage-c → 뇌
    expect(m.evolution.formHistory).toEqual(['t2:base', 't3:base', 't4:thunder']);
    expect(m.evolution.formId).toBe('t4:thunder');
    expect(m.evolution.tierIndex).toBe(3);
    expect(m.evolution.steps).toBe(0);
    expect(m.evolution.absorbs).toBe(0);
    expect(evTotal(m.evolution.ev)).toBe(0);
    expect(m.evolution).not.toHaveProperty('lineageScores');
    expect(m.evolution.ability).not.toBeNull();
    expect(m.formDex).toEqual(['t2:base', 't3:base', 't4:thunder']);
    expect(m.activeExpedition).toBeNull();
    expect(m.lastScreen).toBe('room');
    expect(m.runLog.absorbs[0]).toMatchObject({ lineageId: 'lineage-b', element: null });
  });

  it('5단계 세이브는 바스트로데 속성 × 지금 장착 최다 분류의 아란칼이 되고, 이어서 원정·전투 파라미터가 만들어진다', () => {
    const old = oldSave13();
    old.evolution.tierIndex = 4;
    old.evolution.formHistory.push('t5:pair@lineage-a+lineage-b');
    const m = migrateSave(old)!;
    // 장착: 물리(t-fire-a)·특수(t-thunder-c) 동률 → 더 최근(슬롯 순서상 뒤) 특수
    expect(m.evolution.formId).toBe('t5:thunder:special');
    const p: Partial<CombatParams> = {};
    expect(() => applyEvolutionToParams(p, m.evolution, m.factionId)).not.toThrow();
    expect(p.playerElements).toEqual(['thunder']);
  });

  it('형식 1·5 세이브도 끝까지 열리고, loadSave 로 읽힌다', () => {
    const old = { meta: { format: 1, balanceVersion: 1, startPatch: 'C.1' }, factionId: 'hollow', runLog: { ...emptyRunLog(), battles: [], tiers: { skipped: false, defeatedWhileAtTier: {} } } };
    const m = migrateSave(old)!;
    expect(m.evolution.tierIndex).toBe(0);
    expect(m.evolution.formId).toBeNull();
    expect(m.formDex).toEqual([]);
    const store = new Map<string, string>([['k', JSON.stringify(oldSave13())]]);
    const loaded = loadSave({ getItem: (k) => store.get(k) ?? null, setItem: () => {} }, 'k');
    expect(loaded?.meta.format).toBe(SAVE_FORMAT_VERSION);
    expect(loaded?.evolution.formId).toBe('t4:thunder');
  });

  it('현재 형식 세이브는 그대로 열린다', () => {
    const save = newSaveData('shinigami', 0);
    save.formDex = ['t2:base'];
    const m = migrateSave(JSON.parse(JSON.stringify(save)))!;
    expect(m).toEqual(save);
  });
});

describe('종족 설정만 바꿔 표기가 바뀐다 (코드 분기 없음)', () => {
  it('같은 상태면 두 종족의 판정 결과가 같다 (진화체 id 는 종족과 무관)', () => {
    const run = (factionId: string) => judgeEvolution(absorbs(atTier(2), { water: 5, earth: 5 }), { ...ctxOf(buildWith('t-water-a')), factionId }).form.id;
    expect(run('hollow')).toBe(run('shinigami'));
    for (const f of FACTIONS) {
      expect(f.tierNames).toHaveLength(5);
      expect(f.baseStats).toBeDefined();
      expect(f.evolutionNearText).toHaveLength(2);
    }
    // 일반 32종 = 1단계(진화체 없음) + 1 + 1 + 5(C.106 노멀+원소) + 24, 히든 12 (C.56 환생 전용 1 추가)
    expect(FORM_TABLE.filter((f) => !f.hidden)).toHaveLength(31);
    expect(FORM_TABLE.filter((f) => f.hidden)).toHaveLength(12);
  });

  it('엔진·데이터 코드에 종족 id 분기가 없다', () => {
    for (const file of [
      'src/engine/evolution/evolution.ts', 'src/engine/evolution/judge.ts', 'src/engine/evolution/analysis.ts', 'src/engine/combat/combat.ts', 'src/data/elements/index.ts',
      'src/data/evolution/index.ts', 'src/data/evolution/generate.ts', 'src/data/evolution/build.ts', 'src/saveLegacy.ts', 'src/ui/dexView.ts', 'src/ui/evolutionPanel.ts', 'src/ui/bha/element.ts',
    ]) {
      const src = readFileSync(file, 'utf8');
      expect(src, file).not.toMatch(/===?\s*['"](hollow|shinigami)['"]/);
      expect(src, file).not.toMatch(/factionId\s*===?/);
    }
  });
});
