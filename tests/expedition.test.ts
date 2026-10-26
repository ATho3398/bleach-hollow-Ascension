import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { getFaction } from '../src/data/factions';
import { TERRAIN_TILES, tileName, tilesFor } from '../src/data/tiles';
import {
  advance, chooseContinue, chooseReturn, createExpedition, finishBattle, finishRest, placeTile, plannedBattles,
  playExpedition, startBattle, summarize, buildRunRecord, type ExpeditionState,
  chooseRelease,
} from '../src/engine/expedition';
import { applyAbsenceHunger, doNestAction, newNest } from '../src/engine/nest';
import { createCombat } from '../src/engine/combat';
import { getEnemy } from '../src/data/enemies';
import { loadSave, migrateSave, newSaveData, newTileStock, nextRunId, recordExpedition, SAVE_FORMAT_VERSION, writeSave } from '../src/game';
import { emptyRunLog } from '../src/engine/runLog';
import { useLegacyMigrations } from './helpers/legacyGate';

useLegacyMigrations(); // 옛 형식 마이그레이션 시험 (C.120, GDD 61장)

const DECK = ['prey-nest-a', 'prey-nest-a', 'elite-den-a', 'env-fog', 'rest-a', 'prey-nest-b', 'env-ruin', 'elite-den-b'];
const mk = (over: Partial<Parameters<typeof createExpedition>[0]> = {}) =>
  createExpedition({ factionId: 'hollow', seed: 1, hunger: 10, condition: 100, deck: DECK, ...over });

/** 전투를 이긴 것으로 치고(첫 수로 이기는 대신 적 체력을 깎아 두고 승리 처리) 끝낸다 */
function winBattle(exp: ExpeditionState): void {
  const b = startBattle(exp);
  b.enemy.hp = 0;
  b.status = 'won';
  b.params = { ...b.params, skills: [{ id: 't-fire-a', element: 'fire', category: 'physical', role: 'attack', powerInAttacks: 1, chainBonus: { kind: 'stagger', value: 1 }, powerMultiplier: 1 }] };
  finishBattle(exp, b);
  // C.125 (GDD 71장): 이기면 늘 흡수 화면 — 옛 '조건 미달 → 그대로 이동' 대신 놓아준다
  if (exp.phase === 'absorb') chooseRelease(exp);
}
function loseBattle(exp: ExpeditionState): void {
  const b = startBattle(exp);
  b.player.hp = 0;
  b.status = 'lost';
  b.lossReason = 'hp';
  finishBattle(exp, b);
}

function walkToStop(exp: ExpeditionState): void {
  while ((exp.phase as string) === 'moving') advance(exp);
}

/** 한 바퀴를 돈다 (전투는 모두 승리). 둥지 칸에서 멈춘다 */
function runLap(exp: ExpeditionState): number {
  let battles = 0;
  for (let i = 0; i < 200 && exp.phase !== 'nest-choice' && exp.phase !== 'ended'; i++) {
    if (exp.phase === 'moving') advance(exp);
    else if (exp.phase === 'battle') {
      winBattle(exp);
      battles++;
    } else if (exp.phase === 'rest') finishRest(exp);
  }
  return battles;
}

describe('원정 순환', () => {
  it('12칸 원형 길: 12번 이동하면 둥지 칸으로 돌아오고 바퀴가 끝난다', () => {
    const exp = mk({ seed: 3 });
    expect(exp.slots).toHaveLength(12);
    const visited: number[] = [];
    while (exp.phase !== 'nest-choice') {
      if (exp.phase === 'moving') {
        advance(exp);
        visited.push(exp.pos);
      } else if (exp.phase === 'battle') winBattle(exp);
    }
    expect(visited).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 0]);
    expect(exp.lapsCompleted).toBe(1);
    expect(exp.elapsedSeconds).toBe(12 * BALANCE.expedition.secondsPerTile);
  });

  it('바퀴당 전투 횟수: 1바퀴 2회 → 2바퀴 3회 → 3바퀴 이후 4회', () => {
    expect([1, 2, 3, 4, 5, 6].map(plannedBattles)).toEqual([2, 3, 4, 4, 4, 4]);
    const exp = mk({ seed: 5 });
    const counts: number[] = [];
    for (let lap = 1; lap <= 5; lap++) {
      counts.push(runLap(exp));
      if (lap < 5) chooseContinue(exp);
    }
    expect(counts).toEqual([2, 3, 4, 4, 4]);
    expect(exp.battlesByLap).toEqual([2, 3, 4, 4, 4]);
  });

  it('강적은 바퀴당 최대 1마리 (타일로 강적을 여러 개 놓아도)', () => {
    const exp = mk({ seed: 8, deck: ['elite-den-a'] });
    runLap(exp);
    chooseContinue(exp);
    // 강적 소굴을 앞쪽 4칸에 놓는다
    exp.hand = ['elite-den-a', 'elite-den-a', 'elite-den-a', 'elite-den-a'];
    for (let c = 1; c <= 4; c++) expect(placeTile(exp, 'elite-den-a', c).ok).toBe(true);
    const elites: boolean[] = [];
    while (exp.phase !== 'nest-choice') {
      if (exp.phase === 'moving') advance(exp);
      else if (exp.phase === 'battle') {
        elites.push(exp.pending!.elite);
        winBattle(exp);
      }
    }
    expect(elites.filter(Boolean)).toHaveLength(1);
    expect(elites.length).toBeGreaterThanOrEqual(4);
  });

  it('최대 6바퀴: 6바퀴를 마치면 귀환 선택 없이 끝난다', () => {
    const exp = mk({ seed: 2, hunger: 0 });
    for (let lap = 1; lap < 6; lap++) {
      runLap(exp);
      expect(exp.phase).toBe('nest-choice');
      chooseContinue(exp);
    }
    runLap(exp);
    // 6바퀴째는 허기가 급상승해 탈진할 수도 있어 둘 중 하나로 끝나야 한다
    expect(exp.phase).toBe('ended');
    expect(['forced-max-laps', 'exhausted']).toContain(exp.endReason);
  });

  it('둥지 칸에서 귀환하면 획득물이 전부 보존된다', () => {
    const exp = mk({ seed: 4 });
    runLap(exp);
    chooseContinue(exp);
    runLap(exp);
    chooseReturn(exp);
    const s = summarize(exp);
    expect(s.outcome).toBe('returned');
    expect(s.lost).toEqual([]);
    expect(s.kept).toHaveLength(exp.acquired.length);
    expect(s.laps).toBe(2);
    expect(exp.acquired.length).toBeGreaterThanOrEqual(4);
  });

  it('바퀴당 타일 획득은 2~3장', () => {
    const exp = mk({ seed: 6 });
    for (let lap = 1; lap <= 4; lap++) {
      runLap(exp);
      const n = exp.acquired.filter((a) => a.lap === lap).length;
      expect(n).toBeGreaterThanOrEqual(BALANCE.expedition.tilesPerLap.min);
      expect(n).toBeLessThanOrEqual(BALANCE.expedition.tilesPerLap.max);
      chooseContinue(exp);
    }
  });
});

describe('패배', () => {
  it('패배하면 마지막 바퀴에서 얻은 것만 잃고 앞 바퀴 획득물은 남는다', () => {
    const exp = mk({ seed: 9 });
    runLap(exp);
    chooseContinue(exp);
    runLap(exp);
    chooseContinue(exp); // 3바퀴째
    walkToStop(exp);
    expect(exp.phase).toBe('battle');
    winBattle(exp); // 3바퀴 첫 승리로 타일 획득
    walkToStop(exp);
    expect(exp.phase).toBe('battle');
    loseBattle(exp);
    expect(exp.phase).toBe('ended');
    const s = summarize(exp);
    expect(s.outcome).toBe('defeated');
    const lap3 = exp.acquired.filter((a) => a.lap === 3).map((a) => a.tileId);
    expect(lap3.length).toBeGreaterThan(0);
    expect(s.lost).toEqual(lap3);
    expect(s.kept).toEqual(exp.acquired.filter((a) => a.lap < 3).map((a) => a.tileId));
    expect(s.laps).toBe(3);
    expect(exp.endReason).toBe('battle-lost');
  });

  it('패배는 사망이 아니다: 둥지로 돌아오고 쇠약 상태가 되며 재우기로 풀린다', () => {
    const save = newSaveData('hollow', 0);
    const exp = mk({ seed: 10, runId: nextRunId(save) });
    walkToStop(exp);
    loseBattle(exp);
    recordExpedition(save, exp, 1000);
    expect(save.nest.weakened).toBe(true);
    expect(save.nest.condition).toBeLessThanOrEqual(BALANCE.provisional.nest.defeatCondition);
    doNestAction(save.nest, 'sleep');
    expect(save.nest.weakened).toBe(false);
    expect(save.runLog.runs[0]).toMatchObject({ runId: 1, outcome: 'defeated', endReason: 'battle-lost', factionId: 'hollow' });
    expect(save.runLog.battles[0]).toMatchObject({ lap: 1, runId: 1, won: false });
  });
});

describe('허기', () => {
  it('6바퀴째부터 허기가 급상승한다', () => {
    const per = (lap: number) => {
      const e = mk({ hunger: 0 });
      e.lap = lap;
      advance(e);
      return e.hunger;
    };
    expect(per(1)).toBeCloseTo(BALANCE.provisional.expedition.hungerPerTile);
    expect(per(5)).toBeCloseTo(BALANCE.provisional.expedition.hungerPerTile);
    expect(per(6)).toBeCloseTo(BALANCE.provisional.expedition.hungerPerTileSpike);
    expect(per(6)).toBeGreaterThan(per(5) * 5);
  });

  it('허기가 가득 차면 탈진해 패배 처리된다 (마지막 바퀴 획득물 상실)', () => {
    const exp = mk({ hunger: 99.9 });
    advance(exp);
    expect(exp.phase).toBe('ended');
    expect(exp.endReason).toBe('exhausted');
    expect(summarize(exp).outcome).toBe('defeated');
  });

  it('휴식 타일은 허기·컨디션을 회복하고 시간을 쓴다', () => {
    const exp = mk({ hunger: 60, condition: 40, seed: 12 });
    exp.hand = ['rest-a'];
    expect(placeTile(exp, 'rest-a', 1).ok).toBe(true);
    advance(exp);
    expect(exp.phase).toBe('rest');
    const before = { h: exp.hunger, c: exp.condition, t: exp.elapsedSeconds };
    finishRest(exp);
    expect(exp.hunger).toBeCloseTo(before.h - BALANCE.provisional.expedition.restHunger);
    expect(exp.condition).toBe(before.c + BALANCE.provisional.expedition.restCondition);
    expect(exp.elapsedSeconds).toBeGreaterThan(before.t);
    expect(exp.phase).toBe('moving');
  });

  it('길이 강해진다: 바퀴가 오를수록 적 체력·공격 배율이 커진다', () => {
    const grab = (lap: number) => {
      const e = mk({ seed: 20 });
      e.lap = lap;
      e.wildCells = [1];
      advance(e);
      return e.pending!.enemy;
    };
    // 바퀴마다 출현 풀이 달라 적 종류가 바뀔 수 있으므로, 각자 원본 데이터 대비 배율로 본다 (C.47: 적 수가 늘어 같은 시드에도 다른 적이 나온다)
    const a = grab(1);
    const b = grab(4);
    expect(a.hpInAttacks).toBeCloseTo(getEnemy(a.id).hpInAttacks);
    expect(b.hpInAttacks).toBeGreaterThan(getEnemy(b.id).hpInAttacks);
    expect(b.attackInAttacks).toBeGreaterThan(getEnemy(b.id).attackInAttacks);
  });
});

describe('타일 배치', () => {
  const withHand = (...ids: string[]) => {
    const e = mk({ seed: 30 });
    e.hand = ids;
    return e;
  };

  it('손에 든(원정 중 획득한) 타일만 앞쪽 빈 칸에 놓을 수 있다', () => {
    const e = withHand('prey-nest-a');
    expect(placeTile(e, 'elite-den-a', 3)).toMatchObject({ ok: false });
    expect(placeTile(e, 'prey-nest-a', 0)).toMatchObject({ ok: false });
    expect(placeTile(e, 'prey-nest-a', 12)).toMatchObject({ ok: false });
    expect(placeTile(e, 'prey-nest-a', 3)).toEqual({ ok: true });
    expect(e.slots[3]).toBe('prey-nest-a');
    expect(e.hand).toEqual([]);
  });

  it('이미 타일이 있는 칸, 지나간 칸에는 놓을 수 없다', () => {
    const e = withHand('prey-nest-a', 'prey-nest-a', 'prey-nest-a');
    expect(placeTile(e, 'prey-nest-a', 5).ok).toBe(true);
    expect(placeTile(e, 'prey-nest-a', 5)).toMatchObject({ ok: false });
    e.pos = 6;
    expect(placeTile(e, 'prey-nest-a', 4)).toMatchObject({ ok: false });
    expect(placeTile(e, 'prey-nest-a', 6)).toMatchObject({ ok: false });
    expect(placeTile(e, 'prey-nest-a', 7).ok).toBe(true);
  });

  it('전투·휴식 진행 중에는 놓을 수 없다', () => {
    const e = withHand('prey-nest-a');
    e.phase = 'battle';
    expect(placeTile(e, 'prey-nest-a', 5)).toMatchObject({ ok: false });
    e.phase = 'rest';
    expect(placeTile(e, 'prey-nest-a', 5)).toMatchObject({ ok: false });
    e.phase = 'nest-choice';
    expect(placeTile(e, 'prey-nest-a', 5).ok).toBe(true);
  });

  it('한 번 놓은 타일은 다음 바퀴에도 유지되어 매 바퀴 전투를 일으킨다', () => {
    const e = mk({ seed: 31 });
    e.hand = ['prey-nest-a'];
    placeTile(e, 'prey-nest-a', 7);
    runLap(e);
    expect(e.slots[7]).toBe('prey-nest-a');
    chooseContinue(e);
    expect(e.slots[7]).toBe('prey-nest-a');
    let hit7 = false;
    while (e.phase !== 'nest-choice') {
      if (e.phase === 'moving') advance(e);
      else if (e.phase === 'battle') {
        if (e.pending!.cell === 7) hit7 = true;
        winBattle(e);
      }
    }
    expect(hit7).toBe(true);
  });

  it('놓은 타일 수에 따라 바퀴당 전투가 는다', () => {
    const base = mk({ seed: 32 });
    const more = mk({ seed: 32 });
    more.hand = ['prey-nest-a', 'prey-nest-b', 'env-fog'];
    placeTile(more, 'prey-nest-a', 2);
    placeTile(more, 'prey-nest-b', 6);
    placeTile(more, 'env-fog', 10);
    expect(runLap(more)).toBeGreaterThan(runLap(base));
  });

  it('같은 둥지 타일 3칸이 인접하면 조합 효과로 강적 1마리가 확정 출현한다', () => {
    const e = mk({ seed: 33 });
    e.hand = ['prey-nest-a', 'prey-nest-b', 'prey-nest-a'];
    placeTile(e, 'prey-nest-a', 4);
    placeTile(e, 'prey-nest-b', 5);
    placeTile(e, 'prey-nest-a', 6);
    const seen: { cell: number; elite: boolean; combo: boolean }[] = [];
    while (e.phase !== 'nest-choice') {
      if (e.phase === 'moving') advance(e);
      else if (e.phase === 'battle') {
        seen.push({ cell: e.pending!.cell, elite: e.pending!.elite, combo: e.pending!.combo });
        winBattle(e);
      }
    }
    expect(seen.find((x) => x.cell === 6)).toMatchObject({ elite: true, combo: true });
    expect(seen.find((x) => x.cell === 4)).toMatchObject({ elite: false });
  });

  it('환경 타일 4종은 새 전투 조건을 바꾼다: 안개=트레이 섞임, 황무지=공격 ×1.3, 결계=받는 피해 경감, 폐가=공허 블록 증가', () => {
    const run = (tile: string) => {
      const e = mk({ seed: 34, condition: 100 });
      e.hand = [tile];
      placeTile(e, tile, 1);
      advance(e);
      expect(e.pending!.tileId).toBe(tile);
      return startBattle(e).params;
    };
    const T = BALANCE.provisional.tiles;
    const base = run('prey-nest-a');
    expect(run('env-fog').trayShuffleSeconds).toBe(T.reshuffle.trayShuffleSeconds);
    expect(run('env-wasteland').playerPowerMultiplier).toBeCloseTo(T.power.playerPowerMultiplier);
    expect(run('env-barrier').damageTakenMultiplier).toBeCloseTo(T.shield.damageTakenMultiplier);
    expect(run('env-ruin').voidChanceBonus).toBeCloseTo(base.voidChanceBonus + T.void.voidChanceBonus);
    expect(base.trayShuffleSeconds).toBe(0);
    expect(base.playerPowerMultiplier).toBe(1);
    expect(base.damageTakenMultiplier).toBe(1);
  });
});

describe('컨디션과 둥지', () => {
  it('컨디션이 나쁘면 전투의 공허 블록 생성 확률 가산이 붙는다', () => {
    const grab = (condition: number) => {
      const e = mk({ seed: 40, condition });
      e.wildCells = [1];
      advance(e);
      return startBattle(e).params.voidChanceBonus;
    };
    expect(grab(100)).toBe(0);
    expect(grab(20)).toBeGreaterThan(grab(80));
    expect(grab(0)).toBeCloseTo(BALANCE.provisional.expedition.conditionRiskBonusMax);
  });

  it('행동 3개가 허기·컨디션을 바꾸고, 방치하면 허기가 오르되 상한이 있다', () => {
    const n = newNest(0);
    n.hunger = 80;
    n.condition = 40;
    doNestAction(n, 'feed');
    expect(n.hunger).toBe(80 - BALANCE.provisional.nest.feedHunger);
    doNestAction(n, 'sleep');
    expect(n.condition).toBe(40 + BALANCE.provisional.nest.sleepCondition);
    doNestAction(n, 'pet');
    expect(n.condition).toBe(70 + BALANCE.provisional.nest.petCondition);
    // 꺼 둔 동안 허기 (GDD 24-1): 아무리 오래 비워도 한 번에 +idleHungerMaxGain, 100 을 넘지 않는다
    const before = n.hunger;
    applyAbsenceHunger(n, 0, 3_600_000 * 1000);
    expect(n.hunger).toBe(Math.min(100, before + BALANCE.provisional.nest.idleHungerMaxGain));
    expect(n.hunger).toBeLessThanOrEqual(100);
  });

  it('귀환 후 둥지 상태가 원정에서 남은 값으로 갱신되고 보존 타일이 보유에 더해진다', () => {
    const save = newSaveData('hollow', 0);
    const before = save.tiles.collection['prey-nest-a'] ?? 0;
    const exp = mk({ seed: 41, deck: ['prey-nest-a'], runId: nextRunId(save) });
    runLap(exp);
    chooseReturn(exp);
    recordExpedition(save, exp, 5);
    expect(save.nest.hunger).toBe(exp.hunger);
    expect(save.nest.weakened).toBe(false);
    expect(save.tiles.collection['prey-nest-a']).toBe(before + exp.acquired.length);
    expect(save.runLog.runs).toHaveLength(1);
    expect(save.runLog.runs[0]).toMatchObject({ outcome: 'returned', laps: 1, endReason: 'returned' });
    expect(save.runLog.battles.every((b) => b.lap === 1 && b.runId === 1)).toBe(true);
  });
});

describe('시드 결정성', () => {
  it('같은 시드 = 같은 원정 (자동 플레이 결과가 완전히 같다)', () => {
    const a = playExpedition(mk({ seed: 77 }), { returnAfterLap: 3 });
    const b = playExpedition(mk({ seed: 77 }), { returnAfterLap: 3 });
    expect(b).toEqual(a);
    expect(a.outcome).not.toBeNull();
    const c = playExpedition(mk({ seed: 78 }), { returnAfterLap: 3 });
    expect(c.battles.map((x) => x.seed)).not.toEqual(a.battles.map((x) => x.seed));
  });

  it('전투 기록의 lap 이 실제 바퀴 수로 채워진다', () => {
    const e = playExpedition(mk({ seed: 81 }), { returnAfterLap: 3 }); // C.147: 94장 B 로 흡수 결과가 바뀌어 3바퀴까지 사는 시드로 (82 → 81)
    expect(new Set(e.battles.map((b) => b.lap))).toEqual(new Set([1, 2, 3]));
    expect(e.battles.length).toBe(e.battlesByLap.reduce((x, y) => x + y, 0));
    expect(buildRunRecord(e).laps).toBe(3);
  });

  it('원정 전투는 전투 엔진 v2 그대로다: 원정 전투 상태는 createCombat 결과와 같다', () => {
    const e = mk({ seed: 80 });
    e.wildCells = [1];
    advance(e);
    const p = e.pending!;
    expect(startBattle(e)).toEqual(createCombat(p.seed, { enemy: p.enemy, params: p.params }));
    expect(getEnemy(p.enemy.id)).toBeDefined();
  });
});

describe('종족 설정만 바꿔도 이름이 바뀐다 (타일·둥지)', () => {
  it('타일 스킨 이름은 GDD 6장 표 그대로, 종족에 없는 스킨은 쓰지 않는다', () => {
    expect(tileName('prey-nest-a', 'hollow')).toBe('떠도는 영혼');
    expect(tileName('prey-nest-a', 'shinigami')).toBe('하급 호로 출몰지');
    expect(tileName('elite-den-a', 'shinigami')).toBe('메노스 출현 지점');
    expect(tileName('env-fog', 'hollow')).toBe('안개');
    expect(tileName('env-barrier', 'shinigami')).toBe('결계');
    expect(tileName('rest-a', 'shinigami')).toBe('전령신기 보급소');
    const hollow = tilesFor('hollow').map((t) => t.id);
    const shin = tilesFor('shinigami').map((t) => t.id);
    expect(hollow).toContain('env-wasteland');
    expect(hollow).not.toContain('env-ruin');
    expect(shin).toContain('env-ruin');
    expect(shin).not.toContain('env-fog');
    expect(TERRAIN_TILES.every((t) => t.provisional === true)).toBe(true);
    expect(tilesFor('quincy')).toEqual([]);
  });

  it('둥지 행동 이름은 종족 설정에서 나온다', () => {
    expect(getFaction('hollow').nestActions).toEqual({ feed: '먹이 주기', sleep: '재우기', pet: '교감' });
    expect(getFaction('shinigami').nestActions.pet).toBe('참백도 손질');
    expect(getFaction('hollow').nestName).toBe('둥지');
    expect(getFaction('shinigami').nestName).toBe('대원실');
  });
});

describe('저장', () => {
  it('원정 결과가 포함된 세이브를 저장하고 불러온다', () => {
    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    const save = newSaveData('shinigami', 0);
    recordExpedition(save, playExpedition(mk({ seed: 90, factionId: 'shinigami', runId: 1 }), { returnAfterLap: 2 }), 10);
    writeSave(storage, save);
    expect(loadSave(storage)).toEqual(save);
  });

  it('형식 2 세이브가 열린다 (둥지·타일 보유 추가)', () => {
    const old = { meta: { format: 2, balanceVersion: 4, startPatch: 'C.3' }, factionId: 'hollow', runLog: emptyRunLog() };
    const m = migrateSave(old)!;
    expect(m.meta.format).toBe(SAVE_FORMAT_VERSION);
    expect(m.nest.hunger).toBe(BALANCE.provisional.nest.startHunger);
    expect(m.tiles).toEqual(newTileStock()); // C.120 (GDD 64장): 새 타일 보유는 0장·잠김
  });
});
