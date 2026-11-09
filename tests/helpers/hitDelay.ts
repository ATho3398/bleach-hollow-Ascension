// 타격 지연 끄기 (C.357, GDD 214장): 피해는 공격 모션이 닿는 순간(hitDelay 초 뒤 틱)에 들어간다.
// 옛 전투 시험은 피해 '시각'이 아니라 '수치·순서'를 보므로, 그 파일의 시험 동안만 지연을 0 으로 둔다(바로 들어감 = 옛 동작).
// 지연 자체의 시험은 tests/c357-hit-delay.test.ts.
import { afterAll, beforeAll } from 'vitest';
import { BALANCE } from '../../src/config/balance';

type HitDelay = typeof BALANCE.provisional.combat.hitDelay;
const slot = BALANCE.provisional.combat as unknown as { hitDelay: HitDelay };

/** 타격 지연 0 (모든 공격이 발동한 틱에 바로 맞는다) */
export const NO_HIT_DELAY: HitDelay = { basic: 0, block: 0, enemy: 0, heavy: 0, counter: 0 };

export function useImmediateHits(): void {
  let saved: HitDelay;
  beforeAll(() => {
    saved = slot.hitDelay;
    slot.hitDelay = NO_HIT_DELAY;
  });
  afterAll(() => {
    slot.hitDelay = saved;
  });
}
