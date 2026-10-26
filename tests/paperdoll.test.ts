// 종이인형 뼈대 (GDD 96장): 데이터 점검, 자세 뽑기, 뼈 행렬(부모 따라가기), 동작 전환
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { HUMANOID, MOTIONS, apply, boneMatrices, lookLayers, samplePose, validateRig } from '../src/data/art/rig/pose';
import { createDollClock } from '../src/ui/bha/paperdoll';

describe('종이인형 데이터', () => {
  it('뼈·슬롯·외형·동작에 문제가 없다', () => {
    expect(validateRig(HUMANOID, MOTIONS)).toEqual([]);
  });
  it('기본 동작 4개(대기·걷기·공격·맞음)가 있다', () => {
    expect(Object.keys(MOTIONS).sort()).toEqual(['attack', 'hit', 'idle', 'move']);
    expect(MOTIONS.idle!.loop && MOTIONS.move!.loop).toBe(true);
    expect(MOTIONS.attack!.hit).toBeGreaterThan(0);
  });
  it('외형마다 그림 파일이 다 있다', () => {
    for (const look of Object.keys(HUMANOID.looks)) {
      for (const l of lookLayers(HUMANOID, look)) {
        expect(existsSync(`public/art/rig/${HUMANOID.id}/${l.art}.png`), `${look} ${l.art}`).toBe(true);
      }
    }
  });
  it('사신·아란칼은 같은 머리(공통 대머리)를 쓰고, 아란칼만 가면 층이 있다', () => {
    const sh = lookLayers(HUMANOID, 'shinigami-base');
    const ar = lookLayers(HUMANOID, 'arrancar-base');
    expect(sh.find((l) => l.slot === 'head')!.art).toBe(ar.find((l) => l.slot === 'head')!.art);
    expect(sh.some((l) => l.slot === 'mask')).toBe(false);
    expect(ar.some((l) => l.slot === 'mask')).toBe(true);
  });
});

describe('자세·행렬', () => {
  it('동작 없이(빈 자세) 모든 뼈는 제자리 = 원본 그림 그대로', () => {
    const m = boneMatrices(HUMANOID, {});
    for (const b of HUMANOID.bones) expect(apply(m[b.id]!, [5, 7])).toEqual([5, 7]);
  });
  it('관절점은 자기 회전으로 움직이지 않는다', () => {
    const m = boneMatrices(HUMANOID, { arm_L: { rot: 90, x: 0, y: 0 } });
    const p = apply(m.arm_L!, [8, 38]);
    expect(p[0]).toBeCloseTo(8);
    expect(p[1]).toBeCloseTo(38);
  });
  it('몸통이 움직이면 머리·팔이 따라가고 다리는 안 따라간다', () => {
    const m = boneMatrices(HUMANOID, { torso: { rot: 0, x: 3, y: 1 } });
    expect(apply(m.head!, [17, 29])).toEqual([20, 30]);
    expect(apply(m.arm_R!, [28, 39])).toEqual([31, 40]);
    expect(apply(m.leg_L!, [10, 57])).toEqual([10, 57]);
  });
  it('반복 동작은 길이로 감기고, 한 번 동작은 끝에서 멈춘다', () => {
    const idle = MOTIONS.idle!;
    expect(samplePose(HUMANOID, idle, 350).torso).toEqual(samplePose(HUMANOID, idle, 350 + idle.duration).torso);
    const atk = MOTIONS.attack!;
    expect(samplePose(HUMANOID, atk, atk.duration + 500).arm_L).toEqual(samplePose(HUMANOID, atk, atk.duration).arm_L);
  });
  it('걷기: 양 다리는 반대로 흔든다', () => {
    const p = samplePose(HUMANOID, MOTIONS.move!, 0);
    expect(Math.sign(p.leg_L!.rot)).toBe(-Math.sign(p.leg_R!.rot));
  });
});

describe('동작 전환', () => {
  it('공격: 타격 순간 onHit, 끝나면 onEnd 후 쉬는 동작으로', () => {
    const c = createDollClock(MOTIONS);
    const log: string[] = [];
    expect(c.play('attack', { onHit: () => log.push('hit'), onEnd: () => log.push('end') })).toBe(true);
    c.advance(MOTIONS.attack!.hit! - 1);
    expect(log).toEqual([]);
    c.advance(2);
    expect(log).toEqual(['hit']);
    c.advance(MOTIONS.attack!.duration);
    expect(log).toEqual(['hit', 'end']);
    expect(c.current!.id).toBe('idle');
  });
  it('없는 동작은 false', () => {
    expect(createDollClock(MOTIONS).play('dance')).toBe(false);
  });
  it('걷는 중(반복 move)에도 공격 후엔 move 로 돌아간다', () => {
    const c = createDollClock(MOTIONS);
    c.setLoop('move');
    c.play('attack');
    c.advance(MOTIONS.attack!.duration + 1);
    expect(c.current!.id).toBe('move');
  });
});
