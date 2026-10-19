import { describe, expect, it } from 'vitest';
import { FORM_TABLE, formsOfTier } from '../src/data/evolution';
import { FACTIONS } from '../src/data/factions';
import { ART_MANIFEST, charArt } from '../src/data/art/manifest';
import { validateFormTable } from '../src/engine/evolution/select';
import { isLocomotion, locomotionFromQuery, LOCOMOTIONS, resolveLocomotion } from '../src/engine/locomotion';
import { lungePlan } from '../src/ui/attackFx';
import { ATTACK_FX } from '../src/ui/attackFxConfig';
import { LOCO_LIFT, locoOf } from '../src/ui/bha/loco';
import { LINEAGES } from '../src/data/lineages';

describe('이동 방식 해석 (GDD 18-11)', () => {
  it('우선순위 = 그림 manifest > 진화체 > 종족 기본 > walk', () => {
    expect(resolveLocomotion({})).toBe('walk');
    expect(resolveLocomotion({ faction: 'float' })).toBe('float');
    expect(resolveLocomotion({ faction: 'float', form: 'fly' })).toBe('fly');
    expect(resolveLocomotion({ faction: 'float', form: 'fly', art: 'walk' })).toBe('walk');
  });
  it('모르는 값은 건너뛰고 다음 순위로 간다', () => {
    expect(resolveLocomotion({ art: 'swim', form: 'fly' })).toBe('fly');
    expect(resolveLocomotion({ art: 3, form: null, faction: 'float' })).toBe('float');
    expect(resolveLocomotion({ art: 'x', form: 'y', faction: 'z' })).toBe('walk');
  });
  it('개발용 URL 파라미터 ?loco=', () => {
    expect(locomotionFromQuery('?loco=fly')).toBe('fly');
    expect(locomotionFromQuery('?a=1&loco=float')).toBe('float');
    expect(locomotionFromQuery('?loco=swim')).toBeUndefined();
    expect(locomotionFromQuery('')).toBeUndefined();
  });
  it('화면 연결: 진화체 > 종족 기본, manifest(ArtUrls) > 진화체', () => {
    const fly = FORM_TABLE.find((f) => f.locomotion === 'fly')!;
    const walkForm = FORM_TABLE.find((f) => f.locomotion === 'walk')!;
    expect(locoOf({ locomotion: 'float' }, null, null)).toBe('float');
    expect(locoOf({ locomotion: 'float' }, fly.id, null)).toBe('fly');
    expect(locoOf({ locomotion: 'float' }, fly.id, { locomotion: 'walk' })).toBe('walk');
    expect(locoOf({}, walkForm.id, undefined)).toBe('walk');
    expect(locoOf({}, '없는-id', undefined)).toBe('walk');
  });
  it('manifest 에 적은 이동 방식이 그림 정보(ArtUrls)로 나온다 (직접 키·종족 기본 키)', () => {
    const m = { 'char.hollow': { locomotion: 'float' as const }, 'char.hollow.2': { locomotion: 'fly' as const } };
    expect(charArt('hollow', 0, 'char.hollow', '/', m, []).locomotion).toBe('float');
    expect(charArt('hollow', 1, 'char.hollow', '/', m, ['char-hollow-2.png']).locomotion).toBe('fly');
    expect(charArt('hollow', 0, 'char.hollow', '/', ART_MANIFEST, []).locomotion).toBeUndefined();
  });
});

describe('이동 방식 데이터', () => {
  it('진화체마다 유효한 값이 있고 표 검사를 통과한다', () => {
    for (const f of FORM_TABLE) expect(isLocomotion(f.locomotion), f.id).toBe(true);
    expect(validateFormTable(FORM_TABLE, LINEAGES.map((l) => l.id))).toEqual([]);
  });
  it('잘못된 값은 표 검사가 잡는다', () => {
    const bad = FORM_TABLE.map((f, i) => (i === 0 ? { ...f, locomotion: 'swim' as never } : f));
    expect(validateFormTable(bad, LINEAGES.map((l) => l.id)).some((e) => e.includes('locomotion'))).toBe(true);
  });
  it('단계(2~5)마다 3종이 모두 나온다', () => {
    for (const tier of [2, 3, 4, 5]) expect(new Set(formsOfTier(tier).map((f) => f.locomotion)), `${tier}단계`).toEqual(new Set(LOCOMOTIONS));
  });
  it('종족 설정의 기본값은 유효하다 (호로 1단계 = walk)', () => {
    for (const f of FACTIONS) expect(f.locomotion === undefined || isLocomotion(f.locomotion), f.id).toBe(true);
    expect(FACTIONS.find((f) => f.id === 'hollow')!.locomotion).toBe('walk');
  });
});

describe('몸통박치기 이동 방식별 모양', () => {
  const lv = ATTACK_FX.chain2;
  const ys = (loco: 'walk' | 'float' | 'fly') => lungePlan(lv, 1, 100, loco, 40).keyframes.map((k) => String(k.transform));
  it('걷기는 세로 이동·기본 기울임 그대로', () => {
    expect(lungePlan(lv, 1, 100).keyframes).toEqual(lungePlan(lv, 1, 100, 'walk', 40).keyframes);
    expect(ys('walk').every((t) => !t.includes('translateY'))).toBe(true);
  });
  it('부유는 기울임 없이 미끄러진다', () => {
    expect(ys('float').every((t) => t.includes('rotate(0.0deg)') || t.includes('rotate(-0.0deg)'))).toBe(true);
  });
  it('날기는 위로 솟았다가 떠 있던 높이만큼 내리꽂는다', () => {
    const t = ys('fly');
    expect(t[1]).toContain('translateY(-28.0px)');
    expect(t[2]).toContain('translateY(40.0px)');
    expect(t[4]).not.toContain('translateY');
  });
  it('떠 있는 높이 비율은 부유 10~15%, 날기 25~35%', () => {
    expect(LOCO_LIFT.walk).toBe(0);
    expect(LOCO_LIFT.float).toBeGreaterThanOrEqual(0.1);
    expect(LOCO_LIFT.float).toBeLessThanOrEqual(0.15);
    expect(LOCO_LIFT.fly).toBeGreaterThanOrEqual(0.25);
    expect(LOCO_LIFT.fly).toBeLessThanOrEqual(0.35);
  });
});
