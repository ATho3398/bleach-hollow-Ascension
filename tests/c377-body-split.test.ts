// C.377 (GDD 230장, 사용자 2026-11-11 "인간형이야 같은곳에서 때리지만 얘네는 모션마다 이펙트 출발 위치가 다른데"): 계열 도트 연출 자리를 몸마다 따로
import { describe, expect, it } from 'vitest';
import shinigami from '../src/data/factions/shinigami.json';
import { parseFactionConfig, type FamilyPixelFx, type PixelFxStage } from '../src/engine/faction';
import { familyStagesFor } from '../src/ui/pixelAttack';

const stage = (dx: number): PixelFxStage => ({ hits: 1, gaps: [], speed: 1, layers: [{ fx: 'custom/cero', color: 'element', anchor: 'attacker', on: [0], delay: 0, dx, dy: 0, scale: 1, angle: 0, rate: 1, altFlip: false, move: 'stay', travel: 300, arc: 0, tx: 0, ty: 0, ex: 0, ey: 0, face: true, sync: 'hit', z: 3 }], bodies: {} });

describe('C.377 몸마다 따로', () => {
  const px: FamilyPixelFx = { stages: [stage(-1), stage(-2), stage(-3)], byBody: { 'humanoid/hb': { stages: [stage(-10), stage(-20), stage(-30)] } } };
  it('덩치는 따로 맞춘 값, 사람형·없는 몸은 공통', () => {
    expect(familyStagesFor(px, 'humanoid/hb')![1]!.layers[0]!.dx).toBe(-20);
    expect(familyStagesFor(px, 'humanoid/arrancar')![1]!.layers[0]!.dx).toBe(-2);
    expect(familyStagesFor(px, null)![2]!.layers[0]!.dx).toBe(-3);
    expect(familyStagesFor(undefined, 'humanoid/hb')).toBeUndefined();
  });
  it('종족 설정 검사: byBody 는 몸 키 + 블록 3개, 틀리면 거른다', () => {
    const withBody = (byBody: unknown) => ({ ...shinigami, families: shinigami.families.map((f, i) => (i === 0 ? { ...f, pixelFx: { stages: [stage(-1), stage(-2), stage(-3)], byBody } } : f)) });
    expect(() => parseFactionConfig(withBody({ 'humanoid/hb': { stages: [stage(-1), stage(-2), stage(-3)] } }))).not.toThrow();
    expect(() => parseFactionConfig(withBody({ 'humanoid/hb': { stages: [stage(-1)] } }))).toThrow(/pixelFx/);
    expect(() => parseFactionConfig(withBody({ 'bad key': { stages: [stage(-1), stage(-2), stage(-3)] } }))).toThrow(/pixelFx/);
  });
});

// C.378 (GDD 230장 보충): 도구 확정 02:19 — 호로 탄을 덩치·뱀·짐승 따로. 길리안·사람형은 공통
import hollow from '../src/data/factions/hollow.json';
describe('C.378 호로 탄 몸마다', () => {
  const tan = (hollow.families as unknown as { abbr: string; pixelFx: FamilyPixelFx }[]).find((f) => f.abbr === '탄')!.pixelFx;
  it('덩치·뱀·짐승은 따로 값, 길리안은 공통', () => {
    expect(Object.keys(tan.byBody ?? {}).sort()).toEqual(['beast/ref', 'humanoid/hb', 'serpent/ref']);
    expect(familyStagesFor(tan, 'humanoid/hb')![1]!.layers[0]!.dx).not.toBe(tan.stages[1]!.layers[0]!.dx);
    expect(familyStagesFor(tan, 'humanoid/hd')).toBe(tan.stages);
    expect(() => parseFactionConfig(hollow)).not.toThrow();
  });
});
