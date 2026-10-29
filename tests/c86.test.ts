// C.86 (S-23, GDD 37장 v5.71): 보스 자유 원정 등장 — 장 보스를 스토리에서 이긴 사냥터에서 4바퀴째부터 바퀴마다 10%, 원정당 1번, 보상·런 로그 source "free"
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { getBoss } from '../src/data/bosses';
import { scaleEnemy } from '../src/data/enemies';
import { chapterContent, groundBossId, STORY_CHAPTERS } from '../src/data/story';
import { step, type CombatState } from '../src/engine/combat';
import { difficultyGoldMultiplier } from '../src/engine/difficulty';
import {
  advance, chooseContinue, enemyScale, chooseRelease, chooseReturn, createExpedition, EXPEDITION_SNAPSHOT_VERSION, finishBattle, finishRest, freeBossCandidate, pendingFreeBoss, restoreExpedition,
  serializeExpedition, startBattle, type ExpeditionState, carryAttackMult,
  lapRewardMult,
} from '../src/engine/expedition';
import { bossesBeaten, newSaveData, recordExpedition, sanitizeDeck } from '../src/game';
import { bossOmenSub } from '../src/ui/bha/expedition';
import { storyResultLines } from '../src/ui/resultView';
import { getFaction } from '../src/data/factions';

const BX = BALANCE.provisional.boss;
const L = BALANCE.expedition.loopTiles;

function freeExp(seed: number, beaten: string[] = ['sand-maw'], o: { groundId?: string; difficulty?: number; streak?: number; factionId?: string } = {}): ExpeditionState {
  const fid = o.factionId ?? 'hollow';
  const save = newSaveData(fid, 1);
  return createExpedition({
    factionId: fid, seed, hunger: 0, condition: 100, deck: sanitizeDeck(save.tiles, fid), build: save.build, evolution: save.evolution, tileVariants: true, maxLaps: 10,
    groundId: o.groundId ?? 'outskirts', difficulty: o.difficulty, streak: o.streak, bossesBeaten: beaten,
  });
}

/** 바퀴만 넘긴다 (전투 없이): 둥지 칸 선택 → 한 바퀴 더. 바퀴 시작 굴림만 본다 */
function skipToLap(e: ExpeditionState, lap: number): void {
  while (e.lap < lap) {
    e.phase = 'nest-choice';
    e.pos = 0;
    chooseContinue(e);
  }
}

/** 보스가 나오는 시드를 찾는다 (lap 10 까지) */
function seedWithBoss(from = 1, beaten = ['sand-maw'], o: Parameters<typeof freeExp>[2] = {}): { seed: number; e: ExpeditionState } {
  for (let seed = from; seed < from + 500; seed++) {
    const e = freeExp(seed, beaten, o);
    skipToLap(e, 10);
    if (e.freeBoss?.appear) return { seed, e: freeExp(seed, beaten, o) };
  }
  throw new Error('보스가 나오는 시드가 없다');
}

function forceBattle(e: ExpeditionState, win: boolean): CombatState {
  const b = startBattle(e);
  if (win) b.enemy.hp = 1e-9;
  else b.player.hp = 1e-9;
  for (let i = 0; i < 400 && b.status === 'playing'; i++) step(b);
  return b;
}

/** 보스가 나온 바퀴까지 넘긴다 */
function toBossLap(e: ExpeditionState): void {
  while (!e.freeBoss!.appear && e.lap < 10) skipToLap(e, e.lap + 1);
}

/** 보스 칸 바로 앞으로 옮겨 한 칸 걷는다 → 보스전 */
function walkIntoBoss(e: ExpeditionState): void {
  toBossLap(e);
  const a = e.freeBoss!.appear!;
  e.queuedBattle = null;
  e.pos = a.cell - 1;
  e.phase = 'moving';
  advance(e);
}

describe('사냥터 ↔ 장 보스 (데이터로 찾는다)', () => {
  it('outskirts = sand-maw, 나머지 사냥터는 그 장 마지막 화 보스(데이터가 없으면 null)', () => {
    expect(groundBossId('hollow', 'outskirts')).toBe('sand-maw');
    expect(groundBossId('shinigami', 'outskirts')).toBe('sand-maw');
    for (const ch of STORY_CHAPTERS) {
      for (const fid of ['hollow', 'shinigami']) {
        const eps = chapterContent(fid, ch.id)?.episodes ?? [];
        const want = eps[eps.length - 1]?.boss?.id ?? null;
        expect(groundBossId(fid, ch.groundId)).toBe(want);
        if (want) expect(getBoss(want).id).toBe(want);
      }
    }
  });
});

describe('등장 조건 (GDD 37장 1·2번)', () => {
  it('스토리에서 이기기 전에는 안 나온다 (10바퀴 × 300판)', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const e = freeExp(seed, []);
      expect(freeBossCandidate(e)).toBeNull();
      skipToLap(e, 10);
      expect(e.freeBoss!.appear).toBeNull();
    }
  });

  it('다른 사냥터 보스만 이겼으면 안 나온다', () => {
    const e = freeExp(1, ['sand-maw'], { groundId: 'canyon' });
    expect(freeBossCandidate(e)).toBe(groundBossId('hollow', 'canyon') === 'sand-maw' ? 'sand-maw' : null);
  });

  it('이긴 뒤: 4바퀴 전에는 안 나오고, 원정당 최대 1번, 바퀴당 약 10%', () => {
    let rolls = 0;
    let hits = 0;
    for (let seed = 1; seed <= 2000; seed++) {
      const e = freeExp(seed);
      expect(freeBossCandidate(e)).toBe('sand-maw');
      skipToLap(e, 3);
      expect(e.freeBoss!.appear).toBeNull();
      let first: number | null = null;
      for (let lap = 4; lap <= 10; lap++) {
        skipToLap(e, lap);
        if (first === null) {
          rolls++;
          if (e.freeBoss!.appear) {
            hits++;
            first = e.freeBoss!.appear.lap;
          }
        }
      }
      if (first !== null) expect(e.freeBoss!.appear!.lap).toBe(first); // 한 번 나오면 그대로
    }
    expect(hits / rolls).toBeGreaterThan(BX.freeChance - 0.02);
    expect(hits / rolls).toBeLessThan(BX.freeChance + 0.02);
  });

  it('스토리 화에는 자유 원정 보스가 없다', () => {
    const save = newSaveData('hollow', 1);
    const e = createExpedition({ factionId: 'hollow', seed: 3, hunger: 0, condition: 100, deck: [], build: save.build, evolution: save.evolution, story: { chapterId: 'ch1', episodeId: 'ep2' }, bossesBeaten: ['sand-maw'] });
    expect(e.freeBoss).toBeNull();
  });

  it('보스 칸 = 그 바퀴 길의 강적 소굴 한 칸, 없으면 둥지 앞 칸(바퀴 마지막 칸)', () => {
    const { e } = seedWithBoss();
    e.slots[5] = 'elite-den-a';
    toBossLap(e);
    expect(e.freeBoss!.appear!.cell).toBe(5);
    const { e: e2 } = seedWithBoss();
    toBossLap(e2);
    expect(e2.freeBoss!.appear!.cell).toBe(L - 1);
    expect(e2.wildCells).not.toContain(L - 1);
  });

  it('세이브: 보스 도감에 처치가 있는 보스만 bossesBeaten', () => {
    const s = newSaveData('hollow', 1);
    expect(bossesBeaten(s)).toEqual([]);
    s.bossDex['sand-maw'] = { kills: 1, firstAt: 5 };
    expect(bossesBeaten(s)).toEqual(['sand-maw']);
  });
});

describe('보스전·보상·런 로그 (GDD 37장 3~6번)', () => {
  it('보스 칸에서 보스전: 원정 ★·연속 배율, 바퀴 강화 없음, 걷기 배너 "보스 기척"', () => {
    const { e } = seedWithBoss(1, ['sand-maw'], { difficulty: 3, streak: 2 });
    const probe = structuredClone(e);
    skipToLap(probe, 10);
    const a = probe.freeBoss!.appear!;
    skipToLap(e, a.lap);
    expect(a.lap).toBeGreaterThanOrEqual(BX.freeFromLap);
    expect(pendingFreeBoss(e)).toEqual({ bossId: 'sand-maw', cell: a.cell });
    expect(bossOmenSub(a.cell, 0, null)).toBe(`${a.cell}번 칸 · ${a.cell}칸 앞`);
    expect(bossOmenSub(5, 5, '강적 소굴')).toBe('5번 칸 · 강적 소굴 · 지금 이 칸');
    walkIntoBoss(e);
    expect(e.phase).toBe('battle');
    expect(e.pending!.boss).toBe('sand-maw');
    expect(startBattle(e).boss).toBeTruthy();
    const want = scaleEnemy(getBoss('sand-maw').enemy, enemyScale(1, 'outskirts', 3, 2, 'normal'));
    expect(e.pending!.enemy.hpInAttacks).toBeCloseTo(want.hpInAttacks, 9);
    expect(e.pending!.enemy.attackInAttacks).toBeCloseTo(want.attackInAttacks * carryAttackMult(3), 9); // C.193 원정 체력 이어 가기 보정 (GDD 119장 1)
  });

  it('이기면 골드 100 × 골드 배율 · 잔치 1 · 보스 특성 확정 첫 후보 → 도감 +1 · 런 로그 source free · 영옥 없음', () => {
    const { e } = seedWithBoss(1, ['sand-maw'], { difficulty: 2, streak: 3 });
    walkIntoBoss(e);
    const gold0 = e.goldLoot.length;
    finishBattle(e, forceBattle(e, true));
    expect(e.freeBoss!.result!.won).toBe(true);
    expect(e.goldLoot.slice(gold0)).toEqual([{ amount: Math.round(Math.round(BX.reward.gold * difficultyGoldMultiplier(2, 3)) * lapRewardMult(e.lap)), lap: e.lap }]); // 이어하기 보상 배율 (121장 5)
    expect(e.foodLoot.at(-1)).toEqual({ food: BX.reward.food, lap: e.lap });
    expect(e.phase).toBe('absorb');
    expect(e.absorbOffer!.candidates[0]).toBe(getBoss('sand-maw').trait);
    expect(pendingFreeBoss(e)).toBeNull();
    chooseRelease(e);
    // 같은 바퀴에 다시 나오지 않는다
    e.pos = e.freeBoss!.appear!.cell - 1;
    advance(e);
    expect(e.pending?.boss ?? null).toBeNull();
    // 둥지로 돌아와 귀환
    while (e.phase !== 'nest-choice' && e.phase !== 'ended') {
      if (e.phase === 'battle') finishBattle(e, forceBattle(e, true));
      else if (e.phase === 'absorb') chooseRelease(e);
      else if (e.phase === 'rest') finishRest(e);
      else if (e.phase === 'event') e.phase = 'moving';
      else advance(e);
    }
    if (e.phase === 'nest-choice') chooseReturn(e);
    const s = newSaveData('hollow', 1);
    s.bossDex['sand-maw'] = { kills: 1, firstAt: 7 };
    const jade0 = s.shared.jade;
    recordExpedition(s, e, 9000);
    expect(s.bossDex['sand-maw']).toEqual({ kills: 2, firstAt: 7 });
    expect(s.shared.jade).toBe(jade0);
    const rec = s.runLog.bossBattles.at(-1)!;
    expect(rec).toMatchObject({ bossId: 'sand-maw', won: true, firstKill: false, source: 'free', difficulty: 2, episode: null });
    expect(storyResultLines(e, getFaction('hollow'))[0]).toContain('자유 원정 보스');
  });

  it('지면 원정 패배와 같다 (마지막 바퀴 전리품을 잃는다), 런 로그 won false', () => {
    const { e } = seedWithBoss(7);
    walkIntoBoss(e);
    e.foodLoot.push({ food: 'snack', lap: e.lap });
    finishBattle(e, forceBattle(e, false));
    expect(e.outcome).toBe('defeated');
    expect(e.freeBoss!.result!.won).toBe(false);
    const s = newSaveData('hollow', 1);
    s.bossDex['sand-maw'] = { kills: 1, firstAt: 7 };
    recordExpedition(s, e, 9000);
    expect(s.bossDex['sand-maw']!.kills).toBe(1);
    expect(s.runLog.bossBattles.at(-1)).toMatchObject({ won: false, source: 'free' });
  });
});

describe('원정 중간 저장 (형식 8)', () => {
  it('보스 등장·대기 왕복, 형식 7 은 freeBoss 없음으로 이어한다', () => {
    expect(EXPEDITION_SNAPSHOT_VERSION).toBeGreaterThanOrEqual(8);
    const { e } = seedWithBoss();
    walkIntoBoss(e);
    const r = restoreExpedition(serializeExpedition(e, 1, 5));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.exp.freeBoss).toEqual(e.freeBoss);
      expect(r.exp.pending!.boss).toBe('sand-maw');
    }
    const old = serializeExpedition(freeExp(2), 1, 5)! as unknown as { version: number; exp: Record<string, unknown> };
    old.version = 7;
    delete old.exp.freeBoss;
    const r7 = restoreExpedition(old);
    expect(r7.ok).toBe(true);
    if (r7.ok) expect(r7.exp.freeBoss).toBeNull();
    const bad = serializeExpedition(e, 1, 5)! as unknown as { exp: { freeBoss: { appear: { bossId: string } } } };
    bad.exp.freeBoss.appear.bossId = 'nobody';
    expect(restoreExpedition(bad).ok).toBe(false);
  });
});
