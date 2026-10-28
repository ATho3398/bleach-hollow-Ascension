// C.95 QA 2차 후속 (GDD 42장): 스토리 흡수 목표 화의 흡수 화면 · 테스트 모드 기본 특성 · 컨디션 바퀴당 하한 · 넘친 먹이 → 골드
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { getTrait } from '../src/data/traits';
import { FORM_TABLE } from '../src/data/evolution';
import { advance, chooseAbsorb, conditionFloor, createExpedition, finishBattle, startBattle, type ExpeditionState } from '../src/engine/expedition';
import { foodOverflowGold, newFoodStock, settleFood } from '../src/engine/food';
import { expeditionEndVitals } from '../src/engine/nest';
import { fillDefaultTraits, newTestSave } from '../src/engine/testMode';
import { newSaveData, sanitizeDeck, settleStory } from '../src/game';
import { getFaction } from '../src/data/factions';

const PX = BALANCE.provisional.expedition;
const SKILL = { id: 't-fire-a', element: 'fire', category: 'physical', role: 'attack', powerInAttacks: 1, chainBonus: { kind: 'stagger', value: 1 }, powerMultiplier: 1 } as const;

function mk(fid: string, story: { chapterId: string; episodeId: string } | null, over: { condition?: number } = {}): ExpeditionState {
  const save = newSaveData(fid, 1);
  return createExpedition({
    factionId: fid, seed: 7, hunger: 20, condition: over.condition ?? 80, deck: sanitizeDeck(save.tiles, fid), build: save.build, evolution: save.evolution,
    ...(story ? { story } : {}),
  });
}

/** 다음 칸에서 싸우고(적 등급을 바꿔서) 흡수 조건 없이 이긴다 — 장착 skill 이 있는 전투(첫 흡수 보장 없음) */
function winPlain(exp: ExpeditionState, cls: 'normal' | 'elite'): void {
  exp.wildCells = [exp.pos + 1];
  for (let i = 0; i < 50 && exp.phase === 'moving'; i++) advance(exp);
  expect(exp.phase).toBe('battle');
  exp.pending!.enemy = { ...exp.pending!.enemy, class: cls };
  const b = startBattle(exp);
  b.enemy.hp = 0;
  b.status = 'won';
  b.finisher = { kind: 'basic-attack', traitId: null, element: null };
  b.weakChain3Count = 0;
  b.params = { ...b.params, skills: [SKILL as never] };
  finishBattle(exp, b);
}

describe('C.95 ① 스토리 흡수 목표 화 (GDD 42장 1번)', () => {
  for (const fid of ['hollow', 'shinigami']) {
    it(`${fid}: 1장 3화(강적 흡수)에서 강적을 이기면 조건 없이 흡수 화면 → 흡수하면 목표 +1`, () => {
      const exp = mk(fid, { chapterId: 'ch1', episodeId: 'ep3' });
      winPlain(exp, 'elite');
      expect(exp.phase).toBe('absorb');
      expect(exp.absorbOffer!.reasons).toEqual(['victory']); // C.125 (71장): 흡수 조건 삭제 — 스토리 목표 화도 그냥 승리
      chooseAbsorb(exp, exp.absorbOffer!.candidates[0] ?? null, 0);
      expect(exp.story!.progress).toBe(1);
    });
  }
  it('2장 3화(강적 2마리 흡수)도 같다', () => {
    const exp = mk('hollow', { chapterId: 'ch2', episodeId: 'ep3' });
    winPlain(exp, 'elite');
    expect(exp.phase).toBe('absorb');
  });
  it('C.125 (71장): 그 화의 일반 적·다른 목표 화·자유 원정도 이기면 언제나 흡수 화면', () => {
    const a = mk('hollow', { chapterId: 'ch1', episodeId: 'ep3' });
    winPlain(a, 'normal');
    expect(a.phase).toBe('absorb');
    const b = mk('hollow', { chapterId: 'ch1', episodeId: 'ep1' });
    winPlain(b, 'elite');
    expect(b.phase).toBe('absorb');
    const c = mk('hollow', null);
    winPlain(c, 'elite');
    expect(c.phase).toBe('absorb');
  });
});

describe('C.95 ② 테스트 모드 기본 특성 (GDD 42장 2번)', () => {
  for (const fid of ['hollow', 'shinigami']) {
    it(`${fid}: 전체 해금 새 세이브는 칸을 공격 특성으로 채운다 (C.136: 막기·회복 속성 특성 삭제 — GDD 84장 7번)`, () => {
      const save = newTestSave(fid, 1);
      // C.184 (GDD 111장 1): 노멀 몸이면 기본 블록이 그 역할이라 비워 둔다 — 불 몸으로 채운다
      expect(save.build.slots.every((x) => x === null)).toBe(true);
      const fire = FORM_TABLE.find((f) => f.elements?.[0] === 'fire')!;
      save.evolution.formId = fire.id;
      fillDefaultTraits(save);
      const roles = save.build.slots.filter((x): x is string => x !== null).map((id) => getTrait(id).role);
      expect(save.build.slots.every((x) => x !== null)).toBe(true);
      expect(roles.every((r) => r === 'attack')).toBe(true);
      for (const id of save.build.slots) expect(save.build.owned).toContain(id);
    });
  }
  it('이미 장착한 특성이 있으면 건드리지 않는다', () => {
    const save = newSaveData('hollow', 1);
    save.build.slots[0] = 't-water-a';
    expect(fillDefaultTraits(save)).toBe(0);
    expect(save.build.slots).toEqual(['t-water-a', null, null]);
  });
});

describe('C.95 ③ 컨디션 바퀴당 감소 하한 (GDD 42장 3번)', () => {
  it('하한 = 출발 − 25 × 바퀴, 전투 감소가 그 아래로 안 간다', () => {
    const exp = mk('hollow', null, { condition: 74 });
    expect(conditionFloor(exp)).toBe(74 - PX.conditionLossPerLapMax);
    exp.condition = 50;
    winPlain(exp, 'normal');
    expect(exp.condition).toBe(74 - PX.conditionLossPerLapMax);
  });
  it('QA 사례: 74 로 나가 2바퀴, 폭주(−30)해도 74 − 50 = 24 아래로 안 간다 (전에는 5)', () => {
    const exp = mk('hollow', null, { condition: 74 });
    exp.lap = 2;
    exp.condition = 35;
    exp.breakthrough = { lap: 2, cell: 3 };
    exp.phase = 'ended';
    exp.outcome = 'returned';
    expect(expeditionEndVitals(exp).condition).toBe(24);
  });
  it('옛 중간 저장(출발 값 없음)은 하한 없음', () => {
    const exp = mk('hollow', null, { condition: 74 });
    delete exp.startCondition;
    expect(conditionFloor(exp)).toBe(0);
  });
});

describe('C.95 ④ 넘친 먹이 → 골드 (GDD 42장 4번)', () => {
  it('1개 = 상점 가격 × 20%', () => {
    expect(foodOverflowGold('snack')).toBe(Math.round(BALANCE.shop.goldPrices['food-snack']! * 0.2));
    expect(foodOverflowGold('feast')).toBe(28);
  });
  it('원정 정산: 한도를 넘친 몫만 골드로', () => {
    const s = newFoodStock();
    s.snack = BALANCE.provisional.food.cap;
    const r = settleFood(s, ['snack', 'snack', 'basic']);
    expect(r.overflow).toBe(2);
    expect(r.overflowGold).toBe(2 * foodOverflowGold('snack'));
    expect(s.basic).toBe(newFoodStock().basic + 1);
  });
  it('화 보상 먹이가 한도면 골드로 받고 화 보상 골드에 더해진다', () => {
    const save = newSaveData('hollow', 1);
    const SX = BALANCE.provisional.story;
    save.shared.food[SX.episodeFood as 'basic'] = BALANCE.provisional.food.cap;
    const exp = mk('hollow', { chapterId: 'ch1', episodeId: 'ep1' });
    exp.story!.cleared = true;
    const before = save.shared.tradeCoins;
    const r = settleStory(save, exp, 1);
    expect(r.food[1]).toBe(0);
    expect(r.overflowGold).toBe(foodOverflowGold(SX.episodeFood as 'basic'));
    expect(save.shared.tradeCoins - before).toBe(SX.episodeGold + r.overflowGold!);
  });
});
