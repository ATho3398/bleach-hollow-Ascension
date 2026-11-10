// 거미형 종이인형 작업본 (GDD 115-A 106): 다리 넷이 발끝 자리에서 거꾸로 풀려 따로 움직인다
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { DRAFT_RIGS } from '../scripts/rig/draft';
import { apply, boneMatrices, lookLayers, samplePose, validateRig, type Vec2 } from '../src/data/art/rig/pose';

const { rig, motions, sets } = DRAFT_RIGS.spider!;
const tips = (rig as unknown as { tips: { ref: Record<string, Vec2> } }).tips.ref;
const LEGS = ['leg1b', 'leg2b', 'leg3b', 'leg4b'];
const tipAt = (id: string, t: number) => Object.fromEntries(LEGS.map((l) => [l, apply(boneMatrices(rig, samplePose(rig, motions[id]!, t))[l]!, tips[l]!)]));

describe('거미형 뼈대 (GDD 115-A 106)', () => {
  it('뼈대 검사 통과, 조각 14개 그림이 있고 동작 7개', () => {
    expect(validateRig(rig, motions, sets)).toEqual([]);
    const layers = lookLayers(rig, 'spider-base');
    expect(layers.length).toBe(14);
    for (const l of layers) expect(existsSync(`docs/design/rig-draft/spider/${l.art}.png`), l.art).toBe(true);
    expect(Object.keys(motions).sort()).toEqual(['attack', 'attack2', 'hit', 'idle', 'move', 'release1', 'skill']);
  });
  it('제자리 동작(대기·공격1·특수·맞음): 몸이 움직여도 발끝 넷은 바닥 그 자리', () => {
    for (const id of ['idle', 'attack', 'skill', 'hit']) {
      const m = motions[id]!;
      for (let t = 0; t <= m.duration; t += 25) {
        const p = tipAt(id, t);
        for (const l of LEGS) {
          expect(Math.abs(p[l]![0] - tips[l]![0]), `${id} t${t} ${l} x`).toBeLessThan(0.6);
          expect(Math.abs(p[l]![1] - tips[l]![1]), `${id} t${t} ${l} y`).toBeLessThan(0.6);
        }
      }
    }
    // 몸은 실제로 움직인다
    const mid = boneMatrices(rig, samplePose(rig, motions.idle!, 900));
    expect(mid.torso![5] - boneMatrices(rig, {}).torso![5]).toBeGreaterThan(0.5);
  });
  it('이동: 다리마다 발을 떼는 때가 다르고(넷이 따로), 디딘 발끝은 바닥 높이 그대로', () => {
    const m = motions.move!;
    const liftAt: Record<string, number> = {};
    for (const l of LEGS) {
      let best = 0;
      for (let t = 0; t < m.duration; t += 25) {
        const up = tips[l]![1] - tipAt('move', t)[l]![1];
        expect(up, `${l} t${t} 바닥 밑으로 안 내려감`).toBeGreaterThan(-0.6);
        if (up > best) { best = up; liftAt[l] = t; }
      }
      expect(best, `${l} 든 높이`).toBeGreaterThan(3);
    }
    expect(new Set(Object.values(liftAt)).size).toBe(4);
    // 어느 순간에도 셋 이상은 딛고 있다
    for (let t = 0; t < m.duration; t += 25) {
      const p = tipAt('move', t);
      expect(LEGS.filter((l) => tips[l]![1] - p[l]![1] < 0.6).length, `t${t}`).toBeGreaterThanOrEqual(3);
    }
  });
  it('공격2: 앞다리 둘(1·2)을 치켜들었다가 내리찍고 뒷다리 둘은 디딘 채', () => {
    const up = tipAt('attack2', 220);
    expect(tips.leg1b![1] - up.leg1b![1]).toBeGreaterThan(12);
    expect(tips.leg2b![1] - up.leg2b![1]).toBeGreaterThan(12);
    for (const l of ['leg3b', 'leg4b']) expect(Math.abs(tips[l]![1] - up[l]![1]), l).toBeLessThan(0.6);
    const hit = tipAt('attack2', motions.attack2!.hit!);
    expect(hit.leg2b![0]).toBeLessThan(tips.leg2b![0] - 6); // 앞으로 내리찍음
    expect(Math.abs(hit.leg2b![1] - tips.leg2b![1])).toBeLessThan(1.5);
  });
});
