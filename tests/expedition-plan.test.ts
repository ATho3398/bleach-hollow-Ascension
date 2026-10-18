import { describe, expect, it } from 'vitest';
import { FACTIONS } from '../src/data/factions';
import {
  advance, beginPlanning, chooseContinue, chooseReturn, createExpedition, finishBattle, finishPlanning, placeTile, startBattle, unplacedKept,
  type ExpeditionState,
} from '../src/engine/expedition';
import { loadSave, newSaveData, recordExpedition, storeUnplacedTiles, writeSave } from '../src/game';
import { handCounts, roadCellMode } from '../src/ui/bha/road';
import { isWalking, walkAnimClass, walkState } from '../src/ui/bha/walk';

const DECK = ['prey-nest-a', 'prey-nest-a', 'elite-den-a', 'rest-a'];
const mk = () => createExpedition({ factionId: 'hollow', seed: 7, hunger: 10, condition: 100, deck: DECK });

function walkToNest(exp: ExpeditionState): void {
  for (let i = 0; i < 300 && exp.phase !== 'nest-choice' && exp.phase !== 'ended'; i++) {
    if (exp.phase === 'moving') advance(exp);
    else if (exp.phase === 'battle') {
      const b = startBattle(exp);
      b.enemy.hp = 0;
      b.status = 'won';
      finishBattle(exp, b);
    } else if (exp.phase === 'absorb') exp.phase = 'moving';
    else if (exp.phase === 'rest') exp.phase = 'moving';
  }
}

describe('카드 배치 단계 (GDD 17-1)', () => {
  it('배치 단계는 덱 사본을 손에 쥐고, 끝나면 손을 비운다 (덱은 그대로 보상 후보)', () => {
    const exp = mk();
    beginPlanning(exp);
    expect(exp.hand).toEqual(DECK);
    expect(placeTile(exp, 'prey-nest-a', 3).ok).toBe(true);
    expect(placeTile(exp, 'rest-a', 5).ok).toBe(true);
    expect(exp.hand).toEqual(['prey-nest-a', 'elite-den-a']);
    expect(finishPlanning(exp)).toBe(2);
    expect(exp.hand).toEqual([]);
    expect(exp.deck).toEqual(DECK);
    expect(exp.slots[3]).toBe('prey-nest-a');
    expect(exp.slots[5]).toBe('rest-a');
  });

  it('1~11번 칸 어디든 놓을 수 있고 둥지 칸(0)·이미 찬 칸·손에 없는 타일은 거절한다', () => {
    const exp = mk();
    beginPlanning(exp);
    expect(placeTile(exp, 'prey-nest-a', 0).ok).toBe(false);
    expect(placeTile(exp, 'prey-nest-a', 1).ok).toBe(true);
    expect(placeTile(exp, 'elite-den-a', 1).ok).toBe(false);
    expect(placeTile(exp, 'prey-nest-a', 11).ok).toBe(true);
    expect(placeTile(exp, 'prey-nest-a', 6).ok).toBe(false); // 두 장뿐
  });

  it('이미 시작한 원정에서는 배치 단계를 열 수 없다', () => {
    const exp = mk();
    advance(exp);
    expect(() => beginPlanning(exp)).toThrow();
  });
});

describe('획득 타일 보관 규칙 (GDD 17-1)', () => {
  it('바퀴 끝에 놓지 않은 획득 타일은 귀환 때 다음 원정 덱으로 보관된다', () => {
    const save = newSaveData('hollow');
    save.tiles.deck = [];
    const exp = createExpedition({ factionId: 'hollow', seed: 11, hunger: 10, condition: 100, deck: DECK });
    walkToNest(exp);
    expect(exp.phase).toBe('nest-choice');
    expect(exp.hand.length).toBeGreaterThan(0);
    const got = [...exp.hand];
    chooseReturn(exp);
    recordExpedition(save, exp);
    for (const id of got) expect(save.tiles.deck).toContain(id);
    expect(save.tiles.deck.length).toBeLessThanOrEqual(8);
  });

  it('놓은 타일은 손에서 빠지므로 보관되지 않는다', () => {
    const exp = createExpedition({ factionId: 'hollow', seed: 11, hunger: 10, condition: 100, deck: DECK });
    walkToNest(exp);
    const first = exp.hand[0]!;
    expect(placeTile(exp, first, 2).ok).toBe(true);
    const rest = [...exp.hand];
    chooseReturn(exp);
    expect(unplacedKept(exp)).toEqual(rest);
  });

  it('패배로 잃은 마지막 바퀴 타일은 보관하지 않는다', () => {
    const exp = createExpedition({ factionId: 'hollow', seed: 11, hunger: 10, condition: 100, deck: DECK });
    walkToNest(exp);
    chooseContinue(exp);
    exp.hand.push('rest-a');
    exp.acquired.push({ tileId: 'rest-a', lap: exp.lap });
    exp.phase = 'ended';
    exp.outcome = 'defeated';
    exp.endReason = 'battle-lost';
    const kept = unplacedKept(exp);
    expect(kept.filter((x) => x === 'rest-a').length).toBe(exp.hand.filter((x) => x === 'rest-a').length - 1);
  });

  it('덱 상한과 보유 수량을 넘기면 덱에 넣지 않는다', () => {
    const stock = { collection: { 'rest-a': 1, 'prey-nest-a': 2 }, deck: ['rest-a'] };
    storeUnplacedTiles(stock, ['rest-a', 'prey-nest-a', 'prey-nest-a', 'prey-nest-a'], 8);
    expect(stock.deck).toEqual(['rest-a', 'prey-nest-a', 'prey-nest-a']);
    const full = { collection: { 'prey-nest-a': 9 }, deck: Array(8).fill('prey-nest-a') as string[] };
    storeUnplacedTiles(full, ['prey-nest-a'], 8);
    expect(full.deck.length).toBe(8);
  });

  it('중간 저장 왕복: 손에 든 타일이 그대로 돌아오고 세이브 형식은 바뀌지 않는다', () => {
    const exp = createExpedition({ factionId: 'hollow', seed: 11, hunger: 10, condition: 100, deck: DECK });
    walkToNest(exp);
    const save = newSaveData('hollow');
    const mem: Record<string, string> = {};
    const storage = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; }, removeItem: (k: string) => { delete mem[k]; } };
    save.activeExpedition = { version: 1, balanceVersion: 0, savedAtMs: 0, speed: 1, exp: JSON.parse(JSON.stringify(exp)) };
    writeSave(storage, save);
    expect(loadSave(storage)?.activeExpedition?.exp.hand).toEqual(exp.hand);
  });
});

describe('길 배치판 순수 함수', () => {
  it('칸 상태: 놓인 타일 / 놓을 수 있음 / 비어 있음', () => {
    expect(roadCellMode({ slot: 'rest-a', index: 3, pos: 0, hasSelected: true })).toBe('placed');
    expect(roadCellMode({ slot: null, index: 3, pos: 0, hasSelected: true })).toBe('can');
    expect(roadCellMode({ slot: null, index: 3, pos: 0, hasSelected: false })).toBe('empty');
  });
  it('손의 타일을 종류별로 센다 (처음 나온 순서)', () => {
    expect(handCounts(['b', 'a', 'b'])).toEqual([{ id: 'b', count: 2 }, { id: 'a', count: 1 }]);
  });
});

describe('걷기 화면 (GDD 17-1)', () => {
  it('걷기 애니메이션 이름은 종족 설정에서 읽고, 없거나 이상하면 기본값', () => {
    expect(FACTIONS.map((f) => walkAnimClass(f.walkAnim))).toEqual(FACTIONS.map((f) => `bha-walker--${f.walkAnim}`));
    expect(new Set(FACTIONS.map((f) => f.walkAnim)).size).toBe(FACTIONS.length);
    expect(walkAnimClass(undefined)).toBe('bha-walker--plain');
    expect(walkAnimClass('A b')).toBe('bha-walker--plain');
  });
  it('이동 단계에서 멈추지 않았을 때만 걷는다', () => {
    expect(isWalking('moving', false)).toBe(true);
    expect(isWalking('moving', true)).toBe(false);
    expect(isWalking('battle', false)).toBe(false);
  });
  it('상태 줄 글자', () => {
    expect(walkState('moving', false).label).toBe('걷는 중');
    expect(walkState('moving', true).label).toBe('일시정지');
    expect(walkState('battle', false).label).toBe('전투 대기');
  });
});
