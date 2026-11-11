// 거미형 종이인형 작업본 (GDD 115-A 106): 다리 넷이 발끝 자리에서 거꾸로 풀려 따로 움직인다
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { DRAFT_RIGS } from '../scripts/rig/draft';
import { apply, boneMatrices, lookLayers, samplePose, validateRig, type Vec2 } from '../src/data/art/rig/pose';

const { rig, motions, sets } = DRAFT_RIGS.spider!;
const LEGS = ['leg1b', 'leg2b', 'leg3b', 'leg4b'];
const local = (rig as unknown as { tips: { ref: Record<string, Vec2> } }).tips.ref; // 발끝(그림 좌표)
const restM = boneMatrices(rig, {}, 'ref');
/** 쉬는 자세의 발끝(화면 좌표) — 몸(ref)에 맞춘 관절·기본 각도(편집기 고정) 반영 */
const tips: Record<string, Vec2> = Object.fromEntries(LEGS.map((l) => [l, apply(restM[l]!, local[l]!)]));
const tipAt = (id: string, t: number) => Object.fromEntries(LEGS.map((l) => [l, apply(boneMatrices(rig, samplePose(rig, motions[id]!, t), 'ref')[l]!, local[l]!)]));

describe('거미형 뼈대 (GDD 115-A 106)', () => {
  it('뼈대 검사 통과, 조각 14개 그림이 있고 동작 8개(공격3 포함)', () => {
    expect(validateRig(rig, motions, sets)).toEqual([]);
    const layers = lookLayers(rig, 'spider-base');
    expect(layers.length).toBe(14);
    for (const l of layers) expect(existsSync(`docs/design/rig-draft/spider/${l.art}.png`), l.art).toBe(true);
    expect(Object.keys(motions).sort()).toEqual(['attack', 'attack2', 'attack3', 'hit', 'idle', 'move', 'release1', 'skill']);
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
    const mid = boneMatrices(rig, samplePose(rig, motions.idle!, 900), 'ref');
    expect(mid.torso![5] - restM.torso![5]).toBeGreaterThan(0.5);
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
  it('공격3: 몸을 확 치켜들고(공격2보다 높이) 앞다리 둘로 내리찍는다 — 뒷다리 둘은 바닥 밑으로 안 내려감 (115-A 114)', () => {
    const top = (id: string, t: number) => boneMatrices(rig, samplePose(rig, motions[id]!, t), 'ref').torso![5];
    const rest = restM.torso![5];
    expect(rest - top('attack3', 400)).toBeGreaterThan(8); // 몸이 8칸 넘게 뜬다
    expect(rest - top('attack3', 400)).toBeGreaterThan(rest - top('attack2', 220) + 4); // 공격2보다 확실히 높이
    const up = tipAt('attack3', 400);
    expect(tips.leg1b![1] - up.leg1b![1]).toBeGreaterThan(20);
    expect(tips.leg2b![1] - up.leg2b![1]).toBeGreaterThan(25);
    const hit = tipAt('attack3', motions.attack3!.hit!);
    expect(hit.leg2b![0]).toBeLessThan(tips.leg2b![0] - 9); // 앞으로 멀리 내리찍음(공격2보다 멀리)
    expect(Math.abs(hit.leg2b![1] - tips.leg2b![1])).toBeLessThan(1.5);
    for (let t = 0; t <= motions.attack3!.duration; t += 25) {
      const p = tipAt('attack3', t);
      for (const l of ['leg3b', 'leg4b']) expect(tips[l]![1] - p[l]![1], `${l} t${t}`).toBeGreaterThan(-0.8);
    }
  });
});

describe('부유형 뼈대 (GDD 115-A 114)', () => {
  const w = DRAFT_RIGS.wraith!;
  it('뼈대 검사 통과, 조각 16개 그림, 동작 종류 = 거미와 같은 8개', () => {
    expect(validateRig(w.rig, w.motions, w.sets)).toEqual([]);
    const layers = lookLayers(w.rig, 'wraith-base');
    expect(layers.length).toBe(16);
    for (const l of layers) expect(existsSync(`docs/design/rig-draft/wraith/${l.art}.png`), l.art).toBe(true);
    expect(Object.keys(w.motions).sort()).toEqual(Object.keys(motions).sort());
  });
  it('떠 있다: 쉬는 자세에서 가장 낮은 조각도 바닥 줄 위, 대기는 몸이 오르내린다', () => {
    const low = Math.max(...Object.values(w.rig.bodies.ref!).map((p) => p.at[1] + p.size[1]));
    expect(w.rig.ground! - low).toBeGreaterThanOrEqual(4);
    const r0 = boneMatrices(w.rig, {}).torso![5];
    expect(r0 - boneMatrices(w.rig, samplePose(w.rig, w.motions.idle!, 1300)).torso![5]).toBeGreaterThan(1.5);
    // 끊기지 않게(사용자 2026-11-12 "너무 뚝뚝 끊기네"): 키는 움직임의 양 끝에만 — 몸 높이가 오르는 동안 중간에 멈칫(같은 높이 두 번)하지 않는다
    const ys = Array.from({ length: 25 }, (_, i) => boneMatrices(w.rig, samplePose(w.rig, w.motions.idle!, 100 + i * 48)).torso![5]);
    for (let i = 1; i < ys.length; i++) expect(ys[i - 1]! - ys[i]!, `t${100 + i * 48}`).toBeGreaterThan(0.02);
  });
  it('등 가시·옷자락·꼬리는 따라가기(sway)로 흔들린다 — 동작 키 없이', () => {
    for (const b of ['spike1', 'spike2', 'wisp1', 'wisp2', 'wisp3', 'wisp4', 'tail1', 'tail2']) {
      expect(w.rig.sway?.[b], b).toBeDefined();
      expect(w.motions.idle!.tracks[b], b).toBeUndefined();
    }
    const a = samplePose(w.rig, w.motions.idle!, 300).tail2!.rot;
    const b2 = samplePose(w.rig, w.motions.idle!, 1100).tail2!.rot;
    expect(Math.abs(a - b2)).toBeGreaterThan(1);
  });
});
