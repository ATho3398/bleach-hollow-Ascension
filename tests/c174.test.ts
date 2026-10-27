// C.174 (GDD 101장 추가 결정 3): 강공격 한 방 약 45%·연속 강공격 세 타 합 같은 비율, 밸런스 기준 사람형 봇은 막기 블록이 있으면 강공격을 다 막는다
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { HUMAN_BOT_DEFAULTS } from '../src/engine/combat';

const CX = BALANCE.provisional.combat;

describe('C.174 강공격 45% · 사람형 봇 다 막음', () => {
  it('강공격 ×3(약 45%), 연속 강공격 한 타 = ×3 × 0.755(세 타 합이 한 방과 같은 비율)', () => {
    expect(CX.heavyHitMultiplier).toBe(3);
    expect(CX.heavyChainHitMultiplier).toBeCloseTo(CX.heavyHitMultiplier * 0.755, 1);
  });
  it('사람형 봇 기본 막기 성공 100%', () => {
    expect(HUMAN_BOT_DEFAULTS.guardSuccess).toBe(1);
  });
});
