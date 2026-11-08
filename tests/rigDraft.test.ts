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
  it('호로 몸(역관절·덩치)은 전용 동작만: 홈대기=대기, 해방=필살기, 어퍼컷·오른손치기·스트레이트·특수2·온천 등은 없음 — GDD 115-A 70·76', () => {
    const own = ['idle', 'homeIdle', 'move', 'attack', 'attack2', 'skill', 'hit', 'release1', 'ultimate', 'headbutt', 'dying', 'down'];
    for (const body of ['dg', 'hb']) {
      const r = resolveMotions(rig, motions, sets, body);
      const set = sets[rig.bodyMotions![body]!]!;
      for (const id of own) expect(r[id], `${body}.${id}`).toBeDefined();
      for (const id of ['skill2', 'uppercut', 'rpunch', 'straight', 'bath', 'punch', 'kick']) expect(r[id], `${body}.${id} 없음`).toBeUndefined();
      expect(set.homeIdle!.tracks, `${body} 홈대기 = 대기`).toEqual(set.idle!.tracks);
      expect(set.ultimate!.tracks, `${body} 필살기 = 해방`).toEqual(set.release1!.tracks);
      for (const id of own.filter((x) => x !== 'skill' || body === 'dg')) {
        for (const b of ['root', 'torso', 'head', 'arm_L', 'forearm_L', 'arm_R', 'forearm_R', 'leg_L', 'shin_L', 'leg_R', 'shin_R']) expect(set[id]!.tracks?.[b], `${body}.${id}.${b}`).toBeDefined();
      }
      expect(r.idle!.tracks.leg_R!.some((k) => Math.abs(k[1]) >= 1), `${body} 대기 허벅지`).toBe(true);
      expect(r.down!.hold).toBe(true);
    }
    expect(resolveMotions(rig, motions, sets, 'bare').uppercut).toBeDefined(); // 다른 몸은 그대로
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
  it('덩치 = 사용자 부위 시트 조립(115-A 73·75): 부위 10개(발 없음 — 종아리에 붙음), 부위 시트 b(새 도트), 특수2 없음, 걷기에서 늘 한 발은 디딤', () => {
    expect(Object.keys(rig.bodies.hb!).sort()).toEqual(['arm_L', 'arm_R', 'forearm_L', 'forearm_R', 'head', 'leg_L', 'leg_R', 'shin_L', 'shin_R', 'torso']);
    expect(rig.looks['brute-base']!.body).toBe('hb');
    expect(rig.looks['beast-base']).toBeUndefined(); // 짐승은 원래(네 발 짐승 뼈대 beast-test)대로
    const hb = resolveMotions(rig, motions, sets, 'hb');
    expect(hb.skill2).toBeUndefined();
    expect(resolveMotions(rig, motions, sets, 'bare').skill2).toBeDefined(); // 다른 몸은 그대로
    // 종아리 그림 아래 가운데(어림): 디딘 다리는 바닥 줄(80) 근처 — 다리를 위로 올린 고정(01:35) 뒤로 몸을 내려 맞춤
    for (let t = 0; t <= hb.move!.duration; t += 40) {
      const m = boneMatrices(rig, samplePose(rig, hb.move!, t), 'hb');
      const gap = (['shin_L', 'shin_R'] as const).map((s) => { const p = rig.bodies.hb![s]!; return 80 - apply(m[s]!, [p.at[0] + p.size[0] / 2, p.at[1] + p.size[1]])[1]; });
      expect(Math.min(...gap.map(Math.abs)), `t=${t}`).toBeLessThan(3);
    }
  });
  it('제자리 동작은 두 발바닥이 위아래로 안 움직인다(GDD 115-A 77) — 사람형 몸 전부·역관절·덩치', () => {
    const standing = ['idle', 'homeIdle', 'dying', 'skill', 'skill2', 'release1', 'hit', 'attack', 'attack2'];
    for (const body of ['bare', 'female', 'shinigami', 'shinigami_f', 'student', 'student_f', 'arrancar', 'arrancar_f', 'dg', 'hb']) {
      const ms = resolveMotions(rig, motions, sets, body);
      const piv = ((rig.bodyJoints?.[body] ?? {}) as { pivots?: Record<string, [number, number]> }).pivots ?? {};
      const calf = !rig.bodies[body]!.foot_L; // 덩치: 종아리에 발
      const pt = (s: string): [number, number] => {
        if (!calf) return (piv[s] ?? rig.bones.find((b) => b.id === s)!.pivot) as [number, number];
        const p = rig.bodies[body]![s]!;
        return [p.at[0] + p.size[0] / 2, p.at[1] + p.size[1]];
      };
      const ends = calf ? ['shin_L', 'shin_R'] : ['foot_L', 'foot_R'];
      for (const id of standing) {
        const m = ms[id];
        if (!m) continue;
        for (const s of ends) {
          let lo = 1e9;
          let hi = -1e9;
          for (let t = 0; t <= m.duration; t += 10) {
            const y = apply(boneMatrices(rig, samplePose(rig, m, t), body)[s]!, pt(s))[1];
            lo = Math.min(lo, y);
            hi = Math.max(hi, y);
          }
          expect(hi - lo, `${body}.${id}.${s}`).toBeLessThan(calf ? 3 : 0.3); // 덩치는 종아리가 기울어 그림 상자 아래 가운데로 어림(실제 발바닥 칸은 0.2칸 안 — plant.py 계산)
        }
      }
    }
  });
  it('호로 몸(역관절·덩치) 제자리 동작: 허벅지가 움직이고 정강이는 화면 기울기 고정(GDD 115-A 78)', () => {
    for (const body of ['dg', 'hb']) {
      const ms = resolveMotions(rig, motions, sets, body);
      for (const id of ['idle', 'homeIdle', 'dying', 'skill', 'release1', 'hit', 'attack', 'attack2', 'headbutt']) {
        const m = ms[id]!;
        for (const s of ['shin_L', 'shin_R']) {
          let lo = 1e9;
          let hi = -1e9;
          for (let t = 0; t <= m.duration; t += 50) {
            const w = boneMatrices(rig, samplePose(rig, m, t), body)[s]!;
            const a = (Math.atan2(w[1], w[0]) * 180) / Math.PI;
            lo = Math.min(lo, a);
            hi = Math.max(hi, a);
          }
          expect(hi - lo, `${body}.${id}.${s} 정강이 기울기`).toBeLessThan(1);
        }
      }
      const thigh = ms.idle!.tracks.leg_L!.map((k) => k[1]).concat(ms.idle!.tracks.leg_R!.map((k) => k[1]));
      expect(Math.max(...thigh.map(Math.abs)), `${body} 대기 허벅지`).toBeGreaterThan(1);
      expect(Math.max(...thigh.map(Math.abs)), `${body} 대기는 숨쉬기만(115-A 80)`).toBeLessThan(8);
      for (const b of ['torso', 'arm_L', 'arm_R']) expect(Math.max(...ms.idle!.tracks[b]!.map((k) => Math.abs(k[1]))), `${body} 대기 ${b}`).toBeLessThanOrEqual(2);
    }
  });
  it('짐승형 앞다리: 아래로 곧게 디딘 다리 = 가까운 앞다리(fleg_R, 몸 앞에 그림), 앞으로 뻗은 다리 = 먼 앞다리(fleg_L, 몸 뒤) — GDD 115-A 79', () => {
    const b = DRAFT_RIGS.beast!;
    const ref = b.rig.bodies.ref!;
    expect(ref.fleg_L2!.at[0]).toBeLessThan(ref.fleg_R2!.at[0]); // 먼 앞발이 더 앞(왼쪽)
    const order = b.rig.slots.map((s) => s.id);
    expect(order.indexOf('fleg_R')).toBeGreaterThan(order.indexOf('body'));
    expect(order.indexOf('fleg_L')).toBeLessThan(order.indexOf('body'));
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
