// GDD 180장 (이펙트 배치 도구): 블록마다 고른 종이인형 몸동작 id 를 그대로 튼다 (PlayOptions.motionId)
import { describe, expect, it } from 'vitest';
import { HUMANOID, MOTIONS } from '../src/data/art/rig/pose';
import { createRigPlayer } from '../src/ui/bha/rigAnim';

describe('종이인형 motionId', () => {
  it('고른 동작 id 를 그대로 튼다 (계열 몸동작보다 먼저)', () => {
    const p = createRigPlayer(HUMANOID, MOTIONS);
    expect(p.play('skill', { motion: 'slash', motionId: 'straight' })).not.toBeNull();
    expect(p.pose().motion).toBe(MOTIONS.straight);
  });
  it('없는 id 면 무시하고 예전처럼 고른다', () => {
    const p = createRigPlayer(HUMANOID, MOTIONS, () => {}, () => 0);
    p.play('skill', { motion: 'strike', motionId: 'no-such-motion' });
    expect(p.pose().motion).toBe(MOTIONS.straight);
  });
});
