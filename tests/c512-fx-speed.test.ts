// C.512 (GDD 7절 v6.150, 사용자 2026-11-20 "이펙트에 슬로우 달려있다. 모션만 속도 따라가는거지, 이펙은 정상속도로 나와야지"):
// 블록 모션 길이 통일 배율(pace)은 몸동작에만 — 도트 이펙트·투사체·맞음 반응 시간줄은 늘 1배, 엔진 타격 지연 = 몸 몫 ÷ 배율 + 이펙트 몫(1배).
import { describe, expect, it } from 'vitest';
import type { PixelFxLayer, PixelFxStage } from '../src/engine/faction';
import { FACTIONS } from '../src/data/factions';
import { blockHitDelayOf, blockHitKey, blockMotionOf, defaultCombatParams } from '../src/engine/combat/combat';
import { cueHitParts, hitDelaysOf, type AnimTiming } from '../src/ui/attackFx';
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

describe('엔진: 블록 타격 지연 = 몸 몫 ÷ 배율 + 이펙트 몫(1배)', () => {
  const params = (total: number, delay: number, fx?: number) => {
    const p = defaultCombatParams();
    p.motion = { ...p.motion!, blockBy: { 'family-a:1': { total, hit: total / 2 } } };
    p.hitDelay = { ...p.hitDelay, blockBy: { 'family-a:1': delay }, ...(fx !== undefined ? { blockFxBy: { 'family-a:1': fx } } : {}) };
    return p;
  };
  it('느린 몸(실제 0.4초 → 기준 0.8초, 배율 0.5)·빠른 몸(1.6초, 배율 2): 이펙트 몫은 그대로', () => {
    for (const total of [0.4, 1.6]) {
      const p = params(total, 0.5, 0.3);
      const m = blockMotionOf(p, 'family-a:1', 1)!;
      expect(m.rate).toBeCloseTo(total / 0.8, 9);
      expect(blockHitDelayOf(p, 'family-a:1', 1)).toBeCloseTo(0.2 / m.rate + 0.3, 9);
    }
  });
  it('몸 몫이 0(도트 연결 동작 — 이펙트가 바로 시작)이면 타격 지연 = 1배 이펙트 첫 반응', () => {
    for (const total of [0.4, 1.6]) expect(blockHitDelayOf(params(total, 0.35, 0.35), 'family-a:1', 1)).toBeCloseTo(0.35, 9);
  });
  it('이펙트 몫이 없으면 옛 식(전부 몸 = ÷ 배율), 이펙트 몫이 지연보다 크면 지연까지만', () => {
    const p = params(0.4, 0.3);
    expect(blockHitDelayOf(p, 'family-a:1', 1)).toBeCloseTo(0.3 / 0.5, 9);
    expect(blockHitDelayOf(params(0.4, 0.3, 9), 'family-a:1', 1)).toBeCloseTo(0.3, 9);
  });
});

describe('화면 → 엔진 표: hitDelaysOf 가 이펙트 몫(blockFxBy)을 넘긴다', () => {
  // 프레임 그림 재생기 흉내: 모든 동작 600ms · 타격 300ms
  const anim: AnimTiming = { has: () => true, peek: () => ({ durationMs: 600, hitAtMs: 300 }) };
  const sh = FACTIONS.find((f) => f.id === 'shinigami')!;
  const fam = sh.families.find((x) => x.abbr === '참')!;
  const familyFx = (id: string, st: number) => {
    const s = sh.families.find((x) => x.id === id)?.pixelFx?.stages[st - 1];
    return s ? { fx: 'slash' as const, pixel: s } : null;
  };
  const fallback = defaultCombatParams().hitDelay;
  it('도트 연결 동작 블록: 타격 지연 전부가 이펙트 몫(몸 0) — 배율과 무관하게 1배 첫 반응', () => {
    const t = hitDelaysOf({ player: anim, enemy: anim, slot: 'male', familyIds: [fam.id], familyFx, fallback });
    for (const c of [1, 2, 3]) {
      const key = blockHitKey(fam.id, c)!;
      const r = cueHitParts({ tier: 'chain1', pixel: { stage: fam.pixelFx!.stages[c - 1]!, element: 'none' } }, anim, 'male');
      expect(r.bodyMs).toBe(0);
      expect(t.blockBy![key]).toBeCloseTo(Math.round(r.fxMs) / 1000, 9);
      expect(t.blockFxBy?.[key] ?? 0).toBeCloseTo(t.blockBy![key]!, 9);
      const p = defaultCombatParams();
      p.hitDelay = t;
      p.motion = { ...p.motion!, blockBy: { [key]: { total: 0.3, hit: 0.1 } } }; // 짧은 몸 → 배율 > 1 (빠른 몸)
      expect(blockHitDelayOf(p, key, c)).toBeCloseTo(t.blockBy![key]!, 9);
      p.motion = { ...p.motion!, blockBy: { [key]: { total: 3, hit: 1 } } }; // 긴 몸 → 배율 < 1 (느린 몸)
      expect(blockHitDelayOf(p, key, c)).toBeCloseTo(t.blockBy![key]!, 9);
    }
  });
  it('계열 발사(투사체)만 있는 블록: 비행 시간은 이펙트 몫, 휘두르기는 몸 몫', () => {
    const r = cueHitParts({ tier: 'chain1', fx: 'shot' }, null, 'male');
    expect(r.fxMs).toBeGreaterThan(0);
    expect(r.bodyMs).toBeGreaterThan(0);
  });
});
