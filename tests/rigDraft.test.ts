import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { DRAFT_RIGS } from '../scripts/rig/draft';
import { followMove } from '../scripts/rig/follow';
import { createDollClock } from '../src/ui/bha/paperdoll';
import { boneMatrices, lookLayers, motionLook, orderLayers, resolveMotions, samplePose, validateRig, apply } from '../src/data/art/rig/pose';

describe('종이인형 작업본 (GDD 96장 36): 고정한 값이 먼저 들어가는 곳 — 게임본과 따로', () => {
  for (const [id, d] of Object.entries(DRAFT_RIGS)) {
    it(`${id}: 작업본 데이터에 문제가 없다(동작 묶음 포함)`, () => {
      expect(validateRig(d.rig, d.motions, d.sets)).toEqual([]);
    });
    it(`${id}: 작업본이 가리키는 그림이 작업본 그림 폴더에 다 있다`, () => {
      for (const look of Object.keys(d.rig.looks)) {
        for (const l of lookLayers(d.rig, look)) expect(existsSync(`docs/design/rig-draft/${id}/${l.art}.png`), `${look} ${l.art}`).toBe(true);
      }
    });
  }
});

describe('역관절 다리·망토·짐승형 (GDD 96장 39~41)', () => {
  const { rig, motions, sets } = DRAFT_RIGS.humanoid!;
  it('정강이 그림이 없는 몸은 기본 동작에서 발이 다리를 그대로 따라간다(정강이 0°)', () => {
    for (const m of Object.values(motions)) expect(m.tracks.shin_L ?? m.tracks.shin_R).toBeUndefined();
  });
  it('역관절 기본은 전용 동작 11개를 쓴다(모든 뼈를 묶음에서 정함, 칼 설정 없음) — GDD 115-A 70', () => {
    const dg = resolveMotions(rig, motions, sets, 'dg');
    const own = ['idle', 'homeIdle', 'move', 'attack', 'attack2', 'skill', 'hit', 'release1', 'headbutt', 'dying', 'down'];
    expect(Object.keys(sets.digitigrade!).filter((k) => k !== 'note').sort()).toEqual([...own].sort());
    for (const id of own) {
      for (const b of ['root', 'torso', 'head', 'arm_L', 'forearm_L', 'arm_R', 'forearm_R', 'leg_L', 'shin_L', 'foot_L', 'leg_R', 'shin_R', 'foot_R']) {
        expect(sets.digitigrade![id]!.tracks[b], `${id}.${b}`).toBeDefined();
      }
      expect(dg[id]!.flip ?? [], id).toEqual([]);
      expect(dg[id]!.fx ?? [], id).toEqual([]);
    }
    expect(dg.move!.tracks.shin_L!.some((k) => k[1] !== 0)).toBe(true); // 걷기에서 정강이가 접힌다
    expect(dg.down!.hold).toBe(true);
    expect(resolveMotions(rig, motions, sets)).toBe(motions); // 몸 없으면 기본 동작 그대로
  });
  it('역관절 걷기: 늘 한 발은 디뎌 있고(발목이 쉬는 자세 높이 그대로) 바닥에 묻히지 않는다 — 역관절 기본 = 사용자 도트(GDD 115-A 69)', () => {
    const dg = resolveMotions(rig, motions, sets, 'dg');
    const piv = (rig.bodyJoints!.dg as { pivots: Record<string, [number, number]> }).pivots;
    const tol = 0.6 * ((rig as { cuts?: Record<string, { scale?: number }> }).cuts?.dg?.scale ?? 1); // 도트 배율만큼(2배 = 1.2칸, 115-A 71)
    for (let t = 0; t <= dg.move!.duration; t += 40) {
      const m = boneMatrices(rig, samplePose(rig, dg.move!, t), 'dg');
      const lift = (['foot_L', 'foot_R'] as const).map((f) => piv[f]![1] - apply(m[f]!, piv[f]!)[1]); // + = 뜸, - = 묻힘
      expect(Math.min(...lift), `t=${t} 디딘 발`).toBeLessThan(tol);
      expect(Math.min(...lift), `t=${t} 묻힘`).toBeGreaterThan(-tol);
    }
  });
  it('덩치(사용자 도트, 115-A 72): 부위 12개, 전용 묶음 = 대기·걷기·공격(모든 뼈), 걷기에서 늘 한 발은 디딤', () => {
    expect(Object.keys(rig.bodies.hb!).sort()).toEqual(['arm_L', 'arm_R', 'foot_L', 'foot_R', 'forearm_L', 'forearm_R', 'head', 'leg_L', 'leg_R', 'shin_L', 'shin_R', 'torso']);
    expect(rig.looks['brute-base']!.body).toBe('hb');
    expect(Object.keys(sets.brute!).filter((k) => k !== 'note').sort()).toEqual(['attack', 'idle', 'move']);
    const hb = resolveMotions(rig, motions, sets, 'hb');
    for (const id of ['idle', 'move', 'attack']) for (const b of ['root', 'torso', 'head', 'arm_L', 'forearm_L', 'arm_R', 'forearm_R', 'leg_L', 'shin_L', 'foot_L', 'leg_R', 'shin_R', 'foot_R']) expect(sets.brute![id]!.tracks[b], `${id}.${b}`).toBeDefined();
    const piv = (rig.bodyJoints!.hb as { pivots: Record<string, [number, number]> }).pivots;
    for (let t = 0; t <= hb.move!.duration; t += 40) {
      const m = boneMatrices(rig, samplePose(rig, hb.move!, t), 'hb');
      const lift = (['foot_L', 'foot_R'] as const).map((f) => piv[f]![1] - apply(m[f]!, piv[f]!)[1]);
      expect(Math.min(...lift), `t=${t}`).toBeLessThan(1.2);
      expect(Math.min(...lift), `t=${t}`).toBeGreaterThan(-1.2);
    }
  });
  it('짐승형 걷기: 대각선 짝 다리가 같이 움직인다', () => {
    const b = DRAFT_RIGS.beast!;
    const mv = b.motions.move!;
    const at = (bone: string, t: number) => samplePose(b.rig, mv, t)[bone]!.rot;
    for (const t of [0, 90, 360, 450]) {
      expect(Math.sign(at('fleg_R', t))).toBe(Math.sign(at('hleg_L', t)));
      expect(at('fleg_R', t) * at('fleg_L', t)).toBeLessThan(0);
    }
  });
});

describe('뱀형 (GDD 115-A 44·45, 사용자 도트 형태)', () => {
  const b = DRAFT_RIGS.serpent!;
  it('기어가기: 물결이 몸통 1 → 몸통 2 → 목으로 4분의 1 박자씩 늦게 흐른다', () => {
    const T = b.motions.move!.duration;
    // 마디가 가장 크게(+) 휘는 순간
    const peak = (bone: string) => b.motions.move!.tracks[bone]!.reduce((m, k) => (k[1] > m[1] ? k : m))[0];
    expect(peak('body2') - peak('body1')).toBe(T / 4);
    expect(peak('neck1') - peak('body2')).toBe(T / 4);
  });
  it('가슴(몸통 2)을 옮기면 목·머리·팔도 같이, 꼬리 끝은 혼자', () => {
    expect(followMove(b.rig, 'serpent-test', 'body2')!.parts.map((p) => p.slot)).toEqual(['body2', 'neck1', 'neck2', 'head', 'arm']);
    expect(followMove(b.rig, 'serpent-test', 'tail2')!.parts.map((p) => p.slot)).toEqual(['tail2']);
  });
});

describe('편집기 같이 옮기기 (GDD 96장 42)', () => {
  const rig = DRAFT_RIGS.humanoid!.rig;
  it('머리를 옮기면 일반머리·뒷머리와 뒷머리 관절도 같이', () => {
    const m = followMove(rig, 'shinigami-base-f', 'head')!;
    expect(m.parts.map((p) => p.slot)).toEqual(['head', 'hair', 'hair_back']);
    expect(m.bones).toEqual(['hair_back']);
  });
  it('오른 위팔 → 아래팔(팔꿈치 관절 포함), 왼 위팔 → 아래팔·엄지, 다리 → 정강이·발(무릎·발목 관절)', () => {
    expect(followMove(rig, 'bare-base', 'arm_R')!.parts.map((p) => p.slot)).toEqual(['arm_R', 'forearm_R']);
    expect(followMove(rig, 'bare-base', 'arm_R')!.bones).toEqual(['forearm_R']);
    expect(followMove(rig, 'bare-base', 'arm_L')!.parts.map((p) => p.slot)).toEqual(['arm_L', 'forearm_L', 'thumb_L']);
    expect(followMove(rig, 'bare-base', 'arm_L')!.bones).toEqual(['forearm_L']);
    expect(followMove(rig, 'bare-base', 'forearm_L')!.parts.map((p) => p.slot)).toEqual(['forearm_L', 'thumb_L']);
    expect(followMove(rig, 'digitigrade-base', 'leg_L')!.parts.map((p) => p.slot)).toEqual(['leg_L', 'shin_L', 'foot_L']);
    expect(followMove(rig, 'digitigrade-base', 'leg_L')!.bones).toEqual(['shin_L', 'foot_L']);
  });
  it('뒤에 오는 부위를 옮기면 그것만', () => {
    for (const s of ['hair', 'hair_back', 'thumb_L', 'forearm_R', 'foot_L']) expect(followMove(rig, 'shinigami-base-f', s)!.parts.map((p) => p.slot)).toEqual([s]);
    expect(followMove(rig, 'digitigrade-base', 'shin_L')!.parts.map((p) => p.slot)).toEqual(['shin_L', 'foot_L']);
  });
});

describe('필살기·해방·타격기 (GDD 115-A 48·49·51)', () => {
  const { rig, motions, sets } = DRAFT_RIGS.humanoid!;
  const ult = motions.ultimate!;
  it('필살기: 왼 아래팔·칼·엄지만 맨 위로, 왼 위팔은 제자리', () => {
    const base = lookLayers(rig, 'shinigami-base').map((l) => l.slot);
    const order = orderLayers(lookLayers(rig, 'shinigami-base'), ult).map((l) => l.slot);
    expect(order.slice(-3)).toEqual(['forearm_L', 'weapon', 'thumb_L']);
    expect(order.indexOf('arm_L')).toBe(base.indexOf('arm_L'));
    expect(ult.fx).toBeUndefined(); // 이펙트는 지움(사용자 "이펙트는 다 지워")
  });
  it('기본 동작마다 왼 아래팔이 움직인다(나눠만 놓고 똑같이 움직이지 않게)', () => {
    for (const id of ['idle', 'move', 'attack', 'attack2', 'skill', 'skill2', 'hit', 'ultimate']) expect(motions[id]!.tracks.forearm_L, id).toBeDefined();
  });
  it('스트레이트(칼 든 손, 칼 숨김) — 잽·옆차기는 없앰', () => {
    for (const id of ['jab', 'sidekick', 'sidekick2']) expect(motions[id], id).toBeUndefined();
    expect(orderLayers(lookLayers(rig, 'shinigami-base'), motions.straight).some((l) => l.slot === 'weapon')).toBe(false);
  });
  it('온천: 반복, 칼·칼집만 숨김(다리는 보임 — 사용자 "다리 왜 맘대로 없애냐"), 윗몸을 뒤로 기댐', () => {
    const b = motions.bath!;
    expect(b.loop).toBe(true);
    const shown = orderLayers(lookLayers(rig, 'arrancar-base-f'), b).map((l) => l.slot);
    for (const s of ['leg_L', 'leg_R', 'foot_L']) expect(shown).toContain(s);
    for (const s of ['weapon', 'scabbard']) expect(shown).not.toContain(s);
    expect(b.tracks.torso![0]![1]).toBeGreaterThan(20);
  });
  it('쓰러짐은 끝 자세로 멈춰 있고(엎드림), 빈사는 반복 동작(허리 굽힘, 90° 아님)', () => {
    const c = createDollClock(motions);
    c.play('down');
    c.advance(2000);
    expect(c.current?.id).toBe('down');
    expect(Math.abs(samplePose(rig, motions.down!, motions.down!.duration).root!.rot)).toBeGreaterThan(80);
    c.setLoop('idle');
    expect(c.current?.id).toBe('idle');
    const bend = motions.dying!.tracks.torso!.map((k) => k[1]);
    expect(motions.dying!.loop).toBe(true);
    expect(Math.min(...bend)).toBeLessThan(-5); // 사용자 2026-10-31 편집기로 잡은 알몸 빈사 = 허리 7~11°
    expect(Math.min(...bend)).toBeGreaterThan(-60);
  });
  it('대기 = 팔 내린 자세(오른팔 아래로), 홈 대기 = 예전 대기(검집 잡음), 걷기 오른팔은 대기 기준', () => {
    const arm = (id: string) => motions[id]!.tracks.arm_R!.map((k) => k[1]);
    expect(motions.homeIdle!.loop).toBe(true);
    expect(Math.min(...arm('idle'))).toBeGreaterThan(15);
    expect(Math.max(...arm('homeIdle'))).toBeLessThan(Math.min(...arm('idle')));
    expect(Math.min(...arm('move'))).toBeGreaterThan(15);
    // 몸 그림마다 팔 쉬는 각이 달라 몸 묶음으로 맞춤: 아란칼(여) = 사용자 편집기 그림 각도(위팔 28°·아래팔 -47° = 몸 각도 14°·-15° + 동작 14°·-32°)
    const af = resolveMotions(rig, motions, sets, 'arrancar_f').idle!.tracks;
    expect([af.arm_R![0]![1], af.forearm_R![0]![1]]).toEqual([14, -32]);
    for (const b of ['female', 'student', 'student_f', 'shinigami_f']) expect(resolveMotions(rig, motions, sets, b).idle!.tracks.arm_R, b).not.toEqual(motions.idle!.tracks.arm_R);
  });
  it('팔이 떨어지지 않게: 필살기 왼 아래팔·칼·발 뼈는 위치 이동 키가 1칸 넘게 없다(오른 아래팔은 사용자가 잡음, 몸 묶음 포함 — 사용자 "필살기 쓰는거 보면 얘들 팔 떨어지잖아")', () => {
    const all = [motions, ...Object.values(sets).map((st) => st as Record<string, { tracks?: Record<string, number[][]> }>)];
    // 필살기만(다른 동작은 사용자가 편집기로 아래팔을 옮겨 잡기도 함 — 온천 등)
    for (const ms of all) for (const [id, m] of Object.entries(ms).filter(([k]) => k === 'ultimate')) {
      // 오른 아래팔은 사용자가 편집기로 직접 위치를 잡는다(2026-11-01 02:24 3칸 → 02:54 4칸 아래, GDD 115-A 60) — 시험 안 함
      for (const b of ['forearm_L', 'weapon', 'shin_L', 'shin_R', 'foot_L', 'foot_R']) {
        // 사용자가 편집기로 1칸 옮겨 잡은 것은 허용(2026-10-31 알몸 필살기 아래팔)
        for (const k of (m as { tracks?: Record<string, number[][]> }).tracks?.[b] ?? []) expect(Math.max(Math.abs(k[2]!), Math.abs(k[3]!)), `${id} ${b}`).toBeLessThanOrEqual(1);
      }
    }
  });
  it('해방 동작(양손으로 칼 내밀고 변신): 사람형 몸 전부, 하나, swapAt 이 지나면 해방 외형', () => {
    const af = resolveMotions(rig, motions, sets, 'arrancar_f');
    const m = af.release1!;
    expect(af.release2).toBeUndefined();
    expect(motionLook(rig, 'arrancar-f-release-test', m, m.swapAt! - 1)).toBe('arrancar-f-release-test');
    expect(motionLook(rig, 'arrancar-f-release-test', m, m.swapAt!)).toBe('arrancar-f-released-test');
    // 남자 몸도 같은 해방 동작(사용자 2026-11-01 "아란칼 여체 보고 남자도 해방 모션 따라하라니까?") 
    for (const b of ['shinigami', 'student', 'arrancar', 'bare']) expect(resolveMotions(rig, motions, sets, b).release1?.duration, b).toBe(m.duration);
    for (const b of ['female', 'shinigami_f', 'student_f']) expect(resolveMotions(rig, motions, sets, b).release1?.duration, b).toBe(m.duration); // 여체도(사용자 2026-11-01)
  });
});
