// C.191 (GDD 117장 2·3·4): 맞아도 공격 모션 안 끊김 · 블록 공격 즉발 · 공격/특수 모션 무작위
import { describe, expect, it } from 'vitest';
import type { CombatEvent } from '../src/engine/combat';
import { clipHitMs, resolveAnims } from '../src/data/art/anim';
import { HUMANOID, MOTIONS } from '../src/data/art/rig/pose';
import { AttackQueue, attackCueOf, canPlayHitAnim, type AttackCue } from '../src/ui/attackFx';
import { createAnimPlayer } from '../src/ui/bha/animPlayer';
import { createRigPlayer, pickVariant, VARIANT_REPEAT_MAX } from '../src/ui/bha/rigAnim';

const block = (o: Partial<Extract<CombatEvent, { kind: 'block' }>> = {}): CombatEvent => ({
  kind: 'block', block: 'skill', traitId: 'x', family: null, element: null, matchup: 'neutral', role: 'attack', chain: 1, damage: 10, weak: false, heal: 0, guardSeconds: 0, bonus: null, ...o,
});
/** 정해진 값을 차례로 돌려주는 난수 */
const seq = (...v: number[]) => { let i = 0; return () => v[i++ % v.length]!; };

describe('117장 2: 공격·특수 모션 중에는 맞음 동작으로 바꾸지 않는다', () => {
  it('대기·이동·정지·맞음 중에만 맞음 동작', () => {
    for (const a of [null, 'idle', 'move', 'hit'] as const) expect(canPlayHitAnim(a), String(a)).toBe(true);
    for (const a of ['attack', 'skill', 'release', 'win', 'lose'] as const) expect(canPlayHitAnim(a), a).toBe(false);
  });
});

describe('117장 3: 블록 공격 즉발', () => {
  it('블록 공격·콤보 연출은 즉발, 기본 자동 공격·적 공격은 아님', () => {
    expect(attackCueOf(block(), 3)?.instant).toBe(true);
    expect(attackCueOf(block({ block: 'combo' }), 3)?.instant).toBe(true);
    expect(attackCueOf({ kind: 'player-attack', damage: 5, matchup: 'neutral' }, 3)?.instant).toBeUndefined();
    expect(attackCueOf({ kind: 'enemy-attack', damage: 4, guarded: false, matchup: 'neutral' }, 3)?.instant).toBeUndefined();
  });
  it('기본 공격 연출이 재생 중이어도 즉발 연출은 기다리지 않고 바로 시작, 앞 것의 done 은 무시', () => {
    const started: AttackCue[] = [];
    const dones: (() => void)[] = [];
    const q = new AttackQueue((c, done) => { started.push(c); dones.push(done); });
    q.push({ side: 'player', tier: 'basic', guarded: false });
    expect(q.push({ side: 'player', tier: 'chain1', guarded: false, instant: true })).toBe('started');
    expect(started.map((c) => c.tier)).toEqual(['basic', 'chain1']);
    q.push({ side: 'player', tier: 'basic', guarded: false }); // 즉발 재생 중엔 기본 공격은 대기
    dones[0]!(); // 끊긴 기본 공격의 늦은 done — 무시
    expect(started).toHaveLength(2);
    dones[1]!();
    expect(started.map((c) => c.tier)).toEqual(['basic', 'chain1', 'basic']);
    // 즉발끼리는 기존처럼 대기
    q.push({ side: 'player', tier: 'chain2', guarded: false, instant: true });
    expect(started).toHaveLength(4);
    expect(q.push({ side: 'player', tier: 'chain3', guarded: false, instant: true })).toBe('queued');
  });
  it('종이인형: fromHit 이면 타격 자세에서 시작해 남은 길이만, onHit 은 바로', () => {
    const p = createRigPlayer(HUMANOID, MOTIONS, () => {}, () => 0);
    let hit = 0;
    let end = 0;
    const r = p.play('attack', { fromHit: true, onHit: () => hit++, onEnd: () => end++ })!;
    expect(hit).toBe(1);
    expect(r.hitAtMs).toBe(0);
    expect(r.durationMs).toBe(MOTIONS.attack!.duration - MOTIONS.attack!.hit!);
    p.advance(r.durationMs + 1);
    expect([hit, end]).toEqual([1, 1]);
  });
  it('옛 프레임 그림: fromHit 이면 타격 프레임부터, 남은 길이만', () => {
    const files = Array.from({ length: 4 }, (_, i) => `x/attack-${i + 1}.png`);
    const anims = resolveAnims(['x'], '', files, {});
    const shown: string[] = [];
    const p = createAnimPlayer(anims, 'still.png', { show: (u) => shown.push(u) });
    let hit = 0;
    const c = anims.attack!;
    const r = p.play('attack', { fromHit: true, onHit: () => hit++ })!;
    expect(hit).toBe(1);
    expect(r.hitAtMs).toBe(0);
    expect(shown.at(-1)).toBe(c.frames[c.hitFrame]);
    p.advance(1);
    expect(hit).toBe(1); // 두 번 오지 않는다
    expect(r.durationMs + clipHitMs(c)).toBeGreaterThan(r.durationMs);
  });
});

describe('117장 4: 공격·특수 모션 무작위 (같은 것 두 번 연속까지)', () => {
  it('pickVariant: 난수대로 고르고, 같은 것이 두 번 연속이면 세 번째는 다른 것', () => {
    expect(VARIANT_REPEAT_MAX).toBe(2);
    expect(pickVariant(2, [], () => 0)).toBe(0);
    expect(pickVariant(2, [], () => 0.99)).toBe(1);
    expect(pickVariant(2, [0], () => 0)).toBe(0); // 두 번째 연속은 허용
    expect(pickVariant(2, [0, 0], () => 0)).toBe(1); // 세 번째는 다른 것
    expect(pickVariant(2, [1, 1], () => 0.99)).toBe(0);
    expect(pickVariant(2, [1, 0], () => 0)).toBe(0);
    expect(pickVariant(1, [0, 0], () => 0.5)).toBe(0); // 하나뿐이면 그것
  });
  it('종이인형 재생기: 난수 주입으로 attack·attack2 를 고르고 세 번 연속은 없다', () => {
    const p = createRigPlayer(HUMANOID, MOTIONS, () => {}, seq(0, 0, 0, 0.9, 0.9, 0.9, 0));
    const seen: string[] = [];
    for (let i = 0; i < 7; i++) {
      const r = p.play('attack')!;
      seen.push(p.pose().motion === MOTIONS.attack ? 'attack' : 'attack2');
      p.advance(r.durationMs + 1);
    }
    // 3번째 0 은 막혀 attack2, 5번째 0.9 도 막혀 attack, 이후 0.9 → attack2, 0 → attack
    expect(seen).toEqual(['attack', 'attack', 'attack2', 'attack2', 'attack', 'attack2', 'attack']);
    // 아무 난수라도 세 번 연속은 없다
    const r = createRigPlayer(HUMANOID, MOTIONS, () => {}, () => 0);
    const ids: unknown[] = [];
    for (let i = 0; i < 9; i++) { const d = r.play('attack')!; ids.push(r.pose().motion); r.advance(d.durationMs + 1); }
    for (let i = 2; i < ids.length; i++) expect(ids[i] === ids[i - 1] && ids[i] === ids[i - 2]).toBe(false);
    // 특수도 같은 규칙, 기록은 동작마다 따로
    const s = createRigPlayer(HUMANOID, MOTIONS, () => {}, () => 0.99);
    const sk: string[] = [];
    for (let i = 0; i < 3; i++) { const r = s.play('skill')!; sk.push(s.pose().motion === MOTIONS.skill ? 'skill' : 'skill2'); s.advance(r.durationMs + 1); }
    expect(sk).toEqual(['skill2', 'skill2', 'skill']);
  });
});
