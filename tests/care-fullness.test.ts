// 재우기·쓰다듬기(종족 이름 손질·교감)도 배가 꺼진다 (GDD 170장 1)
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { getFaction } from '../src/data/factions';
import { CARE_ACTIONS, doNestAction, fullnessOfNest, newNest, respondCare } from '../src/engine/nest';
import { careNest, newSaveData } from '../src/game';
import { careFeedback } from '../src/ui/bha/dockLogic';
import { statusInfo } from '../src/ui/bha/statusInfo';

const NX = BALANCE.provisional.nest;
const COST = NX.careFullnessCost;
const FACTIONS = ['hollow', 'shinigami'] as const;

describe('돌보기 배부름 감소 (GDD 170장 1)', () => {
  it('값은 balance 에 있고 1', () => {
    expect(COST).toBe(1);
  });

  it.each(CARE_ACTIONS)('%s 응답 한 번마다 배부름 −1, 먹이는 그대로', (action) => {
    const n = newNest(0);
    n.hunger = 40;
    n.careRequest = { action, until: 10_000 };
    expect(respondCare(n, action, 1_000, () => 0.5)).toBe('answered');
    expect(fullnessOfNest(n)).toBe(60 - COST);
  });

  it('거절이면 배부름 그대로', () => {
    const n = newNest(0);
    n.hunger = 40;
    n.careRequest = null;
    expect(respondCare(n, 'sleep', 1_000)).toBe('refused');
    expect(fullnessOfNest(n)).toBe(60);
  });

  it('0 아래로는 안 내려간다', () => {
    const n = newNest(0);
    n.hunger = 100;
    doNestAction(n, 'pet', 'basic', 0);
    expect(fullnessOfNest(n)).toBe(0);
    n.hunger = 99.5;
    doNestAction(n, 'sleep', 'basic', 0);
    expect(n.hunger).toBe(100);
  });

  it('돌보기로 배부름이 낮아져도 쇠약이 아니다 — 쇠약은 먹인 뒤 24시간 (C.406, GDD 241-C 6)', () => {
    const T = 5_000_000;
    const n = newNest(T);
    n.hunger = 100 - 21;
    expect(n.weakened).toBe(false);
    doNestAction(n, 'sleep', 'basic', T + 1000);
    expect(fullnessOfNest(n)).toBe(20);
    expect(n.weakened).toBe(false);
    doNestAction(n, 'sleep', 'basic', T + NX.care.weakAfterHours * 3_600_000);
    expect(n.weakened).toBe(true);
  });

  it('문턱 위면 쇠약 없음', () => {
    const n = newNest(0);
    n.hunger = 50;
    doNestAction(n, 'pet', 'basic', 0);
    expect(n.weakened).toBe(false);
  });

  it.each(FACTIONS)('%s: 결과 말풍선에 배부름 −1 이 보인다(종족 이름)', (id) => {
    const f = getFaction(id);
    for (const action of CARE_ACTIONS) {
      const s = newSaveData(id, 0); s.help.guides = {}; // 튜토리얼이 끝난 세이브 — 튜토리얼 중엔 돌봄 요청이 없다 (GDD 245장 8)
      s.nest.hunger = 30;
      s.nest.condition = 50;
      s.nest.careRequest = { action, until: Date.now() + 600_000 };
      const before = { hunger: s.nest.hunger, condition: s.nest.condition, risk: s.nest.risk };
      expect(careNest(s, action)).toBe('answered');
      const line = careFeedback(f, action, null, { hunger: s.nest.hunger - before.hunger, condition: s.nest.condition - before.condition, risk: s.nest.risk - before.risk });
      expect(line.startsWith(`${f.nestActions[action]}: `)).toBe(true);
      expect(line).toContain(`${f.fullnessName} −1`);
    }
  });

  it.each(FACTIONS)('%s: 배부름 ⓘ 오르내림에 돌보기 줄', (id) => {
    const f = getFaction(id);
    const doc = statusInfo('hunger', f);
    const lines = doc.groups.flatMap((g) => g.lines);
    expect(lines).toContain(`${f.nestActions.sleep}: −${COST}`);
    expect(lines).toContain(`${f.nestActions.pet}: −${COST}`);
    expect(doc.lead).toContain(f.nestActions.sleep);
    expect(doc.lead).not.toMatch(/[.]$/);
  });
});
