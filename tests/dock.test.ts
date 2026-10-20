// 홈 하단 독: 펼침 상태, 먹이 5종, 돌보기 결과 문구 (GDD 18-2, C.38)
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { FACTIONS } from '../src/data/factions';
import { FOOD_IDS } from '../src/engine/faction';
import { doNestAction, newNest } from '../src/engine/nest';
import { careFeedback, CLOSED, togglePanel, type DockPanel } from '../src/ui/bha/dockLogic';

describe('독 펼침 상태', () => {
  it('먹이를 누르면 열리고 다시 누르면 닫힌다', () => {
    let p: DockPanel = CLOSED;
    p = togglePanel(p, 'food');
    expect(p).toBe('food');
    p = togglePanel(p, 'food');
    expect(p).toBe('none');
  });
  it('한 번에 한 칸만 열린다: 먹이가 열린 채 더보기를 누르면 더보기로 바뀐다', () => {
    expect(togglePanel('food', 'more')).toBe('more');
    expect(togglePanel('more', 'food')).toBe('food');
  });
});

describe('먹이 5종', () => {
  it('5종이고 종족마다 이름이 모두 있다(종족 id 분기 없이 설정에서 읽는다)', () => {
    expect(FOOD_IDS).toHaveLength(5);
    expect(Object.keys(BALANCE.provisional.nest.foods).sort()).toEqual([...FOOD_IDS].sort());
    for (const f of FACTIONS) for (const id of FOOD_IDS) expect(f.foodNames[id].length).toBeGreaterThan(0);
  });
  it('basic 은 예전 단일 먹이와 같다(기본 인자도 basic)', () => {
    expect(BALANCE.provisional.nest.foods.basic.hunger).toBe(BALANCE.provisional.nest.feedHunger);
    const n = newNest(0);
    n.hunger = 80;
    doNestAction(n, 'feed');
    expect(n.hunger).toBe(80 - BALANCE.provisional.nest.feedHunger);
  });
  it('종류에 따라 허기·컨디션이 다르게 변하고 범위를 넘지 않는다', () => {
    const n = newNest(0);
    n.hunger = 90;
    n.condition = 50;
    doNestAction(n, 'feed', 'feast');
    expect(n.hunger).toBe(10);
    expect(n.condition).toBe(45);
    doNestAction(n, 'feed', 'feast');
    expect(n.hunger).toBe(0);
    n.condition = 98;
    doNestAction(n, 'feed', 'tonic');
    expect(n.condition).toBe(100);
  });
});

describe('돌보기 결과 문구', () => {
  const f = FACTIONS[0]!;
  it('먹이는 먹이 이름과 변한 수치만 보여 준다', () => {
    expect(careFeedback(f, 'feed', 'snack', { hunger: -15, condition: 4, stability: 0, risk: 0 })).toBe(`${f.foodNames.snack}: ${f.fullnessName} +15 · 컨디션 +4`); // C.63: 허기 −15 = 배부름 +15
  });
  it('변화가 없으면 그렇게 말한다', () => {
    expect(careFeedback(f, 'sleep', null, { hunger: 0, condition: 0, stability: 0, risk: 0 })).toBe(`${f.nestActions.sleep}: 변화 없음`);
  });
});
