// C.174 (GDD 101장 추가 결정 3): 밸런스 기준 사람형 봇은 막을 수 있으면 강공격을 다 막는다. 강공격 세기·막기 버튼은 C.177(GDD 105장 수정 v5.233)에서 바뀌었다 — tests/c177
import { describe, expect, it } from 'vitest';
import { HUMAN_BOT_DEFAULTS } from '../src/engine/combat';

describe('C.174 사람형 봇 다 막음', () => {
  it('사람형 봇 기본 막기 성공 100%', () => {
    expect(HUMAN_BOT_DEFAULTS.guardSuccess).toBe(1);
  });
});
