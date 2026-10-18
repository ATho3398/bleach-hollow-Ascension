import { describe, expect, it } from 'vitest';
import { FACTIONS } from '../src/data/factions';
import {
  advance, beginPlanning, chooseContinue, chooseReturn, createExpedition, finishBattle, finishPlanning, moveTile, placeTile, startBattle, swapTiles, swapWithHand, unplaceTile, unplacedKept,
  type ExpeditionState,
} from '../src/engine/expedition';
import { loadSave, newSaveData, recordExpedition, storeUnplacedTiles, writeSave } from '../src/game';
import { cellAction, handCounts, roadCellMode, type RoadSelection } from '../src/ui/bha/road';
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

describe('타일 이동·되돌리기 (GDD 18-4, C.38)', () => {
  it('놓은 타일을 손으로 되돌리면 칸이 비고 손에 돌아온다', () => {
    const exp = mk();
    beginPlanning(exp);
    placeTile(exp, 'rest-a', 5);
    expect(exp.hand).toEqual(['prey-nest-a', 'prey-nest-a', 'elite-den-a']);
    expect(unplaceTile(exp, 5).ok).toBe(true);
    expect(exp.slots[5]).toBeNull();
    expect([...exp.hand].sort()).toEqual([...DECK].sort());
    expect(unplaceTile(exp, 5).ok).toBe(false); // 이미 빈 칸
    expect(unplaceTile(exp, 0).ok).toBe(false); // 둥지 칸
  });

  it('다른 칸으로 옮긴다: 빈 칸만 되고, 실패하면 아무것도 안 바뀐다', () => {
    const exp = mk();
    beginPlanning(exp);
    placeTile(exp, 'prey-nest-a', 2);
    placeTile(exp, 'elite-den-a', 4);
    expect(moveTile(exp, 2, 4).ok).toBe(false); // 찬 칸
    expect(moveTile(exp, 2, 0).ok).toBe(false); // 둥지 칸
    expect(moveTile(exp, 3, 6).ok).toBe(false); // 빈 칸에서 옮길 수 없다
    expect(moveTile(exp, 2, 2).ok).toBe(false);
    expect(exp.slots[2]).toBe('prey-nest-a');
    expect(exp.slots[4]).toBe('elite-den-a');
    const handBefore = [...exp.hand];
    expect(moveTile(exp, 2, 9).ok).toBe(true);
    expect(exp.slots[2]).toBeNull();
    expect(exp.slots[9]).toBe('prey-nest-a');
    expect([...exp.hand].sort()).toEqual([...handBefore].sort());
  });

  it('전투 타일을 놓았다 되돌려도 이번 바퀴 전투 수는 그대로다(야생 전투가 돌아온다)', () => {
    const base = mk();
    const battles = (e: ExpeditionState) => e.wildCells.length + e.slots.filter((s) => s === 'prey-nest-a' || s === 'elite-den-a').length;
    beginPlanning(base);
    const total = battles(base);
    placeTile(base, 'prey-nest-a', 3);
    placeTile(base, 'elite-den-a', 7);
    expect(battles(base)).toBe(total);
    moveTile(base, 3, 8);
    expect(battles(base)).toBe(total);
    unplaceTile(base, 8);
    unplaceTile(base, 7);
    expect(battles(base)).toBe(total);
    expect(base.wildCells.length).toBeGreaterThan(0);
    expect(new Set(base.wildCells).size).toBe(base.wildCells.length);
    for (const c of base.wildCells) expect(base.slots[c]).toBeNull();
  });

  it('바퀴 끝 팝업(nest-choice)에서도 되돌릴 수 있고, 지나간 칸은 안 된다', () => {
    const exp = mk();
    beginPlanning(exp);
    finishPlanning(exp);
    walkToNest(exp);
    expect(exp.phase).toBe('nest-choice');
    exp.hand = ['prey-nest-a'];
    expect(placeTile(exp, 'prey-nest-a', 3).ok).toBe(true);
    expect(exp.hand).toEqual([]);
    expect(moveTile(exp, 3, 5).ok).toBe(true);
    expect(unplaceTile(exp, 5).ok).toBe(true);
    expect(exp.hand).toEqual(['prey-nest-a']);
    exp.slots[2] = 'rest-a';
    exp.pos = 3;
    expect(unplaceTile(exp, 2).ok).toBe(false);
  });

  it('칸을 눌렀을 때의 동작 (cellAction, GDD 18-8)', () => {
    const base = { index: 4, selection: null as RoadSelection };
    const cell = (c: number): RoadSelection => ({ kind: 'cell', cell: c });
    const hand: RoadSelection = { kind: 'hand', tileId: 'rest-a' };
    // 아무것도 안 골랐을 때
    expect(cellAction({ ...base, slot: 'rest-a', editable: false })).toBe('info');
    expect(cellAction({ ...base, slot: 'rest-a', editable: true })).toBe('select-placed');
    expect(cellAction({ ...base, slot: null, editable: false })).toBe('need-pick');
    // 놓은 칸을 골랐을 때: 같은 칸 = 손으로 복귀, 다른 놓은 칸 = 교체, 빈 칸 = 이동, 확정된 타일 = 안내만
    expect(cellAction({ ...base, slot: 'rest-a', editable: true, selection: cell(4) })).toBe('return-hand');
    expect(cellAction({ ...base, slot: 'rest-a', editable: true, selection: cell(2) })).toBe('swap-cells');
    expect(cellAction({ ...base, slot: null, editable: false, selection: cell(2) })).toBe('move');
    expect(cellAction({ ...base, slot: 'rest-a', editable: false, selection: cell(2) })).toBe('info');
    // 손 타일을 골랐을 때: 빈 칸 = 놓기, 놓은 칸 = 교체, 확정된 타일 = 안내만
    expect(cellAction({ ...base, slot: null, editable: false, selection: hand })).toBe('place');
    expect(cellAction({ ...base, slot: 'rest-a', editable: true, selection: hand })).toBe('swap-hand');
    expect(cellAction({ ...base, slot: 'rest-a', editable: false, selection: hand })).toBe('info');
  });

  it('놓은 두 타일을 서로 바꾼다(swapTiles): 빈 칸·지나간 칸·같은 칸은 실패하고 상태는 그대로', () => {
    const exp = mk();
    beginPlanning(exp);
    placeTile(exp, 'prey-nest-a', 2);
    placeTile(exp, 'elite-den-a', 4);
    const wild = [...exp.wildCells];
    expect(swapTiles(exp, 2, 4).ok).toBe(true);
    expect(exp.slots[2]).toBe('elite-den-a');
    expect(exp.slots[4]).toBe('prey-nest-a');
    expect(exp.wildCells).toEqual(wild);
    expect(swapTiles(exp, 2, 2).ok).toBe(false);
    expect(swapTiles(exp, 2, 7).ok).toBe(false); // 빈 칸
    expect(swapTiles(exp, 0, 2).ok).toBe(false); // 둥지 칸
    exp.pos = 3;
    expect(swapTiles(exp, 2, 4).ok).toBe(false); // 지나간 칸
    expect(exp.slots[2]).toBe('elite-den-a');
  });

  it('손의 타일과 놓은 타일을 바꾼다(swapWithHand): 놓은 것은 손으로, 전투 수는 그대로, 실패하면 불변', () => {
    const exp = mk();
    beginPlanning(exp);
    const battles = (e: ExpeditionState) => e.wildCells.length + e.slots.filter((s) => s === 'prey-nest-a' || s === 'elite-den-a').length;
    placeTile(exp, 'prey-nest-a', 3);
    const total = battles(exp);
    const rest = exp.hand.find((t) => t !== 'prey-nest-a' && t !== 'elite-den-a');
    expect(rest).toBeDefined();
    expect(swapWithHand(exp, rest!, 3).ok).toBe(true);
    expect(exp.slots[3]).toBe(rest);
    expect(exp.hand).toContain('prey-nest-a');
    expect(exp.hand).not.toContain(rest!);
    expect(battles(exp)).toBe(total);
    expect(swapWithHand(exp, 'prey-nest-a', 3).ok).toBe(true); // 도로 바꾸기
    expect(exp.slots[3]).toBe('prey-nest-a');
    expect(battles(exp)).toBe(total);
    const snap = JSON.stringify(exp);
    expect(swapWithHand(exp, 'prey-nest-a', 3).ok).toBe(false); // 같은 타일
    expect(swapWithHand(exp, 'no-such', 3).ok).toBe(false); // 손에 없음
    expect(swapWithHand(exp, rest!, 9).ok).toBe(false); // 빈 칸
    expect(JSON.stringify(exp)).toBe(snap);
  });
});
