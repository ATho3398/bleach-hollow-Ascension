// 종이인형 뼈대 (GDD 96장): 데이터 점검, 자세 뽑기, 뼈 행렬(부모 따라가기), 동작 전환
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { HUMANOID, MOTIONS, apply, boneMatrices, insideFrame, lookLayers, samplePose, validateRig } from '../src/data/art/rig/pose';
import { createDollClock } from '../src/ui/bha/paperdoll';

describe('종이인형 데이터', () => {
  it('뼈·슬롯·외형·동작에 문제가 없다', () => {
    expect(validateRig(HUMANOID, MOTIONS)).toEqual([]);
  });
  it('동작 7개(대기·걷기·공격·공격2·특수1·특수2·맞음)가 있다', () => {
    expect(Object.keys(MOTIONS).sort()).toEqual(['attack', 'attack2', 'hit', 'idle', 'move', 'skill', 'skill2']);
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
  it('사신·아란칼은 같은 머리(공통 대머리)를 쓰고, 가면은 따로 떼지 않는다(머리카락 층에 붙음)', () => {
    const sh = lookLayers(HUMANOID, 'shinigami-base');
    const ar = lookLayers(HUMANOID, 'arrancar-base');
    expect(sh.find((l) => l.slot === 'head')!.art).toBe(ar.find((l) => l.slot === 'head')!.art);
    expect(sh.find((l) => l.slot === 'head')!.at).toEqual(ar.find((l) => l.slot === 'head')!.at);
    expect([...sh, ...ar].some((l) => l.slot === 'mask')).toBe(false);
    expect(HUMANOID.slots.some((s) => s.id === 'mask')).toBe(false);
  });
});

describe('자세·행렬', () => {
  it('동작 없이(빈 자세) 모든 뼈는 제자리 = 원본 그림 그대로', () => {
    const m = boneMatrices(HUMANOID, {});
    for (const b of HUMANOID.bones) if (!b.restRot) expect(apply(m[b.id]!, [5, 7])).toEqual([5, 7]);
  });
  it('부위 그림 크기(size)가 실제 파일 크기와 같다', async () => {
    const { imageSize } = await import('./helpers/pngSize');
    for (const look of Object.keys(HUMANOID.looks)) {
      for (const l of lookLayers(HUMANOID, look)) expect(imageSize(`public/art/rig/${HUMANOID.id}/${l.art}.png`), l.art).toEqual(l.size);
    }
  });
  it('관절점은 자기 회전으로 움직이지 않는다', () => {
    const pv = HUMANOID.bones.find((b) => b.id === 'arm_L')!.pivot;
    const m = boneMatrices(HUMANOID, { arm_L: { rot: 90, x: 0, y: 0 } });
    const p = apply(m.arm_L!, pv);
    expect(p[0]).toBeCloseTo(pv[0]);
    expect(p[1]).toBeCloseTo(pv[1]);
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
  it('머리카락은 모두 머리카락 틀 안에 있다', () => {
    for (const look of Object.keys(HUMANOID.looks)) {
      for (const hair of lookLayers(HUMANOID, look).filter((l) => l.slot === 'hair' || l.slot === 'hair_back')) {
        expect(insideFrame(HUMANOID, hair), `${look} ${hair.slot}`).toBe(true);
      }
    }
    expect(insideFrame(HUMANOID, { art: 'x', at: [30, 0], size: [10, 5] })).toBe(false);
  });
  it('공격: 팔을 머리 위로 들었다가(90° 넘게) 타격 순간엔 아래로 내려찍는다', () => {
    const atk = MOTIONS.attack!;
    const up = Math.max(...atk.tracks.arm_L!.map((k) => k[1]));
    expect(up).toBeGreaterThan(90);
    expect(samplePose(HUMANOID, atk, atk.hit!).arm_L!.rot).toBeLessThan(90);
  });
  it('발목: 공격 중 발은 다리를 거꾸로 돌려 바닥과 평행(다리+발 각도 = 0)', () => {
    for (const id of ['attack', 'attack2', 'skill', 'skill2']) {
      const m = MOTIONS[id]!;
      const p = samplePose(HUMANOID, m, m.hit!);
      expect(p.leg_L!.rot + p.foot_L!.rot).toBeCloseTo(0);
    }
  });
  it('칼: 앞팔에 붙어 있고 쉬는 자세에서 손잡이가 손 자리에 있다', () => {
    const w = HUMANOID.bones.find((b) => b.id === 'weapon')!;
    expect(w.parent).toBe('arm_L');
    const m = boneMatrices(HUMANOID, {});
    const p = apply(m.weapon!, w.pivot);
    expect(p[0]).toBeCloseTo(w.pivot[0]);
    expect(p[1]).toBeCloseTo(w.pivot[1]);
    // 앞팔이 돌면 칼도 같이 돈다
    const m2 = boneMatrices(HUMANOID, { arm_L: { rot: 90, x: 0, y: 0 } });
    const [a, b] = [apply(m2.weapon!, w.pivot), apply(m2.arm_L!, w.pivot)];
    expect(a[0]).toBeCloseTo(b[0]);
    expect(a[1]).toBeCloseTo(b[1]);
  });
  it('뒷머리는 몸통 뒤, 일반머리는 머리 앞, 겉옷은 각 부위 바로 위에 그려진다', () => {
    const ids = HUMANOID.slots.map((s) => s.id);
    expect(ids.indexOf('hair_back')).toBeLessThan(ids.indexOf('torso'));
    expect(ids.indexOf('hair')).toBeGreaterThan(ids.indexOf('head'));
    for (const [o, p] of [['outer_torso', 'torso'], ['outer_arm_L', 'arm_L'], ['outer_arm_R', 'arm_R']] as const) {
      expect(ids.indexOf(o)).toBe(ids.indexOf(p) + 1);
      expect(HUMANOID.slots.find((s) => s.id === o)!.bone).toBe(p);
    }
    for (const look of Object.keys(HUMANOID.looks)) expect(lookLayers(HUMANOID, look).some((l) => l.slot === 'hair_back'), look).toBe(true);
  });
  it('칼집: 허리춤(몸통)에 차고 있고 손(앞팔)에 붙지 않는다, 칼 그림과 다른 빈 칼집', () => {
    const sc = HUMANOID.bones.find((b) => b.id === 'scabbard')!;
    expect(sc.parent).toBe('torso');
    for (const look of Object.keys(HUMANOID.looks)) {
      const l = lookLayers(HUMANOID, look).find((x) => x.slot === 'scabbard')!;
      expect(l.art).not.toBe(lookLayers(HUMANOID, look).find((x) => x.slot === 'weapon')!.art);
    }
  });
  it('특수1: 타격 순간 뒷팔이 수평(약 90°), 특수2: 칼 든 팔이 수평이고 칼날도 팔 방향', () => {
    const s1 = MOTIONS.skill!;
    expect(Math.abs(samplePose(HUMANOID, s1, s1.hit!).arm_R!.rot - 90)).toBeLessThan(10);
    const s2 = MOTIONS.skill2!;
    const p = samplePose(HUMANOID, s2, s2.hit!);
    const rest = HUMANOID.bones.find((b) => b.id === 'weapon')!.restRot ?? 0;
    expect(Math.abs(p.arm_L!.rot - 90)).toBeLessThan(10);
    expect(Math.abs(p.weapon!.rot + rest)).toBeLessThan(5);
  });
  it('대기: 내쉰 자세(몸 1칸 아래)에서 잠깐 머문다', () => {
    const idle = MOTIONS.idle!;
    const keys = idle.tracks.torso!.filter((k) => k[3] === 1);
    expect(keys.length).toBeGreaterThanOrEqual(2);
    expect(keys[keys.length - 1]![0] - keys[0]![0]).toBeGreaterThanOrEqual(400);
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
