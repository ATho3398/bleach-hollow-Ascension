// C.398 (마스터AL 11-12 "여성 해방 아란칼 bodySlot 버그는 고쳐줘"): 블록 도트 연출 몸동작 칸 — 여성 외형이면 여 칸(해방 외형 포함)
import { describe, expect, it } from 'vitest';
import { HUMANOID } from '../src/data/art/rig/pose';
import { isFemaleRigLook } from '../src/data/art/manifest';

describe('C.398 여성 종이인형 외형 판정', () => {
  it("'-f' 로 끝나거나 '-f-' 를 품으면 여 — 여성 해방 아란칼도 여", () => {
    expect(isFemaleRigLook('arrancar-base-f')).toBe(true);
    expect(isFemaleRigLook('arrancar-base-f-released')).toBe(true);
    expect(isFemaleRigLook('shinigami-soul-f')).toBe(true);
    expect(isFemaleRigLook('arrancar-base')).toBe(false);
    expect(isFemaleRigLook('shinigami-base')).toBe(false);
    expect(isFemaleRigLook('spider-base')).toBe(false);
    expect(isFemaleRigLook('brute-base')).toBe(false);
  });
  it('게임 사람형 외형 중 -f 가 들어간 것은 모두 여, 나머지 몸(덩치 등)은 남으로 갈린다', () => {
    for (const look of Object.keys(HUMANOID.looks)) {
      const female = /-f(-|$)/.test(look);
      expect(isFemaleRigLook(look), look).toBe(female);
    }
  });
});
