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
    // C.415 (GDD 230장 보충 8): 확정 10:51 — 가시형·외팔형·속도형·부유형도 몸별 칸
    expect(Object.keys(tan.byBody ?? {}).sort()).toEqual(['beast/ref', 'humanoid/hb', 'humanoid/hk', 'humanoid/ho', 'humanoid/hv', 'serpent/ref', 'spider/ref', 'wraith/ref']);
    expect(familyStagesFor(tan, 'humanoid/hb')![1]!.layers[0]!.dx).not.toBe(tan.stages[1]!.layers[0]!.dx);
    expect(familyStagesFor(tan, 'humanoid/hd')).toBe(tan.stages);
    expect(() => parseFactionConfig(hollow)).not.toThrow();
  });
});

// C.382 (GDD 230장 보충 2): 도구 확정 04:13 — 호로 거미(사슴형) 몸 전용 조·교·탄(거미 몸동작)
describe('C.382 호로 거미 몸', () => {
  const fam = (abbr: string) => (hollow.families as unknown as { abbr: string; pixelFx: FamilyPixelFx }[]).find((f) => f.abbr === abbr)!.pixelFx;
  it('조 = 공격3(C.415 — 다리 들어 내려찍기, 처음부터), 교 = 공격2, 탄 = 특수1 (남 칸 — 거미 몸)', () => {
    const jo = familyStagesFor(fam('조'), 'spider/ref')!;
    for (const st of jo) expect(st.bodies.male!.chain.map((c) => c.id)).toEqual(['attack3']);
    expect(jo[0]!.bodies.male!.bodyFromHit).toBe(false);
    expect(jo.map((st) => [st.hits, st.layers[0]!.dy])).toEqual([[1, -44], [1, -44], [1, -44]]); // 1블록 dy 415 → 2·3블록과 같게(사용자 선택)
    expect(familyStagesFor(fam('교'), 'spider/ref')![0]!.bodies.male!.chain.map((c) => c.id)).toEqual(['attack2']);
    expect(familyStagesFor(fam('탄'), 'spider/ref')![1]!.bodies.male!.chain.map((c) => c.id)).toEqual(['skill']);
    expect(familyStagesFor(fam('조'), 'humanoid/arrancar')).toBe(fam('조').stages);
  });
});
