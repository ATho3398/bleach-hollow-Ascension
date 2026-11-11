// C.402 (GDD 241-F 2, 115-A 119·120): 호로 모델 빈사·쓰러짐 채우기, 짐승 공격3, 거미 팔 관절, 가시형 가슴·배, 속도형 꼬리·팔.
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { apply, boneMatrices, lookLayers, resolveMotions, rigPack, samplePose, validateRig } from '../src/data/art/rig/pose';
import { RIG_ACTIONS } from '../src/ui/bha/rigAnim';

describe('C.402 호로 모델 빈사·쓰러짐·공격3 (GDD 241-F 2)', () => {
  it('뱀·짐승·거미·부유형에 빈사(반복)·쓰러짐(한 번, 끝 자세)이 있고 뼈대 검사를 통과한다', () => {
    for (const id of ['serpent', 'beast', 'spider', 'wraith']) {
      const p = rigPack(id);
      expect(validateRig(p.rig, p.motions, p.sets), id).toEqual([]);
      const body = Object.values(p.rig.looks)[0]!.body;
      const m = resolveMotions(p.rig, p.motions, p.sets, body);
      expect(m.dying?.loop, `${id} dying`).toBe(true);
      expect(m.down && !m.down.loop, `${id} down`).toBe(true);
    }
    expect(RIG_ACTIONS.dying).toEqual(['dying']);
    expect(RIG_ACTIONS.lose).toEqual(['down']);
  });
  it('사람형 뼈대의 호로 몸(덩치·외팔형·가시형·속도형)도 빈사·쓰러짐이 있다 — 길리안만 쓰러짐 없음(사용자 2026-11-10 "길리안은 쓰러짐모션 없애")', () => {
    const p = rigPack('humanoid');
    for (const body of ['hb', 'ho', 'hk', 'hv']) {
      const m = resolveMotions(p.rig, p.motions, p.sets, body);
      expect(m.dying, body).toBeDefined();
      expect(m.down, body).toBeDefined();
    }
    const hd = resolveMotions(p.rig, p.motions, p.sets, 'hd');
    expect(hd.dying).toBeDefined();
    expect(hd.down).toBeUndefined();
  });
  it('짐승 공격3: 몸을 크게 치켜드는 동안에도 뒷발 둘은 바닥 그 자리(1칸 안), 머리는 12칸 넘게 올라간다', () => {
    const p = rigPack('beast');
    const m = p.motions.attack3!;
    expect(m.hit).toBe(900);
    expect(RIG_ACTIONS.attack).toContain('attack3');
    const at = (t: number, bone: string) => apply(boneMatrices(p.rig, samplePose(p.rig, m, t))[bone]!, p.rig.bones.find((b) => b.id === bone)!.pivot);
    const rest = { R: at(0, 'hleg_R2'), L: at(0, 'hleg_L2'), head: at(0, 'head') };
    let top = 0;
    for (let t = 0; t <= m.duration; t += 50) {
      for (const s of ['R', 'L'] as const) {
        const q = at(t, `hleg_${s}2`);
        expect(Math.hypot(q[0] - rest[s][0], q[1] - rest[s][1]), `t${t} ${s}`).toBeLessThan(1);
      }
      top = Math.max(top, rest.head[1] - at(t, 'head')[1]);
    }
    expect(top).toBeGreaterThan(12);
  });
  it('거미: 가까운 팔 = 위팔 + 아래팔·손(forearm_L), 아래팔은 위팔을 따라 더 꺾인다', () => {
    const p = rigPack('spider');
    expect(p.rig.bones.find((b) => b.id === 'forearm_L')!.parent).toBe('arm_L');
    expect(lookLayers(p.rig, 'spider-base').map((l) => l.slot)).toContain('forearm_L');
    for (const look of Object.keys(p.rig.looks)) for (const l of lookLayers(p.rig, look)) expect(existsSync(`public/art/rig/spider/${l.art}.png`), l.art).toBe(true);
    expect(p.motions.attack!.tracks.forearm_L!.some((k) => k[1] !== 0)).toBe(true);
  });
  it('가시형: 몸통 = 가슴(torso) + 배(pelvis), 색 외형 그림도 있다 / 속도형: 꼬리 마디에 키 동작', () => {
    const p = rigPack('humanoid');
    expect(p.rig.bodies.hk!.pelvis).toBeDefined();
    for (const look of ['spiky-base', 'spiky-blue', 'spiky-orange', 'spiky-brown', 'spiky-yellow'])
      for (const l of lookLayers(p.rig, look)) expect(existsSync(`public/art/rig/humanoid/${l.art}.png`), l.art).toBe(true);
    const hv = resolveMotions(p.rig, p.motions, p.sets, 'hv');
    for (const id of ['idle', 'move', 'attack']) expect(hv[id]!.tracks.cape3!.some((k) => k[1] !== 0), id).toBe(true);
    expect(hv.move!.tracks.forearm_L!.some((k) => k[1] !== 0)).toBe(true); // 걷기 아래팔은 사용자가 편집기에서 고정한 값(03:07)
  });
});
