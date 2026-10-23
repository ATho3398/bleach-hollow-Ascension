import { describe, expect, it } from 'vitest';
import { FACTIONS } from '../src/data/factions';
import { SKINS } from '../src/data/skins';
import { COSMETIC_ITEMS, shopVisible } from '../src/data/shop';
import { applyStartLook, newSaveData, migrateSave, pickStartLook } from '../src/game';
import { existsSync } from 'node:fs';

const hollow = FACTIONS.find((f) => f.id === 'hollow')!;
const shin = FACTIONS.find((f) => f.id !== 'hollow')!;

describe('C.107 호로 시작 외형 5종 랜덤 (GDD 51)', () => {
  it('startLooks 는 호로 설정에만 있고 모두 입을 수 있는 시작 전용 스킨이며 그림이 있다', () => {
    expect(hollow.startLooks).toEqual(['stalker', 'brute', 'ghoul', 'shackled']);
    for (const id of hollow.startLooks!) {
      const s = SKINS.find((x) => x.id === id)!;
      expect(s.factionId).toBe('hollow');
      expect(s.startOnly).toBe(true);
      expect(existsSync(`public/art/skin-${id}.png`)).toBe(true);
    }
    expect(shin.startLooks).toEqual([]);
  });
  it('추첨은 기본 + 4종을 균등 5구간으로 나눈다', () => {
    const got = [0, 0.19, 0.2, 0.39, 0.4, 0.59, 0.6, 0.79, 0.8, 0.999].map((r) => pickStartLook(hollow, r));
    expect(got).toEqual([null, null, 'stalker', 'stalker', 'brute', 'brute', 'ghoul', 'ghoul', 'shackled', 'shackled']);
    expect(pickStartLook(hollow, 1)).toBe('shackled');
  });
  it('사신은 목록이 비어 항상 기본', () => {
    for (const r of [0, 0.5, 0.99]) expect(pickStartLook(shin, r)).toBeNull();
  });
  it('뽑힌 스킨은 보유·장착되고 나머지는 같다 (편향 없음, C.132)', () => {
    const base = newSaveData('hollow', 1000);
    const s = newSaveData('hollow', 1000);
    expect(applyStartLook(s, hollow, 0.5)).toBe('brute');
    expect(s.skin).toBe('brute');
    expect(s.shared.cosmetics).toContain('skin-brute');
    expect({ ...s, skin: null, shared: base.shared }).toEqual({ ...base });
  });
  it('기본이 뽑히면 스킨은 그대로', () => {
    const s = newSaveData('hollow', 1000);
    expect(applyStartLook(s, hollow, 0)).toBeNull();
    expect(s.skin).toBeNull();
  });
  it('시작 전용 스킨은 상점에 안 보이고, 정리(sanitize) 뒤에도 장착이 유지된다', () => {
    for (const c of COSMETIC_ITEMS.filter((x) => x.category === 'skin' && hollow.startLooks!.includes(x.look))) expect(shopVisible(c, [c.id])).toBe(false);
    const s = newSaveData('hollow', 1000);
    applyStartLook(s, hollow, 0.7);
    const back = migrateSave(JSON.parse(JSON.stringify(s)))!;
    expect(back.skin).toBe('ghoul');
  });
});
