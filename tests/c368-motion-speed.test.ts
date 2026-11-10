// C.368 (GDD 225장): 종이인형 동작 재생 속도 1.5배 — 동작 키 시각은 그대로, 재생기가 시간을 1.5배로 흘린다.
// 도트 연결 동작 빠르기(chain rate)는 fx 도구에서 이미 올려 둔 것을 ÷1.5(최소 1) — 실제 빠르기는 그대로
import { describe, expect, it } from 'vitest';
import { HUMANOID, MOTIONS, RIG_PACKS, boneMatrices, motionSpeedOf, samplePose, type Rig } from '../src/data/art/rig/pose';
import { createRigPlayer } from '../src/ui/bha/rigAnim';
import { createDollClock } from '../src/ui/bha/paperdoll';
import { DRAFT_RIGS } from '../scripts/rig/draft';

describe('C.368 종이인형 동작 재생 속도 (GDD 225장)', () => {
  it('게임 뼈대(사람형·뱀형)와 작업본 뼈대 모두 motionSpeed 1.5', () => {
    for (const p of RIG_PACKS) expect(p.rig.motionSpeed, p.id).toBe(1.5);
    for (const [id, d] of Object.entries(DRAFT_RIGS)) expect(d.rig.motionSpeed, id).toBe(1.5);
  });
  it('재생기: 실제 시간 = 동작 시각 ÷ 1.5 (길이·타격 시각·끝)', () => {
    const p = createRigPlayer(HUMANOID, MOTIONS, () => {}, () => 0);
    const m = MOTIONS.attack!;
    let hit = 0;
    let end = 0;
    const r = p.play('attack', { onHit: () => hit++, onEnd: () => end++ })!;
    // 공격 변형 중 rng 0 → 첫 변형(attack)
    expect(r.durationMs).toBeCloseTo(m.duration / 1.5, 6);
    expect(r.hitAtMs).toBeCloseTo(m.hit! / 1.5, 6);
    p.advance(m.hit! / 1.5 - 1);
    expect(hit).toBe(0);
    p.advance(2);
    expect(hit).toBe(1);
    expect(p.pose().t).toBeCloseTo((m.hit! / 1.5 + 1) * 1.5, 6); // 동작 시각
    p.advance(m.duration / 1.5);
    expect(end).toBe(1);
  });
  it('연결 동작 빠르기(setRate)는 재생 속도 위에 곱해진다', () => {
    const p = createRigPlayer(HUMANOID, MOTIONS, () => {}, () => 0);
    p.setRate(2);
    p.play('attack');
    p.advance(100);
    expect(p.pose().t).toBeCloseTo(100 * 2 * 1.5, 6);
  });
  it('시험 페이지 시계(createDollClock)도 같은 속도', () => {
    const c = createDollClock(MOTIONS, 1.5);
    c.play('attack');
    c.advance(100);
    expect(c.current!.t).toBeCloseTo(150, 6);
  });
  it('대기·홈 대기는 재생 속도 예외 (GDD 115-A 103): 작업본 뼈대 motionSpeedExcept → 1배', () => {
    for (const [id, d] of Object.entries(DRAFT_RIGS)) {
      expect(d.rig.motionSpeedExcept, id).toEqual(['idle', 'homeIdle']);
      expect(motionSpeedOf(d.rig, 'idle'), id).toBe(1);
      expect(motionSpeedOf(d.rig, 'homeIdle'), id).toBe(1);
      expect(motionSpeedOf(d.rig, 'attack'), id).toBe(1.5);
    }
    // 게임본에는 아직 안 넣음 — 예외 없는 뼈대는 전부 motionSpeed
    expect(motionSpeedOf(HUMANOID, 'idle')).toBe(HUMANOID.motionSpeedExcept?.includes('idle') ? 1 : 1.5);
  });
  it('재생기·시계: 예외 동작(대기)은 1배, 한 번 동작은 1.5배', () => {
    const rig: Rig = { ...HUMANOID, motionSpeedExcept: ['idle', 'homeIdle'] };
    const p = createRigPlayer(rig, MOTIONS, () => {}, () => 0);
    p.setLoop('idle');
    p.advance(100);
    expect(p.pose().t).toBeCloseTo(100, 6);
    p.play('attack');
    p.advance(100);
    expect(p.pose().t).toBeCloseTo(150, 6);
    const c = createDollClock(MOTIONS, (id) => motionSpeedOf(rig, id));
    c.advance(100); // 처음 = 대기
    expect(c.current!.t).toBeCloseTo(100, 6);
    c.play('attack');
    c.advance(100);
    expect(c.current!.t).toBeCloseTo(150, 6);
  });
  it('짐승 대기: 아랫마디(앞발·뒷발)는 제자리, 윗다리는 몸을 따라 움직인다 (GDD 115-A 103)', () => {
    const { rig, motions } = DRAFT_RIGS.beast!;
    const idle = motions.idle!;
    const rest = boneMatrices(rig, {});
    for (const t of [0, 200, 400, 800, 1200]) {
      const m = boneMatrices(rig, samplePose(rig, idle, t));
      for (const b of ['fleg_L2', 'fleg_R2', 'hleg_L2', 'hleg_R2']) for (let k = 0; k < 6; k++) expect(Math.abs(m[b]![k]! - rest[b]![k]!), `${b} t${t}`).toBeLessThan(k < 4 ? 0.01 : 0.15);
    }
    const mid = boneMatrices(rig, samplePose(rig, idle, 800));
    for (const b of ['fleg_L', 'fleg_R', 'hleg_L', 'hleg_R']) expect(mid[b]![5]! - rest[b]![5]!, b).toBeGreaterThan(0.5);
  });
});
