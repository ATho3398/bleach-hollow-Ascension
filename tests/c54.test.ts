// C.54 (S-11, GDD 22-2·22-4·22-5 v5.13): 해방(전투 중 변신)·해방 수련(4종목 미니게임)·혈 흡혈 상한 8%·세이브 형식 18
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { getEnemy } from '../src/data/enemies';
import { FACTIONS, getFaction } from '../src/data/factions';
import { TITLES } from '../src/data/titles';
import { TUTORIAL_GOALS } from '../src/data/tutorials';
import {
  applyInput, buildBattleRecord, canLiberate, createCombat, drainCombatEvents, LIBERATION_GAUGE_MAX, liberationActive, playCombatBot, replayCombat, step, ticksOf,
  type CombatParams, type CombatState,
} from '../src/engine/combat';
import { advance, createExpedition, finishBattle, playExpedition, startBattle } from '../src/engine/expedition';
import { parseFactionConfig } from '../src/engine/faction';
import { canAbsorb } from '../src/engine/absorb';
import {
  addTrainingTicket, applyTraining, beginTraining, createMiniGame, newTrainingState, playMiniGameBot, resetTrainingKeepCompletion, sanitizeTraining, stepMiniGame,
  TRAINING_GAMES, trainingGate, trainingLevel, type DuelState,
} from '../src/engine/training';
import { newNest } from '../src/engine/nest';
import { newEvolution } from '../src/engine/evolution';
import {
  claimTutorialGoals, liberationAccess, migrateSave, newSaveData, recordExpedition, recordTraining, SAVE_FORMAT_VERSION, settleLiberationRisk,
} from '../src/game';
import { findProblems, SHORTCUTS } from '../src/ui/shortcutMap';
import { liberationBlockLabel, liberationButton } from '../src/ui/labels';
import { gameRuleLines, trainingLockedText } from '../src/ui/trainingView';

const LB = BALANCE.provisional.liberation;
const TX = BALANCE.provisional.training;
const CX = BALANCE.provisional.combat;
const normal = getEnemy('test-a');
const mk = (params: Partial<CombatParams> = {}, seed = 1) => createCombat(seed, { enemy: normal, params: { liberationEnabled: true, ...params } });
/** 블록 생성·공허·양쪽 공격이 끼어들지 않게 멈춘 상태 */
const quiet = (s: CombatState) => {
  s.spawnTimers = s.spawnTimers.map(() => 1e9);
  s.voidTimer = 1e9;
  s.enemy.attackTimer = 1e9;
  s.player.attackTimer = 1e9;
  s.enemy.actionTimer = 1e9;
  return s;
};
/** 해방 게이지를 채운 상태 (적 체력은 그대로) */
const charged = (params: Partial<CombatParams> = {}) => {
  const s = quiet(mk(params));
  s.liberation.gauge = LIBERATION_GAUGE_MAX;
  return s;
};
const wait = (s: CombatState, seconds: number) => {
  for (let i = 0; i < ticksOf(s.params, seconds) && s.status === 'playing'; i++) step(s);
};

describe('해방 게이지 (GDD 22-5)', () => {
  it('내가 준 피해로 찬다: 적 최대 체력 40% 를 깎으면 가득', () => {
    const s = mk();
    s.spawnTimers = s.spawnTimers.map(() => 1e9);
    s.voidTimer = 1e9;
    s.enemy.attackTimer = 1e9;
    while (s.enemy.hp > s.enemy.maxHp * 0.8) step(s);
    const dealt = s.enemy.maxHp - s.enemy.hp;
    expect(s.liberation.gauge).toBeCloseTo((dealt / (s.enemy.maxHp * LB.gaugeEnemyHpFraction)) * LIBERATION_GAUGE_MAX, 5);
    expect(canLiberate(s)).toBe(false);
    while (s.enemy.hp > s.enemy.maxHp * (1 - LB.gaugeEnemyHpFraction)) step(s);
    expect(s.liberation.gauge).toBe(LIBERATION_GAUGE_MAX);
    expect(canLiberate(s)).toBe(true);
  });

  it('자격이 없으면(liberationEnabled false) 게이지가 차도 쓸 수 없다', () => {
    const s = charged({ liberationEnabled: false });
    expect(canLiberate(s)).toBe(false);
    expect(applyInput(s, { type: 'liberate' })).toBe(false);
    expect(s.liberation.usedAtTick).toBeNull();
  });
});

describe('해방 효과 (GDD 22-5)', () => {
  it('15초 동안 전 능력치 ×1.3 (체력은 최대 체력과 같이), 끝나면 되돌리고 리스크 +15. 전투당 1회', () => {
    const s = charged();
    const before = { ...s.player.stats };
    const maxHp = s.player.maxHp;
    const hp = s.player.hp;
    expect(applyInput(s, { type: 'liberate' })).toBe(true);
    expect(liberationActive(s)).toBe(true);
    for (const k of Object.keys(before) as (keyof typeof before)[]) expect(s.player.stats[k]).toBeCloseTo(before[k] * LB.statMultiplier, 6);
    expect(s.player.maxHp).toBeCloseTo(maxHp * LB.statMultiplier, 6);
    expect(s.player.hp).toBeCloseTo(hp + maxHp * (LB.statMultiplier - 1), 6);
    expect(s.liberation.risk).toBe(0);
    // 두 번째는 안 된다
    s.liberation.gauge = LIBERATION_GAUGE_MAX;
    expect(applyInput(s, { type: 'liberate' })).toBe(false);
    wait(s, LB.seconds - 0.2);
    expect(liberationActive(s)).toBe(true);
    wait(s, 0.3);
    expect(liberationActive(s)).toBe(false);
    expect(s.player.stats).toEqual(before);
    expect(s.player.maxHp).toBeCloseTo(maxHp, 6);
    expect(s.player.hp).toBeLessThanOrEqual(s.player.maxHp);
    expect(s.liberation.risk).toBe(LB.riskOnEnd);
    expect(drainCombatEvents(s).map((e) => e.kind)).toEqual(expect.arrayContaining(['liberate', 'liberation-end']));
  });

  it('해방하는 순간 블록 바 오른쪽 끝에 해방 블록 2칸, 위력은 기본 블록의 3배(기본 공격 9회분 × 배율)', () => {
    const s = charged();
    applyInput(s, { type: 'liberate' });
    expect(s.tray.map((b) => b.kind)).toEqual(['liberation', 'liberation']);
    expect(s.params.liberationPowerInAttacks).toBe(CX.basicBlockPowerInAttacks * LB.blockPowerMultiplier);
    const hp0 = s.enemy.hp;
    expect(applyInput(s, { type: 'use', cell: 0 })).toBe(true);
    expect(s.enemy.hp).toBeLessThan(hp0);
    const ev = drainCombatEvents(s).find((e) => e.kind === 'block');
    expect(ev && ev.kind === 'block' && ev.block).toBe('liberation');
    expect(s.tray).toHaveLength(1);
  });

  it('바가 가득 차 있으면 오른쪽 끝(가장 최근) 블록이 밀려난다', () => {
    const s = charged();
    s.tray = Array.from({ length: CX.trayCapacity }, (_, i) => ({ uid: 100 + i, kind: 'skill' as const, traitId: 'basic-skill', family: null }));
    applyInput(s, { type: 'liberate' });
    expect(s.tray).toHaveLength(CX.trayCapacity);
    expect(s.tray.slice(-2).map((b) => b.kind)).toEqual(['liberation', 'liberation']);
    expect(s.tray.slice(0, CX.trayCapacity - 2).map((b) => b.uid)).toEqual(Array.from({ length: CX.trayCapacity - 2 }, (_, i) => 100 + i));
  });

  it('해방 중에 전투가 끝나도 풀리며 리스크 +15, 전투 기록에 사용 여부·시각', () => {
    const s = charged();
    wait(s, 2);
    applyInput(s, { type: 'liberate' });
    s.enemy.hp = 1;
    step(s, { type: 'use', cell: 0 });
    expect(s.status).toBe('won');
    expect(s.finisher?.kind).toBe('liberation');
    expect(s.liberation.risk).toBe(LB.riskOnEnd);
    const rec = buildBattleRecord(s, { factionId: 'hollow' });
    expect(rec.liberationUsed).toBe(true);
    expect(rec.liberationAt).toBe(2);
    const plain = buildBattleRecord(mk(), { factionId: 'hollow' });
    expect(plain.liberationUsed).toBe(false);
    expect(plain.liberationAt).toBeNull();
  });

  it('해방 블록 마무리는 우위면 흡수 조건을 채운다 (스킬 블록과 같은 규칙)', () => {
    // test-a = 불 속성 적, 물 캐릭터면 우위
    const s = charged({ playerElements: ['water'], skills: [{ id: 'x', element: 'fire', category: 'mixed', role: 'attack', family: null, powerInAttacks: 1, chainBonus: { kind: 'stagger', value: 1 }, powerMultiplier: 1 }] });
    applyInput(s, { type: 'liberate' });
    s.enemy.hp = 1;
    applyInput(s, { type: 'use', cell: 0 });
    expect(s.finisher?.weak).toBe(true);
    expect(canAbsorb(s)).toBe(true);
  });

  it('같은 시드 + 같은 입력 기록 = 같은 결과 (해방 입력 포함)', () => {
    const play = () => {
      const s = mk({}, 7);
      return playCombatBot(s);
    };
    const a = play();
    expect(a.liberation.usedAtTick).not.toBeNull(); // 봇은 게이지가 차면 바로 쓴다
    const b = replayCombat(7, { enemy: normal, params: { liberationEnabled: true } }, a.inputs);
    expect(b.status).toBe(a.status);
    expect(b.tick).toBe(a.tick);
    expect(b.liberation.usedAtTick).toBe(a.liberation.usedAtTick);
  });

  it('봇: liberate false 면 쓰지 않는다', () => {
    const s = playCombatBot(mk({}, 7), { liberate: false });
    expect(s.liberation.usedAtTick).toBeNull();
  });
});

describe('해방 자격·원정·둥지 (GDD 22-2·22-5)', () => {
  it('자격 = 수련 완료 + 등급 이력 + 지금 5단계 이상. 5단계 미만이면 버튼을 숨긴다', () => {
    const s = newSaveData('hollow', 1);
    expect(liberationAccess(s)).toEqual({ visible: false, usable: false, missing: ['training', 'rank'] });
    s.evolution.tierIndex = 4;
    expect(liberationAccess(s)).toEqual({ visible: true, usable: false, missing: ['training', 'rank'] });
    s.training.completed = true;
    expect(liberationAccess(s).missing).toEqual(['rank']);
    s.rank.history.everRanked = true;
    expect(liberationAccess(s)).toEqual({ visible: true, usable: true, missing: [] });
    s.evolution.tierIndex = 3;
    expect(liberationAccess(s).usable).toBe(false);
  });

  it('잠긴 버튼 한 줄은 무엇이 부족한지 (종족 설정 문구), 5단계 미만이면 버튼 없음', () => {
    const f = getFaction('shinigami');
    expect(liberationButton(f, { visible: false, usable: false, missing: ['training', 'rank'] })).toBeUndefined();
    expect(liberationButton(f, { visible: true, usable: true, missing: [] })).toEqual({ note: null });
    const note = liberationButton(f, { visible: true, usable: false, missing: ['training', 'rank'] })!.note!;
    expect(note).toContain(f.training.title);
    expect(note).toContain(f.rankBattleName);
  });

  it('원정: 자격을 가지고 출발하면 전투에서 쓸 수 있고, 끝나며 오른 리스크가 원정 게이지에 들어간다', () => {
    let used = 0;
    const exp = createExpedition({ factionId: 'hollow', seed: 3, hunger: 20, condition: 80, deck: ['prey-nest-a', 'prey-nest-a', 'prey-nest-b'], liberationEnabled: true });
    playExpedition(exp, {
      returnAfterLap: 1,
      playBattle: (b) => {
        expect(b.params.liberationEnabled).toBe(true);
        playCombatBot(b);
        if (b.liberation.usedAtTick !== null) used++;
      },
    });
    expect(used).toBeGreaterThan(0);
    expect(exp.battles.some((b) => b.liberationUsed)).toBe(true);
    // 자격 없이 출발하면 못 쓴다
    const exp2 = createExpedition({ factionId: 'hollow', seed: 3, hunger: 20, condition: 80, deck: ['prey-nest-a'] });
    let battle: CombatState | null = null;
    while (exp2.phase !== 'battle') {
      advance(exp2);
      if (exp2.phase === 'nest-choice' || exp2.phase === 'ended') break;
    }
    if (exp2.phase === 'battle') {
      battle = startBattle(exp2);
      expect(battle.params.liberationEnabled).toBe(false);
      const risk0 = exp2.risk;
      battle.liberation.risk = LB.riskOnEnd; // 끝난 해방이 있었다고 치고 반영 경로만 본다
      battle.status = 'won';
      battle.finisher = { kind: 'basic-attack', traitId: null, element: null };
      finishBattle(exp2, battle);
      expect(exp2.risk).toBeCloseTo(risk0 + LB.riskOnEnd, 6);
    }
  });

  it('등급전·연습: 끝난 해방의 리스크는 둥지 게이지에 (상한 100)', () => {
    const s = newSaveData('hollow', 1);
    s.nest.risk = 90;
    settleLiberationRisk(s, { liberation: { gauge: 0, usedAtTick: 3, ticksLeft: 0, base: null, risk: 15 } });
    expect(s.nest.risk).toBe(BALANCE.provisional.risk.limit);
  });
});

describe('수련 상태 (GDD 22-4·22-5)', () => {
  it('수련권: 원정 귀환마다 +1(승패 무관), 최대 3', () => {
    const s = newSaveData('hollow', 1);
    expect(s.training.tickets).toBe(0);
    for (let i = 0; i < 4; i++) {
      const exp = playExpedition(createExpedition({ factionId: 'hollow', seed: 10 + i, hunger: 20, condition: 80, deck: ['prey-nest-a'] }), { returnAfterLap: 1 });
      recordExpedition(s, exp, 0);
      expect(s.training.tickets).toBe(Math.min(TX.ticketsMax, i + 1));
    }
    const t = newTrainingState();
    t.tickets = TX.ticketsMax;
    expect(addTrainingTicket(t)).toBe(false);
  });

  it('시작 조건: 5단계 미만 · 수련권 0 · 컨디션 30 미만이면 막힌다', () => {
    const t = newTrainingState();
    expect(trainingGate(t, 3, 80)).toEqual({ ok: false, reason: 'tier' });
    expect(trainingGate(t, 4, 80)).toEqual({ ok: false, reason: 'tickets' });
    t.tickets = 1;
    expect(trainingGate(t, 4, TX.minCondition - 1)).toEqual({ ok: false, reason: 'condition' });
    expect(trainingGate(t, 4, TX.minCondition)).toEqual({ ok: true });
  });

  it('난이도 단계: 종목별 누적 승리 0/3/6/10 → 1~4단계', () => {
    const t = newTrainingState();
    const at = (w: number) => {
      t.wins.duel = w;
      return trainingLevel(t, 'duel');
    };
    expect([0, 2, 3, 5, 6, 9, 10, 30].map(at)).toEqual([1, 1, 2, 2, 3, 3, 4, 4]);
    expect(trainingLevel(t, 'chain')).toBe(1);
  });

  it('한 판 결과: 22-4 표 그대로 (승리 보상·이기든 지든 비용, 패배는 수련치 +1 만)', () => {
    const cases: [string, number, Record<string, number>, { condition: number; hunger: number; risk: number }][] = [
      ['duel', 5, { spr: 2 }, { condition: -10, hunger: 0, risk: 5 }],
      ['dodge', 3, { spd: 3 }, { condition: -15, hunger: 0, risk: 0 }],
      ['clash', 4, { atk: 3 }, { condition: -5, hunger: 15, risk: 0 }],
      ['chain', 3, { hp: 3 }, { condition: 0, hunger: -20, risk: 10 }],
    ];
    for (const [game, points, ev, cost] of cases) {
      const t = newTrainingState();
      t.tickets = 2;
      const nest = { ...newNest(0), hunger: 50, condition: 80, risk: 20 };
      const evo = { ...newEvolution(), tierIndex: 4 };
      expect(beginTraining(t)).toBe(true);
      const out = applyTraining(t, nest, evo, game as never, true, 5);
      expect(out.points).toBe(points);
      expect(out.ev).toEqual(ev);
      expect({ condition: out.condition, hunger: out.hunger, risk: out.risk }).toEqual(cost);
      expect(t.tickets).toBe(1);
      expect(t.wins[game as 'duel']).toBe(1);
      // 패배: 수련치 +1, 노력치 없음, 비용 그대로 (먹이사슬 배부름은 승리 때만)
      const lose = applyTraining(t, nest, evo, game as never, false, 6);
      expect(lose.points).toBe(TX.lossPoints);
      expect(lose.ev).toEqual({});
      expect(lose.condition).toBe(cost.condition);
      expect(lose.risk).toBe(cost.risk);
      expect(lose.hunger).toBe(game === 'chain' ? 0 : cost.hunger);
    }
  });

  it('수련권이 없으면 시작하지 못한다', () => {
    const t = newTrainingState();
    expect(beginTraining(t)).toBe(false);
  });

  it('수련치 60 → 수련 완료(영구): 런 로그·칭호(종족별 이름)·튜토리얼 목표 first-training', () => {
    const s = newSaveData('shinigami', 1);
    s.evolution.tierIndex = 4;
    s.training.points = TX.pointsToComplete - 5;
    const out = recordTraining(s, 'duel', true, 1234);
    expect(out.completedNow).toBe(true);
    expect(s.training.completed).toBe(true);
    expect(s.training.completedAt).toBe(1234);
    expect(s.runLog.trainings.at(-1)).toMatchObject({ game: 'duel', won: true, level: 1, points: 5, completedNow: true, factionId: 'shinigami' });
    expect(s.titles.map((t) => t.titleId)).toContain('training-complete');
    const title = TITLES.find((t) => t.id === 'training-complete')!;
    expect(title.name).toMatchObject({ hollow: '본능 지배', shinigami: '굴복' });
    expect(TUTORIAL_GOALS.find((g) => g.id === 'first-training')?.available).toBe(true);
    expect(claimTutorialGoals(s, 1).map((g) => g.goal.id)).toContain('first-training');
    // 이후 판은 다시 완료로 세지 않는다
    expect(recordTraining(s, 'dodge', true, 2).completedNow).toBe(false);
  });

  it('환생 자리: 완료 여부만 남기고 처음으로 / 저장값 정리', () => {
    const t = { ...newTrainingState(), points: 70, tickets: 3, completed: true, completedAt: 9 };
    t.wins.clash = 4;
    expect(resetTrainingKeepCompletion(t)).toEqual({ ...newTrainingState(), completed: true, completedAt: 9 });
    expect(sanitizeTraining({ points: -3, tickets: 99, wins: { duel: 2.7, bogus: 4 }, completed: 'yes' })).toEqual({ ...newTrainingState(), tickets: TX.ticketsMax, wins: { duel: 2, dodge: 0, clash: 0, chain: 0 } });
    expect(sanitizeTraining(null)).toEqual(newTrainingState());
  });
});

describe('수련 미니게임 4종 (GDD 22-5)', () => {
  it('잘하는 봇은 모든 종목·모든 단계에서 이기고, 아무것도 안 하면 진다', () => {
    for (const g of TRAINING_GAMES) {
      for (let level = 1; level <= 4; level++) {
        const win = playMiniGameBot(createMiniGame(g, level, 11 + level), { reaction: 0.2, mistake: 0, seed: level });
        expect(win.status, `${g} ${level}단계 봇`).toBe('won');
        const idle = createMiniGame(g, level, 11 + level);
        for (let i = 0; i < 2000 && idle.status === 'playing'; i++) stepMiniGame(idle, 0.05, null);
        expect(idle.status, `${g} ${level}단계 입력 없음`).toBe('lost');
      }
    }
  });

  it('한 판 길이: 60초 이하, 본능 대결·탄막은 20초 이상, 먹이사슬은 15초 이상(빨리 모으면 일찍 끝), 칼날 맞대기(5번 시도)는 8초 이상 (잘하는 봇 기준)', () => {
    const least = { duel: 20, dodge: 20, chain: 15, clash: 8 };
    for (const g of TRAINING_GAMES) {
      const s = playMiniGameBot(createMiniGame(g, 1, 5), { reaction: 0.3 });
      expect(s.t, g).toBeGreaterThanOrEqual(least[g]);
      expect(s.t, g).toBeLessThanOrEqual(60);
    }
  });

  it('같은 시드 + 같은 입력 = 같은 결과', () => {
    for (const g of TRAINING_GAMES) {
      const a = playMiniGameBot(createMiniGame(g, 2, 99), { reaction: 0.35, mistake: 0.2, seed: 3 });
      const b = playMiniGameBot(createMiniGame(g, 2, 99), { reaction: 0.35, mistake: 0.2, seed: 3 });
      expect(b).toEqual(a);
    }
  });

  it('본능 대결: 예고 중에 누르면 이르다(놓침), 창 안에서 맞는 방향이면 받아치기, 3단계부터 페이크·4단계 연속 공격', () => {
    const s = createMiniGame('duel', 1, 1) as DuelState;
    while (s.phase !== 'tele') stepMiniGame(s, 0.05);
    stepMiniGame(s, 0.05, { kind: 'duel', dir: s.dir });
    expect(s.misses).toBe(1);
    const phase = () => s.phase as DuelState['phase'];
    while (phase() !== 'window') stepMiniGame(s, 0.05);
    stepMiniGame(s, 0.05, { kind: 'duel', dir: s.dir });
    expect(s.hits).toBe(1);
    // 페이크·연속은 단계 표에서
    expect(TX.duel.fakeChance.slice(0, 2).every((x) => x === 0) && TX.duel.fakeChance[2]! > 0).toBe(true);
    expect(TX.duel.doubleChance.slice(0, 3).every((x) => x === 0) && TX.duel.doubleChance[3]! > 0).toBe(true);
    let fakes = 0;
    const f = createMiniGame('duel', 3, 4) as DuelState;
    for (let i = 0; i < 4000 && f.status === 'playing'; i++) {
      stepMiniGame(f, 0.05, f.phase === 'window' ? { kind: 'duel', dir: f.dir } : null);
      if (f.fake) fakes++;
    }
    expect(fakes).toBeGreaterThan(0);
  });
});

describe('세이브 형식 18 (C.54)', () => {
  it('17 → 18: 수련 상태(0·0·미완료), 수련 기록 빈 목록, 옛 전투 기록은 해방 안 씀', () => {
    const old = JSON.parse(JSON.stringify(newSaveData('hollow', 1))) as Record<string, any>;
    old.meta.format = 17;
    delete old.training;
    delete old.runLog.trainings;
    old.runLog.battles = [{ runId: 1, won: true, enemyClass: 'normal', factionId: 'hollow' }];
    const m = migrateSave(old)!;
    expect(SAVE_FORMAT_VERSION).toBe(18);
    expect(m.meta.format).toBe(18);
    expect(m.training).toEqual(newTrainingState());
    expect(m.runLog.trainings).toEqual([]);
    expect(m.runLog.battles[0]).toMatchObject({ liberationUsed: false, liberationAt: null });
  });
});

describe('종족 설정·표시 (규칙 2: 종족 분기 없음)', () => {
  it('두 종족 모두 해방·수련 문구가 있고 이름이 다르다 (레수렉시온 / 만해, 먹이사슬 / 영자 모으기)', () => {
    const [h, s] = [getFaction('hollow'), getFaction('shinigami')];
    expect(h.liberation.name).toBe('레수렉시온');
    expect(s.liberation.name).toBe('만해');
    expect(h.training.games.chain.name).toBe('먹이사슬');
    expect(s.training.games.chain.name).toBe('영자 모으기');
    expect(s.training.games.chain.predator).toBe('대허');
    for (const f of FACTIONS) for (const g of TRAINING_GAMES) expect(f.training.games[g].name.length).toBeGreaterThan(0);
    expect(() => parseFactionConfig({ ...h, training: { ...h.training, games: { ...h.training.games, duel: { name: '' } } } })).toThrow(/training.games.duel/);
    expect(() => parseFactionConfig({ ...h, liberation: { name: 'x' } })).toThrow(/liberation.cutin/);
  });

  it('5단계 미만 제단 안내 = 종족 5단계 이름, 해방 블록 이름 = 속성_해방', () => {
    expect(trainingLockedText(getFaction('hollow'))).toContain('아란칼');
    expect(trainingLockedText(getFaction('shinigami'))).toContain('수석 대원');
    expect(liberationBlockLabel('hollow', 'fire')).toBe('불_해방');
    expect(liberationBlockLabel('hollow', null)).toBe('해방');
    const lines = gameRuleLines(getFaction('hollow'), 'hollow', 'chain');
    expect(lines.reward).toContain('수련치 +3');
    expect(lines.cost).toContain('+10');
  });

  it('PC 단축키: 전투 R = 해방, 겹침·예약 키 없음', () => {
    expect(SHORTCUTS.battle.KeyR).toBe('liberate');
    expect(findProblems()).toEqual([]);
  });
});

describe('혈 흡혈 상한 (GDD 22-5 v5.13)', () => {
  it('한 전투 흡혈 상한 = 최대 체력의 8%', () => {
    expect(BALANCE.provisional.elements.drainCapFraction).toBe(0.08);
  });
});
