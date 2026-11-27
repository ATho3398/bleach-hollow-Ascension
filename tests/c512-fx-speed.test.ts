// C.512 (GDD 7절 v6.150, 사용자 2026-11-20 "이펙트에 슬로우 달려있다. 모션만 속도 따라가는거지, 이펙은 정상속도로 나와야지"):
// 블록 모션 길이 통일 배율(pace)은 몸동작에만 — 도트 이펙트·투사체 시간줄은 늘 1배.
// C.551 (GDD 7절 v6.225): 엔진 타격 지연 = 몸 몫 ÷ max(1, 배율)만(옛 '+ 이펙트 몫(1배)', blockFxBy 폐기) — 아래 두 묶음은 새 규칙으로 고침(옛 기대값은 주석)
import { describe, expect, it } from 'vitest';
import type { PixelFxLayer, PixelFxStage } from '../src/engine/faction';
import { FACTIONS } from '../src/data/factions';
import { blockHitDelayOf, blockHitKey, blockMotionOf, defaultCombatParams } from '../src/engine/combat/combat';
import { blockBodyMs, cueHitParts, hitDelaysOf, type AnimTiming } from '../src/ui/attackFx';
import { pixelPlan } from '../src/ui/pixelAttack';

const L0: PixelFxLayer = { fx: 'melee/sword-slash', color: 'element', anchor: 'target', on: [0, 1], delay: 40, dx: 0, dy: 0, scale: 1, angle: 0, rate: 1.2, altFlip: false, move: 'stay', travel: 300, arc: 0, tx: 0, ty: 0, ex: 0, ey: 0, face: true, sync: 'hit', z: 3 };
const FLY: PixelFxLayer = { ...L0, fx: 'projectiles/bullet-tracer', move: 'fly', travel: 300, on: [0, 1], delay: 0 };
const stage = (o: Partial<PixelFxStage> = {}): PixelFxStage => ({
  hits: 2, gaps: [200], speed: 1.25, layers: [L0, FLY],
  bodies: { male: { chain: [{ id: 'straight', rate: 1 }, { id: 'hook', rate: 0.8 }], bodyAt: 120, bodyFromHit: false } }, ...o,
});
/** 느린 몸(배율 < 1, 예 4단계 큰 몸)과 빠른 몸(배율 > 1) */
const PACES = [0.5, 0.8, 1.6, 2.5];

describe('pixelPlan: 배율은 몸동작에만, 이펙트 시간줄은 1배', () => {
  const base = pixelPlan(stage(), 'male');
  for (const pace of PACES) {
    it(`pace ${pace}: 이펙트 조각 재생 빠르기·시작·비행·타격·맞음 반응 = 1배 그대로`, () => {
      const p = pixelPlan(stage(), 'male', pace);
      expect(p.insts.map((i) => i.rate)).toEqual(base.insts.map((i) => i.rate)); // 시트 재생 빠르기 = 이펙트 rate × 시전 속도(1.25)만
      expect(p.insts.map((i) => i.flightMs)).toEqual(base.insts.map((i) => i.flightMs));
      expect(p.insts.map((i) => i.start)).toEqual(base.insts.map((i) => i.start));
      expect(p.hitAt).toEqual(base.hitAt);
      expect(p.reactAt).toEqual(base.reactAt); // 피해·맞음 반응 = 1배 이펙트 타격(투사체 도착)
      expect(p.insts[0]!.rate).toBeCloseTo(1.2 * 1.25, 9);
    });
    it(`pace ${pace}: 몸동작은 배율을 받는다 (빠르기 × pace, 시작 기다림 ÷ pace)`, () => {
      const p = pixelPlan(stage(), 'male', pace);
      expect(p.body!.speed).toBeCloseTo(1.25 * pace, 9);
      expect(p.body!.at).toBeCloseTo(120 / (1.25 * pace), 9);
    });
  }
  it('음수 늦춤으로 민 shift 도 이펙트 쪽은 배율과 무관', () => {
    const s = stage({ layers: [{ ...L0, on: [0], delay: -100 }], bodies: {} });
    expect(pixelPlan(s, 'male', 0.5).shift).toBe(pixelPlan(s, 'male', 1).shift);
    expect(pixelPlan(s, 'male', 0.5).shift).toBeCloseTo(100 / 1.25, 9);
  });
  it('실제 종족 데이터(사신 참·호로 조 등): 몸 배율이 달라도 이펙트 계획은 같다', () => {
    let n = 0;
    for (const f of FACTIONS) for (const fam of f.families) for (const st of fam.pixelFx?.stages ?? []) {
      const one = pixelPlan(st, 'male');
      for (const pace of [0.4, 2]) {
        const p = pixelPlan(st, 'male', pace);
        expect(p.insts).toEqual(one.insts);
        expect(p.reactAt).toEqual(one.reactAt);
        if (one.body) expect(p.body!.speed).toBeCloseTo(one.body.speed * pace, 9);
      }
      n++;
    }
    expect(n).toBeGreaterThan(10);
  });
});

describe('엔진: 블록 타격 지연 = 몸 몫 ÷ max(1, 배율)만 (C.551 — 옛 C.512 \'+ 1배 이펙트 몫\' 폐기)', () => {
  const params = (total: number, delay: number) => {
    const p = defaultCombatParams();
    p.motion = { ...p.motion!, blockBy: { 'family-a:1': { total, hit: total / 2 } } };
    p.hitDelay = { ...p.hitDelay, blockBy: { 'family-a:1': delay } };
    return p;
  };
  it('느린 몸(실제 0.4초 → 기준 0.8초, 배율 0.5) = 1배 그대로 · 빠른 몸(1.6초, 배율 2) = ÷ 2', () => {
    for (const total of [0.4, 1.6]) {
      const p = params(total, 0.5);
      const m = blockMotionOf(p, 'family-a:1', 1)!;
      expect(m.rate).toBeCloseTo(total / 0.8, 9);
      // 옛 C.512 기대값: 0.2 ÷ max(1, 배율) + 0.3(이펙트 몫 blockFxBy)
      expect(blockHitDelayOf(p, 'family-a:1', 1)).toBeCloseTo(0.5 / Math.max(1, m.rate), 9);
    }
    expect(blockHitDelayOf(params(0.4, 0.3), 'family-a:1', 1)).toBeCloseTo(0.3, 9); // C.519 하한 1배
    expect(blockHitDelayOf(params(1.6, 0.3), 'family-a:1', 1)).toBeCloseTo(0.3 / 2, 9);
  });
  it('엔진 타격 지연 표에 이펙트 몫 칸이 없다', () => {
    expect('blockFxBy' in defaultCombatParams().hitDelay).toBe(false);
  });
});

describe('화면 → 엔진 표: hitDelaysOf = 몸동작 타격 프레임 (C.551)', () => {
  // 프레임 그림 재생기 흉내: 모든 동작 600ms · 타격 300ms
  const anim: AnimTiming = { has: () => true, peek: () => ({ durationMs: 600, hitAtMs: 300 }) };
  const sh = FACTIONS.find((f) => f.id === 'shinigami')!;
  const fam = sh.families.find((x) => x.abbr === '참')!;
  const familyFx = (id: string, st: number) => {
    const s = sh.families.find((x) => x.id === id)?.pixelFx?.stages[st - 1];
    return s ? { fx: 'slash' as const, pixel: s } : null;
  };
  const fallback = defaultCombatParams().hitDelay;
  it('도트 연결 동작 블록: 타격 지연 = 몸 시간줄 첫 타격(blockBodyMs) — 이펙트 첫 반응(fxMs)을 기다리지 않음', () => {
    const t = hitDelaysOf({ player: anim, enemy: anim, slot: 'male', familyIds: [fam.id], familyFx, fallback });
    expect(t.blockBy).toBeDefined();
    expect('blockFxBy' in t).toBe(false);
    for (const c of [1, 2, 3]) {
      const key = blockHitKey(fam.id, c)!;
      const cue = { tier: 'chain1' as const, pixel: { stage: fam.pixelFx!.stages[c - 1]!, element: 'none' } };
      const r = cueHitParts(cue, anim, 'male');
      expect(r.bodyMs).toBe(0);
      expect(r.hitMs).toBeCloseTo(blockBodyMs(cue, anim, 'male')!.hitMs, 9);
      // 옛 C.512 기대값: blockBy = fxMs(1배 이펙트 첫 반응), blockFxBy = 같은 값
      expect(t.blockBy![key]).toBeCloseTo(Math.round(r.hitMs) / 1000, 9);
      const p = defaultCombatParams();
      p.hitDelay = t;
      p.motion = { ...p.motion!, blockBy: { [key]: { total: 0.3, hit: 0.1 } } }; // 짧은 몸 → 배율 < 1 → 1배
      expect(blockHitDelayOf(p, key, c)).toBeCloseTo(t.blockBy![key]!, 9);
      p.motion = { ...p.motion!, blockBy: { [key]: { total: 3, hit: 1 } } }; // 긴 몸 → 배율 > 1 → ÷ 배율
      expect(blockHitDelayOf(p, key, c)).toBeCloseTo(t.blockBy![key]! / blockMotionOf(p, key, c)!.rate, 9);
    }
  });
  it('동작 그림이 없는 몸의 계열 발사: 대신 동작(발사 움직임) 타격 = 휘두르기 + 비행 (옛 값 그대로)', () => {
    const r = cueHitParts({ tier: 'chain1', fx: 'shot' }, null, 'male');
    expect(r.fxMs).toBeGreaterThan(0);
    expect(r.bodyMs).toBeGreaterThan(0);
    expect(r.hitMs).toBe(r.bodyMs + r.fxMs);
  });
});
