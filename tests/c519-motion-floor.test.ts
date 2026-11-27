// C.519 (GDD 7절 v6.167, 사용자 2026-11-22 "모션 슬로우걸리는거 왜 아직도 남아있음?" → 11-23 "1.남는 시간은 끝자세 말고 기본 아이들로 남겨놔. 2.튜토 슬로우는 딱 좋아"):
// 블록 모션 길이 통일 배율의 하한 = 1배. 기준 길이보다 짧은 몸동작은 1배로 끝까지 재생하고 남는 시간은 그 몸의 기본 대기(idle) 동작 — 긴 동작만 빠르게 줄인다.
// 블록 총 길이·몸동작 줄 = 기준 길이 그대로, 타격 = 1배 재생 기준 원래 시각(엔진 몸 몫 ÷ max(1, 배율)), 이펙트는 1배(C.512).
import './helpers/rigMotions'; // 종이인형 동작 데이터 채우기 (C.509)
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { RIG_PACKS } from '../src/data/art/rig/pose';
import { blockHitDelayOf, blockHitKey, blockMotionOf, blockMotionTarget, defaultCombatParams } from '../src/engine/combat/combat';
import type { PixelFxStage } from '../src/engine/faction';
import { createAnimPlayer } from '../src/ui/bha/animPlayer';
import { attackCueOf, blockBodyMs, bodyPace, cueHitParts, hitDelaysOf, motionsOf, paced, type AttackCue } from '../src/ui/attackFx';
import { ATTACK_FX } from '../src/ui/attackFxConfig';
import { pixelPlan } from '../src/ui/pixelAttack';
import { blockEvent, bodyRig, measureBlockMs } from './helpers/blockMotionLength';

const LEN = [0.8, 1.0, 1.2];
const ALL_LOOKS = RIG_PACKS.flatMap((p) => Object.keys(p.rig.looks));
const FACS = ['hollow', 'shinigami'] as const;

describe('배율 하한 1배 (bodyPace)', () => {
  it('느린 몸(배율 < 1)은 1배, 빠른 몸은 그대로, 값 없음 = 1', () => {
    expect(bodyPace(0.136)).toBe(1);
    expect(bodyPace(0.999)).toBe(1);
    expect(bodyPace(1)).toBe(1);
    expect(bodyPace(1.333)).toBe(1.333);
    expect(bodyPace(undefined)).toBe(1);
    expect(bodyPace(0)).toBe(1);
  });
  it('몸통박치기(holdMs 포함)는 느린 몸에서 늘어나지 않는다 — 빠른 몸만 줄인다', () => {
    const lv = ATTACK_FX.chain3;
    expect(paced(lv, bodyPace(0.4))).toEqual(lv);
    expect(paced(lv, bodyPace(2)).holdMs).toBeCloseTo(lv.holdMs / 2, 9);
  });
  it('도트 연결 동작 몸 빠르기 = 시전 속도 × max(1, 배율)', () => {
    const st: PixelFxStage = { hits: 1, gaps: [], speed: 1.25, layers: [], bodies: { male: { chain: [{ id: 'straight', rate: 1 }], bodyAt: 100, bodyFromHit: false } } };
    expect(pixelPlan(st, 'male', bodyPace(0.4)).body!.speed).toBeCloseTo(1.25, 9);
    expect(pixelPlan(st, 'male', bodyPace(2)).body!.speed).toBeCloseTo(2.5, 9);
  });
});

describe('재생기 길이 맞춤(lengthMs) = 상한: 늘이지 않고 줄이기만', () => {
  const clip = { action: 'skill', frames: ['a', 'b', 'c', 'd'], frameMs: [100, 100, 100, 100], hitFrame: 2, mode: 'once' } as never;
  const idle = { action: 'idle', frames: ['i1', 'i2'], frameMs: [150, 150], hitFrame: 0, mode: 'loop' } as never;
  it('프레임 그림: 400ms 동작에 1200ms 를 줘도 400ms 1배 → 남는 시간은 대기(idle) 반복', () => {
    const shown: string[] = [];
    const p = createAnimPlayer({ skill: clip, idle }, 'still', { show: (u: string) => shown.push(u) } as never);
    p.setLoop('idle');
    let end = -1;
    let t = 0;
    p.play('skill', { lengthMs: 1200, onEnd: () => { end = t; } });
    while (t < 1200) {
      t++;
      p.advance(1);
    }
    expect(end).toBe(400);
    expect(p.playing).toBe('idle'); // 끝 자세(d)에 멈추지 않는다
    expect(shown.slice(shown.indexOf('d') + 1)).toEqual(expect.arrayContaining(['i1', 'i2'])); // 대기 동작이 돈다
  });
  it('대기 동작이 없는 몸(그림 한 장): 끝나면 정지 그림', () => {
    const shown: string[] = [];
    const p = createAnimPlayer({ skill: clip }, 'still', { show: (u: string) => shown.push(u) } as never);
    p.play('skill', { lengthMs: 1200 });
    for (let t = 0; t < 1200; t++) p.advance(1);
    expect(p.playing).toBeNull();
    expect(shown.at(-1)).toBe('still');
  });
});

describe('실제 종족 데이터 전 외형(종이인형 65종 × 호로·사신 × 계열 × 1~3체인)', () => {
  for (const look of ALL_LOOKS) {
    it(`${look}: 몸 배율 ≥ 1 · 몸동작 ≤ 기준 길이 · 짧은 동작은 1배 그대로 · 엔진 타격 = 원래 시각 ÷ max(1, 배율)`, () => {
      for (const fac of FACS) {
        const b = bodyRig(look, fac);
        const p = defaultCombatParams();
        p.motion = motionsOf({ player: b.player, slot: b.slot, familyIds: b.familyIds, familyFx: b.familyFx, fallback: p.motion! });
        p.hitDelay = hitDelaysOf({ player: b.player, enemy: null, slot: b.slot, familyIds: b.familyIds, familyFx: b.familyFx, fallback: p.hitDelay });
        for (const fam of b.familyIds) {
          for (const c of [1, 2, 3]) {
            const r = measureBlockMs(bodyRig(look, fac), fam, c, true);
            const nat = measureBlockMs(bodyRig(look, fac), fam, c, false).ms;
            expect(r.play).toBeGreaterThanOrEqual(1);
            expect(r.ms).toBeLessThanOrEqual(LEN[c - 1]! * 1000 + 4);
            if (r.pace <= 1) expect(Math.abs(r.ms - nat)).toBeLessThanOrEqual(3); // 느리게 재생하지 않음 = 원래 길이
            // 엔진: 줄 길이 = 기준 길이, 타격 = 원래 시각 ÷ max(1, 배율)
            const key = blockHitKey(fam, c)!;
            const m = blockMotionOf(p, key, c)!;
            const n = p.motion.blockBy![key]!;
            expect(m.total).toBeCloseTo(LEN[c - 1]!, 9);
            expect(m.hit).toBeCloseTo(Math.min(m.total, n.hit / Math.max(1, m.rate)), 9);
            expect(Math.abs(m.rate - r.pace)).toBeLessThan(0.01); // 화면 배율(cue.pace)과 엔진 배율이 같은 몸 데이터
            // C.551 (GDD 7절 v6.225): 타격 지연 = 몸동작 타격 프레임 ÷ max(1, 배율)만 — 화면 cueHitParts.hitMs 와 같은 값, 엔진 몸동작 표 타격(기준 길이 위)과 같은 순간.
            // 옛 C.512 기대값: bodyMs ÷ max(1, 배율) + fxMs(1배 이펙트 몫)
            const cue = attackCueOf(blockEvent(fam, c), 3, b.familyFx) as AttackCue;
            const parts = cueHitParts(cue, b.player, b.slot);
            expect(Math.abs(blockHitDelayOf(p, key, c) - parts.hitMs / 1000 / Math.max(1, m.rate))).toBeLessThanOrEqual(0.003);
            expect(Math.abs(blockHitDelayOf(p, key, c) - m.hit)).toBeLessThanOrEqual(0.003);
          }
        }
      }
    });
  }
});

/** 재생기가 블록 동작(대기 아님)을 트는 동안 실제 재생 배율(playbackRate)을 모은다 */
function watchRates(p: ReturnType<typeof bodyRig>['player']): number[] {
  const out: number[] = [];
  const adv = p.advance.bind(p);
  p.advance = (dt: number) => {
    if (p.playing && p.playing !== 'idle') out.push(p.playbackRate ?? 1);
    adv(dt);
  };
  return out;
}

describe('남는 시간 = 기본 대기(idle) 동작 (끝 자세 정지 아님)', () => {
  const cases: [string, string, string, string, number][] = [
    ['아란칼 조 3체인(가장 느렸던 몸 ×0.136)', 'arrancar-base', 'hollow', 'family-a', 3],
    ['사신 학생(평대원) 참 1체인', 'shinigami-base', 'shinigami', 'family-a', 1],
    ['길리안 교 3체인(손 모션 없음 — 대신 동작)', 'gillian-base', 'hollow', 'family-b', 3],
    ['덩치 조 3체인', 'brute-base', 'hollow', 'family-a', 3],
  ];
  for (const [name, look, fac, fam, c] of cases) {
    it(`${name}: 1배로 끝까지 → 기준 길이까지 대기 동작이 돈다`, () => {
      const b = bodyRig(look, fac);
      expect(b.player.has('idle')).toBe(true);
      b.player.setLoop('idle');
      const rates = watchRates(b.player);
      const r = measureBlockMs(b, fam, c, true);
      expect(rates.length).toBeGreaterThan(0);
      expect(Math.min(...rates)).toBeGreaterThanOrEqual(1); // 블록 몸동작 내내 실제 재생 배율 ≥ 1 (옛: 0.136~)
      const target = blockMotionTarget(BALANCE.provisional.combat.motion, c)! * 1000;
      expect(r.pace).toBeLessThan(1);
      expect(r.play).toBe(1);
      expect(r.ms).toBeLessThan(target - 30); // 남는 시간이 있다
      const blockMotion = b.player.pose().motion; // 동작이 끝난 직후 = 이미 대기 동작
      const t0 = b.player.pose().t;
      for (let t = r.ms; t < target; t++) b.player.advance(1);
      expect(b.player.playing).toBe('idle');
      expect(b.player.pose().motion).toBe(blockMotion);
      expect(b.player.pose().t).toBeGreaterThan(t0); // 대기 동작 시계가 흐른다(정지 아님)
    });
  }
  it('긴 동작(길리안 탄 1체인, 배율 1.33)은 빨라져 기준 길이 안에 끝난다', () => {
    const g = bodyRig('gillian-base', 'hollow');
    const rates = watchRates(g.player);
    const r = measureBlockMs(g, 'family-c', 1, true);
    expect(Math.min(...rates)).toBeCloseTo(r.play, 6); // 빨라진 몸 = 배율 그대로
    const nat = blockBodyMs(attackCueOf(blockEvent('family-c', 1), 3, bodyRig('gillian-base', 'hollow').familyFx) as AttackCue, bodyRig('gillian-base', 'hollow').player, 'male')!;
    expect(r.pace).toBeGreaterThan(1);
    expect(r.play).toBeCloseTo(r.pace, 9);
    expect(nat.totalMs).toBeGreaterThan(800);
    expect(Math.abs(r.ms - 800)).toBeLessThanOrEqual(3);
  });
});
