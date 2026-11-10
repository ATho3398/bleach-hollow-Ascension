// GDD 226장 (사용자 2026-11-10 "앞으로 호로 조=주먹으로 때리는 공격 중 하나로 통일하고, 교는 박치기로 통일"):
// 조 = 주먹 묶음(주먹·스트레이트·오른손 치기·어퍼컷 중 하나), 교 = 박치기. 주먹이 없는 호로 몸(덩치·길리안)은 그 몸의 손 공격(공격1·2), 그것도 없으면 박치기
import { describe, expect, it } from 'vitest';
import { getFaction } from '../src/data/factions';
import { HUMANOID, MOTIONS, MOTION_SETS, resolveMotions } from '../src/data/art/rig/pose';
import { createRigPlayer, FAMILY_RIG_MOTIONS, rigMotionIds } from '../src/ui/bha/rigAnim';

const fam = (abbr: string) => getFaction('hollow').families.find((f) => f.abbr === abbr)!;
const bodyOf = (look: string) => HUMANOID.looks[look]!.body;
const motionsOf = (look: string) => resolveMotions(HUMANOID, MOTIONS, MOTION_SETS, bodyOf(look));
/** 그 몸에서 계열 몸동작으로 여러 번 틀었을 때 나온 동작 id */
function seen(look: string, motion: 'punch' | 'headbutt', n = 12): Set<string> {
  const ms = motionsOf(look);
  let k = 0;
  const p = createRigPlayer(HUMANOID, ms, () => {}, () => [0, 0.34, 0.67, 0.99][k++ % 4]!);
  const out = new Set<string>();
  for (let i = 0; i < n; i++) {
    const r = p.play('skill', { motion, fromHit: true })!;
    const m = p.pose().motion;
    out.add(Object.keys(ms).find((id) => ms[id] === m)!);
    p.advance(r.durationMs + 1);
  }
  return out;
}

describe('GDD 226장: 호로 조 = 주먹, 교 = 박치기', () => {
  it('종족 설정: 조 motion = punch, 교 = headbutt, 탄은 없음', () => {
    expect([fam('조').motion, fam('교').motion, fam('탄').motion]).toEqual(['punch', 'headbutt', undefined]);
    expect(FAMILY_RIG_MOTIONS.punch).toEqual(['punch', 'straight', 'rpunch', 'uppercut']);
    expect(FAMILY_RIG_MOTIONS.headbutt).toEqual(['headbutt']);
  });
  it('아란칼(남·여): 조 = 주먹 묶음 안에서만, 교 = 박치기만', () => {
    for (const look of ['arrancar-base', 'arrancar-base-f']) {
      for (const id of seen(look, 'punch')) expect(FAMILY_RIG_MOTIONS.punch).toContain(id);
      expect([...seen(look, 'headbutt')]).toEqual(['headbutt']);
    }
  });
  it('덩치: 주먹이 없어 조 = 공격1·2, 교 = 박치기', () => {
    for (const id of seen('brute-base', 'punch')) expect(['attack', 'attack2']).toContain(id);
    expect([...seen('brute-base', 'headbutt')]).toEqual(['headbutt']);
  });
  it('길리안: 주먹·공격1·2 모두 없어 조도 박치기', () => {
    expect([...seen('gillian-base', 'punch')]).toEqual(['headbutt']);
    expect([...seen('gillian-base', 'headbutt')]).toEqual(['headbutt']);
  });
  it('고정 동작(연결 동작 id)도 몸에 없으면 같은 규칙으로 대신한다 — 있으면 그대로', () => {
    expect(rigMotionIds('uppercut', motionsOf('arrancar-base'))).toEqual(['uppercut']);
    expect(rigMotionIds('uppercut', motionsOf('brute-base'))).toEqual(['attack', 'attack2']);
    expect(rigMotionIds('punch', motionsOf('gillian-base'))).toEqual(['headbutt']);
    expect(rigMotionIds('skill2', motionsOf('gillian-base'))).toEqual([]);
    expect(rigMotionIds(undefined, MOTIONS)).toEqual([]);
  });
});
