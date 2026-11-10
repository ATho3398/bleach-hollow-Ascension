import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
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
      expect(r.idle!.tracks.root!.some((k) => k[3] !== r.idle!.tracks.root![0]![3]), `${body} 대기 = 몸이 위아래로`).toBe(true);
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
      // 대기 = 몸 전체만 위아래(115-A 81): 관절 회전 없음, 몸이 1칸 내려갔다 올라옴(허벅지·몸통·팔·머리 같이), 정강이는 거꾸로 옮겨 제자리
      // 덩치(115-A 87): 허벅지·정강이·발은 회전 없음(허벅지는 위아래만), 몸통·고개·팔은 3° 안에서 살짝 — 팔은 앞뒤로 흔들림. 역관절은 회전 없음 그대로
      const swing = body === 'hb' ? ['torso', 'head', 'arm_L', 'forearm_L', 'arm_R', 'forearm_R'] : [];
      for (const [b, keys] of Object.entries(ms.idle!.tracks)) {
        if (swing.includes(b)) expect(keys.every((k) => Math.abs(k[1]) <= 3), `${body} 대기 ${b} 살짝`).toBe(true);
        else expect(keys.every((k) => k[1] === 0), `${body} 대기 ${b} 회전 없음`).toBe(true);
      }
      if (body === 'hb') for (const b of ['arm_L', 'arm_R']) {
        const r = ms.idle!.tracks[b]!.map((k) => k[1]);
        expect(Math.min(...r) < 0 && Math.max(...r) > 0, `덩치 대기 ${b} 앞뒤로`).toBe(true);
      }
      const ys = ms.idle!.tracks.root!.map((k) => k[3]);
      expect(Math.max(...ys) - Math.min(...ys), `${body} 대기 몸 오르내림`).toBe(1);
      const ty = ms.idle!.tracks.torso!.map((k) => k[3]);
      expect(Math.max(...ty) - Math.min(...ty), `${body} 대기 몸통·팔 더 오르내림(115-A 82)`).toBe(1);
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
  it('여자 몸 필살기: 오른 위팔 관절을 옮기지 않는다(어깨가 몸통에 붙어 있음) — GDD 115-A 84', () => {
    for (const body of ['female', 'shinigami_f', 'student_f', 'arrancar_f']) {
      const u = resolveMotions(rig, motions, sets, body).ultimate!;
      expect(u.tracks.arm_R!.every((k) => k[2] === 0 && k[3] === 0), body).toBe(true);
    }
  });
  it('덩치 색 외형(GDD 115-A 85): 모두 몸 hb·같은 동작, 그림만 색 폴더(artFolder), 색 이름이 있다', () => {
    const brutes = Object.entries(rig.looks).filter(([, l]) => l.body === 'hb');
    expect(brutes.length).toBeGreaterThanOrEqual(5);
    for (const [id, l] of brutes) {
      expect(typeof l.color, id).toBe('string');
      expect(resolveMotions(rig, motions, sets, l.body)).toEqual(resolveMotions(rig, motions, sets, 'hb'));
      const arts = lookLayers(rig, id).map((x) => x.art);
      if (l.artFolder) expect(arts.every((a) => a.startsWith(`${l.artFolder}/`)), id).toBe(true);
      else expect(arts.every((a) => a.startsWith('hb/')), id).toBe(true);
    }
    for (const c of ['보라', '빨강', '회색', '연갈색', '청록']) expect(brutes.some(([, l]) => l.color === c), c).toBe(true);
  });
  it('뒷머리·망토 마디 따라가기(GDD 115-A 88): 쉬는 자세 0, 머리를 기울이면 아래 마디는 거꾸로 늘어지고, 움직이면 늦게 따라온다', () => {
    for (const id of ['hair_back2', 'hair_back3', 'cape2', 'cape3']) expect(rig.sway?.[id], id).toBeDefined();
    expect(lookLayers(rig, 'shinigami-base-f').filter((l) => l.slot.startsWith('hair_back')).map((l) => l.slot).sort()).toEqual(['hair_back', 'hair_back2', 'hair_back3']);
    expect(lookLayers(rig, 'cape-test').filter((l) => l.slot.startsWith('cape')).length).toBe(3);
    const still = { duration: 1000, loop: true, tracks: {} };
    expect(samplePose(rig, still, 300).hair_back2!.rot).toBe(0);
    const tilt = { duration: 1000, loop: true, tracks: { head: [[0, 10, 0, 0], [1000, 10, 0, 0]] as [number, number, number, number][] } };
    const p = samplePose(rig, tilt, 500);
    expect(p.hair_back2!.rot).toBeCloseTo(-3, 5); // hang 0.3 × 10°
    expect(p.hair_back3!.rot).toBeLessThan(0);
    const swing = { duration: 1000, loop: false, tracks: { head: [[0, 0, 0, 0], [200, 20, 0, 0], [1000, 20, 0, 0]] as [number, number, number, number][] } };
    expect(samplePose(rig, swing, 150).hair_back2!.rot).toBeLessThan(samplePose(rig, swing, 600).hair_back2!.rot); // 움직이는 동안 더 뒤처짐
  });
  it('덩치 걷기(GDD 115-A 89): 늘 한 발이 바닥(80)에 닿고, 걸음마다 몸이 살짝 내려앉았다 올라오며(1~2칸), 든 다리는 무릎을 접는다', () => {
    const mv = resolveMotions(rig, motions, sets, 'hb').move!;
    const ys = mv.tracks.root!.map((k) => k[3]);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0.8);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(2.5);
    expect(Math.min(...mv.tracks.shin_R!.map((k) => k[1]))).toBeLessThan(-10);
    expect(Math.min(...mv.tracks.leg_R!.map((k) => k[3]))).toBeLessThan(0); // 든 다리는 엉덩이째 들어 올림
  });
  it('길리안(몸 hd, 처음 이름 두건, GDD 115-A 92·95·97): 머리·턱·양팔·몸통·로브 세 마디, 동작은 이동·빈사·대기·박치기·빔(특수1)·포효(해방1 = 필살기 그대로)만(쓰러짐 없음), 늘 떠 있고 로브는 하늘하늘', () => {
    expect(Object.keys(rig.bodies.hd!).sort()).toEqual(['arm_L', 'arm_R', 'cape', 'fold1', 'fold2', 'fold3', 'fold4', 'fold5', 'head', 'jaw', 'torso']); // 사용자 부위 시트 조립(115-A 93)
    for (const f of ['fold1', 'fold2', 'fold3', 'fold4', 'fold5']) expect(rig.sway?.[f]?.wave, f).toBeDefined(); // 옷 주름마다 하늘하늘
    expect(rig.looks['gillian-base']!.body).toBe('hd');
    const ms = resolveMotions(rig, motions, sets, 'hd');
    for (const id of ['idle', 'homeIdle', 'move', 'dying', 'headbutt', 'skill', 'release1', 'ultimate']) expect(ms[id], id).toBeDefined();
    for (const id of ['down', 'attack', 'attack2', 'hit', 'skill2', 'uppercut', 'rpunch', 'straight', 'bath', 'punch', 'kick']) expect(ms[id], id).toBeUndefined();
    expect(ms.ultimate!.tracks).toEqual(ms.release1!.tracks); // 필살기 = 해방1(편집기 고정 포함, 115-A 97)
    expect(ms.ultimate!.duration).toBe(ms.release1!.duration);
    expect(Math.max(...ms.idle!.tracks.root!.map((k) => k[3]))).toBeLessThan(0); // 바닥에서 떠 있음
    expect(Math.min(...ms.skill!.tracks.jaw!.map((k) => k[1]))).toBeLessThan(-30); // 입 크게 벌림
    // 로브: 가만히 있어도 물결(wave)로 흔들리고, 몸 전체가 넘어지는 것(root)은 늘어짐에 안 셈
    expect(rig.sway?.cape3?.wave).toBeDefined();
    const still = { duration: 1400, loop: true, tracks: {} };
    expect(Math.abs(samplePose(rig, still, 350).cape3!.rot)).toBeGreaterThan(1);
    const tip = { duration: 1000, loop: true, tracks: { root: [[0, -60, 0, 0], [1000, -60, 0, 0]] as [number, number, number, number][] } };
    expect(samplePose(rig, tip, 500).hair_back2!.rot).toBe(0);
  });
  it('길리안 외눈 가면 시험(GDD 115-A 101): 몸·관절·동작은 길리안 그대로, 머리 그림만 외눈 가면(빈 곳 없이 검정 채움), 강적 스티치마우스 그림(GDD 227장)', () => {
    const l = rig.looks['gillian-cyclops']!;
    expect(l.body).toBe('hd');
    expect(l.artFolder).toBe('hd-cyclops');
    const dir = 'docs/design/rig-draft/humanoid/';
    for (const part of Object.keys(rig.bodies.hd!)) {
      const a = readFileSync(`${dir}hd/${part}.png`);
      const b = readFileSync(`${dir}hd-cyclops/${part}.png`);
      expect(a.equals(b), part).toBe(part !== 'head');
    }
  });
  it('짐승형 꼬리: 꼬리 관절은 엉덩이(꼬리 그림 안), 꼬리 끝 관절은 두 마디 이음매(두 그림에 걸침) · 공격2 = 가까운 앞발 — GDD 115-A 83', () => {
    const b = DRAFT_RIGS.beast!;
    const ref = b.rig.bodies.ref!;
    const piv = (id: string) => b.rig.bones.find((x) => x.id === id)!.pivot;
    const inBox = (p: number[], s: string) => p[0]! >= ref[s]!.at[0] - 1 && p[0]! <= ref[s]!.at[0] + ref[s]!.size[0] && p[1]! >= ref[s]!.at[1] - 1 && p[1]! <= ref[s]!.at[1] + ref[s]!.size[1];
    expect(inBox(piv('tail'), 'tail')).toBe(true);
    expect(inBox(piv('tail2'), 'tail') && inBox(piv('tail2'), 'tail2')).toBe(true);
    expect(piv('tail')[1]).toBeGreaterThan(piv('tail2')[1]); // 엉덩이(아래)에서 나와 위로 솟음
    expect(Object.keys(b.motions.attack2!.tracks)).toContain('fleg_R');
    expect(Object.keys(b.motions.attack2!.tracks)).not.toContain('fleg_L');
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
  it('사용자 부위 시트(GDD 115-A 96): 조각 6개(팔 없음), 아래 몸을 옮기면 목·머리도 같이, 똬리를 옮기면 꼬리도, 꼬리 끝은 혼자', () => {
    expect(Object.keys(b.rig.bodies.ref!).sort()).toEqual(['body1', 'coil1', 'head', 'neck1', 'tail1', 'tail2']);
    expect(followMove(b.rig, 'serpent-base', 'body1')!.parts.map((p) => p.slot)).toEqual(['body1', 'neck1', 'head']);
    expect(followMove(b.rig, 'serpent-base', 'coil1')!.parts.map((p) => p.slot)).toEqual(['coil1', 'tail1', 'tail2']);
    expect(followMove(b.rig, 'serpent-base', 'tail2')!.parts.map((p) => p.slot)).toEqual(['tail2']);
  });
  it('공격2 = 밑에서 위로 쳐올리기(GDD 115-A 98): 머리를 앞아래로 숙였다가 타격 때 위로 쳐듦, 팔 트랙 없음', () => {
    const a2 = b.motions.attack2!;
    expect(a2.tracks.arm).toBeUndefined();
    const head = (t: number) => samplePose(b.rig, a2, t).head!.rot;
    const chain = (t: number) => ['body1', 'body2', 'neck1', 'neck2', 'head'].reduce((s, id) => s + samplePose(b.rig, a2, t)[id]!.rot, 0);
    expect(chain(220)).toBeLessThan(-20); // 앞아래로 모음
    expect(chain(a2.hit!)).toBeGreaterThan(20); // 위로 쳐올림
    expect(head(a2.hit!)).toBeGreaterThan(head(0));
  });
});

describe('편집기 같이 옮기기 (GDD 96장 42)', () => {
  const rig = DRAFT_RIGS.humanoid!.rig;
  it('머리를 옮기면 일반머리·뒷머리와 뒷머리 관절도 같이', () => {
    const m = followMove(rig, 'shinigami-base-f', 'head')!;
    expect(m.parts.map((p) => p.slot)).toEqual(['head', 'hair', 'hair_back', 'hair_back2', 'hair_back3']); // 뒷머리 마디(115-A 88)도 같이
    expect(m.bones).toEqual(['hair_back', 'hair_back2', 'hair_back3']);
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
    for (const s of ['hair', 'hair_back3', 'thumb_L', 'forearm_R', 'foot_L']) expect(followMove(rig, 'shinigami-base-f', s)!.parts.map((p) => p.slot)).toEqual([s]);
    expect(followMove(rig, 'shinigami-base-f', 'hair_back')!.parts.map((p) => p.slot)).toEqual(['hair_back', 'hair_back2', 'hair_back3']); // 뒷머리 마디(115-A 88)
    expect(followMove(rig, 'shinigami-base-f', 'hair_back2')!.parts.map((p) => p.slot)).toEqual(['hair_back2', 'hair_back3']);
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
    expect(motionLook(rig, 'arrancar-base-f', m, m.swapAt! - 1)).toBe('arrancar-base-f'); // 해방 시험을 기본으로(115-A 90)
    expect(motionLook(rig, 'arrancar-base-f', m, m.swapAt!)).toBe('arrancar-base-f-released');
    expect(rig.looks['arrancar-f-release-test']).toBeUndefined();
    // 남자 몸도 같은 해방 동작(사용자 2026-11-01 "아란칼 여체 보고 남자도 해방 모션 따라하라니까?") 
    for (const b of ['shinigami', 'student', 'arrancar', 'bare']) expect(resolveMotions(rig, motions, sets, b).release1?.duration, b).toBe(m.duration);
    for (const b of ['female', 'shinigami_f', 'student_f']) expect(resolveMotions(rig, motions, sets, b).release1?.duration, b).toBe(m.duration); // 여체도(사용자 2026-11-01)
  });
});
