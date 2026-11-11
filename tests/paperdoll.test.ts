// 종이인형 뼈대 (GDD 96장): 데이터 점검, 자세 뽑기, 뼈 행렬(부모 따라가기), 동작 전환
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { HUMANOID, MOTIONS, MOTION_SETS, apply, bodyBones, boneMatrices, insideFrame, jointMoveShift, layerMatrix, slotsOf, lookLayers, orderLayers, partMatrix, samplePose, validateRig } from '../src/data/art/rig/pose';
import { createDollClock } from '../src/ui/bha/paperdoll';

describe('종이인형 데이터', () => {
  it('뼈·슬롯·외형·동작에 문제가 없다', () => {
    expect(validateRig(HUMANOID, MOTIONS, MOTION_SETS)).toEqual([]);
  });
  it('동작: 대기·걷기·공격·공격2·특수1·특수2·맞음 + 홈 대기·필살기·스트레이트·쓰러짐·빈사·온천·박치기(GDD 115-A, C.250 게임 넣기)·주먹·발차기(118장 2)·오른손 치기·어퍼컷(GDD 204장 게임 넣기)', () => {
    expect(Object.keys(MOTIONS).sort()).toEqual(['attack', 'attack2', 'bath', 'down', 'dying', 'headbutt', 'hit', 'homeIdle', 'idle', 'kick', 'move', 'punch', 'rpunch', 'skill', 'skill2', 'straight', 'ultimate', 'uppercut']);
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
  it('사신·아란칼 머리는 같은 꼴(크기 같음 — 사신은 눈 색만 다른 전용 머리, 2026-10-28), 가면은 따로 떼지 않는다(머리카락 층에 붙음)', () => {
    const sh = lookLayers(HUMANOID, 'shinigami-base');
    const ar = lookLayers(HUMANOID, 'arrancar-base');
    expect(sh.find((l) => l.slot === 'head')!.size).toEqual(ar.find((l) => l.slot === 'head')!.size);
    // 자리는 몸마다 사용자가 맞춘다(알몸 머리 1칸 옮김, 2026-10-28)
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
        expect(insideFrame(HUMANOID, hair, hair.slot), `${look} ${hair.slot}`).toBe(true);
      }
    }
    expect(insideFrame(HUMANOID, { art: 'x', at: [40, 0], size: [10, 5] })).toBe(false);
    // 뒷머리는 길게(허리까지) 들어간다, 일반머리 틀은 그보다 짧다
    expect(insideFrame(HUMANOID, { art: 'x', at: [0, 20], size: [20, 40] }, 'hair_back')).toBe(true);
    expect(insideFrame(HUMANOID, { art: 'x', at: [0, 20], size: [20, 40] }, 'hair')).toBe(false);
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
    expect(w.parent).toBe('forearm_L'); // 왼팔을 위팔·아래팔로 나눈 뒤 칼은 아래팔에 (GDD 115-A 50)
    const m = boneMatrices(HUMANOID, {});
    const p = apply(m.weapon!, w.pivot);
    expect(p[0]).toBeCloseTo(w.pivot[0]);
    expect(p[1]).toBeCloseTo(w.pivot[1]);
    // 앞팔이 돌면 칼도 같이 돈다
    const m2 = boneMatrices(HUMANOID, { arm_L: { rot: 90, x: 0, y: 0 } });
    const [a, b] = [apply(m2.weapon!, w.pivot), apply(m2.forearm_L!, w.pivot)];
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
    // 뒷머리 층은 시트에 뒷머리가 있는 외형만(사용자 2026-10-28 — 지금은 셋 다 일반머리 하나)
    for (const look of Object.keys(HUMANOID.looks)) expect(lookLayers(HUMANOID, look).every((l) => l.slot !== 'hair_back' || typeof HUMANOID.looks[look]!.hair_back === 'object')).toBe(true);
  });
  it('엄지: 칼 잡는 앞팔에 고정(관절 없음), 칼 앞에 그려진다', () => {
    const ids = HUMANOID.slots.map((s) => s.id);
    expect(HUMANOID.slots.find((s) => s.id === 'thumb_L')!.bone).toBe('forearm_L'); // 칼 잡는 아래팔 (GDD 115-A 50)
    expect(ids.indexOf('thumb_L')).toBeGreaterThan(ids.indexOf('weapon'));
    expect(HUMANOID.bones.some((b) => b.id === 'thumb_L')).toBe(false);
  });
  it('칼: 쉬는 자세에서 칼날이 앞아래(약 60°)로 — 비스듬히 그린 칼도 같은 각도', () => {
    const w = lookLayers(HUMANOID, 'arrancar-base').find((l) => l.slot === 'weapon')!;
    const m = partMatrix(boneMatrices(HUMANOID, {}).weapon!, w.at);
    const { grip, tip } = HUMANOID.swordAxis!;
    const [g, e] = [apply(m, grip), apply(m, tip)];
    // 세로 아래에서 앞(왼쪽)으로 기운 각도
    expect(Math.abs((Math.atan2(g[0] - e[0], e[1] - g[1]) * 180) / Math.PI - 60)).toBeLessThan(4);
  });
  it('공격2: 휘두르기는 그대로, 칼날(날 쪽, 그림 오른쪽 흰 줄)이 하늘을 본다 — 칼 그림을 칼날 축으로 뒤집음', () => {
    const a2 = MOTIONS.attack2!;
    expect(a2.flip).toContain('weapon');
    const p = samplePose(HUMANOID, a2, a2.hit!);
    const mats = boneMatrices(HUMANOID, p);
    const w = lookLayers(HUMANOID, 'arrancar-base').find((l) => l.slot === 'weapon')!;
    const edge = (m: number[]) => m[1]!; // 그림 +x(날 쪽)의 화면 y 성분
    expect(edge(layerMatrix(HUMANOID, mats, w, a2))).toBeLessThan(-0.5); // 위
    expect(edge(layerMatrix(HUMANOID, mats, w))).toBeGreaterThan(0.5); // 안 뒤집으면 아래
    // 뒤집어도 손잡이·칼끝 자리는 그대로
    const { grip, tip } = HUMANOID.swordAxis!;
    const [m0, m1] = [layerMatrix(HUMANOID, mats, w), layerMatrix(HUMANOID, mats, w, a2)];
    for (const q of [grip, tip]) {
      const c: [number, number] = [q[0] + 0.5, q[1] + 0.5];
      expect(apply(m1, c)[0]).toBeCloseTo(apply(m0, c)[0], 0);
      expect(apply(m1, c)[1]).toBeCloseTo(apply(m0, c)[1], 0);
    }
  });
  it('오른팔 팔꿈치: 아래팔(forearm_R)은 위팔(arm_R)의 자식, 특수1에서 편다', () => {
    expect(HUMANOID.bones.find((b) => b.id === 'forearm_R')!.parent).toBe('arm_R');
    const s1 = MOTIONS.skill!;
    expect(samplePose(HUMANOID, s1, s1.hit!).forearm_R!.rot).toBeLessThan(-30);
  });
  it('고정값: 관절·앞뒤 순서, 아란칼 기본형(옷)·알몸 기본형의 부위·층 자리가 고정 파일과 같다', () => {
    type Part = { art: string; at: number[] };
    const lock = JSON.parse(readFileSync('src/data/art/rig/arrancar-base.lock.json', 'utf8')) as {
      pivots: Record<string, number[]>; restRot: Record<string, number>; slots: string[]; bodyJoints?: Record<string, unknown>;
      looks: Record<string, { body: string; parts: Record<string, Part>; layers: Record<string, Part> }>;
    };
    for (const b of HUMANOID.bones) {
      expect(b.pivot, b.id).toEqual(lock.pivots[b.id]);
      if (b.restRot !== undefined) expect(b.restRot, b.id).toBe(lock.restRot[b.id]);
    }
    expect(HUMANOID.slots.map((s) => s.id)).toEqual(lock.slots);
    expect(Object.fromEntries(Object.entries(HUMANOID.bodyJoints ?? {}).filter(([, v]) => typeof v === 'object'))).toEqual(lock.bodyJoints ?? {});
    for (const [lid, l] of Object.entries(lock.looks)) {
      const look = HUMANOID.looks[lid]!;
      expect(look.body, lid).toBe(l.body);
      const parts = HUMANOID.bodies[look.body]!;
      expect(Object.keys(parts).sort(), lid).toEqual(Object.keys(l.parts).sort());
      for (const [k, v] of Object.entries(parts)) expect({ art: v.art, at: v.at }, `${lid} ${k}`).toEqual(l.parts[k]);
      for (const [k, v] of Object.entries(l.layers)) {
        const cur = look[k] as Part;
        expect({ art: cur.art, at: cur.at }, `${lid} ${k}`).toEqual(v);
      }
    }
  });
  it('오른 아래팔: 걷기는 팔 흔들기를 따라 늦게 흔들리고, 공격1·2는 젖힐 때 굽혔다 칠 때 뒤로 뻗는다', () => {
    const mv = MOTIONS.move!.tracks.forearm_R!;
    expect(mv[0]![1]).toBe(mv[mv.length - 1]![1]); // 반복 이음매
    for (const id of ['attack', 'attack2']) {
      const m = MOTIONS[id]!;
      const ks = m.tracks.forearm_R!;
      // 대기 쪽 첫 키 기준(사용자가 편집기로 각도를 잡아 절대값은 바뀐다): 젖힐 때 더 굽히고 칠 때 뒤로 뻗는다
      expect(Math.max(...ks.map((k) => k[1])) - ks[0]![1], id).toBeGreaterThan(5);
      expect(samplePose(HUMANOID, m, m.hit!).forearm_R!.rot - ks[0]![1], id).toBeLessThan(-10);
    }
  });
  it('몸별 관절: 한 몸에서 옮긴 관절·기본 각도는 그 몸에만 (다른 몸은 그대로)', () => {
    const rig = JSON.parse(JSON.stringify(HUMANOID)) as typeof HUMANOID;
    rig.bodyJoints = { female: { pivots: { arm_R: [1, 2] }, rot: { forearm_R: 10 } } };
    const f = bodyBones(rig, 'female');
    expect(f.find((b) => b.id === 'arm_R')!.pivot).toEqual([1, 2]);
    expect(f.find((b) => b.id === 'forearm_R')!.restRot).toBe(10);
    expect(bodyBones(rig, 'bare').find((b) => b.id === 'arm_R')!.pivot).toEqual(HUMANOID.bones.find((b) => b.id === 'arm_R')!.pivot);
    // 기본 각도는 그 몸의 행렬에만 들어간다
    const a = boneMatrices(rig, {}, 'female').forearm_R!;
    const b = boneMatrices(rig, {}, 'bare').forearm_R!;
    expect(a[0]).not.toBeCloseTo(b[0]);
  });
  it('동작에만 쓰는 앞뒤 순서(GDD 115-A 62): order 가 있으면 그 동작에서만 그 순서, 숨김·맨 앞은 그 위에', () => {
    const layers = ['a', 'b', 'c', 'd'].map((slot) => ({ slot }));
    const base = { duration: 100, loop: false, tracks: {} };
    expect(orderLayers(layers, base).map((l) => l.slot)).toEqual(['a', 'b', 'c', 'd']);
    expect(orderLayers(layers, { ...base, order: ['c', 'a', 'b', 'd'] }).map((l) => l.slot)).toEqual(['c', 'a', 'b', 'd']);
    // 목록에 없는 층은 원래 차례대로 뒤에
    expect(orderLayers(layers, { ...base, order: ['b', 'a'] }).map((l) => l.slot)).toEqual(['b', 'a', 'c', 'd']);
    expect(orderLayers(layers, { ...base, order: ['d', 'c', 'b', 'a'], hide: ['c'], front: ['d'] }).map((l) => l.slot)).toEqual(['b', 'a', 'd']);
  });
  it('관절만 옮기기(GDD 115-A 61): 관절을 옮겨도 보정 이동(shift)으로 쉬는 자세 그림·아래 뼈는 제자리, 도는 자리만 옮겨진다', () => {
    const rig = JSON.parse(JSON.stringify(HUMANOID)) as typeof HUMANOID;
    rig.bodyJoints = { bare: { pivots: { arm_R: [24, 33], forearm_R: [32, 41] }, rot: { arm_R: 19, forearm_R: -46 } } };
    const before = boneMatrices(rig, {}, 'bare');
    const j = rig.bodyJoints.bare as { pivots: Record<string, [number, number]>; shift?: Record<string, [number, number]> };
    for (const [id, rot, d] of [['arm_R', 19, [2, -1]], ['forearm_R', -46, [-1, 3]]] as const) {
      const p = j.pivots[id]!;
      j.pivots[id] = [p[0] + d[0], p[1] + d[1]];
      const [sx, sy] = jointMoveShift(rot, [d[0], d[1]]);
      const o = (j.shift ??= {})[id] ?? [0, 0];
      j.shift[id] = [o[0] + sx, o[1] + sy];
    }
    const after = boneMatrices(rig, {}, 'bare');
    // 위팔·아래팔·손에 붙은 부위(아래 뼈 포함) 그림 칸이 같은 화면 자리
    for (const id of ['arm_R', 'forearm_R']) for (const q of [[20, 30], [35, 50], [26, 44]] as [number, number][]) {
      const a = apply(before[id]!, q), b = apply(after[id]!, q);
      expect(a[0], id).toBeCloseTo(b[0], 6);
      expect(a[1], id).toBeCloseTo(b[1], 6);
    }
    // 각도를 더 돌리면 새 관절 자리(보정 포함) 둘레로 돈다
    const pose = { forearm_R: { rot: 30, x: 0, y: 0 } };
    const m = boneMatrices(rig, pose, 'bare').forearm_R!;
    const pivotNow = apply(after.forearm_R!, j.pivots.forearm_R!);
    const turned = apply(m, j.pivots.forearm_R!);
    expect(turned[0]).toBeCloseTo(pivotNow[0], 6);
    expect(turned[1]).toBeCloseTo(pivotNow[1], 6);
  });
  it('뒷머리: 머리에 붙은 따로 뼈라 모든 동작에서 찰랑거린다(걷기는 반복 이음매가 맞다)', () => {
    expect(HUMANOID.bones.find((b) => b.id === 'hair_back')!.parent).toBe('head');
    expect(HUMANOID.slots.find((s) => s.id === 'hair_back')!.bone).toBe('hair_back');
    for (const [id, m] of Object.entries(MOTIONS)) {
      const k = m.tracks.hair_back;
      expect(k, id).toBeTruthy();
      expect(Math.max(...k!.map((x) => Math.abs(x[1]))), id).toBeGreaterThan(0);
      if (m.loop) expect(k![0]![1], id).toBe(k![k!.length - 1]![1]);
    }
  });
  it('칼집: 허리춤(몸통)에 차고 있고 손(앞팔)에 붙지 않는다, 칼 그림과 다른 빈 칼집', () => {
    const sc = HUMANOID.bones.find((b) => b.id === 'scabbard')!;
    expect(sc.parent).toBe('torso');
    for (const look of Object.keys(HUMANOID.looks)) {
      const w = lookLayers(HUMANOID, look).find((x) => x.slot === 'weapon');
      if (!w) continue; // 칼 없는 몸(역관절·덩치 — 사용자 도트, GDD 115-A 72)
      const l = lookLayers(HUMANOID, look).find((x) => x.slot === 'scabbard');
      if (!l) continue; // 칼집을 안 차는 무기(혼백의 나뭇가지 — GDD 115-A 113)
      expect(l.art).not.toBe(w.art);
    }
  });
  it('특수1: 타격 순간 뒷팔이 수평(약 90°), 특수2: 팔은 수평보다 낮고 칼날은 수평, 쏜 뒤 몸이 뒤로 밀린다(반동)', () => {
    const s1 = MOTIONS.skill!;
    // 처음 자세에서 약 90° 들어 올림(절대 각도는 사용자가 편집기로 잡은 쉬는 각도에 따라 다름)
    expect(Math.abs(samplePose(HUMANOID, s1, s1.hit!).arm_R!.rot - samplePose(HUMANOID, s1, 0).arm_R!.rot - 90)).toBeLessThan(10);
    const s2 = MOTIONS.skill2!;
    const p = samplePose(HUMANOID, s2, s2.hit!);
    expect(p.arm_L!.rot).toBeLessThan(80);
    expect(p.arm_L!.rot).toBeGreaterThan(55);
    // 칼날 화면 방향(손잡이 → 칼끝) = 앞(왼쪽)으로 수평
    const w = lookLayers(HUMANOID, 'arrancar-base').find((l) => l.slot === 'weapon')!;
    const m = partMatrix(boneMatrices(HUMANOID, p).weapon!, w.at);
    const { grip, tip } = HUMANOID.swordAxis!;
    const [g, e] = [apply(m, grip), apply(m, tip)];
    expect(Math.abs((Math.atan2(e[1] - g[1], g[0] - e[0]) * 180) / Math.PI)).toBeLessThan(4);
    // 반동: 타격 뒤 몸 전체가 뒤(오른쪽, +x)로, 앞으로는 안 나간다
    const xs = s2.tracks.root!.map((k) => k[2]);
    expect(Math.max(...xs)).toBeGreaterThan(0);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
  });
  it('공격: 칼은 팔보다 크게 꺾인다(손목 스냅) — 들어올린 순간 → 타격 순간 칼날 회전이 팔 회전보다 크다', () => {
    const atk = MOTIONS.attack!;
    const top = atk.tracks.arm_L!.reduce((m, k) => (k[1] > m[1] ? k : m))[0];
    const [p0, p1] = [samplePose(HUMANOID, atk, top), samplePose(HUMANOID, atk, atk.hit!)];
    const blade = (p: typeof p0) => p.torso!.rot + p.arm_L!.rot + p.weapon!.rot;
    expect(blade(p0) - blade(p1)).toBeGreaterThan(p0.arm_L!.rot - p1.arm_L!.rot + 30);
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

describe('몸별 그림 앞뒤 순서 bodySlots (GDD 115-A 74)', () => {
  it('몸별 순서가 있으면 그 몸만 그 순서, 다른 몸은 공통 slots 그대로', () => {
    const rig = { ...HUMANOID, bodySlots: { bare: ['arm_R', ...HUMANOID.slots.map((s) => s.id).filter((id) => id !== 'arm_R')] } };
    expect(slotsOf(rig, 'bare')[0]!.id).toBe('arm_R');
    expect(slotsOf(rig, 'student')).toBe(rig.slots); // 몸별 순서 없는 몸(사신(남)은 편집기 고정으로 따로 생김 — 115-A 110)
    expect(lookLayers(rig, 'bare-base')[0]!.slot).toBe('arm_R');
    expect(lookLayers(rig, 'shinigami-student').map((l) => l.slot)).toEqual(lookLayers(HUMANOID, 'shinigami-student').map((l) => l.slot));
  });
  it('목록에 없는 슬롯은 원래 자리 순으로 뒤에, 없는 몸·슬롯은 데이터 점검에서 잡는다', () => {
    const rig = { ...HUMANOID, bodySlots: { bare: ['head', 'torso'] } };
    expect(slotsOf(rig, 'bare').slice(0, 2).map((s) => s.id)).toEqual(['head', 'torso']);
    expect(slotsOf(rig, 'bare').length).toBe(HUMANOID.slots.length);
    const bad = { ...HUMANOID, bodySlots: { nobody: ['head'], bare: ['zz'] } };
    expect(validateRig(bad, MOTIONS, MOTION_SETS).join()).toMatch(/nobody: 몸 없음.*zz 없음|zz 없음.*nobody: 몸 없음/);
  });
});
