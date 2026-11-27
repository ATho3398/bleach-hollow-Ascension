// C.532 혈·독 일반 진화 조건 재설계 (GDD 8-5 v6.164·v6.165, 사용자 2026-11-23 "혈·독으로 가는 진화는 장착 최다가 아니라 그 속성 블록 10개 흡수 + 추가 조건")
// ① 수치 = balance specialPaths (혈 = 혈 블록 10개 + 빈사로 귀환 / 독 = 독 블록 10개 + 독 지속 피해로 적 처치 3회, 그 단계 합계)
// ② 판정: 조건을 채우면 장착과 무관하게 혈·독, 못 채우면 3단계 속성을 잇는다 · 일반 < 혈·독 < 히든 ③ 전투·런 로그: 독 지속 피해 처치 기록 dotKill
// ④ 그 단계 합계: 원정 전투의 지속 피해 처치 · 빈사로 귀환 · 진화하면 0 ⑤ 도감 힌트 ⑥ 세이브 형식 97 (96 → 97) ⑦ 허무형 몸의 가방 블록 이름(적막·낙화 블록)
import { describe, expect, it } from 'vitest';
import { useImmediateHits } from './helpers/hitDelay';
import { BALANCE, BALANCE_VERSION } from '../src/config/balance';
import { POISON_DOT_ELEMENT } from '../src/data/elements';
import { getEnemy } from '../src/data/enemies';
import { formHint, getForm, specialPathHint } from '../src/data/evolution';
import { originalBlockOf } from '../src/data/evolution/uniques';
import { getFaction } from '../src/data/factions';
import { buildCombatParams, gainTrait, newBuild, type BuildState } from '../src/engine/absorb';
import { applyInput, buildBattleRecord, createCombat, step, ticksOf, type Block, type CombatParams, type CombatState } from '../src/engine/combat';
import { cloneEvolution, evolve, newEvolution, recordEvolutionCollapsedReturn, recordEvolutionDotKill, stepsNeeded, type EvolutionState } from '../src/engine/evolution';
import { collapsedReturnsOf, dotKillsOf, evolutionCandidates, judgeEvolution, specialPathForm, specialPathMet, tier4Normal } from '../src/engine/evolution/judge';
import { advance, chooseRelease, createExpedition, finishBattle, startBattle, type ExpeditionState } from '../src/engine/expedition';
import { migrateSave, migrateSpecialPathCounters, newSaveData, recordExpedition, SAVE_FORMAT_VERSION, SAVE_MIGRATIONS, MIN_LOADABLE_SAVE_FORMAT, type SaveData } from '../src/game';
import { traitBlockName, traitBrief } from '../src/ui/buildPanel';
useImmediateHits();

const PATHS = BALANCE.provisional.evolution.specialPaths;
const BLOOD = PATHS.find((p) => p.element === 'blood')!;
const POISON = PATHS.find((p) => p.element === 'poison')!;
const STILL: Partial<CombatParams> = { critChance: 0, blockCritChance: 0, enemyCritChance: 0, enemyDamageVariance: 0, voidChance: 0 };

const buildOf = (...ids: string[]): BuildState => {
  const b = newBuild();
  for (let i = 0; i < 4; i++) b.slots.push(null);
  for (const id of ids) gainTrait(b, id);
  return b;
};
const ctxOf = (build: BuildState, factionId = 'hollow') => ({ factionId, build, hunger: 10, condition: 90 });
/** 3단계(불) 몸 */
const tier3 = (over: Partial<EvolutionState> = {}): EvolutionState => ({ ...newEvolution(5), tierIndex: 2, formId: 't3:fire', formHistory: ['t2:base', 't3:fire'], ...over });

describe('① 수치 (balance specialPaths, provisional)', () => {
  it('혈 = 혈 블록 10개 + 빈사로 귀환 1회 · 독 = 독 블록 10개 + 독 지속 피해 처치 3회 · BALANCE 167', () => {
    expect(BLOOD).toEqual({ element: 'blood', absorbs: 10, collapsedReturns: 1 });
    expect(POISON).toEqual({ element: 'poison', absorbs: 10, dotKills: 3 });
    expect(PATHS).toHaveLength(2);
    expect(BALANCE_VERSION).toBeGreaterThanOrEqual(167);
  });
});

describe('② 판정 (GDD 8-5): 그 속성 블록 흡수 + 추가 조건', () => {
  it('혈: 혈 블록 10개 흡수 + 빈사로 귀환 → 장착이 무엇이든 혈 4단계, 하나라도 모자라면 3단계 속성(불)을 잇는다', () => {
    const fire = buildOf('t-fire-a');
    expect(tier4Normal(tier3({ elementAbsorbs: { blood: 10 }, collapsedReturns: 1 }), ctxOf(fire)).id).toBe('t4:blood:physical');
    expect(tier4Normal(tier3({ elementAbsorbs: { blood: 9 }, collapsedReturns: 3 }), ctxOf(fire)).id).toBe('t4:fire:physical'); // 흡수 모자람
    expect(tier4Normal(tier3({ elementAbsorbs: { blood: 30 } }), ctxOf(fire)).id).toBe('t4:fire:physical'); // 빈사 귀환 없음
    expect(tier4Normal(tier3({ elementAbsorbs: { blood: 30 }, faints: 2 }), ctxOf(fire)).id).toBe('t4:fire:physical'); // 빈사가 됐을 뿐(미접속 등) 귀환이 아니다
  });
  it('독: 독 블록 10개 흡수 + 독 지속 피해로 적 처치 3회 → 독 4단계, 모자라면 3단계 속성', () => {
    const fire = buildOf('t-fire-a');
    expect(tier4Normal(tier3({ elementAbsorbs: { poison: 10 }, dotKills: { poison: 3 } }), ctxOf(fire)).id).toBe('t4:poison:special');
    expect(tier4Normal(tier3({ elementAbsorbs: { poison: 10 }, dotKills: { poison: 2 } }), ctxOf(fire)).id).toBe('t4:fire:physical');
    expect(tier4Normal(tier3({ elementAbsorbs: { poison: 9 }, dotKills: { poison: 9 } }), ctxOf(fire)).id).toBe('t4:fire:physical');
    expect(tier4Normal(tier3({ elementAbsorbs: { poison: 10 }, dotKills: { thunder: 9 } }), ctxOf(fire)).id).toBe('t4:fire:physical'); // 다른 속성 지속 피해는 안 셈
  });
  it('혈·독을 가장 많이 장착해도 조건을 못 채우면 혈·독으로 가지 않는다 (옛 장착 최다 규칙 없음) — 두 종족 같다', () => {
    for (const f of ['hollow', 'shinigami']) {
      expect(tier4Normal(tier3(), ctxOf(buildOf('t-blood'), f)).id.startsWith('t4:fire:')).toBe(true);
      expect(tier4Normal(tier3(), ctxOf(buildOf('t-poison'), f)).id.startsWith('t4:fire:')).toBe(true);
      expect(tier4Normal(tier3({ elementAbsorbs: { blood: 10 }, collapsedReturns: 1 }), ctxOf(buildOf('t-fire-a'), f)).id).toBe('t4:blood:physical');
    }
  });
  it('둘 다 채우면 그 속성 흡수가 많은 쪽, 같으면 balance 표의 앞쪽(혈)', () => {
    const both = (blood: number, poison: number) => tier3({ elementAbsorbs: { blood, poison }, collapsedReturns: 1, dotKills: { poison: 3 } });
    expect(specialPathForm(both(10, 14))!.id).toBe('t4:poison:special');
    expect(specialPathForm(both(14, 10))!.id).toBe('t4:blood:physical');
    expect(specialPathForm(both(12, 12))!.id).toBe('t4:blood:physical');
    expect(specialPathForm(tier3())).toBeNull();
  });
  it('specialPathMet: 없는 칸은 조건이 아니다 · 옛 세이브(칸 없음) = 0', () => {
    expect(specialPathMet({ elementAbsorbs: { blood: 10 }, collapsedReturns: 1 }, BLOOD)).toBe(true);
    expect(specialPathMet({ elementAbsorbs: { blood: 10 } }, BLOOD)).toBe(false);
    expect(specialPathMet({ elementAbsorbs: { blood: 10 } }, { element: 'blood', absorbs: 10 })).toBe(true);
    expect(collapsedReturnsOf({})).toBe(0);
    expect(dotKillsOf({}, 'poison')).toBe(0);
  });
  it('우선순위 일반 < 혈·독 < 히든: 망한 줄기는 실패형, 히든 조건을 채우면 히든만 후보', () => {
    const met = { elementAbsorbs: { blood: 10 }, collapsedReturns: 1 };
    expect(tier4Normal(tier3({ ...met, formId: 'h3:fail', formHistory: ['t2:base', 'h3:fail'] }), ctxOf(buildOf('t-fire-a'))).id).toBe('h4:fail');
    const hunter = tier3({ ...met, hunterRuns: BALANCE.provisional.evolution.hidden.hunterRuns });
    const c = evolutionCandidates(hunter, ctxOf(buildOf('t-fire-a')));
    expect(c.normal.id).toBe('t4:blood:physical');
    expect(c.hidden.map((h) => h.formId)).toContain('h4:hunter');
    expect(judgeEvolution(hunter, ctxOf(buildOf('t-fire-a'))).form.hidden).toBe(true);
  });
  it('3단계 진화에는 영향 없음: 혈·독만 장착 = 노멀, 조건을 채워도 3단계는 원소·노멀', () => {
    const e2 = { ...newEvolution(5), tierIndex: 1, formId: 't2:base', formHistory: ['t2:base'], elementAbsorbs: { blood: 12 }, absorbs: 12, collapsedReturns: 2 };
    expect(judgeEvolution(e2, ctxOf(buildOf('t-blood'))).form.id).toBe('t3:normal');
  });
  it('진화 스냅샷(런 로그)에 그 단계 합계가 남는다 — 0 이면 칸 없음', () => {
    const snap = judgeEvolution(tier3({ elementAbsorbs: { poison: 11 }, collapsedReturns: 2, dotKills: { poison: 4 } }), ctxOf(buildOf('t-fire-a'))).snapshot;
    expect(snap.collapsedReturns).toBe(2);
    expect(snap.dotKills).toEqual({ poison: 4 });
    const none = judgeEvolution(tier3(), ctxOf(buildOf('t-fire-a'))).snapshot;
    expect('collapsedReturns' in none).toBe(false);
    expect('dotKills' in none).toBe(false);
  });
});

describe('③ 전투 · 런 로그: 독 지속 피해로 처치 = dotKill', () => {
  let uid = 95000;
  const blk = (traitId: string): Block => ({ uid: uid++, kind: 'skill', traitId });
  const fight = (traitId: string): CombatState => {
    const b = newBuild();
    gainTrait(b, traitId);
    const s = createCombat(3, { enemy: getEnemy('test-e'), params: { ...STILL, ...buildCombatParams(b) } });
    s.spawnTimer = 1e9;
    s.player.attackTimer = 1e9;
    s.enemy.attackTimer = 1e9;
    s.enemy.actionTimer = 1e9;
    s.tray = [blk(traitId)];
    return s;
  };
  const run = (s: CombatState, seconds: number): void => {
    for (let i = 0; i < ticksOf(s.params, seconds) && s.status === 'playing'; i++) step(s);
  };
  it('독 속성 데이터: 지속 피해를 건 속성 = 특수 효과 poison 속성', () => {
    expect(POISON_DOT_ELEMENT).toBe('poison');
  });
  it('독 블록의 지속 피해가 마무리하면 finisher dot + dotElement 독 → 전투 기록 dotKill', () => {
    const s = fight('t-poison');
    applyInput(s, { type: 'use', cell: 0 });
    expect(s.enemy.dot?.element).toBe('poison');
    s.enemy.hp = s.enemy.dot!.perTick * 0.5; // 다음 독 틱에 쓰러진다
    run(s, 2);
    expect(s.status).toBe('won');
    expect(s.finisher).toMatchObject({ kind: 'dot', dotElement: 'poison' });
    const rec = buildBattleRecord(s, { factionId: 'hollow' });
    expect(rec.finisherKind).toBe('dot');
    expect(rec.dotKill).toBe('poison');
  });
  it('독을 걸었어도 블록 직격으로 마무리하면 dotKill 이 아니다 · 독이 없는 전투도', () => {
    const s = fight('t-poison');
    s.enemy.hp = 0.01;
    applyInput(s, { type: 'use', cell: 0 });
    run(s, 1);
    expect(s.status).toBe('won');
    expect(s.finisher?.kind).not.toBe('dot');
    expect('dotKill' in buildBattleRecord(s, { factionId: 'hollow' })).toBe(false);
  });
});

describe('④ 그 단계 합계: 원정 전투의 지속 피해 처치 · 빈사로 귀환', () => {
  const DECK = ['prey-nest-a', 'prey-nest-a', 'elite-den-a', 'env-fog', 'rest-a', 'prey-nest-b', 'env-ruin', 'elite-den-b'];
  const win = (exp: ExpeditionState, finisher: CombatState['finisher']): void => {
    const b = startBattle(exp);
    b.enemy.hp = 0;
    b.status = 'won';
    b.finisher = finisher;
    finishBattle(exp, b);
  };
  /** 흡수 화면은 놓아주고, 바로 다음 칸에서 전투를 만난다 */
  const toBattle = (exp: ExpeditionState): string => {
    if (exp.phase === 'absorb') chooseRelease(exp);
    exp.wildCells = [exp.pos + 1];
    advance(exp);
    return exp.phase;
  };
  it('원정에서 독 지속 피해로 적을 쓰러뜨릴 때마다 dotKills.poison +1 (다른 마무리는 안 셈) — 귀환하면 세이브 진화 상태로', () => {
    const s = grown();
    const exp = createExpedition({ factionId: 'hollow', seed: 1, hunger: 10, condition: 100, deck: DECK, build: s.build, evolution: s.evolution });
    expect(toBattle(exp)).toBe('battle');
    win(exp, { kind: 'dot', traitId: null, element: null, dotElement: 'poison' });
    expect(exp.evolution.dotKills).toEqual({ poison: 1 });
    expect(exp.battles[0]!.dotKill).toBe('poison');
    expect(toBattle(exp)).toBe('battle');
    win(exp, { kind: 'basic-attack', traitId: null, element: null });
    expect(toBattle(exp)).toBe('battle');
    win(exp, { kind: 'dot', traitId: null, element: null }); // 속성 없는 지속 피해(진화체 자기장 등)
    expect(exp.evolution.dotKills).toEqual({ poison: 1 });
    expect(s.evolution.dotKills).toBeUndefined(); // 원정 사본 — 귀환 전
    Object.assign(exp, { phase: 'ended', outcome: 'returned', endReason: 'returned', lapsCompleted: 1 });
    recordExpedition(s, exp, 5_000, { holdEvolution: true });
    expect(s.evolution.dotKills).toEqual({ poison: 1 });
    expect(s.runLog.battles.filter((b) => b.dotKill === 'poison')).toHaveLength(1);
  });
  it('빈사로 귀환: 져서 빈사가 된 원정 +1 · 런 기록 collapsedReturn · 멀쩡히 돌아오면 그대로', () => {
    const s = grown();
    recordExpedition(s, ended(s, 'returned'), 2_000, { holdEvolution: true });
    expect(collapsedReturnsOf(s.evolution)).toBe(0);
    expect(s.runLog.runs[0]!.collapsedReturn).toBeUndefined();
    recordExpedition(s, ended(s, 'defeated'), 3_000, { holdEvolution: true });
    expect(s.nest.collapsed).toBe(true);
    expect(collapsedReturnsOf(s.evolution)).toBe(1);
    expect(s.runLog.runs[1]!.collapsedReturn).toBe(true);
  });
  it('빈사로 떠나 빈사로 돌아와도 +1 (빈사 = 진화 순간이 아니라 귀환 횟수)', () => {
    const s = grown();
    s.nest.collapsed = true;
    s.nest.collapsedAt = 1_500;
    recordExpedition(s, ended(s, 'returned'), 2_000, { holdEvolution: true });
    expect(s.nest.dead).toBe(false);
    expect(collapsedReturnsOf(s.evolution)).toBe(1);
  });
  it('튜토리얼 원정의 빈사 복귀는 세지 않는다', () => {
    const s = newSaveData('hollow', 1_000);
    recordExpedition(s, ended(s, 'returned', { tutorial: true }), 2_000);
    expect(s.nest.collapsed).toBe(true);
    expect(collapsedReturnsOf(s.evolution)).toBe(0);
    expect(s.runLog.runs[0]!.collapsedReturn).toBeUndefined();
  });
  it('흐름: 3단계에서 혈 블록 10개 흡수 + 져서 빈사로 귀환 → 진화하면 혈 4단계, 그 단계 기록은 0으로', () => {
    const s = grown();
    const e = s.evolution;
    Object.assign(e, { tierIndex: 2, formId: 't3:water', formHistory: ['t2:base', 't3:water'], elementAbsorbs: { blood: 10 }, absorbs: 10 });
    e.steps = stepsNeeded(e)!;
    const r = recordExpedition(s, ended(s, 'defeated'), 2_000); // 패배 귀환도 진화 (GDD 8-5)
    expect(r?.ok).toBe(true);
    expect(s.evolution.formId).toBe('t4:blood:physical');
    expect(s.evolution.collapsedReturns).toBeUndefined();
    expect(s.evolution.dotKills).toBeUndefined();
    const rec = s.runLog.tiers.evolutions[s.runLog.tiers.evolutions.length - 1]!;
    expect(rec.snapshot?.collapsedReturns).toBe(1);
  });
  it('기록 함수 · 복사 · 진화 리셋', () => {
    const e = tier3({ elementAbsorbs: { poison: 10 }, absorbs: 10 });
    recordEvolutionCollapsedReturn(e);
    for (let i = 0; i < 3; i++) recordEvolutionDotKill(e, 'poison');
    recordEvolutionDotKill(e, 'thunder');
    expect([e.collapsedReturns, e.dotKills]).toEqual([1, { poison: 3, thunder: 1 }]);
    const copy = cloneEvolution(e);
    recordEvolutionDotKill(copy, 'poison');
    expect(e.dotKills!.poison).toBe(3); // 깊은 복사
    e.steps = stepsNeeded(e)!;
    const b = buildOf('t-fire-a');
    const r = evolve(e, b, { factionId: 'hollow', hunger: 10, condition: 90 }, 1);
    expect(r.ok && r.form.id).toBe('t4:poison:special');
    expect(e.collapsedReturns).toBeUndefined();
    expect(e.dotKills).toBeUndefined();
  });
});

/** 튜토리얼 안내를 다 끝낸 세이브 */
function grown(nowMs = 1_000): SaveData {
  const s = newSaveData('hollow', nowMs);
  for (const k of Object.keys(s.help.guides)) s.help.guides[k as keyof typeof s.help.guides] = 'done';
  s.build = newBuild();
  for (let i = 0; i < 4; i++) s.build.slots.push(null);
  gainTrait(s.build, 't-water-a');
  s.nest.hunger = 20;
  s.nest.condition = 80;
  return s;
}
function ended(s: SaveData, outcome: 'returned' | 'defeated' = 'returned', extra: Partial<ExpeditionState> = {}): ExpeditionState {
  const exp = createExpedition({ factionId: s.factionId, seed: 7, hunger: 20, condition: 80, deck: [], build: s.build, evolution: s.evolution });
  Object.assign(exp, { phase: 'ended', outcome, endReason: outcome, lapsCompleted: 1 }, extra);
  return exp;
}

describe('⑤ 도감 힌트 (허무형 조건 표시와 같은 모양)', () => {
  it('혈·독 4단계: 종족 행위 이름 + balance 수치', () => {
    expect(formHint(getForm('t4:blood:physical'), 'hollow')).toBe('혈 블록을 10개 포식하고, 빈사로 귀환한 뒤 진화');
    expect(formHint(getForm('t4:blood:physical'), 'shinigami')).toBe('혈 블록을 10개 정화 흡수하고, 빈사로 귀환한 뒤 진화');
    expect(formHint(getForm('t4:poison:special'), 'hollow')).toBe('독 블록을 10개 포식하고, 독 지속 피해로 적을 3번 쓰러뜨린 뒤 진화');
    expect(formHint(getForm('t4:poison:special'), 'shinigami')).toBe('독 블록을 10개 정화 흡수하고, 독 지속 피해로 적을 3번 쓰러뜨린 뒤 진화');
  });
  it('다른 4단계 일반 진화체 힌트는 그대로(장착 최다) · 길이 없는 속성은 null', () => {
    expect(formHint(getForm('t4:fire:physical'), 'hollow')).toContain('가장 많이 장착하고 진화');
    expect(specialPathHint('fire', 'hollow')).toBeNull();
    expect(specialPathHint(undefined, 'hollow')).toBeNull();
  });
});

describe('⑥ 세이브 형식 97 (96 → 97) — 옛 세이브를 이어 쓴다', () => {
  it('형식 97 · 96 → 97 변환 있음 · 문턱 87 그대로', () => {
    expect(SAVE_FORMAT_VERSION).toBe(99);
    expect(typeof SAVE_MIGRATIONS[96]).toBe('function');
    expect(MIN_LOADABLE_SAVE_FORMAT).toBe(87);
  });
  it('형식 96 세이브: 지금 단계에 들어선 뒤의 패배 빈사 기록 수 = 빈사 귀환 수, 지속 피해 처치는 0 — 다른 것은 그대로', () => {
    const s = newSaveData('hollow', 1_000);
    gainTrait(s.build, 't-water-a');
    Object.assign(s.evolution, { tierIndex: 2, formId: 't3:water', formHistory: ['t2:base', 't3:water'], elementAbsorbs: { blood: 7 }, absorbs: 7 });
    s.runLog.tiers.evolutions.push({ fromTier: 1, toTier: 2, fromFormId: 't2:base', toFormId: 't3:water', formId: 't3:water', at: 5_000 });
    const vital = (at: number, kind: 'collapse' | 'cure', cause?: 'defeat' | 'absence') => ({ at, factionId: 'hollow', kind, bond: 0, ...(cause ? { cause } : {}) });
    s.runLog.vitals.push(vital(4_000, 'collapse', 'defeat'), vital(6_000, 'collapse', 'defeat'), vital(7_000, 'cure'), vital(8_000, 'collapse', 'absence'), vital(9_000, 'collapse', 'defeat'));
    s.meta.format = 96;
    const m = migrateSave(JSON.parse(JSON.stringify(s)))!;
    expect(m).not.toBeNull();
    expect(m.meta.format).toBe(99);
    expect(m.evolution.collapsedReturns).toBe(2); // 진화(5000) 뒤의 패배 빈사 2건 — 진화 전(4000)·미접속 빈사는 안 셈
    expect(m.evolution.dotKills).toBeUndefined();
    expect(m.evolution.elementAbsorbs).toEqual({ blood: 7 });
    expect(m.build.owned).toEqual(['t-water-a']);
    // 이어서 조건을 채우면 혈로 간다
    m.evolution.elementAbsorbs.blood = 10;
    expect(tier4Normal(m.evolution, ctxOf(m.build)).id).toBe('t4:blood:physical');
  });
  it('형식 96 세이브: 빈사 귀환 기록이 없거나 지금 단계 진화 기록이 없으면 칸을 만들지 않는다(= 0)', () => {
    const s = newSaveData('hollow', 1_000);
    s.runLog.vitals.push({ at: 2_000, factionId: 'hollow', kind: 'collapse', cause: 'defeat', bond: 0 });
    s.meta.format = 96;
    const m = migrateSave(JSON.parse(JSON.stringify(s)))!;
    expect(m.meta.format).toBe(99);
    expect(m.evolution.collapsedReturns).toBeUndefined();
    expect(collapsedReturnsOf(m.evolution)).toBe(0);
  });
  it('원정 중간 저장의 진화 사본도 같이 채운다 (귀환 정산이 사본으로 덮어쓴다)', () => {
    const s = newSaveData('hollow', 1_000);
    Object.assign(s.evolution, { tierIndex: 2, formId: 't3:water', formHistory: ['t2:base', 't3:water'] });
    s.runLog.tiers.evolutions.push({ fromTier: 1, toTier: 2, fromFormId: 't2:base', toFormId: 't3:water', formId: 't3:water', at: 5_000 });
    s.runLog.vitals.push({ at: 6_000, factionId: 'hollow', kind: 'collapse', cause: 'defeat', bond: 0 });
    const raw = JSON.parse(JSON.stringify(s)) as SaveData;
    raw.activeExpedition = { exp: { evolution: JSON.parse(JSON.stringify(s.evolution)) } } as unknown as SaveData['activeExpedition'];
    migrateSpecialPathCounters(raw);
    expect(raw.evolution.collapsedReturns).toBe(1);
    expect((raw.activeExpedition as unknown as { exp: { evolution: EvolutionState } }).exp.evolution.collapsedReturns).toBe(1);
  });
  it('불러올 때 보정: 이상한 값은 버린다', () => {
    const s = newSaveData('hollow', 1_000);
    Object.assign(s.evolution, { collapsedReturns: -3, dotKills: { poison: 2.5, nope: 4, blood: 0, thunder: 2 } });
    const m = migrateSave(JSON.parse(JSON.stringify(s)))!;
    expect(m.evolution.collapsedReturns).toBeUndefined();
    expect(m.evolution.dotKills).toEqual({ thunder: 2 });
  });
});

describe('⑦ 허무형 몸의 가방 블록 이름 = 그 몸의 오리지널 블록 (C.531 남은 것)', () => {
  it('호로 허무·물리(나다) = 적막 블록 · 사신 허무·특수(공화) = 낙화 블록 — 설명도 그 블록 것', () => {
    const hollow = getFaction('hollow');
    const shinigami = getFaction('shinigami');
    expect(traitBlockName(hollow, 't-kyo', 3, 'h4:void')).toBe('적막 블록');
    expect(traitBlockName(shinigami, 't-kyo', 3, 'h4:void')).toBe('낙화 블록');
    expect(originalBlockOf('h4:void', 'hollow', 'kyo')?.name).toBe('적막 블록');
    expect(traitBrief(hollow, 't-kyo', 'h4:void')).toBe(originalBlockOf('h4:void', 'hollow', 'kyo')!.description);
    expect(traitBrief(hollow, 't-kyo', 'h4:void')).not.toMatch(/\{/); // 수치 틀이 채워져 있다
  });
  it('허무형이 아닌 몸·다른 속성 블록은 그대로', () => {
    const hollow = getFaction('hollow');
    expect(traitBlockName(hollow, 't-kyo', 3, 't4:fire:physical')).toBe('허무 블록');
    expect(traitBlockName(hollow, 't-kyo', 3)).toBe('허무 블록');
    expect(traitBlockName(hollow, 't-fire-a', 3, 'h4:void')).toBe(traitBlockName(hollow, 't-fire-a', 3));
    expect(originalBlockOf('h4:void', 'hollow', 'fire')).toBeNull();
    expect(originalBlockOf(null, 'hollow', 'kyo')).toBeNull();
  });
});
