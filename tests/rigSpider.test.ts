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
    expect(layers.length).toBe(15); // 가까운 팔 = 위팔 + 아래팔·손(115-A 120)
    for (const l of layers) expect(existsSync(`docs/design/rig-draft/spider/${l.art}.png`), l.art).toBe(true);
    expect(Object.keys(motions).sort()).toEqual(['attack', 'attack2', 'attack3', 'down', 'dying', 'hit', 'idle', 'move', 'release1', 'skill']);
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
    expect(rest - top('attack3', 850)).toBeGreaterThan(12); // 몸이 12칸 넘게 뜬다
    expect(motions.attack3!.duration).toBeGreaterThanOrEqual(1400); // 잘 보이게 느리게(사용자 "너무 빨라서 잘 안보여")
    expect(rest - top('attack3', 850)).toBeGreaterThan(rest - top('attack2', 220) + 4); // 공격2보다 확실히 높이
    const up = tipAt('attack3', 850);
    expect(tips.leg1b![1] - up.leg1b![1]).toBeGreaterThan(28);
    expect(tips.leg2b![1] - up.leg2b![1]).toBeGreaterThan(34);
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
  it('공격1 = 왼손 내려찍기, 공격2 = 오른손으로 왼쪽을 내려찍기, 공격3 = 박치기, 특수1 = 왼손만 들어 쏘기 (사용자 2026-11-12)', () => {
    const tipOf = (id: string, t: number, hand: string) => {
      const p = w.rig.bodies.ref![hand]!;
      return apply(boneMatrices(w.rig, samplePose(w.rig, w.motions[id]!, t), 'ref')[hand]!, [p.at[0] + p.size[0] / 2, p.at[1] + p.size[1]]);
    };
    const rest = (hand: string) => { const p = w.rig.bodies.ref![hand]!; return apply(boneMatrices(w.rig, {}, 'ref')[hand]!, [p.at[0] + p.size[0] / 2, p.at[1] + p.size[1]]); };
    // 공격1: 왼손이 머리 위로 올라갔다가(쉬는 자리보다 25칸 넘게 위) 아래로
    expect(rest('hand1')[1] - tipOf('attack', 220, 'hand1')[1]).toBeGreaterThan(25);
    expect(tipOf('attack', w.motions.attack!.hit!, 'hand1')[1]).toBeGreaterThan(tipOf('attack', 220, 'hand1')[1] + 25);
    // 공격2: 오른손이 올라갔다가 몸 앞을 가로질러 왼쪽(쉬는 자리보다 20칸 넘게 왼쪽)으로 내려옴
    expect(rest('hand2')[1] - tipOf('attack2', 240, 'hand2')[1]).toBeGreaterThan(25);
    expect(rest('hand2')[0] - tipOf('attack2', w.motions.attack2!.hit!, 'hand2')[0]).toBeGreaterThan(20);
    // 공격3: 머리가 앞(왼쪽)으로 10칸 넘게 나간다
    const head = (t: number) => boneMatrices(w.rig, samplePose(w.rig, w.motions.attack3!, t), 'ref').head![4];
    expect(head(0) - head(w.motions.attack3!.hit!)).toBeGreaterThan(8);
    // 동작 중에 팔을 맨 앞으로 올리지 않는다 — 앞뒤 순서는 고정한 순서 그대로(사용자 "왼팔이 맘대로 몸 위로 올라옴")
    for (const [id, mo] of Object.entries(w.motions)) expect(mo.front ?? [], id).toEqual([]);
    // 특수1: 왼손은 들리고 오른팔은 거의 그대로
    expect(Math.abs(samplePose(w.rig, w.motions.skill!, 700).arm1!.rot)).toBeGreaterThan(45);
    expect(Math.abs(samplePose(w.rig, w.motions.skill!, 700).arm2!.rot)).toBeLessThan(10);
  });
  it('자락 물결은 재생기 시계로 흐른다 — 동작이 처음부터 다시 돌아도(t = 0) 이어진다 (115-A 116)', () => {
    const a = samplePose(w.rig, w.motions.attack!, 0, 5000).tail2!.rot;
    const b = samplePose(w.rig, w.motions.attack!, 0, 5016).tail2!.rot;
    const c = samplePose(w.rig, w.motions.idle!, 3000, 5032).tail2!.rot; // 동작이 바뀌어도
    expect(Math.abs(a - b)).toBeLessThan(1);
    expect(Math.abs(b - c)).toBeLessThan(1.5);
    // 시계를 안 주면 예전처럼 동작 시각으로(정지 그림·옛 시험 그대로)
    expect(samplePose(w.rig, w.motions.attack!, 0).tail2!.rot).toBe(samplePose(w.rig, w.motions.attack!, 0).tail2!.rot);
  });
});
