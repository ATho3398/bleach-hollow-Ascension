// 블록 도트 이펙트 (이펙트 배치 도구 확정 값 → 게임): 계획 계산(src/ui/pixelAttack.ts) · 종족 설정 데이터 · 시트 파일
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { PixelFxLayer, PixelFxStage } from '../src/engine/faction';
import { FACTIONS } from '../src/data/factions';
import { ELEMENT_IDS } from '../src/data/elements';
import { fxSheetName } from '../src/ui/bha/pixelFx';
import { flyPoint, hasPixelStage, layerAtHit, pixelPlan } from '../src/ui/pixelAttack';

const L0: PixelFxLayer = { fx: 'melee/sword-slash', color: 'element', anchor: 'target', on: [0, 1, 2], delay: 0, dx: 0, dy: 0, scale: 1, angle: 0, rate: 1, altFlip: false, move: 'stay', travel: 300, arc: 0, tx: 0, ty: 0, ex: 0, ey: 0, face: true, sync: 'hit', z: 3 };
const stage = (o: Partial<PixelFxStage> = {}): PixelFxStage => ({ hits: 3, gaps: [100, 200], speed: 1, layers: [L0], bodies: {}, ...o });

describe('pixelPlan', () => {
  it('타격 시각 = 간격 합 ÷ 시전 속도', () => {
    expect(pixelPlan(stage(), 'male').hitAt).toEqual([0, 100, 300]);
    expect(pixelPlan(stage({ speed: 2 }), 'male').hitAt).toEqual([0, 50, 150]);
  });
  it('타격마다 바꾼 값은 그 타격만', () => {
    const p = pixelPlan(stage({ layers: [{ ...L0, perHit: { '1': { scale: 2, dx: 30 } } }] }), 'male');
    expect(p.insts.map((i) => i.L.scale)).toEqual([1, 2, 1]);
    expect(p.insts[1]!.L.dx).toBe(30);
    expect(layerAtHit(L0, 5)).toEqual(L0);
  });
  it('음수 늦춤·몸동작 미리 시작은 전체를 뒤로 민다', () => {
    const p = pixelPlan(stage({ layers: [{ ...L0, on: [0], delay: -120 }], bodies: { male: { chain: [{ id: 'straight', rate: 1 }], bodyAt: -240, bodyFromHit: false } } }), 'male');
    expect(p.shift).toBe(240);
    expect(p.body?.at).toBe(0);
    expect(p.insts[0]!.start).toBe(120);
    expect(p.hitAt[0]).toBe(240);
  });
  it('투사체: 맞음 반응은 도착 순간, 도착 때 시작하는 이펙트도 그때', () => {
    const fly: PixelFxLayer = { ...L0, fx: 'projectiles/bullet-tracer', move: 'fly', travel: 300, on: [0] };
    const hitL: PixelFxLayer = { ...L0, fx: 'impacts/hit-spark', sync: 'arrive', on: [0] };
    const p = pixelPlan(stage({ hits: 1, gaps: [], layers: [fly, hitL] }), 'male');
    expect(p.reactAt).toEqual([300]);
    expect(p.insts.find((i) => i.L.fx === 'impacts/hit-spark')!.start).toBe(300);
    expect(p.insts.find((i) => i.L.move === 'fly')!.flightMs).toBe(300);
  });
  it('몸동작은 그 칸(성별·프레임 그림)만', () => {
    const s = stage({ bodies: { female: { chain: [{ id: 'kick', rate: 0.5 }], bodyAt: 0, bodyFromHit: true } } });
    expect(pixelPlan(s, 'male').body).toBeNull();
    expect(pixelPlan(s, 'female').body?.chain[0]).toEqual({ id: 'kick', rate: 0.5 });
    expect(hasPixelStage(stage({ layers: [] }), 'male')).toBe(false);
    expect(hasPixelStage(s, 'female')).toBe(true);
  });
  it('날아가는 길: 출발 → 도착(곡선 꼭대기) → 사라지는 곳', () => {
    const A = { x: 0, y: 0 }, B = { x: -100, y: 0 }, E = { x: -150, y: 0 };
    expect(flyPoint(A, B, E, 20, 0, 100, 50)).toMatchObject({ x: 0, y: 0 });
    expect(flyPoint(A, B, E, 20, 50, 100, 50).y).toBe(-20);
    expect(flyPoint(A, B, E, 20, 150, 100, 50)).toMatchObject({ x: -150, y: 0 });
  });
});

describe('종족 설정 pixelFx · 시트', () => {
  const index = JSON.parse(readFileSync('public/fx/index.json', 'utf8')) as { effects: { name: string }[] };
  const names = new Set(index.effects.map((e) => e.name));
  const used = FACTIONS.flatMap((f) => f.families.flatMap((fam) => (fam.pixelFx?.stages ?? []).flatMap((st) => st.layers)));
  it('확정 값이 들어가 있다 (사신 참·권, 호로 조·교·탄)', () => {
    const has = (fid: string, abbr: string) => !!FACTIONS.find((f) => f.id === fid)!.families.find((x) => x.abbr === abbr)!.pixelFx;
    expect([has('shinigami', '참'), has('shinigami', '권'), has('hollow', '조'), has('hollow', '교'), has('hollow', '탄')]).toEqual([true, true, true, true, true]);
    expect(used.length).toBeGreaterThan(0);
  });
  it('쓰는 시트가 전부 있다 (속성 색이면 속성마다)', () => {
    for (const L of used)
      for (const el of L.color === 'element' ? ELEMENT_IDS : [null]) {
        const n = fxSheetName(L.fx, el);
        expect(names.has(n), n).toBe(true);
        expect(existsSync(`public/fx/${n}.png`), n).toBe(true);
      }
  });
  it('시트 이름 규칙이 도구(palettes.mjs)와 같다', async () => {
    const { sheetName } = await import('../scripts/pixelfx/tool/palettes.mjs');
    expect(sheetName('custom/cero-oscuras', 'kyo')).toBe(fxSheetName('custom/cero-oscuras', 'kyo'));
    expect(sheetName('impacts/hit-spark', null)).toBe(fxSheetName('impacts/hit-spark', null));
  });
});
