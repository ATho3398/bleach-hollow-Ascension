import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { DRAFT_RIGS } from '../scripts/rig/draft';
import { followMove } from '../scripts/rig/follow';
import { boneMatrices, lookLayers, resolveMotions, samplePose, validateRig, apply } from '../src/data/art/rig/pose';

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
  it('역관절 몸만 동작 묶음을 쓴다: 걷기에서 정강이가 접힌다', () => {
    const dg = resolveMotions(rig, motions, sets, 'bare_dg');
    expect(dg.move!.tracks.shin_L).toBeDefined();
    expect(dg.move!.tracks.arm_L).toEqual(motions.move!.tracks.arm_L); // 다리 밖은 기본 그대로
    expect(resolveMotions(rig, motions, sets, 'bare')).toBe(motions);
  });
  it('역관절 걷기: 디딘 발은 바닥 근처에 있다(발목이 바닥에서 크게 뜨지 않음)', () => {
    const dg = resolveMotions(rig, motions, sets, 'bare_dg');
    const ankle = rig.bodyJoints!.bare_dg as { pivots: Record<string, [number, number]> };
    let lowest = 0;
    for (let t = 0; t < 640; t += 40) {
      const m = boneMatrices(rig, samplePose(rig, dg.move!, t), 'bare_dg');
      const y = Math.max(apply(m.foot_L!, ankle.pivots.foot_L!)[1], apply(m.foot_R!, ankle.pivots.foot_R!)[1]);
      lowest = Math.max(lowest, y);
      expect(y, `t=${t}`).toBeGreaterThan(70);
    }
    expect(lowest).toBeGreaterThan(72);
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

describe('편집기 같이 옮기기 (GDD 96장 42)', () => {
  const rig = DRAFT_RIGS.humanoid!.rig;
  it('머리를 옮기면 일반머리·뒷머리와 뒷머리 관절도 같이', () => {
    const m = followMove(rig, 'shinigami-base-f', 'head')!;
    expect(m.parts.map((p) => p.slot)).toEqual(['head', 'hair', 'hair_back']);
    expect(m.bones).toEqual(['hair_back']);
  });
  it('오른 위팔 → 아래팔(팔꿈치 관절 포함), 왼팔 → 엄지, 다리 → 정강이·발(무릎·발목 관절)', () => {
    expect(followMove(rig, 'bare-base', 'arm_R')!.parts.map((p) => p.slot)).toEqual(['arm_R', 'forearm_R']);
    expect(followMove(rig, 'bare-base', 'arm_R')!.bones).toEqual(['forearm_R']);
    expect(followMove(rig, 'bare-base', 'arm_L')!.parts.map((p) => p.slot)).toEqual(['arm_L', 'thumb_L']);
    expect(followMove(rig, 'digitigrade-test', 'leg_L')!.parts.map((p) => p.slot)).toEqual(['leg_L', 'shin_L', 'foot_L']);
    expect(followMove(rig, 'digitigrade-test', 'leg_L')!.bones).toEqual(['shin_L', 'foot_L']);
  });
  it('뒤에 오는 부위를 옮기면 그것만', () => {
    for (const s of ['hair', 'hair_back', 'thumb_L', 'forearm_R', 'foot_L']) expect(followMove(rig, 'shinigami-base-f', s)!.parts.map((p) => p.slot)).toEqual([s]);
    expect(followMove(rig, 'digitigrade-test', 'shin_L')!.parts.map((p) => p.slot)).toEqual(['shin_L', 'foot_L']);
  });
});
