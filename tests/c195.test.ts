// C.195 (GDD 121장 4~8·11): 타일 지급 개편(영구·임시) · 이어하기 배율 · 사냥 힐 바퀴별 축소 · 첫 강공격 = 막기 게이지 첫 가득 뒤
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import {
  abortExpedition, advance, buildRunRecord, carryAttackMult, chooseContinue, chooseDraft, chooseRelease, chooseReturn, createExpedition, finishBattle, finishRest, hpFractionOf,
  isTempCell, lapRewardMult, lapScale, placeTile, startBattle, summarize, swapTiles, tempHandCount, unplaceTile, winHealOf, type ExpeditionState,
} from '../src/engine/expedition';
import { newSaveData, recordExpedition } from '../src/game';
import { getEnemy } from '../src/data/enemies';

const PX = BALANCE.provisional.expedition;
const DECK = ['prey-nest-a', 'prey-nest-a', 'elite-den-a', 'env-fog', 'rest-a', 'prey-nest-b', 'env-ruin', 'elite-den-b'];
const mk = (over: Partial<Parameters<typeof createExpedition>[0]> = {}) =>
  createExpedition({ factionId: 'hollow', seed: 1, hunger: 10, condition: 100, deck: DECK, ...over });

function winBattle(exp: ExpeditionState, endHp?: number): void {
  const b = startBattle(exp);
  b.enemy.hp = 0;
  b.status = 'won';
  if (endHp !== undefined) b.player.hp = b.player.maxHp * endHp;
  finishBattle(exp, b);
  if (exp.phase === 'absorb') chooseRelease(exp);
}
function runLap(exp: ExpeditionState): void {
  for (let i = 0; i < 200 && exp.phase !== 'nest-choice' && exp.phase !== 'ended'; i++) {
    if (exp.phase === 'moving') advance(exp);
    else if (exp.phase === 'battle') winBattle(exp);
    else if (exp.phase === 'rest') finishRest(exp);
  }
}

describe('121장 5: 이어하기 배율', () => {
  it('바퀴 n: 보상 × (1 + 0.25(n − 1)), 적 체력·공격 × (1 + 0.12(n − 1)) — 옛 바퀴 강화와 이중 적용 없음', () => {
    expect(PX.continueScale).toEqual({ reward: 0.25, enemy: 0.12 });
    expect(lapRewardMult(1)).toBe(1);
    expect(lapRewardMult(2)).toBeCloseTo(1.25);
    expect(lapRewardMult(4)).toBeCloseTo(1.75);
    expect(lapScale(1)).toEqual({ hp: 1, attack: 1 });
    expect(lapScale(3).hp).toBeCloseTo(1.24);
    expect(lapScale(3).attack).toBeCloseTo(1.24);
    expect('lapHpScale' in PX || 'lapAttackScale' in PX).toBe(false);
  });

  it('원정 적은 바퀴 배율 한 번만 받는다 (공격 = 데이터 × ★별 원정 보정 × 바퀴 배율)', () => {
    const grab = (lap: number) => {
      const e = mk({ seed: 20 });
      e.lap = lap;
      e.wildCells = [1];
      advance(e);
      return e.pending!;
    };
    const p1 = grab(1);
    const p3 = grab(3);
    const k = (p: typeof p1) => p.enemy.hpInAttacks / getEnemy(p.enemy.id).hpInAttacks;
    expect(k(p3) / k(p1)).toBeCloseTo(lapScale(3).hp);
    // 보상 배율은 전투 재료(mods.rewardMult)에 바퀴 배율로 실린다
    expect(p3.mods!.rewardMult / p1.mods!.rewardMult).toBeCloseTo(lapRewardMult(3));
    expect(carryAttackMult(1)).toBeLessThan(1);
  });
});

describe('121장 6: 사냥 힐 1바퀴 10% · 2바퀴 6% · 3바퀴 3% · 4바퀴부터 0', () => {
  it('표와 실제 승리 회복', () => {
    expect([1, 2, 3, 4, 5, 6].map(winHealOf)).toEqual([0.1, 0.06, 0.03, 0, 0, 0]);
    expect(PX.hpCarry.winHeal).toBe(winHealOf(1));
    for (const [lap, heal] of [[1, 0.1], [2, 0.06], [4, 0]] as const) {
      const e = mk({ seed: 30 });
      e.lap = lap;
      e.wildCells = [1];
      advance(e);
      expect(e.phase).toBe('battle');
      winBattle(e, 0.5);
      expect(hpFractionOf(e)).toBeCloseTo(0.5 + heal, 6);
    }
  });
});

describe('121장 4: 타일 지급 — 임시 타일(이번 원정만) · 영구 타일(원정 끝 확률)', () => {
  it('바퀴 중 받은 타일은 임시(손·놓은 칸에 표시가 따라감), 가방(acquired)에는 안 들어간다', () => {
    const e = mk({ seed: 11 });
    runLap(e);
    expect(e.phase).toBe('nest-choice');
    expect(e.hand.length).toBeGreaterThan(0);
    expect(e.acquired).toEqual([]);
    expect([...e.tempHand!].sort()).toEqual([...e.hand].sort());
    const id = e.hand[0]!;
    const before = tempHandCount(e, id);
    expect(placeTile(e, id, 3).ok).toBe(true);
    expect(isTempCell(e, 3)).toBe(true);
    expect(tempHandCount(e, id)).toBe(before - 1);
    // 다른 칸과 맞바꾸면 표시도 따라간다
    const other = e.hand[0];
    if (other) {
      expect(placeTile(e, other, 7).ok).toBe(true);
      e.tempCells = [3]; // 7번 칸은 영구 타일로 가정
      expect(swapTiles(e, 3, 7).ok).toBe(true);
      expect(isTempCell(e, 7)).toBe(true);
      expect(isTempCell(e, 3)).toBe(false);
      expect(unplaceTile(e, 7).ok).toBe(true);
      expect(tempHandCount(e, e.hand.at(-1)!)).toBeGreaterThan(0);
    }
  });

  it('드래프트로 고른 타일은 [한 바퀴 더] 뒤에도 손에 남는다 (임시)', () => {
    const e = mk({ seed: 11, tileVariants: true });
    runLap(e);
    expect(e.draft).not.toBeNull();
    expect(chooseDraft(e, 0).ok).toBe(true);
    const id = e.draft!.options[0]!;
    chooseContinue(e);
    expect(e.hand).toContain(id);
    expect(e.tempHand).toContain(id);
    expect(e.tempLog!.some((t) => t.from === 'draft' && t.tileId === id)).toBe(true);
  });

  it('귀환으로 끝나면 영구 타일 굴림 1번(확률 = 40% + 4%/추가 바퀴, 최대 60%), 패배·바퀴 0 은 굴림 없음', () => {
    let hits = 0;
    const N = 200;
    for (let seed = 1; seed <= N; seed++) {
      const e = mk({ seed });
      runLap(e);
      chooseReturn(e);
      expect(e.permTile === null || DECK.includes(e.permTile!)).toBe(true);
      if (e.permTile) {
        hits++;
        expect(summarize(e).kept).toEqual([e.permTile]);
      }
    }
    expect(hits / N).toBeGreaterThan(0.3);
    expect(hits / N).toBeLessThan(0.5);
    // 바퀴를 하나도 못 마치고 도중 귀환 = 굴림 없음
    const a = mk({ seed: 5 });
    advance(a);
    if (a.phase === 'moving') {
      abortExpedition(a);
      expect(a.permTile).toBeUndefined();
    }
    // 패배 = 굴림 없음
    const d = mk({ seed: 6 });
    for (let i = 0; i < 200 && d.phase !== 'battle'; i++) advance(d);
    const b = startBattle(d);
    b.player.hp = 0;
    b.status = 'lost';
    finishBattle(d, b);
    expect(d.outcome).toBe('defeated');
    expect(d.permTile).toBeUndefined();
  });

  it('원정 결과 세이브: 영구 타일만 보관함에 들어가고, 런 로그에 이어하기 한 칸', () => {
    const save = newSaveData('hollow');
    const before = Object.values(save.tiles.collection).reduce((a, n) => a + n, 0);
    const e = mk({ seed: 7 });
    runLap(e);
    chooseContinue(e);
    runLap(e);
    chooseReturn(e);
    const rec = buildRunRecord(e);
    expect(rec.continueRun).toMatchObject({ r: 0.25, e: 0.12, got: e.tempLog!.length });
    expect(rec.continueRun!.perm).toBe(e.permTile);
    recordExpedition(save, e);
    const after = Object.values(save.tiles.collection).reduce((a, n) => a + n, 0);
    expect(after - before).toBe(e.permTile ? 1 : 0);
  });
});
